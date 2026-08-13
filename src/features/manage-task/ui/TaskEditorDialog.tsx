import { useState } from 'react';

import type { LocalDate } from '@/shared/lib/local-date/local-date';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';

export interface TaskEditorDialogProps {
  readonly open: boolean;
  readonly date?: LocalDate;
  readonly nextPosition?: number;
  readonly initialTitle?: string;
  readonly initialDuration?: number;
  readonly onClose: () => void;
  readonly onSubmitDated?: (input: {
    title: string;
    duration: number;
    position: number;
  }) => Promise<boolean>;
  readonly onSubmitBacklog?: (title: string) => Promise<boolean>;
}

export function TaskEditorDialog({
  open,
  date,
  nextPosition = 0,
  initialTitle = '',
  initialDuration,
  onClose,
  onSubmitDated,
  onSubmitBacklog,
}: TaskEditorDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [duration, setDuration] = useState(initialDuration?.toString() ?? '');
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (title.trim().length === 0) {
      setError('Введите название задачи.');
      return;
    }
    let saved = false;
    if (date === undefined) {
      saved = (await onSubmitBacklog?.(title)) ?? false;
    } else {
      const minutes = Number(duration);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        setError('Длительность должна быть целым числом больше нуля.');
        return;
      }
      saved =
        (await onSubmitDated?.({ title, duration: minutes, position: nextPosition })) ?? false;
    }
    if (saved) {
      setTitle('');
      setDuration('');
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      title={initialTitle.length === 0 ? 'Новая задача' : 'Редактировать задачу'}
      onClose={onClose}
    >
      <FormField id="task-title" label="Название задачи" error={error}>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </FormField>
      {date === undefined ? null : (
        <FormField id="task-duration" label="Длительность, минут">
          <input
            inputMode="numeric"
            type="number"
            min="1"
            step="1"
            value={duration}
            onChange={(event) => {
              setDuration(event.target.value);
            }}
          />
        </FormField>
      )}
      <footer className="orbit-dialog__actions">
        <Button variant="quiet" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={() => void submit()}>Сохранить</Button>
      </footer>
    </Dialog>
  );
}
