import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { assertNever } from '@/shared/lib/result';

import type {
  CompletionCategoryBreakdown,
  DailyStateEntry,
  Day,
  DayClosureSnapshot,
  ScoreBreakdown,
} from '../../model/day';
import type {
  HabitDefinition,
  HabitOccurrence,
  HabitOutcome,
  HabitOutcomeEvent,
} from '../../model/habit';
import type { RecurrenceRule, RecurrenceRuleVersion } from '../../model/recurrence';
import type {
  BacklogTaskOccurrence,
  TaskEvent,
  IncompleteDatedTaskOccurrence,
  CompletedDatedTaskOccurrence,
  TaskOccurrence,
  TaskPlacement,
  TaskPlanEntry,
  TaskSeries,
  TaskValueSnapshot,
} from '../../model/task';
import type { Week, WeekCompletionSnapshot, WeeklyGoal } from '../../model/week';
import type { StoredTaskOccurrence, TaskPlacementKey } from './schema';

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Readonly<Partial<Record<Key, Value>>> {
  const result: Partial<Record<Key, Value>> = {};
  if (value !== undefined) {
    result[key] = value;
  }

  return result;
}

function mapCompletionCategory(category: CompletionCategoryBreakdown): CompletionCategoryBreakdown {
  if (category.rate === 'unavailable') {
    return { completed: 0, applicable: 0, rate: 'unavailable' };
  }

  return {
    completed: category.completed,
    applicable: category.applicable,
    rate: category.rate,
  };
}

export function mapScoreBreakdown(snapshot: ScoreBreakdown): ScoreBreakdown {
  return {
    task: mapCompletionCategory(snapshot.task),
    habit: mapCompletionCategory(snapshot.habit),
    value: snapshot.value,
    weightsApplied: {
      task: snapshot.weightsApplied.task,
      habit: snapshot.weightsApplied.habit,
    },
  };
}

function mapDayClosureSnapshot(snapshot: DayClosureSnapshot): DayClosureSnapshot {
  return {
    score: mapScoreBreakdown(snapshot.score),
    plannedLoadMinutes: snapshot.plannedLoadMinutes,
  };
}

function mapWeekCompletionSnapshot(snapshot: WeekCompletionSnapshot): WeekCompletionSnapshot {
  return { progress: mapScoreBreakdown(snapshot.progress) };
}

function mapDailyState(state: DailyStateEntry): DailyStateEntry {
  return {
    ...optionalProperty('energy', state.energy),
    ...optionalProperty('mood', state.mood),
    ...optionalProperty('sleepDurationMinutes', state.sleepDurationMinutes),
    updatedAt: instant(state.updatedAt),
  };
}

function mapWeeklyGoal(goal: WeeklyGoal): WeeklyGoal {
  return {
    id: goal.id,
    statement: goal.statement,
    createdAt: instant(goal.createdAt),
    updatedAt: instant(goal.updatedAt),
  };
}

export function toStoredWeek(week: Week): Week {
  const base = {
    startDate: localDate(week.startDate),
    goals: week.goals.map(mapWeeklyGoal),
    revision: week.revision,
  };

  switch (week.status) {
    case 'open':
      return {
        ...base,
        status: 'open',
        ...optionalProperty('reflection', week.reflection),
      };
    case 'completed':
      return {
        ...base,
        status: 'completed',
        ...optionalProperty('reflection', week.reflection),
        completionSnapshot: mapWeekCompletionSnapshot(week.completionSnapshot),
        completedAt: instant(week.completedAt),
      };
    default:
      return assertNever(week);
  }
}

export const fromStoredWeek = toStoredWeek;

export function toStoredDay(day: Day): Day {
  const base = {
    date: localDate(day.date),
    weekStart: localDate(day.weekStart),
    ...optionalProperty('state', day.state === undefined ? undefined : mapDailyState(day.state)),
    revision: day.revision,
  };

  switch (day.status) {
    case 'open':
      return { ...base, status: 'open' };
    case 'closed':
      return {
        ...base,
        status: 'closed',
        closureSnapshot: mapDayClosureSnapshot(day.closureSnapshot),
        closedAt: instant(day.closedAt),
      };
    default:
      return assertNever(day);
  }
}

export const fromStoredDay = toStoredDay;

export function mapRecurrenceRule(rule: RecurrenceRule): RecurrenceRule {
  return {
    startDate: localDate(rule.startDate),
    weekdays: [...rule.weekdays],
    ...optionalProperty(
      'endDate',
      rule.endDate === undefined ? undefined : localDate(rule.endDate),
    ),
  };
}

export function mapRecurrenceRuleVersion(version: RecurrenceRuleVersion): RecurrenceRuleVersion {
  const base = {
    revision: version.revision,
    effectiveFrom: localDate(version.effectiveFrom),
    ...optionalProperty(
      'effectiveThrough',
      version.effectiveThrough === undefined ? undefined : localDate(version.effectiveThrough),
    ),
  };

  switch (version.state) {
    case 'active':
      return { ...base, state: 'active', rule: mapRecurrenceRule(version.rule) };
    case 'stopped':
      return { ...base, state: 'stopped' };
    default:
      return assertNever(version);
  }
}

export function toStoredTaskSeries(series: TaskSeries): TaskSeries {
  return {
    id: series.id,
    template: {
      title: series.template.title,
      ...optionalProperty('notes', series.template.notes),
      plannedDurationMinutes: series.template.plannedDurationMinutes,
    },
    ruleVersions: series.ruleVersions.map(mapRecurrenceRuleVersion),
    revision: series.revision,
  };
}

export const fromStoredTaskSeries = toStoredTaskSeries;

export function mapTaskPlacement(placement: TaskPlacement): TaskPlacement {
  switch (placement.kind) {
    case 'day':
      return { kind: 'day', date: localDate(placement.date) };
    case 'backlog':
      return { kind: 'backlog' };
    case 'none':
      return { kind: 'none' };
    default:
      return assertNever(placement);
  }
}

export function placementKeyFor(placement: TaskPlacement): TaskPlacementKey {
  switch (placement.kind) {
    case 'day':
      return `day:${localDate(placement.date)}`;
    case 'backlog':
      return 'backlog';
    case 'none':
      return 'none';
    default:
      return assertNever(placement);
  }
}

function taskOccurrenceBase(occurrence: TaskOccurrence) {
  return {
    id: occurrence.id,
    ...optionalProperty('seriesId', occurrence.seriesId),
    ...optionalProperty(
      'nominalDate',
      occurrence.nominalDate === undefined ? undefined : localDate(occurrence.nominalDate),
    ),
    ...optionalProperty('ruleRevision', occurrence.ruleRevision),
    title: occurrence.title,
    ...optionalProperty('notes', occurrence.notes),
    isException: occurrence.isException,
    createdSequence: occurrence.createdSequence,
    revision: occurrence.revision,
  };
}

function isBacklogTaskOccurrence(
  occurrence: BacklogTaskOccurrence | IncompleteDatedTaskOccurrence | CompletedDatedTaskOccurrence,
): occurrence is BacklogTaskOccurrence {
  return occurrence.placement.kind === 'backlog';
}

function mapTaskOccurrence(occurrence: TaskOccurrence): TaskOccurrence {
  const base = taskOccurrenceBase(occurrence);

  switch (occurrence.state) {
    case 'active': {
      if (isBacklogTaskOccurrence(occurrence)) {
        return {
          ...base,
          state: 'active',
          placement: { kind: 'backlog' },
          ...optionalProperty('plannedDurationMinutes', occurrence.plannedDurationMinutes),
        };
      }

      const datedBase = {
        ...base,
        state: 'active' as const,
        placement: {
          kind: 'day' as const,
          date: localDate(occurrence.placement.date),
        },
        plannedDurationMinutes: occurrence.plannedDurationMinutes,
        ...optionalProperty('dayPosition', occurrence.dayPosition),
      };

      switch (occurrence.completion) {
        case 'incomplete':
          return { ...datedBase, completion: 'incomplete' };
        case 'completed':
          return {
            ...datedBase,
            completion: 'completed',
            actualCompletedAt: instant(occurrence.actualCompletedAt),
          };
        default:
          return assertNever(occurrence);
      }
    }
    case 'finalized':
      return {
        ...base,
        state: 'finalized',
        placement: { kind: 'none' },
        ...optionalProperty('plannedDurationMinutes', occurrence.plannedDurationMinutes),
      };
    case 'deleted':
      return {
        ...base,
        state: 'deleted',
        placement: { kind: 'none' },
        ...optionalProperty('plannedDurationMinutes', occurrence.plannedDurationMinutes),
      };
    default:
      return assertNever(occurrence);
  }
}

export function toStoredTaskOccurrence(occurrence: TaskOccurrence): StoredTaskOccurrence {
  const mapped = mapTaskOccurrence(occurrence);
  return { ...mapped, placementKey: placementKeyFor(mapped.placement) };
}

export function fromStoredTaskOccurrence(occurrence: StoredTaskOccurrence): TaskOccurrence {
  const mapped = mapTaskOccurrence(occurrence);
  if (occurrence.placementKey !== placementKeyFor(mapped.placement)) {
    throw new Error('Stored task placementKey does not match its placement');
  }

  return mapped;
}

function mapTaskPlannedSnapshot(
  snapshot: TaskPlanEntry['plannedSnapshot'],
): TaskPlanEntry['plannedSnapshot'] {
  return {
    title: snapshot.title,
    ...optionalProperty('notes', snapshot.notes),
    plannedDurationMinutes: snapshot.plannedDurationMinutes,
  };
}

export function toStoredTaskPlanEntry(entry: TaskPlanEntry): TaskPlanEntry {
  const base = {
    id: entry.id,
    occurrenceId: entry.occurrenceId,
    date: localDate(entry.date),
    weekStart: localDate(entry.weekStart),
    plannedSnapshot: mapTaskPlannedSnapshot(entry.plannedSnapshot),
    enteredAt: instant(entry.enteredAt),
    ...optionalProperty(
      'finalizedAt',
      entry.finalizedAt === undefined ? undefined : instant(entry.finalizedAt),
    ),
  };

  switch (entry.outcome) {
    case 'planned':
      return { ...base, outcome: 'planned' };
    case 'completed':
      return { ...base, outcome: 'completed' };
    case 'moved':
      return {
        ...base,
        outcome: 'moved',
        destination: {
          kind: 'day',
          date: localDate(entry.destination.date),
        },
      };
    case 'backlogged':
      return {
        ...base,
        outcome: 'backlogged',
        destination: { kind: 'backlog' },
      };
    case 'canceled':
      return { ...base, outcome: 'canceled' };
    case 'kept-unfinished':
      return { ...base, outcome: 'kept-unfinished' };
    case 'deleted':
      return { ...base, outcome: 'deleted' };
    default:
      return assertNever(entry);
  }
}

export const fromStoredTaskPlanEntry = toStoredTaskPlanEntry;

function mapTaskValueSnapshot(snapshot: TaskValueSnapshot): TaskValueSnapshot {
  return {
    title: snapshot.title,
    ...optionalProperty('notes', snapshot.notes),
    ...optionalProperty('plannedDurationMinutes', snapshot.plannedDurationMinutes),
  };
}

function taskEventBase(event: TaskEvent) {
  return {
    id: event.id,
    sequence: event.sequence,
    occurrenceId: event.occurrenceId,
    ...optionalProperty('seriesId', event.seriesId),
    ...optionalProperty('planEntryId', event.planEntryId),
    effectiveDate: localDate(event.effectiveDate),
    occurredAt: instant(event.occurredAt),
  };
}

export function toStoredTaskEvent(event: TaskEvent): TaskEvent {
  const base = taskEventBase(event);

  switch (event.type) {
    case 'create':
      return {
        ...base,
        type: 'create',
        payload: {
          created: mapTaskValueSnapshot(event.payload.created),
          placement: mapTaskPlacement(event.payload.placement),
        },
      };
    case 'edit':
      return {
        ...base,
        type: 'edit',
        payload: {
          before: mapTaskValueSnapshot(event.payload.before),
          after: mapTaskValueSnapshot(event.payload.after),
        },
      };
    case 'completion-checked':
      return {
        ...base,
        type: 'completion-checked',
        payload: { date: localDate(event.payload.date) },
      };
    case 'completion-unchecked':
      return {
        ...base,
        type: 'completion-unchecked',
        payload: { date: localDate(event.payload.date) },
      };
    case 'move-to-date':
      return {
        ...base,
        type: 'move-to-date',
        payload: {
          from: mapTaskPlacement(event.payload.from),
          destination: {
            kind: 'day',
            date: localDate(event.payload.destination.date),
          },
        },
      };
    case 'move-to-backlog':
      return {
        ...base,
        type: 'move-to-backlog',
        payload: {
          from: {
            kind: 'day',
            date: localDate(event.payload.from.date),
          },
          destination: { kind: 'backlog' },
        },
      };
    case 'schedule-from-backlog':
      return {
        ...base,
        type: 'schedule-from-backlog',
        payload: {
          from: { kind: 'backlog' },
          destination: {
            kind: 'day',
            date: localDate(event.payload.destination.date),
          },
        },
      };
    case 'delete':
      return {
        ...base,
        type: 'delete',
        payload: {
          previousPlacement: mapTaskPlacement(event.payload.previousPlacement),
        },
      };
    case 'recurrence-change':
      return {
        ...base,
        type: 'recurrence-change',
        payload: { ruleRevision: event.payload.ruleRevision },
      };
    case 'occurrence-exception':
      return {
        ...base,
        type: 'occurrence-exception',
        payload: {
          before: mapTaskValueSnapshot(event.payload.before),
          after: mapTaskValueSnapshot(event.payload.after),
        },
      };
    case 'closure-keep':
      return {
        ...base,
        type: 'closure-keep',
        payload: { date: localDate(event.payload.date) },
      };
    case 'closure-move':
      return {
        ...base,
        type: 'closure-move',
        payload: {
          fromDate: localDate(event.payload.fromDate),
          destination:
            event.payload.destination.kind === 'day'
              ? {
                  kind: 'day',
                  date: localDate(event.payload.destination.date),
                }
              : { kind: 'backlog' },
        },
      };
    case 'closure-cancel':
      return {
        ...base,
        type: 'closure-cancel',
        payload: { date: localDate(event.payload.date) },
      };
    default:
      return assertNever(event);
  }
}

export const fromStoredTaskEvent = toStoredTaskEvent;

export function toStoredHabitDefinition(definition: HabitDefinition): HabitDefinition {
  return {
    id: definition.id,
    title: definition.title,
    ruleVersions: definition.ruleVersions.map(mapRecurrenceRuleVersion),
    revision: definition.revision,
  };
}

export const fromStoredHabitDefinition = toStoredHabitDefinition;

function mapHabitOutcomeEvent(event: HabitOutcomeEvent): HabitOutcomeEvent {
  const base = {
    ordinal: event.ordinal,
    occurredAt: instant(event.occurredAt),
  };

  switch (event.source) {
    case 'user':
      return { ...base, source: 'user', outcome: event.outcome };
    case 'date-boundary':
      return { ...base, source: 'date-boundary', outcome: 'not-completed' };
    case 'user-correction':
      return { ...base, source: 'user-correction', outcome: 'completed' };
    default:
      return assertNever(event);
  }
}

function mapHabitOutcome(outcome: HabitOutcome): HabitOutcome {
  switch (outcome) {
    case 'pending':
    case 'completed':
    case 'not-completed':
    case 'deleted':
      return outcome;
    default:
      return assertNever(outcome);
  }
}

export function toStoredHabitOccurrence(occurrence: HabitOccurrence): HabitOccurrence {
  return {
    id: occurrence.id,
    definitionId: occurrence.definitionId,
    date: localDate(occurrence.date),
    weekStart: localDate(occurrence.weekStart),
    definitionSnapshot: { title: occurrence.definitionSnapshot.title },
    ruleRevision: occurrence.ruleRevision,
    isException: occurrence.isException,
    outcome: mapHabitOutcome(occurrence.outcome),
    outcomeEvents: occurrence.outcomeEvents.map(mapHabitOutcomeEvent),
    updatedAt: instant(occurrence.updatedAt),
  };
}

export const fromStoredHabitOccurrence = toStoredHabitOccurrence;
