import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  eventSequence,
  nonNegativeDurationMinutes,
  revision,
  type HabitDefinitionId,
  type HabitOccurrenceId,
  type TaskEventId,
  type TaskOccurrenceId,
  type TaskPlanEntryId,
  type TaskSeriesId,
  type WeekGoalId,
} from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import type { Day, ScoreBreakdown } from '@/entities/planning/model/day';
import type { HabitDefinition, HabitOccurrence } from '@/entities/planning/model/habit';
import type {
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
  TaskSeries,
} from '@/entities/planning/model/task';
import type { Week } from '@/entities/planning/model/week';

import { openSharedTestDatabase, type TestDatabase } from '../test-support/database';
import {
  fromDayRow,
  fromHabitDefinitionRow,
  fromHabitOccurrenceRow,
  fromTaskEventRow,
  fromTaskOccurrenceRow,
  fromTaskPlanEntryRow,
  fromTaskSeriesRow,
  fromWeekRow,
  toDayValues,
  toHabitDefinitionValues,
  toHabitOccurrenceValues,
  toTaskEventValues,
  toTaskOccurrenceValues,
  toTaskPlanEntryValues,
  toTaskSeriesValues,
  toWeekValues,
} from './mappers';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const NOW = instant('2026-08-11T08:00:00.000Z');
const EARLIER = instant('2026-08-10T07:08:09.250Z');

function id<TKind extends string>(ordinal: number) {
  return entityId<TKind>(`00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`);
}

const SERIES_ID = id<'task-series'>(1) as TaskSeriesId;
const OCCURRENCE_ID = id<'task-occurrence'>(2) as TaskOccurrenceId;
const ENTRY_ID = id<'task-plan-entry'>(3) as TaskPlanEntryId;
const EVENT_ID = id<'task-event'>(4) as TaskEventId;
const GOAL_ID = id<'weekly-goal'>(5) as WeekGoalId;
const DEFINITION_ID = id<'habit-definition'>(6) as HabitDefinitionId;
const HABIT_ID = id<'habit-occurrence'>(7) as HabitOccurrenceId;

const SCORE: ScoreBreakdown = {
  task: { completed: 1, applicable: 2, rate: 0.5 },
  habit: { completed: 0, applicable: 0, rate: 'unavailable' },
  value: 35,
  weightsApplied: { task: 70, habit: 30 },
};

const openWeek: Week = {
  startDate: MONDAY,
  status: 'open',
  goals: [{ id: GOAL_ID, statement: 'Ship the migration', createdAt: EARLIER, updatedAt: NOW }],
  revision: revision(3),
};

const completedWeek: Week = {
  startDate: MONDAY,
  status: 'completed',
  goals: [{ id: GOAL_ID, statement: 'Ship the migration', createdAt: EARLIER, updatedAt: NOW }],
  reflection: 'Keep the morning block.',
  completionSnapshot: { progress: SCORE },
  completedAt: NOW,
  revision: revision(4),
};

const openDay: Day = { date: TUESDAY, weekStart: MONDAY, status: 'open', revision: revision(1) };

const openDayWithState: Day = {
  date: TUESDAY,
  weekStart: MONDAY,
  status: 'open',
  state: {
    energy: 4,
    mood: 2,
    sleepDurationMinutes: nonNegativeDurationMinutes(420),
    updatedAt: NOW,
  },
  revision: revision(2),
};

const closedDay: Day = {
  date: TUESDAY,
  weekStart: MONDAY,
  status: 'closed',
  state: { energy: 3, updatedAt: NOW },
  closureSnapshot: { score: SCORE, plannedLoadMinutes: nonNegativeDurationMinutes(90) },
  closedAt: NOW,
  revision: revision(5),
};

const series: TaskSeries = {
  id: SERIES_ID,
  template: {
    title: 'Focus block',
    notes: 'Deep work',
    plannedDurationMinutes: durationMinutes(25),
    startTime: '09:00',
    endTime: '09:25',
  },
  ruleVersions: [
    {
      revision: revision(0),
      effectiveFrom: MONDAY,
      effectiveThrough: TUESDAY,
      state: 'active',
      rule: { startDate: MONDAY, weekdays: [1, 2, 3], endDate: WEDNESDAY },
    },
    { revision: revision(1), effectiveFrom: WEDNESDAY, state: 'stopped' },
  ],
  revision: revision(1),
};

const occurrenceVariants: readonly (readonly [string, TaskOccurrence])[] = [
  [
    'incomplete dated, every optional field present',
    {
      id: OCCURRENCE_ID,
      seriesId: SERIES_ID,
      nominalDate: TUESDAY,
      ruleRevision: revision(0),
      title: 'Prepare notes',
      notes: 'Keep   spacing',
      startTime: '09:00',
      endTime: '10:00',
      isException: true,
      createdSequence: creationSequence(7),
      revision: revision(2),
      state: 'active',
      placement: { kind: 'day', date: TUESDAY },
      plannedDurationMinutes: durationMinutes(30),
      dayPosition: dayPosition(3),
      completion: 'incomplete',
    },
  ],
  [
    'incomplete dated, every optional field absent',
    {
      id: OCCURRENCE_ID,
      title: 'Minimal dated',
      isException: false,
      createdSequence: creationSequence(1),
      revision: revision(0),
      state: 'active',
      placement: { kind: 'day', date: TUESDAY },
      plannedDurationMinutes: durationMinutes(15),
      completion: 'incomplete',
    },
  ],
  [
    'completed dated',
    {
      id: OCCURRENCE_ID,
      title: 'Done',
      isException: false,
      createdSequence: creationSequence(2),
      revision: revision(1),
      state: 'active',
      placement: { kind: 'day', date: TUESDAY },
      plannedDurationMinutes: durationMinutes(45),
      dayPosition: dayPosition(0),
      completion: 'completed',
      actualCompletedAt: NOW,
    },
  ],
  [
    'backlog with a duration',
    {
      id: OCCURRENCE_ID,
      title: 'Later idea',
      notes: 'Someday',
      isException: false,
      createdSequence: creationSequence(3),
      revision: revision(0),
      state: 'active',
      placement: { kind: 'backlog' },
      plannedDurationMinutes: durationMinutes(20),
    },
  ],
  [
    'backlog without a duration',
    {
      id: OCCURRENCE_ID,
      title: 'Unscheduled idea',
      isException: false,
      createdSequence: creationSequence(4),
      revision: revision(0),
      state: 'active',
      placement: { kind: 'backlog' },
    },
  ],
  [
    'finalized',
    {
      id: OCCURRENCE_ID,
      title: 'Kept unfinished',
      isException: false,
      createdSequence: creationSequence(5),
      revision: revision(3),
      state: 'finalized',
      placement: { kind: 'none' },
      plannedDurationMinutes: durationMinutes(30),
    },
  ],
  [
    'deleted',
    {
      id: OCCURRENCE_ID,
      seriesId: SERIES_ID,
      nominalDate: WEDNESDAY,
      ruleRevision: revision(1),
      title: 'Removed',
      isException: false,
      createdSequence: creationSequence(6),
      revision: revision(4),
      state: 'deleted',
      placement: { kind: 'none' },
    },
  ],
];

const planEntryVariants: readonly (readonly [string, TaskPlanEntry])[] = [
  [
    'planned',
    {
      id: ENTRY_ID,
      occurrenceId: OCCURRENCE_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      plannedSnapshot: { title: 'Plan', plannedDurationMinutes: durationMinutes(30) },
      enteredAt: EARLIER,
      outcome: 'planned',
    },
  ],
  [
    'completed with every optional snapshot field',
    {
      id: ENTRY_ID,
      occurrenceId: OCCURRENCE_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      plannedSnapshot: {
        title: 'Plan',
        notes: 'Notes',
        plannedDurationMinutes: durationMinutes(30),
        startTime: '09:00',
        endTime: '09:30',
      },
      enteredAt: EARLIER,
      finalizedAt: NOW,
      outcome: 'completed',
    },
  ],
  [
    'moved',
    {
      id: ENTRY_ID,
      occurrenceId: OCCURRENCE_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      plannedSnapshot: { title: 'Plan', plannedDurationMinutes: durationMinutes(30) },
      enteredAt: EARLIER,
      finalizedAt: NOW,
      outcome: 'moved',
      destination: { kind: 'day', date: WEDNESDAY },
    },
  ],
  [
    'backlogged',
    {
      id: ENTRY_ID,
      occurrenceId: OCCURRENCE_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      plannedSnapshot: { title: 'Plan', plannedDurationMinutes: durationMinutes(30) },
      enteredAt: EARLIER,
      outcome: 'backlogged',
      destination: { kind: 'backlog' },
    },
  ],
  [
    'canceled',
    {
      id: ENTRY_ID,
      occurrenceId: OCCURRENCE_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      plannedSnapshot: { title: 'Plan', plannedDurationMinutes: durationMinutes(30) },
      enteredAt: EARLIER,
      finalizedAt: NOW,
      outcome: 'canceled',
    },
  ],
  [
    'kept-unfinished',
    {
      id: ENTRY_ID,
      occurrenceId: OCCURRENCE_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      plannedSnapshot: { title: 'Plan', plannedDurationMinutes: durationMinutes(30) },
      enteredAt: EARLIER,
      finalizedAt: NOW,
      outcome: 'kept-unfinished',
    },
  ],
  [
    'deleted',
    {
      id: ENTRY_ID,
      occurrenceId: OCCURRENCE_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      plannedSnapshot: { title: 'Plan', plannedDurationMinutes: durationMinutes(30) },
      enteredAt: EARLIER,
      outcome: 'deleted',
    },
  ],
];

const eventVariants: readonly (readonly [string, TaskEvent])[] = [
  [
    'create with placement and full snapshot',
    {
      id: EVENT_ID,
      sequence: eventSequence(1),
      occurrenceId: OCCURRENCE_ID,
      planEntryId: ENTRY_ID,
      effectiveDate: TUESDAY,
      occurredAt: NOW,
      type: 'create',
      payload: {
        created: {
          title: 'Prepare notes',
          notes: 'Keep spacing',
          plannedDurationMinutes: durationMinutes(30),
          startTime: '09:00',
          endTime: '10:00',
        },
        placement: { kind: 'day', date: TUESDAY },
      },
    },
  ],
  [
    'occurrence-exception carrying a series id',
    {
      id: EVENT_ID,
      sequence: eventSequence(2),
      occurrenceId: OCCURRENCE_ID,
      seriesId: SERIES_ID,
      effectiveDate: TUESDAY,
      occurredAt: NOW,
      type: 'occurrence-exception',
      payload: { before: { title: 'Before' }, after: { title: 'After' } },
    },
  ],
  [
    'closure-move to backlog',
    {
      id: EVENT_ID,
      sequence: eventSequence(3),
      occurrenceId: OCCURRENCE_ID,
      effectiveDate: TUESDAY,
      occurredAt: NOW,
      type: 'closure-move',
      payload: { fromDate: TUESDAY, destination: { kind: 'backlog' } },
    },
  ],
  [
    'delete without a membership reference',
    {
      id: EVENT_ID,
      sequence: eventSequence(4),
      occurrenceId: OCCURRENCE_ID,
      effectiveDate: TUESDAY,
      occurredAt: NOW,
      type: 'delete',
      payload: { previousPlacement: { kind: 'none' } },
    },
  ],
];

const habitDefinition: HabitDefinition = {
  id: DEFINITION_ID,
  title: 'Stretch',
  ruleVersions: [
    {
      revision: revision(0),
      effectiveFrom: MONDAY,
      state: 'active',
      rule: { startDate: MONDAY, weekdays: [1, 2, 3, 4, 5] },
    },
  ],
  revision: revision(0),
};

const habitOccurrences: readonly (readonly [string, HabitOccurrence])[] = [
  [
    'pending with no outcome events',
    {
      id: HABIT_ID,
      definitionId: DEFINITION_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      definitionSnapshot: { title: 'Stretch' },
      ruleRevision: revision(0),
      isException: false,
      outcome: 'pending',
      outcomeEvents: [],
      updatedAt: NOW,
    },
  ],
  [
    'corrected boundary miss retaining ordered history',
    {
      id: HABIT_ID,
      definitionId: DEFINITION_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      definitionSnapshot: { title: 'Evening stretch' },
      ruleRevision: revision(1),
      isException: true,
      outcome: 'completed',
      outcomeEvents: [
        { ordinal: 1, occurredAt: EARLIER, source: 'date-boundary', outcome: 'not-completed' },
        { ordinal: 2, occurredAt: NOW, source: 'user-correction', outcome: 'completed' },
      ],
      updatedAt: NOW,
    },
  ],
  [
    'cleared by the user',
    {
      id: HABIT_ID,
      definitionId: DEFINITION_ID,
      date: TUESDAY,
      weekStart: MONDAY,
      definitionSnapshot: { title: 'Stretch' },
      ruleRevision: revision(0),
      isException: false,
      outcome: 'pending',
      outcomeEvents: [
        { ordinal: 1, occurredAt: EARLIER, source: 'user', outcome: 'completed' },
        { ordinal: 2, occurredAt: NOW, source: 'user-cleared', outcome: 'pending' },
      ],
      updatedAt: NOW,
    },
  ],
];

describe('planning row mappers', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await openSharedTestDatabase();
  });

  beforeEach(async () => {
    await database.truncateAll();
  });

  async function seedWeekAndDays(): Promise<void> {
    await database.db.insertInto('weeks').values(toWeekValues(openWeek)).execute();
    await database.db
      .insertInto('days')
      .values([openDay, { ...openDay, date: WEDNESDAY }].map(toDayValues))
      .execute();
  }

  it.each([
    ['open week', openWeek],
    ['completed week', completedWeek],
  ])('round-trips a %s', async (_label, week) => {
    await database.db.insertInto('weeks').values(toWeekValues(week)).execute();

    const row = await database.db
      .selectFrom('weeks')
      .selectAll()
      .where('start_date', '=', week.startDate)
      .executeTakeFirstOrThrow();

    expect(fromWeekRow(row)).toEqual(week);
  });

  it.each([
    ['open day', openDay],
    ['open day carrying state', openDayWithState],
    ['closed day', closedDay],
  ])('round-trips an %s', async (_label, day) => {
    await database.db.insertInto('weeks').values(toWeekValues(openWeek)).execute();
    await database.db.insertInto('days').values(toDayValues(day)).execute();

    const row = await database.db
      .selectFrom('days')
      .selectAll()
      .where('date', '=', day.date)
      .executeTakeFirstOrThrow();

    expect(fromDayRow(row)).toEqual(day);
  });

  it('round-trips a task series with its ordered rule versions', async () => {
    await database.db.insertInto('task_series').values(toTaskSeriesValues(series)).execute();

    const row = await database.db
      .selectFrom('task_series')
      .selectAll()
      .where('id', '=', SERIES_ID)
      .executeTakeFirstOrThrow();

    expect(fromTaskSeriesRow(row)).toEqual(series);
  });

  it.each(occurrenceVariants)('round-trips a task occurrence: %s', async (_label, occurrence) => {
    await seedWeekAndDays();
    if (occurrence.seriesId !== undefined) {
      await database.db.insertInto('task_series').values(toTaskSeriesValues(series)).execute();
    }

    await database.db
      .insertInto('task_occurrences')
      .values(toTaskOccurrenceValues(occurrence))
      .execute();

    const row = await database.db
      .selectFrom('task_occurrences')
      .selectAll()
      .where('id', '=', occurrence.id)
      .executeTakeFirstOrThrow();

    expect(fromTaskOccurrenceRow(row)).toEqual(occurrence);
  });

  it.each(planEntryVariants)('round-trips a membership: %s', async (_label, entry) => {
    await seedWeekAndDays();
    await database.db
      .insertInto('task_occurrences')
      .values(
        toTaskOccurrenceValues({
          id: OCCURRENCE_ID,
          title: 'Owner',
          isException: false,
          createdSequence: creationSequence(1),
          revision: revision(0),
          state: 'active',
          placement: { kind: 'day', date: TUESDAY },
          plannedDurationMinutes: durationMinutes(30),
          completion: 'incomplete',
        }),
      )
      .execute();

    await database.db
      .insertInto('task_plan_entries')
      .values(toTaskPlanEntryValues(entry))
      .execute();

    const row = await database.db
      .selectFrom('task_plan_entries')
      .selectAll()
      .where('id', '=', entry.id)
      .executeTakeFirstOrThrow();

    expect(fromTaskPlanEntryRow(row)).toEqual(entry);
  });

  it.each(eventVariants)('round-trips an audit event: %s', async (_label, event) => {
    await seedWeekAndDays();
    if (event.seriesId !== undefined) {
      await database.db.insertInto('task_series').values(toTaskSeriesValues(series)).execute();
    }
    await database.db
      .insertInto('task_occurrences')
      .values(
        toTaskOccurrenceValues({
          id: OCCURRENCE_ID,
          title: 'Owner',
          isException: false,
          createdSequence: creationSequence(1),
          revision: revision(0),
          state: 'active',
          placement: { kind: 'backlog' },
        }),
      )
      .execute();

    await database.db.insertInto('task_events').values(toTaskEventValues(event)).execute();

    const row = await database.db
      .selectFrom('task_events')
      .selectAll()
      .where('sequence', '=', event.sequence)
      .executeTakeFirstOrThrow();

    expect(fromTaskEventRow(row)).toEqual(event);
  });

  it('round-trips a habit definition with its rule versions', async () => {
    await database.db
      .insertInto('habit_definitions')
      .values(toHabitDefinitionValues(habitDefinition))
      .execute();

    const row = await database.db
      .selectFrom('habit_definitions')
      .selectAll()
      .where('id', '=', DEFINITION_ID)
      .executeTakeFirstOrThrow();

    expect(fromHabitDefinitionRow(row)).toEqual(habitDefinition);
  });

  it.each(habitOccurrences)('round-trips a habit occurrence: %s', async (_label, occurrence) => {
    await seedWeekAndDays();
    await database.db
      .insertInto('habit_definitions')
      .values(toHabitDefinitionValues(habitDefinition))
      .execute();

    await database.db
      .insertInto('habit_occurrences')
      .values(toHabitOccurrenceValues(occurrence))
      .execute();

    const row = await database.db
      .selectFrom('habit_occurrences')
      .selectAll()
      .where('id', '=', occurrence.id)
      .executeTakeFirstOrThrow();

    expect(fromHabitOccurrenceRow(row)).toEqual(occurrence);
  });

  it('never turns an absent optional field into null', async () => {
    await seedWeekAndDays();
    await database.db
      .insertInto('task_occurrences')
      .values(
        toTaskOccurrenceValues({
          id: OCCURRENCE_ID,
          title: 'Minimal',
          isException: false,
          createdSequence: creationSequence(1),
          revision: revision(0),
          state: 'active',
          placement: { kind: 'backlog' },
        }),
      )
      .execute();

    const row = await database.db
      .selectFrom('task_occurrences')
      .selectAll()
      .where('id', '=', OCCURRENCE_ID)
      .executeTakeFirstOrThrow();
    const occurrence = fromTaskOccurrenceRow(row);

    for (const field of [
      'seriesId',
      'nominalDate',
      'ruleRevision',
      'notes',
      'startTime',
      'endTime',
      'plannedDurationMinutes',
    ]) {
      expect(Object.hasOwn(occurrence, field)).toBe(false);
    }
  });
});
