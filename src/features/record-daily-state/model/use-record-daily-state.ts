import { useState } from 'react';

import { usePlanningRepository } from '@/entities/planning';
import type { Revision } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

export interface DailyStateDraft {
  readonly energy?: number;
  readonly mood?: number;
  readonly sleepDurationMinutes?: number;
}

export function useRecordDailyState(onCommitted: () => void | Promise<void>) {
  const repository = usePlanningRepository();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const save = async (input: DailyStateDraft & { date: LocalDate; revision: Revision }) => {
    setSaved(false);
    const result = await repository.saveDailyState({
      date: input.date,
      expectedDayRevision: input.revision,
      ...(input.energy === undefined ? {} : { energy: input.energy as 1 }),
      ...(input.mood === undefined ? {} : { mood: input.mood as 1 }),
      ...(input.sleepDurationMinutes === undefined
        ? {}
        : { sleepDurationMinutes: input.sleepDurationMinutes as never }),
    });
    if (!result.ok) {
      if (result.error.code === 'RevisionConflict') await onCommitted();
      setError(
        result.error.code === 'PeriodImmutable'
          ? 'Закрытый день нельзя изменить.'
          : 'Не удалось сохранить состояние. Данные оставлены в форме.',
      );
      setSaved(false);
      return false;
    }
    setError(undefined);
    setSaved(true);
    await onCommitted();
    return true;
  };
  return {
    error,
    saved,
    clearError: () => {
      setError(undefined);
    },
    save,
  };
}
