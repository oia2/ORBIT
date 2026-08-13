import type { ApplicationClock, Instant } from '@/shared/lib/local-date/clock';
import {
  addDays,
  compareLocalDates,
  getLocalDateParts,
  localDateFromParts,
  startOfWeek,
  weekDates,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';
import type { NonNegativeDurationMinutes, TaskOccurrenceId } from '@/shared/lib/ids';

import type { Day, ScoreBreakdown } from './day';
import type { HabitOccurrence } from './habit';
import {
  isDatedTaskOccurrence,
  type TaskEvent,
  type TaskOccurrence,
  type TaskPlanEntry,
} from './task';
import type { Week } from './week';

export interface ProjectedTaskMembership {
  readonly occurrence: TaskOccurrence;
  readonly membership: TaskPlanEntry;
  readonly events: readonly TaskEvent[];
}

export interface DayPlanningFacts {
  readonly day: Day;
  readonly tasks: readonly ProjectedTaskMembership[];
  readonly habits: readonly HabitOccurrence[];
  readonly score: ScoreBreakdown;
  readonly plannedLoadMinutes: NonNegativeDurationMinutes;
}

export interface WeekDaySummary {
  readonly date: LocalDate;
  readonly status: Day['status'];
  readonly score: ScoreBreakdown;
  readonly plannedLoadMinutes: NonNegativeDurationMinutes;
}

export interface WeekView {
  readonly week: Week;
  readonly days: readonly WeekDaySummary[];
  readonly progress: ScoreBreakdown;
}

export interface DayView extends DayPlanningFacts {
  readonly unfinishedTaskIds: readonly TaskOccurrenceId[];
}

export interface BacklogView {
  /** Already sorted by immutable creation sequence, oldest first. */
  readonly tasks: readonly TaskOccurrence[];
}

export interface TaskHistoryView {
  readonly occurrence: TaskOccurrence;
  readonly memberships: readonly TaskPlanEntry[];
  /** Ordered by persisted EventSequence, never by timestamp or UUID. */
  readonly events: readonly TaskEvent[];
}

/** Public History navigation is intentionally bounded to product-owned periods. */
export type HistorySelection =
  | { readonly mode: 'day'; readonly anchorDate: LocalDate }
  | { readonly mode: 'week'; readonly anchorDate: LocalDate }
  | {
      readonly mode: 'month';
      readonly anchorDate: LocalDate;
      readonly selectedDate: LocalDate;
    };

interface HistoryDateRangeBase {
  readonly anchorDate: LocalDate;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly dates: readonly LocalDate[];
}

export interface HistoryDayDateRange extends HistoryDateRangeBase {
  readonly mode: 'day';
}

export interface HistoryWeekDateRange extends HistoryDateRangeBase {
  readonly mode: 'week';
  readonly weekStart: LocalDate;
}

export interface HistoryMonthDateRange extends HistoryDateRangeBase {
  readonly mode: 'month';
  readonly selectedDate: LocalDate;
  readonly monthStart: LocalDate;
  readonly monthEnd: LocalDate;
}

export type HistoryDateRange = HistoryDayDateRange | HistoryWeekDateRange | HistoryMonthDateRange;

export interface HistoricalTaskProjection extends ProjectedTaskMembership {
  readonly explanation: TaskMembershipHistoryFact;
}

export interface HistoricalDayFacts extends Omit<DayPlanningFacts, 'tasks'> {
  readonly tasks: readonly HistoricalTaskProjection[];
}

export interface HistoricalWeekFacts {
  readonly week: Week;
  /** Always the fixed calendar week's Monday-through-Sunday facts. */
  readonly days: readonly HistoricalDayFacts[];
  readonly progress: ScoreBreakdown;
  readonly reflection?: string;
}

export interface HistoryDayView {
  readonly mode: 'day';
  readonly anchorDate: LocalDate;
  readonly facts: HistoricalDayFacts;
}

export interface HistoryWeekView {
  readonly mode: 'week';
  readonly anchorDate: LocalDate;
  readonly weekStart: LocalDate;
  readonly facts: HistoricalWeekFacts;
}

export interface HistoryMonthCalendarCell {
  readonly date: LocalDate;
  readonly belongsToMonth: boolean;
  readonly dayStatus?: Day['status'];
  readonly score?: ScoreBreakdown;
}

export interface HistoryMonthView {
  readonly mode: 'month';
  readonly anchorDate: LocalDate;
  readonly monthStart: LocalDate;
  readonly monthEnd: LocalDate;
  readonly selectedDate: LocalDate;
  readonly calendar: readonly HistoryMonthCalendarCell[];
  readonly selectedDay: HistoricalDayFacts;
  readonly completedWeeks: readonly HistoricalWeekFacts[];
}

export type HistoryView = HistoryDayView | HistoryWeekView | HistoryMonthView;

const COMMON_YEAR_MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function calendarMonthBounds(anchorDate: LocalDate): {
  readonly monthStart: LocalDate;
  readonly monthEnd: LocalDate;
} {
  const { year, month } = getLocalDateParts(anchorDate);
  const commonLength = COMMON_YEAR_MONTH_LENGTHS[month - 1] as number;
  const length = month === 2 && isLeapYear(year) ? 29 : commonLength;
  return {
    monthStart: localDateFromParts(year, month, 1),
    monthEnd: localDateFromParts(year, month, length),
  };
}

function inclusiveDates(startDate: LocalDate, endDate: LocalDate): readonly LocalDate[] {
  const dates: LocalDate[] = [];
  let current = startDate;
  while (compareLocalDates(current, endDate) <= 0) {
    dates.push(current);
    if (current === endDate) {
      break;
    }
    current = addDays(current, 1);
  }
  return dates;
}

/** History first opens on the clock's current local date in Month mode. */
export function createDefaultHistorySelection(clock: ApplicationClock): HistorySelection {
  const currentDate = clock.currentLocalDate();
  return { mode: 'month', anchorDate: currentDate, selectedDate: currentDate };
}

/** Derives one exact indexed range; callers cannot supply arbitrary bounds. */
export function deriveHistoryDateRange(selection: HistorySelection): HistoryDateRange {
  if (selection.mode === 'day') {
    return {
      mode: selection.mode,
      anchorDate: selection.anchorDate,
      startDate: selection.anchorDate,
      endDate: selection.anchorDate,
      dates: [selection.anchorDate],
    };
  }

  if (selection.mode === 'week') {
    const weekStart = startOfWeek(selection.anchorDate);
    const dates = weekDates(weekStart);
    return {
      mode: selection.mode,
      anchorDate: selection.anchorDate,
      startDate: weekStart,
      endDate: dates[6],
      dates,
      weekStart,
    };
  }

  const { monthStart, monthEnd } = calendarMonthBounds(selection.anchorDate);
  if (
    compareLocalDates(selection.selectedDate, monthStart) < 0 ||
    compareLocalDates(selection.selectedDate, monthEnd) > 0
  ) {
    throw new RangeError(
      `Selected date ${selection.selectedDate} does not belong to month ${monthStart}`,
    );
  }
  return {
    mode: selection.mode,
    anchorDate: selection.anchorDate,
    selectedDate: selection.selectedDate,
    startDate: monthStart,
    endDate: monthEnd,
    dates: inclusiveDates(monthStart, monthEnd),
    monthStart,
    monthEnd,
  };
}

export interface TaskMembershipDisposition {
  readonly outcome: TaskPlanEntry['outcome'];
  readonly destination?: Extract<
    TaskPlanEntry,
    { readonly outcome: 'moved' | 'backlogged' }
  >['destination'];
  readonly finalizedAt?: Instant;
}

export type TaskMembershipActual =
  | { readonly outcome: 'completed'; readonly completedAt?: Instant }
  | { readonly outcome: 'incomplete' }
  | { readonly outcome: 'excluded' };

export interface TaskMembershipHistoryFact {
  readonly membership: TaskPlanEntry;
  readonly planned: TaskPlanEntry['plannedSnapshot'];
  readonly disposition: TaskMembershipDisposition;
  readonly actual: TaskMembershipActual;
  readonly isCurrentPlacement: boolean;
}

/**
 * Membership order is independent of current placement and audit order. Local
 * date is the historical axis; immutable entry facts make ties deterministic.
 */
export function orderTaskMemberships(
  memberships: readonly TaskPlanEntry[],
): readonly TaskPlanEntry[] {
  return memberships.toSorted((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    if (byDate !== 0) {
      return byDate;
    }
    const byEnteredAt = left.enteredAt.localeCompare(right.enteredAt);
    return byEnteredAt !== 0 ? byEnteredAt : left.id.localeCompare(right.id);
  });
}

/** Persisted EventSequence is authoritative even when timestamps are equal. */
export function orderTaskEvents(events: readonly TaskEvent[]): readonly TaskEvent[] {
  return events.toSorted((left, right) => {
    const bySequence = left.sequence - right.sequence;
    return bySequence !== 0 ? bySequence : left.id.localeCompare(right.id);
  });
}

function membershipDisposition(membership: TaskPlanEntry): TaskMembershipDisposition {
  return {
    outcome: membership.outcome,
    ...(membership.outcome === 'moved' || membership.outcome === 'backlogged'
      ? { destination: membership.destination }
      : {}),
    ...(membership.finalizedAt === undefined ? {} : { finalizedAt: membership.finalizedAt }),
  };
}

function isCurrentDatedMembership(occurrence: TaskOccurrence, membership: TaskPlanEntry): boolean {
  return isDatedTaskOccurrence(occurrence) && occurrence.placement.date === membership.date;
}

function membershipActual(
  occurrence: TaskOccurrence,
  membership: TaskPlanEntry,
  isCurrentPlacement: boolean,
): TaskMembershipActual {
  if (membership.outcome === 'deleted') {
    return { outcome: 'excluded' };
  }
  if (membership.outcome !== 'completed') {
    return { outcome: 'incomplete' };
  }
  return isCurrentPlacement &&
    isDatedTaskOccurrence(occurrence) &&
    occurrence.completion === 'completed'
    ? { outcome: 'completed', completedAt: occurrence.actualCompletedAt }
    : { outcome: 'completed' };
}

export function explainTaskMembership(
  occurrence: TaskOccurrence,
  membership: TaskPlanEntry,
): TaskMembershipHistoryFact {
  if (membership.occurrenceId !== occurrence.id) {
    throw new RangeError(
      `Membership ${membership.id} does not belong to occurrence ${occurrence.id}`,
    );
  }
  const isCurrentPlacement = isCurrentDatedMembership(occurrence, membership);
  return {
    membership,
    planned: membership.plannedSnapshot,
    disposition: membershipDisposition(membership),
    actual: membershipActual(occurrence, membership, isCurrentPlacement),
    isCurrentPlacement,
  };
}
