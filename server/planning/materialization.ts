import { nextCreationSequence, nextRevision, revision } from '@/shared/lib/ids';
import {
  getLocalDateParts,
  localDateFromParts,
  startOfWeek,
  weekDates,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';

import type { Day, OpenDay } from '@/entities/planning/model/day';
import {
  catchUpHabitDateBoundary,
  type HabitDefinition,
  type HabitOccurrence,
} from '@/entities/planning/model/habit';
import { planOccurrenceMaterialization } from '@/entities/planning/model/occurrence-materialization';
import type { OpenPeriodRange } from '@/entities/planning/model/planning-repository';
import type {
  IncompleteDatedTaskOccurrence,
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
  TaskSeries,
} from '@/entities/planning/model/task';
import type { OpenWeek } from '@/entities/planning/model/week';

import { allocateNextCreationSequence } from './audit';
import type { RepositoryContext } from './context';
import { habitTransitionFailure } from './errors';
import {
  deleteHabitOccurrence,
  deletePlanEntry,
  deleteTaskOccurrence,
  getAllHabitDefinitions,
  getAllTaskSeries,
  getDay,
  getEventsByOccurrences,
  getHabitOccurrencesByDate,
  getPlanEntriesByDate,
  getTaskOccurrenceBySeriesDate,
  getTaskOccurrencesPlacedOn,
  getWeek,
  insertHabitOccurrence,
  insertPlanEntry,
  insertTaskOccurrence,
  putDay,
  putHabitOccurrence,
  putWeek,
} from './store';
import type { CommandReceipt, PlanningTransaction } from './transaction';

/** The page-derived bounds; callers cannot supply an arbitrary window. */
export function datesForOpenPeriod(range: OpenPeriodRange): readonly LocalDate[] {
  switch (range.kind) {
    case 'day':
      return [range.date];
    case 'week':
      return weekDates(startOfWeek(range.weekStart));
    case 'month': {
      const { year, month } = getLocalDateParts(range.anchorDate);
      const dates: LocalDate[] = [];
      for (let day = 1; day <= 31; day += 1) {
        try {
          dates.push(localDateFromParts(year, month, day));
        } catch {
          break;
        }
      }
      return dates;
    }
  }
}

interface MaterializationInputs {
  readonly taskSeries: readonly TaskSeries[];
  readonly habitDefinitions: readonly HabitDefinition[];
  readonly taskOccurrences: Map<string, TaskOccurrence>;
  readonly taskPlanEntries: Map<string, TaskPlanEntry>;
  readonly habitOccurrences: Map<string, HabitOccurrence>;
  readonly taskEvents: Map<string, TaskEvent>;
}

/**
 * Collects everything the pure materialization planner needs for a set of open
 * dates. Every read is bounded by those dates: nothing scans a dated table
 * without a date predicate, which is what keeps a 52-week history from being
 * loaded to prepare one day.
 */
async function readMaterializationInputs(
  trx: PlanningTransaction,
  openDates: readonly LocalDate[],
): Promise<MaterializationInputs> {
  const taskSeries = await getAllTaskSeries(trx);
  const habitDefinitions = await getAllHabitDefinitions(trx);
  const taskOccurrences = new Map<string, TaskOccurrence>();
  const taskPlanEntries = new Map<string, TaskPlanEntry>();
  const habitOccurrences = new Map<string, HabitOccurrence>();

  for (const date of openDates) {
    for (const entry of await getPlanEntriesByDate(trx, date)) {
      taskPlanEntries.set(entry.id, entry);
    }
    for (const occurrence of await getHabitOccurrencesByDate(trx, date)) {
      habitOccurrences.set(occurrence.id, occurrence);
    }
    for (const occurrence of await getTaskOccurrencesPlacedOn(trx, date)) {
      taskOccurrences.set(occurrence.id, occurrence);
    }
    for (const series of taskSeries) {
      const generated = await getTaskOccurrenceBySeriesDate(trx, series.id, date);
      if (generated !== undefined) {
        taskOccurrences.set(generated.id, generated);
      }
    }
  }

  const taskEvents = new Map<string, TaskEvent>();
  for (const event of await getEventsByOccurrences(trx, [...taskOccurrences.keys()])) {
    taskEvents.set(event.id, event);
  }

  return {
    taskSeries,
    habitDefinitions,
    taskOccurrences,
    taskPlanEntries,
    habitOccurrences,
    taskEvents,
  };
}

export async function prepareOpenPeriod(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  range: OpenPeriodRange,
): Promise<CommandReceipt<undefined>> {
  const requestedDates = datesForOpenPeriod(range);

  const openDays = new Map<LocalDate, OpenDay>();
  for (const date of requestedDates) {
    const day: Day | undefined = await getDay(trx, date);
    if (day?.status !== 'open') continue;
    const week = await getWeek(trx, day.weekStart);
    if (week?.status !== 'open') continue;
    openDays.set(date, day);
  }

  const openDates = [...openDays.keys()];
  if (openDates.length === 0) {
    return { value: undefined, affectedDates: [], affectedWeeks: [] };
  }

  const inputs = await readMaterializationInputs(trx, openDates);
  const effects = planOccurrenceMaterialization({
    openDates,
    currentLocalDate: ctx.clock.currentLocalDate(),
    taskSeries: inputs.taskSeries,
    habitDefinitions: inputs.habitDefinitions,
    taskOccurrences: [...inputs.taskOccurrences.values()],
    taskPlanEntries: [...inputs.taskPlanEntries.values()],
    taskEvents: [...inputs.taskEvents.values()],
    habitOccurrences: [...inputs.habitOccurrences.values()],
  });

  const changedDates = new Set<LocalDate>();
  const now = ctx.clock.now();

  for (const effect of effects.removeTaskBundles) {
    const occurrence = inputs.taskOccurrences.get(effect.occurrenceId);
    if (occurrence?.nominalDate !== undefined) changedDates.add(occurrence.nominalDate);
    await deletePlanEntry(trx, effect.planEntryId);
    await deleteTaskOccurrence(trx, effect.occurrenceId);
    inputs.taskOccurrences.delete(effect.occurrenceId);
  }
  for (const effect of effects.removeHabitOccurrences) {
    const occurrence = inputs.habitOccurrences.get(effect.occurrenceId);
    if (occurrence !== undefined) changedDates.add(occurrence.date);
    await deleteHabitOccurrence(trx, effect.occurrenceId);
    inputs.habitOccurrences.delete(effect.occurrenceId);
  }

  let nextCreatedSequence =
    effects.createTaskBundles.length === 0 ? undefined : await allocateNextCreationSequence(trx);
  for (const [effectIndex, effect] of effects.createTaskBundles.entries()) {
    if (nextCreatedSequence === undefined) {
      throw new Error('Creation sequence was not allocated');
    }
    const occurrenceId = ctx.nextId<'task-occurrence'>();
    const entryId = ctx.nextId<'task-plan-entry'>();
    const occurrence: IncompleteDatedTaskOccurrence = {
      id: occurrenceId,
      seriesId: effect.seriesId,
      nominalDate: effect.nominalDate,
      ruleRevision: effect.ruleRevision,
      title: effect.title,
      ...(effect.notes === undefined ? {} : { notes: effect.notes }),
      ...(effect.startTime === undefined ? {} : { startTime: effect.startTime }),
      ...(effect.endTime === undefined ? {} : { endTime: effect.endTime }),
      plannedDurationMinutes: effect.plannedDurationMinutes,
      isException: false,
      createdSequence: nextCreatedSequence,
      revision: revision(0),
      state: 'active',
      placement: effect.placement,
      dayPosition: effect.dayPosition,
      completion: 'incomplete',
    };
    const entry: TaskPlanEntry = {
      id: entryId,
      occurrenceId,
      date: effect.membership.date,
      weekStart: effect.membership.weekStart,
      plannedSnapshot: effect.membership.plannedSnapshot,
      enteredAt: now,
      outcome: 'planned',
    };
    await insertTaskOccurrence(trx, occurrence);
    await insertPlanEntry(trx, entry);
    inputs.taskOccurrences.set(occurrence.id, occurrence);
    inputs.taskPlanEntries.set(entry.id, entry);
    changedDates.add(effect.nominalDate);
    if (effectIndex < effects.createTaskBundles.length - 1) {
      nextCreatedSequence = nextCreationSequence(nextCreatedSequence);
    }
  }

  for (const effect of effects.createHabitOccurrences) {
    const occurrence: HabitOccurrence = {
      id: ctx.nextId<'habit-occurrence'>(),
      definitionId: effect.definitionId,
      date: effect.date,
      weekStart: effect.weekStart,
      definitionSnapshot: effect.definitionSnapshot,
      ruleRevision: effect.ruleRevision,
      isException: false,
      outcome: 'pending',
      outcomeEvents: [],
      updatedAt: now,
    };
    await insertHabitOccurrence(trx, occurrence);
    inputs.habitOccurrences.set(occurrence.id, occurrence);
    changedDates.add(effect.date);
  }

  for (const occurrence of inputs.habitOccurrences.values()) {
    const day = openDays.get(occurrence.date);
    if (day === undefined) continue;
    const transition = catchUpHabitDateBoundary({
      occurrence,
      dayStatus: day.status,
      clock: ctx.clock,
    });
    if (!transition.ok) throw habitTransitionFailure(transition.error);
    if (transition.value.changed) {
      await putHabitOccurrence(trx, transition.value.occurrence);
      changedDates.add(occurrence.date);
    }
  }

  const affectedWeeks = new Map<LocalDate, OpenWeek>();
  for (const date of changedDates) {
    const day = openDays.get(date);
    if (day === undefined) continue;
    await putDay(trx, { ...day, revision: nextRevision(day.revision) }, day.revision);
    const week = await getWeek(trx, day.weekStart);
    if (week?.status === 'open') affectedWeeks.set(week.startDate, week);
  }
  for (const week of affectedWeeks.values()) {
    await putWeek(trx, { ...week, revision: nextRevision(week.revision) }, week.revision);
  }

  return {
    value: undefined,
    affectedDates: [...changedDates].sort(),
    affectedWeeks: [...affectedWeeks.keys()].sort(),
  };
}

/**
 * Reruns bounded materialization for the single date being closed, so a day
 * cannot be closed before its recurring rows exist and its habit boundary
 * misses have been recorded (001 FR-039, FR-020). It deliberately does not bump
 * revisions: `closeDay` owns the aggregate write that follows.
 */
export async function prepareClosureDate(
  ctx: RepositoryContext,
  trx: PlanningTransaction,
  date: LocalDate,
): Promise<void> {
  const day = await getDay(trx, date);
  if (day?.status !== 'open') return;
  const week = await getWeek(trx, day.weekStart);
  if (week?.status !== 'open') return;

  const inputs = await readMaterializationInputs(trx, [date]);
  const effects = planOccurrenceMaterialization({
    openDates: [date],
    currentLocalDate: ctx.clock.currentLocalDate(),
    taskSeries: inputs.taskSeries,
    habitDefinitions: inputs.habitDefinitions,
    taskOccurrences: [...inputs.taskOccurrences.values()],
    taskPlanEntries: [...inputs.taskPlanEntries.values()],
    taskEvents: [...inputs.taskEvents.values()],
    habitOccurrences: [...inputs.habitOccurrences.values()],
  });

  for (const effect of effects.removeTaskBundles) {
    await deletePlanEntry(trx, effect.planEntryId);
    await deleteTaskOccurrence(trx, effect.occurrenceId);
  }
  for (const effect of effects.removeHabitOccurrences) {
    await deleteHabitOccurrence(trx, effect.occurrenceId);
  }

  const now = ctx.clock.now();
  let nextCreatedSequence =
    effects.createTaskBundles.length === 0 ? undefined : await allocateNextCreationSequence(trx);
  for (const [effectIndex, effect] of effects.createTaskBundles.entries()) {
    if (nextCreatedSequence === undefined) throw new Error('Creation sequence was not allocated');
    const occurrenceId = ctx.nextId<'task-occurrence'>();
    const occurrence: IncompleteDatedTaskOccurrence = {
      id: occurrenceId,
      seriesId: effect.seriesId,
      nominalDate: effect.nominalDate,
      ruleRevision: effect.ruleRevision,
      title: effect.title,
      ...(effect.notes === undefined ? {} : { notes: effect.notes }),
      ...(effect.startTime === undefined ? {} : { startTime: effect.startTime }),
      ...(effect.endTime === undefined ? {} : { endTime: effect.endTime }),
      plannedDurationMinutes: effect.plannedDurationMinutes,
      isException: false,
      createdSequence: nextCreatedSequence,
      revision: revision(0),
      state: 'active',
      placement: effect.placement,
      dayPosition: effect.dayPosition,
      completion: 'incomplete',
    };
    const entry: TaskPlanEntry = {
      id: ctx.nextId<'task-plan-entry'>(),
      occurrenceId,
      date: effect.membership.date,
      weekStart: effect.membership.weekStart,
      plannedSnapshot: effect.membership.plannedSnapshot,
      enteredAt: now,
      outcome: 'planned',
    };
    await insertTaskOccurrence(trx, occurrence);
    await insertPlanEntry(trx, entry);
    if (effectIndex < effects.createTaskBundles.length - 1) {
      nextCreatedSequence = nextCreationSequence(nextCreatedSequence);
    }
  }

  const preparedHabits = new Map(inputs.habitOccurrences);
  for (const effect of effects.createHabitOccurrences) {
    const occurrence: HabitOccurrence = {
      id: ctx.nextId<'habit-occurrence'>(),
      definitionId: effect.definitionId,
      date: effect.date,
      weekStart: effect.weekStart,
      definitionSnapshot: effect.definitionSnapshot,
      ruleRevision: effect.ruleRevision,
      isException: false,
      outcome: 'pending',
      outcomeEvents: [],
      updatedAt: now,
    };
    await insertHabitOccurrence(trx, occurrence);
    preparedHabits.set(occurrence.id, occurrence);
  }
  for (const removed of effects.removeHabitOccurrences) {
    preparedHabits.delete(removed.occurrenceId);
  }

  for (const occurrence of preparedHabits.values()) {
    const transition = catchUpHabitDateBoundary({
      occurrence,
      dayStatus: day.status,
      clock: ctx.clock,
    });
    if (!transition.ok) throw habitTransitionFailure(transition.error);
    if (transition.value.changed) {
      await putHabitOccurrence(trx, transition.value.occurrence);
    }
  }
}
