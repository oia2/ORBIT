import type { LocalDate } from '@/shared/lib/local-date/local-date';
import { nonNegativeDurationMinutes, type NonNegativeDurationMinutes } from '@/shared/lib/ids';

import { isHabitOccurrenceApplicable, type HabitOccurrence } from './habit';
import { isDatedTaskOccurrence, type TaskOccurrence } from './task';

/**
 * Factual current load only: no capacity, threshold, classification, or warning.
 *
 * Since 003 this includes habit durations (FR-030). A habit that carries one is
 * time the day is spending just as a task is; a habit without one contributes
 * nothing, so an installation that never sets a duration reports exactly the
 * load it reported before (FR-031).
 *
 * The duration is read from each occurrence's `definitionSnapshot`, never from
 * the live definition — that is what keeps a closed day's frozen load fixed
 * when the habit is edited afterwards (FR-034).
 */
export function calculatePlannedLoad(
  occurrences: readonly TaskOccurrence[],
  date: LocalDate,
  habitOccurrences: readonly HabitOccurrence[] = [],
): NonNegativeDurationMinutes {
  const taskMinutes = occurrences.reduce((total, occurrence) => {
    if (!isDatedTaskOccurrence(occurrence) || occurrence.placement.date !== date) {
      return total;
    }
    return total + occurrence.plannedDurationMinutes;
  }, 0);

  const habitMinutes = habitOccurrences.reduce((total, occurrence) => {
    if (occurrence.date !== date || !isHabitOccurrenceApplicable(occurrence)) {
      return total;
    }
    return total + (occurrence.definitionSnapshot.durationMinutes ?? 0);
  }, 0);

  return nonNegativeDurationMinutes(taskMinutes + habitMinutes);
}
