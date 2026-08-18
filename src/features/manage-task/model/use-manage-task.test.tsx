import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { entityId, revision } from '@/shared/lib/ids';
import { localDate } from '@/shared/lib/local-date/local-date';

import { useManageTask } from './use-manage-task';

afterEach(cleanup);

const date = localDate('2026-05-20');
const destinationDate = localDate('2026-05-21');
const occurrenceId = entityId<'task-occurrence'>('123e4567-e89b-42d3-a456-426614174001');
const seriesId = entityId<'task-series'>('123e4567-e89b-42d3-a456-426614174002');
const success = (value?: unknown) => ({
  ok: true as const,
  value,
  affectedDates: [date],
  affectedWeeks: [localDate('2026-05-18')],
});

function setup(overrides: Partial<PlanningRepository> = {}) {
  const createTaskSeries = vi.fn().mockResolvedValue(success(seriesId));
  const repository = {
    createTask: vi.fn().mockResolvedValue(success(occurrenceId)),
    reorderDatedTasks: vi.fn().mockResolvedValue(success()),
    setTaskCompletion: vi.fn().mockResolvedValue(success()),
    editTaskOccurrence: vi.fn().mockResolvedValue(success()),
    deleteTaskOccurrence: vi.fn().mockResolvedValue(success()),
    moveTaskToBacklog: vi.fn().mockResolvedValue(success()),
    moveTaskToDate: vi.fn().mockResolvedValue(success()),
    createTaskSeries,
    updateTaskSeriesRule: vi.fn().mockResolvedValue(success()),
    stopTaskSeries: vi.fn().mockResolvedValue(success()),
    ...overrides,
  } as unknown as PlanningRepository;
  const onCommitted = vi.fn().mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PlanningRepositoryProvider repository={repository}>{children}</PlanningRepositoryProvider>
  );
  return { repository, createTaskSeries, onCommitted, wrapper };
}

describe('useManageTask', () => {
  it('orchestrates every ordinary task command and commit receipt', async () => {
    const context = setup();
    const { result } = renderHook(() => useManageTask(context.onCommitted), {
      wrapper: context.wrapper,
    });
    await act(async () => {
      expect(
        await result.current.createDated({ date, title: 'Dated', duration: 30, position: 0 }),
      ).toBe(true);
      expect(await result.current.createBacklog('Backlog')).toBe(true);
      expect(await result.current.reorderDated(date, [occurrenceId], revision(0))).toBe(true);
      expect(
        await result.current.toggleCompletion({
          occurrenceId,
          date,
          completed: true,
          revision: revision(0),
        }),
      ).toBe(true);
      expect(
        await result.current.edit({
          occurrenceId,
          title: 'Edited',
          duration: 45,
          revision: revision(1),
        }),
      ).toBe(true);
      expect(await result.current.moveToBacklog(occurrenceId, revision(2))).toBe(true);
      expect(
        await result.current.moveToDate({
          occurrenceId,
          destinationDate,
          duration: 45,
          position: 0,
          revision: revision(3),
        }),
      ).toBe(true);
      expect(await result.current.remove(occurrenceId, revision(4))).toBe(true);
    });
    expect(context.onCommitted).toHaveBeenCalledTimes(8);
    expect(result.current.error).toBeUndefined();
  });

  it('creates, updates, and stops a recurring task with positive duration', async () => {
    const context = setup();
    const { result } = renderHook(() => useManageTask(context.onCommitted), {
      wrapper: context.wrapper,
    });
    const rule = { startDate: date, weekdays: [3] as const };
    await act(async () => {
      expect(await result.current.createSeries({ title: 'Recurring', duration: 0, rule })).toBe(
        false,
      );
      expect(await result.current.createSeries({ title: 'Recurring', duration: 25, rule })).toBe(
        true,
      );
      expect(await result.current.updateSeries({ seriesId, rule, revision: revision(0) })).toBe(
        true,
      );
      expect(await result.current.stopSeries(seriesId, revision(1))).toBe(true);
    });
    expect(context.createTaskSeries).toHaveBeenCalledWith({
      template: { title: 'Recurring', plannedDurationMinutes: 25 },
      recurrenceRule: rule,
    });
    expect(context.onCommitted).toHaveBeenCalledTimes(3);
  });

  it('preserves validation failures and refreshes after a revision conflict', async () => {
    const conflict = {
      ok: false as const,
      error: {
        code: 'RevisionConflict' as const,
        expectedRevision: revision(0),
        actualRevision: revision(1),
      },
    };
    const context = setup({ moveTaskToBacklog: vi.fn().mockResolvedValue(conflict) });
    const { result } = renderHook(() => useManageTask(context.onCommitted), {
      wrapper: context.wrapper,
    });
    await act(async () => {
      expect(
        await result.current.createDated({ date, title: 'Bad', duration: 0, position: 0 }),
      ).toBe(false);
    });
    expect(result.current.error).toMatch(/больше нуля/i);
    await act(async () => {
      result.current.clearError();
      expect(await result.current.moveToBacklog(occurrenceId, revision(0))).toBe(false);
    });
    expect(context.onCommitted).toHaveBeenCalledOnce();
    expect(result.current.error).toMatch(/переместить/i);
  });

  it('reports failed command families without a false commit', async () => {
    const failure = {
      ok: false as const,
      error: { code: 'UnexpectedServerFailure' as const, message: 'failed' },
    };
    const context = setup({
      createTask: vi.fn().mockResolvedValue(failure),
      reorderDatedTasks: vi.fn().mockResolvedValue(failure),
      setTaskCompletion: vi.fn().mockResolvedValue(failure),
      editTaskOccurrence: vi.fn().mockResolvedValue(failure),
      deleteTaskOccurrence: vi.fn().mockResolvedValue(failure),
      moveTaskToDate: vi.fn().mockResolvedValue(failure),
    });
    const { result } = renderHook(() => useManageTask(context.onCommitted), {
      wrapper: context.wrapper,
    });
    await act(async () => {
      expect(
        await result.current.createDated({ date, title: 'Dated', duration: 30, position: 0 }),
      ).toBe(false);
      expect(await result.current.createBacklog('Backlog')).toBe(false);
      expect(await result.current.reorderDated(date, [occurrenceId], revision(0))).toBe(false);
      expect(
        await result.current.toggleCompletion({
          occurrenceId,
          date,
          completed: true,
          revision: revision(0),
        }),
      ).toBe(false);
      expect(
        await result.current.edit({
          occurrenceId,
          title: 'Edited',
          duration: 30,
          revision: revision(0),
        }),
      ).toBe(false);
      expect(await result.current.remove(occurrenceId, revision(0))).toBe(false);
      expect(
        await result.current.moveToDate({
          occurrenceId,
          destinationDate,
          duration: 30,
          position: 0,
          revision: revision(0),
        }),
      ).toBe(false);
    });
    expect(context.onCommitted).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/переместить/i);
  });
});
