import pg from 'pg';

import { createPlanningDatabase, type PlanningDatabase } from '../db/client';
import { runMigrations } from '../db/migrations/index';
import { DATABASE_TABLE_NAMES } from '../db/schema';

const DEFAULT_DATABASE_URL = 'postgres://orbit:orbit@localhost:5432/orbit';

function baseConnectionString(): string {
  const configured = process.env.DATABASE_URL;
  return configured === undefined || configured.trim().length === 0
    ? DEFAULT_DATABASE_URL
    : configured.trim();
}

/**
 * Vitest runs suites in parallel workers, and the schema's constraints are only
 * meaningful against a real database — so each worker gets its own, rather than
 * sharing one and serializing every suite behind a global lock.
 */
function workerDatabaseName(): string {
  const worker = process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? '1';
  return `orbit_test_${worker.replace(/\W/g, '_')}`;
}

function connectionStringFor(databaseName: string): string {
  const url = new URL(baseConnectionString());
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function maintenanceConnectionString(): string {
  return connectionStringFor('postgres');
}

async function recreateWorkerDatabase(databaseName: string): Promise<void> {
  const client = new pg.Client({ connectionString: maintenanceConnectionString() });
  await client.connect();

  try {
    // A leftover database from an interrupted run would carry an outdated
    // schema, so each process starts from a freshly migrated one.
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await client.end();
  }
}

export interface TestDatabase {
  readonly db: PlanningDatabase;
  readonly connectionString: string;
  truncateAll(): Promise<void>;
}

let sharedDatabase: Promise<TestDatabase> | undefined;

async function openTestDatabase(): Promise<TestDatabase> {
  const databaseName = workerDatabaseName();
  await recreateWorkerDatabase(databaseName);

  const connectionString = connectionStringFor(databaseName);
  const handle = createPlanningDatabase({ connectionString, maxConnections: 8 });
  await runMigrations(handle.db);

  const truncateStatement = `TRUNCATE TABLE ${DATABASE_TABLE_NAMES.map(
    (table) => `"${table}"`,
  ).join(', ')} RESTART IDENTITY CASCADE`;

  return {
    db: handle.db,
    connectionString,
    async truncateAll(): Promise<void> {
      await handle.pool.query(truncateStatement);
    },
  };
}

/** One migrated database per Vitest worker, created on first use. */
export function useTestDatabase(): Promise<TestDatabase> {
  sharedDatabase ??= openTestDatabase();
  return sharedDatabase;
}

export interface ScratchDatabase {
  readonly db: PlanningDatabase;
  destroy(): Promise<void>;
}

/**
 * An empty, unmigrated database. Only the migration suite needs one: every
 * other suite runs against the already-migrated per-worker database.
 */
export async function createScratchDatabase(label: string): Promise<ScratchDatabase> {
  const databaseName = `${workerDatabaseName()}_${label.replace(/\W/g, '_')}`;
  await recreateWorkerDatabase(databaseName);

  const handle = createPlanningDatabase({
    connectionString: connectionStringFor(databaseName),
    maxConnections: 2,
  });

  return {
    db: handle.db,
    destroy: () => handle.destroy(),
  };
}
