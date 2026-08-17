import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { creationSequence, entityId } from '@/shared/lib/ids';

import { createOneOffTask } from '@/entities/planning';
import { TaskExecution } from './TaskExecution';

afterEach(cleanup);

function taskProjection(completed = false) {
  const result = createOneOffTask({
    id: entityId<'task-occurrence'>('123e4567-e89b-42d3-a456-426614174001'),
    planEntryId: entityId<'task-plan-entry'>('123e4567-e89b-42d3-a456-426614175001'),
    title: 'Сверить план',
    placement: { kind: 'day', date: localDate('2026-05-20') },
    plannedDurationMinutes: 30,
    dayPosition: 0,
    createdSequence: creationSequence(1),
    createdAt: instant('2026-05-20T08:00:00.000Z'),
  });
  if (!result.ok) throw new Error('fixture failed');
  const occurrence = completed
    ? {
        ...result.value.occurrence,
        completion: 'completed' as const,
        actualCompletedAt: instant('2026-05-20T09:00:00.000Z'),
      }
    : result.value.occurrence;
  const membership = result.value.planEntries[0];
  if (membership === undefined) throw new Error('membership fixture failed');
  return { occurrence, membership, events: [] };
}

describe('TaskExecution', () => {
  it('supports reversible completion and explains why a checked task cannot move', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn().mockResolvedValue(true);
    render(
      <TaskExecution
        task={taskProjection(true)}
        availableMoveDates={[localDate('2026-05-21')]}
        onToggle={onToggle}
        onEdit={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn().mockResolvedValue(true)}
        onMoveToBacklog={vi.fn().mockResolvedValue(true)}
        onMoveToDate={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(screen.getByLabelText(/действия с задачей/i));
    expect(screen.getByRole('button', { name: /переместить на дату/i })).toBeDisabled();
    expect(screen.getByText(/сначала снимите отметку/i)).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: /выполнено/i }));
    expect(onToggle).toHaveBeenCalledWith(false);
    await user.click(screen.getByLabelText(/действия с задачей/i));
    expect(screen.getByRole('button', { name: /редактировать/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /удалить/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /отменить задачу/i })).not.toBeInTheDocument();
  });

  it('keeps an invalid move draft visible and excludes the current date', async () => {
    const user = userEvent.setup();
    render(
      <TaskExecution
        task={taskProjection()}
        availableMoveDates={[localDate('2026-05-20'), localDate('2026-05-21')]}
        onToggle={vi.fn().mockResolvedValue(true)}
        onEdit={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn().mockResolvedValue(true)}
        onMoveToBacklog={vi.fn().mockResolvedValue(true)}
        onMoveToDate={vi.fn().mockResolvedValue(true)}
      />,
    );
    await user.click(screen.getByLabelText(/действия с задачей/i));
    await user.click(screen.getByRole('button', { name: /переместить на дату/i }));
    const date = screen.getByLabelText(/дата назначения/i);
    const duration = screen.getByLabelText(/длительность/i);
    expect(screen.queryByRole('option', { name: '2026-05-20' })).not.toBeInTheDocument();
    await user.selectOptions(date, '2026-05-21');
    await user.clear(duration);
    await user.type(duration, '0');
    await user.click(screen.getByRole('button', { name: /^переместить$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/больше нуля/i);
    expect(date).toHaveValue('2026-05-21');
    expect(duration).toHaveValue(0);
  });

  it('disables every mutation for immutable facts and restores dialog focus', async () => {
    const user = userEvent.setup();
    const callbacks = {
      onToggle: vi.fn().mockResolvedValue(true),
      onEdit: vi.fn().mockResolvedValue(true),
      onDelete: vi.fn().mockResolvedValue(true),
      onMoveToBacklog: vi.fn().mockResolvedValue(true),
      onMoveToDate: vi.fn().mockResolvedValue(true),
    };
    const { rerender } = render(
      <TaskExecution
        task={taskProjection()}
        availableMoveDates={[localDate('2026-05-21')]}
        {...callbacks}
      />,
    );
    const menuTrigger = screen.getByLabelText(/действия с задачей/i);
    await user.click(menuTrigger);
    await user.click(screen.getByRole('button', { name: /переместить на дату/i }));
    await user.click(screen.getByRole('button', { name: /отмена/i }));
    // Opening a dialog closes the menu, so focus returns to its trigger.
    expect(menuTrigger).toHaveFocus();

    rerender(
      <TaskExecution
        immutable
        task={taskProjection()}
        availableMoveDates={[localDate('2026-05-21')]}
        {...callbacks}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByLabelText(/действия с задачей/i)).not.toBeInTheDocument();
  });

  it('commits edit, dated move, backlog, and delete actions', async () => {
    const user = userEvent.setup();
    const callbacks = {
      onToggle: vi.fn().mockResolvedValue(true),
      onEdit: vi.fn().mockResolvedValue(true),
      onDelete: vi.fn().mockResolvedValue(true),
      onMoveToBacklog: vi.fn().mockResolvedValue(true),
      onMoveToDate: vi.fn().mockResolvedValue(true),
    };
    render(
      <TaskExecution
        task={taskProjection()}
        availableMoveDates={[localDate('2026-05-21')]}
        {...callbacks}
      />,
    );
    await user.click(screen.getByLabelText(/действия с задачей/i));
    await user.click(screen.getByRole('button', { name: /^редактировать$/i }));
    await user.clear(screen.getByLabelText(/название задачи/i));
    await user.type(screen.getByLabelText(/название задачи/i), 'Новая формулировка');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    expect(callbacks.onEdit).toHaveBeenCalledWith({
      title: 'Новая формулировка',
      duration: 30,
      startTime: null,
      endTime: null,
    });

    await user.click(screen.getByLabelText(/действия с задачей/i));
    await user.click(screen.getByRole('button', { name: /переместить на дату/i }));
    await user.selectOptions(screen.getByLabelText(/дата назначения/i), '2026-05-21');
    await user.click(screen.getByRole('button', { name: /^переместить$/i }));
    expect(callbacks.onMoveToDate).toHaveBeenCalledWith({
      destinationDate: '2026-05-21',
      duration: 30,
    });
    await user.click(screen.getByLabelText(/действия с задачей/i));
    await user.click(screen.getByRole('button', { name: /в бэклог/i }));
    await user.click(screen.getByLabelText(/действия с задачей/i));
    await user.click(screen.getByRole('button', { name: /^удалить$/i }));
    expect(callbacks.onMoveToBacklog).toHaveBeenCalledOnce();
    expect(callbacks.onDelete).toHaveBeenCalledOnce();
  });

  it('keeps completion direct and consolidates reorder with secondary actions', async () => {
    const user = userEvent.setup();
    const onMoveUp = vi.fn();
    render(
      <TaskExecution
        task={taskProjection()}
        availableMoveDates={[localDate('2026-05-21')]}
        canMoveUp
        onMoveUp={onMoveUp}
        onToggle={vi.fn().mockResolvedValue(true)}
        onEdit={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn().mockResolvedValue(true)}
        onMoveToBacklog={vi.fn().mockResolvedValue(true)}
        onMoveToDate={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByRole('checkbox', { name: /выполнено/i })).toBeVisible();
    const disclosure = screen.getByLabelText(/действия с задачей/i);
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await user.click(disclosure);
    await user.click(screen.getByRole('button', { name: /переместить вверх/i }));
    expect(onMoveUp).toHaveBeenCalledOnce();
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  });
});
