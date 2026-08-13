import type { CSSProperties } from 'react';
import { Link } from 'react-router';

import type { HistoricalDayFacts } from '@/entities/planning';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import {
  addDays,
  endOfWeek,
  formatLocalDate,
  getLocalDateParts,
  isoWeekday,
  startOfWeek,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';
import { Button } from '@/shared/ui/button';

import { useHistoryPage, type HistoryMode, type HistoryPoint } from '../model/use-history-page';
import styles from './HistoryPage.module.css';

export interface HistoryPageProps {
  readonly clock: ApplicationClock;
}

const MODE_LABELS: Readonly<Record<HistoryMode, string>> = {
  day: 'День',
  week: 'Неделя',
  month: 'Месяц',
};

const WEEKDAY_LABELS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'] as const;

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}

function periodTitle(mode: HistoryMode, selectedDate: LocalDate): string {
  if (mode === 'day') {
    return capitalize(
      formatLocalDate(selectedDate, 'ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    );
  }
  if (mode === 'week') {
    const start = startOfWeek(selectedDate);
    const end = endOfWeek(selectedDate);
    return `${formatLocalDate(start, 'ru-RU', { day: 'numeric' })}—${formatLocalDate(end, 'ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`;
  }
  return capitalize(
    formatLocalDate(selectedDate, 'ru-RU', { month: 'long', year: 'numeric' }).replace(
      /\s+г\.$/u,
      '',
    ),
  );
}

export function HistoryPage({ clock }: HistoryPageProps) {
  const history = useHistoryPage(clock);
  const ready = history.state.status === 'ready' ? history.state : undefined;

  return (
    <section className={styles.page} data-od-id="history-page">
      <header className={styles.header} data-od-id="history-header">
        <div className={styles.headingGroup}>
          <p className={styles.eyebrow}>История и динамика</p>
          <h1>{periodTitle(history.mode, history.selectedDate)}</h1>
          <p className={styles.intro}>
            Выбранная дата: {formatLocalDate(history.selectedDate)}. Сверяйте план с фактом без
            изменения прошлых записей.
          </p>
        </div>
        <div className={styles.periodControls} aria-label="Навигация по истории">
          <Button
            variant="secondary"
            aria-label="Предыдущий период"
            onClick={() => {
              history.step(-1);
            }}
          >
            ←
          </Button>
          <div className={styles.modeSwitch} role="group" aria-label="Масштаб истории">
            {(Object.keys(MODE_LABELS) as HistoryMode[]).map((mode) => (
              <button
                className={styles.modeButton}
                key={mode}
                type="button"
                aria-pressed={history.mode === mode}
                onClick={() => {
                  history.setMode(mode);
                }}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            aria-label="Следующий период"
            onClick={() => {
              history.step(1);
            }}
          >
            →
          </Button>
        </div>
      </header>

      {history.state.status === 'loading' ? (
        <section className={styles.systemState} role="status">
          <span className={styles.stateMark} aria-hidden="true" />
          <h2>Загружаем историю</h2>
          <p>Собираем факты выбранного периода на этом устройстве…</p>
        </section>
      ) : null}
      {history.state.status === 'error' ? (
        <section className={styles.systemState} role="alert">
          <span className={styles.stateMark} aria-hidden="true" />
          <h2>История временно недоступна</h2>
          <p>{history.state.message}</p>
          <Button
            onClick={() => {
              void history.reload();
            }}
          >
            Повторить
          </Button>
        </section>
      ) : null}

      {ready === undefined ? null : (
        <div className={styles.historyLayout} data-od-id="history-layout">
          {ready.view.mode === 'month' ? (
            <MonthCalendar
              cells={ready.view.calendar}
              monthStart={ready.view.monthStart}
              monthEnd={ready.view.monthEnd}
              selectedDate={history.selectedDate}
              onSelect={history.selectDate}
            />
          ) : ready.view.mode === 'week' ? (
            <WeekOverview facts={ready.view.facts.days} selectedDate={history.selectedDate} />
          ) : (
            <DayContext facts={ready.view.facts} />
          )}

          <SelectedFacts
            {...(() => {
              const facts =
                ready.view.mode === 'month'
                  ? ready.view.selectedDay
                  : ready.view.mode === 'day'
                    ? ready.view.facts
                    : (ready.view.facts.days.find(
                        (item) => item.day.date === history.selectedDate,
                      ) ?? ready.view.facts.days[0]);
              return facts === undefined ? {} : { facts };
            })()}
            {...(ready.view.mode === 'week' && ready.view.facts.reflection !== undefined
              ? { reflection: ready.view.facts.reflection }
              : {})}
          />

          {history.mode === 'day' ? null : <Dynamics mode={history.mode} points={ready.dynamics} />}
        </div>
      )}
    </section>
  );
}

interface MonthCalendarProps {
  readonly cells: readonly {
    readonly date: LocalDate;
    readonly belongsToMonth: boolean;
    readonly dayStatus?: 'open' | 'closed';
    readonly score?: HistoricalDayFacts['score'];
  }[];
  readonly monthStart: LocalDate;
  readonly monthEnd: LocalDate;
  readonly selectedDate: LocalDate;
  readonly onSelect: (date: LocalDate) => void;
}

function MonthCalendar({
  cells,
  monthStart,
  monthEnd,
  selectedDate,
  onSelect,
}: MonthCalendarProps) {
  const leadingCount = isoWeekday(monthStart) - 1;
  const trailingCount = 7 - isoWeekday(monthEnd);
  const leading = Array.from({ length: leadingCount }, (_, index) =>
    addDays(monthStart, index - leadingCount),
  );
  const trailing = Array.from({ length: trailingCount }, (_, index) =>
    addDays(monthEnd, index + 1),
  );

  return (
    <section className={styles.calendarCard} data-od-id="history-calendar">
      <header className={styles.cardHeader}>
        <h2>Календарь</h2>
        <div className={styles.legend} aria-label="Обозначения результата">
          <span data-tone="good">70–100</span>
          <span data-tone="warning">50–69</span>
          <span data-tone="low">до 49</span>
        </div>
      </header>
      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className={styles.calendarGrid} role="group" aria-label="Календарь месяца">
        {leading.map((date) => (
          <span className={styles.outsideCell} key={date} aria-hidden="true">
            {String(getLocalDateParts(date).day)}
          </span>
        ))}
        {cells.map((cell) => {
          const tone = scoreTone(cell.score?.value);
          const isSelected = cell.date === selectedDate;
          return (
            <button
              className={styles.calendarCell}
              key={cell.date}
              type="button"
              aria-label={formatLocalDate(cell.date)}
              aria-pressed={isSelected}
              data-day-status={cell.dayStatus ?? 'none'}
              data-score-tone={tone}
              data-od-id={`history-calendar-day-${cell.date}`}
              onClick={() => {
                onSelect(cell.date);
              }}
            >
              <span className={styles.dayNumber}>{String(getLocalDateParts(cell.date).day)}</span>
              <span className={styles.cellResult}>
                {cell.score?.value === undefined || cell.score.value === 'unavailable'
                  ? '—'
                  : String(cell.score.value)}
              </span>
              <span className={styles.cellSignal} aria-hidden="true" />
            </button>
          );
        })}
        {trailing.map((date) => (
          <span className={styles.outsideCell} key={date} aria-hidden="true">
            {String(getLocalDateParts(date).day)}
          </span>
        ))}
      </div>
    </section>
  );
}

function WeekOverview({
  facts,
  selectedDate,
}: {
  readonly facts: readonly HistoricalDayFacts[];
  readonly selectedDate: LocalDate;
}) {
  return (
    <section className={styles.calendarCard} data-od-id="history-calendar">
      <header className={styles.cardHeader}>
        <h2>Дни недели</h2>
        <span className={styles.cardMeta}>Пн—Вс</span>
      </header>
      <div className={styles.weekOverview}>
        {facts.map((item) => (
          <Link
            className={styles.weekDay}
            key={item.day.date}
            data-current={item.day.date === selectedDate}
            to={`/day/${item.day.date}`}
          >
            <span>{formatLocalDate(item.day.date, 'ru-RU', { weekday: 'short' })}</span>
            <strong>
              {item.score.value === 'unavailable' ? '—' : `${String(item.score.value)}%`}
            </strong>
            <small>{item.tasks.length} задач</small>
          </Link>
        ))}
      </div>
    </section>
  );
}

function DayContext({ facts }: { readonly facts: HistoricalDayFacts }) {
  return (
    <section className={styles.calendarCard} data-od-id="history-calendar">
      <header className={styles.cardHeader}>
        <h2>День</h2>
        <span className={styles.cardMeta}>
          {facts.day.status === 'closed' ? 'Закрыт' : 'Открыт'}
        </span>
      </header>
      <div className={styles.dayContext}>
        <strong>{formatLocalDate(facts.day.date, 'ru-RU', { weekday: 'long' })}</strong>
        <span>{facts.tasks.length} задач</span>
        <span>{facts.habits.length} привычек</span>
        <span>{String(facts.plannedLoadMinutes)} мин в плане</span>
      </div>
    </section>
  );
}

function SelectedFacts({
  facts,
  reflection,
}: {
  readonly facts?: HistoricalDayFacts;
  readonly reflection?: string;
}) {
  if (facts === undefined) {
    return (
      <section className={styles.selectedCard} data-od-id="history-selected-day">
        <div className={styles.emptyState}>
          <h2>Нет фактов выбранного дня</h2>
          <p>Выберите другой день этого периода.</p>
        </div>
      </section>
    );
  }

  const score = facts.score.value;
  return (
    <section className={styles.selectedCard} data-od-id="history-selected-day">
      <header className={styles.cardHeader}>
        <h2>Выбранный день</h2>
        <Link className={styles.openLink} to={`/day/${facts.day.date}`}>
          Открыть день →
        </Link>
      </header>
      <div className={styles.selectedBody}>
        <div className={styles.selectedTitleRow}>
          <div>
            <h3>
              {capitalize(
                formatLocalDate(facts.day.date, 'ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }),
              )}
            </h3>
            <p>
              {facts.day.status === 'closed'
                ? 'Факты дня сохранены и доступны только для просмотра.'
                : 'День ещё открыт; факты обновляются вместе с текущим планом.'}
            </p>
          </div>
          <span className={styles.statusChip} data-status={facts.day.status}>
            {facts.day.status === 'closed' ? 'Закрыт' : 'В процессе'}
          </span>
        </div>

        <div className={styles.factStats} aria-label="Итоги выбранного дня">
          <div>
            <span>Результат</span>
            <strong>{score === 'unavailable' ? '—' : `${String(score)}%`}</strong>
          </div>
          <div>
            <span>Плановая нагрузка</span>
            <strong>{String(facts.plannedLoadMinutes)} мин</strong>
          </div>
          <div>
            <span>Задачи</span>
            <strong>
              {facts.score.task.completed} / {facts.score.task.applicable}
            </strong>
          </div>
          <div>
            <span>Привычки</span>
            <strong>
              {facts.score.habit.completed} / {facts.score.habit.applicable}
            </strong>
          </div>
        </div>
        <p className={styles.formulaNote}>
          Результат: задачи 70%, привычки 30%. Состояние не влияет.
        </p>

        {facts.tasks.length === 0 && facts.habits.length === 0 ? (
          <div className={styles.emptyState}>
            <h4>На этот день нет записей</h4>
            <p>Задачи и привычки появятся здесь, когда для даты будут факты.</p>
          </div>
        ) : (
          <div className={styles.factColumns}>
            <section aria-labelledby={`history-tasks-${facts.day.date}`}>
              <h4 id={`history-tasks-${facts.day.date}`}>Задачи</h4>
              {facts.tasks.length === 0 ? (
                <p className={styles.inlineEmpty}>Нет запланированных задач</p>
              ) : (
                <ul className={styles.factList}>
                  {facts.tasks.map((task) => (
                    <li
                      key={task.membership.id}
                      data-outcome={task.explanation.disposition.outcome}
                    >
                      <span className={styles.factMarker} aria-hidden="true" />
                      <span>
                        <strong>{task.explanation.planned.title}</strong>
                        <small>{taskOutcomeLabel(task.explanation.disposition.outcome)}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby={`history-habits-${facts.day.date}`}>
              <h4 id={`history-habits-${facts.day.date}`}>Привычки</h4>
              {facts.habits.length === 0 ? (
                <p className={styles.inlineEmpty}>Нет привычек на этот день</p>
              ) : (
                <ul className={styles.factList}>
                  {facts.habits.map((habit) => (
                    <li key={habit.id} data-outcome={habit.outcome}>
                      <span className={styles.factMarker} aria-hidden="true" />
                      <span>
                        <strong>{habit.definitionSnapshot.title}</strong>
                        <small>{habitOutcomeLabel(habit.outcome)}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <dl className={styles.stateFacts}>
          <div>
            <dt>Энергия</dt>
            <dd>{facts.day.state?.energy ?? 'не указана'}</dd>
          </div>
          <div>
            <dt>Настроение</dt>
            <dd>{facts.day.state?.mood ?? 'не указано'}</dd>
          </div>
          <div>
            <dt>Сон</dt>
            <dd>
              {facts.day.state?.sleepDurationMinutes === undefined
                ? 'не указан'
                : `${String(Math.round(facts.day.state.sleepDurationMinutes / 6) / 10)} ч`}
            </dd>
          </div>
        </dl>
        {reflection === undefined ? null : (
          <p className={styles.reflection}>Рефлексия недели: {reflection}</p>
        )}
        <p className={styles.relatedLink}>
          <Link to={`/week/${facts.day.weekStart}`}>Открыть неделю</Link>
        </p>
      </div>
    </section>
  );
}

function Dynamics({
  mode,
  points,
}: {
  readonly mode: 'week' | 'month';
  readonly points: readonly HistoryPoint[];
}) {
  const scope = mode === 'week' ? 'последние 8 недель' : 'последние 6 месяцев';
  const hasData = points.some(
    (point) =>
      point.taskRate !== 'unavailable' ||
      point.habitRate !== 'unavailable' ||
      point.score !== 'unavailable',
  );
  return (
    <section className={styles.dynamicsCard} data-od-id="history-dynamics" aria-label="Динамика">
      <header className={styles.dynamicsHeader}>
        <div>
          <h2>Динамика</h2>
          <p>Только фактические показатели со сформированными данными.</p>
        </div>
        <span>{scope}</span>
      </header>
      {hasData ? (
        <>
          <div className={styles.chartLegend} aria-hidden="true">
            <span data-series="tasks">Задачи</span>
            <span data-series="habits">Привычки</span>
            <span data-series="score">Результат 70/30</span>
          </div>
          <ol className={styles.dynamicsChart} aria-label={`Динамика — ${scope}`}>
            {points.map((item) => {
              const task = toPercent(item.taskRate);
              const habit = toPercent(item.habitRate);
              const score = item.score === 'unavailable' ? undefined : item.score;
              const barStyle = {
                '--task-height': `${String(task ?? 0)}%`,
                '--habit-height': `${String(habit ?? 0)}%`,
                '--score-height': `${String(score ?? 0)}%`,
              } as CSSProperties;
              return (
                <li key={item.label} style={barStyle}>
                  <span className={styles.chartValues}>
                    <span>{formatPercent(task)}</span>
                    <span>{formatPercent(habit)}</span>
                    <span>{formatPercent(score)}</span>
                  </span>
                  <span className={styles.barGroup} aria-hidden="true">
                    <span data-series="tasks" />
                    <span data-series="habits" />
                    <span data-series="score" />
                  </span>
                  <time dateTime={item.label}>{dynamicsLabel(item.label, mode)}</time>
                  <span className={styles.srOnly}>
                    {item.label}: задачи {formatPercent(task)}; привычки {formatPercent(habit)};
                    результат {formatPercent(score)}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <div className={styles.dynamicsEmpty} role="status">
          <span aria-hidden="true">—</span>
          <strong>Данных для динамики пока нет</strong>
          <p>Здесь появятся фактические показатели после завершения периодов.</p>
        </div>
      )}
    </section>
  );
}

function toPercent(value: number | 'unavailable'): number | undefined {
  return value === 'unavailable' ? undefined : Math.round(value * 100);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? '—' : `${String(value)}%`;
}

function dynamicsLabel(date: LocalDate, mode: 'week' | 'month'): string {
  return mode === 'week'
    ? formatLocalDate(date, 'ru-RU', { day: 'numeric', month: 'short' })
    : formatLocalDate(date, 'ru-RU', { month: 'short' });
}

function scoreTone(value: number | 'unavailable' | undefined): 'none' | 'good' | 'warning' | 'low' {
  if (value === undefined || value === 'unavailable') return 'none';
  if (value >= 70) return 'good';
  if (value >= 50) return 'warning';
  return 'low';
}

function taskOutcomeLabel(
  outcome: HistoricalDayFacts['tasks'][number]['explanation']['disposition']['outcome'],
) {
  const labels = {
    planned: 'запланирована',
    completed: 'выполнена',
    moved: 'перенесена на другую дату',
    backlogged: 'перенесена в бэклог',
    canceled: 'отменена при закрытии дня',
    'kept-unfinished': 'оставлена незавершённой',
    deleted: 'удалена',
  } as const;
  return labels[outcome];
}

function habitOutcomeLabel(outcome: HistoricalDayFacts['habits'][number]['outcome']): string {
  const labels = {
    pending: 'ожидает отметки',
    completed: 'выполнена',
    'not-completed': 'не выполнена',
    deleted: 'удалена',
  } as const;
  return labels[outcome];
}
