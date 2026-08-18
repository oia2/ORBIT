import type { Page } from '@playwright/test';

import type { Day } from '../../src/entities/planning/model/day';
import type { HabitOccurrence } from '../../src/entities/planning/model/habit';
import type { TaskPlanEntry } from '../../src/entities/planning/model/task';
import type { Week } from '../../src/entities/planning/model/week';
import type { TaskOccurrence } from '../../src/entities/planning/model/task';
import { revision } from '../../src/shared/lib/ids';
import { instant } from '../../src/shared/lib/local-date/clock';
import {
  buildDailyState,
  buildWeeklyGoal,
  deterministicEntityId,
} from '../../tests/fixtures/planning';
import {
  buildPersonalHistoryFixture,
  PERSONAL_HISTORY_CURRENT_DATE,
  PERSONAL_HISTORY_LAST_WEEK_START,
} from '../../tests/fixtures/personal-history';

import {
  EMPTY_ORBIT_SEED,
  expect,
  test as orbitTest,
  type OrbitDatabaseFixture,
  type OrbitSeed,
} from './orbit.fixture';

export const VISUAL_CLOCK_INSTANT = '2026-05-20T05:00:00.000Z';
export const VISUAL_CURRENT_DATE = PERSONAL_HISTORY_CURRENT_DATE;
export const VISUAL_CURRENT_WEEK_START = PERSONAL_HISTORY_LAST_WEEK_START;

const visualInstant = instant(VISUAL_CLOCK_INSTANT);
const completedVisualDates = new Set(['2026-05-18', '2026-05-19', '2026-05-20']);

const MOTION_OVERRIDE_CSS = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }

  html {
    caret-color: transparent !important;
  }
`;

function completeSelectedTasks(occurrences: readonly TaskOccurrence[]): readonly TaskOccurrence[] {
  return occurrences.map((occurrence) => {
    if (
      occurrence.state !== 'active' ||
      occurrence.placement.kind !== 'day' ||
      !('completion' in occurrence) ||
      !completedVisualDates.has(occurrence.placement.date) ||
      (occurrence.placement.date !== '2026-05-18' && occurrence.dayPosition !== 0)
    ) {
      return occurrence;
    }

    return {
      ...occurrence,
      actualCompletedAt: visualInstant,
      completion: 'completed',
      revision: revision(1),
    };
  });
}

function completeSelectedMemberships(
  entries: readonly TaskPlanEntry[],
  completedOccurrenceIds: ReadonlySet<string>,
): readonly TaskPlanEntry[] {
  return entries.map((entry) =>
    entry.outcome === 'planned' && completedOccurrenceIds.has(entry.occurrenceId)
      ? { ...entry, outcome: 'completed' }
      : entry,
  );
}

function addVisualDailyState(days: readonly Day[]): readonly Day[] {
  return days.map((day) =>
    day.status === 'open' && day.date === VISUAL_CURRENT_DATE
      ? {
          ...day,
          state: buildDailyState({ energy: 4, mood: 4 }),
          revision: revision(1),
        }
      : day,
  );
}

function addVisualGoals(weeks: readonly Week[]): readonly Week[] {
  return weeks.map((week) =>
    week.status === 'open' && week.startDate === VISUAL_CURRENT_WEEK_START
      ? {
          ...week,
          goals: [
            buildWeeklyGoal({
              id: deterministicEntityId<'weekly-goal'>(80_001),
              statement: 'Завершить прототип планирования',
            }),
            buildWeeklyGoal({
              id: deterministicEntityId<'weekly-goal'>(80_002),
              statement: 'Согласовать следующий этап',
            }),
          ],
          revision: revision(1),
        }
      : week,
  );
}

function addVisualHabitOutcomes(
  occurrences: readonly HabitOccurrence[],
): readonly HabitOccurrence[] {
  return occurrences.map((occurrence) => {
    if (occurrence.date === '2026-05-18' || occurrence.date === VISUAL_CURRENT_DATE) {
      return {
        ...occurrence,
        outcome: 'completed',
        outcomeEvents: [
          { ordinal: 1, occurredAt: visualInstant, source: 'user', outcome: 'completed' },
        ],
        updatedAt: visualInstant,
      };
    }
    if (occurrence.date === '2026-05-19') {
      return {
        ...occurrence,
        outcome: 'not-completed',
        outcomeEvents: [
          { ordinal: 1, occurredAt: visualInstant, source: 'user', outcome: 'not-completed' },
        ],
        updatedAt: visualInstant,
      };
    }
    return occurrence;
  });
}

/**
 * A stable, presentation-rich state for visual comparison. It deliberately reuses
 * the retained-history fixture so visual tests cannot diverge from domain storage
 * semantics while still exercising populated Day, Week, and History surfaces.
 */
export function buildPopulatedVisualSeed(): OrbitSeed {
  const fixture = buildPersonalHistoryFixture();
  const taskOccurrences = completeSelectedTasks(fixture.stores.taskOccurrences);
  const completedOccurrenceIds = new Set(
    taskOccurrences
      .filter(
        (occurrence) =>
          occurrence.state === 'active' &&
          occurrence.placement.kind === 'day' &&
          'completion' in occurrence &&
          completedVisualDates.has(occurrence.placement.date) &&
          occurrence.completion === 'completed',
      )
      .map((occurrence) => occurrence.id),
  );

  return {
    version: 1,
    stores: {
      ...fixture.stores,
      days: addVisualDailyState(fixture.stores.days),
      habitOccurrences: addVisualHabitOutcomes(fixture.stores.habitOccurrences),
      taskOccurrences,
      taskPlanEntries: completeSelectedMemberships(
        fixture.stores.taskPlanEntries,
        completedOccurrenceIds,
      ),
      weeks: addVisualGoals(fixture.stores.weeks),
    },
  };
}

export const EMPTY_VISUAL_SEED = EMPTY_ORBIT_SEED;

export type VisualScenario = 'empty' | 'populated';

export async function openVisualPage(
  page: Page,
  orbitDatabase: OrbitDatabaseFixture,
  scenario: VisualScenario,
  path: string,
): Promise<void> {
  await orbitDatabase.seed(
    scenario === 'populated' ? buildPopulatedVisualSeed() : EMPTY_VISUAL_SEED,
  );
  await page.goto(path);
  await page.locator('main').waitFor({ state: 'visible' });
  await page
    .locator('main [role="status"]')
    .filter({ hasText: /Загружаем/i })
    .waitFor({ state: 'hidden' });
  await page.addStyleTag({ content: MOTION_OVERRIDE_CSS });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

export const test = orbitTest.extend<{ visualEnvironment: undefined }>({
  orbitClockInstant: VISUAL_CLOCK_INSTANT,
  visualEnvironment: [
    async ({ page }, use) => {
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect };
