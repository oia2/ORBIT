import { useState } from 'react';

import {
  usePlanningRepository,
  type CommandResult,
  type RecurrenceRule,
} from '@/entities/planning';
import type { HabitDefinitionId, Revision } from '@/shared/lib/ids';

export function useManageHabit(onCommitted: () => void | Promise<void>) {
  const repository = usePlanningRepository();
  const [error, setError] = useState<string>();
  const finish = async (result: CommandResult<unknown>, message: string) => {
    if (!result.ok) {
      if (result.error.code === 'RevisionConflict') await onCommitted();
      setError(message);
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };
  const create = async (input: { title: string; rule: RecurrenceRule }) =>
    finish(
      await repository.createHabitDefinition({ title: input.title, recurrenceRule: input.rule }),
      'Не удалось сохранить привычку. Проверьте данные и повторите.',
    );
  const update = async (input: {
    definitionId: HabitDefinitionId;
    rule: RecurrenceRule;
    revision: Revision;
  }) =>
    finish(
      await repository.updateHabitRule({
        definitionId: input.definitionId,
        recurrenceRule: input.rule,
        expectedRevision: input.revision,
      }),
      'Не удалось изменить повтор привычки. Данные обновлены для повторной попытки.',
    );
  const stop = async (definitionId: HabitDefinitionId, expectedRevision: Revision) =>
    finish(
      await repository.stopHabitDefinition({ definitionId, expectedRevision }),
      'Не удалось остановить повтор привычки. Данные обновлены для повторной попытки.',
    );
  return {
    error,
    clearError: () => {
      setError(undefined);
    },
    create,
    update,
    stop,
  };
}
