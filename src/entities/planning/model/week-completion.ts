import { nextRevision } from '@/shared/lib/ids';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import {
  compareLocalDates,
  startOfWeek,
  weekDates,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import type { ClosedDay, CompletionCategoryBreakdown, Day } from './day';
import { calculateCompletionScore, type CompletionCounts } from './scoring';
import { isCompletedWeek, type CompletedWeek, type Week } from './week';

export interface PrepareWeekCompletionInput {
  readonly week: Week;
  readonly days: readonly Day[];
  readonly reflection?: string;
  readonly clock: ApplicationClock;
}

export interface WeekCompletionPreparation {
  readonly week: CompletedWeek;
  /** Canonical Monday-through-Sunday closed facts used for the frozen aggregate. */
  readonly days: readonly ClosedDay[];
}

export type WeekCompletionError =
  | { readonly code: 'PeriodImmutable'; readonly weekStart: LocalDate }
  | {
      readonly code: 'WeekDaysMismatch';
      readonly weekStart: LocalDate;
      readonly expectedDates: readonly LocalDate[];
      readonly receivedDates: readonly LocalDate[];
    }
  | {
      readonly code: 'WeekNotClosable';
      readonly weekStart: LocalDate;
      readonly openDates: readonly LocalDate[];
    };

function countPair(category: CompletionCategoryBreakdown): CompletionCounts {
  return { completed: category.completed, applicable: category.applicable };
}

function addCounts(left: CompletionCounts, right: CompletionCounts): CompletionCounts {
  return {
    completed: left.completed + right.completed,
    applicable: left.applicable + right.applicable,
  };
}

function aggregateFrozenCounts(days: readonly ClosedDay[]): {
  readonly task: CompletionCounts;
  readonly habit: CompletionCounts;
} {
  return days.reduce(
    (total, day) => ({
      task: addCounts(total.task, countPair(day.closureSnapshot.score.task)),
      habit: addCounts(total.habit, countPair(day.closureSnapshot.score.habit)),
    }),
    {
      task: { completed: 0, applicable: 0 },
      habit: { completed: 0, applicable: 0 },
    },
  );
}

export function calculateWeeklyProgressFromClosedDays(days: readonly Day[]) {
  if (days.some((day) => day.status !== 'closed')) {
    throw new RangeError('Weekly progress requires closed days');
  }
  return calculateCompletionScore(aggregateFrozenCounts(days as readonly ClosedDay[]));
}

function orderExactOwnedDays(
  week: Week,
  days: readonly Day[],
): Result<readonly Day[], WeekCompletionError> {
  const expectedDates = weekDates(week.startDate);
  const receivedDates = days.map((day) => day.date);
  const uniqueDates = new Set(receivedDates);
  const isCanonicalWeek = startOfWeek(week.startDate) === week.startDate;
  const ownsExactDays =
    isCanonicalWeek &&
    days.length === expectedDates.length &&
    uniqueDates.size === days.length &&
    days.every((day) => day.weekStart === week.startDate && expectedDates.includes(day.date));
  if (!ownsExactDays) {
    return err({
      code: 'WeekDaysMismatch',
      weekStart: week.startDate,
      expectedDates,
      receivedDates,
    });
  }

  return ok(days.toSorted((left, right) => compareLocalDates(left.date, right.date)));
}

/** Prepares one immutable Week write after validating all seven frozen Day facts. */
export function prepareWeekCompletion(
  input: PrepareWeekCompletionInput,
): Result<WeekCompletionPreparation, WeekCompletionError> {
  if (isCompletedWeek(input.week)) {
    return err({ code: 'PeriodImmutable', weekStart: input.week.startDate });
  }

  const ordered = orderExactOwnedDays(input.week, input.days);
  if (!ordered.ok) {
    return ordered;
  }
  const openDates = ordered.value.filter((day) => day.status === 'open').map((day) => day.date);
  if (openDates.length > 0) {
    return err({ code: 'WeekNotClosable', weekStart: input.week.startDate, openDates });
  }
  const closedDays = ordered.value as readonly ClosedDay[];
  const counts = aggregateFrozenCounts(closedDays);
  const progress = calculateCompletionScore(counts);
  const reflection = input.reflection ?? input.week.reflection;

  return ok({
    week: {
      startDate: input.week.startDate,
      goals: input.week.goals,
      status: 'completed',
      ...(reflection === undefined ? {} : { reflection }),
      completionSnapshot: { progress },
      completedAt: input.clock.now(),
      revision: nextRevision(input.week.revision),
    },
    days: closedDays,
  });
}
