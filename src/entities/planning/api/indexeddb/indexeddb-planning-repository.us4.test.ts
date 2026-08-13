import { IDBFactory } from 'fake-indexeddb';
import type { IDBPDatabase } from 'idb';
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

const DATABASE_NAME = 'orbit-us4-test';
const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const NOW = instant('2026-08-11T15:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 800;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

describe('IndexedDB planning repository — US4', () => {
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

  async function createTask(title: string, minutes: number, position: number) {
    const result = await repository.createTask({
      title,
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(minutes),
      dayPosition: dayPosition(position),
    });
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }

  it('reruns bounded habit preparation, rejects pending/future closure, and catches up a past day', async () => {
    const definition = await repository.createHabitDefinition({
      title: 'Daily check',
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2] },
    });
    expect(definition.ok).toBe(true);

    const future = await repository.closeDay({
      date: WEDNESDAY,
      expectedDayRevision: revision(0),
      dispositions: {},
    });
    expect(future).toMatchObject({ ok: false, error: { code: 'FutureDayClosure' } });

    const pending = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: revision(0),
      dispositions: {},
    });
    expect(pending).toMatchObject({ ok: false, error: { code: 'PendingHabitOutcomes' } });
    expect(await database.count('habitOccurrences')).toBe(0);

    const past = await repository.closeDay({
      date: MONDAY,
      expectedDayRevision: revision(0),
      dispositions: {},
    });
    expect(past).toMatchObject({
      ok: true,
      value: {
        score: {
          task: { applicable: 0, rate: 'unavailable' },
          habit: { completed: 0, applicable: 1, rate: 0 },
          value: 0,
          weightsApplied: { task: 0, habit: 100 },
        },
        plannedLoadMinutes: 0,
      },
    });
    expect(await database.get('days', MONDAY)).toMatchObject({
      status: 'closed',
      closedAt: NOW,
    });
    expect(await database.getAllFromIndex('habitOccurrences', 'by-date', MONDAY)).toMatchObject([
      {
        outcome: 'not-completed',
        outcomeEvents: [{ source: 'date-boundary', outcome: 'not-completed' }],
      },
    ]);
  });

  it('atomically applies all four dispositions and freezes pre-disposition score/load/state', async () => {
    const completedId = await createTask('Completed', 10, 0);
    const keptId = await createTask('Keep', 20, 1);
    const movedId = await createTask('Move', 30, 2);
    const backlogId = await createTask('Backlog', 40, 3);
    const canceledId = await createTask('Cancel', 50, 4);
    await repository.setTaskCompletion({
      occurrenceId: completedId,
      date: TUESDAY,
      completed: true,
      expectedRevision: revision(0),
    });

    const definition = await repository.createHabitDefinition({
      title: 'Habit',
      recurrenceRule: { startDate: TUESDAY, weekdays: [2] },
    });
    if (!definition.ok) throw new Error(definition.error.code);
    await repository.prepareOpenPeriod({ kind: 'day', date: TUESDAY });
    const habit = (await database.getAllFromIndex('habitOccurrences', 'by-date', TUESDAY))[0];
    if (habit === undefined) throw new Error('missing habit');
    const dayBeforeHabit = await database.get('days', TUESDAY);
    if (dayBeforeHabit === undefined) throw new Error('missing day');
    await repository.recordHabitOutcome({
      occurrenceId: habit.id,
      outcome: 'completed',
      expectedRevision: dayBeforeHabit.revision,
    });

    const source = await database.get('days', TUESDAY);
    if (source === undefined) throw new Error('missing source day');
    const destinationBeforeClosure = await database.get('days', WEDNESDAY);
    const weekBeforeClosure = await database.get('weeks', MONDAY);
    if (destinationBeforeClosure === undefined || weekBeforeClosure === undefined) {
      throw new Error('missing destination aggregate');
    }
    await database.put('days', {
      ...source,
      state: {
        energy: 4,
        mood: 3,
        sleepDurationMinutes: nonNegativeDurationMinutes(420),
        updatedAt: NOW,
      },
    });

    const closed = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: source.revision,
      dispositions: {
        [keptId]: { kind: 'keep-unfinished' },
        [movedId]: {
          kind: 'move-to-date',
          destinationDate: WEDNESDAY,
          durationMinutes: durationMinutes(35),
          dayPosition: dayPosition(0),
        },
        [backlogId]: { kind: 'move-to-backlog' },
        [canceledId]: { kind: 'cancel' },
      },
    });
    expect(closed).toMatchObject({
      ok: true,
      value: {
        score: {
          task: { completed: 1, applicable: 5, rate: 0.2 },
          habit: { completed: 1, applicable: 1, rate: 1 },
          value: 44,
          weightsApplied: { task: 70, habit: 30 },
        },
        plannedLoadMinutes: 150,
      },
    });

    const closedDay = await database.get('days', TUESDAY);
    expect(closedDay).toMatchObject({
      status: 'closed',
      state: { energy: 4, mood: 3, sleepDurationMinutes: 420 },
      closureSnapshot: { plannedLoadMinutes: 150 },
      closedAt: NOW,
      revision: Number(source.revision) + 1,
    });
    expect(await database.get('days', WEDNESDAY)).toMatchObject({
      revision: Number(destinationBeforeClosure.revision) + 1,
    });
    expect(await database.get('weeks', MONDAY)).toMatchObject({
      revision: Number(weekBeforeClosure.revision) + 1,
    });
    const memberships = await database.getAllFromIndex('taskPlanEntries', 'by-date', TUESDAY);
    const outcomeById = new Map(memberships.map((entry) => [entry.occurrenceId, entry.outcome]));
    expect(outcomeById).toEqual(
      new Map([
        [completedId, 'completed'],
        [keptId, 'kept-unfinished'],
        [movedId, 'moved'],
        [backlogId, 'backlogged'],
        [canceledId, 'canceled'],
      ]),
    );
    expect(memberships.every((entry) => entry.finalizedAt === NOW)).toBe(true);
    expect(await database.get('taskOccurrences', movedId)).toMatchObject({
      state: 'active',
      placement: { kind: 'day', date: WEDNESDAY },
      plannedDurationMinutes: 35,
    });
    expect(await database.get('taskOccurrences', backlogId)).toMatchObject({
      state: 'active',
      placement: { kind: 'backlog' },
    });
    expect(await database.get('taskOccurrences', keptId)).toMatchObject({
      state: 'finalized',
      placement: { kind: 'none' },
    });
    expect(await database.get('taskOccurrences', canceledId)).toMatchObject({
      state: 'finalized',
      placement: { kind: 'none' },
    });
    expect(await database.getAllFromIndex('taskPlanEntries', 'by-date', WEDNESDAY)).toHaveLength(1);
    const closureEvents = (await database.getAll('taskEvents')).filter((event) =>
      event.type.startsWith('closure-'),
    );
    expect(closureEvents.map((event) => event.type)).toEqual([
      'closure-keep',
      'closure-move',
      'closure-move',
      'closure-cancel',
    ]);

    const immutable = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: closedDay?.revision ?? revision(0),
      dispositions: {},
    });
    expect(immutable).toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });
  });

  it('rejects disposition mismatches and invalid/newly closed destinations with total rollback', async () => {
    const firstId = await createTask('First', 20, 0);
    const secondId = await createTask('Second', 30, 1);
    const before = await repository.getTaskHistory(firstId);
    const day = await database.get('days', TUESDAY);
    if (day === undefined) throw new Error('missing day');

    const mismatch = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: day.revision,
      dispositions: { [firstId]: { kind: 'keep-unfinished' } },
    });
    expect(mismatch).toMatchObject({ ok: false, error: { code: 'ClosureDispositionMismatch' } });

    const invalidDuration = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: day.revision,
      dispositions: {
        [firstId]: { kind: 'keep-unfinished' },
        [secondId]: {
          kind: 'move-to-date',
          destinationDate: WEDNESDAY,
          durationMinutes: 0 as never,
          dayPosition: dayPosition(0),
        },
      },
    });
    expect(invalidDuration).toMatchObject({
      ok: false,
      error: { code: 'ValidationFailure' },
    });

    const sameDate = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: day.revision,
      dispositions: {
        [firstId]: { kind: 'keep-unfinished' },
        [secondId]: {
          kind: 'move-to-date',
          destinationDate: TUESDAY,
          durationMinutes: durationMinutes(30),
          dayPosition: dayPosition(0),
        },
      },
    });
    expect(sameDate).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });

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
    const targetClosed = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: day.revision,
      dispositions: {
        [firstId]: { kind: 'keep-unfinished' },
        [secondId]: {
          kind: 'move-to-date',
          destinationDate: WEDNESDAY,
          durationMinutes: durationMinutes(30),
          dayPosition: dayPosition(0),
        },
      },
    });
    expect(targetClosed).toMatchObject({ ok: false, error: { code: 'MoveTargetClosed' } });
    await expect(repository.getTaskHistory(firstId)).resolves.toEqual(before);
    expect(await database.get('days', TUESDAY)).toMatchObject({ status: 'open' });
    expect(
      (await database.getAll('taskEvents')).some((event) => event.type.startsWith('closure-')),
    ).toBe(false);
  });
});
