import { describe, expect, expectTypeOf, it } from 'vitest';

import { entityId, nonNegativeDurationMinutes, revision } from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import {
  addDays,
  localDate,
  startOfWeek,
  weekDates,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';
import type { Result } from '@/shared/lib/result';

import { createOpenDay, type ClosedDay, type ScoreBreakdown } from './day';
import * as selectors from './selectors';
import { selectCompletedWeekReview, type SelectCompletedWeekReviewInput } from './selectors';
import * as weekCompletion from './week-completion';
import {
  prepareWeekCompletion,
  type PrepareWeekCompletionInput,
  type WeekCompletionPreparation,
} from './week-completion';
import { isCompletedWeek, type OpenWeek } from './week';

const WEEK_START = localDate('2026-08-10');
const FUTURE_WEEK_START = localDate('2026-08-17');
const COMPLETED_AT = instant('2026-08-17T06:00:00.000Z');
const CLOCK = createFixedClock({
  instant: COMPLETED_AT,
  currentLocalDate: FUTURE_WEEK_START,
});

const UNAVAILABLE_SCORE: ScoreBreakdown = {
  task: { completed: 0, applicable: 0, rate: 'unavailable' },
  habit: { completed: 0, applicable: 0, rate: 'unavailable' },
  value: 'unavailable',
  weightsApplied: { task: 0, habit: 0 },
};

function openWeek(overrides: Partial<OpenWeek> = {}): OpenWeek {
  return {
    startDate: WEEK_START,
    goals: [],
    status: 'open',
    revision: revision(0),
    ...overrides,
  };
}

function closedDay(
  date: LocalDate,
  score: ScoreBreakdown = UNAVAILABLE_SCORE,
  overrides: Partial<ClosedDay> = {},
): ClosedDay {
  return {
    date,
    weekStart: startOfWeek(date),
    status: 'closed',
    revision: revision(1),
    closureSnapshot: {
      score,
      plannedLoadMinutes: nonNegativeDurationMinutes(0),
    },
    closedAt: instant(`${date}T23:00:00.000Z`),
    ...overrides,
  };
}

function sevenClosedDays(
  scores: readonly ScoreBreakdown[] = [],
  weekStart = WEEK_START,
): readonly ClosedDay[] {
  return weekDates(weekStart).map((date, index) =>
    closedDay(date, scores[index] ?? UNAVAILABLE_SCORE),
  );
}

function completionInput(
  overrides: Partial<PrepareWeekCompletionInput> = {},
): PrepareWeekCompletionInput {
  return {
    week: openWeek(),
    days: sevenClosedDays(),
    clock: CLOCK,
    ...overrides,
  };
}

function score(
  task: { readonly completed: number; readonly applicable: number },
  habit: { readonly completed: number; readonly applicable: number },
  value = 0,
): ScoreBreakdown {
  return {
    task:
      task.applicable === 0
        ? { completed: 0, applicable: 0, rate: 'unavailable' }
        : { ...task, rate: task.completed / task.applicable },
    habit:
      habit.applicable === 0
        ? { completed: 0, applicable: 0, rate: 'unavailable' }
        : { ...habit, rate: habit.completed / habit.applicable },
    value,
    weightsApplied:
      task.applicable > 0 && habit.applicable > 0
        ? { task: 70, habit: 30 }
        : task.applicable > 0
          ? { task: 100, habit: 0 }
          : habit.applicable > 0
            ? { task: 0, habit: 100 }
            : { task: 0, habit: 0 },
  };
}

function requireOk<T, E>(result: Result<T, E>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected success, received ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

describe('week-completion calendar and lifecycle truth table', () => {
  it('requires exactly the seven unique closed days owned by the canonical week', () => {
    const expectedDates = weekDates(WEEK_START);
    const days = sevenClosedDays();

    expect(prepareWeekCompletion(completionInput({ days: days.slice(0, 6) }))).toEqual({
      ok: false,
      error: {
        code: 'WeekDaysMismatch',
        weekStart: WEEK_START,
        expectedDates,
        receivedDates: expectedDates.slice(0, 6),
      },
    });

    expect(
      prepareWeekCompletion(
        completionInput({ days: [...days.slice(0, 6), closedDay(expectedDates[0])] }),
      ),
    ).toEqual({
      ok: false,
      error: {
        code: 'WeekDaysMismatch',
        weekStart: WEEK_START,
        expectedDates,
        receivedDates: [...expectedDates.slice(0, 6), expectedDates[0]],
      },
    });

    const foreign = closedDay(FUTURE_WEEK_START);
    expect(
      prepareWeekCompletion(completionInput({ days: [...days.slice(0, 6), foreign] })),
    ).toMatchObject({
      ok: false,
      error: { code: 'WeekDaysMismatch', weekStart: WEEK_START },
    });

    const openDate = expectedDates[3];
    expect(
      prepareWeekCompletion(
        completionInput({
          days: days.map((day) => (day.date === openDate ? createOpenDay(openDate) : day)),
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: 'WeekNotClosable', weekStart: WEEK_START, openDates: [openDate] },
    });
  });

  it('rejects a noncanonical week identity and a second completion attempt', () => {
    expect(
      prepareWeekCompletion(
        completionInput({ week: { ...openWeek(), startDate: addDays(WEEK_START, 1) } }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'WeekDaysMismatch' } });

    const completed = requireOk(prepareWeekCompletion(completionInput())).week;
    expect(prepareWeekCompletion(completionInput({ week: completed }))).toEqual({
      ok: false,
      error: { code: 'PeriodImmutable', weekStart: WEEK_START },
    });
    expect(isCompletedWeek(completed)).toBe(true);
    expect(weekCompletion).not.toHaveProperty('reopenWeek');
  });
});

describe('weekly progress aggregation and completion snapshot', () => {
  it('sums frozen raw counts instead of averaging daily percentages', () => {
    const days = sevenClosedDays([
      score({ completed: 1, applicable: 1 }, { completed: 0, applicable: 0 }, 100),
      score({ completed: 0, applicable: 9 }, { completed: 0, applicable: 0 }, 0),
    ]);
    const prepared = requireOk(prepareWeekCompletion(completionInput({ days })));

    expect(prepared.week.completionSnapshot.progress).toEqual({
      task: { completed: 1, applicable: 10, rate: 0.1 },
      habit: { completed: 0, applicable: 0, rate: 'unavailable' },
      value: 10,
      weightsApplied: { task: 100, habit: 0 },
    });
    expect(prepared.week.completionSnapshot.progress.value).not.toBe(50);
  });

  it.each([
    {
      name: 'both categories use 70/30',
      source: score({ completed: 2, applicable: 4 }, { completed: 3, applicable: 4 }),
      expected: {
        task: { completed: 2, applicable: 4, rate: 0.5 },
        habit: { completed: 3, applicable: 4, rate: 0.75 },
        value: 58,
        weightsApplied: { task: 70, habit: 30 },
      },
    },
    {
      name: 'task-only exact half rounds upward',
      source: score({ completed: 149, applicable: 200 }, { completed: 0, applicable: 0 }),
      expected: {
        task: { completed: 149, applicable: 200, rate: 149 / 200 },
        habit: { completed: 0, applicable: 0, rate: 'unavailable' },
        value: 75,
        weightsApplied: { task: 100, habit: 0 },
      },
    },
    {
      name: 'habit-only progress normalizes to 100 percent',
      source: score({ completed: 0, applicable: 0 }, { completed: 1, applicable: 2 }),
      expected: {
        task: { completed: 0, applicable: 0, rate: 'unavailable' },
        habit: { completed: 1, applicable: 2, rate: 0.5 },
        value: 50,
        weightsApplied: { task: 0, habit: 100 },
      },
    },
    {
      name: 'no applicable facts remain unavailable',
      source: UNAVAILABLE_SCORE,
      expected: UNAVAILABLE_SCORE,
    },
  ])('$name', ({ source, expected }) => {
    const prepared = requireOk(
      prepareWeekCompletion(completionInput({ days: sevenClosedDays([source]) })),
    );
    expect(prepared.week.completionSnapshot.progress).toEqual(expected);
  });

  it('excludes goals and daily state while preserving them as review context', () => {
    const goal = {
      id: entityId<'weekly-goal'>('123e4567-e89b-42d3-a456-426614178501'),
      statement: 'Descriptive context only',
      createdAt: COMPLETED_AT,
      updatedAt: COMPLETED_AT,
    } as const;
    const source = score({ completed: 1, applicable: 2 }, { completed: 0, applicable: 0 });
    const days = sevenClosedDays([source]).map((day, index) =>
      index === 0
        ? {
            ...day,
            state: { energy: 5 as const, mood: 1 as const, updatedAt: COMPLETED_AT },
          }
        : day,
    );
    const prepared = requireOk(
      prepareWeekCompletion(completionInput({ week: openWeek({ goals: [goal] }), days })),
    );

    expect(prepared.week.goals).toEqual([goal]);
    expect(prepared.week.completionSnapshot.progress.value).toBe(50);
    expect(prepared.week.completionSnapshot).not.toHaveProperty('goals');
    expect(prepared.week.completionSnapshot).not.toHaveProperty('state');
  });

  it('stores optional reflection, frozen progress, injected completion time, and one revision', () => {
    const reflection = '  Keep the deliberate planning cadence.  ';
    const input = completionInput({ reflection });
    const before = JSON.stringify(input);
    const prepared = requireOk(prepareWeekCompletion(input));

    expect(JSON.stringify(input)).toBe(before);
    expect(prepared.week).toMatchObject({
      status: 'completed',
      reflection,
      completedAt: COMPLETED_AT,
      revision: 1,
      completionSnapshot: { progress: UNAVAILABLE_SCORE },
    });

    const withoutReflection = requireOk(prepareWeekCompletion(completionInput()));
    expect(withoutReflection.week).not.toHaveProperty('reflection');
  });
});

describe('immutable completed-week projection and future-plan isolation', () => {
  function completedPreparation(): WeekCompletionPreparation {
    return requireOk(
      prepareWeekCompletion(
        completionInput({
          reflection: 'Frozen review',
          days: sevenClosedDays([
            score({ completed: 3, applicable: 4 }, { completed: 1, applicable: 2 }),
          ]),
        }),
      ),
    );
  }

  it('selects the frozen completion snapshot and exact owned days despite future changes', () => {
    const completed = completedPreparation();
    const futureDay = closedDay(
      FUTURE_WEEK_START,
      score({ completed: 0, applicable: 100 }, { completed: 0, applicable: 100 }),
      {
        state: { energy: 1, mood: 1, updatedAt: COMPLETED_AT },
      },
    );
    const first = selectCompletedWeekReview({
      week: completed.week,
      days: [...completed.days, futureDay],
    });
    const changedFutureDay = {
      ...futureDay,
      closureSnapshot: {
        ...futureDay.closureSnapshot,
        score: score({ completed: 100, applicable: 100 }, { completed: 100, applicable: 100 }),
      },
    } as const satisfies ClosedDay;
    const afterFutureChange = selectCompletedWeekReview({
      week: completed.week,
      days: [...completed.days, changedFutureDay],
    });

    expect(first).toEqual(afterFutureChange);
    expect(first.days.map((day) => day.date)).toEqual(weekDates(WEEK_START));
    expect(first.progress).toBe(completed.week.completionSnapshot.progress);
    expect(first).toMatchObject({ reflection: 'Frozen review', immutable: true });
    expect(first.week).toBe(completed.week);
  });

  it('rejects open or incomplete completed-week review sources and exposes no mutation API', () => {
    expect(() => selectCompletedWeekReview({ week: openWeek(), days: sevenClosedDays() })).toThrow(
      RangeError,
    );

    const completed = completedPreparation();
    expect(() =>
      selectCompletedWeekReview({ week: completed.week, days: completed.days.slice(0, 6) }),
    ).toThrow(RangeError);
    expect(selectors).not.toHaveProperty('reopenWeek');
    expect(selectors).not.toHaveProperty('editCompletedWeek');
  });

  it('keeps selector inputs limited to the completed week and day records', () => {
    expectTypeOf<keyof SelectCompletedWeekReviewInput>().toEqualTypeOf<'week' | 'days'>();
  });
});
