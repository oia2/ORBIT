import { useState } from 'react';

import { usePlanningRepository } from '@/entities/planning';
import type { HabitOccurrenceId, Revision } from '@/shared/lib/ids';

export function useHabitOutcome(onCommitted: () => void | Promise<void>) {
  const repository = usePlanningRepository();
  const [error, setError] = useState<string>();
  const finish = async (result: Awaited<ReturnType<typeof repository.deleteHabitOccurrence>>) => {
    if (!result.ok) {
      if (result.error.code === 'RevisionConflict') await onCommitted();
      setError(
        result.error.code === 'PeriodImmutable'
          ? 'Закрытый день нельзя изменить.'
          : 'Не удалось изменить привычку. Обновите данные и повторите.',
      );
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };
  const record = async (
    occurrenceId: HabitOccurrenceId,
    outcome: 'completed' | 'not-completed',
    expectedRevision: Revision,
  ) => finish(await repository.recordHabitOutcome({ occurrenceId, outcome, expectedRevision }));
  const correct = async (occurrenceId: HabitOccurrenceId, expectedRevision: Revision) =>
    finish(await repository.correctBoundaryMissToCompleted({ occurrenceId, expectedRevision }));
  const remove = async (occurrenceId: HabitOccurrenceId, expectedRevision: Revision) =>
    finish(await repository.deleteHabitOccurrence({ occurrenceId, expectedRevision }));
  const edit = async (occurrenceId: HabitOccurrenceId, title: string, expectedRevision: Revision) =>
    finish(await repository.editHabitOccurrence({ occurrenceId, title, expectedRevision }));
  return {
    error,
    clearError: () => {
      setError(undefined);
    },
    record,
    correct,
    remove,
    edit,
  };
}
