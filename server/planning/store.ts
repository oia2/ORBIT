import type { Revision } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import type { Day } from '@/entities/planning/model/day';
import type { HabitDefinition, HabitOccurrence } from '@/entities/planning/model/habit';
import type {
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
  TaskSeries,
} from '@/entities/planning/model/task';
import type { Week } from '@/entities/planning/model/week';

import { DomainFailure } from './errors';
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
  withoutKey,
} from './mappers';
import type { Executor } from './transaction';

/*
 * Row access for the planning repository.
 *
 * Every read here mirrors an IndexedDB index the 001 adapter used, including
 * its ordering: an IndexedDB index scan yields records ordered by index key
 * and then by primary key, and several of 001's assertions depend on that
 * order. Each query below states which index it replaces.
 */

// ── revision-guarded writes ──────────────────────────────────────────────────

/**
 * Reports the conflict with the revision actually stored, which is what
 * feature 001's `RevisionConflict` payload has always carried.
 */
async function conflict(
  actualRevision: Revision | undefined,
  expectedRevision: Revision,
): Promise<never> {
  if (actualRevision === undefined) {
    throw new DomainFailure({
      code: 'UnexpectedServerFailure',
      message: 'A guarded update targeted a row that no longer exists',
    });
  }

  return Promise.reject(
    new DomainFailure({ code: 'RevisionConflict', expectedRevision, actualRevision }),
  );
}

// ── weeks ────────────────────────────────────────────────────────────────────

export async function getWeek(x: Executor, startDate: LocalDate): Promise<Week | undefined> {
  const row = await x
    .selectFrom('weeks')
    .selectAll()
    .where('start_date', '=', startDate)
    .executeTakeFirst();

  return row === undefined ? undefined : fromWeekRow(row);
}

export async function getWeeksByStarts(
  x: Executor,
  starts: readonly LocalDate[],
): Promise<readonly Week[]> {
  if (starts.length === 0) {
    return [];
  }

  const rows = await x
    .selectFrom('weeks')
    .selectAll()
    .where('start_date', 'in', [...starts])
    .orderBy('start_date')
    .execute();

  return rows.map(fromWeekRow);
}

export async function insertWeek(x: Executor, week: Week): Promise<void> {
  await x.insertInto('weeks').values(toWeekValues(week)).execute();
}

export async function putWeek(x: Executor, week: Week, expected: Revision): Promise<void> {
  const values = withoutKey(toWeekValues(week), 'start_date');
  const result = await x
    .updateTable('weeks')
    .set(values)
    .where('start_date', '=', week.startDate)
    .where('revision', '=', expected)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    const current = await getWeek(x, week.startDate);
    await conflict(current?.revision, expected);
  }
}

// ── days ─────────────────────────────────────────────────────────────────────

export async function getDay(x: Executor, date: LocalDate): Promise<Day | undefined> {
  const row = await x.selectFrom('days').selectAll().where('date', '=', date).executeTakeFirst();
  return row === undefined ? undefined : fromDayRow(row);
}

/** Replaces the `days` `by-weekStart` index. */
export async function getDaysByWeekStart(
  x: Executor,
  weekStart: LocalDate,
): Promise<readonly Day[]> {
  const rows = await x
    .selectFrom('days')
    .selectAll()
    .where('week_start', '=', weekStart)
    .orderBy('date')
    .execute();

  return rows.map(fromDayRow);
}

/** Replaces a bounded primary-key range scan over `days`. */
export async function getDaysInRange(
  x: Executor,
  startDate: LocalDate,
  endDate: LocalDate,
): Promise<readonly Day[]> {
  const rows = await x
    .selectFrom('days')
    .selectAll()
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date')
    .execute();

  return rows.map(fromDayRow);
}

export async function insertDay(x: Executor, day: Day): Promise<void> {
  await x.insertInto('days').values(toDayValues(day)).execute();
}

export async function putDay(x: Executor, day: Day, expected: Revision): Promise<void> {
  const values = withoutKey(toDayValues(day), 'date');
  const result = await x
    .updateTable('days')
    .set(values)
    .where('date', '=', day.date)
    .where('revision', '=', expected)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    const current = await getDay(x, day.date);
    await conflict(current?.revision, expected);
  }
}

// ── task series ──────────────────────────────────────────────────────────────

/** Replaces `taskSeries.getAll()`, which yields primary-key order. */
export async function getAllTaskSeries(x: Executor): Promise<readonly TaskSeries[]> {
  const rows = await x.selectFrom('task_series').selectAll().orderBy('id').execute();
  return rows.map(fromTaskSeriesRow);
}

export async function getTaskSeries(x: Executor, id: string): Promise<TaskSeries | undefined> {
  const row = await x
    .selectFrom('task_series')
    .selectAll()
    .where('id', '=', id as never)
    .executeTakeFirst();

  return row === undefined ? undefined : fromTaskSeriesRow(row);
}

export async function insertTaskSeries(x: Executor, series: TaskSeries): Promise<void> {
  await x.insertInto('task_series').values(toTaskSeriesValues(series)).execute();
}

export async function putTaskSeries(
  x: Executor,
  series: TaskSeries,
  expected: Revision,
): Promise<void> {
  const values = withoutKey(toTaskSeriesValues(series), 'id');
  const result = await x
    .updateTable('task_series')
    .set(values)
    .where('id', '=', series.id)
    .where('revision', '=', expected)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    const current = await getTaskSeries(x, series.id);
    await conflict(current?.revision, expected);
  }
}

// ── task occurrences ─────────────────────────────────────────────────────────

export async function getTaskOccurrence(
  x: Executor,
  id: string,
): Promise<TaskOccurrence | undefined> {
  const row = await x
    .selectFrom('task_occurrences')
    .selectAll()
    .where('id', '=', id as never)
    .executeTakeFirst();

  return row === undefined ? undefined : fromTaskOccurrenceRow(row);
}

export async function getTaskOccurrencesByIds(
  x: Executor,
  ids: readonly string[],
): Promise<readonly TaskOccurrence[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await x
    .selectFrom('task_occurrences')
    .selectAll()
    .where('id', 'in', ids as never[])
    .orderBy('id')
    .execute();

  return rows.map(fromTaskOccurrenceRow);
}

/** Replaces the `by-placement-created` range scan for one dated day. */
export async function getTaskOccurrencesPlacedOn(
  x: Executor,
  date: LocalDate,
): Promise<readonly TaskOccurrence[]> {
  const rows = await x
    .selectFrom('task_occurrences')
    .selectAll()
    .where('placement_kind', '=', 'day')
    .where('placement_date', '=', date)
    .orderBy('created_sequence')
    .execute();

  return rows.map(fromTaskOccurrenceRow);
}

/** Replaces the `by-placement-created` range scan for the backlog. */
export async function getBacklogTaskOccurrences(x: Executor): Promise<readonly TaskOccurrence[]> {
  const rows = await x
    .selectFrom('task_occurrences')
    .selectAll()
    .where('placement_kind', '=', 'backlog')
    .orderBy('created_sequence')
    .execute();

  return rows.map(fromTaskOccurrenceRow);
}

/** Replaces the `by-series-date` index lookup. */
export async function getTaskOccurrenceBySeriesDate(
  x: Executor,
  seriesId: string,
  nominalDate: LocalDate,
): Promise<TaskOccurrence | undefined> {
  const row = await x
    .selectFrom('task_occurrences')
    .selectAll()
    .where('series_id', '=', seriesId as never)
    .where('nominal_date', '=', nominalDate)
    .executeTakeFirst();

  return row === undefined ? undefined : fromTaskOccurrenceRow(row);
}

/**
 * Replaces `allocateNextCreationSequence`: the reverse cursor over the
 * `by-created-sequence` index. Allocating `max + 1` inside the command
 * transaction keeps the sequence gap-free exactly as feature 001's did — a
 * PostgreSQL sequence would advance on rollback and change the values 001's
 * suites assert on.
 */
export async function maxCreatedSequence(x: Executor): Promise<number> {
  const row = await x
    .selectFrom('task_occurrences')
    .select(({ fn }) => fn.max('created_sequence').as('value'))
    .executeTakeFirst();

  // `max()` over an empty table yields NULL, which Kysely types as the column.
  return row?.value == null ? 0 : Number(row.value);
}

export async function insertTaskOccurrence(x: Executor, occurrence: TaskOccurrence): Promise<void> {
  await x.insertInto('task_occurrences').values(toTaskOccurrenceValues(occurrence)).execute();
}

export async function putTaskOccurrence(
  x: Executor,
  occurrence: TaskOccurrence,
  expected: Revision,
): Promise<void> {
  const values = withoutKey(toTaskOccurrenceValues(occurrence), 'id');
  const result = await x
    .updateTable('task_occurrences')
    .set(values)
    .where('id', '=', occurrence.id)
    .where('revision', '=', expected)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    const current = await getTaskOccurrence(x, occurrence.id);
    await conflict(current?.revision, expected);
  }
}

export async function deleteTaskOccurrence(x: Executor, id: string): Promise<void> {
  await x
    .deleteFrom('task_occurrences')
    .where('id', '=', id as never)
    .execute();
}

// ── task plan entries ────────────────────────────────────────────────────────

/** Replaces the `by-occurrence-date` index lookup. */
export async function getPlanEntryByOccurrenceDate(
  x: Executor,
  occurrenceId: string,
  date: LocalDate,
): Promise<TaskPlanEntry | undefined> {
  const row = await x
    .selectFrom('task_plan_entries')
    .selectAll()
    .where('occurrence_id', '=', occurrenceId as never)
    .where('plan_date', '=', date)
    .executeTakeFirst();

  return row === undefined ? undefined : fromTaskPlanEntryRow(row);
}

/** Replaces the `by-occurrence-date` bounded range scan for one occurrence. */
export async function getPlanEntriesByOccurrence(
  x: Executor,
  occurrenceId: string,
): Promise<readonly TaskPlanEntry[]> {
  const rows = await x
    .selectFrom('task_plan_entries')
    .selectAll()
    .where('occurrence_id', '=', occurrenceId as never)
    .orderBy('plan_date')
    .execute();

  return rows.map(fromTaskPlanEntryRow);
}

/** Replaces the `by-date` index lookup. */
export async function getPlanEntriesByDate(
  x: Executor,
  date: LocalDate,
): Promise<readonly TaskPlanEntry[]> {
  const rows = await x
    .selectFrom('task_plan_entries')
    .selectAll()
    .where('plan_date', '=', date)
    .orderBy('id')
    .execute();

  return rows.map(fromTaskPlanEntryRow);
}

/** Replaces the `by-date` bounded range scan. */
export async function getPlanEntriesInRange(
  x: Executor,
  startDate: LocalDate,
  endDate: LocalDate,
): Promise<readonly TaskPlanEntry[]> {
  const rows = await x
    .selectFrom('task_plan_entries')
    .selectAll()
    .where('plan_date', '>=', startDate)
    .where('plan_date', '<=', endDate)
    .orderBy('plan_date')
    .orderBy('id')
    .execute();

  return rows.map(fromTaskPlanEntryRow);
}

export async function insertPlanEntry(x: Executor, entry: TaskPlanEntry): Promise<void> {
  await x.insertInto('task_plan_entries').values(toTaskPlanEntryValues(entry)).execute();
}

/**
 * Memberships carry no revision of their own — they are guarded by the day and
 * week revisions of the command that writes them — so this is a plain upsert,
 * mirroring `taskPlanEntries.put`.
 */
export async function putPlanEntry(x: Executor, entry: TaskPlanEntry): Promise<void> {
  const values = toTaskPlanEntryValues(entry);
  const updates = withoutKey(values, 'id');

  await x
    .insertInto('task_plan_entries')
    .values(values)
    .onConflict((conflictBuilder) => conflictBuilder.column('id').doUpdateSet(updates))
    .execute();
}

export async function deletePlanEntry(x: Executor, id: string): Promise<void> {
  await x
    .deleteFrom('task_plan_entries')
    .where('id', '=', id as never)
    .execute();
}

// ── task events ──────────────────────────────────────────────────────────────

/** Replaces the `by-occurrence-sequence` bounded range scan. */
export async function getEventsByOccurrence(
  x: Executor,
  occurrenceId: string,
): Promise<readonly TaskEvent[]> {
  const rows = await x
    .selectFrom('task_events')
    .selectAll()
    .where('occurrence_id', '=', occurrenceId as never)
    .orderBy('sequence')
    .execute();

  return rows.map(fromTaskEventRow);
}

export async function getEventsByOccurrences(
  x: Executor,
  occurrenceIds: readonly string[],
): Promise<readonly TaskEvent[]> {
  if (occurrenceIds.length === 0) {
    return [];
  }

  const rows = await x
    .selectFrom('task_events')
    .selectAll()
    .where('occurrence_id', 'in', occurrenceIds as never[])
    .orderBy('sequence')
    .execute();

  return rows.map(fromTaskEventRow);
}

/** Replaces `allocateNextEventSequence`: the reverse key cursor over `taskEvents`. */
export async function maxEventSequence(x: Executor): Promise<number> {
  const row = await x
    .selectFrom('task_events')
    .select(({ fn }) => fn.max('sequence').as('value'))
    .executeTakeFirst();

  // `max()` over an empty table yields NULL, which Kysely types as the column.
  return row?.value == null ? 0 : Number(row.value);
}

export async function insertTaskEvent(x: Executor, event: TaskEvent): Promise<void> {
  await x.insertInto('task_events').values(toTaskEventValues(event)).execute();
}

// ── habit definitions ────────────────────────────────────────────────────────

/** Replaces `habitDefinitions.getAll()`, which yields primary-key order. */
export async function getAllHabitDefinitions(x: Executor): Promise<readonly HabitDefinition[]> {
  const rows = await x.selectFrom('habit_definitions').selectAll().orderBy('id').execute();
  return rows.map(fromHabitDefinitionRow);
}

export async function getHabitDefinition(
  x: Executor,
  id: string,
): Promise<HabitDefinition | undefined> {
  const row = await x
    .selectFrom('habit_definitions')
    .selectAll()
    .where('id', '=', id as never)
    .executeTakeFirst();

  return row === undefined ? undefined : fromHabitDefinitionRow(row);
}

export async function insertHabitDefinition(
  x: Executor,
  definition: HabitDefinition,
): Promise<void> {
  await x.insertInto('habit_definitions').values(toHabitDefinitionValues(definition)).execute();
}

export async function putHabitDefinition(
  x: Executor,
  definition: HabitDefinition,
  expected: Revision,
): Promise<void> {
  const values = withoutKey(toHabitDefinitionValues(definition), 'id');
  const result = await x
    .updateTable('habit_definitions')
    .set(values)
    .where('id', '=', definition.id)
    .where('revision', '=', expected)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    const current = await getHabitDefinition(x, definition.id);
    await conflict(current?.revision, expected);
  }
}

// ── habit occurrences ────────────────────────────────────────────────────────

export async function getHabitOccurrence(
  x: Executor,
  id: string,
): Promise<HabitOccurrence | undefined> {
  const row = await x
    .selectFrom('habit_occurrences')
    .selectAll()
    .where('id', '=', id as never)
    .executeTakeFirst();

  return row === undefined ? undefined : fromHabitOccurrenceRow(row);
}

/** Replaces the `by-date` index lookup, which yields primary-key order. */
export async function getHabitOccurrencesByDate(
  x: Executor,
  date: LocalDate,
): Promise<readonly HabitOccurrence[]> {
  const rows = await x
    .selectFrom('habit_occurrences')
    .selectAll()
    .where('date', '=', date)
    .orderBy('id')
    .execute();

  return rows.map(fromHabitOccurrenceRow);
}

/** Replaces the `by-date` bounded range scan. */
export async function getHabitOccurrencesInRange(
  x: Executor,
  startDate: LocalDate,
  endDate: LocalDate,
): Promise<readonly HabitOccurrence[]> {
  const rows = await x
    .selectFrom('habit_occurrences')
    .selectAll()
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date')
    .orderBy('id')
    .execute();

  return rows.map(fromHabitOccurrenceRow);
}

/**
 * A habit definition's occurrences that sit on an **open** day.
 *
 * Bounded by the join to `days.status`, so a duration change touches only what
 * it is allowed to touch and never scans a full history (003 FR-034).
 */
export async function getOpenHabitOccurrencesByDefinition(
  x: Executor,
  definitionId: string,
): Promise<readonly HabitOccurrence[]> {
  const rows = await x
    .selectFrom('habit_occurrences')
    .innerJoin('days', 'days.date', 'habit_occurrences.date')
    .selectAll('habit_occurrences')
    .where('habit_occurrences.definition_id', '=', definitionId as never)
    .where('days.status', '=', 'open')
    .orderBy('habit_occurrences.date')
    .execute();

  return rows.map(fromHabitOccurrenceRow);
}

export async function insertHabitOccurrence(
  x: Executor,
  occurrence: HabitOccurrence,
): Promise<void> {
  await x.insertInto('habit_occurrences').values(toHabitOccurrenceValues(occurrence)).execute();
}

/**
 * Habit occurrences carry no revision of their own: 001 guards them with the
 * revision of their owning day, which the same command transaction updates.
 */
export async function putHabitOccurrence(x: Executor, occurrence: HabitOccurrence): Promise<void> {
  const values = toHabitOccurrenceValues(occurrence);
  const updates = withoutKey(values, 'id');

  await x
    .insertInto('habit_occurrences')
    .values(values)
    .onConflict((conflictBuilder) => conflictBuilder.column('id').doUpdateSet(updates))
    .execute();
}

export async function deleteHabitOccurrence(x: Executor, id: string): Promise<void> {
  await x
    .deleteFrom('habit_occurrences')
    .where('id', '=', id as never)
    .execute();
}
