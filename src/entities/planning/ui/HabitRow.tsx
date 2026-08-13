import type { ReactNode } from 'react';

import type { HabitOccurrence } from '../model/habit';

export interface HabitRowProps {
  readonly occurrence: HabitOccurrence;
  readonly actions?: ReactNode;
}
const LABELS = {
  pending: 'Ожидает отметки',
  completed: 'Выполнено',
  'not-completed': 'Не выполнено',
  deleted: 'Удалено',
} as const;
export function HabitRow({ occurrence, actions }: HabitRowProps) {
  return (
    <li className="orbit-habit-row" data-outcome={occurrence.outcome} data-od-id="habit-row">
      <span>
        <strong className="orbit-habit-row__title">{occurrence.definitionSnapshot.title}</strong>
        <span className="orbit-habit-row__status">{LABELS[occurrence.outcome]}</span>
      </span>
      {actions === undefined ? null : <span className="orbit-habit-controls">{actions}</span>}
    </li>
  );
}
