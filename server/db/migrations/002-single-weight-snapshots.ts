import { sql } from 'kysely';
import type { Migration } from 'kysely/migration';

import type { AnyKysely } from './any-kysely';

/**
 * Rescales every frozen result to the single-weight rule (003 FR-021).
 *
 * Feature 003 replaced the fixed 70/30 task/habit split with one weight per
 * item. Closed days and completed weeks hold their result as a frozen `jsonb`
 * snapshot, so without this migration the history would read on two different
 * scales at once — and every pre-003 snapshot would keep claiming
 * `weightsApplied: {task: 70, habit: 30}`, a weighting that no longer exists.
 *
 * What it rewrites, in place:
 *   - `days.closure_snapshot   -> score.value`    recomputed
 *   - `weeks.completion_snapshot -> progress.value` recomputed
 *   - the `weightsApplied` key removed from both
 *
 * What it must not touch: every `completed`, `applicable`, and `rate` under
 * `task` and `habit`; `plannedLoadMinutes`; `closed_at`; `completed_at`;
 * `revision`; and every other table. No row is inserted or deleted, no period
 * is reopened, and no audit event is written.
 *
 * The new value is derived **only from counts the snapshot already holds**, so
 * it cannot disagree with what the period actually recorded and cannot fail on
 * history whose underlying entries have since moved:
 *
 *     denominator = task.applicable + habit.applicable
 *     value       = denominator = 0
 *                     ? 'unavailable'
 *                     : round((task.completed + habit.completed) / denominator * 100)
 *
 * `ROUND(x)` in PostgreSQL rounds halves away from zero on `numeric`, which for
 * these non-negative values is the same half-up rule `roundHalfUp` applies in
 * `scoring.ts`. Both sides therefore agree on an exact .5.
 *
 * Idempotent: a snapshot that has already lost `weightsApplied` recomputes to
 * the same value and stays without the key, so re-running — which a redeploy
 * does — changes nothing.
 */
export const singleWeightSnapshots: Migration = {
  async up(db: AnyKysely): Promise<void> {
    await sql`
      UPDATE days
      SET closure_snapshot = jsonb_set(
        closure_snapshot,
        '{score}',
        (closure_snapshot -> 'score') - 'weightsApplied' || jsonb_build_object(
          'value',
          CASE
            WHEN COALESCE((closure_snapshot -> 'score' -> 'task' ->> 'applicable')::int, 0)
               + COALESCE((closure_snapshot -> 'score' -> 'habit' ->> 'applicable')::int, 0) = 0
            THEN to_jsonb('unavailable'::text)
            ELSE to_jsonb(ROUND(
              100.0 * (
                COALESCE((closure_snapshot -> 'score' -> 'task' ->> 'completed')::int, 0)
              + COALESCE((closure_snapshot -> 'score' -> 'habit' ->> 'completed')::int, 0)
              ) / (
                COALESCE((closure_snapshot -> 'score' -> 'task' ->> 'applicable')::int, 0)
              + COALESCE((closure_snapshot -> 'score' -> 'habit' ->> 'applicable')::int, 0)
              )
            )::int)
          END
        )
      )
      WHERE closure_snapshot IS NOT NULL
    `.execute(db);

    await sql`
      UPDATE weeks
      SET completion_snapshot = jsonb_set(
        completion_snapshot,
        '{progress}',
        (completion_snapshot -> 'progress') - 'weightsApplied' || jsonb_build_object(
          'value',
          CASE
            WHEN COALESCE((completion_snapshot -> 'progress' -> 'task' ->> 'applicable')::int, 0)
               + COALESCE((completion_snapshot -> 'progress' -> 'habit' ->> 'applicable')::int, 0) = 0
            THEN to_jsonb('unavailable'::text)
            ELSE to_jsonb(ROUND(
              100.0 * (
                COALESCE((completion_snapshot -> 'progress' -> 'task' ->> 'completed')::int, 0)
              + COALESCE((completion_snapshot -> 'progress' -> 'habit' ->> 'completed')::int, 0)
              ) / (
                COALESCE((completion_snapshot -> 'progress' -> 'task' ->> 'applicable')::int, 0)
              + COALESCE((completion_snapshot -> 'progress' -> 'habit' ->> 'applicable')::int, 0)
              )
            )::int)
          END
        )
      )
      WHERE completion_snapshot IS NOT NULL
    `.execute(db);
  },

  /*
   * Deliberately not reversible. Down would have to restore a 70/30 value that
   * the single-weight rule cannot express, and every count needed to recompute
   * it is still present — so the honest rollback is a restore from the backup
   * the upgrade procedure requires (`npm run db:restore`).
   */
};
