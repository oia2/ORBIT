import { nextRevision, revision, type TaskSeriesId } from '@/shared/lib/ids';

import type {
  CreateTaskSeriesInput,
  StopTaskSeriesInput,
  UpdateTaskSeriesRuleInput,
} from '@/entities/planning/model/planning-repository';
import {
  applyRecurrenceRuleChange,
  createInitialRecurrenceVersion,
  stopRecurrence,
  validateRecurrenceRule,
  validateRecurringTaskTemplate,
} from '@/entities/planning/model/recurrence';
import type { TaskSeries } from '@/entities/planning/model/task';

import type { RepositoryContext } from './context';
import {
  canonicalRequiredText,
  DomainFailure,
  recurrenceValidationFailure,
  revisionGuard,
} from './errors';
import { getTaskSeries, insertTaskSeries, putTaskSeries } from './store';
import type { CommandReceipt, PlanningTransaction } from './transaction';

export async function createTaskSeries(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: CreateTaskSeriesInput,
): Promise<CommandReceipt<TaskSeriesId>> {
  const title = canonicalRequiredText(input.template.title, 'title');
  const templateValidation = validateRecurringTaskTemplate(input.template);
  if (!templateValidation.ok) throw recurrenceValidationFailure(templateValidation.error);
  const ruleValidation = validateRecurrenceRule(input.recurrenceRule);
  if (!ruleValidation.ok) throw recurrenceValidationFailure(ruleValidation.error);

  const initialRevision = revision(0);
  const initialVersion = createInitialRecurrenceVersion(input.recurrenceRule, initialRevision);
  if (!initialVersion.ok) throw recurrenceValidationFailure(initialVersion.error);

  const series: TaskSeries = {
    id: ctx.nextId<'task-series'>(),
    template: {
      title,
      ...(input.template.notes === undefined ? {} : { notes: input.template.notes }),
      plannedDurationMinutes: input.template.plannedDurationMinutes,
      ...(input.template.startTime === undefined ? {} : { startTime: input.template.startTime }),
      ...(input.template.endTime === undefined ? {} : { endTime: input.template.endTime }),
    },
    ruleVersions: [initialVersion.value],
    revision: initialRevision,
  };
  await insertTaskSeries(trx, series);

  return { value: series.id, affectedDates: [], affectedWeeks: [] };
}

export async function updateTaskSeriesRule(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: UpdateTaskSeriesRuleInput,
): Promise<CommandReceipt<undefined>> {
  const ruleValidation = validateRecurrenceRule(input.recurrenceRule);
  if (!ruleValidation.ok) throw recurrenceValidationFailure(ruleValidation.error);

  const series = await getTaskSeries(trx, input.seriesId);
  if (series === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'TaskSeries', id: input.seriesId });
  }
  const guard = revisionGuard(series.revision, input.expectedRevision);
  if (guard !== undefined) throw new DomainFailure(guard);

  const updatedRevision = nextRevision(series.revision);
  const versions = applyRecurrenceRuleChange({
    ruleVersions: series.ruleVersions,
    currentLocalDate: ctx.clock.currentLocalDate(),
    revision: updatedRevision,
    nextRule: ruleValidation.value,
  });
  if (!versions.ok) throw recurrenceValidationFailure(versions.error);

  await putTaskSeries(
    trx,
    { ...series, ruleVersions: versions.value, revision: updatedRevision },
    series.revision,
  );

  return { value: undefined, affectedDates: [], affectedWeeks: [] };
}

export async function stopTaskSeries(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  input: StopTaskSeriesInput,
): Promise<CommandReceipt<undefined>> {
  const series = await getTaskSeries(trx, input.seriesId);
  if (series === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'TaskSeries', id: input.seriesId });
  }
  const guard = revisionGuard(series.revision, input.expectedRevision);
  if (guard !== undefined) throw new DomainFailure(guard);

  const updatedRevision = nextRevision(series.revision);
  await putTaskSeries(
    trx,
    {
      ...series,
      ruleVersions: stopRecurrence({
        ruleVersions: series.ruleVersions,
        currentLocalDate: ctx.clock.currentLocalDate(),
        revision: updatedRevision,
      }),
      revision: updatedRevision,
    },
    series.revision,
  );

  return { value: undefined, affectedDates: [], affectedWeeks: [] };
}
