import type {
  DayPosition,
  HabitDefinitionId,
  HabitOccurrenceId,
  Revision,
  TaskOccurrenceId,
  TaskPlanEntryId,
  TaskSeriesId,
} from '@/shared/lib/ids';
import { dayPosition } from '@/shared/lib/ids';
import { compareLocalDates, startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';

import type { HabitDefinition, HabitOccurrence } from './habit';
import {
  effectiveRecurrenceVersionOn,
  isRecurrenceDateApplicable,
  shouldPreserveOccurrenceForRuleChange,
  validateRecurringTaskTemplate,
} from './recurrence';
import type {
  CompletedDatedTaskOccurrence,
  IncompleteDatedTaskOccurrence,
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
  TaskPlannedSnapshot,
  TaskSeries,
} from './task';

export type TaskOccurrenceNaturalKey = `${string}|${string}`;
export type HabitOccurrenceNaturalKey = `${string}|${string}`;

export function taskOccurrenceNaturalKey(
  seriesId: TaskSeriesId,
  date: LocalDate,
): TaskOccurrenceNaturalKey {
  return `${seriesId}|${date}`;
}

export function habitOccurrenceNaturalKey(
  definitionId: HabitDefinitionId,
  date: LocalDate,
): HabitOccurrenceNaturalKey {
  return `${definitionId}|${date}`;
}

export interface GeneratedTaskBundleEffect {
  readonly naturalKey: TaskOccurrenceNaturalKey;
  readonly seriesId: TaskSeriesId;
  readonly nominalDate: LocalDate;
  readonly ruleRevision: Revision;
  readonly title: string;
  readonly notes?: string;
  readonly plannedDurationMinutes: TaskPlannedSnapshot['plannedDurationMinutes'];
  readonly startTime?: string;
  readonly endTime?: string;
  readonly placement: { readonly kind: 'day'; readonly date: LocalDate };
  readonly dayPosition: DayPosition;
  readonly completion: 'incomplete';
  readonly isException: false;
  readonly membership: {
    readonly date: LocalDate;
    readonly weekStart: LocalDate;
    readonly plannedSnapshot: TaskPlannedSnapshot;
    readonly outcome: 'planned';
  };
}

export interface GeneratedHabitOccurrenceEffect {
  readonly naturalKey: HabitOccurrenceNaturalKey;
  readonly definitionId: HabitDefinitionId;
  readonly date: LocalDate;
  readonly weekStart: LocalDate;
  readonly ruleRevision: Revision;
  readonly definitionSnapshot: { readonly title: string };
  readonly isException: false;
  readonly outcome: 'pending';
  readonly outcomeEvents: readonly [];
}

export interface RemoveTaskBundleEffect {
  readonly occurrenceId: TaskOccurrenceId;
  readonly planEntryId: TaskPlanEntryId;
}

export interface RemoveHabitOccurrenceEffect {
  readonly occurrenceId: HabitOccurrenceId;
}

export interface OccurrenceMaterializationEffects {
  readonly createTaskBundles: readonly GeneratedTaskBundleEffect[];
  readonly removeTaskBundles: readonly RemoveTaskBundleEffect[];
  readonly createHabitOccurrences: readonly GeneratedHabitOccurrenceEffect[];
  readonly removeHabitOccurrences: readonly RemoveHabitOccurrenceEffect[];
  /** Automatic materialization/reconciliation never writes explanatory events. */
  readonly taskEvents: readonly [];
}

export interface PlanOccurrenceMaterializationInput {
  /** Already-derived open dates; no arbitrary or unbounded range is accepted. */
  readonly openDates: readonly LocalDate[];
  readonly currentLocalDate: LocalDate;
  readonly taskSeries: readonly TaskSeries[];
  readonly habitDefinitions: readonly HabitDefinition[];
  readonly taskOccurrences: readonly TaskOccurrence[];
  readonly taskPlanEntries: readonly TaskPlanEntry[];
  readonly taskEvents: readonly TaskEvent[];
  readonly habitOccurrences: readonly HabitOccurrence[];
}

function uniqueOrderedDates(dates: readonly LocalDate[]): readonly LocalDate[] {
  return [...new Set(dates)].sort(compareLocalDates);
}

function taskOccurrenceKey(occurrence: TaskOccurrence): TaskOccurrenceNaturalKey | undefined {
  return occurrence.seriesId === undefined || occurrence.nominalDate === undefined
    ? undefined
    : taskOccurrenceNaturalKey(occurrence.seriesId, occurrence.nominalDate);
}

function isActiveDatedTaskOccurrence(
  occurrence: TaskOccurrence,
): occurrence is IncompleteDatedTaskOccurrence | CompletedDatedTaskOccurrence {
  return (
    occurrence.state === 'active' &&
    occurrence.placement.kind === 'day' &&
    'completion' in occurrence
  );
}

function untouchedFutureTaskMembership(
  occurrence: TaskOccurrence,
  memberships: readonly TaskPlanEntry[],
  touchedOccurrenceIds: ReadonlySet<TaskOccurrenceId>,
  currentLocalDate: LocalDate,
): TaskPlanEntry | undefined {
  if (
    occurrence.nominalDate === undefined ||
    shouldPreserveOccurrenceForRuleChange({
      occurrenceDate: occurrence.nominalDate,
      currentLocalDate,
      isException: occurrence.isException,
      isUserDeleted: occurrence.state === 'deleted',
    }) ||
    !isActiveDatedTaskOccurrence(occurrence) ||
    occurrence.placement.date !== occurrence.nominalDate ||
    occurrence.completion !== 'incomplete' ||
    touchedOccurrenceIds.has(occurrence.id)
  ) {
    return undefined;
  }

  return memberships.find(
    (membership) =>
      membership.occurrenceId === occurrence.id &&
      membership.date === occurrence.nominalDate &&
      membership.outcome === 'planned' &&
      membership.finalizedAt === undefined,
  );
}

function createTaskEffect(
  series: TaskSeries,
  date: LocalDate,
  ruleRevision: Revision,
  position: DayPosition,
): GeneratedTaskBundleEffect {
  const plannedSnapshot: TaskPlannedSnapshot = {
    title: series.template.title,
    ...(series.template.notes === undefined ? {} : { notes: series.template.notes }),
    plannedDurationMinutes: series.template.plannedDurationMinutes,
    ...(series.template.startTime === undefined ? {} : { startTime: series.template.startTime }),
    ...(series.template.endTime === undefined ? {} : { endTime: series.template.endTime }),
  };

  return {
    naturalKey: taskOccurrenceNaturalKey(series.id, date),
    seriesId: series.id,
    nominalDate: date,
    ruleRevision,
    title: series.template.title,
    ...(series.template.notes === undefined ? {} : { notes: series.template.notes }),
    plannedDurationMinutes: series.template.plannedDurationMinutes,
    ...(series.template.startTime === undefined ? {} : { startTime: series.template.startTime }),
    ...(series.template.endTime === undefined ? {} : { endTime: series.template.endTime }),
    placement: { kind: 'day', date },
    dayPosition: position,
    completion: 'incomplete',
    isException: false,
    membership: {
      date,
      weekStart: startOfWeek(date),
      plannedSnapshot,
      outcome: 'planned',
    },
  };
}

function createHabitEffect(
  definition: HabitDefinition,
  date: LocalDate,
  ruleRevision: Revision,
): GeneratedHabitOccurrenceEffect {
  return {
    naturalKey: habitOccurrenceNaturalKey(definition.id, date),
    definitionId: definition.id,
    date,
    weekStart: startOfWeek(date),
    ruleRevision,
    definitionSnapshot: { title: definition.title },
    isException: false,
    outcome: 'pending',
    outcomeEvents: [],
  };
}

export function planOccurrenceMaterialization(
  input: PlanOccurrenceMaterializationInput,
): OccurrenceMaterializationEffects {
  const openDates = uniqueOrderedDates(input.openDates);
  const openDateSet = new Set(openDates);
  const nextTaskPositionByDate = new Map<LocalDate, number>(openDates.map((date) => [date, 0]));
  for (const occurrence of input.taskOccurrences) {
    if (!isActiveDatedTaskOccurrence(occurrence) || !openDateSet.has(occurrence.placement.date)) {
      continue;
    }

    const position = occurrence.dayPosition;
    if (position === undefined) {
      continue;
    }

    const nextPosition = nextTaskPositionByDate.get(occurrence.placement.date) ?? 0;
    nextTaskPositionByDate.set(occurrence.placement.date, Math.max(nextPosition, position + 1));
  }
  const existingTaskKeys = new Set(
    input.taskOccurrences
      .map(taskOccurrenceKey)
      .filter((key): key is TaskOccurrenceNaturalKey => key !== undefined),
  );
  const existingHabitKeys = new Set(
    input.habitOccurrences.map((occurrence) =>
      habitOccurrenceNaturalKey(occurrence.definitionId, occurrence.date),
    ),
  );
  const touchedOccurrenceIds = new Set(input.taskEvents.map((event) => event.occurrenceId));
  const seriesById = new Map(input.taskSeries.map((series) => [series.id, series]));
  const definitionById = new Map(
    input.habitDefinitions.map((definition) => [definition.id, definition]),
  );

  const createTaskBundles: GeneratedTaskBundleEffect[] = [];
  for (const series of input.taskSeries) {
    if (!validateRecurringTaskTemplate(series.template).ok) {
      continue;
    }

    for (const date of openDates) {
      const version = effectiveRecurrenceVersionOn(series.ruleVersions, date);
      const key = taskOccurrenceNaturalKey(series.id, date);
      if (
        version?.state === 'active' &&
        isRecurrenceDateApplicable(version.rule, date) &&
        !existingTaskKeys.has(key)
      ) {
        const nextPosition = nextTaskPositionByDate.get(date) ?? 0;
        createTaskBundles.push(
          createTaskEffect(series, date, version.revision, dayPosition(nextPosition)),
        );
        nextTaskPositionByDate.set(date, nextPosition + 1);
        existingTaskKeys.add(key);
      }
    }
  }

  const createHabitOccurrences: GeneratedHabitOccurrenceEffect[] = [];
  for (const definition of input.habitDefinitions) {
    for (const date of openDates) {
      const version = effectiveRecurrenceVersionOn(definition.ruleVersions, date);
      const key = habitOccurrenceNaturalKey(definition.id, date);
      if (
        version?.state === 'active' &&
        isRecurrenceDateApplicable(version.rule, date) &&
        !existingHabitKeys.has(key)
      ) {
        createHabitOccurrences.push(createHabitEffect(definition, date, version.revision));
        existingHabitKeys.add(key);
      }
    }
  }

  const removeTaskBundles: RemoveTaskBundleEffect[] = [];
  for (const occurrence of input.taskOccurrences) {
    if (
      occurrence.seriesId === undefined ||
      occurrence.nominalDate === undefined ||
      !openDateSet.has(occurrence.nominalDate)
    ) {
      continue;
    }

    const series = seriesById.get(occurrence.seriesId);
    if (series === undefined) {
      continue;
    }

    const version = effectiveRecurrenceVersionOn(series.ruleVersions, occurrence.nominalDate);
    const stillApplicable =
      version?.state === 'active' &&
      isRecurrenceDateApplicable(version.rule, occurrence.nominalDate);
    if (stillApplicable) {
      continue;
    }

    const membership = untouchedFutureTaskMembership(
      occurrence,
      input.taskPlanEntries,
      touchedOccurrenceIds,
      input.currentLocalDate,
    );
    if (membership !== undefined) {
      removeTaskBundles.push({
        occurrenceId: occurrence.id,
        planEntryId: membership.id,
      });
    }
  }

  const removeHabitOccurrences: RemoveHabitOccurrenceEffect[] = [];
  for (const occurrence of input.habitOccurrences) {
    if (!openDateSet.has(occurrence.date)) {
      continue;
    }

    const definition = definitionById.get(occurrence.definitionId);
    if (definition === undefined) {
      continue;
    }

    const version = effectiveRecurrenceVersionOn(definition.ruleVersions, occurrence.date);
    const stillApplicable =
      version?.state === 'active' && isRecurrenceDateApplicable(version.rule, occurrence.date);
    if (
      !stillApplicable &&
      !shouldPreserveOccurrenceForRuleChange({
        occurrenceDate: occurrence.date,
        currentLocalDate: input.currentLocalDate,
        isException: occurrence.isException,
        isUserDeleted: occurrence.outcome === 'deleted',
      }) &&
      occurrence.outcome === 'pending' &&
      occurrence.outcomeEvents.length === 0
    ) {
      removeHabitOccurrences.push({ occurrenceId: occurrence.id });
    }
  }

  return {
    createTaskBundles,
    removeTaskBundles,
    createHabitOccurrences,
    removeHabitOccurrences,
    taskEvents: [],
  };
}
