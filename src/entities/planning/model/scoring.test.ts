import { describe, expect, expectTypeOf, it } from 'vitest';

import { calculateCompletionScore, type CompletionScoreInput } from './scoring';

describe('shared completion scoring truth table', () => {
  it.each([
    {
      name: 'tasks and habits use the 70/30 weights',
      input: {
        task: { completed: 2, applicable: 4 },
        habit: { completed: 3, applicable: 4 },
      },
      expected: {
        task: { completed: 2, applicable: 4, rate: 0.5 },
        habit: { completed: 3, applicable: 4, rate: 0.75 },
        value: 58,
        weightsApplied: { task: 70, habit: 30 },
      },
    },
    {
      name: 'tasks normalize to the full weight when habits are absent',
      input: {
        task: { completed: 3, applicable: 4 },
        habit: { completed: 0, applicable: 0 },
      },
      expected: {
        task: { completed: 3, applicable: 4, rate: 0.75 },
        habit: { completed: 0, applicable: 0, rate: 'unavailable' },
        value: 75,
        weightsApplied: { task: 100, habit: 0 },
      },
    },
    {
      name: 'habits normalize to the full weight when tasks are absent',
      input: {
        task: { completed: 0, applicable: 0 },
        habit: { completed: 1, applicable: 2 },
      },
      expected: {
        task: { completed: 0, applicable: 0, rate: 'unavailable' },
        habit: { completed: 1, applicable: 2, rate: 0.5 },
        value: 50,
        weightsApplied: { task: 0, habit: 100 },
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
        weightsApplied: { task: 0, habit: 0 },
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
      value: 62,
      weightsApplied: { task: 70, habit: 30 },
    });
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
