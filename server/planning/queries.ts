import type { TaskOccurrenceId } from '@/shared/lib/ids';
import { startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';

import type { Day, ScoreBreakdown } from '@/entities/planning/model/day';
import type {
  BacklogView,
  DayPlanningFacts,
  DayView,
  TaskHistoryView,
  WeekView,
} from '@/entities/planning/model/history';
import { aggregateCompletionCounts } from '@/entities/planning/model/day-counts';
import { calculateCompletionScore, type CompletionCounts } from '@/entities/planning/model/scoring';
import { selectDaySignals } from '@/entities/planning/model/selectors';

import { DomainFailure } from './errors';
import {
  getBacklogTaskOccurrences,
  getDay,
  getDaysByWeekStart,
  getEventsByOccurrence,
  getHabitOccurrencesByDate,
  getPlanEntriesByDate,
  getPlanEntriesByOccurrence,
  getTaskOccurrence,
  getWeek,
} from './store';
import type { PlanningTransaction } from './transaction';

export function unavailableScore(): ScoreBreakdown {
  return {
    task: { completed: 0, applicable: 0, rate: 'unavailable' },
    habit: { completed: 0, applicable: 0, rate: 'unavailable' },
    value: 'unavailable',
  };
}

/** Strips the derived `rate` so a category can be re-aggregated by count. */
function countsOf(category: {
  readonly completed: number;
  readonly applicable: number;
}): CompletionCounts {
  return { completed: category.completed, applicable: category.applicable };
}

/**
 * Projects one day: its memberships, the occurrences and audit trail behind
 * them, its habits, and the derived score and planned load. Ordering is the
 * dated-list order 001 defines — day position first, creation order as the
 * tie-break — and a membership marked deleted never appears.
 */
export async function readDayFacts(trx: PlanningTransaction, day: Day): Promise<DayPlanningFacts> {
  const entries = await getPlanEntriesByDate(trx, day.date);

  const projected = await Promise.all(
    entries.map(async (membership) => {
      const occurrence = await getTaskOccurrence(trx, membership.occurrenceId);
      if (occurrence === undefined) return undefined;
      const events = await getEventsByOccurrence(trx, membership.occurrenceId);
      return { occurrence, membership, events };
    }),
  );

  const tasks = projected
    .filter((item) => item !== undefined)
    .filter(
      ({ occurrence, membership }) =>
        membership.outcome !== 'deleted' &&
        (day.status === 'closed' ||
          (occurrence.state === 'active' &&
            occurrence.placement.kind === 'day' &&
            occurrence.placement.date === day.date)),
    )
    .sort((left, right) => {
      const leftPosition =
        left.occurrence.state === 'active' &&
        left.occurrence.placement.kind === 'day' &&
        'dayPosition' in left.occurrence
          ? (left.occurrence.dayPosition ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;
      const rightPosition =
        right.occurrence.state === 'active' &&
        right.occurrence.placement.kind === 'day' &&
        'dayPosition' in right.occurrence
          ? (right.occurrence.dayPosition ?? Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;
      return (
        leftPosition - rightPosition ||
        left.occurrence.createdSequence - right.occurrence.createdSequence
      );
    });

  const habits = await getHabitOccurrencesByDate(trx, day.date);
  const occurrences = tasks.map(({ occurrence }) => occurrence);
  const signals = selectDaySignals({
    day,
    occurrences,
    planEntries: entries,
    habits,
  });

  return {
    day,
    tasks,
    habits,
    score: signals.score,
    plannedLoadMinutes: signals.plannedLoadMinutes,
  };
}

export async function getWeekView(
  trx: PlanningTransaction,
  dateOrWeekStart: LocalDate,
): Promise<WeekView> {
  const weekStart = startOfWeek(dateOrWeekStart);
  const week = await getWeek(trx, weekStart);
  if (week === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Week', id: weekStart });
  }

  const days = await getDaysByWeekStart(trx, weekStart);
  const summaries = await Promise.all(
    days.map(async (day) => {
      const facts = await readDayFacts(trx, day);
      return {
        date: day.date,
        status: day.status,
        score: facts.score,
        plannedLoadMinutes: facts.plannedLoadMinutes,
      };
    }),
  );

  return {
    week,
    days: summaries,
    /*
     * An open week reports the real aggregate of its days. Before 003 this
     * returned a fabricated `unavailableScore()` — the server answering "no
     * data" for a week that had data — and it was masked only because the Week
     * page recomputed the same figure client-side. 003 FR-008 requires every
     * surface to agree, so the answer is derived here, once, from the same
     * per-day counts the Day and History views use.
     */
    progress:
      week.status === 'completed'
        ? week.completionSnapshot.progress
        : calculateCompletionScore(
            aggregateCompletionCounts(
              summaries.map((summary) => ({
                task: countsOf(summary.score.task),
                habit: countsOf(summary.score.habit),
              })),
            ),
          ),
  };
}

export async function getDayView(trx: PlanningTransaction, date: LocalDate): Promise<DayView> {
  const day = await getDay(trx, date);
  if (day === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Day', id: date });
  }

  const facts = await readDayFacts(trx, day);
  return {
    ...facts,
    unfinishedTaskIds: facts.tasks
      .filter(({ occurrence }) =>
        occurrence.state === 'active' &&
        occurrence.placement.kind === 'day' &&
        'completion' in occurrence
          ? occurrence.completion === 'incomplete'
          : false,
      )
      .map(({ occurrence }) => occurrence.id),
  };
}

export async function getBacklogView(trx: PlanningTransaction): Promise<BacklogView> {
  const stored = await getBacklogTaskOccurrences(trx);
  return {
    tasks: stored.filter((task) => task.state === 'active' && task.placement.kind === 'backlog'),
  };
}

export async function getTaskHistory(
  trx: PlanningTransaction,
  occurrenceId: TaskOccurrenceId,
): Promise<TaskHistoryView> {
  const occurrence = await getTaskOccurrence(trx, occurrenceId);
  if (occurrence === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'TaskOccurrence', id: occurrenceId });
  }

  const memberships = await getPlanEntriesByOccurrence(trx, occurrenceId);
  const events = await getEventsByOccurrence(trx, occurrenceId);

  return { occurrence, memberships, events };
}
