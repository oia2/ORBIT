import { useState } from 'react';
import { Link } from 'react-router';

import { HabitRow, TaskRow, type HabitOccurrence } from '@/entities/planning';
import { CloseDayDialog, useCloseDay } from '@/features/close-day';
import { ReopenDayDialog, useReopenDay } from '@/features/reopen-day';
import {
  HabitOutcomeControl,
  HabitRecurrenceDialog,
  useHabitOutcome,
  useManageHabit,
} from '@/features/manage-habit';
import { TaskEditorDialog, TaskExecution, useManageTask } from '@/features/manage-task';
import { useRecordDailyState } from '@/features/record-daily-state';
import { formatDurationMinutes } from '@/shared/lib/duration';
import { createSystemClock, type ApplicationClock } from '@/shared/lib/local-date/clock';
import {
  addDays,
  compareLocalDates,
  formatLocalDate,
  isoWeekday,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';
import { Button } from '@/shared/ui/button';

import { useDayPage } from '../model/use-day-page';
import styles from './DayPage.module.css';
import { DaySignals } from './DaySignals';

export interface DayPageProps {
  readonly date: LocalDate;
  readonly clock?: ApplicationClock;
}

function taskNoun(value: number): string {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'задач';
  if (absolute % 10 === 1) return 'задача';
  if (absolute % 10 >= 2 && absolute % 10 <= 4) return 'задачи';
  return 'задач';
}

function adjacentDate(date: LocalDate, amount: -1 | 1): LocalDate | undefined {
  try {
    return addDays(date, amount);
  } catch {
    return undefined;
  }
}

function dayPath(date: LocalDate): string {
  return `/day/${date}`;
}

function classNames(...values: readonly (string | undefined)[]): string {
  return values.filter((value): value is string => value !== undefined).join(' ');
}

function Chevron({ direction }: { readonly direction: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

export function DayPage({ date, clock = createSystemClock() }: DayPageProps) {
  const { state, reload } = useDayPage(date);
  const [editorOpen, setEditorOpen] = useState(false);
  const [habitEditorOpen, setHabitEditorOpen] = useState(false);
  const [habitSeriesEditor, setHabitSeriesEditor] = useState<HabitOccurrence>();
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const manageTask = useManageTask(reload);
  const manageHabit = useManageHabit(reload);
  const habitOutcome = useHabitOutcome(reload);
  const closeDay = useCloseDay(reload);
  const reopenDay = useReopenDay(reload);
  const dailyState = useRecordDailyState(reload);
  const ready = state.status === 'ready' ? state.view : undefined;
  const availableMoveDates = state.status === 'ready' ? state.availableMoveDates : [];
  const currentDate = clock.currentLocalDate();
  const isToday = compareLocalDates(date, currentDate) === 0;
  const previousDate = adjacentDate(date, -1);
  const nextDate = adjacentDate(date, 1);
  const completedTaskCount =
    ready?.tasks.filter(
      ({ occurrence }) => 'completion' in occurrence && occurrence.completion === 'completed',
    ).length ?? 0;
  const taskCount = ready?.tasks.length ?? 0;
  const nextTaskTitle = ready?.tasks.find(
    ({ occurrence }) => 'completion' in occurrence && occurrence.completion === 'incomplete',
  )?.occurrence.title;
  // A deleted occurrence stays in the projection for history, but the day's
  // own list only shows the habits that still apply to it.
  const visibleHabits = ready?.habits.filter((habit) => habit.outcome !== 'deleted') ?? [];
  const load = Number(ready?.plannedLoadMinutes ?? 0);
  const dateEyebrow = formatLocalDate(date, 'ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).replace(',', ' ·');
  const dateLabel = formatLocalDate(date, 'ru-RU', { day: 'numeric', month: 'long' });

  return (
    <section className={styles.page}>
      <header className={classNames(styles.header, 'orbit-page-header')} data-od-id="day-header">
        <div className="orbit-page-header__copy">
          <p className="orbit-eyebrow">{dateEyebrow}</p>
          <h1 className="orbit-page-title">{isToday ? 'Сегодня' : 'День'}</h1>
          <p className="orbit-page-note">
            {ready === undefined
              ? 'План на выбранную дату.'
              : taskCount === 0
                ? 'В плане пока нет задач.'
                : `В плане ${String(taskCount)} ${taskNoun(taskCount)} · ${formatDurationMinutes(load)}.`}
          </p>
        </div>
        <nav className={styles.headerActions} aria-label="Навигация по дням и создание задачи">
          {previousDate === undefined ? (
            <span className={styles.dayNavLink} aria-disabled="true">
              <Chevron direction="left" />
            </span>
          ) : (
            <Link
              className={styles.dayNavLink}
              to={dayPath(previousDate)}
              aria-label="Предыдущий день"
            >
              <Chevron direction="left" />
            </Link>
          )}
          <Link
            className={styles.dateLink}
            to={dayPath(currentDate)}
            aria-label={isToday ? `Сегодня, ${dateLabel}` : 'Перейти к сегодняшнему дню'}
          >
            {dateLabel}
          </Link>
          {nextDate === undefined ? (
            <span className={styles.dayNavLink} aria-disabled="true">
              <Chevron direction="right" />
            </span>
          ) : (
            <Link className={styles.dayNavLink} to={dayPath(nextDate)} aria-label="Следующий день">
              <Chevron direction="right" />
            </Link>
          )}
        </nav>
      </header>

      {state.status === 'loading' ? (
        <div className={styles.runtimeState} role="status">
          Загружаем день…
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div className={styles.runtimeState} role="alert">
          <p>{state.message}</p>
          <Button onClick={() => void reload()}>Повторить</Button>
        </div>
      ) : null}

      {ready === undefined ? null : (
        <section className={styles.layout} aria-label="План дня" data-od-id="day-layout">
          <div className={styles.mainColumn}>
            <article className={classNames(styles.card, 'orbit-card')} data-od-id="day-load">
              <header className={styles.cardHeader}>
                <div>
                  <p className={styles.cardEyebrow}>План дня</p>
                  <h2 className={styles.cardTitle}>Плановая нагрузка</h2>
                </div>
                <span className="orbit-period-status" data-status={ready.day.status}>
                  {ready.day.status === 'open' ? 'День открыт' : 'День закрыт'}
                </span>
              </header>
              <div className={styles.loadFacts}>
                <div>
                  <strong>{formatDurationMinutes(load)}</strong>
                  <span>в задачах и привычках</span>
                </div>
                <div>
                  <strong>{String(taskCount)}</strong>
                  <span>{taskNoun(taskCount)} в плане</span>
                </div>
                <div>
                  <strong>
                    {String(completedTaskCount)} / {String(taskCount)}
                  </strong>
                  <span>выполнено</span>
                </div>
              </div>
            </article>

            <article className={classNames(styles.card, 'orbit-card')} data-od-id="day-tasks">
              <header className={classNames(styles.cardHeader, styles.dividedHeader)}>
                <div>
                  <h2 className={styles.cardTitle}>Задачи</h2>
                </div>
                <Button
                  className={styles.newTask}
                  aria-label="Добавить задачу"
                  disabled={ready.day.status !== 'open'}
                  onClick={() => {
                    setEditorOpen(true);
                  }}
                >
                  Новая задача
                </Button>
              </header>
              {ready.tasks.length === 0 ? (
                <div className="orbit-empty-state">
                  <strong>На этот день задач нет</strong>
                  <p>Новая задача появится здесь и сразу войдёт в плановую нагрузку.</p>
                </div>
              ) : (
                <ul className={styles.tasks} aria-label="Задачи">
                  {ready.tasks.map((task, index) => (
                    <TaskRow
                      key={task.occurrence.id}
                      task={task}
                      {...(ready.day.status === 'open'
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
                          availableMoveDates={availableMoveDates}
                          immutable={ready.day.status !== 'open'}
                          canMoveUp={index > 0}
                          {...(ready.day.status === 'closed'
                            ? {}
                            : {
                                onMoveUp: () => {
                                  if (index === 0) return;
                                  const ids = ready.tasks.map((item) => item.occurrence.id);
                                  const currentId = ids[index];
                                  const previousId = ids[index - 1];
                                  if (currentId === undefined || previousId === undefined) return;
                                  ids[index - 1] = currentId;
                                  ids[index] = previousId;
                                  void manageTask.reorderDated(date, ids, ready.day.revision);
                                },
                              })}
                          onToggle={(completed) =>
                            manageTask.toggleCompletion({
                              occurrenceId: task.occurrence.id,
                              date,
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
                            manageTask.moveToBacklog(task.occurrence.id, task.occurrence.revision)
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
              {manageTask.error === undefined ? null : (
                <p className={styles.cardError} role="alert">
                  {manageTask.error}
                </p>
              )}
            </article>

            <section
              className={classNames(styles.card, styles.closeDay, 'orbit-card')}
              aria-labelledby="close-day-title"
              data-od-id="close-day"
            >
              <div>
                <p className={styles.cardEyebrow}>Итог дня</p>
                <h2 className={styles.cardTitle} id="close-day-title">
                  {ready.day.status === 'closed' ? 'День закрыт' : 'Закрыть день'}
                </h2>
                {ready.day.status === 'closed' ? (
                  <p className={styles.closeNote}>
                    Результат и плановая нагрузка зафиксированы. День можно открыть заново, если
                    нужно что-то исправить.
                  </p>
                ) : compareLocalDates(date, currentDate) > 0 ? (
                  <p className={styles.closeNote}>Будущий день пока нельзя закрыть.</p>
                ) : null}
              </div>
              {ready.day.status !== 'closed' && compareLocalDates(date, currentDate) <= 0 ? (
                <Button
                  onClick={() => {
                    setCloseDialogOpen(true);
                  }}
                >
                  Закрыть день
                </Button>
              ) : null}
              {ready.day.status === 'closed' ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    reopenDay.clearError();
                    setReopenDialogOpen(true);
                  }}
                >
                  Открыть день заново
                </Button>
              ) : null}
              {closeDay.error === undefined ? null : (
                <p className={styles.cardError} role="alert">
                  {closeDay.error}
                </p>
              )}
              {reopenDay.error === undefined ? null : (
                <p className={styles.cardError} role="alert">
                  {reopenDay.error}
                </p>
              )}
            </section>
          </div>

          <aside className={styles.sideColumn} aria-label="Результат, привычки и состояние">
            <DaySignals
              day={ready.day}
              score={ready.score}
              notStarted={compareLocalDates(date, currentDate) > 0}
              {...(nextTaskTitle === undefined ? {} : { nextTaskTitle })}
              saveConfirmed={dailyState.saved}
              {...(dailyState.error === undefined ? {} : { error: dailyState.error })}
              onSave={(draft) => dailyState.save({ date, revision: ready.day.revision, ...draft })}
            >
              <article className={classNames(styles.card, 'orbit-card')} data-od-id="day-habits">
                <header className={classNames(styles.cardHeader, styles.dividedHeader)}>
                  <div>
                    <h2 className={styles.cardTitle}>Привычки сегодня</h2>
                  </div>
                  <Button
                    className={styles.cardAction}
                    aria-label="Добавить привычку"
                    disabled={ready.day.status !== 'open'}
                    variant="quiet"
                    onClick={() => {
                      setHabitEditorOpen(true);
                    }}
                  >
                    Добавить
                  </Button>
                </header>
                {visibleHabits.length === 0 ? (
                  <div className="orbit-empty-state">
                    <strong>На сегодня привычек нет</strong>
                    <p>Добавьте повтор, и отметка появится в подходящие дни.</p>
                  </div>
                ) : (
                  <ul className={styles.habits} aria-label="Привычки">
                    {visibleHabits.map((occurrence) => (
                      <HabitRow
                        key={occurrence.id}
                        occurrence={occurrence}
                        {...(ready.day.status === 'open' &&
                        (occurrence.outcome === 'pending' || occurrence.outcome === 'completed')
                          ? {
                              onToggle: () => {
                                void (occurrence.outcome === 'completed'
                                  ? habitOutcome.clear(occurrence.id, ready.day.revision)
                                  : habitOutcome.record(
                                      occurrence.id,
                                      'completed',
                                      ready.day.revision,
                                    ));
                              },
                            }
                          : {})}
                        actions={
                          <HabitOutcomeControl
                            occurrence={occurrence}
                            dayStatus={ready.day.status}
                            onCorrect={() =>
                              habitOutcome.correct(occurrence.id, ready.day.revision)
                            }
                            onDelete={() => habitOutcome.remove(occurrence.id, ready.day.revision)}
                            onEdit={(title) =>
                              habitOutcome.edit(occurrence.id, title, ready.day.revision)
                            }
                            onEditSeries={() => {
                              setHabitSeriesEditor(occurrence);
                            }}
                            onStopSeries={() =>
                              manageHabit.stop(occurrence.definitionId, occurrence.ruleRevision)
                            }
                          />
                        }
                      />
                    ))}
                  </ul>
                )}
                <footer className={styles.cardFooter}>
                  {String(
                    visibleHabits.filter((occurrence) => occurrence.outcome === 'completed').length,
                  )}{' '}
                  / {String(visibleHabits.length)} выполнено
                </footer>
                {manageHabit.error === undefined ? null : (
                  <p className={styles.cardError} role="alert">
                    {manageHabit.error}
                  </p>
                )}
                {habitOutcome.error === undefined ? null : (
                  <p className={styles.cardError} role="alert">
                    {habitOutcome.error}
                  </p>
                )}
              </article>
            </DaySignals>
          </aside>
        </section>
      )}

      {editorOpen ? (
        <TaskEditorDialog
          open
          date={date}
          nextPosition={ready?.tasks.length ?? 0}
          onClose={() => {
            setEditorOpen(false);
          }}
          onSubmitDated={(input) => manageTask.createDated({ date, ...input })}
        />
      ) : null}
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
      {reopenDialogOpen && ready !== undefined ? (
        <ReopenDayDialog
          open
          onClose={() => {
            setReopenDialogOpen(false);
          }}
          onConfirm={() => reopenDay.reopen({ date, revision: ready.day.revision })}
        />
      ) : null}
      {closeDialogOpen && ready !== undefined ? (
        <CloseDayDialog
          open
          view={ready}
          availableMoveDates={availableMoveDates}
          onClose={() => {
            setCloseDialogOpen(false);
          }}
          onSubmit={(dispositions) =>
            closeDay.close({ date, revision: ready.day.revision, dispositions })
          }
          onRecordHabit={(habit, outcome) =>
            habitOutcome.record(habit.id, outcome, ready.day.revision)
          }
        />
      ) : null}
    </section>
  );
}
