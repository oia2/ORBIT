import type { Insertable, Selectable } from 'kysely';

import { assertNever } from '@/shared/lib/result';

import type { Day } from '@/entities/planning/model/day';
import type { HabitDefinition, HabitOccurrence } from '@/entities/planning/model/habit';
import type {
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
  TaskSeries,
} from '@/entities/planning/model/task';
import type { Week } from '@/entities/planning/model/week';

import type {
  DaysTable,
  HabitDefinitionsTable,
  HabitOccurrencesTable,
  TaskEventBody,
  TaskEventsTable,
  TaskOccurrencesTable,
  TaskPlanEntriesTable,
  TaskSeriesTable,
  WeeksTable,
} from '../db/schema';

export type WeekRow = Selectable<WeeksTable>;
export type DayRow = Selectable<DaysTable>;
export type TaskSeriesRow = Selectable<TaskSeriesTable>;
export type TaskOccurrenceRow = Selectable<TaskOccurrencesTable>;
export type TaskPlanEntryRow = Selectable<TaskPlanEntriesTable>;
export type TaskEventRow = Selectable<TaskEventsTable>;
export type HabitDefinitionRow = Selectable<HabitDefinitionsTable>;
export type HabitOccurrenceRow = Selectable<HabitOccurrencesTable>;

export type WeekValues = Insertable<WeeksTable>;
export type DayValues = Insertable<DaysTable>;
export type TaskSeriesValues = Insertable<TaskSeriesTable>;
export type TaskOccurrenceValues = Insertable<TaskOccurrencesTable>;
export type TaskPlanEntryValues = Insertable<TaskPlanEntriesTable>;
export type TaskEventValues = Insertable<TaskEventsTable>;
export type HabitDefinitionValues = Insertable<HabitDefinitionsTable>;
export type HabitOccurrenceValues = Insertable<HabitOccurrencesTable>;

/**
 * A `?` domain field is `undefined`, never `null`. Emitting `null` instead
 * would change deep-equality results across the whole feature-001 suite, so
 * every optional field goes through here on the way out of a row.
 */
function optional<Key extends string, Value>(
  key: Key,
  value: Value | null | undefined,
): Partial<Record<Key, Value>> {
  const result: Partial<Record<Key, Value>> = {};
  if (value !== null && value !== undefined) {
    result[key] = value;
  }

  return result;
}

function nullable<Value>(value: Value | undefined): Exclude<Value, undefined> | null {
  return (value ?? null) as Exclude<Value, undefined> | null;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function nullableJson(value: unknown): string | null {
  return value === undefined ? null : json(value);
}

// ── weeks ────────────────────────────────────────────────────────────────────

export function toWeekValues(week: Week): WeekValues {
  const base = {
    start_date: week.startDate,
    goals: json(week.goals),
    reflection: nullable(week.reflection),
    revision: week.revision,
  };

  switch (week.status) {
    case 'open':
      return { ...base, status: 'open', completion_snapshot: null, completed_at: null };
    case 'completed':
      return {
        ...base,
        status: 'completed',
        completion_snapshot: json(week.completionSnapshot),
        completed_at: week.completedAt,
      };
    default:
      return assertNever(week);
  }
}

export function fromWeekRow(row: WeekRow): Week {
  const base = {
    startDate: row.start_date,
    goals: row.goals,
    revision: row.revision,
    ...optional('reflection', row.reflection),
  };

  if (row.status === 'completed') {
    if (row.completion_snapshot === null || row.completed_at === null) {
      throw new Error(`Completed week ${row.start_date} is missing its frozen snapshot`);
    }
    return {
      ...base,
      status: 'completed',
      completionSnapshot: row.completion_snapshot,
      completedAt: row.completed_at,
    };
  }

  return { ...base, status: 'open' };
}

// ── days ─────────────────────────────────────────────────────────────────────

export function toDayValues(day: Day): DayValues {
  const base = {
    date: day.date,
    week_start: day.weekStart,
    state: nullableJson(day.state),
    revision: day.revision,
  };

  switch (day.status) {
    case 'open':
      return { ...base, status: 'open', closure_snapshot: null, closed_at: null };
    case 'closed':
      return {
        ...base,
        status: 'closed',
        closure_snapshot: json(day.closureSnapshot),
        closed_at: day.closedAt,
      };
    default:
      return assertNever(day);
  }
}

export function fromDayRow(row: DayRow): Day {
  const base = {
    date: row.date,
    weekStart: row.week_start,
    revision: row.revision,
    ...optional('state', row.state),
  };

  if (row.status === 'closed') {
    if (row.closure_snapshot === null || row.closed_at === null) {
      throw new Error(`Closed day ${row.date} is missing its closure snapshot`);
    }
    return {
      ...base,
      status: 'closed',
      closureSnapshot: row.closure_snapshot,
      closedAt: row.closed_at,
    };
  }

  return { ...base, status: 'open' };
}

// ── task series ──────────────────────────────────────────────────────────────

export function toTaskSeriesValues(series: TaskSeries): TaskSeriesValues {
  return {
    id: series.id,
    template: json(series.template),
    rule_versions: json(series.ruleVersions),
    revision: series.revision,
  };
}

export function fromTaskSeriesRow(row: TaskSeriesRow): TaskSeries {
  return {
    id: row.id,
    template: row.template,
    ruleVersions: row.rule_versions,
    revision: row.revision,
  };
}

// ── task occurrences ─────────────────────────────────────────────────────────

export function toTaskOccurrenceValues(occurrence: TaskOccurrence): TaskOccurrenceValues {
  const base = {
    id: occurrence.id,
    series_id: nullable(occurrence.seriesId),
    nominal_date: nullable(occurrence.nominalDate),
    rule_revision: nullable(occurrence.ruleRevision),
    title: occurrence.title,
    notes: nullable(occurrence.notes),
    start_time: nullable(occurrence.startTime),
    end_time: nullable(occurrence.endTime),
    is_exception: occurrence.isException,
    created_sequence: occurrence.createdSequence,
    planned_duration_minutes: nullable(occurrence.plannedDurationMinutes),
    revision: occurrence.revision,
  };

  switch (occurrence.state) {
    case 'active': {
      // `'completion' in occurrence` is the reliable narrowing here: it is the
      // only property the dated variants have and the backlog variant lacks.
      if (!('completion' in occurrence)) {
        return {
          ...base,
          state: 'active',
          placement_kind: 'backlog',
          placement_date: null,
          completion: null,
          actual_completed_at: null,
          day_position: null,
        };
      }

      return {
        ...base,
        state: 'active',
        placement_kind: 'day',
        placement_date: occurrence.placement.date,
        planned_duration_minutes: occurrence.plannedDurationMinutes,
        day_position: nullable(occurrence.dayPosition),
        ...(occurrence.completion === 'completed'
          ? { completion: 'completed' as const, actual_completed_at: occurrence.actualCompletedAt }
          : { completion: 'incomplete' as const, actual_completed_at: null }),
      };
    }
    case 'finalized':
    case 'deleted':
      return {
        ...base,
        state: occurrence.state,
        placement_kind: 'none',
        placement_date: null,
        completion: null,
        actual_completed_at: null,
        day_position: null,
      };
    default:
      return assertNever(occurrence);
  }
}

export function fromTaskOccurrenceRow(row: TaskOccurrenceRow): TaskOccurrence {
  const base = {
    id: row.id,
    ...optional('seriesId', row.series_id),
    ...optional('nominalDate', row.nominal_date),
    ...optional('ruleRevision', row.rule_revision),
    title: row.title,
    ...optional('notes', row.notes),
    ...optional('startTime', row.start_time),
    ...optional('endTime', row.end_time),
    isException: row.is_exception,
    createdSequence: row.created_sequence,
    revision: row.revision,
  };

  if (row.state === 'finalized' || row.state === 'deleted') {
    return {
      ...base,
      state: row.state,
      placement: { kind: 'none' },
      ...optional('plannedDurationMinutes', row.planned_duration_minutes),
    };
  }

  if (row.placement_kind === 'backlog') {
    return {
      ...base,
      state: 'active',
      placement: { kind: 'backlog' },
      ...optional('plannedDurationMinutes', row.planned_duration_minutes),
    };
  }

  if (row.placement_date === null || row.planned_duration_minutes === null) {
    throw new Error(`Dated task ${row.id} is missing its date or planned duration`);
  }

  const dated = {
    ...base,
    state: 'active' as const,
    placement: { kind: 'day' as const, date: row.placement_date },
    plannedDurationMinutes: row.planned_duration_minutes,
    ...optional('dayPosition', row.day_position),
  };

  if (row.completion === 'completed') {
    if (row.actual_completed_at === null) {
      throw new Error(`Completed task ${row.id} is missing its completion instant`);
    }
    return { ...dated, completion: 'completed', actualCompletedAt: row.actual_completed_at };
  }

  return { ...dated, completion: 'incomplete' };
}

// ── task plan entries ────────────────────────────────────────────────────────

export function toTaskPlanEntryValues(entry: TaskPlanEntry): TaskPlanEntryValues {
  const base = {
    id: entry.id,
    occurrence_id: entry.occurrenceId,
    plan_date: entry.date,
    week_start: entry.weekStart,
    planned_snapshot: json(entry.plannedSnapshot),
    entered_at: entry.enteredAt,
    finalized_at: nullable(entry.finalizedAt),
  };

  switch (entry.outcome) {
    case 'moved':
      return {
        ...base,
        outcome: 'moved',
        destination_kind: 'day',
        destination_date: entry.destination.date,
      };
    case 'backlogged':
      return {
        ...base,
        outcome: 'backlogged',
        destination_kind: 'backlog',
        destination_date: null,
      };
    case 'planned':
    case 'completed':
    case 'canceled':
    case 'kept-unfinished':
    case 'deleted':
      return {
        ...base,
        outcome: entry.outcome,
        destination_kind: null,
        destination_date: null,
      };
    default:
      return assertNever(entry);
  }
}

export function fromTaskPlanEntryRow(row: TaskPlanEntryRow): TaskPlanEntry {
  const base = {
    id: row.id,
    occurrenceId: row.occurrence_id,
    date: row.plan_date,
    weekStart: row.week_start,
    plannedSnapshot: row.planned_snapshot,
    enteredAt: row.entered_at,
    ...optional('finalizedAt', row.finalized_at),
  };

  switch (row.outcome) {
    case 'moved':
      if (row.destination_date === null) {
        throw new Error(`Moved membership ${row.id} is missing its destination date`);
      }
      return {
        ...base,
        outcome: 'moved',
        destination: { kind: 'day', date: row.destination_date },
      };
    case 'backlogged':
      return { ...base, outcome: 'backlogged', destination: { kind: 'backlog' } };
    case 'planned':
    case 'completed':
    case 'canceled':
    case 'kept-unfinished':
    case 'deleted':
      return { ...base, outcome: row.outcome };
    default:
      return assertNever(row.outcome);
  }
}

// ── task events ──────────────────────────────────────────────────────────────

export function toTaskEventValues(event: TaskEvent): TaskEventValues {
  const body = {
    type: event.type,
    ...optional('planEntryId', event.planEntryId),
    payload: event.payload,
  } as TaskEventBody;

  return {
    sequence: event.sequence,
    id: event.id,
    occurrence_id: event.occurrenceId,
    series_id: nullable(event.seriesId),
    effective_date: event.effectiveDate,
    occurred_at: event.occurredAt,
    payload: json(body),
  };
}

export function fromTaskEventRow(row: TaskEventRow): TaskEvent {
  if (row.occurrence_id === null || row.effective_date === null) {
    throw new Error(`Audit event ${row.id} is missing its occurrence or effective date`);
  }

  const body = row.payload;
  return {
    id: row.id,
    sequence: row.sequence,
    occurrenceId: row.occurrence_id,
    ...optional('seriesId', row.series_id),
    ...optional('planEntryId', body.planEntryId),
    effectiveDate: row.effective_date,
    occurredAt: row.occurred_at,
    type: body.type,
    payload: body.payload,
  } as TaskEvent;
}

// ── habits ───────────────────────────────────────────────────────────────────

export function toHabitDefinitionValues(definition: HabitDefinition): HabitDefinitionValues {
  return {
    id: definition.id,
    title: definition.title,
    rule_versions: json(definition.ruleVersions),
    revision: definition.revision,
  };
}

export function fromHabitDefinitionRow(row: HabitDefinitionRow): HabitDefinition {
  return {
    id: row.id,
    title: row.title,
    ruleVersions: row.rule_versions,
    revision: row.revision,
  };
}

export function toHabitOccurrenceValues(occurrence: HabitOccurrence): HabitOccurrenceValues {
  return {
    id: occurrence.id,
    definition_id: occurrence.definitionId,
    date: occurrence.date,
    week_start: occurrence.weekStart,
    definition_snapshot: json(occurrence.definitionSnapshot),
    rule_revision: occurrence.ruleRevision,
    is_exception: occurrence.isException,
    outcome: occurrence.outcome,
    outcome_events: json(occurrence.outcomeEvents),
    updated_at: occurrence.updatedAt,
  };
}

export function fromHabitOccurrenceRow(row: HabitOccurrenceRow): HabitOccurrence {
  return {
    id: row.id,
    definitionId: row.definition_id,
    date: row.date,
    weekStart: row.week_start,
    definitionSnapshot: row.definition_snapshot,
    ruleRevision: row.rule_revision,
    isException: row.is_exception,
    outcome: row.outcome,
    outcomeEvents: row.outcome_events,
    updatedAt: row.updated_at,
  };
}
