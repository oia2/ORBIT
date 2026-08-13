import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import {
  dayPosition,
  durationMinutes,
  nonNegativeDurationMinutes,
  revision,
} from '@/shared/lib/ids';

import { openOrbitPlanningDatabase } from './database';
import { createIndexedDbPlanningRepository } from './indexeddb-planning-repository';
import type { OrbitPlanningDB } from './schema';
import type { IDBPDatabase } from 'idb';

const DATABASE_NAME = 'orbit-us2-test';
const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const THURSDAY = localDate('2026-08-13');
const NOW = instant('2026-08-11T08:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 100;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

describe('IndexedDB planning repository — US2', () => {
  let database: IDBPDatabase<OrbitPlanningDB>;
  let repository: ReturnType<typeof createIndexedDbPlanningRepository>;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    await repository.ensureCalendarWeek({ date: MONDAY });
  });

  afterEach(() => {
    repository.dispose();
  });

  async function createDatedTask() {
    const result = await repository.createTask({
      title: 'Execute task',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    });
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }

  it('checks and unchecks while retaining deterministic equal-time audit order', async () => {
    const occurrenceId = await createDatedTask();

    await expect(
      repository.setTaskCompletion({
        occurrenceId,
        date: TUESDAY,
        completed: true,
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repository.editTaskOccurrence({
        occurrenceId,
        title: 'Edited while completed',
        expectedRevision: revision(1),
      }),
    ).resolves.toMatchObject({ ok: true });

    const blockedMove = await repository.moveTaskToDate({
      occurrenceId,
      destinationDate: WEDNESDAY,
      durationMinutes: durationMinutes(40),
      dayPosition: dayPosition(0),
      expectedRevision: revision(2),
    });
    expect(blockedMove).toMatchObject({
      ok: false,
      error: { code: 'TaskMustBeIncompleteToMove' },
    });

    await expect(
      repository.setTaskCompletion({
        occurrenceId,
        date: TUESDAY,
        completed: false,
        expectedRevision: revision(2),
      }),
    ).resolves.toMatchObject({ ok: true });

    const history = await repository.getTaskHistory(occurrenceId);
    expect(history.ok).toBe(true);
    if (!history.ok) throw new Error(history.error.code);
    expect(history.value.events.map((event) => event.type)).toEqual([
      'create',
      'completion-checked',
      'edit',
      'completion-unchecked',
    ]);
    expect(history.value.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(new Set(history.value.events.map((event) => event.occurredAt))).toEqual(new Set([NOW]));
  });

  it('moves A→B→A by reusing one membership per occurrence/date', async () => {
    const occurrenceId = await createDatedTask();

    const sameSource = await repository.moveTaskToDate({
      occurrenceId,
      destinationDate: TUESDAY,
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
      expectedRevision: revision(0),
    });
    expect(sameSource).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });

    await expect(
      repository.moveTaskToDate({
        occurrenceId,
        destinationDate: WEDNESDAY,
        durationMinutes: durationMinutes(45),
        dayPosition: dayPosition(0),
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repository.moveTaskToDate({
        occurrenceId,
        destinationDate: TUESDAY,
        durationMinutes: durationMinutes(35),
        dayPosition: dayPosition(1),
        expectedRevision: revision(1),
      }),
    ).resolves.toMatchObject({ ok: true });

    const history = await repository.getTaskHistory(occurrenceId);
    expect(history.ok).toBe(true);
    if (!history.ok) throw new Error(history.error.code);
    expect(history.value.memberships).toHaveLength(2);
    expect(history.value.memberships.map((entry) => entry.date).sort()).toEqual([
      TUESDAY,
      WEDNESDAY,
    ]);
    expect(history.value.memberships.find((entry) => entry.date === TUESDAY)?.outcome).toBe(
      'planned',
    );
    expect(history.value.memberships.find((entry) => entry.date === WEDNESDAY)?.outcome).toBe(
      'moved',
    );
    expect(history.value.events.map((event) => event.type)).toEqual([
      'create',
      'move-to-date',
      'move-to-date',
    ]);
  });

  it('handles undated backlog movement and positive-duration scheduling oldest first', async () => {
    const occurrenceId = await createDatedTask();
    await expect(
      repository.moveTaskToBacklog({ occurrenceId, expectedRevision: revision(0) }),
    ).resolves.toMatchObject({ ok: true });

    const second = await repository.createTask({
      title: 'Second backlog task',
      placement: { kind: 'backlog' },
    });
    if (!second.ok) throw new Error(second.error.code);

    const backlog = await repository.getBacklogView();
    expect(backlog.ok).toBe(true);
    if (!backlog.ok) throw new Error(backlog.error.code);
    expect(backlog.value.tasks.map((task) => task.id)).toEqual([occurrenceId, second.value]);

    const invalid = await repository.moveTaskToDate({
      occurrenceId,
      destinationDate: THURSDAY,
      durationMinutes: 0 as never,
      dayPosition: dayPosition(0),
      expectedRevision: revision(1),
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });

    await expect(
      repository.moveTaskToDate({
        occurrenceId,
        destinationDate: THURSDAY,
        durationMinutes: durationMinutes(25),
        dayPosition: dayPosition(0),
        expectedRevision: revision(1),
      }),
    ).resolves.toMatchObject({ ok: true });
    const history = await repository.getTaskHistory(occurrenceId);
    expect(history.ok && history.value.events.at(-1)?.type).toBe('schedule-from-backlog');
  });

  it('rejects a closed destination and preserves all prior facts atomically', async () => {
    const occurrenceId = await createDatedTask();
    const destination = await database.get('days', WEDNESDAY);
    if (destination === undefined) throw new Error('missing destination');
    await database.put('days', {
      ...destination,
      status: 'closed',
      closedAt: NOW,
      closureSnapshot: {
        score: {
          task: { completed: 0, applicable: 0, rate: 'unavailable' },
          habit: { completed: 0, applicable: 0, rate: 'unavailable' },
          value: 'unavailable',
          weightsApplied: { task: 0, habit: 0 },
        },
        plannedLoadMinutes: nonNegativeDurationMinutes(0),
      },
    });
    const before = await repository.getTaskHistory(occurrenceId);

    const result = await repository.moveTaskToDate({
      occurrenceId,
      destinationDate: WEDNESDAY,
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
      expectedRevision: revision(0),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'MoveTargetClosed' } });
    await expect(repository.getTaskHistory(occurrenceId)).resolves.toEqual(before);
  });

  it('deletes every open membership while preserving a finalized closed membership', async () => {
    const occurrenceId = await createDatedTask();
    await repository.moveTaskToDate({
      occurrenceId,
      destinationDate: WEDNESDAY,
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
      expectedRevision: revision(0),
    });
    const tuesday = await database.get('days', TUESDAY);
    if (tuesday === undefined) throw new Error('missing Tuesday');
    await database.put('days', {
      ...tuesday,
      status: 'closed',
      closedAt: NOW,
      closureSnapshot: {
        score: {
          task: { completed: 0, applicable: 1, rate: 0 },
          habit: { completed: 0, applicable: 0, rate: 'unavailable' },
          value: 0,
          weightsApplied: { task: 100, habit: 0 },
        },
        plannedLoadMinutes: nonNegativeDurationMinutes(30),
      },
    });
    const entries = await database.getAllFromIndex(
      'taskPlanEntries',
      'by-occurrence-date',
      IDBKeyRange.bound([occurrenceId, ''], [occurrenceId, '\uffff']),
    );
    const tuesdayEntry = entries.find((entry) => entry.date === TUESDAY);
    if (tuesdayEntry === undefined) throw new Error('missing Tuesday membership');
    await database.put('taskPlanEntries', {
      ...tuesdayEntry,
      outcome: 'kept-unfinished',
      finalizedAt: NOW,
    });

    await expect(
      repository.deleteTaskOccurrence({ occurrenceId, expectedRevision: revision(1) }),
    ).resolves.toMatchObject({ ok: true });
    const history = await repository.getTaskHistory(occurrenceId);
    expect(history.ok).toBe(true);
    if (!history.ok) throw new Error(history.error.code);
    expect(history.value.occurrence.state).toBe('deleted');
    expect(history.value.memberships.find((entry) => entry.date === TUESDAY)?.outcome).toBe(
      'kept-unfinished',
    );
    expect(history.value.memberships.find((entry) => entry.date === WEDNESDAY)?.outcome).toBe(
      'deleted',
    );
    expect(history.value.events.at(-1)?.type).toBe('delete');
  });
});
