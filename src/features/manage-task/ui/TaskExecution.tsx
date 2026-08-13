import { useRef, useState } from 'react';

import { isDatedTaskOccurrence, type ProjectedTaskMembership } from '@/entities/planning';
import type { LocalDate } from '@/shared/lib/local-date/local-date';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import { TaskEditorDialog } from './TaskEditorDialog';
import { TaskMoveDialog } from './TaskMoveDialog';

export interface TaskExecutionProps {
  readonly task: ProjectedTaskMembership;
  readonly immutable?: boolean;
  readonly availableMoveDates: readonly LocalDate[];
  readonly onToggle: (completed: boolean) => Promise<boolean>;
  readonly onDelete: () => Promise<boolean>;
  readonly onEdit: (input: { title: string; duration: number }) => Promise<boolean>;
  readonly onMoveToBacklog: () => Promise<boolean>;
  readonly onMoveToDate: (input: {
    destinationDate: LocalDate;
    duration: number;
  }) => Promise<boolean>;
  readonly onMoveUp?: () => void;
  readonly canMoveUp?: boolean;
  readonly onEditRecurrence?: () => void;
}

export function TaskExecution({
  task,
  immutable = false,
  availableMoveDates,
  onToggle,
  onDelete,
  onEdit,
  onMoveToBacklog,
  onMoveToDate,
  onMoveUp,
  canMoveUp = false,
  onEditRecurrence,
}: TaskExecutionProps) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const occurrence = task.occurrence;
  if (!isDatedTaskOccurrence(occurrence)) return null;
  const completed = occurrence.completion === 'completed';

  const closeMenu = () => {
    if (menuRef.current !== null) menuRef.current.open = false;
  };

  return (
    <div className="orbit-task-execution">
      <label className="orbit-completion-control">
        <input
          type="checkbox"
          checked={completed}
          disabled={immutable}
          onChange={(event) => {
            void onToggle(event.target.checked);
          }}
        />
        <span className="orbit-completion-control__mark" aria-hidden="true" />
        <span className="visually-hidden">Выполнено: {occurrence.title}</span>
      </label>
      {immutable ? null : (
        <details className="orbit-action-menu" ref={menuRef}>
          <summary
            aria-label={`Действия с задачей «${occurrence.title}»`}
            title="Действия с задачей"
          >
            <Icon name="more" aria-hidden="true" />
          </summary>
          <div className="orbit-action-menu__popover" aria-label="Доступные действия">
            {onMoveUp === undefined ? null : (
              <Button
                variant="quiet"
                disabled={!canMoveUp}
                onClick={() => {
                  closeMenu();
                  onMoveUp();
                }}
              >
                <Icon name="arrow-up" aria-hidden="true" />
                Переместить вверх
              </Button>
            )}
            <Button
              variant="quiet"
              onClick={() => {
                setEditOpen(true);
              }}
            >
              <Icon name="edit" aria-hidden="true" />
              Редактировать
            </Button>
            <Button
              variant="quiet"
              disabled={completed}
              onClick={() => {
                setMoveOpen(true);
              }}
            >
              <Icon name="calendar" aria-hidden="true" />
              Переместить на дату
            </Button>
            <Button
              variant="quiet"
              disabled={completed}
              onClick={() => {
                closeMenu();
                void onMoveToBacklog();
              }}
            >
              <Icon name="backlog" aria-hidden="true" />В бэклог
            </Button>
            {onEditRecurrence === undefined ? null : (
              <Button variant="quiet" onClick={onEditRecurrence}>
                <Icon name="calendar" aria-hidden="true" />
                Изменить повтор
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => {
                closeMenu();
                void onDelete();
              }}
            >
              <Icon name="trash" aria-hidden="true" />
              Удалить
            </Button>
          </div>
        </details>
      )}
      {completed && !immutable ? (
        <p className="orbit-action-note">Чтобы переместить задачу, сначала снимите отметку.</p>
      ) : null}
      {moveOpen ? (
        <TaskMoveDialog
          open
          sourceDate={occurrence.placement.date}
          availableDates={availableMoveDates}
          initialDuration={occurrence.plannedDurationMinutes}
          onClose={() => {
            setMoveOpen(false);
          }}
          onSubmit={onMoveToDate}
        />
      ) : null}
      {editOpen ? (
        <TaskEditorDialog
          open
          date={occurrence.placement.date}
          initialTitle={occurrence.title}
          initialDuration={occurrence.plannedDurationMinutes}
          onClose={() => {
            setEditOpen(false);
          }}
          onSubmitDated={({ title, duration }) => onEdit({ title, duration })}
        />
      ) : null}
    </div>
  );
}
