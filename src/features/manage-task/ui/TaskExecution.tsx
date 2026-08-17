import { useRef, useState } from 'react';

import { isDatedTaskOccurrence, type ProjectedTaskMembership } from '@/entities/planning';
import type { LocalDate } from '@/shared/lib/local-date/local-date';
import { ActionMenu } from '@/shared/ui/action-menu';
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
  readonly onEdit: (input: {
    title: string;
    duration: number;
    startTime?: string | null;
    endTime?: string | null;
  }) => Promise<boolean>;
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
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const occurrence = task.occurrence;
  if (!isDatedTaskOccurrence(occurrence)) return null;
  const completed = occurrence.completion === 'completed';

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
        <ActionMenu
          triggerLabel={`Действия с задачей «${occurrence.title}»`}
          triggerTitle="Действия с задачей"
          triggerRef={menuTriggerRef}
        >
          {(close) => (
            <>
              {onMoveUp === undefined ? null : (
                <Button
                  variant="quiet"
                  disabled={!canMoveUp}
                  onClick={() => {
                    close();
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
                  close();
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
                  close();
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
                  close();
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
                  close();
                  void onDelete();
                }}
              >
                <Icon name="trash" aria-hidden="true" />
                Удалить
              </Button>
            </>
          )}
        </ActionMenu>
      )}
      {completed && !immutable ? (
        <p className="orbit-action-note">Чтобы переместить задачу, сначала снимите отметку.</p>
      ) : null}
      {moveOpen ? (
        <TaskMoveDialog
          open
          returnFocusRef={menuTriggerRef}
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
          returnFocusRef={menuTriggerRef}
          date={occurrence.placement.date}
          initialTitle={occurrence.title}
          initialDuration={occurrence.plannedDurationMinutes}
          {...(occurrence.startTime === undefined
            ? {}
            : { initialStartTime: occurrence.startTime })}
          {...(occurrence.endTime === undefined ? {} : { initialEndTime: occurrence.endTime })}
          onClose={() => {
            setEditOpen(false);
          }}
          onSubmitDated={({ title, duration, startTime, endTime }) =>
            onEdit({
              title,
              duration,
              startTime: startTime ?? null,
              endTime: endTime ?? null,
            })
          }
        />
      ) : null}
    </div>
  );
}
