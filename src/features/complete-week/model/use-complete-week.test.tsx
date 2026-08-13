import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { revision } from '@/shared/lib/ids';
import { localDate } from '@/shared/lib/local-date/local-date';

import { useCompleteWeek } from './use-complete-week';

afterEach(cleanup);

function setup(result: unknown) {
  const completeWeek = vi.fn().mockResolvedValue(result);
  const repository = { completeWeek } as unknown as PlanningRepository;
  const committed = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
  );
  const hook = renderHook(() => useCompleteWeek(committed), { wrapper });
  return { ...hook, completeWeek, committed };
}

describe('useCompleteWeek', () => {
  it.each([
    [undefined, false],
    ['   ', false],
    ['Фактическая рефлексия', true],
  ])('normalizes optional reflection and commits (%s)', async (reflection, included) => {
    const context = setup({ ok: true, value: undefined, affectedDates: [], affectedWeeks: [] });
    let result = false;
    await act(async () => {
      result = await context.result.current.complete(
        localDate('2026-08-10'),
        revision(7),
        reflection,
      );
    });
    expect(result).toBe(true);
    expect(context.completeWeek.mock.calls[0]?.[0]).toEqual(
      included
        ? { weekStart: '2026-08-10', expectedWeekRevision: 7, reflection }
        : { weekStart: '2026-08-10', expectedWeekRevision: 7 },
    );
    expect(context.committed).toHaveBeenCalledOnce();
  });

  it.each([
    ['WeekNotClosable', /семь дней/i, 0],
    ['RevisionConflict', /не удалось завершить/i, 1],
    ['StorageUnavailable', /не удалось завершить/i, 0],
  ])('maps %s and does not claim completion', async (code, message, reloads) => {
    const context = setup({ ok: false, error: { code } });
    let result = true;
    await act(async () => {
      result = await context.result.current.complete(localDate('2026-08-10'), revision(1));
    });
    expect(result).toBe(false);
    expect(context.result.current.error).toMatch(message);
    expect(context.committed).toHaveBeenCalledTimes(reloads);
  });
});
