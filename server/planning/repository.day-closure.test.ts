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
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const NOW = instant('2026-08-11T15:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 800;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

describe('PostgreSQL planning repository — US4', () => {
  let repository: RepositoryUnderTest['repository'];
  let database: RepositoryUnderTest['database'];

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    database = harness.database;
    await repository.ensureCalendarWeek({ date: MONDAY });
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
    expect(await database.countHabitOccurrences()).toBe(0);

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
        },
        plannedLoadMinutes: 0,
      },
    });
    expect(await database.getDay(MONDAY)).toMatchObject({
      status: 'closed',
      closedAt: NOW,
    });
    expect(await database.getHabitOccurrencesByDate(MONDAY)).toMatchObject([
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
    const habit = (await database.getHabitOccurrencesByDate(TUESDAY))[0];
    if (habit === undefined) throw new Error('missing habit');
    const dayBeforeHabit = await database.getDay(TUESDAY);
    if (dayBeforeHabit === undefined) throw new Error('missing day');
    await repository.recordHabitOutcome({
      occurrenceId: habit.id,
      outcome: 'completed',
      expectedRevision: dayBeforeHabit.revision,
    });

    const source = await database.getDay(TUESDAY);
    if (source === undefined) throw new Error('missing source day');
    const destinationBeforeClosure = await database.getDay(WEDNESDAY);
    const weekBeforeClosure = await database.getWeek(MONDAY);
    if (destinationBeforeClosure === undefined || weekBeforeClosure === undefined) {
      throw new Error('missing destination aggregate');
    }
    await database.putDay({
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
          // 2 of 6 items done. Under the old 70/30 split this read 44.
          value: 33,
        },
        plannedLoadMinutes: 150,
      },
    });

    const closedDay = await database.getDay(TUESDAY);
    expect(closedDay).toMatchObject({
      status: 'closed',
      state: { energy: 4, mood: 3, sleepDurationMinutes: 420 },
      closureSnapshot: { plannedLoadMinutes: 150 },
      closedAt: NOW,
      revision: Number(source.revision) + 1,
    });
    expect(await database.getDay(WEDNESDAY)).toMatchObject({
      revision: Number(destinationBeforeClosure.revision) + 1,
    });
    expect(await database.getWeek(MONDAY)).toMatchObject({
      revision: Number(weekBeforeClosure.revision) + 1,
    });
    const memberships = await database.getPlanEntriesByDate(TUESDAY);
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
    expect(await database.getTaskOccurrence(movedId)).toMatchObject({
      state: 'active',
      placement: { kind: 'day', date: WEDNESDAY },
      plannedDurationMinutes: 35,
    });
    expect(await database.getTaskOccurrence(backlogId)).toMatchObject({
      state: 'active',
      placement: { kind: 'backlog' },
    });
    expect(await database.getTaskOccurrence(keptId)).toMatchObject({
      state: 'finalized',
      placement: { kind: 'none' },
    });
    expect(await database.getTaskOccurrence(canceledId)).toMatchObject({
      state: 'finalized',
      placement: { kind: 'none' },
    });
    expect(await database.getPlanEntriesByDate(WEDNESDAY)).toHaveLength(1);
    const closureEvents = (await database.getAllTaskEvents()).filter((event) =>
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
    const day = await database.getDay(TUESDAY);
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

    const destination = await database.getDay(WEDNESDAY);
    if (destination === undefined) throw new Error('missing destination');
    await database.putDay({
      ...destination,
      status: 'closed',
      closedAt: NOW,
      closureSnapshot: {
        score: {
          task: { completed: 0, applicable: 0, rate: 'unavailable' },
          habit: { completed: 0, applicable: 0, rate: 'unavailable' },
          value: 'unavailable',
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
    expect(await database.getDay(TUESDAY)).toMatchObject({ status: 'open' });
    expect(
      (await database.getAllTaskEvents()).some((event) => event.type.startsWith('closure-')),
    ).toBe(false);
  });
});

/*
 * 003 US2 (FR-008). The Day, Week, and History surfaces used to reach the same
 * numbers through three separate implementations, and `getWeekView` reached a
 * different one entirely: it returned a fabricated empty aggregate for any open
 * week. This suite is the invariant that keeps all three honest.
 */
describe('003 US2: every surface reports the same counts for the same day', () => {
  let repository: RepositoryUnderTest['repository'];

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    await repository.ensureCalendarWeek({ date: MONDAY });
  });

  async function addTask(title: string, position: number) {
    const created = await repository.createTask({
      title,
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(position),
    });
    if (!created.ok) throw new Error(created.error.code);
    return created.value;
  }

  async function completeTask(occurrenceId: Awaited<ReturnType<typeof addTask>>) {
    const done = await repository.setTaskCompletion({
      occurrenceId,
      date: TUESDAY,
      completed: true,
      expectedRevision: revision(0),
    });
    if (!done.ok) throw new Error(done.error.code);
  }

  it('agrees across getDayView, getWeekView, and getHistoryView for a closed day', async () => {
    const first = await addTask('Done one', 0);
    const second = await addTask('Done two', 1);
    const third = await addTask('Left open', 2);
    await completeTask(first);
    await completeTask(second);

    const dayBefore = await repository.getDayView(TUESDAY);
    if (!dayBefore.ok) throw new Error(dayBefore.error.code);
    const liveScore = dayBefore.value.score;
    expect(liveScore.task).toEqual({ completed: 2, applicable: 3, rate: 2 / 3 });

    const closed = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: dayBefore.value.day.revision,
      dispositions: { [third]: { kind: 'keep-unfinished' } },
    });
    if (!closed.ok) throw new Error(closed.error.code);

    // FR-006: the frozen counts are the counts the open day was showing.
    expect(closed.value.score.task).toEqual(liveScore.task);

    const dayAfter = await repository.getDayView(TUESDAY);
    const weekAfter = await repository.getWeekView(TUESDAY);
    const historyAfter = await repository.getHistoryView({ mode: 'day', anchorDate: TUESDAY });
    if (!dayAfter.ok || !weekAfter.ok || !historyAfter.ok) throw new Error('projection failed');

    const fromWeek = weekAfter.value.days.find((day) => day.date === TUESDAY);
    expect(fromWeek).toBeDefined();
    if (historyAfter.value.mode !== 'day') throw new Error('expected a day history view');

    expect(dayAfter.value.score).toEqual(closed.value.score);
    expect(fromWeek?.score).toEqual(closed.value.score);
    expect(historyAfter.value.facts.score).toEqual(closed.value.score);

    // Completed tasks are never reported as zero anywhere (FR-006).
    for (const score of [dayAfter.value.score, fromWeek?.score, historyAfter.value.facts.score]) {
      expect(score?.task.completed).toBe(2);
      expect(score?.task.applicable).toBe(3);
    }
  });

  it('reports the real aggregate for an open week instead of a fabricated empty one', async () => {
    const first = await addTask('Done', 0);
    await addTask('Not done', 1);
    await completeTask(first);

    const week = await repository.getWeekView(TUESDAY);
    if (!week.ok) throw new Error(week.error.code);

    expect(week.value.week.status).toBe('open');
    // Before 003 this was `{completed: 0, applicable: 0, rate: 'unavailable'}`
    // regardless of what the week contained.
    expect(week.value.progress.task).toEqual({ completed: 1, applicable: 2, rate: 1 / 2 });
    expect(week.value.progress.value).not.toBe('unavailable');
  });

  it('reports an open week with nothing planned as having no data', async () => {
    const week = await repository.getWeekView(TUESDAY);
    if (!week.ok) throw new Error(week.error.code);

    expect(week.value.progress.value).toBe('unavailable');
    expect(week.value.progress.task.applicable).toBe(0);
  });
});
