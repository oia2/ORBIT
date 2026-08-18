import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { WeekEditorDialog } from '@/features/manage-week';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import { entityId, nonNegativeDurationMinutes, revision } from '@/shared/lib/ids';
import {
  buildHabitOccurrence,
  buildClosedDay,
  buildCompletedWeek,
  buildIncompleteTaskOccurrence,
  buildOpenDay,
  buildOpenWeek,
  buildPlannedTaskEntry,
  buildScoreBreakdown,
  buildUnavailableScoreBreakdown,
} from '../../../../tests/fixtures/planning';

import { WeekPage } from './WeekPage';

afterEach(cleanup);

describe('WeekPage', () => {
  it('renders a ready recurring task and opens series creation and update dialogs', async () => {
    const user = userEvent.setup();
    const weekStart = localDate('2026-05-18');
    const date = localDate('2026-05-20');
    const occurrence = buildIncompleteTaskOccurrence({
      seriesId: entityId<'task-series'>('123e4567-e89b-42d3-a456-426614174201'),
      nominalDate: date,
      ruleRevision: revision(0),
    });
    const otherDate = localDate('2026-05-21');
    const otherOccurrence = buildIncompleteTaskOccurrence({
      id: entityId<'task-occurrence'>('123e4567-e89b-42d3-a456-426614174202'),
      title: 'Задача другого дня',
      placement: { kind: 'day', date: otherDate },
    });
    const score = buildScoreBreakdown();
    const otherScore = buildScoreBreakdown({
      task: { completed: 0, applicable: 1, rate: 0 },
      habit: { completed: 0, applicable: 0, rate: 'unavailable' },
      value: 0,
      weightsApplied: { task: 100, habit: 0 },
    });
    const dayView = {
      day: buildOpenDay(),
      tasks: [{ occurrence, membership: buildPlannedTaskEntry(), events: [] }],
      habits: [buildHabitOccurrence()],
      score,
      plannedLoadMinutes: nonNegativeDurationMinutes(45),
      unfinishedTaskIds: [occurrence.id],
    };
    const otherDayView = {
      day: buildOpenDay({ date: otherDate }),
      tasks: [
        {
          occurrence: otherOccurrence,
          membership: buildPlannedTaskEntry({
            occurrenceId: otherOccurrence.id,
            date: otherDate,
          }),
          events: [],
        },
      ],
      habits: [],
      score: otherScore,
      plannedLoadMinutes: nonNegativeDurationMinutes(45),
      unfinishedTaskIds: [otherOccurrence.id],
    };
    const weekView = {
      week: buildOpenWeek(),
      days: [
        {
          date,
          status: 'open' as const,
          score,
          plannedLoadMinutes: nonNegativeDurationMinutes(45),
        },
        {
          date: otherDate,
          status: 'open' as const,
          score: otherScore,
          plannedLoadMinutes: nonNegativeDurationMinutes(45),
        },
      ],
      progress: buildUnavailableScoreBreakdown(),
    };
    const repository = {
      ensureCalendarWeek: vi
        .fn()
        .mockResolvedValue({ ok: true, value: weekStart, affectedDates: [], affectedWeeks: [] }),
      prepareOpenPeriod: vi
        .fn()
        .mockResolvedValue({ ok: true, value: undefined, affectedDates: [], affectedWeeks: [] }),
      getWeekView: vi.fn().mockResolvedValue({ ok: true, value: weekView }),
      getDayView: vi.fn().mockImplementation((requestedDate: typeof date) =>
        Promise.resolve({
          ok: true,
          value: requestedDate === date ? dayView : otherDayView,
        }),
      ),
    } as unknown as PlanningRepository;
    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repository}>
          <WeekPage
            weekStart={weekStart}
            clock={createFixedClock({
              instant: instant('2026-05-20T08:00:00.000Z'),
              currentLocalDate: date,
            })}
          />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );
    const recurringTask = await screen.findByText(occurrence.title, { exact: true });
    expect(recurringTask).toBeVisible();
    expect(recurringTask.closest('details')).toHaveAttribute('open');
    const otherTask = screen.getByText(otherOccurrence.title, { exact: true });
    expect(otherTask.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('figure', { name: 'Прогресс недели' })).toHaveTextContent('50%');
    await user.click(screen.getByRole('button', { name: 'Добавить повтор задачи' }));
    expect(screen.getByRole('dialog', { name: /новая повторяющаяся задача/i })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /отмена/i }));
    const taskRow = recurringTask.closest('li');
    if (taskRow === null) throw new Error('Expected recurring task row');
    await user.click(within(taskRow).getByLabelText(/действия с задачей/i));
    await user.click(screen.getByRole('button', { name: 'Изменить повтор' }));
    expect(screen.getByRole('dialog', { name: /изменить повтор задачи/i })).toBeVisible();
  });

  it('keeps completed Weekly Progress frozen even when current day projections differ', async () => {
    const weekStart = localDate('2026-05-18');
    const date = localDate('2026-05-20');
    const liveScore = buildScoreBreakdown();
    const frozenProgress = buildScoreBreakdown({
      task: { completed: 1, applicable: 1, rate: 1 },
      habit: { completed: 0, applicable: 0, rate: 'unavailable' },
      value: 100,
      weightsApplied: { task: 100, habit: 0 },
    });
    const dayView = {
      day: buildClosedDay({
        closureSnapshot: {
          score: liveScore,
          plannedLoadMinutes: nonNegativeDurationMinutes(45),
        },
      }),
      tasks: [],
      habits: [],
      score: liveScore,
      plannedLoadMinutes: nonNegativeDurationMinutes(45),
      unfinishedTaskIds: [],
    };
    const repository = {
      ensureCalendarWeek: vi
        .fn()
        .mockResolvedValue({ ok: true, value: weekStart, affectedDates: [], affectedWeeks: [] }),
      prepareOpenPeriod: vi
        .fn()
        .mockResolvedValue({ ok: true, value: undefined, affectedDates: [], affectedWeeks: [] }),
      getWeekView: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          week: buildCompletedWeek({ completionSnapshot: { progress: frozenProgress } }),
          days: [
            {
              date,
              status: 'closed' as const,
              score: liveScore,
              plannedLoadMinutes: nonNegativeDurationMinutes(45),
            },
          ],
          progress: buildUnavailableScoreBreakdown(),
        },
      }),
      getDayView: vi.fn().mockResolvedValue({ ok: true, value: dayView }),
    } as unknown as PlanningRepository;

    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repository}>
          <WeekPage weekStart={weekStart} />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('figure', { name: 'Прогресс недели' })).toHaveTextContent(
      '100%',
    );
  });
  it('exposes the fixed week, free-form goals, factual load, and no prohibited controls', () => {
    const repository = {
      ensureCalendarWeek: () => new Promise(() => undefined),
    } as unknown as PlanningRepository;
    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repository}>
          <WeekPage weekStart={localDate('2026-05-18')} />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /неделя/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/загружаем неделю/i);
    expect(screen.getByRole('link', { name: /предыдущая неделя/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /следующая неделя/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/измеримост|прогресс цели|вместимость|перегруз/i),
    ).not.toBeInTheDocument();
  });

  it('shows a recoverable storage error and retries preparation', async () => {
    const user = userEvent.setup();
    const ensureCalendarWeek = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'ServerUnavailable', message: 'offline' },
    });
    const repository = { ensureCalendarWeek } as unknown as PlanningRepository;
    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repository}>
          <WeekPage weekStart={localDate('2026-05-18')} />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/подготовить неделю/i);
    await user.click(screen.getByRole('button', { name: /повторить/i }));
    await waitFor(() => {
      expect(ensureCalendarWeek).toHaveBeenCalledTimes(2);
    });
  });

  it('rejects whitespace-only goals while preserving submitted internal content', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<WeekEditorDialog open onClose={vi.fn()} onSubmit={onSubmit} />);
    const field = screen.getByRole('textbox', { name: /цель недели/i });

    await user.type(field, '   ');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/введите цель недели/i);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, '  Подготовить   обзор  ');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    expect(onSubmit).toHaveBeenCalledWith('  Подготовить   обзор  ');
  });
});
