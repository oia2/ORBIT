import type { ReactNode } from 'react';

import { ScoreBreakdown, type Day, type ScoreBreakdownValue } from '@/entities/planning';
import { DailyStateForm, type DailyStateDraft } from '@/features/record-daily-state';

import styles from './DayPage.module.css';

function classNames(...values: readonly (string | undefined)[]): string {
  return values.filter((value): value is string => value !== undefined).join(' ');
}

export interface DaySignalsProps {
  readonly day: Day;
  readonly score: ScoreBreakdownValue;
  readonly onSave: (draft: DailyStateDraft) => Promise<boolean>;
  readonly saveConfirmed?: boolean;
  readonly error?: string;
  /** A day later than the current local date has not started yet. */
  readonly notStarted?: boolean;
  /** Title of the next unfinished task, shown as the panel's factual state line. */
  readonly nextTaskTitle?: string;
  readonly children?: ReactNode;
}

export function DaySignals({
  day,
  score,
  onSave,
  saveConfirmed = false,
  error,
  notStarted = false,
  nextTaskTitle,
  children,
}: DaySignalsProps) {
  const stateHint =
    nextTaskTitle === undefined
      ? { label: 'Незавершённых задач', value: 'нет' }
      : { label: 'Следом:', value: nextTaskTitle };
  return (
    <>
      <div className={styles.scoreRegion} data-od-id="day-score">
        <ScoreBreakdown
          score={score}
          label="Дневной результат"
          periodStatus={notStarted && day.status === 'open' ? 'not-started' : day.status}
          size="compact"
          stateHint={stateHint}
          semantic
        />
      </div>
      {children}
      <article className={classNames(styles.card, 'orbit-card')} data-od-id="day-state">
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Состояние дня</h2>
          </div>
          <span className={styles.cardMeta}>
            {day.state === undefined ? 'не заполнено' : 'сохранено'}
          </span>
        </header>
        <DailyStateForm
          {...(day.state === undefined ? {} : { initial: day.state })}
          immutable={day.status === 'closed'}
          saveConfirmed={saveConfirmed}
          onSubmit={onSave}
        />
        {error === undefined ? null : (
          <p className={styles.cardError} role="alert">
            {error}
          </p>
        )}
      </article>
    </>
  );
}
