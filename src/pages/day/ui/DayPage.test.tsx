import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { TaskEditorDialog } from '@/features/manage-task';
import { localDate } from '@/shared/lib/local-date/local-date';
import { nonNegativeDurationMinutes } from '@/shared/lib/ids';
import {
  buildHabitOccurrence,
  buildIncompleteTaskOccurrence,
  buildOpenDay,
  buildOpenWeek,
  buildPlannedTaskEntry,
  buildScoreBreakdown,
} from '../../../../tests/fixtures/planning';

import { DayPage } from './DayPage';

afterEach(cleanup);

describe('DayPage', () => {
  it('renders ready tasks and habits and opens both creation controls', async () => {
    const user = userEvent.setup();
    const date = localDate('2026-05-20');
    const occurrence = buildIncompleteTaskOccurrence();
    const membership = buildPlannedTaskEntry();
    const day = buildOpenDay();
    const view = {
      day,
      tasks: [{ occurrence, membership, events: [] }],
      habits: [buildHabitOccurrence()],
      score: buildScoreBreakdown(),
      plannedLoadMinutes: nonNegativeDurationMinutes(45),
      unfinishedTaskIds: [occurrence.id],
    };
    const repository = {
      ensureCalendarWeek: vi
        .fn()
        .mockResolvedValue({ ok: true, value: date, affectedDates: [], affectedWeeks: [] }),
      prepareOpenPeriod: vi
        .fn()
        .mockResolvedValue({ ok: true, value: undefined, affectedDates: [], affectedWeeks: [] }),
      getDayView: vi.fn().mockResolvedValue({ ok: true, value: view }),
      getWeekView: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          week: buildOpenWeek(),
          days: [
            {
              date,
              status: 'open',
              score: buildScoreBreakdown(),
              plannedLoadMinutes: nonNegativeDurationMinutes(45),
            },
          ],
          progress: buildScoreBreakdown(),
        },
      }),
    } as unknown as PlanningRepository;
    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repository}>
          <DayPage date={date} />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );
    // The title also appears in the score panel's "Следом:" state hint.
    expect((await screen.findAllByText(occurrence.title, { exact: true }))[0]).toBeVisible();
    expect(document.querySelector('[data-od-id="day-score"]')).toHaveTextContent(
      new RegExp(`Следом:.*${occurrence.title}`, 's'),
    );
    expect(screen.getByText(/плановая нагрузка/i)).toBeVisible();
    expect(document.querySelector('[data-od-id="day-load"]')).toHaveTextContent(
      /45 мин.*в запланированных задачах/is,
    );
    expect(document.querySelector('[data-od-id="day-layout"]')).toBeVisible();
    expect(document.querySelector('[data-od-id="day-score"]')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Привычки' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Добавить привычку' }));
    expect(screen.getByRole('dialog', { name: /новая привычка/i })).toBeVisible();
  });

  it('offers task creation from the tasks card header', async () => {
    const user = userEvent.setup();
    const date = localDate('2026-05-20');
    const view = {
      day: buildOpenDay(),
      tasks: [],
      habits: [],
      score: buildScoreBreakdown(),
      plannedLoadMinutes: nonNegativeDurationMinutes(0),
      unfinishedTaskIds: [],
    };
    const repository = {
      ensureCalendarWeek: vi
        .fn()
        .mockResolvedValue({ ok: true, value: date, affectedDates: [], affectedWeeks: [] }),
      prepareOpenPeriod: vi
        .fn()
        .mockResolvedValue({ ok: true, value: undefined, affectedDates: [], affectedWeeks: [] }),
      getDayView: vi.fn().mockResolvedValue({ ok: true, value: view }),
      getWeekView: vi.fn().mockResolvedValue({
        ok: true,
        value: { week: buildOpenWeek(), days: [] },
      }),
    } as unknown as PlanningRepository;
    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repository}>
          <DayPage date={date} />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );

    const addTask = await screen.findByRole('button', { name: /добавить задачу/i });
    expect(document.querySelector('[data-od-id="day-tasks"]')).toContainElement(addTask);
    await user.click(addTask);
    expect(screen.getByRole('dialog', { name: /новая задача/i })).toBeVisible();
  });

  it('renders dated planning actions and factual load without capacity semantics', () => {
    const repository = {
      ensureCalendarWeek: () => new Promise(() => undefined),
    } as unknown as PlanningRepository;
    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repository}>
          <DayPage date={localDate('2026-05-20')} />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /день|сегодня/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/загружаем день/i);
    // Task creation now lives in the tasks card, so it appears only once loaded.
    expect(screen.queryByRole('button', { name: /добавить задачу/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/вместимость|перегруз|лимит нагрузки/i)).not.toBeInTheDocument();
  });

  it('shows a recoverable storage error and retries preparation', async () => {
    const user = userEvent.setup();
    const ensureCalendarWeek = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'StorageUnavailable', message: 'offline' },
    });
    const repository = { ensureCalendarWeek } as unknown as PlanningRepository;
    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repository}>
          <DayPage date={localDate('2026-05-20')} />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/подготовить день/i);
    await user.click(screen.getByRole('button', { name: /повторить/i }));
    await waitFor(() => {
      expect(ensureCalendarWeek).toHaveBeenCalledTimes(2);
    });
  });

  it('requires a positive integer duration and preserves the invalid draft', async () => {
    const user = userEvent.setup();
    const onSubmitDated = vi.fn().mockResolvedValue(true);
    render(
      <TaskEditorDialog
        open
        date={localDate('2026-05-20')}
        onClose={vi.fn()}
        onSubmitDated={onSubmitDated}
      />,
    );
    const title = screen.getByLabelText(/название задачи/i);
    const duration = screen.getByLabelText(/длительность/i);
    await user.type(title, 'Обзор плана');
    await user.type(duration, '0');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/больше нуля/i);
    expect(title).toHaveValue('Обзор плана');
    expect(duration).toHaveValue(0);
    expect(onSubmitDated).not.toHaveBeenCalled();
  });
});
