import { useCallback, useEffect, useState } from 'react';

import { usePlanningRepository, type DayView, type WeekView } from '@/entities/planning';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

export type WeekPageState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly view: WeekView; readonly dayViews: readonly DayView[] }
  | { readonly status: 'error'; readonly message: string };

export function useWeekPage(weekStart: LocalDate) {
  const repository = usePlanningRepository();
  const [state, setState] = useState<WeekPageState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    const ensured = await repository.ensureCalendarWeek({ date: weekStart });
    if (!ensured.ok) {
      setState({ status: 'error', message: 'Не удалось подготовить неделю.' });
      return;
    }
    const prepared = await repository.prepareOpenPeriod({ kind: 'week', weekStart });
    if (!prepared.ok) {
      setState({ status: 'error', message: 'Не удалось обновить план недели.' });
      return;
    }
    const result = await repository.getWeekView(weekStart);
    if (!result.ok) {
      setState({ status: 'error', message: 'Не удалось загрузить неделю.' });
      return;
    }
    const dayResults = await Promise.all(
      result.value.days.map((day) => repository.getDayView(day.date)),
    );
    if (dayResults.some((dayResult) => !dayResult.ok)) {
      setState({ status: 'error', message: 'Не удалось загрузить дни недели.' });
      return;
    }
    setState({
      status: 'ready',
      view: result.value,
      dayViews: dayResults.map((dayResult) => {
        if (!dayResult.ok) throw new Error('Checked above');
        return dayResult.value;
      }),
    });
  }, [repository, weekStart]);

  useEffect(() => {
    queueMicrotask(() => {
      void reload();
    });
  }, [reload]);

  return { state, reload };
}
