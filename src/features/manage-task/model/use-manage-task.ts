import { useState } from 'react';

import {
  usePlanningRepository,
  type DomainOrStorageError,
  type PlanningRepository,
  type RecurrenceRule,
} from '@/entities/planning';
import {
  dayPosition,
  durationMinutes,
  type Revision,
  type TaskOccurrenceId,
  type TaskSeriesId,
} from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

export function useManageTask(onCommitted: () => void | Promise<void>) {
  const repository = usePlanningRepository();
  const [error, setError] = useState<string>();

  const recoverConflict = async (failure: DomainOrStorageError) => {
    if (failure.code === 'RevisionConflict') await onCommitted();
  };

  const createDated = async (input: {
    readonly date: LocalDate;
    readonly title: string;
    readonly notes?: string;
    readonly duration: number;
    readonly position: number;
  }) => {
    if (!Number.isInteger(input.duration) || input.duration <= 0) {
      setError('Длительность должна быть целым числом больше нуля.');
      return false;
    }
    const result = await repository.createTask({
      title: input.title,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      placement: { kind: 'day', date: input.date },
      durationMinutes: durationMinutes(input.duration),
      dayPosition: dayPosition(input.position),
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError('Не удалось сохранить задачу. Черновик сохранён.');
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const createBacklog = async (title: string, notes?: string) => {
    const result = await repository.createTask({
      title,
      ...(notes === undefined ? {} : { notes }),
      placement: { kind: 'backlog' },
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError('Не удалось сохранить задачу. Черновик сохранён.');
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const reorderDated = async (
    date: LocalDate,
    occurrenceIds: readonly TaskOccurrenceId[],
    expectedDayRevision: Parameters<
      PlanningRepository['reorderDatedTasks']
    >[0]['expectedDayRevision'],
  ) => {
    const result = await repository.reorderDatedTasks({
      date,
      orderedOccurrenceIds: occurrenceIds,
      expectedDayRevision,
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError('Порядок изменился. Обновите данные и повторите.');
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const toggleCompletion = async (input: {
    occurrenceId: TaskOccurrenceId;
    date: LocalDate;
    completed: boolean;
    revision: Parameters<PlanningRepository['setTaskCompletion']>[0]['expectedRevision'];
  }) => {
    const result = await repository.setTaskCompletion({
      occurrenceId: input.occurrenceId,
      date: input.date,
      completed: input.completed,
      expectedRevision: input.revision,
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError('Не удалось изменить выполнение задачи. Обновите данные и повторите.');
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const edit = async (input: {
    occurrenceId: TaskOccurrenceId;
    title: string;
    duration?: number;
    revision: Parameters<PlanningRepository['editTaskOccurrence']>[0]['expectedRevision'];
  }) => {
    if (
      input.duration !== undefined &&
      (!Number.isInteger(input.duration) || input.duration <= 0)
    ) {
      setError('Длительность должна быть целым числом больше нуля.');
      return false;
    }
    const result = await repository.editTaskOccurrence({
      occurrenceId: input.occurrenceId,
      title: input.title,
      ...(input.duration === undefined ? {} : { durationMinutes: durationMinutes(input.duration) }),
      expectedRevision: input.revision,
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError('Не удалось изменить задачу. Обновите данные и повторите.');
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const remove = async (
    occurrenceId: TaskOccurrenceId,
    revision: Parameters<PlanningRepository['deleteTaskOccurrence']>[0]['expectedRevision'],
  ) => {
    const result = await repository.deleteTaskOccurrence({
      occurrenceId,
      expectedRevision: revision,
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError('Не удалось удалить задачу. Обновите данные и повторите.');
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const moveToBacklog = async (
    occurrenceId: TaskOccurrenceId,
    revision: Parameters<PlanningRepository['moveTaskToBacklog']>[0]['expectedRevision'],
  ) => {
    const result = await repository.moveTaskToBacklog({
      occurrenceId,
      expectedRevision: revision,
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError(
        result.error.code === 'TaskMustBeIncompleteToMove'
          ? 'Сначала снимите отметку выполнения.'
          : 'Не удалось переместить задачу.',
      );
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const moveToDate = async (input: {
    occurrenceId: TaskOccurrenceId;
    destinationDate: LocalDate;
    duration: number;
    position?: number;
    revision: Parameters<PlanningRepository['moveTaskToDate']>[0]['expectedRevision'];
  }) => {
    if (!Number.isInteger(input.duration) || input.duration <= 0) {
      setError('Длительность должна быть целым числом больше нуля.');
      return false;
    }
    let position = input.position;
    if (position === undefined) {
      const ensured = await repository.ensureCalendarWeek({ date: input.destinationDate });
      if (!ensured.ok) {
        setError('Не удалось подготовить выбранный день.');
        return false;
      }
      const destination = await repository.getDayView(input.destinationDate);
      if (!destination.ok) {
        setError('Не удалось загрузить выбранный день.');
        return false;
      }
      position = destination.value.tasks.length;
    }
    const result = await repository.moveTaskToDate({
      occurrenceId: input.occurrenceId,
      destinationDate: input.destinationDate,
      durationMinutes: durationMinutes(input.duration),
      dayPosition: dayPosition(position),
      expectedRevision: input.revision,
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError(
        result.error.code === 'TaskMustBeIncompleteToMove'
          ? 'Сначала снимите отметку выполнения.'
          : result.error.code === 'MoveTargetClosed'
            ? 'Выбранный день закрыт.'
            : 'Не удалось переместить задачу.',
      );
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const createSeries = async (input: { title: string; duration: number; rule: RecurrenceRule }) => {
    if (!Number.isInteger(input.duration) || input.duration <= 0) {
      setError('Длительность должна быть целым числом больше нуля.');
      return false;
    }
    const result = await repository.createTaskSeries({
      template: { title: input.title, plannedDurationMinutes: durationMinutes(input.duration) },
      recurrenceRule: input.rule,
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError('Не удалось сохранить повтор задачи. Проверьте данные и повторите.');
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const updateSeries = async (input: {
    seriesId: TaskSeriesId;
    rule: RecurrenceRule;
    revision: Revision;
  }) => {
    const result = await repository.updateTaskSeriesRule({
      seriesId: input.seriesId,
      recurrenceRule: input.rule,
      expectedRevision: input.revision,
    });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError('Не удалось изменить повтор задачи. Данные обновлены для повторной попытки.');
      return false;
    }
    setError(undefined);
    await onCommitted();
    return true;
  };

  const stopSeries = async (seriesId: TaskSeriesId, expectedRevision: Revision) => {
    const result = await repository.stopTaskSeries({ seriesId, expectedRevision });
    if (!result.ok) {
      await recoverConflict(result.error);
      setError('Не удалось остановить повтор задачи. Данные обновлены для повторной попытки.');
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
    createDated,
    createBacklog,
    reorderDated,
    toggleCompletion,
    edit,
    remove,
    moveToBacklog,
    moveToDate,
    createSeries,
    updateSeries,
    stopSeries,
  };
}
