import type { DurationMinutes } from '@/shared/lib/ids';
import type { Instant } from '@/shared/lib/local-date/clock';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { TaskOccurrence, TaskPlanEntry } from '@/entities/planning/model/task';

import type { RepositoryContext } from './context';
import { getPlanEntryByOccurrenceDate } from './store';
import type { PlanningTransaction } from './transaction';

/**
 * Strips whatever outcome and destination a membership carried and returns it
 * to `planned`, keeping its identity and its original `plannedSnapshot`.
 *
 * This is how an A -> B -> A move reuses one membership instead of creating a
 * second one for the same date: the returning task finds its existing row and
 * resets it. `UNIQUE (occurrence_id, plan_date)` makes the alternative
 * unrepresentable, so a scoring denominator cannot inflate (001 FR-027, FR-048).
 */
export function plannedEntry(entry: TaskPlanEntry): TaskPlanEntry {
  return {
    id: entry.id,
    occurrenceId: entry.occurrenceId,
    date: entry.date,
    weekStart: entry.weekStart,
    plannedSnapshot: entry.plannedSnapshot,
    enteredAt: entry.enteredAt,
    outcome: 'planned',
  };
}

export interface DestinationMembershipInput {
  readonly occurrence: TaskOccurrence;
  readonly destinationDate: LocalDate;
  readonly destinationWeekStart: LocalDate;
  readonly durationMinutes: DurationMinutes;
  readonly enteredAt: Instant;
}

/**
 * Resolves the membership a task lands on: the existing one for that date,
 * reset to `planned`, or a fresh one snapshotting the plan as committed.
 */
export async function resolveDestinationMembership(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: DestinationMembershipInput,
): Promise<TaskPlanEntry> {
  const existing = await getPlanEntryByOccurrenceDate(
    trx,
    input.occurrence.id,
    input.destinationDate,
  );

  if (existing !== undefined) {
    return plannedEntry(existing);
  }

  const { occurrence } = input;
  return {
    id: ctx.nextId<'task-plan-entry'>(),
    occurrenceId: occurrence.id,
    date: input.destinationDate,
    weekStart: input.destinationWeekStart,
    plannedSnapshot: {
      title: occurrence.title,
      ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
      plannedDurationMinutes: input.durationMinutes,
      ...(occurrence.startTime === undefined ? {} : { startTime: occurrence.startTime }),
      ...(occurrence.endTime === undefined ? {} : { endTime: occurrence.endTime }),
    },
    enteredAt: input.enteredAt,
    outcome: 'planned',
  };
}
