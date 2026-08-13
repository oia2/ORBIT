import { IDBFactory } from 'fake-indexeddb';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate, weekDates } from '@/shared/lib/local-date/local-date';
import { nonNegativeDurationMinutes, revision } from '@/shared/lib/ids';

import type { ScoreBreakdown } from '../../model/day';
import { openOrbitPlanningDatabase } from './database';
import { createIndexedDbPlanningRepository } from './indexeddb-planning-repository';
import type { OrbitPlanningDB } from './schema';

const DATABASE_NAME = 'orbit-us6-test';
const MONDAY = localDate('2026-08-10');
const NEXT_MONDAY = localDate('2026-08-17');
const NOW = instant('2026-08-16T18:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 1200;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

function score(
  taskCompleted: number,
  taskApplicable: number,
  habitCompleted = 0,
  habitApplicable = 0,
): ScoreBreakdown {
  const taskRate = taskApplicable === 0 ? 'unavailable' : taskCompleted / taskApplicable;
  const habitRate = habitApplicable === 0 ? 'unavailable' : habitCompleted / habitApplicable;
  const taskWeight = taskApplicable === 0 ? 0 : habitApplicable === 0 ? 100 : 70;
  const habitWeight = habitApplicable === 0 ? 0 : taskApplicable === 0 ? 100 : 30;
  const value =
    taskApplicable + habitApplicable === 0
      ? 'unavailable'
      : Math.floor(
          (taskRate === 'unavailable' ? 0 : taskRate * taskWeight) +
            (habitRate === 'unavailable' ? 0 : habitRate * habitWeight) +
            0.5,
        );
  return {
    task:
      taskApplicable === 0
        ? { completed: 0, applicable: 0, rate: 'unavailable' }
        : {
            completed: taskCompleted,
            applicable: taskApplicable,
            rate: taskCompleted / taskApplicable,
          },
    habit:
      habitApplicable === 0
        ? { completed: 0, applicable: 0, rate: 'unavailable' }
        : {
            completed: habitCompleted,
            applicable: habitApplicable,
            rate: habitCompleted / habitApplicable,
          },
    value,
    weightsApplied: { task: taskWeight, habit: habitWeight },
  };
}

describe('IndexedDB planning repository — US6', () => {
  let database: IDBPDatabase<OrbitPlanningDB>;
  let repository: ReturnType<typeof createIndexedDbPlanningRepository>;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: localDate('2026-08-16') }),
      generateUuid: uuidGenerator(),
    });
    await repository.ensureCalendarWeek({ date: MONDAY });
  });

  afterEach(() => {
    repository.dispose();
  });

  async function closeAllDaysWithFrozenCounts(): Promise<void> {
    const dates = weekDates(MONDAY);
    for (const [index, date] of dates.entries()) {
      const day = await database.get('days', date);
      if (day === undefined) throw new Error('missing day');
      const frozen =
        index === 0 ? score(1, 1, 1, 2) : index === 1 ? score(0, 9, 0, 0) : score(0, 0, 0, 0);
      await database.put('days', {
        ...day,
        status: 'closed',
        revision: revision(1),
        closureSnapshot: {
          score: frozen,
          plannedLoadMinutes: nonNegativeDurationMinutes(index * 10),
        },
        closedAt: NOW,
      });
    }
  }

  it('requires exactly seven closed owned days and rejects stale revisions atomically', async () => {
    const open = await repository.completeWeek({
      weekStart: MONDAY,
      expectedWeekRevision: revision(0),
    });
    expect(open).toMatchObject({ ok: false, error: { code: 'WeekNotClosable' } });

    await closeAllDaysWithFrozenCounts();
    const stale = await repository.completeWeek({
      weekStart: MONDAY,
      expectedWeekRevision: revision(1),
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'RevisionConflict' } });
    expect(await database.get('weeks', MONDAY)).toMatchObject({ status: 'open' });
  });

  it('sums frozen raw counts, persists reflection/progress, reloads, and never reopens', async () => {
    await closeAllDaysWithFrozenCounts();
    const completed = await repository.completeWeek({
      weekStart: MONDAY,
      reflection: 'Keep the morning block.',
      expectedWeekRevision: revision(0),
    });
    expect(completed).toMatchObject({
      ok: true,
      value: {
        progress: {
          task: { completed: 1, applicable: 10, rate: 0.1 },
          habit: { completed: 1, applicable: 2, rate: 0.5 },
          value: 22,
          weightsApplied: { task: 70, habit: 30 },
        },
      },
      affectedDates: [],
      affectedWeeks: [MONDAY],
    });
    expect(await database.get('weeks', MONDAY)).toMatchObject({
      status: 'completed',
      reflection: 'Keep the morning block.',
      revision: revision(1),
      completedAt: NOW,
      completionSnapshot: { progress: { value: 22 } },
    });

    repository.dispose();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: localDate('2026-08-16') }),
      generateUuid: uuidGenerator(),
    });
    await expect(repository.getWeekView(MONDAY)).resolves.toMatchObject({
      ok: true,
      value: {
        week: { status: 'completed', reflection: 'Keep the morning block.' },
        progress: { value: 22 },
      },
    });
    await expect(
      repository.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'Cannot reopen',
        expectedRevision: revision(1),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });

    await repository.ensureCalendarWeek({ date: NEXT_MONDAY });
    await repository.addWeeklyGoal({
      weekStart: NEXT_MONDAY,
      statement: 'Future plan',
      expectedRevision: revision(0),
    });
    expect(await database.get('weeks', MONDAY)).toMatchObject({
      completionSnapshot: { progress: { value: 22 } },
      reflection: 'Keep the morning block.',
    });
  });
});
