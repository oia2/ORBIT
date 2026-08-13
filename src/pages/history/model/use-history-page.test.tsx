import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PlanningRepositoryProvider,
  type HistoryView,
  type PlanningRepository,
} from '@/entities/planning';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { buildOpenDay, buildScoreBreakdown } from '../../../../tests/fixtures/planning';
import { useHistoryPage } from './use-history-page';

afterEach(cleanup);
const dayView = (date = localDate('2026-01-31')): Extract<HistoryView, { mode: 'day' }> => ({
  mode: 'day',
  anchorDate: date,
  facts: {
    day: buildOpenDay({ date }),
    tasks: [],
    habits: [],
    score: buildScoreBreakdown(),
    plannedLoadMinutes: 0 as never,
  },
});
function setup() {
  const getHistoryView = vi.fn((query: Parameters<PlanningRepository['getHistoryView']>[0]) =>
    Promise.resolve({
      ok: true as const,
      value:
        query.mode === 'day'
          ? dayView(query.anchorDate)
          : query.mode === 'week'
            ? {
                mode: 'week' as const,
                anchorDate: query.anchorDate,
                weekStart: query.anchorDate,
                facts: {
                  week: {
                    status: 'open' as const,
                    startDate: query.anchorDate,
                    goals: [],
                    revision: 0 as never,
                  },
                  days: [],
                  progress: buildScoreBreakdown(),
                },
              }
            : {
                mode: 'month' as const,
                anchorDate: query.anchorDate,
                monthStart: query.anchorDate,
                monthEnd: query.anchorDate,
                selectedDate: query.selectedDate,
                calendar: [],
                selectedDay: dayView(query.selectedDate).facts,
                completedWeeks: [],
              },
    }),
  );
  const prepareOpenPeriod = vi
    .fn()
    .mockResolvedValue({ ok: true, value: undefined, affectedDates: [], affectedWeeks: [] });
  const repository = {
    prepareOpenPeriod,
    getHistoryView,
  } as unknown as PlanningRepository;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
  );
  const clock = createFixedClock({
    instant: instant('2026-01-31T08:00:00.000Z'),
    currentLocalDate: localDate('2026-01-31'),
  });
  return { getHistoryView, prepareOpenPeriod, wrapper, clock };
}

describe('useHistoryPage', () => {
  it('defaults to current Month, preserves selected date across modes, and clamps short months permanently', async () => {
    const context = setup();
    const { result } = renderHook(() => useHistoryPage(context.clock), {
      wrapper: context.wrapper,
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.mode).toBe('month');
    expect(result.current.selectedDate).toBe('2026-01-31');
    act(() => {
      result.current.setMode('week');
    });
    await waitFor(() => {
      expect(result.current.mode).toBe('week');
    });
    expect(result.current.selectedDate).toBe('2026-01-31');
    act(() => {
      result.current.setMode('month');
    });
    act(() => {
      result.current.step(1);
    });
    await waitFor(() => {
      expect(result.current.selectedDate).toBe('2026-02-28');
    });
    act(() => {
      result.current.step(-1);
    });
    expect(result.current.selectedDate).toBe('2026-01-28');
  });

  it('uses no Day dynamics, eight Week points, and six Month points', async () => {
    const context = setup();
    const { result } = renderHook(() => useHistoryPage(context.clock), {
      wrapper: context.wrapper,
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.state.status === 'ready' && result.current.state.dynamics).toHaveLength(
      6,
    );
    act(() => {
      result.current.setMode('week');
    });
    await waitFor(() => {
      expect(result.current.state.status === 'ready' && result.current.state.dynamics).toHaveLength(
        8,
      );
    });
    act(() => {
      result.current.setMode('day');
    });
    await waitFor(() => {
      expect(result.current.state.status === 'ready' && result.current.state.dynamics).toHaveLength(
        0,
      );
    });
    act(() => {
      result.current.step(1);
    });
    expect(result.current.selectedDate).toBe('2026-02-01');
    act(() => {
      result.current.setMode('week');
    });
    await waitFor(() => {
      expect(result.current.mode).toBe('week');
    });
    act(() => {
      result.current.step(-1);
    });
    expect(result.current.selectedDate).toBe('2026-01-25');
  });

  it('reports bounded preparation and query failures without stale facts', async () => {
    const context = setup();
    const first = renderHook(() => useHistoryPage(context.clock), { wrapper: context.wrapper });
    await waitFor(() => {
      expect(first.result.current.state.status).toBe('ready');
    });
    context.prepareOpenPeriod.mockResolvedValueOnce({
      ok: false,
      error: { code: 'StorageUnavailable' },
    });
    await act(async () => {
      await first.result.current.reload();
    });
    await waitFor(() => {
      expect(first.result.current.state.status).toBe('error');
    });
    context.getHistoryView.mockResolvedValueOnce({
      ok: false,
      error: { code: 'UnexpectedStorageFailure' },
    } as never);
    await act(async () => {
      await first.result.current.reload();
    });
    await waitFor(() => {
      expect(first.result.current.state.status).toBe('error');
    });
  });
});
