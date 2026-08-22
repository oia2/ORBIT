# Phase 0 Research: ORBIT Planning Refinements

**Feature**: `003-planning-refinements` | **Date**: 2026-08-22

This feature contains three reported defects and five behavior changes. The defects were
investigated against the **running production instance** (`docker compose ps` shows
`harness-sdd-lab-app-1` and `harness-sdd-lab-db-1` up) and its live database, not only
against the source. What follows records what was proven, what was disproven, and what the
implementation must therefore do.

No technology choices are re-opened. The stack fixed by 001 and 002 — TypeScript, React 19,
Fastify, PostgreSQL 17, Kysely + `pg`, Vitest, Playwright, Docker Compose — carries forward
unchanged.

---

## Part A — Defect investigation

### Finding A1: The reported data loss (spec item 7) has already happened, is bounded, and is not ongoing

**This is the most important finding in this document, because it changes what User Story 1
has to deliver.**

Evidence gathered from the live database:

| Probe | Result |
| ----- | ------ |
| Row counts | 6 weeks, 42 days, 20 task occurrences, 20 plan entries, 106 task events, 2 habit definitions, 22 habit occurrences |
| `min/max` of `task_plan_entries.plan_date` | `2026-08-18` → `2026-08-23` |
| `min/max` of `task_events.occurred_at` | `2026-08-18T08:44Z` → `2026-08-22T07:42Z` |
| `min/max` of `days.date` | `2026-07-20` → `2026-08-30` |
| `docker volume inspect harness-sdd-lab_orbit-db-data --format '{{.CreatedAt}}'` | **`2026-08-18T07:14:49Z`** |

Reading these together:

- The database volume was **created on 2026-08-18**, the same day feature 002 was closed.
- Every content row — tasks, entries, events, habit outcomes — begins on 2026-08-18 and runs
  **continuously** to the present with no gaps.
- The `days` and `weeks` rows reaching back to 2026-07-20 are empty calendar scaffolding
  created on demand by `ensureCalendarWeek` when History was browsed backwards. They are not
  lost content; they never had content.

**Conclusion**: the store has lost nothing since it was created. The user's "state
disappeared" is the 002 cutover on 2026-08-18, which discarded the device-local IndexedDB
data of feature 001 — explicitly permitted by the 002 spec ("Existing IndexedDB data may be
discarded and there is no migration workflow"). The volume being created that same morning
is consistent with a `docker compose down -v` at deployment.

**Consequence for the plan**: there is no persistence bug to hunt. FR-001 through FR-005 are
therefore delivered as *proof and protection* rather than as a fix — see Decision 1.

**Secondary observation, worth acting on**: habit occurrences on 2026-08-18, 08-19, 08-20 and
08-21 carry 4, 6, 9 and 12 outcome events, the last of which is `user-correction` on each.
`user-correction` is only produced by `correctBoundaryMissToCompleted`. This is the record of
`catchUpHabitDateBoundary` repeatedly flipping a still-pending habit to `not-completed` at
the date rollover and the user manually correcting it back. Nothing is lost, but a user
watching their marks silently flip to "не выполнено" would reasonably describe it as state
disappearing. Acting on this was proposed in Decision 2 and **rejected by the owner**; the
behavior is left unchanged and no indicator is added.

### Finding A2: The closed-day count defect (spec item 6) is not reproducible from current data

Three independent probes, all negative:

1. **The pure domain math is correct.** A throwaway probe drove `prepareDayClosure` with a
   day of 5 tasks (3 completed, 1 kept unfinished, 1 moved) and 2 habits (1 completed). It
   produced `task: 3/5, habit: 1/2, value: 57`. Completed tasks are counted correctly, and
   moved/kept tasks stay in the denominator — already matching decision **D3** in the spec.
2. **The stored snapshots are correct.** All three closed days in the live database hold
   truthful counts:

   | Date | `closure_snapshot.score` |
   | ---- | ------------------------ |
   | 2026-08-18 | task 4/4, habit 2/2, value 100 |
   | 2026-08-19 | task 5/5, habit 2/2, value 100 |
   | 2026-08-20 | task 4/4, habit 2/2, value 100 |

3. **The live API is correct.** `POST /api/planning/getDayView {"date":"2026-08-20"}` against
   the running instance returns `task 4/4, habit 2/2, value 100`, and `getWeekView` returns
   the same numbers for that day inside the week projection.

**One real defect was found in the same area**, though it is currently masked:

`server/planning/queries.ts:128` returns, for an **open** week,
`progress: unavailableScore()` — a hard-coded `task 0/0, habit 0/0, unavailable`. The server
reports a fabricated empty aggregate rather than the week's actual progress. It is invisible
today only because `WeekPage.tsx:191` independently recomputes the value client-side with
`calculateOpenWeeklyProgress`, and `WeekPage.tsx:919` never reaches its
`?? ready.view.progress` fallback. Any consumer that trusts the server's answer sees zeros.
This is exactly the "panel shows 0 of N" shape, and it violates FR-008 regardless of whether
it is what the user saw.

**Consequence for the plan**: User Story 2 is delivered as (a) fix the proven defect, (b)
give all three surfaces **one** derivation instead of three, and (c) pin the invariant with
tests, rather than as a speculative fix. A short reproduction step is kept as the first task,
with this evidence recorded so it is not repeated. See Decision 3.

**Outcome of the time-boxed reproduction (T012, 2026-08-22)**: not reproduced. The three
probes above were re-confirmed and no fourth path to a zeroed count was found in the closure,
projection, or presentation layers. The reported «0 из N» is therefore either (a) the
`getWeekView` defect above reaching a surface, or (b) an observation of a fresh or future day,
where every task is incomplete and every habit still pending so the panel legitimately reads
«0 из N» at 0%. Both readings are addressed by the delivered work: the fabricated aggregate is
gone, and FR-008 is now pinned by `server/planning/repository.day-closure.test.ts` and
`src/entities/planning/model/day-closure.test.ts`, which assert that the frozen counts equal
the live counts the day was showing immediately before closure.

### Finding A3: The History dynamics defect (spec item 9) has a proven root cause

`src/pages/history/model/use-history-page.ts:37-51`:

```ts
function scoreOf(view: HistoryView) {
  return view.mode === 'day'
    ? view.facts.score
    : view.mode === 'week'
      ? view.facts.progress
      : view.selectedDay.score;   // ← month mode
}
```

In month mode the chart point for a whole month is taken from `view.selectedDay.score` — the
score of the single day selected inside that month. Selecting an empty day therefore yields
`unavailable` for the entire month, and if every sampled month resolves that way the
`hasData` guard in `HistoryPage.tsx:477` blanks the chart to "Данных для динамики пока нет".

Compounding it, the sampling loop calls `getHistoryView` with
`{mode:'month', anchorDate: anchor, selectedDate: anchor}` — so each historical month is
sampled at *its own anchor day*, not aggregated. Both halves of the bug are in this one file;
the server-side aggregation (`selectors.ts:571`, `aggregateHistoricalProgress`) is already
correct and is reused rather than rewritten. See Decision 4.

---

## Part B — Design decisions

### Decision 1: User Story 1 is delivered as proof, protection, and recovery — not as a bug fix

**Decision**: Since Finding A1 shows no ongoing loss, FR-001–FR-005 are satisfied by four
concrete deliverables:

1. **A persistence regression test** at the server level that writes a full day of records,
   restarts the database connection, crosses the local-date boundary via the injectable
   clock, and asserts every record is byte-identical. This turns FR-001 from an assumption
   into a checked invariant.
2. **A documented, volume-safe upgrade procedure** in `README.md` — `docker compose up -d
   --build` never `down -v` — plus a guard note at the exact place the destructive command
   appears today (`README.md:218`).
3. **A backup and restore path**: `npm run db:backup` / `npm run db:restore` wrapping
   `pg_dump`/`psql` against the compose service, and a required backup step in the upgrade
   procedure. This is what actually makes FR-002 keepable across this feature's own
   migrations.
4. **An end-to-end persistence check** in `quickstart.md` the owner can run before and after
   the upgrade.

**Rationale**: The requirement is an observable guarantee. Chasing a fix for a defect the
evidence says does not exist would produce speculative changes to working persistence code,
which principle III forbids. Proving and protecting the guarantee is the honest reading.

**Alternatives rejected**: Rewriting or hardening the storage layer — no evidence supports
it. Adding a client-side cache as a safety net — would create a second source of truth,
contradicting 002 and principle III.

### Decision 2: The habit date-boundary behavior is left exactly as it is — REJECTED PROPOSAL

**Status**: This decision originally proposed adding a visible marker when a habit outcome
came from `catchUpHabitDateBoundary` rather than from the user. **The owner rejected it on
2026-08-22.**

**Decision as it now stands**: `catchUpHabitDateBoundary` keeps its current behavior
unchanged, and **no** indicator, marker, or any other distinction between a system-generated
and a user-generated habit state change is added anywhere in the product.

**Rationale for the rejection** (owner's call): the observation behind the proposal was real —
Finding A1 shows habit occurrences carrying up to twelve outcome events ending in
`user-correction` — but it is not covered by any functional requirement in this feature's
spec, and the owner has decided the current behavior is correct as it stands. Under
constitution principle V, adding it would have required a spec change first; that spec change
will not be made.

**Consequence for the plan**: no task in `tasks.md` may introduce such an indicator.
`src/entities/planning/ui/HabitRow.tsx` is untouched by User Story 1, and `HabitOutcomeEvent`
keeps its existing `source` discriminant purely as an audit fact, exactly as today.

### Decision 3: One derivation for the day result, shared by every surface

**Decision**: Introduce a single exported function that turns a day's records into a
`ScoreBreakdown`, and route the open-day path, the closure snapshot path, and the week
aggregate through it. Concretely:

- `selectDaySignals` (live) and `prepareDayClosure` (frozen) keep their current split of
  live-vs-frozen, but both derive counts from **one** shared counting function rather than
  the two near-duplicates that exist today (`selectors.ts:208 taskCompletionCounts` and
  `day-closure.ts:236 taskCounts`).
- `getWeekView` stops fabricating `unavailableScore()` for an open week and returns the real
  aggregate, computed by the same rule the client currently duplicates in
  `WeekPage.tsx:143`. `calculateOpenWeeklyProgress` is then deleted from the page.

**Rationale**: FR-008 requires the Day page, Week page, and History page to agree. Today they
agree by coincidence — three implementations that happen to match, plus one
(`getWeekView`) that does not. Collapsing them to one derivation makes agreement structural
and is the smallest change that can make FR-008 hold. It is also a precondition for the
scoring change in Decision 5, which would otherwise have to be applied in four places.

**Alternatives rejected**: Fixing `getWeekView` alone — leaves three parallel
implementations to keep in step through the weighting change. Keeping the client-side
recomputation — leaves the server's own API returning a value it knows is false.

### Decision 4: History dynamics is fixed by aggregating the period, in one file

**Decision**: In `use-history-page.ts`, `scoreOf` for month mode returns the aggregate of the
month's days rather than `selectedDay.score`, and week mode continues to use
`facts.progress`. The month aggregate reuses the existing counts-summing rule; no new
server query and no repository change is required, because `HistoryMonthView` already
carries `completedWeeks` and the calendar cells, and the month's days can be aggregated from
the same range the view was built from.

If aggregating a month proves to need day-level facts the month view does not expose, the
fallback is to extend `HistoryMonthView` with a `progress: ScoreBreakdown` field computed by
`selectHistoryView` — server-side, using the same `aggregateHistoricalProgress` helper
already used for weeks. This is the preferred shape if either option costs the same, because
it keeps the aggregation rule in the domain layer with the others.

**Decision on the empty-point rule**: FR-038 requires a period with no data to render as a
gap inside a chart that still draws. The `hasData` guard therefore moves from "any point has
data" to per-point rendering, with the whole-chart empty state kept only for the case where
**every** point is unavailable (FR-039).

**Rationale**: The aggregation logic already exists and is already correct for weeks. The bug
is a projection mistake in one client file, so the fix belongs there.

### Decision 5: The single-weight result and the shape of `ScoreBreakdown`

**Decision**: `calculateCompletionScore` changes from the 70/30 combination to

```
value = round( (task.completed + habit.completed) / (task.applicable + habit.applicable) × 100 )
```

using the existing exact `roundHalfUp` on `bigint`, so ties keep rounding identically. The
per-category `task` and `habit` breakdowns are unchanged and stay visible (FR-019). When the
combined denominator is zero the value stays `'unavailable'` (FR-018).

`AppliedScoreWeights` (`day.ts:36`) is **removed** from `ScoreBreakdown`. Under one weight
per item there is no weighting to report, and leaving a `weightsApplied: {task: 70, habit:
30}` field in freshly written snapshots would be a lie. Its replacement in the serialized
snapshot is nothing: the combined counts are already derivable from the two category
breakdowns.

**Consequence**: `ScoreBreakdown` is persisted inside `days.closure_snapshot` and
`weeks.completion_snapshot`, so this is a stored-shape change and requires the migration in
Decision 6.

**Rationale**: This is what the spec's FR-016 states, and computing from summed counts rather
than from averaged rates is what makes a 9-task/1-habit day read 90% instead of 70%.

**Alternatives rejected**: Keeping `weightsApplied` as `{task: 50, habit: 50}` — false.
Keeping it as a dead field — a stored lie that future readers will trust.

### Decision 6: The snapshot migration recomputes in place, from stored counts only

**Decision**: One Kysely migration, `002-single-weight-snapshots`, that rewrites
`days.closure_snapshot` and `weeks.completion_snapshot` in place:

- reads each snapshot's existing `score.task.{completed,applicable}` and
  `score.habit.{completed,applicable}`,
- recomputes `value` by the single-weight formula,
- deletes the `weightsApplied` key,
- leaves `plannedLoadMinutes`, every count, every rate, `closed_at`, `completed_at`,
  `revision`, and every other table untouched.

It is written as a pure SQL/JSONB update over the two tables — no row is deleted, no period
is reopened, no audit event is written (FR-021), and it is idempotent: a snapshot that no
longer has `weightsApplied` is left alone.

**Rationale**: FR-021 requires exactly this, and FR-022 requires it to run against live data.
Deriving purely from counts already stored means the migration needs no other table, cannot
disagree with the recorded facts, and cannot fail on a partially readable history.

**Alternatives rejected**: Recomputing snapshots from the underlying entries — would produce
different numbers than the day actually recorded and would silently rewrite history.
Computing the new value on read and leaving the database alone — the owner chose D2
explicitly, and it would leave the stored snapshot disagreeing with the screen.

**Migration safety**: `runMigrations` already throws on the first failure before the server
serves a request (`server/db/migrations/index.ts`), and Kysely runs each migration in a
transaction. Combined with the backup step from Decision 1, FR-002 is met.

### Decision 7: Reopening a day

**Decision**: A new repository command `reopenDay({date, expectedDayRevision})`, mirroring
`closeDay`, implemented as a domain function `prepareDayReopening` plus a server
`reopenDay` transaction.

Per the owner's decision **D1**, it does **not** roll back closure dispositions. Its effects:

| Record | Effect |
| ------ | ------ |
| `Day` | `status: 'closed'` → `'open'`; `closureSnapshot` and `closedAt` dropped; `revision` bumped |
| Task occurrences finalized by this day's closure with `placement.kind === 'none'` | returned to `state: 'active'`, `placement: {kind:'day', date}`, `completion` restored from the membership outcome (`completed` → completed, otherwise `incomplete`) |
| Their memberships (`kept-unfinished`, `canceled`, `completed`) | returned to `planned` or `completed`, `finalizedAt` cleared |
| Memberships with outcome `moved` or `backlogged` | **untouched** — the task stays where closure put it (FR-012) |
| Destination days that received a moved task | **untouched** (FR-015) |
| Audit | one `closure-reopen` task event per restored occurrence, and the day's reopening recorded (FR-011) |

**Guards** (FR-014): refused with `PeriodImmutable` when the day's week is `completed`;
refused with `NotFound` when the day does not exist; `RevisionConflict` on a stale revision,
like every other command.

**A new `TaskEventType` `closure-reopen` is required.** `task_events.payload` is `jsonb` with
the discriminant inside it (`schema.ts` `TaskEventBody`), so no schema migration is needed —
only the union in `task.ts`.

**Rationale**: This is the minimum that makes a reopened day *usable* (FR-013) while honoring
D1's instruction not to undo relocations. Restoring completion from the membership outcome is
what makes the reopened day's live score equal the snapshot that was just discarded, which is
what US3 acceptance scenario 1 requires.

**Alternatives rejected**: A full inverse of the closure transaction — the owner rejected it
as D1. Reopening the week too — out of scope per the spec.

**UI**: the DayPage "День закрыт" card currently reads "Повторное открытие недоступно."
(`DayPage.tsx:299`). It gains a confirmation-guarded "Открыть день заново" action, and that
sentence is replaced — either by the new action or, when the week is completed, by the reason
the day cannot be reopened.

### Decision 8: Habit duration lives on the definition and is snapshotted per occurrence

**Decision**:

- `habit_definitions` gains a nullable `duration_minutes` column (additive migration).
- `HabitDefinition.durationMinutes?: DurationMinutes`.
- `HabitDefinitionSnapshot` gains `durationMinutes?: DurationMinutes`. It is `jsonb`
  (`habit_occurrences.definition_snapshot`), so no column change is needed there.
- `calculatePlannedLoad` gains habit occurrences as an input and sums
  `definitionSnapshot.durationMinutes` for applicable occurrences on the date, alongside task
  durations (FR-030).
- Editing a definition's duration propagates the new value into the `definitionSnapshot` of
  every occurrence **whose day is open**. Closed days are skipped, which is exactly FR-034.
- `CreateHabitDefinitionInput` and `EditHabitOccurrenceInput` gain
  `durationMinutes?: DurationMinutes | null`, with `null` meaning "clear".

**Rationale**: Snapshotting per occurrence is the pattern the codebase already uses for habit
titles and task planned snapshots, so history stays truthful. Propagating to open days only
is what reconciles "set a duration and see today's load change" with "closed days never
move".

**Alternatives rejected**: Reading the definition directly at load time — would retroactively
change closed days, violating FR-034. A per-day duration entry — more UI for no stated need.

### Decision 9: Task notes reuse the existing `notes` field, with clearing added

**Decision**: `TaskOccurrence.notes` and `task_occurrences.notes` already exist and already
flow through `plannedSnapshot`, `prepareTaskEdit`, and the closure/materialization paths. No
schema migration and no domain field is added. Two gaps must be closed:

1. **Notes cannot currently be cleared.** `EditTaskOccurrenceInput.notes?: string` and
   `prepareTaskEdit` use `notes === undefined ? {} : { notes }`
   (`task-lifecycle.ts:387`), so `undefined` means "unchanged" and there is no way to say
   "remove". It becomes `notes?: string | null`, matching the `startTime`/`endTime`
   convention already in that same input type.
2. **Notes are never rendered.** `grep` finds zero references to `notes` in any `.tsx` file.
   `TaskRow` gains an expandable region, editable where the period is mutable and read-only
   where it is not (FR-025).

**Rationale**: The domain already carries the data through every path this feature needs,
including day closure and history. Adding a second field would duplicate it.

**Note-exists indicator (FR-026)**: driven off `occurrence.notes` being a non-empty string,
rendered in the collapsed row.

**Occurrence-scoped, not series-scoped (FR-027)**: already true —
`prepareTaskEdit` writes to the occurrence, and `TaskSeries.template.notes` is a separate
field used only to seed newly materialized occurrences.

### Decision 10: Week planner expand-all is local UI state

**Decision**: `WeekPage` already holds `expandedPlannerDays: ReadonlySet<LocalDate>`
(`WeekPage.tsx:180`). The control sets it to all seven dates or to the empty set, and its
label reflects which action it will perform (FR-041). Per-day `<details>` toggling continues
to update the same set, so FR-042 holds with no extra work.

**Rationale**: The state and the wiring already exist; this is a button and a label.

**Alternatives rejected**: Persisting the expansion state — not requested, and it is
view state, not user data.

---

## Part C — Cross-cutting concerns

### Test strategy

| Layer | Tool | What this feature adds |
| ----- | ---- | ---------------------- |
| Domain | Vitest | Single-weight scoring tables (including the spec's 90% and 25% cases and the zero-denominator case); `prepareDayReopening` including guards; planned load with habit durations; the shared day-counting function |
| Server | Vitest against PostgreSQL | `reopenDay` transaction and its guards; the persistence regression test from Decision 1; the snapshot migration applied to seeded 70/30 data |
| Migration | Vitest | Idempotence, count preservation, `weightsApplied` removal, and that no other table changes |
| UI | Vitest + Testing Library | Note modal/edit/read-only and row indicator; habit duration field; expand-all control; reopen action and its disabled/explained state; dynamics chart with a mix of empty and non-empty periods |
| E2E | Playwright | Close → reopen → correct → close again; write a note and reload; expand all seven days |

`npm run verify` (format, lint, typecheck, server tests, coverage, e2e) is the gate, plus
`npm run test:server:tz` for the non-UTC timezone run that 002 established.

### Order of work

The user story priorities in the spec already encode the dependencies, with one addition:
**Decision 3 (one derivation) must land before Decision 5 (single weight)**, or the weighting
change has to be made in four places and kept consistent by hand.

### Risk register

| Risk | Mitigation |
| ---- | ---------- |
| The snapshot migration corrupts real history | Backup step is mandatory in the upgrade procedure (Decision 1); migration is idempotent and derives only from stored counts; migration test runs against seeded 70/30 rows |
| Item 6 has no reproduction, so a "fix" could miss the real defect | The proven `getWeekView` defect is fixed, the three surfaces are unified, and the invariant is pinned by test. The reproduction attempt is time-boxed as the first task of US2 and its outcome is recorded either way |
| Removing `weightsApplied` breaks a consumer | It is a compile-time break — `tsc -b` finds every reader before anything ships |
| Reopening a day leaves an occurrence in an inconsistent state | Reopening is one transaction like closure; the domain function returns prepared effects and the adapter commits all or none, exactly as `prepareDayClosure` does today |
