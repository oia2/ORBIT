import { useCallback, useEffect, useState } from 'react';

import { usePlanningRepository, type BacklogView } from '@/entities/planning';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

export type BacklogPageState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly view: BacklogView;
      readonly availableMoveDates: readonly LocalDate[];
    }
  | { readonly status: 'error'; readonly message: string };

export function useBacklogPage(currentDate?: LocalDate) {
  const repository = usePlanningRepository();
  const [state, setState] = useState<BacklogPageState>({ status: 'loading' });
  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    if (currentDate !== undefined) {
      const ensured = await repository.ensureCalendarWeek({ date: currentDate });
      if (!ensured.ok) {
        setState({ status: 'error', message: 'Не удалось подготовить даты планирования.' });
        return;
      }
      const prepared = await repository.prepareOpenPeriod({
        kind: 'week',
        weekStart: ensured.value,
      });
      if (!prepared.ok) {
        setState({ status: 'error', message: 'Не удалось подготовить даты планирования.' });
        return;
      }
    }
    const [result, weekResult] = await Promise.all([
      repository.getBacklogView(),
      currentDate === undefined ? Promise.resolve(undefined) : repository.getWeekView(currentDate),
    ]);
    if (!result.ok) {
      setState({
        status: 'error',
        message:
          result.error.code === 'QuotaExceeded'
            ? 'Хранилище переполнено. Изменения не сохранены.'
            : 'Не удалось загрузить бэклог.',
      });
      return;
    }
    if (weekResult !== undefined && !weekResult.ok) {
      setState({ status: 'error', message: 'Не удалось загрузить даты планирования.' });
      return;
    }
    setState({
      status: 'ready',
      view: result.value,
      availableMoveDates:
        weekResult === undefined
          ? []
          : weekResult.value.days.filter((day) => day.status === 'open').map((day) => day.date),
    });
  }, [currentDate, repository]);

  useEffect(() => {
    queueMicrotask(() => {
      void reload();
    });
  }, [reload]);

  return { state, reload };
}
