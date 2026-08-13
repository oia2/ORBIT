import { IDBDatabase, IDBFactory, IDBIndex, IDBObjectStore } from 'fake-indexeddb';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  eventSequence,
  nonNegativeDurationMinutes,
  revision,
} from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate, weekDates, type LocalDate } from '@/shared/lib/local-date/local-date';

import type { ScoreBreakdown } from '../../model/day';
import type { HabitOccurrence } from '../../model/habit';
import type {
  HistoryQuery,
  PlanningRepository,
  QueryResult,
} from '../../model/planning-repository';
import type {
  CompletedDatedTaskOccurrence,
  IncompleteDatedTaskOccurrence,
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
} from '../../model/task';
import type { HistoryView } from '../../model/history';
import { openOrbitPlanningDatabase } from './database';
import { createIndexedDbPlanningRepository } from './indexeddb-planning-repository';
import {
  toStoredHabitOccurrence,
  toStoredTaskEvent,
  toStoredTaskOccurrence,
  toStoredTaskPlanEntry,
} from './mappers';
import type { OrbitPlanningDB } from './schema';

const DATABASE_NAME = 'orbit-us7-test';
const COMPLETED_WEEK_START = localDate('2026-05-11');
const OPEN_WEEK_START = localDate('2026-05-18');
const PREPARE_DATE = localDate('2026-05-18');
const CLOSED_DATE = localDate('2026-05-19');
const OPEN_DATE = localDate('2026-05-20');
const OUTSIDE_MONTH = localDate('2026-06-01');
const NOW = instant('2026-05-20T12:00:00.000Z');
const EARLIER = instant('2026-05-19T08:00:00.000Z');

function id<TKind extends string>(ordinal: number) {
  return entityId<TKind>(`00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`);
}

const REUSED_TASK_ID = id<'task-occurrence'>(101);
const EARLY_TASK_ID = id<'task-occurrence'>(102);
const CLOSED_MEMBERSHIP_ID = id<'task-plan-entry'>(201);
const REUSED_MEMBERSHIP_ID = id<'task-plan-entry'>(202);
const EARLY_MEMBERSHIP_ID = id<'task-plan-entry'>(203);
const FIRST_HABIT_ID = id<'habit-occurrence'>(301);
const SECOND_HABIT_ID = id<'habit-occurrence'>(302);
const PENDING_HABIT_ID = id<'habit-occurrence'>(303);

const UNAVAILABLE_SCORE: ScoreBreakdown = {
  task: { completed: 0, applicable: 0, rate: 'unavailable' },
  habit: { completed: 0, applicable: 0, rate: 'unavailable' },
  value: 'unavailable',
  weightsApplied: { task: 0, habit: 0 },
};

const CLOSED_DAY_SCORE: ScoreBreakdown = {
  task: { completed: 0, applicable: 1, rate: 0 },
  habit: { completed: 0, applicable: 0, rate: 'unavailable' },
  value: 0,
  weightsApplied: { task: 100, habit: 0 },
};

const COMPLETED_WEEK_PROGRESS: ScoreBreakdown = {
  task: { completed: 1, applicable: 2, rate: 1 / 2 },
  habit: { completed: 1, applicable: 1, rate: 1 },
  value: 65,
  weightsApplied: { task: 70, habit: 30 },
};

function uuidGenerator(): () => string {
  let next = 900;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

function completedTask(): CompletedDatedTaskOccurrence {
  return {
    id: REUSED_TASK_ID,
    title: 'Returned and completed',
    state: 'active',
    placement: { kind: 'day', date: OPEN_DATE },
    plannedDurationMinutes: durationMinutes(30),
    dayPosition: dayPosition(1),
    completion: 'completed',
    actualCompletedAt: NOW,
    isException: false,
    createdSequence: creationSequence(2),
    revision: revision(3),
  };
}

function earlyTask(): IncompleteDatedTaskOccurrence {
  return {
    id: EARLY_TASK_ID,
    title: 'Earlier membership',
    state: 'active',
    placement: { kind: 'day', date: OPEN_DATE },
    plannedDurationMinutes: durationMinutes(20),
    dayPosition: dayPosition(0),
    completion: 'incomplete',
    isException: false,
    createdSequence: creationSequence(1),
    revision: revision(0),
  };
}

function memberships(): readonly TaskPlanEntry[] {
  return [
    {
      id: CLOSED_MEMBERSHIP_ID,
      occurrenceId: REUSED_TASK_ID,
      date: CLOSED_DATE,
      weekStart: OPEN_WEEK_START,
      plannedSnapshot: {
        title: 'Original plan',
        plannedDurationMinutes: durationMinutes(25),
      },
      enteredAt: EARLIER,
      finalizedAt: NOW,
      outcome: 'moved',
      destination: { kind: 'day', date: OPEN_DATE },
    },
    {
      id: REUSED_MEMBERSHIP_ID,
      occurrenceId: REUSED_TASK_ID,
      date: OPEN_DATE,
      weekStart: OPEN_WEEK_START,
      plannedSnapshot: {
        title: 'Returned plan',
        plannedDurationMinutes: durationMinutes(30),
      },
      enteredAt: NOW,
      finalizedAt: NOW,
      outcome: 'completed',
    },
    {
      id: EARLY_MEMBERSHIP_ID,
      occurrenceId: EARLY_TASK_ID,
      date: OPEN_DATE,
      weekStart: OPEN_WEEK_START,
      plannedSnapshot: {
        title: 'Earlier membership',
        plannedDurationMinutes: durationMinutes(20),
      },
      enteredAt: EARLIER,
      outcome: 'planned',
    },
  ];
}

function events(): readonly TaskEvent[] {
  return [
    {
      id: id<'task-event'>(403),
      sequence: eventSequence(3),
      occurrenceId: REUSED_TASK_ID,
      planEntryId: REUSED_MEMBERSHIP_ID,
      effectiveDate: OPEN_DATE,
      occurredAt: NOW,
      type: 'completion-checked',
      payload: { date: OPEN_DATE },
    },
    {
      id: id<'task-event'>(401),
      sequence: eventSequence(1),
      occurrenceId: REUSED_TASK_ID,
      planEntryId: CLOSED_MEMBERSHIP_ID,
      effectiveDate: CLOSED_DATE,
      occurredAt: NOW,
      type: 'create',
      payload: {
        created: { title: 'Original plan', plannedDurationMinutes: durationMinutes(25) },
        placement: { kind: 'day', date: CLOSED_DATE },
      },
    },
    {
      id: id<'task-event'>(402),
      sequence: eventSequence(2),
      occurrenceId: REUSED_TASK_ID,
      planEntryId: CLOSED_MEMBERSHIP_ID,
      effectiveDate: OPEN_DATE,
      occurredAt: NOW,
      type: 'move-to-date',
      payload: {
        from: { kind: 'day', date: CLOSED_DATE },
        destination: { kind: 'day', date: OPEN_DATE },
      },
    },
    {
      id: id<'task-event'>(404),
      sequence: eventSequence(4),
      occurrenceId: EARLY_TASK_ID,
      planEntryId: EARLY_MEMBERSHIP_ID,
      effectiveDate: OPEN_DATE,
      occurredAt: NOW,
      type: 'create',
      payload: {
        created: { title: 'Earlier membership', plannedDurationMinutes: durationMinutes(20) },
        placement: { kind: 'day', date: OPEN_DATE },
      },
    },
  ];
}

function habit(
  occurrenceId: HabitOccurrence['id'],
  definitionOrdinal: number,
  outcome: HabitOccurrence['outcome'],
  outcomeEvents: HabitOccurrence['outcomeEvents'] = [],
  date: LocalDate = OPEN_DATE,
): HabitOccurrence {
  return {
    id: occurrenceId,
    definitionId: id<'habit-definition'>(definitionOrdinal),
    date,
    weekStart: OPEN_WEEK_START,
    definitionSnapshot: { title: `Habit ${String(definitionOrdinal)}` },
    ruleRevision: revision(0),
    isException: false,
    outcome,
    outcomeEvents,
    updatedAt: NOW,
  };
}

function requireQuery<T>(result: QueryResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected query success, received ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

describe('IndexedDB planning repository — US7 History', () => {
  let database: IDBPDatabase<OrbitPlanningDB>;
  let repository: ReturnType<typeof createIndexedDbPlanningRepository>;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({ instant: NOW, currentLocalDate: OPEN_DATE }),
      generateUuid: uuidGenerator(),
    });

    await seedHistoryFacts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    repository.dispose();
  });

  async function seedHistoryFacts(): Promise<void> {
    const completedEnsure = await repository.ensureCalendarWeek({ date: COMPLETED_WEEK_START });
    const openEnsure = await repository.ensureCalendarWeek({ date: OPEN_WEEK_START });
    if (!completedEnsure.ok || !openEnsure.ok) throw new Error('Failed to create fixture weeks');

    for (const [index, date] of weekDates(COMPLETED_WEEK_START).entries()) {
      const day = await database.get('days', date);
      if (day === undefined) throw new Error(`Missing fixture Day ${date}`);
      await database.put('days', {
        ...day,
        status: 'closed',
        revision: revision(1),
        closureSnapshot: {
          score: UNAVAILABLE_SCORE,
          plannedLoadMinutes: nonNegativeDurationMinutes(index * 5),
        },
        closedAt: NOW,
      });
    }

    const completedWeek = await database.get('weeks', COMPLETED_WEEK_START);
    if (completedWeek === undefined) throw new Error('Missing completed fixture Week');
    await database.put('weeks', {
      ...completedWeek,
      status: 'completed',
      reflection: 'Keep the clear morning block.',
      completionSnapshot: { progress: COMPLETED_WEEK_PROGRESS },
      completedAt: NOW,
      revision: revision(1),
    });

    const closedDay = await database.get('days', CLOSED_DATE);
    const openDay = await database.get('days', OPEN_DATE);
    if (closedDay === undefined || openDay === undefined)
      throw new Error('Missing mixed Week days');
    await database.put('days', {
      ...closedDay,
      status: 'closed',
      state: { energy: 2, mood: 3, updatedAt: NOW },
      revision: revision(1),
      closureSnapshot: {
        score: CLOSED_DAY_SCORE,
        plannedLoadMinutes: nonNegativeDurationMinutes(25),
      },
      closedAt: NOW,
    });
    await database.put('days', {
      ...openDay,
      state: {
        energy: 4,
        mood: 5,
        sleepDurationMinutes: nonNegativeDurationMinutes(420),
        updatedAt: NOW,
      },
    });

    const taskOccurrences: readonly TaskOccurrence[] = [completedTask(), earlyTask()];
    for (const occurrence of taskOccurrences.toReversed()) {
      await database.put('taskOccurrences', toStoredTaskOccurrence(occurrence));
    }
    for (const membership of memberships().toReversed()) {
      await database.put('taskPlanEntries', toStoredTaskPlanEntry(membership));
    }
    for (const event of events()) {
      await database.put('taskEvents', toStoredTaskEvent(event));
    }

    const firstHabit = habit(FIRST_HABIT_ID, 501, 'completed', [
      {
        ordinal: 2,
        occurredAt: NOW,
        source: 'user-correction',
        outcome: 'completed',
      },
      {
        ordinal: 1,
        occurredAt: EARLIER,
        source: 'date-boundary',
        outcome: 'not-completed',
      },
    ]);
    const secondHabit = habit(SECOND_HABIT_ID, 502, 'not-completed', [
      {
        ordinal: 1,
        occurredAt: NOW,
        source: 'user',
        outcome: 'not-completed',
      },
    ]);
    const pendingHabit = habit(PENDING_HABIT_ID, 503, 'pending', [], PREPARE_DATE);
    for (const occurrence of [secondHabit, firstHabit, pendingHabit]) {
      await database.put('habitOccurrences', toStoredHabitOccurrence(occurrence));
    }
  }

  async function snapshotAllStores() {
    return {
      weeks: await database.getAll('weeks'),
      days: await database.getAll('days'),
      taskSeries: await database.getAll('taskSeries'),
      taskOccurrences: await database.getAll('taskOccurrences'),
      taskPlanEntries: await database.getAll('taskPlanEntries'),
      taskEvents: await database.getAll('taskEvents'),
      habitDefinitions: await database.getAll('habitDefinitions'),
      habitOccurrences: await database.getAll('habitOccurrences'),
    };
  }

  it('reads open and closed Day facts without changing any stored record', async () => {
    const before = await snapshotAllStores();

    const open = requireQuery(
      await repository.getHistoryView({ mode: 'day', anchorDate: OPEN_DATE }),
    );
    const closed = requireQuery(
      await repository.getHistoryView({ mode: 'day', anchorDate: CLOSED_DATE }),
    );

    expect(open).toMatchObject({
      mode: 'day',
      anchorDate: OPEN_DATE,
      facts: {
        day: { date: OPEN_DATE, status: 'open', state: { energy: 4, mood: 5 } },
        score: {
          task: { completed: 1, applicable: 2, rate: 1 / 2 },
          habit: { completed: 1, applicable: 2, rate: 1 / 2 },
          value: 50,
        },
        plannedLoadMinutes: 50,
      },
    });
    expect(closed).toMatchObject({
      mode: 'day',
      anchorDate: CLOSED_DATE,
      facts: {
        day: { date: CLOSED_DATE, status: 'closed', state: { energy: 2, mood: 3 } },
        score: CLOSED_DAY_SCORE,
        plannedLoadMinutes: 25,
      },
    });
    expect(await snapshotAllStores()).toEqual(before);
  });

  it('joins the completed Week frozen progress, reflection, and Monday–Sunday days read-only', async () => {
    const before = await snapshotAllStores();
    const history = requireQuery(
      await repository.getHistoryView({
        mode: 'week',
        anchorDate: localDate('2026-05-14'),
      }),
    );

    expect(history).toMatchObject({
      mode: 'week',
      anchorDate: localDate('2026-05-14'),
      weekStart: COMPLETED_WEEK_START,
      facts: {
        week: {
          status: 'completed',
          reflection: 'Keep the clear morning block.',
          completionSnapshot: { progress: COMPLETED_WEEK_PROGRESS },
        },
        progress: COMPLETED_WEEK_PROGRESS,
      },
    });
    if (history.mode !== 'week') throw new Error('Expected Week History');
    expect(history.facts.days.map((day) => day.day.date)).toEqual(weekDates(COMPLETED_WEEK_START));
    expect(await snapshotAllStores()).toEqual(before);
  });

  it('derives one Month, orders joined facts deterministically, and reuses getTaskHistory', async () => {
    const history = requireQuery(
      await repository.getHistoryView({
        mode: 'month',
        anchorDate: OPEN_DATE,
        selectedDate: OPEN_DATE,
      }),
    );
    if (history.mode !== 'month') throw new Error('Expected Month History');

    expect(history).toMatchObject({
      monthStart: localDate('2026-05-01'),
      monthEnd: localDate('2026-05-31'),
      selectedDate: OPEN_DATE,
      selectedDay: { day: { date: OPEN_DATE } },
    });
    expect(history.calendar.map((cell) => cell.date)).toEqual(
      Array.from({ length: 31 }, (_, index) =>
        localDate(`2026-05-${String(index + 1).padStart(2, '0')}`),
      ),
    );
    expect(history.completedWeeks.map((week) => week.week.startDate)).toEqual([
      COMPLETED_WEEK_START,
    ]);
    expect(history.completedWeeks[0]).toMatchObject({
      progress: COMPLETED_WEEK_PROGRESS,
      week: { reflection: 'Keep the clear morning block.' },
    });
    expect(history.selectedDay.tasks.map((task) => task.membership.id)).toEqual([
      EARLY_MEMBERSHIP_ID,
      REUSED_MEMBERSHIP_ID,
    ]);
    expect(history.selectedDay.habits.map((occurrence) => occurrence.id)).toEqual([
      FIRST_HABIT_ID,
      SECOND_HABIT_ID,
    ]);
    expect(history.selectedDay.habits[0]?.outcomeEvents.map((event) => event.ordinal)).toEqual([
      1, 2,
    ]);

    const taskHistory = requireQuery(await repository.getTaskHistory(REUSED_TASK_ID));
    const selectedTask = history.selectedDay.tasks.find(
      (task) => task.occurrence.id === REUSED_TASK_ID,
    );
    expect(selectedTask).toBeDefined();
    expect(selectedTask?.occurrence).toEqual(taskHistory.occurrence);
    expect(selectedTask?.membership).toEqual(
      taskHistory.memberships.find((membership) => membership.date === OPEN_DATE),
    );
    expect(selectedTask?.events).toEqual(taskHistory.events);
    expect(taskHistory.memberships.map((membership) => membership.date)).toEqual([
      CLOSED_DATE,
      OPEN_DATE,
    ]);
    expect(taskHistory.events.map((event) => event.sequence)).toEqual([
      eventSequence(1),
      eventSequence(2),
      eventSequence(3),
    ]);
  });

  it('rejects a Month selectedDate outside the anchor month before opening a transaction', async () => {
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');

    await expect(
      repository.getHistoryView({
        mode: 'month',
        anchorDate: OPEN_DATE,
        selectedDate: OUTSIDE_MONTH,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'ValidationFailure',
        issues: [{ field: 'selectedDate' }],
      },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps open-period preparation separate, then returns the current facts read-only', async () => {
    const prepared = await repository.prepareOpenPeriod({ kind: 'day', date: PREPARE_DATE });
    expect(prepared).toMatchObject({
      ok: true,
      affectedDates: [PREPARE_DATE],
      affectedWeeks: [OPEN_WEEK_START],
    });
    expect(await database.get('habitOccurrences', PENDING_HABIT_ID)).toMatchObject({
      outcome: 'not-completed',
      outcomeEvents: [{ source: 'date-boundary', outcome: 'not-completed' }],
    });
    const afterPrepare = await snapshotAllStores();

    const history = requireQuery(
      await repository.getHistoryView({ mode: 'day', anchorDate: PREPARE_DATE }),
    );

    expect(history).toMatchObject({
      mode: 'day',
      facts: {
        day: { date: PREPARE_DATE, status: 'open' },
        habits: [{ id: PENDING_HABIT_ID, outcome: 'not-completed' }],
      },
    });
    expect(await snapshotAllStores()).toEqual(afterPrepare);
  });

  it('uses only readonly, bounded primary/index reads for a mode-derived query', async () => {
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    const objectStoreGetAll = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const indexGetAll = vi.spyOn(IDBIndex.prototype, 'getAll');

    requireQuery(
      await repository.getHistoryView({
        mode: 'month',
        anchorDate: OPEN_DATE,
        selectedDate: OPEN_DATE,
      }),
    );

    expect(transaction.mock.calls.length).toBeGreaterThan(0);
    for (const call of transaction.mock.calls) {
      expect(call[1] ?? 'readonly').toBe('readonly');
    }
    for (const call of objectStoreGetAll.mock.calls) {
      expect(call[0]).not.toBeUndefined();
      expect(call[0]).not.toBeNull();
    }
    for (const call of indexGetAll.mock.calls) {
      expect(call[0]).not.toBeUndefined();
      expect(call[0]).not.toBeNull();
    }

    const indexedJoins = indexGetAll.mock.contexts.map((context) => {
      const index = context as IDBIndex;
      return `${index.objectStore.name}:${index.name}`;
    });
    expect(indexedJoins).toEqual(
      expect.arrayContaining([
        'taskPlanEntries:by-date',
        'taskEvents:by-occurrence-sequence',
        'habitOccurrences:by-date',
      ]),
    );
  });

  it('exposes only the discriminated Day/Week/Month query contract, never a generic window', () => {
    interface GenericWindow {
      readonly mode: 'range';
      readonly from: LocalDate;
      readonly to: LocalDate;
    }

    expectTypeOf<
      Parameters<PlanningRepository['getHistoryView']>[0]
    >().toEqualTypeOf<HistoryQuery>();
    expectTypeOf<GenericWindow>().not.toExtend<HistoryQuery>();
    expectTypeOf<Awaited<ReturnType<PlanningRepository['getHistoryView']>>>().toEqualTypeOf<
      QueryResult<HistoryView>
    >();

    const queries: readonly HistoryQuery[] = [
      { mode: 'day', anchorDate: OPEN_DATE },
      { mode: 'week', anchorDate: OPEN_DATE },
      { mode: 'month', anchorDate: OPEN_DATE, selectedDate: OPEN_DATE },
    ];
    expect(queries.map((query) => Object.keys(query).sort())).toEqual([
      ['anchorDate', 'mode'],
      ['anchorDate', 'mode'],
      ['anchorDate', 'mode', 'selectedDate'],
    ]);
  });
});
