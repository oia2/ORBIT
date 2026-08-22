import { describe, expect, expectTypeOf, it } from 'vitest';

import { calculateCompletionScore, type CompletionScoreInput } from './scoring';

describe('shared completion scoring truth table', () => {
  it.each([
    {
      name: 'every task and habit carries the same weight',
      input: {
        task: { completed: 2, applicable: 4 },
        habit: { completed: 3, applicable: 4 },
      },
      expected: {
        task: { completed: 2, applicable: 4, rate: 0.5 },
        habit: { completed: 3, applicable: 4, rate: 0.75 },
        // 5 of 8 items done. Under the old 70/30 split this read 58.
        value: 63,
      },
    },
    {
      name: 'a day of tasks only reads as its task rate',
      input: {
        task: { completed: 3, applicable: 4 },
        habit: { completed: 0, applicable: 0 },
      },
      expected: {
        task: { completed: 3, applicable: 4, rate: 0.75 },
        habit: { completed: 0, applicable: 0, rate: 'unavailable' },
        value: 75,
      },
    },
    {
      name: 'a day of habits only reads as its habit rate',
      input: {
        task: { completed: 0, applicable: 0 },
        habit: { completed: 1, applicable: 2 },
      },
      expected: {
        task: { completed: 0, applicable: 0, rate: 'unavailable' },
        habit: { completed: 1, applicable: 2, rate: 0.5 },
        value: 50,
      },
    },
    {
      name: 'an empty period is unavailable rather than zero',
      input: {
        task: { completed: 0, applicable: 0 },
        habit: { completed: 0, applicable: 0 },
      },
      expected: {
        task: { completed: 0, applicable: 0, rate: 'unavailable' },
        habit: { completed: 0, applicable: 0, rate: 'unavailable' },
        value: 'unavailable',
      },
    },
  ])('$name', ({ input, expected }) => {
    expect(calculateCompletionScore(input)).toEqual(expected);
  });

  it('weights every membership and applicable habit occurrence equally', () => {
    const score = calculateCompletionScore({
      task: { completed: 2, applicable: 3 },
      habit: { completed: 1, applicable: 2 },
    });

    expect(score).toEqual({
      task: { completed: 2, applicable: 3, rate: 2 / 3 },
      habit: { completed: 1, applicable: 2, rate: 1 / 2 },
      // 3 of 5 items done. Under the old 70/30 split this read 62.
      value: 60,
    });
  });

  /*
   * 003 US4 acceptance scenarios, verbatim. These are the cases the owner used
   * to describe the problem with the old 70/30 split: a single habit could move
   * a nine-task day by thirty points.
   */
  it('reports 90% for nine completed tasks and one missed habit (FR-016)', () => {
    expect(
      calculateCompletionScore({
        task: { completed: 9, applicable: 9 },
        habit: { completed: 0, applicable: 1 },
      }).value,
    ).toBe(90);
  });

  it('reports 25% for one completed task and three missed habits (FR-016)', () => {
    expect(
      calculateCompletionScore({
        task: { completed: 1, applicable: 1 },
        habit: { completed: 0, applicable: 3 },
      }).value,
    ).toBe(25);
  });

  it('reports a tasks-only day as its plain task completion rate (FR-016)', () => {
    expect(
      calculateCompletionScore({
        task: { completed: 3, applicable: 5 },
        habit: { completed: 0, applicable: 0 },
      }).value,
    ).toBe(60);
  });

  it('distinguishes "no data" from a result of zero (FR-018)', () => {
    const empty = calculateCompletionScore({
      task: { completed: 0, applicable: 0 },
      habit: { completed: 0, applicable: 0 },
    });
    const nothingDone = calculateCompletionScore({
      task: { completed: 0, applicable: 2 },
      habit: { completed: 0, applicable: 1 },
    });

    expect(empty.value).toBe('unavailable');
    expect(nothingDone.value).toBe(0);
  });

  it('never reports the removed weighting field (FR-020)', () => {
    const score = calculateCompletionScore({
      task: { completed: 1, applicable: 2 },
      habit: { completed: 1, applicable: 2 },
    });

    expect(score).not.toHaveProperty('weightsApplied');
  });

  it('scores a period from summed day counts identically to its items (FR-017)', () => {
    // Aggregating days then scoring must equal scoring the items directly,
    // which is what lets weekly progress reuse this function unchanged.
    const monday = {
      task: { completed: 2, applicable: 3 },
      habit: { completed: 1, applicable: 1 },
    };
    const tuesday = {
      task: { completed: 1, applicable: 4 },
      habit: { completed: 0, applicable: 2 },
    };

    const aggregated = calculateCompletionScore({
      task: { completed: 3, applicable: 7 },
      habit: { completed: 1, applicable: 3 },
    });

    expect(aggregated.value).toBe(
      calculateCompletionScore({
        task: {
          completed: monday.task.completed + tuesday.task.completed,
          applicable: monday.task.applicable + tuesday.task.applicable,
        },
        habit: {
          completed: monday.habit.completed + tuesday.habit.completed,
          applicable: monday.habit.applicable + tuesday.habit.applicable,
        },
      }).value,
    );
  });

  it.each([
    { completed: 186, applicable: 250, expected: 74 },
    { completed: 149, applicable: 200, expected: 75 },
    { completed: 373, applicable: 500, expected: 75 },
  ])(
    'rounds $completed/$applicable once with exact half ties upward',
    ({ completed, applicable, expected }) => {
      expect(
        calculateCompletionScore({
          task: { completed, applicable },
          habit: { completed: 0, applicable: 0 },
        }).value,
      ).toBe(expected);
    },
  );

  it.each([
    { task: { completed: -1, applicable: 1 }, habit: { completed: 0, applicable: 0 } },
    { task: { completed: 0.5, applicable: 1 }, habit: { completed: 0, applicable: 0 } },
    { task: { completed: 2, applicable: 1 }, habit: { completed: 0, applicable: 0 } },
    { task: { completed: 0, applicable: 0 }, habit: { completed: 1, applicable: -1 } },
  ])('rejects invalid integer contributing counts: %j', (input) => {
    expect(() => calculateCompletionScore(input)).toThrow(RangeError);
  });

  it('accepts only task and habit counts as policy inputs', () => {
    expectTypeOf<keyof CompletionScoreInput>().toEqualTypeOf<'task' | 'habit'>();

    const score = calculateCompletionScore({
      task: { completed: 1, applicable: 1 },
      habit: { completed: 0, applicable: 0 },
      state: { energy: 1 },
      goals: ['not a score input'],
      formulaVersion: 99,
    } as CompletionScoreInput & {
      readonly state: object;
      readonly goals: readonly string[];
      readonly formulaVersion: number;
    });

    expect(score.value).toBe(100);
    expect(score).not.toHaveProperty('state');
    expect(score).not.toHaveProperty('goals');
    expect(score).not.toHaveProperty('formulaVersion');
  });
});
