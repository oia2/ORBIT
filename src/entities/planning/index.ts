export {
  PlanningRepositoryProvider,
  usePlanningRepository,
  type PlanningRepositoryProviderProps,
} from './api/repository-context';
export { createIndexedDbPlanningRepository } from './api/indexeddb/indexeddb-planning-repository';
export { openOrbitPlanningDatabase, type DatabaseVersionChange } from './api/indexeddb/database';
export type {
  CommandResult,
  DomainOrStorageError,
  PlanningRepository,
  OpenPeriodRange,
  CloseDayDisposition,
} from './model/planning-repository';
export { TaskRow, type TaskRowProps } from './ui/TaskRow';
export { PeriodStatus, type PeriodStatusProps } from './ui/PeriodStatus';
export { HabitRow, type HabitRowProps } from './ui/HabitRow';
export { ScoreBreakdown, type ScoreBreakdownProps } from './ui/ScoreBreakdown';
export type {
  DayView,
  WeekView,
  BacklogView,
  HistoryView,
  HistorySelection,
  HistoricalDayFacts,
} from './model/history';
export type { Day, DailyStateEntry, ScoreBreakdown as ScoreBreakdownValue } from './model/day';
export type { ProjectedTaskMembership } from './model/history';
export type { HabitOccurrence, HabitOutcome } from './model/habit';
export type { RecurrenceRule, IsoWeekday } from './model/recurrence';
export { createOneOffTask, isDatedTaskOccurrence } from './model/task';
export { calculateWeeklyProgressFromClosedDays } from './model/week-completion';
export { calculateCompletionScore } from './model/scoring';
export type { BacklogTaskOccurrence } from './model/task';
