import { useCallback, useEffect, useState } from 'react';
import { usePlanningRepository, type HistoryView } from '@/entities/planning';
import type { ApplicationClock } from '@/shared/lib/local-date/clock';
import {
  addDays,
  getLocalDateParts,
  localDateFromParts,
  startOfWeek,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';

export type HistoryMode = 'day' | 'week' | 'month';
export interface HistoryPoint {
  readonly label: LocalDate;
  readonly taskRate: number | 'unavailable';
  readonly habitRate: number | 'unavailable';
  readonly score: number | 'unavailable';
}
export type HistoryPageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; view: HistoryView; dynamics: readonly HistoryPoint[] };

function shiftMonth(date: LocalDate, offset: number): LocalDate {
  const { year, month, day } = getLocalDateParts(date);
  const index = year * 12 + month - 1 + offset;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (((index % 12) + 12) % 12) + 1;
  const nextMonth =
    targetMonth === 12
      ? localDateFromParts(targetYear + 1, 1, 1)
      : localDateFromParts(targetYear, targetMonth + 1, 1);
  const last = getLocalDateParts(addDays(nextMonth, -1)).day;
  return localDateFromParts(targetYear, targetMonth, Math.min(day, last));
}
/**
 * The result the chart plots for a period.
 *
 * Month mode used to return `view.selectedDay.score` — one day's result standing
 * in for a whole month — so selecting an empty day inside a month full of work
 * made every point unavailable and blanked the chart entirely (003 FR-035,
 * FR-037). Both week and month now read the period's own aggregate.
 */
function scoreOf(view: HistoryView) {
  return view.mode === 'day'
    ? view.facts.score
    : view.mode === 'week'
      ? view.facts.progress
      : view.progress;
}
function point(view: HistoryView): HistoryPoint {
  const score = scoreOf(view);
  return {
    label: view.anchorDate,
    taskRate: score.task.rate,
    habitRate: score.habit.rate,
    score: score.value,
  };
}

export function useHistoryPage(clock: ApplicationClock) {
  const repository = usePlanningRepository();
  const current = clock.currentLocalDate();
  const [mode, setModeState] = useState<HistoryMode>('month');
  const [selectedDate, setSelectedDate] = useState<LocalDate>(current);
  const [state, setState] = useState<HistoryPageState>({ status: 'loading' });
  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const query =
      mode === 'month'
        ? ({ mode, anchorDate: selectedDate, selectedDate } as const)
        : ({ mode, anchorDate: selectedDate } as const);
    const prepared = await repository.prepareOpenPeriod(
      mode === 'day'
        ? { kind: 'day', date: selectedDate }
        : mode === 'week'
          ? { kind: 'week', weekStart: startOfWeek(selectedDate) }
          : { kind: 'month', anchorDate: selectedDate },
    );
    if (!prepared.ok) {
      setState({ status: 'error', message: 'Не удалось подготовить открытые даты истории.' });
      return;
    }
    const result = await repository.getHistoryView(query);
    if (!result.ok) {
      setState({ status: 'error', message: 'Не удалось загрузить историю.' });
      return;
    }
    const dynamics: HistoryPoint[] = [];
    if (mode !== 'day') {
      const count = mode === 'week' ? 8 : 6;
      for (let index = count - 1; index >= 0; index--) {
        const anchor =
          mode === 'week' ? addDays(selectedDate, -7 * index) : shiftMonth(selectedDate, -index);
        const samplePrepared = await repository.prepareOpenPeriod(
          mode === 'week'
            ? { kind: 'week', weekStart: startOfWeek(anchor) }
            : { kind: 'month', anchorDate: anchor },
        );
        if (!samplePrepared.ok) continue;
        const sample = await repository.getHistoryView(
          mode === 'week'
            ? { mode: 'week', anchorDate: anchor }
            : // `selectedDate` only picks which day the month view details; the
              // charted value is the month's aggregate either way (FR-037).
              { mode: 'month', anchorDate: anchor, selectedDate: anchor },
        );
        if (sample.ok) dynamics.push(point(sample.value));
      }
    }
    setState({ status: 'ready', view: result.value, dynamics });
  }, [mode, repository, selectedDate]);
  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);
  const setMode = (next: HistoryMode) => {
    setModeState(next);
  };
  const step = (direction: -1 | 1) => {
    setSelectedDate((date) =>
      mode === 'day'
        ? addDays(date, direction)
        : mode === 'week'
          ? addDays(date, 7 * direction)
          : shiftMonth(date, direction),
    );
  };
  return { state, mode, selectedDate, setMode, selectDate: setSelectedDate, step, reload: load };
}
