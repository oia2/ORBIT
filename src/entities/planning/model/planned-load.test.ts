import { describe, expect, it } from 'vitest';

import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { creationSequence, durationMinutes, entityId } from '@/shared/lib/ids';

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
