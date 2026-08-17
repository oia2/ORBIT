import { describe, expect, it } from 'vitest';

import { dayPosition, durationMinutes, revision } from '@/shared/lib/ids';
import { localDate } from '@/shared/lib/local-date/local-date';

import {
  parseCloseDay,
  parseCreateTask,
  parseCreateTaskSeries,
  parseEditTaskOccurrence,
  parseHistoryQuery,
  parseMoveTaskToDate,
  parseSaveDailyState,
  parseSetTaskCompletion,
  type ParseResult,
} from './parsers';

const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_OCCURRENCE_ID = '00000000-0000-4000-8000-000000000002';

function requireOk<T>(result: ParseResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

function requireIssues<T>(result: ParseResult<T>) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected a rejection');
  return result.issues;
}

describe('request parsers — branded values are never trusted', () => {
  it.each([
    [
      'a non-UUID occurrence id',
      { occurrenceId: 'not-a-uuid', expectedRevision: 0 },
      'occurrenceId',
    ],
    [
      'a malformed destination date',
      {
        occurrenceId: OCCURRENCE_ID,
        destinationDate: '2026-13-01',
        durationMinutes: 30,
        dayPosition: 0,
        expectedRevision: 0,
      },
      'destinationDate',
    ],
    [
      'a zero duration',
      {
        occurrenceId: OCCURRENCE_ID,
        destinationDate: WEDNESDAY,
        durationMinutes: 0,
        dayPosition: 0,
        expectedRevision: 0,
      },
      'durationMinutes',
    ],
    [
      'a fractional duration',
      {
        occurrenceId: OCCURRENCE_ID,
        destinationDate: WEDNESDAY,
        durationMinutes: 30.5,
        dayPosition: 0,
        expectedRevision: 0,
      },
      'durationMinutes',
    ],
    [
      'a negative day position',
      {
        occurrenceId: OCCURRENCE_ID,
        destinationDate: WEDNESDAY,
        durationMinutes: 30,
        dayPosition: -1,
        expectedRevision: 0,
      },
      'dayPosition',
    ],
    [
      'a negative revision',
      {
        occurrenceId: OCCURRENCE_ID,
        destinationDate: WEDNESDAY,
        durationMinutes: 30,
        dayPosition: 0,
        expectedRevision: -1,
      },
      'expectedRevision',
    ],
  ])('rejects %s', (_label, body, field) => {
    const issues = requireIssues(parseMoveTaskToDate(body));
    expect(issues.map((issue) => issue.field)).toContain(field);
  });

  it('accepts a well-formed move and returns branded values', () => {
    const value = requireOk(
      parseMoveTaskToDate({
        occurrenceId: OCCURRENCE_ID,
        destinationDate: WEDNESDAY,
        durationMinutes: 30,
        dayPosition: 2,
        expectedRevision: 4,
      }),
    );

    expect(value).toEqual({
      occurrenceId: OCCURRENCE_ID,
      destinationDate: WEDNESDAY,
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(2),
      expectedRevision: revision(4),
    });
  });

  it('rejects a body that is not a JSON object', () => {
    for (const body of [null, 'string', 42, [1, 2, 3]]) {
      const issues = requireIssues(parseCreateTask(body));
      expect(issues.map((issue) => issue.field)).toContain('body');
    }
  });
});

describe('request parsers — the undefined/null distinction survives the wire', () => {
  it('leaves a time unchanged when its key is absent', () => {
    const value = requireOk(
      parseEditTaskOccurrence({ occurrenceId: OCCURRENCE_ID, expectedRevision: 0 }),
    );

    expect(Object.hasOwn(value, 'startTime')).toBe(false);
    expect(Object.hasOwn(value, 'endTime')).toBe(false);
  });

  it('clears a time when its key is explicitly null', () => {
    const value = requireOk(
      parseEditTaskOccurrence({
        occurrenceId: OCCURRENCE_ID,
        startTime: null,
        endTime: null,
        expectedRevision: 0,
      }),
    );

    expect(value.startTime).toBeNull();
    expect(value.endTime).toBeNull();
  });

  it('sets a time when its key carries a value', () => {
    const value = requireOk(
      parseEditTaskOccurrence({
        occurrenceId: OCCURRENCE_ID,
        startTime: '09:00',
        expectedRevision: 0,
      }),
    );

    expect(value.startTime).toBe('09:00');
    expect(Object.hasOwn(value, 'endTime')).toBe(false);
  });

  it('omits absent optional fields rather than sending them as null', () => {
    const value = requireOk(parseCreateTask({ title: 'Task', placement: { kind: 'backlog' } }));

    expect(value).toEqual({ title: 'Task', placement: { kind: 'backlog' } });
    for (const field of ['notes', 'startTime', 'endTime', 'durationMinutes', 'dayPosition']) {
      expect(Object.hasOwn(value, field)).toBe(false);
    }
  });

  it('omits an absent daily-state signal instead of clearing it', () => {
    const value = requireOk(
      parseSaveDailyState({ date: TUESDAY, energy: 3, expectedDayRevision: 0 }),
    );

    expect(value).toEqual({ date: TUESDAY, energy: 3, expectedDayRevision: revision(0) });
    expect(Object.hasOwn(value, 'mood')).toBe(false);
    expect(Object.hasOwn(value, 'sleepDurationMinutes')).toBe(false);
  });
});

describe('request parsers — fields the boundary has never exposed', () => {
  it.each([
    ['a per-entity audit instant', { occurredAt: '2026-08-11T08:00:00.000Z' }, 'occurredAt'],
    ['a membership entry instant', { enteredAt: '2026-08-11T08:00:00.000Z' }, 'enteredAt'],
    ['a finalization instant', { finalizedAt: '2026-08-11T08:00:00.000Z' }, 'finalizedAt'],
    [
      'a completion instant',
      { actualCompletedAt: '2026-08-11T08:00:00.000Z' },
      'actualCompletedAt',
    ],
    ['an entity revision', { revision: 7 }, 'revision'],
    ['an audit sequence', { sequence: 3 }, 'sequence'],
  ])('rejects %s in the request body', (_label, extra, field) => {
    const issues = requireIssues(
      parseCreateTask({ title: 'Task', placement: { kind: 'backlog' }, ...extra }),
    );

    expect(issues.map((issue) => issue.field)).toContain(field);
  });

  it('rejects a caller-selected recurrence effective date, even when nested', () => {
    const issues = requireIssues(
      parseCreateTaskSeries({
        template: { title: 'Series', plannedDurationMinutes: 30 },
        recurrenceRule: { startDate: TUESDAY, weekdays: [2], effectiveFrom: TUESDAY },
      }),
    );

    expect(issues.map((issue) => issue.field)).toContain('recurrenceRule.effectiveFrom');
  });

  it('still accepts expectedRevision, which the interface does expose', () => {
    const value = requireOk(
      parseSetTaskCompletion({
        occurrenceId: OCCURRENCE_ID,
        date: TUESDAY,
        completed: true,
        expectedRevision: 2,
      }),
    );

    expect(value.expectedRevision).toBe(revision(2));
  });
});

describe('request parsers — discriminated inputs', () => {
  it.each([
    ['day', { mode: 'day', anchorDate: TUESDAY }],
    ['week', { mode: 'week', anchorDate: TUESDAY }],
    ['month', { mode: 'month', anchorDate: TUESDAY, selectedDate: WEDNESDAY }],
  ])('accepts the %s history query', (_label, body) => {
    expect(requireOk(parseHistoryQuery(body))).toEqual(body);
  });

  it('rejects a generic history window', () => {
    const issues = requireIssues(
      parseHistoryQuery({ mode: 'range', anchorDate: TUESDAY, from: TUESDAY, to: WEDNESDAY }),
    );

    expect(issues.map((issue) => issue.field)).toContain('mode');
  });

  it('parses every closure disposition and rejects an unknown one', () => {
    const value = requireOk(
      parseCloseDay({
        date: TUESDAY,
        expectedDayRevision: 3,
        dispositions: {
          [OCCURRENCE_ID]: { kind: 'keep-unfinished' },
          [SECOND_OCCURRENCE_ID]: {
            kind: 'move-to-date',
            destinationDate: WEDNESDAY,
            durationMinutes: 30,
            dayPosition: 0,
          },
        },
      }),
    );

    expect(value.dispositions[OCCURRENCE_ID]).toEqual({ kind: 'keep-unfinished' });
    expect(value.dispositions[SECOND_OCCURRENCE_ID]).toEqual({
      kind: 'move-to-date',
      destinationDate: WEDNESDAY,
      durationMinutes: durationMinutes(30),
      dayPosition: dayPosition(0),
    });

    const issues = requireIssues(
      parseCloseDay({
        date: TUESDAY,
        expectedDayRevision: 0,
        dispositions: { [OCCURRENCE_ID]: { kind: 'postpone-forever' } },
      }),
    );
    expect(issues.map((issue) => issue.field)).toContain(`dispositions.${OCCURRENCE_ID}.kind`);
  });

  it('rejects a weekday outside the ISO range', () => {
    const issues = requireIssues(
      parseCreateTaskSeries({
        template: { title: 'Series', plannedDurationMinutes: 30 },
        recurrenceRule: { startDate: TUESDAY, weekdays: [0, 8] },
      }),
    );

    expect(issues.map((issue) => issue.field)).toEqual([
      'recurrenceRule.weekdays[0]',
      'recurrenceRule.weekdays[1]',
    ]);
  });
});
