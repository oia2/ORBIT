import { test as base, expect, type Page } from '@playwright/test';

import { seedE2eStores, truncateE2eData, type E2eSeedStores } from './database';

export type OrbitSeedStores = E2eSeedStores;

export interface OrbitSeed {
  readonly version: 1;
  readonly stores: OrbitSeedStores;
}

export const EMPTY_ORBIT_SEED: OrbitSeed = Object.freeze({
  version: 1,
  stores: Object.freeze({}),
});

export interface OrbitDatabaseFixture {
  /** Deletes every ORBIT record, leaving a clean database for the test to load. */
  reset(): Promise<void>;
  /** Replaces the database with exactly this deterministic store snapshot. */
  seed(seed: OrbitSeed): Promise<void>;
}

export interface OrbitFixtureOptions {
  /** Optional browser-time instant installed before the application origin is opened. */
  readonly orbitClockInstant: string | undefined;
}

const ALLOWED_STORES = new Set<keyof OrbitSeedStores>([
  'weeks',
  'days',
  'taskSeries',
  'taskOccurrences',
  'taskPlanEntries',
  'taskEvents',
  'habitDefinitions',
  'habitOccurrences',
]);

function validateSeed(seed: OrbitSeed): void {
  for (const storeName of Object.keys(seed.stores)) {
    if (!ALLOWED_STORES.has(storeName as keyof OrbitSeedStores)) {
      throw new RangeError(`Unknown ORBIT seed store: ${storeName}`);
    }
  }
}

/**
 * Detaches the page from the application before the database is rewritten.
 *
 * This is the one behavioural difference the move to a server forced on the
 * fixture. A loaded ORBIT page keeps talking to the server — it ensures the
 * calendar week it is showing, and materializes recurring rows — and closing
 * the browser's connection does not stop the transaction already running on
 * the server. Truncating underneath that races with it, non-deterministically,
 * and the seeded snapshot is no longer the snapshot under test.
 *
 * Every caller navigates to the page it wants immediately afterwards, so the
 * fixture prepares data and the test decides when the application starts.
 */
async function stopApplication(page: Page): Promise<void> {
  if (page.url() !== 'about:blank') {
    await page.goto('about:blank');
  }
}

export const test = base.extend<OrbitFixtureOptions & { orbitDatabase: OrbitDatabaseFixture }>({
  orbitClockInstant: [undefined, { option: true }],
  /*
   * `auto` matters now. Under IndexedDB every test got a fresh browser profile
   * and therefore a fresh database for free, so a test that never asked for
   * this fixture still started clean. One shared server database has no such
   * property: without this, a test would inherit whatever the previous journey
   * left behind.
   */
  orbitDatabase: [
    async ({ orbitClockInstant, page }, use) => {
      if (orbitClockInstant !== undefined) {
        await page.clock.install({ time: new Date(orbitClockInstant) });
      }

      const fixture: OrbitDatabaseFixture = {
        async reset() {
          await stopApplication(page);
          await truncateE2eData();
        },
        async seed(seed) {
          validateSeed(seed);
          await stopApplication(page);
          await truncateE2eData();
          await seedE2eStores(seed.stores);
        },
      };

      await fixture.reset();
      await use(fixture);
      await stopApplication(page);
      await truncateE2eData();
    },
    { auto: true },
  ],
});

export { expect };
