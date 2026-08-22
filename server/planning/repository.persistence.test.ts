import { beforeEach, describe, expect, it } from 'vitest';

import { dayPosition, durationMinutes, revision } from '@/shared/lib/ids';
import { createFixedClock, instant, type ApplicationClock } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { runMigrations } from '../db/migrations/index';
import {
  createRepositoryUnderTest,
  reopenRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const TUESDAY_NOW = instant('2026-08-11T15:00:00.000Z');
const WEDNESDAY_NOW = instant('2026-08-12T09:00:00.000Z');

function uuidGenerator(start: number): () => string {
  let next = start;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

function clockOn(date: typeof TUESDAY, now: typeof TUESDAY_NOW): ApplicationClock {
  return createFixedClock({ instant: now, currentLocalDate: date });
}

/*
 * 003 US1 (FR-001 to FR-005).
 *
 * Phase 0 established that nothing has been lost since the store was created:
 * the owner's database volume dates from the 002 cutover and every record since
 * is continuous (research.md Finding A1). So this suite exists to turn that
 * from an observation into a checked invariant — the guarantee has to survive a
 * reconnect, a date rollover, and a migration run, and it has to hold for the
 * records materialization is otherwise allowed to remove.
 */
describe('PostgreSQL planning repository — 003 US1 persistence guarantees', () => {
  let harness: RepositoryUnderTest;

  beforeEach(async () => {
    harness = await createRepositoryUnderTest({
      clock: clockOn(TUESDAY, TUESDAY_NOW),
      generateUuid: uuidGenerator(1000),
    });
    await harness.repository.ensureCalendarWeek({ date: MONDAY });
  });

  async function recordAFullDay() {
    const { repository } = harness;

    const goal = await repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Ship the refinements',
      expectedRevision: revision(0),
    });
    if (!goal.ok) throw new Error(goal.error.code);

    const habit = await repository.createHabitDefinition({
      title: 'Daily walk',
      durationMinutes: durationMinutes(20),
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2, 3, 4, 5, 6, 7] },
    });
    if (!habit.ok) throw new Error(habit.error.code);

    const done = await repository.createTask({
      title: 'Completed task',
      notes: 'A note that must survive',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    });
    const open = await repository.createTask({
      title: 'Open task',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(45),
      dayPosition: dayPosition(1),
    });
    if (!done.ok || !open.ok) throw new Error('task creation failed');

    const beforeCompletion = await repository.getDayView(TUESDAY);
    if (!beforeCompletion.ok) throw new Error(beforeCompletion.error.code);
    const doneTask = beforeCompletion.value.tasks.find((task) => task.occurrence.id === done.value);
    if (doneTask === undefined) throw new Error('created task is not on the day');
    const completed = await repository.setTaskCompletion({
      occurrenceId: done.value,
      date: TUESDAY,
      completed: true,
      expectedRevision: doneTask.occurrence.revision,
    });
    if (!completed.ok) throw new Error(completed.error.code);

    await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    const day = await repository.getDayView(TUESDAY);
    if (!day.ok) throw new Error(day.error.code);
    const state = await repository.saveDailyState({
      date: TUESDAY,
      energy: 4,
      mood: 3,
      sleepDurationMinutes: 450 as never,
      expectedDayRevision: day.value.day.revision,
    });
    if (!state.ok) throw new Error(state.error.code);

    for (const occurrence of day.value.habits) {
      // Each mark bumps the owning day, so the guard has to be re-read.
      const current = await repository.getDayView(TUESDAY);
      if (!current.ok) throw new Error(current.error.code);
      const marked = await repository.recordHabitOutcome({
        occurrenceId: occurrence.id,
        outcome: 'completed',
        expectedRevision: current.value.day.revision,
      });
      if (!marked.ok) throw new Error(marked.error.code);
    }

    return { habitDefinitionId: habit.value, openTaskId: open.value };
  }

  it('keeps every record byte-identical across a reconnect (FR-001)', async () => {
    await recordAFullDay();
    const before = await harness.database.snapshotAllStores();

    // The "close and reopen" step: a new repository against the same database,
    // which is what a server restart amounts to.
    const reopened = await reopenRepositoryUnderTest({
      clock: clockOn(TUESDAY, TUESDAY_NOW),
      generateUuid: uuidGenerator(2000),
    });
    const after = await reopened.database.snapshotAllStores();

    expect(after).toEqual(before);
  });

  it('keeps every record intact across the local date boundary (FR-001)', async () => {
    await recordAFullDay();
    const before = await harness.database.snapshotAllStores();

    // Wednesday now. The habit boundary catch-up runs on the way through, which
    // is exactly the moment the owner described as losing state.
    const tomorrow = await reopenRepositoryUnderTest({
      clock: clockOn(WEDNESDAY, WEDNESDAY_NOW),
      generateUuid: uuidGenerator(3000),
    });
    await tomorrow.repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });

    const after = await tomorrow.database.snapshotAllStores();

    expect(after.weeks).toEqual(before.weeks);
    expect(after.taskOccurrences).toEqual(before.taskOccurrences);
    expect(after.taskPlanEntries).toEqual(before.taskPlanEntries);
    expect(after.habitDefinitions).toEqual(before.habitDefinitions);
    // Yesterday's records are all still there, and none was rewritten.
    expect(after.taskEvents).toEqual(before.taskEvents);

    const day = await tomorrow.repository.getDayView(TUESDAY);
    if (!day.ok) throw new Error(day.error.code);
    expect(day.value.day.state).toMatchObject({ energy: 4, mood: 3 });
    expect(day.value.tasks).toHaveLength(2);
    expect(day.value.tasks[0]?.occurrence.notes).toBe('A note that must survive');
    expect(day.value.score.task).toEqual({ completed: 1, applicable: 2, rate: 0.5 });
  });

  it('keeps every record intact when migrations run again (FR-002, FR-003)', async () => {
    await recordAFullDay();
    const before = await harness.database.snapshotAllStores();

    // A redeploy applies migrations at startup before serving a request.
    await runMigrations(harness.db);

    const after = await harness.database.snapshotAllStores();
    expect(after).toEqual(before);
  });

  it('never deletes a record the owner has touched when a period is prepared (FR-005)', async () => {
    const { habitDefinitionId, openTaskId } = await recordAFullDay();
    const before = await harness.database.snapshotAllStores();

    /*
     * Stopping a habit is the one path materialization is allowed to remove
     * occurrences through. It may only take untouched, still-pending future
     * ones — never a marked outcome, and never a past day.
     */
    const definition = await harness.database.getHabitDefinition(habitDefinitionId);
    if (definition === undefined) throw new Error('habit definition missing');
    const stopped = await harness.repository.stopHabitDefinition({
      definitionId: habitDefinitionId,
      expectedRevision: definition.revision,
    });
    if (!stopped.ok) throw new Error(stopped.error.code);

    await harness.repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    const after = await harness.database.snapshotAllStores();
    const beforeWeeks = before.weeks;
    if (beforeWeeks === undefined) throw new Error('weeks store missing from snapshot');

    // Everything the owner actually recorded is still there. The week's own
    // revision legitimately moves — stopping a habit bumps its aggregates — so
    // the assertion is about records surviving, not about revisions freezing.
    expect(after.taskOccurrences).toEqual(before.taskOccurrences);
    expect(after.taskPlanEntries).toEqual(before.taskPlanEntries);
    expect(after.taskEvents).toEqual(before.taskEvents);
    expect(after.weeks).toHaveLength(beforeWeeks.length);
    expect((after.weeks as readonly { goals: unknown }[])[0]?.goals).toEqual(
      (before.weeks as readonly { goals: unknown }[])[0]?.goals,
    );

    const marked = (before.habitOccurrences as readonly { outcome: string; id: string }[]).filter(
      (occurrence) => occurrence.outcome !== 'pending',
    );
    const survivingIds = new Set(
      (after.habitOccurrences as readonly { id: string }[]).map((occurrence) => occurrence.id),
    );
    for (const occurrence of marked) {
      expect(survivingIds.has(occurrence.id)).toBe(true);
    }

    const day = await harness.repository.getDayView(TUESDAY);
    if (!day.ok) throw new Error(day.error.code);
    expect(day.value.tasks.map(({ occurrence }) => occurrence.id)).toContain(openTaskId);
  });

  it('keeps a closed day frozen exactly as recorded across a reconnect (FR-003)', async () => {
    const { openTaskId } = await recordAFullDay();
    const day = await harness.repository.getDayView(TUESDAY);
    if (!day.ok) throw new Error(day.error.code);

    const closed = await harness.repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: day.value.day.revision,
      dispositions: { [openTaskId]: { kind: 'keep-unfinished' } },
    });
    if (!closed.ok) throw new Error(closed.error.code);

    const reopened = await reopenRepositoryUnderTest({
      clock: clockOn(WEDNESDAY, WEDNESDAY_NOW),
      generateUuid: uuidGenerator(4000),
    });
    const after = await reopened.repository.getDayView(TUESDAY);
    if (!after.ok) throw new Error(after.error.code);

    expect(after.value.day.status).toBe('closed');
    expect(after.value.score).toEqual(closed.value.score);
    expect(after.value.plannedLoadMinutes).toBe(closed.value.plannedLoadMinutes);
  });
});
