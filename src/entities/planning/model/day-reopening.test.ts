import { describe, expect, it } from 'vitest';

import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  revision,
} from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate, startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';
import type { Result } from '@/shared/lib/result';

import { createOpenDay, type ClosedDay, type ScoreBreakdown } from './day';
import { prepareDayReopening, type DayReopeningError } from './day-reopening';
import type { HabitOccurrence } from './habit';
import { calculateCompletionScore } from './scoring';
import { dayCompletionCounts } from './day-counts';
import { selectDaySignals } from './selectors';
import type {
  CompletedDatedTaskOccurrence,
  FinalizedTaskOccurrence,
  TaskOccurrence,
  TaskPlanEntry,
} from './task';
import type { Week } from './week';

const SOURCE_DATE = localDate('2026-08-11');
const DESTINATION_DATE = localDate('2026-08-12');
const CLOSED_AT = instant('2026-08-11T20:00:00.000Z');
const NOW = instant('2026-08-12T09:00:00.000Z');
const ENTERED_AT = instant('2026-08-10T08:00:00.000Z');
const CLOCK = createFixedClock({ instant: NOW, currentLocalDate: DESTINATION_DATE });

function id<TKind extends string>(suffix: string) {
  return entityId<TKind>(`123e4567-e89b-42d3-a456-42661417${suffix}`);
}

/** An occurrence as closure leaves it: finalized, with no placement at all. */
function finalized(suffix: string): FinalizedTaskOccurrence {
  return {
    id: id<'task-occurrence'>(suffix),
    title: `Task ${suffix}`,
    state: 'finalized',
    placement: { kind: 'none' },
    plannedDurationMinutes: durationMinutes(30),
    dayPosition: dayPosition(Number(suffix.at(-1)) || 0),
    isException: false,
    createdSequence: creationSequence(Number(suffix.at(-1)) || 1),
    revision: revision(2),
  } as FinalizedTaskOccurrence;
}

function membership(
  occurrence: TaskOccurrence,
  outcome: TaskPlanEntry['outcome'],
  extra: Record<string, unknown> = {},
): TaskPlanEntry {
  return {
    id: id<'task-plan-entry'>(`6${occurrence.id.slice(-3)}`),
    occurrenceId: occurrence.id,
    date: SOURCE_DATE,
    weekStart: startOfWeek(SOURCE_DATE),
    plannedSnapshot: { title: occurrence.title, plannedDurationMinutes: durationMinutes(30) },
    enteredAt: ENTERED_AT,
    finalizedAt: CLOSED_AT,
    outcome,
    ...extra,
  } as TaskPlanEntry;
}

function habit(suffix: string, outcome: HabitOccurrence['outcome']): HabitOccurrence {
  return {
    id: id<'habit-occurrence'>(suffix),
    definitionId: id<'habit-definition'>(`7${suffix.slice(-3)}`),
    date: SOURCE_DATE,
    weekStart: startOfWeek(SOURCE_DATE),
    definitionSnapshot: { title: `Habit ${suffix}` },
    ruleRevision: revision(0),
    isException: false,
    outcome,
    outcomeEvents: [],
    updatedAt: CLOSED_AT,
  };
}

function closedDay(score: ScoreBreakdown, date: LocalDate = SOURCE_DATE): ClosedDay {
  return {
    date,
    weekStart: startOfWeek(date),
    status: 'closed',
    closureSnapshot: { score, plannedLoadMinutes: 150 as never },
    closedAt: CLOSED_AT,
    revision: revision(5),
  };
}

function openWeek(date: LocalDate = SOURCE_DATE): Week {
  return { startDate: startOfWeek(date), goals: [], status: 'open', revision: revision(3) };
}

function completedWeek(date: LocalDate = SOURCE_DATE): Week {
  return {
    startDate: startOfWeek(date),
    goals: [],
    status: 'completed',
    completionSnapshot: {
      progress: {
        task: { completed: 0, applicable: 0, rate: 'unavailable' },
        habit: { completed: 0, applicable: 0, rate: 'unavailable' },
        value: 'unavailable',
      },
    },
    completedAt: CLOSED_AT,
    revision: revision(4),
  };
}

function requireOk<T, E>(result: Result<T, E>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected success, received ${JSON.stringify(result.error)}`);
  return result.value;
}

function requireErr<T>(result: Result<T, DayReopeningError>): DayReopeningError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected failure');
  return result.error;
}

/*
 * A day closed with one of each disposition: one completed, one kept
 * unfinished, one cancelled, one moved to another date. This is the shape every
 * test below reopens, because it is the only one that exercises both halves of
 * owner decision D1 at once.
 */
const done = finalized('a001');
const kept = finalized('a002');
const cancelled = finalized('a003');
const movedAway: CompletedDatedTaskOccurrence = {
  ...finalized('a004'),
  state: 'active',
  placement: { kind: 'day', date: DESTINATION_DATE },
  completion: 'incomplete',
} as never;

const ENTRIES: readonly TaskPlanEntry[] = [
  membership(done, 'completed'),
  membership(kept, 'kept-unfinished'),
  membership(cancelled, 'canceled'),
  membership(movedAway, 'moved', {
    destination: { kind: 'day', date: DESTINATION_DATE },
  }),
];

const OCCURRENCES: readonly TaskOccurrence[] = [done, kept, cancelled, movedAway];

const FROZEN_SCORE = calculateCompletionScore({
  task: { completed: 1, applicable: 4 },
  habit: { completed: 1, applicable: 2 },
});

function reopen(overrides: Partial<Parameters<typeof prepareDayReopening>[0]> = {}) {
  return prepareDayReopening({
    period: { day: closedDay(FROZEN_SCORE), week: openWeek() },
    clock: CLOCK,
    taskOccurrences: OCCURRENCES,
    taskPlanEntries: ENTRIES,
    ...overrides,
  });
}

describe('003 US3: reopening a closed day', () => {
  it('returns the day to open and drops its frozen snapshot (FR-010)', () => {
    const { effects } = requireOk(reopen());

    expect(effects.day.status).toBe('open');
    expect(effects.day).not.toHaveProperty('closureSnapshot');
    expect(effects.day).not.toHaveProperty('closedAt');
    expect(effects.day.revision).toBe(revision(6));
  });

  it('keeps the day state the owner recorded', () => {
    const state = { energy: 4, mood: 3, updatedAt: CLOSED_AT } as const;
    const { effects } = requireOk(
      reopen({ period: { day: { ...closedDay(FROZEN_SCORE), state }, week: openWeek() } }),
    );

    expect(effects.day.state).toEqual(state);
  });

  it('brings completed, kept, and cancelled tasks back to the day (FR-013)', () => {
    const { effects } = requireOk(reopen());
    const returned = effects.taskOccurrences;

    expect(returned).toHaveLength(3);
    for (const occurrence of returned) {
      expect(occurrence.state).toBe('active');
      expect(occurrence.placement).toEqual({ kind: 'day', date: SOURCE_DATE });
    }
    expect(returned.map((occurrence) => occurrence.id)).toEqual([done.id, kept.id, cancelled.id]);
  });

  it('restores each task with the completion its membership recorded (FR-013)', () => {
    const { effects } = requireOk(reopen());
    const byId = new Map(effects.taskOccurrences.map((o) => [o.id, o]));

    expect(byId.get(done.id)).toMatchObject({ completion: 'completed' });
    expect(byId.get(kept.id)).toMatchObject({ completion: 'incomplete' });
    expect(byId.get(cancelled.id)).toMatchObject({ completion: 'incomplete' });
  });

  it('de-finalizes the restored memberships so the day is editable again (FR-013)', () => {
    const { effects } = requireOk(reopen());

    expect(effects.taskPlanEntries.map((entry) => entry.outcome)).toEqual([
      'completed',
      'planned',
      'planned',
    ]);
    for (const entry of effects.taskPlanEntries) {
      expect(entry.finalizedAt).toBeUndefined();
    }
  });

  it('leaves a task moved to another date exactly where closure put it (D1, FR-012)', () => {
    const { effects } = requireOk(reopen());

    expect(effects.taskOccurrences.map((o) => o.id)).not.toContain(movedAway.id);
    expect(effects.taskPlanEntries.map((entry) => entry.occurrenceId)).not.toContain(movedAway.id);
  });

  it('never writes the day that received a moved task (FR-015)', () => {
    const { affectedDates } = requireOk(reopen());

    expect(affectedDates).toEqual([SOURCE_DATE]);
    expect(affectedDates).not.toContain(DESTINATION_DATE);
  });

  it('leaves a backlogged task in the backlog (D1, FR-012)', () => {
    const backlogged = { ...finalized('a005'), state: 'active', placement: { kind: 'backlog' } };
    const { effects } = requireOk(
      reopen({
        taskOccurrences: [backlogged as never],
        taskPlanEntries: [
          membership(backlogged as never, 'backlogged', { destination: { kind: 'backlog' } }),
        ],
      }),
    );

    expect(effects.taskOccurrences).toEqual([]);
  });

  it('leaves a deleted membership deleted', () => {
    const removed = finalized('a006');
    const { effects } = requireOk(
      reopen({
        taskOccurrences: [removed],
        taskPlanEntries: [membership(removed, 'deleted')],
      }),
    );

    expect(effects.taskOccurrences).toEqual([]);
  });

  it("makes the reopened day's live result equal the snapshot it discarded (FR-010)", () => {
    // This is the invariant US3 acceptance scenario 1 rests on: reopening must
    // not silently change the number the owner was looking at.
    const habits = [habit('b001', 'completed'), habit('b002', 'not-completed')];
    const { effects } = requireOk(reopen());

    const live = selectDaySignals({
      day: effects.day,
      occurrences: effects.taskOccurrences,
      // The moved membership stays on the day and still counts (D3).
      planEntries: [...effects.taskPlanEntries, membership(movedAway, 'moved')],
      habits,
    });

    expect(live.calculation).toBe('live');
    expect(live.score).toEqual(FROZEN_SCORE);
  });

  it('records one closure-reopen event per restored task, in order (FR-011)', () => {
    const { effects } = requireOk(reopen());

    expect(effects.taskEvents).toHaveLength(3);
    expect(effects.taskEvents.map((event) => event.payload)).toEqual([
      { date: SOURCE_DATE },
      { date: SOURCE_DATE },
      { date: SOURCE_DATE },
    ]);
    for (const event of effects.taskEvents) {
      expect(event.type).toBe('closure-reopen');
      expect(event.effectiveDate).toBe(SOURCE_DATE);
      expect(event.occurredAt).toBe(NOW);
    }
  });

  it('reports the day and its week as affected', () => {
    const { affectedDates, affectedWeeks } = requireOk(reopen());

    expect(affectedDates).toEqual([SOURCE_DATE]);
    expect(affectedWeeks).toEqual([startOfWeek(SOURCE_DATE)]);
  });

  it('counts a reopened day exactly as an ordinary open day would', () => {
    const { effects } = requireOk(reopen());
    const counts = dayCompletionCounts(effects.taskPlanEntries, [], SOURCE_DATE);

    expect(counts.task).toEqual({ completed: 1, applicable: 3 });
  });
});

describe('003 US3: reopening guards', () => {
  it('refuses a day whose week is already completed, naming the week (FR-014)', () => {
    const error = requireErr(
      reopen({ period: { day: closedDay(FROZEN_SCORE), week: completedWeek() } }),
    );

    expect(error).toEqual({ code: 'PeriodImmutable', weekStart: startOfWeek(SOURCE_DATE) });
  });

  it('refuses a day that is already open', () => {
    const error = requireErr(
      reopen({ period: { day: createOpenDay(SOURCE_DATE), week: openWeek() } }),
    );

    expect(error).toEqual({
      code: 'InvalidTransition',
      date: SOURCE_DATE,
      currentStatus: 'open',
    });
  });

  it('refuses period records that do not own the day', () => {
    const error = requireErr(
      reopen({
        period: { day: closedDay(FROZEN_SCORE), week: openWeek(localDate('2026-09-07')) },
      }),
    );

    expect(error.code).toBe('ReopeningDataInvariant');
  });

  it('refuses a membership whose occurrence is missing', () => {
    const error = requireErr(reopen({ taskOccurrences: [] }));

    expect(error.code).toBe('ReopeningDataInvariant');
  });

  it('ignores memberships belonging to another date', () => {
    const other = finalized('a007');
    const { effects } = requireOk(
      reopen({
        taskOccurrences: [other],
        taskPlanEntries: [{ ...membership(other, 'completed'), date: DESTINATION_DATE }],
      }),
    );

    expect(effects.taskOccurrences).toEqual([]);
  });
});
