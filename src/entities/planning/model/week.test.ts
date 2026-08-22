import { describe, expect, it } from 'vitest';

import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { entityId } from '@/shared/lib/ids';
import { isErr, isOk } from '@/shared/lib/result';

import type { ScoreBreakdown } from './day';
import {
  addWeeklyGoal,
  deleteWeeklyGoal,
  editWeeklyGoal,
  ensureCalendarWeek,
  normalizeWeeklyGoalStatement,
  reorderWeeklyGoals,
  type CompletedWeek,
  type OpenWeek,
  type Week,
} from './week';

const unavailableScore: ScoreBreakdown = {
  task: { completed: 0, applicable: 0, rate: 'unavailable' },
  habit: { completed: 0, applicable: 0, rate: 'unavailable' },
  value: 'unavailable',
};

const firstGoalId = entityId<'weekly-goal'>('123e4567-e89b-42d3-a456-426614174001');
const secondGoalId = entityId<'weekly-goal'>('123e4567-e89b-42d3-a456-426614174002');
const createdAt = instant('2026-08-10T01:00:00.000Z');
const editedAt = instant('2026-08-10T02:00:00.000Z');

function requireSuccess<T>(
  result:
    { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown },
): T {
  expect(isOk(result)).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected success, received ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

function completedWeek(week: OpenWeek): CompletedWeek {
  return {
    ...week,
    status: 'completed',
    completionSnapshot: { progress: unavailableScore },
    completedAt: instant('2026-08-17T01:00:00.000Z'),
  };
}

describe('fixed calendar week creation', () => {
  it.each([
    ['2026-08-10', '2026-08-10'],
    ['2026-08-12', '2026-08-10'],
    ['2026-08-16', '2026-08-10'],
    ['2025-01-01', '2024-12-30'],
  ] as const)('uses the canonical Monday identity for %s', (date, expectedMonday) => {
    const ensured = ensureCalendarWeek({ date: localDate(date) });

    expect(ensured.week).toMatchObject({
      startDate: expectedMonday,
      status: 'open',
      goals: [],
      revision: 0,
    });
    expect(ensured.createdWeek).toBe(true);
  });

  it('owns exactly the seven Monday-through-Sunday days', () => {
    const ensured = ensureCalendarWeek({ date: localDate('2026-08-12') });

    expect(ensured.days.map((day) => day.date)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
    ]);
    expect(ensured.days.every((day) => day.weekStart === '2026-08-10')).toBe(true);
    expect(ensured.days.every((day) => day.status === 'open' && day.revision === 0)).toBe(true);
    expect(ensured.createdDates).toEqual(ensured.days.map((day) => day.date));
  });

  it('is idempotent for an already ensured week and its seven days', () => {
    const first = ensureCalendarWeek({ date: localDate('2026-08-10') });
    const second = ensureCalendarWeek({
      date: localDate('2026-08-16'),
      week: first.week,
      days: first.days,
    });

    expect(second.week).toBe(first.week);
    expect(second.days).toEqual(first.days);
    expect(second.days.every((day, index) => day === first.days[index])).toBe(true);
    expect(second.createdWeek).toBe(false);
    expect(second.createdDates).toEqual([]);
  });

  it('rejects duplicate or foreign day ownership instead of creating an overlapping week', () => {
    const first = ensureCalendarWeek({ date: localDate('2026-08-10') });
    const firstDay = first.days[0];
    if (firstDay === undefined) {
      throw new Error('Expected the canonical Monday Day');
    }

    expect(() =>
      ensureCalendarWeek({
        date: localDate('2026-08-10'),
        week: first.week,
        days: [...first.days, firstDay],
      }),
    ).toThrow('Duplicate Day');
    expect(() =>
      ensureCalendarWeek({
        date: localDate('2026-08-10'),
        week: first.week,
        days: [{ ...firstDay, date: localDate('2026-08-17') }],
      }),
    ).toThrow('does not belong');
  });
});

describe('weekly goal policy', () => {
  function emptyWeek(): OpenWeek {
    return ensureCalendarWeek({ date: localDate('2026-08-10') }).week;
  }

  it('boundary-trims statements, rejects whitespace-only input, and preserves internal content', () => {
    expect(normalizeWeeklyGoalStatement('  Ship   the\tfeature \n')).toBe('Ship   the\tfeature');
    expect(normalizeWeeklyGoalStatement(' \n\t ')).toBeUndefined();

    const invalid = addWeeklyGoal(emptyWeek(), {
      id: firstGoalId,
      statement: ' \n\t ',
      at: createdAt,
    });
    expect(isErr(invalid)).toBe(true);
    expect(invalid).toEqual({ ok: false, error: { code: 'GoalStatementRequired' } });
  });

  it('creates, renames, reorders, and deletes an ordered descriptive goal', () => {
    const withFirst = requireSuccess(
      addWeeklyGoal(emptyWeek(), {
        id: firstGoalId,
        statement: '  First   outcome  ',
        at: createdAt,
      }),
    );
    const withSecond = requireSuccess(
      addWeeklyGoal(withFirst, {
        id: secondGoalId,
        statement: 'Second outcome',
        at: createdAt,
      }),
    );
    const renamed = requireSuccess(
      editWeeklyGoal(withSecond, {
        id: secondGoalId,
        statement: '  Renamed\t outcome  ',
        at: editedAt,
      }),
    );
    const reordered = requireSuccess(reorderWeeklyGoals(renamed, [secondGoalId, firstGoalId]));
    const afterDelete = requireSuccess(deleteWeeklyGoal(reordered, firstGoalId));

    expect(withFirst.goals[0]).toEqual({
      id: firstGoalId,
      statement: 'First   outcome',
      createdAt,
      updatedAt: createdAt,
    });
    expect(renamed.goals[1]).toEqual({
      id: secondGoalId,
      statement: 'Renamed\t outcome',
      createdAt,
      updatedAt: editedAt,
    });
    expect(reordered.goals.map((goal) => goal.id)).toEqual([secondGoalId, firstGoalId]);
    expect(afterDelete.goals.map((goal) => goal.id)).toEqual([secondGoalId]);
    expect(afterDelete.revision).toBe(5);

    const goalKeys = Object.keys(
      requireDefined(afterDelete.goals[0], 'Expected the retained weekly goal'),
    );
    expect(goalKeys).not.toContain('measurable');
    expect(goalKeys).not.toContain('target');
    expect(goalKeys).not.toContain('unit');
    expect(goalKeys).not.toContain('progress');
  });

  it('rejects a whitespace-only rename without changing the original goal', () => {
    const original = requireSuccess(
      addWeeklyGoal(emptyWeek(), {
        id: firstGoalId,
        statement: 'Keep me',
        at: createdAt,
      }),
    );
    const result = editWeeklyGoal(original, {
      id: firstGoalId,
      statement: '\t ',
      at: editedAt,
    });

    expect(result).toEqual({ ok: false, error: { code: 'GoalStatementRequired' } });
    expect(original.goals[0]?.statement).toBe('Keep me');
  });

  it('requires reorder input to be an exact permutation', () => {
    const withFirst = requireSuccess(
      addWeeklyGoal(emptyWeek(), { id: firstGoalId, statement: 'First', at: createdAt }),
    );
    const withSecond = requireSuccess(
      addWeeklyGoal(withFirst, { id: secondGoalId, statement: 'Second', at: createdAt }),
    );

    expect(reorderWeeklyGoals(withSecond, [firstGoalId])).toEqual({
      ok: false,
      error: { code: 'GoalOrderMismatch' },
    });
    expect(reorderWeeklyGoals(withSecond, [firstGoalId, firstGoalId])).toEqual({
      ok: false,
      error: { code: 'GoalOrderMismatch' },
    });
  });

  it.each([
    (week: Week) => addWeeklyGoal(week, { id: firstGoalId, statement: 'New', at: editedAt }),
    (week: Week) => editWeeklyGoal(week, { id: firstGoalId, statement: 'Rename', at: editedAt }),
    (week: Week) => reorderWeeklyGoals(week, [firstGoalId]),
    (week: Week) => deleteWeeklyGoal(week, firstGoalId),
  ])('rejects every goal mutation after week completion', (mutate) => {
    const open = requireSuccess(
      addWeeklyGoal(emptyWeek(), { id: firstGoalId, statement: 'Original', at: createdAt }),
    );

    expect(mutate(completedWeek(open))).toEqual({
      ok: false,
      error: { code: 'WeekCompleted' },
    });
  });
});
