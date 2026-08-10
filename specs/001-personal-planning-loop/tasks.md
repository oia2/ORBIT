# Tasks: ORBIT Personal Planning Loop

**Input**: Design documents from `specs/001-personal-planning-loop/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `usability-protocol.md`, `design-reconciliation.md`, `.specify/memory/constitution.md`, and `DESIGN.md`

**Tests**: Required. The specification defines mandatory automated scenarios and measurable outcomes; tests are written before their corresponding implementation and must fail for the intended missing behavior.

**Organization**: Tasks are grouped by user story so each story forms an independently testable vertical increment. Pure-domain and nonvisual persistence work may proceed while the Open Design gate is blocked; every affected visual, component, browser-journey, or other UI task explicitly waits for T001 to succeed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Safe to execute in parallel after its stated prerequisites because it touches different files and has no dependency on unfinished work in the same batch
- **[Story]**: Maps a task to US1 through US7; setup, foundational, and polish tasks have no story label
- Every task names concrete repository-relative file paths

## Path Conventions

- Application source: `src/`
- Colocated domain, adapter, and component tests: beside their source files
- Shared deterministic fixtures/setup: `tests/`
- Browser fixtures and journeys: `e2e/`
- Feature evidence and governance records: `specs/001-personal-planning-loop/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the serialized design gate and the independently executable single-package toolchain.

- [ ] T001 Retry the mandatory serialized fresh read-only Open Design pull for Weekly Dashboard, Daily View, History, shared flow assets, and the ORBIT design system; record project/artifact identifiers, source versions/availability or the exact failure in specs/001-personal-planning-loop/design-reconciliation.md; compare current sources with DESIGN.md, specs/001-personal-planning-loop/spec.md, and specs/001-personal-planning-loop/contracts/ui-routes.md; settle Daily Score/Weekly Progress color/status/presentation semantics, History mode-switch anchor behavior, unequal-month selected-day behavior, Dynamics applicability/presentation, and generated-recurring-task insertion position; verify that the ban on automatic load/capacity/overload thresholds is not treated as a general ban on score visual semantics; obtain product-owner approval for every significant deviation; update and revalidate every affected governing artifact before dependent UI work; if unavailable, record the failure without claiming a pass and leave affected visual/component/browser work blocked
- [ ] T002 Scaffold the nonvisual React 19.2.7+/TypeScript 6/Vite 8.1 single package, pin React Router 8.3, idb 8, testing, linting, and formatting dependencies, declare Node.js 22.22+, implement the complete quickstart script contract, and commit the lockfile in package.json, package-lock.json, index.html, and src/main.tsx
- [ ] T003 [P] Configure strict TypeScript, project references, browser types, the `@/` alias, and Vite production resolution in tsconfig.json, tsconfig.app.json, tsconfig.node.json, vite.config.ts, and src/vite-env.d.ts
- [ ] T004 [P] Configure type-aware flat ESLint with FSD layer/deep-import, React, Hooks, Refresh, and JSX-accessibility rules plus Prettier and generated-output ignores in eslint.config.js, .prettierrc.json, .prettierignore, and .gitignore
- [ ] T005 [P] Configure isolated Node/jsdom Vitest projects, V8 coverage including untested source, critical-policy thresholds, fake IndexedDB, and jest-dom setup while excluding e2e/** in vitest.config.ts and tests/setup/vitest.setup.ts
- [ ] T006 [P] Configure Playwright production-preview projects for keyboard desktop Chromium at 1440px and touch tablet/mobile WebKit at 820px/390px, axe support, isolated e2e discovery, and nonvisual seed/reset fixture plumbing in playwright.config.ts and e2e/fixtures/orbit.fixture.ts

**Checkpoint**: Toolchain commands can install, format, lint, type-check, test, and build the empty SPA. T001 may remain blocked without preventing toolchain, pure-domain, contract, or nonvisual adapter work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared value types, serializable records, repository boundaries, IndexedDB infrastructure, bootstrap state, fixtures, and—only after T001 succeeds—the common visual shell.

**CRITICAL**: T007–T022 form the nonvisual foundation for story model/adapter work. T023–T027 additionally require successful T001 and block all story component/page/browser implementation. Do not implement task lifecycle, recurrence, scoring, closure, weekly review, or History selector policy in this phase.

### Tests for the Foundation

- [ ] T007 [P] Write failing table tests for valid/invalid LocalDate values, Monday-first week derivation, date arithmetic across month/year boundaries, local-date comparison, injected-clock behavior, and canonical route/date builders in src/shared/lib/local-date/local-date.test.ts, src/shared/lib/local-date/clock.test.ts, and src/app/routes/paths.test.ts
- [ ] T008 [P] Write failing tests for UUID/typed identifiers, revisions, EventSequence, CreationSequence, DayPosition, integer/duration validation, Result helpers, and exhaustive matching in src/shared/lib/ids/index.test.ts and src/shared/lib/result/index.test.ts
- [ ] T009 [P] Write failing version-1 schema/index, empty-database migration, close/reopen, versionchange, terminated, and blocked-upgrade tests for all eight stores in src/entities/planning/api/indexeddb/migrations.test.ts
- [ ] T010 [P] Write failing adapter-foundation tests for tx.done success boundaries, total rollback, revision/immutable guards, injected instants, created/event sequence allocation, error normalization, and prohibition on automatic database reset in src/entities/planning/api/indexeddb/indexeddb-planning-repository.foundation.test.ts
- [ ] T011 [P] Write failing non-React bootstrap-resource tests for initializing, ready, persistent-storage denial, storage unavailable, blocked, terminated, retry, and adapter disposal in src/app/runtime/create-app-runtime.test.ts

### Implementation for the Nonvisual Foundation

- [ ] T012 Implement validated LocalDate values, Monday-through-Sunday helpers, date-only arithmetic/comparison, presentation boundaries, and an injected application clock in src/shared/lib/local-date/local-date.ts and src/shared/lib/local-date/clock.ts
- [ ] T013 [P] After T008 has been observed failing for the intended missing behavior, implement UUID/typed identifier generation, revisions, sequences, positions, Result helpers, integer/duration validators, and exhaustive matching in src/shared/lib/ids/index.ts and src/shared/lib/result/index.ts
- [ ] T014 Define plain serializable Week, Day, TaskSeries, TaskOccurrence, TaskPlanEntry, TaskEvent, HabitDefinition, HabitOccurrence, recurrence-version, Daily Score/Weekly Progress snapshot, and History projection records with exhaustive specification outcomes and no `partial`/`suppressed` product value in src/entities/planning/model/week.ts, src/entities/planning/model/day.ts, src/entities/planning/model/task.ts, src/entities/planning/model/habit.ts, src/entities/planning/model/recurrence.ts, and src/entities/planning/model/history.ts
- [ ] T015 [P] After T010 has been observed failing for the intended missing contract, define CommandResult receipts, every contracted validation/lifecycle/storage failure, query/command DTOs that cannot supply audit timestamps or recurrence effective dates, and the use-case-only PlanningRepository port with no generic CRUD/browser objects in src/entities/planning/model/planning-repository.ts
- [ ] T016 [P] After T009 has been observed failing for the intended missing schema, define the `orbit-planning` version-1 DBSchema for weeks, days, taskSeries, taskOccurrences, taskPlanEntries, taskEvents, habitDefinitions, and habitOccurrences with every required unique/compound index in src/entities/planning/api/indexeddb/schema.ts
- [ ] T017 Implement sequential migrations plus blocked/versionchange/terminated connection handling and controlled closing without automatic reset in src/entities/planning/api/indexeddb/migrations.ts and src/entities/planning/api/indexeddb/database.ts
- [ ] T018 Implement exhaustive record/DTO mappings for date-only values, placements, rule versions, embedded habit events, snapshots, and allowed outcomes while excluding browser handles and user-visible internal markers in src/entities/planning/api/indexeddb/mappers.ts
- [ ] T019 Implement the IndexedDB adapter transaction/result skeleton with injected clock, lifecycle/revision rechecks, sequence allocation, tx.done success, atomic abort, typed failure mapping, and no story policy in src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts
- [ ] T020 Implement synchronous creation of the observable bootstrap resource, database open, adapter factory, best-effort persistent-storage request, retry, and disposal in src/app/runtime/create-app-runtime.ts
- [ ] T021 [P] After the route-builder cases in T007 have been observed failing, implement canonical route/date builders and root/current-week derivation without rendering behavior in src/app/routes/paths.ts
- [ ] T022 [P] Create deterministic clock, ID, week/day, task, habit, snapshot, revision, and repository-failure builders plus the shared browser seed/reset contract in tests/fixtures/planning.ts and e2e/fixtures/orbit.fixture.ts

### Tests and Implementation for the Visual Foundation (after T001 succeeds)

- [ ] T023 [P] After T001 succeeds, write failing provider tests for initialization, ready context, nonfatal persistence denial, blocked/reload-required, storage failure, retry, accurate device/profile locality copy, and correct status versus alert announcements in src/app/providers/AppProviders.test.tsx
- [ ] T024 [P] After T001 succeeds, write failing responsive-shell/router tests for root and non-Monday redirects, canonical week/day/backlog/History navigation, malformed dates, Russian labels, 44px targets, keyboard focus, reduced motion, non-color status, and complete absence of workout navigation in src/app/routes/AppRouter.test.tsx and src/app/layout/AppShell.test.tsx
- [ ] T025 After T001 succeeds and T024 has been observed failing for the intended missing shell/control behavior, implement reconciled tokens/reset/focus/reduced-motion foundations and only the required accessible shared controls with explicit public APIs in src/shared/styles/orbit-tokens.css, src/app/styles/global.css, src/shared/ui/button/Button.tsx, src/shared/ui/button/index.ts, src/shared/ui/dialog/Dialog.tsx, src/shared/ui/dialog/index.ts, src/shared/ui/form-field/FormField.tsx, src/shared/ui/form-field/index.ts, src/shared/ui/icon/Icon.tsx, src/shared/ui/icon/index.ts, src/shared/ui/orbit-metric/OrbitMetric.tsx, and src/shared/ui/orbit-metric/index.ts
- [ ] T026 After T001 succeeds and T023 has been observed failing for the intended missing behavior, implement the ready-repository React context/provider/hook and startup provider states without exposing IndexedDB details or reporting failed writes as saved in src/entities/planning/api/repository-context.tsx, src/entities/planning/index.ts, src/app/providers/AppProviders.tsx, and src/main.tsx
- [ ] T027 After T001 succeeds, T023 passes, T024 has been observed failing for the intended missing shell/router behavior, and T025–T026 are complete, implement canonical routing, neutral invalid/not-found states, and the reconciled Russian desktop/compact/mobile shell with Week, Day, Backlog, and History only; make T024 pass in src/app/routes/AppRouter.tsx, src/app/layout/AppShell.tsx, src/app/layout/AppShell.module.css, src/pages/not-found/ui/NotFoundPage.tsx, and src/pages/not-found/index.ts

**Checkpoint**: Nonvisual stories can use tested domain/persistence seams. After T001 succeeds, the responsive Russian shell starts through the same repository boundary without workout navigation.

---

## Phase 3: User Story 1 — Plan a Calendar Week (Priority: P1) MVP

**Goal**: Work in the unique fixed Monday–Sunday week, manage free-form ordered goals, plan dated/backlog tasks, and see consistent factual load in Week and Day views.

**Independent Test**: Open the canonical week for any date, create/rename/reorder/delete goals with boundary trimming, whitespace-only rejection, and preserved internal content; create tasks with positive dated durations; assign/reorder them across days; and verify matching goals/tasks/load across Week and Day with no overlapping week, measurability validator, numeric goal progress, capacity, or overload classification.

### Tests for User Story 1

- [ ] T028 [P] [US1] Write failing tests for canonical Monday week identity, exactly seven owned days, idempotent ensure, ordered weekly-goal CRUD/reorder with leading/trailing trimming, whitespace-only rejection, internal whitespace/content preservation, completed-week guards, and absence of measurability/numeric-progress policy in src/entities/planning/model/week.test.ts
- [ ] T029 [P] [US1] Write failing tests for first committed dated membership, positive dated duration, direct-backlog optional duration/no membership, explicit dated ordering, current duration-only load, and consistent Week/Day planning projections in src/entities/planning/model/task.test.ts and src/entities/planning/model/planned-load.test.ts
- [ ] T030 [P] [US1] Write failing fake-IndexedDB tests for ensureCalendarWeek, goal CRUD/reorder with canonical boundary-trimmed persistence and whitespace-only rejection, one-off dated/backlog task creation/edit/reorder, database-sequenced create/edit events, creation sequence, unique occurrence/date membership, getWeekView/getDayView/getBacklogView, revision receipts, reload, and no arbitrary week or backlog-order state in src/entities/planning/api/indexeddb/indexeddb-planning-repository.us1.test.ts
- [ ] T031 [P] [US1] After T001 succeeds and T030 stabilizes contracts, write failing accessible Week/Day component tests for fixed week presentation, goal CRUD/reorder with trimming, whitespace-only errors, and preserved internal content, no measurability/numeric-progress control, positive-duration task planning, factual load with no automatic load/capacity/overload threshold or classification copy, loading/empty/storage-error recovery, and keyboard/touch operation in src/pages/week/ui/WeekPage.test.tsx and src/pages/day/ui/DayPage.test.tsx
- [ ] T032 [P] [US1] After T001 succeeds and T022 provides the fixture, write the failing three-viewport week-planning journey covering goal CRUD/reorder, dated task placement/order, Week/Day consistency, factual load, reload, no account, keyboard desktop, and touch tablet/mobile in e2e/journeys/01-week-planning.spec.ts

### Implementation for User Story 1

- [ ] T033 [US1] Implement fixed-week/day creation, weekly-goal boundary trimming, whitespace-only rejection, internal whitespace/content preservation and ordering, one-off task planning records, dated membership creation/reuse, direct-backlog creation, and dated-order policy in src/entities/planning/model/week.ts, src/entities/planning/model/day.ts, and src/entities/planning/model/task.ts
- [ ] T034 [US1] Implement the single factual planned-load calculation plus open Week/Day/Backlog planning selectors with planned-versus-current labels in src/entities/planning/model/planned-load.ts and src/entities/planning/model/selectors.ts
- [ ] T035 [US1] Implement ensureCalendarWeek, canonical boundary-trimmed weekly-goal persistence with whitespace-only rejection and otherwise preserved internal content across create/edit plus goal reorder/delete, createTask, editTaskOccurrence, reorderDatedTasks, and Week/Day/Backlog queries with atomic revisions, database-sequenced create/edit events, creation sequence, membership uniqueness, and no arbitrary week/backlog sort state in src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts
- [ ] T036 [P] [US1] After T001 succeeds, T031–T032 have been observed failing, and T035 passes, implement accessible weekly-goal create/edit-or-rename/reorder/delete orchestration with boundary trimming, whitespace-only validation feedback, preserved internal content, and no numeric progress or measurability validation in src/features/manage-week/model/use-manage-week.ts, src/features/manage-week/ui/WeekEditorDialog.tsx, and src/features/manage-week/index.ts
- [ ] T037 [P] [US1] After T001 succeeds, T031–T032 have been observed failing, and T035 passes, implement one-off dated/backlog task planning, positive-duration validation, dated reorder, draft preservation, and committed receipts in src/features/manage-task/model/use-manage-task.ts, src/features/manage-task/ui/TaskEditorDialog.tsx, and src/features/manage-task/index.ts
- [ ] T038 [P] [US1] After T001 succeeds, T031–T032 have been observed failing, and T034 passes, implement reusable planned-task and lifecycle-status presentation with textual/non-color state in src/entities/planning/ui/TaskRow.tsx, src/entities/planning/ui/PeriodStatus.tsx, and src/entities/planning/index.ts
- [ ] T039 [US1] After T001 succeeds and T036–T038 pass, implement the responsive Week page with ordered goals, seven day summaries, dated ordering, factual per-day load, loading/empty/error recovery, and commit-triggered re-query in src/pages/week/model/use-week-page.ts, src/pages/week/ui/WeekPage.tsx, src/pages/week/ui/WeekPage.module.css, and src/pages/week/index.ts
- [ ] T040 [US1] After T001 succeeds and T039 passes, implement the responsive Day page with planned tasks, positive-duration validation, current factual load, commit-triggered re-query, and canonical Week/Day route integration in src/pages/day/model/use-day-page.ts, src/pages/day/ui/DayPage.tsx, src/pages/day/ui/DayPage.module.css, src/pages/day/index.ts, and src/app/routes/AppRouter.tsx

**Checkpoint**: US1 independently plans and reloads one canonical week with consistent goal order, task placement, and factual duration load. This is the suggested MVP increment.

---

## Phase 4: User Story 2 — Execute Tasks Without Rewriting History (Priority: P1)

**Goal**: Check/uncheck, edit, move, backlog, schedule, or permanently delete tasks while preserving unique dated memberships and ordered audit history.

**Independent Test**: Exercise reversible completion, completed edit/delete, movement only after unchecking, A→B→A reuse, oldest-first backlog actions, mixed open/closed deletion, and finalized-period rejection without ordinary cancellation or restoration.

### Tests for User Story 2

- [ ] T041 [P] [US2] Write failing lifecycle truth-table tests for completion check/uncheck, edit/delete while completed, movement rejection until unchecked, dated-destination rejection when closed/equal to the current source date or lacking a positive duration, undated-backlog movement without a period check, backlog-to-date scheduling with required positive duration, no ordinary cancellation/restore, terminal deletion, and closed/completed guards in src/entities/planning/model/task-lifecycle.test.ts
- [ ] T042 [P] [US2] Write failing membership/audit selector tests for A→B→A reuse, repeated/cross-week movement, deterministic sequence order at equal timestamps, backlog oldest-first actions, all-open-membership deletion, closed-membership preservation, and plan-versus-actual explanations in src/entities/planning/model/history.test.ts
- [ ] T043 [P] [US2] Write failing fake-IndexedDB tests for setTaskCompletion(boolean), edit, move-to-date/backlog, rejection of a closed/current-source/non-positive-duration dated destination, undated backlog without a period check, backlog scheduling that requires a positive dated duration, dated reorder, getTaskHistory, event sequence ordering, mixed open/closed deletion, atomic revision bumps/rollback, and immutable errors in src/entities/planning/api/indexeddb/indexeddb-planning-repository.us2.test.ts
- [ ] T044 [P] [US2] After T001 succeeds and T043 stabilizes contracts, write failing accessible component tests for reversible completion, edit/delete while checked, movement-disabled explanation, exclusion of current/closed dated destinations, positive-duration validation and draft preservation for move/schedule-to-date, undated backlog behavior, no ordinary cancel, oldest-first backlog edit/delete/schedule only, no backlog checkbox/reorder/sort/filter, initialization/loading/first-use-empty/data-present/validation-draft/storage/quota/revision/immutable states, conflict reload, and focus recovery in src/features/manage-task/ui/TaskExecution.test.tsx and src/pages/backlog/ui/BacklogPage.test.tsx
- [ ] T045 [P] [US2] After T001 succeeds and T022 provides the fixture, write the failing three-viewport execution journey covering check/uncheck, completed edit/delete, movement rejection until uncheck, same-source/closed/non-positive-duration destination rejection, A→B→A facts, ordinary-cancel absence, undated backlog scheduling that requires a positive dated duration, reload, mixed deletion, and finalized rejection in e2e/journeys/02-task-execution.spec.ts

### Implementation for User Story 2

- [ ] T046 [US2] Implement task transition validation and audit-effect preparation for reversible completion, incomplete-only movement, dated destinations that are open/different from the current source date and have a positive duration, undated backlog without a period check, backlog-to-date positive-duration scheduling, backlog restrictions, terminal deletion, and immutable-period guards in src/entities/planning/model/task-lifecycle.ts
- [ ] T047 [US2] Implement current/history membership and event selectors for unique occurrence/date reuse, deterministic event ordering, plan/disposition/actual separation, backlog creation order, and mixed deletion reach in src/entities/planning/model/history.ts and src/entities/planning/model/selectors.ts
- [ ] T048 [US2] Implement completion, edit, move, backlog scheduling, dated reorder, task-history, and permanent deletion transactions with dated destination open/different-source/positive-duration rechecks, undated backlog handling, source membership retention, destination reuse, event sequencing, all-open-membership exclusion, closed preservation, revisions, and rollback in src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts
- [ ] T049 [US2] After T001 succeeds, implement checkbox/edit/delete/move orchestration and controls with movement blocked until unchecked, current/closed dated destinations excluded, positive-duration validation/draft preservation for every dated move, backlog treated as undated, no ordinary cancellation, typed recovery, and accessible TaskRow actions in src/features/manage-task/model/use-manage-task.ts, src/features/manage-task/ui/TaskExecution.tsx, src/features/manage-task/ui/TaskMoveDialog.tsx, src/features/manage-task/index.ts, src/entities/planning/ui/TaskRow.tsx, and src/entities/planning/index.ts
- [ ] T050 [US2] After T001 succeeds and T049 passes, implement and route the responsive oldest-first Backlog page with edit/delete/schedule only, positive-duration validation/draft preservation when scheduling to a date, no completion/cancel/reorder/sort/filter surface, and explicit initialization/loading/first-use-empty/data-present/validation-draft/storage/quota/revision/immutable recovery states in src/pages/backlog/model/use-backlog-page.ts, src/pages/backlog/ui/BacklogPage.tsx, src/pages/backlog/ui/BacklogPage.module.css, src/pages/backlog/index.ts, and src/app/routes/AppRouter.tsx
- [ ] T051 [US2] After T001 succeeds and T050 passes, integrate current-vs-historical task facts, completion changes, immutable controls, conflict reload, and persistence errors into src/pages/week/ui/WeekPage.tsx, src/pages/day/ui/DayPage.tsx, src/pages/week/model/use-week-page.ts, and src/pages/day/model/use-day-page.ts

**Checkpoint**: US2 independently proves honest task execution, deterministic history, oldest-first backlog semantics, and immutable finalized facts.

---

## Phase 5: User Story 3 — Manage Recurring Occurrences (Priority: P1)

**Goal**: Define recurring tasks/habits, isolate occurrence edits/deletions, apply inclusive D+1 rule changes, and reconcile habit date boundaries auditably and idempotently.

**Independent Test**: Generate through an inclusive end date, preserve past/current/future exceptions and deletion tombstones, coalesce same-day rule changes, expire a pending habit, correct its automatic miss while open, and retain both events after reload.

### Tests for User Story 3

- [ ] T052 [P] [US3] Write failing recurrence tests for positive planned duration on recurring task templates, non-empty weekdays, inclusive matching end date, invalid ranges, D+1 effective boundaries, repeated same-day coalescing, explicit stop actions, past/current preservation, and explicit future exceptions in src/entities/planning/model/recurrence.test.ts
- [ ] T053 [P] [US3] Write failing bounded materialization tests for unique series/definition dates, idempotence, occurrence-only edits/deletes, user tombstones, removal/re-materialization of untouched future occurrence+membership bundles, no automatic TaskEvent, and no `suppressed` product outcome in src/entities/planning/model/occurrence-materialization.test.ts
- [ ] T054 [P] [US3] Write failing habit transition tests for pending explicit outcomes, injected-clock automatic miss, idempotent catch-up, automatic-miss-to-completed correction while open, both ordered events, deletion exclusion, and closure immutability in src/entities/planning/model/habit.test.ts
- [ ] T055 [P] [US3] Write failing fake-IndexedDB tests for positive-duration task-series templates, task-series/habit-definition create/update/stop, occurrence-only edit/delete, prepareOpenPeriod, generated sequence allocation, D+1 coalescing, exceptions/tombstones, boundary catch-up/correction, revisions, reload, and atomic bundle removal in src/entities/planning/api/indexeddb/indexeddb-planning-repository.us3.test.ts
- [ ] T056 [P] [US3] Write failing bootstrap/runtime tests for startup, visibility resume, local-date rollover, rescheduled timer, bounded open-range preparation, and correctness after browser suspension without timer dependence in src/app/runtime/habit-boundary.test.ts
- [ ] T057 [P] [US3] After T001 settles generated insertion and contracts stabilize, write failing accessible recurrence/habit component tests for task-series and habit-definition creation/update/stop, positive recurring-task duration, inclusive-end/final-D+1 messaging, midnight rollover refresh and re-confirmation when the effective date changes between review and submit, future exceptions, occurrence-only edit/delete, pending outcomes, automatic-miss correction, immutable/error recovery, and approved generated-task placement in src/features/manage-task/ui/TaskRecurrenceDialog.test.tsx, src/features/manage-habit/ui/HabitRecurrenceDialog.test.tsx, and src/features/manage-habit/ui/HabitOutcomeControl.test.tsx
- [ ] T058 [P] [US3] After T001 succeeds and T022 provides the fixture, write the failing three-viewport recurrence journey covering user creation/update/stop of task series and habit definitions, positive task duration, inclusive end, final same-day D+1 rule, preserved future exception, approved generated insertion, boundary miss, open-day correction, reload, and no workout behavior in e2e/journeys/03-recurrence.spec.ts

### Implementation for User Story 3

- [ ] T059 [P] [US3] After T052 has been observed failing for the intended missing behavior, implement positive recurring-task template duration validation, recurrence validation, inclusive applicability, effective version/coalescing, stop behavior, and future-exception preservation in src/entities/planning/model/recurrence.ts
- [ ] T060 [US3] Implement bounded idempotent occurrence materialization/reconciliation effects, unique natural keys, untouched future bundle removal, tombstone preservation, and no automatic audit event while leaving generated dated-list insertion unset until T001 succeeds in src/entities/planning/model/occurrence-materialization.ts
- [ ] T061 [P] [US3] After T054 has been observed failing for the intended missing behavior, implement habit pending/outcome/delete transitions plus idempotent date-boundary miss and allowed correction effects with ordered embedded events in src/entities/planning/model/habit.ts
- [ ] T062 [US3] After T048 and T059–T061, implement positive-duration task-series validation, series/definition create/update/stop, occurrence-only edit/delete, prepareOpenPeriod, recordHabitOutcome, correctBoundaryMissToCompleted, and deleteHabitOccurrence transactions with D+1 coalescing and bounded reconciliation in src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts
- [ ] T063 [US3] After T001 succeeds, integrate bounded startup/resume/rollover/timer catch-up through the same repository command without making the timer a correctness dependency in src/app/runtime/create-app-runtime.ts and src/app/providers/AppProviders.tsx
- [ ] T064 [US3] After T001 succeeds, T057–T058 have been observed failing for the intended missing UI/journey behavior, and T059–T063 pass, implement the approved generated-occurrence dated-list insertion in src/entities/planning/model/occurrence-materialization.ts and src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts; implement task-series and habit-definition creation/update/stop, positive-duration recurring-task editing, and midnight effective-date refresh/re-confirmation in src/features/manage-task/model/use-manage-task.ts, src/features/manage-task/ui/TaskRecurrenceDialog.tsx, src/features/manage-task/index.ts, src/features/manage-habit/model/use-manage-habit.ts, src/features/manage-habit/model/use-habit-outcome.ts, src/features/manage-habit/ui/HabitRecurrenceDialog.tsx, src/features/manage-habit/ui/HabitOutcomeControl.tsx, and src/features/manage-habit/index.ts; publish required entities in src/entities/planning/index.ts and src/entities/planning/ui/HabitRow.tsx; call prepareOpenPeriod before affected open Week/Day queries and integrate the controls in src/pages/week/model/use-week-page.ts, src/pages/week/ui/WeekPage.tsx, src/pages/day/model/use-day-page.ts, and src/pages/day/ui/DayPage.tsx; make T057–T058 pass

**Checkpoint**: US3 independently proves recurrence isolation, bounded generation, auditable calendar-boundary outcomes, and reload correctness.

---

## Phase 6: User Story 4 — Close a Day Deliberately (Priority: P1)

**Goal**: Explicitly resolve every unfinished task and pending habit, atomically freeze the score/load/outcomes, and reject future, invalid, or incomplete closure.

**Independent Test**: Close an eligible day with all four explicit dispositions, no default, a valid different open destination, no pending habit, and immutable results; reject future dates and allow later eligible dates despite older open days.

### Tests for User Story 4

- [ ] T065 [P] [US4] Write failing score truth-table tests for equal task memberships, habit applicability, 70/30 weights, missing-category normalization, unavailable empty state, exact-half ties upward, contributing counts/rates, and absence of state/goal/formula-version inputs in src/entities/planning/model/scoring.test.ts
- [ ] T066 [P] [US4] Write failing closure tests for date<=currentLocalDate, nonchronological eligibility, exact unfinished-set mapping, four no-default dispositions, dated destinations that differ/remain open/have positive duration, pending-habit gate, pre-disposition load, keep/cancel incompletion, immutability, and complete rollback effects in src/entities/planning/model/day-closure.test.ts
- [ ] T067 [P] [US4] Write failing fake-IndexedDB closeDay tests for bounded preparation/catch-up, future/same-date/newly-closed/non-positive-duration target rejection, independent eligible closure, full disposition atomicity, event writes, frozen counts/rates/score/load/state, revisions, tx.abort, and no reopen in src/entities/planning/api/indexeddb/indexeddb-planning-repository.us4.test.ts
- [ ] T068 [P] [US4] After T001 succeeds and T067 stabilizes contracts, write failing accessible Close Day dialog tests for action eligibility, no preselected disposition, exact task coverage, all four choices with cancellation only here, pending-habit blocking, dated-destination openness/inequality and positive-duration validation with draft preservation, conflict recovery, focus entry/return, commit-only success, and neutral live-region errors in src/features/close-day/ui/CloseDayDialog.test.tsx
- [ ] T069 [P] [US4] After T001 succeeds and T022 provides the fixture, write the failing three-viewport closure journey covering future rejection, nonchronological eligible closure, pending-habit resolution, all four dispositions, same/closed/non-positive-duration destination rejection, atomic rollback, and post-close read-only/no-reopen behavior in e2e/journeys/04-day-closure.spec.ts

### Implementation for User Story 4

- [ ] T070 [US4] Implement the shared scoring/calculation policy for the Daily Score and Weekly Progress from integer counts with equal memberships, normalization, unavailable behavior, contributing rates/weights, and exact-half-up final rounding in src/entities/planning/model/scoring.ts
- [ ] T071 [US4] Implement pure day-closure validation/effect preparation for calendar eligibility, full disposition maps, dated destinations that are different/open/positive-duration, habits, load snapshot, final outcomes, and immutable transition in src/entities/planning/model/day-closure.ts
- [ ] T072 [US4] Implement live/frozen Day selectors and snapshot projection using the shared score/load policies without UI recalculation in src/entities/planning/model/selectors.ts and src/entities/planning/model/day.ts
- [ ] T073 [US4] Implement atomic closeDay preparation, positive-duration dated-destination validation, dispositions/events/destinations, counts/rates/score/load snapshot, revisions, closure instant, rollback, and immutable error mapping in src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts
- [ ] T074 [US4] After T001 succeeds, implement the accessible closure reducer/dialog with an exact disposition map, no default, pending-habit and dated-destination openness/inequality/positive-duration repair with draft preservation, conflict recovery, and commit-only success in src/features/close-day/model/closure-reducer.ts, src/features/close-day/model/use-close-day.ts, src/features/close-day/ui/CloseDayDialog.tsx, and src/features/close-day/index.ts
- [ ] T075 [US4] After T001 succeeds and T074 passes, integrate closure and immutable review with factual frozen score/load/counts/state/dispositions and no reopen controls in src/pages/day/model/use-day-page.ts, src/pages/day/ui/DayPage.tsx, src/entities/planning/ui/ScoreBreakdown.tsx, src/entities/planning/ui/PeriodStatus.tsx, and src/entities/planning/index.ts

**Checkpoint**: US1–US4 form the P1 operational baseline with deliberate immutable closure and no silent carry-forward.

---

## Phase 7: User Story 5 — Record Habits, State, Score, and Load (Priority: P2)

**Goal**: Record habit outcomes and contextual energy/mood/sleep while transparently displaying live/frozen score and factual duration load.

**Independent Test**: Record visible tasks/habits/state, reproduce every score/load from those facts, verify state never contributes, see unavailable when no category applies, and encounter no configurable capacity, hidden or automatic load/capacity/overload threshold, automatic overload classification, proactive overload warning, partial outcome, or judgmental copy.

### Tests for User Story 5

- [ ] T076 [P] [US5] Write failing Daily State and selector tests for energy/mood 1–5, non-negative sleep duration, open/immutable guards, state exclusion from score/load, live/frozen task/habit counts/rates, unavailable state, duration-only load, and no configurable capacity, automatic load/capacity/overload threshold, or overload classification in src/entities/planning/model/day.test.ts and src/entities/planning/model/selectors.us5.test.ts
- [ ] T077 [P] [US5] Write failing fake-IndexedDB tests for saveDailyState, habit outcome reuse, affected Day/Week revisions, cross-view projections, reload, immutable/revision errors, and proof that state is absent from score/load inputs in src/entities/planning/api/indexeddb/indexeddb-planning-repository.us5.test.ts
- [ ] T078 [P] [US5] After T001 succeeds and T077 stabilizes contracts, write failing accessible Day-signal tests for habit outcomes/correction, energy/mood/sleep labels, score counts/rates/unavailable state, factual load, zero overload/capacity UI, neutral copy, immutable states, and failed-write recovery in src/pages/day/ui/DaySignals.test.tsx
- [ ] T079 [P] [US5] After T001 succeeds and T022 provides the fixture, write the failing three-viewport daily-signals journey using quickstart score/load examples, boundary correction/reload, keyboard/touch interaction, textual/non-color explanations, and absence of overload classification in e2e/journeys/05-daily-signals.spec.ts

### Implementation for User Story 5

- [ ] T080 [US5] Implement Daily State validation and live/frozen Day/Week score/load projections that exclude state/goals and expose only factual counts/rates/load in src/entities/planning/model/day.ts, src/entities/planning/model/habit.ts, and src/entities/planning/model/selectors.ts
- [ ] T081 [US5] Implement saveDailyState with open-period/revision guards and affected aggregate receipts while reusing US3 habit commands and US4 score/load policies in src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts
- [ ] T082 [P] [US5] After T001 succeeds, T078–T079 have been observed failing, and T081 passes, implement accessible energy/mood/sleep orchestration and labeled form controls with draft/error recovery in src/features/record-daily-state/model/use-record-daily-state.ts, src/features/record-daily-state/ui/DailyStateForm.tsx, and src/features/record-daily-state/index.ts
- [ ] T083 [P] [US5] After T001 succeeds, T078–T079 have been observed failing, and T081 passes, extend ordinary Day HabitRow feedback through the contracted explicit completed/not-completed outcome and automatic-miss-to-completed correction commands with closed-period immutability in src/features/manage-habit/model/use-habit-outcome.ts, src/features/manage-habit/ui/HabitOutcomeControl.tsx, src/entities/planning/ui/HabitRow.tsx, and src/entities/planning/index.ts
- [ ] T084 [US5] After T001 succeeds and T082–T083 pass, integrate state, habit outcomes, and domain-provided live/frozen score/load explanations into Week/Day with factual neutral Russian copy and no capacity/overload surface in src/pages/day/ui/DayPage.tsx, src/pages/day/model/use-day-page.ts, src/pages/week/ui/WeekPage.tsx, src/pages/week/model/use-week-page.ts, and src/entities/planning/ui/ScoreBreakdown.tsx

**Checkpoint**: US5 independently explains daily signals from visible facts without turning contextual wellbeing or load into a judgment.

---

## Phase 8: User Story 6 — Review the Week and Adjust the Next Plan (Priority: P2)

**Goal**: Review planned/actual facts and mandatory derived weekly progress, record an optional reflection, complete the week, and adjust only future plans.

**Independent Test**: With seven closed days, reproduce weekly progress from summed frozen task/habit counts, display counts/rates, add reflection, complete/reload the week, reject later mutation, and change a future plan without changing the completed week.

### Tests for User Story 6

- [ ] T085 [P] [US6] Write failing week-completion tests for exactly seven closed owned days, raw-count aggregation rather than daily-percentage averaging, equal memberships, 70/30 normalization/ties-upward, unavailable result, goal/state exclusion, optional reflection, completion snapshot, future-plan isolation, and immutability in src/entities/planning/model/week-completion.test.ts
- [ ] T086 [P] [US6] Write failing fake-IndexedDB tests for completeWeek transaction guards, frozen daily-count summation, reflection/final breakdown persistence, reload, concurrent revision rejection, no reopen, and unchanged completed facts after future mutations in src/entities/planning/api/indexeddb/indexeddb-planning-repository.us6.test.ts
- [ ] T087 [P] [US6] After T001 succeeds and T086 stabilizes contracts, write failing accessible weekly-review tests for seven-day gating, descriptive goals/no numeric progress, planned/actual facts, daily context, mandatory progress counts/rates, reflection, commit-only completion, focus/error recovery, and immutable completed state in src/features/complete-week/ui/CompleteWeekDialog.test.tsx and src/pages/week/ui/WeekPage.us6.test.tsx
- [ ] T088 [P] [US6] After T001 succeeds and T022 provides the fixture, write the failing three-viewport weekly-review journey covering displayed/finalized progress counts/rates, goal/state exclusion, reflection, future-plan adjustment, reload, and completed-week immutability in e2e/journeys/06-weekly-review.spec.ts

### Implementation for User Story 6

- [ ] T089 [US6] Implement week-completion validation, raw frozen-count aggregation through the shared scoring/calculation policy, optional reflection, completion snapshot, and immutable/future-plan-isolation selectors in src/entities/planning/model/week-completion.ts, src/entities/planning/model/week.ts, and src/entities/planning/model/selectors.ts
- [ ] T090 [US6] Implement atomic completeWeek with canonical seven-day verification, summed frozen counts, final Weekly Progress/rates/reflection, revision guards, completion instant, and immutable errors in src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts
- [ ] T091 [US6] After T001 succeeds, implement accessible completion/reflection orchestration with seven-day eligibility, conflict recovery, and commit-only success in src/features/complete-week/model/use-complete-week.ts, src/features/complete-week/ui/CompleteWeekDialog.tsx, and src/features/complete-week/index.ts
- [ ] T092 [US6] After T001 succeeds and T091 passes, implement responsive weekly review/completed states with descriptive goals, planned/actual facts, daily context, mandatory weekly progress counts/rates, reflection, future navigation, and immutable controls in src/pages/week/model/use-week-page.ts, src/pages/week/ui/WeekPage.tsx, and src/entities/planning/ui/ScoreBreakdown.tsx

**Checkpoint**: US6 completes the plan→execute→record→review→adjust loop without mutating finalized history.

---

## Phase 9: User Story 7 — Review Historical Activity (Priority: P2)

**Goal**: Browse immutable Day, Week, and Month facts with exact navigation, Month detail, weekly progress, and no editing or workout history.

**Independent Test**: Open History at current Month/current date, step each mode exactly, inspect a selected Month day and approved Dynamics, locate prior task/habit/state/score/load/progress/reflection facts, and verify read-only responsive behavior.

### Tests for User Story 7

- [ ] T093 [P] [US7] Write failing immutable selector tests for Day/Week/Month ranges, current-Month default inputs, planned/disposition/actual explanations, ordered events, habits/state/score/load, direct weekly-progress/reflection retrieval, empty periods, and no edit/workout/partial/internal outcome in src/entities/planning/model/history.us7.test.ts
- [ ] T094 [P] [US7] Write failing fake-IndexedDB tests proving discriminated indexed getHistoryView Day/Week/Month queries remain read-only for open and closed dates, selectedDate-in-month validation, separate prepareOpenPeriod followed by a current read, weekly-progress joins, deterministic order, no arbitrary range/unbounded scan, and getTaskHistory reuse in src/entities/planning/api/indexeddb/indexeddb-planning-repository.us7.test.ts
- [ ] T095 [P] [US7] After T001 settles History details and T094 stabilizes contracts, write failing accessible History tests for current-date/current-Month first entry, exact mode steps, approved mode-switch/short-month behavior, Month calendar/details, approved Dynamics, weekly progress counts/rates, factual explanations, loading/empty/errors, responsive parity, no filter/search/edit, and no workout layer/tab/data in src/pages/history/ui/HistoryPage.test.tsx
- [ ] T096 [P] [US7] After T001 succeeds and T022 provides the fixture, write the failing three-viewport History journey covering current-Month default, every mode/step, selected-day/Dynamics behavior, moved/backlogged/canceled facts, habit/state/score/load/reflection, direct weekly-progress retrieval, keyboard/touch operation, read-only behavior, and no workout UI in e2e/journeys/07-history.spec.ts

### Implementation for User Story 7

- [ ] T097 [US7] Implement immutable Day/Week/Month view models and selectors joining normalized plan entries, events, habits, state, frozen scores/loads, weekly progress/reflections, and specification-only outcome vocabulary in src/entities/planning/model/history.ts and src/entities/planning/model/selectors.ts
- [ ] T098 [US7] Implement strictly read-only discriminated indexed getHistoryView and getTaskHistory projections with mode-derived ranges, selectedDate validation, deterministic order, and no writes, generic window, search, or workout contract in src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts
- [ ] T099 [US7] After T001 succeeds, implement page-scoped `{mode, anchorDate, selectedDate}` orchestration, exact period steps, prepareOpenPeriod for only open dates in the derived range before invoking the read-only History query, selected detail, and approved mode-switch/short-month/Dynamics behavior in src/pages/history/model/use-history-page.ts
- [ ] T100 [US7] After T001 succeeds and T099 passes, implement and route the responsive read-only History page with Month calendar/details, approved Dynamics, weekly progress, factual labels, loading/empty/error announcements, canonical Day/Week links, and no edit/filter/search/workout surface in src/pages/history/ui/HistoryPage.tsx, src/pages/history/ui/HistoryPage.module.css, src/pages/history/index.ts, src/app/routes/AppRouter.tsx, and src/app/layout/AppShell.tsx

**Checkpoint**: All seven stories are independently testable with deterministic fixtures, and the complete device-local planning loop is available after T001-dependent UI work succeeds.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Prove indexed persistence, browser behavior, responsive accessibility, neutral Russian content, design conformance, simplicity, usability, traceability, and release readiness.

- [ ] T101 [P] Create the reproducible 52-week seeded fixture and verify indexed Day/Week/Month reads, range-bounded open-date preparation, weekly-progress retrieval, deterministic order, and absence of unbounded scans without inventing a latency SLO in tests/fixtures/personal-history.ts, e2e/fixtures/personal-history.ts, and src/entities/planning/api/indexeddb/indexeddb-planning-repository.seeded-scale.test.ts
- [ ] T102 [P] After T001 succeeds and story persistence is stable, verify real adapter close/reopen, revision conflicts, quota/abort mapping, blocked upgrades, terminated recovery, persistence-request denial, no false success, no automatic database reset, and unchanged prior facts in src/entities/planning/api/indexeddb/indexeddb-planning-repository.failures.test.ts and src/app/providers/AppProviders.test.tsx
- [ ] T103 After T101–T102 complete, all seven story UIs are complete, and T001 succeeds, complete the production-preview browser matrix for the seven canonical journeys in keyboard desktop Chromium at 1440px and touch tablet/mobile at 820px/390px; add overflow/essential-action checks at 360/390/430/600/768/820/1024/1366/1440/1920, targeted axe scans, reduced-motion/non-color/live-region assertions, real IndexedDB reload, deep-link refresh, persistence-locality copy, and no-workout navigation in playwright.config.ts, e2e/journeys/responsive-accessibility.spec.ts, and e2e/journeys/device-local-persistence.spec.ts
- [ ] T104 After T001 succeeds and T103 passes, audit every specification outcome union, mapping, fixture, and Russian route/dialog/control/History/storage/error/feedback string; fix findings in src/entities/planning/model/task.ts, src/entities/planning/model/habit.ts, src/entities/planning/model/history.ts, src/entities/planning/api/indexeddb/mappers.ts, tests/fixtures/planning.ts, tests/fixtures/personal-history.ts, e2e/fixtures/orbit.fixture.ts, e2e/fixtures/personal-history.ts, src/app/layout/AppShell.tsx, src/app/providers/AppProviders.tsx, src/pages/not-found/ui/NotFoundPage.tsx, src/shared/ui/button/Button.tsx, src/shared/ui/dialog/Dialog.tsx, src/shared/ui/form-field/FormField.tsx, src/shared/ui/icon/Icon.tsx, src/shared/ui/orbit-metric/OrbitMetric.tsx, src/pages/week/ui/WeekPage.tsx, src/pages/day/ui/DayPage.tsx, src/pages/backlog/ui/BacklogPage.tsx, src/pages/history/ui/HistoryPage.tsx, src/entities/planning/ui/TaskRow.tsx, src/entities/planning/ui/HabitRow.tsx, src/entities/planning/ui/ScoreBreakdown.tsx, src/entities/planning/ui/PeriodStatus.tsx, src/features/manage-week/ui/WeekEditorDialog.tsx, src/features/manage-task/ui/TaskEditorDialog.tsx, src/features/manage-task/ui/TaskExecution.tsx, src/features/manage-task/ui/TaskMoveDialog.tsx, src/features/manage-task/ui/TaskRecurrenceDialog.tsx, src/features/manage-habit/ui/HabitRecurrenceDialog.tsx, src/features/manage-habit/ui/HabitOutcomeControl.tsx, src/features/record-daily-state/ui/DailyStateForm.tsx, src/features/close-day/ui/CloseDayDialog.tsx, and src/features/complete-week/ui/CompleteWeekDialog.tsx; prove no `partial` or persistence-only marker is rendered as a product outcome and no punitive/praising/alarmist copy, overload classification, or proactive warning appears; record evidence in specs/001-personal-planning-loop/content-review.md and rerun affected tests
- [ ] T105 After T001 succeeds and T104 passes, perform final conformance against the approved Open Design/DESIGN.md evidence for responsive layouts, Daily Score/Weekly Progress color/status/presentation semantics, the separation of score visuals from prohibited automatic load/capacity/overload thresholds, History mode/short-month/Dynamics behavior, generated-occurrence placement, focus, contrast, motion, formula labels, factual load, and absence of workout UI; route generated-placement corrections through src/entities/planning/model/occurrence-materialization.ts, src/entities/planning/model/occurrence-materialization.test.ts, src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts, and src/entities/planning/api/indexeddb/indexeddb-planning-repository.us3.test.ts; fix visual findings in src/app/layout/AppShell.tsx, src/app/layout/AppShell.module.css, src/app/providers/AppProviders.tsx, src/pages/not-found/ui/NotFoundPage.tsx, src/shared/styles/orbit-tokens.css, src/shared/ui/button/Button.tsx, src/shared/ui/dialog/Dialog.tsx, src/shared/ui/form-field/FormField.tsx, src/shared/ui/icon/Icon.tsx, src/shared/ui/orbit-metric/OrbitMetric.tsx, src/entities/planning/ui/TaskRow.tsx, src/entities/planning/ui/HabitRow.tsx, src/entities/planning/ui/ScoreBreakdown.tsx, src/entities/planning/ui/PeriodStatus.tsx, src/pages/week/ui/WeekPage.tsx, src/pages/week/ui/WeekPage.module.css, src/pages/day/ui/DayPage.tsx, src/pages/day/ui/DayPage.module.css, src/pages/backlog/ui/BacklogPage.tsx, src/pages/backlog/ui/BacklogPage.module.css, src/pages/history/ui/HistoryPage.tsx, src/pages/history/ui/HistoryPage.module.css, src/features/manage-week/ui/WeekEditorDialog.tsx, src/features/manage-task/ui/TaskEditorDialog.tsx, src/features/manage-task/ui/TaskExecution.tsx, src/features/manage-task/ui/TaskMoveDialog.tsx, src/features/manage-task/ui/TaskRecurrenceDialog.tsx, src/features/manage-habit/ui/HabitRecurrenceDialog.tsx, src/features/manage-habit/ui/HabitOutcomeControl.tsx, src/features/record-daily-state/ui/DailyStateForm.tsx, src/features/close-day/ui/CloseDayDialog.tsx, and src/features/complete-week/ui/CompleteWeekDialog.tsx; record approvals/results in specs/001-personal-planning-loop/release-review.md, rerun affected automated checks, and repeat/update T104 content-review evidence after every fix
- [ ] T106 After T105 passes, audit runtime dependencies, FSD layer/public-API imports, abstractions, repository boundaries, and prohibited backend/account/sync/global-cache/query-cache/PWA/workout/capacity/telemetry scope; remove unsupported code or dependencies from package.json, src/entities/planning/index.ts, src/features/manage-week/index.ts, src/features/manage-task/index.ts, src/features/manage-habit/index.ts, src/features/record-daily-state/index.ts, src/features/close-day/index.ts, src/features/complete-week/index.ts, and src/app/routes/AppRouter.tsx; justify every retained addition in specs/001-personal-planning-loop/architecture-review.md, rerun affected automated checks, and repeat/update T104 content evidence plus T105 design/release evidence after every fix that can affect them
- [ ] T107 After T106, execute real-device touch, manual keyboard, screen-reader announcement, focus order/return, contrast, zoom/reflow, reduced-motion, non-color status, and second-tab blocked-upgrade checks against the stable production build; record pass/fail evidence in specs/001-personal-planning-loop/manual-accessibility.md and specs/001-personal-planning-loop/release-review.md; any fix invalidates and requires rerunning affected prior checks
- [ ] T108 After T107, execute the approved single-participant production-build procedure in specs/001-personal-planning-loop/usability-protocol.md: record exact instruction, actual elapsed time, assistance, and pass/fail for SC-001; SC-002<=10 minutes; each SC-003 operation independently<=30 seconds with cancellation excluded; and SC-010 Day/Week/Month variants<=30 seconds including weekly-progress retrieval; record evidence outside ORBIT in specs/001-personal-planning-loop/usability-results.md with no analytics/telemetry/accounts/backend and rerun every invalidated check after any correction
- [ ] T109 After T108, map every extant requirement FR-001–FR-013 and FR-015–FR-059 plus SC-001–SC-015 to passing automated/manual evidence, include justified non-automated checks and the 52-week indexed fixture, and record the matrix in specs/001-personal-planning-loop/traceability.md; every missing or failing row returns work to its owning task before release
- [ ] T110 After T109, run `npm run verify`, confirm format, lint, strict typecheck, scoped coverage, production build, and all Playwright projects pass, and record commands/results plus any justified non-applicable gate in specs/001-personal-planning-loop/verification.md

**Checkpoint**: Implementation, evidence, specification, plan, contracts, constitution, DESIGN.md, and approved Open Design sources agree.

---

## Dependencies & Execution Order

### Gate and Phase Dependencies

- **T001 design reconciliation**: Serialized and never parallel. It may update governing artifacts. Until it succeeds, T023–T027 and every task explicitly saying “After T001” remain blocked; T002–T022 and pure-domain/nonvisual adapter story work may proceed.
- **Setup (Phase 1)**: T002 precedes T003–T006; T003–T006 can run in parallel after dependency installation is defined.
- **Nonvisual Foundation (T007–T022)**: Depends on relevant setup configuration. Value types precede records; records precede the repository port/schema; schema/records precede mappings; port/schema/mappings precede the adapter skeleton/runtime.
- **Visual Foundation (T023–T027)**: Depends on successful T001 plus the nonvisual contracts; it blocks all story component/page/browser work.
- **US1**: Begins after the nonvisual Foundation; its UI/browser tasks also need successful T001 and Visual Foundation.
- **US2**: Depends on US1 task/membership records and adapter operations.
- **US3**: Pure recurrence/habit policy may overlap late US2 after US1 record contracts stabilize; US3 adapter integration follows US2 shared occurrence/event semantics, and US3 UI waits for T001.
- **US4**: Depends on US2 lifecycle/history semantics and US3 applicable task/habit occurrences.
- **US5**: Depends on US3 habit outcomes and US4 shared score/closure facts.
- **US6**: Depends on US4 frozen day records and US5 complete daily signals.
- **US7**: Selector/query tests can use seeded fixtures, but acceptance depends on facts from US2–US6 and successful T001 History decisions.
- **Polish**: T101–T102 may run in parallel after story persistence is stable. After both complete, T103–T110 follow their existing sequential dependency order because code/evidence changes invalidate later checks.

### User Story Dependency Graph

```text
Foundation
    |
   US1
  /   \
US2   US3 (pure policy can overlap late US2)
  \   /
   US4
    |
   US5
    |
   US6
    |
   US7
```

Each story remains independently testable with deterministic fixtures even when integrated delivery consumes facts produced by earlier stories.

### Shared File Serialization

- `src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts`: T019 → T035 → T048 → T062 → T064 → T073 → T081 → T090 → T098
- `src/entities/planning/model/selectors.ts`: T034 → T047 → T072 → T080 → T089 → T097
- `src/entities/planning/index.ts`: update in ascending task-ID order; do not run public-API edits concurrently
- `src/features/manage-task/index.ts`: T037 → T049 → T064
- `src/pages/week/ui/WeekPage.tsx`: T039 → T051 → T064 → T084 → T092
- `src/pages/day/ui/DayPage.tsx`: T040 → T051 → T064 → T075 → T084
- `src/entities/planning/ui/TaskRow.tsx`: T038 → T049
- `src/entities/planning/ui/HabitRow.tsx`: T064 → T083
- `src/entities/planning/ui/ScoreBreakdown.tsx`: T075 → T084 → T092
- `src/app/routes/AppRouter.tsx`: T027 → T040 → T050 → T100
- `src/app/layout/AppShell.tsx`: T027 → T100

### Within Each User Story

1. Add the listed tests and observe them fail for the intended missing behavior.
2. Implement pure model policy before adapter transactions.
3. Implement adapter behavior before feature orchestration and route integration.
4. Reload the owning aggregate only after a committed receipt.
5. Pass the independent-test checkpoint before proceeding along the dependency graph.

---

## Parallel Execution Examples

### User Story 1

After Foundation, run T028, T029, and T030 together. After successful T001 and stable contracts, T031 and T032 may run together; after T035, T036–T038 may run in parallel before T039–T040 serialize page integration.

### User Story 2

Run T041–T043 together. After successful T001, T044 and T045 may run together; serialize T046 → T047 → T048 → T049 → T050 → T051 for shared policy, adapter, and page files.

### User Story 3

Run T052–T056 together after US1 types stabilize. T059 and T061 may run in parallel before T060/T062; T057/T058 are a separate post-T001 component/browser batch, followed by T064.

### User Story 4

Run T065–T067 together after US2+US3. After successful T001, T068 and T069 may run together; serialize scoring, closure, adapter, and UI as T070 → T071 → T072 → T073 → T074 → T075.

### User Story 5

Run T076–T077 together. After successful T001, T078–T079 may run together; after T081, T082 and T083 may run in parallel before T084 integrates shared pages.

### User Story 6

Run T085–T086 together. After successful T001, T087–T088 may run together; then serialize T089 → T090 → T091 → T092.

### User Story 7

Run T093–T094 together from completed-period fixtures. After successful T001, T095–T096 may run together; then serialize T097 → T098 → T099 → T100.

---

## Implementation Strategy

### Suggested MVP Scope: User Story 1

1. Complete toolchain and nonvisual Foundation.
2. Clear T001 and complete Visual Foundation.
3. Complete US1.
4. Stop and run US1 domain, adapter, component, browser, and reload tests.
5. Demonstrate canonical weekly/daily planning as the first independently useful increment.

US1 alone is the suggested MVP increment for delivery sequencing, not the complete specified ORBIT loop.

### P1 Operational Baseline

1. Deliver US1 planning.
2. Add US2 honest task execution/history.
3. Add US3 recurrence and habit-boundary isolation.
4. Converge both into US4 deliberate immutable day closure.
5. Validate the complete P1 baseline before adding review signals.

### Full Incremental Delivery

1. Add US5 habits, state, transparent score, and factual load.
2. Add US6 weekly review, reflection, completion, and future adjustment.
3. Add US7 Day/Week/Month History.
4. Run T101–T102 in parallel; after both complete, run T103–T110 according to their existing sequential dependency order.

### Parallel Team Strategy

1. Run T001 as a serialized gate while another stream completes toolchain and nonvisual Foundation.
2. Converge on Visual Foundation only after T001 succeeds.
3. Deliver US1 as the shared planning surface.
4. Run US2 lifecycle work and US3 pure recurrence work in parallel while serializing shared adapter/page edits.
5. Converge into US4, then deliver US5 → US6 → US7.
6. Serialize mutation-capable release audits, manual checks, traceability, and final verification.

---

## Notes

- Tests are first-class tasks because the specification explicitly requires automated and manual evidence.
- T001 is never `[P]`; it can change governing artifacts and invalidate dependent work.
- Component/page/browser work may be marked `[P]` only after T001 succeeds and shared contracts/fixtures stabilize.
- The approved usability protocol already exists; only T108 executes it.
- Closed days and completed weeks are never reopened or mutated.
- The specification overrides prototype implications: 70/30 score, state excluded, factual load, IndexedDB locality, no workouts, no automatic carry-forward, no arbitrary History window, and no generated-task placement guess.
- React never imports IndexedDB schema/adapter internals; pure domain code never imports React, router, DOM, or browser persistence.
- Do not introduce a backend, account, synchronization, global domain cache, query cache, PWA, telemetry, configurable capacity, formula-version system, or speculative abstraction.
