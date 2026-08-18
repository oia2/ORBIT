import { startOfWeek } from '@/shared/lib/local-date/local-date';

import type { HistoryDateRange, HistoryView } from '@/entities/planning/model/history';
import { deriveHistoryDateRange } from '@/entities/planning/model/history';
import type { HistoryQuery } from '@/entities/planning/model/planning-repository';
import { selectHistoryView } from '@/entities/planning/model/selectors';

import { DomainFailure } from './errors';
import {
  getDaysInRange,
  getEventsByOccurrences,
  getHabitOccurrencesInRange,
  getPlanEntriesInRange,
  getTaskOccurrencesByIds,
  getWeeksByStarts,
} from './store';
import type { PlanningTransaction } from './transaction';

/**
 * Derives the query's bounds before touching the database, so an invalid
 * selection is rejected without opening a transaction at all.
 */
export function deriveHistoryRange(query: HistoryQuery): HistoryDateRange {
  try {
    return deriveHistoryDateRange(query);
  } catch (error) {
    if (error instanceof RangeError && query.mode === 'month') {
      throw new DomainFailure({
        code: 'ValidationFailure',
        issues: [
          { field: 'selectedDate', message: 'Selected date must belong to the anchor month' },
        ],
      });
    }
    throw error;
  }
}

/**
 * Every read is bounded by the derived range: the day, week, or month the
 * caller asked for. The whole projection runs inside one `REPEATABLE READ`
 * snapshot, so a command committing mid-query cannot produce a view that never
 * existed.
 */
export async function getHistoryView(
  trx: PlanningTransaction,
  query: HistoryQuery,
  range: HistoryDateRange,
): Promise<HistoryView> {
  const weekStarts = [...new Set(range.dates.map((date) => startOfWeek(date)))];

  const [days, taskPlanEntries, habitOccurrences, weeks] = await Promise.all([
    getDaysInRange(trx, range.startDate, range.endDate),
    getPlanEntriesInRange(trx, range.startDate, range.endDate),
    getHabitOccurrencesInRange(trx, range.startDate, range.endDate),
    getWeeksByStarts(trx, weekStarts),
  ]);

  const occurrenceIds = [...new Set(taskPlanEntries.map((membership) => membership.occurrenceId))];
  const [taskOccurrences, taskEvents] = await Promise.all([
    getTaskOccurrencesByIds(trx, occurrenceIds),
    getEventsByOccurrences(trx, occurrenceIds),
  ]);

  return selectHistoryView({
    query,
    weeks,
    days,
    taskOccurrences,
    taskPlanEntries,
    taskEvents,
    habitOccurrences,
  });
}
