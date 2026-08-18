import { createPlanningDatabase, type PlanningDatabaseHandle } from '../../server/db/client';
import { DATABASE_TABLE_NAMES } from '../../server/db/schema';
import { E2E_DATABASE_URL } from './e2e-database-url';
import {
  toDayValues,
  toHabitDefinitionValues,
  toHabitOccurrenceValues,
  toTaskEventValues,
  toTaskOccurrenceValues,
  toTaskPlanEntryValues,
  toTaskSeriesValues,
  toWeekValues,
} from '../../server/planning/mappers';

/**
 * E2E fixtures reach PostgreSQL directly from Node.
 *
 * Feature 001 seeded IndexedDB from inside the browser; there is no browser
 * storage to seed any more. The alternative — test-only seeding routes on the
 * server — is explicitly excluded by the API contract, because a route that
 * exists only for tests is a production surface nobody audits.
 */
let handle: PlanningDatabaseHandle | undefined;

function database(): PlanningDatabaseHandle {
  handle ??= createPlanningDatabase({ connectionString: E2E_DATABASE_URL, maxConnections: 4 });
  return handle;
}

export async function closeE2eDatabase(): Promise<void> {
  if (handle !== undefined) {
    const current = handle;
    handle = undefined;
    await current.destroy();
  }
}

const TRUNCATE_STATEMENT = `TRUNCATE TABLE ${DATABASE_TABLE_NAMES.map((table) => `"${table}"`).join(
  ', ',
)} RESTART IDENTITY CASCADE`;

export async function truncateE2eData(): Promise<void> {
  await database().pool.query(TRUNCATE_STATEMENT);
}

export interface E2eSeedStores {
  readonly weeks?: readonly unknown[];
  readonly days?: readonly unknown[];
  readonly taskSeries?: readonly unknown[];
  readonly taskOccurrences?: readonly unknown[];
  readonly taskPlanEntries?: readonly unknown[];
  readonly taskEvents?: readonly unknown[];
  readonly habitDefinitions?: readonly unknown[];
  readonly habitOccurrences?: readonly unknown[];
}

const CHUNK_SIZE = 500;

async function insertAll<TValues>(
  records: readonly unknown[] | undefined,
  toValues: (record: never) => TValues,
  insert: (values: readonly TValues[]) => Promise<void>,
): Promise<void> {
  if (records === undefined || records.length === 0) return;

  const values = records.map((record) => toValues(record as never));
  for (let index = 0; index < values.length; index += CHUNK_SIZE) {
    await insert(values.slice(index, index + CHUNK_SIZE));
  }
}

/**
 * Writes a deterministic snapshot. Insertion order is load-bearing: foreign
 * keys require an owning row to exist before anything references it.
 */
export async function seedE2eStores(stores: E2eSeedStores): Promise<void> {
  const { db } = database();

  await insertAll<ReturnType<typeof toWeekValues>>(stores.weeks, toWeekValues, (values) =>
    db
      .insertInto('weeks')
      .values([...values])
      .execute()
      .then(() => undefined),
  );
  await insertAll<ReturnType<typeof toDayValues>>(stores.days, toDayValues, (values) =>
    db
      .insertInto('days')
      .values([...values])
      .execute()
      .then(() => undefined),
  );
  await insertAll<ReturnType<typeof toTaskSeriesValues>>(
    stores.taskSeries,
    toTaskSeriesValues,
    (values) =>
      db
        .insertInto('task_series')
        .values([...values])
        .execute()
        .then(() => undefined),
  );
  await insertAll<ReturnType<typeof toTaskOccurrenceValues>>(
    stores.taskOccurrences,
    toTaskOccurrenceValues,
    (values) =>
      db
        .insertInto('task_occurrences')
        .values([...values])
        .execute()
        .then(() => undefined),
  );
  await insertAll<ReturnType<typeof toTaskPlanEntryValues>>(
    stores.taskPlanEntries,
    toTaskPlanEntryValues,
    (values) =>
      db
        .insertInto('task_plan_entries')
        .values([...values])
        .execute()
        .then(() => undefined),
  );
  await insertAll<ReturnType<typeof toTaskEventValues>>(
    stores.taskEvents,
    toTaskEventValues,
    (values) =>
      db
        .insertInto('task_events')
        .values([...values])
        .execute()
        .then(() => undefined),
  );
  await insertAll<ReturnType<typeof toHabitDefinitionValues>>(
    stores.habitDefinitions,
    toHabitDefinitionValues,
    (values) =>
      db
        .insertInto('habit_definitions')
        .values([...values])
        .execute()
        .then(() => undefined),
  );
  await insertAll<ReturnType<typeof toHabitOccurrenceValues>>(
    stores.habitOccurrences,
    toHabitOccurrenceValues,
    (values) =>
      db
        .insertInto('habit_occurrences')
        .values([...values])
        .execute()
        .then(() => undefined),
  );
}
