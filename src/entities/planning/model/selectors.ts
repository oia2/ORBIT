import { compareLocalDates, weekDates, type LocalDate } from '@/shared/lib/local-date/local-date';
import { INITIAL_REVISION, type NonNegativeDurationMinutes } from '@/shared/lib/ids';

import { createOpenDay, type ClosedDay, type Day, type OpenDay, type ScoreBreakdown } from './day';
import type { HabitOccurrence } from './habit';
import { addCompletionCounts, dayCompletionCounts } from './day-counts';
import {
  deriveHistoryDateRange,
  explainTaskMembership,
  orderTaskEvents,
  orderTaskMemberships,
  type BacklogView,
  type DayView,
  type HistoricalDayFacts,
  type HistoricalTaskProjection,
  type HistoricalWeekFacts,
  type HistoryMonthCalendarCell,
  type HistorySelection,
  type HistoryView,
  type ProjectedTaskMembership,
  type TaskHistoryView,
  type TaskMembershipHistoryFact,
  type WeekDaySummary,
  type WeekView,
} from './history';
import { calculatePlannedLoad } from './planned-load';
import { calculateCompletionScore } from './scoring';
import {
  isDatedTaskOccurrence,
  sortDatedTaskOccurrences,
  type BacklogTaskOccurrence,
  type TaskEvent,
  type TaskOccurrence,
  type TaskPlanEntry,
  type TaskPlannedSnapshot,
  type TaskValueSnapshot,
} from './task';
import { isCompletedWeek, type CompletedWeek, type OpenWeek, type Week } from './week';

const unavailableScore: ScoreBreakdown = {
  task: { completed: 0, applicable: 0, rate: 'unavailable' },
  habit: { completed: 0, applicable: 0, rate: 'unavailable' },
  value: 'unavailable',
};

export interface PlanningTaskProjection extends ProjectedTaskMembership {
  readonly planned: TaskPlannedSnapshot;
  readonly current: TaskValueSnapshot;
  readonly hasChanges: boolean;
}

/**
 * `habitDefinitions` and `taskSeries` are dropped: they are part of the
 * server's day projection so a recurrence editor can reach the series, and this
 * in-model selector works purely from the occurrences it is handed.
 */
export interface OpenDayPlanningView extends Omit<
  DayView,
  'day' | 'tasks' | 'habitDefinitions' | 'taskSeries'
> {
  readonly day: OpenDay;
  readonly tasks: readonly PlanningTaskProjection[];
}

export interface OpenWeekDayPlanningSummary extends WeekDaySummary {
  readonly tasks: readonly PlanningTaskProjection[];
}

export interface OpenWeekPlanningView extends Omit<WeekView, 'week' | 'days'> {
  readonly week: OpenWeek;
  readonly days: readonly OpenWeekDayPlanningSummary[];
}

export interface OpenBacklogPlanningView extends BacklogView {
  readonly tasks: readonly BacklogTaskOccurrence[];
}

interface PlanningProjectionSource {
  readonly occurrences: readonly TaskOccurrence[];
  readonly planEntries: readonly TaskPlanEntry[];
  readonly events?: readonly TaskEvent[];
}

export interface DaySignalSource {
  readonly occurrences: readonly TaskOccurrence[];
  readonly planEntries: readonly TaskPlanEntry[];
  readonly habits?: readonly HabitOccurrence[];
}

export interface SelectDaySignalsInput extends DaySignalSource {
  readonly day: Day;
}

export type DaySignalCalculation = 'live' | 'frozen';

/** Domain-owned facts consumed by Day and Week views without UI recalculation. */
export interface DaySignalProjection {
  readonly day: Day;
  readonly calculation: DaySignalCalculation;
  readonly score: ScoreBreakdown;
  readonly plannedLoadMinutes: NonNegativeDurationMinutes;
}

export interface SelectWeekSignalsInput extends DaySignalSource {
  readonly week: Week;
  readonly days: readonly Day[];
}

export interface WeekSignalProjection {
  readonly week: Week;
  readonly days: readonly DaySignalProjection[];
}

export interface SelectCompletedWeekReviewInput {
  readonly week: Week;
  /** May include adjacent/future records; only the completed week's owned days are selected. */
  readonly days: readonly Day[];
}

export interface CompletedWeekReviewProjection {
  readonly week: CompletedWeek;
  readonly days: readonly ClosedDay[];
  readonly progress: ScoreBreakdown;
  readonly reflection?: string;
  readonly immutable: true;
}

export interface SelectOpenDayPlanningInput extends PlanningProjectionSource {
  readonly day: Day;
  readonly habits?: readonly HabitOccurrence[];
  readonly score?: ScoreBreakdown;
}

export interface SelectOpenWeekPlanningInput extends PlanningProjectionSource {
  readonly week: Week;
  readonly days: readonly Day[];
  readonly habits?: readonly HabitOccurrence[];
  readonly scoreForDate?: (date: LocalDate) => ScoreBreakdown;
  readonly progress?: ScoreBreakdown;
}

export interface SelectOpenBacklogInput {
  readonly occurrences: readonly TaskOccurrence[];
}

export interface SelectCurrentTaskMembershipInput {
  readonly occurrence: TaskOccurrence;
  readonly memberships: readonly TaskPlanEntry[];
}

export interface SelectTaskHistoryViewInput {
  readonly occurrence: TaskOccurrence;
  readonly memberships: readonly TaskPlanEntry[];
  readonly events: readonly TaskEvent[];
}

/** All collections are already bounded/indexed by the adapter's derived period. */
export interface SelectHistoryViewInput {
  readonly query: HistorySelection;
  readonly weeks: readonly Week[];
  readonly days: readonly Day[];
  readonly taskOccurrences: readonly TaskOccurrence[];
  readonly taskPlanEntries: readonly TaskPlanEntry[];
  readonly taskEvents: readonly TaskEvent[];
  readonly habitOccurrences: readonly HabitOccurrence[];
}

export interface SelectedTaskHistoryView extends TaskHistoryView {
  readonly membershipFacts: readonly TaskMembershipHistoryFact[];
}

function taskValueSnapshot(occurrence: TaskOccurrence): TaskValueSnapshot {
  return {
    title: occurrence.title,
    ...(occurrence.notes === undefined ? {} : { notes: occurrence.notes }),
    ...(occurrence.plannedDurationMinutes === undefined
      ? {}
      : { plannedDurationMinutes: occurrence.plannedDurationMinutes }),
  };
}

function snapshotsDiffer(planned: TaskPlannedSnapshot, current: TaskValueSnapshot): boolean {
  return (
    planned.title !== current.title ||
    planned.notes !== current.notes ||
    planned.plannedDurationMinutes !== current.plannedDurationMinutes
  );
}

function taskProjectionsForDate(
  source: PlanningProjectionSource,
  date: LocalDate,
): readonly PlanningTaskProjection[] {
  return sortDatedTaskOccurrences(source.occurrences, date).map((occurrence) => {
    const memberships = source.planEntries.filter(
      (entry) => entry.occurrenceId === occurrence.id && entry.date === date,
    );
    if (memberships.length !== 1 || memberships[0] === undefined) {
      throw new RangeError(
        `Dated task ${occurrence.id} must have exactly one membership for ${date}`,
      );
    }
    const membership = memberships[0];
    const current = taskValueSnapshot(occurrence);
    return {
      occurrence,
      membership,
      events: (source.events ?? []).filter((event) => event.occurrenceId === occurrence.id),
      planned: membership.plannedSnapshot,
      current,
      hasChanges: snapshotsDiffer(membership.plannedSnapshot, current),
    };
  });
}

function exactWeekDays(week: Week, days: readonly Day[]): readonly Day[] {
  const expectedDates = weekDates(week.startDate);
  const daysByDate = new Map<LocalDate, Day>();
  for (const day of days) {
    if (daysByDate.has(day.date)) {
      throw new RangeError(`Duplicate Day ${day.date}`);
    }
    daysByDate.set(day.date, day);
  }
  if (
    days.length !== expectedDates.length ||
    days.some((day) => day.weekStart !== week.startDate || !expectedDates.includes(day.date))
  ) {
    throw new RangeError(`Week ${week.startDate} requires its exact seven owned days`);
  }

  return expectedDates.map((date) => {
    const day = daysByDate.get(date);
    if (day === undefined) {
      throw new RangeError(`Week ${week.startDate} is missing Day ${date}`);
    }
    return day;
  });
}

/**
 * Selects live facts for an open Day and the immutable closure snapshot for a
 * closed Day. Daily State is retained as context on `day`, never as score/load
 * input.
 */
export function selectDaySignals(input: SelectDaySignalsInput): DaySignalProjection {
  if (input.day.status === 'closed') {
    return {
      day: input.day,
      calculation: 'frozen',
      score: input.day.closureSnapshot.score,
      plannedLoadMinutes: input.day.closureSnapshot.plannedLoadMinutes,
    };
  }

  return {
    day: input.day,
    calculation: 'live',
    score: calculateCompletionScore(
      dayCompletionCounts(input.planEntries, input.habits ?? [], input.day.date),
    ),
    plannedLoadMinutes: calculatePlannedLoad(input.occurrences, input.day.date, input.habits ?? []),
  };
}

/** Projects the Week's ordered Days through the same live/frozen policy. */
export function selectWeekSignals(input: SelectWeekSignalsInput): WeekSignalProjection {
  return {
    week: input.week,
    days: exactWeekDays(input.week, input.days).map((day) =>
      selectDaySignals({
        day,
        occurrences: input.occurrences,
        planEntries: input.planEntries,
        ...(input.habits === undefined ? {} : { habits: input.habits }),
      }),
    ),
  };
}

/** Reads only frozen records owned by one completed week; adjacent plans cannot affect it. */
export function selectCompletedWeekReview(
  input: SelectCompletedWeekReviewInput,
): CompletedWeekReviewProjection {
  if (!isCompletedWeek(input.week)) {
    throw new RangeError(`Week ${input.week.startDate} is not completed`);
  }
  const expectedDates = new Set(weekDates(input.week.startDate));
  const ownedDays = input.days.filter((day) => expectedDates.has(day.date));
  const days = exactWeekDays(input.week, ownedDays);
  if (days.some((day) => day.status !== 'closed')) {
    throw new RangeError(`Completed week ${input.week.startDate} contains an open Day`);
  }

  return {
    week: input.week,
    days: days as readonly ClosedDay[],
    progress: input.week.completionSnapshot.progress,
    ...(input.week.reflection === undefined ? {} : { reflection: input.week.reflection }),
    immutable: true,
  };
}

export function selectOpenDayPlanningView(input: SelectOpenDayPlanningInput): OpenDayPlanningView {
  if (input.day.status !== 'open') {
    throw new RangeError(`Day ${input.day.date} is closed`);
  }

  const tasks = taskProjectionsForDate(input, input.day.date);
  const signals = selectDaySignals(input);
  return {
    day: input.day,
    tasks,
    habits: input.habits ?? [],
    score: input.score ?? signals.score,
    plannedLoadMinutes: signals.plannedLoadMinutes,
    unfinishedTaskIds: tasks
      .filter(
        (task) =>
          isDatedTaskOccurrence(task.occurrence) && task.occurrence.completion === 'incomplete',
      )
      .map((task) => task.occurrence.id),
  };
}

export function selectOpenWeekPlanningView(
  input: SelectOpenWeekPlanningInput,
): OpenWeekPlanningView {
  if (input.week.status !== 'open') {
    throw new RangeError(`Week ${input.week.startDate} is completed`);
  }

  const days = exactWeekDays(input.week, input.days);

  return {
    week: input.week,
    days: days.map((day) => {
      const signals = selectDaySignals({
        day,
        occurrences: input.occurrences,
        planEntries: input.planEntries,
        ...(input.habits === undefined ? {} : { habits: input.habits }),
      });
      return {
        date: day.date,
        status: day.status,
        score:
          day.status === 'closed'
            ? signals.score
            : (input.scoreForDate?.(day.date) ?? signals.score),
        plannedLoadMinutes: signals.plannedLoadMinutes,
        tasks: taskProjectionsForDate(input, day.date),
      };
    }),
    progress: input.progress ?? unavailableScore,
  };
}

function isBacklogTask(occurrence: TaskOccurrence): occurrence is BacklogTaskOccurrence {
  return occurrence.state === 'active' && occurrence.placement.kind === 'backlog';
}

export function selectOpenBacklogView(input: SelectOpenBacklogInput): OpenBacklogPlanningView {
  return {
    tasks: input.occurrences.filter(isBacklogTask).toSorted((left, right) => {
      const byCreation = left.createdSequence - right.createdSequence;
      return byCreation !== 0 ? byCreation : left.id.localeCompare(right.id);
    }),
  };
}

/**
 * A current dated placement has exactly one reusable occurrence/date
 * membership. Moved-away memberships remain history and are never projected as
 * additional current tasks.
 */
export function selectCurrentTaskMembership(
  input: SelectCurrentTaskMembershipInput,
): TaskPlanEntry | undefined {
  if (!isDatedTaskOccurrence(input.occurrence)) {
    return undefined;
  }
  const currentDate = input.occurrence.placement.date;
  const matching = input.memberships.filter(
    (membership) =>
      membership.occurrenceId === input.occurrence.id && membership.date === currentDate,
  );
  if (matching.length !== 1 || matching[0] === undefined) {
    throw new RangeError(
      `Current dated task ${input.occurrence.id} must have exactly one membership for ${currentDate}`,
    );
  }
  return matching[0];
}

export function selectTaskHistoryView(input: SelectTaskHistoryViewInput): SelectedTaskHistoryView {
  const membershipKeys = new Set<string>();
  for (const membership of input.memberships) {
    if (membership.occurrenceId !== input.occurrence.id) {
      throw new RangeError(
        `Membership ${membership.id} does not belong to occurrence ${input.occurrence.id}`,
      );
    }
    const key = `${membership.occurrenceId}:${membership.date}`;
    if (membershipKeys.has(key)) {
      throw new RangeError(
        `Occurrence ${input.occurrence.id} has duplicate membership for ${membership.date}`,
      );
    }
    membershipKeys.add(key);
  }
  if (input.events.some((event) => event.occurrenceId !== input.occurrence.id)) {
    throw new RangeError(`Task history contains an event for another occurrence`);
  }

  const memberships = orderTaskMemberships(input.memberships);
  return {
    occurrence: input.occurrence,
    memberships,
    events: orderTaskEvents(input.events),
    membershipFacts: memberships.map((membership) =>
      explainTaskMembership(input.occurrence, membership),
    ),
  };
}

function uniqueDayForDate(days: readonly Day[], date: LocalDate): Day | undefined {
  const matches = days.filter((day) => day.date === date);
  if (matches.length > 1) {
    throw new RangeError(`Duplicate Day ${date}`);
  }
  return matches[0];
}

function uniqueWeekForStart(weeks: readonly Week[], startDate: LocalDate): Week | undefined {
  const matches = weeks.filter((week) => week.startDate === startDate);
  if (matches.length > 1) {
    throw new RangeError(`Duplicate Week ${startDate}`);
  }
  return matches[0];
}

function occurrenceIndex(
  occurrences: readonly TaskOccurrence[],
): ReadonlyMap<TaskOccurrence['id'], TaskOccurrence> {
  const result = new Map<TaskOccurrence['id'], TaskOccurrence>();
  for (const occurrence of occurrences) {
    if (result.has(occurrence.id)) {
      throw new RangeError(`Duplicate task occurrence ${occurrence.id}`);
    }
    result.set(occurrence.id, occurrence);
  }
  return result;
}

function historicalTasksForDate(
  input: SelectHistoryViewInput,
  date: LocalDate,
  occurrencesById: ReadonlyMap<TaskOccurrence['id'], TaskOccurrence>,
): readonly HistoricalTaskProjection[] {
  const memberships = orderTaskMemberships(
    input.taskPlanEntries.filter((membership) => membership.date === date),
  );
  const membershipOccurrences = new Set<TaskOccurrence['id']>();

  return memberships.map((membership) => {
    if (membershipOccurrences.has(membership.occurrenceId)) {
      throw new RangeError(
        `Occurrence ${membership.occurrenceId} has duplicate membership for ${date}`,
      );
    }
    membershipOccurrences.add(membership.occurrenceId);

    const occurrence = occurrencesById.get(membership.occurrenceId);
    if (occurrence === undefined) {
      throw new RangeError(`Membership ${membership.id} has no task occurrence`);
    }
    return {
      occurrence,
      membership,
      events: orderTaskEvents(
        input.taskEvents.filter((event) => event.occurrenceId === occurrence.id),
      ),
      explanation: explainTaskMembership(occurrence, membership),
    };
  });
}

function historicalHabitsForDate(
  occurrences: readonly HabitOccurrence[],
  date: LocalDate,
): readonly HabitOccurrence[] {
  return occurrences
    .filter((occurrence) => occurrence.date === date)
    .map((occurrence) => ({
      ...occurrence,
      outcomeEvents: occurrence.outcomeEvents.toSorted((left, right) => {
        const byOrdinal = left.ordinal - right.ordinal;
        return byOrdinal !== 0 ? byOrdinal : left.occurredAt.localeCompare(right.occurredAt);
      }),
    }))
    .toSorted((left, right) => {
      const byDefinition = left.definitionId.localeCompare(right.definitionId);
      return byDefinition !== 0 ? byDefinition : left.id.localeCompare(right.id);
    });
}

function historicalDayFacts(
  input: SelectHistoryViewInput,
  date: LocalDate,
  occurrencesById: ReadonlyMap<TaskOccurrence['id'], TaskOccurrence>,
): HistoricalDayFacts {
  const day = uniqueDayForDate(input.days, date) ?? createOpenDay(date);
  const signals = selectDaySignals({
    day,
    occurrences: input.taskOccurrences,
    planEntries: input.taskPlanEntries,
    habits: input.habitOccurrences,
  });
  return {
    day,
    tasks: historicalTasksForDate(input, date, occurrencesById),
    habits: historicalHabitsForDate(input.habitOccurrences, date),
    score: signals.score,
    plannedLoadMinutes: signals.plannedLoadMinutes,
  };
}

function aggregateHistoricalProgress(days: readonly HistoricalDayFacts[]): ScoreBreakdown {
  const counts = days.reduce(
    (total, facts) => ({
      task: addCompletionCounts(total.task, facts.score.task),
      habit: addCompletionCounts(total.habit, facts.score.habit),
    }),
    {
      task: { completed: 0, applicable: 0 },
      habit: { completed: 0, applicable: 0 },
    },
  );
  return calculateCompletionScore(counts);
}

function emptyWeek(startDate: LocalDate): OpenWeek {
  return { startDate, goals: [], status: 'open', revision: INITIAL_REVISION };
}

function historicalWeekFacts(
  input: SelectHistoryViewInput,
  week: Week,
  occurrencesById: ReadonlyMap<TaskOccurrence['id'], TaskOccurrence>,
): HistoricalWeekFacts {
  const days = weekDates(week.startDate).map((date) =>
    historicalDayFacts(input, date, occurrencesById),
  );
  return {
    week,
    days,
    progress:
      week.status === 'completed'
        ? week.completionSnapshot.progress
        : aggregateHistoricalProgress(days),
    ...(week.reflection === undefined ? {} : { reflection: week.reflection }),
  };
}

function dateIsInside(date: LocalDate, startDate: LocalDate, endDate: LocalDate): boolean {
  return compareLocalDates(date, startDate) >= 0 && compareLocalDates(date, endDate) <= 0;
}

/**
 * Builds immutable Day, Week, or Month facts from normalized records. Audit
 * events explain memberships but never create additional scoring records.
 */
export function selectHistoryView(input: SelectHistoryViewInput): HistoryView {
  const range = deriveHistoryDateRange(input.query);
  const occurrencesById = occurrenceIndex(input.taskOccurrences);

  if (range.mode === 'day') {
    return {
      mode: range.mode,
      anchorDate: range.anchorDate,
      facts: historicalDayFacts(input, range.anchorDate, occurrencesById),
    };
  }

  if (range.mode === 'week') {
    const week = uniqueWeekForStart(input.weeks, range.weekStart) ?? emptyWeek(range.weekStart);
    return {
      mode: range.mode,
      anchorDate: range.anchorDate,
      weekStart: range.weekStart,
      facts: historicalWeekFacts(input, week, occurrencesById),
    };
  }

  const monthDays = range.dates.map((date) => ({
    date,
    day: uniqueDayForDate(input.days, date),
    facts: historicalDayFacts(input, date, occurrencesById),
  }));
  const calendar: readonly HistoryMonthCalendarCell[] = monthDays.map(({ date, day, facts }) =>
    day === undefined
      ? { date, belongsToMonth: true }
      : { date, belongsToMonth: true, dayStatus: day.status, score: facts.score },
  );
  // The month's own result, aggregated from its days by the same rule the week
  // uses — so a chart point describes the period rather than one day in it.
  const progress = aggregateHistoricalProgress(monthDays.map(({ facts }) => facts));
  const completedWeeks = input.weeks
    .filter(
      (week): week is CompletedWeek =>
        isCompletedWeek(week) &&
        weekDates(week.startDate).every((date) =>
          dateIsInside(date, range.monthStart, range.monthEnd),
        ),
    )
    .toSorted((left, right) => compareLocalDates(left.startDate, right.startDate))
    .map((week) => historicalWeekFacts(input, week, occurrencesById));

  return {
    mode: range.mode,
    anchorDate: range.anchorDate,
    monthStart: range.monthStart,
    monthEnd: range.monthEnd,
    selectedDate: range.selectedDate,
    calendar,
    selectedDay: historicalDayFacts(input, range.selectedDate, occurrencesById),
    completedWeeks,
    progress,
  };
}
