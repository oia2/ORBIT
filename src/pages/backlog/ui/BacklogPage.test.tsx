import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createOneOffTask,
  PlanningRepositoryProvider,
  type PlanningRepository,
} from '@/entities/planning';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { creationSequence, entityId } from '@/shared/lib/ids';

import { BacklogPage } from './BacklogPage';

afterEach(cleanup);

function backlogTask(sequence: number, title: string) {
  const result = createOneOffTask({
    id: entityId<'task-occurrence'>(`123e4567-e89b-42d3-a456-42661417400${String(sequence)}`),
    title,
    placement: { kind: 'backlog' },
    createdSequence: creationSequence(sequence),
    createdAt: instant('2026-05-20T08:00:00.000Z'),
  });
  if (!result.ok) throw new Error('fixture failed');
  return result.value.occurrence;
}

describe('BacklogPage', () => {
  it('renders oldest-first edit/delete/schedule actions without dated-task controls', async () => {
    const repository = {
      getBacklogView: vi.fn().mockResolvedValue({
        ok: true,
        value: { tasks: [backlogTask(1, 'Сначала'), backlogTask(2, 'Потом')] },
      }),
    } as unknown as PlanningRepository;
    render(
      <PlanningRepositoryProvider repository={repository}>
        <BacklogPage />
      </PlanningRepositoryProvider>,
    );

    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Сначала');
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Потом');
    expect(screen.getAllByRole('button', { name: /редактировать/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /запланировать/i })).toHaveLength(2);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /сортировать|фильтр|отменить/i }),
    ).not.toBeInTheDocument();
  });

  it('shows first-use empty and recoverable storage states', async () => {
    const user = userEvent.setup();
    const getBacklogView = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'StorageUnavailable', message: 'offline' },
      })
      .mockResolvedValue({ ok: true, value: { tasks: [] } });
    const repository = { getBacklogView } as unknown as PlanningRepository;
    render(
      <PlanningRepositoryProvider repository={repository}>
        <BacklogPage />
      </PlanningRepositoryProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/не удалось загрузить/i);
    await user.click(screen.getByRole('button', { name: /повторить/i }));
    expect(await screen.findByText(/бэклог пуст/i)).toBeVisible();
    expect(getBacklogView).toHaveBeenCalledTimes(2);
  });

  it('announces quota failure without claiming the write was saved', async () => {
    const repository = {
      getBacklogView: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'QuotaExceeded', message: 'full' },
      }),
    } as unknown as PlanningRepository;
    render(
      <PlanningRepositoryProvider repository={repository}>
        <BacklogPage />
      </PlanningRepositoryProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/переполнено.*не сохранены/i);
    expect(screen.queryByText(/успешно|сохранено/i)).not.toBeInTheDocument();
  });

  it('prepares the current week and offers only its open scheduling dates', async () => {
    const currentDate = localDate('2026-05-20');
    const prepareOpenPeriod = vi.fn().mockResolvedValue({
      ok: true,
      value: undefined,
      affectedDates: [],
      affectedWeeks: [],
    });
    const repository = {
      ensureCalendarWeek: vi.fn().mockResolvedValue({
        ok: true,
        value: localDate('2026-05-18'),
        affectedDates: [],
        affectedWeeks: [],
      }),
      prepareOpenPeriod,
      getBacklogView: vi.fn().mockResolvedValue({
        ok: true,
        value: { tasks: [backlogTask(1, 'Входящая')] },
      }),
      getWeekView: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          week: { status: 'open', startDate: localDate('2026-05-18'), goals: [], revision: 0 },
          days: [
            { date: currentDate, status: 'open' },
            { date: localDate('2026-05-21'), status: 'closed' },
          ],
          progress: {},
        },
      }),
    } as unknown as PlanningRepository;
    const user = userEvent.setup();
    render(
      <PlanningRepositoryProvider repository={repository}>
        <BacklogPage currentDate={currentDate} />
      </PlanningRepositoryProvider>,
    );
    await user.click(await screen.findByRole('button', { name: /запланировать/i }));
    expect(screen.getByRole('option', { name: '2026-05-20' })).toBeVisible();
    expect(screen.queryByRole('option', { name: '2026-05-21' })).not.toBeInTheDocument();
    expect(prepareOpenPeriod).toHaveBeenCalledOnce();
  });
});
