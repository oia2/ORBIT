import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dayPosition, durationMinutes, revision } from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { createPlanningDatabase, type PlanningDatabaseHandle } from '../db/client';
import { runMigrations } from '../db/migrations/index';
import { openSharedTestDatabase } from '../test-support/database';
import { createPostgresPlanningRepository } from './postgres-planning-repository';
import {
  createRepositoryUnderTest,
  reopenRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const NOW = instant('2026-08-11T08:00:00.000Z');

type Repository = RepositoryUnderTest['repository'];

function uuidGenerator(start = 1): () => string {
  let next = start;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

const CLOCK = createFixedClock({ instant: NOW, currentLocalDate: TUESDAY });

async function seedStableFacts(repository: Repository): Promise<void> {
  await expect(repository.ensureCalendarWeek({ date: TUESDAY })).resolves.toMatchObject({
    ok: true,
    value: MONDAY,
  });
  await expect(
    repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Preserve this goal',
      expectedRevision: revision(0),
    }),
  ).resolves.toMatchObject({ ok: true });
  await expect(
    repository.createTask({
      title: 'Preserve this task',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    }),
  ).resolves.toMatchObject({ ok: true });
}

/*
 * This suite is the one place where feature 001's assertions could not be kept
 * verbatim, and traceability.md records every replacement.
 *
 * 001 injected IndexedDB-specific failures — quota exhaustion, a blocked
 * version upgrade, a forcibly terminated connection. None of them has a
 * PostgreSQL analogue, and 002 FR-014 replaces the error codes they asserted
 * on. They are replaced here by the failures this storage mechanism actually
 * has: a statement failing mid-transaction, a constraint violation, and a lost
 * connection.
 *
 * Every assertion about *domain* error codes carries over unchanged.
 */
describe('PostgreSQL planning repository — storage and lifecycle failures', () => {
  let harness: RepositoryUnderTest;
  let repository: Repository;
  let database: RepositoryUnderTest['database'];
  let extraHandles: PlanningDatabaseHandle[] = [];

  beforeEach(async () => {
    harness = await createRepositoryUnderTest({ clock: CLOCK, generateUuid: uuidGenerator() });
    repository = harness.repository;
    database = harness.database;
    extraHandles = [];
  });

  afterEach(async () => {
    for (const handle of extraHandles) {
      await handle.destroy().catch(() => undefined);
    }
  });

  async function readPersistedFacts() {
    return database.snapshotAllStores();
  }

  it('reconnects to the real database with all committed facts intact', async () => {
    await seedStableFacts(repository);
    const beforeClose = await readPersistedFacts();

    const reopened = await reopenRepositoryUnderTest({
      clock: CLOCK,
      generateUuid: uuidGenerator(),
    });

    await expect(reopened.database.snapshotAllStores()).resolves.toEqual(beforeClose);
    await expect(reopened.repository.getDayView(TUESDAY)).resolves.toMatchObject({
      ok: true,
      value: {
        day: { date: TUESDAY, revision: revision(1) },
        tasks: [{ occurrence: { title: 'Preserve this task' } }],
      },
    });
  });

  it('rejects a stale aggregate revision without writing or reporting success', async () => {
    await expect(repository.ensureCalendarWeek({ date: TUESDAY })).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repository.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'Committed goal',
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });
    const beforeConflict = await readPersistedFacts();

    const conflict = await repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Stale write',
      expectedRevision: revision(0),
    });

    expect(conflict).toEqual({
      ok: false,
      error: {
        code: 'RevisionConflict',
        expectedRevision: revision(0),
        actualRevision: revision(1),
      },
    });
    await expect(readPersistedFacts()).resolves.toEqual(beforeConflict);
  });

  /*
   * REPLACES 001's "maps quota rejection / transaction abort, rolls back
   * partial writes, and never resets the database". The preserved property is
   * the one that mattered: a command that fails part-way leaves nothing behind
   * and is never reported as success.
   */
  it('rolls back every partial write when a statement fails mid-transaction', async () => {
    // `createTask` allocates the occurrence id, the membership id, and then the
    // audit event id. Handing it an event id that is already taken makes the
    // final statement of the command fail against `task_events_id_key`, after
    // the occurrence and membership rows have been written in the same
    // transaction — a genuine statement failure part-way through a command.
    const collidingEventId = '00000000-0000-4000-8000-000000009999';
    const nextUuid = uuidGenerator(1000);
    let armed = false;
    let allocationsWhileArmed = 0;
    const generateUuid = (): string => {
      if (!armed) return nextUuid();
      allocationsWhileArmed += 1;
      return allocationsWhileArmed === 3 ? collidingEventId : nextUuid();
    };

    const conflicting = await createRepositoryUnderTest({ clock: CLOCK, generateUuid });
    await seedStableFacts(conflicting.repository);
    const beforeFailure = await conflicting.database.snapshotAllStores();

    const [existingTask] = await conflicting.database.getAllTaskOccurrences();
    if (existingTask === undefined) throw new Error('missing seeded task');
    await conflicting.db
      .insertInto('task_events')
      .values({
        sequence: 9_000 as never,
        id: collidingEventId as never,
        occurrence_id: existingTask.id,
        series_id: null,
        effective_date: TUESDAY,
        occurred_at: NOW,
        payload: JSON.stringify({ type: 'closure-keep', payload: { date: TUESDAY } }),
      })
      .execute();
    const beforeCommand = await conflicting.database.snapshotAllStores();

    armed = true;
    const result = await conflicting.repository.createTask({
      title: 'Must roll back',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(45),
      dayPosition: dayPosition(1),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'UnexpectedServerFailure' } });
    await expect(conflicting.database.snapshotAllStores()).resolves.toEqual(beforeCommand);
    expect(beforeCommand.taskOccurrences).toEqual(beforeFailure.taskOccurrences);
  });

  /*
   * REPLACES 001's quota-exhaustion case. A schema constraint violation is the
   * PostgreSQL failure of that shape: the write is refused by storage rather
   * than by the domain, and the command must surface it as a server failure
   * rather than as a domain outcome.
   */
  it('surfaces a schema constraint violation as a server failure, not a domain outcome', async () => {
    await seedStableFacts(repository);
    const before = await readPersistedFacts();

    await expect(
      harness.db
        .insertInto('days')
        .values({
          date: localDate('2027-01-04'),
          week_start: localDate('2027-01-04'),
          status: 'open',
          state: null,
          closure_snapshot: null,
          closed_at: null,
          revision: revision(0),
        })
        .execute(),
    ).rejects.toThrow(/days_week_start_fkey/);

    await expect(readPersistedFacts()).resolves.toEqual(before);
  });

  /*
   * REPLACES 001's "waits on a blocked upgrade, then reopens without resetting
   * prior facts". IndexedDB blocks a version change while another connection is
   * open; PostgreSQL migrations run once at startup instead (FR-019). The
   * preserved property is that re-running schema setup never discards data.
   */
  it('re-runs migrations against an existing database without touching prior facts', async () => {
    await seedStableFacts(repository);
    const beforeMigrations = await readPersistedFacts();

    const results = await runMigrations(harness.db);

    expect(results.results).toEqual([]);
    await expect(readPersistedFacts()).resolves.toEqual(beforeMigrations);
  });

  /*
   * REPLACES 001's forced-termination case. A terminated IndexedDB connection
   * becomes a lost database connection: the command fails visibly as
   * `ServerUnavailable`, nothing is presented as saved, and reconnecting
   * restores both the prior facts and the ability to write (002 FR-011).
   */
  it('reports a lost connection, rejects the stale handle, and recovers on reconnect', async () => {
    await seedStableFacts(repository);
    const beforeTermination = await readPersistedFacts();

    const testDatabase = await openSharedTestDatabase();
    const disposable = createPlanningDatabase({
      connectionString: testDatabase.connectionString,
      maxConnections: 1,
    });
    extraHandles.push(disposable);
    const disposableRepository = createPostgresPlanningRepository(disposable.db, {
      clock: CLOCK,
      generateUuid: uuidGenerator(2000),
    });

    await expect(disposableRepository.getDayView(TUESDAY)).resolves.toMatchObject({ ok: true });

    await disposable.destroy();

    await expect(
      disposableRepository.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'Cannot use a closed connection',
        expectedRevision: revision(2),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'ServerUnavailable' } });

    const recovered = await reopenRepositoryUnderTest({
      clock: CLOCK,
      generateUuid: uuidGenerator(3000),
    });

    await expect(recovered.database.snapshotAllStores()).resolves.toEqual(beforeTermination);
    await expect(
      recovered.repository.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'Recovered write',
        expectedRevision: revision(2),
      }),
    ).resolves.toMatchObject({ ok: true });
  });
});
