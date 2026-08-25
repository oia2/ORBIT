import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PlanningRepositoryProvider,
  type DayView,
  type PlanningRepository,
} from '@/entities/planning';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate, type LocalDate } from '@/shared/lib/local-date/local-date';
import { nonNegativeDurationMinutes } from '@/shared/lib/ids';
import {
  buildClosedDay,
  buildCompletedTaskOccurrence,
  buildDailyState,
  buildHabitOccurrence,
  buildOpenDay,
  buildOpenWeek,
  buildPlannedTaskEntry,
  buildScoreBreakdown,
  buildUnavailableScoreBreakdown,
} from '../../../../tests/fixtures/planning';

import { DayPage } from './DayPage';

afterEach(cleanup);

function repositoryFor(date: LocalDate, view: DayView): PlanningRepository {
  return {
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
            status: view.day.status,
            score: view.score,
            plannedLoadMinutes: view.plannedLoadMinutes,
          },
        ],
        progress: view.score,
      },
    }),
  } as unknown as PlanningRepository;
}

describe('DayPage presentation branches', () => {
  it('renders a future empty plan and still permits task creation without permitting closure', async () => {
    const user = userEvent.setup();
    const today = localDate('2026-05-20');
    const date = localDate('2026-05-21');
    const score = buildUnavailableScoreBreakdown();
    const view: DayView = {
      day: buildOpenDay({ date }),
      tasks: [],
      habits: [],
      score,
      plannedLoadMinutes: nonNegativeDurationMinutes(0),
      habitDefinitions: [],
      taskSeries: [],
      unfinishedTaskIds: [],
    };

    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repositoryFor(date, view)}>
          <DayPage
            date={date}
            clock={createFixedClock({
              instant: instant('2026-05-20T08:00:00.000Z'),
              currentLocalDate: today,
            })}
          />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'День', level: 1 })).toBeVisible();
    expect(screen.getByText('В плане пока нет задач.')).toBeVisible();
    expect(screen.getByText('На этот день задач нет')).toBeVisible();
    expect(screen.getByText('На сегодня привычек нет')).toBeVisible();
    expect(screen.getByText('Будущий день пока нельзя закрыть.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Закрыть день' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Добавить задачу' }));
    expect(screen.getByRole('dialog', { name: 'Новая задача' })).toBeVisible();
  });

  it('renders populated closed-day facts and makes task, habit, and state controls immutable', async () => {
    const date = localDate('2026-05-20');
    const score = buildScoreBreakdown();
    const occurrence = buildCompletedTaskOccurrence();
    const view: DayView = {
      day: buildClosedDay({
        state: buildDailyState(),
        closureSnapshot: {
          score,
          plannedLoadMinutes: nonNegativeDurationMinutes(45),
        },
      }),
      tasks: [
        {
          occurrence,
          membership: { ...buildPlannedTaskEntry(), outcome: 'completed' },
          events: [],
        },
      ],
      habits: [buildHabitOccurrence({ outcome: 'completed' })],
      score,
      plannedLoadMinutes: nonNegativeDurationMinutes(45),
      habitDefinitions: [],
      taskSeries: [],
      unfinishedTaskIds: [],
    };

    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repositoryFor(date, view)}>
          <DayPage
            date={date}
            clock={createFixedClock({
              instant: instant('2026-05-20T08:00:00.000Z'),
              currentLocalDate: date,
            })}
          />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(occurrence.title, { exact: true })).toBeVisible();
    // 003 FR-009: a closed day is no longer a dead end — it offers reopening.
    expect(screen.getByText(/Результат и плановая нагрузка зафиксированы/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Открыть день заново' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Закрыть день' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Добавить задачу' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Добавить привычку' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: `Выполнено: ${occurrence.title}` })).toBeDisabled();
    expect(
      screen.queryByLabelText(`Действия с задачей «${occurrence.title}»`),
    ).not.toBeInTheDocument();
    expect(screen.getByText('День закрыт — результат сохранён.')).toBeVisible();
    expect(screen.getByText('Энергия: 3')).toBeVisible();
    expect(screen.getByText('Настроение: 4')).toBeVisible();
    expect(screen.getByText('Сон: 7,5 ч')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Сохранить состояние' })).not.toBeInTheDocument();
  });
});

/*
 * 003 US3 (FR-009, FR-013, FR-014). The action itself is thin — its value is in
 * saying what it will and will not undo before the owner commits, and in
 * explaining a refusal instead of leaving a control that does nothing.
 */
describe('003 US3: reopening a closed day from the Day page', () => {
  const date = localDate('2026-05-20');
  const today = localDate('2026-05-21');

  function closedView(): DayView {
    return {
      day: buildClosedDay({ date }),
      tasks: [],
      habits: [],
      score: buildScoreBreakdown(),
      plannedLoadMinutes: nonNegativeDurationMinutes(30),
      habitDefinitions: [],
      taskSeries: [],
      unfinishedTaskIds: [],
    };
  }

  function renderClosedDay(repository: PlanningRepository) {
    return render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repository}>
          <DayPage
            date={date}
            clock={createFixedClock({
              instant: instant('2026-05-21T08:00:00.000Z'),
              currentLocalDate: today,
            })}
          />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );
  }

  it('offers reopening on a closed day and states what it will not undo (FR-009, FR-012)', async () => {
    const user = userEvent.setup();
    const repository = repositoryFor(date, closedView());
    renderClosedDay(repository);

    await user.click(await screen.findByRole('button', { name: 'Открыть день заново' }));

    const dialog = screen.getByRole('dialog', { name: /открыть день заново/i });
    expect(dialog).toBeVisible();
    // D1 is a product decision the owner has to be able to predict.
    expect(dialog).toHaveTextContent(/останутся там же/i);
  });

  it('commits the reopening with the day revision the page is holding', async () => {
    const user = userEvent.setup();
    const repository = repositoryFor(date, closedView());
    const reopenDay = vi
      .fn()
      .mockResolvedValue({ ok: true, value: undefined, affectedDates: [], affectedWeeks: [] });
    Object.assign(repository, { reopenDay });

    renderClosedDay(repository);
    await user.click(await screen.findByRole('button', { name: 'Открыть день заново' }));
    await user.click(screen.getByRole('button', { name: 'Открыть день' }));

    expect(reopenDay).toHaveBeenCalledWith({
      date,
      expectedDayRevision: closedView().day.revision,
    });
  });

  it('states why a day in a completed week cannot be reopened (FR-014)', async () => {
    const user = userEvent.setup();
    const repository = repositoryFor(date, closedView());
    Object.assign(repository, {
      reopenDay: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'PeriodImmutable', weekStart: localDate('2026-05-18') },
      }),
    });

    renderClosedDay(repository);
    await user.click(await screen.findByRole('button', { name: 'Открыть день заново' }));
    await user.click(screen.getByRole('button', { name: 'Открыть день' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/неделя уже завершена/i);
  });

  it('does not offer reopening on a day that is still open', async () => {
    const repository = repositoryFor(date, {
      day: buildOpenDay({ date }),
      tasks: [],
      habits: [],
      score: buildUnavailableScoreBreakdown(),
      plannedLoadMinutes: nonNegativeDurationMinutes(0),
      habitDefinitions: [],
      taskSeries: [],
      unfinishedTaskIds: [],
    });

    renderClosedDay(repository);

    expect(await screen.findByRole('button', { name: 'Закрыть день' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Открыть день заново' })).toBeNull();
  });
});
