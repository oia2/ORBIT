import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { entityId, revision } from '@/shared/lib/ids';
import { localDate } from '@/shared/lib/local-date/local-date';

import { useManageWeek } from './use-manage-week';

afterEach(cleanup);

describe('useManageWeek', () => {
  it('orchestrates goal add/edit/reorder/delete and reports validation failure', async () => {
    const goalId = entityId<'weekly-goal'>('123e4567-e89b-42d3-a456-426614174001');
    const ok = (value?: unknown) => ({
      ok: true as const,
      value,
      affectedDates: [],
      affectedWeeks: [localDate('2026-05-18')],
    });
    const repository = {
      addWeeklyGoal: vi
        .fn()
        .mockResolvedValueOnce(ok(goalId))
        .mockResolvedValueOnce({
          ok: false,
          error: {
            code: 'ValidationFailure',
            issues: [{ field: 'statement', message: 'required' }],
          },
        }),
      editWeeklyGoal: vi.fn().mockResolvedValue(ok()),
      reorderWeeklyGoals: vi.fn().mockResolvedValue(ok()),
      deleteWeeklyGoal: vi.fn().mockResolvedValue(ok()),
    } as unknown as PlanningRepository;
    const onCommitted = vi.fn().mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
    );
    const { result } = renderHook(
      () =>
        useManageWeek({
          weekStart: localDate('2026-05-18'),
          revision: revision(0),
          onCommitted,
        }),
      { wrapper },
    );
    await act(async () => {
      expect(await result.current.add('Goal')).toBe(true);
      expect(await result.current.edit(goalId, 'Edited')).toBe(true);
      expect(await result.current.reorder([goalId])).toBe(true);
      expect(await result.current.remove(goalId)).toBe(true);
      expect(await result.current.add('   ')).toBe(false);
    });
    expect(onCommitted).toHaveBeenCalledTimes(4);
    expect(result.current.error).toMatch(/введите цель/i);
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeUndefined();
  });
});
