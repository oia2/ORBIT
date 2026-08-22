import { useState } from 'react';

import {
  usePlanningRepository,
  type CommandResult,
  type RecurrenceRule,
} from '@/entities/planning';
import { durationMinutes, type HabitDefinitionId, type Revision } from '@/shared/lib/ids';

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
  const create = async (input: { title: string; rule: RecurrenceRule; durationMinutes?: number }) =>
    finish(
      await repository.createHabitDefinition({
        title: input.title,
        ...(input.durationMinutes === undefined
          ? {}
          : { durationMinutes: durationMinutes(input.durationMinutes) }),
        recurrenceRule: input.rule,
      }),
      'Не удалось сохранить привычку. Проверьте данные и повторите.',
    );

  /**
   * Sets or clears a habit's duration (003 FR-030). Separate from `update`,
   * which versions the recurrence rule — a duration change must not fork the
   * habit's rule history.
   */
  const setDuration = async (input: {
    definitionId: HabitDefinitionId;
    durationMinutes: number | null;
    revision: Revision;
  }) =>
    finish(
      await repository.updateHabitDuration({
        definitionId: input.definitionId,
        durationMinutes:
          input.durationMinutes === null ? null : durationMinutes(input.durationMinutes),
        expectedRevision: input.revision,
      }),
      'Не удалось сохранить длительность привычки. Данные обновлены для повторной попытки.',
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
    setDuration,
    update,
    stop,
  };
}
