import type { Instant } from '@/shared/lib/local-date/clock';
import { startOfWeek, weekDates, type LocalDate } from '@/shared/lib/local-date/local-date';
import {
  INITIAL_REVISION,
  isNonNegativeInteger,
  nextRevision,
  nonNegativeDurationMinutes,
  type NonNegativeDurationMinutes,
  type Revision,
} from '@/shared/lib/ids';
import { err, ok, type Result } from '@/shared/lib/result';

export type FivePointOrdinal = 1 | 2 | 3 | 4 | 5;

export interface DailyStateEntry {
  readonly energy?: FivePointOrdinal;
  readonly mood?: FivePointOrdinal;
  readonly sleepDurationMinutes?: NonNegativeDurationMinutes;
  readonly updatedAt: Instant;
}

export interface AvailableCompletionCategory {
  readonly completed: number;
  readonly applicable: number;
  readonly rate: number;
}

export interface UnavailableCompletionCategory {
  readonly completed: 0;
  readonly applicable: 0;
  readonly rate: 'unavailable';
}

export type CompletionCategoryBreakdown =
  AvailableCompletionCategory | UnavailableCompletionCategory;

export interface AppliedScoreWeights {
  /** Normalized percentage weight (0, 70, or 100). */
  readonly task: 0 | 70 | 100;
  /** Normalized percentage weight (0, 30, or 100). */
  readonly habit: 0 | 30 | 100;
}

/** Shared serialized result for both Daily Score and Weekly Progress. */
export interface ScoreBreakdown {
  readonly task: CompletionCategoryBreakdown;
  readonly habit: CompletionCategoryBreakdown;
  readonly value: number | 'unavailable';
  readonly weightsApplied: AppliedScoreWeights;
}

export interface DayClosureSnapshot {
  readonly score: ScoreBreakdown;
  readonly plannedLoadMinutes: NonNegativeDurationMinutes;
}

interface DayBase {
  readonly date: LocalDate;
  readonly weekStart: LocalDate;
  readonly state?: DailyStateEntry;
  readonly revision: Revision;
}

export interface OpenDay extends DayBase {
  readonly status: 'open';
}

export interface ClosedDay extends DayBase {
  readonly status: 'closed';
  readonly closureSnapshot: DayClosureSnapshot;
  readonly closedAt: Instant;
}

export type Day = OpenDay | ClosedDay;

export interface DailyStateUpdateInput {
  readonly day: Day;
  readonly weekStatus: 'open' | 'completed';
  readonly energy?: number;
  readonly mood?: number;
  readonly sleepDurationMinutes?: number;
  readonly updatedAt: Instant;
}

export interface DailyStateValidationIssue {
  readonly field: 'energy' | 'mood' | 'sleepDurationMinutes';
  readonly message: string;
}

export type DailyStateUpdateError =
  | { readonly code: 'PeriodImmutable'; readonly date: LocalDate }
  | { readonly code: 'PeriodImmutable'; readonly weekStart: LocalDate }
  | {
      readonly code: 'ValidationFailure';
      readonly issues: readonly DailyStateValidationIssue[];
    };

export function isFivePointOrdinal(value: unknown): value is FivePointOrdinal {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 5;
}

/** Prepares one immutable Daily State replacement for an open Day/Week. */
export function prepareDailyStateUpdate(
  input: DailyStateUpdateInput,
): Result<OpenDay, DailyStateUpdateError> {
  if (input.day.status === 'closed') {
    return err({ code: 'PeriodImmutable', date: input.day.date });
  }
  if (input.weekStatus === 'completed') {
    return err({ code: 'PeriodImmutable', weekStart: input.day.weekStart });
  }

  const issues: DailyStateValidationIssue[] = [];
  if (input.energy !== undefined && !isFivePointOrdinal(input.energy)) {
    issues.push({ field: 'energy', message: 'Energy must be an integer from 1 to 5' });
  }
  if (input.mood !== undefined && !isFivePointOrdinal(input.mood)) {
    issues.push({ field: 'mood', message: 'Mood must be an integer from 1 to 5' });
  }
  if (
    input.sleepDurationMinutes !== undefined &&
    !isNonNegativeInteger(input.sleepDurationMinutes)
  ) {
    issues.push({
      field: 'sleepDurationMinutes',
      message: 'Sleep duration must be a non-negative integer',
    });
  }
  if (issues.length > 0) {
    return err({ code: 'ValidationFailure', issues });
  }

  const state: DailyStateEntry = {
    ...(input.energy === undefined ? {} : { energy: input.energy as FivePointOrdinal }),
    ...(input.mood === undefined ? {} : { mood: input.mood as FivePointOrdinal }),
    ...(input.sleepDurationMinutes === undefined
      ? {}
      : { sleepDurationMinutes: nonNegativeDurationMinutes(input.sleepDurationMinutes) }),
    updatedAt: input.updatedAt,
  };
  return ok({
    ...input.day,
    state,
    revision: nextRevision(input.day.revision),
  });
}

export function createOpenDay(date: LocalDate): OpenDay {
  return {
    date,
    weekStart: startOfWeek(date),
    status: 'open',
    revision: INITIAL_REVISION,
  };
}

export function createOpenWeekDays(date: LocalDate): readonly OpenDay[] {
  return weekDates(date).map(createOpenDay);
}
