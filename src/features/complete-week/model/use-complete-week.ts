import { useState } from 'react';
import { usePlanningRepository } from '@/entities/planning';
import type { Revision } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

export function useCompleteWeek(onCommitted: () => void | Promise<void>) {
  const repository = usePlanningRepository();
  const [error, setError] = useState<string>();
  const complete = async (
    weekStart: LocalDate,
    expectedWeekRevision: Revision,
    reflection?: string,
  ) => {
    const result = await repository.completeWeek({
      weekStart,
      expectedWeekRevision,
      ...(reflection === undefined || reflection.trim() === '' ? {} : { reflection }),
    });
    if (!result.ok) {
      if (result.error.code === 'RevisionConflict') await onCommitted();
      setError(
        result.error.code === 'WeekNotClosable'
          ? 'Сначала закройте все семь дней недели.'
          : 'Не удалось завершить неделю. Обновите данные и повторите.',
      );
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };
  return { error, complete };
}
