import type {
  DayPosition,
  DurationMinutes,
  HabitDefinitionId,
  HabitOccurrenceId,
  Revision,
  TaskOccurrenceId,
  TaskSeriesId,
  WeekGoalId,
} from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { DailyStateEntry, DayClosureSnapshot } from './day';
import type { BacklogView, DayView, HistoryView, TaskHistoryView, WeekView } from './history';
import type { RecurrenceRule } from './recurrence';
import type { BacklogTaskPlacement, DayTaskPlacement, TaskTemplate } from './task';
import type { WeekCompletionSnapshot } from './week';

export interface ValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type DomainOrStorageError =
  | {
      readonly code: 'ValidationFailure';
      readonly issues: readonly ValidationIssue[];
    }
  | {
      readonly code: 'NotFound';
      readonly entity: string;
      readonly id: string;
    }
  | {
      readonly code: 'PeriodImmutable';
      readonly date?: LocalDate;
      readonly weekStart?: LocalDate;
    }
  | {
      readonly code: 'InvalidTransition';
      readonly entity: string;
      readonly currentState: string;
      readonly attemptedTransition: string;
    }
  | {
      readonly code: 'TaskMustBeIncompleteToMove';
      readonly occurrenceId: TaskOccurrenceId;
    }
  | {
      readonly code: 'MoveTargetClosed';
      readonly destinationDate: LocalDate;
    }
  | {
      readonly code: 'FutureDayClosure';
      readonly date: LocalDate;
      readonly currentLocalDate: LocalDate;
    }
  | {
      readonly code: 'PendingHabitOutcomes';
      readonly occurrenceIds: readonly HabitOccurrenceId[];
    }
  | {
      readonly code: 'ClosureDispositionMismatch';
      readonly expectedOccurrenceIds: readonly TaskOccurrenceId[];
      readonly receivedOccurrenceIds: readonly TaskOccurrenceId[];
    }
  | {
      readonly code: 'WeekNotClosable';
      readonly weekStart: LocalDate;
      readonly openDates: readonly LocalDate[];
    }
  | {
      readonly code: 'RevisionConflict';
      readonly expectedRevision: Revision;
      readonly actualRevision: Revision;
    }
  | {
      readonly code: 'StorageUnavailable';
      readonly message: string;
    }
  | {
      readonly code: 'QuotaExceeded';
      readonly message: string;
    }
  | {
      readonly code: 'UpgradeBlocked';
      readonly currentVersion: number;
      readonly requestedVersion: number;
    }
  | {
      readonly code: 'UnexpectedStorageFailure';
      readonly message: string;
    };

export type QueryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainOrStorageError };

export type CommandResult<T = undefined> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly affectedDates: readonly LocalDate[];
      readonly affectedWeeks: readonly LocalDate[];
    }
  | { readonly ok: false; readonly error: DomainOrStorageError };

export type HistoryQuery =
  | { readonly mode: 'day'; readonly anchorDate: LocalDate }
  | { readonly mode: 'week'; readonly anchorDate: LocalDate }
  | {
      readonly mode: 'month';
      readonly anchorDate: LocalDate;
      readonly selectedDate: LocalDate;
    };

/** Internal, page-derived bounds; callers cannot provide arbitrary from/to dates. */
export type OpenPeriodRange =
  | { readonly kind: 'day'; readonly date: LocalDate }
  | { readonly kind: 'week'; readonly weekStart: LocalDate }
  | { readonly kind: 'month'; readonly anchorDate: LocalDate };

export interface EnsureCalendarWeekInput {
  readonly date: LocalDate;
}

export interface AddWeeklyGoalInput {
  readonly weekStart: LocalDate;
  readonly statement: string;
  readonly expectedRevision: Revision;
}

export interface EditWeeklyGoalInput extends AddWeeklyGoalInput {
  readonly goalId: WeekGoalId;
}

export interface ReorderWeeklyGoalsInput {
  readonly weekStart: LocalDate;
  readonly orderedGoalIds: readonly WeekGoalId[];
  readonly expectedRevision: Revision;
}

export interface DeleteWeeklyGoalInput {
  readonly weekStart: LocalDate;
  readonly goalId: WeekGoalId;
  readonly expectedRevision: Revision;
}

export interface CreateTaskInput {
  readonly title: string;
  readonly notes?: string;
  readonly placement: DayTaskPlacement | BacklogTaskPlacement;
  readonly durationMinutes?: DurationMinutes;
  readonly dayPosition?: DayPosition;
}

export interface EditTaskOccurrenceInput {
  readonly occurrenceId: TaskOccurrenceId;
  readonly title?: string;
  readonly notes?: string;
  readonly durationMinutes?: DurationMinutes;
  readonly expectedRevision: Revision;
}

export interface SetTaskCompletionInput {
  readonly occurrenceId: TaskOccurrenceId;
  readonly date: LocalDate;
  readonly completed: boolean;
  readonly expectedRevision: Revision;
}

export interface MoveTaskToDateInput {
  readonly occurrenceId: TaskOccurrenceId;
  readonly destinationDate: LocalDate;
  readonly durationMinutes: DurationMinutes;
  readonly dayPosition: DayPosition;
  readonly expectedRevision: Revision;
}

export interface MoveTaskToBacklogInput {
  readonly occurrenceId: TaskOccurrenceId;
  readonly expectedRevision: Revision;
}

export interface DeleteTaskOccurrenceInput {
  readonly occurrenceId: TaskOccurrenceId;
  readonly expectedRevision: Revision;
}

export interface ReorderDatedTasksInput {
  readonly date: LocalDate;
  readonly orderedOccurrenceIds: readonly TaskOccurrenceId[];
  readonly expectedDayRevision: Revision;
}

export interface CreateTaskSeriesInput {
  readonly template: TaskTemplate;
  readonly recurrenceRule: RecurrenceRule;
}

export interface UpdateTaskSeriesRuleInput {
  readonly seriesId: TaskSeriesId;
  readonly recurrenceRule: RecurrenceRule;
  readonly expectedRevision: Revision;
}

export interface StopTaskSeriesInput {
  readonly seriesId: TaskSeriesId;
  readonly expectedRevision: Revision;
}

export interface CreateHabitDefinitionInput {
  readonly title: string;
  readonly recurrenceRule: RecurrenceRule;
}

export interface UpdateHabitRuleInput {
  readonly definitionId: HabitDefinitionId;
  readonly recurrenceRule: RecurrenceRule;
  readonly expectedRevision: Revision;
}

export interface StopHabitDefinitionInput {
  readonly definitionId: HabitDefinitionId;
  readonly expectedRevision: Revision;
}

export interface EditHabitOccurrenceInput {
  readonly occurrenceId: HabitOccurrenceId;
  readonly title: string;
  readonly expectedRevision: Revision;
}

export interface RecordHabitOutcomeInput {
  readonly occurrenceId: HabitOccurrenceId;
  readonly outcome: 'completed' | 'not-completed';
  readonly expectedRevision: Revision;
}

export interface CorrectBoundaryMissInput {
  readonly occurrenceId: HabitOccurrenceId;
  readonly expectedRevision: Revision;
}

export interface DeleteHabitOccurrenceInput {
  readonly occurrenceId: HabitOccurrenceId;
  readonly expectedRevision: Revision;
}

export interface SaveDailyStateInput {
  readonly date: LocalDate;
  readonly energy?: DailyStateEntry['energy'];
  readonly mood?: DailyStateEntry['mood'];
  readonly sleepDurationMinutes?: DailyStateEntry['sleepDurationMinutes'];
  readonly expectedDayRevision: Revision;
}

export type CloseDayDisposition =
  | { readonly kind: 'keep-unfinished' }
  | {
      readonly kind: 'move-to-date';
      readonly destinationDate: LocalDate;
      readonly durationMinutes: DurationMinutes;
      readonly dayPosition: DayPosition;
    }
  | { readonly kind: 'move-to-backlog' }
  | { readonly kind: 'cancel' };

export interface CloseDayInput {
  readonly date: LocalDate;
  readonly expectedDayRevision: Revision;
  readonly dispositions: Readonly<Record<string, CloseDayDisposition>>;
}

export interface CompleteWeekInput {
  readonly weekStart: LocalDate;
  readonly reflection?: string;
  readonly expectedWeekRevision: Revision;
}

/**
 * The only persistence boundary exposed to pages/features. It contains named
 * use cases and domain projections, never generic CRUD, store names, IDB handles,
 * caller-selected audit instants, or caller-selected recurrence effective dates.
 */
export interface PlanningRepository {
  getWeekView(dateOrWeekStart: LocalDate): Promise<QueryResult<WeekView>>;
  getDayView(date: LocalDate): Promise<QueryResult<DayView>>;
  getBacklogView(): Promise<QueryResult<BacklogView>>;
  getHistoryView(query: HistoryQuery): Promise<QueryResult<HistoryView>>;
  getTaskHistory(occurrenceId: TaskOccurrenceId): Promise<QueryResult<TaskHistoryView>>;

  prepareOpenPeriod(range: OpenPeriodRange): Promise<CommandResult>;
  ensureCalendarWeek(input: EnsureCalendarWeekInput): Promise<CommandResult<LocalDate>>;

  addWeeklyGoal(input: AddWeeklyGoalInput): Promise<CommandResult<WeekGoalId>>;
  editWeeklyGoal(input: EditWeeklyGoalInput): Promise<CommandResult>;
  reorderWeeklyGoals(input: ReorderWeeklyGoalsInput): Promise<CommandResult>;
  deleteWeeklyGoal(input: DeleteWeeklyGoalInput): Promise<CommandResult>;

  createTask(input: CreateTaskInput): Promise<CommandResult<TaskOccurrenceId>>;
  editTaskOccurrence(input: EditTaskOccurrenceInput): Promise<CommandResult>;
  setTaskCompletion(input: SetTaskCompletionInput): Promise<CommandResult>;
  moveTaskToDate(input: MoveTaskToDateInput): Promise<CommandResult>;
  moveTaskToBacklog(input: MoveTaskToBacklogInput): Promise<CommandResult>;
  deleteTaskOccurrence(input: DeleteTaskOccurrenceInput): Promise<CommandResult>;
  reorderDatedTasks(input: ReorderDatedTasksInput): Promise<CommandResult>;

  createTaskSeries(input: CreateTaskSeriesInput): Promise<CommandResult<TaskSeriesId>>;
  updateTaskSeriesRule(input: UpdateTaskSeriesRuleInput): Promise<CommandResult>;
  stopTaskSeries(input: StopTaskSeriesInput): Promise<CommandResult>;

  createHabitDefinition(
    input: CreateHabitDefinitionInput,
  ): Promise<CommandResult<HabitDefinitionId>>;
  updateHabitRule(input: UpdateHabitRuleInput): Promise<CommandResult>;
  stopHabitDefinition(input: StopHabitDefinitionInput): Promise<CommandResult>;
  editHabitOccurrence(input: EditHabitOccurrenceInput): Promise<CommandResult>;
  recordHabitOutcome(input: RecordHabitOutcomeInput): Promise<CommandResult>;
  correctBoundaryMissToCompleted(input: CorrectBoundaryMissInput): Promise<CommandResult>;
  deleteHabitOccurrence(input: DeleteHabitOccurrenceInput): Promise<CommandResult>;

  saveDailyState(input: SaveDailyStateInput): Promise<CommandResult>;
  closeDay(input: CloseDayInput): Promise<CommandResult<DayClosureSnapshot>>;
  completeWeek(input: CompleteWeekInput): Promise<CommandResult<WeekCompletionSnapshot>>;
}
