import type { ApplicationClock, Instant } from '@/shared/lib/local-date/clock';
import { compareLocalDates, type LocalDate } from '@/shared/lib/local-date/local-date';
import { err, ok, type Result } from '@/shared/lib/result';
import type { HabitDefinitionId, HabitOccurrenceId, Revision } from '@/shared/lib/ids';

import type { RecurrenceRuleVersion } from './recurrence';
import type { CompletionCounts } from './scoring';

export interface HabitDefinition {
  readonly id: HabitDefinitionId;
  readonly title: string;
  readonly ruleVersions: readonly RecurrenceRuleVersion[];
  readonly revision: Revision;
}

export interface HabitDefinitionSnapshot {
  readonly title: string;
}

export type HabitOutcome = 'pending' | 'completed' | 'not-completed' | 'deleted';

interface HabitOutcomeEventBase {
  readonly ordinal: number;
  readonly occurredAt: Instant;
}

export type HabitOutcomeEvent =
  | (HabitOutcomeEventBase & {
      readonly source: 'user';
      readonly outcome: 'completed' | 'not-completed';
    })
  | (HabitOutcomeEventBase & {
      readonly source: 'date-boundary';
      readonly outcome: 'not-completed';
    })
  | (HabitOutcomeEventBase & {
      readonly source: 'user-correction';
      readonly outcome: 'completed';
    });

export interface HabitOccurrence {
  readonly id: HabitOccurrenceId;
  readonly definitionId: HabitDefinitionId;
  readonly date: LocalDate;
  readonly weekStart: LocalDate;
  readonly definitionSnapshot: HabitDefinitionSnapshot;
  readonly ruleRevision: Revision;
  readonly isException: boolean;
  readonly outcome: HabitOutcome;
  readonly outcomeEvents: readonly HabitOutcomeEvent[];
  readonly updatedAt: Instant;
}

export type HabitTransitionError =
  | { readonly code: 'PeriodImmutable'; readonly date: LocalDate }
  | {
      readonly code: 'InvalidTransition';
      readonly currentOutcome: HabitOutcome;
      readonly attemptedTransition: string;
    };

export interface HabitTransition {
  readonly occurrence: HabitOccurrence;
  readonly changed: boolean;
}

interface HabitTransitionInput {
  readonly occurrence: HabitOccurrence;
  readonly dayStatus: 'open' | 'closed';
  readonly clock: ApplicationClock;
}

export interface RecordHabitOutcomeTransitionInput extends HabitTransitionInput {
  readonly outcome: 'completed' | 'not-completed';
}

function immutableError(occurrence: HabitOccurrence): HabitTransitionError {
  return { code: 'PeriodImmutable', date: occurrence.date };
}

function invalidTransition(
  occurrence: HabitOccurrence,
  attemptedTransition: string,
): HabitTransitionError {
  return {
    code: 'InvalidTransition',
    currentOutcome: occurrence.outcome,
    attemptedTransition,
  };
}

function nextOutcomeOrdinal(events: readonly HabitOutcomeEvent[]): number {
  const latest = events.reduce((maximum, event) => Math.max(maximum, event.ordinal), 0);
  if (latest >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Habit outcome ordinal cannot exceed Number.MAX_SAFE_INTEGER');
  }

  return latest + 1;
}

export function recordHabitOutcome(
  input: RecordHabitOutcomeTransitionInput,
): Result<HabitTransition, HabitTransitionError> {
  if (input.dayStatus === 'closed') {
    return err(immutableError(input.occurrence));
  }

  if (input.occurrence.outcome !== 'pending') {
    return err(invalidTransition(input.occurrence, `record-${input.outcome}`));
  }

  const occurredAt = input.clock.now();
  const event: HabitOutcomeEvent = {
    ordinal: nextOutcomeOrdinal(input.occurrence.outcomeEvents),
    occurredAt,
    source: 'user',
    outcome: input.outcome,
  };

  return ok({
    changed: true,
    occurrence: {
      ...input.occurrence,
      outcome: input.outcome,
      outcomeEvents: [...input.occurrence.outcomeEvents, event],
      updatedAt: occurredAt,
    },
  });
}

export function catchUpHabitDateBoundary(
  input: HabitTransitionInput,
): Result<HabitTransition, HabitTransitionError> {
  if (input.dayStatus === 'closed') {
    return err(immutableError(input.occurrence));
  }

  if (
    input.occurrence.outcome !== 'pending' ||
    compareLocalDates(input.occurrence.date, input.clock.currentLocalDate()) >= 0
  ) {
    return ok({ occurrence: input.occurrence, changed: false });
  }

  const occurredAt = input.clock.now();
  const event: HabitOutcomeEvent = {
    ordinal: nextOutcomeOrdinal(input.occurrence.outcomeEvents),
    occurredAt,
    source: 'date-boundary',
    outcome: 'not-completed',
  };

  return ok({
    changed: true,
    occurrence: {
      ...input.occurrence,
      outcome: 'not-completed',
      outcomeEvents: [...input.occurrence.outcomeEvents, event],
      updatedAt: occurredAt,
    },
  });
}

export function correctBoundaryMissToCompleted(
  input: HabitTransitionInput,
): Result<HabitTransition, HabitTransitionError> {
  if (input.dayStatus === 'closed') {
    return err(immutableError(input.occurrence));
  }

  const latestEvent = input.occurrence.outcomeEvents.at(-1);
  if (input.occurrence.outcome !== 'not-completed' || latestEvent?.source !== 'date-boundary') {
    return err(invalidTransition(input.occurrence, 'correct-boundary-miss-to-completed'));
  }

  const occurredAt = input.clock.now();
  const event: HabitOutcomeEvent = {
    ordinal: nextOutcomeOrdinal(input.occurrence.outcomeEvents),
    occurredAt,
    source: 'user-correction',
    outcome: 'completed',
  };

  return ok({
    changed: true,
    occurrence: {
      ...input.occurrence,
      outcome: 'completed',
      outcomeEvents: [...input.occurrence.outcomeEvents, event],
      updatedAt: occurredAt,
    },
  });
}

export function deleteHabitOccurrence(
  input: HabitTransitionInput,
): Result<HabitTransition, HabitTransitionError> {
  if (input.dayStatus === 'closed') {
    return err(immutableError(input.occurrence));
  }

  if (input.occurrence.outcome === 'deleted') {
    return err(invalidTransition(input.occurrence, 'delete'));
  }

  return ok({
    changed: true,
    occurrence: {
      ...input.occurrence,
      outcome: 'deleted',
      updatedAt: input.clock.now(),
    },
  });
}

export function isHabitOccurrenceApplicable(occurrence: HabitOccurrence): boolean {
  return occurrence.outcome !== 'deleted';
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
