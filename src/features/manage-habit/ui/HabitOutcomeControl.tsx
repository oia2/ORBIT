import { useState } from 'react';

import type { HabitOccurrence } from '@/entities/planning';
import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

export interface HabitOutcomeControlProps {
  readonly occurrence: HabitOccurrence;
  readonly dayStatus: 'open' | 'closed';
  readonly onCorrect: () => Promise<boolean>;
  readonly onDelete: () => Promise<boolean>;
  readonly onEdit?: (title: string) => Promise<boolean>;
  readonly onEditSeries?: () => void;
  /** Stops the whole recurrence from tomorrow, unlike the per-occurrence delete. */
  readonly onStopSeries?: () => Promise<boolean>;
}

export function HabitOutcomeControl({
  occurrence,
  dayStatus,
  onCorrect,
  onDelete,
  onEdit,
  onEditSeries,
  onStopSeries,
}: HabitOutcomeControlProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(occurrence.definitionSnapshot.title);
  if (dayStatus === 'closed')
    return <span className="orbit-habit-row__status">День закрыт — результат сохранён.</span>;
  const boundaryMiss =
    occurrence.outcome === 'not-completed' &&
    occurrence.outcomeEvents.at(-1)?.source === 'date-boundary';
  return (
    <span className="orbit-habit-controls">
      {onEdit === undefined || !editing ? null : (
        <span className="orbit-habit-editor">
          <label className="orbit-field">
            <span className="orbit-field__label">Название</span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          </label>
          <Button
            onClick={() =>
              void onEdit(title).then((saved) => {
                if (saved) setEditing(false);
              })
            }
          >
            Сохранить
          </Button>
        </span>
      )}
      <ActionMenu
        triggerLabel={`Действия с привычкой «${occurrence.definitionSnapshot.title}»`}
        triggerTitle="Действия с привычкой"
      >
        {(close) => (
          <>
            {boundaryMiss ? (
              <Button
                variant="quiet"
                onClick={() => {
                  close();
                  void onCorrect();
                }}
              >
                <Icon name="check" aria-hidden="true" />
                Отметить выполненной
              </Button>
            ) : null}
            {onEdit === undefined || editing ? null : (
              <Button
                variant="quiet"
                onClick={() => {
                  close();
                  setEditing(true);
                }}
              >
                <Icon name="edit" aria-hidden="true" />
                Изменить
              </Button>
            )}
            {onEditSeries === undefined ? null : (
              <Button
                variant="quiet"
                onClick={() => {
                  close();
                  onEditSeries();
                }}
              >
                <Icon name="calendar" aria-hidden="true" />
                Изменить повтор
              </Button>
            )}
            {onStopSeries === undefined ? null : (
              <Button
                variant="quiet"
                onClick={() => {
                  close();
                  void onStopSeries();
                }}
              >
                <Icon name="close" aria-hidden="true" />
                Остановить повтор
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
    </span>
  );
}
