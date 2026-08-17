import { useCallback, useEffect, useState } from 'react';

import { usePlanningRepository, type DayView } from '@/entities/planning';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

export type DayPageState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly view: DayView;
      readonly availableMoveDates: readonly LocalDate[];
    }
  | { readonly status: 'error'; readonly message: string };

export function useDayPage(date: LocalDate) {
  const repository = usePlanningRepository();
  const [state, setState] = useState<DayPageState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    const ensured = await repository.ensureCalendarWeek({ date });
    if (!ensured.ok) {
      setState({ status: 'error', message: 'Не удалось подготовить день.' });
      return;
    }
    const prepared = await repository.prepareOpenPeriod({ kind: 'day', date });
    if (!prepared.ok) {
      setState({ status: 'error', message: 'Не удалось обновить план дня.' });
      return;
    }
    const result = await repository.getDayView(date);
    const weekResult = await repository.getWeekView(date);
    setState(
      result.ok && weekResult.ok
        ? {
            status: 'ready',
            view: result.value,
            availableMoveDates: weekResult.value.days
              .filter((day) => day.status === 'open' && day.date !== date)
              .map((day) => day.date),
          }
        : { status: 'error', message: 'Не удалось загрузить день.' },
    );
  }, [date, repository]);

  useEffect(() => {
    queueMicrotask(() => {
      void reload();
    });
  }, [reload]);

  return { state, reload };
}
