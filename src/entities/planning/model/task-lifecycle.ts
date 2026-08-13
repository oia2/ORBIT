import type { Day } from './day';
import type { DomainOrStorageError } from './planning-repository';
import {
  isDatedTaskOccurrence,
  type BacklogTaskOccurrence,
  type CompletedDatedTaskOccurrence,
  type CompletedTaskPlanEntry,
  type DatedTaskOccurrence,
  type DeletedTaskOccurrence,
  type DeletedTaskPlanEntry,
  type IncompleteDatedTaskOccurrence,
  type MovedTaskPlanEntry,
  type BackloggedTaskPlanEntry,
  type PlannedTaskPlanEntry,
  type TaskEvent,
  type TaskEventType,
  type TaskOccurrence,
  type TaskPlanEntry,
  type TaskPlannedSnapshot,
  type TaskValueSnapshot,
} from './task';
import type { Week } from './week';
import {
  isNonNegativeInteger,
  isPositiveInteger,
  nextRevision,
  type DayPosition,
  type DurationMinutes,
  type TaskPlanEntryId,
} from '@/shared/lib/ids';
import type { Instant } from '@/shared/lib/local-date/clock';
import { startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

export interface TaskPeriodState {
  readonly day: Day;
  readonly week: Week;
}

export interface TaskMembershipPeriodState {
  readonly membership: TaskPlanEntry;
  readonly period: TaskPeriodState;
}

type TaskLifecycleErrorCode =
  | 'ValidationFailure'
  | 'PeriodImmutable'
  | 'InvalidTransition'
  | 'TaskMustBeIncompleteToMove'
  | 'MoveTargetClosed';

export type TaskLifecycleError = Extract<
  DomainOrStorageError,
  { readonly code: TaskLifecycleErrorCode }
>;

export type TaskEventEffect<Type extends TaskEventType = TaskEventType> = Type extends TaskEventType
  ? Omit<Extract<TaskEvent, { readonly type: Type }>, 'id' | 'sequence'>
  : never;

export interface PreparedTaskCompletion {
  readonly occurrence: DatedTaskOccurrence;
  readonly membership: PlannedTaskPlanEntry | CompletedTaskPlanEntry;
  readonly event: TaskEventEffect<'completion-checked' | 'completion-unchecked'>;
}

export interface PreparedTaskEdit {
  readonly occurrence: DatedTaskOccurrence | BacklogTaskOccurrence;
  readonly event: TaskEventEffect<'edit'>;
}

export interface PreparedTaskMoveToDate {
  readonly occurrence: IncompleteDatedTaskOccurrence;
  readonly memberships: readonly TaskPlanEntry[];
  readonly sourceMembership?: MovedTaskPlanEntry;
  readonly destinationMembership: PlannedTaskPlanEntry;
  readonly destinationCreated: boolean;
  readonly event: TaskEventEffect<'move-to-date' | 'schedule-from-backlog'>;
}

export interface PreparedTaskMoveToBacklog {
  readonly occurrence: BacklogTaskOccurrence;
  readonly memberships: readonly TaskPlanEntry[];
  readonly sourceMembership: BackloggedTaskPlanEntry;
  readonly event: TaskEventEffect<'move-to-backlog'>;
}

export interface PreparedTaskDeletion {
  readonly occurrence: DeletedTaskOccurrence;
  readonly memberships: readonly TaskPlanEntry[];
  readonly affectedOpenDates: readonly LocalDate[];
  readonly event: TaskEventEffect<'delete'>;
}

function invalidTransition(
  occurrence: TaskOccurrence,
  attemptedTransition: string,
): TaskLifecycleError {
  const currentState =
    occurrence.state !== 'active'
      ? occurrence.state
      : isDatedTaskOccurrence(occurrence)
        ? occurrence.completion === 'completed'
          ? 'dated-completed'
          : 'dated-incomplete'
        : 'backlog';
  return {
    code: 'InvalidTransition',
    entity: 'TaskOccurrence',
    currentState,
    attemptedTransition,
  };
}

function validationFailure(field: string, message: string): TaskLifecycleError {
  return { code: 'ValidationFailure', issues: [{ field, message }] };
}

function validatePeriodOwnership(
  period: TaskPeriodState,
  date: LocalDate,
): TaskLifecycleError | undefined {
  if (
    period.day.date !== date ||
    period.day.weekStart !== startOfWeek(date) ||
    period.week.startDate !== period.day.weekStart
  ) {
    return validationFailure('date', `Period records do not own ${date}`);
  }
  return undefined;
}

function requireOpenSourcePeriod(
  period: TaskPeriodState | undefined,
  date: LocalDate,
): TaskLifecycleError | undefined {
  if (period === undefined) {
    return validationFailure('period', `Dated task period ${date} is required`);
  }
  const ownershipError = validatePeriodOwnership(period, date);
  if (ownershipError !== undefined) {
    return ownershipError;
  }
  if (period.day.status === 'closed') {
    return { code: 'PeriodImmutable', date };
  }
  if (period.week.status === 'completed') {
    return { code: 'PeriodImmutable', weekStart: period.week.startDate };
  }
  return undefined;
}

function requireOpenDestination(
  period: TaskPeriodState,
  destinationDate: LocalDate,
): TaskLifecycleError | undefined {
  const ownershipError = validatePeriodOwnership(period, destinationDate);
  if (ownershipError !== undefined) {
    return ownershipError;
  }
  return period.day.status === 'open' && period.week.status === 'open'
    ? undefined
    : { code: 'MoveTargetClosed', destinationDate };
}

function occurrenceValueSnapshot(occurrence: TaskOccurrence): TaskValueSnapshot {
  return {
    title: occurrence.title,
    ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
    ...(occurrence.plannedDurationMinutes === undefined
      ? {}
      : { plannedDurationMinutes: occurrence.plannedDurationMinutes }),
  };
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
  } as const;
}

function plannedSnapshot(
  occurrence: TaskOccurrence,
  duration: DurationMinutes,
): TaskPlannedSnapshot {
  return {
    title: occurrence.title,
    ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
    plannedDurationMinutes: duration,
  };
}

function toPlannedMembership(
  membership: TaskPlanEntry,
  snapshot: TaskPlannedSnapshot = membership.plannedSnapshot,
): PlannedTaskPlanEntry {
  return {
    id: membership.id,
    occurrenceId: membership.occurrenceId,
    date: membership.date,
    weekStart: membership.weekStart,
    plannedSnapshot: snapshot,
    enteredAt: membership.enteredAt,
    outcome: 'planned',
  };
}

function toCompletedMembership(membership: TaskPlanEntry): CompletedTaskPlanEntry {
  return {
    id: membership.id,
    occurrenceId: membership.occurrenceId,
    date: membership.date,
    weekStart: membership.weekStart,
    plannedSnapshot: membership.plannedSnapshot,
    enteredAt: membership.enteredAt,
    outcome: 'completed',
  };
}

function matchingMemberships(
  memberships: readonly TaskPlanEntry[],
  occurrence: TaskOccurrence,
  date: LocalDate,
): readonly TaskPlanEntry[] {
  return memberships.filter(
    (membership) => membership.occurrenceId === occurrence.id && membership.date === date,
  );
}

function requireUniqueMembership(
  memberships: readonly TaskPlanEntry[],
  occurrence: TaskOccurrence,
  date: LocalDate,
  attemptedTransition: string,
): Result<TaskPlanEntry, TaskLifecycleError> {
  const matching = matchingMemberships(memberships, occurrence, date);
  if (matching.length !== 1 || matching[0] === undefined) {
    return err(invalidTransition(occurrence, attemptedTransition));
  }
  if (matching[0].finalizedAt !== undefined) {
    return err({ code: 'PeriodImmutable', date });
  }
  return ok(matching[0]);
}

function replaceMembership(
  memberships: readonly TaskPlanEntry[],
  replacement: TaskPlanEntry,
): readonly TaskPlanEntry[] {
  return memberships.map((membership) =>
    membership.id === replacement.id ? replacement : membership,
  );
}

export interface PrepareTaskCompletionInput {
  readonly occurrence: TaskOccurrence;
  readonly membership: TaskPlanEntry;
  readonly period: TaskPeriodState;
  readonly completed: boolean;
  readonly occurredAt: Instant;
}

export function prepareTaskCompletion(
  input: PrepareTaskCompletionInput,
): Result<PreparedTaskCompletion, TaskLifecycleError> {
  if (!isDatedTaskOccurrence(input.occurrence)) {
    return err(invalidTransition(input.occurrence, 'set-completion'));
  }
  const date = input.occurrence.placement.date;
  const periodError = requireOpenSourcePeriod(input.period, date);
  if (periodError !== undefined) {
    return err(periodError);
  }
  if (
    input.membership.occurrenceId !== input.occurrence.id ||
    input.membership.date !== date ||
    input.membership.finalizedAt !== undefined
  ) {
    return err(invalidTransition(input.occurrence, 'set-completion'));
  }
  if (
    (input.completed && input.occurrence.completion === 'completed') ||
    (!input.completed && input.occurrence.completion === 'incomplete')
  ) {
    return err(invalidTransition(input.occurrence, 'set-completion'));
  }

  if (input.completed) {
    const occurrence: CompletedDatedTaskOccurrence = {
      ...occurrenceCommon(input.occurrence),
      state: 'active',
      placement: input.occurrence.placement,
      plannedDurationMinutes: input.occurrence.plannedDurationMinutes,
      ...(input.occurrence.dayPosition === undefined
        ? {}
        : { dayPosition: input.occurrence.dayPosition }),
      completion: 'completed',
      actualCompletedAt: input.occurredAt,
      revision: nextRevision(input.occurrence.revision),
    };
    const membership = toCompletedMembership(input.membership);
    return ok({
      occurrence,
      membership,
      event: {
        occurrenceId: occurrence.id,
        ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
        planEntryId: membership.id,
        effectiveDate: date,
        occurredAt: input.occurredAt,
        type: 'completion-checked',
        payload: { date },
      },
    });
  }

  const occurrence: IncompleteDatedTaskOccurrence = {
    ...occurrenceCommon(input.occurrence),
    state: 'active',
    placement: input.occurrence.placement,
    plannedDurationMinutes: input.occurrence.plannedDurationMinutes,
    ...(input.occurrence.dayPosition === undefined
      ? {}
      : { dayPosition: input.occurrence.dayPosition }),
    completion: 'incomplete',
    revision: nextRevision(input.occurrence.revision),
  };
  const membership = toPlannedMembership(input.membership);
  return ok({
    occurrence,
    membership,
    event: {
      occurrenceId: occurrence.id,
      ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
      planEntryId: membership.id,
      effectiveDate: date,
      occurredAt: input.occurredAt,
      type: 'completion-unchecked',
      payload: { date },
    },
  });
}

export interface PrepareTaskEditInput {
  readonly occurrence: TaskOccurrence;
  readonly period?: TaskPeriodState;
  readonly after: TaskValueSnapshot;
  readonly effectiveDate?: LocalDate;
  readonly occurredAt: Instant;
}

export function prepareTaskEdit(
  input: PrepareTaskEditInput,
): Result<PreparedTaskEdit, TaskLifecycleError> {
  if (input.occurrence.state !== 'active') {
    return err(invalidTransition(input.occurrence, 'edit'));
  }
  if (input.after.title.trim().length === 0) {
    return err(validationFailure('title', 'Task title is required'));
  }
  if (
    input.after.plannedDurationMinutes !== undefined &&
    !isPositiveInteger(input.after.plannedDurationMinutes)
  ) {
    return err(validationFailure('durationMinutes', 'Task duration must be positive'));
  }

  const before = occurrenceValueSnapshot(input.occurrence);
  if (isDatedTaskOccurrence(input.occurrence)) {
    const date = input.occurrence.placement.date;
    const periodError = requireOpenSourcePeriod(input.period, date);
    if (periodError !== undefined) {
      return err(periodError);
    }
    if (!isPositiveInteger(input.after.plannedDurationMinutes)) {
      return err(validationFailure('durationMinutes', 'Dated tasks require a positive duration'));
    }
    const common = {
      ...occurrenceCommon(input.occurrence),
      title: input.after.title,
      ...(input.after.notes === undefined ? {} : { notes: input.after.notes }),
      state: 'active' as const,
      placement: input.occurrence.placement,
      plannedDurationMinutes: input.after.plannedDurationMinutes,
      ...(input.occurrence.dayPosition === undefined
        ? {}
        : { dayPosition: input.occurrence.dayPosition }),
      revision: nextRevision(input.occurrence.revision),
    };
    const occurrence: DatedTaskOccurrence =
      input.occurrence.completion === 'completed'
        ? {
            ...common,
            completion: 'completed',
            actualCompletedAt: input.occurrence.actualCompletedAt,
          }
        : { ...common, completion: 'incomplete' };
    const after = occurrenceValueSnapshot(occurrence);
    return ok({
      occurrence,
      event: {
        occurrenceId: occurrence.id,
        ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
        effectiveDate: date,
        occurredAt: input.occurredAt,
        type: 'edit',
        payload: { before, after },
      },
    });
  }

  if (input.effectiveDate === undefined) {
    return err(validationFailure('effectiveDate', 'Backlog edit effective date is required'));
  }
  const occurrence: BacklogTaskOccurrence = {
    ...occurrenceCommon(input.occurrence),
    title: input.after.title,
    ...(input.after.notes === undefined ? {} : { notes: input.after.notes }),
    state: 'active',
    placement: { kind: 'backlog' },
    ...(input.after.plannedDurationMinutes === undefined
      ? {}
      : { plannedDurationMinutes: input.after.plannedDurationMinutes }),
    revision: nextRevision(input.occurrence.revision),
  };
  return ok({
    occurrence,
    event: {
      occurrenceId: occurrence.id,
      ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
      effectiveDate: input.effectiveDate,
      occurredAt: input.occurredAt,
      type: 'edit',
      payload: { before, after: occurrenceValueSnapshot(occurrence) },
    },
  });
}

export interface PrepareTaskMoveToDateInput {
  readonly occurrence: TaskOccurrence;
  readonly memberships: readonly TaskPlanEntry[];
  readonly sourcePeriod?: TaskPeriodState;
  readonly destinationPeriod: TaskPeriodState;
  readonly destinationDate: LocalDate;
  readonly durationMinutes: number;
  readonly dayPosition: number;
  readonly destinationPlanEntryId: TaskPlanEntryId;
  readonly occurredAt: Instant;
}

export function prepareTaskMoveToDate(
  input: PrepareTaskMoveToDateInput,
): Result<PreparedTaskMoveToDate, TaskLifecycleError> {
  if (input.occurrence.state !== 'active') {
    return err(invalidTransition(input.occurrence, 'move-to-date'));
  }
  if (!isPositiveInteger(input.durationMinutes) || !isNonNegativeInteger(input.dayPosition)) {
    return err(
      validationFailure(
        !isPositiveInteger(input.durationMinutes) ? 'durationMinutes' : 'dayPosition',
        !isPositiveInteger(input.durationMinutes)
          ? 'Dated tasks require a positive duration'
          : 'Dated task position must be a non-negative integer',
      ),
    );
  }
  const destinationError = requireOpenDestination(input.destinationPeriod, input.destinationDate);
  if (destinationError !== undefined) {
    return err(destinationError);
  }

  let sourceMembership: MovedTaskPlanEntry | undefined;
  let eventType: 'move-to-date' | 'schedule-from-backlog';
  let from: TaskOccurrence['placement'];
  let sourceDate: LocalDate | undefined;
  if (isDatedTaskOccurrence(input.occurrence)) {
    sourceDate = input.occurrence.placement.date;
    if (input.occurrence.completion === 'completed') {
      return err({
        code: 'TaskMustBeIncompleteToMove',
        occurrenceId: input.occurrence.id,
      });
    }
    const sourceError = requireOpenSourcePeriod(input.sourcePeriod, sourceDate);
    if (sourceError !== undefined) {
      return err(sourceError);
    }
    if (sourceDate === input.destinationDate) {
      return err(invalidTransition(input.occurrence, 'move-to-current-date'));
    }
    const currentResult = requireUniqueMembership(
      input.memberships,
      input.occurrence,
      sourceDate,
      'move-to-date',
    );
    if (!currentResult.ok) {
      return currentResult;
    }
    sourceMembership = {
      id: currentResult.value.id,
      occurrenceId: currentResult.value.occurrenceId,
      date: currentResult.value.date,
      weekStart: currentResult.value.weekStart,
      plannedSnapshot: currentResult.value.plannedSnapshot,
      enteredAt: currentResult.value.enteredAt,
      outcome: 'moved',
      destination: { kind: 'day', date: input.destinationDate },
    };
    eventType = 'move-to-date';
    from = input.occurrence.placement;
  } else {
    eventType = 'schedule-from-backlog';
    from = input.occurrence.placement;
  }

  const duration = input.durationMinutes as DurationMinutes;
  const position = input.dayPosition as DayPosition;
  const occurrence: IncompleteDatedTaskOccurrence = {
    ...occurrenceCommon(input.occurrence),
    state: 'active',
    placement: { kind: 'day', date: input.destinationDate },
    plannedDurationMinutes: duration,
    dayPosition: position,
    completion: 'incomplete',
    revision: nextRevision(input.occurrence.revision),
  };
  const destinationMatches = matchingMemberships(
    input.memberships,
    input.occurrence,
    input.destinationDate,
  );
  if (destinationMatches.length > 1) {
    return err(invalidTransition(input.occurrence, 'move-to-date'));
  }
  const existingDestination = destinationMatches[0];
  if (existingDestination?.finalizedAt !== undefined) {
    return err({ code: 'PeriodImmutable', date: input.destinationDate });
  }
  if (
    existingDestination === undefined &&
    input.memberships.some((membership) => membership.id === input.destinationPlanEntryId)
  ) {
    return err(validationFailure('destinationPlanEntryId', 'Task membership ID already exists'));
  }
  const destinationMembership: PlannedTaskPlanEntry =
    existingDestination === undefined
      ? {
          id: input.destinationPlanEntryId,
          occurrenceId: occurrence.id,
          date: input.destinationDate,
          weekStart: startOfWeek(input.destinationDate),
          plannedSnapshot: plannedSnapshot(occurrence, duration),
          enteredAt: input.occurredAt,
          outcome: 'planned',
        }
      : toPlannedMembership(existingDestination, plannedSnapshot(occurrence, duration));

  let memberships = input.memberships;
  if (sourceMembership !== undefined) {
    memberships = replaceMembership(memberships, sourceMembership);
  }
  memberships =
    existingDestination === undefined
      ? [...memberships, destinationMembership]
      : replaceMembership(memberships, destinationMembership);

  const eventCommon = {
    occurrenceId: occurrence.id,
    ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
    planEntryId: sourceMembership?.id ?? destinationMembership.id,
    effectiveDate: sourceDate ?? input.destinationDate,
    occurredAt: input.occurredAt,
  } as const;
  const event: TaskEventEffect<'move-to-date' | 'schedule-from-backlog'> =
    eventType === 'move-to-date'
      ? {
          ...eventCommon,
          type: 'move-to-date',
          payload: { from, destination: occurrence.placement },
        }
      : {
          ...eventCommon,
          type: 'schedule-from-backlog',
          payload: { from: { kind: 'backlog' }, destination: occurrence.placement },
        };

  return ok({
    occurrence,
    memberships,
    ...(sourceMembership === undefined ? {} : { sourceMembership }),
    destinationMembership,
    destinationCreated: existingDestination === undefined,
    event,
  });
}

export interface PrepareTaskMoveToBacklogInput {
  readonly occurrence: TaskOccurrence;
  readonly memberships: readonly TaskPlanEntry[];
  readonly sourcePeriod: TaskPeriodState;
  readonly occurredAt: Instant;
}

export function prepareTaskMoveToBacklog(
  input: PrepareTaskMoveToBacklogInput,
): Result<PreparedTaskMoveToBacklog, TaskLifecycleError> {
  if (!isDatedTaskOccurrence(input.occurrence)) {
    return err(invalidTransition(input.occurrence, 'move-to-backlog'));
  }
  if (input.occurrence.completion === 'completed') {
    return err({
      code: 'TaskMustBeIncompleteToMove',
      occurrenceId: input.occurrence.id,
    });
  }
  const sourceDate = input.occurrence.placement.date;
  const sourceError = requireOpenSourcePeriod(input.sourcePeriod, sourceDate);
  if (sourceError !== undefined) {
    return err(sourceError);
  }
  const currentResult = requireUniqueMembership(
    input.memberships,
    input.occurrence,
    sourceDate,
    'move-to-backlog',
  );
  if (!currentResult.ok) {
    return currentResult;
  }
  const sourceMembership: BackloggedTaskPlanEntry = {
    id: currentResult.value.id,
    occurrenceId: currentResult.value.occurrenceId,
    date: currentResult.value.date,
    weekStart: currentResult.value.weekStart,
    plannedSnapshot: currentResult.value.plannedSnapshot,
    enteredAt: currentResult.value.enteredAt,
    outcome: 'backlogged',
    destination: { kind: 'backlog' },
  };
  const occurrence: BacklogTaskOccurrence = {
    ...occurrenceCommon(input.occurrence),
    state: 'active',
    placement: { kind: 'backlog' },
    plannedDurationMinutes: input.occurrence.plannedDurationMinutes,
    revision: nextRevision(input.occurrence.revision),
  };
  return ok({
    occurrence,
    memberships: replaceMembership(input.memberships, sourceMembership),
    sourceMembership,
    event: {
      occurrenceId: occurrence.id,
      ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
      planEntryId: sourceMembership.id,
      effectiveDate: sourceDate,
      occurredAt: input.occurredAt,
      type: 'move-to-backlog',
      payload: {
        from: input.occurrence.placement,
        destination: { kind: 'backlog' },
      },
    },
  });
}

export interface PrepareTaskDeletionInput {
  readonly occurrence: TaskOccurrence;
  readonly membershipPeriods: readonly TaskMembershipPeriodState[];
  readonly effectiveDate: LocalDate;
  readonly occurredAt: Instant;
}

export function prepareTaskDeletion(
  input: PrepareTaskDeletionInput,
): Result<PreparedTaskDeletion, TaskLifecycleError> {
  if (input.occurrence.state !== 'active') {
    return err(invalidTransition(input.occurrence, 'delete'));
  }
  const membershipDates = new Set<LocalDate>();
  for (const item of input.membershipPeriods) {
    if (
      item.membership.occurrenceId !== input.occurrence.id ||
      membershipDates.has(item.membership.date)
    ) {
      return err(invalidTransition(input.occurrence, 'delete'));
    }
    membershipDates.add(item.membership.date);
    const ownershipError = validatePeriodOwnership(item.period, item.membership.date);
    if (ownershipError !== undefined) {
      return err(ownershipError);
    }
  }

  if (isDatedTaskOccurrence(input.occurrence)) {
    const currentDate = input.occurrence.placement.date;
    const current = input.membershipPeriods.find((item) => item.membership.date === currentDate);
    const sourceError = requireOpenSourcePeriod(current?.period, currentDate);
    if (sourceError !== undefined) {
      return err(sourceError);
    }
    if (current?.membership.finalizedAt !== undefined) {
      return err({ code: 'PeriodImmutable', date: current.membership.date });
    }
  }

  const affectedOpenDates: LocalDate[] = [];
  const memberships = input.membershipPeriods.map(({ membership, period }) => {
    if (period.day.status !== 'open' || period.week.status !== 'open') {
      return membership;
    }
    affectedOpenDates.push(membership.date);
    const deleted: DeletedTaskPlanEntry = {
      id: membership.id,
      occurrenceId: membership.occurrenceId,
      date: membership.date,
      weekStart: membership.weekStart,
      plannedSnapshot: membership.plannedSnapshot,
      enteredAt: membership.enteredAt,
      outcome: 'deleted',
      finalizedAt: input.occurredAt,
    };
    return deleted;
  });
  affectedOpenDates.sort((left, right) => left.localeCompare(right));

  const occurrence: DeletedTaskOccurrence = {
    ...occurrenceCommon(input.occurrence),
    state: 'deleted',
    placement: { kind: 'none' },
    ...(input.occurrence.plannedDurationMinutes === undefined
      ? {}
      : { plannedDurationMinutes: input.occurrence.plannedDurationMinutes }),
    revision: nextRevision(input.occurrence.revision),
  };
  return ok({
    occurrence,
    memberships,
    affectedOpenDates,
    event: {
      occurrenceId: occurrence.id,
      ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
      effectiveDate: input.effectiveDate,
      occurredAt: input.occurredAt,
      type: 'delete',
      payload: { previousPlacement: input.occurrence.placement },
    },
  });
}
