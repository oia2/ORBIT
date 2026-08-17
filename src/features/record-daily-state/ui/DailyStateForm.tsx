import { useState } from 'react';

import type { DailyStateEntry } from '@/entities/planning';
import { Button } from '@/shared/ui/button';

import type { DailyStateDraft } from '../model/use-record-daily-state';

export interface DailyStateFormProps {
  readonly initial?: DailyStateEntry;
  readonly immutable?: boolean;
  readonly saveConfirmed?: boolean;
  readonly onSubmit: (draft: DailyStateDraft) => Promise<boolean>;
}

const hoursFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

function minutesToHoursInput(minutes: number): string {
  return String(minutes / 60);
}

export function DailyStateForm({
  initial,
  immutable = false,
  saveConfirmed = false,
  onSubmit,
}: DailyStateFormProps) {
  const [energy, setEnergy] = useState(initial?.energy?.toString() ?? '');
  const [mood, setMood] = useState(initial?.mood?.toString() ?? '');
  const [sleepHours, setSleepHours] = useState(
    initial?.sleepDurationMinutes === undefined
      ? immutable
        ? ''
        : '8'
      : minutesToHoursInput(initial.sleepDurationMinutes),
  );
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  if (immutable)
    return (
      <section className="orbit-state-summary" aria-label="Состояние дня">
        <p className="orbit-state-form__row">Энергия: {energy || 'не указана'}</p>
        <p className="orbit-state-form__row">Настроение: {mood || 'не указано'}</p>
        <p className="orbit-state-form__row">
          Сон: {sleepHours ? `${hoursFormatter.format(Number(sleepHours))} ч` : 'не указан'}
        </p>
        <p className="orbit-page-note">День закрыт — состояние сохранено.</p>
      </section>
    );
  const submit = async () => {
    const energyValue = energy === '' ? undefined : Number(energy);
    const moodValue = mood === '' ? undefined : Number(mood);
    const sleepHoursValue = sleepHours === '' ? undefined : Number(sleepHours);
    if (
      (energyValue !== undefined &&
        (!Number.isInteger(energyValue) || energyValue < 1 || energyValue > 5)) ||
      (moodValue !== undefined && (!Number.isInteger(moodValue) || moodValue < 1 || moodValue > 5))
    ) {
      setError('Энергия и настроение должны быть целыми значениями от 1 до 5.');
      return;
    }
    if (
      sleepHoursValue !== undefined &&
      (!Number.isFinite(sleepHoursValue) || sleepHoursValue < 0)
    ) {
      setError('Сон должен быть неотрицательным числом часов.');
      return;
    }
    const committed = await onSubmit({
      ...(energyValue === undefined ? {} : { energy: energyValue }),
      ...(moodValue === undefined ? {} : { mood: moodValue }),
      ...(sleepHoursValue === undefined
        ? {}
        : { sleepDurationMinutes: Math.round(sleepHoursValue * 60) }),
    });
    setSaved(committed);
  };
  return (
    <section className="orbit-state-form" aria-label="Состояние дня">
      <div className="orbit-state-form__row">
        <span className="orbit-state-form__label" id="daily-energy-label">
          Энергия
        </span>
        <div className="orbit-choice-grid" role="group" aria-labelledby="daily-energy-label">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              className="orbit-choice"
              key={value}
              type="button"
              aria-label={`Энергия ${String(value)}`}
              aria-pressed={energy === String(value)}
              onClick={() => {
                setEnergy((current) => (current === String(value) ? '' : String(value)));
              }}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="orbit-state-form__row">
        <span className="orbit-state-form__label" id="daily-mood-label">
          Настроение
        </span>
        <div className="orbit-choice-grid" role="group" aria-labelledby="daily-mood-label">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              className="orbit-choice"
              key={value}
              type="button"
              aria-label={`Настроение ${String(value)}`}
              aria-pressed={mood === String(value)}
              onClick={() => {
                setMood((current) => (current === String(value) ? '' : String(value)));
              }}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <label className="orbit-state-form__row" htmlFor="daily-sleep">
        <span className="orbit-state-form__label">Сон</span>
        <span className="orbit-state-input">
          <input
            id="daily-sleep"
            type="number"
            min="0"
            step="0.25"
            placeholder="7,5"
            value={sleepHours}
            onChange={(event) => {
              setSleepHours(event.target.value);
            }}
          />
          <small>часов</small>
        </span>
      </label>
      {error === undefined ? null : (
        <p className="orbit-field__error" role="alert">
          {error}
        </p>
      )}
      <Button
        className="orbit-state-form__save"
        onClick={() => {
          void submit();
        }}
      >
        Сохранить состояние
      </Button>
      {saved || saveConfirmed ? (
        <p className="orbit-inline-status" role="status">
          ✓ Состояние сохранено.
        </p>
      ) : null}
    </section>
  );
}
