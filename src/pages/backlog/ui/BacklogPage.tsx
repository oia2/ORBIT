import { useState } from 'react';

import type { BacklogTaskOccurrence } from '@/entities/planning';
import { TaskEditorDialog, TaskMoveDialog, useManageTask } from '@/features/manage-task';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import { useBacklogPage } from '../model/use-backlog-page';
import styles from './BacklogPage.module.css';

export interface BacklogPageProps {
  readonly currentDate?: LocalDate;
}

export function BacklogPage({ currentDate }: BacklogPageProps) {
  const { state, reload } = useBacklogPage(currentDate);
  const manageTask = useManageTask(reload);
  const [editing, setEditing] = useState<BacklogTaskOccurrence>();
  const [scheduling, setScheduling] = useState<BacklogTaskOccurrence>();
  const ready = state.status === 'ready' ? state.view : undefined;
  const availableMoveDates = state.status === 'ready' ? state.availableMoveDates : [];

  return (
    <section className={styles.page} data-od-id="backlog-page">
      <header className="orbit-page-header">
        <div className="orbit-page-header__copy">
          <p className="orbit-eyebrow">ORBIT / ВХОДЯЩИЕ</p>
          <h1 className="orbit-page-title">Бэклог</h1>
          <p className="orbit-page-note">Отложенные задачи без даты — в порядке добавления.</p>
        </div>
      </header>
      {state.status === 'loading' ? <p role="status">Загружаем бэклог…</p> : null}
      {state.status === 'error' ? (
        <div className={['orbit-card', styles.feedback].filter(Boolean).join(' ')} role="alert">
          <p>{state.message}</p>
          <Button onClick={() => void reload()}>Повторить</Button>
        </div>
      ) : null}
      {ready === undefined ? null : (
        <article className="orbit-card" aria-labelledby="backlog-list-title">
          <header className="orbit-card__header">
            <h2 className="orbit-card__title" id="backlog-list-title">
              Задачи без даты
            </h2>
            <span className="orbit-card__meta">{ready.tasks.length}</span>
          </header>
          {ready.tasks.length === 0 ? (
            <div className="orbit-empty-state">
              <strong>Бэклог пуст.</strong>
              <p>Сюда попадут задачи, которые вы явно отложите из плана дня.</p>
            </div>
          ) : null}
          <ul className={styles.list} aria-label="Задачи бэклога">
            {ready.tasks.map((occurrence) => {
              if (occurrence.state !== 'active' || occurrence.placement.kind !== 'backlog')
                return null;
              const backlogOccurrence = occurrence as BacklogTaskOccurrence;
              return (
                <li className={styles.item} key={backlogOccurrence.id}>
                  <span className={styles.taskCopy}>
                    <strong>{backlogOccurrence.title}</strong>
                    <small>Без даты</small>
                  </span>
                  <span className={styles.actions}>
                    <Button
                      className="orbit-icon-button"
                      variant="quiet"
                      aria-label={`Редактировать «${backlogOccurrence.title}»`}
                      title="Редактировать"
                      onClick={() => {
                        setEditing(backlogOccurrence);
                      }}
                    >
                      <Icon name="edit" aria-hidden="true" />
                    </Button>
                    <Button
                      className="orbit-icon-button"
                      variant="quiet"
                      aria-label={`Запланировать «${backlogOccurrence.title}»`}
                      title="Запланировать"
                      onClick={() => {
                        setScheduling(backlogOccurrence);
                      }}
                    >
                      <Icon name="calendar" aria-hidden="true" />
                    </Button>
                    <Button
                      className="orbit-icon-button"
                      variant="danger"
                      aria-label={`Удалить «${backlogOccurrence.title}»`}
                      title="Удалить"
                      onClick={() =>
                        void manageTask.remove(backlogOccurrence.id, backlogOccurrence.revision)
                      }
                    >
                      <Icon name="trash" aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </article>
      )}
      {manageTask.error === undefined ? null : <p role="alert">{manageTask.error}</p>}
      {editing === undefined ? null : (
        <TaskEditorDialog
          open
          initialTitle={editing.title}
          onClose={() => {
            setEditing(undefined);
          }}
          onSubmitBacklog={(title) =>
            manageTask.edit({
              occurrenceId: editing.id,
              title,
              revision: editing.revision,
            })
          }
        />
      )}
      {scheduling === undefined ? null : (
        <TaskMoveDialog
          open
          availableDates={availableMoveDates}
          onClose={() => {
            setScheduling(undefined);
          }}
          onSubmit={({ destinationDate, duration }) =>
            manageTask.moveToDate({
              occurrenceId: scheduling.id,
              destinationDate,
              duration,
              revision: scheduling.revision,
            })
          }
        />
      )}
    </section>
  );
}
