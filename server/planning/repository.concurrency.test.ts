import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dayPosition, durationMinutes, revision } from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import type { CommandResult } from '@/entities/planning/model/planning-repository';

import { createPlanningDatabase, type PlanningDatabaseHandle } from '../db/client';
import { openSharedTestDatabase } from '../test-support/database';
import {
  createPostgresPlanningRepository,
  type ServerPlanningRepository,
} from './postgres-planning-repository';
import {
  createRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const NOW = instant('2026-08-11T09:00:00.000Z');

const CLOCK = createFixedClock({ instant: NOW, currentLocalDate: TUESDAY });

function uuidGenerator(start: number): () => string {
  let next = start;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

function partition<TValue>(results: readonly CommandResult<TValue>[]) {
  return {
    succeeded: results.filter((result) => result.ok),
    conflicted: results.filter((result) => !result.ok && result.error.code === 'RevisionConflict'),
    other: results.filter((result) => !result.ok && result.error.code !== 'RevisionConflict'),
  };
}

/**
 * SC-006, FR-008: two commands holding the same `expectedRevision` produce one
 * success and one `RevisionConflict`, and the loser never overwrites.
 *
 * Each competitor runs on its own connection pool, so these are genuinely
 * concurrent transactions rather than two calls interleaved on one connection.
 */
describe('optimistic concurrency', () => {
  let harness: RepositoryUnderTest;
  let handles: PlanningDatabaseHandle[] = [];

  async function competitor(idStart: number): Promise<ServerPlanningRepository> {
    const testDatabase = await openSharedTestDatabase();
    const handle = createPlanningDatabase({
      connectionString: testDatabase.connectionString,
      maxConnections: 2,
    });
    handles.push(handle);
    return createPostgresPlanningRepository(handle.db, {
      clock: CLOCK,
      generateUuid: uuidGenerator(idStart),
    });
  }

  beforeEach(async () => {
    harness = await createRepositoryUnderTest({ clock: CLOCK, generateUuid: uuidGenerator(1) });
    handles = [];
    await harness.repository.ensureCalendarWeek({ date: TUESDAY });
  });

  afterEach(async () => {
    for (const handle of handles) {
      await handle.destroy().catch(() => undefined);
    }
  });

  it('lets exactly one of two concurrent goal writers win', async () => {
    const [first, second] = await Promise.all([competitor(10_000), competitor(20_000)]);

    const results = await Promise.all([
      first.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'First writer',
        expectedRevision: revision(0),
      }),
      second.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'Second writer',
        expectedRevision: revision(0),
      }),
    ]);

    const { succeeded, conflicted, other } = partition(results);
    expect(other).toEqual([]);
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(1);

    const conflict = conflicted[0];
    if (conflict?.ok !== false) throw new Error('expected a conflict');
    expect(conflict.error).toEqual({
      code: 'RevisionConflict',
      expectedRevision: revision(0),
      actualRevision: revision(1),
    });

    // The loser did not overwrite: exactly one goal was recorded, and the week
    // advanced by exactly one revision.
    const week = await harness.database.getWeek(MONDAY);
    expect(week?.goals).toHaveLength(1);
    expect(week?.revision).toBe(revision(1));
  });

  it('lets exactly one of two concurrent completions win', async () => {
    const created = await harness.repository.createTask({
      title: 'Contended',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    });
    if (!created.ok) throw new Error(created.error.code);

    const [first, second] = await Promise.all([competitor(30_000), competitor(40_000)]);

    const results = await Promise.all([
      first.setTaskCompletion({
        occurrenceId: created.value,
        date: TUESDAY,
        completed: true,
        expectedRevision: revision(0),
      }),
      second.setTaskCompletion({
        occurrenceId: created.value,
        date: TUESDAY,
        completed: true,
        expectedRevision: revision(0),
      }),
    ]);

    const { succeeded, conflicted, other } = partition(results);
    expect(other).toEqual([]);
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(1);

    const occurrence = await harness.database.getTaskOccurrence(created.value);
    expect(occurrence).toMatchObject({ completion: 'completed', revision: revision(1) });
    // One completion, one audit event — the loser appended nothing.
    const events = await harness.database.getAllTaskEvents();
    expect(events.filter((event) => event.type === 'completion-checked')).toHaveLength(1);
  });

  it('reports the revision actually stored, not the one the loser guessed', async () => {
    await harness.repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Already there',
      expectedRevision: revision(0),
    });

    const stale = await harness.repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Stale writer',
      expectedRevision: revision(0),
    });

    expect(stale).toEqual({
      ok: false,
      error: {
        code: 'RevisionConflict',
        expectedRevision: revision(0),
        actualRevision: revision(1),
      },
    });
  });

  it('serializes a burst of writers into one winner per revision', async () => {
    const writers = await Promise.all([
      competitor(50_000),
      competitor(60_000),
      competitor(70_000),
      competitor(80_000),
    ]);

    const results = await Promise.all(
      writers.map((writer, index) =>
        writer.addWeeklyGoal({
          weekStart: MONDAY,
          statement: `Writer ${String(index)}`,
          expectedRevision: revision(0),
        }),
      ),
    );

    const { succeeded, conflicted, other } = partition(results);
    expect(other).toEqual([]);
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(3);

    const week = await harness.database.getWeek(MONDAY);
    expect(week?.goals).toHaveLength(1);
    expect(week?.revision).toBe(revision(1));
  });
});
