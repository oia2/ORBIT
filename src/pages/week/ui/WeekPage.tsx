import { type CSSProperties, useState } from 'react';
import { Link } from 'react-router';

import {
  PeriodStatus,
  TaskRow,
  type DayView,
  type HabitOccurrence,
  type HabitOutcome,
  type ProjectedTaskMembership,
} from '@/entities/planning';
import { CompleteWeekDialog, useCompleteWeek } from '@/features/complete-week';
import { HabitRecurrenceDialog, useManageHabit } from '@/features/manage-habit';
import {
  TaskEditorDialog,
  TaskExecution,
  TaskRecurrenceDialog,
  useManageTask,
} from '@/features/manage-task';
import { useManageWeek, WeekEditorDialog } from '@/features/manage-week';
import { createSystemClock, type ApplicationClock } from '@/shared/lib/local-date/clock';
import { revision, type WeekGoalId } from '@/shared/lib/ids';
import {
  addDays,
  formatLocalDate,
  getLocalDateParts,
  isoWeekday,
  weekDates,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';
import { ActionMenu } from '@/shared/ui/action-menu';
import { formatDurationMinutes } from '@/shared/lib/duration';
import { Button } from '@/shared/ui/button';
import { OrbitMetric } from '@/shared/ui/orbit-metric';

import { useWeekPage } from '../model/use-week-page';
import styles from './WeekPage.module.css';

const dayLabel = (date: LocalDate) =>
  formatLocalDate(date, 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

const shortDayLabel = (date: LocalDate) =>
  formatLocalDate(date, 'ru-RU', { weekday: 'short' }).replace('.', '').toLocaleUpperCase('ru-RU');

function weekRangeLabel(weekStart: LocalDate): string {
  const weekEnd = addDays(weekStart, 6);
  const start = getLocalDateParts(weekStart);
  const end = getLocalDateParts(weekEnd);

  if (start.year === end.year && start.month === end.month) {
    return `${String(start.day)}—${formatLocalDate(weekEnd, 'ru-RU', {
      day: 'numeric',
      month: 'long',
    })}`;
  }

  return `${formatLocalDate(weekStart, 'ru-RU', {
    day: 'numeric',
    month: 'short',
  })} — ${formatLocalDate(weekEnd, 'ru-RU', {
    day: 'numeric',
    month: 'short',
  })}`;
}

function countLabel(count: number, forms: readonly [string, string, string]): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const form =
    lastTwo >= 11 && lastTwo <= 14
      ? forms[2]
      : last === 1
        ? forms[0]
        : last >= 2 && last <= 4
          ? forms[1]
          : forms[2];
  return `${String(count)} ${form}`;
}

function percent(rate: number | 'unavailable'): number | undefined {
  return rate === 'unavailable' ? undefined : Math.round(rate * 100);
}

interface HabitWeekRow {
  readonly id: string;
  readonly title: string;
  readonly outcomes: ReadonlyMap<LocalDate, HabitOutcome>;
  /** Any occurrence of the series, used to edit or stop the whole recurrence. */
  readonly occurrence: HabitOccurrence;
}

function buildHabitRows(dayViews: readonly DayView[]): readonly HabitWeekRow[] {
  const grouped = new Map<
    string,
    {
      readonly id: string;
      readonly title: string;
      readonly outcomes: Map<LocalDate, HabitOutcome>;
      readonly occurrence: HabitOccurrence;
    }
  >();

  for (const dayView of dayViews) {
    for (const habit of dayView.habits) {
      if (habit.outcome === 'deleted') continue;
      const id = String(habit.definitionId);
      const row = grouped.get(id) ?? {
        id,
        title: habit.definitionSnapshot.title,
        outcomes: new Map<LocalDate, HabitOutcome>(),
        occurrence: habit,
      };
      row.outcomes.set(dayView.day.date, habit.outcome);
      grouped.set(id, row);
    }
  }

  return [...grouped.values()];
}

function habitOutcomeLabel(outcome: HabitOutcome | undefined): string {
  switch (outcome) {
    case 'completed':
      return 'выполнено';
    case 'not-completed':
      return 'не выполнено';
    case 'pending':
      return 'ожидает отметки';
    case 'deleted':
    case undefined:
      return 'не запланировано';
  }
}

function dailyScoreClass(value: number | 'unavailable'): string {
  if (value === 'unavailable') return styles.scoreUnavailable ?? '';
  if (value >= 70) return styles.scoreGood ?? '';
  if (value >= 50) return styles.scoreWarning ?? '';
  return styles.scoreLow ?? '';
}

export interface WeekPageProps {
  readonly weekStart: LocalDate;
  readonly clock?: ApplicationClock;
}

export function WeekPage({ weekStart, clock = createSystemClock() }: WeekPageProps) {
  const { state, reload } = useWeekPage(weekStart);
  const [goalEditor, setGoalEditor] = useState<{ id?: WeekGoalId; statement: string }>();
  const [taskDate, setTaskDate] = useState<LocalDate>();
  const [recurrenceEditor, setRecurrenceEditor] = useState<
    { mode: 'create' } | { mode: 'update'; task: ProjectedTaskMembership }
  >();
  const [completionOpen, setCompletionOpen] = useState(false);
  const [habitEditorOpen, setHabitEditorOpen] = useState(false);
  const [habitSeriesEditor, setHabitSeriesEditor] = useState<HabitOccurrence>();
  const today = clock.currentLocalDate();
  const [expandedPlannerDays, setExpandedPlannerDays] = useState<ReadonlySet<LocalDate>>(
    () => new Set([today]),
  );

  const ready = state.status === 'ready' ? state : undefined;
  const week = ready?.view.week;
  /*
   * The server owns this figure for both period states (003 FR-008). It used to
   * be recomputed here for an open week because `getWeekView` returned a
   * fabricated empty aggregate; that defect is fixed, so the page reads the one
   * answer instead of producing a second one.
   */
  const reviewProgress = ready?.view.progress;
  const manageWeek = useManageWeek({
    weekStart,
    revision: week?.revision ?? revision(0),
    onCommitted: reload,
  });
  const manageTask = useManageTask(reload);
  const manageHabit = useManageHabit(reload);
  const completeWeek = useCompleteWeek(reload);
  const allDaysClosed = ready?.dayViews.every((day) => day.day.status === 'closed') === true;

  const reorderGoal = async (index: number, direction: -1 | 1) => {
    if (week === undefined) return;
    const target = index + direction;
    if (target < 0 || target >= week.goals.length) return;
    const ids = week.goals.map((goal) => goal.id);
    const currentId = ids[index];
    const targetId = ids[target];
    if (currentId === undefined || targetId === undefined) return;
    ids[index] = targetId;
    ids[target] = currentId;
    await manageWeek.reorder(ids);
  };

  const year = getLocalDateParts(weekStart).year;
  const plannedTaskCount = ready?.dayViews.reduce((sum, day) => sum + day.tasks.length, 0) ?? 0;
  const taskRate = reviewProgress === undefined ? undefined : percent(reviewProgress.task.rate);
  const habitRows = buildHabitRows(ready?.dayViews ?? []);
  const dates = weekDates(weekStart);
  // Individual `<details>` toggling keeps writing to the same set, so per-day
  // expansion still works independently afterwards (003 FR-042).
  const allPlannerDaysExpanded = dates.every((date) => expandedPlannerDays.has(date));
  const dayViewsByDate = new Map(ready?.dayViews.map((dayView) => [dayView.day.date, dayView]));
  const todayInWeek = dates.includes(today);

  return (
    <section className={styles.page} aria-labelledby="week-page-title">
      <header
        className={['orbit-page-header', styles.header].filter(Boolean).join(' ')}
        data-od-id="week-header"
      >
        <div className="orbit-page-header__copy">
          <p className="orbit-eyebrow">Неделя · {String(year)}</p>
          <h1 className="orbit-page-title" id="week-page-title">
            <span className="visually-hidden">Неделя: </span>
            {weekRangeLabel(weekStart)}
          </h1>
          <p className="orbit-page-note">
            {week?.goals[0] === undefined
              ? 'Добавьте описательные цели и распределите конкретные задачи по дням.'
              : `Главное на неделе — ${week.goals[0].statement}. Запланировано ${countLabel(
                  plannedTaskCount,
                  ['задача', 'задачи', 'задач'],
                )}.`}
          </p>
        </div>

        <div
          className={['orbit-header-actions', styles.headerActions].filter(Boolean).join(' ')}
          aria-label="Управление неделей"
        >
          <nav className={styles.periodNav} aria-label="Переход между неделями">
            <Link
              className={styles.iconLink}
              to={`/week/${addDays(weekStart, -7)}`}
              aria-label="Предыдущая неделя"
            >
              <span aria-hidden="true">←</span>
            </Link>
            <Link
              className={styles.iconLink}
              to={`/week/${addDays(weekStart, 7)}`}
              aria-label="Следующая неделя"
            >
              <span aria-hidden="true">→</span>
            </Link>
          </nav>
          {week === undefined ? null : <PeriodStatus status={week.status} />}
          {week?.status === 'completed' ? (
            <a className={styles.reviewLink} href="#week-review">
              Обзор недели
            </a>
          ) : ready === undefined ? null : (
            <Button
              variant="secondary"
              disabled={!allDaysClosed}
              title={allDaysClosed ? undefined : 'Сначала закройте все семь дней'}
              onClick={() => {
                setCompletionOpen(true);
              }}
            >
              Завершить неделю
            </Button>
          )}
          <a className={styles.planLink} href="#week-planner">
            Планировать неделю
          </a>
        </div>
      </header>

      {state.status === 'loading' ? (
        <div
          className={['orbit-card', 'orbit-empty-state', styles.runtimeState]
            .filter(Boolean)
            .join(' ')}
          role="status"
        >
          <strong>Загружаем неделю…</strong>
          <p>Подготавливаем план, фактические результаты и привычки.</p>
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div
          className={['orbit-card', 'orbit-empty-state', styles.runtimeState]
            .filter(Boolean)
            .join(' ')}
          role="alert"
        >
          <strong>Неделя недоступна</strong>
          <p>{state.message}</p>
          <Button onClick={() => void reload()}>Повторить</Button>
        </div>
      ) : null}

      {ready === undefined || week === undefined || reviewProgress === undefined ? null : (
        <>
          <div className={styles.layout} data-od-id="week-layout">
            <div className={styles.primaryColumn}>
              <section
                className={styles.progress}
                data-od-id="week-progress"
                aria-label="Прогресс недели"
              >
                <OrbitMetric
                  label="Прогресс недели"
                  value={reviewProgress.value}
                  tone="neutral"
                  periodStatus={week.status}
                  contextLabel="Задачи и привычки недели"
                  stateHint={{
                    label: 'Дней закрыто:',
                    value: `${String(ready.dayViews.filter((day) => day.day.status === 'closed').length)} из 7`,
                  }}
                />
              </section>

              <section
                className={styles.summary}
                data-od-id="week-summary"
                aria-label="Состав прогресса недели"
              >
                <div className={styles.taskSummary}>
                  <div className={styles.summaryHeading}>
                    <span>Задачи недели</span>
                    <strong>{taskRate === undefined ? '—' : `${String(taskRate)}%`}</strong>
                  </div>
                  <div
                    className={styles.summaryTrack}
                    role="progressbar"
                    aria-label="Выполнение задач недели"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuetext={taskRate === undefined ? 'Нет данных' : `${String(taskRate)}%`}
                    {...(taskRate === undefined ? {} : { 'aria-valuenow': taskRate })}
                  >
                    <span
                      style={{ '--week-task-rate': `${String(taskRate ?? 0)}%` } as CSSProperties}
                    />
                  </div>
                  <p className={styles.summaryBreakdown}>
                    <span>
                      <strong>{reviewProgress.task.completed}</strong> выполнено
                    </span>
                    <span>
                      <strong>
                        {Math.max(
                          0,
                          reviewProgress.task.applicable - reviewProgress.task.completed,
                        )}
                      </strong>{' '}
                      осталось
                    </span>
                  </p>
                </div>
                <div className={styles.habitSummary}>
                  <span>Привычки</span>
                  <strong>{reviewProgress.habit.completed} отметок</strong>
                  <small>
                    {reviewProgress.habit.completed} из {reviewProgress.habit.applicable} выполнено
                  </small>
                </div>
                {completeWeek.error === undefined ? null : (
                  <p className={styles.summaryError} role="alert">
                    {completeWeek.error}
                  </p>
                )}
              </section>

              <section
                className={['orbit-card', styles.goals].filter(Boolean).join(' ')}
                data-od-id="week-goals"
                aria-labelledby="goals-title"
              >
                <header className={styles.cardHeader}>
                  <div>
                    <h2 id="goals-title">Цели недели</h2>
                    <p>Описательные результаты, а не числовой прогресс</p>
                  </div>
                  <Button
                    className={styles.contextButton}
                    variant="quiet"
                    disabled={week.status !== 'open'}
                    onClick={() => {
                      setGoalEditor({ statement: '' });
                    }}
                  >
                    Добавить цель
                  </Button>
                </header>
                {week.goals.length === 0 ? (
                  <div className={styles.compactEmpty}>
                    <strong>Целей пока нет</strong>
                    <p>Добавьте короткое описание результата, которого хотите достичь.</p>
                  </div>
                ) : (
                  <ol className={styles.goalList} aria-label="Цели недели">
                    {week.goals.map((goal, index) => (
                      <li className={styles.goal} key={goal.id} data-od-id="week-goal">
                        <span className={styles.goalIndex}>
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className={styles.goalStatement}>{goal.statement}</span>
                        <ActionMenu triggerLabel={`Действия с целью «${goal.statement}»`}>
                          {(close) => (
                            <>
                              <Button
                                variant="quiet"
                                disabled={week.status !== 'open'}
                                onClick={() => {
                                  close();
                                  setGoalEditor({ id: goal.id, statement: goal.statement });
                                }}
                              >
                                Редактировать «{goal.statement}»
                              </Button>
                              <Button
                                variant="quiet"
                                disabled={week.status !== 'open' || index === 0}
                                onClick={() => {
                                  close();
                                  void reorderGoal(index, -1);
                                }}
                              >
                                Переместить «{goal.statement}» вверх
                              </Button>
                              <Button
                                variant="quiet"
                                disabled={week.status !== 'open' || index === week.goals.length - 1}
                                onClick={() => {
                                  close();
                                  void reorderGoal(index, 1);
                                }}
                              >
                                Переместить «{goal.statement}» вниз
                              </Button>
                              <Button
                                variant="danger"
                                disabled={week.status !== 'open'}
                                onClick={() => {
                                  close();
                                  void manageWeek.remove(goal.id);
                                }}
                              >
                                Удалить «{goal.statement}»
                              </Button>
                            </>
                          )}
                        </ActionMenu>
                      </li>
                    ))}
                  </ol>
                )}
                {manageWeek.error === undefined ? null : (
                  <p className={styles.inlineError} role="alert">
                    {manageWeek.error}
                  </p>
                )}
                {week.status === 'completed' ? (
                  <aside className={styles.review} id="week-review">
                    <div>
                      <strong>Неделя завершена</strong>
                      <p>Факты этой недели доступны только для чтения.</p>
                    </div>
                    {week.reflection === undefined ? null : (
                      <blockquote>{week.reflection}</blockquote>
                    )}
                  </aside>
                ) : null}
              </section>
            </div>

            <div className={styles.sideColumn}>
              <section
                className={['orbit-card', styles.dailyResults].filter(Boolean).join(' ')}
                data-od-id="week-daily-results"
                aria-labelledby="week-days-title"
              >
                <header className={styles.cardHeader}>
                  <div>
                    <h2 id="week-days-title">Дни недели</h2>
                    <p>Высота показывает результат дня</p>
                  </div>
                  <span className={styles.cardMeta}>
                    {todayInWeek
                      ? `${shortDayLabel(today).toLocaleLowerCase('ru-RU')} · сегодня`
                      : '7 дней'}
                  </span>
                </header>
                <ul className={styles.dayBars} aria-label="Результаты по дням недели">
                  {dates.map((date) => {
                    const dayView = dayViewsByDate.get(date);
                    const score = dayView?.score.value ?? 'unavailable';
                    const scoreLabel = score === 'unavailable' ? 'нет данных' : `${String(score)}%`;
                    return (
                      <li key={date} data-od-id="week-day-result">
                        <Link
                          className={[
                            styles.dayBar,
                            dailyScoreClass(score),
                            date === today ? styles.currentDay : undefined,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          to={`/day/${date}`}
                          aria-label={`${dayLabel(date)}: ${scoreLabel}`}
                          style={
                            {
                              '--week-score': `${String(score === 'unavailable' ? 0 : score)}%`,
                            } as CSSProperties
                          }
                        >
                          <span className={styles.dayScore} aria-hidden="true">
                            {score === 'unavailable' ? '—' : score}
                          </span>
                          <span className={styles.dayTrack} aria-hidden="true">
                            <span className={styles.dayFill} />
                          </span>
                          <span className={styles.dayName} aria-hidden="true">
                            {shortDayLabel(date)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section
                className={['orbit-card', styles.habits].filter(Boolean).join(' ')}
                data-od-id="week-habits"
                aria-labelledby="week-habits-title"
              >
                <header className={styles.cardHeader}>
                  <div>
                    <h2 id="week-habits-title">Привычки</h2>
                    <p>Ритм по дням недели</p>
                  </div>
                  <span className={styles.cardMeta}>{habitRows.length} в плане</span>
                  <Button
                    className={styles.contextButton}
                    variant="quiet"
                    onClick={() => {
                      setHabitEditorOpen(true);
                    }}
                  >
                    Добавить привычку
                  </Button>
                </header>
                {habitRows.length === 0 ? (
                  <div className={styles.compactEmpty}>
                    <strong>Привычек на этой неделе нет</strong>
                    <p>Здесь появятся фактические отметки по дням.</p>
                  </div>
                ) : (
                  <div className={styles.habitList}>
                    <div className={styles.habitLegend} aria-hidden="true">
                      <span />
                      <div className={styles.habitDots}>
                        {dates.map((date) => (
                          <span key={date} className={styles.habitLegendDay}>
                            {shortDayLabel(date)}
                          </span>
                        ))}
                      </div>
                      <span />
                    </div>
                    {habitRows.map((habit) => (
                      <div className={styles.habitLine} key={habit.id} data-od-id="week-habit-row">
                        <strong>
                          {habit.title}
                          {habit.occurrence.definitionSnapshot.durationMinutes ===
                          undefined ? null : (
                            <span className={styles.habitDuration}>
                              {' · '}
                              {formatDurationMinutes(
                                habit.occurrence.definitionSnapshot.durationMinutes,
                              )}
                            </span>
                          )}
                        </strong>
                        <div
                          className={styles.habitDots}
                          aria-label={`Привычка «${habit.title}» по дням`}
                        >
                          {dates.map((date) => {
                            const outcome = habit.outcomes.get(date);
                            return (
                              <span
                                key={date}
                                className={styles.habitDot}
                                data-outcome={outcome ?? 'not-planned'}
                                role="img"
                                aria-label={`${dayLabel(date)}: ${habitOutcomeLabel(outcome)}`}
                              />
                            );
                          })}
                        </div>
                        <ActionMenu triggerLabel={`Действия с привычкой «${habit.title}»`}>
                          {(close) => (
                            <>
                              <Button
                                variant="quiet"
                                onClick={() => {
                                  close();
                                  setHabitSeriesEditor(habit.occurrence);
                                }}
                              >
                                Изменить повтор
                              </Button>
                              <Button
                                variant="danger"
                                onClick={() => {
                                  close();
                                  void manageHabit.stop(
                                    habit.occurrence.definitionId,
                                    habit.occurrence.ruleRevision,
                                  );
                                }}
                              >
                                Удалить
                              </Button>
                            </>
                          )}
                        </ActionMenu>
                      </div>
                    ))}
                  </div>
                )}
                <footer className={styles.cardFooter}>
                  {reviewProgress.habit.completed} из {reviewProgress.habit.applicable} выполнено
                </footer>
              </section>
            </div>
          </div>

          <section
            className={['orbit-card', styles.planner].filter(Boolean).join(' ')}
            id="week-planner"
            data-od-id="week-planner"
            aria-labelledby="week-planner-title"
          >
            <header className={styles.cardHeader}>
              <div>
                <h2 id="week-planner-title">План по дням</h2>
                <p>
                  {countLabel(plannedTaskCount, ['задача', 'задачи', 'задач'])} · фактическая
                  длительность без лимитов и классификаций
                </p>
              </div>
              <div className={styles.plannerActions}>
                {/*
                 * 003 FR-040: seven days, one interaction. The label states what
                 * the control will do next (FR-041) rather than what it is.
                 */}
                <Button
                  className={styles.contextButton}
                  variant="quiet"
                  onClick={() => {
                    setExpandedPlannerDays(allPlannerDaysExpanded ? new Set() : new Set(dates));
                  }}
                >
                  {allPlannerDaysExpanded ? 'Свернуть все дни' : 'Раскрыть все дни'}
                </Button>
                <Button
                  className={styles.contextButton}
                  variant="quiet"
                  disabled={week.status !== 'open'}
                  onClick={() => {
                    setRecurrenceEditor({ mode: 'create' });
                  }}
                >
                  Добавить повтор задачи
                </Button>
              </div>
            </header>
            <div className={styles.plannerDays}>
              {ready.dayViews.map((dayView) => (
                <details
                  className={styles.plannerDay}
                  key={dayView.day.date}
                  open={expandedPlannerDays.has(dayView.day.date)}
                  onToggle={(event) => {
                    const expanded = event.currentTarget.open;
                    setExpandedPlannerDays((current) => {
                      if (current.has(dayView.day.date) === expanded) return current;
                      const updated = new Set(current);
                      if (expanded) updated.add(dayView.day.date);
                      else updated.delete(dayView.day.date);
                      return updated;
                    });
                  }}
                  data-od-id="week-planner-day"
                >
                  <summary>
                    <span>
                      <strong>{dayLabel(dayView.day.date)}</strong>
                      <small>
                        {dayView.day.status === 'closed' ? 'День закрыт' : 'День открыт'}
                      </small>
                    </span>
                    <span className={styles.dayFacts}>
                      {countLabel(dayView.tasks.length, ['задача', 'задачи', 'задач'])} ·{' '}
                      {formatDurationMinutes(Number(dayView.plannedLoadMinutes))}
                    </span>
                  </summary>
                  <div className={styles.plannerDayBody}>
                    {dayView.tasks.length === 0 ? (
                      <p className={styles.dayEmpty}>На этот день задач пока нет.</p>
                    ) : (
                      <ul
                        className={styles.taskList}
                        aria-label={`Задачи: ${dayLabel(dayView.day.date)}`}
                      >
                        {dayView.tasks.map((task, index) => (
                          <TaskRow
                            key={task.occurrence.id}
                            task={task}
                            {...(dayView.day.status === 'open'
                              ? {
                                  onSaveNote: (notes: string | null) =>
                                    manageTask.saveNote({
                                      occurrenceId: task.occurrence.id,
                                      notes,
                                      revision: task.occurrence.revision,
                                    }),
                                }
                              : {})}
                            actions={
                              <TaskExecution
                                task={task}
                                availableMoveDates={ready.dayViews
                                  .filter(
                                    (candidate) =>
                                      candidate.day.status === 'open' &&
                                      candidate.day.date !== dayView.day.date,
                                  )
                                  .map((candidate) => candidate.day.date)}
                                immutable={dayView.day.status !== 'open'}
                                canMoveUp={index > 0}
                                {...(dayView.day.status === 'closed'
                                  ? {}
                                  : {
                                      onMoveUp: () => {
                                        if (index === 0) return;
                                        const ids = dayView.tasks.map((item) => item.occurrence.id);
                                        const currentId = ids[index];
                                        const previousId = ids[index - 1];
                                        if (currentId === undefined || previousId === undefined)
                                          return;
                                        ids[index - 1] = currentId;
                                        ids[index] = previousId;
                                        void manageTask.reorderDated(
                                          dayView.day.date,
                                          ids,
                                          dayView.day.revision,
                                        );
                                      },
                                    })}
                                {...(task.occurrence.seriesId === undefined ||
                                dayView.day.status !== 'open'
                                  ? {}
                                  : {
                                      onEditRecurrence: () => {
                                        setRecurrenceEditor({ mode: 'update', task });
                                      },
                                    })}
                                onToggle={(completed) =>
                                  manageTask.toggleCompletion({
                                    occurrenceId: task.occurrence.id,
                                    date: dayView.day.date,
                                    completed,
                                    revision: task.occurrence.revision,
                                  })
                                }
                                onDelete={() =>
                                  manageTask.remove(task.occurrence.id, task.occurrence.revision)
                                }
                                onEdit={({ title, duration, startTime, endTime }) =>
                                  manageTask.edit({
                                    occurrenceId: task.occurrence.id,
                                    title,
                                    duration,
                                    startTime,
                                    endTime,
                                    revision: task.occurrence.revision,
                                  })
                                }
                                onMoveToBacklog={() =>
                                  manageTask.moveToBacklog(
                                    task.occurrence.id,
                                    task.occurrence.revision,
                                  )
                                }
                                onMoveToDate={({ destinationDate, duration }) =>
                                  manageTask.moveToDate({
                                    occurrenceId: task.occurrence.id,
                                    destinationDate,
                                    duration,
                                    revision: task.occurrence.revision,
                                  })
                                }
                              />
                            }
                          />
                        ))}
                      </ul>
                    )}
                    <div className={styles.dayActions}>
                      <Button
                        variant="quiet"
                        disabled={dayView.day.status !== 'open' || week.status !== 'open'}
                        onClick={() => {
                          setTaskDate(dayView.day.date);
                        }}
                      >
                        Добавить задачу
                      </Button>
                      <Link className={styles.dayLink} to={`/day/${dayView.day.date}`}>
                        Открыть день
                      </Link>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}

      {habitEditorOpen ? (
        <HabitRecurrenceDialog
          open
          clock={clock}
          onClose={() => {
            setHabitEditorOpen(false);
          }}
          onSubmit={({ title, rule, durationMinutes }) =>
            manageHabit.create({
              title,
              rule,
              ...(durationMinutes === null ? {} : { durationMinutes }),
            })
          }
        />
      ) : null}
      {habitSeriesEditor === undefined ? null : (
        <HabitRecurrenceDialog
          open
          mode="update"
          clock={clock}
          initialTitle={habitSeriesEditor.definitionSnapshot.title}
          {...(habitSeriesEditor.definitionSnapshot.durationMinutes === undefined
            ? {}
            : { initialDurationMinutes: habitSeriesEditor.definitionSnapshot.durationMinutes })}
          initialRule={{
            startDate: habitSeriesEditor.date,
            weekdays: [isoWeekday(habitSeriesEditor.date)],
          }}
          onClose={() => {
            setHabitSeriesEditor(undefined);
          }}
          onSubmit={async ({ rule, durationMinutes }) => {
            /*
             * The duration goes first: it does not bump the definition
             * revision, so the rule update that follows still holds a current
             * one. The reverse order would conflict with itself.
             */
            if (
              !(await manageHabit.setDuration({
                definitionId: habitSeriesEditor.definitionId,
                durationMinutes,
                revision: habitSeriesEditor.ruleRevision,
              }))
            ) {
              return false;
            }
            return manageHabit.update({
              definitionId: habitSeriesEditor.definitionId,
              rule,
              revision: habitSeriesEditor.ruleRevision,
            });
          }}
        />
      )}
      {goalEditor === undefined ? null : (
        <WeekEditorDialog
          open
          initialStatement={goalEditor.statement}
          onClose={() => {
            setGoalEditor(undefined);
          }}
          onSubmit={(statement) =>
            goalEditor.id === undefined
              ? manageWeek.add(statement)
              : manageWeek.edit(goalEditor.id, statement)
          }
        />
      )}
      {taskDate === undefined ? null : (
        <TaskEditorDialog
          open
          date={taskDate}
          nextPosition={ready?.dayViews.find((day) => day.day.date === taskDate)?.tasks.length ?? 0}
          onClose={() => {
            setTaskDate(undefined);
          }}
          onSubmitDated={(input) => manageTask.createDated({ date: taskDate, ...input })}
        />
      )}
      {recurrenceEditor === undefined ? null : recurrenceEditor.mode === 'create' ? (
        <TaskRecurrenceDialog
          open
          clock={clock}
          onClose={() => {
            setRecurrenceEditor(undefined);
          }}
          onSubmit={({ title, duration, startTime, endTime, rule }) =>
            manageTask.createSeries({ title, duration, startTime, endTime, rule })
          }
        />
      ) : (
        (() => {
          const occurrence = recurrenceEditor.task.occurrence;
          const seriesId = occurrence.seriesId;
          const ruleRevision = occurrence.ruleRevision;
          if (seriesId === undefined || ruleRevision === undefined) return null;
          return (
            <TaskRecurrenceDialog
              open
              mode="update"
              clock={clock}
              initialTitle={occurrence.title}
              initialDuration={
                recurrenceEditor.task.membership.plannedSnapshot.plannedDurationMinutes
              }
              initialRule={{
                startDate: occurrence.nominalDate ?? recurrenceEditor.task.membership.date,
                weekdays: [
                  isoWeekday(occurrence.nominalDate ?? recurrenceEditor.task.membership.date),
                ],
              }}
              onClose={() => {
                setRecurrenceEditor(undefined);
              }}
              onSubmit={({ rule }) =>
                manageTask.updateSeries({
                  seriesId,
                  rule,
                  revision: ruleRevision,
                })
              }
              onStop={() => manageTask.stopSeries(seriesId, ruleRevision)}
            />
          );
        })()
      )}
      {completionOpen && week !== undefined && ready !== undefined ? (
        <CompleteWeekDialog
          open
          goals={week.goals.map((goal) => goal.statement)}
          progress={ready.view.progress}
          onClose={() => {
            setCompletionOpen(false);
          }}
          onSubmit={(reflection) =>
            completeWeek.complete(week.startDate, week.revision, reflection)
          }
        />
      ) : null}
    </section>
  );
}
