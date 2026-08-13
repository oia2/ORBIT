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
  readonly children?: ReactNode;
}

export function DaySignals({
  day,
  score,
  onSave,
  saveConfirmed = false,
  error,
  children,
}: DaySignalsProps) {
  return (
    <>
      <div className={styles.scoreRegion} data-od-id="day-score">
        <ScoreBreakdown score={score} label="Дневной результат" semantic />
      </div>
      {children}
      <article className={classNames(styles.card, 'orbit-card')} data-od-id="day-state">
        <header className={classNames(styles.cardHeader, styles.dividedHeader)}>
          <div>
            <h2 className={styles.cardTitle}>Состояние дня</h2>
            <p className={styles.cardNote}>Контекст, не часть результата</p>
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
