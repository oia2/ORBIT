import { Migrator, type Migration, type MigrationResultSet } from 'kysely/migration';

import { initialSchema } from './001-initial-schema';
import type { AnyKysely } from './any-kysely';

export type { AnyKysely };

/**
 * A static map rather than Kysely's `FileMigrationProvider` (research
 * Decision 10): the server ships as a bundle, so reading migration files from
 * disk at runtime would work in development and fail in the container.
 */
export const MIGRATIONS: Readonly<Record<string, Migration>> = Object.freeze({
  '001-initial-schema': initialSchema,
});

export function createMigrator(db: AnyKysely): Migrator {
  return new Migrator({
    db,
    provider: {
      getMigrations: () => Promise.resolve({ ...MIGRATIONS }),
    },
  });
}

/**
 * Applies every pending migration, throwing on the first failure so a server
 * never starts serving requests against a half-migrated schema (FR-019).
 */
export async function runMigrations(db: AnyKysely): Promise<MigrationResultSet> {
  const results = await createMigrator(db).migrateToLatest();

  if (results.error !== undefined) {
    throw results.error instanceof Error
      ? results.error
      : new Error(`Migration failed: ${JSON.stringify(results.error)}`);
  }

  return results;
}
