import { describe, expect, it, vi } from 'vitest';

import { dayPosition, durationMinutes, entityId, revision } from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import {
  createHttpPlanningRepository,
  INSTANT_HEADER,
  LOCAL_DATE_HEADER,
  type FetchLike,
} from './http-planning-repository';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const NOW = instant('2026-08-11T08:00:00.000Z');
const OCCURRENCE_ID = entityId<'task-occurrence'>('00000000-0000-4000-8000-000000000001');

const CLOCK = createFixedClock({ instant: NOW, currentLocalDate: TUESDAY });

interface StubCall {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function sentBody(call: StubCall | undefined): unknown {
  const body = call?.init?.body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

function stubFetch(response: Partial<Response> & { readonly json?: () => Promise<unknown> }) {
  const calls: StubCall[] = [];
  const fetchStub: FetchLike = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: response.status === undefined || response.status < 400,
      status: 200,
      statusText: '',
      json: () => Promise.resolve({}),
      ...response,
    } as Response);
  };

  return { calls, fetchStub };
}

function createRepository(fetchStub: FetchLike, baseUrl?: string) {
  return createHttpPlanningRepository({
    clock: CLOCK,
    fetch: fetchStub,
    ...(baseUrl === undefined ? {} : { baseUrl }),
  });
}

describe('HttpPlanningRepository — the wire', () => {
  it('posts to the method route with both clock headers read at call time', async () => {
    const { calls, fetchStub } = stubFetch({
      json: () =>
        Promise.resolve({ ok: true, value: MONDAY, affectedDates: [], affectedWeeks: [] }),
    });

    await createRepository(fetchStub).ensureCalendarWeek({ date: TUESDAY });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('/api/planning/ensureCalendarWeek');
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      [LOCAL_DATE_HEADER]: TUESDAY,
      [INSTANT_HEADER]: NOW,
    });
    expect(sentBody(call)).toEqual({ date: TUESDAY });
  });

  it('reads the clock again on every call, so a rollover is not cached', async () => {
    let currentDate = TUESDAY;
    const movingClock = {
      now: () => NOW,
      currentLocalDate: () => currentDate,
    };
    const { calls, fetchStub } = stubFetch({
      json: () => Promise.resolve({ ok: true, value: undefined }),
    });
    const repository = createHttpPlanningRepository({ clock: movingClock, fetch: fetchStub });

    await repository.getBacklogView();
    currentDate = localDate('2026-08-12');
    await repository.getBacklogView();

    expect(calls[0]?.init?.headers).toMatchObject({ [LOCAL_DATE_HEADER]: TUESDAY });
    expect(calls[1]?.init?.headers).toMatchObject({ [LOCAL_DATE_HEADER]: '2026-08-12' });
  });

  it('honours an explicit base URL', async () => {
    const { calls, fetchStub } = stubFetch({
      json: () => Promise.resolve({ ok: true, value: { tasks: [] } }),
    });

    await createRepository(fetchStub, 'http://localhost:3000/api').getBacklogView();

    expect(calls[0]?.url).toBe('http://localhost:3000/api/planning/getBacklogView');
  });

  it.each([
    ['getWeekView', { dateOrWeekStart: MONDAY }],
    ['getDayView', { date: TUESDAY }],
    ['getBacklogView', {}],
    ['getTaskHistory', { occurrenceId: OCCURRENCE_ID }],
  ])('sends %s arguments as a named body field', async (method, expected) => {
    const { calls, fetchStub } = stubFetch({
      json: () => Promise.resolve({ ok: true, value: {} }),
    });
    const repository = createRepository(fetchStub);

    switch (method) {
      case 'getWeekView':
        await repository.getWeekView(MONDAY);
        break;
      case 'getDayView':
        await repository.getDayView(TUESDAY);
        break;
      case 'getBacklogView':
        await repository.getBacklogView();
        break;
      default:
        await repository.getTaskHistory(OCCURRENCE_ID);
    }

    expect(sentBody(calls[0])).toEqual(expected);
  });
});

describe('HttpPlanningRepository — envelopes and brands', () => {
  it('returns a success envelope unchanged, brands intact', async () => {
    const envelope = {
      ok: true,
      value: undefined,
      affectedDates: [TUESDAY],
      affectedWeeks: [MONDAY],
    };
    const { fetchStub } = stubFetch({ json: () => Promise.resolve(envelope) });

    const result = await createRepository(fetchStub).moveTaskToDate({
      occurrenceId: OCCURRENCE_ID,
      destinationDate: TUESDAY,
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
      expectedRevision: revision(0),
    });

    expect(result).toEqual(envelope);
    expect(result.ok && result.affectedDates[0]).toBe(TUESDAY);
  });

  it('returns a domain rejection unchanged rather than reinterpreting it', async () => {
    const envelope = {
      ok: false,
      error: { code: 'RevisionConflict', expectedRevision: 0, actualRevision: 1 },
    };
    const { fetchStub } = stubFetch({ json: () => Promise.resolve(envelope) });

    const result = await createRepository(fetchStub).addWeeklyGoal({
      weekStart: MONDAY,
      statement: 'Goal',
      expectedRevision: revision(0),
    });

    expect(result).toEqual(envelope);
  });

  it('preserves dates and instants as strings across the wire', async () => {
    const { fetchStub } = stubFetch({
      json: () =>
        Promise.resolve({
          ok: true,
          value: {
            week: {
              startDate: MONDAY,
              status: 'open',
              goals: [{ id: OCCURRENCE_ID, statement: 'G', createdAt: NOW, updatedAt: NOW }],
              revision: 0,
            },
          },
        }),
    });

    const result = await createRepository(fetchStub).getWeekView(MONDAY);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.week.startDate).toBe(MONDAY);
    expect(typeof result.value.week.goals[0]?.createdAt).toBe('string');
    expect(result.value.week.goals[0]?.createdAt).toBe(NOW);
  });
});

describe('HttpPlanningRepository — failures are reported honestly', () => {
  it('maps a network failure to ServerUnavailable', async () => {
    const fetchStub: FetchLike = vi.fn(() => Promise.reject(new Error('Failed to fetch')));

    const result = await createRepository(fetchStub).getDayView(TUESDAY);

    expect(result).toEqual({
      ok: false,
      error: { code: 'ServerUnavailable', message: 'Failed to fetch' },
    });
  });

  it('maps a 503 to ServerUnavailable rather than to a domain error', async () => {
    const { fetchStub } = stubFetch({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const result = await createRepository(fetchStub).getDayView(TUESDAY);

    expect(result).toMatchObject({ ok: false, error: { code: 'ServerUnavailable' } });
    if (result.ok) throw new Error('Expected a failure');
    expect(result.error.code).not.toBe('NotFound');
  });

  it.each([
    [400, 'Bad Request'],
    [404, 'Not Found'],
    [500, 'Internal Server Error'],
  ])('maps a %i to UnexpectedServerFailure', async (status, statusText) => {
    const { fetchStub } = stubFetch({ ok: false, status, statusText });

    const result = await createRepository(fetchStub).getBacklogView();

    expect(result).toMatchObject({ ok: false, error: { code: 'UnexpectedServerFailure' } });
  });

  it('maps an unreadable body to UnexpectedServerFailure', async () => {
    const { fetchStub } = stubFetch({
      json: () => Promise.reject(new Error('Unexpected end of JSON input')),
    });

    const result = await createRepository(fetchStub).getBacklogView();

    expect(result).toEqual({
      ok: false,
      error: { code: 'UnexpectedServerFailure', message: 'Unexpected end of JSON input' },
    });
  });

  it('never retries a failed call', async () => {
    const fetchStub: FetchLike = vi.fn(() => Promise.reject(new Error('offline')));

    await createRepository(fetchStub).getDayView(TUESDAY);

    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});

/*
 * 003 US1 (FR-004). The read paths above already prove the error mapping. What
 * this feature needs pinned separately is the *write* path: a command that did
 * not reach the database must never come back looking like saved work, and it
 * must never carry the affected-period lists that drive a refresh.
 */
describe('003 US1: a failed write is never reported as saved', () => {
  const failures: readonly [string, () => FetchLike][] = [
    ['an unreachable server', () => vi.fn(() => Promise.reject(new Error('Failed to fetch')))],
    ['a database that is down (503)', () => stubFetch({ ok: false, status: 503 }).fetchStub],
    ['an unexpected server fault (500)', () => stubFetch({ ok: false, status: 500 }).fetchStub],
  ];

  it.each(failures)('reports %s as a failure when closing a day', async (_name, makeFetch) => {
    const result = await createRepository(makeFetch()).closeDay({
      date: TUESDAY,
      expectedDayRevision: revision(3),
      dispositions: {},
    });

    expect(result.ok).toBe(false);
    // No value, and nothing that would make the client refresh as if it worked.
    expect(result).not.toHaveProperty('value');
    expect(result).not.toHaveProperty('affectedDates');
    expect(result).not.toHaveProperty('affectedWeeks');
  });

  it.each(failures)('reports %s as a failure when reopening a day', async (_name, makeFetch) => {
    const result = await createRepository(makeFetch()).reopenDay({
      date: TUESDAY,
      expectedDayRevision: revision(3),
    });

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('affectedDates');
  });

  it.each(failures)('reports %s as a failure when saving a note', async (_name, makeFetch) => {
    const result = await createRepository(makeFetch()).editTaskOccurrence({
      occurrenceId: OCCURRENCE_ID,
      notes: 'Work that must not be reported as saved',
      expectedRevision: revision(1),
    });

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('affectedDates');
  });

  it('surfaces a failure code the caller can act on, never a silent success', async () => {
    const fetchStub: FetchLike = vi.fn(() => Promise.reject(new Error('offline')));

    const result = await createRepository(fetchStub).saveDailyState({
      date: TUESDAY,
      energy: 4,
      expectedDayRevision: revision(2),
    });

    if (result.ok) throw new Error('Expected a failure');
    expect(['ServerUnavailable', 'UnexpectedServerFailure']).toContain(result.error.code);
    expect(result.error).toHaveProperty('message');
  });
});
