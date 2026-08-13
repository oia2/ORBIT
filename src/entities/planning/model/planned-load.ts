import type { LocalDate } from '@/shared/lib/local-date/local-date';
import { nonNegativeDurationMinutes, type NonNegativeDurationMinutes } from '@/shared/lib/ids';

import { isDatedTaskOccurrence, type TaskOccurrence } from './task';

/**
 * Factual current load only: no capacity, threshold, classification, or warning.
 */
export function calculatePlannedLoad(
  occurrences: readonly TaskOccurrence[],
  date: LocalDate,
): NonNegativeDurationMinutes {
  const minutes = occurrences.reduce((total, occurrence) => {
    if (!isDatedTaskOccurrence(occurrence) || occurrence.placement.date !== date) {
      return total;
    }
    return total + occurrence.plannedDurationMinutes;
  }, 0);

  return nonNegativeDurationMinutes(minutes);
}
