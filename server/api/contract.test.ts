import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  dayPosition,
  durationMinutes,
  nonNegativeDurationMinutes,
  revision,
} from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { createHttpPlanningRepository } from '@/entities/planning/api/http/http-planning-repository';
import type { PlanningRepository } from '@/entities/planning/model/planning-repository';

import { createApp } from '../app';
import { createPostgresPlanningRepository } from '../planning/postgres-planning-repository';
import {
  createRepositoryUnderTest,
  type RepositoryUnderTest,
} from '../planning/test-support/repository-harness';
import { PLANNING_METHOD_NAMES } from './routes';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const NOW = instant('2026-08-11T08:00:00.000Z');

const CLOCK = createFixedClock({ instant: NOW, currentLocalDate: TUESDAY });

/**
 * Drives the real `HttpPlanningRepository` against the real Fastify app and the
 * real database. Nothing between the two is stubbed, so a disagreement about a
 * method name, a body shape, a header, or an envelope shows up here rather than
 * in the browser.
 */
function injectingFetch(app: FastifyInstance) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
    const payload = typeof init?.body === 'string' ? init.body : '{}';
    const response = await app.inject({ method: 'POST', url, headers, payload });

    const status = response.statusCode;
    const body = response.body;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: '',
      json: () => Promise.resolve(JSON.parse(body) as unknown),
    } as Response;
  };
}

describe('transport contract: HttpPlanningRepository against the real server', () => {
  let app: FastifyInstance;
  let harness: RepositoryUnderTest;
  let repository: PlanningRepository;

  beforeEach(async () => {
    harness = await createRepositoryUnderTest({ clock: CLOCK });
    app = await createApp({
      db: harness.db,
      createRepository: (clock) => createPostgresPlanningRepository(harness.db, { clock }),
    });
    await app.ready();

    repository = createHttpPlanningRepository({ clock: CLOCK, fetch: injectingFetch(app) });
  });

  afterEach(async () => {
    await app.close();
  });

  it('implements every method the server routes, and routes every method it implements', () => {
    const clientMethods = Object.keys(repository).sort();
    expect(clientMethods).toEqual([...PLANNING_METHOD_NAMES].sort());
  });

  it('carries a full planning session end to end', async () => {
    const week = await repository.ensureCalendarWeek({ date: TUESDAY });
    expect(week).toMatchObject({ ok: true, value: MONDAY, affectedWeeks: [MONDAY] });

    const goal = await repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: '  Ship the migration  ',
      expectedRevision: revision(0),
    });
    expect(goal.ok).toBe(true);
    if (!goal.ok) throw new Error(goal.error.code);

    const task = await repository.createTask({
      title: 'Prepare notes',
      notes: 'Keep spacing',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    });
    expect(task.ok).toBe(true);
    if (!task.ok) throw new Error(task.error.code);

    const completed = await repository.setTaskCompletion({
      occurrenceId: task.value,
      date: TUESDAY,
      completed: true,
      expectedRevision: revision(0),
    });
    expect(completed).toMatchObject({ ok: true, affectedDates: [TUESDAY] });

    const day = await repository.getDayView(TUESDAY);
    expect(day).toMatchObject({
      ok: true,
      value: {
        day: { date: TUESDAY, status: 'open' },
        plannedLoadMinutes: 30,
        score: { task: { completed: 1, applicable: 1, rate: 1 } },
      },
    });

    const weekView = await repository.getWeekView(TUESDAY);
    expect(weekView.ok).toBe(true);
    if (!weekView.ok) throw new Error(weekView.error.code);
    // Trimming happened on the server; the client sent the raw statement.
    expect(weekView.value.week.goals.map((entry) => entry.statement)).toEqual([
      'Ship the migration',
    ]);
    expect(weekView.value.week.goals[0]?.createdAt).toBe(NOW);
  });

  it('round-trips the undefined/null distinction through the real boundary', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });
    const task = await repository.createTask({
      title: 'Timed',
      placement: { kind: 'day', date: TUESDAY },
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
      startTime: '09:00',
      endTime: '10:00',
    });
    if (!task.ok) throw new Error(task.error.code);

    const renamed = await repository.editTaskOccurrence({
      occurrenceId: task.value,
      title: 'Renamed',
      expectedRevision: revision(0),
    });
    expect(renamed.ok).toBe(true);

    const afterRename = await repository.getTaskHistory(task.value);
    if (!afterRename.ok) throw new Error(afterRename.error.code);
    expect(afterRename.value.occurrence.startTime).toBe('09:00');
    expect(afterRename.value.occurrence.endTime).toBe('10:00');

    const cleared = await repository.editTaskOccurrence({
      occurrenceId: task.value,
      startTime: null,
      endTime: null,
      expectedRevision: revision(1),
    });
    expect(cleared.ok).toBe(true);

    const afterClear = await repository.getTaskHistory(task.value);
    if (!afterClear.ok) throw new Error(afterClear.error.code);
    expect(Object.hasOwn(afterClear.value.occurrence, 'startTime')).toBe(false);
    expect(Object.hasOwn(afterClear.value.occurrence, 'endTime')).toBe(false);
  });

  it('carries recurrence, habits, closure, and weekly review across the boundary', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });

    const series = await repository.createTaskSeries({
      template: { title: 'Focus block', plannedDurationMinutes: durationMinutes(25) },
      recurrenceRule: { startDate: TUESDAY, weekdays: [2] },
    });
    if (!series.ok) throw new Error(series.error.code);

    const habit = await repository.createHabitDefinition({
      title: 'Stretch',
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2] },
    });
    if (!habit.ok) throw new Error(habit.error.code);

    const prepared = await repository.prepareOpenPeriod({ kind: 'week', weekStart: MONDAY });
    expect(prepared).toMatchObject({ ok: true, affectedWeeks: [MONDAY] });

    const [habitOccurrence] = await harness.database.getHabitOccurrencesByDate(TUESDAY);
    if (habitOccurrence === undefined) throw new Error('missing habit occurrence');
    const tuesday = await harness.database.getDay(TUESDAY);
    if (tuesday === undefined) throw new Error('missing day');

    const recorded = await repository.recordHabitOutcome({
      occurrenceId: habitOccurrence.id,
      outcome: 'completed',
      expectedRevision: tuesday.revision,
    });
    expect(recorded).toMatchObject({ ok: true, affectedDates: [TUESDAY] });

    const generated = (await harness.database.getAllTaskOccurrences()).find(
      (occurrence) => occurrence.seriesId === series.value,
    );
    if (generated === undefined) throw new Error('missing generated occurrence');

    const source = await harness.database.getDay(TUESDAY);
    if (source === undefined) throw new Error('missing source day');
    const closed = await repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: source.revision,
      dispositions: {
        [generated.id]: {
          kind: 'move-to-date',
          destinationDate: WEDNESDAY,
          durationMinutes: durationMinutes(25),
          dayPosition: dayPosition(0),
        },
      },
    });
    expect(closed).toMatchObject({
      ok: true,
      value: { score: { habit: { completed: 1, applicable: 1, rate: 1 } } },
    });

    const history = await repository.getHistoryView({ mode: 'day', anchorDate: TUESDAY });
    expect(history).toMatchObject({
      ok: true,
      value: { mode: 'day', facts: { day: { status: 'closed' } } },
    });

    const stopped = await repository.stopTaskSeries({
      seriesId: series.value,
      expectedRevision: revision(0),
    });
    expect(stopped).toMatchObject({ ok: true });
  });

  it('carries a completed week and its frozen progress across the boundary', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });
    for (const day of await harness.database.getDaysByWeekStart(MONDAY)) {
      await harness.database.putDay({
        ...day,
        status: 'closed',
        revision: revision(1),
        closureSnapshot: {
          score: {
            task: { completed: 1, applicable: 2, rate: 0.5 },
            habit: { completed: 0, applicable: 0, rate: 'unavailable' },
            value: 50,
            weightsApplied: { task: 100, habit: 0 },
          },
          plannedLoadMinutes: nonNegativeDurationMinutes(30),
        },
        closedAt: NOW,
      });
    }

    const completed = await repository.completeWeek({
      weekStart: MONDAY,
      reflection: 'Keep the morning block.',
      expectedWeekRevision: revision(0),
    });

    expect(completed).toMatchObject({
      ok: true,
      value: { progress: { task: { completed: 7, applicable: 14, rate: 0.5 } } },
      affectedWeeks: [MONDAY],
    });

    const view = await repository.getWeekView(MONDAY);
    expect(view).toMatchObject({
      ok: true,
      value: {
        week: { status: 'completed', reflection: 'Keep the morning block.' },
        progress: { value: 50 },
      },
    });
  });

  it('reports a domain rejection identically on both sides', async () => {
    await repository.ensureCalendarWeek({ date: TUESDAY });
    await repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Goal',
      expectedRevision: revision(0),
    });

    const conflict = await repository.addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Stale',
      expectedRevision: revision(0),
    });

    expect(conflict).toEqual({
      ok: false,
      error: { code: 'RevisionConflict', expectedRevision: 0, actualRevision: 1 },
    });
  });

  it('reports a validation failure as a value, not as a transport error', async () => {
    const result = await repository.createTask({
      title: '   ',
      placement: { kind: 'backlog' },
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
  });
});
