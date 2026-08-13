import { forceCloseDatabase, IDBFactory } from 'fake-indexeddb';
import { openDB, unwrap, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dayPosition, durationMinutes, revision } from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { openOrbitPlanningDatabase } from './database';
import { createIndexedDbPlanningRepository } from './indexeddb-planning-repository';
import { ORBIT_DATABASE_VERSION, type OrbitPlanningDB } from './schema';

const DATABASE_NAME = 'orbit-repository-failures-test';
const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const NOW = instant('2026-08-11T08:00:00.000Z');

type Repository = ReturnType<typeof createIndexedDbPlanningRepository>;

function uuidGenerator(): () => string {
  let next = 1;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

async function seedStableFacts(repository: Repository): Promise<void> {
  await expect(repository.ensureCalendarWeek({ date: TUESDAY })).resolves.toMatchObject({
    ok: true,
    value: MONDAY,
  });
  await expect(
    repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Preserve this goal',
      expectedRevision: revision(0),
    }),
  ).resolves.toMatchObject({ ok: true });
  await expect(
    repository.createTask({
      title: 'Preserve this task',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    }),
  ).resolves.toMatchObject({ ok: true });
}

async function readPersistedFacts(database: IDBPDatabase<OrbitPlanningDB>) {
  const [weeks, days, occurrences, entries, events] = await Promise.all([
    database.getAll('weeks'),
    database.getAll('days'),
    database.getAll('taskOccurrences'),
    database.getAll('taskPlanEntries'),
    database.getAll('taskEvents'),
  ]);

  return { weeks, days, occurrences, entries, events };
}

function injectTaskEventAddFailure(error: DOMException, abortTransaction: boolean): void {
  // The original method is always invoked below with the intercepted store as its receiver.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalAdd = IDBObjectStore.prototype.add;
  let failed = false;

  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (!failed && this.name === 'taskEvents') {
      failed = true;
      if (abortTransaction) this.transaction.abort();
      throw error;
    }

    return key === undefined ? originalAdd.call(this, value) : originalAdd.call(this, value, key);
  });
}

function forceTerminate(database: IDBPDatabase<OrbitPlanningDB>): void {
  const closeForcibly = forceCloseDatabase as unknown as (database: IDBDatabase) => void;
  closeForcibly(unwrap(database));
}

describe('IndexedDB planning repository — storage and lifecycle failures', () => {
  let database: IDBPDatabase<OrbitPlanningDB>;
  let repository: Repository;
  let generateUuid: () => string;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    generateUuid = uuidGenerator();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    repository.dispose();
    database.close();
  });

  it('closes and reopens the real adapter with all committed facts intact', async () => {
    await seedStableFacts(repository);
    const beforeClose = await readPersistedFacts(database);

    repository.dispose();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid,
    });

    await expect(readPersistedFacts(database)).resolves.toEqual(beforeClose);
    await expect(repository.getDayView(TUESDAY)).resolves.toMatchObject({
      ok: true,
      value: {
        day: { date: TUESDAY, revision: revision(1) },
        tasks: [{ occurrence: { title: 'Preserve this task' } }],
      },
    });
  });

  it('rejects a stale aggregate revision without writing or reporting success', async () => {
    const deleteDatabase = vi.spyOn(globalThis.indexedDB, 'deleteDatabase');
    await expect(repository.ensureCalendarWeek({ date: TUESDAY })).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repository.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'Committed goal',
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });
    const beforeConflict = await readPersistedFacts(database);

    const conflict = await repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Stale write',
      expectedRevision: revision(0),
    });

    expect(conflict).toEqual({
      ok: false,
      error: {
        code: 'RevisionConflict',
        expectedRevision: revision(0),
        actualRevision: revision(1),
      },
    });
    await expect(readPersistedFacts(database)).resolves.toEqual(beforeConflict);
    expect(deleteDatabase).not.toHaveBeenCalled();
  });

  it.each([
    {
      caseName: 'quota rejection',
      error: new DOMException('storage quota exhausted', 'QuotaExceededError'),
      abortTransaction: false,
      expectedCode: 'QuotaExceeded',
    },
    {
      caseName: 'transaction abort',
      error: new DOMException('transaction aborted', 'AbortError'),
      abortTransaction: true,
      expectedCode: 'UnexpectedStorageFailure',
    },
  ] as const)(
    'maps $caseName, rolls back partial writes, and never resets the database',
    async ({ error, abortTransaction, expectedCode }) => {
      await seedStableFacts(repository);
      const beforeFailure = await readPersistedFacts(database);
      const deleteDatabase = vi.spyOn(globalThis.indexedDB, 'deleteDatabase');
      injectTaskEventAddFailure(error, abortTransaction);

      const result = await repository.createTask({
        title: 'Must roll back',
        placement: { kind: 'day', date: TUESDAY },
        durationMinutes: durationMinutes(45),
        dayPosition: dayPosition(1),
      });

      expect(result).toMatchObject({ ok: false, error: { code: expectedCode } });
      await expect(readPersistedFacts(database)).resolves.toEqual(beforeFailure);
      expect(deleteDatabase).not.toHaveBeenCalled();
    },
  );

  it('waits on a blocked upgrade, then reopens without resetting prior facts', async () => {
    await seedStableFacts(repository);
    const beforeUpgrade = await readPersistedFacts(database);
    const deleteDatabase = vi.spyOn(globalThis.indexedDB, 'deleteDatabase');
    repository.dispose();

    const blocker = await openDB<OrbitPlanningDB>(DATABASE_NAME, ORBIT_DATABASE_VERSION);
    let releaseBlocked!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseBlocked = resolve;
    });
    const onBlocked = vi.fn(releaseBlocked);
    let settled = false;
    const pendingUpgrade = openOrbitPlanningDatabase({
      databaseName: DATABASE_NAME,
      databaseVersion: ORBIT_DATABASE_VERSION + 1,
      onBlocked,
    });
    void pendingUpgrade.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await blocked;
    await Promise.resolve();
    expect(onBlocked).toHaveBeenCalledWith({
      currentVersion: ORBIT_DATABASE_VERSION,
      requestedVersion: ORBIT_DATABASE_VERSION + 1,
    });
    expect(settled).toBe(false);
    await expect(readPersistedFacts(blocker)).resolves.toEqual(beforeUpgrade);

    blocker.close();
    database = await pendingUpgrade;
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid,
    });

    await expect(readPersistedFacts(database)).resolves.toEqual(beforeUpgrade);
    expect(deleteDatabase).not.toHaveBeenCalled();
  });

  it('reports forced termination, rejects the stale adapter, and recovers only by reopening', async () => {
    await seedStableFacts(repository);
    const beforeTermination = await readPersistedFacts(database);
    const deleteDatabase = vi.spyOn(globalThis.indexedDB, 'deleteDatabase');
    repository.dispose();

    const onTerminated = vi.fn();
    database = await openOrbitPlanningDatabase({
      databaseName: DATABASE_NAME,
      onTerminated,
    });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid,
    });

    forceTerminate(database);

    expect(onTerminated).toHaveBeenCalledOnce();
    await expect(
      repository.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'Cannot use terminated adapter',
        expectedRevision: revision(2),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'StorageUnavailable' } });

    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid,
    });

    await expect(readPersistedFacts(database)).resolves.toEqual(beforeTermination);
    await expect(
      repository.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'Recovered write',
        expectedRevision: revision(2),
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(deleteDatabase).not.toHaveBeenCalled();
  });
});
