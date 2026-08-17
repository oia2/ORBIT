import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { creationSequence, durationMinutes, revision } from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import {
  createScratchDatabase,
  useTestDatabase,
  type ScratchDatabase,
  type TestDatabase,
} from '../../test-support/database';
import { DATABASE_TABLE_NAMES } from '../schema';
import { createMigrator, MIGRATIONS, runMigrations } from './index';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const NOW = instant('2026-08-11T08:00:00.000Z');

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_OCCURRENCE_ID = '00000000-0000-4000-8000-000000000002';
const ENTRY_ID = '00000000-0000-4000-8000-000000000101';
const SECOND_ENTRY_ID = '00000000-0000-4000-8000-000000000102';
const DEFINITION_ID = '00000000-0000-4000-8000-000000000201';
const HABIT_ID = '00000000-0000-4000-8000-000000000301';
const SECOND_HABIT_ID = '00000000-0000-4000-8000-000000000302';

const PLANNED_SNAPSHOT = JSON.stringify({
  title: 'Task',
  plannedDurationMinutes: durationMinutes(30),
});

describe('initial schema migration', () => {
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createScratchDatabase('migrations');
  });

  afterAll(async () => {
    await scratch.destroy();
  });

  it('applies every migration to an empty database and creates all eight tables', async () => {
    const results = await runMigrations(scratch.db);

    expect(results.results?.map((result) => result.migrationName)).toEqual(Object.keys(MIGRATIONS));
    expect(results.results?.every((result) => result.status === 'Success')).toBe(true);

    const { rows } = await sql<{ readonly table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `.execute(scratch.db);
    const tableNames = rows.map((row) => row.table_name);

    for (const table of DATABASE_TABLE_NAMES) {
      expect(tableNames).toContain(table);
    }
  });

  it('is idempotent: a second run applies nothing and leaves the schema intact', async () => {
    const repeated = await runMigrations(scratch.db);

    expect(repeated.results).toEqual([]);

    const applied = await createMigrator(scratch.db).getMigrations();
    expect(applied.filter((migration) => migration.executedAt !== undefined)).toHaveLength(
      Object.keys(MIGRATIONS).length,
    );
  });
});

describe('schema constraints', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await useTestDatabase();
  });

  beforeEach(async () => {
    await database.truncateAll();
  });

  afterEach(async () => {
    await database.truncateAll();
  });

  async function seedWeekAndDays(): Promise<void> {
    await database.db
      .insertInto('weeks')
      .values({
        start_date: MONDAY,
        status: 'open',
        goals: JSON.stringify([]),
        reflection: null,
        completion_snapshot: null,
        completed_at: null,
        revision: revision(0),
      })
      .execute();
    await database.db
      .insertInto('days')
      .values([
        {
          date: MONDAY,
          week_start: MONDAY,
          status: 'open',
          state: null,
          closure_snapshot: null,
          closed_at: null,
          revision: revision(0),
        },
        {
          date: TUESDAY,
          week_start: MONDAY,
          status: 'open',
          state: null,
          closure_snapshot: null,
          closed_at: null,
          revision: revision(0),
        },
      ])
      .execute();
  }

  async function seedDatedOccurrence(id: string): Promise<void> {
    await database.db
      .insertInto('task_occurrences')
      .values({
        id: id as never,
        series_id: null,
        nominal_date: null,
        rule_revision: null,
        title: 'Task',
        notes: null,
        start_time: null,
        end_time: null,
        is_exception: false,
        created_sequence: creationSequence(1),
        state: 'active',
        placement_kind: 'day',
        placement_date: TUESDAY,
        planned_duration_minutes: durationMinutes(30),
        completion: 'incomplete',
        actual_completed_at: null,
        day_position: null,
        revision: revision(0),
      })
      .execute();
  }

  it('rejects a completed week without its frozen snapshot', async () => {
    await expect(
      database.db
        .insertInto('weeks')
        .values({
          start_date: MONDAY,
          status: 'completed',
          goals: JSON.stringify([]),
          reflection: null,
          completion_snapshot: null,
          completed_at: null,
          revision: revision(1),
        })
        .execute(),
    ).rejects.toThrow(/weeks_completion_check/);
  });

  it('rejects a closed day without its closure snapshot', async () => {
    await seedWeekAndDays();

    await expect(
      database.db
        .updateTable('days')
        .set({ status: 'closed' })
        .where('date', '=', TUESDAY)
        .execute(),
    ).rejects.toThrow(/days_closure_check/);
  });

  it('rejects a day that belongs to no week', async () => {
    await expect(
      database.db
        .insertInto('days')
        .values({
          date: TUESDAY,
          week_start: MONDAY,
          status: 'open',
          state: null,
          closure_snapshot: null,
          closed_at: null,
          revision: revision(0),
        })
        .execute(),
    ).rejects.toThrow(/days_week_start_fkey/);
  });

  it('rejects a duplicate week for the same Monday', async () => {
    await seedWeekAndDays();

    await expect(
      database.db
        .insertInto('weeks')
        .values({
          start_date: MONDAY,
          status: 'open',
          goals: JSON.stringify([]),
          reflection: null,
          completion_snapshot: null,
          completed_at: null,
          revision: revision(0),
        })
        .execute(),
    ).rejects.toThrow(/weeks_pkey/);
  });

  it('rejects a day placement without a date', async () => {
    await seedWeekAndDays();

    await expect(
      database.db
        .insertInto('task_occurrences')
        .values({
          id: OCCURRENCE_ID as never,
          series_id: null,
          nominal_date: null,
          rule_revision: null,
          title: 'Task',
          notes: null,
          start_time: null,
          end_time: null,
          is_exception: false,
          created_sequence: creationSequence(1),
          state: 'active',
          placement_kind: 'day',
          placement_date: null,
          planned_duration_minutes: durationMinutes(30),
          completion: 'incomplete',
          actual_completed_at: null,
          day_position: null,
          revision: revision(0),
        })
        .execute(),
    ).rejects.toThrow(/task_occurrences_placement_date_check/);
  });

  it('rejects a dated active task without a planned duration', async () => {
    await seedWeekAndDays();

    await expect(
      database.db
        .insertInto('task_occurrences')
        .values({
          id: OCCURRENCE_ID as never,
          series_id: null,
          nominal_date: null,
          rule_revision: null,
          title: 'Task',
          notes: null,
          start_time: null,
          end_time: null,
          is_exception: false,
          created_sequence: creationSequence(1),
          state: 'active',
          placement_kind: 'day',
          placement_date: TUESDAY,
          planned_duration_minutes: null,
          completion: 'incomplete',
          actual_completed_at: null,
          day_position: null,
          revision: revision(0),
        })
        .execute(),
    ).rejects.toThrow(/task_occurrences_dated_duration_check/);
  });

  it('rejects a backlog task carrying completion state', async () => {
    await seedWeekAndDays();

    await expect(
      database.db
        .insertInto('task_occurrences')
        .values({
          id: OCCURRENCE_ID as never,
          series_id: null,
          nominal_date: null,
          rule_revision: null,
          title: 'Task',
          notes: null,
          start_time: null,
          end_time: null,
          is_exception: false,
          created_sequence: creationSequence(1),
          state: 'active',
          placement_kind: 'backlog',
          placement_date: null,
          planned_duration_minutes: null,
          completion: 'incomplete',
          actual_completed_at: null,
          day_position: null,
          revision: revision(0),
        })
        .execute(),
    ).rejects.toThrow(/task_occurrences_completion_scope_check/);
  });

  it('rejects a completed task without its completion instant', async () => {
    await seedWeekAndDays();
    await seedDatedOccurrence(OCCURRENCE_ID);

    await expect(
      database.db
        .updateTable('task_occurrences')
        .set({ completion: 'completed' })
        .where('id', '=', OCCURRENCE_ID as never)
        .execute(),
    ).rejects.toThrow(/task_occurrences_completed_at_check/);
  });

  it('rejects a second membership for the same occurrence and date', async () => {
    await seedWeekAndDays();
    await seedDatedOccurrence(OCCURRENCE_ID);
    await database.db
      .insertInto('task_plan_entries')
      .values({
        id: ENTRY_ID as never,
        occurrence_id: OCCURRENCE_ID as never,
        plan_date: TUESDAY,
        week_start: MONDAY,
        planned_snapshot: PLANNED_SNAPSHOT,
        entered_at: NOW,
        finalized_at: null,
        outcome: 'planned',
        destination_kind: null,
        destination_date: null,
      })
      .execute();

    await expect(
      database.db
        .insertInto('task_plan_entries')
        .values({
          id: SECOND_ENTRY_ID as never,
          occurrence_id: OCCURRENCE_ID as never,
          plan_date: TUESDAY,
          week_start: MONDAY,
          planned_snapshot: PLANNED_SNAPSHOT,
          entered_at: NOW,
          finalized_at: null,
          outcome: 'planned',
          destination_kind: null,
          destination_date: null,
        })
        .execute(),
    ).rejects.toThrow(/task_plan_entries_occurrence_date_key/);
  });

  it('rejects a membership whose outcome contradicts its destination', async () => {
    await seedWeekAndDays();
    await seedDatedOccurrence(OCCURRENCE_ID);

    await expect(
      database.db
        .insertInto('task_plan_entries')
        .values({
          id: ENTRY_ID as never,
          occurrence_id: OCCURRENCE_ID as never,
          plan_date: TUESDAY,
          week_start: MONDAY,
          planned_snapshot: PLANNED_SNAPSHOT,
          entered_at: NOW,
          finalized_at: null,
          outcome: 'planned',
          destination_kind: 'day',
          destination_date: MONDAY,
        })
        .execute(),
    ).rejects.toThrow(/task_plan_entries_destination_check/);
  });

  it('rejects a closure move that targets the date being closed', async () => {
    await seedWeekAndDays();
    await seedDatedOccurrence(OCCURRENCE_ID);

    await expect(
      database.db
        .insertInto('task_plan_entries')
        .values({
          id: ENTRY_ID as never,
          occurrence_id: OCCURRENCE_ID as never,
          plan_date: TUESDAY,
          week_start: MONDAY,
          planned_snapshot: PLANNED_SNAPSHOT,
          entered_at: NOW,
          finalized_at: null,
          outcome: 'moved',
          destination_kind: 'day',
          destination_date: TUESDAY,
        })
        .execute(),
    ).rejects.toThrow(/task_plan_entries_destination_date_check/);
  });

  it('rejects a membership for an occurrence that does not exist', async () => {
    await seedWeekAndDays();

    await expect(
      database.db
        .insertInto('task_plan_entries')
        .values({
          id: ENTRY_ID as never,
          occurrence_id: SECOND_OCCURRENCE_ID as never,
          plan_date: TUESDAY,
          week_start: MONDAY,
          planned_snapshot: PLANNED_SNAPSHOT,
          entered_at: NOW,
          finalized_at: null,
          outcome: 'planned',
          destination_kind: null,
          destination_date: null,
        })
        .execute(),
    ).rejects.toThrow(/task_plan_entries_occurrence_id_fkey/);
  });

  it('rejects a second habit occurrence for the same definition and date', async () => {
    await seedWeekAndDays();
    await database.db
      .insertInto('habit_definitions')
      .values({
        id: DEFINITION_ID as never,
        title: 'Habit',
        rule_versions: JSON.stringify([]),
        revision: revision(0),
      })
      .execute();
    await database.db
      .insertInto('habit_occurrences')
      .values({
        id: HABIT_ID as never,
        definition_id: DEFINITION_ID as never,
        date: TUESDAY,
        week_start: MONDAY,
        definition_snapshot: JSON.stringify({ title: 'Habit' }),
        rule_revision: revision(0),
        is_exception: false,
        outcome: 'pending',
        outcome_events: JSON.stringify([]),
        updated_at: NOW,
      })
      .execute();

    await expect(
      database.db
        .insertInto('habit_occurrences')
        .values({
          id: SECOND_HABIT_ID as never,
          definition_id: DEFINITION_ID as never,
          date: TUESDAY,
          week_start: MONDAY,
          definition_snapshot: JSON.stringify({ title: 'Habit' }),
          rule_revision: revision(0),
          is_exception: false,
          outcome: 'pending',
          outcome_events: JSON.stringify([]),
          updated_at: NOW,
        })
        .execute(),
    ).rejects.toThrow(/habit_occurrences_definition_date_key/);
  });

  it('rejects an unknown habit outcome', async () => {
    await seedWeekAndDays();
    await database.db
      .insertInto('habit_definitions')
      .values({
        id: DEFINITION_ID as never,
        title: 'Habit',
        rule_versions: JSON.stringify([]),
        revision: revision(0),
      })
      .execute();

    await expect(
      database.db
        .insertInto('habit_occurrences')
        .values({
          id: HABIT_ID as never,
          definition_id: DEFINITION_ID as never,
          date: TUESDAY,
          week_start: MONDAY,
          definition_snapshot: JSON.stringify({ title: 'Habit' }),
          rule_revision: revision(0),
          is_exception: false,
          outcome: 'skipped' as never,
          outcome_events: JSON.stringify([]),
          updated_at: NOW,
        })
        .execute(),
    ).rejects.toThrow(/habit_occurrences_outcome_check/);
  });

  it('rejects a duplicate audit event id', async () => {
    await seedWeekAndDays();
    await seedDatedOccurrence(OCCURRENCE_ID);
    const event = {
      id: ENTRY_ID as never,
      occurrence_id: OCCURRENCE_ID as never,
      series_id: null,
      effective_date: TUESDAY,
      occurred_at: NOW,
      payload: JSON.stringify({ type: 'closure-keep', payload: { date: TUESDAY } }),
    };

    await database.db
      .insertInto('task_events')
      .values({ ...event, sequence: 1 as never })
      .execute();

    await expect(
      database.db
        .insertInto('task_events')
        .values({ ...event, sequence: 2 as never })
        .execute(),
    ).rejects.toThrow(/task_events_id_key/);
  });
});
