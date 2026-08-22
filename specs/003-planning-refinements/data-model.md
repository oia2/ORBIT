# Data Model: ORBIT Planning Refinements

**Feature**: `003-planning-refinements` | **Date**: 2026-08-22

This document records only the **delta** against the 001/002 data model. Every entity,
column, index, and invariant not named here is unchanged and remains governed by
`specs/002-server-backed-persistence/data-model.md`.

**Binding constraint on everything below (spec FR-002):** the owner's live database must
survive. No change here deletes a row, empties a table, or requires a reset. The one data
migration rewrites two `jsonb` columns in place and preserves every recorded count.

---

## 1. Changed value object: `ScoreBreakdown`

**Location**: `src/entities/planning/model/day.ts`
**Persisted in**: `days.closure_snapshot` (jsonb), `weeks.completion_snapshot` (jsonb)

### Before

```ts
interface AppliedScoreWeights {
  readonly task: 0 | 70 | 100;
  readonly habit: 0 | 30 | 100;
}

interface ScoreBreakdown {
  readonly task: CompletionCategoryBreakdown;
  readonly habit: CompletionCategoryBreakdown;
  readonly value: number | 'unavailable';
  readonly weightsApplied: AppliedScoreWeights;   // ← removed
}
```

### After

```ts
interface ScoreBreakdown {
  readonly task: CompletionCategoryBreakdown;
  readonly habit: CompletionCategoryBreakdown;
  readonly value: number | 'unavailable';
}
```

`AppliedScoreWeights` is deleted. Under one weight per item there is no weighting to report,
and retaining the field would record a false fact in every new snapshot (research
Decision 5).

`CompletionCategoryBreakdown` — the `{completed, applicable, rate}` pair per category — is
**unchanged**. It is what FR-019 keeps visible and what the migration in §5 reads.

### Derivation rule (FR-016, FR-018)

| Condition | `value` |
| --------- | ------- |
| `task.applicable + habit.applicable === 0` | `'unavailable'` |
| otherwise | `round((task.completed + habit.completed) / (task.applicable + habit.applicable) × 100)` |

Rounding uses the existing exact `roundHalfUp` over `bigint` in `scoring.ts`, so half-way
values keep rounding identically to today. The per-category `rate` fields keep their own
existing rule: `'unavailable'` when that category has no applicable items.

**Worked examples from the spec:**

| Day | task | habit | value |
| --- | ---- | ----- | ----- |
| 9 tasks all done, 1 habit missed (US4 §1) | 9/9 | 0/1 | `round(9/10 × 100)` = **90** |
| 1 task done, 3 habits missed (US4 §2) | 1/1 | 0/3 | `round(1/4 × 100)` = **25** |
| Tasks only (US4 §3) | 3/5 | 0/0 → unavailable | `round(3/5 × 100)` = **60**, equal to the task rate |
| Nothing applicable (US4 §4) | 0/0 | 0/0 | **`'unavailable'`** |

### Weekly progress (FR-017)

`week-completion.ts` already sums the per-category counts across the week's closed days and
feeds them through the same `calculateCompletionScore`. Because the new rule is a ratio of
summed counts, summing days and then scoring gives the same answer as scoring the week's
items directly. No change to the aggregation itself is required — only that it, the open-week
aggregate, and the day derivation all call the one shared function (research Decision 3).

---

## 2. Changed entity: `Day` — reopening

**Location**: `src/entities/planning/model/day.ts`, table `days`

**No schema change.** `days.status`, `closure_snapshot`, and `closed_at` already carry the
shape needed; reopening writes `status = 'open'`, `closure_snapshot = NULL`,
`closed_at = NULL`, and bumps `revision`.

### State transitions

```
                    closeDay
        ┌──────────────────────────────────►┐
   OpenDay                                ClosedDay
        ◄──────────────────────────────────┘
                    reopenDay
```

| Transition | Guard | Effect on the Day row |
| ---------- | ----- | --------------------- |
| `open → closed` (existing) | not future; no pending habits; week open; revision matches | writes `closure_snapshot`, `closed_at`, bumps `revision` |
| `closed → open` (**new**) | **week must be `open`** (FR-014); day must exist; revision matches | clears `closure_snapshot` and `closed_at`, bumps `revision` |

`ClosedDay` and `OpenDay` remain a discriminated union on `status`; `DayClosureSnapshot` is
unchanged in shape apart from the `ScoreBreakdown` delta in §1.

### Reopening effects on related records (FR-012, FR-013, FR-015)

Per owner decision **D1**, reopening does **not** invert the closure. It restores only the
records that closure left with nowhere else to be.

| Membership outcome written by closure | Occurrence after closure | Effect of reopening |
| ------------------------------------- | ------------------------ | ------------------- |
| `completed` | `state: finalized`, `placement: none` | occurrence → `active`, `placement: {day, date}`, `completion: 'completed'`; membership → `completed`, `finalizedAt` cleared |
| `kept-unfinished` | `state: finalized`, `placement: none` | occurrence → `active`, `placement: {day, date}`, `completion: 'incomplete'`; membership → `planned`, `finalizedAt` cleared |
| `canceled` | `state: finalized`, `placement: none` | same as `kept-unfinished` |
| `moved` | occurrence placed on the destination date | **untouched** — task stays on its destination day |
| `backlogged` | occurrence placed in the backlog | **untouched** |
| `deleted` | — | **untouched** |

The destination day's own records are never written (FR-015): a task moved out at closure
keeps its destination membership, and the reopened day keeps that `moved` membership in its
own counts as not completed (FR-007, decision D3).

**Invariant this preserves**: a day's live score immediately after reopening equals the
snapshot that was just discarded, because the restored memberships carry exactly the outcomes
the snapshot counted. This is what US3 acceptance scenario 1 asserts.

**Day position on restore**: restored occurrences keep the `day_position` they held before
closure. `prepareDayClosure` does not clear it, so no renumbering is needed; a collision is
impossible because only occurrences of this same day are restored.

---

## 3. Changed entity: `TaskEvent` — one new type

**Location**: `src/entities/planning/model/task.ts`, table `task_events`

**No schema change.** `task_events.payload` is `jsonb` and already carries the discriminant
inside the body (`TaskEventBody` in `server/db/schema.ts`), so a new event type is a
type-union change only.

```ts
type TaskEventType =
  | …existing…
  | 'closure-reopen';   // NEW

interface TaskEventPayloadByType {
  …existing…
  'closure-reopen': { readonly date: LocalDate };
}
```

One `closure-reopen` event is written per restored occurrence, allocated an `EventSequence`
by the existing `allocateNextEventSequence`, so the closure/reopen history of a day is fully
recoverable in order (FR-011). Existing events are never rewritten.

---

## 4. Changed entity: `HabitDefinition` and `HabitDefinitionSnapshot` — optional duration

### 4a. Table `habit_definitions` — one additive column

| Column | Type | Nullability | Default |
| ------ | ---- | ----------- | ------- |
| `duration_minutes` | `integer` | **nullable** | none |

Nullable with no default and no backfill: existing habits keep no duration and therefore
contribute nothing to planned load, which is exactly FR-031.

A `CHECK (duration_minutes IS NULL OR duration_minutes > 0)` constraint mirrors the domain's
`DurationMinutes` brand (positive integer). It is satisfiable by every existing row because
every existing row is `NULL`.

### 4b. Domain types

```ts
interface HabitDefinition {
  readonly id: HabitDefinitionId;
  readonly title: string;
  readonly durationMinutes?: DurationMinutes;      // NEW
  readonly ruleVersions: readonly RecurrenceRuleVersion[];
  readonly revision: Revision;
}

interface HabitDefinitionSnapshot {
  readonly title: string;
  readonly durationMinutes?: DurationMinutes;      // NEW
}
```

`HabitDefinitionSnapshot` is stored in `habit_occurrences.definition_snapshot`, which is
`jsonb` — **no column change**. An existing snapshot without the key deserializes to
`durationMinutes: undefined`, which is the correct "no duration" reading.

### 4c. Propagation rule (FR-030, FR-034)

The occurrence's **snapshot** is authoritative for planned load, never the definition. That
is what keeps a closed day frozen. Editing a definition's duration writes the new value into
the `definition_snapshot` of every occurrence of that definition **whose day is `open`**:

| Occurrence's day | On duration change |
| ---------------- | ------------------ |
| `open` | snapshot updated, day revision bumped, load recomputed live |
| `closed` | **untouched** — and the frozen `closure_snapshot.plannedLoadMinutes` is untouched regardless (FR-034) |

This mirrors how recurrence-rule changes already treat past versus future occurrences, and it
is the only rule that satisfies both "set a duration and today's load changes" and "closed
days never move".

Newly materialized occurrences capture the definition's current duration at creation, exactly
as they already capture its title.

---

## 5. Migration `002-single-weight-snapshots` — rescale frozen results

**Requirement**: FR-021, FR-022. **Registered in**: `server/db/migrations/index.ts`.

### What it rewrites

Two columns, in place:

| Table | Column | Path rewritten |
| ----- | ------ | -------------- |
| `days` | `closure_snapshot` | `score.value` recomputed; `score.weightsApplied` removed |
| `weeks` | `completion_snapshot` | `progress.value` recomputed; `progress.weightsApplied` removed |

### What it must not touch

`score.task.*`, `score.habit.*` (every `completed`, `applicable`, and `rate`),
`plannedLoadMinutes`, `closed_at`, `completed_at`, `revision`, `reflection`, `goals`, and
every other table. No row is inserted or deleted. No period is reopened. No audit event is
written.

### Derivation

Purely from counts the snapshot already holds — the migration reads nothing else:

```
denominator = score.task.applicable + score.habit.applicable
value       = denominator = 0 ? 'unavailable' : round(
                (score.task.completed + score.habit.completed) / denominator × 100 )
```

Because it derives only from stored counts, it cannot disagree with what the day actually
recorded, and it cannot fail on history whose underlying entries have since moved.

### Idempotence

A snapshot with no `weightsApplied` key is recomputed to the same value and its already-absent
key stays absent, so re-running is a no-op. Required, because Kysely's migrator and a
re-deploy must both be safe.

### Applied to the owner's live data

The three existing closed days are all `task N/N, habit 2/2, value 100`; under the new rule
they remain 100. The one open week has no completion snapshot. So the observable change to
current history is nil — but the migration is still required, because the stored
`weightsApplied: {task: 70, habit: 30}` in those three rows would otherwise contradict
FR-020 and the new type.

### Verification

A migration test seeds rows with known 70/30 snapshots whose recomputed value **differs**
(for example `task 9/9, habit 0/1, value 70` → `90`), runs the migration, and asserts: the
new value, the removal of `weightsApplied`, that every count is byte-identical, that
`plannedLoadMinutes` and `closed_at` are unchanged, that no other table changed, and that a
second run changes nothing.

---

## 6. Migration `003-habit-duration` — additive column

**Requirement**: FR-029. Adds `habit_definitions.duration_minutes` per §4a and its `CHECK`
constraint. Purely additive: no backfill, no data rewrite, no other table touched. Existing
rows are valid the moment it completes.

Ordered after `002-single-weight-snapshots` so the two migrations are independent and the
snapshot rescale runs against an unchanged schema.

---

## 7. Unchanged: `TaskOccurrence.notes`

Listed here because User Story 5 might look like it needs a data-model change. **It does
not.**

`task_occurrences.notes text NULL` already exists, and `notes` already flows through
`TaskOccurrence`, `TaskPlannedSnapshot`, `TaskTemplate`, `prepareTaskEdit`, day closure, and
occurrence materialization. It is simply never rendered — `grep` finds no reference to
`notes` in any `.tsx` file.

The only semantic change is at the **input** boundary, not in storage:
`EditTaskOccurrenceInput.notes` becomes `string | null`, where `null` clears the note and
`undefined` continues to mean "unchanged" — matching the convention `startTime` and `endTime`
already use in that same input type. See [contracts/planning-api.md](./contracts/planning-api.md).

A note belongs to the occurrence, never to the series (FR-027): `TaskSeries.template.notes`
is a separate field used only to seed newly materialized occurrences, and editing an
occurrence's note does not write to it.

---

## 8. Summary of storage impact

| Change | Type | Reversible | Touches existing rows |
| ------ | ---- | ---------- | --------------------- |
| `ScoreBreakdown` drops `weightsApplied` | Stored shape (jsonb) | Yes — the key can be re-added | Yes, via migration 002 — values only, never counts |
| `Day` gains a `closed → open` transition | Behavioral | Yes — the day can be closed again | Only on explicit user action |
| `TaskEventType` gains `closure-reopen` | Stored shape (jsonb) | Yes | No — only new events |
| `habit_definitions.duration_minutes` | Column | Yes — droppable | No — nullable, no backfill |
| `HabitDefinitionSnapshot.durationMinutes` | Stored shape (jsonb) | Yes | Only on explicit user action, and only for open days |
| `TaskOccurrence.notes` | — | — | **No change** |

No column is dropped, no type is narrowed, no row is deleted. A restore from the backup taken
in [quickstart.md](./quickstart.md) is a complete rollback path for the one destructive-shaped
operation (migration 002), which is why that backup is a required step rather than a
suggestion.
