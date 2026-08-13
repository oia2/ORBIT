import 'fake-indexeddb/auto';

import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { revision } from '@/shared/lib/ids';
import { localDate } from '@/shared/lib/local-date/local-date';

import { createOrbitDatabaseLifecycleHandlers, openOrbitPlanningDatabase } from './database';
import { ORBIT_DATABASE_VERSION, ORBIT_STORE_NAMES, type OrbitPlanningDB } from './schema';

const databaseNames = new Set<string>();

function uniqueDatabaseName(): string {
  const name = `orbit-planning-test-${crypto.randomUUID()}`;
  databaseNames.add(name);
  return name;
}

afterEach(async () => {
  await Promise.all([...databaseNames].map(async (name) => deleteDB(name)));
  databaseNames.clear();
});

describe('version 1 IndexedDB migration', () => {
  it('creates exactly the eight contracted stores on an empty database', async () => {
    const database = await openOrbitPlanningDatabase({
      databaseName: uniqueDatabaseName(),
    });

    expect(database.version).toBe(ORBIT_DATABASE_VERSION);
    expect([...database.objectStoreNames]).toEqual([...ORBIT_STORE_NAMES].sort());

    database.close();
  });

  it('creates every required index with the contracted uniqueness', async () => {
    const database = await openOrbitPlanningDatabase({
      databaseName: uniqueDatabaseName(),
    });

    const transaction = database.transaction([...ORBIT_STORE_NAMES], 'readonly');

    const expectedStores = {
      weeks: { keyPath: 'startDate', autoIncrement: false },
      days: { keyPath: 'date', autoIncrement: false },
      taskSeries: { keyPath: 'id', autoIncrement: false },
      taskOccurrences: { keyPath: 'id', autoIncrement: false },
      taskPlanEntries: { keyPath: 'id', autoIncrement: false },
      taskEvents: { keyPath: 'sequence', autoIncrement: true },
      habitDefinitions: { keyPath: 'id', autoIncrement: false },
      habitOccurrences: { keyPath: 'id', autoIncrement: false },
    } as const;

    const expectedIndexes = {
      weeks: {},
      days: { 'by-weekStart': { keyPath: 'weekStart', unique: false } },
      taskSeries: {},
      taskOccurrences: {
        'by-series-date': {
          keyPath: ['seriesId', 'nominalDate'],
          unique: true,
        },
        'by-created-sequence': {
          keyPath: 'createdSequence',
          unique: true,
        },
        'by-placement-created': {
          keyPath: ['placementKey', 'createdSequence'],
          unique: false,
        },
      },
      taskPlanEntries: {
        'by-occurrence-date': {
          keyPath: ['occurrenceId', 'date'],
          unique: true,
        },
        'by-date': { keyPath: 'date', unique: false },
        'by-weekStart': { keyPath: 'weekStart', unique: false },
      },
      taskEvents: {
        'by-id': { keyPath: 'id', unique: true },
        'by-occurrence-sequence': {
          keyPath: ['occurrenceId', 'sequence'],
          unique: false,
        },
        'by-series-sequence': {
          keyPath: ['seriesId', 'sequence'],
          unique: false,
        },
        'by-effective-date-sequence': {
          keyPath: ['effectiveDate', 'sequence'],
          unique: false,
        },
      },
      habitDefinitions: {},
      habitOccurrences: {
        'by-definition-date': {
          keyPath: ['definitionId', 'date'],
          unique: true,
        },
        'by-date': { keyPath: 'date', unique: false },
        'by-weekStart': { keyPath: 'weekStart', unique: false },
      },
    } as const;

    for (const storeName of ORBIT_STORE_NAMES) {
      const store = transaction.objectStore(storeName);
      const expected = expectedIndexes[storeName];
      const storeShape = expectedStores[storeName];

      expect(store.keyPath).toEqual(storeShape.keyPath);
      expect(store.autoIncrement).toBe(storeShape.autoIncrement);

      expect([...store.indexNames]).toEqual(Object.keys(expected).sort());

      const indexEntries = Object.entries(
        expected as Readonly<
          Record<string, { readonly keyPath: string | readonly string[]; readonly unique: boolean }>
        >,
      );
      for (const [indexName, indexShape] of indexEntries) {
        const runtimeStore = store as unknown as {
          index(name: string): {
            readonly keyPath: string | readonly string[];
            readonly unique: boolean;
          };
        };
        expect(runtimeStore.index(indexName).keyPath).toEqual(indexShape.keyPath);
        expect(runtimeStore.index(indexName).unique).toBe(indexShape.unique);
      }
    }

    await transaction.done;
    database.close();
  });

  it('closes and reopens the migrated database without resetting it', async () => {
    const databaseName = uniqueDatabaseName();
    const first = await openOrbitPlanningDatabase({ databaseName });
    const monday = localDate('2026-08-10');
    await first.put('weeks', {
      startDate: monday,
      status: 'open',
      goals: [],
      revision: revision(0),
    });
    first.close();

    const reopened = await openOrbitPlanningDatabase({ databaseName });

    expect(reopened.version).toBe(ORBIT_DATABASE_VERSION);
    expect([...reopened.objectStoreNames]).toEqual([...ORBIT_STORE_NAMES].sort());
    await expect(reopened.get('weeks', monday)).resolves.toEqual({
      startDate: monday,
      status: 'open',
      goals: [],
      revision: revision(0),
    });

    reopened.close();
  });
});

describe('database lifecycle handling', () => {
  it('closes the current connection on versionchange before reporting it', () => {
    const closeConnection = vi.fn();
    const onVersionChange = vi.fn();
    const handlers = createOrbitDatabaseLifecycleHandlers({
      closeConnection,
      onVersionChange,
    });

    handlers.blocking(ORBIT_DATABASE_VERSION, ORBIT_DATABASE_VERSION + 1);

    expect(closeConnection).toHaveBeenCalledOnce();
    expect(onVersionChange).toHaveBeenCalledWith({
      currentVersion: ORBIT_DATABASE_VERSION,
      requestedVersion: ORBIT_DATABASE_VERSION + 1,
    });
    expect(closeConnection.mock.invocationCallOrder[0]).toBeLessThan(
      onVersionChange.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('reports termination so the caller can discard the adapter', () => {
    const onTerminated = vi.fn();
    const handlers = createOrbitDatabaseLifecycleHandlers({
      closeConnection: vi.fn(),
      onTerminated,
    });

    handlers.terminated();

    expect(onTerminated).toHaveBeenCalledOnce();
  });

  it('handles a real versionchange by closing the old connection', async () => {
    const databaseName = uniqueDatabaseName();
    const onVersionChange = vi.fn();
    const current = await openOrbitPlanningDatabase({
      databaseName,
      onVersionChange,
    });

    const upgraded = await openDB<OrbitPlanningDB>(databaseName, ORBIT_DATABASE_VERSION + 1);

    expect(onVersionChange).toHaveBeenCalledWith({
      currentVersion: ORBIT_DATABASE_VERSION,
      requestedVersion: ORBIT_DATABASE_VERSION + 1,
    });
    upgraded.close();
    current.close();
  });

  it('reports a blocked upgrade and completes only after the blocking tab closes', async () => {
    const databaseName = uniqueDatabaseName();
    const first = await openOrbitPlanningDatabase({ databaseName });
    first.close();

    const blocker = await openDB<OrbitPlanningDB>(databaseName, ORBIT_DATABASE_VERSION);
    let releaseBlocked!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseBlocked = resolve;
    });
    const onBlocked = vi.fn(() => {
      releaseBlocked();
    });

    const pendingUpgrade = openOrbitPlanningDatabase({
      databaseName,
      databaseVersion: ORBIT_DATABASE_VERSION + 1,
      onBlocked,
    });

    await blocked;
    expect(onBlocked).toHaveBeenCalledWith({
      currentVersion: ORBIT_DATABASE_VERSION,
      requestedVersion: ORBIT_DATABASE_VERSION + 1,
    });

    blocker.close();
    const upgraded = await pendingUpgrade;
    expect(upgraded.version).toBe(ORBIT_DATABASE_VERSION + 1);
    upgraded.close();
  });
});
