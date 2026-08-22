import { nextRevision } from '@/shared/lib/ids';

import type { Day } from '@/entities/planning/model/day';
import { prepareDayReopening } from '@/entities/planning/model/day-reopening';
import type { ReopenDayInput } from '@/entities/planning/model/planning-repository';
import type { TaskOccurrence } from '@/entities/planning/model/task';
import type { OpenWeek, Week } from '@/entities/planning/model/week';

import { allocateNextEventSequence } from './audit';
import type { RepositoryContext } from './context';
import { dayReopeningFailure, DomainFailure } from './errors';
import { revisionGuard } from './errors';
import {
  getDay,
  getPlanEntriesByDate,
  getTaskOccurrencesByIds,
  getWeek,
  insertTaskEvent,
  putDay,
  putPlanEntry,
  putTaskOccurrence,
  putWeek,
} from './store';
import type { CommandReceipt, PlanningTransaction } from './transaction';

/**
 * Day reopening in one transaction (003 FR-009 to FR-015).
 *
 * The mirror image of `closeDay`, and it touches the same records — the day,
 * task occurrences, memberships, and audit events — so the same atomicity
 * requirement applies: all of it commits or none of it does (002 FR-007).
 *
 * It deliberately does **not** touch any other day. A task that closure moved
 * elsewhere stays there (owner decision D1), so the destination day's records
 * are never read for writing and never bumped.
 */
export async function reopenDay(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: ReopenDayInput,
): Promise<CommandReceipt<undefined>> {
  const day: Day | undefined = await getDay(trx, input.date);
  if (day === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: input.date });
  }

  const guard = revisionGuard(day.revision, input.expectedDayRevision);
  if (guard !== undefined) throw new DomainFailure(guard);

  const week: Week | undefined = await getWeek(trx, day.weekStart);
  if (week === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Week', id: day.weekStart });
  }

  const taskPlanEntries = await getPlanEntriesByDate(trx, input.date);
  const occurrenceIds = [...new Set(taskPlanEntries.map((entry) => entry.occurrenceId))];
  const taskOccurrences: readonly TaskOccurrence[] = await getTaskOccurrencesByIds(
    trx,
    occurrenceIds,
  );

  const prepared = prepareDayReopening({
    period: { day, week },
    clock: ctx.clock,
    taskOccurrences,
    taskPlanEntries,
  });
  if (!prepared.ok) throw dayReopeningFailure(prepared.error);

  await putDay(trx, prepared.value.effects.day, day.revision);

  const occurrenceRevisions = new Map(
    taskOccurrences.map((occurrence) => [occurrence.id, occurrence.revision]),
  );
  for (const occurrence of prepared.value.effects.taskOccurrences) {
    const expected = occurrenceRevisions.get(occurrence.id);
    if (expected === undefined) {
      throw new Error(`Reopening produced an occurrence it never read: ${occurrence.id}`);
    }
    await putTaskOccurrence(trx, occurrence, expected);
  }
  for (const entry of prepared.value.effects.taskPlanEntries) {
    await putPlanEntry(trx, entry);
  }
  for (const effect of prepared.value.effects.taskEvents) {
    const sequence = await allocateNextEventSequence(trx);
    await insertTaskEvent(trx, { ...effect, id: ctx.nextId<'task-event'>(), sequence });
  }

  // The week is open by the time the domain has approved the reopening, so its
  // aggregate changes and readers must see a new revision.
  const openWeek: OpenWeek = week as OpenWeek;
  await putWeek(trx, { ...openWeek, revision: nextRevision(openWeek.revision) }, openWeek.revision);

  return {
    value: undefined,
    affectedDates: prepared.value.affectedDates,
    affectedWeeks: prepared.value.affectedWeeks,
  };
}
