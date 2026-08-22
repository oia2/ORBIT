import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  creationSequence,
  durationMinutes,
  entityId,
  eventSequence,
  nonNegativeDurationMinutes,
  revision,
} from '@/shared/lib/ids';
import { createFixedClock, instant, type Instant } from '@/shared/lib/local-date/clock';
import {
  localDate,
  startOfWeek,
  weekDates,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';

import {
  createDefaultHistorySelection,
  deriveHistoryDateRange,
  explainTaskMembership,
  orderTaskEvents,
  orderTaskMemberships,
  type HistoricalDayFacts,
  type HistorySelection,
} from './history';
import type { HabitOccurrence } from './habit';
import * as historySelectors from './selectors';
import { selectHistoryView, type SelectHistoryViewInput } from './selectors';
import type {
  CanceledTaskPlanEntry,
  CompletedTaskPlanEntry,
  FinalizedTaskOccurrence,
  IncompleteDatedTaskOccurrence,
  MovedTaskPlanEntry,
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
} from './task';
import type { ScoreBreakdown } from './day';
import { createOpenDay, type ClosedDay } from './day';
import type { CompletedWeek } from './week';

const AUGUST_START = localDate('2026-08-01');
const WEEK_START = localDate('2026-08-10');
const SELECTED_DATE = localDate('2026-08-11');
const DESTINATION_DATE = localDate('2026-08-12');
const AUGUST_END = localDate('2026-08-31');
const SEPTEMBER_START = localDate('2026-09-01');
const NOW = instant('2026-08-11T12:00:00.000Z');
const EARLIER = instant('2026-08-11T08:00:00.000Z');
const CLOCK = createFixedClock({ instant: NOW, currentLocalDate: SELECTED_DATE });

const UNAVAILABLE_SCORE: ScoreBreakdown = {
  task: { completed: 0, applicable: 0, rate: 'unavailable' },
  habit: { completed: 0, applicable: 0, rate: 'unavailable' },
  value: 'unavailable',
};

const FROZEN_SCORE: ScoreBreakdown = {
  task: { completed: 2, applicable: 3, rate: 2 / 3 },
  habit: { completed: 1, applicable: 2, rate: 1 / 2 },
  value: 62,
};

function id<TKind extends string>(suffix: string) {
  return entityId<TKind>(`123e4567-e89b-42d3-a456-42661417${suffix}`);
}

function closedDay(date: LocalDate, overrides: Partial<ClosedDay> = {}): ClosedDay {
  return {
    date,
    weekStart: startOfWeek(date),
    status: 'closed',
    state: { energy: 4, mood: 3, updatedAt: NOW },
    closureSnapshot: {
      score: FROZEN_SCORE,
      plannedLoadMinutes: nonNegativeDurationMinutes(75),
    },
    closedAt: NOW,
    revision: revision(1),
    ...overrides,
  };
}

function completedWeek(
  startDate = WEEK_START,
  overrides: Partial<CompletedWeek> = {},
): CompletedWeek {
  return {
    startDate,
    goals: [],
    status: 'completed',
    reflection: 'Frozen weekly reflection',
    completionSnapshot: { progress: FROZEN_SCORE },
    completedAt: NOW,
    revision: revision(1),
    ...overrides,
  };
}

function incompleteTask(
  suffix: string,
  date = SELECTED_DATE,
  overrides: Partial<IncompleteDatedTaskOccurrence> = {},
): IncompleteDatedTaskOccurrence {
  return {
    id: id<'task-occurrence'>(suffix),
    title: `Current task ${suffix}`,
    state: 'active',
    placement: { kind: 'day', date },
    plannedDurationMinutes: durationMinutes(30),
    completion: 'incomplete',
    isException: false,
    createdSequence: creationSequence(Number(suffix) || 1),
    revision: revision(0),
    ...overrides,
  };
}

function finalizedTask(suffix: string): FinalizedTaskOccurrence {
  return {
    id: id<'task-occurrence'>(suffix),
    title: `Finalized task ${suffix}`,
    state: 'finalized',
    placement: { kind: 'none' },
    plannedDurationMinutes: durationMinutes(25),
    isException: false,
    createdSequence: creationSequence(Number(suffix) || 1),
    revision: revision(1),
  };
}

function membershipBase(occurrence: TaskOccurrence, suffix: string, enteredAt: Instant = EARLIER) {
  return {
    id: id<'task-plan-entry'>(suffix),
    occurrenceId: occurrence.id,
    date: SELECTED_DATE,
    weekStart: WEEK_START,
    plannedSnapshot: {
      title: `Original plan ${suffix}`,
      plannedDurationMinutes: durationMinutes(30),
    },
    enteredAt,
    finalizedAt: NOW,
  } as const;
}

function movedMembership(occurrence: TaskOccurrence, suffix: string): MovedTaskPlanEntry {
  return {
    ...membershipBase(occurrence, suffix),
    outcome: 'moved',
    destination: { kind: 'day', date: DESTINATION_DATE },
  };
}

function canceledMembership(occurrence: TaskOccurrence, suffix: string): CanceledTaskPlanEntry {
  return { ...membershipBase(occurrence, suffix), outcome: 'canceled' };
}

function completedMembership(occurrence: TaskOccurrence, suffix: string): CompletedTaskPlanEntry {
  return { ...membershipBase(occurrence, suffix), outcome: 'completed' };
}

function editEvent(
  occurrence: TaskOccurrence,
  suffix: string,
  sequence: number,
): Extract<TaskEvent, { readonly type: 'edit' }> {
  return {
    id: id<'task-event'>(suffix),
    sequence: eventSequence(sequence),
    occurrenceId: occurrence.id,
    effectiveDate: SELECTED_DATE,
    occurredAt: NOW,
    type: 'edit',
    payload: {
      before: { title: 'Before' },
      after: { title: `After ${String(sequence)}` },
    },
  };
}

function habit(suffix: string, overrides: Partial<HabitOccurrence> = {}): HabitOccurrence {
  return {
    id: id<'habit-occurrence'>(suffix),
    definitionId: id<'habit-definition'>(`8${suffix.slice(-3)}`),
    date: SELECTED_DATE,
    weekStart: WEEK_START,
    definitionSnapshot: { title: `Habit ${suffix}` },
    ruleRevision: revision(0),
    isException: false,
    outcome: 'completed',
    outcomeEvents: [],
    updatedAt: NOW,
    ...overrides,
  };
}

function emptyHistoryInput(
  query: HistorySelection,
  overrides: Partial<SelectHistoryViewInput> = {},
): SelectHistoryViewInput {
  return {
    query,
    weeks: [],
    days: [],
    taskOccurrences: [],
    taskPlanEntries: [],
    taskEvents: [],
    habitOccurrences: [],
    ...overrides,
  };
}

function closedWeekDays(): readonly ClosedDay[] {
  return weekDates(WEEK_START).map((date) => closedDay(date));
}

describe('bounded History selections and ranges', () => {
  it('defaults first entry to current Month and selected current local date', () => {
    expect(createDefaultHistorySelection(CLOCK)).toEqual({
      mode: 'month',
      anchorDate: SELECTED_DATE,
      selectedDate: SELECTED_DATE,
    });
  });

  it('derives exact Day, Monday-Sunday Week, and calendar-Month ranges', () => {
    expect(deriveHistoryDateRange({ mode: 'day', anchorDate: SELECTED_DATE })).toEqual({
      mode: 'day',
      anchorDate: SELECTED_DATE,
      startDate: SELECTED_DATE,
      endDate: SELECTED_DATE,
      dates: [SELECTED_DATE],
    });

    expect(deriveHistoryDateRange({ mode: 'week', anchorDate: DESTINATION_DATE })).toEqual({
      mode: 'week',
      anchorDate: DESTINATION_DATE,
      startDate: WEEK_START,
      endDate: localDate('2026-08-16'),
      dates: weekDates(WEEK_START),
      weekStart: WEEK_START,
    });

    const month = deriveHistoryDateRange({
      mode: 'month',
      anchorDate: SELECTED_DATE,
      selectedDate: localDate('2026-08-20'),
    });
    expect(month).toMatchObject({
      mode: 'month',
      anchorDate: SELECTED_DATE,
      selectedDate: localDate('2026-08-20'),
      startDate: AUGUST_START,
      endDate: AUGUST_END,
      monthStart: AUGUST_START,
      monthEnd: AUGUST_END,
    });
    expect(month.dates).toHaveLength(31);
    expect(month.dates.at(0)).toBe(AUGUST_START);
    expect(month.dates.at(-1)).toBe(AUGUST_END);
  });

  it('rejects a Month selected date outside the anchor month', () => {
    expect(() =>
      deriveHistoryDateRange({
        mode: 'month',
        anchorDate: SELECTED_DATE,
        selectedDate: SEPTEMBER_START,
      }),
    ).toThrow(RangeError);
    expect(() =>
      deriveHistoryDateRange({
        mode: 'month',
        anchorDate: SELECTED_DATE,
        selectedDate: localDate('2026-07-31'),
      }),
    ).toThrow(RangeError);
  });

  it('derives leap-century and common-February month ends exactly', () => {
    expect(
      deriveHistoryDateRange({
        mode: 'month',
        anchorDate: localDate('2000-02-10'),
        selectedDate: localDate('2000-02-10'),
      }).endDate,
    ).toBe(localDate('2000-02-29'));
    expect(
      deriveHistoryDateRange({
        mode: 'month',
        anchorDate: localDate('2024-02-10'),
        selectedDate: localDate('2024-02-10'),
      }).endDate,
    ).toBe(localDate('2024-02-29'));
    expect(
      deriveHistoryDateRange({
        mode: 'month',
        anchorDate: localDate('2100-02-10'),
        selectedDate: localDate('2100-02-10'),
      }).endDate,
    ).toBe(localDate('2100-02-28'));
    expect(
      deriveHistoryDateRange({
        mode: 'month',
        anchorDate: localDate('2023-02-10'),
        selectedDate: localDate('2023-02-10'),
      }).endDate,
    ).toBe(localDate('2023-02-28'));
  });
});

describe('immutable Day History facts', () => {
  it('joins planned/disposition/actual tasks, ordered events, habits, state, score, and load', () => {
    const moved = incompleteTask('7101', DESTINATION_DATE);
    const canceled = finalizedTask('7102');
    const completed = finalizedTask('7103');
    const movedEntry = movedMembership(moved, '7201');
    const canceledEntry = canceledMembership(canceled, '7202');
    const completedEntry = completedMembership(completed, '7203');
    const boundaryCorrected = habit('7301', {
      outcomeEvents: [
        { ordinal: 2, occurredAt: NOW, source: 'user-correction', outcome: 'completed' },
        { ordinal: 1, occurredAt: EARLIER, source: 'date-boundary', outcome: 'not-completed' },
      ],
    });
    const deletedHabit = habit('7302', { outcome: 'deleted' });
    const day = closedDay(SELECTED_DATE);
    const input = emptyHistoryInput(
      { mode: 'day', anchorDate: SELECTED_DATE },
      {
        days: [day, closedDay(SEPTEMBER_START)],
        taskOccurrences: [moved, canceled, completed],
        taskPlanEntries: [completedEntry, canceledEntry, movedEntry],
        taskEvents: [
          editEvent(moved, '7402', 2),
          editEvent(moved, '7401', 1),
          editEvent(moved, '7403', 3),
        ],
        habitOccurrences: [deletedHabit, boundaryCorrected],
      },
    );
    const before = JSON.stringify(input);
    const view = selectHistoryView(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(view).toMatchObject({ mode: 'day', anchorDate: SELECTED_DATE });
    if (view.mode !== 'day') {
      throw new Error('Expected Day History');
    }
    expect(view.facts.day).toBe(day);
    expect(view.facts.day.state).toEqual({ energy: 4, mood: 3, updatedAt: NOW });
    expect(view.facts.score).toBe(day.closureSnapshot.score);
    expect(view.facts.plannedLoadMinutes).toBe(75);
    expect(view.facts.tasks).toHaveLength(3);

    const movedFact = view.facts.tasks.find((task) => task.occurrence.id === moved.id);
    expect(movedFact?.explanation).toMatchObject({
      planned: movedEntry.plannedSnapshot,
      disposition: {
        outcome: 'moved',
        destination: { kind: 'day', date: DESTINATION_DATE },
        finalizedAt: NOW,
      },
      actual: { outcome: 'incomplete' },
      isCurrentPlacement: false,
    });
    expect(movedFact?.events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(
      view.facts.tasks.find((task) => task.occurrence.id === canceled.id)?.explanation.actual,
    ).toEqual({ outcome: 'incomplete' });
    expect(
      view.facts.tasks.find((task) => task.occurrence.id === completed.id)?.explanation.actual,
    ).toEqual({ outcome: 'completed' });

    expect(view.facts.habits.map((occurrence) => occurrence.id)).toEqual([
      boundaryCorrected.id,
      deletedHabit.id,
    ]);
    expect(view.facts.habits[0]?.outcomeEvents.map((event) => event.ordinal)).toEqual([1, 2]);
    expect(JSON.stringify(view)).not.toMatch(/partial|suppressed|workout/i);
  });

  it('calculates live score/load for an open day and does not count audit events as memberships', () => {
    const task = incompleteTask('7501');
    const base = membershipBase(task, '7502');
    const entry = {
      id: base.id,
      occurrenceId: base.occurrenceId,
      date: base.date,
      weekStart: base.weekStart,
      plannedSnapshot: base.plannedSnapshot,
      enteredAt: base.enteredAt,
      outcome: 'planned',
    } as const satisfies TaskPlanEntry;
    const completedHabit = habit('7503');
    const view = selectHistoryView(
      emptyHistoryInput(
        { mode: 'day', anchorDate: SELECTED_DATE },
        {
          days: [createOpenDay(SELECTED_DATE)],
          taskOccurrences: [task],
          taskPlanEntries: [entry],
          taskEvents: [editEvent(task, '7504', 1), editEvent(task, '7505', 2)],
          habitOccurrences: [completedHabit],
        },
      ),
    );
    if (view.mode !== 'day') {
      throw new Error('Expected Day History');
    }

    expect(view.facts.tasks).toHaveLength(1);
    expect(view.facts.score).toEqual({
      task: { completed: 0, applicable: 1, rate: 0 },
      habit: { completed: 1, applicable: 1, rate: 1 },
      // 1 of 2 items done. Under the old 70/30 split this read 30.
      value: 50,
    });
    expect(view.facts.plannedLoadMinutes).toBe(30);
  });

  it('uses immutable tie-break facts and rejects a membership joined to the wrong task', () => {
    const task = incompleteTask('7601');
    const otherTask = incompleteTask('7602');
    const earlier = {
      ...membershipBase(task, '7602', EARLIER),
      outcome: 'completed',
    } as const satisfies TaskPlanEntry;
    const later = {
      ...membershipBase(task, '7601', NOW),
      outcome: 'completed',
    } as const satisfies TaskPlanEntry;
    const sameSequenceLaterId = editEvent(task, '7604', 1);
    const sameSequenceEarlierId = editEvent(task, '7603', 1);

    expect(orderTaskMemberships([later, earlier]).map((entry) => entry.id)).toEqual([
      earlier.id,
      later.id,
    ]);
    expect(
      orderTaskEvents([sameSequenceLaterId, sameSequenceEarlierId]).map((event) => event.id),
    ).toEqual([sameSequenceEarlierId.id, sameSequenceLaterId.id]);
    expect(explainTaskMembership(task, earlier).actual).toEqual({ outcome: 'completed' });
    expect(() => explainTaskMembership(otherTask, earlier)).toThrow(RangeError);
  });
});

describe('Week and Month History projections', () => {
  it('returns Monday-Sunday facts with direct frozen progress and reflection', () => {
    const week = completedWeek();
    const days = closedWeekDays();
    const view = selectHistoryView(
      emptyHistoryInput(
        { mode: 'week', anchorDate: DESTINATION_DATE },
        {
          weeks: [completedWeek(localDate('2026-09-07')), week],
          days: [...days, closedDay(SEPTEMBER_START)],
        },
      ),
    );
    if (view.mode !== 'week') {
      throw new Error('Expected Week History');
    }

    expect(view.weekStart).toBe(WEEK_START);
    expect(view.facts.week).toBe(week);
    expect(view.facts.days.map((facts) => facts.day.date)).toEqual(weekDates(WEEK_START));
    expect(view.facts.progress).toBe(week.completionSnapshot.progress);
    expect(view.facts.reflection).toBe('Frozen weekly reflection');
    expect(view.facts.days[1]?.day.state).toEqual({ energy: 4, mood: 3, updatedAt: NOW });
  });

  it('returns calendar-month cells, selected-day details, and contained completed weeks', () => {
    const week = completedWeek();
    const selectedDay = closedDay(SELECTED_DATE);
    const view = selectHistoryView(
      emptyHistoryInput(
        { mode: 'month', anchorDate: SELECTED_DATE, selectedDate: SELECTED_DATE },
        {
          weeks: [week, completedWeek(localDate('2026-09-07'))],
          days: [selectedDay, closedDay(SEPTEMBER_START)],
        },
      ),
    );
    if (view.mode !== 'month') {
      throw new Error('Expected Month History');
    }

    expect(view.monthStart).toBe(AUGUST_START);
    expect(view.monthEnd).toBe(AUGUST_END);
    expect(view.calendar).toHaveLength(31);
    expect(view.calendar.at(0)).toEqual({ date: AUGUST_START, belongsToMonth: true });
    expect(view.calendar.find((cell) => cell.date === SELECTED_DATE)).toMatchObject({
      date: SELECTED_DATE,
      belongsToMonth: true,
      dayStatus: 'closed',
      score: FROZEN_SCORE,
    });
    expect(view.selectedDay.day).toBe(selectedDay);
    expect(view.completedWeeks).toHaveLength(1);
    expect(view.completedWeeks[0]).toMatchObject({
      week,
      progress: FROZEN_SCORE,
      reflection: 'Frozen weekly reflection',
    });
  });

  it('excludes a completed week crossing the Month boundary without fabricating Day facts', () => {
    const crossingWeekStart = localDate('2026-07-27');
    const augustFirst = closedDay(AUGUST_START);
    const view = selectHistoryView(
      emptyHistoryInput(
        { mode: 'month', anchorDate: SELECTED_DATE, selectedDate: AUGUST_START },
        {
          weeks: [completedWeek(crossingWeekStart)],
          days: [augustFirst],
        },
      ),
    );
    if (view.mode !== 'month') {
      throw new Error('Expected Month History');
    }

    expect(view.completedWeeks).toEqual([]);
    expect(view.calendar.at(0)).toMatchObject({
      date: AUGUST_START,
      dayStatus: 'closed',
    });
    expect(
      view.calendar.every((cell) => cell.date >= AUGUST_START && cell.date <= AUGUST_END),
    ).toBe(true);
  });

  it('projects honest empty Day, Week, and Month periods without mutation capabilities', () => {
    const day = selectHistoryView(emptyHistoryInput({ mode: 'day', anchorDate: SELECTED_DATE }));
    const week = selectHistoryView(emptyHistoryInput({ mode: 'week', anchorDate: SELECTED_DATE }));
    const month = selectHistoryView(
      emptyHistoryInput({
        mode: 'month',
        anchorDate: SELECTED_DATE,
        selectedDate: SELECTED_DATE,
      }),
    );

    expect(day).toMatchObject({
      mode: 'day',
      facts: {
        tasks: [],
        habits: [],
        score: UNAVAILABLE_SCORE,
        plannedLoadMinutes: 0,
      },
    });
    expect(week).toMatchObject({ mode: 'week' });
    if (week.mode === 'week') {
      expect(week.facts.days).toHaveLength(7);
      expect(week.facts.progress).toEqual(UNAVAILABLE_SCORE);
    }
    expect(month).toMatchObject({
      mode: 'month',
      selectedDay: { tasks: [], habits: [], score: UNAVAILABLE_SCORE },
      completedWeeks: [],
    });
    expect(historySelectors).not.toHaveProperty('editHistory');
    expect(historySelectors).not.toHaveProperty('deleteHistory');
    expect(historySelectors).not.toHaveProperty('workoutHistory');
  });

  it('keeps the public selector bounded to discriminated ranges and normalized facts', () => {
    expectTypeOf<keyof SelectHistoryViewInput>().toEqualTypeOf<
      | 'query'
      | 'weeks'
      | 'days'
      | 'taskOccurrences'
      | 'taskPlanEntries'
      | 'taskEvents'
      | 'habitOccurrences'
    >();
    expectTypeOf<
      HistoricalDayFacts['tasks'][number]['explanation']['disposition']['outcome']
    >().not.toEqualTypeOf<'partial' | 'suppressed'>();
  });
});
