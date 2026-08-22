import type { ScoreBreakdown as Score } from '../model/day';
import {
  OrbitMetric,
  type OrbitMetricPeriodStatus,
  type OrbitMetricTone,
} from '@/shared/ui/orbit-metric';

export interface ScoreBreakdownProps {
  readonly score: Score;
  readonly label: 'Дневной результат' | 'Прогресс недели';
  /** Drives the ring's status word: no data yet, still live, or finalized. */
  readonly periodStatus: OrbitMetricPeriodStatus;
  readonly size?: 'default' | 'compact';
  /** Factual hint anchored bottom-right inside the ring panel. */
  readonly stateHint?: { readonly label: string; readonly value: string };
  readonly semantic?: boolean;
}

const CONTEXT_BY_LABEL: Record<ScoreBreakdownProps['label'], string> = {
  'Дневной результат': 'Задачи и привычки сегодня',
  'Прогресс недели': 'Задачи и привычки недели',
};

function rate(value: Score['task']): string {
  return value.rate === 'unavailable' ? 'нет данных' : `${String(Math.round(value.rate * 100))}%`;
}

function ratePercent(value: Score['task']): number {
  return value.rate === 'unavailable' ? 0 : Math.round(value.rate * 100);
}

export function ScoreBreakdown({
  score,
  label,
  periodStatus,
  size = 'default',
  stateHint,
  semantic = false,
}: ScoreBreakdownProps) {
  const tone: OrbitMetricTone =
    score.value === 'unavailable' || !semantic
      ? 'neutral'
      : score.value >= 70
        ? 'good'
        : score.value >= 50
          ? 'warning'
          : 'low';
  return (
    <section className="orbit-score-breakdown" aria-label={label} data-score-tone={tone}>
      <OrbitMetric
        label={label}
        value={score.value}
        tone={tone}
        periodStatus={periodStatus}
        size={size}
        contextLabel={CONTEXT_BY_LABEL[label]}
        {...(stateHint === undefined ? {} : { stateHint })}
      />
      <div className="orbit-score-breakdown__parts">
        <div className="orbit-score-breakdown__part">
          <div className="orbit-score-breakdown__part-line">
            <span>Задачи</span>
            <strong>
              {score.task.completed} из {score.task.applicable}
              <small>{rate(score.task)}</small>
            </strong>
          </div>
          <div className="orbit-score-breakdown__part-track">
            <span style={{ width: `${String(ratePercent(score.task))}%` }} />
          </div>
        </div>
        <div className="orbit-score-breakdown__part">
          <div className="orbit-score-breakdown__part-line">
            <span>Привычки</span>
            <strong>
              {score.habit.completed} из {score.habit.applicable}
              <small>{rate(score.habit)}</small>
            </strong>
          </div>
          <div className="orbit-score-breakdown__part-track">
            <span style={{ width: `${String(ratePercent(score.habit))}%` }} />
          </div>
        </div>
      </div>
      <details className="orbit-score-breakdown__formula">
        <summary>Как считается результат</summary>
        <p>
          Каждая задача и каждая привычка весят одинаково: результат — доля выполненного из всего
          запланированного. Состояние дня не влияет на результат.
        </p>
      </details>
    </section>
  );
}
