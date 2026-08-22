import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningRepositoryProvider, type PlanningRepository } from '@/entities/planning';
import { WeekEditorDialog } from '@/features/manage-week';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate, weekDates } from '@/shared/lib/local-date/local-date';
import { durationMinutes, entityId, nonNegativeDurationMinutes, revision } from '@/shared/lib/ids';
import {
  buildHabitOccurrence,
  buildClosedDay,
  buildCompletedWeek,
  buildIncompleteTaskOccurrence,
  buildOpenDay,
  buildOpenWeek,
  buildUnavailableScoreBreakdown,
  buildPlannedTaskEntry,
  buildScoreBreakdown,
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
      notes: 'Одна и та же заметка',
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
    });
    const dayView = {
      day: buildOpenDay(),
      tasks: [{ occurrence, membership: buildPlannedTaskEntry(), events: [] }],
      habits: [
        buildHabitOccurrence({
          definitionSnapshot: {
            title: 'Прогулка после обеда',
            durationMinutes: durationMinutes(30),
          },
        }),
      ],
      score,
      plannedLoadMinutes: nonNegativeDurationMinutes(75),
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
          plannedLoadMinutes: nonNegativeDurationMinutes(75),
        },
        {
          date: otherDate,
          status: 'open' as const,
          score: otherScore,
          plannedLoadMinutes: nonNegativeDurationMinutes(45),
        },
      ],
      // What a real `getWeekView` returns for an open week since 003 FR-008:
      // the aggregate of its days, not a fabricated empty score.
      progress: buildScoreBreakdown({
        task: { completed: 2, applicable: 4, rate: 0.5 },
        habit: { completed: 1, applicable: 2, rate: 0.5 },
        value: 50,
      }),
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
    expect(document.querySelector('[data-od-id="week-habit-row"]')).toHaveTextContent('30 мин');
    expect(recurringTask.closest('details')?.querySelector('summary')).toHaveTextContent(
      '1 ч 15 мин',
    );
    const taskRow = recurringTask.closest('li');
    if (taskRow === null) throw new Error('Expected recurring task row');
    await user.click(within(taskRow).getByRole('button', { name: /заметка/i }));
    expect(screen.getByRole('textbox', { name: /заметка к задаче/i })).toHaveValue(
      'Одна и та же заметка',
    );
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await user.click(screen.getByRole('button', { name: 'Добавить повтор задачи' }));
    expect(screen.getByRole('dialog', { name: /новая повторяющаяся задача/i })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /отмена/i }));
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
          // A completed week reports its frozen snapshot, which is exactly what
          // the page must render even though the live day projection differs.
          progress: frozenProgress,
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

/*
 * 003 US8 (FR-040 to FR-042). Seven days, one interaction — and per-day
 * toggling has to keep working afterwards, which it does because the control
 * writes to the same expansion set the days already use.
 */
describe('003 US8: expanding the whole week planner at once', () => {
  const weekStart = localDate('2026-05-18');
  const date = localDate('2026-05-20');

  function repositoryWithEmptyWeek(): PlanningRepository {
    const emptyScore = buildUnavailableScoreBreakdown();
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
          week: buildOpenWeek(),
          days: weekDates(weekStart).map((day) => ({
            date: day,
            status: 'open' as const,
            score: emptyScore,
            plannedLoadMinutes: nonNegativeDurationMinutes(0),
          })),
          progress: emptyScore,
        },
      }),
      getDayView: vi.fn().mockImplementation((requestedDate: typeof date) =>
        Promise.resolve({
          ok: true,
          value: {
            day: buildOpenDay({ date: requestedDate }),
            tasks: [],
            habits: [],
            score: emptyScore,
            plannedLoadMinutes: nonNegativeDurationMinutes(0),
            unfinishedTaskIds: [],
          },
        }),
      ),
    } as unknown as PlanningRepository;
  }

  async function renderPlanner() {
    render(
      <MemoryRouter>
        <PlanningRepositoryProvider repository={repositoryWithEmptyWeek()}>
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
    await screen.findByRole('button', { name: 'Раскрыть все дни' });
    return document.querySelectorAll<HTMLDetailsElement>('details[data-od-id="week-planner-day"]');
  }

  it('expands all seven days with one interaction, then collapses them all', async () => {
    const user = userEvent.setup();
    const days = await renderPlanner();
    expect(days).toHaveLength(7);
    // Today starts expanded, the rest do not.
    expect([...days].filter((day) => day.open)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Раскрыть все дни' }));
    expect([...days].every((day) => day.open)).toBe(true);

    // FR-041: the label now offers the opposite action.
    await user.click(await screen.findByRole('button', { name: 'Свернуть все дни' }));
    expect([...days].some((day) => day.open)).toBe(false);
  });

  it('leaves individual day toggling working after the control is used (FR-042)', async () => {
    const user = userEvent.setup();
    const days = await renderPlanner();

    await user.click(screen.getByRole('button', { name: 'Раскрыть все дни' }));
    expect([...days].every((day) => day.open)).toBe(true);

    const [first, ...rest] = [...days];
    if (first === undefined) throw new Error('expected a planner day');
    const summary = first.querySelector('summary');
    if (summary === null) throw new Error('expected a day summary');
    await user.click(summary);

    expect(first.open).toBe(false);
    expect(rest.every((day) => day.open)).toBe(true);
  });
});
