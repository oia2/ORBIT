import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { entityId, revision } from '@/shared/lib/ids';
import { localDate } from '@/shared/lib/local-date/local-date';

import { useHabitOutcome } from './use-habit-outcome';
import { useManageHabit } from './use-manage-habit';

afterEach(cleanup);
const definitionId = entityId<'habit-definition'>('123e4567-e89b-42d3-a456-426614174101');
const occurrenceId = entityId<'habit-occurrence'>('123e4567-e89b-42d3-a456-426614174102');
const success = { ok: true as const, value: undefined, affectedDates: [], affectedWeeks: [] };

function setup(overrides: Partial<PlanningRepository> = {}) {
  const repository = {
    createHabitDefinition: vi.fn().mockResolvedValue({ ...success, value: definitionId }),
    updateHabitRule: vi.fn().mockResolvedValue(success),
    stopHabitDefinition: vi.fn().mockResolvedValue(success),
    recordHabitOutcome: vi.fn().mockResolvedValue(success),
    correctBoundaryMissToCompleted: vi.fn().mockResolvedValue(success),
    deleteHabitOccurrence: vi.fn().mockResolvedValue(success),
    editHabitOccurrence: vi.fn().mockResolvedValue(success),
    ...overrides,
  } as unknown as PlanningRepository;
  const committed = vi.fn().mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
  );
  return { repository, committed, wrapper };
}

describe('habit orchestration', () => {
  it('creates, updates, stops, records, corrects, edits, and deletes only after commit', async () => {
    const context = setup();
    const habits = renderHook(() => useManageHabit(context.committed), {
      wrapper: context.wrapper,
    });
    const outcomes = renderHook(() => useHabitOutcome(context.committed), {
      wrapper: context.wrapper,
    });
    const rule = { startDate: localDate('2026-05-20'), weekdays: [3] as const };
    await act(async () => {
      expect(await habits.result.current.create({ title: 'Walk', rule })).toBe(true);
      expect(
        await habits.result.current.update({ definitionId, rule, revision: revision(0) }),
      ).toBe(true);
      expect(await habits.result.current.stop(definitionId, revision(1))).toBe(true);
      expect(await outcomes.result.current.record(occurrenceId, 'completed', revision(0))).toBe(
        true,
      );
      expect(await outcomes.result.current.correct(occurrenceId, revision(0))).toBe(true);
      expect(await outcomes.result.current.edit(occurrenceId, 'Long walk', revision(0))).toBe(true);
      expect(await outcomes.result.current.remove(occurrenceId, revision(0))).toBe(true);
    });
    expect(context.committed).toHaveBeenCalledTimes(7);
  });

  it('recovers conflicts and reports immutable occurrence failures without false success', async () => {
    const conflict = {
      ok: false as const,
      error: {
        code: 'RevisionConflict' as const,
        expectedRevision: revision(0),
        actualRevision: revision(1),
      },
    };
    const immutable = {
      ok: false as const,
      error: { code: 'PeriodImmutable' as const, date: localDate('2026-05-20') },
    };
    const context = setup({
      updateHabitRule: vi.fn().mockResolvedValue(conflict),
      deleteHabitOccurrence: vi.fn().mockResolvedValue(immutable),
    });
    const habits = renderHook(() => useManageHabit(context.committed), {
      wrapper: context.wrapper,
    });
    const outcomes = renderHook(() => useHabitOutcome(context.committed), {
      wrapper: context.wrapper,
    });
    const rule = { startDate: localDate('2026-05-20'), weekdays: [3] as const };
    await act(async () => {
      expect(
        await habits.result.current.update({ definitionId, rule, revision: revision(0) }),
      ).toBe(false);
    });
    expect(context.committed).toHaveBeenCalledOnce();
    await act(async () => {
      expect(await outcomes.result.current.remove(occurrenceId, revision(0))).toBe(false);
    });
    expect(outcomes.result.current.error).toMatch(/закрытый день/i);
  });
});
