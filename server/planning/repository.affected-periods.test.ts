import { beforeEach, describe, expect, it } from 'vitest';

import {
  dayPosition,
  durationMinutes,
  nonNegativeDurationMinutes,
  revision,
} from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import type { CommandResult } from '@/entities/planning/model/planning-repository';

import {
  createRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const NOW = instant('2026-08-11T09:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 5000;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

function receipt<T>(result: CommandResult<T>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return {
    affectedDates: result.affectedDates,
    affectedWeeks: result.affectedWeeks,
    value: result.value,
  };
}

/**
 * The client invalidates its cached views from `affectedDates` and
 * `affectedWeeks`, so a command that changes a period without naming it leaves
 * a stale screen. Feature 001's suites assert these for the commands they
 * exercise; this covers the interface as a whole.
 */
describe('command receipts name every period they change', () => {
  let repository: RepositoryUnderTest['repository'];
  let database: RepositoryUnderTest['database'];

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    database = harness.database;
  });

  it('names the created week and its seven days, then nothing on a repeat', async () => {
    const created = receipt(await repository.ensureCalendarWeek({ date: TUESDAY }));
    expect(created.affectedWeeks).toEqual([MONDAY]);
    expect(created.affectedDates).toHaveLength(7);

    const repeated = receipt(await repository.ensureCalendarWeek({ date: TUESDAY }));
    expect(repeated).toMatchObject({ affectedDates: [], affectedWeeks: [] });
  });

  it('names only the week for goal commands, which no day view depends on', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });

    const added = receipt(
      await repository.addWeeklyGoal({
        weekStart: MONDAY,
        statement: 'Goal',
        expectedRevision: revision(0),
      }),
    );
    expect(added).toMatchObject({ affectedDates: [], affectedWeeks: [MONDAY] });

    const edited = receipt(
      await repository.editWeeklyGoal({
        weekStart: MONDAY,
        goalId: added.value,
        statement: 'Edited goal',
        expectedRevision: revision(1),
      }),
    );
    expect(edited).toMatchObject({ affectedDates: [], affectedWeeks: [MONDAY] });

    const reordered = receipt(
      await repository.reorderWeeklyGoals({
        weekStart: MONDAY,
        orderedGoalIds: [added.value],
        expectedRevision: revision(2),
      }),
    );
    expect(reordered).toMatchObject({ affectedDates: [], affectedWeeks: [MONDAY] });

    const deleted = receipt(
      await repository.deleteWeeklyGoal({
        weekStart: MONDAY,
        goalId: added.value,
        expectedRevision: revision(3),
      }),
    );
    expect(deleted).toMatchObject({ affectedDates: [], affectedWeeks: [MONDAY] });
  });

  it('names both the source and destination period when a task moves', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });

    const created = receipt(
      await repository.createTask({
        title: 'Dated',
        placement: { kind: 'day', date: TUESDAY },
        durationMinutes: durationMinutes(30),
        dayPosition: dayPosition(0),
      }),
    );
    expect(created).toMatchObject({ affectedDates: [TUESDAY], affectedWeeks: [MONDAY] });

    const moved = receipt(
      await repository.moveTaskToDate({
        occurrenceId: created.value,
        destinationDate: WEDNESDAY,
        durationMinutes: durationMinutes(30),
        dayPosition: dayPosition(0),
        expectedRevision: revision(0),
      }),
    );
    expect(moved.affectedDates).toEqual([TUESDAY, WEDNESDAY]);
    expect(moved.affectedWeeks).toEqual([MONDAY]);

    const backlogged = receipt(
      await repository.moveTaskToBacklog({
        occurrenceId: created.value,
        expectedRevision: revision(1),
      }),
    );
    expect(backlogged).toMatchObject({ affectedDates: [WEDNESDAY], affectedWeeks: [MONDAY] });
  });

  it('names no period for a backlog-only change', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });

    const created = receipt(
      await repository.createTask({ title: 'Backlog', placement: { kind: 'backlog' } }),
    );
    expect(created).toMatchObject({ affectedDates: [], affectedWeeks: [] });

    const edited = receipt(
      await repository.editTaskOccurrence({
        occurrenceId: created.value,
        title: 'Renamed',
        expectedRevision: revision(0),
      }),
    );
    expect(edited).toMatchObject({ affectedDates: [], affectedWeeks: [] });

    const deleted = receipt(
      await repository.deleteTaskOccurrence({
        occurrenceId: created.value,
        expectedRevision: revision(1),
      }),
    );
    expect(deleted).toMatchObject({ affectedDates: [], affectedWeeks: [] });
  });

  it('names the owning day and week for completion, ordering, and daily state', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });
    const created = receipt(
      await repository.createTask({
        title: 'Dated',
        placement: { kind: 'day', date: TUESDAY },
        durationMinutes: durationMinutes(30),
        dayPosition: dayPosition(0),
      }),
    );

    const checked = receipt(
      await repository.setTaskCompletion({
        occurrenceId: created.value,
        date: TUESDAY,
        completed: true,
        expectedRevision: revision(0),
      }),
    );
    expect(checked).toMatchObject({ affectedDates: [TUESDAY], affectedWeeks: [MONDAY] });

    const day = await database.getDay(TUESDAY);
    if (day === undefined) throw new Error('missing day');
    const reordered = receipt(
      await repository.reorderDatedTasks({
        date: TUESDAY,
        orderedOccurrenceIds: [created.value],
        expectedDayRevision: day.revision,
      }),
    );
    expect(reordered).toMatchObject({ affectedDates: [TUESDAY], affectedWeeks: [MONDAY] });

    const afterReorder = await database.getDay(TUESDAY);
    if (afterReorder === undefined) throw new Error('missing day');
    const saved = receipt(
      await repository.saveDailyState({
        date: TUESDAY,
        energy: 3,
        expectedDayRevision: afterReorder.revision,
      }),
    );
    expect(saved).toMatchObject({ affectedDates: [TUESDAY], affectedWeeks: [MONDAY] });
  });

  it('names no period for recurrence definitions, which materialize separately', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });

    const series = receipt(
      await repository.createTaskSeries({
        template: { title: 'Series', plannedDurationMinutes: durationMinutes(15) },
        recurrenceRule: { startDate: TUESDAY, weekdays: [2] },
      }),
    );
    expect(series).toMatchObject({ affectedDates: [], affectedWeeks: [] });

    const updated = receipt(
      await repository.updateTaskSeriesRule({
        seriesId: series.value,
        recurrenceRule: { startDate: TUESDAY, weekdays: [3] },
        expectedRevision: revision(0),
      }),
    );
    expect(updated).toMatchObject({ affectedDates: [], affectedWeeks: [] });

    const stopped = receipt(
      await repository.stopTaskSeries({ seriesId: series.value, expectedRevision: revision(1) }),
    );
    expect(stopped).toMatchObject({ affectedDates: [], affectedWeeks: [] });

    const habit = receipt(
      await repository.createHabitDefinition({
        title: 'Habit',
        recurrenceRule: { startDate: TUESDAY, weekdays: [2] },
      }),
    );
    expect(habit).toMatchObject({ affectedDates: [], affectedWeeks: [] });

    const habitUpdated = receipt(
      await repository.updateHabitRule({
        definitionId: habit.value,
        recurrenceRule: { startDate: TUESDAY, weekdays: [3] },
        expectedRevision: revision(0),
      }),
    );
    expect(habitUpdated).toMatchObject({ affectedDates: [], affectedWeeks: [] });

    const habitStopped = receipt(
      await repository.stopHabitDefinition({
        definitionId: habit.value,
        expectedRevision: revision(1),
      }),
    );
    expect(habitStopped).toMatchObject({ affectedDates: [], affectedWeeks: [] });
  });

  it('names every date materialization touched, and every habit transition', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });
    await repository.createHabitDefinition({
      title: 'Habit',
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2] },
    });

    const prepared = receipt(
      await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY }),
    );
    expect(prepared).toMatchObject({ affectedDates: [MONDAY, TUESDAY], affectedWeeks: [MONDAY] });

    const [habitOccurrence] = await database.getHabitOccurrencesByDate(TUESDAY);
    if (habitOccurrence === undefined) throw new Error('missing habit occurrence');
    const tuesday = await database.getDay(TUESDAY);
    if (tuesday === undefined) throw new Error('missing day');

    const recorded = receipt(
      await repository.recordHabitOutcome({
        occurrenceId: habitOccurrence.id,
        outcome: 'completed',
        expectedRevision: tuesday.revision,
      }),
    );
    expect(recorded).toMatchObject({ affectedDates: [TUESDAY], affectedWeeks: [MONDAY] });

    const afterRecord = await database.getDay(TUESDAY);
    if (afterRecord === undefined) throw new Error('missing day');
    const cleared = receipt(
      await repository.clearHabitOutcome({
        occurrenceId: habitOccurrence.id,
        expectedRevision: afterRecord.revision,
      }),
    );
    expect(cleared).toMatchObject({ affectedDates: [TUESDAY], affectedWeeks: [MONDAY] });

    const afterClear = await database.getDay(TUESDAY);
    if (afterClear === undefined) throw new Error('missing day');
    const edited = receipt(
      await repository.editHabitOccurrence({
        occurrenceId: habitOccurrence.id,
        title: 'Renamed habit',
        expectedRevision: afterClear.revision,
      }),
    );
    expect(edited).toMatchObject({ affectedDates: [TUESDAY], affectedWeeks: [MONDAY] });

    const afterEdit = await database.getDay(TUESDAY);
    if (afterEdit === undefined) throw new Error('missing day');
    const removed = receipt(
      await repository.deleteHabitOccurrence({
        occurrenceId: habitOccurrence.id,
        expectedRevision: afterEdit.revision,
      }),
    );
    expect(removed).toMatchObject({ affectedDates: [TUESDAY], affectedWeeks: [MONDAY] });

    const [mondayHabit] = await database.getHabitOccurrencesByDate(MONDAY);
    if (mondayHabit === undefined) throw new Error('missing Monday habit');
    const monday = await database.getDay(MONDAY);
    if (monday === undefined) throw new Error('missing Monday');
    const corrected = receipt(
      await repository.correctBoundaryMissToCompleted({
        occurrenceId: mondayHabit.id,
        expectedRevision: monday.revision,
      }),
    );
    expect(corrected).toMatchObject({ affectedDates: [MONDAY], affectedWeeks: [MONDAY] });
  });

  it('names the closed day, every move destination, and the owning week at closure', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });
    const moved = receipt(
      await repository.createTask({
        title: 'Move me',
        placement: { kind: 'day', date: TUESDAY },
        durationMinutes: durationMinutes(30),
        dayPosition: dayPosition(0),
      }),
    );
    const day = await database.getDay(TUESDAY);
    if (day === undefined) throw new Error('missing day');

    const closed = receipt(
      await repository.closeDay({
        date: TUESDAY,
        expectedDayRevision: day.revision,
        dispositions: {
          [moved.value]: {
            kind: 'move-to-date',
            destinationDate: WEDNESDAY,
            durationMinutes: durationMinutes(30),
            dayPosition: dayPosition(0),
          },
        },
      }),
    );
    expect(closed.affectedDates).toEqual(expect.arrayContaining([TUESDAY, WEDNESDAY]));
    expect(closed.affectedWeeks).toEqual([MONDAY]);
  });

  it('names only the completed week, whose days are already frozen', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });
    for (const date of await database.getDaysByWeekStart(MONDAY)) {
      await database.putDay({
        ...date,
        status: 'closed',
        revision: revision(1),
        closureSnapshot: {
          score: {
            task: { completed: 0, applicable: 0, rate: 'unavailable' },
            habit: { completed: 0, applicable: 0, rate: 'unavailable' },
            value: 'unavailable',
            weightsApplied: { task: 0, habit: 0 },
          },
          plannedLoadMinutes: nonNegativeDurationMinutes(0),
        },
        closedAt: NOW,
      });
    }

    const completed = receipt(
      await repository.completeWeek({ weekStart: MONDAY, expectedWeekRevision: revision(0) }),
    );
    expect(completed).toMatchObject({ affectedDates: [], affectedWeeks: [MONDAY] });
  });
});
