import {
  buildPersonalHistoryFixture,
  PERSONAL_HISTORY_COMPLETED_WEEK_START,
  PERSONAL_HISTORY_CURRENT_DATE,
  PERSONAL_HISTORY_END_DATE,
  PERSONAL_HISTORY_FIRST_WEEK_START,
  PERSONAL_HISTORY_LAST_WEEK_START,
  PERSONAL_HISTORY_SELECTED_DATE,
  PERSONAL_HISTORY_WEEK_COUNT,
  type PersonalHistoryExpectedFacts,
} from '../../tests/fixtures/personal-history';

import type { OrbitDatabaseFixture, OrbitSeed } from './orbit.fixture';

export interface PersonalHistoryBrowserFixture {
  readonly seed: OrbitSeed;
  readonly currentDate: typeof PERSONAL_HISTORY_CURRENT_DATE;
  readonly selectedDate: typeof PERSONAL_HISTORY_SELECTED_DATE;
  readonly completedWeekStart: typeof PERSONAL_HISTORY_COMPLETED_WEEK_START;
  readonly expected: PersonalHistoryExpectedFacts;
}

/** Browser-ready V1 snapshot for the retained 52-week History journey. */
export function buildPersonalHistoryBrowserFixture(): PersonalHistoryBrowserFixture {
  const fixture = buildPersonalHistoryFixture();
  return {
    seed: { version: 1, stores: fixture.stores },
    currentDate: fixture.currentDate,
    selectedDate: fixture.selectedDate,
    completedWeekStart: fixture.completedWeekStart,
    expected: fixture.expected,
  };
}

export function buildPersonalHistoryOrbitSeed(): OrbitSeed {
  return buildPersonalHistoryBrowserFixture().seed;
}

export async function seedPersonalHistory(
  orbitDatabase: OrbitDatabaseFixture,
): Promise<PersonalHistoryBrowserFixture> {
  const fixture = buildPersonalHistoryBrowserFixture();
  await orbitDatabase.seed(fixture.seed);
  return fixture;
}

export {
  PERSONAL_HISTORY_COMPLETED_WEEK_START,
  PERSONAL_HISTORY_CURRENT_DATE,
  PERSONAL_HISTORY_END_DATE,
  PERSONAL_HISTORY_FIRST_WEEK_START,
  PERSONAL_HISTORY_LAST_WEEK_START,
  PERSONAL_HISTORY_SELECTED_DATE,
  PERSONAL_HISTORY_WEEK_COUNT,
};
