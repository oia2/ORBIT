import type { Kysely, Transaction } from 'kysely';

import type { Revision } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { CommandResult, QueryResult } from '@/entities/planning/model/planning-repository';

import type { Database } from '../db/schema';
import type { PlanningDatabase } from '../db/client';
import { DomainFailure, toDomainOrServerError } from './errors';

/**
 * Anything that can run a statement: the pool-backed connection or an open
 * transaction. Kysely's `Transaction<Database>` extends `Kysely<Database>`, so
 * every store function accepts either.
 */
export type Executor = Kysely<Database>;

export type PlanningTransaction = Transaction<Database>;

export interface CommandReceipt<TValue> {
  readonly value: TValue;
  readonly affectedDates: readonly LocalDate[];
  readonly affectedWeeks: readonly LocalDate[];
}

/**
 * One boundary operation, one transaction (research Decision 7). `READ
 * COMMITTED` is the default isolation level; the optimistic-concurrency
 * guarantee comes from `updateGuarded` below rather than from the isolation
 * level, exactly as it did under IndexedDB.
 */
export async function runCommand<TValue>(
  db: PlanningDatabase,
  work: (trx: PlanningTransaction) => Promise<CommandReceipt<TValue>>,
): Promise<CommandResult<TValue>> {
  try {
    const receipt = await db
      .transaction()
      .setIsolationLevel('read committed')
      .execute((trx) => work(trx));

    return {
      ok: true,
      value: receipt.value,
      affectedDates: receipt.affectedDates,
      affectedWeeks: receipt.affectedWeeks,
    };
  } catch (error) {
    return { ok: false, error: toDomainOrServerError(error) };
  }
}

/**
 * A read projection is assembled from several queries, so it runs at
 * `REPEATABLE READ` to see one consistent snapshot: without it, a command
 * committing between two statements could produce a view that never existed
 * (research Decision 7).
 */
export async function runRead<TValue>(
  db: PlanningDatabase,
  work: (trx: PlanningTransaction) => Promise<TValue>,
): Promise<QueryResult<TValue>> {
  try {
    const value = await db
      .transaction()
      .setIsolationLevel('repeatable read')
      .setAccessMode('read only')
      .execute((trx) => work(trx));

    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: toDomainOrServerError(error) };
  }
}

/** Converts a thrown domain failure back into a query result value. */
export function queryFailure<TValue>(error: unknown): QueryResult<TValue> {
  return { ok: false, error: toDomainOrServerError(error) };
}

/** Converts a thrown domain failure back into a command result value. */
export function commandFailure<TValue>(error: unknown): CommandResult<TValue> {
  return { ok: false, error: toDomainOrServerError(error) };
}

export interface GuardedUpdateResult {
  readonly updatedRows: number;
}

/**
 * Optimistic concurrency, enforced by the database rather than by a
 * read-then-compare that a concurrent writer could slip between: the update
 * only matches while the row still carries the revision the caller read.
 *
 * Under `READ COMMITTED` a second writer blocks on the row lock and then
 * re-evaluates `WHERE revision = $expected` against the committed row, so of
 * two commands holding the same `expectedRevision` exactly one succeeds and
 * the other sees zero rows (002 FR-008, SC-006).
 */
export function assertGuardedUpdate(
  result: GuardedUpdateResult,
  expectedRevision: Revision,
  actualRevision: Revision,
): void {
  if (result.updatedRows === 0) {
    throw new DomainFailure({
      code: 'RevisionConflict',
      expectedRevision,
      actualRevision,
    });
  }
}
