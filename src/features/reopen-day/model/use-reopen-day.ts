import { useState } from 'react';

import { usePlanningRepository } from '@/entities/planning';
import type { Revision } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

/**
 * Reopens a closed day (003 FR-009).
 *
 * The refusal cases are stated rather than swallowed (003 FR-014): a day whose
 * week is already completed cannot be reopened, and the owner is told why
 * instead of being left with a control that silently does nothing.
 */
export function useReopenDay(onCommitted: () => void | Promise<void>) {
  const repository = usePlanningRepository();
  const [error, setError] = useState<string>();

  const reopen = async (input: { date: LocalDate; revision: Revision }) => {
    const result = await repository.reopenDay({
      date: input.date,
      expectedDayRevision: input.revision,
    });

    if (!result.ok) {
      if (result.error.code === 'RevisionConflict') await onCommitted();
      setError(
        result.error.code === 'PeriodImmutable'
          ? 'Нельзя открыть день: неделя уже завершена.'
          : result.error.code === 'InvalidTransition'
            ? 'День уже открыт.'
            : 'Не удалось открыть день. Данные обновлены для повторной попытки.',
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
    reopen,
  };
}
