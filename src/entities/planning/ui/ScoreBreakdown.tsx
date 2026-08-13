import type { ScoreBreakdown as Score } from '../model/day';
import { OrbitMetric, type OrbitMetricTone } from '@/shared/ui/orbit-metric';

export interface ScoreBreakdownProps {
  readonly score: Score;
  readonly label: 'Дневной результат' | 'Прогресс недели';
  readonly semantic?: boolean;
}

function rate(value: Score['task']): string {
  return value.rate === 'unavailable' ? 'нет данных' : `${String(Math.round(value.rate * 100))}%`;
}

export function ScoreBreakdown({ score, label, semantic = false }: ScoreBreakdownProps) {
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
        description={`Задачи ${String(score.task.completed)} из ${String(score.task.applicable)} · привычки ${String(score.habit.completed)} из ${String(score.habit.applicable)}`}
      />
      <dl className="orbit-score-breakdown__facts">
        <div className="orbit-score-breakdown__fact">
          <dt>Задачи</dt>
          <dd>
            {score.task.completed} из {score.task.applicable} · {rate(score.task)}
          </dd>
        </div>
        <div className="orbit-score-breakdown__fact">
          <dt>Привычки</dt>
          <dd>
            {score.habit.completed} из {score.habit.applicable} · {rate(score.habit)}
          </dd>
        </div>
      </dl>
      <p className="orbit-score-breakdown__formula">
        Формула: задачи 70%, привычки 30%. Состояние дня не влияет на результат.
      </p>
    </section>
  );
}
