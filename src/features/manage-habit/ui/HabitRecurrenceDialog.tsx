import { useEffect, useRef, useState } from 'react';

import type { IsoWeekday, RecurrenceRule } from '@/entities/planning';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import { formatLocalDate, type LocalDate } from '@/shared/lib/local-date/local-date';
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

const ALL_WEEKDAYS: readonly IsoWeekday[] = DAYS.map(([value]) => value);

export interface HabitRecurrenceDialogProps {
  readonly open: boolean;
  readonly mode?: 'create' | 'update';
  readonly clock: ApplicationClock;
  readonly initialTitle?: string;
  readonly initialRule?: RecurrenceRule;
  /** Minutes the habit takes, or absent when it carries no duration. */
  readonly initialDurationMinutes?: number;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    title: string;
    rule: RecurrenceRule;
    /** `null` clears the duration; `undefined` means it was left empty. */
    durationMinutes: number | null;
  }) => Promise<boolean>;
}

export function HabitRecurrenceDialog(props: HabitRecurrenceDialogProps) {
  const [title, setTitle] = useState(props.initialTitle ?? '');
  const [weekdays, setWeekdays] = useState<readonly IsoWeekday[]>(
    props.initialRule?.weekdays ?? [],
  );
  const [duration, setDuration] = useState(
    props.initialDurationMinutes === undefined ? '' : String(props.initialDurationMinutes),
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
  const allSelected = weekdays.length === ALL_WEEKDAYS.length;
  const someSelected = weekdays.length > 0 && !allSelected;
  const toggleAllWeekdays = () => {
    setWeekdays(allSelected ? [] : ALL_WEEKDAYS);
  };
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current !== null) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);
  const submit = async () => {
    if (!confirmBoundary()) return;
    if (title.trim().length === 0 || weekdays.length === 0) {
      setError('Заполните название и выберите хотя бы один день недели.');
      return;
    }
    // Empty means "no duration", which is a valid state (003 FR-029); a filled
    // field has to be a positive whole number of minutes.
    const trimmedDuration = duration.trim();
    const durationMinutes = trimmedDuration.length === 0 ? null : Number(trimmedDuration);
    if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes <= 0)) {
      setError('Длительность должна быть целым числом больше нуля.');
      return;
    }
    // Existing habits keep their originally recorded start date; only a brand-new habit
    // gets today's date. `applyRecurrenceRuleChange` decides the effective boundary itself
    // and never reaches back past it, so preserving this value cannot rewrite history.
    const startDate =
      mode === 'update' && props.initialRule !== undefined
        ? props.initialRule.startDate
        : props.clock.currentLocalDate();
    const rule: RecurrenceRule = {
      startDate,
      weekdays: [...weekdays].sort(),
    };
    if (await props.onSubmit({ title, rule, durationMinutes })) props.onClose();
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
      <FormField
        id="habit-duration"
        label="Длительность, мин (необязательно)"
        hint="Войдёт в плановую нагрузку дня. На результат не влияет."
      >
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={duration}
          onChange={(event) => {
            setDuration(event.target.value);
          }}
        />
      </FormField>
      <fieldset className="orbit-check-list">
        <legend>Дни недели</legend>
        <label className="orbit-check-list__select-all">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={toggleAllWeekdays}
          />
          Выбрать все дни
        </label>
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
          Изменение вступит в силу сразу, с{' '}
          {formatLocalDate(reviewDate, 'ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          : добавленный день недели появится уже сегодня. Сегодняшняя отметка, если она уже есть, не
          изменится.
        </p>
      ) : null}
      <footer className="orbit-dialog__actions">
        <Button variant="quiet" onClick={props.onClose}>
          Отмена
        </Button>
        <Button onClick={() => void submit()}>Сохранить</Button>
      </footer>
    </Dialog>
  );
}
