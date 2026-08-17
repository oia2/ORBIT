import { beforeEach, describe, expect, it } from 'vitest';

import { addDays, localDate, weekDates, type LocalDate } from '@/shared/lib/local-date/local-date';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';

import type { QueryResult } from '@/entities/planning/model/planning-repository';

import {
  buildPersonalHistoryFixture,
  PERSONAL_HISTORY_CURRENT_DATE,
  PERSONAL_HISTORY_LAST_WEEK_START,
  type PersonalHistoryFixture,
} from '../../tests/fixtures/personal-history';
import type { ExecutedQuery } from '../test-support/database';
import {
  createRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

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

/** Tables whose row count grows with retained history. */
const SCALED_TABLES = [
  'days',
  'task_occurrences',
  'task_plan_entries',
  'task_events',
  'habit_occurrences',
] as const;

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

/** Statements that read a table whose size grows with retained history. */
function scaledReads(queries: readonly ExecutedQuery[]): readonly ExecutedQuery[] {
  return queries.filter(
    (query) =>
      /^\s*select\b/i.test(query.sql) &&
      SCALED_TABLES.some((table) => query.sql.includes(`"${table}"`)),
  );
}

describe('PostgreSQL planning repository — reproducible 52-week History fixture', () => {
  let harness: RepositoryUnderTest;
  let repository: RepositoryUnderTest['repository'];
  let database: RepositoryUnderTest['database'];
  let fixture: PersonalHistoryFixture;

  beforeEach(async () => {
    fixture = buildPersonalHistoryFixture();
    harness = await createRepositoryUnderTest({
      clock: createFixedClock({
        instant: NOW,
        currentLocalDate: PERSONAL_HISTORY_CURRENT_DATE,
      }),
      generateUuid: uuidGenerator(),
    });
    repository = harness.repository;
    database = harness.database;
    await database.seed(fixture.stores);
  });

  /*
   * REPLACED STORAGE-MECHANISM ASSERTIONS (recorded in traceability.md).
   *
   * 001 also asserted here that the in-browser V1 seed snapshot matched the
   * model fixture. 002 FR-002 removes in-browser seeding entirely — E2E
   * fixtures reach PostgreSQL directly from Node — so those assertions describe
   * a mechanism that no longer exists. The fixture's determinism and its exact
   * record counts, which is what the suite was really guarding, are asserted
   * against the real database instead.
   */
  it('rebuilds the same 52-week model with fixed record counts', async () => {
    const rebuilt = buildPersonalHistoryFixture();

    expect(rebuilt).toEqual(fixture);
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

    expect(await database.countWeeks()).toBe(fixture.expected.weekCount);
    expect(await database.countTaskOccurrences()).toBe(fixture.expected.taskOccurrenceCount);
    expect(await database.countPlanEntries()).toBe(fixture.expected.taskPlanEntryCount);
    expect(await database.countTaskEvents()).toBe(fixture.expected.taskEventCount);
    expect(await database.countHabitOccurrences()).toBe(fixture.expected.habitOccurrenceCount);
  });

  it('uses bounded Day, Week, and Month reads with deterministic frozen progress', async () => {
    const recording = harness.recordQueries();

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

    const executed = recording.stop();

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

    /*
     * REPLACES 001's IndexedDB assertions that every read used a readonly
     * transaction and a bounded index range. The property is the same: the
     * projection never writes and never scans a history-sized table without a
     * predicate. Each read transaction is `read only`, and the concrete date
     * bounds below are the same ones 001 asserted on its key ranges.
     */
    const statements = executed.map((query) => query.sql);
    expect(statements.filter((sql) => sql.startsWith('start transaction'))).toHaveLength(4);
    for (const sql of statements.filter((candidate) => candidate.startsWith('start transaction'))) {
      expect(sql).toBe('start transaction isolation level repeatable read read only');
    }
    for (const sql of statements) {
      expect(sql).not.toMatch(/^\s*(insert|update|delete)\b/i);
    }
    for (const query of scaledReads(executed)) {
      expect(query.sql).toMatch(/where/i);
      expect(query.parameters.length).toBeGreaterThan(0);
    }

    const dayBounds = executed
      .filter((query) => /^\s*select .* from "days"/i.test(query.sql))
      .map((query) => query.parameters);
    expect(dayBounds).toEqual([
      [fixture.selectedDate, fixture.selectedDate],
      [fixture.completedWeekStart, addDays(fixture.completedWeekStart, 6)],
      [localDate('2026-05-01'), localDate('2026-05-31')],
      [localDate('2026-05-01'), localDate('2026-05-31')],
    ]);
  });

  it('prepares only open dates inside the requested Month and never scans dated tables unbounded', async () => {
    const frozenDayBefore = await database.getDay(fixture.completedWeekStart);
    const frozenWeekBefore = await database.getWeek(fixture.completedWeekStart);
    const recording = harness.recordQueries();

    const prepared = await repository.prepareOpenPeriod({
      kind: 'month',
      anchorDate: fixture.currentDate,
    });

    const executed = recording.stop();

    expect(prepared).toMatchObject({
      ok: true,
      affectedDates: [localDate('2026-05-18'), localDate('2026-05-19')],
      affectedWeeks: [PERSONAL_HISTORY_LAST_WEEK_START],
    });

    // REPLACES 001's IndexedDB cursor/getAll bounds assertions.
    for (const query of scaledReads(executed)) {
      expect(query.sql).toMatch(/where|max\(/i);
    }
    const requestedDayKeys = executed
      .filter((query) => /^\s*select .* from "days" where "date" = /i.test(query.sql))
      .map((query) => query.parameters[0] as LocalDate);
    expect(requestedDayKeys.slice(0, MAY_2026_DATES.length)).toEqual(MAY_2026_DATES);

    const openDates = new Set<LocalDate>(weekDates(PERSONAL_HISTORY_LAST_WEEK_START));
    for (const query of executed) {
      if (
        !/from "(task_plan_entries|habit_occurrences)" where "(plan_date|date)" = /i.test(query.sql)
      ) {
        continue;
      }
      expect(openDates.has(query.parameters[0] as LocalDate)).toBe(true);
    }
    for (const query of executed) {
      if (!/from "task_occurrences" where "series_id" = /i.test(query.sql)) continue;
      expect(openDates.has(query.parameters[1] as LocalDate)).toBe(true);
    }
    expect(executed.filter((query) => query.sql.startsWith('start transaction'))).toHaveLength(1);

    expect(await database.getDay(fixture.completedWeekStart)).toEqual(frozenDayBefore);
    expect(await database.getWeek(fixture.completedWeekStart)).toEqual(frozenWeekBefore);
    expect(await database.countTaskOccurrences()).toBe(fixture.expected.taskOccurrenceCount);
    expect(await database.countHabitOccurrences()).toBe(fixture.expected.habitOccurrenceCount);
    const preparedHabit = fixture.stores.habitOccurrences.find(
      (occurrence) => occurrence.date === localDate('2026-05-18'),
    );
    if (preparedHabit === undefined) throw new Error('Expected prepared fixture habit');
    expect(await database.getHabitOccurrence(preparedHabit.id)).toMatchObject({
      outcome: 'not-completed',
    });
    expect(
      await database.getHabitOccurrence(fixture.expected.selectedHabitOccurrenceId),
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
