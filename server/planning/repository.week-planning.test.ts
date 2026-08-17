import { beforeEach, describe, expect, it } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { dayPosition, durationMinutes, revision } from '@/shared/lib/ids';

import {
  createRepositoryUnderTest,
  reopenRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const SUNDAY = localDate('2026-08-16');
const NOW = instant('2026-08-11T08:00:00.000Z');

function uuidGenerator(): () => string {
  let next = 1;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

describe('PostgreSQL planning repository — US1', () => {
  let harness: RepositoryUnderTest;
  let repository: RepositoryUnderTest['repository'];
  let database: RepositoryUnderTest['database'];

  beforeEach(async () => {
    harness = await createRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    database = harness.database;
  });

  it('ensures one canonical Monday week with exactly seven owned days idempotently', async () => {
    const first = await repository.ensureCalendarWeek({ date: TUESDAY });
    const second = await repository.ensureCalendarWeek({ date: SUNDAY });

    expect(first).toMatchObject({ ok: true, value: MONDAY });
    expect(second).toMatchObject({ ok: true, value: MONDAY });
    expect(await database.countWeeks()).toBe(1);
    expect(await database.getDaysByWeekStart(MONDAY)).toHaveLength(7);
    expect((await database.getWeek(MONDAY))?.revision).toBe(revision(0));
  });

  it('persists canonical free-form goal CRUD and ordering with atomic revisions', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });

    const first = await repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: '  Draft   launch brief  ',
      expectedRevision: revision(0),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error.code);

    const whitespace = await repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: '  \t  ',
      expectedRevision: revision(1),
    });
    expect(whitespace).toMatchObject({
      ok: false,
      error: { code: 'ValidationFailure' },
    });

    const second = await repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Review evidence',
      expectedRevision: revision(1),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error(second.error.code);

    await expect(
      repository.editWeeklyGoal({
        weekStart: MONDAY,
        goalId: first.value,
        statement: '  Draft   final brief ',
        expectedRevision: revision(2),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repository.reorderWeeklyGoals({
        weekStart: MONDAY,
        orderedGoalIds: [second.value, first.value],
        expectedRevision: revision(3),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repository.deleteWeeklyGoal({
        weekStart: MONDAY,
        goalId: second.value,
        expectedRevision: revision(4),
      }),
    ).resolves.toMatchObject({ ok: true });

    const week = await database.getWeek(MONDAY);
    expect(week).toMatchObject({ revision: revision(5), status: 'open' });
    expect(week?.goals.map((goal) => goal.statement)).toEqual(['Draft   final brief']);
    expect(week?.goals[0]).toMatchObject({ createdAt: NOW, updatedAt: NOW });
    expect(week).not.toHaveProperty('measurability');
    expect(week).not.toHaveProperty('progress');
  });

  it('creates dated and backlog tasks, orders facts, appends audit events, and reloads', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });

    const firstDated = await repository.createTask({
      title: '  Prepare notes  ',
      notes: 'Keep   spacing',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    });
    const secondDated = await repository.createTask({
      title: 'Call partner',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(45),
      dayPosition: dayPosition(1),
    });
    const firstBacklog = await repository.createTask({
      title: 'Unscheduled idea',
      placement: { kind: 'backlog' },
    });
    const secondBacklog = await repository.createTask({
      title: 'Later idea',
      placement: { kind: 'backlog' },
      durationMinutes: durationMinutes(15),
    });

    for (const result of [firstDated, secondDated, firstBacklog, secondBacklog]) {
      expect(result.ok).toBe(true);
    }
    if (!firstDated.ok || !secondDated.ok || !firstBacklog.ok || !secondBacklog.ok) {
      throw new Error('task setup failed');
    }

    await expect(
      repository.editTaskOccurrence({
        occurrenceId: firstDated.value,
        title: 'Prepare final notes',
        durationMinutes: durationMinutes(35),
        expectedRevision: revision(0),
      }),
    ).resolves.toMatchObject({ ok: true });

    const dayAfterEdit = await repository.getDayView(TUESDAY);
    expect(dayAfterEdit.ok).toBe(true);
    if (!dayAfterEdit.ok) throw new Error(dayAfterEdit.error.code);
    await expect(
      repository.reorderDatedTasks({
        date: TUESDAY,
        orderedOccurrenceIds: [secondDated.value, firstDated.value],
        expectedDayRevision: dayAfterEdit.value.day.revision,
      }),
    ).resolves.toMatchObject({ ok: true });

    const day = await repository.getDayView(TUESDAY);
    expect(day.ok).toBe(true);
    if (!day.ok) throw new Error(day.error.code);
    expect(day.value.tasks.map(({ occurrence }) => occurrence.id)).toEqual([
      secondDated.value,
      firstDated.value,
    ]);
    expect(day.value.plannedLoadMinutes).toBe(80);
    expect(day.value.tasks[1]?.occurrence).toMatchObject({
      title: 'Prepare final notes',
      notes: 'Keep   spacing',
      revision: revision(2),
    });
    expect(day.value.tasks.every(({ membership }) => membership.date === TUESDAY)).toBe(true);

    const backlog = await repository.getBacklogView();
    expect(backlog.ok).toBe(true);
    if (!backlog.ok) throw new Error(backlog.error.code);
    expect(backlog.value.tasks.map((task) => task.id)).toEqual([
      firstBacklog.value,
      secondBacklog.value,
    ]);
    expect(await database.countPlanEntries()).toBe(2);

    const history = await repository.getTaskHistory(firstDated.value);
    expect(history.ok).toBe(true);
    if (!history.ok) throw new Error(history.error.code);
    expect(history.value.events.map((event) => event.type)).toEqual(['create', 'edit']);
    expect(history.value.events[0]?.sequence).toBeLessThan(history.value.events[1]?.sequence ?? 0);

    const week = await repository.getWeekView(TUESDAY);
    expect(week.ok).toBe(true);
    if (!week.ok) throw new Error(week.error.code);
    expect(week.value.days.find((summary) => summary.date === TUESDAY)?.plannedLoadMinutes).toBe(
      80,
    );

    harness = await reopenRepositoryUnderTest({
      clock: createFixedClock({ instant: NOW, currentLocalDate: TUESDAY }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    const reloaded = await repository.getDayView(TUESDAY);
    expect(reloaded.ok && reloaded.value.plannedLoadMinutes).toBe(80);
  });

  it('rejects non-positive dated duration without partial writes', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });
    const before = await database.countTaskOccurrences();

    const result = await repository.createTask({
      title: 'Invalid duration',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: 0 as never,
      dayPosition: dayPosition(0),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    expect(await database.countTaskOccurrences()).toBe(before);
    expect(await database.countTaskEvents()).toBe(0);
  });
});
