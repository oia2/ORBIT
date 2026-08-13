import { test as base, expect, type Page } from '@playwright/test';

import {
  ORBIT_DATABASE_NAME,
  ORBIT_DATABASE_VERSION,
  ORBIT_STORE_NAMES,
  type OrbitStoreName,
} from '../../src/entities/planning/api/indexeddb/schema';

export type OrbitSeedStores = Readonly<Partial<Record<OrbitStoreName, readonly unknown[]>>>;

export interface OrbitSeed {
  readonly version: 1;
  readonly stores: OrbitSeedStores;
}

export const EMPTY_ORBIT_SEED: OrbitSeed = Object.freeze({
  version: 1,
  stores: Object.freeze({}),
});

export interface OrbitDatabaseFixture {
  /** Deletes every ORBIT record and reloads a clean application session. */
  reset(): Promise<void>;
  /** Replaces the database with exactly this deterministic V1 store snapshot. */
  seed(seed: OrbitSeed): Promise<void>;
}

export interface OrbitFixtureOptions {
  /** Optional browser-time instant installed before the application origin is opened. */
  readonly orbitClockInstant: string | undefined;
}

async function ensureApplicationOrigin(page: Page): Promise<void> {
  if (!page.url().startsWith('http://127.0.0.1:4173/')) {
    await page.goto('/');
  }
}

async function deleteOrbitDatabase(page: Page): Promise<void> {
  await ensureApplicationOrigin(page);
  await page.evaluate(async (databaseName) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      let blockedTimeout: ReturnType<typeof setTimeout> | undefined;

      request.onsuccess = () => {
        if (blockedTimeout !== undefined) clearTimeout(blockedTimeout);
        resolve();
      };
      request.onerror = () => {
        if (blockedTimeout !== undefined) clearTimeout(blockedTimeout);
        reject(request.error ?? new Error('Failed to reset ORBIT data'));
      };
      request.onblocked = () => {
        blockedTimeout = setTimeout(() => {
          reject(new Error('ORBIT data reset remained blocked by an open connection'));
        }, 5_000);
      };
    });
  }, ORBIT_DATABASE_NAME);
}

function validateSeed(seed: OrbitSeed): void {
  const allowedStores = new Set<string>(ORBIT_STORE_NAMES);
  for (const storeName of Object.keys(seed.stores)) {
    if (!allowedStores.has(storeName)) {
      throw new RangeError(`Unknown ORBIT seed store: ${storeName}`);
    }
  }
}

async function writeOrbitSeed(page: Page, seed: OrbitSeed): Promise<void> {
  validateSeed(seed);
  await page.evaluate(
    async ({ databaseName, databaseVersion, seedToWrite, storeOrder }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, databaseVersion);

        request.onupgradeneeded = () => {
          const databaseToUpgrade = request.result;
          databaseToUpgrade.createObjectStore('weeks', { keyPath: 'startDate' });

          const days = databaseToUpgrade.createObjectStore('days', { keyPath: 'date' });
          days.createIndex('by-weekStart', 'weekStart');

          databaseToUpgrade.createObjectStore('taskSeries', { keyPath: 'id' });

          const taskOccurrences = databaseToUpgrade.createObjectStore('taskOccurrences', {
            keyPath: 'id',
          });
          taskOccurrences.createIndex('by-series-date', ['seriesId', 'nominalDate'], {
            unique: true,
          });
          taskOccurrences.createIndex('by-created-sequence', 'createdSequence', {
            unique: true,
          });
          taskOccurrences.createIndex('by-placement-created', ['placementKey', 'createdSequence']);

          const taskPlanEntries = databaseToUpgrade.createObjectStore('taskPlanEntries', {
            keyPath: 'id',
          });
          taskPlanEntries.createIndex('by-occurrence-date', ['occurrenceId', 'date'], {
            unique: true,
          });
          taskPlanEntries.createIndex('by-date', 'date');
          taskPlanEntries.createIndex('by-weekStart', 'weekStart');

          const taskEvents = databaseToUpgrade.createObjectStore('taskEvents', {
            keyPath: 'sequence',
            autoIncrement: true,
          });
          taskEvents.createIndex('by-id', 'id', { unique: true });
          taskEvents.createIndex('by-occurrence-sequence', ['occurrenceId', 'sequence']);
          taskEvents.createIndex('by-series-sequence', ['seriesId', 'sequence']);
          taskEvents.createIndex('by-effective-date-sequence', ['effectiveDate', 'sequence']);

          databaseToUpgrade.createObjectStore('habitDefinitions', { keyPath: 'id' });

          const habitOccurrences = databaseToUpgrade.createObjectStore('habitOccurrences', {
            keyPath: 'id',
          });
          habitOccurrences.createIndex('by-definition-date', ['definitionId', 'date'], {
            unique: true,
          });
          habitOccurrences.createIndex('by-date', 'date');
          habitOccurrences.createIndex('by-weekStart', 'weekStart');
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error('Failed to open ORBIT seed database'));
        };
        request.onblocked = () => {
          reject(new Error('Opening the ORBIT seed database was blocked'));
        };
      });

      try {
        const populatedStores = storeOrder.filter(
          (storeName) => (seedToWrite.stores[storeName]?.length ?? 0) > 0,
        );
        if (populatedStores.length === 0) return;

        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(populatedStores, 'readwrite');
          for (const storeName of populatedStores) {
            const store = transaction.objectStore(storeName);
            for (const record of seedToWrite.stores[storeName] ?? []) {
              store.put(record);
            }
          }

          transaction.oncomplete = () => {
            resolve();
          };
          transaction.onabort = () => {
            reject(transaction.error ?? new Error('ORBIT seed transaction aborted'));
          };
          transaction.onerror = () => {
            reject(transaction.error ?? new Error('ORBIT seed transaction failed'));
          };
        });
      } finally {
        database.close();
      }
    },
    {
      databaseName: ORBIT_DATABASE_NAME,
      databaseVersion: ORBIT_DATABASE_VERSION,
      seedToWrite: seed,
      storeOrder: [...ORBIT_STORE_NAMES],
    },
  );
}

async function resetAndReload(page: Page): Promise<void> {
  await deleteOrbitDatabase(page);
  await page.reload();
}

async function seedAndReload(page: Page, seed: OrbitSeed): Promise<void> {
  await deleteOrbitDatabase(page);
  await writeOrbitSeed(page, seed);
  await page.reload();
}

export const test = base.extend<OrbitFixtureOptions & { orbitDatabase: OrbitDatabaseFixture }>({
  orbitClockInstant: [undefined, { option: true }],
  orbitDatabase: async ({ orbitClockInstant, page }, use) => {
    if (orbitClockInstant !== undefined) {
      await page.clock.install({ time: new Date(orbitClockInstant) });
    }

    const fixture: OrbitDatabaseFixture = {
      reset: () => resetAndReload(page),
      seed: (seed) => seedAndReload(page, seed),
    };

    await fixture.reset();
    await use(fixture);
    await deleteOrbitDatabase(page);
  },
});

export { expect };
