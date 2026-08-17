import { nextRevision, revision, type DayPosition, type TaskOccurrenceId } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { Day, OpenDay } from '@/entities/planning/model/day';
import type {
  CreateTaskInput,
  DeleteTaskOccurrenceInput,
  EditTaskOccurrenceInput,
  MoveTaskToBacklogInput,
  MoveTaskToDateInput,
  ReorderDatedTasksInput,
  SetTaskCompletionInput,
} from '@/entities/planning/model/planning-repository';
import { validateTaskTimeRange } from '@/entities/planning/model/task';
import type {
  BacklogTaskOccurrence,
  DeletedTaskOccurrence,
  IncompleteDatedTaskOccurrence,
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
} from '@/entities/planning/model/task';
import type { OpenWeek, Week } from '@/entities/planning/model/week';

import {
  allocateNextCreationSequence,
  allocateNextEventSequence,
  isDayPositionValue,
  isPositiveDuration,
  taskValueSnapshot,
} from './audit';
import { requireOpenDay, requireOpenWeek, type RepositoryContext } from './context';
import { canonicalRequiredText, DomainFailure, revisionGuard } from './errors';
import { plannedEntry, resolveDestinationMembership } from './plan-entries';
import {
  getDay,
  getPlanEntriesByOccurrence,
  getPlanEntryByOccurrenceDate,
  getTaskOccurrence,
  getTaskOccurrencesPlacedOn,
  getWeek,
  insertPlanEntry,
  insertTaskEvent,
  insertTaskOccurrence,
  putDay,
  putPlanEntry,
  putTaskOccurrence,
  putWeek,
} from './store';
import type { CommandReceipt, PlanningTransaction } from './transaction';

async function requireOccurrence(
  trx: PlanningTransaction,
  occurrenceId: TaskOccurrenceId,
): Promise<TaskOccurrence> {
  const occurrence = await getTaskOccurrence(trx, occurrenceId);
  if (occurrence === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'TaskOccurrence', id: occurrenceId });
  }

  return occurrence;
}

async function requireDay(trx: PlanningTransaction, date: LocalDate): Promise<Day> {
  const day = await getDay(trx, date);
  if (day === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: date });
  }

  return day;
}

async function requireOwningPeriods(
  trx: PlanningTransaction,
  date: LocalDate,
): Promise<{ readonly day: OpenDay; readonly week: OpenWeek }> {
  const day = await requireDay(trx, date);
  requireOpenDay(day);
  const week = await getWeek(trx, day.weekStart);
  requireOpenWeek(week, day.weekStart);
  return { day, week };
}

/** Bumps the aggregates a dated change invalidates, guarded on what was read. */
async function bumpPeriods(
  trx: PlanningTransaction,
  days: readonly OpenDay[],
  weeks: readonly OpenWeek[],
): Promise<void> {
  for (const day of days) {
    await putDay(trx, { ...day, revision: nextRevision(day.revision) }, day.revision);
  }
  for (const week of weeks) {
    await putWeek(trx, { ...week, revision: nextRevision(week.revision) }, week.revision);
  }
}

export async function createTask(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: CreateTaskInput,
): Promise<CommandReceipt<TaskOccurrenceId>> {
  const title = canonicalRequiredText(input.title, 'title');
  if (input.placement.kind === 'day' && !isPositiveDuration(input.durationMinutes)) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'durationMinutes', message: 'Dated tasks require a positive duration' }],
    });
  }
  if (input.placement.kind === 'day' && !isDayPositionValue(input.dayPosition)) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'dayPosition', message: 'Dated tasks require a position' }],
    });
  }
  if (input.durationMinutes !== undefined && !isPositiveDuration(input.durationMinutes)) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'durationMinutes', message: 'Duration must be positive' }],
    });
  }
  const timeValidation = validateTaskTimeRange(input.startTime, input.endTime);
  if (!timeValidation.ok) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'endTime', message: 'End time must be after start time' }],
    });
  }
  const timeRange = timeValidation.value;

  const occurrenceId = ctx.nextId<'task-occurrence'>();
  const createdSequenceValue = await allocateNextCreationSequence(trx);
  const occurredAt = ctx.clock.now();
  const affectedDates: LocalDate[] = [];
  const affectedWeeks: LocalDate[] = [];

  let occurrence: TaskOccurrence;
  let planEntry: TaskPlanEntry | undefined;

  if (input.placement.kind === 'day') {
    const day = await requireDay(trx, input.placement.date);
    const week = await getWeek(trx, day.weekStart);
    requireOpenDay(day);
    requireOpenWeek(week, day.weekStart);

    const duration = input.durationMinutes;
    const position = input.dayPosition;
    if (!isPositiveDuration(duration) || !isDayPositionValue(position)) {
      throw new Error('Validated dated task values disappeared');
    }

    occurrence = {
      id: occurrenceId,
      title,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...timeRange,
      isException: false,
      createdSequence: createdSequenceValue,
      revision: revision(0),
      state: 'active',
      placement: input.placement,
      plannedDurationMinutes: duration,
      dayPosition: position,
      completion: 'incomplete',
    };
    planEntry = {
      id: ctx.nextId<'task-plan-entry'>(),
      occurrenceId,
      date: input.placement.date,
      weekStart: day.weekStart,
      plannedSnapshot: {
        title,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        plannedDurationMinutes: duration,
        ...timeRange,
      },
      enteredAt: occurredAt,
      outcome: 'planned',
    };

    await bumpPeriods(trx, [day], [week]);
    affectedDates.push(day.date);
    affectedWeeks.push(day.weekStart);
  } else {
    occurrence = {
      id: occurrenceId,
      title,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...timeRange,
      isException: false,
      createdSequence: createdSequenceValue,
      revision: revision(0),
      state: 'active',
      placement: { kind: 'backlog' },
      ...(input.durationMinutes === undefined
        ? {}
        : { plannedDurationMinutes: input.durationMinutes }),
    };
  }

  await insertTaskOccurrence(trx, occurrence);
  if (planEntry !== undefined) {
    await insertPlanEntry(trx, planEntry);
  }

  const sequence = await allocateNextEventSequence(trx);
  const event: TaskEvent = {
    id: ctx.nextId<'task-event'>(),
    sequence,
    occurrenceId,
    ...(planEntry === undefined ? {} : { planEntryId: planEntry.id }),
    effectiveDate:
      input.placement.kind === 'day' ? input.placement.date : ctx.clock.currentLocalDate(),
    occurredAt,
    type: 'create',
    payload: {
      created: taskValueSnapshot(occurrence),
      placement: occurrence.placement,
    },
  };
  await insertTaskEvent(trx, event);

  return { value: occurrenceId, affectedDates, affectedWeeks };
}

export async function editTaskOccurrence(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: EditTaskOccurrenceInput,
): Promise<CommandReceipt<undefined>> {
  const occurrence = await requireOccurrence(trx, input.occurrenceId);
  const guard = revisionGuard(occurrence.revision, input.expectedRevision);
  if (guard !== undefined) throw new DomainFailure(guard);
  if (occurrence.state === 'deleted' || occurrence.state === 'finalized') {
    throw new DomainFailure({
      code: 'InvalidTransition',
      entity: 'TaskOccurrence',
      currentState: occurrence.state,
      attemptedTransition: 'edit',
    });
  }

  let title = occurrence.title;
  if (input.title !== undefined) {
    title = canonicalRequiredText(input.title, 'title');
  }
  const duration = input.durationMinutes ?? occurrence.plannedDurationMinutes;
  if (occurrence.placement.kind === 'day' && !isPositiveDuration(duration)) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'durationMinutes', message: 'Dated tasks require a positive duration' }],
    });
  }
  if (duration !== undefined && !isPositiveDuration(duration)) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'durationMinutes', message: 'Duration must be positive' }],
    });
  }

  const nextStartTime = input.startTime === null ? undefined : input.startTime;
  const nextEndTime = input.endTime === null ? undefined : input.endTime;
  const startTime = input.startTime === undefined ? occurrence.startTime : nextStartTime;
  const endTime = input.endTime === undefined ? occurrence.endTime : nextEndTime;
  const timeValidation = validateTaskTimeRange(startTime, endTime);
  if (!timeValidation.ok) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'endTime', message: 'End time must be after start time' }],
    });
  }

  const updated = {
    ...occurrence,
    title,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(duration === undefined ? {} : { plannedDurationMinutes: duration }),
    startTime: timeValidation.value.startTime,
    endTime: timeValidation.value.endTime,
    isException: occurrence.seriesId === undefined ? occurrence.isException : true,
    revision: nextRevision(occurrence.revision),
  } as TaskOccurrence;

  const affectedDates: LocalDate[] = [];
  const affectedWeeks: LocalDate[] = [];
  if (occurrence.placement.kind === 'day') {
    const { day, week } = await requireOwningPeriods(trx, occurrence.placement.date);
    await bumpPeriods(trx, [day], [week]);
    affectedDates.push(day.date);
    affectedWeeks.push(day.weekStart);
  }

  await putTaskOccurrence(trx, updated, occurrence.revision);

  const sequence = await allocateNextEventSequence(trx);
  const eventBase = {
    id: ctx.nextId<'task-event'>(),
    sequence,
    occurrenceId: occurrence.id,
    ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
    effectiveDate:
      occurrence.placement.kind === 'day'
        ? occurrence.placement.date
        : ctx.clock.currentLocalDate(),
    occurredAt: ctx.clock.now(),
  };
  const event: TaskEvent =
    occurrence.seriesId === undefined
      ? {
          ...eventBase,
          type: 'edit',
          payload: {
            before: taskValueSnapshot(occurrence),
            after: taskValueSnapshot(updated),
          },
        }
      : {
          ...eventBase,
          seriesId: occurrence.seriesId,
          type: 'occurrence-exception',
          payload: {
            before: taskValueSnapshot(occurrence),
            after: taskValueSnapshot(updated),
          },
        };
  await insertTaskEvent(trx, event);

  return { value: undefined, affectedDates, affectedWeeks };
}

export async function setTaskCompletion(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: SetTaskCompletionInput,
): Promise<CommandReceipt<undefined>> {
  const occurrence = await requireOccurrence(trx, input.occurrenceId);
  const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
  if (revisionError !== undefined) throw new DomainFailure(revisionError);

  if (
    occurrence.state !== 'active' ||
    occurrence.placement.kind !== 'day' ||
    !('completion' in occurrence) ||
    occurrence.placement.date !== input.date
  ) {
    throw new DomainFailure({
      code: 'InvalidTransition',
      entity: 'TaskOccurrence',
      currentState: `${occurrence.state}/${occurrence.placement.kind}`,
      attemptedTransition: input.completed ? 'completion-checked' : 'completion-unchecked',
    });
  }
  if (
    (input.completed && occurrence.completion === 'completed') ||
    (!input.completed && occurrence.completion === 'incomplete')
  ) {
    throw new DomainFailure({
      code: 'InvalidTransition',
      entity: 'TaskOccurrence',
      currentState: occurrence.completion,
      attemptedTransition: input.completed ? 'completion-checked' : 'completion-unchecked',
    });
  }

  const { day, week } = await requireOwningPeriods(trx, input.date);
  const entry = await getPlanEntryByOccurrenceDate(trx, occurrence.id, input.date);
  if (entry === undefined) {
    throw new DomainFailure({
      code: 'NotFound',
      entity: 'TaskPlanEntry',
      id: `${occurrence.id}/${input.date}`,
    });
  }

  const occurredAt = ctx.clock.now();
  let updated: TaskOccurrence;
  if (input.completed) {
    updated = {
      ...occurrence,
      completion: 'completed',
      actualCompletedAt: occurredAt,
      revision: nextRevision(occurrence.revision),
    };
  } else {
    if (occurrence.completion !== 'completed') {
      throw new Error('Validated completed occurrence disappeared');
    }
    const { actualCompletedAt: _actualCompletedAt, ...withoutActual } = occurrence;
    void _actualCompletedAt;
    updated = {
      ...withoutActual,
      completion: 'incomplete',
      revision: nextRevision(occurrence.revision),
    };
  }

  await putTaskOccurrence(trx, updated, occurrence.revision);
  await putPlanEntry(
    trx,
    input.completed ? { ...plannedEntry(entry), outcome: 'completed' } : plannedEntry(entry),
  );
  await bumpPeriods(trx, [day], [week]);

  const sequence = await allocateNextEventSequence(trx);
  const event: TaskEvent = {
    id: ctx.nextId<'task-event'>(),
    sequence,
    occurrenceId: occurrence.id,
    planEntryId: entry.id,
    effectiveDate: input.date,
    occurredAt,
    type: input.completed ? 'completion-checked' : 'completion-unchecked',
    payload: { date: input.date },
  };
  await insertTaskEvent(trx, event);

  return { value: undefined, affectedDates: [day.date], affectedWeeks: [day.weekStart] };
}

export async function moveTaskToDate(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: MoveTaskToDateInput,
): Promise<CommandReceipt<undefined>> {
  if (!isPositiveDuration(input.durationMinutes)) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'durationMinutes', message: 'Dated tasks require a positive duration' }],
    });
  }
  if (!isDayPositionValue(input.dayPosition)) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'dayPosition', message: 'Dated tasks require a position' }],
    });
  }

  const occurrence = await requireOccurrence(trx, input.occurrenceId);
  const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
  if (revisionError !== undefined) throw new DomainFailure(revisionError);
  if (occurrence.state !== 'active') {
    throw new DomainFailure({
      code: 'InvalidTransition',
      entity: 'TaskOccurrence',
      currentState: occurrence.state,
      attemptedTransition: 'move-to-date',
    });
  }
  if (
    occurrence.placement.kind === 'day' &&
    (!('completion' in occurrence) || occurrence.completion !== 'incomplete')
  ) {
    throw new DomainFailure({
      code: 'TaskMustBeIncompleteToMove',
      occurrenceId: occurrence.id,
    });
  }
  if (occurrence.placement.kind === 'day' && occurrence.placement.date === input.destinationDate) {
    throw new DomainFailure({
      code: 'InvalidTransition',
      entity: 'TaskOccurrence',
      currentState: `day:${occurrence.placement.date}`,
      attemptedTransition: `move-to-same-date:${input.destinationDate}`,
    });
  }

  const destinationDay = await getDay(trx, input.destinationDate);
  if (destinationDay === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: input.destinationDate });
  }
  if (destinationDay.status !== 'open') {
    throw new DomainFailure({ code: 'MoveTargetClosed', destinationDate: input.destinationDate });
  }
  const destinationWeek = await getWeek(trx, destinationDay.weekStart);
  if (destinationWeek?.status !== 'open') {
    throw new DomainFailure({ code: 'MoveTargetClosed', destinationDate: input.destinationDate });
  }

  let sourceDay: OpenDay | undefined;
  let sourceWeek: OpenWeek | undefined;
  let sourceEntry: TaskPlanEntry | undefined;
  if (occurrence.placement.kind === 'day') {
    const source = await requireDay(trx, occurrence.placement.date);
    requireOpenDay(source);
    sourceDay = source;
    const owningWeek = await getWeek(trx, source.weekStart);
    requireOpenWeek(owningWeek, source.weekStart);
    sourceWeek = owningWeek;
    sourceEntry = await getPlanEntryByOccurrenceDate(trx, occurrence.id, source.date);
    if (sourceEntry === undefined) {
      throw new DomainFailure({
        code: 'NotFound',
        entity: 'TaskPlanEntry',
        id: `${occurrence.id}/${source.date}`,
      });
    }
  }

  const occurredAt = ctx.clock.now();
  const destinationEntry = await resolveDestinationMembership(ctx, trx, {
    occurrence,
    destinationDate: input.destinationDate,
    destinationWeekStart: destinationDay.weekStart,
    durationMinutes: input.durationMinutes,
    enteredAt: occurredAt,
  });

  if (sourceEntry !== undefined) {
    await putPlanEntry(trx, {
      ...sourceEntry,
      outcome: 'moved',
      destination: { kind: 'day', date: input.destinationDate },
    });
  }
  await putPlanEntry(trx, destinationEntry);

  const updated: IncompleteDatedTaskOccurrence = {
    ...occurrence,
    state: 'active',
    placement: { kind: 'day', date: input.destinationDate },
    plannedDurationMinutes: input.durationMinutes,
    dayPosition: input.dayPosition,
    completion: 'incomplete',
    revision: nextRevision(occurrence.revision),
  };
  await putTaskOccurrence(trx, updated, occurrence.revision);

  const affectedDays = new Map<LocalDate, OpenDay>();
  if (sourceDay !== undefined) affectedDays.set(sourceDay.date, sourceDay);
  affectedDays.set(destinationDay.date, destinationDay);
  const affectedWeekRecords = new Map<LocalDate, OpenWeek>();
  if (sourceWeek !== undefined) affectedWeekRecords.set(sourceWeek.startDate, sourceWeek);
  affectedWeekRecords.set(destinationWeek.startDate, destinationWeek);
  await bumpPeriods(trx, [...affectedDays.values()], [...affectedWeekRecords.values()]);

  const sequence = await allocateNextEventSequence(trx);
  const event: TaskEvent =
    occurrence.placement.kind === 'backlog'
      ? {
          id: ctx.nextId<'task-event'>(),
          sequence,
          occurrenceId: occurrence.id,
          planEntryId: destinationEntry.id,
          effectiveDate: input.destinationDate,
          occurredAt,
          type: 'schedule-from-backlog',
          payload: {
            from: { kind: 'backlog' },
            destination: { kind: 'day', date: input.destinationDate },
          },
        }
      : {
          id: ctx.nextId<'task-event'>(),
          sequence,
          occurrenceId: occurrence.id,
          planEntryId: destinationEntry.id,
          effectiveDate: input.destinationDate,
          occurredAt,
          type: 'move-to-date',
          payload: {
            from: occurrence.placement,
            destination: { kind: 'day', date: input.destinationDate },
          },
        };
  await insertTaskEvent(trx, event);

  return {
    value: undefined,
    affectedDates: [...affectedDays.keys()],
    affectedWeeks: [...affectedWeekRecords.keys()],
  };
}

export async function moveTaskToBacklog(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: MoveTaskToBacklogInput,
): Promise<CommandReceipt<undefined>> {
  const occurrence = await requireOccurrence(trx, input.occurrenceId);
  const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
  if (revisionError !== undefined) throw new DomainFailure(revisionError);
  if (
    occurrence.state !== 'active' ||
    occurrence.placement.kind !== 'day' ||
    !('completion' in occurrence)
  ) {
    throw new DomainFailure({
      code: 'InvalidTransition',
      entity: 'TaskOccurrence',
      currentState: `${occurrence.state}/${occurrence.placement.kind}`,
      attemptedTransition: 'move-to-backlog',
    });
  }
  if (occurrence.completion !== 'incomplete') {
    throw new DomainFailure({ code: 'TaskMustBeIncompleteToMove', occurrenceId: occurrence.id });
  }

  const { day, week } = await requireOwningPeriods(trx, occurrence.placement.date);
  const entry = await getPlanEntryByOccurrenceDate(trx, occurrence.id, day.date);
  if (entry === undefined) {
    throw new DomainFailure({
      code: 'NotFound',
      entity: 'TaskPlanEntry',
      id: `${occurrence.id}/${day.date}`,
    });
  }

  const updated: BacklogTaskOccurrence = {
    ...occurrence,
    state: 'active',
    placement: { kind: 'backlog' },
    revision: nextRevision(occurrence.revision),
  };
  await putTaskOccurrence(trx, updated, occurrence.revision);
  await putPlanEntry(trx, {
    ...entry,
    outcome: 'backlogged',
    destination: { kind: 'backlog' },
  });
  await bumpPeriods(trx, [day], [week]);

  const sequence = await allocateNextEventSequence(trx);
  const event: TaskEvent = {
    id: ctx.nextId<'task-event'>(),
    sequence,
    occurrenceId: occurrence.id,
    planEntryId: entry.id,
    effectiveDate: day.date,
    occurredAt: ctx.clock.now(),
    type: 'move-to-backlog',
    payload: {
      from: { kind: 'day', date: day.date },
      destination: { kind: 'backlog' },
    },
  };
  await insertTaskEvent(trx, event);

  return { value: undefined, affectedDates: [day.date], affectedWeeks: [day.weekStart] };
}

export async function deleteTaskOccurrence(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: DeleteTaskOccurrenceInput,
): Promise<CommandReceipt<undefined>> {
  const occurrence = await requireOccurrence(trx, input.occurrenceId);
  const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
  if (revisionError !== undefined) throw new DomainFailure(revisionError);
  if (occurrence.state === 'deleted' || occurrence.state === 'finalized') {
    throw new DomainFailure({
      code: 'InvalidTransition',
      entity: 'TaskOccurrence',
      currentState: occurrence.state,
      attemptedTransition: 'delete',
    });
  }

  const entries = await getPlanEntriesByOccurrence(trx, occurrence.id);
  const affectedDays = new Map<LocalDate, OpenDay>();
  const affectedWeeks = new Map<LocalDate, OpenWeek>();

  for (const entry of entries) {
    const day: Day | undefined = await getDay(trx, entry.date);
    if (day === undefined || day.status === 'closed') continue;
    affectedDays.set(day.date, day);
    const week: Week | undefined = await getWeek(trx, day.weekStart);
    if (week?.status === 'open') {
      affectedWeeks.set(week.startDate, week);
    }
    await putPlanEntry(trx, {
      id: entry.id,
      occurrenceId: entry.occurrenceId,
      date: entry.date,
      weekStart: entry.weekStart,
      plannedSnapshot: entry.plannedSnapshot,
      enteredAt: entry.enteredAt,
      outcome: 'deleted',
    });
  }

  await bumpPeriods(trx, [...affectedDays.values()], [...affectedWeeks.values()]);

  const deleted: DeletedTaskOccurrence = {
    id: occurrence.id,
    ...(occurrence.seriesId === undefined ? {} : { seriesId: occurrence.seriesId }),
    ...(occurrence.nominalDate === undefined ? {} : { nominalDate: occurrence.nominalDate }),
    ...(occurrence.ruleRevision === undefined ? {} : { ruleRevision: occurrence.ruleRevision }),
    title: occurrence.title,
    ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
    isException: occurrence.isException,
    createdSequence: occurrence.createdSequence,
    revision: nextRevision(occurrence.revision),
    state: 'deleted',
    placement: { kind: 'none' },
    ...(occurrence.plannedDurationMinutes === undefined
      ? {}
      : { plannedDurationMinutes: occurrence.plannedDurationMinutes }),
  };
  await putTaskOccurrence(trx, deleted, occurrence.revision);

  const sequence = await allocateNextEventSequence(trx);
  const event: TaskEvent = {
    id: ctx.nextId<'task-event'>(),
    sequence,
    occurrenceId: occurrence.id,
    effectiveDate: ctx.clock.currentLocalDate(),
    occurredAt: ctx.clock.now(),
    type: 'delete',
    payload: { previousPlacement: occurrence.placement },
  };
  await insertTaskEvent(trx, event);

  return {
    value: undefined,
    affectedDates: [...affectedDays.keys()],
    affectedWeeks: [...affectedWeeks.keys()],
  };
}

export async function reorderDatedTasks(
  _ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: ReorderDatedTasksInput,
): Promise<CommandReceipt<undefined>> {
  const day = await requireDay(trx, input.date);
  requireOpenDay(day, input.expectedDayRevision);
  const week = await getWeek(trx, day.weekStart);
  requireOpenWeek(week, day.weekStart);

  const current = (await getTaskOccurrencesPlacedOn(trx, input.date)).filter(
    (occurrence) =>
      occurrence.state === 'active' &&
      occurrence.placement.kind === 'day' &&
      occurrence.placement.date === input.date,
  );
  const byId = new Map(current.map((occurrence) => [occurrence.id, occurrence]));

  if (
    input.orderedOccurrenceIds.length !== current.length ||
    new Set(input.orderedOccurrenceIds).size !== input.orderedOccurrenceIds.length ||
    input.orderedOccurrenceIds.some((id) => !byId.has(id))
  ) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [
        {
          field: 'orderedOccurrenceIds',
          message: 'Dated order must contain every current task once',
        },
      ],
    });
  }

  for (const [position, occurrenceId] of input.orderedOccurrenceIds.entries()) {
    const occurrence = byId.get(occurrenceId);
    if (occurrence?.state !== 'active' || occurrence.placement.kind !== 'day') {
      throw new Error('Validated dated occurrence is missing');
    }
    await putTaskOccurrence(
      trx,
      {
        ...occurrence,
        dayPosition: position as DayPosition,
        revision: nextRevision(occurrence.revision),
      },
      occurrence.revision,
    );
  }

  await bumpPeriods(trx, [day], [week]);

  return { value: undefined, affectedDates: [input.date], affectedWeeks: [day.weekStart] };
}
