import { formatDurationMinutes } from '@/shared/lib/duration';
import type { ReactNode } from 'react';

import type { HabitOccurrence } from '../model/habit';

export interface HabitRowProps {
  readonly occurrence: HabitOccurrence;
  /**
   * When provided, the whole row toggles the mark, as in the reference: an
   * unmarked habit becomes completed and the user's own mark can be undone.
   */
  readonly onToggle?: () => void;
  readonly actions?: ReactNode;
}
const LABELS = {
  pending: 'Ожидает отметки',
  completed: 'Выполнено',
  'not-completed': 'Не выполнено',
  deleted: 'Удалено',
} as const;

export function HabitRow({ occurrence, onToggle, actions }: HabitRowProps) {
  const title = occurrence.definitionSnapshot.title;
  const completed = occurrence.outcome === 'completed';
  // Presented like a task's duration: it is the same fact about the same day
  // and it feeds the same planned load (003 FR-032).
  const duration = occurrence.definitionSnapshot.durationMinutes;
  const copy = (
    <>
      <strong className="orbit-habit-row__title">{title}</strong>
      <span className="orbit-habit-row__status">
        {LABELS[occurrence.outcome]}
        {duration === undefined ? null : (
          <span className="orbit-habit-row__duration"> · {formatDurationMinutes(duration)}</span>
        )}
      </span>
    </>
  );

  return (
    <li className="orbit-habit-row" data-outcome={occurrence.outcome} data-od-id="habit-row">
      {onToggle === undefined ? (
        <span className="orbit-habit-row__copy">{copy}</span>
      ) : (
        <button
          type="button"
          className="orbit-habit-row__toggle"
          aria-pressed={completed}
          aria-label={completed ? `Снять отметку с «${title}»` : `Отметить «${title}» выполненной`}
          onClick={onToggle}
        >
          <span className="orbit-habit-row__copy">{copy}</span>
          <span className="orbit-habit-row__mark" aria-hidden="true" />
        </button>
      )}
      {actions === undefined ? null : <span className="orbit-habit-controls">{actions}</span>}
    </li>
  );
}
