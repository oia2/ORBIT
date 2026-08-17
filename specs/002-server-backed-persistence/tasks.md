---

description: "Task list for ORBIT server-backed persistence migration"
---

# Tasks: ORBIT Server-Backed Persistence

**Input**: Design documents from `/specs/002-server-backed-persistence/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/planning-api.md](./contracts/planning-api.md), [quickstart.md](./quickstart.md)

**Tests**: Test tasks are included and are **mandatory** for this feature. SC-001 requires
feature 001's existing repository suites to pass against the new implementation — the tests
are the specification of correctness, not an optional extra.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are given in every task

## A note on story independence

The `/speckit-tasks` template assumes user stories are independently deliverable increments.
**This feature does not have that shape, and pretending otherwise would produce a misleading
plan.** US1 ("behavior unchanged") and US2 ("data no longer tied to one browser") are two
views of a single cutover: you cannot ship one without the other, because moving persistence
to the server is what delivers both.

The phases below are therefore organized by **verification milestone** rather than by
shippable increment:

| Phase | Milestone | How you know it is done |
| ----- | --------- | ----------------------- |
| 3 (US1) | The domain behaves identically on PostgreSQL | `npm run test:server` green |
| 4 (US2) | The browser uses the server; data leaves IndexedDB | App works end to end; cross-browser check passes |
| 5 (US3) | Failures are honest | Server-down scenarios surface errors, never false success |
| 6 (US4) | One command runs everything | `docker compose up` from a clean checkout |

Phase 3 is the genuinely valuable independent milestone: it proves behavior preservation
before a single line of client code changes, which is where the risk in this feature lives.

**Story labels are retained for traceability** to spec requirements, and each phase still has
a real checkpoint. But the delivery unit is the whole feature.

## Every checkpoint must be green

No phase may end with a failing typecheck, lint, or test run. This is why the error-union
change is staged across T020 → T070 → T071 rather than done in one step: renaming the storage
error codes up front would leave `npm run typecheck` broken for the length of the migration.
A milestone that plans for a broken repository is not a milestone.

## Naming collision warning

Feature 001's repository test suites are named `us1`–`us7` after **001's** user stories.
This document's `[US1]`–`[US4]` labels refer to **002's** user stories. Where a task names a
001 suite it is written explicitly as "001's `us4` suite" to avoid confusion.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the backend toolchain without touching existing behavior.

- [X] T001 Add runtime dependencies `fastify`, `@fastify/static`, `kysely`, `pg` and dev dependencies `tsx`, `@types/pg` to `package.json`
- [X] T002 Create the `server/` directory tree per plan.md: `server/{db/migrations,planning,api}/`
- [X] T003 [P] Create `tsconfig.server.json` extending the root config, with `@/*` → `src/*` paths, `module: nodenext`, and `server/**/*` included
- [X] T004 [P] Create `vite.server.config.ts` for the SSR build: entry `server/main.ts`, output `dist-server/`, `ssr` target Node 22, reusing the `@` alias from `vite.config.ts`
- [X] T005 [P] Create `server/config.ts` reading and validating `DATABASE_URL`, `PORT`, and `NODE_ENV`, failing fast with a clear message when `DATABASE_URL` is absent
- [X] T006 [P] Create `.env.example` documenting `DATABASE_URL`, `PORT`, `NODE_ENV` per quickstart.md
- [X] T007 Create `docker-compose.yml` with the `db` service only (postgres:17-alpine, named volume `orbit-db-data`, healthcheck, port 5432); the `app` service is added later in T086
- [X] T008 Add npm scripts to `package.json`: `dev:server`, `build:server`, `test:server`, `test:server:tz`, `db:migrate`
- [X] T009 Add a third Vitest project named `server` to `vitest.config.ts`: `environment: 'node'`, `include: ['server/**/*.test.ts']`, no jsdom setup file
- [X] T010 [P] Add ESLint boundary rules in `eslint.config.js`: forbid `src/**` from importing `server/**`, and forbid `src/shared/lib/**` and `src/entities/planning/model/**` from importing Node built-ins, `pg`, `kysely`, or DOM-only globals

**Checkpoint**: `npm run typecheck` and `npm run lint` pass; existing app and tests are untouched.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database, schema, mapping, and the test harness that every later phase depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T011 Create `server/db/schema.ts` declaring the Kysely `Database` interface for all eight tables per [data-model.md](./data-model.md)
- [X] T012 Create `server/db/client.ts` building the `pg` Pool and Kysely instance. **Configure `pg` type parsers so `date` (OID 1082) and `timestamptz` (OID 1184) are returned as strings, never JS `Date`** — see the critical mapping constraint in data-model.md
- [X] T013 [P] Write `server/db/client.test.ts` asserting that a round-tripped `LocalDate` and `Instant` come back as byte-identical branded strings, including a `timestamptz` with non-zero milliseconds
- [X] T014 Create `server/db/migrations/index.ts` exporting a static `Record<string, Migration>` map and a `runMigrations(db)` helper using Kysely's `Migrator` (research Decision 10 — static map, not `FileMigrationProvider`, so the bundled server works)
- [X] T015 Create `server/db/migrations/001-initial-schema.ts` implementing every table, column, `CHECK`, foreign key, index, and sequence in data-model.md, including `UNIQUE (occurrence_id, plan_date)` on `task_plan_entries` and `UNIQUE (definition_id, date)` on `habit_occurrences`
- [X] T016 Write `server/db/migrations/migrations.test.ts` verifying migrations apply to an empty database, are idempotent on re-run, and that each declared constraint actually rejects a violating row
- [X] T017 Create `server/test-support/database.ts`: per-Vitest-worker database (`orbit_test_<worker>`), created and migrated once, with a `truncateAll()` helper resetting all tables and sequences between test cases
- [X] T018 Create `server/planning/mappers.ts` converting each table row to and from its domain type, preserving `undefined` vs `null` exactly (a `?` domain field is `undefined`, never `null`)
- [X] T019 [P] Write `server/planning/mappers.test.ts` covering round-trip fidelity for all five `TaskOccurrence` variants, both `Day` variants, both `Week` variants, and every optional field
- [X] T020 **Add** `ServerUnavailable` and `UnexpectedServerFailure` to the error union in `src/entities/planning/model/planning-repository.ts`, keeping the exported type name `DomainOrStorageError`, all eleven domain codes, **and — temporarily — the existing `StorageUnavailable`, `QuotaExceeded`, `UpgradeBlocked`, and `UnexpectedStorageFailure` codes**. The IndexedDB adapter still ships and still returns them; removing them now would break typecheck for every task until cutover. They are deleted in T071

**Checkpoint**: `docker compose up -d db && npm run test:server` green. `npm run verify` **fully passes** — the union carries both old and new codes, so nothing is broken.

---

## Phase 3: User Story 1 — Behavior Unchanged on Server-Backed Storage (Priority: P1) 🎯 MVP

**Goal**: `PostgresPlanningRepository` reproduces feature 001's behavior exactly, proven by
001's own test suites.

**Independent Test**: `npm run test:server` passes with every retargeted 001 suite green. This
is verifiable with zero client changes.

### Retargeting the 001 suites (write first — they must FAIL before implementation)

> These suites already exist and already encode the required behavior. Retargeting them
> is this feature's TDD step: they are moved to the server, pointed at the new
> implementation, and must fail for lack of implementation before Phase 3 work begins.
>
> **Two categories of assertion, with different rules:**
>
> - **Domain and product-behavior assertions must not change.** Scoring, recurrence,
>   closure, membership, history, revisions, immutability. Changing one of these to reach
>   green would hide exactly the drift SC-001 exists to catch. If such an assertion cannot
>   pass, stop and report it — it is a behavior regression, not a test to fix.
> - **IndexedDB storage-mechanism assertions must change.** Quota exhaustion, blocked
>   version upgrades, terminated connections — these describe storage semantics that 002
>   explicitly supersedes and FR-014 replaces. They are rewritten as PostgreSQL equivalents.
>
> The second category is legitimate precisely because the mechanism it describes is gone.
> The risk is misclassification, so T032 records every replacement.

- [X] T021 [US1] Create `server/planning/test-support/repository-harness.ts` exposing `createRepositoryUnderTest({ clock })` that builds a `PostgresPlanningRepository` on the per-worker test database, mirroring the construction seam the 001 suites used for IndexedDB
- [X] T022 [P] [US1] Move and retarget 001's `foundation` suite to `server/planning/repository.foundation.test.ts`, keeping its domain assertions verbatim and replacing only its database-lifecycle assertions
- [X] T023 [P] [US1] Move and retarget 001's `us1` suite (week planning) to `server/planning/repository.week-planning.test.ts` — construction seam only; assertions verbatim
- [X] T024 [P] [US1] Move and retarget 001's `us2` suite (task execution) to `server/planning/repository.task-execution.test.ts` — construction seam only; assertions verbatim
- [X] T025 [P] [US1] Move and retarget 001's `us3` suite (recurrence) to `server/planning/repository.recurrence.test.ts` — construction seam only; assertions verbatim
- [X] T026 [P] [US1] Move and retarget 001's `us4` suite (day closure) to `server/planning/repository.day-closure.test.ts` — construction seam only; assertions verbatim
- [X] T027 [P] [US1] Move and retarget 001's `us5` suite (habits, state, score, load) to `server/planning/repository.daily-signals.test.ts` — construction seam only; assertions verbatim
- [X] T028 [P] [US1] Move and retarget 001's `us6` suite (weekly review) to `server/planning/repository.weekly-review.test.ts` — construction seam only; assertions verbatim
- [X] T029 [P] [US1] Move and retarget 001's `us7` suite (history) to `server/planning/repository.history.test.ts` — construction seam only; assertions verbatim
- [X] T030 [P] [US1] Move and retarget 001's `seeded-scale` suite to `server/planning/repository.seeded-scale.test.ts` — construction seam only; assertions verbatim
- [X] T031 [US1] Retarget 001's `failures` suite to `server/planning/repository.failures.test.ts`. **This suite is the main exception to verbatim preservation**: its IndexedDB failure injection (quota exceeded, upgrade blocked, connection terminated) has no PostgreSQL analogue and is replaced with connection loss, statement failure mid-transaction, and constraint violation. Any assertion in it about *domain* error codes — `PeriodImmutable`, `RevisionConflict`, `ValidationFailure` and the rest — must still carry over unchanged
- [X] T032 [US1] Create `specs/002-server-backed-persistence/traceability.md` recording, per suite, which assertions carried over verbatim and which storage-mechanism assertions were replaced and why. **Do not claim the `failures` suite is verbatim** — it is not, and the record must say so plainly, or SC-001's evidence is overstated

### Repository implementation

> Split by concern into modules composed by one facade, mirroring how the domain model is
> already organized (`day.ts`, `task.ts`, `habit.ts`, `week.ts`). This keeps each file
> reviewable and lets the modules below be built in parallel.

- [X] T033 [US1] Create `server/planning/transaction.ts` with two wrappers: a **command** transaction at the default `READ COMMITTED` including the `expectedRevision` guard that turns a zero-row `UPDATE … WHERE revision = $expected` into the existing `RevisionConflict` error (FR-007, FR-008); and a **read** transaction at `REPEATABLE READ` so every query in a multi-query projection sees one consistent snapshot (research Decision 7)
- [X] T034 [P] [US1] Write `server/planning/transaction.test.ts` proving the read wrapper actually pins a snapshot: a command committing between two statements of a read transaction must not be visible to the second statement
- [X] T035 [US1] Create `server/planning/postgres-planning-repository.ts` as the facade implementing `PlanningRepository`, delegating to the concern modules below and injecting the supplied `ApplicationClock` unchanged
- [X] T036 [P] [US1] Implement week and goal commands in `server/planning/weeks.ts`: `ensureCalendarWeek`, `addWeeklyGoal`, `editWeeklyGoal`, `reorderWeeklyGoals`, `deleteWeeklyGoal` — gates 001's `us1` suite
- [X] T037 [P] [US1] Implement task lifecycle commands in `server/planning/tasks.ts`: `createTask`, `editTaskOccurrence`, `setTaskCompletion`, `moveTaskToDate`, `moveTaskToBacklog`, `deleteTaskOccurrence`, `reorderDatedTasks` — gates 001's `us2` suite
- [X] T038 [US1] Implement task plan membership handling in `server/planning/plan-entries.ts`, relying on `UNIQUE (occurrence_id, plan_date)` for reuse-on-return so an A → B → A move never inflates a denominator (FR-027, FR-048)
- [X] T039 [P] [US1] Implement recurrence commands in `server/planning/series.ts`: `createTaskSeries`, `updateTaskSeriesRule`, `stopTaskSeries`, plus rule-version append semantics — gates 001's `us3` suite
- [X] T040 [P] [US1] Implement habit commands in `server/planning/habits.ts`: `createHabitDefinition`, `updateHabitRule`, `stopHabitDefinition`, `editHabitOccurrence`, `recordHabitOutcome`, `correctBoundaryMissToCompleted`, `clearHabitOutcome`, `deleteHabitOccurrence` — gates 001's `us5` suite
- [X] T041 [US1] Implement `prepareOpenPeriod` occurrence materialization in `server/planning/materialization.ts`, including the automatic habit boundary miss, driven entirely by the injected clock's `currentLocalDate()`
- [X] T042 [P] [US1] Implement `saveDailyState` in `server/planning/daily-state.ts`
- [X] T043 [US1] Implement `closeDay` in `server/planning/closure.ts`: disposition completeness, eligibility, pending-habit rejection, and the planned-load snapshot, all in one command transaction — gates 001's `us4` suite
- [X] T044 [US1] Implement `completeWeek` in `server/planning/week-completion.ts` — gates 001's `us6` suite
- [X] T045 [P] [US1] Implement read projections in `server/planning/queries.ts`: `getWeekView`, `getDayView`, `getBacklogView`, `getTaskHistory`, each running inside the `REPEATABLE READ` read wrapper from T033
- [X] T046 [US1] Implement `getHistoryView` in `server/planning/history-queries.ts` for day, week, and month modes including Dynamics windows, also inside the read wrapper — gates 001's `us7` suite
- [X] T047 [US1] Verify every command returns correct `affectedDates` and `affectedWeeks`, since the client's cache invalidation depends on them

**Checkpoint**: `npm run test:server` fully green and `npm run verify` still passes. **Behavior preservation is now proven.** No client code has changed, and the application still runs on IndexedDB.

---

## Phase 4: User Story 2 — Data Is No Longer Tied to One Browser (Priority: P1)

**Goal**: The browser talks to the server, and planning data leaves IndexedDB entirely.

**Independent Test**: Record data in one browser; open the deployment in a different browser
and see identical data; clear site data in the first and lose nothing; confirm no ORBIT
IndexedDB database exists.

### HTTP layer

- [X] T048 [US2] Create `server/api/request-clock.ts` reading `X-Orbit-Local-Date` and `X-Orbit-Instant`, validating both with the existing `localDate` and `instant` brand validators, and building the per-request clock with the existing `createFixedClock({ currentLocalDate, instant })`. **The server must never call `createSystemClock`, `Date.now()`, or `new Date()`** (FR-009)
- [X] T049 [P] [US2] Write `server/api/request-clock.test.ts` covering missing header, malformed date, malformed instant, and correct clock construction
- [X] T050 [US2] Create `server/api/parsers.ts` with one parser per endpoint input, reusing the brand validators from `@/shared/lib/ids` and `@/shared/lib/local-date`, returning the existing `ValidationFailure` issue list on failure
- [X] T051 [US2] In `server/api/parsers.ts`, preserve the `undefined` vs `null` distinction for `EditTaskOccurrenceInput.startTime`/`endTime`, where `undefined` means "leave unchanged" and `null` means "clear" (see the interface comment at `planning-repository.ts:163`)
- [X] T052 [US2] In `server/api/parsers.ts`, reject per-entity audit instants and caller-selected recurrence effective dates in request bodies — these were never on the boundary and must not become reachable now that a clock reading crosses it
- [X] T053 [P] [US2] Write `server/api/parsers.test.ts` covering rejection of malformed brands, the `undefined`/`null` distinction, and rejection of the forbidden body fields from T052
- [X] T054 [US2] Create `server/api/routes.ts` registering all 32 `POST /api/planning/<methodName>` routes from a method table, returning the result envelope with HTTP 200 for both `ok: true` and domain `ok: false` (research Decision 4)
- [X] T055 [US2] Add `GET /api/health` in `server/api/health.ts` returning 200 when the database is reachable and 503 otherwise
- [X] T056 [US2] Create `server/app.ts` as a Fastify factory that takes its dependencies as arguments so tests can build an app without listening on a port
- [X] T057 [US2] Create `server/main.ts`: load config, run migrations, build the app, listen. Migrations must complete before the server accepts requests (FR-019)
- [X] T058 [P] [US2] Write `server/api/routes.test.ts` using Fastify injection: every method routes correctly, domain errors return 200 with the envelope, unknown methods return 404, malformed JSON returns 400, missing clock headers return 400

### Client adapter

- [X] T059 [US2] Create `src/entities/planning/api/http/http-planning-repository.ts` implementing `PlanningRepository` via `createHttpPlanningRepository({ baseUrl, clock, fetch })`, sending both clock headers read at call time, returning 200 envelopes unchanged, and mapping transport failures to `ServerUnavailable` / `UnexpectedServerFailure`
- [X] T060 [US2] Review `src/entities/planning/api/http/http-planning-repository.ts` and confirm it holds no cache, no queue, no retry, and no local storage of any kind (FR-002, FR-023)
- [X] T061 [P] [US2] Write `src/entities/planning/api/http/http-planning-repository.test.ts` covering envelope round-tripping, brand preservation across the wire, both headers being sent, and the failure mappings
- [X] T062 [US2] Write `server/api/contract.test.ts` driving `HttpPlanningRepository` against a real in-process Fastify app and real database, proving client and server agree on every one of the 32 methods

### Cutover

- [X] T063 [US2] Simplify `src/app/runtime/create-app-runtime.ts`: remove `openDatabase`, the `blocked` state, `versionchange`, `terminated`, and `requestPersistentStorage`; bootstrap becomes a single `GET /api/health` probe yielding `initializing | ready | failure`, with `retry()` re-probing
- [X] T064 [US2] Delete `src/app/providers/PersistenceStatusContext.ts` and remove its wiring and the device-local storage messaging from `src/app/providers/AppProviders.tsx` (FR-015)
- [X] T065 [US2] Rewire `src/main.tsx` to construct `createHttpPlanningRepository` with the existing `createSystemClock()`, removing all IndexedDB imports
- [X] T066 [US2] Update `src/entities/planning/index.ts` to export the HTTP repository factory and drop `createIndexedDbPlanningRepository` and `openOrbitPlanningDatabase`
- [X] T067 [P] [US2] Update `src/app/runtime/create-app-runtime.test.ts` for the simplified lifecycle, deleting cases for removed states
- [X] T068 [US2] Verify `src/app/runtime/habit-boundary.ts` needs no logic change — it already calls `repository.prepareOpenPeriod` and correctly keeps rollover detection client-side under FR-009. Adjust only its failure typing if required

### IndexedDB removal

> Deliberately after cutover, so the repository is never in a state where neither
> implementation works (plan.md implementation sequence, step 7).

- [X] T069 [US2] Delete `src/entities/planning/api/indexeddb/` in full: repository, `database.ts`, `schema.ts`, `mappers.ts`, `migrations.ts`, and all nine `.test.ts` suites now living on the server
- [X] T070 [US2] Update `src/pages/backlog/model/use-backlog-page.ts` and every other consumer of `StorageUnavailable`, `QuotaExceeded`, `UpgradeBlocked`, and `UnexpectedStorageFailure` to handle `ServerUnavailable` and `UnexpectedServerFailure` instead. **Must complete before T071**, or removing the codes breaks typecheck (FR-014)
- [X] T071 [US2] Now that no consumer references them, remove `StorageUnavailable`, `QuotaExceeded`, `UpgradeBlocked`, and `UnexpectedStorageFailure` from the error union in `src/entities/planning/model/planning-repository.ts`, completing the staged change begun in T020. Run `npm run typecheck` to confirm zero references remain
- [X] T072 [US2] Remove `idb` and `fake-indexeddb` from `package.json` and drop any `fake-indexeddb` setup from `tests/setup/vitest.setup.ts`
- [X] T073 [US2] Search `src/` for remaining IndexedDB references — identifiers, comments, and user-facing copy — and remove them (FR-002, FR-015)

### E2E

- [X] T074 [US2] Rewrite `e2e/fixtures/orbit.fixture.ts` to reset and seed through PostgreSQL directly from Node using `pg`, replacing all in-browser `indexedDB` manipulation. No test-only routes may be added to the server
- [X] T075 [US2] Update `playwright.config.ts` so `webServer` builds and runs the real server against a dedicated E2E database instead of `vite preview`
- [X] T076 [US2] Replace `e2e/journeys/device-local-persistence.spec.ts` with `e2e/journeys/server-persistence.spec.ts` covering SC-002 and SC-003: data visible from a second browser context, and surviving a full site-data clear
- [X] T077 [US2] Run the seven existing journey specs in `e2e/journeys/` (`01-week-planning` through `07-history`) plus `responsive-accessibility.spec.ts` unchanged and confirm they pass; any required change is a behavior regression to investigate, not to accommodate

**Checkpoint**: The application runs entirely on the server. IndexedDB is gone, the error union carries only server codes, and `npm run verify` passes. US1 and US2 are both satisfied.

---

## Phase 5: User Story 3 — Failures Are Reported Honestly (Priority: P2)

**Goal**: Unreachable server and rejected changes surface clearly and are never presented as saved.

**Independent Test**: Stop the database; attempt reads and writes; every one surfaces a clear
failure and nothing appears saved. Restart; the app recovers and prior data is intact.

- [ ] T078 [US3] Verify every page presents an unavailable-data state rather than an empty or stale view when a query returns `ServerUnavailable` (FR-012), fixing any page in `src/pages/` that currently renders empty
- [ ] T079 [US3] Audit the mutation hooks in `src/features/*/model/use-*.ts` and confirm each surfaces failure and never optimistically shows a change as saved (FR-011)
- [ ] T080 [P] [US3] Write `server/planning/repository.atomicity.test.ts` proving a command failing mid-transaction leaves zero partial state, with `closeDay` as the primary case since it touches days, occurrences, plan entries, events, and habit occurrences (SC-005)
- [ ] T081 [P] [US3] Write `server/planning/repository.concurrency.test.ts` proving two commands against the same `expectedRevision` produce one success and one `RevisionConflict` carrying both revisions, with no overwrite (SC-006)
- [ ] T082 [P] [US3] Add `e2e/journeys/server-unavailable.spec.ts` covering the SC-004 scenarios: unreachable on load, unreachable mid-session, and recovery after the server returns
- [ ] T083 [US3] Add a 503 path test in `src/entities/planning/api/http/http-planning-repository.test.ts` asserting the client maps a database-unavailable response to `ServerUnavailable` rather than to a domain error

**Checkpoint**: Failure behavior is honest and covered by tests at every layer.

---

## Phase 6: User Story 4 — Run the Complete Application Simply (Priority: P2)

**Goal**: One documented command starts everything, and data survives restarts.

**Independent Test**: From a clean checkout, `docker compose up` yields a working app; record
data, `docker compose down`, `up` again, and the data is still there.

- [ ] T084 [US4] Add static file serving to `server/app.ts` via `@fastify/static` when `NODE_ENV=production`, serving `dist/` with an SPA fallback to `index.html` for non-`/api` routes, so one origin serves both (FR-016)
- [X] T085 [US4] Add the `/api` dev proxy to `vite.config.ts` targeting `http://localhost:3000`, so the client uses relative `/api` paths identically in development and production
- [ ] T086 [US4] Create a multi-stage `Dockerfile`: build stage runs `npm ci`, `npm run build`, and `npm run build:server`; runtime stage is `node:22-alpine` with production dependencies, `dist/`, and `dist-server/`
- [ ] T087 [US4] Add the `app` service to `docker-compose.yml`: builds from the Dockerfile, `depends_on` `db` with a health condition, publishes the app port, and receives `DATABASE_URL` and `NODE_ENV=production`
- [ ] T088 [US4] Verify a first run against an empty volume produces a working, empty ORBIT rather than an error, with migrations applied automatically (FR-004, SC-009)
- [ ] T089 [US4] Verify `docker compose down` followed by `docker compose up` preserves all recorded data on the `orbit-db-data` volume (SC-010)
- [ ] T090 [US4] Add a `.dockerignore` excluding `node_modules`, `dist`, `dist-server`, `.git`, `coverage`, and `e2e/visual/__screenshots__`

**Checkpoint**: `docker compose up` from a clean checkout produces a working application with no manual setup.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T091 Update the `verify` script in `package.json` to include `test:server`
- [ ] T092 Extend coverage configuration in `vitest.config.ts` to include `server/**/*.ts`, preserving the existing global thresholds and the per-file thresholds on the untouched domain files
- [ ] T093 [P] Update feature 001's `specs/001-personal-planning-loop/contracts/persistence.md` to record that its storage-mechanism section is superseded by 002's `data-model.md` and `contracts/planning-api.md`, while its domain semantics remain binding (plan.md Principle V)
- [ ] T094 [P] Update `README.md` with the development and `docker compose up` instructions from quickstart.md, replacing any device-local storage description, and **document that Docker is a prerequisite for `verify`, `test:server`, `test:server:tz`, and `test:e2e`**
- [ ] T095 Create `vitest.server-tz.config.ts` extending the `server` project with `test.env.TZ` set to a non-UTC zone (e.g. `Pacific/Auckland`), wired to the `test:server:tz` script from T008. **Do not use the POSIX-only `TZ=… command` shell prefix** — it does not work in PowerShell and this project is developed on Windows
- [ ] T096 Run `npm run test:server:tz` and confirm results and recorded instants are byte-identical to `npm run test:server` (SC-007)
- [ ] T097 Grep `server/` for `createSystemClock`, `Date.now()`, and `new Date()` in request-handling paths and confirm zero occurrences (FR-009)
- [ ] T098 Run `npm run test:visual` and confirm zero snapshot diffs; investigate any diff rather than accepting it (SC-012)
- [ ] T099 Review all user-facing strings changed in this feature and confirm the only removals are device-local storage messaging (SC-012, FR-024)
- [ ] T100 Confirm browser storage holds zero planning records during normal operation (SC-008), then run the full `npm run verify` gate, walk every validation scenario in [quickstart.md](./quickstart.md), and record the result per success criterion in `specs/002-server-backed-persistence/verification.md` following the format 001 used

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks everything**
- **US1 (Phase 3)**: depends on Foundational. The critical path
- **US2 (Phase 4)**: depends on US1 — the client cannot be cut over to an unproven repository
- **US3 (Phase 5)**: depends on US2 for the client-side tasks; T080 and T081 depend only on US1 and may start earlier
- **US4 (Phase 6)**: depends on US2 for a working app to package; T086, T087, and T090 depend only on Setup and may start earlier
- **Polish (Phase 7)**: depends on all of the above

### Hard sequencing rules

1. **T069–T073 (IndexedDB removal) must not run before T063–T068 (cutover) is verified.**
   Until the server path works end to end, IndexedDB is the only working implementation and
   deleting it leaves the repository with none.
2. **T070 (update consumers) must precede T071 (remove old error codes).** Reversing them
   breaks typecheck. This ordering is the whole reason T020 adds rather than renames.
3. **T033 (transaction wrappers) must precede T045 and T046 (read projections).** The
   projections depend on the `REPEATABLE READ` wrapper for snapshot consistency.

### Within Phase 3

`T021` (harness) → `T022`–`T032` (retarget, must fail) → `T033`–`T035` (transactions, facade)
→ `T036`–`T046` (concern modules) → `T047`.

Within the concern modules: `T038` (plan entries) is required by `T037` (tasks) and `T043`
(closure). `T041` (materialization) is required by `T039` (series) and `T040` (habits) for
occurrence generation.

### Parallel opportunities

- **Phase 1**: T003, T004, T005, T006, T010 in parallel after T002
- **Phase 2**: T013 and T019 in parallel with each other; T011 → T012 → T014 → T015 is serial
- **Phase 3**: T022–T030 fully parallel (one file each). T036, T039, T040, T042, T045 parallel after T035 and T038
- **Phase 4**: T049, T053, T058, T061 parallel; T059 and T054 can proceed in parallel once the contract is fixed
- **Phase 5**: T080, T081, T082 parallel
- **Phase 7**: T093, T094 parallel with everything else

---

## Parallel Example: Phase 3 suite retargeting

```bash
# The nine construction-seam-only suites are separate files with no shared state.
# T031 (failures) is excluded — it needs judgment about which assertions may change.
Task: "Retarget 001's foundation suite to server/planning/repository.foundation.test.ts"
Task: "Retarget 001's us1 suite to server/planning/repository.week-planning.test.ts"
Task: "Retarget 001's us2 suite to server/planning/repository.task-execution.test.ts"
Task: "Retarget 001's us3 suite to server/planning/repository.recurrence.test.ts"
Task: "Retarget 001's us4 suite to server/planning/repository.day-closure.test.ts"
Task: "Retarget 001's us5 suite to server/planning/repository.daily-signals.test.ts"
Task: "Retarget 001's us6 suite to server/planning/repository.weekly-review.test.ts"
Task: "Retarget 001's us7 suite to server/planning/repository.history.test.ts"
Task: "Retarget 001's seeded-scale suite to server/planning/repository.seeded-scale.test.ts"
```

---

## Implementation Strategy

### The real MVP is Phase 3

For a normal feature the MVP is User Story 1 delivered to users. Here the most valuable
early milestone is **Phase 3 complete**: `PostgresPlanningRepository` passing all of feature
001's suites, with the application still running on IndexedDB and users unaffected.

That milestone answers the only question that actually carries risk in this feature — *does
the domain behave identically on PostgreSQL?* — while the change is still trivially
revertable. Everything after it is wiring.

**Stop and validate there.** If a domain assertion cannot pass without being weakened, that
is the signal to stop and report rather than to continue.

### Delivery sequence

1. Phases 1–2 → infrastructure ready
2. Phase 3 → **behavior preservation proven** (revert is still cheap here)
3. Phase 4 → cutover; users are now on the server
4. Phase 5 → failure handling hardened
5. Phase 6 → one-command deployment
6. Phase 7 → gates, docs, and recorded evidence

### Parallel team strategy

Phase 3 is the bottleneck and benefits most from parallelism: after T035, the concern modules
(T036–T046) are largely independent files, each gated by its own retargeted suite. A second
developer can build Phase 6's packaging (T086, T087, T090) in parallel from the start, since
it depends only on Setup.

---

## Notes

- `[P]` means different files with no incomplete dependency
- Feature 001's `us1`–`us7` suite names refer to **001's** stories, not this document's `[US1]`–`[US4]` labels
- Commit after each task or logical group
- Every phase checkpoint must be green — no milestone plans for a broken typecheck
- Domain assertions in the retargeted suites are never edited; storage-mechanism assertions are, and T032 records which
- No task in this list adds product behavior; any task that appears to is a misreading and should be raised
