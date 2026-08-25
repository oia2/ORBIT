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
  buildCompletedWeek,
  buildOpenDay,
  buildOpenWeek,
  buildUnavailableScoreBreakdown,
} from '../../../../tests/fixtures/planning';

import { WeekPage } from './WeekPage';

afterEach(cleanup);

type FixtureWeek = ReturnType<typeof buildOpenWeek> | ReturnType<typeof buildCompletedWeek>;

function repositoryFor(
  weekStart: LocalDate,
  week: FixtureWeek,
  dayViews: readonly DayView[],
): PlanningRepository {
  return {
    ensureCalendarWeek: vi
      .fn()
      .mockResolvedValue({ ok: true, value: weekStart, affectedDates: [], affectedWeeks: [] }),
    prepareOpenPeriod: vi
      .fn()
      .mockResolvedValue({ ok: true, value: undefined, affectedDates: [], affectedWeeks: [] }),
    getWeekView: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        week,
        days: dayViews.map((view) => ({
          date: view.day.date,
          status: view.day.status,
          score: view.score,
          plannedLoadMinutes: view.plannedLoadMinutes,
        })),
        progress: buildUnavailableScoreBreakdown(),
      },
    }),
    getDayView: vi.fn().mockImplementation((date: LocalDate) =>
      Promise.resolve({
        ok: true,
        value: dayViews.find((view) => view.day.date === date) ?? dayViews[0],
      }),
    ),
  } as unknown as PlanningRepository;
}

function fixedClock(date: LocalDate) {
  return createFixedClock({
    instant: instant('2026-05-20T08:00:00.000Z'),
    currentLocalDate: date,
  });
}

describe('WeekPage presentation branches', () => {
  it('renders the open empty composition and exposes goal and dated-task creation', async () => {
    const user = userEvent.setup();
    const weekStart = localDate('2026-05-18');
    const date = localDate('2026-05-20');
    const score = buildUnavailableScoreBreakdown();
    const dayView: DayView = {
      day: buildOpenDay(),
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
        <PlanningRepositoryProvider
          repository={repositoryFor(weekStart, buildOpenWeek({ goals: [] }), [dayView])}
        >
          <WeekPage weekStart={weekStart} clock={fixedClock(date)} />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Целей пока нет')).toBeVisible();
    expect(screen.getByText('Привычек на этой неделе нет')).toBeVisible();
    expect(screen.getByText('На этот день задач пока нет.')).toBeVisible();
    expect(screen.getByRole('figure', { name: 'Прогресс недели' })).toHaveTextContent('Недоступен');
    expect(
      screen.getByRole('progressbar', { name: 'Выполнение задач недели' }),
    ).toHaveAccessibleName('Выполнение задач недели');
    expect(screen.getByRole('button', { name: 'Завершить неделю' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Добавить цель' }));
    expect(screen.getByRole('dialog', { name: 'Новая цель недели' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await user.click(screen.getByRole('button', { name: 'Добавить задачу' }));
    expect(screen.getByRole('dialog', { name: 'Новая задача' })).toBeVisible();
  });

  it('renders a completed week as a read-only review with its frozen reflection', async () => {
    const user = userEvent.setup();
    const weekStart = localDate('2026-05-18');
    const date = localDate('2026-05-20');
    const score = buildUnavailableScoreBreakdown();
    const dayView: DayView = {
      day: buildClosedDay({
        closureSnapshot: { score, plannedLoadMinutes: nonNegativeDurationMinutes(0) },
      }),
      tasks: [],
      habits: [],
      score,
      plannedLoadMinutes: nonNegativeDurationMinutes(0),
      habitDefinitions: [],
      taskSeries: [],
      unfinishedTaskIds: [],
    };
    const week = buildCompletedWeek({
      reflection: 'Сохранить спокойный утренний ритм.',
      completionSnapshot: { progress: score },
    });

    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repositoryFor(weekStart, week, [dayView])}>
          <WeekPage weekStart={weekStart} clock={fixedClock(date)} />
        </PlanningRepositoryProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('Статус: Завершён')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Обзор недели' })).toBeVisible();
    expect(screen.getByText('Неделя завершена')).toBeVisible();
    expect(screen.getByText('Сохранить спокойный утренний ритм.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Завершить неделю' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить цель' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Добавить повтор задачи' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Добавить задачу' })).toBeDisabled();

    const goalActions = screen.getByLabelText(
      `Действия с целью «${week.goals[0]?.statement ?? ''}»`,
    );
    await user.click(goalActions);
    expect(screen.getByRole('button', { name: /Редактировать/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Удалить/ })).toBeDisabled();
  });
});
