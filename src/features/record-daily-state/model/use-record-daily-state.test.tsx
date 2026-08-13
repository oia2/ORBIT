import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { revision } from '@/shared/lib/ids';
import { localDate } from '@/shared/lib/local-date/local-date';

import { useRecordDailyState } from './use-record-daily-state';

afterEach(cleanup);

function setup(result: unknown) {
  const saveDailyState = vi.fn().mockResolvedValue(result);
  const repository = { saveDailyState } as unknown as PlanningRepository;
  const committed = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
  );
  const hook = renderHook(() => useRecordDailyState(committed), { wrapper });
  return { ...hook, saveDailyState, committed };
}

const failure = (code: string) => ({ ok: false as const, error: { code } });

describe('useRecordDailyState', () => {
  it('commits defined values, reports success, and clears errors', async () => {
    const context = setup({ ok: true, value: undefined, affectedDates: [], affectedWeeks: [] });
    await act(() =>
      context.result.current.save({
        date: localDate('2026-08-13'),
        revision: revision(2),
        energy: 4,
        mood: 3,
        sleepDurationMinutes: 450,
      }),
    );
    expect(context.saveDailyState).toHaveBeenCalledWith({
      date: '2026-08-13',
      expectedDayRevision: 2,
      energy: 4,
      mood: 3,
      sleepDurationMinutes: 450,
    });
    expect(context.result.current.saved).toBe(true);
    expect(context.committed).toHaveBeenCalledOnce();
    act(() => {
      context.result.current.clearError();
    });
    expect(context.result.current.error).toBeUndefined();
  });

  it.each([
    ['PeriodImmutable', /закрытый день/i, 0],
    ['RevisionConflict', /не удалось сохранить/i, 1],
    ['StorageUnavailable', /не удалось сохранить/i, 0],
  ])('maps %s without a false success', async (code, message, reloads) => {
    const context = setup(failure(code));
    await act(() =>
      context.result.current.save({ date: localDate('2026-08-13'), revision: revision(0) }),
    );
    expect(context.saveDailyState).toHaveBeenCalledWith({
      date: '2026-08-13',
      expectedDayRevision: 0,
    });
    expect(context.result.current.error).toMatch(message);
    expect(context.result.current.saved).toBe(false);
    expect(context.committed).toHaveBeenCalledTimes(reloads);
  });
});
