import { generateEntityId, type EntityId, type Revision } from '@/shared/lib/ids';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { Day, OpenDay } from '@/entities/planning/model/day';
import type { OpenWeek, Week } from '@/entities/planning/model/week';

import { DomainFailure, revisionGuard } from './errors';

export interface RepositoryDependencies {
  readonly clock: ApplicationClock;
  readonly generateUuid?: () => string;
}

/**
 * Everything a concern module needs beyond the transaction: the injected clock
 * and identifier generation. The server never has a clock of its own — this one
 * is rebuilt per request from the caller's reading (002 FR-009).
 */
export interface RepositoryContext {
  readonly clock: ApplicationClock;
  nextId<TKind extends string>(): EntityId<TKind>;
}

export function createRepositoryContext(dependencies: RepositoryDependencies): RepositoryContext {
  return {
    clock: dependencies.clock,
    nextId: <TKind extends string>(): EntityId<TKind> =>
      generateEntityId<TKind>(dependencies.generateUuid),
  };
}

export function requireOpenWeek(
  week: Week | undefined,
  weekStart: LocalDate,
  expectedRevision?: Revision,
): asserts week is OpenWeek {
  if (week === undefined) {
    throw new DomainFailure({ code: 'NotFound', entity: 'Week', id: weekStart });
  }
  if (week.status !== 'open') {
    throw new DomainFailure({ code: 'PeriodImmutable', weekStart });
  }
  if (expectedRevision !== undefined) {
    const guard = revisionGuard(week.revision, expectedRevision);
    if (guard !== undefined) throw new DomainFailure(guard);
  }
}

export function requireOpenDay(day: Day, expectedRevision?: Revision): asserts day is OpenDay {
  if (day.status !== 'open') {
    throw new DomainFailure({ code: 'PeriodImmutable', date: day.date });
  }
  if (expectedRevision !== undefined) {
    const guard = revisionGuard(day.revision, expectedRevision);
    if (guard !== undefined) throw new DomainFailure(guard);
  }
}
