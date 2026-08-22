import { describe, expect, it } from 'vitest';

import {
  createOpenDay,
  prepareDailyStateUpdate,
  type ClosedDay,
  type DailyStateUpdateError,
  type OpenDay,
} from './day';
import { nonNegativeDurationMinutes, revision } from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import type { Result } from '@/shared/lib/result';

const DATE = localDate('2026-08-11');
const UPDATED_AT = instant('2026-08-11T08:00:00.000Z');

function requireUpdated(result: Result<OpenDay, DailyStateUpdateError>): OpenDay {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected Daily State update, received ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function closedDay(): ClosedDay {
  return {
    ...createOpenDay(DATE),
    status: 'closed',
    revision: revision(1),
    closureSnapshot: {
      score: {
        task: { completed: 1, applicable: 2, rate: 0.5 },
        habit: { completed: 1, applicable: 1, rate: 1 },
        value: 65,
      },
      plannedLoadMinutes: nonNegativeDurationMinutes(75),
    },
    closedAt: UPDATED_AT,
  };
}

describe('Daily State validation', () => {
  it.each([1, 2, 3, 4, 5])('accepts energy and mood ordinal %s on an open day', (value) => {
    const updated = requireUpdated(
      prepareDailyStateUpdate({
        day: createOpenDay(DATE),
        weekStatus: 'open',
        energy: value,
        mood: value,
        updatedAt: UPDATED_AT,
      }),
    );

    expect(updated.state).toEqual({ energy: value, mood: value, updatedAt: UPDATED_AT });
    expect(updated.revision).toBe(1);
  });

  it.each([
    ['energy', 0],
    ['energy', 6],
    ['energy', 1.5],
    ['mood', -1],
    ['mood', 6],
    ['mood', Number.NaN],
  ] as const)('rejects invalid %s value %s', (field, value) => {
    const result = prepareDailyStateUpdate({
      day: createOpenDay(DATE),
      weekStatus: 'open',
      [field]: value,
      updatedAt: UPDATED_AT,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'ValidationFailure', issues: [{ field }] },
    });
  });

  it.each([0, 1, 480])('accepts non-negative integer sleep duration %s', (value) => {
    const updated = requireUpdated(
      prepareDailyStateUpdate({
        day: createOpenDay(DATE),
        weekStatus: 'open',
        sleepDurationMinutes: value,
        updatedAt: UPDATED_AT,
      }),
    );

    expect(updated.state?.sleepDurationMinutes).toBe(value);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid sleep duration %s',
    (sleepDurationMinutes) => {
      expect(
        prepareDailyStateUpdate({
          day: createOpenDay(DATE),
          weekStatus: 'open',
          sleepDurationMinutes,
          updatedAt: UPDATED_AT,
        }),
      ).toMatchObject({
        ok: false,
        error: {
          code: 'ValidationFailure',
          issues: [{ field: 'sleepDurationMinutes' }],
        },
      });
    },
  );

  it('preserves explicit absence independently for each contextual field', () => {
    const updated = requireUpdated(
      prepareDailyStateUpdate({
        day: createOpenDay(DATE),
        weekStatus: 'open',
        mood: 3,
        updatedAt: UPDATED_AT,
      }),
    );

    expect(updated.state).toEqual({ mood: 3, updatedAt: UPDATED_AT });
    expect(updated.state).not.toHaveProperty('energy');
    expect(updated.state).not.toHaveProperty('sleepDurationMinutes');
    expect(updated.state).not.toHaveProperty('score');
  });
});

describe('Daily State mutability', () => {
  it('rejects a closed day without mutating its frozen record', () => {
    const day = closedDay();

    const result = prepareDailyStateUpdate({
      day,
      weekStatus: 'open',
      energy: 4,
      updatedAt: UPDATED_AT,
    });

    expect(result).toEqual({ ok: false, error: { code: 'PeriodImmutable', date: DATE } });
    expect(day).toEqual(closedDay());
  });

  it('rejects an open day owned by a completed week', () => {
    expect(
      prepareDailyStateUpdate({
        day: createOpenDay(DATE),
        weekStatus: 'completed',
        mood: 4,
        updatedAt: UPDATED_AT,
      }),
    ).toEqual({
      ok: false,
      error: { code: 'PeriodImmutable', weekStart: localDate('2026-08-10') },
    });
  });
});
