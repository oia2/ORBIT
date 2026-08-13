import { useState } from 'react';

import type { DailyStateEntry } from '@/entities/planning';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/shared/ui/form-field';

import type { DailyStateDraft } from '../model/use-record-daily-state';

export interface DailyStateFormProps {
  readonly initial?: DailyStateEntry;
  readonly immutable?: boolean;
  readonly saveConfirmed?: boolean;
  readonly onSubmit: (draft: DailyStateDraft) => Promise<boolean>;
}
export function DailyStateForm({
  initial,
  immutable = false,
  saveConfirmed = false,
  onSubmit,
}: DailyStateFormProps) {
  const [energy, setEnergy] = useState(initial?.energy?.toString() ?? '');
  const [mood, setMood] = useState(initial?.mood?.toString() ?? '');
  const [sleep, setSleep] = useState(initial?.sleepDurationMinutes?.toString() ?? '');
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  if (immutable)
    return (
      <section className="orbit-state-summary" aria-label="Состояние дня">
        <p className="orbit-state-form__row">Энергия: {energy || 'не указана'}</p>
        <p className="orbit-state-form__row">Настроение: {mood || 'не указано'}</p>
        <p className="orbit-state-form__row">Сон: {sleep ? `${sleep} минут` : 'не указан'}</p>
        <p className="orbit-page-note">День закрыт — состояние сохранено.</p>
      </section>
    );
  const submit = async () => {
    const energyValue = energy === '' ? undefined : Number(energy);
    const moodValue = mood === '' ? undefined : Number(mood);
    const sleepValue = sleep === '' ? undefined : Number(sleep);
    if (
      (energyValue !== undefined &&
        (!Number.isInteger(energyValue) || energyValue < 1 || energyValue > 5)) ||
      (moodValue !== undefined && (!Number.isInteger(moodValue) || moodValue < 1 || moodValue > 5))
    ) {
      setError('Энергия и настроение должны быть целыми значениями от 1 до 5.');
      return;
    }
    if (sleepValue !== undefined && (!Number.isInteger(sleepValue) || sleepValue < 0)) {
      setError('Сон должен быть неотрицательным целым числом минут.');
      return;
    }
    const committed = await onSubmit({
      ...(energyValue === undefined ? {} : { energy: energyValue }),
      ...(moodValue === undefined ? {} : { mood: moodValue }),
      ...(sleepValue === undefined ? {} : { sleepDurationMinutes: sleepValue }),
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
      <FormField id="daily-sleep" label="Сон, минут" error={error}>
        <input
          type="number"
          min="0"
          step="1"
          value={sleep}
          onChange={(event) => {
            setSleep(event.target.value);
          }}
        />
      </FormField>
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
