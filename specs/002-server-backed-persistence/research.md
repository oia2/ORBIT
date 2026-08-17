# Phase 0 Research: ORBIT Server-Backed Persistence

**Feature**: `002-server-backed-persistence` | **Date**: 2026-08-17

This document records the decisions that resolve the open technical questions before
design. Technology selections (TypeScript, Fastify, PostgreSQL, Kysely + `pg`, Docker
Compose) were fixed by the product owner in the spec's Technical Direction section and are
not re-opened here; what follows is how they are applied.

## Codebase findings that drive the design

These were established by reading the existing implementation, and they shape everything
below.

| Finding | Evidence | Consequence |
| ------- | -------- | ----------- |
| The domain model is **pure**. Every module under `src/entities/planning/model/` imports only from `@/shared/lib/{ids,result,local-date}`. No DOM, no IndexedDB, no browser globals. | `grep` of all external imports in `model/*.ts` | The entire domain layer runs unmodified on Node. The migration does **not** need to rewrite or port domain logic — the single largest risk to behavior preservation is removed. |
| `PlanningRepository` is the only persistence seam. 28 UI/page/feature modules depend on it; none import the IndexedDB adapter. | `src/entities/planning/model/planning-repository.ts:296`, import graph | Preserving the interface satisfies FR-013 with near-zero page changes. |
| The IndexedDB adapter is a 2,598-line **orchestrator**, not a data mapper. It sequences domain calls inside transactions. | `indexeddb-planning-repository.ts` | This orchestration is what moves to the server. It is rewritten against PostgreSQL, not relocated verbatim. |
| An injectable `ApplicationClock` (`now()`, `currentLocalDate()`) is threaded through nearly every mutation, and `createFixedClock` already exists. | `src/shared/lib/local-date/clock.ts:95` | The server builds a per-request clock from the client's supplied reading using this exact factory. No new abstraction is needed for FR-009. |
| `generateUuid` defaults to `globalThis.crypto.randomUUID()` but is injectable. | `src/shared/lib/ids/index.ts:55` | ID generation works unchanged on Node 22. |
| `createHabitBoundaryCoordinator` already abstracts the local-date rollover behind `repository.prepareOpenPeriod(range)`. | `src/app/runtime/habit-boundary.ts:104` | The client keeps owning rollover *detection* (correct under FR-009); only the call it makes becomes remote. Near-zero change. |
| `createAppRuntime` is heavily IndexedDB-shaped: `openDatabase`, `blocked`, `versionchange`, `terminated`, `requestPersistentStorage`. | `src/app/runtime/create-app-runtime.ts` | This is the one client module that shrinks substantially. Removing the persistent-storage request is required by FR-015 anyway. |
| E2E fixtures seed and reset **through the browser's IndexedDB**. | `e2e/fixtures/orbit.fixture.ts` | The fixture must be rewritten; it is the main E2E work item. |

## Decision 1: Where domain orchestration lives

**Decision**: The complete repository implementation moves to the server as
`PostgresPlanningRepository`, implementing the existing `PlanningRepository` interface
unchanged. The client receives `HttpPlanningRepository`, implementing the *same* interface
by forwarding each method over HTTP.

**Rationale**: FR-005 and FR-006 require the server to be authoritative — the client must
not be able to record a change the domain rules would reject. Because the interface is
implemented on both sides, pages and features see no change at all (FR-013), and the
existing behavioral test suites can be pointed at the new implementation to prove
equivalence (SC-001).

**Alternatives considered**:

- *Server as thin CRUD, logic stays on the client*: rejected outright — the client would be
  authoritative, violating FR-005/FR-006, and every invariant would be advisory.
- *Split logic between client and server*: rejected. Two copies of a rule is exactly how
  behavior drifts, and 001's invariants (membership uniqueness, closure eligibility,
  recurrence boundaries) are not separable.

## Decision 2: The domain layer becomes shared code, in place

**Decision**: `src/entities/planning/model/**` and `src/shared/lib/**` become code shared by
client and server. They stay exactly where they are. The server imports them through the
existing `@/` alias. A lint rule forbids these directories from importing anything
browser- or Node-specific, and forbids `src/` from importing `server/`.

**Rationale**: The domain is already pure, so nothing needs to move. Relocating it to a
`shared/` root or splitting the repo into npm workspaces would rewrite import paths across
the entire frontend, every config file, the coverage thresholds, and Playwright — a large
mechanical diff whose only benefit is directory aesthetics. Constitution Principle III
requires the simplest solution that satisfies the current requirement.

**Trade-off accepted**: `src/` no longer means "browser code" exclusively; it means "client
code plus shared domain." This is documented and enforced by lint rather than by structure.

**Alternatives considered**:

- *npm workspaces (`apps/web`, `apps/api`, `packages/domain`)*: the textbook layout, and the
  right answer if this were a multi-team or multi-deployable product. Here it adds a
  workspace toolchain and touches every path in the repo to solve a problem
  (accidental cross-imports) that one lint rule solves.
- *Copy the domain into the server*: rejected. Two divergent copies of the rules is the
  precise failure mode this feature exists to avoid.

## Decision 3: Transport shape — RPC over the existing method names

**Decision**: One route per repository method: `POST /api/planning/<methodName>`. The
request body is the method's input object; the response body is the `QueryResult<T>` or
`CommandResult<T>` envelope the interface already returns.

**Rationale**: The `PlanningRepository` interface *is* the contract this feature must
preserve. Mapping it one-to-one onto routes makes the client adapter mechanical, makes
divergence between client and server impossible to introduce accidentally, and removes an
entire class of design decisions (resource modeling, nesting, partial updates) that would
deliver no product value. Reads use POST as well, purely for uniformity — there is no
caching, no bookmarking, and no proxy in the deployment, and `getHistoryView` takes a
structured query object that would otherwise need URL encoding.

**Alternatives considered**:

- *REST resource modeling*: rejected. The named use cases (`correctBoundaryMissToCompleted`,
  `prepareOpenPeriod`, `closeDay`) are deliberately not CRUD; forcing them into resource
  semantics would obscure them and invite drift from the interface.
- *GET for the five queries*: marginally more conventional, but splits the adapter into two
  shapes and needs query-string encoding for `HistoryQuery`. Not worth it.
- *A single `POST /api/planning` with a `method` field*: rejected — loses per-route logging,
  and gains nothing over a path segment.

## Decision 4: Domain failures travel as HTTP 200 envelopes

**Decision**: Any request the server can evaluate returns **HTTP 200** carrying the result
envelope, including domain rejections (`{ ok: false, error: { code: 'PeriodImmutable' } }`).
Non-2xx status codes are reserved for conditions the domain never produces: `400` malformed
envelope or missing local-date header, `404` unknown method, `503` database unavailable,
`500` unexpected failure.

**Rationale**: Feature 001 already models domain failures as *values*, not exceptions —
`QueryResult`/`CommandResult` are discriminated unions. Preserving that means the transport
must not reinterpret a legitimate domain answer as a transport error. "This day is immutable"
is a successful evaluation with a negative answer, and mapping it to HTTP 409 would force
the client adapter to reconstruct domain meaning from status codes. The client rule becomes
trivially simple: 200 → parse envelope and return it; anything else → `ServerUnavailable`.

**Alternatives considered**:

- *Map each domain error to an HTTP status*: rejected. It is a lossy encoding (eleven domain
  codes, few sensible statuses), and it puts domain knowledge in two places.

## Decision 5: The request clock — the whole clock crosses the boundary

**Decision**: Every request carries **both** halves of the client's clock reading, in two
headers:

```
X-Orbit-Local-Date: YYYY-MM-DD
X-Orbit-Instant:    YYYY-MM-DDTHH:MM:SS.sssZ
```

A Fastify hook validates them with the existing `localDate` and `instant` brand validators
and builds the per-request clock with the **existing** `createFixedClock({ currentLocalDate,
instant })` from `src/shared/lib/local-date/clock.ts:95`. The server never calls
`createSystemClock`, never reads `Date.now()`, and never reads its own timezone.

**Rationale**: `ApplicationClock` is a single injected abstraction with two members, and
feature 001's domain logic consumes it as one thing. Preserving its semantics means moving
it across the boundary whole. Splitting it — client date, server instant — would create a
clock that exists nowhere in feature 001: a composite whose two halves can disagree, drift
apart under clock skew, and produce a `Day` whose `closedAt` instant does not fall within the
`currentLocalDate` it was closed on. That is a new time model introduced by a persistence
migration, which is exactly what this feature is not allowed to do.

Sending both also makes the per-request clock trivially injectable in tests: a request is a
complete, deterministic clock reading, so the retargeted 001 suites (Decision 11) can drive
server time exactly the way they already drive `createFixedClock` today. And it makes FR-009
mechanically checkable — the rule becomes "no server-time API is called anywhere in request
handling", which a lint rule can enforce, rather than "server time is used, but only for
values we have argued are safe".

**Alternatives considered**:

- *Client date, server instant*: rejected on the reasoning above. The argument for it — that
  a UTC instant carries no timezone meaning, and that a server clock is monotonic and
  immune to client skew — is true as far as it goes, but it buys robustness against a
  hypothetical bad client clock at the cost of a time model feature 001 does not have, in a
  single-user deployment where client and server clocks are usually the same machine.
- *Server derives the local date from its own timezone*: rejected. The exact failure FR-009
  exists to prevent; a container running UTC would roll days over at the wrong moment for
  any non-UTC user.
- *Client sends the instant only, server derives the local date from it*: rejected. Deriving
  a local date from a UTC instant requires knowing the client's timezone, which would mean
  transmitting and trusting a timezone identifier — more machinery than sending the date
  the client has already computed.

**Consequence for audit ordering**: none. `task_events` order by an explicit monotonic
`sequence` assigned by the database, and habit outcome events by an explicit `ordinal`.
Neither depends on instant values, so client-supplied instants cannot reorder history even
if the device clock moves backwards.

## Decision 6: PostgreSQL schema — relational spine, JSONB for value objects

**Decision**: Identity, foreign keys, dates, status, ordering, revisions, and anything that
carries an invariant or is queried become real columns with real constraints. Nested value
objects that are always read and written together with their parent become `jsonb`.

**Rationale**: The product owner asked for "explicit PostgreSQL transactions and constraints
over new abstraction layers," and the highest-value constraint available is a `UNIQUE
(occurrence_id, plan_date)` on task plan entries — that is 001's FR-027 invariant ("one
logical task occurrence has at most one membership per local date") enforced by the
database rather than by convention. Foreign keys likewise make orphaned occurrences
unrepresentable. Conversely, decomposing `ruleVersions[]`, `plannedSnapshot`,
`closureSnapshot`, `outcomeEvents[]`, and the weekly goal list into child tables would add
joins and mapping code for collections that are never queried independently and are always
rewritten wholesale as part of their aggregate.

**Applying the rule**:

| Shape | Storage | Why |
| ----- | ------- | --- |
| `task_plan_entries (occurrence_id, plan_date)` | columns + `UNIQUE` | Enforces FR-027 in the database |
| `task_occurrences.placement` | `placement_kind` + `placement_date` columns | Replaces the adapter's synthetic `placementKey`; indexed for day and backlog listing |
| `task_events.sequence` | `bigint` from a sequence | Existing store is keyed by a monotonic number; ordering is load-bearing |
| `days.status`, `weeks.status` | column + `CHECK` | Drives immutability checks on every mutation |
| `Week.goals[]` | `jsonb` | An ordered value collection of the week aggregate, guarded by `weeks.revision`; JSONB preserves order and matches existing semantics exactly |
| `ruleVersions[]` | `jsonb` | Append-only version history, always loaded with its series/definition, never queried alone |
| `plannedSnapshot`, `closureSnapshot`, `completionSnapshot`, `state` | `jsonb` | Immutable captured snapshots |
| `outcomeEvents[]` | `jsonb` | Ordered by an explicit `ordinal`, always loaded with the occurrence |

**Alternatives considered**:

- *Fully relational, every nested object decomposed*: rejected as speculative normalization.
  It would roughly double the mapping code and the query count to support decomposition
  nothing currently needs.
- *Fully document-oriented (one `jsonb` blob per store, mirroring IndexedDB)*: rejected.
  It would be the fastest path to a working port, but it discards the constraints the owner
  explicitly asked for and reduces Kysely to a JSON courier.

## Decision 7: Transactions and concurrency

**Decision**: Every command executes inside a single explicit `db.transaction()`. Reads that
span multiple tables run in one transaction too, so a projection cannot observe a half-applied
command. Optimistic concurrency keeps feature 001's `expectedRevision` mechanism: the
`UPDATE` carries `WHERE revision = $expected`, and a zero row count produces the existing
`RevisionConflict` error.

**Rationale**: FR-007 requires each boundary operation to be atomic, and `closeDay` in
particular touches days, task occurrences, plan entries, events, and habit occurrences.
Reusing the existing revision mechanism rather than introducing database-level locking keeps
the behavior — and the error the client already handles — identical (FR-008).

**Alternatives considered**:

- *`SELECT … FOR UPDATE` pessimistic locking*: unnecessary for a single-user deployment, and
  it would change the observable outcome of a stale write from `RevisionConflict` to a wait.
- *`SERIALIZABLE` isolation*: would surface serialization failures the client has no
  representation for. Default `READ COMMITTED` plus the existing revision guard is
  sufficient and behavior-preserving.

## Decision 8: Request validation without a schema library

**Decision**: Hand-written parsers, one per endpoint input, in `server/api/parsers.ts`,
reusing the existing branded-type validators from `@/shared/lib/ids` and
`@/shared/lib/local-date`. A parse failure returns the existing
`ValidationFailure` error shape.

**Rationale**: The codebase already has a complete branded-primitive validation layer
(`localDate`, `instant`, `revision`, `entityId`, `durationMinutes`, `dayPosition`). Adding a
schema library would mean expressing every brand a second time in a second vocabulary and
keeping the two in sync — new abstraction for no new capability, against Principle III. And
`ValidationFailure` already exists in the error union, so rejected input maps onto behavior
feature 001 already defines.

**Alternatives considered**:

- *Zod*: more concise per endpoint, but duplicates the brand system and adds a dependency.
- *Fastify JSON Schema*: validates shape but not brands, so brand parsing would still be
  needed — two validation layers instead of one.

## Decision 9: Build and run

**Decision**:

- **Server build**: `vite build --ssr` with a small `vite.server.config.ts`. It reuses the
  existing `@/` alias, externalizes `node_modules`, and emits a single Node entry point.
- **Server dev**: `tsx watch server/main.ts`, which honours `tsconfig` paths.
- **Dev topology**: PostgreSQL in Docker (`docker compose up -d db`); Vite on 5173 and
  Fastify on 3000 run on the host. Vite proxies `/api` → `:3000`, so the single-origin
  assumption (FR-016) holds in development as well as production.
- **Production-like topology**: `docker compose up` builds one application image that serves
  the compiled frontend and `/api` from one Fastify process on one port, alongside
  PostgreSQL with a named volume.

**Rationale**: Reusing Vite for the server build means no new build toolchain and no second
alias configuration to keep in sync. Proxying `/api` in dev means the client never needs a
configurable API base URL in any environment, which keeps FR-016 true by construction rather
than by configuration.

**Alternatives considered**:

- *`tsc` + `tsc-alias` for the server build*: works, but adds a dependency purely to rewrite
  path aliases that Vite already resolves.
- *Two separate origins with CORS*: rejected by FR-016 and by the owner's single-origin
  preference; it would also add a CORS configuration surface for no benefit.

## Decision 10: Migrations

**Decision**: Kysely's built-in `Migrator` with an **explicit static migration map** rather
than `FileMigrationProvider`. Migrations live in `server/db/migrations/` and are registered
in an index module. The server runs pending migrations at startup, before it accepts
requests.

**Rationale**: `FileMigrationProvider` reads migration files from disk at runtime, which
breaks once the server is bundled into `dist-server/`. A static map is bundler-safe, type-checked,
and no more code. Running migrations at startup satisfies FR-019 ("repeatable, automated,
not manual") and means `docker compose up` on an empty volume produces a working
application with no extra step (FR-004, SC-009). A single-instance deployment has no
concurrent-migration hazard.

**Alternatives considered**:

- *A separate migration container or manual `npm run db:migrate` step before start*: adds an
  operational step that SC-009 ("no additional manual setup steps") rules out. The script is
  still provided for local use, but startup does not depend on anyone running it.
- *Third-party migration tools*: Kysely already ships this; a second tool would be redundant.

## Decision 11: Test strategy — reuse the 001 suites as the equivalence proof

**Decision**: Four tiers.

1. **Domain unit tests** (`src/entities/planning/model/*.test.ts`) — untouched. They test pure
   functions and are the bulk of existing coverage. No database.
2. **Repository behavioral tests** — the nine existing adapter suites (`us1`–`us7`,
   `failures`, `foundation`, `seeded-scale`, ~2,600 lines) are **retargeted** from
   `createIndexedDbPlanningRepository` to `createPostgresPlanningRepository`. Their
   assertions are written against the interface, so they carry over as the direct evidence
   for SC-001. They move to `server/planning/` and run in a new `server` Vitest project
   against a real PostgreSQL.
3. **Transport contract tests** — exercise `HttpPlanningRepository` against a Fastify
   instance with an in-process injection, covering envelope round-tripping, brand
   preservation, header validation, and the `ServerUnavailable` mapping.
4. **E2E** — the existing Playwright journeys run against the real server and database.

**Test database isolation**: one database per Vitest worker (`orbit_test_<worker>`), migrated
once, with all tables truncated between test cases. Simple, fast, and gives real constraint
enforcement.

**Rationale**: The strongest available evidence that behavior is unchanged is that the tests
written to pin 001's behavior still pass unmodified against the new implementation. That is
exactly SC-001's wording ("no test altered to accommodate different product behavior"), so
the suites must be preserved rather than rewritten.

**Trade-off accepted**: `npm run verify` now needs Docker for a PostgreSQL instance. The fast
domain tests stay database-free, so the tight inner loop is unaffected.

**Alternatives considered**:

- *Testcontainers*: automatic lifecycle, but a heavy dependency when `docker compose up -d db`
  already exists for development.
- *An in-memory PostgreSQL substitute (pglite/pg-mem)*: rejected. The schema's value is in its
  real constraints; testing against an engine that implements them differently would
  undermine the point of Decision 6.
- *Keeping the IndexedDB suites alive against the old adapter*: rejected. FR-002 removes
  IndexedDB from runtime persistence, so those tests would pin code that no longer ships.

## Decision 12: Client bootstrap and error surface

**Decision**: `createAppRuntime` keeps its `initializing | ready | failure` lifecycle and
loses everything IndexedDB-specific — `openDatabase`, the `blocked` state, `versionchange`,
`terminated`, and `requestPersistentStorage`. Bootstrap becomes a single
`GET /api/health` probe; success yields the ready snapshot carrying `HttpPlanningRepository`.
`PersistenceStatusContext` and `PersistentStorageState` are deleted along with the
device-local storage messaging they drove.

**Rationale**: FR-015 forbids requesting persistent browser storage and forbids
device-local messaging, so that machinery is removed rather than adapted. Retaining the
bootstrap probe preserves the existing UX shape — one clear "cannot reach ORBIT" screen —
which gives FR-012 a natural home instead of pushing an unreachable-server error into every
page independently. `retry()` keeps working, now re-probing.

**Error union changes** (FR-014): the eleven domain codes are preserved verbatim.
`StorageUnavailable` → `ServerUnavailable`; `UnexpectedStorageFailure` →
`UnexpectedServerFailure`; `QuotaExceeded` and `UpgradeBlocked` are removed as
IndexedDB-specific with no server analogue. The union's exported type name
`DomainOrStorageError` is **kept** to avoid touching consumers for a rename.

**Alternatives considered**:

- *No bootstrap probe at all*: slightly less code, but every page would need its own
  unreachable-server treatment, and the first-load experience would degrade from one clear
  message to several partial ones.

## Resolved unknowns

| Question | Resolution |
| -------- | ---------- |
| Can the domain layer run on Node unchanged? | Yes — verified pure; only `@/shared/lib` imports. |
| Who owns the current local date? | Client, via `X-Orbit-Local-Date` (Decision 5). |
| Who owns audit instants? | Client, via `X-Orbit-Instant`. The whole clock crosses the boundary and the server reconstructs it with the existing `createFixedClock` (Decision 5). |
| How do domain errors cross the wire? | As 200-status result envelopes (Decision 4). |
| How is FR-027's membership invariant enforced? | Database `UNIQUE (occurrence_id, plan_date)` (Decision 6). |
| How is behavior equivalence proven? | Existing 001 repository suites retargeted, unmodified (Decision 11). |
| How do E2E tests seed data without IndexedDB? | Playwright fixtures use `pg` directly from Node; no test-only routes ship in the server. |
| What happens to `QuotaExceeded` / `UpgradeBlocked`? | Removed — IndexedDB-specific with no server analogue (Decision 12). |
| Does anything need a new runtime dependency beyond Fastify/Kysely/pg? | No. `tsx` is added as a dev dependency for server watch mode. |
