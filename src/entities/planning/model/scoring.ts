import { isNonNegativeInteger } from '@/shared/lib/ids';

import type {
  AvailableCompletionCategory,
  CompletionCategoryBreakdown,
  ScoreBreakdown,
} from './day';

export interface CompletionCounts {
  readonly completed: number;
  readonly applicable: number;
}

export interface CompletionScoreInput {
  readonly task: CompletionCounts;
  readonly habit: CompletionCounts;
}

function requireValidCounts(category: 'task' | 'habit', counts: CompletionCounts): void {
  if (!isNonNegativeInteger(counts.completed) || !isNonNegativeInteger(counts.applicable)) {
    throw new RangeError(`${category} completion counts must be non-negative safe integers`);
  }
  if (counts.completed > counts.applicable) {
    throw new RangeError(`${category} completed count cannot exceed its applicable count`);
  }
}

function categoryBreakdown(counts: CompletionCounts): CompletionCategoryBreakdown {
  if (counts.applicable === 0) {
    return { completed: 0, applicable: 0, rate: 'unavailable' };
  }

  return {
    completed: counts.completed,
    applicable: counts.applicable,
    rate: counts.completed / counts.applicable,
  } satisfies AvailableCompletionCategory;
}

/** Rounds a non-negative rational percentage exactly, including .5 ties. */
function roundHalfUp(numerator: bigint, denominator: bigint): number {
  return Number((2n * numerator + denominator) / (2n * denominator));
}

/**
 * Shared Daily Score and Weekly Progress policy: **one weight per item**.
 *
 * Every applicable task and every applicable habit counts exactly once, so the
 * result is the share of a period's items that were completed:
 *
 *     (task.completed + habit.completed) / (task.applicable + habit.applicable)
 *
 * 003 FR-016 replaced the previous fixed 70/30 task/habit split, under which a
 * single habit on a nine-task day moved the result by thirty points. A day of
 * nine completed tasks and one missed habit now reads 90%, not 70%.
 *
 * Because the rule is a ratio of summed counts, aggregating a period's days and
 * then scoring gives the same answer as scoring its items directly — which is
 * what lets weekly progress reuse this function unchanged.
 *
 * Rates are ratios; value is a percentage.
 */
export function calculateCompletionScore(input: CompletionScoreInput): ScoreBreakdown {
  requireValidCounts('task', input.task);
  requireValidCounts('habit', input.habit);

  const task = categoryBreakdown(input.task);
  const habit = categoryBreakdown(input.habit);
  const applicable = input.task.applicable + input.habit.applicable;

  // No applicable items is "no data", which is not the same as a result of 0%
  // (003 FR-018): a day with nothing planned has not been failed.
  if (applicable === 0) {
    return { task, habit, value: 'unavailable' };
  }

  const completed = input.task.completed + input.habit.completed;
  return {
    task,
    habit,
    value: roundHalfUp(100n * BigInt(completed), BigInt(applicable)),
  };
}
