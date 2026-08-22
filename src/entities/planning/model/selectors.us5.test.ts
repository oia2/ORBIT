import { describe, expect, it } from 'vitest';

import { createOpenDay, type ClosedDay, type OpenDay } from './day';
import { habitCompletionCounts } from './day-counts';
import type { HabitOccurrence } from './habit';
import { selectDaySignals, selectOpenDayPlanningView, selectWeekSignals } from './selectors';
import type {
  BacklogTaskOccurrence,
  CompletedDatedTaskOccurrence,
  DeletedTaskOccurrence,
  IncompleteDatedTaskOccurrence,
  TaskOccurrence,
  TaskPlanEntry,
} from './task';
import { ensureCalendarWeek, type OpenWeek, type WeeklyGoal } from './week';
import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  nonNegativeDurationMinutes,
  revision,
} from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate, startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';

const DATE = localDate('2026-08-11');
const OTHER_DATE = localDate('2026-08-12');
const NOW = instant('2026-08-11T08:00:00.000Z');

function id<TKind extends string>(suffix: string) {
  return entityId<TKind>(`123e4567-e89b-42d3-a456-42661419${suffix}`);
}

function incompleteTask(
  suffix: string,
  duration: number,
  date: LocalDate = DATE,
): IncompleteDatedTaskOccurrence {
  return {
    id: id<'task-occurrence'>(suffix),
    title: `Incomplete ${suffix}`,
    state: 'active',
    placement: { kind: 'day', date },
    plannedDurationMinutes: durationMinutes(duration),
    dayPosition: dayPosition(Number(suffix) % 10),
    completion: 'incomplete',
    isException: false,
    createdSequence: creationSequence(Number(suffix)),
    revision: revision(0),
  };
}

function completedTask(suffix: string, duration: number): CompletedDatedTaskOccurrence {
  return {
    ...incompleteTask(suffix, duration),
    completion: 'completed',
    actualCompletedAt: NOW,
  };
}

function backlogTask(suffix: string, duration: number): BacklogTaskOccurrence {
  return {
    id: id<'task-occurrence'>(suffix),
    title: `Backlog ${suffix}`,
    state: 'active',
    placement: { kind: 'backlog' },
    plannedDurationMinutes: durationMinutes(duration),
    isException: false,
    createdSequence: creationSequence(Number(suffix)),
    revision: revision(0),
  };
}

function deletedTask(suffix: string, duration: number): DeletedTaskOccurrence {
  return {
    id: id<'task-occurrence'>(suffix),
    title: `Deleted ${suffix}`,
    state: 'deleted',
    placement: { kind: 'none' },
    plannedDurationMinutes: durationMinutes(duration),
    isException: false,
    createdSequence: creationSequence(Number(suffix)),
    revision: revision(1),
  };
}

function planEntry(
  occurrenceId: TaskOccurrence['id'],
  suffix: string,
  outcome: TaskPlanEntry['outcome'],
): TaskPlanEntry {
  const base = {
    id: id<'task-plan-entry'>(suffix),
    occurrenceId,
    date: DATE,
    weekStart: startOfWeek(DATE),
    plannedSnapshot: {
      title: `Plan ${suffix}`,
      plannedDurationMinutes: durationMinutes(30),
    },
    enteredAt: NOW,
  } as const;
  switch (outcome) {
    case 'moved':
      return { ...base, outcome, destination: { kind: 'day', date: OTHER_DATE } };
    case 'backlogged':
      return { ...base, outcome, destination: { kind: 'backlog' } };
    default:
      return { ...base, outcome };
  }
}

function habit(
  suffix: string,
  outcome: HabitOccurrence['outcome'],
  date: LocalDate = DATE,
): HabitOccurrence {
  return {
    id: id<'habit-occurrence'>(suffix),
    definitionId: id<'habit-definition'>(`9${suffix.slice(1)}`),
    date,
    weekStart: startOfWeek(date),
    definitionSnapshot: { title: `Habit ${suffix}` },
    ruleRevision: revision(0),
    isException: false,
    outcome,
    outcomeEvents: [],
    updatedAt: NOW,
  };
}

function openDayWithState(): OpenDay {
  return {
    ...createOpenDay(DATE),
    state: {
      energy: 5,
      mood: 1,
      sleepDurationMinutes: nonNegativeDurationMinutes(480),
      updatedAt: NOW,
    },
  };
}

function frozenDay(): ClosedDay {
  return {
    ...createOpenDay(DATE),
    status: 'closed',
    closedAt: NOW,
    revision: revision(1),
    closureSnapshot: {
      score: {
        task: { completed: 2, applicable: 3, rate: 2 / 3 },
        habit: { completed: 1, applicable: 2, rate: 1 / 2 },
        value: 62,
      },
      plannedLoadMinutes: nonNegativeDurationMinutes(90),
    },
  };
}

function liveFacts() {
  const completed = completedTask('1001', 30);
  const incomplete = incompleteTask('1002', 45);
  const moved = backlogTask('1003', 120);
  const deleted = deletedTask('1004', 90);
  const anotherDay = incompleteTask('1005', 200, OTHER_DATE);
  return {
    occurrences: [completed, incomplete, moved, deleted, anotherDay] as const,
    planEntries: [
      planEntry(completed.id, '2001', 'completed'),
      planEntry(incomplete.id, '2002', 'planned'),
      planEntry(moved.id, '2003', 'moved'),
      planEntry(deleted.id, '2004', 'deleted'),
    ],
    habits: [
      habit('3001', 'completed'),
      habit('3002', 'not-completed'),
      habit('3003', 'pending'),
      habit('3004', 'deleted'),
      habit('3005', 'completed', OTHER_DATE),
    ],
  } as const;
}

describe('live Day score and factual load projection', () => {
  it('derives equal-weight task/habit counts and duration-only current load', () => {
    const facts = liveFacts();
    const signals = selectDaySignals({
      day: openDayWithState(),
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });

    expect(signals.calculation).toBe('live');
    expect(signals.score).toEqual({
      task: { completed: 1, applicable: 3, rate: 1 / 3 },
      habit: { completed: 1, applicable: 3, rate: 1 / 3 },
      value: 33,
    });
    expect(signals.plannedLoadMinutes).toBe(75);
    expect(habitCompletionCounts(facts.habits, DATE)).toEqual({ completed: 1, applicable: 3 });
  });

  it('feeds the same domain-derived score and load into the ordinary open Day view', () => {
    const facts = liveFacts();
    const day = openDayWithState();
    const signals = selectDaySignals({
      day,
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });
    const view = selectOpenDayPlanningView({
      day,
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });

    expect(view.score).toEqual(signals.score);
    expect(view.plannedLoadMinutes).toBe(signals.plannedLoadMinutes);
  });

  it('returns unavailable rather than zero when neither category applies', () => {
    const deleted = deletedTask('1010', 40);
    const signals = selectDaySignals({
      day: openDayWithState(),
      occurrences: [deleted],
      planEntries: [planEntry(deleted.id, '2010', 'deleted')],
      habits: [habit('3010', 'deleted')],
    });

    expect(signals.score).toEqual({
      task: { completed: 0, applicable: 0, rate: 'unavailable' },
      habit: { completed: 0, applicable: 0, rate: 'unavailable' },
      value: 'unavailable',
    });
    expect(signals.plannedLoadMinutes).toBe(0);
  });

  it('does not let Daily State values enter score or load', () => {
    const facts = liveFacts();
    const baseline = selectDaySignals({
      day: createOpenDay(DATE),
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });
    const withState = selectDaySignals({
      day: openDayWithState(),
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });

    expect(withState.score).toEqual(baseline.score);
    expect(withState.plannedLoadMinutes).toBe(baseline.plannedLoadMinutes);
    expect(withState.day.state).toEqual(openDayWithState().state);
  });
});

describe('frozen Day and mixed Week signal projection', () => {
  it('projects a closed Day directly from its immutable closure snapshot', () => {
    const facts = liveFacts();
    const day = frozenDay();
    const signals = selectDaySignals({
      day,
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });

    expect(signals).toEqual({
      day,
      calculation: 'frozen',
      score: day.closureSnapshot.score,
      plannedLoadMinutes: day.closureSnapshot.plannedLoadMinutes,
    });
  });

  it('uses live open-day facts and frozen closed-day snapshots across a Week', () => {
    const calendar = ensureCalendarWeek({ date: DATE });
    const facts = liveFacts();
    const days = calendar.days.map((day) => (day.date === DATE ? openDayWithState() : day));
    const closedWednesday: ClosedDay = {
      ...createOpenDay(OTHER_DATE),
      status: 'closed',
      closedAt: NOW,
      revision: revision(1),
      closureSnapshot: frozenDay().closureSnapshot,
    };
    const mixedDays = days.map((day) => (day.date === OTHER_DATE ? closedWednesday : day));
    const goal: WeeklyGoal = {
      id: id<'weekly-goal'>('4001'),
      statement: 'A descriptive goal that contributes no score',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const weekWithGoal: OpenWeek = { ...calendar.week, goals: [goal] };

    const withoutGoal = selectWeekSignals({
      week: calendar.week,
      days: mixedDays,
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });
    const withGoal = selectWeekSignals({
      week: weekWithGoal,
      days: mixedDays,
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });

    expect(withGoal.days).toEqual(withoutGoal.days);
    expect(withGoal.days.find((day) => day.day.date === DATE)?.calculation).toBe('live');
    expect(withGoal.days.find((day) => day.day.date === OTHER_DATE)).toMatchObject({
      calculation: 'frozen',
      score: closedWednesday.closureSnapshot.score,
      plannedLoadMinutes: 90,
    });
  });

  it('exposes no capacity, threshold, overload state, or inferred warning', () => {
    const facts = liveFacts();
    const projection = selectDaySignals({
      day: openDayWithState(),
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });
    const calendar = ensureCalendarWeek({ date: DATE });
    const weekProjection = selectWeekSignals({
      week: calendar.week,
      days: calendar.days,
      occurrences: facts.occurrences,
      planEntries: facts.planEntries,
      habits: facts.habits,
    });
    const serializedKeys = JSON.stringify({ projection, weekProjection }).toLowerCase();

    for (const prohibited of ['capacity', 'threshold', 'overload', 'warning']) {
      expect(serializedKeys).not.toContain(prohibited);
    }
    expect(Object.keys(projection).sort()).toEqual([
      'calculation',
      'day',
      'plannedLoadMinutes',
      'score',
    ]);
    expect(
      weekProjection.days.every(
        (day) =>
          JSON.stringify(Object.keys(day).sort()) ===
          JSON.stringify(['calculation', 'day', 'plannedLoadMinutes', 'score']),
      ),
    ).toBe(true);
  });
});
