import { beforeEach, describe, expect, it } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import {
  dayPosition,
  durationMinutes,
  nonNegativeDurationMinutes,
  revision,
} from '@/shared/lib/ids';

import {
  createRepositoryUnderTest,
  reopenRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const NOW = instant('2026-08-11T16:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 1000;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

describe('PostgreSQL planning repository — US5', () => {
  let repository: RepositoryUnderTest['repository'];
  let database: RepositoryUnderTest['database'];

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    database = harness.database;
    await repository.ensureCalendarWeek({ date: TUESDAY });
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
    const habit = (await database.getHabitOccurrencesByDate(TUESDAY))[0];
    const dayBeforeOutcome = await database.getDay(TUESDAY);
    if (habit === undefined || dayBeforeOutcome === undefined) throw new Error('missing facts');
    await repository.recordHabitOutcome({
      occurrenceId: habit.id,
      outcome: 'completed',
      expectedRevision: dayBeforeOutcome.revision,
    });

    const dayBeforeState = await database.getDay(TUESDAY);
    const weekBeforeState = await database.getWeek(MONDAY);
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
    expect(await database.getDay(TUESDAY)).toMatchObject({
      revision: Number(dayBeforeState.revision) + 1,
      state: { energy: 5, mood: 2, sleepDurationMinutes: 420, updatedAt: NOW },
    });
    expect(await database.getWeek(MONDAY)).toMatchObject({
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
          // 1 of 2 items done. Under the old 70/30 split this read 30.
          value: 50,
        },
        plannedLoadMinutes: 30,
      },
    });
    const week = await repository.getWeekView(MONDAY);
    expect(week.ok && week.value.days.find((summary) => summary.date === TUESDAY)).toMatchObject({
      score: { value: 50 },
      plannedLoadMinutes: 30,
    });

    const reopened = await reopenRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    await expect(reopened.repository.getDayView(TUESDAY)).resolves.toMatchObject({
      ok: true,
      value: {
        day: { state: { energy: 5, mood: 2, sleepDurationMinutes: 420 } },
        score: { value: 50 },
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
    expect((await database.getDay(TUESDAY))?.state).toBeUndefined();

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

    const day = await database.getDay(TUESDAY);
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
      expectedDayRevision: (await database.getDay(TUESDAY))?.revision ?? revision(0),
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

/*
 * 003 US6 (FR-030, FR-034). The rule that matters here is scope: a duration
 * change reaches every open day and stops at the boundary of a closed one.
 */
describe('PostgreSQL planning repository — 003 US6 habit duration', () => {
  let repository: RepositoryUnderTest['repository'];

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    await repository.ensureCalendarWeek({ date: MONDAY });
  });

  async function habitApplyingAllWeek(durationMinutes?: number) {
    const created = await repository.createHabitDefinition({
      title: 'Workout',
      ...(durationMinutes === undefined ? {} : { durationMinutes: durationMinutes as never }),
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2, 3, 4, 5, 6, 7] },
    });
    if (!created.ok) throw new Error(created.error.code);
    return created.value;
  }

  async function loadOn(date: typeof TUESDAY) {
    const view = await repository.getDayView(date);
    if (!view.ok) throw new Error(view.error.code);
    return Number(view.value.plannedLoadMinutes);
  }

  async function scoreOn(date: typeof TUESDAY) {
    const view = await repository.getDayView(date);
    if (!view.ok) throw new Error(view.error.code);
    return view.value.score;
  }

  it('adds a habit duration to the planned load of every open day it applies to', async () => {
    const definitionId = await habitApplyingAllWeek();
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    expect(await loadOn(TUESDAY)).toBe(0);
    const scoreBefore = await scoreOn(TUESDAY);

    const definition = await repository.getDayView(TUESDAY);
    if (!definition.ok) throw new Error(definition.error.code);

    const updated = await repository.updateHabitDuration({
      definitionId,
      durationMinutes: 45 as never,
      expectedRevision: 0 as never,
    });
    if (!updated.ok) throw new Error(updated.error.code);

    expect(await loadOn(TUESDAY)).toBe(45);
    // FR-033: load moved, the result did not.
    expect(await scoreOn(TUESDAY)).toEqual(scoreBefore);
  });

  it('leaves a closed day frozen load untouched (FR-034)', async () => {
    const definitionId = await habitApplyingAllWeek();
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    // Monday is already past, so the date-boundary catch-up has resolved its
    // habits; nothing is pending and the day can be closed as it stands.
    const reread = await repository.getDayView(MONDAY);
    if (!reread.ok) throw new Error(reread.error.code);
    const closed = await repository.closeDay({
      date: MONDAY,
      expectedDayRevision: reread.value.day.revision,
      dispositions: {},
    });
    if (!closed.ok) throw new Error(closed.error.code);
    const frozenLoad = Number(closed.value.plannedLoadMinutes);

    const updated = await repository.updateHabitDuration({
      definitionId,
      durationMinutes: 45 as never,
      expectedRevision: 0 as never,
    });
    if (!updated.ok) throw new Error(updated.error.code);

    // The closed day keeps what it froze; the open day picks the change up.
    expect(await loadOn(MONDAY)).toBe(frozenLoad);
    expect(await loadOn(TUESDAY)).toBe(45);
    expect(updated.affectedDates).not.toContain(MONDAY);
  });

  it('clears a duration back to nothing', async () => {
    const definitionId = await habitApplyingAllWeek(30);
    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    expect(await loadOn(TUESDAY)).toBe(30);

    const cleared = await repository.updateHabitDuration({
      definitionId,
      durationMinutes: null,
      expectedRevision: 0 as never,
    });
    if (!cleared.ok) throw new Error(cleared.error.code);

    expect(await loadOn(TUESDAY)).toBe(0);
  });

  it('rejects a non-positive duration', async () => {
    const definitionId = await habitApplyingAllWeek();

    const refused = await repository.updateHabitDuration({
      definitionId,
      durationMinutes: 0 as never,
      expectedRevision: 0 as never,
    });

    expect(refused).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
  });
});
