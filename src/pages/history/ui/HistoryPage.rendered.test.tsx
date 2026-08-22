import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HistoricalDayFacts, HistoryView } from '@/entities/planning';
import { durationMinutes, nonNegativeDurationMinutes } from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate, startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';
import {
  buildClosedDay,
  buildDailyState,
  buildHabitOccurrence,
  buildIncompleteTaskOccurrence,
  buildOpenDay,
  buildScoreBreakdown,
  buildUnavailableScoreBreakdown,
  deterministicEntityId,
} from '../../../../tests/fixtures/planning';
import { useHistoryPage, type HistoryMode, type HistoryPoint } from '../model/use-history-page';
import { HistoryPage } from './HistoryPage';

vi.mock('../model/use-history-page', () => ({ useHistoryPage: vi.fn() }));

const clock = createFixedClock({
  instant: instant('2026-05-20T05:00:00.000Z'),
  currentLocalDate: localDate('2026-05-20'),
});
const mockedUseHistoryPage = vi.mocked(useHistoryPage);

type HistoryController = ReturnType<typeof useHistoryPage>;

function taskFact(
  ordinal: number,
  outcome: HistoricalDayFacts['tasks'][number]['explanation']['disposition']['outcome'],
  notes?: string,
): HistoricalDayFacts['tasks'][number] {
  const title = `Задача ${String(ordinal)}`;
  return {
    occurrence: buildIncompleteTaskOccurrence({
      id: deterministicEntityId<'task-occurrence'>(300 + ordinal),
      title,
      ...(notes === undefined ? {} : { notes }),
    }),
    membership: { id: deterministicEntityId<'task-plan-entry'>(100 + ordinal) },
    events: [],
    explanation: {
      planned: { title },
      disposition: { outcome },
    },
  } as unknown as HistoricalDayFacts['tasks'][number];
}

function facts(date: LocalDate, overrides: Partial<HistoricalDayFacts> = {}): HistoricalDayFacts {
  return {
    day: buildOpenDay({ date, weekStart: startOfWeek(date) }),
    tasks: [],
    habits: [],
    score: buildUnavailableScoreBreakdown(),
    plannedLoadMinutes: nonNegativeDurationMinutes(0),
    ...overrides,
  };
}

function readyController(
  mode: HistoryMode,
  selectedDate: LocalDate,
  view: HistoryView,
  dynamics: readonly HistoryPoint[] = [],
) {
  const setMode = vi.fn();
  const selectDate = vi.fn();
  const step = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  const controller = {
    state: { status: 'ready' as const, view, dynamics },
    mode,
    selectedDate,
    setMode,
    selectDate,
    step,
    reload,
  } as unknown as HistoryController;
  return { controller, setMode, selectDate, step, reload };
}

function renderHistory(controller: HistoryController) {
  mockedUseHistoryPage.mockReturnValue(controller);
  return render(
    <MemoryRouter>
      <HistoryPage clock={clock} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HistoryPage rendered period compositions', () => {
  it('renders populated Month facts, every calendar tone, and data-bearing dynamics', async () => {
    const user = userEvent.setup();
    const selectedDate = localDate('2026-05-20');
    const score = buildScoreBreakdown({
      task: { completed: 4, applicable: 5, rate: 0.8 },
      habit: { completed: 2, applicable: 2, rate: 1 },
      value: 86,
    });
    const selectedFacts = facts(selectedDate, {
      day: buildClosedDay({
        date: selectedDate,
        weekStart: startOfWeek(selectedDate),
        state: buildDailyState({ sleepDurationMinutes: nonNegativeDurationMinutes(455) }),
      }),
      tasks: [
        taskFact(1, 'planned', 'Одна и та же заметка'),
        taskFact(2, 'completed'),
        taskFact(3, 'moved'),
        taskFact(4, 'backlogged'),
        taskFact(5, 'canceled'),
        taskFact(6, 'kept-unfinished'),
        taskFact(7, 'deleted'),
      ],
      habits: (['pending', 'completed', 'not-completed', 'deleted'] as const).map(
        (outcome, index) =>
          buildHabitOccurrence({
            id: deterministicEntityId<'habit-occurrence'>(200 + index),
            date: selectedDate,
            weekStart: startOfWeek(selectedDate),
            definitionSnapshot:
              index === 0
                ? {
                    title: `Привычка ${String(index + 1)}`,
                    durationMinutes: durationMinutes(30),
                  }
                : { title: `Привычка ${String(index + 1)}` },
            outcome,
          }),
      ),
      score,
      plannedLoadMinutes: nonNegativeDurationMinutes(135),
    });
    const unavailable = buildUnavailableScoreBreakdown();
    const view: Extract<HistoryView, { mode: 'month' }> = {
      mode: 'month',
      anchorDate: selectedDate,
      monthStart: localDate('2026-05-01'),
      monthEnd: localDate('2026-05-31'),
      selectedDate,
      calendar: [
        {
          date: localDate('2026-05-18'),
          belongsToMonth: true,
          dayStatus: 'closed',
          score: buildScoreBreakdown({ value: 80 }),
        },
        {
          date: localDate('2026-05-19'),
          belongsToMonth: true,
          dayStatus: 'open',
          score: buildScoreBreakdown({ value: 60 }),
        },
        {
          date: selectedDate,
          belongsToMonth: true,
          dayStatus: 'closed',
          score: buildScoreBreakdown({ value: 40 }),
        },
        { date: localDate('2026-05-21'), belongsToMonth: true, score: unavailable },
        { date: localDate('2026-05-22'), belongsToMonth: true },
      ],
      selectedDay: selectedFacts,
      completedWeeks: [],
      // 003 FR-035: a month view carries its own aggregate.
      progress: score,
    };
    const state = readyController('month', selectedDate, view, [
      { label: localDate('2026-01-01'), taskRate: 0.5, habitRate: 1, score: 65 },
      {
        label: localDate('2026-02-01'),
        taskRate: 'unavailable',
        habitRate: 'unavailable',
        score: 'unavailable',
      },
    ]);

    const { container } = renderHistory(state.controller);

    expect(container.querySelector('[data-od-id="history-calendar"]')).toBeVisible();
    expect(container.querySelector('[data-score-tone="good"]')).toBeVisible();
    expect(container.querySelector('[data-score-tone="warning"]')).toBeVisible();
    expect(container.querySelector('[data-score-tone="low"]')).toBeVisible();
    expect(container.querySelectorAll('[data-score-tone="none"]')).toHaveLength(2);
    expect(screen.getByText('Задача 7')).toBeVisible();
    expect(screen.getByText('Привычка 4')).toBeVisible();
    expect(screen.getByText('Привычка 1').closest('li')).toHaveTextContent('30 мин');
    expect(screen.getByText('2 ч 15 мин')).toBeVisible();
    expect(screen.getByText('86%')).toBeVisible();
    expect(container.querySelector('[data-od-id="history-dynamics"]')).toBeVisible();

    const firstTask = screen.getByText('Задача 1').closest('li');
    if (firstTask === null) throw new Error('Expected historical task row');
    await user.click(within(firstTask).getByRole('button', { name: /заметка к задаче/i }));
    expect(screen.getByRole('dialog', { name: 'Заметка' })).toHaveTextContent(
      'Одна и та же заметка',
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /21 мая 2026/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий период' }));
    fireEvent.click(screen.getByRole('button', { name: 'Следующий период' }));
    fireEvent.click(screen.getByRole('button', { name: 'Неделя' }));
    expect(state.selectDate).toHaveBeenCalledWith(localDate('2026-05-21'));
    expect(state.step).toHaveBeenNthCalledWith(1, -1);
    expect(state.step).toHaveBeenNthCalledWith(2, 1);
    expect(state.setMode).toHaveBeenCalledWith('week');
  });

  it('renders an empty Month with honest selected-day and Dynamics states', () => {
    const selectedDate = localDate('2026-06-15');
    const view: Extract<HistoryView, { mode: 'month' }> = {
      mode: 'month',
      anchorDate: selectedDate,
      monthStart: localDate('2026-06-01'),
      monthEnd: localDate('2026-06-30'),
      selectedDate,
      calendar: [],
      selectedDay: facts(selectedDate),
      completedWeeks: [],
      progress: buildUnavailableScoreBreakdown(),
    };
    renderHistory(
      readyController('month', selectedDate, view, [
        {
          label: localDate('2026-06-01'),
          taskRate: 'unavailable',
          habitRate: 'unavailable',
          score: 'unavailable',
        },
      ]).controller,
    );

    expect(screen.getByText('На этот день нет записей')).toBeVisible();
    expect(screen.getByText('Данных для динамики пока нет')).toBeVisible();
    expect(screen.getByText('В процессе')).toBeVisible();
    expect(screen.getByText('не указана')).toBeVisible();
    expect(screen.getByText('не указано')).toBeVisible();
    expect(screen.getByText('не указан')).toBeVisible();
  });

  it('renders Week overview, fallback selected facts, reflection, and weekly Dynamics', () => {
    const selectedDate = localDate('2026-05-24');
    const firstDate = localDate('2026-05-18');
    const first = facts(firstDate, {
      day: buildClosedDay({ date: firstDate, weekStart: startOfWeek(firstDate) }),
      score: buildScoreBreakdown({ value: 72 }),
    });
    const secondDate = localDate('2026-05-19');
    const second = facts(secondDate);
    const view: Extract<HistoryView, { mode: 'week' }> = {
      mode: 'week',
      anchorDate: selectedDate,
      weekStart: localDate('2026-05-18'),
      facts: {
        week: {
          status: 'open',
          startDate: localDate('2026-05-18'),
          goals: [],
          revision: 0 as never,
        },
        days: [first, second],
        progress: buildScoreBreakdown(),
        reflection: 'Сохранили устойчивый темп.',
      },
    };
    renderHistory(
      readyController('week', selectedDate, view, [
        { label: localDate('2026-05-18'), taskRate: 1, habitRate: 0.5, score: 85 },
      ]).controller,
    );

    expect(screen.getByText('Дни недели')).toBeVisible();
    expect(screen.getAllByText('72%')).toHaveLength(2);
    expect(screen.getByText(/Сохранили устойчивый темп\./)).toBeVisible();
    expect(screen.getByText('последние 8 недель')).toBeVisible();
    expect(screen.getByRole('link', { name: /Открыть день/ })).toHaveAttribute(
      'href',
      '/day/2026-05-18',
    );
  });

  it('renders Week without facts and Day with one-sided facts without adding Day dynamics', () => {
    const selectedDate = localDate('2026-05-20');
    const week: Extract<HistoryView, { mode: 'week' }> = {
      mode: 'week',
      anchorDate: selectedDate,
      weekStart: localDate('2026-05-18'),
      facts: {
        week: {
          status: 'open',
          startDate: localDate('2026-05-18'),
          goals: [],
          revision: 0 as never,
        },
        days: [],
        progress: buildUnavailableScoreBreakdown(),
      },
    };
    const firstRender = renderHistory(readyController('week', selectedDate, week).controller);
    expect(screen.getByText('Нет фактов выбранного дня')).toBeVisible();
    firstRender.unmount();

    const dayFacts = facts(selectedDate, {
      habits: [
        buildHabitOccurrence({
          id: deterministicEntityId<'habit-occurrence'>(301),
          date: selectedDate,
          weekStart: startOfWeek(selectedDate),
          outcome: 'completed',
        }),
      ],
      plannedLoadMinutes: nonNegativeDurationMinutes(25),
    });
    const day: Extract<HistoryView, { mode: 'day' }> = {
      mode: 'day',
      anchorDate: selectedDate,
      facts: dayFacts,
    };
    const { container } = renderHistory(readyController('day', selectedDate, day).controller);
    expect(screen.getByText('Нет запланированных задач')).toBeVisible();
    expect(screen.getByText('1 привычек')).toBeVisible();
    expect(container.querySelector('[data-od-id="history-dynamics"]')).toBeNull();
  });

  it('renders the recoverable error boundary and retries through the controller', () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const controller = {
      state: { status: 'error' as const, message: 'Тестовая ошибка хранилища' },
      mode: 'month' as const,
      selectedDate: localDate('2026-05-20'),
      setMode: vi.fn(),
      selectDate: vi.fn(),
      step: vi.fn(),
      reload,
    } as unknown as HistoryController;
    renderHistory(controller);

    expect(screen.getByRole('alert')).toHaveTextContent('Тестовая ошибка хранилища');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(reload).toHaveBeenCalledOnce();
  });
});

/*
 * 003 US7 (FR-038, FR-039). A period with nothing in it is a gap in the chart,
 * not a reason to hide the chart. The whole-range empty state survives only for
 * a range where every period is empty.
 */
describe('003 US7: dynamics empty handling', () => {
  const selectedDate = localDate('2026-05-20');

  function monthView(): Extract<HistoryView, { mode: 'month' }> {
    return {
      mode: 'month',
      anchorDate: selectedDate,
      monthStart: localDate('2026-05-01'),
      monthEnd: localDate('2026-05-31'),
      selectedDate,
      calendar: [],
      selectedDay: {
        day: buildOpenDay({ date: selectedDate }),
        tasks: [],
        habits: [],
        score: buildUnavailableScoreBreakdown(),
        plannedLoadMinutes: nonNegativeDurationMinutes(0),
      },
      completedWeeks: [],
      progress: buildUnavailableScoreBreakdown(),
    };
  }

  function point(label: LocalDate, score: number | 'unavailable'): HistoryPoint {
    return {
      label,
      taskRate: score === 'unavailable' ? 'unavailable' : 1,
      habitRate: score === 'unavailable' ? 'unavailable' : 1,
      score,
    };
  }

  it('draws the chart when only some periods are empty (FR-038)', () => {
    const { container } = renderHistory(
      readyController('month', selectedDate, monthView(), [
        point(localDate('2026-03-01'), 'unavailable'),
        point(localDate('2026-04-01'), 80),
        point(localDate('2026-05-01'), 'unavailable'),
      ]).controller,
    );

    const chart = container.querySelector('[data-od-id="history-dynamics"]');
    expect(chart).toBeVisible();
    expect(chart?.textContent).not.toContain('Данных для динамики пока нет');
    // Every period is still drawn; the empty ones are marked as gaps.
    expect(container.querySelectorAll('ol li')).toHaveLength(3);
    expect(container.querySelectorAll('ol li[data-empty="true"]')).toHaveLength(2);
  });

  it('shows the empty state only when every period is empty (FR-039)', () => {
    const { container } = renderHistory(
      readyController('month', selectedDate, monthView(), [
        point(localDate('2026-04-01'), 'unavailable'),
        point(localDate('2026-05-01'), 'unavailable'),
      ]).controller,
    );

    expect(container.querySelector('[data-od-id="history-dynamics"]')?.textContent).toContain(
      'Данных для динамики пока нет',
    );
  });

  it('names the series without encoding the formula (FR-020)', () => {
    const { container } = renderHistory(
      readyController('month', selectedDate, monthView(), [point(localDate('2026-05-01'), 80)])
        .controller,
    );

    const chart = container.querySelector('[data-od-id="history-dynamics"]');
    expect(chart?.textContent).toContain('Результат');
    expect(chart?.textContent).not.toContain('70/30');
  });
});
