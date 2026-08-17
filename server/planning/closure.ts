import { nextRevision } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { Day, DayClosureSnapshot } from '@/entities/planning/model/day';
import { prepareDayClosure } from '@/entities/planning/model/day-closure';
import type { CloseDayInput } from '@/entities/planning/model/planning-repository';
import type { TaskOccurrence, TaskPlanEntry } from '@/entities/planning/model/task';
import type { OpenWeek, Week } from '@/entities/planning/model/week';

import { allocateNextEventSequence } from './audit';
import { requireOpenDay, requireOpenWeek, type RepositoryContext } from './context';
import { dayClosureFailure, DomainFailure } from './errors';
import { prepareClosureDate } from './materialization';
import {
  getDay,
  getHabitOccurrencesByDate,
  getPlanEntriesByDate,
  getPlanEntryByOccurrenceDate,
  getTaskOccurrencesByIds,
  getTaskOccurrencesPlacedOn,
  getWeek,
  insertTaskEvent,
  putDay,
  putPlanEntry,
  putTaskOccurrence,
  putWeek,
} from './store';
import type { CommandReceipt, PlanningTransaction } from './transaction';

/**
 * Day closure in one transaction. It touches days, occurrences, memberships,
 * audit events, and habit occurrences, so it is the case that decides whether
 * atomicity actually holds (002 FR-007, SC-005).
 */
export async function closeDay(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: CloseDayInput,
): Promise<CommandReceipt<DayClosureSnapshot>> {
  const sourceDay: Day | undefined = await getDay(trx, input.date);
  if (sourceDay === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: input.date });
  }
  requireOpenDay(sourceDay, input.expectedDayRevision);
  const sourceWeek = await getWeek(trx, sourceDay.weekStart);
  requireOpenWeek(sourceWeek, sourceDay.weekStart);

  await prepareClosureDate(ctx, trx, input.date);

  const sourceEntries = await getPlanEntriesByDate(trx, input.date);
  const occurrenceIds = new Set(sourceEntries.map((entry) => entry.occurrenceId));
  for (const placed of await getTaskOccurrencesPlacedOn(trx, input.date)) {
    occurrenceIds.add(placed.id);
  }

  const taskOccurrences: TaskOccurrence[] = [
    ...(await getTaskOccurrencesByIds(trx, [...occurrenceIds])),
  ];

  const taskPlanEntries = new Map(sourceEntries.map((entry) => [entry.id, entry]));
  const destinationPeriods = [];
  const destinationPlanEntryIds: Record<string, TaskPlanEntry['id']> = {};
  const destinationDates = new Set<LocalDate>();

  for (const [occurrenceId, disposition] of Object.entries(input.dispositions)) {
    if (disposition.kind !== 'move-to-date') continue;
    destinationDates.add(disposition.destinationDate);
    const existing = await getPlanEntryByOccurrenceDate(
      trx,
      occurrenceId,
      disposition.destinationDate,
    );
    if (existing !== undefined) {
      taskPlanEntries.set(existing.id, existing);
    } else {
      destinationPlanEntryIds[occurrenceId] = ctx.nextId<'task-plan-entry'>();
    }
  }

  for (const destinationDate of destinationDates) {
    const destinationDay = await getDay(trx, destinationDate);
    if (destinationDay === undefined) continue;
    const destinationWeek = await getWeek(trx, destinationDay.weekStart);
    if (destinationWeek === undefined) continue;
    destinationPeriods.push({ day: destinationDay, week: destinationWeek });
  }

  const habitOccurrences = await getHabitOccurrencesByDate(trx, input.date);
  const prepared = prepareDayClosure({
    sourcePeriod: { day: sourceDay, week: sourceWeek },
    clock: ctx.clock,
    dispositions: input.dispositions,
    taskOccurrences,
    taskPlanEntries: [...taskPlanEntries.values()],
    habitOccurrences,
    destinationPeriods,
    destinationPlanEntryIds,
  });
  if (!prepared.ok) throw dayClosureFailure(prepared.error);

  await putDay(trx, prepared.value.effects.day, sourceDay.revision);

  const occurrenceRevisions = new Map(
    taskOccurrences.map((occurrence) => [occurrence.id, occurrence.revision]),
  );
  for (const occurrence of prepared.value.effects.taskOccurrences) {
    const expected = occurrenceRevisions.get(occurrence.id);
    if (expected === undefined) {
      throw new Error(`Closure produced an occurrence it never read: ${occurrence.id}`);
    }
    await putTaskOccurrence(trx, occurrence, expected);
  }
  for (const entry of prepared.value.effects.taskPlanEntries) {
    await putPlanEntry(trx, entry);
  }
  for (const effect of prepared.value.effects.taskEvents) {
    const sequence = await allocateNextEventSequence(trx);
    await insertTaskEvent(trx, {
      ...effect,
      id: ctx.nextId<'task-event'>(),
      sequence,
    });
  }

  for (const destinationDate of destinationDates) {
    const destinationDay = await getDay(trx, destinationDate);
    if (destinationDay?.status !== 'open') continue;
    await putDay(
      trx,
      { ...destinationDay, revision: nextRevision(destinationDay.revision) },
      destinationDay.revision,
    );
  }

  const affectedWeeks = new Map<LocalDate, OpenWeek>();
  for (const weekStart of prepared.value.affectedWeeks) {
    const week: Week | undefined = await getWeek(trx, weekStart);
    if (week?.status === 'open') affectedWeeks.set(week.startDate, week);
  }
  for (const week of affectedWeeks.values()) {
    await putWeek(trx, { ...week, revision: nextRevision(week.revision) }, week.revision);
  }

  return {
    value: prepared.value.effects.day.closureSnapshot,
    affectedDates: prepared.value.affectedDates,
    affectedWeeks: [...affectedWeeks.keys()],
  };
}
