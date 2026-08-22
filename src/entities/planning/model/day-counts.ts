import type { LocalDate } from '@/shared/lib/local-date/local-date';

import { isHabitOccurrenceApplicable, type HabitOccurrence } from './habit';
import type { CompletionCounts, CompletionScoreInput } from './scoring';
import type { TaskPlanEntry } from './task';

/**
 * The one place a local date's completion facts are counted.
 *
 * Before 003 this rule existed three times — live in `selectDaySignals`, frozen
 * in `prepareDayClosure`, and again client-side on the Week page — and the Day,
 * Week, and History surfaces agreed only because those copies happened to
 * match. A fourth reader, `getWeekView`, did not: it returned a fabricated
 * empty aggregate for an open week. 003 FR-008 requires the three surfaces to
 * report identical counts for the same day, so the rule lives here and every
 * caller derives from it.
 *
 * It does not live in `scoring.ts` because `habit.ts` already imports that
 * module for `CompletionCounts`; counting habits there would close an import
 * cycle.
 *
 * A membership is applicable to its date unless it was deleted. That
 * deliberately keeps a task moved, backlogged, or cancelled at closure in the
 * denominator and counts it as not completed: it was planned for the day and
 * was not done there (003 FR-007, owner decision D3).
 */
export function taskCompletionCounts(
  planEntries: readonly TaskPlanEntry[],
  date: LocalDate,
): CompletionCounts {
  const applicable = planEntries.filter(
    (entry) => entry.date === date && entry.outcome !== 'deleted',
  );

  return {
    completed: applicable.filter((entry) => entry.outcome === 'completed').length,
    applicable: applicable.length,
  };
}

/** Equal-weight applicable habit facts for one local date. */
export function habitCompletionCounts(
  occurrences: readonly HabitOccurrence[],
  date: LocalDate,
): CompletionCounts {
  const applicable = occurrences.filter(
    (occurrence) => occurrence.date === date && isHabitOccurrenceApplicable(occurrence),
  );

  return {
    completed: applicable.filter((occurrence) => occurrence.outcome === 'completed').length,
    applicable: applicable.length,
  };
}

/** Both categories of one local date, ready for `calculateCompletionScore`. */
export function dayCompletionCounts(
  planEntries: readonly TaskPlanEntry[],
  habitOccurrences: readonly HabitOccurrence[],
  date: LocalDate,
): CompletionScoreInput {
  return {
    task: taskCompletionCounts(planEntries, date),
    habit: habitCompletionCounts(habitOccurrences, date),
  };
}

/** Adds two categories, for aggregating days into a week or a month. */
export function addCompletionCounts(
  left: CompletionCounts,
  right: CompletionCounts,
): CompletionCounts {
  return {
    completed: left.completed + right.completed,
    applicable: left.applicable + right.applicable,
  };
}

/** Sums a period's per-day counts into one aggregate for the same score rule. */
export function aggregateCompletionCounts(
  days: readonly CompletionScoreInput[],
): CompletionScoreInput {
  return days.reduce<CompletionScoreInput>(
    (total, day) => ({
      task: addCompletionCounts(total.task, day.task),
      habit: addCompletionCounts(total.habit, day.habit),
    }),
    { task: { completed: 0, applicable: 0 }, habit: { completed: 0, applicable: 0 } },
  );
}
