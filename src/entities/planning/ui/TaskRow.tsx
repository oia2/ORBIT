import type { ProjectedTaskMembership } from '../model/history';
import type { TaskPlanEntry } from '../model/task';
import { formatDurationMinutes } from '@/shared/lib/duration';
import type { ReactNode } from 'react';

export interface TaskRowProps {
  readonly task: ProjectedTaskMembership;
  readonly actions?: ReactNode;
}

/**
 * What actually happened to the task on this date. A closed day has no live
 * controls left, so the recorded disposition is the only thing that can still
 * answer "was it done?".
 */
const OUTCOME_LABELS: Record<TaskPlanEntry['outcome'], string> = {
  planned: 'Запланирована',
  completed: 'Выполнена',
  'kept-unfinished': 'Осталась незавершённой',
  moved: 'Перенесена на другую дату',
  backlogged: 'Перенесена в бэклог',
  canceled: 'Отменена при закрытии',
  deleted: 'Удалена',
};

function timeRangeLabel(startTime?: string, endTime?: string): string | undefined {
  if (startTime === undefined && endTime === undefined) return undefined;
  if (startTime !== undefined && endTime !== undefined) return `${startTime}–${endTime}`;
  return startTime ?? endTime;
}

/**
 * The reference gives time a fixed leading column so titles stay aligned whether
 * or not a task carries one; an untimed task shows a neutral placeholder.
 */
function TaskTime({ range }: { readonly range?: string }) {
  if (range === undefined) {
    return (
      <time className="orbit-task-row__time" data-empty="true" aria-hidden="true">
        —
      </time>
    );
  }
  const [start, end] = range.split('–');
  return (
    <time className="orbit-task-row__time">
      <span className="orbit-task-row__time-start">{start}</span>
      {end === undefined ? null : <span className="orbit-task-row__time-end">{end}</span>}
    </time>
  );
}

export function TaskRow({ task, actions }: TaskRowProps) {
  const { occurrence, membership } = task;
  const duration =
    'plannedDurationMinutes' in occurrence ? occurrence.plannedDurationMinutes : undefined;
  const planned = membership.plannedSnapshot;
  const changedSincePlanning =
    occurrence.title !== planned.title || duration !== planned.plannedDurationMinutes;
  const timeRange = timeRangeLabel(occurrence.startTime, occurrence.endTime);
  // Only a finalized membership needs this: while the day is open the checkbox
  // already answers "was it done?", so repeating it there is noise.
  const settledOutcome = membership.finalizedAt === undefined ? undefined : membership.outcome;
  return (
    <li
      className="orbit-task-row"
      data-task-state={occurrence.state}
      {...(settledOutcome === undefined ? {} : { 'data-outcome': settledOutcome })}
      data-od-id="task-row"
    >
      <TaskTime {...(timeRange === undefined ? {} : { range: timeRange })} />
      <div className="orbit-task-row__copy">
        <strong className="orbit-task-row__title">{occurrence.title}</strong>
        {duration === undefined ? null : (
          <span className="orbit-task-row__meta">
            <span>{formatDurationMinutes(duration)}</span>
            {occurrence.isException ? <span>Изменено для этого дня</span> : null}
          </span>
        )}
        {settledOutcome === undefined ? null : (
          <span className="orbit-task-row__outcome" data-outcome={settledOutcome}>
            {OUTCOME_LABELS[settledOutcome]}
          </span>
        )}
        {changedSincePlanning ? (
          <span className="orbit-task-row__changed">
            Изначально: {planned.title}, {formatDurationMinutes(planned.plannedDurationMinutes)}
          </span>
        ) : null}
      </div>
      <div className="orbit-task-row__actions">{actions}</div>
    </li>
  );
}
