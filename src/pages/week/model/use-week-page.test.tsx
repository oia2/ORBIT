import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { addDays, localDate } from '@/shared/lib/local-date/local-date';

import { useWeekPage } from './use-week-page';

afterEach(cleanup);

const weekStart = localDate('2026-05-18');
const score = {
  task: { completed: 0, applicable: 0, rate: 'unavailable' as const },
  habit: { completed: 0, applicable: 0, rate: 'unavailable' as const },
  value: 'unavailable' as const,
};
const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
const command = { ok: true as const, value: undefined, affectedDates: [], affectedWeeks: [] };

function wrap(repository: PlanningRepository) {
  return function RepositoryWrapper({ children }: { children: React.ReactNode }) {
    return (
      <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
    );
  };
}

describe('useWeekPage', () => {
  it('loads the canonical week and all seven owning day views', async () => {
    const repository = {
      ensureCalendarWeek: vi.fn().mockResolvedValue({ ...command, value: weekStart }),
      prepareOpenPeriod: vi.fn().mockResolvedValue(command),
      getWeekView: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          week: { status: 'open', startDate: weekStart, goals: [], revision: 0 },
          days: dates.map((date) => ({ date, status: 'open', score, plannedLoadMinutes: 0 })),
          progress: score,
        },
      }),
      getDayView: vi.fn().mockImplementation((date: (typeof dates)[number]) =>
        Promise.resolve({
          ok: true,
          value: {
            day: { status: 'open', date, weekStart, revision: 0 },
            tasks: [],
            habits: [],
            score,
            plannedLoadMinutes: 0,
            unfinishedTaskIds: [],
          },
        }),
      ),
    } as unknown as PlanningRepository;
    const { result } = renderHook(() => useWeekPage(weekStart), { wrapper: wrap(repository) });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    if (result.current.state.status !== 'ready') throw new Error('not ready');
    expect(result.current.state.dayViews).toHaveLength(7);
  });

  it('reports a failed day join instead of a partial week', async () => {
    const failure = {
      ok: false as const,
      error: { code: 'ServerUnavailable' as const, message: 'offline' },
    };
    const repository = {
      ensureCalendarWeek: vi.fn().mockResolvedValue({ ...command, value: weekStart }),
      prepareOpenPeriod: vi.fn().mockResolvedValue(command),
      getWeekView: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          week: { status: 'open', startDate: weekStart, goals: [], revision: 0 },
          days: dates.map((date) => ({ date, status: 'open', score, plannedLoadMinutes: 0 })),
          progress: score,
        },
      }),
      getDayView: vi.fn().mockResolvedValue(failure),
    } as unknown as PlanningRepository;
    const { result } = renderHook(() => useWeekPage(weekStart), { wrapper: wrap(repository) });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
  });
});
