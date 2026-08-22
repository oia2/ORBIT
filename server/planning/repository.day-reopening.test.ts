import { beforeEach, describe, expect, it } from 'vitest';

import { dayPosition, durationMinutes, revision } from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import {
  createRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const NOW = instant('2026-08-12T09:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 900;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

/*
 * 003 US3 (FR-009 to FR-015). Reopening touches the day, its occurrences, their
 * memberships, and the audit trail, so like closure it is the case that decides
 * whether atomicity actually holds.
 */
describe('PostgreSQL planning repository — 003 US3 day reopening', () => {
  let repository: RepositoryUnderTest['repository'];
  let database: RepositoryUnderTest['database'];

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      // Current date is Wednesday, so Tuesday is a past day that can be closed.
      clock: createFixedClock({ instant: NOW, currentLocalDate: WEDNESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    database = harness.database;
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

  async function complete(occurrenceId: Awaited<ReturnType<typeof addTask>>) {
    const done = await repository.setTaskCompletion({
      occurrenceId,
      date: TUESDAY,
      completed: true,
      expectedRevision: revision(0),
    });
    if (!done.ok) throw new Error(done.error.code);
  }

  async function dayRevision(date = TUESDAY) {
    const view = await repository.getDayView(date);
    if (!view.ok) throw new Error(view.error.code);
    return view.value.day.revision;
  }

  it('reopens a closed day and makes its live result equal the discarded snapshot', async () => {
    const done = await addTask('Done', 0);
    const kept = await addTask('Kept', 1);
    await complete(done);

    const closed = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
      dispositions: { [kept]: { kind: 'keep-unfinished' } },
    });
    if (!closed.ok) throw new Error(closed.error.code);
    const frozen = closed.value.score;

    const reopened = await repository.reopenDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
    });
    expect(reopened.ok).toBe(true);

    const after = await repository.getDayView(TUESDAY);
    if (!after.ok) throw new Error(after.error.code);

    expect(after.value.day.status).toBe('open');
    expect(after.value.day).not.toHaveProperty('closureSnapshot');
    // FR-010: the live result equals the snapshot that was just discarded.
    expect(after.value.score).toEqual(frozen);
  });

  it('returns kept and completed tasks to the day so they can be corrected (FR-013)', async () => {
    const done = await addTask('Done', 0);
    const kept = await addTask('Kept', 1);
    await complete(done);

    await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
      dispositions: { [kept]: { kind: 'keep-unfinished' } },
    });
    await repository.reopenDay({ date: TUESDAY, expectedDayRevision: await dayRevision() });

    const view = await repository.getDayView(TUESDAY);
    if (!view.ok) throw new Error(view.error.code);

    expect(view.value.tasks).toHaveLength(2);
    for (const { occurrence } of view.value.tasks) {
      expect(occurrence.state).toBe('active');
      expect(occurrence.placement).toEqual({ kind: 'day', date: TUESDAY });
    }
    expect(view.value.unfinishedTaskIds).toEqual([kept]);

    // The correction the whole story exists for: mark the kept task done and
    // close again.
    const keptTask = view.value.tasks.find((task) => task.occurrence.id === kept);
    if (keptTask === undefined) throw new Error('kept task missing after reopening');
    const corrected = await repository.setTaskCompletion({
      occurrenceId: kept,
      date: TUESDAY,
      completed: true,
      expectedRevision: keptTask.occurrence.revision,
    });
    expect(corrected.ok).toBe(true);

    const reclosed = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
      dispositions: {},
    });
    if (!reclosed.ok) throw new Error(reclosed.error.code);
    expect(reclosed.value.score.task).toEqual({ completed: 2, applicable: 2, rate: 1 });
  });

  it('leaves a task moved at closure on its destination day (D1, FR-012, FR-015)', async () => {
    const moved = await addTask('Moved', 0);
    const beforeDestination = await repository.getDayView(WEDNESDAY);
    if (!beforeDestination.ok) throw new Error(beforeDestination.error.code);

    await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
      dispositions: {
        [moved]: {
          kind: 'move-to-date',
          destinationDate: WEDNESDAY,
          durationMinutes: durationMinutes(30),
          dayPosition: dayPosition(0),
        },
      },
    });

    const destinationAfterClosure = await repository.getDayView(WEDNESDAY);
    if (!destinationAfterClosure.ok) throw new Error(destinationAfterClosure.error.code);
    expect(destinationAfterClosure.value.tasks).toHaveLength(1);

    const receipt = await repository.reopenDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
    });
    if (!receipt.ok) throw new Error(receipt.error.code);

    // FR-015: no other day is reported as affected, or written.
    expect(receipt.affectedDates).toEqual([TUESDAY]);

    const destinationAfterReopening = await repository.getDayView(WEDNESDAY);
    if (!destinationAfterReopening.ok) throw new Error(destinationAfterReopening.error.code);
    expect(destinationAfterReopening.value.tasks).toHaveLength(1);
    expect(destinationAfterReopening.value.day.revision).toBe(
      destinationAfterClosure.value.day.revision,
    );

    // The reopened day keeps the moved membership in its own counts (D3).
    const source = await repository.getDayView(TUESDAY);
    if (!source.ok) throw new Error(source.error.code);
    expect(source.value.score.task).toEqual({ completed: 0, applicable: 1, rate: 0 });
  });

  it('shows the reopened day as open, with a live result, on every surface (FR-010)', async () => {
    const done = await addTask('Done', 0);
    const kept = await addTask('Kept', 1);
    await complete(done);

    await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
      dispositions: { [kept]: { kind: 'keep-unfinished' } },
    });
    await repository.reopenDay({ date: TUESDAY, expectedDayRevision: await dayRevision() });

    const day = await repository.getDayView(TUESDAY);
    const week = await repository.getWeekView(TUESDAY);
    const history = await repository.getHistoryView({ mode: 'day', anchorDate: TUESDAY });
    if (!day.ok || !week.ok || !history.ok) throw new Error('projection failed');
    if (history.value.mode !== 'day') throw new Error('expected a day history view');

    const fromWeek = week.value.days.find((entry) => entry.date === TUESDAY);
    expect(day.value.day.status).toBe('open');
    expect(fromWeek?.status).toBe('open');
    expect(history.value.facts.day.status).toBe('open');

    // No surface keeps a stale closed result for it.
    expect(day.value.score).toEqual(fromWeek?.score);
    expect(day.value.score).toEqual(history.value.facts.score);
    expect(day.value.score.task).toEqual({ completed: 1, applicable: 2, rate: 0.5 });
  });

  it('records one closure-reopen audit event per restored task, in sequence (FR-011)', async () => {
    const done = await addTask('Done', 0);
    const kept = await addTask('Kept', 1);
    await complete(done);

    await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
      dispositions: { [kept]: { kind: 'keep-unfinished' } },
    });
    await repository.reopenDay({ date: TUESDAY, expectedDayRevision: await dayRevision() });

    const events = await database.getAllTaskEvents();
    const reopenEvents = events.filter((event) => event.type === 'closure-reopen');

    expect(reopenEvents).toHaveLength(2);
    expect(reopenEvents.map((event) => event.payload)).toEqual([
      { date: TUESDAY },
      { date: TUESDAY },
    ]);

    // The closure events are still there: the trail records both actions.
    expect(events.filter((event) => event.type === 'closure-keep')).toHaveLength(1);
    const sequences = reopenEvents.map((event) => event.sequence);
    expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
  });

  it('refuses a day whose week is completed, naming the week (FR-014)', async () => {
    // Completing a week needs all seven days closed, and a future day cannot be
    // closed — so this case runs from the following Monday.
    const nextMonday = localDate('2026-08-17');
    const later = await createRepositoryUnderTest({
      clock: createFixedClock({
        instant: instant('2026-08-17T09:00:00.000Z'),
        currentLocalDate: nextMonday,
      }),
      generateUuid: uuidGenerator(),
    });
    await later.repository.ensureCalendarWeek({ date: MONDAY });

    const created = await later.repository.createTask({
      title: 'Kept',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    });
    if (!created.ok) throw new Error(created.error.code);

    for (let offset = 0; offset < 7; offset += 1) {
      const date = localDate(`2026-08-${String(10 + offset).padStart(2, '0')}`);
      const view = await later.repository.getDayView(date);
      if (!view.ok) throw new Error(view.error.code);
      const dispositions = Object.fromEntries(
        view.value.unfinishedTaskIds.map((occurrenceId) => [
          occurrenceId,
          { kind: 'keep-unfinished' } as const,
        ]),
      );
      const closed = await later.repository.closeDay({
        date,
        expectedDayRevision: view.value.day.revision,
        dispositions,
      });
      if (!closed.ok) throw new Error(`${date}: ${closed.error.code}`);
    }

    const weekView = await later.repository.getWeekView(MONDAY);
    if (!weekView.ok) throw new Error(weekView.error.code);
    const completed = await later.repository.completeWeek({
      weekStart: MONDAY,
      expectedWeekRevision: weekView.value.week.revision,
    });
    if (!completed.ok) throw new Error(completed.error.code);

    const afterCompletion = await later.repository.getDayView(TUESDAY);
    if (!afterCompletion.ok) throw new Error(afterCompletion.error.code);

    const refused = await later.repository.reopenDay({
      date: TUESDAY,
      expectedDayRevision: afterCompletion.value.day.revision,
    });

    expect(refused).toMatchObject({
      ok: false,
      error: { code: 'PeriodImmutable', weekStart: MONDAY },
    });

    // Nothing moved: the day is still closed with its snapshot.
    const still = await later.repository.getDayView(TUESDAY);
    if (!still.ok) throw new Error(still.error.code);
    expect(still.value.day.status).toBe('closed');
  });

  it('refuses a day that is already open', async () => {
    const refused = await repository.reopenDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
    });

    expect(refused).toMatchObject({
      ok: false,
      error: { code: 'InvalidTransition', entity: 'Day', attemptedTransition: 'reopen' },
    });
  });

  it('refuses a stale revision without changing anything', async () => {
    const kept = await addTask('Kept', 0);
    await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: await dayRevision(),
      dispositions: { [kept]: { kind: 'keep-unfinished' } },
    });
    const current = await dayRevision();

    const refused = await repository.reopenDay({
      date: TUESDAY,
      expectedDayRevision: revision(0),
    });

    expect(refused).toMatchObject({ ok: false, error: { code: 'RevisionConflict' } });
    const after = await repository.getDayView(TUESDAY);
    if (!after.ok) throw new Error(after.error.code);
    expect(after.value.day.status).toBe('closed');
    expect(after.value.day.revision).toBe(current);
  });

  it('refuses a day that does not exist', async () => {
    const refused = await repository.reopenDay({
      date: localDate('2027-01-04'),
      expectedDayRevision: revision(0),
    });

    expect(refused).toMatchObject({ ok: false, error: { code: 'NotFound', entity: 'Day' } });
  });

  it('can be closed, reopened, and closed again repeatedly', async () => {
    const kept = await addTask('Kept', 0);

    for (let round = 0; round < 3; round += 1) {
      const closed = await repository.closeDay({
        date: TUESDAY,
        expectedDayRevision: await dayRevision(),
        dispositions: { [kept]: { kind: 'keep-unfinished' } },
      });
      if (!closed.ok) throw new Error(`round ${String(round)}: ${closed.error.code}`);
      expect(closed.value.score.task).toEqual({ completed: 0, applicable: 1, rate: 0 });

      const reopened = await repository.reopenDay({
        date: TUESDAY,
        expectedDayRevision: await dayRevision(),
      });
      expect(reopened.ok).toBe(true);
    }

    const view = await repository.getDayView(TUESDAY);
    if (!view.ok) throw new Error(view.error.code);
    expect(view.value.day.status).toBe('open');
    expect(view.value.tasks).toHaveLength(1);
  });
});
