import type { Revision } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { DayClosureError } from '@/entities/planning/model/day-closure';
import type { HabitTransitionError } from '@/entities/planning/model/habit';
import type { DomainOrStorageError } from '@/entities/planning/model/planning-repository';
import type { RecurrenceValidationError } from '@/entities/planning/model/recurrence';
import type { WeekCompletionError } from '@/entities/planning/model/week-completion';

/**
 * Carries a domain rejection out of a transaction body. Feature 001 models
 * failures as values; throwing is only the transport that rolls the
 * transaction back, and every catch site converts it straight back to a value.
 */
export class DomainFailure extends Error {
  constructor(readonly error: DomainOrStorageError) {
    super(error.code);
    this.name = 'DomainFailure';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return String(error);
}

/** PostgreSQL error classes that mean the database is not reachable. */
const UNAVAILABLE_CODE_PATTERN = /^(08|57P0|53)/;
const UNAVAILABLE_MESSAGE_PATTERN =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|Connection terminated|terminating connection|server closed the connection|Client has encountered a connection error|pool.*(ended|destroyed)|Cannot use a pool after calling end|driver has already been destroyed/i;

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * The server analogue of 001's `normalizeStorageError`. A database that cannot
 * be reached is `ServerUnavailable`; anything else the server failed to handle
 * is `UnexpectedServerFailure` (002 FR-014). Neither is ever reported as a
 * domain outcome, so a failure is never presented as saved work.
 */
export function normalizeServerError(error: unknown): DomainOrStorageError {
  const code = postgresErrorCode(error);
  const message = errorMessage(error);

  if (
    (code !== undefined && UNAVAILABLE_CODE_PATTERN.test(code)) ||
    UNAVAILABLE_MESSAGE_PATTERN.test(message)
  ) {
    return { code: 'ServerUnavailable', message };
  }

  return { code: 'UnexpectedServerFailure', message };
}

export function toDomainOrServerError(error: unknown): DomainOrStorageError {
  return error instanceof DomainFailure ? error.error : normalizeServerError(error);
}

export function revisionGuard(
  actualRevision: Revision,
  expectedRevision: Revision,
): DomainOrStorageError | undefined {
  return actualRevision === expectedRevision
    ? undefined
    : {
        code: 'RevisionConflict',
        expectedRevision,
        actualRevision,
      };
}

export function mutableDayGuard(
  status: 'open' | 'closed',
  date: LocalDate,
): DomainOrStorageError | undefined {
  return status === 'open' ? undefined : { code: 'PeriodImmutable', date };
}

export function canonicalRequiredText(value: string, field: string): string {
  const canonical = value.trim();
  if (canonical.length === 0) {
    throw new DomainFailure({
      code: 'ValidationFailure',
      issues: [{ field, message: `${field} must not be blank` }],
    });
  }

  return canonical;
}

export function recurrenceValidationFailure(
  errors: readonly RecurrenceValidationError[],
): DomainFailure {
  return new DomainFailure({
    code: 'ValidationFailure',
    issues: errors.map((error) => ({ field: error.field, message: error.code })),
  });
}

export function habitTransitionFailure(error: HabitTransitionError): DomainFailure {
  if (error.code === 'PeriodImmutable') {
    return new DomainFailure(error);
  }

  return new DomainFailure({
    code: 'InvalidTransition',
    entity: 'HabitOccurrence',
    currentState: error.currentOutcome,
    attemptedTransition: error.attemptedTransition,
  });
}

export function dayClosureFailure(error: DayClosureError): DomainFailure {
  switch (error.code) {
    case 'PeriodImmutable':
    case 'FutureDayClosure':
    case 'PendingHabitOutcomes':
    case 'ClosureDispositionMismatch':
    case 'MoveTargetClosed':
      return new DomainFailure(error);
    case 'InvalidClosureDestination':
      if (error.reason === 'non-positive-duration' || error.reason === 'invalid-day-position') {
        return new DomainFailure({
          code: 'ValidationFailure',
          issues: [
            {
              field: error.reason === 'non-positive-duration' ? 'durationMinutes' : 'dayPosition',
              message:
                error.reason === 'non-positive-duration'
                  ? 'Dated tasks require a positive duration'
                  : 'Dated tasks require a position',
            },
          ],
        });
      }
      return new DomainFailure({
        code: 'InvalidTransition',
        entity: 'TaskOccurrence',
        currentState: `day:${error.destinationDate}`,
        attemptedTransition: 'closure-move-to-same-date',
      });
    case 'InvalidClosureDisposition':
      return new DomainFailure({
        code: 'InvalidTransition',
        entity: 'TaskOccurrence',
        currentState: 'incomplete',
        attemptedTransition: 'close-day',
      });
    case 'DestinationPlanEntryIdRequired':
    case 'ClosureDataInvariant':
      return new DomainFailure({
        code: 'UnexpectedServerFailure',
        message:
          error.code === 'ClosureDataInvariant'
            ? error.message
            : `Destination membership ID missing for ${error.occurrenceId}`,
      });
  }
}

export function weekCompletionFailure(error: WeekCompletionError): DomainFailure {
  switch (error.code) {
    case 'PeriodImmutable':
    case 'WeekNotClosable':
      return new DomainFailure(error);
    case 'WeekDaysMismatch':
      return new DomainFailure({
        code: 'UnexpectedServerFailure',
        message: `Week ${error.weekStart} does not own exactly its seven calendar days`,
      });
  }
}
