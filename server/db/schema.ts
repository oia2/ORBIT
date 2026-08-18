import type { ColumnType } from 'kysely';

import type {
  CreationSequence,
  DayPosition,
  DurationMinutes,
  EventSequence,
  HabitDefinitionId,
  HabitOccurrenceId,
  Revision,
  TaskEventId,
  TaskOccurrenceId,
  TaskPlanEntryId,
  TaskSeriesId,
} from '@/shared/lib/ids';
import type { Instant } from '@/shared/lib/local-date/clock';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { DailyStateEntry, DayClosureSnapshot } from '@/entities/planning/model/day';
import type {
  HabitDefinitionSnapshot,
  HabitOutcome,
  HabitOutcomeEvent,
} from '@/entities/planning/model/habit';
import type { RecurrenceRuleVersion } from '@/entities/planning/model/recurrence';
import type {
  TaskEventPayloadByType,
  TaskEventType,
  TaskPlannedSnapshot,
  TaskTemplate,
} from '@/entities/planning/model/task';
import type { WeekCompletionSnapshot, WeeklyGoal } from '@/entities/planning/model/week';

/**
 * A `jsonb` column. `pg` parses it into the domain shape on the way out, but
 * writes must be pre-serialized: node-postgres renders a JS array as a
 * PostgreSQL array literal rather than as JSON, which would corrupt every
 * order-significant array in the schema (`goals`, `ruleVersions`,
 * `outcomeEvents`).
 */
type Json<TValue> = ColumnType<TValue, string, string>;

type NullableJson<TValue> = ColumnType<TValue | null, string | null, string | null>;

export interface WeeksTable {
  readonly start_date: LocalDate;
  readonly status: 'open' | 'completed';
  readonly goals: Json<readonly WeeklyGoal[]>;
  readonly reflection: string | null;
  readonly completion_snapshot: NullableJson<WeekCompletionSnapshot>;
  readonly completed_at: Instant | null;
  readonly revision: Revision;
}

export interface DaysTable {
  readonly date: LocalDate;
  readonly week_start: LocalDate;
  readonly status: 'open' | 'closed';
  readonly state: NullableJson<DailyStateEntry>;
  readonly closure_snapshot: NullableJson<DayClosureSnapshot>;
  readonly closed_at: Instant | null;
  readonly revision: Revision;
}

export interface TaskSeriesTable {
  readonly id: TaskSeriesId;
  readonly template: Json<TaskTemplate>;
  readonly rule_versions: Json<readonly RecurrenceRuleVersion[]>;
  readonly revision: Revision;
}

export interface TaskOccurrencesTable {
  readonly id: TaskOccurrenceId;
  readonly series_id: TaskSeriesId | null;
  readonly nominal_date: LocalDate | null;
  readonly rule_revision: Revision | null;
  readonly title: string;
  readonly notes: string | null;
  readonly start_time: string | null;
  readonly end_time: string | null;
  readonly is_exception: boolean;
  readonly created_sequence: CreationSequence;
  readonly state: 'active' | 'finalized' | 'deleted';
  readonly placement_kind: 'day' | 'backlog' | 'none';
  readonly placement_date: LocalDate | null;
  readonly planned_duration_minutes: DurationMinutes | null;
  readonly completion: 'incomplete' | 'completed' | null;
  readonly actual_completed_at: Instant | null;
  readonly day_position: DayPosition | null;
  readonly revision: Revision;
}

export type TaskPlanEntryOutcome =
  'planned' | 'completed' | 'moved' | 'backlogged' | 'canceled' | 'kept-unfinished' | 'deleted';

export interface TaskPlanEntriesTable {
  readonly id: TaskPlanEntryId;
  readonly occurrence_id: TaskOccurrenceId;
  readonly plan_date: LocalDate;
  readonly week_start: LocalDate;
  readonly planned_snapshot: Json<TaskPlannedSnapshot>;
  readonly entered_at: Instant;
  readonly finalized_at: Instant | null;
  readonly outcome: TaskPlanEntryOutcome;
  readonly destination_kind: 'day' | 'backlog' | null;
  readonly destination_date: LocalDate | null;
}

/**
 * The discriminated event body. `data-model.md` gives `task_events` a single
 * `payload` column, so the discriminant and the membership reference travel
 * inside it rather than becoming columns the schema does not declare.
 */
export type TaskEventBody = {
  readonly [Type in TaskEventType]: {
    readonly type: Type;
    readonly planEntryId?: TaskPlanEntryId;
    readonly payload: TaskEventPayloadByType[Type];
  };
}[TaskEventType];

export interface TaskEventsTable {
  readonly sequence: EventSequence;
  readonly id: TaskEventId;
  readonly occurrence_id: TaskOccurrenceId | null;
  readonly series_id: TaskSeriesId | null;
  readonly effective_date: LocalDate | null;
  readonly occurred_at: Instant;
  readonly payload: Json<TaskEventBody>;
}

export interface HabitDefinitionsTable {
  readonly id: HabitDefinitionId;
  readonly title: string;
  readonly rule_versions: Json<readonly RecurrenceRuleVersion[]>;
  readonly revision: Revision;
}

export interface HabitOccurrencesTable {
  readonly id: HabitOccurrenceId;
  readonly definition_id: HabitDefinitionId;
  readonly date: LocalDate;
  readonly week_start: LocalDate;
  readonly definition_snapshot: Json<HabitDefinitionSnapshot>;
  readonly rule_revision: Revision;
  readonly is_exception: boolean;
  readonly outcome: HabitOutcome;
  readonly outcome_events: Json<readonly HabitOutcomeEvent[]>;
  readonly updated_at: Instant;
}

export interface Database {
  readonly weeks: WeeksTable;
  readonly days: DaysTable;
  readonly task_series: TaskSeriesTable;
  readonly task_occurrences: TaskOccurrencesTable;
  readonly task_plan_entries: TaskPlanEntriesTable;
  readonly task_events: TaskEventsTable;
  readonly habit_definitions: HabitDefinitionsTable;
  readonly habit_occurrences: HabitOccurrencesTable;
}

export const DATABASE_TABLE_NAMES = [
  'weeks',
  'days',
  'task_series',
  'task_occurrences',
  'task_plan_entries',
  'task_events',
  'habit_definitions',
  'habit_occurrences',
] as const satisfies readonly (keyof Database)[];

export type DatabaseTableName = (typeof DATABASE_TABLE_NAMES)[number];
