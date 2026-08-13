import { IDBDatabase, IDBFactory, IDBIndex, IDBObjectStore } from 'fake-indexeddb';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, localDate, weekDates, type LocalDate } from '@/shared/lib/local-date/local-date';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';

import {
  buildPersonalHistoryBrowserFixture,
  buildPersonalHistoryOrbitSeed,
  seedPersonalHistory,
} from '../../../../../e2e/fixtures/personal-history';
import {
  buildPersonalHistoryFixture,
  PERSONAL_HISTORY_CURRENT_DATE,
  PERSONAL_HISTORY_LAST_WEEK_START,
  type PersonalHistoryFixture,
} from '../../../../../tests/fixtures/personal-history';
import type { QueryResult } from '../../model/planning-repository';
import { openOrbitPlanningDatabase } from './database';
import { createIndexedDbPlanningRepository } from './indexeddb-planning-repository';
import { ORBIT_STORE_NAMES, type OrbitPlanningDB } from './schema';

const DATABASE_NAME = 'orbit-personal-history-scale-test';
const NOW = instant('2026-05-20T12:00:00.000Z');
const MAY_2026_DATES = Array.from({ length: 31 }, (_, index) =>
  localDate(`2026-05-${String(index + 1).padStart(2, '0')}`),
);
const EXPECTED_COMPLETED_WEEK_PROGRESS = {
  task: { completed: 14, applicable: 14, rate: 1 },
  habit: { completed: 4, applicable: 7, rate: 4 / 7 },
  value: 87,
  weightsApplied: { task: 70, habit: 30 },
} as const;

function uuidGenerator(): () => string {
  let next = 800_000;
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
}

function requireQuery<T>(result: QueryResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected query success, received ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

async function seedFixture(
  database: IDBPDatabase<OrbitPlanningDB>,
  fixture: PersonalHistoryFixture,
): Promise<void> {
  const transaction = database.transaction([...ORBIT_STORE_NAMES], 'readwrite');
  const writes: Promise<unknown>[] = [];
  for (const value of fixture.stores.weeks) {
    writes.push(transaction.objectStore('weeks').put(value));
  }
  for (const value of fixture.stores.days) {
    writes.push(transaction.objectStore('days').put(value));
  }
  for (const value of fixture.stores.taskSeries) {
    writes.push(transaction.objectStore('taskSeries').put(value));
  }
  for (const value of fixture.stores.taskOccurrences) {
    writes.push(transaction.objectStore('taskOccurrences').put(value));
  }
  for (const value of fixture.stores.taskPlanEntries) {
    writes.push(transaction.objectStore('taskPlanEntries').put(value));
  }
  for (const value of fixture.stores.taskEvents) {
    writes.push(transaction.objectStore('taskEvents').put(value));
  }
  for (const value of fixture.stores.habitDefinitions) {
    writes.push(transaction.objectStore('habitDefinitions').put(value));
  }
  for (const value of fixture.stores.habitOccurrences) {
    writes.push(transaction.objectStore('habitOccurrences').put(value));
  }
  await Promise.all(writes);
  await transaction.done;
}

describe('IndexedDB planning repository — reproducible 52-week History fixture', () => {
  let database: IDBPDatabase<OrbitPlanningDB>;
  let repository: ReturnType<typeof createIndexedDbPlanningRepository>;
  let fixture: PersonalHistoryFixture;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    fixture = buildPersonalHistoryFixture();
    database = await openOrbitPlanningDatabase({ databaseName: DATABASE_NAME });
    await seedFixture(database, fixture);
    repository = createIndexedDbPlanningRepository(database, {
      clock: createFixedClock({
        instant: NOW,
        currentLocalDate: PERSONAL_HISTORY_CURRENT_DATE,
      }),
      generateUuid: uuidGenerator(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    repository.dispose();
  });

  it('rebuilds the same 52-week model and browser snapshots with fixed record counts', async () => {
    const rebuilt = buildPersonalHistoryFixture();
    const browser = buildPersonalHistoryBrowserFixture();
    const seed = vi.fn(() => Promise.resolve());
    const seededBrowser = await seedPersonalHistory({
      seed,
      reset: () => Promise.resolve(),
    });

    expect(rebuilt).toEqual(fixture);
    expect(browser.seed).toEqual(buildPersonalHistoryOrbitSeed());
    expect(seededBrowser).toEqual(browser);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed).toHaveBeenCalledWith(browser.seed);
    expect(browser.seed.stores).toEqual(fixture.stores);
    expect(fixture.endDate).toBe(localDate('2026-05-24'));
    expect(fixture.expected).toMatchObject({
      weekCount: 52,
      dayCount: 364,
      taskOccurrenceCount: 728,
      taskPlanEntryCount: 728,
      taskEventCount: 1442,
      habitOccurrenceCount: 364,
    });
    expect(fixture.stores.weeks).toHaveLength(fixture.expected.weekCount);
    expect(fixture.stores.days).toHaveLength(fixture.expected.dayCount);
    expect(fixture.stores.taskOccurrences).toHaveLength(fixture.expected.taskOccurrenceCount);
    expect(fixture.stores.taskEvents).toHaveLength(fixture.expected.taskEventCount);
    expect(fixture.stores.taskEvents.every((event) => event.occurredAt <= NOW)).toBe(true);
    expect(fixture.stores.habitOccurrences.every((habit) => habit.updatedAt <= NOW)).toBe(true);
  });

  it('uses bounded indexed Day, Week, and Month reads with deterministic frozen progress', async () => {
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    const objectStoreGetAll = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const objectStoreGetAllKeys = vi.spyOn(IDBObjectStore.prototype, 'getAllKeys');
    const objectStoreOpenCursor = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
    const indexGetAll = vi.spyOn(IDBIndex.prototype, 'getAll');
    const indexGetAllKeys = vi.spyOn(IDBIndex.prototype, 'getAllKeys');
    const indexOpenCursor = vi.spyOn(IDBIndex.prototype, 'openCursor');

    const day = requireQuery(
      await repository.getHistoryView({ mode: 'day', anchorDate: fixture.selectedDate }),
    );
    const weekAnchor = addDays(fixture.completedWeekStart, 3);
    const week = requireQuery(
      await repository.getHistoryView({ mode: 'week', anchorDate: weekAnchor }),
    );
    const monthQuery = {
      mode: 'month' as const,
      anchorDate: fixture.currentDate,
      selectedDate: fixture.selectedDate,
    };
    const month = requireQuery(await repository.getHistoryView(monthQuery));
    const repeatedMonth = requireQuery(await repository.getHistoryView(monthQuery));

    expect(day).toMatchObject({
      mode: 'day',
      facts: { day: { date: fixture.selectedDate }, plannedLoadMinutes: 45 },
    });
    if (day.mode !== 'day') throw new Error('Expected Day History');
    expect(day.facts.tasks.map((task) => task.occurrence.id)).toEqual(
      fixture.expected.selectedTaskOccurrenceIds,
    );
    expect(day.facts.tasks.map((task) => task.membership.id)).toEqual(
      fixture.expected.selectedTaskPlanEntryIds,
    );
    expect(day.facts.habits.map((habit) => habit.id)).toEqual([
      fixture.expected.selectedHabitOccurrenceId,
    ]);

    const storedCompletedWeek = fixture.stores.weeks.find(
      (candidate) => candidate.startDate === fixture.completedWeekStart,
    );
    if (storedCompletedWeek?.status !== 'completed') {
      throw new Error('Expected completed fixture Week');
    }
    expect(storedCompletedWeek.completionSnapshot.progress).toEqual(
      EXPECTED_COMPLETED_WEEK_PROGRESS,
    );
    expect(week).toMatchObject({
      mode: 'week',
      anchorDate: weekAnchor,
      weekStart: fixture.completedWeekStart,
      facts: {
        progress: EXPECTED_COMPLETED_WEEK_PROGRESS,
        reflection: storedCompletedWeek.reflection,
      },
    });
    if (week.mode !== 'week') throw new Error('Expected Week History');
    expect(week.facts.days.map((facts) => facts.day.date)).toEqual(
      weekDates(fixture.completedWeekStart),
    );

    if (month.mode !== 'month') throw new Error('Expected Month History');
    expect(month).toEqual(repeatedMonth);
    expect(month.calendar.map((cell) => cell.date)).toEqual(MAY_2026_DATES);
    expect(month.completedWeeks.map((facts) => facts.week.startDate)).toEqual([
      localDate('2026-05-04'),
      localDate('2026-05-11'),
    ]);
    expect(month.completedWeeks.map((facts) => facts.week.startDate)).not.toContain(
      localDate('2026-04-27'),
    );
    expect(
      month.completedWeeks.find((facts) => facts.week.startDate === fixture.completedWeekStart)
        ?.progress,
    ).toEqual(storedCompletedWeek.completionSnapshot.progress);

    expect(transaction.mock.calls.length).toBeGreaterThan(0);
    for (const call of transaction.mock.calls) {
      expect(call[1] ?? 'readonly').toBe('readonly');
    }
    for (const call of objectStoreGetAll.mock.calls) {
      expect(call[0]).not.toBeUndefined();
      expect(call[0]).not.toBeNull();
    }
    expect(
      objectStoreGetAll.mock.calls.map(([query]) => {
        const range = query as IDBKeyRange;
        return [range.lower as unknown, range.upper as unknown];
      }),
    ).toEqual([
      [fixture.selectedDate, fixture.selectedDate],
      [fixture.completedWeekStart, addDays(fixture.completedWeekStart, 6)],
      [localDate('2026-05-01'), localDate('2026-05-31')],
      [localDate('2026-05-01'), localDate('2026-05-31')],
    ]);
    for (const call of indexGetAll.mock.calls) {
      expect(call[0]).not.toBeUndefined();
      expect(call[0]).not.toBeNull();
    }
    for (const calls of [
      objectStoreGetAllKeys.mock.calls,
      objectStoreOpenCursor.mock.calls,
      indexGetAllKeys.mock.calls,
      indexOpenCursor.mock.calls,
    ]) {
      for (const call of calls) {
        expect(call[0]).not.toBeUndefined();
        expect(call[0]).not.toBeNull();
      }
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

  it('prepares only open dates inside the requested Month and never scans dated stores unbounded', async () => {
    const frozenDayBefore = await database.get('days', fixture.completedWeekStart);
    const frozenWeekBefore = await database.get('weeks', fixture.completedWeekStart);
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    const objectStoreGet = vi.spyOn(IDBObjectStore.prototype, 'get');
    const objectStoreGetAll = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const objectStoreGetAllKeys = vi.spyOn(IDBObjectStore.prototype, 'getAllKeys');
    const objectStoreOpenCursor = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
    const indexGetAll = vi.spyOn(IDBIndex.prototype, 'getAll');
    const indexGetAllKeys = vi.spyOn(IDBIndex.prototype, 'getAllKeys');
    const indexOpenCursor = vi.spyOn(IDBIndex.prototype, 'openCursor');
    const indexGet = vi.spyOn(IDBIndex.prototype, 'get');

    const prepared = await repository.prepareOpenPeriod({
      kind: 'month',
      anchorDate: fixture.currentDate,
    });

    expect(prepared).toMatchObject({
      ok: true,
      affectedDates: [localDate('2026-05-18'), localDate('2026-05-19')],
      affectedWeeks: [PERSONAL_HISTORY_LAST_WEEK_START],
    });
    const scaledStores = new Set([
      'days',
      'taskOccurrences',
      'taskPlanEntries',
      'taskEvents',
      'habitOccurrences',
    ]);
    for (const [callIndex, call] of objectStoreGetAll.mock.calls.entries()) {
      if (call[0] !== undefined && call[0] !== null) continue;
      const store = objectStoreGetAll.mock.contexts[callIndex] as IDBObjectStore;
      expect(scaledStores.has(store.name)).toBe(false);
    }
    for (const call of indexGetAll.mock.calls) {
      expect(call[0]).not.toBeUndefined();
      expect(call[0]).not.toBeNull();
    }
    for (const calls of [
      objectStoreGetAllKeys.mock.calls,
      objectStoreOpenCursor.mock.calls,
      indexGetAllKeys.mock.calls,
      indexOpenCursor.mock.calls,
    ]) {
      for (const call of calls) {
        expect(call[0]).not.toBeUndefined();
        expect(call[0]).not.toBeNull();
      }
    }
    const requestedDayKeys = objectStoreGet.mock.calls.flatMap((call, callIndex) => {
      const store = objectStoreGet.mock.contexts[callIndex] as IDBObjectStore;
      return store.name === 'days' ? [call[0] as LocalDate] : [];
    });
    expect(requestedDayKeys).toEqual(MAY_2026_DATES);
    const openDates = new Set<LocalDate>(weekDates(PERSONAL_HISTORY_LAST_WEEK_START));
    for (const [callIndex, call] of indexGetAll.mock.calls.entries()) {
      const index = indexGetAll.mock.contexts[callIndex] as IDBIndex;
      if (index.name === 'by-date') {
        expect(openDates.has(call[0] as LocalDate)).toBe(true);
      }
    }
    for (const [callIndex, call] of indexGet.mock.calls.entries()) {
      const index = indexGet.mock.contexts[callIndex] as IDBIndex;
      if (index.name !== 'by-series-date') continue;
      const key = call[0] as unknown as readonly [string, LocalDate];
      expect(openDates.has(key[1])).toBe(true);
    }
    expect(
      transaction.mock.calls.filter((call) => (call[1] ?? 'readonly') === 'readwrite'),
    ).toHaveLength(1);

    vi.restoreAllMocks();
    expect(await database.get('days', fixture.completedWeekStart)).toEqual(frozenDayBefore);
    expect(await database.get('weeks', fixture.completedWeekStart)).toEqual(frozenWeekBefore);
    expect(await database.count('taskOccurrences')).toBe(fixture.expected.taskOccurrenceCount);
    expect(await database.count('habitOccurrences')).toBe(fixture.expected.habitOccurrenceCount);
    const preparedHabit = fixture.stores.habitOccurrences.find(
      (occurrence) => occurrence.date === localDate('2026-05-18'),
    );
    if (preparedHabit === undefined) throw new Error('Expected prepared fixture habit');
    expect(await database.get('habitOccurrences', preparedHabit.id)).toMatchObject({
      outcome: 'not-completed',
    });
    expect(
      await database.get('habitOccurrences', fixture.expected.selectedHabitOccurrenceId),
    ).toMatchObject({ outcome: 'pending' });

    const current = requireQuery(
      await repository.getHistoryView({
        mode: 'day',
        anchorDate: localDate('2026-05-18'),
      }),
    );
    expect(current).toMatchObject({
      mode: 'day',
      facts: { habits: [{ outcome: 'not-completed' }] },
    });
  });
});
