import {
  isDayPosition,
  isDurationMinutes,
  nextRevision,
  type DayPosition,
  type DurationMinutes,
  type HabitOccurrenceId,
  type TaskOccurrenceId,
  type TaskPlanEntryId,
} from '@/shared/lib/ids';
import type { ApplicationClock, Instant } from '@/shared/lib/local-date/clock';
import { compareLocalDates, startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import type { ClosedDay } from './day';
import { isHabitOccurrenceApplicable, type HabitOccurrence } from './habit';
import { dayCompletionCounts } from './day-counts';
import { calculatePlannedLoad } from './planned-load';
import { calculateCompletionScore } from './scoring';
import {
  isDatedTaskOccurrence,
  type BackloggedTaskPlanEntry,
  type BacklogTaskOccurrence,
  type CanceledTaskPlanEntry,
  type CompletedTaskPlanEntry,
  type DatedTaskOccurrence,
  type FinalizedTaskOccurrence,
  type IncompleteDatedTaskOccurrence,
  type KeptUnfinishedTaskPlanEntry,
  type MovedTaskPlanEntry,
  type PlannedTaskPlanEntry,
  type TaskOccurrence,
  type TaskPlanEntry,
} from './task';
import type { TaskEventEffect, TaskPeriodState } from './task-lifecycle';

export type DayClosureDisposition =
  | { readonly kind: 'keep-unfinished' }
  | {
      readonly kind: 'move-to-date';
      readonly destinationDate: LocalDate;
      readonly durationMinutes: DurationMinutes;
      readonly dayPosition: DayPosition;
    }
  | { readonly kind: 'move-to-backlog' }
  | { readonly kind: 'cancel' };

export interface PrepareDayClosureInput {
  readonly sourcePeriod: TaskPeriodState;
  readonly clock: ApplicationClock;
  readonly dispositions: Readonly<Record<string, DayClosureDisposition>>;
  readonly taskOccurrences: readonly TaskOccurrence[];
  readonly taskPlanEntries: readonly TaskPlanEntry[];
  readonly habitOccurrences: readonly HabitOccurrence[];
  readonly destinationPeriods: readonly TaskPeriodState[];
  /** Adapter-allocated IDs for destination memberships that do not already exist. */
  readonly destinationPlanEntryIds: Readonly<Record<string, TaskPlanEntryId>>;
}

export type DayClosureTaskEventEffect = TaskEventEffect<
  'closure-keep' | 'closure-move' | 'closure-cancel'
>;

export interface DayClosureEffects {
  readonly day: ClosedDay;
  /** Only records that an adapter must write in its closure transaction. */
  readonly taskOccurrences: readonly TaskOccurrence[];
  /** Finalized source memberships followed by any destination membership upserts. */
  readonly taskPlanEntries: readonly TaskPlanEntry[];
  readonly taskEvents: readonly DayClosureTaskEventEffect[];
}

export interface DayClosurePreparation {
  readonly effects: DayClosureEffects;
  readonly affectedDates: readonly LocalDate[];
  readonly affectedWeeks: readonly LocalDate[];
}

export type DayClosureError =
  | { readonly code: 'PeriodImmutable'; readonly date?: LocalDate; readonly weekStart?: LocalDate }
  | {
      readonly code: 'FutureDayClosure';
      readonly date: LocalDate;
      readonly currentLocalDate: LocalDate;
    }
  | {
      readonly code: 'PendingHabitOutcomes';
      readonly occurrenceIds: readonly HabitOccurrenceId[];
    }
  | {
      readonly code: 'ClosureDispositionMismatch';
      readonly expectedOccurrenceIds: readonly TaskOccurrenceId[];
      readonly receivedOccurrenceIds: readonly TaskOccurrenceId[];
    }
  | { readonly code: 'MoveTargetClosed'; readonly destinationDate: LocalDate }
  | {
      readonly code: 'InvalidClosureDestination';
      readonly occurrenceId: TaskOccurrenceId;
      readonly destinationDate: LocalDate;
      readonly reason: 'same-date' | 'non-positive-duration' | 'invalid-day-position';
    }
  | {
      readonly code: 'DestinationPlanEntryIdRequired';
      readonly occurrenceId: TaskOccurrenceId;
    }
  | {
      readonly code: 'InvalidClosureDisposition';
      readonly occurrenceId: TaskOccurrenceId;
    }
  | { readonly code: 'ClosureDataInvariant'; readonly message: string };

function periodOwnershipIsValid(period: TaskPeriodState): boolean {
  const expectedWeekStart = startOfWeek(period.day.date);
  return period.day.weekStart === expectedWeekStart && period.week.startDate === expectedWeekStart;
}

function validateSourcePeriod(period: TaskPeriodState): DayClosureError | undefined {
  if (!periodOwnershipIsValid(period)) {
    return {
      code: 'ClosureDataInvariant',
      message: `Source period records do not own ${period.day.date}`,
    };
  }
  if (period.day.status === 'closed') {
    return { code: 'PeriodImmutable', date: period.day.date };
  }
  if (period.week.status === 'completed') {
    return { code: 'PeriodImmutable', weekStart: period.week.startDate };
  }
  return undefined;
}

function destinationPeriod(
  periods: readonly TaskPeriodState[],
  destinationDate: LocalDate,
): TaskPeriodState | undefined {
  return periods.find((period) => period.day.date === destinationDate);
}

function validateDestination(
  occurrenceId: TaskOccurrenceId,
  sourceDate: LocalDate,
  disposition: Extract<DayClosureDisposition, { readonly kind: 'move-to-date' }>,
  periods: readonly TaskPeriodState[],
): DayClosureError | undefined {
  if (disposition.destinationDate === sourceDate) {
    return {
      code: 'InvalidClosureDestination',
      occurrenceId,
      destinationDate: disposition.destinationDate,
      reason: 'same-date',
    };
  }
  if (!isDurationMinutes(disposition.durationMinutes)) {
    return {
      code: 'InvalidClosureDestination',
      occurrenceId,
      destinationDate: disposition.destinationDate,
      reason: 'non-positive-duration',
    };
  }
  if (!isDayPosition(disposition.dayPosition)) {
    return {
      code: 'InvalidClosureDestination',
      occurrenceId,
      destinationDate: disposition.destinationDate,
      reason: 'invalid-day-position',
    };
  }

  const period = destinationPeriod(periods, disposition.destinationDate);
  if (
    period === undefined ||
    !periodOwnershipIsValid(period) ||
    period.day.status !== 'open' ||
    period.week.status !== 'open'
  ) {
    return { code: 'MoveTargetClosed', destinationDate: disposition.destinationDate };
  }
  return undefined;
}

function naturalMemberships(
  entries: readonly TaskPlanEntry[],
  occurrenceId: TaskOccurrenceId,
  date: LocalDate,
): readonly TaskPlanEntry[] {
  return entries.filter((entry) => entry.occurrenceId === occurrenceId && entry.date === date);
}

function sourceMembershipBase(entry: TaskPlanEntry, finalizedAt: Instant) {
  return {
    id: entry.id,
    occurrenceId: entry.occurrenceId,
    date: entry.date,
    weekStart: entry.weekStart,
    plannedSnapshot: entry.plannedSnapshot,
    enteredAt: entry.enteredAt,
    finalizedAt,
  } as const;
}

function occurrenceCommon(occurrence: TaskOccurrence) {
  return {
    id: occurrence.id,
    ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
    ...(occurrence.nominalDate === undefined ? {} : { nominalDate: occurrence.nominalDate }),
    ...(occurrence.ruleRevision === undefined ? {} : { ruleRevision: occurrence.ruleRevision }),
    title: occurrence.title,
    ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
    isException: occurrence.isException,
    createdSequence: occurrence.createdSequence,
    revision: nextRevision(occurrence.revision),
  } as const;
}

function finalizeOccurrence(occurrence: DatedTaskOccurrence): FinalizedTaskOccurrence {
  return {
    ...occurrenceCommon(occurrence),
    state: 'finalized',
    placement: { kind: 'none' },
    plannedDurationMinutes: occurrence.plannedDurationMinutes,
  };
}

function moveOccurrenceToBacklog(occurrence: IncompleteDatedTaskOccurrence): BacklogTaskOccurrence {
  return {
    ...occurrenceCommon(occurrence),
    state: 'active',
    placement: { kind: 'backlog' },
    plannedDurationMinutes: occurrence.plannedDurationMinutes,
  };
}

function moveOccurrenceToDate(
  occurrence: TaskOccurrence,
  disposition: Extract<DayClosureDisposition, { readonly kind: 'move-to-date' }>,
): IncompleteDatedTaskOccurrence {
  return {
    ...occurrenceCommon(occurrence),
    state: 'active',
    placement: { kind: 'day', date: disposition.destinationDate },
    plannedDurationMinutes: disposition.durationMinutes,
    dayPosition: disposition.dayPosition,
    completion: 'incomplete',
  };
}

function eventBase(
  occurrence: TaskOccurrence,
  planEntryId: TaskPlanEntryId,
  sourceDate: LocalDate,
  occurredAt: Instant,
) {
  return {
    occurrenceId: occurrence.id,
    ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
    planEntryId,
    effectiveDate: sourceDate,
    occurredAt,
  } as const;
}

function uniqueSortedDates(dates: readonly LocalDate[]): readonly LocalDate[] {
  return [...new Set(dates)].toSorted(compareLocalDates);
}

function prepareDestinationMembership(
  input: PrepareDayClosureInput,
  occurrence: TaskOccurrence,
  disposition: Extract<DayClosureDisposition, { readonly kind: 'move-to-date' }>,
  occurredAt: Instant,
): Result<PlannedTaskPlanEntry, DayClosureError> {
  const matching = naturalMemberships(
    input.taskPlanEntries,
    occurrence.id,
    disposition.destinationDate,
  );
  if (matching.length > 1) {
    return err({
      code: 'ClosureDataInvariant',
      message: `Duplicate membership for ${occurrence.id} on ${disposition.destinationDate}`,
    });
  }
  const existing = matching[0];
  if (existing?.outcome === 'deleted' || existing?.finalizedAt !== undefined) {
    return err({
      code: 'ClosureDataInvariant',
      message: `Destination membership for ${occurrence.id} is immutable`,
    });
  }
  const id = existing?.id ?? input.destinationPlanEntryIds[occurrence.id];
  if (id === undefined) {
    return err({ code: 'DestinationPlanEntryIdRequired', occurrenceId: occurrence.id });
  }

  return ok({
    id,
    occurrenceId: occurrence.id,
    date: disposition.destinationDate,
    weekStart: startOfWeek(disposition.destinationDate),
    plannedSnapshot: {
      title: occurrence.title,
      ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
      plannedDurationMinutes: disposition.durationMinutes,
    },
    outcome: 'planned',
    enteredAt: existing?.enteredAt ?? occurredAt,
  });
}

interface DispositionEffects {
  readonly occurrence: TaskOccurrence;
  readonly sourceMembership: TaskPlanEntry;
  readonly destinationMembership?: PlannedTaskPlanEntry;
  readonly event: DayClosureTaskEventEffect;
  readonly affectedDestinationDate?: LocalDate;
}

function prepareDispositionEffects(
  input: PrepareDayClosureInput,
  occurrence: IncompleteDatedTaskOccurrence,
  sourceMembership: TaskPlanEntry,
  disposition: DayClosureDisposition,
  occurredAt: Instant,
): Result<DispositionEffects, DayClosureError> {
  const sourceDate = input.sourcePeriod.day.date;
  const base = sourceMembershipBase(sourceMembership, occurredAt);
  const audit = eventBase(occurrence, sourceMembership.id, sourceDate, occurredAt);

  if (disposition.kind === 'keep-unfinished') {
    return ok({
      occurrence: finalizeOccurrence(occurrence),
      sourceMembership: {
        ...base,
        outcome: 'kept-unfinished',
      } satisfies KeptUnfinishedTaskPlanEntry,
      event: {
        ...audit,
        type: 'closure-keep',
        payload: { date: sourceDate },
      },
    });
  }
  if (disposition.kind === 'move-to-date') {
    const destination = prepareDestinationMembership(input, occurrence, disposition, occurredAt);
    if (!destination.ok) {
      return destination;
    }
    return ok({
      occurrence: moveOccurrenceToDate(occurrence, disposition),
      sourceMembership: {
        ...base,
        outcome: 'moved',
        destination: { kind: 'day', date: disposition.destinationDate },
      } satisfies MovedTaskPlanEntry,
      destinationMembership: destination.value,
      event: {
        ...audit,
        type: 'closure-move',
        payload: {
          fromDate: sourceDate,
          destination: { kind: 'day', date: disposition.destinationDate },
        },
      },
      affectedDestinationDate: disposition.destinationDate,
    });
  }
  if (disposition.kind === 'move-to-backlog') {
    return ok({
      occurrence: moveOccurrenceToBacklog(occurrence),
      sourceMembership: {
        ...base,
        outcome: 'backlogged',
        destination: { kind: 'backlog' },
      } satisfies BackloggedTaskPlanEntry,
      event: {
        ...audit,
        type: 'closure-move',
        payload: { fromDate: sourceDate, destination: { kind: 'backlog' } },
      },
    });
  }

  return ok({
    occurrence: finalizeOccurrence(occurrence),
    sourceMembership: {
      ...base,
      outcome: 'canceled',
    } satisfies CanceledTaskPlanEntry,
    event: {
      ...audit,
      type: 'closure-cancel',
      payload: { date: sourceDate },
    },
  });
}

function matchingSourceMembership(
  input: PrepareDayClosureInput,
  occurrence: TaskOccurrence,
  sourceDate: LocalDate,
): Result<TaskPlanEntry, DayClosureError> {
  const matching = naturalMemberships(input.taskPlanEntries, occurrence.id, sourceDate);
  if (matching.length !== 1 || matching[0] === undefined) {
    return err({
      code: 'ClosureDataInvariant',
      message: `Expected one source membership for ${occurrence.id} on ${sourceDate}`,
    });
  }
  if (matching[0].outcome === 'deleted') {
    return err({
      code: 'ClosureDataInvariant',
      message: `Current occurrence ${occurrence.id} has a deleted source membership`,
    });
  }
  return ok(matching[0]);
}

interface UnfinishedClosureRecord {
  readonly occurrence: IncompleteDatedTaskOccurrence;
  readonly sourceMembership: TaskPlanEntry;
}

interface ValidatedClosureDisposition extends UnfinishedClosureRecord {
  readonly disposition: DayClosureDisposition;
}

function validateAllDispositions(
  input: PrepareDayClosureInput,
  unfinished: readonly UnfinishedClosureRecord[],
): Result<readonly ValidatedClosureDisposition[], DayClosureError> {
  const sourceDate = input.sourcePeriod.day.date;
  const validated: ValidatedClosureDisposition[] = [];
  for (const record of unfinished) {
    const disposition = input.dispositions[record.occurrence.id];
    if (disposition === undefined) {
      return err({ code: 'InvalidClosureDisposition', occurrenceId: record.occurrence.id });
    }
    if (disposition.kind === 'move-to-date') {
      const destinationError = validateDestination(
        record.occurrence.id,
        sourceDate,
        disposition,
        input.destinationPeriods,
      );
      if (destinationError !== undefined) {
        return err(destinationError);
      }
    }
    validated.push({ ...record, disposition });
  }
  return ok(validated);
}

/**
 * Validates and prepares every closure write without mutating source records.
 * The adapter must commit the returned effects in one transaction or commit none.
 */
export function prepareDayClosure(
  input: PrepareDayClosureInput,
): Result<DayClosurePreparation, DayClosureError> {
  const sourceError = validateSourcePeriod(input.sourcePeriod);
  if (sourceError !== undefined) {
    return err(sourceError);
  }

  const sourceDate = input.sourcePeriod.day.date;
  const currentLocalDate = input.clock.currentLocalDate();
  if (compareLocalDates(sourceDate, currentLocalDate) > 0) {
    return err({ code: 'FutureDayClosure', date: sourceDate, currentLocalDate });
  }

  const pendingHabitIds = input.habitOccurrences
    .filter(
      (occurrence) =>
        occurrence.date === sourceDate &&
        isHabitOccurrenceApplicable(occurrence) &&
        occurrence.outcome === 'pending',
    )
    .map((occurrence) => occurrence.id)
    .toSorted();
  if (pendingHabitIds.length > 0) {
    return err({ code: 'PendingHabitOutcomes', occurrenceIds: pendingHabitIds });
  }

  const currentSourceOccurrences = input.taskOccurrences.filter(
    (occurrence): occurrence is DatedTaskOccurrence =>
      isDatedTaskOccurrence(occurrence) && occurrence.placement.date === sourceDate,
  );
  const currentIds = new Set(currentSourceOccurrences.map((occurrence) => occurrence.id));
  if (currentIds.size !== currentSourceOccurrences.length) {
    return err({ code: 'ClosureDataInvariant', message: 'Duplicate current task occurrence ID' });
  }
  const currentRecords: {
    readonly occurrence: DatedTaskOccurrence;
    readonly sourceMembership: TaskPlanEntry;
  }[] = [];
  for (const occurrence of currentSourceOccurrences) {
    const membership = matchingSourceMembership(input, occurrence, sourceDate);
    if (!membership.ok) {
      return membership;
    }
    currentRecords.push({ occurrence, sourceMembership: membership.value });
  }
  const unfinished = currentRecords.filter(
    (record): record is UnfinishedClosureRecord => record.occurrence.completion === 'incomplete',
  );
  const expectedOccurrenceIds = unfinished.map((record) => record.occurrence.id).toSorted();
  const receivedOccurrenceIds = Object.keys(input.dispositions).toSorted() as TaskOccurrenceId[];
  if (
    expectedOccurrenceIds.length !== receivedOccurrenceIds.length ||
    expectedOccurrenceIds.some((id, index) => id !== receivedOccurrenceIds[index])
  ) {
    return err({
      code: 'ClosureDispositionMismatch',
      expectedOccurrenceIds,
      receivedOccurrenceIds,
    });
  }

  const validatedDispositions = validateAllDispositions(input, unfinished);
  if (!validatedDispositions.ok) {
    return validatedDispositions;
  }

  const sourceEntries = input.taskPlanEntries.filter((entry) => entry.date === sourceDate);
  const sourceNaturalKeys = new Set(
    sourceEntries.map((entry) => `${entry.occurrenceId}|${entry.date}`),
  );
  if (sourceNaturalKeys.size !== sourceEntries.length) {
    return err({ code: 'ClosureDataInvariant', message: 'Duplicate source task membership' });
  }

  const occurredAt = input.clock.now();
  const changedOccurrences: TaskOccurrence[] = [];
  const dispositionEntries = new Map<TaskOccurrenceId, TaskPlanEntry>();
  const destinationEntries: PlannedTaskPlanEntry[] = [];
  const events: DayClosureTaskEventEffect[] = [];
  const affectedDestinationDates: LocalDate[] = [];

  for (const record of validatedDispositions.value) {
    const prepared = prepareDispositionEffects(
      input,
      record.occurrence,
      record.sourceMembership,
      record.disposition,
      occurredAt,
    );
    if (!prepared.ok) {
      return prepared;
    }
    changedOccurrences.push(prepared.value.occurrence);
    dispositionEntries.set(record.occurrence.id, prepared.value.sourceMembership);
    if (prepared.value.destinationMembership !== undefined) {
      destinationEntries.push(prepared.value.destinationMembership);
    }
    if (prepared.value.affectedDestinationDate !== undefined) {
      affectedDestinationDates.push(prepared.value.affectedDestinationDate);
    }
    events.push(prepared.value.event);
  }

  for (const record of currentRecords) {
    if (record.occurrence.completion === 'completed') {
      changedOccurrences.push(finalizeOccurrence(record.occurrence));
    }
  }

  const finalizedSourceEntries = sourceEntries.flatMap((entry): readonly TaskPlanEntry[] => {
    if (entry.outcome === 'deleted') {
      return [];
    }
    const dispositionEntry = dispositionEntries.get(entry.occurrenceId);
    if (dispositionEntry !== undefined) {
      return [dispositionEntry];
    }
    const currentOccurrence = currentSourceOccurrences.find(
      (occurrence) => occurrence.id === entry.occurrenceId,
    );
    if (currentOccurrence?.completion === 'completed') {
      return [
        {
          ...sourceMembershipBase(entry, occurredAt),
          outcome: 'completed',
        } satisfies CompletedTaskPlanEntry,
      ];
    }
    return [{ ...entry, finalizedAt: occurredAt }];
  });

  const score = calculateCompletionScore(
    dayCompletionCounts(finalizedSourceEntries, input.habitOccurrences, sourceDate),
  );
  const plannedLoadMinutes = calculatePlannedLoad(
    input.taskOccurrences,
    sourceDate,
    input.habitOccurrences,
  );
  const day: ClosedDay = {
    ...input.sourcePeriod.day,
    status: 'closed',
    closureSnapshot: { score, plannedLoadMinutes },
    closedAt: occurredAt,
    revision: nextRevision(input.sourcePeriod.day.revision),
  };
  const affectedDates = uniqueSortedDates([sourceDate, ...affectedDestinationDates]);

  return ok({
    effects: {
      day,
      taskOccurrences: changedOccurrences,
      taskPlanEntries: [...finalizedSourceEntries, ...destinationEntries],
      taskEvents: events,
    },
    affectedDates,
    affectedWeeks: uniqueSortedDates(affectedDates.map(startOfWeek)),
  });
}
