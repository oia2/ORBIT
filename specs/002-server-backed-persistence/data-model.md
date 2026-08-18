# Phase 1 Data Model: ORBIT Server-Backed Persistence

**Feature**: `002-server-backed-persistence` | **Date**: 2026-08-17

## Scope of this document

This feature introduces **no new entities and no new fields**. The entities are exactly
those defined by feature 001 and implemented in `src/entities/planning/model/`. This
document specifies how those existing TypeScript types are stored in PostgreSQL.

The domain types remain the source of truth. Where this document and
`src/entities/planning/model/*.ts` disagree, the TypeScript types win and this document is
wrong.

## Storage rule

Per research Decision 6:

- **Columns** for identity, foreign keys, dates, status, ordering, revisions, and anything
  that carries an invariant or is queried.
- **`jsonb`** for nested value objects that are always read and written together with their
  parent and are never queried independently.

## Conventions

| Domain type | PostgreSQL type | Notes |
| ----------- | --------------- | ----- |
| `LocalDate` | `date` | Branded `YYYY-MM-DD`. Read back as a string, never as a JS `Date`, to avoid timezone reinterpretation. |
| `Instant` | `timestamptz` | Branded canonical UTC ISO string. Serialized back to the exact `.sssZ` form the brand requires. |
| `Revision` | `integer` | Optimistic concurrency token. |
| `*Id` | `text` | Branded UUID strings. |
| `DurationMinutes` | `integer` | Positive. |
| `NonNegativeDurationMinutes` | `integer` | `>= 0`. |
| `CreationSequence` | `bigint` | Monotonic and gap-free; allocated as `MAX + 1` inside the command transaction — see [Sequences](#sequences). |
| `DayPosition` | `integer` | Ordering within a day. |
| Optional (`?`) field | `NULL`able column | `undefined` ⇄ `NULL`. |

**Critical mapping constraint**: the `pg` driver must be configured to return `date` and
`timestamptz` as strings, not JS `Date` objects. Feature 001's `LocalDate` and `Instant` are
branded strings with exact format validators; converting through `Date` would reintroduce
the timezone dependency FR-009 forbids.

## Tables

### `weeks`

The fixed Monday–Sunday calendar week (001 FR-001). Maps `Week = OpenWeek | CompletedWeek`.

| Column | Type | Constraints | Domain field |
| ------ | ---- | ----------- | ------------ |
| `start_date` | `date` | **PK** | `startDate` (the Monday) |
| `status` | `text` | `NOT NULL`, `CHECK IN ('open','completed')` | `status` |
| `goals` | `jsonb` | `NOT NULL`, default `'[]'` | `goals: WeeklyGoal[]`, order-significant |
| `reflection` | `text` | `NULL` | `reflection` |
| `completion_snapshot` | `jsonb` | `NULL` | `completionSnapshot` (completed only) |
| `completed_at` | `timestamptz` | `NULL` | `completedAt` (completed only) |
| `revision` | `integer` | `NOT NULL` | `revision` |

- `CHECK`: `status = 'completed'` ⟺ `completion_snapshot IS NOT NULL AND completed_at IS NOT NULL`.
- The primary key on the Monday date is what makes overlapping or duplicate weeks
  unrepresentable — 001 FR-001 enforced structurally.
- `goals` is a JSON array of `{ id, statement, createdAt, updatedAt }`. Array order **is**
  goal order (001 FR-002 reorder). Guarded as a unit by `weeks.revision`.

### `days`

A dated planning period belonging to exactly one week. Maps `Day = OpenDay | ClosedDay`.

| Column | Type | Constraints | Domain field |
| ------ | ---- | ----------- | ------------ |
| `date` | `date` | **PK** | `date` |
| `week_start` | `date` | `NOT NULL`, **FK** → `weeks.start_date` | `weekStart` |
| `status` | `text` | `NOT NULL`, `CHECK IN ('open','closed')` | `status` |
| `state` | `jsonb` | `NULL` | `state: DailyStateEntry` |
| `closure_snapshot` | `jsonb` | `NULL` | `closureSnapshot` (closed only) |
| `closed_at` | `timestamptz` | `NULL` | `closedAt` (closed only) |
| `revision` | `integer` | `NOT NULL` | `revision` |

- Index on `week_start` (replaces the `by-weekStart` IndexedDB index).
- `CHECK`: `status = 'closed'` ⟺ `closure_snapshot IS NOT NULL AND closed_at IS NOT NULL`.
- The FK guarantees every day belongs to exactly one week (001 FR-001).
- `state` holds `{ energy?, mood?, sleepDurationMinutes?, updatedAt }`. Stored whole because
  001 FR-025 makes it context only — never queried or aggregated.
- `closure_snapshot` holds `{ score: ScoreBreakdown, plannedLoadMinutes }`, the immutable
  record required by 001 FR-037 and FR-042.

### `task_series`

A recurring task definition and its rule version history.

| Column | Type | Constraints | Domain field |
| ------ | ---- | ----------- | ------------ |
| `id` | `text` | **PK** | `id` |
| `template` | `jsonb` | `NOT NULL` | `template: TaskTemplate` |
| `rule_versions` | `jsonb` | `NOT NULL` | `ruleVersions: RecurrenceRuleVersion[]` |
| `revision` | `integer` | `NOT NULL` | `revision` |

- `rule_versions` is an append-only ordered array of
  `{ revision, effectiveFrom, effectiveThrough?, state, rule? }`. This array is where 001
  FR-019's "only the final same-day rule becomes the effective version" is realised; it is
  always loaded and rewritten with its series, so it is stored whole.

### `task_occurrences`

A logical task instance whose identity survives movement. Maps the five-variant
`TaskOccurrence` union.

| Column | Type | Constraints | Domain field |
| ------ | ---- | ----------- | ------------ |
| `id` | `text` | **PK** | `id` |
| `series_id` | `text` | `NULL`, **FK** → `task_series.id` | `seriesId` |
| `nominal_date` | `date` | `NULL` | `nominalDate` |
| `rule_revision` | `integer` | `NULL` | `ruleRevision` |
| `title` | `text` | `NOT NULL` | `title` |
| `notes` | `text` | `NULL` | `notes` |
| `start_time` | `text` | `NULL` | `startTime` — `HH:MM` (001 FR-015a) |
| `end_time` | `text` | `NULL` | `endTime` (001 FR-015a) |
| `is_exception` | `boolean` | `NOT NULL` | `isException` |
| `created_sequence` | `bigint` | `NOT NULL` | `createdSequence` |
| `state` | `text` | `NOT NULL`, `CHECK IN ('active','finalized','deleted')` | `state` |
| `placement_kind` | `text` | `NOT NULL`, `CHECK IN ('day','backlog','none')` | `placement.kind` |
| `placement_date` | `date` | `NULL` | `placement.date` (day placement only) |
| `planned_duration_minutes` | `integer` | `NULL` | `plannedDurationMinutes` |
| `completion` | `text` | `NULL`, `CHECK IN ('incomplete','completed')` | `completion` (dated active only) |
| `actual_completed_at` | `timestamptz` | `NULL` | `actualCompletedAt` |
| `day_position` | `integer` | `NULL` | `dayPosition` |
| `revision` | `integer` | `NOT NULL` | `revision` |

- Indexes: `(placement_kind, placement_date, day_position, created_sequence)` for a day's
  ordered task list; `(placement_kind, created_sequence)` for backlog's creation order,
  oldest first (001 FR-010); `(series_id, nominal_date)` for recurrence materialization.
- These two columns replace the IndexedDB adapter's synthetic `placementKey` string, which
  001 explicitly kept internal to the adapter. It does not survive the migration.
- `CHECK`: `placement_kind = 'day'` ⟺ `placement_date IS NOT NULL`.
- `CHECK`: `completion IS NOT NULL` only when `state = 'active' AND placement_kind = 'day'`
  — backlog tasks have no completion control (001 FR-010).
- `CHECK`: `placement_kind = 'day' AND state = 'active'` ⟹ `planned_duration_minutes IS NOT NULL`
  (001 FR-005: every dated task has a positive planned duration).
- `CHECK`: `completion = 'completed'` ⟺ `actual_completed_at IS NOT NULL`.
- `state = 'deleted'` is a tombstone, not a row deletion — 001 FR-030 and FR-051 require
  deletion to stay explainable in history.

### `task_plan_entries`

The historical and scoring membership of one occurrence on one date. **The most
constraint-critical table in the schema.**

| Column | Type | Constraints | Domain field |
| ------ | ---- | ----------- | ------------ |
| `id` | `text` | **PK** | `id` |
| `occurrence_id` | `text` | `NOT NULL`, **FK** → `task_occurrences.id` | `occurrenceId` |
| `plan_date` | `date` | `NOT NULL` | `date` |
| `week_start` | `date` | `NOT NULL`, **FK** → `weeks.start_date` | `weekStart` |
| `planned_snapshot` | `jsonb` | `NOT NULL` | `plannedSnapshot` |
| `entered_at` | `timestamptz` | `NOT NULL` | `enteredAt` |
| `finalized_at` | `timestamptz` | `NULL` | `finalizedAt` |
| `outcome` | `text` | `NOT NULL`, `CHECK` (see below) | `outcome` |
| `destination_kind` | `text` | `NULL`, `CHECK IN ('day','backlog')` | `destination.kind` |
| `destination_date` | `date` | `NULL` | `destination.date` |

#### Outcome and destination

`TaskPlanEntry` is a seven-variant discriminated union (`src/entities/planning/model/task.ts`).
The `outcome` column is its discriminant:

```sql
CHECK (outcome IN ('planned','completed','moved','backlogged','canceled','kept-unfinished','deleted'))
```

Only two variants carry a `destination`, and they carry different placement types:

| Outcome | Domain variant | `destination` |
| ------- | -------------- | ------------- |
| `planned` | `PlannedTaskPlanEntry` | none |
| `completed` | `CompletedTaskPlanEntry` | none |
| `moved` | `MovedTaskPlanEntry` | `DayTaskPlacement` — carries a date |
| `backlogged` | `BackloggedTaskPlanEntry` | `BacklogTaskPlacement` — no payload |
| `canceled` | `CanceledTaskPlanEntry` | none |
| `kept-unfinished` | `KeptUnfinishedTaskPlanEntry` | none |
| `deleted` | `DeletedTaskPlanEntry` | none |

`destination_kind` stores the placement discriminant that already exists in the domain, so
`moved` and `backlogged` are distinguishable in storage without inferring either from the
outcome. `BacklogTaskPlacement` has no fields beyond its `kind`, which is why `backlogged`
leaves `destination_date` null rather than gaining a column the domain does not have.

Two `CHECK` constraints make a row that contradicts its own outcome unrepresentable:

```sql
-- Only moved and backlogged may carry a destination, and each carries its own kind.
CHECK (
  (outcome = 'moved'      AND destination_kind = 'day'     AND destination_date IS NOT NULL) OR
  (outcome = 'backlogged' AND destination_kind = 'backlog' AND destination_date IS NULL)     OR
  (outcome NOT IN ('moved','backlogged') AND destination_kind IS NULL AND destination_date IS NULL)
)

-- 001 FR-040: a closure move must target a date other than the one being closed.
CHECK (destination_date IS NULL OR destination_date <> plan_date)
```

The second constraint puts 001 FR-040's "a selected move date MUST differ from the date being
closed" into the schema. It is also enforced in domain code, which owns the richer rule (the
destination must additionally be a valid *open* day — a condition depending on other rows and
on the request clock, so it cannot live in a `CHECK`).

**No constraint ties `finalized_at` to `outcome`.** A membership finalizes at day closure
(001 FR-035), so a `completed` entry on a still-open day is legitimately completed and not yet
finalized. Requiring `finalized_at` for every non-`planned` outcome would contradict that.

- **`UNIQUE (occurrence_id, plan_date)`** — this single constraint enforces 001 FR-027 and
  FR-048: at most one membership per logical occurrence per local date, so an A → B → A move
  reuses the existing membership and denominators can never inflate. Making this a database
  invariant rather than an application convention is the main argument for the relational
  schema (research Decision 6).
- Indexes on `plan_date` and `week_start` for daily and weekly scoring aggregation.
- `planned_snapshot` captures the plan as committed, so later edits cannot rewrite history
  (001 FR-007, FR-051).

### `task_events`

The append-only audit trail behind 001 FR-012 and FR-051.

| Column | Type | Constraints | Domain field |
| ------ | ---- | ----------- | ------------ |
| `sequence` | `bigint` | **PK**, allocated `MAX + 1` in-transaction | ordering key |
| `id` | `text` | `NOT NULL`, `UNIQUE` | `id` |
| `occurrence_id` | `text` | `NULL`, **FK** → `task_occurrences.id` | |
| `series_id` | `text` | `NULL`, **FK** → `task_series.id` | |
| `effective_date` | `date` | `NULL` | |
| `occurred_at` | `timestamptz` | `NOT NULL` | |
| `payload` | `jsonb` | `NOT NULL` | the discriminated event body |

- Indexes: `(occurrence_id, sequence)`, `(series_id, sequence)`, `(effective_date, sequence)`
  — mirroring the existing IndexedDB indexes.
- `sequence` is the ordering authority, derived from the stored rows rather than from the
  clock. Audit ordering therefore does **not** depend on `occurred_at`, so a client device
  clock that moves backwards cannot reorder history (research Decision 5).
- Insert-only. Nothing updates or deletes a row here.

### `habit_definitions`

| Column | Type | Constraints | Domain field |
| ------ | ---- | ----------- | ------------ |
| `id` | `text` | **PK** | `id` |
| `title` | `text` | `NOT NULL` | `title` |
| `rule_versions` | `jsonb` | `NOT NULL` | `ruleVersions` |
| `revision` | `integer` | `NOT NULL` | `revision` |

- Habit rules carry no user-entered start or end date (001 FR-015 as amended 2026-08-16).
  The assigned `startDate` lives inside the stored rule and must be preserved unchanged when
  a rule is edited.

### `habit_occurrences`

| Column | Type | Constraints | Domain field |
| ------ | ---- | ----------- | ------------ |
| `id` | `text` | **PK** | `id` |
| `definition_id` | `text` | `NOT NULL`, **FK** → `habit_definitions.id` | `definitionId` |
| `date` | `date` | `NOT NULL` | `date` |
| `week_start` | `date` | `NOT NULL`, **FK** → `weeks.start_date` | `weekStart` |
| `definition_snapshot` | `jsonb` | `NOT NULL` | `definitionSnapshot` |
| `rule_revision` | `integer` | `NOT NULL` | `ruleRevision` |
| `is_exception` | `boolean` | `NOT NULL` | `isException` |
| `outcome` | `text` | `NOT NULL`, `CHECK IN ('pending','completed','not-completed','deleted')` | `outcome` |
| `outcome_events` | `jsonb` | `NOT NULL` | `outcomeEvents` |
| `updated_at` | `timestamptz` | `NOT NULL` | `updatedAt` |

- **`UNIQUE (definition_id, date)`** — one occurrence per habit per date.
- Indexes on `date` and `week_start` for scoring.
- `outcome_events` is the ordered history (by `ordinal`) that 001 FR-020 requires: it must
  retain both an automatic boundary miss and a later explicit correction.

## Sequences

Both ordering keys are **logical sequences allocated as `MAX + 1` inside the command
transaction**, not PostgreSQL `SEQUENCE` objects. The migration creates no sequence objects.

- `task_occurrences.created_sequence` — supplies `createdSequence`, giving backlog its
  stable oldest-first creation order (001 FR-010).
- `task_events.sequence` — the audit ordering key.

An earlier draft of this document declared `task_occurrence_created_sequence` and
`task_event_sequence` as database sequences. That was changed during implementation and the
reasoning is recorded in [traceability.md](./traceability.md) Deviation 1: a PostgreSQL
sequence advances on rollback and therefore produces gaps, while feature 001's suites assert
concrete values (`createdSequence` of `[1, 2]`, event sequences of `[1, 2, 3, 4]`) and the
seeded-scale fixture inserts 1,442 events with explicit sequence values. Using a sequence
object would have meant editing those assertions, which SC-001 forbids.

The property this section protects is unchanged: the ordering key is monotonic, gap-free,
and derived from stored rows rather than from the clock. `server/planning/audit.ts` reads
`MAX` and adds one; both reads happen inside the command transaction that then writes the
row. `task_events.sequence` is the table's primary key, so two commands that raced to the
same value would fail the losing transaction outright rather than record a duplicate —
consistent with FR-007, which requires a failed operation to leave nothing behind.
`task_occurrences.created_sequence` carries `CHECK (created_sequence > 0)` and no uniqueness
constraint; a tie there would leave two backlog rows with equal creation order, which the
`(placement_kind, created_sequence)` index orders arbitrarily between them. Neither case
arises in a single-owner deployment issuing one request at a time (FR-021, FR-022), which is
the deployment model this feature is specified for.

## Invariants enforced by the database

These were application-level conventions under IndexedDB and become structural here. This
is the concrete payoff of the relational schema.

| Invariant | 001 source | Mechanism |
| --------- | ---------- | --------- |
| One membership per occurrence per date | FR-027, FR-048 | `UNIQUE (occurrence_id, plan_date)` |
| One habit occurrence per definition per date | FR-016 | `UNIQUE (definition_id, date)` |
| Every date belongs to exactly one week | FR-001 | FK `days.week_start` → `weeks.start_date` |
| No overlapping or duplicate weeks | FR-001 | PK on `weeks.start_date` |
| A dated active task has a duration | FR-005 | `CHECK` on `task_occurrences` |
| Backlog tasks have no completion state | FR-010 | `CHECK` on `task_occurrences` |
| A closed day carries its snapshot | FR-042 | `CHECK` on `days` |
| A completed week carries its snapshot | FR-045, FR-048 | `CHECK` on `weeks` |
| No orphaned occurrences, entries, or events | — | Foreign keys throughout |

## Invariants that remain in domain code

Not everything belongs in the schema. These stay in the (unchanged) domain layer because
they depend on time, on aggregate state, or on multi-entity reasoning:

- Closure eligibility `date <= currentLocalDate` (FR-039) — depends on the request clock.
- Immutability of closed days and completed weeks (FR-021, FR-044, FR-046) — enforced by the
  repository before any write; a `CHECK` cannot express "no update when status is closed"
  without a trigger, and triggers would move behavior out of the tested domain layer.
- Recurrence effective-boundary rules (FR-019).
- Score normalization and rounding (FR-031 – FR-035, FR-048).
- Disposition completeness at closure (FR-040).

## What is deliberately absent

- **No user, account, or owner table.** 001 FR-052 is retained; the deployment holds exactly
  one owner's data (002 FR-021). Adding an owner column "for later" is the speculative
  generality Principle III forbids.
- **No sync, version-vector, tombstone-replication, or conflict-resolution columns.** 002
  FR-023 puts all of this out of scope.
- **No IndexedDB-era artifacts.** The synthetic `placementKey` becomes real columns; the
  store-version machinery is replaced by migrations.
- **No migration or import tables.** 002 FR-003 discards existing device-local data.
