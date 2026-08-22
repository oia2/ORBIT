import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { localDate } from '@/shared/lib/local-date/local-date';

import { useDayPage } from './use-day-page';

afterEach(cleanup);

const date = localDate('2026-05-20');
const okCommand = { ok: true as const, value: undefined, affectedDates: [], affectedWeeks: [] };
const unavailable = {
  task: { completed: 0, applicable: 0, rate: 'unavailable' as const },
  habit: { completed: 0, applicable: 0, rate: 'unavailable' as const },
  value: 'unavailable' as const,
};

function wrapper(repository: PlanningRepository) {
  return function RepositoryWrapper({ children }: { children: React.ReactNode }) {
    return (
      <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
    );
  };
}

describe('useDayPage', () => {
  it('loads current facts and only open alternative move dates', async () => {
    const repository = {
      ensureCalendarWeek: vi
        .fn()
        .mockResolvedValue({ ...okCommand, value: localDate('2026-05-18') }),
      prepareOpenPeriod: vi.fn().mockResolvedValue(okCommand),
      getDayView: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          day: { status: 'open', date, weekStart: localDate('2026-05-18'), revision: 0 },
          tasks: [],
          habits: [],
          score: unavailable,
          plannedLoadMinutes: 0,
          unfinishedTaskIds: [],
        },
      }),
      getWeekView: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          week: { status: 'open', startDate: localDate('2026-05-18'), goals: [], revision: 0 },
          days: [
            { date, status: 'open', score: unavailable, plannedLoadMinutes: 0 },
            {
              date: localDate('2026-05-21'),
              status: 'closed',
              score: unavailable,
              plannedLoadMinutes: 0,
            },
            {
              date: localDate('2026-05-22'),
              status: 'open',
              score: unavailable,
              plannedLoadMinutes: 0,
            },
          ],
          progress: unavailable,
        },
      }),
    } as unknown as PlanningRepository;
    const { result } = renderHook(() => useDayPage(date), { wrapper: wrapper(repository) });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    if (result.current.state.status !== 'ready') throw new Error('not ready');
    expect(result.current.state.availableMoveDates).toEqual([localDate('2026-05-22')]);
  });

  it.each(['prepare', 'query'] as const)('reports a %s failure', async (stage) => {
    const failure = {
      ok: false as const,
      error: { code: 'ServerUnavailable' as const, message: 'offline' },
    };
    const repository = {
      ensureCalendarWeek: vi
        .fn()
        .mockResolvedValue({ ...okCommand, value: localDate('2026-05-18') }),
      prepareOpenPeriod: vi.fn().mockResolvedValue(stage === 'prepare' ? failure : okCommand),
      getDayView: vi.fn().mockResolvedValue(failure),
      getWeekView: vi.fn().mockResolvedValue(failure),
    } as unknown as PlanningRepository;
    const { result } = renderHook(() => useDayPage(date), { wrapper: wrapper(repository) });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
  });
});
