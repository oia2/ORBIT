import { useState, type RefObject } from 'react';

import { isValidLocalTime } from '@/entities/planning';
import type { LocalDate } from '@/shared/lib/local-date/local-date';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';

/** `time` is already validated as "HH:MM" — fixed-position slicing avoids an unsafe split/destructure. */
function timeToMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function minutesToTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** Mirrors the reference's duration presets so a range can be set in one tap. */
const DURATION_PRESETS: readonly { readonly minutes: number; readonly label: string }[] = [
  { minutes: 15, label: '15 мин' },
  { minutes: 30, label: '30 мин' },
  { minutes: 45, label: '45 мин' },
  { minutes: 60, label: '1 ч' },
  { minutes: 90, label: '1,5 ч' },
  { minutes: 120, label: '2 ч' },
];

export interface TaskEditorDialogProps {
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly open: boolean;
  readonly date?: LocalDate;
  readonly nextPosition?: number;
  readonly initialTitle?: string;
  readonly initialDuration?: number;
  readonly initialStartTime?: string;
  readonly initialEndTime?: string;
  readonly onClose: () => void;
  readonly onSubmitDated?: (input: {
    title: string;
    duration: number;
    position: number;
    startTime?: string;
    endTime?: string;
  }) => Promise<boolean>;
  readonly onSubmitBacklog?: (title: string) => Promise<boolean>;
}

export function TaskEditorDialog({
  open,
  returnFocusRef,
  date,
  nextPosition = 0,
  initialTitle = '',
  initialDuration,
  initialStartTime = '',
  initialEndTime = '',
  onClose,
  onSubmitDated,
  onSubmitBacklog,
}: TaskEditorDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [duration, setDuration] = useState(initialDuration?.toString() ?? '');
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [error, setError] = useState<string>();

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

  /** Applies a preset length: fills the end time from the start, and the duration. */
  const applyPreset = (minutes: number) => {
    setDuration(String(minutes));
    if (isValidLocalTime(startTime)) {
      setEndTime(minutesToTime(timeToMinutes(startTime) + minutes));
    }
  };

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
      saved =
        (await onSubmitDated?.({
          title,
          duration: minutes,
          position: nextPosition,
          ...(startTime === '' ? {} : { startTime }),
          ...(endTime === '' ? {} : { endTime }),
        })) ?? false;
    }
    if (saved) {
      setTitle('');
      setDuration('');
      setStartTime('');
      setEndTime('');
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      title={initialTitle.length === 0 ? 'Новая задача' : 'Редактировать задачу'}
      onClose={onClose}
      {...(returnFocusRef === undefined ? {} : { returnFocusRef })}
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
        <>
          <div className="orbit-form-grid">
            <FormField id="task-start-time" label="Начало" hint="Необязательно">
              <input
                type="time"
                step="300"
                value={startTime}
                onChange={(event) => {
                  setStartTime(event.target.value);
                  deriveDuration(event.target.value, endTime);
                }}
              />
            </FormField>
            <FormField id="task-end-time" label="Окончание" hint="Необязательно">
              <input
                type="time"
                step="300"
                value={endTime}
                onChange={(event) => {
                  setEndTime(event.target.value);
                  deriveDuration(startTime, event.target.value);
                }}
              />
            </FormField>
          </div>
          <fieldset className="orbit-preset-row">
            <legend>Быстрая длительность</legend>
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                className="orbit-preset"
                aria-pressed={duration === String(preset.minutes)}
                onClick={() => {
                  applyPreset(preset.minutes);
                }}
              >
                {preset.label}
              </button>
            ))}
          </fieldset>
          <FormField
            id="task-duration"
            label="Длительность, минут"
            hint={
              startTime !== '' && endTime !== ''
                ? 'Вычислена из начала и окончания. Можно исправить вручную.'
                : undefined
            }
          >
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
        </>
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
