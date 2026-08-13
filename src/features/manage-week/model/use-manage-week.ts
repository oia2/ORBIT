import { useState } from 'react';

import { usePlanningRepository, type CommandResult } from '@/entities/planning';
import type { Revision, WeekGoalId } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

export interface ManageWeekInput {
  readonly weekStart: LocalDate;
  readonly revision: Revision;
  readonly onCommitted: () => void | Promise<void>;
}

export function useManageWeek({ weekStart, revision, onCommitted }: ManageWeekInput) {
  const repository = usePlanningRepository();
  const [error, setError] = useState<string>();

  const finish = async <T>(result: CommandResult<T>) => {
    if (!result.ok) {
      setError(
        result.error.code === 'ValidationFailure'
          ? 'Введите цель недели.'
          : 'Не удалось сохранить изменения.',
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
    add: async (statement: string) =>
      finish(await repository.addWeeklyGoal({ weekStart, statement, expectedRevision: revision })),
    edit: async (goalId: WeekGoalId, statement: string) =>
      finish(
        await repository.editWeeklyGoal({
          weekStart,
          goalId,
          statement,
          expectedRevision: revision,
        }),
      ),
    remove: async (goalId: WeekGoalId) =>
      finish(await repository.deleteWeeklyGoal({ weekStart, goalId, expectedRevision: revision })),
    reorder: async (orderedGoalIds: readonly WeekGoalId[]) =>
      finish(
        await repository.reorderWeeklyGoals({
          weekStart,
          orderedGoalIds,
          expectedRevision: revision,
        }),
      ),
  };
}
