import { sql } from 'kysely';
import type { Migration } from 'kysely/migration';

import type { AnyKysely } from './any-kysely';

/**
 * The relational projection of feature 001's entities, exactly as specified in
 * `specs/002-server-backed-persistence/data-model.md`.
 *
 * The constraints here are not decoration. Several invariants that were
 * application conventions under IndexedDB become structural: notably
 * `UNIQUE (occurrence_id, plan_date)`, which is what makes an A -> B -> A move
 * reuse one membership and keeps a scoring denominator from inflating
 * (001 FR-027, FR-048).
 */
export const initialSchema: Migration = {
  async up(db: AnyKysely): Promise<void> {
    await sql`
      CREATE TABLE weeks (
        start_date          date PRIMARY KEY,
        status              text NOT NULL,
        goals               jsonb NOT NULL DEFAULT '[]'::jsonb,
        reflection          text,
        completion_snapshot jsonb,
        completed_at        timestamptz,
        revision            integer NOT NULL,
        CONSTRAINT weeks_status_check CHECK (status IN ('open', 'completed')),
        CONSTRAINT weeks_revision_check CHECK (revision >= 0),
        CONSTRAINT weeks_completion_check CHECK (
          (status = 'completed') =
          (completion_snapshot IS NOT NULL AND completed_at IS NOT NULL)
        )
      )
    `.execute(db);

    await sql`
      CREATE TABLE days (
        date             date PRIMARY KEY,
        week_start       date NOT NULL REFERENCES weeks (start_date),
        status           text NOT NULL,
        state            jsonb,
        closure_snapshot jsonb,
        closed_at        timestamptz,
        revision         integer NOT NULL,
        CONSTRAINT days_status_check CHECK (status IN ('open', 'closed')),
        CONSTRAINT days_revision_check CHECK (revision >= 0),
        CONSTRAINT days_closure_check CHECK (
          (status = 'closed') = (closure_snapshot IS NOT NULL AND closed_at IS NOT NULL)
        )
      )
    `.execute(db);

    await sql`CREATE INDEX days_week_start_idx ON days (week_start)`.execute(db);

    await sql`
      CREATE TABLE task_series (
        id            text PRIMARY KEY,
        template      jsonb NOT NULL,
        rule_versions jsonb NOT NULL,
        revision      integer NOT NULL,
        CONSTRAINT task_series_revision_check CHECK (revision >= 0)
      )
    `.execute(db);

    await sql`
      CREATE TABLE task_occurrences (
        id                       text PRIMARY KEY,
        series_id                text REFERENCES task_series (id),
        nominal_date             date,
        rule_revision            integer,
        title                    text NOT NULL,
        notes                    text,
        start_time               text,
        end_time                 text,
        is_exception             boolean NOT NULL,
        created_sequence         bigint NOT NULL,
        state                    text NOT NULL,
        placement_kind           text NOT NULL,
        placement_date           date,
        planned_duration_minutes integer,
        completion               text,
        actual_completed_at      timestamptz,
        day_position             integer,
        revision                 integer NOT NULL,
        CONSTRAINT task_occurrences_state_check
          CHECK (state IN ('active', 'finalized', 'deleted')),
        CONSTRAINT task_occurrences_placement_kind_check
          CHECK (placement_kind IN ('day', 'backlog', 'none')),
        CONSTRAINT task_occurrences_completion_value_check
          CHECK (completion IS NULL OR completion IN ('incomplete', 'completed')),
        CONSTRAINT task_occurrences_revision_check CHECK (revision >= 0),
        CONSTRAINT task_occurrences_created_sequence_check CHECK (created_sequence > 0),
        CONSTRAINT task_occurrences_day_position_check
          CHECK (day_position IS NULL OR day_position >= 0),
        CONSTRAINT task_occurrences_duration_check
          CHECK (planned_duration_minutes IS NULL OR planned_duration_minutes > 0),
        -- A day placement carries its date; every other placement carries none.
        CONSTRAINT task_occurrences_placement_date_check
          CHECK ((placement_kind = 'day') = (placement_date IS NOT NULL)),
        -- Backlog tasks have no completion control (001 FR-010).
        CONSTRAINT task_occurrences_completion_scope_check
          CHECK (completion IS NULL OR (state = 'active' AND placement_kind = 'day')),
        -- Every dated active task has a positive planned duration (001 FR-005).
        CONSTRAINT task_occurrences_dated_duration_check
          CHECK (
            NOT (placement_kind = 'day' AND state = 'active')
            OR planned_duration_minutes IS NOT NULL
          ),
        CONSTRAINT task_occurrences_completed_at_check
          CHECK (
            (completion IS NOT DISTINCT FROM 'completed') = (actual_completed_at IS NOT NULL)
          )
      )
    `.execute(db);

    await sql`
      CREATE INDEX task_occurrences_day_order_idx
        ON task_occurrences (placement_kind, placement_date, day_position, created_sequence)
    `.execute(db);
    await sql`
      CREATE INDEX task_occurrences_placement_created_idx
        ON task_occurrences (placement_kind, created_sequence)
    `.execute(db);
    await sql`
      CREATE INDEX task_occurrences_series_date_idx ON task_occurrences (series_id, nominal_date)
    `.execute(db);

    await sql`
      CREATE TABLE task_plan_entries (
        id               text PRIMARY KEY,
        occurrence_id    text NOT NULL REFERENCES task_occurrences (id),
        plan_date        date NOT NULL,
        week_start       date NOT NULL REFERENCES weeks (start_date),
        planned_snapshot jsonb NOT NULL,
        entered_at       timestamptz NOT NULL,
        finalized_at     timestamptz,
        outcome          text NOT NULL,
        destination_kind text,
        destination_date date,
        CONSTRAINT task_plan_entries_outcome_check CHECK (
          outcome IN (
            'planned', 'completed', 'moved', 'backlogged',
            'canceled', 'kept-unfinished', 'deleted'
          )
        ),
        -- Only moved and backlogged carry a destination, and each carries its own kind.
        CONSTRAINT task_plan_entries_destination_check CHECK (
          (outcome = 'moved' AND destination_kind = 'day' AND destination_date IS NOT NULL) OR
          (outcome = 'backlogged' AND destination_kind = 'backlog' AND destination_date IS NULL) OR
          (
            outcome NOT IN ('moved', 'backlogged')
            AND destination_kind IS NULL
            AND destination_date IS NULL
          )
        ),
        -- 001 FR-040: a closure move must target a date other than the one being closed.
        CONSTRAINT task_plan_entries_destination_date_check
          CHECK (destination_date IS NULL OR destination_date <> plan_date),
        -- 001 FR-027, FR-048: at most one membership per occurrence per local date.
        CONSTRAINT task_plan_entries_occurrence_date_key UNIQUE (occurrence_id, plan_date)
      )
    `.execute(db);

    await sql`CREATE INDEX task_plan_entries_plan_date_idx ON task_plan_entries (plan_date)`.execute(
      db,
    );
    await sql`
      CREATE INDEX task_plan_entries_week_start_idx ON task_plan_entries (week_start)
    `.execute(db);

    await sql`
      CREATE TABLE task_events (
        sequence       bigint PRIMARY KEY,
        id             text NOT NULL UNIQUE,
        occurrence_id  text REFERENCES task_occurrences (id),
        series_id      text REFERENCES task_series (id),
        effective_date date,
        occurred_at    timestamptz NOT NULL,
        payload        jsonb NOT NULL,
        CONSTRAINT task_events_sequence_check CHECK (sequence > 0)
      )
    `.execute(db);

    await sql`
      CREATE INDEX task_events_occurrence_idx ON task_events (occurrence_id, sequence)
    `.execute(db);
    await sql`CREATE INDEX task_events_series_idx ON task_events (series_id, sequence)`.execute(db);
    await sql`
      CREATE INDEX task_events_effective_date_idx ON task_events (effective_date, sequence)
    `.execute(db);

    await sql`
      CREATE TABLE habit_definitions (
        id            text PRIMARY KEY,
        title         text NOT NULL,
        rule_versions jsonb NOT NULL,
        revision      integer NOT NULL,
        CONSTRAINT habit_definitions_revision_check CHECK (revision >= 0)
      )
    `.execute(db);

    await sql`
      CREATE TABLE habit_occurrences (
        id                  text PRIMARY KEY,
        definition_id       text NOT NULL REFERENCES habit_definitions (id),
        date                date NOT NULL,
        week_start          date NOT NULL REFERENCES weeks (start_date),
        definition_snapshot jsonb NOT NULL,
        rule_revision       integer NOT NULL,
        is_exception        boolean NOT NULL,
        outcome             text NOT NULL,
        outcome_events      jsonb NOT NULL,
        updated_at          timestamptz NOT NULL,
        CONSTRAINT habit_occurrences_outcome_check
          CHECK (outcome IN ('pending', 'completed', 'not-completed', 'deleted')),
        CONSTRAINT habit_occurrences_rule_revision_check CHECK (rule_revision >= 0),
        -- One occurrence per habit per date (001 FR-016).
        CONSTRAINT habit_occurrences_definition_date_key UNIQUE (definition_id, date)
      )
    `.execute(db);

    await sql`CREATE INDEX habit_occurrences_date_idx ON habit_occurrences (date)`.execute(db);
    await sql`
      CREATE INDEX habit_occurrences_week_start_idx ON habit_occurrences (week_start)
    `.execute(db);
  },

  async down(db: AnyKysely): Promise<void> {
    await sql`DROP TABLE IF EXISTS habit_occurrences`.execute(db);
    await sql`DROP TABLE IF EXISTS habit_definitions`.execute(db);
    await sql`DROP TABLE IF EXISTS task_events`.execute(db);
    await sql`DROP TABLE IF EXISTS task_plan_entries`.execute(db);
    await sql`DROP TABLE IF EXISTS task_occurrences`.execute(db);
    await sql`DROP TABLE IF EXISTS task_series`.execute(db);
    await sql`DROP TABLE IF EXISTS days`.execute(db);
    await sql`DROP TABLE IF EXISTS weeks`.execute(db);
  },
};
