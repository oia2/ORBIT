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

const DATABASE_NAME = 'orbit-us5-test';
const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const NOW = instant('2026-08-11T16:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 1000;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

describe('IndexedDB planning repository — US5', () => {
  let database: IDBPDatabase<OrbitPlanningDB>;
  let repository: ReturnType<typeof createIndexedDbPlanningRepository>;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    await repository.ensureCalendarWeek({ date: TUESDAY });
  });

  afterEach(() => {
    repository.dispose();
  });

  it('persists state, bumps owning aggregates, and projects the same score/load after reload', async () => {
    const task = await repository.createTask({
      title: 'Open task',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    });
    if (!task.ok) throw new Error(task.error.code);
    const definition = await repository.createHabitDefinition({
      title: 'Completed habit',
      recurrenceRule: { startDate: TUESDAY, weekdays: [2] },
    });
    if (!definition.ok) throw new Error(definition.error.code);
    await repository.prepareOpenPeriod({ kind: 'day', date: TUESDAY });
    const habit = (await database.getAllFromIndex('habitOccurrences', 'by-date', TUESDAY))[0];
    const dayBeforeOutcome = await database.get('days', TUESDAY);
    if (habit === undefined || dayBeforeOutcome === undefined) throw new Error('missing facts');
    await repository.recordHabitOutcome({
      occurrenceId: habit.id,
      outcome: 'completed',
      expectedRevision: dayBeforeOutcome.revision,
    });

    const dayBeforeState = await database.get('days', TUESDAY);
    const weekBeforeState = await database.get('weeks', MONDAY);
    if (dayBeforeState === undefined || weekBeforeState === undefined) throw new Error('missing');
    const saved = await repository.saveDailyState({
      date: TUESDAY,
      energy: 5,
      mood: 2,
      sleepDurationMinutes: nonNegativeDurationMinutes(420),
      expectedDayRevision: dayBeforeState.revision,
    });
    expect(saved).toMatchObject({
      ok: true,
      affectedDates: [TUESDAY],
      affectedWeeks: [MONDAY],
    });
    expect(await database.get('days', TUESDAY)).toMatchObject({
      revision: Number(dayBeforeState.revision) + 1,
      state: { energy: 5, mood: 2, sleepDurationMinutes: 420, updatedAt: NOW },
    });
    expect(await database.get('weeks', MONDAY)).toMatchObject({
      revision: Number(weekBeforeState.revision) + 1,
    });

    const day = await repository.getDayView(TUESDAY);
    expect(day).toMatchObject({
      ok: true,
      value: {
        day: { state: { energy: 5, mood: 2, sleepDurationMinutes: 420 } },
        score: {
          task: { completed: 0, applicable: 1, rate: 0 },
          habit: { completed: 1, applicable: 1, rate: 1 },
          value: 30,
        },
        plannedLoadMinutes: 30,
      },
    });
    const week = await repository.getWeekView(MONDAY);
    expect(week.ok && week.value.days.find((summary) => summary.date === TUESDAY)).toMatchObject({
      score: { value: 30 },
      plannedLoadMinutes: 30,
    });

    repository.dispose();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    await expect(repository.getDayView(TUESDAY)).resolves.toMatchObject({
      ok: true,
      value: {
        day: { state: { energy: 5, mood: 2, sleepDurationMinutes: 420 } },
        score: { value: 30 },
        plannedLoadMinutes: 30,
      },
    });
  });

  it('rejects invalid signals and stale or immutable writes without changing score/load', async () => {
    const invalid = await repository.saveDailyState({
      date: TUESDAY,
      energy: 0 as never,
      mood: 6 as never,
      sleepDurationMinutes: -1 as never,
      expectedDayRevision: revision(0),
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    expect((await database.get('days', TUESDAY))?.state).toBeUndefined();

    const saved = await repository.saveDailyState({
      date: TUESDAY,
      energy: 3,
      expectedDayRevision: revision(0),
    });
    expect(saved.ok).toBe(true);
    const stale = await repository.saveDailyState({
      date: TUESDAY,
      mood: 4,
      expectedDayRevision: revision(0),
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'RevisionConflict' } });

    const day = await database.get('days', TUESDAY);
    if (day === undefined) throw new Error('missing day');
    const closed = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: day.revision,
      dispositions: {},
    });
    if (!closed.ok) throw new Error(closed.error.code);
    const immutable = await repository.saveDailyState({
      date: TUESDAY,
      energy: 4,
      expectedDayRevision: (await database.get('days', TUESDAY))?.revision ?? revision(0),
    });
    expect(immutable).toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });
    await expect(repository.getDayView(TUESDAY)).resolves.toMatchObject({
      ok: true,
      value: {
        day: { state: { energy: 3 } },
        score: { value: 'unavailable' },
        plannedLoadMinutes: 0,
      },
    });
  });
});
