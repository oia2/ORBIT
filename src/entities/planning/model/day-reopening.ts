import { nextRevision, type TaskOccurrenceId } from '@/shared/lib/ids';
import type { ApplicationClock, Instant } from '@/shared/lib/local-date/clock';
import { startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import type { OpenDay } from './day';
import {
  type CompletedDatedTaskOccurrence,
  type CompletedTaskPlanEntry,
  type IncompleteDatedTaskOccurrence,
  type PlannedTaskPlanEntry,
  type TaskOccurrence,
  type TaskPlanEntry,
} from './task';
import type { TaskEventEffect, TaskPeriodState } from './task-lifecycle';

/**
 * Returns a closed Day to the open state (003 FR-009 to FR-015).
 *
 * Per owner decision **D1**, reopening is *not* an inverse of closure. It does
 * not undo relocations: a task that closure moved to another date or sent to
 * the backlog stays where it was put, and the day that received it is never
 * written. What reopening does undo is the finalization of the records closure
 * left with nowhere else to be — `completed`, `kept-unfinished`, and `canceled`
 * memberships, whose occurrences were parked at `placement: {kind: 'none'}`.
 *
 * Without that, a reopened day would be editable in name only: every task on it
 * would be frozen and User Story 3 would deliver nothing.
 *
 * The completion each occurrence returns with is read from its membership
 * outcome, which is what makes the reopened day's *live* score equal the
 * snapshot it just discarded — the invariant US3 acceptance scenario 1 asserts.
 */

export type DayReopeningTaskEventEffect = TaskEventEffect<'closure-reopen'>;

export interface PrepareDayReopeningInput {
  readonly period: TaskPeriodState;
  readonly clock: ApplicationClock;
  readonly taskOccurrences: readonly TaskOccurrence[];
  readonly taskPlanEntries: readonly TaskPlanEntry[];
}

export interface DayReopeningEffects {
  readonly day: OpenDay;
  /** Only the occurrences this reopening actually returns to the day. */
  readonly taskOccurrences: readonly TaskOccurrence[];
  /** Their memberships, de-finalized so the day can be edited again. */
  readonly taskPlanEntries: readonly TaskPlanEntry[];
  readonly taskEvents: readonly DayReopeningTaskEventEffect[];
}

export interface DayReopeningPreparation {
  readonly effects: DayReopeningEffects;
  readonly affectedDates: readonly LocalDate[];
  readonly affectedWeeks: readonly LocalDate[];
}

export type DayReopeningError =
  | { readonly code: 'PeriodImmutable'; readonly weekStart: LocalDate }
  | {
      readonly code: 'InvalidTransition';
      readonly date: LocalDate;
      readonly currentStatus: 'open';
    }
  | { readonly code: 'ReopeningDataInvariant'; readonly message: string };

/** Outcomes whose occurrence has no other placement and must come back. */
const RESTORABLE_OUTCOMES = ['completed', 'kept-unfinished', 'canceled'] as const;
type RestorableOutcome = (typeof RESTORABLE_OUTCOMES)[number];

function isRestorable(entry: TaskPlanEntry): entry is TaskPlanEntry & {
  readonly outcome: RestorableOutcome;
} {
  return (RESTORABLE_OUTCOMES as readonly string[]).includes(entry.outcome);
}

function occurrenceCommon(occurrence: TaskOccurrence) {
  return {
    id: occurrence.id,
    ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
    ...(occurrence.nominalDate === undefined ? {} : { nominalDate: occurrence.nominalDate }),
    ...(occurrence.ruleRevision === undefined ? {} : { ruleRevision: occurrence.ruleRevision }),
    title: occurrence.title,
    ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
    ...(occurrence.startTime === undefined ? {} : { startTime: occurrence.startTime }),
    ...(occurrence.endTime === undefined ? {} : { endTime: occurrence.endTime }),
    isException: occurrence.isException,
    createdSequence: occurrence.createdSequence,
    revision: nextRevision(occurrence.revision),
  } as const;
}

function restoreOccurrence(
  occurrence: TaskOccurrence,
  date: LocalDate,
  outcome: RestorableOutcome,
  occurredAt: Instant,
): CompletedDatedTaskOccurrence | IncompleteDatedTaskOccurrence {
  const base = {
    ...occurrenceCommon(occurrence),
    state: 'active' as const,
    placement: { kind: 'day', date } as const,
    plannedDurationMinutes: occurrence.plannedDurationMinutes,
    // The position the task held before closure is still on the record, so the
    // reopened day rebuilds in its original order. Only occurrences of this
    // same day are restored, so a collision is not possible.
    ...('dayPosition' in occurrence ? { dayPosition: occurrence.dayPosition } : {}),
  };

  if (outcome === 'completed') {
    return {
      ...base,
      completion: 'completed',
      // The day is open again, so "when" is now: the original completion
      // instant belonged to a closure that no longer stands.
      actualCompletedAt: occurredAt,
    } as CompletedDatedTaskOccurrence;
  }

  return { ...base, completion: 'incomplete' } as IncompleteDatedTaskOccurrence;
}

function restoreMembership(
  entry: TaskPlanEntry,
  outcome: RestorableOutcome,
): CompletedTaskPlanEntry | PlannedTaskPlanEntry {
  const base = {
    id: entry.id,
    occurrenceId: entry.occurrenceId,
    date: entry.date,
    weekStart: entry.weekStart,
    plannedSnapshot: entry.plannedSnapshot,
    enteredAt: entry.enteredAt,
  } as const;

  // `finalizedAt` is deliberately dropped: an open day has no finalized
  // memberships, and leaving it set would make the day immutable again to
  // every reader that checks it.
  return outcome === 'completed'
    ? ({ ...base, outcome: 'completed' } satisfies CompletedTaskPlanEntry)
    : ({ ...base, outcome: 'planned' } satisfies PlannedTaskPlanEntry);
}

/**
 * Validates and prepares every reopening write without mutating source records.
 * The adapter must commit the returned effects in one transaction or none.
 */
export function prepareDayReopening(
  input: PrepareDayReopeningInput,
): Result<DayReopeningPreparation, DayReopeningError> {
  const { day, week } = input.period;

  if (day.status === 'open') {
    return err({ code: 'InvalidTransition', date: day.date, currentStatus: 'open' });
  }

  // A completed week's frozen progress is aggregated from its days' snapshots.
  // Reopening one of them would leave that aggregate describing a day that no
  // longer has a snapshot, so the day stays closed and the reason is reported
  // (003 FR-014). Reopening a completed week is out of scope for 003.
  if (week.status === 'completed') {
    return err({ code: 'PeriodImmutable', weekStart: week.startDate });
  }

  if (startOfWeek(day.date) !== week.startDate || day.weekStart !== week.startDate) {
    return err({
      code: 'ReopeningDataInvariant',
      message: `Period records do not own ${day.date}`,
    });
  }

  const occurredAt = input.clock.now();
  const occurrencesById = new Map<TaskOccurrenceId, TaskOccurrence>(
    input.taskOccurrences.map((occurrence) => [occurrence.id, occurrence]),
  );

  const restoredOccurrences: TaskOccurrence[] = [];
  const restoredEntries: TaskPlanEntry[] = [];
  const events: DayReopeningTaskEventEffect[] = [];

  for (const entry of input.taskPlanEntries) {
    if (entry.date !== day.date || !isRestorable(entry)) {
      // `moved`, `backlogged`, and `deleted` are left exactly as they are: the
      // task lives somewhere else now, and D1 says reopening does not claw it
      // back (003 FR-012).
      continue;
    }

    const occurrence = occurrencesById.get(entry.occurrenceId);
    if (occurrence === undefined) {
      return err({
        code: 'ReopeningDataInvariant',
        message: `Membership ${entry.id} has no occurrence ${entry.occurrenceId}`,
      });
    }

    restoredOccurrences.push(restoreOccurrence(occurrence, day.date, entry.outcome, occurredAt));
    restoredEntries.push(restoreMembership(entry, entry.outcome));
    events.push({
      occurrenceId: occurrence.id,
      ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
      planEntryId: entry.id,
      effectiveDate: day.date,
      occurredAt,
      type: 'closure-reopen',
      payload: { date: day.date },
    });
  }

  const reopened: OpenDay = {
    date: day.date,
    weekStart: day.weekStart,
    ...(day.state === undefined ? {} : { state: day.state }),
    status: 'open',
    revision: nextRevision(day.revision),
  };

  return ok({
    effects: {
      day: reopened,
      taskOccurrences: restoredOccurrences,
      taskPlanEntries: restoredEntries,
      taskEvents: events,
    },
    affectedDates: [day.date],
    affectedWeeks: [week.startDate],
  });
}
