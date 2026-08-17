import {
  creationSequence,
  eventSequence,
  nextCreationSequence,
  nextEventSequence,
  type CreationSequence,
  type DayPosition,
  type DurationMinutes,
  type EventSequence,
} from '@/shared/lib/ids';

import type { TaskOccurrence, TaskValueSnapshot } from '@/entities/planning/model/task';

import { maxCreatedSequence, maxEventSequence } from './store';
import type { PlanningTransaction } from './transaction';

/**
 * Allocated inside the command transaction, exactly as feature 001 allocated
 * it from the tail of the `by-created-sequence` index. Backlog order depends on
 * it (001 FR-010), and the suites assert the concrete values, so it stays
 * gap-free rather than coming from a PostgreSQL sequence that would advance on
 * rollback.
 */
export async function allocateNextCreationSequence(
  trx: PlanningTransaction,
): Promise<CreationSequence> {
  const highest = await maxCreatedSequence(trx);
  return highest === 0 ? creationSequence(1) : nextCreationSequence(creationSequence(highest));
}

/**
 * The audit ordering authority. It is derived from stored rows rather than
 * from the clock, so a client device clock that moves backwards can never
 * reorder history.
 */
export async function allocateNextEventSequence(trx: PlanningTransaction): Promise<EventSequence> {
  const highest = await maxEventSequence(trx);
  return highest === 0 ? eventSequence(1) : nextEventSequence(eventSequence(highest));
}

export function taskValueSnapshot(occurrence: TaskOccurrence): TaskValueSnapshot {
  return {
    title: occurrence.title,
    ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
    ...(occurrence.plannedDurationMinutes === undefined
      ? {}
      : { plannedDurationMinutes: occurrence.plannedDurationMinutes }),
    ...(occurrence.startTime === undefined ? {} : { startTime: occurrence.startTime }),
    ...(occurrence.endTime === undefined ? {} : { endTime: occurrence.endTime }),
  };
}

export function isPositiveDuration(value: unknown): value is DurationMinutes {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isDayPositionValue(value: unknown): value is DayPosition {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
