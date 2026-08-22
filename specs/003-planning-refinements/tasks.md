---

description: "Task list for ORBIT Planning Refinements"
---

# Tasks: ORBIT Planning Refinements

**Input**: Design documents from `/specs/003-planning-refinements/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/planning-api.md](./contracts/planning-api.md), [quickstart.md](./quickstart.md)

**Tests**: Test tasks ARE included. Constitution principle IV requires automated coverage for
meaningful behavior changes, and [research.md](./research.md) Part C defines the layer-by-layer
strategy this list implements.

**Organization**: Grouped by user story so each can be implemented, tested, and shipped
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: Which user story the task serves (US1–US8, matching spec.md)
- Exact file paths are given in every task

## Path Conventions

Web application with a shared pure domain layer (see plan.md → Project Structure):

- `src/entities/planning/model/` — pure domain, runs in browser **and** on Node
- `src/entities/planning/ui/`, `src/features/`, `src/pages/` — React client
- `server/planning/`, `server/api/`, `server/db/` — Fastify API and PostgreSQL
- `e2e/journeys/` — Playwright

## ⚠️ Read before starting

This feature runs a migration against the owner's **live production database**, which holds
real data from 2026-08-18 onward. Phase 1 and Phase 2 exist to make that safe. Do not start
Phase 6 (the migration) until T002 and T003 are done.

`docker compose down -v` is forbidden anywhere in this feature. It is what emptied the
database on 2026-08-18 ([research.md](./research.md) Finding A1).

---

## Phase 1: Setup (Safety Net & Baseline)

**Purpose**: Establish a known-good starting point and a rollback path before anything changes

- [X] T001 Run `npm run verify` and `npm run test:server:tz` on the untouched branch and record the result in `specs/003-planning-refinements/baseline.md`, so any later failure is attributable to this feature
- [X] T002 Take the pre-upgrade database dump per [quickstart.md](./quickstart.md) §0 (`docker compose exec -T db pg_dump -U orbit -d orbit --format=custom > orbit-pre-003.dump`), record the row counts and closed-day snapshot values in `specs/003-planning-refinements/baseline.md`, and confirm the dump restores into a scratch database

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure that must exist before the migration in Phase 6 touches live data

**⚠️ CRITICAL**: T003 blocks US4. No migration may run against the owner's database until the
backup path is scripted and proven.

- [X] T003 Add `db:backup` and `db:restore` npm scripts to `package.json` wrapping `pg_dump`/`pg_restore` against the `db` compose service, and verify both round-trip against a scratch database
- [X] T004 [P] Replace the bare `docker compose down -v` warning at `README.md:218` with the volume-safe upgrade procedure from [quickstart.md](./quickstart.md) §1 (`docker compose up -d --build`, mandatory backup step, restore path)
- [X] T005 [P] Add a closed-day seeding helper to `server/planning/test-support/repository-harness.ts` that inserts a day with a caller-supplied `closure_snapshot`, used by the US2, US3, and US4 test suites

**Checkpoint**: Backup and restore are scripted and proven — user story work can begin

---

## Phase 3: User Story 1 - Saved work is never lost (Priority: P1) 🎯 MVP

**Goal**: Turn persistence from an assumption into a checked invariant, and make upgrades
incapable of destroying data. Phase 0 proved there is no ongoing loss
([research.md](./research.md) Finding A1), so this story delivers proof and protection, not a fix.

**Independent Test**: Record a task, a habit outcome, a note, and daily state; close the
browser; cross the local date boundary; restart the stack; reopen ORBIT. Every record is
present and unchanged.

### Tests for User Story 1

- [X] T006 [P] [US1] Server persistence regression test in `server/planning/repository.persistence.test.ts`: write a full day (tasks, plan entries, habit outcomes, weekly goal, daily state), reconnect the repository, advance the injected clock past the local date boundary, and assert every record is identical field-for-field (FR-001)
- [X] T007 [P] [US1] Server test in `server/planning/repository.persistence.test.ts` asserting `prepareOpenPeriod` never deletes a record the user has touched — a completed occurrence, an occurrence with audit events, and a habit with outcome events all survive re-preparation after their recurrence rule is stopped (FR-005)
- [X] T008 [P] [US1] Client test in `src/entities/planning/api/http/http-planning-repository.test.ts` asserting a failed write surfaces `ServerUnavailable`/`UnexpectedServerFailure` and never resolves as a successful command (FR-004)

### Implementation for User Story 1

- [X] T009 [US1] Extend `e2e/journeys/server-persistence.spec.ts` with a journey that records a task, a habit outcome, and daily state, discards the browser context, reopens the app in a fresh context, and asserts every record is present (FR-001)
- [X] T010 [US1] Add the pre-upgrade / post-upgrade data-preservation check to `e2e/journeys/server-persistence.spec.ts` or a server test: capture row counts and closed-day snapshot counts, run migrations, and assert every count is unchanged (FR-002, FR-003)
- [X] T011 [US1] Execute [quickstart.md](./quickstart.md) §1 against the live instance and record the before/after comparison in `specs/003-planning-refinements/baseline.md`

**Checkpoint**: Persistence is proven by test, upgrades are volume-safe, and a restore path exists

---

## Phase 4: User Story 2 - A closed day reports what actually happened (Priority: P1)

**Goal**: Make the Day, Week, and History surfaces agree on a closed day's counts by
construction rather than by coincidence, and fix the one proven defect in that area.

**Independent Test**: On an open day complete 3 of 5 tasks (panel reads «3 из 5»), close the
day choosing dispositions for the other 2, and confirm the panel still reads «3 из 5» — then
confirm the Week and History pages show the same numbers.

**⚠️ Blocks US4**: collapsing the three parallel score derivations must land before the
weighting change, or that change has to be made in four places and kept consistent by hand
([research.md](./research.md) Decision 3).

### Investigation (time-boxed — evidence already gathered)

- [X] T012 [US2] Time-boxed (≤1h) attempt to reproduce the reported «0 из N» against the live instance. [research.md](./research.md) Finding A2 already proves the domain math, the three stored snapshots, and the live API are all correct — **do not repeat those probes**. Record the outcome in `research.md` either way, then proceed with T013 regardless

### Tests for User Story 2

- [X] T013 [P] [US2] Domain test in `src/entities/planning/model/day-closure.test.ts`: for a day of 5 tasks (3 completed, 1 kept unfinished, 1 moved) and 2 habits (1 completed), the closure snapshot's counts equal the live counts immediately before closure (FR-006, FR-007)
- [X] T014 [P] [US2] Domain test in `src/entities/planning/model/day-closure.test.ts` pinning decision D3: tasks moved, backlogged, or cancelled at closure stay in the denominator and count as not completed
- [X] T015 [P] [US2] Server contract test in `server/planning/repository.day-closure.test.ts`: `getDayView`, `getWeekView`, and `getHistoryView` return identical counts and an identical value for the same closed day (FR-008)

### Implementation for User Story 2

- [X] T016 [US2] Extract one shared derivation `dayCompletionCounts(planEntries, habitOccurrences, date)` into `src/entities/planning/model/scoring.ts`, replacing the two near-duplicate counters at `src/entities/planning/model/selectors.ts:208` and `src/entities/planning/model/day-closure.ts:236`
  - **Completion note (T096)**: the derivation lives in `src/entities/planning/model/day-counts.ts`; putting it in `scoring.ts` would close an import cycle because `habit.ts` already imports scoring types. The separate pure-domain module remains the single derivation required by this task.
- [X] T017 [US2] Rewire `selectDaySignals` in `src/entities/planning/model/selectors.ts` to call the shared derivation (depends on T016)
- [X] T018 [US2] Rewire `taskCounts`/`habitCounts` in `src/entities/planning/model/day-closure.ts` to call the shared derivation (depends on T016)
- [X] T019 [US2] Fix `getWeekView` in `server/planning/queries.ts:128` to return the real aggregate for an **open** week instead of the fabricated `unavailableScore()`, computed by the shared derivation; a completed week keeps returning its frozen `completionSnapshot.progress`
- [X] T020 [US2] Delete `calculateOpenWeeklyProgress` from `src/pages/week/ui/WeekPage.tsx:143` and read `view.progress` from the server instead (depends on T019)
- [X] T021 [US2] Update `src/pages/week/ui/WeekPage.test.tsx` and `src/pages/week/ui/WeekPage.branches.test.tsx` for the removed local computation (depends on T020)

**Checkpoint**: One derivation feeds every surface; FR-008 is pinned by test

---

## Phase 5: User Story 3 - A day can be reopened (Priority: P1)

**Goal**: Let the owner reopen a closed day, correct it, and close it again — without undoing
the task relocations closure applied (owner decision D1).

**Independent Test**: Close a day marking one task complete, keeping one unfinished, and moving
one to tomorrow. Reopen it: the live result equals the discarded snapshot, the completed and
kept tasks are editable again, and the moved task is still on tomorrow. Mark the kept task
complete and close again — the new snapshot reflects the correction.

**Depends on**: US2 (the live-score path it restores into)

### Tests for User Story 3

- [X] T022 [P] [US3] Domain tests in `src/entities/planning/model/day-reopening.test.ts`: a reopened day's live counts equal the snapshot it discarded; `completed`, `kept-unfinished`, and `canceled` memberships are restored per [data-model.md](./data-model.md) §2; `moved` and `backlogged` are untouched (FR-010, FR-012, FR-013)
- [X] T023 [P] [US3] Domain tests in `src/entities/planning/model/day-reopening.test.ts` for the guards: a day in a completed week is refused with `PeriodImmutable` carrying `weekStart`; an already-open day is refused with `InvalidTransition` (FR-014)
- [X] T024 [P] [US3] Server tests in `server/planning/repository.day-reopening.test.ts`: close → reopen round-trip, the completed-week guard, that the destination day of a moved task is not written (FR-015), that one `closure-reopen` event is recorded per restored occurrence in sequence (FR-011), and that a mid-transaction failure rolls everything back

### Implementation for User Story 3

- [X] T025 [P] [US3] Add `'closure-reopen'` to `TaskEventType` and its payload `{ date: LocalDate }` to `TaskEventPayloadByType` in `src/entities/planning/model/task.ts` — no schema migration needed, the discriminant lives inside the `jsonb` payload
- [X] T026 [US3] Implement `prepareDayReopening` in `src/entities/planning/model/day-reopening.ts`, returning prepared effects for the adapter to commit atomically, modelled on `prepareDayClosure` (depends on T025)
- [X] T027 [US3] Add `ReopenDayInput` and `reopenDay` to `src/entities/planning/model/planning-repository.ts` per [contracts/planning-api.md](./contracts/planning-api.md) §1
- [X] T028 [US3] Implement the `reopenDay` transaction in `server/planning/reopening.ts`, modelled on `server/planning/closure.ts` (depends on T026, T027)
- [X] T029 [US3] Wire `reopenDay` into `server/planning/postgres-planning-repository.ts` (depends on T028)
- [X] T030 [US3] Add `parseReopenDay` to `server/api/parsers.ts` and register the method in `server/api/routes.ts` (depends on T027)
- [X] T031 [US3] Add the `reopenDay` client method to `src/entities/planning/api/http/http-planning-repository.ts` and its test in `http-planning-repository.test.ts` (depends on T027)
- [X] T032 [US3] Create the `src/features/reopen-day/` slice — `model/use-reopen-day.ts` and `ui/ReopenDayDialog.tsx` with a confirmation step — following the shape of `src/features/close-day/` (depends on T031)
- [X] T033 [US3] Replace «Повторное открытие недоступно.» at `src/pages/day/ui/DayPage.tsx:299` with the reopen action, and show the blocking reason when the day's week is completed (FR-014) (depends on T032)
- [X] T034 [P] [US3] UI tests in `src/features/reopen-day/ui/ReopenDayDialog.test.tsx` and `src/pages/day/ui/DayPage.test.tsx` for the action, the confirmation, and the explained-unavailable state
- [X] T035 [US3] E2E journey in `e2e/journeys/04-day-closure.spec.ts`: close → reopen → correct an outcome → close again, asserting the corrected result (FR-010)
- [X] T036 [P] [US3] Record the reopen action and the removed "Повторное открытие недоступно" copy in `DESIGN.md` (declared deviation, constitution II)
- [X] T037 [P] [US3] Update `src/pages/week/ui/WeekPage.tsx` and `src/pages/history/ui/HistoryPage.tsx` so a reopened day renders as open with a live result, and update their tests (FR-010)

**Checkpoint**: Closing a day is reversible; all three surfaces reflect it immediately

---

## Phase 6: User Story 4 - Every item counts the same (Priority: P2)

**Goal**: Replace the fixed 70/30 task/habit split with one weight per item, and rescale the
existing frozen history to match (owner decision D2).

**Independent Test**: A day with 9 completed tasks and 1 missed habit reports 90%; a day with
1 completed task and 3 missed habits reports 25%; a day with nothing applicable reports «нет
данных», not 0%.

**Depends on**: US2 (one derivation) and T003 (backup script, before the migration runs)

### Tests for User Story 4

- [X] T038 [P] [US4] Domain test table in `src/entities/planning/model/scoring.test.ts` covering 9 tasks + 1 missed habit → 90, 1 task + 3 missed habits → 25, tasks-only → the task rate, and a zero denominator → `'unavailable'` (FR-016, FR-018)
- [X] T039 [P] [US4] Domain test in `src/entities/planning/model/week-completion.test.ts` that summing days then scoring equals scoring the week's items directly (FR-017)
- [X] T040 [P] [US4] Migration test in `server/db/migrations/migrations.test.ts`: seed closed days and a completed week with 70/30 snapshots whose recomputed value **differs** (e.g. `task 9/9, habit 0/1, value 70` → `90`), then assert the new value, the removal of `weightsApplied`, that every count and `plannedLoadMinutes` is byte-identical, that no other table changed, and that a second run is a no-op (FR-021, FR-022)

### Implementation for User Story 4

- [X] T041 [US4] Change `calculateCompletionScore` in `src/entities/planning/model/scoring.ts` to the single-weight ratio in [data-model.md](./data-model.md) §1, reusing the existing exact `roundHalfUp` over `bigint`
- [X] T042 [US4] Remove `AppliedScoreWeights` and the `weightsApplied` field from `ScoreBreakdown` in `src/entities/planning/model/day.ts` (depends on T041)
- [X] T043 [US4] Run `npm run typecheck` and fix every resulting break across `src/entities/planning/`, `server/planning/`, `src/pages/`, and all test fixtures — `tsc -b` is what guarantees no reader of `weightsApplied` is missed (depends on T042)
- [X] T044 [US4] Implement `server/db/migrations/002-single-weight-snapshots.ts` per [data-model.md](./data-model.md) §5: recompute `value` in `days.closure_snapshot` and `weeks.completion_snapshot` from the counts each snapshot already holds, remove `weightsApplied`, touch nothing else, and be idempotent
- [X] T045 [US4] Register `002-single-weight-snapshots` in the `MIGRATIONS` map in `server/db/migrations/index.ts` (depends on T044)
- [X] T046 [P] [US4] Replace the «Формула: задачи 70%, привычки 30%» explainer in `src/entities/planning/ui/ScoreBreakdown.tsx` with the single-weight description, and update `ScoreBreakdown.test.tsx` (FR-020)
- [X] T047 [P] [US4] Replace the «Результат 70/30» legend in `src/pages/history/ui/HistoryPage.tsx:498` (FR-020)
- [X] T048 [P] [US4] Record both copy changes in `DESIGN.md` (declared deviations, constitution II)
- [X] T049 [US4] Verify no user-facing text describes a 70/30 split: `grep -rn "70/30\|задачи 70\|привычки 30" src/` returns no hits (SC-006) (depends on T046, T047)
- [X] T050 [US4] Run the migration against a restored copy of `orbit-pre-003.dump` and confirm the three real closed days keep their counts and `plannedLoadMinutes` and lose only `weightsApplied` (depends on T002, T045)

**Checkpoint**: One weight per item everywhere, and the existing history reads on the same scale

---

## Phase 7: User Story 5 - Tasks carry written detail (Priority: P2)

**Goal**: Let the owner open a task note in a focused modal and write free text. The `notes` field already
exists end-to-end in the domain and database and is simply never rendered
([research.md](./research.md) Decision 9) — no schema change is needed.

**Independent Test**: Open a task note from the row action, write and save it, reload the page,
read it back in the modal; then clear it and confirm it is gone after a reload.

**Depends on**: nothing — fully independent

### Tests for User Story 5

- [X] T051 [P] [US5] Domain tests in `src/entities/planning/model/task-lifecycle.test.ts` for the three note cases: `undefined` preserves, a string sets, `null` clears, and whitespace-only canonicalises to cleared (FR-024)
- [X] T052 [P] [US5] UI tests in `src/entities/planning/ui/TaskRow.test.tsx`: the row action opens an editable modal on an open day, a read-only modal on a closed day, and a task carrying a note shows the indicator (FR-025, FR-026)

### Implementation for User Story 5

- [X] T053 [US5] Change `EditTaskOccurrenceInput.notes` to `string | null` in `src/entities/planning/model/planning-repository.ts` per [contracts/planning-api.md](./contracts/planning-api.md) §2
- [X] T054 [US5] Implement clearing in `prepareTaskEdit` at `src/entities/planning/model/task-lifecycle.ts:387`, replacing the `notes === undefined ? {} : { notes }` pattern with the tri-state used by `startTime`/`endTime` (depends on T053)
- [X] T055 [US5] Accept the nullable note in `parseEditTaskOccurrence` in `server/api/parsers.ts:549` and pass it through `server/planning/tasks.ts` (depends on T053)
- [X] T056 [US5] Add a compact note action beside the completion controls, an accessible note modal, and the note-exists indicator to `src/entities/planning/ui/TaskRow.tsx`, with styles in `src/app/styles/global.css`
- [X] T057 [US5] Wire note editing and clearing through `src/features/manage-task/model/use-manage-task.ts` and `src/features/manage-task/ui/TaskEditorDialog.tsx` (depends on T054, T056)
- [X] T058 [US5] Confirm the same note renders on the Day page, the Week planner, the Backlog, and History — these all render `TaskRow`, so add assertions to `src/pages/day/ui/DayPage.test.tsx`, `src/pages/week/ui/WeekPage.test.tsx`, `src/pages/backlog/ui/BacklogPage.test.tsx`, and `src/pages/history/ui/HistoryPage.rendered.test.tsx` rather than new components (FR-028)
- [X] T059 [US5] E2E in `e2e/journeys/02-task-execution.spec.ts`: write a note, reload, read it back, clear it, reload, confirm it is gone

**Checkpoint**: Tasks carry editable text everywhere they are listed, read-only where the period is frozen

---

## Phase 8: User Story 6 - Habits can carry a duration (Priority: P2)

**Goal**: Let a habit optionally carry a duration that counts toward the day's planned load,
without affecting any percentage and without moving any closed day's frozen load.

**Independent Test**: Give a habit that applies today a 45-minute duration; today's planned
load grows by exactly 45 minutes, no percentage changes, and an already-closed day containing
that habit shows its unchanged frozen load.

**Depends on**: nothing — fully independent

### Tests for User Story 6

- [X] T060 [P] [US6] Domain tests in `src/entities/planning/model/planned-load.test.ts`: a habit with a duration adds to the day's load, one without adds nothing, and no score value changes (FR-030, FR-031, FR-033)
- [X] T061 [P] [US6] Server test in `server/planning/repository.daily-signals.test.ts` that `updateHabitDuration` updates occurrences on **open** days only and leaves closed days' `closure_snapshot.plannedLoadMinutes` untouched (FR-034)

### Implementation for User Story 6

- [X] T062 [US6] Implement `server/db/migrations/003-habit-duration.ts` adding the nullable `habit_definitions.duration_minutes` column with `CHECK (duration_minutes IS NULL OR duration_minutes > 0)`, and register it in `server/db/migrations/index.ts` (data-model §6)
- [X] T063 [US6] Add `duration_minutes` to `HabitDefinitionsTable` in `server/db/schema.ts` and map it in `server/planning/mappers.ts` (depends on T062)
- [X] T064 [P] [US6] Add `durationMinutes?: DurationMinutes` to `HabitDefinition` and `HabitDefinitionSnapshot` in `src/entities/planning/model/habit.ts`
- [X] T065 [US6] Extend `calculatePlannedLoad` in `src/entities/planning/model/planned-load.ts` to take habit occurrences and sum `definitionSnapshot.durationMinutes` for applicable ones, and update its callers in `selectors.ts` and `day-closure.ts` (depends on T064)
- [X] T066 [US6] Capture the definition's current duration when materializing a habit occurrence in `src/entities/planning/model/occurrence-materialization.ts`, as its title already is (depends on T064)
- [X] T067 [US6] Add `durationMinutes` to `CreateHabitDefinitionInput`, add nullable `durationMinutes` to `EditHabitOccurrenceInput`, and add `UpdateHabitDurationInput` + `updateHabitDuration` to `src/entities/planning/model/planning-repository.ts` per [contracts/planning-api.md](./contracts/planning-api.md) §§3–5
- [X] T068 [US6] Implement create, per-occurrence edit, and `updateHabitDuration` with propagation to open days only in `server/planning/habits.ts`, and wire into `server/planning/postgres-planning-repository.ts` (depends on T063, T067)
- [X] T069 [US6] Add the parsers to `server/api/parsers.ts`, register `updateHabitDuration` in `server/api/routes.ts`, and add the client method to `src/entities/planning/api/http/http-planning-repository.ts` (depends on T067)
- [X] T070 [US6] Add the optional duration field to `src/features/manage-habit/ui/HabitRecurrenceDialog.tsx` and wire it through `src/features/manage-habit/model/use-manage-habit.ts`, reusing the task duration input (depends on T069)
- [X] T071 [US6] Display the duration in `src/entities/planning/ui/HabitRow.tsx` using the same presentation as a task's duration (FR-032)
- [X] T072 [P] [US6] UI tests in `src/features/manage-habit/ui/HabitRecurrenceDialog.test.tsx` and `src/entities/planning/ui/HabitRow.test.tsx` for setting, clearing, and displaying the duration
- [X] T073 [US6] Confirm the planned-load figures on the Day page and in the Week planner day summaries include habit durations, and update `src/pages/day/ui/DayPage.test.tsx` and `src/pages/week/ui/WeekPage.test.tsx`

**Checkpoint**: Planned load reflects habits; no score and no frozen day moved

---

## Phase 9: User Story 7 - History dynamics always reflects the period (Priority: P2)

**Goal**: Make each chart point represent its whole period instead of one selected day. Root
cause is proven and confined to one client file ([research.md](./research.md) Finding A3).

**Independent Test**: In month mode, select an empty day inside a month that contains recorded
work — the chart still shows that month's aggregated values.

**Depends on**: US4 (the values it charts)

### Tests for User Story 7

- [X] T074 [P] [US7] Test in `src/pages/history/model/use-history-page.test.tsx` that a month point aggregates the month's days and is unaffected by which day is selected (FR-035, FR-037)
- [X] T075 [P] [US7] Test in `src/pages/history/ui/HistoryPage.rendered.test.tsx` that a range mixing empty and non-empty periods draws the chart with the empty periods as gaps, and shows the empty state only when every period is empty (FR-038, FR-039)

### Implementation for User Story 7

- [X] T076 [US7] Fix `scoreOf` in `src/pages/history/model/use-history-page.ts:37` so month mode aggregates the month's days instead of reading `view.selectedDay.score`. Preferred shape per [research.md](./research.md) Decision 4: add `progress: ScoreBreakdown` to `HistoryMonthView` computed by `selectHistoryView` in `src/entities/planning/model/selectors.ts` with the existing `aggregateHistoricalProgress` helper, keeping aggregation in the domain layer alongside the week rule
- [X] T077 [US7] Fix the sampling loop in `src/pages/history/model/use-history-page.ts:81-99` so each sampled historical period is aggregated rather than anchored on its own single day (depends on T076)
- [X] T078 [US7] Move the `hasData` guard in `src/pages/history/ui/HistoryPage.tsx:477` from whole-chart to per-point, keeping the empty state only for an entirely empty range (depends on T077)
- [X] T079 [US7] Confirm the legend text updated in T047 in `src/pages/history/ui/HistoryPage.tsx` reads correctly against the new aggregated points, and assert it in `src/pages/history/ui/HistoryPage.rendered.test.tsx` (depends on T047, T078)

**Checkpoint**: The dynamics chart is independent of the selected day

---

## Phase 10: User Story 8 - Expand the whole week at once (Priority: P3)

**Goal**: One control that expands or collapses all seven planner days.

**Independent Test**: Activate the control — all seven days expand; activate it again — all
seven collapse; then collapse one day individually and confirm the others stay expanded.

**Depends on**: nothing — fully independent, smallest scope in the feature

- [X] T080 [US8] Add the expand-all / collapse-all control to the planner header in `src/pages/week/ui/WeekPage.tsx`, setting the existing `expandedPlannerDays` state (`WeekPage.tsx:180`) to all seven dates or the empty set, with a label stating what it will do next (FR-040, FR-041)
- [X] T081 [P] [US8] UI test in `src/pages/week/ui/WeekPage.test.tsx` for expand-all, collapse-all, the label, and that individual toggling still works afterwards (FR-042)
- [X] T082 [US8] E2E assertion in `e2e/journeys/01-week-planning.spec.ts` that all seven days expand in one interaction (SC-010)
- [X] T083 [P] [US8] Record the new planner control in `DESIGN.md`

**Checkpoint**: All eight user stories are independently functional

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T084 Run `npm run verify` and `npm run test:server:tz`; both must pass with `--max-warnings 0` (constitution IV)
- [X] T085 Run `npm run test:visual` and approve or fix the baselines for the changed surfaces (score explainer, task row, habit row, day card, week planner, history chart)
- [X] T086 [P] Run `npm run test:coverage` and confirm the thresholds in `vitest.config.ts` still pass and coverage has not regressed against the baseline recorded in `specs/003-planning-refinements/baseline.md`
- [X] T087 Execute the full [quickstart.md](./quickstart.md) §4 scenario validation, 4.1 through 4.7, against the live instance
- [X] T088 [P] Write `specs/003-planning-refinements/traceability.md` mapping each of FR-001–FR-042 to the test assertions that prove it, following the 002 artifact
- [X] T089 [P] Write `specs/003-planning-refinements/verification.md` recording each of SC-001–SC-011 with its evidence, and stating explicitly which criteria are proven directly and which by proxy, following the 002 artifact
- [X] T090 Update the **Status** line in `specs/003-planning-refinements/spec.md` from `Draft` to implemented-and-verified, and confirm every declared design deviation in `plan.md` has a matching `DESIGN.md` change (constitution II, V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup. **T003 blocks Phase 6.**
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on Foundational. **Blocks US3 and US4.**
- **US3 (Phase 5)**: depends on US2
- **US4 (Phase 6)**: depends on US2 and T003
- **US5 (Phase 7)**: depends on Foundational only
- **US6 (Phase 8)**: depends on Foundational only
- **US7 (Phase 9)**: depends on US4
- **US8 (Phase 10)**: depends on Foundational only
- **Polish (Phase 11)**: depends on every story that is being shipped

### User Story Dependency Graph

```
Setup ─► Foundational ─┬─► US1 (P1, persistence proof)
                       │
                       ├─► US2 (P1, one derivation) ─┬─► US3 (P1, reopen day)
                       │                             └─► US4 (P2, single weight) ─► US7 (P2, dynamics)
                       ├─► US5 (P2, task notes)
                       ├─► US6 (P2, habit duration)
                       └─► US8 (P3, expand all)
```

US3 and US4 are mutually independent — either order works. Priority order puts US3 first;
the sequence table in [plan.md](./plan.md) puts US4 first. Both are correct.

### Within Each User Story

- Tests are written first and must fail before the implementation tasks in the same phase
- Domain (`src/entities/planning/model/`) before server (`server/planning/`) before client
- Contract types (`planning-repository.ts`) before both the server and the client that implement them
- Copy and `DESIGN.md` changes land with the code that causes them, never after

### Parallel Opportunities

- **Phase 2**: T004 and T005 in parallel
- **US1**: T006, T007, T008 in parallel
- **US2**: T013, T014, T015 in parallel; T016 must complete before T017–T020
- **US3**: T022, T023, T024 in parallel; T025 in parallel with them; T034, T036, T037 in parallel at the end
- **US4**: T038, T039, T040 in parallel; T046, T047, T048 in parallel after T043
- **US5**: T051, T052 in parallel
- **US6**: T060, T061 in parallel; T064 in parallel with T062/T063
- **US7**: T074, T075 in parallel
- **Across stories**: once Phase 2 is done, US1, US2, US5, US6, and US8 can all proceed at once

---

## Parallel Example: User Story 2

```bash
# Write the three failing tests together:
Task: "Domain test: closure counts equal live counts in src/entities/planning/model/day-closure.test.ts"
Task: "Domain test: moved/cancelled tasks stay in the denominator in src/entities/planning/model/day-closure.test.ts"
Task: "Server contract test: three surfaces agree in server/planning/repository.day-closure.test.ts"

# Then the implementation is sequential — T016 is the seam the rest depend on.
```

## Parallel Example: User Story 6

```bash
# Domain type change and the schema migration touch different trees:
Task: "Add durationMinutes to HabitDefinition/Snapshot in src/entities/planning/model/habit.ts"
Task: "Add 003-habit-duration migration in server/db/migrations/003-habit-duration.ts"
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 → Phase 2 → Phase 3
2. **STOP and VALIDATE**: run [quickstart.md](./quickstart.md) §1 — data survives a browser
   close, a date boundary, and a rebuild, and a restore path exists
3. This is shippable on its own: it changes no behavior and makes the store demonstrably safe,
   which is the precondition for everything else

### Recommended increments

| Increment | Phases | Delivers |
| --------- | ------ | -------- |
| 1 (MVP) | 1, 2, 3 | Persistence proven and protected |
| 2 | 4 | Closed-day counts agree everywhere; the `getWeekView` defect fixed |
| 3 | 5 | A closed day can be reopened |
| 4 | 6, 9 | Single weight, history rescaled, dynamics fixed |
| 5 | 7, 8, 10 | Task notes, habit duration, expand-all |
| 6 | 11 | Verification and closure |

Increments 2 and 3 are the two remaining P1 stories. Increment 4 is the largest behavioral
change and the only one that touches stored data — it is deliberately placed after the backup
path and the persistence proof exist.

### Parallel Team Strategy

After Phase 2, three tracks can run at once:

- Track A: US2 → US3 → US4 → US7 (the scoring and closure spine — strictly ordered)
- Track B: US5 (task notes)
- Track C: US6 (habit duration) then US8 (expand all)

US1 is small enough to be finished before the tracks split.

---

## Notes

- **`docker compose down -v` is forbidden in this feature.** It destroys the volume that holds
  the owner's data.
- The habit date-boundary indicator proposed in [research.md](./research.md) Decision 2 was
  **rejected by the owner on 2026-08-22**: the automatic pending → «не выполнено» transition
  keeps its current behavior, and no marker distinguishing a system-generated outcome from a
  user-generated one is added. No task in this list may introduce one.
- T012 is time-boxed on purpose. [research.md](./research.md) Finding A2 already disproved the
  obvious causes of the reported «0 из N»; the story delivers its requirement through the
  proven `getWeekView` fix and the FR-008 invariant regardless of what T012 finds.
- `[P]` means different files and no dependency on incomplete work.
- Commit after each task or logical group; stop at any checkpoint to validate a story on its own.

---

## Phase 12: Convergence

**Purpose**: Close the implementation/documentation gaps found by the post-implementation
conformance audit without changing the approved product decisions or expanding the E2E matrix.

- [X] T091 [US5] Complete task-note visibility on every required surface (FR-025, FR-028, SC-007): add the same compact modal note action for note-bearing tasks in `src/pages/backlog/ui/BacklogPage.tsx` and the task facts in `src/pages/history/ui/HistoryPage.tsx`, keep History and every other immutable period read-only, do not grant editing outside the existing open-day rule, and add direct note assertions for Day, Week, Backlog, and History in `src/pages/day/ui/DayPage.test.tsx`, `src/pages/week/ui/WeekPage.test.tsx`, `src/pages/backlog/ui/BacklogPage.test.tsx`, and `src/pages/history/ui/HistoryPage.rendered.test.tsx`
- [X] T092 [US6] Display each habit occurrence's `definitionSnapshot.durationMinutes` wherever habits are listed (US6 acceptance scenario 4, FR-032): add the formatted duration to the Week habit matrix in `src/pages/week/ui/WeekPage.tsx` and History habit facts in `src/pages/history/ui/HistoryPage.tsx`, preserve the snapshot semantics for already-closed days, and add Day/Week/History page assertions proving both the duration display and the duration-inclusive planned-load figures
- [X] T093 [P] [US3] Correct the stale limitation in `README.md:246`: state that a closed day can be reopened, while a day inside a completed week is refused with an explanation and reopening a completed week remains out of scope (FR-009, FR-014)
- [X] T094 [P] [US3] Add the missing focused suite `src/features/reopen-day/ui/ReopenDayDialog.test.tsx` promised by T034, covering the D1 warning copy, cancel behavior, successful confirmation/close, and a failed confirmation that keeps the dialog open; retain the existing Day-page test for the completed-week refusal
- [X] T095 [P] [US3] Align future `closure-reopen` audit payloads with `specs/003-planning-refinements/data-model.md` §3 and T025 by removing the unapproved `restoredFrom` field from `TaskEventPayloadByType`, `prepareDayReopening`, and their assertions while preserving `{ date }`, one event per restored occurrence, and event ordering; do not rewrite or delete any existing audit row that may contain an extra JSON key
- [X] T096 [P] [US2] Reconcile the shared-counting touchpoint with the implemented cycle-safe design: update the source inventory and rationale in `specs/003-planning-refinements/plan.md`, and add a completion note adjacent to T016 explaining why `dayCompletionCounts` lives in `src/entities/planning/model/day-counts.ts` instead of `scoring.ts`; keep the single pure-domain derivation and do not introduce an import cycle
- [X] T097 Run `npm run verify`, `npm run test:server:tz`, and `npm run test:visual` after T091-T096; keep Playwright retries disabled and the functional journeys single-run on desktop, record the observed E2E duration, then correct `specs/003-planning-refinements/traceability.md` and `specs/003-planning-refinements/verification.md` so FR-028, FR-032, T034, SC-007, the final counts, and the final gate evidence reference only files and assertions that actually exist

**Checkpoint**: Every FR and acceptance scenario is implemented on all named surfaces, stored
shapes and documentation match the approved artifacts, and the optimized quality gates pass.
