import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { createApp } from '../app';
import { createPostgresPlanningRepository } from '../planning/postgres-planning-repository';
import { createRepositoryUnderTest } from '../planning/test-support/repository-harness';
import { INSTANT_HEADER, LOCAL_DATE_HEADER } from './request-clock';
import { PLANNING_METHOD_NAMES } from './routes';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const NOW = instant('2026-08-11T08:00:00.000Z');

const CLOCK_HEADERS = {
  [LOCAL_DATE_HEADER]: TUESDAY,
  [INSTANT_HEADER]: NOW,
};

describe('planning routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      clock: { now: () => NOW, currentLocalDate: () => TUESDAY },
    });

    app = await createApp({
      db: harness.db,
      // The repository is built per request from the caller's clock, exactly as
      // it is in production; nothing here holds a clock of its own.
      createRepository: (clock) => createPostgresPlanningRepository(harness.db, { clock }),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  function post(method: string, body: unknown, headers: Record<string, string> = CLOCK_HEADERS) {
    return app.inject({
      method: 'POST',
      url: `/api/planning/${method}`,
      headers: { 'content-type': 'application/json', ...headers },
      payload: JSON.stringify(body),
    });
  }

  it('exposes exactly the 32 PlanningRepository methods', () => {
    expect(PLANNING_METHOD_NAMES).toHaveLength(32);
  });

  it('routes every method name to a handler that answers with an envelope', async () => {
    for (const method of PLANNING_METHOD_NAMES) {
      // Deliberately empty bodies: what matters here is that each name routes
      // and answers with the result envelope, not that the input is valid.
      const response = await post(method, {});

      expect(response.statusCode).toBe(200);
      const envelope = response.json<{ readonly ok: boolean }>();
      expect(typeof envelope.ok).toBe('boolean');
    }
  });

  it('carries a successful command through with its affected periods', async () => {
    const response = await post('ensureCalendarWeek', { date: TUESDAY });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      value: MONDAY,
      affectedWeeks: [MONDAY],
    });
  });

  it('answers a domain rejection with 200 and the failure envelope', async () => {
    await post('ensureCalendarWeek', { date: TUESDAY });
    await post('addWeeklyGoal', { weekStart: MONDAY, statement: 'Goal', expectedRevision: 0 });

    const conflict = await post('addWeeklyGoal', {
      weekStart: MONDAY,
      statement: 'Stale',
      expectedRevision: 0,
    });

    expect(conflict.statusCode).toBe(200);
    expect(conflict.json()).toEqual({
      ok: false,
      error: { code: 'RevisionConflict', expectedRevision: 0, actualRevision: 1 },
    });
  });

  it('answers an invalid field with 200 and ValidationFailure, not a transport error', async () => {
    const response = await post('moveTaskToDate', {
      occurrenceId: 'not-a-uuid',
      destinationDate: TUESDAY,
      durationMinutes: 30,
      dayPosition: 0,
      expectedRevision: 0,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: false,
      error: { code: 'ValidationFailure', issues: [{ field: 'occurrenceId' }] },
    });
  });

  it('answers an unknown method with 404', async () => {
    const response = await post('deleteEverything', {});

    expect(response.statusCode).toBe(404);
    expect(response.json<{ readonly error: string }>().error).toContain('deleteEverything');
  });

  it('answers malformed JSON with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/planning/getDayView',
      headers: { 'content-type': 'application/json', ...CLOCK_HEADERS },
      payload: '{ this is not json',
    });

    expect(response.statusCode).toBe(400);
  });

  it.each([
    ['both clock headers missing', {}],
    ['the local date missing', { [INSTANT_HEADER]: NOW }],
    ['the instant missing', { [LOCAL_DATE_HEADER]: TUESDAY }],
    ['a malformed local date', { ...CLOCK_HEADERS, [LOCAL_DATE_HEADER]: '11-08-2026' }],
    ['a malformed instant', { ...CLOCK_HEADERS, [INSTANT_HEADER]: '2026-08-11T08:00:00Z' }],
  ])('answers %s with 400 rather than falling back to server time', async (_label, headers) => {
    const response = await post('getDayView', { date: TUESDAY }, headers);

    expect(response.statusCode).toBe(400);
    expect(response.json<{ readonly error: string }>().error).toMatch(/X-Orbit-/);
  });

  it('derives every recorded instant from the supplied header', async () => {
    const other = instant('2026-08-11T19:30:45.123Z');
    await post('ensureCalendarWeek', { date: TUESDAY });

    const added = await post(
      'addWeeklyGoal',
      { weekStart: MONDAY, statement: 'Timed goal', expectedRevision: 0 },
      { ...CLOCK_HEADERS, [INSTANT_HEADER]: other },
    );
    expect(added.json()).toMatchObject({ ok: true });

    const week = await post('getWeekView', { dateOrWeekStart: MONDAY });
    expect(week.json()).toMatchObject({
      ok: true,
      value: { week: { goals: [{ createdAt: other, updatedAt: other }] } },
    });
  });

  it('omits absent optional fields from the response rather than sending null', async () => {
    await post('ensureCalendarWeek', { date: TUESDAY });
    await post('createTask', { title: 'Minimal', placement: { kind: 'backlog' } });

    const backlog = await post('getBacklogView', {});
    const body = backlog.json<{
      readonly value: { readonly tasks: readonly Record<string, unknown>[] };
    }>();
    const [task] = body.value.tasks;

    expect(task).toBeDefined();
    for (const field of ['notes', 'startTime', 'endTime', 'plannedDurationMinutes', 'seriesId']) {
      expect(Object.hasOwn(task ?? {}, field)).toBe(false);
    }
  });
});

describe('health route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const harness = await createRepositoryUnderTest({
      clock: { now: () => NOW, currentLocalDate: () => TUESDAY },
    });
    app = await createApp({
      db: harness.db,
      createRepository: (clock) => createPostgresPlanningRepository(harness.db, { clock }),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports ok while the database is reachable, and needs no clock header', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
