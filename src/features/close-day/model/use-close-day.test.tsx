import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { entityId, revision } from '@/shared/lib/ids';
import { localDate } from '@/shared/lib/local-date/local-date';
import { buildOpenDay } from '../../../../tests/fixtures/planning';

import type { ValidClosureDraft } from './closure-reducer';
import { useCloseDay } from './use-close-day';

afterEach(cleanup);

const taskId = entityId('11111111-1111-4111-8111-111111111111');
const base = { date: localDate('2026-08-13'), revision: revision(3) };
const effect = { ok: true, value: undefined, affectedDates: [], affectedWeeks: [] };

function setup(closeResult: unknown = effect, dayResult: unknown = effect) {
  const closeDay = vi.fn().mockResolvedValue(closeResult);
  const getDayView = vi.fn().mockResolvedValue(dayResult);
  const repository = { closeDay, getDayView } as unknown as PlanningRepository;
  const committed = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
  );
  const hook = renderHook(() => useCloseDay(committed), { wrapper });
  return { ...hook, closeDay, getDayView, committed };
}

describe('useCloseDay', () => {
  it('passes non-move dispositions and commits atomically', async () => {
    const context = setup();
    const dispositions = { [taskId]: { kind: 'cancel' as const } } as ValidClosureDraft;
    await act(() => context.result.current.close({ ...base, dispositions }));
    expect(context.getDayView).not.toHaveBeenCalled();
    expect(context.closeDay).toHaveBeenCalledWith({
      date: '2026-08-13',
      expectedDayRevision: 3,
      dispositions,
    });
    expect(context.committed).toHaveBeenCalledOnce();
    act(() => {
      context.result.current.clearError();
    });
    expect(context.result.current.error).toBeUndefined();
  });

  it('resolves a dated destination and appends after existing tasks', async () => {
    const target = localDate('2026-08-14');
    const context = setup(effect, {
      ok: true,
      value: { day: buildOpenDay({ date: target }), tasks: [{}, {}], habits: [], score: {} },
    });
    const dispositions = {
      [taskId]: { kind: 'move-to-date' as const, destinationDate: target, duration: 25 },
    } as unknown as ValidClosureDraft;
    let succeeded = false;
    await act(async () => {
      succeeded = await context.result.current.close({ ...base, dispositions });
    });
    expect(succeeded).toBe(true);
    expect(context.closeDay).toHaveBeenCalledWith({
      date: '2026-08-13',
      expectedDayRevision: 3,
      dispositions: {
        [taskId]: {
          kind: 'move-to-date',
          destinationDate: '2026-08-14',
          durationMinutes: 25,
          dayPosition: 2,
        },
      },
    });
  });

  it.each([
    { ok: false, error: { code: 'NotFound' } },
    {
      ok: true,
      value: {
        day: { ...buildOpenDay({ date: localDate('2026-08-14') }), status: 'closed' },
        tasks: [],
      },
    },
  ])('rejects an unavailable or closed destination before closing', async (dayResult) => {
    const context = setup(effect, dayResult);
    const dispositions = {
      [taskId]: {
        kind: 'move-to-date' as const,
        destinationDate: localDate('2026-08-14'),
        duration: 25,
      },
    } as unknown as ValidClosureDraft;
    let succeeded = true;
    await act(async () => {
      succeeded = await context.result.current.close({ ...base, dispositions });
    });
    expect(succeeded).toBe(false);
    expect(context.closeDay).not.toHaveBeenCalled();
    expect(context.result.current.error).toMatch(/закрыт|недоступен/i);
  });

  it.each([
    ['PendingHabitOutcomes', /привычки/i, 0],
    ['FutureDayClosure', /будущий день/i, 0],
    ['RevisionConflict', /не удалось закрыть/i, 1],
    ['ServerUnavailable', /не удалось закрыть/i, 0],
  ])('maps %s without false completion', async (code, message, reloads) => {
    const context = setup({ ok: false, error: { code } });
    const dispositions = { [taskId]: { kind: 'cancel' as const } } as ValidClosureDraft;
    let succeeded = true;
    await act(async () => {
      succeeded = await context.result.current.close({ ...base, dispositions });
    });
    expect(succeeded).toBe(false);
    expect(context.result.current.error).toMatch(message);
    expect(context.committed).toHaveBeenCalledTimes(reloads);
  });
});
