import type { ApplicationClock, Instant } from '@/shared/lib/local-date/clock';
import { startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';

import { revision as makeRevision, type Revision } from '@/shared/lib/ids';

import type {
  DailyStateEntry,
  Day,
  ClosedDay,
  DayClosureSnapshot,
} from '@/entities/planning/model/day';
import type { HabitDefinition, HabitOccurrence } from '@/entities/planning/model/habit';
import type {
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
  TaskSeries,
} from '@/entities/planning/model/task';
import type { Week } from '@/entities/planning/model/week';

import type { PlanningDatabase } from '../../db/client';
import {
  openSharedTestDatabase,
  type QueryRecording,
  type TestDatabase,
} from '../../test-support/database';
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
} from '../mappers';
import {
  createPostgresPlanningRepository,
  type ServerPlanningRepository,
} from '../postgres-planning-repository';

/**
 * Direct row access for the retargeted feature-001 suites.
 *
 * Those suites seeded and inspected IndexedDB object stores directly, and the
 * assertions built on that access are the behavioral evidence SC-001 depends
 * on. This mirrors each store operation they used — including its ordering, so
 * that an assertion about order still means what it meant — while changing only
 * the storage mechanism underneath.
 */
export interface TestPlanningStore {
  getWeek(startDate: LocalDate): Promise<Week | undefined>;
  putWeek(week: Week): Promise<void>;
  getAllWeeks(): Promise<readonly Week[]>;
  countWeeks(): Promise<number>;

  getDay(date: LocalDate): Promise<Day | undefined>;
  putDay(day: Day): Promise<void>;
  getAllDays(): Promise<readonly Day[]>;
  getDaysByWeekStart(weekStart: LocalDate): Promise<readonly Day[]>;

  getTaskSeries(id: string): Promise<TaskSeries | undefined>;
  getAllTaskSeries(): Promise<readonly TaskSeries[]>;

  getTaskOccurrence(id: string): Promise<TaskOccurrence | undefined>;
  putTaskOccurrence(occurrence: TaskOccurrence): Promise<void>;
  getAllTaskOccurrences(): Promise<readonly TaskOccurrence[]>;
  countTaskOccurrences(): Promise<number>;

  getPlanEntry(id: string): Promise<TaskPlanEntry | undefined>;
  putPlanEntry(entry: TaskPlanEntry): Promise<void>;
  getAllPlanEntries(): Promise<readonly TaskPlanEntry[]>;
  getPlanEntriesByDate(date: LocalDate): Promise<readonly TaskPlanEntry[]>;
  getPlanEntriesByOccurrence(occurrenceId: string): Promise<readonly TaskPlanEntry[]>;
  countPlanEntries(): Promise<number>;

  getAllTaskEvents(): Promise<readonly TaskEvent[]>;
  countTaskEvents(): Promise<number>;

  getHabitDefinition(id: string): Promise<HabitDefinition | undefined>;
  getAllHabitDefinitions(): Promise<readonly HabitDefinition[]>;

  getHabitOccurrence(id: string): Promise<HabitOccurrence | undefined>;
  putHabitOccurrence(occurrence: HabitOccurrence): Promise<void>;
  getAllHabitOccurrences(): Promise<readonly HabitOccurrence[]>;
  getHabitOccurrencesByDate(date: LocalDate): Promise<readonly HabitOccurrence[]>;
  countHabitOccurrences(): Promise<number>;

  snapshotAllStores(): Promise<Record<string, readonly unknown[]>>;
  seed(stores: SeedStores): Promise<void>;
}

export interface SeedStores {
  readonly weeks?: readonly Week[];
  readonly days?: readonly Day[];
  readonly taskSeries?: readonly TaskSeries[];
  readonly taskOccurrences?: readonly TaskOccurrence[];
  readonly taskPlanEntries?: readonly TaskPlanEntry[];
  readonly taskEvents?: readonly TaskEvent[];
  readonly habitDefinitions?: readonly HabitDefinition[];
  readonly habitOccurrences?: readonly HabitOccurrence[];
}

export interface RepositoryUnderTest {
  readonly repository: ServerPlanningRepository;
  readonly database: TestPlanningStore;
  /** The Kysely instance, for suites that assert on transaction behavior. */
  readonly db: PlanningDatabase;
  recordQueries(): QueryRecording;
  /**
   * Rebuilds the repository against the same database, mirroring the "close and
   * reopen" step several 001 suites use to prove facts survive a restart.
   */
  reopen(options: CreateRepositoryUnderTestOptions): RepositoryUnderTest;
}

export interface CreateRepositoryUnderTestOptions {
  readonly clock: ApplicationClock;
  readonly generateUuid?: () => string;
}

const BULK_CHUNK_SIZE = 500;

async function insertInChunks<TValue>(
  values: readonly TValue[],
  insert: (chunk: readonly TValue[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += BULK_CHUNK_SIZE) {
    await insert(values.slice(index, index + BULK_CHUNK_SIZE));
  }
}

function createTestStore(db: PlanningDatabase): TestPlanningStore {
  return {
    async getWeek(startDate) {
      const row = await db
        .selectFrom('weeks')
        .selectAll()
        .where('start_date', '=', startDate)
        .executeTakeFirst();
      return row === undefined ? undefined : fromWeekRow(row);
    },
    async putWeek(week) {
      const values = toWeekValues(week);
      const updates = withoutKey(values, 'start_date');
      await db
        .insertInto('weeks')
        .values(values)
        .onConflict((builder) => builder.column('start_date').doUpdateSet(updates))
        .execute();
    },
    async getAllWeeks() {
      const rows = await db.selectFrom('weeks').selectAll().orderBy('start_date').execute();
      return rows.map(fromWeekRow);
    },
    async countWeeks() {
      const row = await db
        .selectFrom('weeks')
        .select(({ fn }) => fn.countAll().as('value'))
        .executeTakeFirstOrThrow();
      return Number(row.value);
    },

    async getDay(date) {
      const row = await db
        .selectFrom('days')
        .selectAll()
        .where('date', '=', date)
        .executeTakeFirst();
      return row === undefined ? undefined : fromDayRow(row);
    },
    async putDay(day) {
      const values = toDayValues(day);
      const updates = withoutKey(values, 'date');
      await db
        .insertInto('days')
        .values(values)
        .onConflict((builder) => builder.column('date').doUpdateSet(updates))
        .execute();
    },
    async getAllDays() {
      const rows = await db.selectFrom('days').selectAll().orderBy('date').execute();
      return rows.map(fromDayRow);
    },
    async getDaysByWeekStart(weekStart) {
      const rows = await db
        .selectFrom('days')
        .selectAll()
        .where('week_start', '=', weekStart)
        .orderBy('date')
        .execute();
      return rows.map(fromDayRow);
    },

    async getTaskSeries(id) {
      const row = await db
        .selectFrom('task_series')
        .selectAll()
        .where('id', '=', id as never)
        .executeTakeFirst();
      return row === undefined ? undefined : fromTaskSeriesRow(row);
    },
    async getAllTaskSeries() {
      const rows = await db.selectFrom('task_series').selectAll().orderBy('id').execute();
      return rows.map(fromTaskSeriesRow);
    },

    async getTaskOccurrence(id) {
      const row = await db
        .selectFrom('task_occurrences')
        .selectAll()
        .where('id', '=', id as never)
        .executeTakeFirst();
      return row === undefined ? undefined : fromTaskOccurrenceRow(row);
    },
    async putTaskOccurrence(occurrence) {
      const values = toTaskOccurrenceValues(occurrence);
      const updates = withoutKey(values, 'id');
      await db
        .insertInto('task_occurrences')
        .values(values)
        .onConflict((builder) => builder.column('id').doUpdateSet(updates))
        .execute();
    },
    async getAllTaskOccurrences() {
      const rows = await db.selectFrom('task_occurrences').selectAll().orderBy('id').execute();
      return rows.map(fromTaskOccurrenceRow);
    },
    async countTaskOccurrences() {
      const row = await db
        .selectFrom('task_occurrences')
        .select(({ fn }) => fn.countAll().as('value'))
        .executeTakeFirstOrThrow();
      return Number(row.value);
    },

    async getPlanEntry(id) {
      const row = await db
        .selectFrom('task_plan_entries')
        .selectAll()
        .where('id', '=', id as never)
        .executeTakeFirst();
      return row === undefined ? undefined : fromTaskPlanEntryRow(row);
    },
    async putPlanEntry(entry) {
      const values = toTaskPlanEntryValues(entry);
      const updates = withoutKey(values, 'id');
      await db
        .insertInto('task_plan_entries')
        .values(values)
        .onConflict((builder) => builder.column('id').doUpdateSet(updates))
        .execute();
    },
    async getAllPlanEntries() {
      const rows = await db.selectFrom('task_plan_entries').selectAll().orderBy('id').execute();
      return rows.map(fromTaskPlanEntryRow);
    },
    async getPlanEntriesByDate(date) {
      const rows = await db
        .selectFrom('task_plan_entries')
        .selectAll()
        .where('plan_date', '=', date)
        .orderBy('id')
        .execute();
      return rows.map(fromTaskPlanEntryRow);
    },
    async getPlanEntriesByOccurrence(occurrenceId) {
      const rows = await db
        .selectFrom('task_plan_entries')
        .selectAll()
        .where('occurrence_id', '=', occurrenceId as never)
        .orderBy('plan_date')
        .execute();
      return rows.map(fromTaskPlanEntryRow);
    },
    async countPlanEntries() {
      const row = await db
        .selectFrom('task_plan_entries')
        .select(({ fn }) => fn.countAll().as('value'))
        .executeTakeFirstOrThrow();
      return Number(row.value);
    },

    async getAllTaskEvents() {
      const rows = await db.selectFrom('task_events').selectAll().orderBy('sequence').execute();
      return rows.map(fromTaskEventRow);
    },
    async countTaskEvents() {
      const row = await db
        .selectFrom('task_events')
        .select(({ fn }) => fn.countAll().as('value'))
        .executeTakeFirstOrThrow();
      return Number(row.value);
    },

    async getHabitDefinition(id) {
      const row = await db
        .selectFrom('habit_definitions')
        .selectAll()
        .where('id', '=', id as never)
        .executeTakeFirst();
      return row === undefined ? undefined : fromHabitDefinitionRow(row);
    },
    async getAllHabitDefinitions() {
      const rows = await db.selectFrom('habit_definitions').selectAll().orderBy('id').execute();
      return rows.map(fromHabitDefinitionRow);
    },

    async getHabitOccurrence(id) {
      const row = await db
        .selectFrom('habit_occurrences')
        .selectAll()
        .where('id', '=', id as never)
        .executeTakeFirst();
      return row === undefined ? undefined : fromHabitOccurrenceRow(row);
    },
    async putHabitOccurrence(occurrence) {
      const values = toHabitOccurrenceValues(occurrence);
      const updates = withoutKey(values, 'id');
      await db
        .insertInto('habit_occurrences')
        .values(values)
        .onConflict((builder) => builder.column('id').doUpdateSet(updates))
        .execute();
    },
    async getAllHabitOccurrences() {
      const rows = await db.selectFrom('habit_occurrences').selectAll().orderBy('id').execute();
      return rows.map(fromHabitOccurrenceRow);
    },
    async getHabitOccurrencesByDate(date) {
      const rows = await db
        .selectFrom('habit_occurrences')
        .selectAll()
        .where('date', '=', date)
        .orderBy('id')
        .execute();
      return rows.map(fromHabitOccurrenceRow);
    },
    async countHabitOccurrences() {
      const row = await db
        .selectFrom('habit_occurrences')
        .select(({ fn }) => fn.countAll().as('value'))
        .executeTakeFirstOrThrow();
      return Number(row.value);
    },

    async snapshotAllStores() {
      return {
        weeks: await this.getAllWeeks(),
        days: await this.getAllDays(),
        taskSeries: await this.getAllTaskSeries(),
        taskOccurrences: await this.getAllTaskOccurrences(),
        taskPlanEntries: await this.getAllPlanEntries(),
        taskEvents: await this.getAllTaskEvents(),
        habitDefinitions: await this.getAllHabitDefinitions(),
        habitOccurrences: await this.getAllHabitOccurrences(),
      };
    },

    async seed(stores) {
      // Foreign keys make the order load-bearing: an owning row must exist
      // before anything references it.
      await insertInChunks(stores.weeks ?? [], async (chunk) => {
        await db.insertInto('weeks').values(chunk.map(toWeekValues)).execute();
      });
      await insertInChunks(stores.days ?? [], async (chunk) => {
        await db.insertInto('days').values(chunk.map(toDayValues)).execute();
      });
      await insertInChunks(stores.taskSeries ?? [], async (chunk) => {
        await db.insertInto('task_series').values(chunk.map(toTaskSeriesValues)).execute();
      });
      await insertInChunks(stores.taskOccurrences ?? [], async (chunk) => {
        await db.insertInto('task_occurrences').values(chunk.map(toTaskOccurrenceValues)).execute();
      });
      await insertInChunks(stores.taskPlanEntries ?? [], async (chunk) => {
        await db.insertInto('task_plan_entries').values(chunk.map(toTaskPlanEntryValues)).execute();
      });
      await insertInChunks(stores.taskEvents ?? [], async (chunk) => {
        await db.insertInto('task_events').values(chunk.map(toTaskEventValues)).execute();
      });
      await insertInChunks(stores.habitDefinitions ?? [], async (chunk) => {
        await db
          .insertInto('habit_definitions')
          .values(chunk.map(toHabitDefinitionValues))
          .execute();
      });
      await insertInChunks(stores.habitOccurrences ?? [], async (chunk) => {
        await db
          .insertInto('habit_occurrences')
          .values(chunk.map(toHabitOccurrenceValues))
          .execute();
      });
    },
  };
}

export interface ClosedDayFixture {
  readonly date: LocalDate;
  readonly closureSnapshot: DayClosureSnapshot;
  readonly closedAt: Instant;
  readonly weekStart?: LocalDate;
  readonly revision?: Revision;
  readonly state?: DailyStateEntry;
}

/**
 * Builds one `ClosedDay` with a caller-supplied frozen snapshot.
 *
 * Feature 003 needs closed days whose recorded counts are chosen by the test
 * rather than produced by running a closure: the 003 US2 suites assert that a
 * snapshot and the live derivation agree, and the 003 US3 suites reopen a day
 * and compare against the snapshot it discarded. Driving a real closure to
 * reach those states would make the assertion depend on the code under test.
 */
export function closedDayFixture(input: ClosedDayFixture): ClosedDay {
  return {
    date: input.date,
    weekStart: input.weekStart ?? startOfWeek(input.date),
    status: 'closed',
    ...(input.state === undefined ? {} : { state: input.state }),
    closureSnapshot: input.closureSnapshot,
    closedAt: input.closedAt,
    revision: input.revision ?? makeRevision(1),
  };
}

function build(
  database: TestDatabase,
  options: CreateRepositoryUnderTestOptions,
): RepositoryUnderTest {
  return {
    repository: createPostgresPlanningRepository(database.db, options),
    database: createTestStore(database.db),
    db: database.db,
    recordQueries: () => database.recordQueries(),
    reopen: (nextOptions) => build(database, nextOptions),
  };
}

/**
 * The construction seam the 001 suites used for IndexedDB, pointed at
 * `PostgresPlanningRepository` and the per-worker test database.
 */
export async function createRepositoryUnderTest(
  options: CreateRepositoryUnderTestOptions,
): Promise<RepositoryUnderTest> {
  const database = await openSharedTestDatabase();
  await database.truncateAll();
  return build(database, options);
}

/** Rebuilds without truncating, for suites that assert facts survive a reopen. */
export async function reopenRepositoryUnderTest(
  options: CreateRepositoryUnderTestOptions,
): Promise<RepositoryUnderTest> {
  const database = await openSharedTestDatabase();
  return build(database, options);
}
