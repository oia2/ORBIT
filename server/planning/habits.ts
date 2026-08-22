import {
  nextRevision,
  revision,
  type DurationMinutes,
  type HabitDefinitionId,
  type Revision,
} from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { Day, OpenDay } from '@/entities/planning/model/day';
import {
  clearHabitOutcome as prepareHabitOutcomeClear,
  correctBoundaryMissToCompleted as prepareBoundaryMissCorrection,
  deleteHabitOccurrence as prepareHabitOccurrenceDeletion,
  recordHabitOutcome as prepareHabitOutcome,
  type HabitDefinition,
  type HabitOccurrence,
} from '@/entities/planning/model/habit';
import type {
  ClearHabitOutcomeInput,
  CorrectBoundaryMissInput,
  CreateHabitDefinitionInput,
  DeleteHabitOccurrenceInput,
  EditHabitOccurrenceInput,
  RecordHabitOutcomeInput,
  StopHabitDefinitionInput,
  UpdateHabitDurationInput,
  UpdateHabitRuleInput,
} from '@/entities/planning/model/planning-repository';
import {
  applyRecurrenceRuleChange,
  createInitialRecurrenceVersion,
  stopRecurrence,
  validateRecurrenceRule,
} from '@/entities/planning/model/recurrence';
import type { OpenWeek } from '@/entities/planning/model/week';

import { requireOpenDay, requireOpenWeek, type RepositoryContext } from './context';
import { isPositiveDuration } from './audit';
import {
  canonicalRequiredText,
  DomainFailure,
  habitTransitionFailure,
  recurrenceValidationFailure,
  revisionGuard,
} from './errors';
import {
  getDay,
  getHabitDefinition,
  getHabitOccurrence,
  getOpenHabitOccurrencesByDefinition,
  getWeek,
  insertHabitDefinition,
  putDay,
  putHabitDefinition,
  putHabitOccurrence,
  putWeek,
} from './store';
import type { CommandReceipt, PlanningTransaction } from './transaction';

export async function createHabitDefinition(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: CreateHabitDefinitionInput,
): Promise<CommandReceipt<HabitDefinitionId>> {
  const title = canonicalRequiredText(input.title, 'title');
  const validation = validateRecurrenceRule(input.recurrenceRule);
  if (!validation.ok) throw recurrenceValidationFailure(validation.error);

  const initialRevision = revision(0);
  const initialVersion = createInitialRecurrenceVersion(input.recurrenceRule, initialRevision);
  if (!initialVersion.ok) throw recurrenceValidationFailure(initialVersion.error);

  if (input.durationMinutes !== undefined && !isPositiveDuration(input.durationMinutes)) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'durationMinutes', message: 'Duration must be positive' }],
    });
  }

  const definition: HabitDefinition = {
    id: ctx.nextId<'habit-definition'>(),
    title,
    ...(input.durationMinutes === undefined ? {} : { durationMinutes: input.durationMinutes }),
    ruleVersions: [initialVersion.value],
    revision: initialRevision,
  };
  await insertHabitDefinition(trx, definition);

  return { value: definition.id, affectedDates: [], affectedWeeks: [] };
}

/**
 * Sets or clears a habit's duration (003 FR-029, FR-030).
 *
 * The definition is the owner's setting; each occurrence's snapshot is what
 * planned load actually reads. So the new value is propagated to the
 * occurrences of every **open** day and to no others — a closed day keeps the
 * load it froze at closure (003 FR-034).
 *
 * It deliberately does not touch `ruleVersions`: a duration is not a recurrence
 * change, and versioning it would fork the habit's rule history on every edit.
 */
export async function updateHabitDuration(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: UpdateHabitDurationInput,
): Promise<CommandReceipt<undefined>> {
  if (input.durationMinutes !== null && !isPositiveDuration(input.durationMinutes)) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'durationMinutes', message: 'Duration must be positive' }],
    });
  }

  const definition = await getHabitDefinition(trx, input.definitionId);
  if (definition === undefined) {
    throw new DomainFailure({
      code: 'NotFound',
      entity: 'HabitDefinition',
      id: input.definitionId,
    });
  }
  const guard = revisionGuard(definition.revision, input.expectedRevision);
  if (guard !== undefined) throw new DomainFailure(guard);

  const durationMinutes = input.durationMinutes ?? undefined;
  // `exactOptionalPropertyTypes` forbids an explicit `undefined`, so a cleared
  // duration removes the key rather than setting it to undefined.
  const withoutDuration: HabitDefinition = { ...definition };
  delete (withoutDuration as { durationMinutes?: DurationMinutes }).durationMinutes;

  /*
   * The revision is deliberately **not** bumped. Every habit occurrence carries
   * a `ruleRevision` that materialization sets from the definition's revision,
   * and `updateHabitRule` guards against exactly that value. Advancing the
   * revision here — for a change that creates no rule version — would leave
   * every existing occurrence pointing at a revision that no longer matches,
   * and the next recurrence edit from the UI would fail with a conflict it
   * could never clear.
   *
   * The optimistic guard above still does its job: the caller had to hold a
   * current revision to get here.
   */
  await putHabitDefinition(
    trx,
    {
      ...withoutDuration,
      ...(durationMinutes === undefined ? {} : { durationMinutes }),
    },
    definition.revision,
  );

  const occurredAt = ctx.clock.now();
  const affectedDates: LocalDate[] = [];
  const affectedWeeks = new Map<LocalDate, OpenWeek>();

  for (const occurrence of await getOpenHabitOccurrencesByDefinition(trx, input.definitionId)) {
    // An occurrence the owner edited by hand is an exception and keeps its own
    // duration, exactly as it keeps its own title.
    if (occurrence.isException) continue;

    await putHabitOccurrence(trx, {
      ...occurrence,
      definitionSnapshot: {
        title: occurrence.definitionSnapshot.title,
        ...(durationMinutes === undefined ? {} : { durationMinutes }),
      },
      updatedAt: occurredAt,
    });

    const day = await getDay(trx, occurrence.date);
    if (day?.status !== 'open') continue;
    const week = await getWeek(trx, day.weekStart);
    if (week?.status !== 'open') continue;
    await bumpHabitAggregates(trx, day, week);
    affectedDates.push(day.date);
    affectedWeeks.set(week.startDate, week);
  }

  return {
    value: undefined,
    affectedDates: [...new Set(affectedDates)].sort(),
    affectedWeeks: [...affectedWeeks.keys()].sort(),
  };
}

export async function updateHabitRule(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: UpdateHabitRuleInput,
): Promise<CommandReceipt<undefined>> {
  const ruleValidation = validateRecurrenceRule(input.recurrenceRule);
  if (!ruleValidation.ok) throw recurrenceValidationFailure(ruleValidation.error);

  const definition = await getHabitDefinition(trx, input.definitionId);
  if (definition === undefined) {
    throw new DomainFailure({
      code: 'NotFound',
      entity: 'HabitDefinition',
      id: input.definitionId,
    });
  }
  const guard = revisionGuard(definition.revision, input.expectedRevision);
  if (guard !== undefined) throw new DomainFailure(guard);

  const updatedRevision = nextRevision(definition.revision);
  const versions = applyRecurrenceRuleChange({
    ruleVersions: definition.ruleVersions,
    currentLocalDate: ctx.clock.currentLocalDate(),
    revision: updatedRevision,
    nextRule: ruleValidation.value,
  });
  if (!versions.ok) throw recurrenceValidationFailure(versions.error);

  await putHabitDefinition(
    trx,
    { ...definition, ruleVersions: versions.value, revision: updatedRevision },
    definition.revision,
  );

  return { value: undefined, affectedDates: [], affectedWeeks: [] };
}

export async function stopHabitDefinition(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: StopHabitDefinitionInput,
): Promise<CommandReceipt<undefined>> {
  const definition = await getHabitDefinition(trx, input.definitionId);
  if (definition === undefined) {
    throw new DomainFailure({
      code: 'NotFound',
      entity: 'HabitDefinition',
      id: input.definitionId,
    });
  }
  const guard = revisionGuard(definition.revision, input.expectedRevision);
  if (guard !== undefined) throw new DomainFailure(guard);

  const updatedRevision = nextRevision(definition.revision);
  await putHabitDefinition(
    trx,
    {
      ...definition,
      ruleVersions: stopRecurrence({
        ruleVersions: definition.ruleVersions,
        currentLocalDate: ctx.clock.currentLocalDate(),
        revision: updatedRevision,
      }),
      revision: updatedRevision,
    },
    definition.revision,
  );

  return { value: undefined, affectedDates: [], affectedWeeks: [] };
}

/**
 * A habit occurrence has no revision of its own: 001 guards it with the
 * revision of its owning open day, and the same transaction bumps that day and
 * its week.
 */
async function requireMutableHabitDay(
  trx: PlanningTransaction,
  occurrence: HabitOccurrence,
  expectedRevision: Revision,
): Promise<{ readonly day: OpenDay; readonly week: OpenWeek }> {
  const day: Day | undefined = await getDay(trx, occurrence.date);
  if (day === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: occurrence.date });
  }
  requireOpenDay(day, expectedRevision);
  const week = await getWeek(trx, day.weekStart);
  requireOpenWeek(week, day.weekStart);
  return { day, week };
}

export async function bumpHabitAggregates(
  trx: PlanningTransaction,
  day: OpenDay,
  week: OpenWeek,
): Promise<void> {
  await putDay(trx, { ...day, revision: nextRevision(day.revision) }, day.revision);
  await putWeek(trx, { ...week, revision: nextRevision(week.revision) }, week.revision);
}

export async function editHabitOccurrence(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: EditHabitOccurrenceInput,
): Promise<CommandReceipt<undefined>> {
  const title = canonicalRequiredText(input.title, 'title');
  const occurrence = await getHabitOccurrence(trx, input.occurrenceId);
  if (occurrence === undefined) {
    throw new DomainFailure({
      code: 'NotFound',
      entity: 'HabitOccurrence',
      id: input.occurrenceId,
    });
  }

  const { day, week } = await requireMutableHabitDay(trx, occurrence, input.expectedRevision);
  if (occurrence.outcome === 'deleted') {
    throw new DomainFailure({
      code: 'InvalidTransition',
      entity: 'HabitOccurrence',
      currentState: occurrence.outcome,
      attemptedTransition: 'edit',
    });
  }

  if (
    input.durationMinutes !== undefined &&
    input.durationMinutes !== null &&
    !isPositiveDuration(input.durationMinutes)
  ) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field: 'durationMinutes', message: 'Duration must be positive' }],
    });
  }
  // Absent leaves the duration alone; null clears it (003 FR-029).
  const durationMinutes =
    input.durationMinutes === undefined
      ? occurrence.definitionSnapshot.durationMinutes
      : (input.durationMinutes ?? undefined);

  await putHabitOccurrence(trx, {
    ...occurrence,
    definitionSnapshot: {
      title,
      ...(durationMinutes === undefined ? {} : { durationMinutes }),
    },
    isException: true,
    updatedAt: ctx.clock.now(),
  });
  await bumpHabitAggregates(trx, day, week);

  return { value: undefined, affectedDates: [day.date], affectedWeeks: [week.startDate] };
}

type HabitTransitionPreparer = (
  occurrence: HabitOccurrence,
  dayStatus: Day['status'],
) => ReturnType<typeof prepareHabitOutcome>;

async function executeHabitTransition(
  trx: PlanningTransaction,
  occurrenceId: HabitOccurrence['id'],
  expectedRevision: Revision,
  prepare: HabitTransitionPreparer,
): Promise<CommandReceipt<undefined>> {
  const occurrence = await getHabitOccurrence(trx, occurrenceId);
  if (occurrence === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'HabitOccurrence', id: occurrenceId });
  }

  const { day, week } = await requireMutableHabitDay(trx, occurrence, expectedRevision);
  const transition = prepare(occurrence, day.status);
  if (!transition.ok) throw habitTransitionFailure(transition.error);
  if (!transition.value.changed) {
    return { value: undefined, affectedDates: [], affectedWeeks: [] };
  }

  await putHabitOccurrence(trx, transition.value.occurrence);
  await bumpHabitAggregates(trx, day, week);

  return { value: undefined, affectedDates: [day.date], affectedWeeks: [week.startDate] };
}

export async function recordHabitOutcome(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: RecordHabitOutcomeInput,
): Promise<CommandReceipt<undefined>> {
  return executeHabitTransition(
    trx,
    input.occurrenceId,
    input.expectedRevision,
    (occurrence, dayStatus) =>
      prepareHabitOutcome({ occurrence, dayStatus, clock: ctx.clock, outcome: input.outcome }),
  );
}

export async function correctBoundaryMissToCompleted(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: CorrectBoundaryMissInput,
): Promise<CommandReceipt<undefined>> {
  return executeHabitTransition(
    trx,
    input.occurrenceId,
    input.expectedRevision,
    (occurrence, dayStatus) =>
      prepareBoundaryMissCorrection({ occurrence, dayStatus, clock: ctx.clock }),
  );
}

export async function clearHabitOutcome(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: ClearHabitOutcomeInput,
): Promise<CommandReceipt<undefined>> {
  return executeHabitTransition(
    trx,
    input.occurrenceId,
    input.expectedRevision,
    (occurrence, dayStatus) =>
      prepareHabitOutcomeClear({ occurrence, dayStatus, clock: ctx.clock }),
  );
}

export async function deleteHabitOccurrence(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: DeleteHabitOccurrenceInput,
): Promise<CommandReceipt<undefined>> {
  return executeHabitTransition(
    trx,
    input.occurrenceId,
    input.expectedRevision,
    (occurrence, dayStatus) =>
      prepareHabitOccurrenceDeletion({ occurrence, dayStatus, clock: ctx.clock }),
  );
}
