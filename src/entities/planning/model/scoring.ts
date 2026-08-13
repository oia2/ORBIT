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

function taskOnlyValue(task: CompletionCounts): number {
  return roundHalfUp(100n * BigInt(task.completed), BigInt(task.applicable));
}

function habitOnlyValue(habit: CompletionCounts): number {
  return roundHalfUp(100n * BigInt(habit.completed), BigInt(habit.applicable));
}

function combinedValue(task: CompletionCounts, habit: CompletionCounts): number {
  const taskApplicable = BigInt(task.applicable);
  const habitApplicable = BigInt(habit.applicable);
  const numerator =
    70n * BigInt(task.completed) * habitApplicable + 30n * BigInt(habit.completed) * taskApplicable;
  return roundHalfUp(numerator, taskApplicable * habitApplicable);
}

/** Shared Daily Score and Weekly Progress policy. Rates are ratios; value is a percentage. */
export function calculateCompletionScore(input: CompletionScoreInput): ScoreBreakdown {
  requireValidCounts('task', input.task);
  requireValidCounts('habit', input.habit);

  const task = categoryBreakdown(input.task);
  const habit = categoryBreakdown(input.habit);
  const hasTask = task.rate !== 'unavailable';
  const hasHabit = habit.rate !== 'unavailable';

  if (!hasTask && !hasHabit) {
    return {
      task,
      habit,
      value: 'unavailable',
      weightsApplied: { task: 0, habit: 0 },
    };
  }
  if (hasTask && !hasHabit) {
    return {
      task,
      habit,
      value: taskOnlyValue(input.task),
      weightsApplied: { task: 100, habit: 0 },
    };
  }
  if (!hasTask && hasHabit) {
    return {
      task,
      habit,
      value: habitOnlyValue(input.habit),
      weightsApplied: { task: 0, habit: 100 },
    };
  }

  return {
    task,
    habit,
    value: combinedValue(input.task, input.habit),
    weightsApplied: { task: 70, habit: 30 },
  };
}
