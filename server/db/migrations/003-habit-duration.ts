import { sql } from 'kysely';
import type { Migration } from 'kysely/migration';

import type { AnyKysely } from './any-kysely';

/**
 * Gives a habit an optional duration (003 FR-029).
 *
 * Purely additive: the column is nullable with no default and no backfill, so
 * every existing habit keeps no duration and therefore contributes nothing to
 * planned load — which is exactly what 003 FR-031 requires of an untouched
 * installation.
 *
 * The `CHECK` mirrors the domain's `DurationMinutes` brand (a positive
 * integer). Every existing row satisfies it because every existing row is NULL.
 *
 * The per-occurrence copy needs no schema change:
 * `habit_occurrences.definition_snapshot` is `jsonb`, and a snapshot written
 * before 003 simply has no `durationMinutes` key, which deserializes to
 * `undefined` — the correct reading of "no duration".
 */
export const habitDuration: Migration = {
  async up(db: AnyKysely): Promise<void> {
    await sql`
      ALTER TABLE habit_definitions
      ADD COLUMN duration_minutes integer,
      ADD CONSTRAINT habit_definitions_duration_check
        CHECK (duration_minutes IS NULL OR duration_minutes > 0)
    `.execute(db);
  },

  async down(db: AnyKysely): Promise<void> {
    await sql`
      ALTER TABLE habit_definitions
      DROP CONSTRAINT habit_definitions_duration_check,
      DROP COLUMN duration_minutes
    `.execute(db);
  },
};
