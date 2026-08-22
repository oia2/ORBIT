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
const THURSDAY = localDate('2026-08-13');
const NOW = instant('2026-08-11T08:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 100;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

describe('PostgreSQL planning repository — US2', () => {
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
    const tuesday = await database.getDay(TUESDAY);
    if (tuesday === undefined) throw new Error('missing Tuesday');
    await database.putDay({
      ...tuesday,
      status: 'closed',
      closedAt: NOW,
      closureSnapshot: {
        score: {
          task: { completed: 0, applicable: 1, rate: 0 },
          habit: { completed: 0, applicable: 0, rate: 'unavailable' },
          value: 0,
        },
        plannedLoadMinutes: nonNegativeDurationMinutes(30),
      },
    });
    const entries = await database.getPlanEntriesByOccurrence(occurrenceId);
    const tuesdayEntry = entries.find((entry) => entry.date === TUESDAY);
    if (tuesdayEntry === undefined) throw new Error('missing Tuesday membership');
    await database.putPlanEntry({
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

/*
 * 003 US5 (FR-024). The note already travelled end to end through the domain
 * and the database before 003; what did not exist was a way to remove one.
 */
describe('PostgreSQL planning repository — 003 US5 task notes', () => {
  let repository: RepositoryUnderTest['repository'];

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    await repository.ensureCalendarWeek({ date: MONDAY });
  });

  async function taskWithNote(notes?: string) {
    const created = await repository.createTask({
      title: 'Task',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
      ...(notes === undefined ? {} : { notes }),
    });
    if (!created.ok) throw new Error(created.error.code);
    return created.value;
  }

  async function readNote(occurrenceId: string) {
    const view = await repository.getDayView(TUESDAY);
    if (!view.ok) throw new Error(view.error.code);
    const found = view.value.tasks.find((task) => task.occurrence.id === occurrenceId);
    if (found === undefined) throw new Error(`Task ${occurrenceId} is not on ${TUESDAY}`);
    return { notes: found.occurrence.notes, revision: found.occurrence.revision };
  }

  it('writes, replaces, and clears a note', async () => {
    const occurrenceId = await taskWithNote();
    expect((await readNote(occurrenceId)).notes).toBeUndefined();

    const written = await repository.editTaskOccurrence({
      occurrenceId,
      notes: 'Ask about the invoice',
      expectedRevision: (await readNote(occurrenceId)).revision,
    });
    expect(written.ok).toBe(true);
    expect((await readNote(occurrenceId)).notes).toBe('Ask about the invoice');

    const replaced = await repository.editTaskOccurrence({
      occurrenceId,
      notes: 'Rewritten',
      expectedRevision: (await readNote(occurrenceId)).revision,
    });
    expect(replaced.ok).toBe(true);
    expect((await readNote(occurrenceId)).notes).toBe('Rewritten');

    // This is the case that was impossible before 003.
    const cleared = await repository.editTaskOccurrence({
      occurrenceId,
      notes: null,
      expectedRevision: (await readNote(occurrenceId)).revision,
    });
    expect(cleared.ok).toBe(true);
    expect((await readNote(occurrenceId)).notes).toBeUndefined();
  });

  it('leaves the note alone when the field is omitted', async () => {
    const occurrenceId = await taskWithNote('Keep me');

    const edited = await repository.editTaskOccurrence({
      occurrenceId,
      title: 'Renamed',
      expectedRevision: (await readNote(occurrenceId)).revision,
    });
    expect(edited.ok).toBe(true);
    expect((await readNote(occurrenceId)).notes).toBe('Keep me');
  });

  it('treats a whitespace-only note as cleared', async () => {
    const occurrenceId = await taskWithNote('Something');

    await repository.editTaskOccurrence({
      occurrenceId,
      notes: '   ',
      expectedRevision: (await readNote(occurrenceId)).revision,
    });

    expect((await readNote(occurrenceId)).notes).toBeUndefined();
  });

  it('keeps a note through day closure so History still shows it', async () => {
    const occurrenceId = await taskWithNote('Survives closure');
    const view = await repository.getDayView(TUESDAY);
    if (!view.ok) throw new Error(view.error.code);

    const closed = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: view.value.day.revision,
      dispositions: { [occurrenceId]: { kind: 'keep-unfinished' } },
    });
    expect(closed.ok).toBe(true);

    const history = await repository.getHistoryView({ mode: 'day', anchorDate: TUESDAY });
    if (!history.ok) throw new Error(history.error.code);
    if (history.value.mode !== 'day') throw new Error('expected a day history view');

    expect(history.value.facts.tasks[0]?.occurrence.notes).toBe('Survives closure');
  });
});
