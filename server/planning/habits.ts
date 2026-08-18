import { nextRevision, revision, type HabitDefinitionId, type Revision } from '@/shared/lib/ids';

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

  const definition: HabitDefinition = {
    id: ctx.nextId<'habit-definition'>(),
    title,
    ruleVersions: [initialVersion.value],
    revision: initialRevision,
  };
  await insertHabitDefinition(trx, definition);

  return { value: definition.id, affectedDates: [], affectedWeeks: [] };
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

  await putHabitOccurrence(trx, {
    ...occurrence,
    definitionSnapshot: { title },
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
