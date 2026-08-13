import { useRef, useState } from 'react';

import type { HabitOccurrence } from '@/entities/planning';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

export interface HabitOutcomeControlProps {
  readonly occurrence: HabitOccurrence;
  readonly dayStatus: 'open' | 'closed';
  readonly onRecord: (outcome: 'completed' | 'not-completed') => Promise<boolean>;
  readonly onCorrect: () => Promise<boolean>;
  readonly onDelete: () => Promise<boolean>;
  readonly onEdit?: (title: string) => Promise<boolean>;
  readonly onEditSeries?: () => void;
}

export function HabitOutcomeControl({
  occurrence,
  dayStatus,
  onRecord,
  onCorrect,
  onDelete,
  onEdit,
  onEditSeries,
}: HabitOutcomeControlProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(occurrence.definitionSnapshot.title);
  const menuRef = useRef<HTMLDetailsElement>(null);
  if (dayStatus === 'closed')
    return <span className="orbit-habit-row__status">День закрыт — результат сохранён.</span>;
  const boundaryMiss =
    occurrence.outcome === 'not-completed' &&
    occurrence.outcomeEvents.at(-1)?.source === 'date-boundary';
  const closeMenu = () => {
    if (menuRef.current !== null) menuRef.current.open = false;
  };
  return (
    <span className="orbit-habit-controls">
      {occurrence.outcome === 'pending' ? (
        <>
          <Button
            className="orbit-habit-outcome"
            variant="quiet"
            data-outcome="completed"
            aria-label="Выполнено"
            title="Выполнено"
            onClick={() => void onRecord('completed')}
          >
            <Icon name="check" aria-hidden="true" />
          </Button>
          <Button
            className="orbit-habit-outcome"
            variant="quiet"
            aria-label="Не выполнено"
            title="Не выполнено"
            onClick={() => void onRecord('not-completed')}
          >
            <Icon name="close" aria-hidden="true" />
          </Button>
        </>
      ) : null}
      {onEdit === undefined || !editing ? null : (
        <span className="orbit-habit-editor">
          <label className="orbit-field">
            <span className="orbit-field__label">Название этого вхождения</span>
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
            Сохранить это вхождение
          </Button>
        </span>
      )}
      <details className="orbit-action-menu" ref={menuRef}>
        <summary
          aria-label={`Другие действия с привычкой «${occurrence.definitionSnapshot.title}»`}
          title="Другие действия с привычкой"
        >
          <Icon name="more" aria-hidden="true" />
        </summary>
        <span className="orbit-action-menu__popover" aria-label="Доступные действия">
          {boundaryMiss ? (
            <Button
              variant="quiet"
              onClick={() => {
                closeMenu();
                void onCorrect();
              }}
            >
              <Icon name="check" aria-hidden="true" />
              Исправить: выполнено
            </Button>
          ) : null}
          {onEdit === undefined || editing ? null : (
            <Button
              variant="quiet"
              onClick={() => {
                closeMenu();
                setEditing(true);
              }}
            >
              <Icon name="edit" aria-hidden="true" />
              Изменить только это вхождение
            </Button>
          )}
          {onEditSeries === undefined ? null : (
            <Button
              variant="quiet"
              onClick={() => {
                closeMenu();
                onEditSeries();
              }}
            >
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
            Удалить только это вхождение
          </Button>
        </span>
      </details>
    </span>
  );
}
