import type { Day } from '@/entities/planning/model/day';
import type { HabitDefinition, HabitOccurrence } from '@/entities/planning/model/habit';
import { calculateCompletionScore } from '@/entities/planning/model/scoring';
import type {
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
  TaskSeries,
} from '@/entities/planning/model/task';
import type { Week } from '@/entities/planning/model/week';
import { toStoredTaskOccurrence } from '@/entities/planning/api/indexeddb/mappers';
import type { StoredTaskOccurrence } from '@/entities/planning/api/indexeddb/schema';
import {
  creationSequence,
  dayPosition,
  durationMinutes,
  eventSequence,
  nonNegativeDurationMinutes,
  revision,
  type HabitOccurrenceId,
  type TaskOccurrenceId,
  type TaskPlanEntryId,
} from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import {
  addDays,
  compareLocalDates,
  localDate,
  weekDates,
  type LocalDate,
} from '@/shared/lib/local-date/local-date';

import { deterministicEntityId } from './planning';

export const PERSONAL_HISTORY_WEEK_COUNT = 52;
export const PERSONAL_HISTORY_LAST_WEEK_START = localDate('2026-05-18');
export const PERSONAL_HISTORY_FIRST_WEEK_START = addDays(
  PERSONAL_HISTORY_LAST_WEEK_START,
  -(PERSONAL_HISTORY_WEEK_COUNT - 1) * 7,
);
export const PERSONAL_HISTORY_CURRENT_DATE = localDate('2026-05-20');
export const PERSONAL_HISTORY_SELECTED_DATE = PERSONAL_HISTORY_CURRENT_DATE;
export const PERSONAL_HISTORY_END_DATE = addDays(PERSONAL_HISTORY_LAST_WEEK_START, 6);
export const PERSONAL_HISTORY_COMPLETED_WEEK_START = addDays(PERSONAL_HISTORY_LAST_WEEK_START, -7);

const TASK_SERIES_IDS = [
  deterministicEntityId<'task-series'>(1),
  deterministicEntityId<'task-series'>(2),
] as const;
const HABIT_DEFINITION_ID = deterministicEntityId<'habit-definition'>(3);
const FIRST_TASK_DURATION = durationMinutes(30);
const SECOND_TASK_DURATION = durationMinutes(15);
const DAILY_LOAD = nonNegativeDurationMinutes(45);

export interface PersonalHistoryStores {
  readonly weeks: readonly Week[];
  readonly days: readonly Day[];
  readonly taskSeries: readonly TaskSeries[];
  readonly taskOccurrences: readonly StoredTaskOccurrence[];
  readonly taskPlanEntries: readonly TaskPlanEntry[];
  readonly taskEvents: readonly TaskEvent[];
  readonly habitDefinitions: readonly HabitDefinition[];
  readonly habitOccurrences: readonly HabitOccurrence[];
}

export interface PersonalHistoryExpectedFacts {
  readonly weekCount: 52;
  readonly dayCount: 364;
  readonly taskOccurrenceCount: 728;
  readonly taskPlanEntryCount: 728;
  readonly taskEventCount: 1442;
  readonly habitOccurrenceCount: 364;
  readonly selectedTaskOccurrenceIds: readonly [TaskOccurrenceId, TaskOccurrenceId];
  readonly selectedTaskPlanEntryIds: readonly [TaskPlanEntryId, TaskPlanEntryId];
  readonly selectedHabitOccurrenceId: HabitOccurrenceId;
}

export interface PersonalHistoryFixture {
  readonly firstWeekStart: LocalDate;
  readonly lastWeekStart: LocalDate;
  readonly endDate: LocalDate;
  readonly currentDate: LocalDate;
  readonly selectedDate: LocalDate;
  readonly completedWeekStart: LocalDate;
  readonly stores: PersonalHistoryStores;
  readonly expected: PersonalHistoryExpectedFacts;
}

function fixtureInstant(date: LocalDate, hour: number) {
  return instant(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`);
}

function activeRuleVersion() {
  return {
    state: 'active' as const,
    revision: revision(0),
    effectiveFrom: PERSONAL_HISTORY_FIRST_WEEK_START,
    rule: {
      startDate: PERSONAL_HISTORY_FIRST_WEEK_START,
      weekdays: [1, 2, 3, 4, 5, 6, 7] as const,
    },
  };
}

function taskSeries(): readonly TaskSeries[] {
  return [
    {
      id: TASK_SERIES_IDS[0],
      template: {
        title: 'Primary daily planning task',
        plannedDurationMinutes: FIRST_TASK_DURATION,
      },
      ruleVersions: [activeRuleVersion()],
      revision: revision(0),
    },
    {
      id: TASK_SERIES_IDS[1],
      template: {
        title: 'Secondary daily planning task',
        plannedDurationMinutes: SECOND_TASK_DURATION,
      },
      ruleVersions: [activeRuleVersion()],
      revision: revision(0),
    },
  ];
}

function habitDefinitions(): readonly HabitDefinition[] {
  return [
    {
      id: HABIT_DEFINITION_ID,
      title: 'Daily history habit',
      ruleVersions: [activeRuleVersion()],
      revision: revision(0),
    },
  ];
}

/**
 * Builds one deterministic retained-history year. Array order is intentionally
 * reverse insertion order; IndexedDB keys and persisted sequences must remain
 * authoritative.
 */
export function buildPersonalHistoryFixture(): PersonalHistoryFixture {
  const weeks: Week[] = [];
  const days: Day[] = [];
  const occurrences: StoredTaskOccurrence[] = [];
  const planEntries: TaskPlanEntry[] = [];
  const events: TaskEvent[] = [];
  const habits: HabitOccurrence[] = [];
  let nextTaskOrdinal = 10_000;
  let nextPlanEntryOrdinal = 20_000;
  let nextTaskEventOrdinal = 30_000;
  let nextHabitOrdinal = 50_000;
  let nextCreation = 1;
  let nextEvent = 1;
  let selectedTaskOccurrenceIds: [TaskOccurrenceId, TaskOccurrenceId] | undefined;
  let selectedTaskPlanEntryIds: [TaskPlanEntryId, TaskPlanEntryId] | undefined;
  let selectedHabitOccurrenceId: HabitOccurrenceId | undefined;

  for (let weekIndex = 0; weekIndex < PERSONAL_HISTORY_WEEK_COUNT; weekIndex += 1) {
    const weekStart = addDays(PERSONAL_HISTORY_FIRST_WEEK_START, weekIndex * 7);
    const isOpenWeek = weekStart === PERSONAL_HISTORY_LAST_WEEK_START;
    let weekHabitCompleted = 0;

    for (const [dayIndex, date] of weekDates(weekStart).entries()) {
      const isClosedDay = !isOpenWeek;
      const habitCompleted = dayIndex % 2 === 0;
      if (habitCompleted) weekHabitCompleted += 1;
      const taskCounts = { completed: isClosedDay ? 2 : 0, applicable: 2 };
      const habitCounts = { completed: isClosedDay && habitCompleted ? 1 : 0, applicable: 1 };
      const score = calculateCompletionScore({ task: taskCounts, habit: habitCounts });
      const auditDate =
        compareLocalDates(date, PERSONAL_HISTORY_CURRENT_DATE) > 0
          ? PERSONAL_HISTORY_CURRENT_DATE
          : date;
      const atEight = fixtureInstant(auditDate, 8);
      const atNine = fixtureInstant(auditDate, 9);
      const atTen = fixtureInstant(auditDate, 10);

      days.push(
        isClosedDay
          ? {
              date,
              weekStart,
              status: 'closed',
              state: {
                energy: ((dayIndex % 5) + 1) as 1 | 2 | 3 | 4 | 5,
                mood: (((dayIndex + 2) % 5) + 1) as 1 | 2 | 3 | 4 | 5,
                sleepDurationMinutes: nonNegativeDurationMinutes(420 + dayIndex * 5),
                updatedAt: atTen,
              },
              closureSnapshot: { score, plannedLoadMinutes: DAILY_LOAD },
              closedAt: atTen,
              revision: revision(1),
            }
          : {
              date,
              weekStart,
              status: 'open',
              revision: revision(0),
            },
      );

      const dayOccurrenceIds: [TaskOccurrenceId, TaskOccurrenceId] = [
        deterministicEntityId<'task-occurrence'>(nextTaskOrdinal),
        deterministicEntityId<'task-occurrence'>(nextTaskOrdinal + 1),
      ];
      nextTaskOrdinal += 2;
      const dayPlanEntryIds: [TaskPlanEntryId, TaskPlanEntryId] = [
        deterministicEntityId<'task-plan-entry'>(nextPlanEntryOrdinal),
        deterministicEntityId<'task-plan-entry'>(nextPlanEntryOrdinal + 1),
      ];
      nextPlanEntryOrdinal += 2;

      for (const taskIndex of [0, 1] as const) {
        const occurrenceId = dayOccurrenceIds[taskIndex];
        const planEntryId = dayPlanEntryIds[taskIndex];
        const duration = taskIndex === 0 ? FIRST_TASK_DURATION : SECOND_TASK_DURATION;
        const enteredAt = taskIndex === 0 ? atEight : atNine;
        const title = taskIndex === 0 ? 'Primary daily task' : 'Secondary daily task';
        const occurrence: TaskOccurrence = isClosedDay
          ? {
              id: occurrenceId,
              seriesId: TASK_SERIES_IDS[taskIndex],
              nominalDate: date,
              ruleRevision: revision(0),
              title,
              state: 'active',
              placement: { kind: 'day', date },
              plannedDurationMinutes: duration,
              dayPosition: dayPosition(taskIndex),
              completion: 'completed',
              actualCompletedAt: atTen,
              isException: false,
              createdSequence: creationSequence(nextCreation),
              revision: revision(1),
            }
          : {
              id: occurrenceId,
              seriesId: TASK_SERIES_IDS[taskIndex],
              nominalDate: date,
              ruleRevision: revision(0),
              title,
              state: 'active',
              placement: { kind: 'day', date },
              plannedDurationMinutes: duration,
              dayPosition: dayPosition(taskIndex),
              completion: 'incomplete',
              isException: false,
              createdSequence: creationSequence(nextCreation),
              revision: revision(0),
            };
        nextCreation += 1;
        occurrences.push(toStoredTaskOccurrence(occurrence));
        planEntries.push({
          id: planEntryId,
          occurrenceId,
          date,
          weekStart,
          plannedSnapshot: { title, plannedDurationMinutes: duration },
          enteredAt,
          ...(isClosedDay
            ? { finalizedAt: atTen, outcome: 'completed' as const }
            : { outcome: 'planned' as const }),
        });
        events.push({
          id: deterministicEntityId<'task-event'>(nextTaskEventOrdinal),
          sequence: eventSequence(nextEvent),
          occurrenceId,
          seriesId: TASK_SERIES_IDS[taskIndex],
          planEntryId,
          effectiveDate: date,
          occurredAt: enteredAt,
          type: 'create',
          payload: {
            created: { title, plannedDurationMinutes: duration },
            placement: { kind: 'day', date },
          },
        });
        nextTaskEventOrdinal += 1;
        nextEvent += 1;
        if (isClosedDay) {
          events.push({
            id: deterministicEntityId<'task-event'>(nextTaskEventOrdinal),
            sequence: eventSequence(nextEvent),
            occurrenceId,
            seriesId: TASK_SERIES_IDS[taskIndex],
            planEntryId,
            effectiveDate: date,
            occurredAt: atTen,
            type: 'completion-checked',
            payload: { date },
          });
          nextTaskEventOrdinal += 1;
          nextEvent += 1;
        }
      }

      const habitOccurrenceId = deterministicEntityId<'habit-occurrence'>(nextHabitOrdinal);
      nextHabitOrdinal += 1;
      habits.push({
        id: habitOccurrenceId,
        definitionId: HABIT_DEFINITION_ID,
        date,
        weekStart,
        definitionSnapshot: { title: 'Daily history habit' },
        ruleRevision: revision(0),
        isException: false,
        outcome: isClosedDay ? (habitCompleted ? 'completed' : 'not-completed') : 'pending',
        outcomeEvents: isClosedDay
          ? [
              {
                ordinal: 1,
                occurredAt: atTen,
                source: 'user',
                outcome: habitCompleted ? 'completed' : 'not-completed',
              },
            ]
          : [],
        updatedAt: atTen,
      });

      if (date === PERSONAL_HISTORY_SELECTED_DATE) {
        selectedTaskOccurrenceIds = dayOccurrenceIds;
        selectedTaskPlanEntryIds = dayPlanEntryIds;
        selectedHabitOccurrenceId = habitOccurrenceId;
      }
    }

    weeks.push(
      isOpenWeek
        ? {
            startDate: weekStart,
            goals: [],
            status: 'open',
            revision: revision(0),
          }
        : {
            startDate: weekStart,
            goals: [],
            status: 'completed',
            reflection: `Week ${String(weekIndex + 1)} retained facts`,
            completionSnapshot: {
              progress: calculateCompletionScore({
                task: { completed: 14, applicable: 14 },
                habit: { completed: weekHabitCompleted, applicable: 7 },
              }),
            },
            completedAt: fixtureInstant(addDays(weekStart, 6), 20),
            revision: revision(1),
          },
    );
  }

  if (
    selectedTaskOccurrenceIds === undefined ||
    selectedTaskPlanEntryIds === undefined ||
    selectedHabitOccurrenceId === undefined
  ) {
    throw new Error('Selected personal-history fixture date was not generated');
  }

  return {
    firstWeekStart: PERSONAL_HISTORY_FIRST_WEEK_START,
    lastWeekStart: PERSONAL_HISTORY_LAST_WEEK_START,
    endDate: PERSONAL_HISTORY_END_DATE,
    currentDate: PERSONAL_HISTORY_CURRENT_DATE,
    selectedDate: PERSONAL_HISTORY_SELECTED_DATE,
    completedWeekStart: PERSONAL_HISTORY_COMPLETED_WEEK_START,
    stores: {
      weeks: weeks.toReversed(),
      days: days.toReversed(),
      taskSeries: taskSeries().toReversed(),
      taskOccurrences: occurrences.toReversed(),
      taskPlanEntries: planEntries.toReversed(),
      taskEvents: events.toReversed(),
      habitDefinitions: habitDefinitions(),
      habitOccurrences: habits.toReversed(),
    },
    expected: {
      weekCount: 52,
      dayCount: 364,
      taskOccurrenceCount: 728,
      taskPlanEntryCount: 728,
      taskEventCount: 1442,
      habitOccurrenceCount: 364,
      selectedTaskOccurrenceIds,
      selectedTaskPlanEntryIds,
      selectedHabitOccurrenceId,
    },
  };
}
