import { useState } from 'react';

import type { DayView } from '@/entities/planning';
import type { LocalDate } from '@/shared/lib/local-date/local-date';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';

import {
  createClosureDraft,
  setClosureDisposition,
  validateClosureDraft,
  type ClosureDraft,
  type ValidClosureDraft,
} from '../model/closure-reducer';

export interface CloseDayDialogProps {
  readonly open: boolean;
  readonly view: DayView;
  readonly availableMoveDates: readonly LocalDate[];
  readonly onClose: () => void;
  readonly onSubmit: (dispositions: ValidClosureDraft) => Promise<boolean>;
}

export function CloseDayDialog({
  open,
  view,
  availableMoveDates,
  onClose,
  onSubmit,
}: CloseDayDialogProps) {
  const ids = view.unfinishedTaskIds;
  const [draft, setDraft] = useState<ClosureDraft>(() => createClosureDraft(ids));
  const [error, setError] = useState<string>();
  const pendingHabits = view.habits.some((habit) => habit.outcome === 'pending');
  const submit = async () => {
    const validated = validateClosureDraft(ids, draft, availableMoveDates);
    if (!validated.ok) {
      setError(validated.message);
      return;
    }
    if (await onSubmit(validated.value)) onClose();
  };
  return (
    <Dialog
      open={open}
      title="Закрыть день"
      description="Для каждой незавершённой задачи выберите отдельное действие. Ничего не выбрано заранее."
      onClose={onClose}
    >
      {pendingHabits ? <p role="alert">Сначала отметьте все привычки.</p> : null}
      {view.tasks
        .filter((task) => ids.includes(task.occurrence.id))
        .map((task) => {
          const id = task.occurrence.id;
          const value = draft[id];
          return (
            <fieldset className="orbit-closure-item" key={id}>
              <legend>{task.occurrence.title}</legend>
              <label>
                Действие для {task.occurrence.title}
                <select
                  value={value?.kind ?? ''}
                  onChange={(event) => {
                    const kind = event.target.value;
                    const next =
                      kind === ''
                        ? undefined
                        : kind === 'move-to-date'
                          ? ({ kind, destinationDate: '', duration: '' } as const)
                          : ({ kind } as Exclude<
                              ClosureDraft[string],
                              undefined | { kind: 'move-to-date' }
                            >);
                    setDraft((current) => setClosureDisposition(current, id, next));
                  }}
                >
                  <option value="">Не выбрано</option>
                  <option value="keep-unfinished">Оставить незавершённой</option>
                  <option value="move-to-date">Перенести на дату</option>
                  <option value="move-to-backlog">Перенести в бэклог</option>
                  <option value="cancel">Отменить при закрытии</option>
                </select>
              </label>
              {value?.kind === 'move-to-date' ? (
                <>
                  <label>
                    Дата переноса
                    <select
                      value={value.destinationDate}
                      onChange={(event) => {
                        setDraft((current) =>
                          setClosureDisposition(current, id, {
                            ...value,
                            destinationDate: event.target.value,
                          }),
                        );
                      }}
                    >
                      <option value="">Выберите дату</option>
                      {availableMoveDates.map((date) => (
                        <option key={date} value={date}>
                          {date}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Длительность, минут
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={value.duration}
                      onChange={(event) => {
                        setDraft((current) =>
                          setClosureDisposition(current, id, {
                            ...value,
                            duration: event.target.value,
                          }),
                        );
                      }}
                    />
                  </label>
                </>
              ) : null}
            </fieldset>
          );
        })}
      {error === undefined ? null : <p role="alert">{error}</p>}
      <footer className="orbit-dialog__actions">
        <Button variant="quiet" onClick={onClose}>
          Вернуться
        </Button>
        <Button
          disabled={pendingHabits}
          onClick={() => {
            void submit();
          }}
        >
          Закрыть день
        </Button>
      </footer>
    </Dialog>
  );
}
