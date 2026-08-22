import { describe, expect, it } from 'vitest';

import { instant } from '@/shared/lib/local-date/clock';
import { localDate, startOfWeek } from '@/shared/lib/local-date/local-date';
import { creationSequence, durationMinutes, entityId, revision } from '@/shared/lib/ids';

import { dayCompletionCounts } from './day-counts';
import type { HabitOccurrence } from './habit';
import { calculatePlannedLoad } from './planned-load';
import {
  selectOpenBacklogView,
  selectOpenDayPlanningView,
  selectOpenWeekPlanningView,
} from './selectors';
import { createOneOffTask, type OneOffTaskPlanningResult } from './task';
import { ensureCalendarWeek } from './week';

const createdAt = instant('2026-08-11T01:00:00.000Z');

function id<TKind extends string>(suffix: string) {
  return entityId<TKind>(`123e4567-e89b-42d3-a456-42661417${suffix}`);
}

function requireCreated(result: ReturnType<typeof createOneOffTask>): OneOffTaskPlanningResult {
  if (!result.ok) {
    throw new Error(`Expected task creation, received ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

describe('factual planned load', () => {
  it('sums only current positive durations on the selected date', () => {
    const first = requireCreated(
      createOneOffTask({
        id: id<'task-occurrence'>('4001'),
        planEntryId: id<'task-plan-entry'>('5001'),
        title: 'First',
        placement: { kind: 'day', date: localDate('2026-08-11') },
        plannedDurationMinutes: 30,
        dayPosition: 0,
        createdSequence: creationSequence(1),
        createdAt,
      }),
    );
    const second = requireCreated(
      createOneOffTask({
        id: id<'task-occurrence'>('4002'),
        planEntryId: id<'task-plan-entry'>('5002'),
        title: 'Second',
        placement: { kind: 'day', date: localDate('2026-08-11') },
        plannedDurationMinutes: 45,
        dayPosition: 1,
        createdSequence: creationSequence(2),
        createdAt,
      }),
    );
    const anotherDay = requireCreated(
      createOneOffTask({
        id: id<'task-occurrence'>('4003'),
        planEntryId: id<'task-plan-entry'>('5003'),
        title: 'Another day',
        placement: { kind: 'day', date: localDate('2026-08-12') },
        plannedDurationMinutes: 120,
        dayPosition: 0,
        createdSequence: creationSequence(3),
        createdAt,
      }),
    );
    const backlog = requireCreated(
      createOneOffTask({
        id: id<'task-occurrence'>('4004'),
        title: 'Backlog',
        placement: { kind: 'backlog' },
        plannedDurationMinutes: 90,
        createdSequence: creationSequence(4),
        createdAt,
      }),
    );

    expect(
      calculatePlannedLoad(
        [first.occurrence, second.occurrence, anotherDay.occurrence, backlog.occurrence],
        localDate('2026-08-11'),
      ),
    ).toBe(75);

    const editedCurrentDuration = {
      ...second.occurrence,
      plannedDurationMinutes: durationMinutes(15),
    };
    expect(
      calculatePlannedLoad(
        [first.occurrence, editedCurrentDuration, anotherDay.occurrence, backlog.occurrence],
        localDate('2026-08-11'),
      ),
    ).toBe(45);
  });
});

describe('open planning selectors', () => {
  it('uses one task projection for consistent Week and Day planned/current facts', () => {
    const calendar = ensureCalendarWeek({ date: localDate('2026-08-11') });
    const created = requireCreated(
      createOneOffTask({
        id: id<'task-occurrence'>('6001'),
        planEntryId: id<'task-plan-entry'>('7001'),
        title: 'Original title',
        notes: 'Original notes',
        placement: { kind: 'day', date: localDate('2026-08-11') },
        plannedDurationMinutes: 30,
        dayPosition: 0,
        createdSequence: creationSequence(1),
        createdAt,
      }),
    );
    const currentOccurrence = {
      ...created.occurrence,
      title: 'Current title',
      notes: 'Current notes',
      plannedDurationMinutes: durationMinutes(45),
    };
    const day = requireDefined(
      calendar.days.find((candidate) => candidate.date === '2026-08-11'),
      'Expected the selected calendar day',
    );
    const source = {
      occurrences: [currentOccurrence],
      planEntries: created.planEntries,
      events: [],
    } as const;

    const dayView = selectOpenDayPlanningView({ day, ...source });
    const weekView = selectOpenWeekPlanningView({
      week: calendar.week,
      days: calendar.days,
      ...source,
    });
    const weekDay = requireDefined(
      weekView.days.find((candidate) => candidate.date === day.date),
      'Expected the selected week-day summary',
    );

    expect(dayView.tasks[0]).toMatchObject({
      planned: {
        title: 'Original title',
        notes: 'Original notes',
        plannedDurationMinutes: 30,
      },
      current: {
        title: 'Current title',
        notes: 'Current notes',
        plannedDurationMinutes: 45,
      },
      hasChanges: true,
    });
    expect(weekDay.tasks).toEqual(dayView.tasks);
    expect(weekDay.plannedLoadMinutes).toBe(45);
    expect(dayView.plannedLoadMinutes).toBe(45);
    expect(dayView.unfinishedTaskIds).toEqual([currentOccurrence.id]);
    expect(dayView).not.toHaveProperty('capacity');
    expect(dayView).not.toHaveProperty('overloaded');
    expect(weekDay).not.toHaveProperty('capacity');
    expect(weekDay).not.toHaveProperty('overloaded');
  });

  it('returns direct backlog tasks in immutable oldest-first creation order', () => {
    const newer = requireCreated(
      createOneOffTask({
        id: id<'task-occurrence'>('8002'),
        title: 'Newer',
        placement: { kind: 'backlog' },
        createdSequence: creationSequence(2),
        createdAt,
      }),
    );
    const older = requireCreated(
      createOneOffTask({
        id: id<'task-occurrence'>('8001'),
        title: 'Older',
        placement: { kind: 'backlog' },
        createdSequence: creationSequence(1),
        createdAt,
      }),
    );

    const view = selectOpenBacklogView({
      occurrences: [newer.occurrence, older.occurrence],
    });

    expect(view.tasks.map((task) => task.title)).toEqual(['Older', 'Newer']);
    expect(view).not.toHaveProperty('sort');
    expect(view).not.toHaveProperty('order');
  });
});

/*
 * 003 US6 (FR-030, FR-031, FR-033, FR-034). Planned load is a fact about how
 * much time the day is spending, so a habit that takes 45 minutes belongs in it
 * exactly as a task of the same length does — and nowhere near the result.
 */
describe('003 US6: habit durations in planned load', () => {
  const DATE = localDate('2026-08-11');

  function habit(
    suffix: string,
    minutes?: number,
    overrides: Partial<HabitOccurrence> = {},
  ): HabitOccurrence {
    return {
      id: id<'habit-occurrence'>(suffix),
      definitionId: id<'habit-definition'>(`7${suffix.slice(-3)}`),
      date: DATE,
      weekStart: startOfWeek(DATE),
      definitionSnapshot: {
        title: `Habit ${suffix}`,
        ...(minutes === undefined ? {} : { durationMinutes: durationMinutes(minutes) }),
      },
      ruleRevision: revision(0),
      isException: false,
      outcome: 'pending',
      outcomeEvents: [],
      updatedAt: createdAt,
      ...overrides,
    };
  }

  it('adds a habit duration to the day load (FR-030)', () => {
    expect(calculatePlannedLoad([], DATE, [habit('b001', 45)])).toBe(45);
  });

  it('sums habit and task durations together', () => {
    const task = requireCreated(
      createOneOffTask({
        id: id<'task-occurrence'>('a001'),
        planEntryId: id<'task-plan-entry'>('c001'),
        title: 'Task',
        placement: { kind: 'day', date: DATE },
        plannedDurationMinutes: 30,
        dayPosition: 0,
        createdSequence: creationSequence(1),
        createdAt,
      }),
    );

    expect(calculatePlannedLoad([task.occurrence], DATE, [habit('b001', 45)])).toBe(75);
  });

  it('contributes nothing for a habit with no duration (FR-031)', () => {
    expect(calculatePlannedLoad([], DATE, [habit('b001'), habit('b002')])).toBe(0);
  });

  it('reports the same load as before 003 when no habit carries a duration (FR-031)', () => {
    const task = requireCreated(
      createOneOffTask({
        id: id<'task-occurrence'>('a002'),
        planEntryId: id<'task-plan-entry'>('c002'),
        title: 'Task',
        placement: { kind: 'day', date: DATE },
        plannedDurationMinutes: 30,
        dayPosition: 0,
        createdSequence: creationSequence(1),
        createdAt,
      }),
    );

    expect(calculatePlannedLoad([task.occurrence], DATE, [habit('b001')])).toBe(
      calculatePlannedLoad([task.occurrence], DATE),
    );
  });

  it('ignores a habit belonging to another date', () => {
    expect(
      calculatePlannedLoad([], DATE, [habit('b001', 45, { date: localDate('2026-08-12') })]),
    ).toBe(0);
  });

  it('ignores a deleted habit occurrence', () => {
    expect(calculatePlannedLoad([], DATE, [habit('b001', 45, { outcome: 'deleted' })])).toBe(0);
  });

  it('counts a habit duration regardless of whether the habit was completed (FR-033)', () => {
    // Load is what was planned, not what happened.
    for (const outcome of ['pending', 'completed', 'not-completed'] as const) {
      expect(calculatePlannedLoad([], DATE, [habit('b001', 45, { outcome })])).toBe(45);
    }
  });

  it('does not change any completion count', () => {
    // Duration is load only: the score reads counts, which this cannot touch.
    const counted = dayCompletionCounts([], [habit('b001', 45)], DATE);
    expect(counted.habit).toEqual({ completed: 0, applicable: 1 });
  });
});
