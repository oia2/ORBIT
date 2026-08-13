import { useState } from 'react';

import type { LocalDate } from '@/shared/lib/local-date/local-date';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';

export interface TaskMoveDialogProps {
  readonly open: boolean;
  readonly sourceDate?: LocalDate;
  readonly availableDates: readonly LocalDate[];
  readonly initialDuration?: number;
  readonly onClose: () => void;
  readonly onSubmit: (input: { destinationDate: LocalDate; duration: number }) => Promise<boolean>;
}

export function TaskMoveDialog({
  open,
  sourceDate,
  availableDates,
  initialDuration,
  onClose,
  onSubmit,
}: TaskMoveDialogProps) {
  const [destination, setDestination] = useState('');
  const [duration, setDuration] = useState(initialDuration?.toString() ?? '');
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (destination.length === 0 || destination === sourceDate) {
      setError('Выберите другой открытый день.');
      return;
    }
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      setError('Длительность должна быть целым числом больше нуля.');
      return;
    }
    if (await onSubmit({ destinationDate: destination as LocalDate, duration: minutes })) {
      onClose();
    }
  };

  return (
    <Dialog open={open} title="Переместить задачу" onClose={onClose}>
      <FormField id="task-destination" label="Дата назначения" error={error}>
        <select
          value={destination}
          onChange={(event) => {
            setDestination(event.target.value);
          }}
        >
          <option value="">Выберите дату</option>
          {availableDates
            .filter((date) => date !== sourceDate)
            .map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
        </select>
      </FormField>
      <FormField id="move-duration" label="Длительность, минут">
        <input
          type="number"
          min="1"
          step="1"
          value={duration}
          onChange={(event) => {
            setDuration(event.target.value);
          }}
        />
      </FormField>
      <footer className="orbit-dialog__actions">
        <Button variant="quiet" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={() => void submit()}>Переместить</Button>
      </footer>
    </Dialog>
  );
}
