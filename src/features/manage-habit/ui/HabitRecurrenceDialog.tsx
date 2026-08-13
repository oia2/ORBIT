import { useState } from 'react';

import type { IsoWeekday, RecurrenceRule } from '@/entities/planning';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import {
  addDays,
  compareLocalDates,
  formatLocalDate,
  isLocalDate,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';

const DAYS: readonly [IsoWeekday, string][] = [
  [1, 'Понедельник'],
  [2, 'Вторник'],
  [3, 'Среда'],
  [4, 'Четверг'],
  [5, 'Пятница'],
  [6, 'Суббота'],
  [7, 'Воскресенье'],
];

export interface HabitRecurrenceDialogProps {
  readonly open: boolean;
  readonly mode?: 'create' | 'update';
  readonly clock: ApplicationClock;
  readonly initialTitle?: string;
  readonly initialRule?: RecurrenceRule;
  readonly onClose: () => void;
  readonly onSubmit: (input: { title: string; rule: RecurrenceRule }) => Promise<boolean>;
  readonly onStop?: () => Promise<boolean>;
}

export function HabitRecurrenceDialog(props: HabitRecurrenceDialogProps) {
  const [title, setTitle] = useState(props.initialTitle ?? '');
  const [startDate, setStartDate] = useState<string>(props.initialRule?.startDate ?? '');
  const [endDate, setEndDate] = useState<string>(props.initialRule?.endDate ?? '');
  const [weekdays, setWeekdays] = useState<readonly IsoWeekday[]>(
    props.initialRule?.weekdays ?? [],
  );
  const [reviewDate, setReviewDate] = useState<LocalDate>(props.clock.currentLocalDate());
  const [error, setError] = useState<string>();
  const mode = props.mode ?? 'create';
  const confirmBoundary = () => {
    const current = props.clock.currentLocalDate();
    if (mode === 'update' && current !== reviewDate) {
      setReviewDate(current);
      setError('Дата изменилась. Проверьте новую дату вступления изменений и подтвердите снова.');
      return false;
    }
    return true;
  };
  const submit = async () => {
    if (!confirmBoundary()) return;
    if (title.trim().length === 0 || !isLocalDate(startDate) || weekdays.length === 0) {
      setError('Заполните название, дату начала и выберите хотя бы один день недели.');
      return;
    }
    if (!isLocalDate(endDate) && endDate.length > 0) {
      setError('Введите корректную дату окончания.');
      return;
    }
    if (isLocalDate(endDate) && compareLocalDates(endDate, startDate) < 0) {
      setError('Дата окончания не может быть раньше даты начала.');
      return;
    }
    const rule: RecurrenceRule = {
      startDate,
      weekdays: [...weekdays].sort(),
      ...(isLocalDate(endDate) ? { endDate } : {}),
    };
    if (await props.onSubmit({ title, rule })) props.onClose();
  };
  const stop = async () => {
    if (confirmBoundary() && (await props.onStop?.())) props.onClose();
  };
  return (
    <Dialog
      open={props.open}
      title={mode === 'create' ? 'Новая привычка' : 'Изменить повтор привычки'}
      onClose={props.onClose}
    >
      <FormField id="habit-title" label="Название привычки" error={error}>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </FormField>
      <FormField id="habit-start" label="Дата начала">
        <input
          type="date"
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
          }}
        />
      </FormField>
      <FormField id="habit-end" label="Дата окончания" hint="Дата окончания включительно.">
        <input
          type="date"
          value={endDate}
          onChange={(event) => {
            setEndDate(event.target.value);
          }}
        />
      </FormField>
      <fieldset className="orbit-check-list">
        <legend>Дни недели</legend>
        {DAYS.map(([value, label]) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={weekdays.includes(value)}
              onChange={() => {
                setWeekdays((current) =>
                  current.includes(value)
                    ? current.filter((day) => day !== value)
                    : [...current, value],
                );
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {mode === 'update' ? (
        <p className="orbit-page-note">
          Изменение или остановка вступит в силу{' '}
          {formatLocalDate(addDays(reviewDate, 1), 'ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          . Сегодняшнее вхождение не изменится.
        </p>
      ) : null}
      <footer className="orbit-dialog__actions">
        {mode === 'update' && props.onStop !== undefined ? (
          <Button variant="danger" onClick={() => void stop()}>
            Остановить повтор
          </Button>
        ) : null}
        <Button variant="quiet" onClick={props.onClose}>
          Отмена
        </Button>
        <Button onClick={() => void submit()}>Сохранить</Button>
      </footer>
    </Dialog>
  );
}
