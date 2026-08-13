import { useState } from 'react';

import { usePlanningRepository, type CloseDayDisposition } from '@/entities/planning';
import { dayPosition, durationMinutes, type Revision } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { ValidClosureDraft } from './closure-reducer';

export function useCloseDay(onCommitted: () => void | Promise<void>) {
  const repository = usePlanningRepository();
  const [error, setError] = useState<string>();

  const close = async (input: {
    date: LocalDate;
    revision: Revision;
    dispositions: ValidClosureDraft;
  }) => {
    const dispositions: Record<string, CloseDayDisposition> = {};
    for (const [id, disposition] of Object.entries(input.dispositions)) {
      if (disposition.kind !== 'move-to-date') {
        dispositions[id] = disposition;
        continue;
      }
      const target = await repository.getDayView(disposition.destinationDate);
      if (!target.ok || target.value.day.status !== 'open') {
        setError('Выбранный день закрыт или недоступен.');
        return false;
      }
      dispositions[id] = {
        kind: 'move-to-date',
        destinationDate: disposition.destinationDate,
        durationMinutes: durationMinutes(disposition.duration),
        dayPosition: dayPosition(target.value.tasks.length),
      };
    }
    const result = await repository.closeDay({
      date: input.date,
      expectedDayRevision: input.revision,
      dispositions,
    });
    if (!result.ok) {
      if (result.error.code === 'RevisionConflict') await onCommitted();
      setError(
        result.error.code === 'PendingHabitOutcomes'
          ? 'Сначала отметьте все привычки.'
          : result.error.code === 'FutureDayClosure'
            ? 'Будущий день нельзя закрыть.'
            : 'Не удалось закрыть день. Данные обновлены для повторной попытки.',
      );
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };
  return {
    error,
    clearError: () => {
      setError(undefined);
    },
    close,
  };
}
