import { useState } from 'react';

import { isValidLocalTime, type RecurrenceRule, type IsoWeekday } from '@/entities/planning';

/** `time` is already validated as "HH:MM" — fixed-position slicing avoids an unsafe split/destructure. */
function timeToMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
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

const WEEKDAYS: readonly { value: IsoWeekday; label: string }[] = [
  { value: 1, label: 'Понедельник' },
  { value: 2, label: 'Вторник' },
  { value: 3, label: 'Среда' },
  { value: 4, label: 'Четверг' },
  { value: 5, label: 'Пятница' },
  { value: 6, label: 'Суббота' },
  { value: 7, label: 'Воскресенье' },
];

export interface TaskRecurrenceDialogProps {
  readonly open: boolean;
  readonly mode?: 'create' | 'update';
  readonly clock: ApplicationClock;
  readonly initialTitle?: string;
  readonly initialDuration?: number;
  readonly initialStartTime?: string;
  readonly initialEndTime?: string;
  readonly initialRule?: RecurrenceRule;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    title: string;
    duration: number;
    startTime?: string;
    endTime?: string;
    rule: RecurrenceRule;
  }) => Promise<boolean>;
  readonly onStop?: () => Promise<boolean>;
}

export function TaskRecurrenceDialog(props: TaskRecurrenceDialogProps) {
  const [title, setTitle] = useState(props.initialTitle ?? '');
  const [duration, setDuration] = useState(props.initialDuration?.toString() ?? '');
  const [startTime, setStartTime] = useState(props.initialStartTime ?? '');
  const [endTime, setEndTime] = useState(props.initialEndTime ?? '');
  const [startDate, setStartDate] = useState<string>(props.initialRule?.startDate ?? '');
  const [endDate, setEndDate] = useState<string>(props.initialRule?.endDate ?? '');
  const [weekdays, setWeekdays] = useState<readonly IsoWeekday[]>(
    props.initialRule?.weekdays ?? [],
  );
  const [reviewDate, setReviewDate] = useState<LocalDate>(props.clock.currentLocalDate());
  const [error, setError] = useState<string>();
  const mode = props.mode ?? 'create';
  const effectiveDate = addDays(reviewDate, 1);

  // When both a start and end time are set, the duration is derived from them
  // instead of asking the user to compute and re-enter it separately.
  const deriveDuration = (nextStartTime: string, nextEndTime: string) => {
    if (
      nextStartTime === '' ||
      nextEndTime === '' ||
      !isValidLocalTime(nextStartTime) ||
      !isValidLocalTime(nextEndTime)
    ) {
      return;
    }
    const minutes = timeToMinutes(nextEndTime) - timeToMinutes(nextStartTime);
    if (minutes > 0) {
      setDuration(String(minutes));
    }
  };

  const confirmCurrentBoundary = (): boolean => {
    const current = props.clock.currentLocalDate();
    if (mode === 'update' && current !== reviewDate) {
      setReviewDate(current);
      setError('Дата изменилась. Проверьте новую дату вступления изменений и подтвердите снова.');
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!confirmCurrentBoundary()) return;
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      setError('Длительность должна быть целым числом больше нуля.');
      return;
    }
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
    if (startTime !== '' && !isValidLocalTime(startTime)) {
      setError('Введите корректное время начала.');
      return;
    }
    if (endTime !== '' && !isValidLocalTime(endTime)) {
      setError('Введите корректное время окончания.');
      return;
    }
    if (startTime !== '' && endTime !== '' && endTime <= startTime) {
      setError('Время окончания должно быть позже времени начала.');
      return;
    }
    const rule: RecurrenceRule = {
      startDate,
      weekdays: [...weekdays].sort(),
      ...(isLocalDate(endDate) ? { endDate } : {}),
    };
    if (
      await props.onSubmit({
        title,
        duration: minutes,
        rule,
        ...(startTime === '' ? {} : { startTime }),
        ...(endTime === '' ? {} : { endTime }),
      })
    )
      props.onClose();
  };

  const stop = async () => {
    if (!confirmCurrentBoundary()) return;
    if (await props.onStop?.()) props.onClose();
  };

  return (
    <Dialog
      open={props.open}
      title={mode === 'create' ? 'Новая повторяющаяся задача' : 'Изменить повтор задачи'}
      onClose={props.onClose}
    >
      <FormField id="recurring-task-title" label="Название задачи" error={error}>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </FormField>
      <div className="orbit-form-grid">
        <FormField id="recurring-task-start-time" label="Начало" hint="Необязательно">
          <input
            type="time"
            value={startTime}
            onChange={(event) => {
              setStartTime(event.target.value);
              deriveDuration(event.target.value, endTime);
            }}
          />
        </FormField>
        <FormField id="recurring-task-end-time" label="Окончание" hint="Необязательно">
          <input
            type="time"
            value={endTime}
            onChange={(event) => {
              setEndTime(event.target.value);
              deriveDuration(startTime, event.target.value);
            }}
          />
        </FormField>
      </div>
      <FormField
        id="recurring-task-duration"
        label="Длительность, минут"
        hint={
          startTime !== '' && endTime !== ''
            ? 'Вычислена из начала и окончания. Можно исправить вручную.'
            : undefined
        }
      >
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
      <FormField id="recurring-task-start" label="Дата начала">
        <input
          type="date"
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
          }}
        />
      </FormField>
      <FormField id="recurring-task-end" label="Дата окончания" hint="Дата окончания включительно.">
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
        {WEEKDAYS.map(({ value, label }) => (
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
          {formatLocalDate(effectiveDate, 'ru-RU', {
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
