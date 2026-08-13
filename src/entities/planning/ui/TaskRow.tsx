import type { ProjectedTaskMembership } from '../model/history';
import type { ReactNode } from 'react';

export interface TaskRowProps {
  readonly task: ProjectedTaskMembership;
  readonly actions?: ReactNode;
}

export function TaskRow({ task, actions }: TaskRowProps) {
  const { occurrence } = task;
  const duration =
    'plannedDurationMinutes' in occurrence ? occurrence.plannedDurationMinutes : undefined;
  const planned = task.membership.plannedSnapshot;
  const changedSincePlanning =
    occurrence.title !== planned.title || duration !== planned.plannedDurationMinutes;
  return (
    <li className="orbit-task-row" data-task-state={occurrence.state} data-od-id="task-row">
      <div className="orbit-task-row__copy">
        <strong className="orbit-task-row__title">{occurrence.title}</strong>
        {duration === undefined ? null : (
          <span className="orbit-task-row__meta">
            <span>{String(duration)} мин</span>
            {occurrence.isException ? <span>Изменено для этого дня</span> : null}
          </span>
        )}
        {changedSincePlanning ? (
          <span className="orbit-task-row__changed">
            Изначально: {planned.title}, {String(planned.plannedDurationMinutes)} мин
          </span>
        ) : null}
      </div>
      <div className="orbit-task-row__actions">{actions}</div>
    </li>
  );
}
