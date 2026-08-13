import type { Instant } from '@/shared/lib/local-date/clock';
import { startOfWeek, weekDates, type LocalDate } from '@/shared/lib/local-date/local-date';
import { INITIAL_REVISION, nextRevision, type Revision, type WeekGoalId } from '@/shared/lib/ids';
import { err, ok, type Result } from '@/shared/lib/result';

import { createOpenDay, type Day, type ScoreBreakdown } from './day';

export interface WeeklyGoal {
  readonly id: WeekGoalId;
  readonly statement: string;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface WeekCompletionSnapshot {
  readonly progress: ScoreBreakdown;
}

interface WeekBase {
  /** Natural identity: the Monday starting this fixed calendar week. */
  readonly startDate: LocalDate;
  readonly goals: readonly WeeklyGoal[];
  readonly revision: Revision;
}

export interface OpenWeek extends WeekBase {
  readonly status: 'open';
  readonly reflection?: string;
}

export interface CompletedWeek extends WeekBase {
  readonly status: 'completed';
  readonly reflection?: string;
  readonly completionSnapshot: WeekCompletionSnapshot;
  readonly completedAt: Instant;
}

export type Week = OpenWeek | CompletedWeek;

export function isCompletedWeek(week: Week): week is CompletedWeek {
  return week.status === 'completed';
}

export interface EnsureCalendarWeekInput {
  readonly date: LocalDate;
  readonly week?: Week;
  readonly days?: readonly Day[];
}

export interface EnsuredCalendarWeek<TWeek extends Week = Week> {
  readonly week: TWeek;
  readonly days: readonly Day[];
  readonly createdWeek: boolean;
  readonly createdDates: readonly LocalDate[];
}

export interface WeeklyGoalMutationInput {
  readonly id: WeekGoalId;
  readonly statement: string;
  readonly at: Instant;
}

export type WeeklyGoalPolicyError =
  | { readonly code: 'WeekCompleted' }
  | { readonly code: 'GoalStatementRequired' }
  | { readonly code: 'GoalAlreadyExists'; readonly id: WeekGoalId }
  | { readonly code: 'GoalNotFound'; readonly id: WeekGoalId }
  | { readonly code: 'GoalOrderMismatch' };

export function normalizeWeeklyGoalStatement(statement: string): string | undefined {
  const normalized = statement.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function createOpenWeek(date: LocalDate): OpenWeek {
  return {
    startDate: startOfWeek(date),
    goals: [],
    status: 'open',
    revision: INITIAL_REVISION,
  };
}

function ensureOwnedDays(
  week: Week,
  suppliedDays: readonly Day[],
): {
  readonly days: readonly Day[];
  readonly createdDates: readonly LocalDate[];
} {
  const expectedDates = weekDates(week.startDate);
  const expectedSet = new Set<LocalDate>(expectedDates);
  const suppliedByDate = new Map<LocalDate, Day>();

  for (const day of suppliedDays) {
    if (!expectedSet.has(day.date) || day.weekStart !== week.startDate) {
      throw new RangeError(`Day ${day.date} does not belong to calendar week ${week.startDate}`);
    }
    if (suppliedByDate.has(day.date)) {
      throw new RangeError(`Duplicate Day ${day.date}`);
    }
    suppliedByDate.set(day.date, day);
  }

  const createdDates: LocalDate[] = [];
  const days = expectedDates.map((date) => {
    const existing = suppliedByDate.get(date);
    if (existing !== undefined) {
      return existing;
    }
    if (week.status === 'completed') {
      throw new RangeError(`Completed week ${week.startDate} is missing Day ${date}`);
    }
    createdDates.push(date);
    return createOpenDay(date);
  });

  return { days, createdDates };
}

export function ensureCalendarWeek(
  input: EnsureCalendarWeekInput & { readonly week?: OpenWeek },
): EnsuredCalendarWeek<OpenWeek>;
export function ensureCalendarWeek(
  input: EnsureCalendarWeekInput & { readonly week: CompletedWeek },
): EnsuredCalendarWeek<CompletedWeek>;
export function ensureCalendarWeek(input: EnsureCalendarWeekInput): EnsuredCalendarWeek;
export function ensureCalendarWeek(input: EnsureCalendarWeekInput): EnsuredCalendarWeek {
  const canonicalStart = startOfWeek(input.date);
  const week = input.week ?? createOpenWeek(input.date);

  if (week.startDate !== canonicalStart) {
    throw new RangeError(`Week ${week.startDate} does not own requested date ${input.date}`);
  }

  const { days, createdDates } = ensureOwnedDays(week, input.days ?? []);
  return {
    week,
    days,
    createdWeek: input.week === undefined,
    createdDates,
  };
}

function requireOpenWeek(week: Week): Result<OpenWeek, WeeklyGoalPolicyError> {
  return week.status === 'open' ? ok(week) : err({ code: 'WeekCompleted' });
}

export function addWeeklyGoal(
  week: Week,
  input: WeeklyGoalMutationInput,
): Result<OpenWeek, WeeklyGoalPolicyError> {
  const open = requireOpenWeek(week);
  if (!open.ok) {
    return open;
  }
  const statement = normalizeWeeklyGoalStatement(input.statement);
  if (statement === undefined) {
    return err({ code: 'GoalStatementRequired' });
  }
  if (week.goals.some((goal) => goal.id === input.id)) {
    return err({ code: 'GoalAlreadyExists', id: input.id });
  }

  const goal: WeeklyGoal = {
    id: input.id,
    statement,
    createdAt: input.at,
    updatedAt: input.at,
  };
  return ok({
    ...open.value,
    goals: [...open.value.goals, goal],
    revision: nextRevision(open.value.revision),
  });
}

export function editWeeklyGoal(
  week: Week,
  input: WeeklyGoalMutationInput,
): Result<OpenWeek, WeeklyGoalPolicyError> {
  const open = requireOpenWeek(week);
  if (!open.ok) {
    return open;
  }
  const statement = normalizeWeeklyGoalStatement(input.statement);
  if (statement === undefined) {
    return err({ code: 'GoalStatementRequired' });
  }
  if (!open.value.goals.some((goal) => goal.id === input.id)) {
    return err({ code: 'GoalNotFound', id: input.id });
  }

  return ok({
    ...open.value,
    goals: open.value.goals.map((goal) =>
      goal.id === input.id ? { ...goal, statement, updatedAt: input.at } : goal,
    ),
    revision: nextRevision(open.value.revision),
  });
}

export function reorderWeeklyGoals(
  week: Week,
  orderedGoalIds: readonly WeekGoalId[],
): Result<OpenWeek, WeeklyGoalPolicyError> {
  const open = requireOpenWeek(week);
  if (!open.ok) {
    return open;
  }

  const uniqueIds = new Set(orderedGoalIds);
  const goalsById = new Map(open.value.goals.map((goal) => [goal.id, goal]));
  if (
    orderedGoalIds.length !== open.value.goals.length ||
    uniqueIds.size !== orderedGoalIds.length ||
    orderedGoalIds.some((id) => !goalsById.has(id))
  ) {
    return err({ code: 'GoalOrderMismatch' });
  }

  return ok({
    ...open.value,
    goals: orderedGoalIds.map((id) => {
      const goal = goalsById.get(id);
      if (goal === undefined) {
        throw new Error(`Validated weekly-goal order omitted ${id}`);
      }
      return goal;
    }),
    revision: nextRevision(open.value.revision),
  });
}

export function deleteWeeklyGoal(
  week: Week,
  id: WeekGoalId,
): Result<OpenWeek, WeeklyGoalPolicyError> {
  const open = requireOpenWeek(week);
  if (!open.ok) {
    return open;
  }
  if (!open.value.goals.some((goal) => goal.id === id)) {
    return err({ code: 'GoalNotFound', id });
  }

  return ok({
    ...open.value,
    goals: open.value.goals.filter((goal) => goal.id !== id),
    revision: nextRevision(open.value.revision),
  });
}
