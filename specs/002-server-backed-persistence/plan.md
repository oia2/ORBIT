# Implementation Plan: ORBIT Server-Backed Persistence

**Branch**: `feat/server-backed-persistence` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-server-backed-persistence/spec.md`

## Summary

Replace ORBIT's device-local IndexedDB persistence with a Fastify + PostgreSQL backend,
without changing any product behavior.

The migration is far less invasive than it first appears, because of one fact established
during research: **the entire domain layer is already pure**. Every module under
`src/entities/planning/model/` imports only from `@/shared/lib/*` — no DOM, no IndexedDB, no
browser globals. The domain rules therefore move to the server *unmodified*. What is
actually being rewritten is the 2,598-line IndexedDB **orchestrator**, which sequences those
domain calls inside transactions, and which becomes a PostgreSQL orchestrator doing the same
thing with `db.transaction()`.

The approach in one line: **implement `PlanningRepository` twice** — `PostgresPlanningRepository`
on the server (authoritative, transactional) and `HttpPlanningRepository` in the browser (a
thin forwarder) — so that the 28 pages and features that depend on the interface see no
change at all.

Behavior equivalence is proven by retargeting feature 001's nine existing repository
behavioral suites (~2,600 lines, `us1`–`us7`, `failures`, `foundation`, `seeded-scale`) at
the PostgreSQL implementation. Two categories of assertion are treated differently, and the
distinction is what makes the evidence meaningful:

- **Domain and product-behavior assertions must remain unchanged** — scoring, recurrence,
  closure, membership, history, revisions, immutability. Editing one of these to reach green
  would conceal exactly the drift SC-001 exists to detect.
- **Assertions testing superseded IndexedDB storage mechanics may be replaced** with
  PostgreSQL/server equivalents — quota exhaustion, blocked version upgrades, terminated
  connections. These describe a mechanism this feature deliberately removes, and FR-014
  replaces the error codes they assert on. This affects the `failures` suite most, and parts
  of `foundation`.
- **Every storage-specific replacement is recorded in `traceability.md`**, so the two
  categories stay auditable and the first can never be quietly reclassified as the second.

SC-001's wording is "no test altered to accommodate different **product behavior**", which is
precisely this rule.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node.js ≥ 22.22.0 (existing engine constraint)

**Primary Dependencies**:
- *Existing, retained*: React 19.2, React Router 8.3, Vite 8.1
- *New runtime*: `fastify`, `@fastify/static`, `kysely`, `pg`
- *New dev*: `tsx` (server watch mode), `@types/pg`
- *Removed*: `idb`, `fake-indexeddb`

**Storage**: PostgreSQL 17 (Docker Compose service, named volume `orbit-db-data`), accessed
via Kysely + `pg`. Schema in [data-model.md](./data-model.md).

**Testing**: Vitest (three projects: `node` domain / `jsdom` UI / `server` integration),
Playwright for E2E. Server tests run against a real PostgreSQL — the schema's constraints are
load-bearing, so an in-memory substitute would not prove them.

**Target Platform**: Modern browsers (unchanged); Linux container for the server

**Project Type**: Web application — existing React/Vite SPA plus a new Fastify API, served
from a single origin

**Performance Goals**: None defined. Feature 001 set no performance budget and this feature
does not introduce one — a persistence migration is not the place to add a latency SLO the
product never had. This is a single-user application; there is no throughput target either.

**Constraints**:
- No product behavior may change (FR-010, FR-024)
- `PlanningRepository` interface preserved (FR-013)
- Client owns the whole clock — local date and instant; the server must never read its own
  timezone, system date, or system time during request handling (FR-009)
- Single origin for frontend and API (FR-016)
- No accounts, offline support, sync, realtime, or new analytics (FR-021, FR-023)
- Existing device-local data is discarded; no import path (FR-003)

**Scale/Scope**: One user, one deployment. ~32 API endpoints, 8 tables, 1 new server
directory. Frontend changes confined to bootstrap wiring and the repository adapter.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

### I. Explicit Product Decisions — **PASS**

This feature introduces no product behavior (FR-010). The three product-visible decisions it
did force — superseding 001's device-local guarantee, discarding existing local data, and
access control — were surfaced to the product owner and recorded in the spec's Clarifications
rather than resolved silently.

Clock semantics are preserved rather than reinterpreted: the client supplies **both**
`currentLocalDate()` and `now()` with every request, and the server rebuilds feature 001's
clock with the existing `createFixedClock` (research Decision 5). The server holds no clock
of its own. An earlier draft of this plan split the clock — client date, server instant —
and that was corrected: a composite clock whose halves can disagree is a time model feature
001 does not have, and introducing one during a persistence migration would be exactly the
kind of silent semantic change Principle I forbids.

### II. Design Guidance and UX Consistency — **PASS**

No visual, layout, interaction, or wording change is planned (FR-024), so the approved Open
Design reconciliation and `DESIGN.md` remain satisfied without re-reconciliation.

The single authorized exception is removal of device-local storage messaging and the
persistent-storage request, which FR-015 requires. This deletes `PersistenceStatusContext`,
`PersistentStorageState`, and the copy they drove. Any user-visible string removed this way
must be identified during implementation and confirmed against 001's content review, so that
SC-012's "0 changes to user-facing wording other than the removal of device-local storage
messaging" is verifiable rather than assumed.

### III. Simplicity and Maintainability — **PASS**

The dominant risk in this feature is over-building the server. Choices made to avoid it,
each recorded with its rejected alternative in [research.md](./research.md):

| Chosen | Rejected | Why the rejection |
| ------ | -------- | ----------------- |
| Domain stays in `src/`, shared via the existing `@/` alias | npm workspaces / `packages/domain` | Rewrites every path in the repo to solve a problem one lint rule solves |
| One route per interface method (RPC) | REST resource modelling | The interface *is* the contract; resource modelling would obscure it and invite drift |
| Hand-written parsers reusing existing brand validators | Zod | Would restate the whole brand system in a second vocabulary |
| Kysely's built-in migrator, static migration map | A migration tool or framework | Already shipped with a chosen dependency |
| Retarget existing test suites | Write new server tests | New tests would prove the new code works, not that behavior is unchanged |
| `docker compose up -d db` for tests | Testcontainers | The compose service already exists for development |
| Vite SSR build for the server | `tsc` + `tsc-alias` | Reuses the alias config already in the repo |
| No owner/user column | A nullable `owner_id` "for later" | Textbook speculative generality; FR-021 keeps the single-user model |

No queues, cache, Redis, ORM, DI container, event bus, or repository-of-repositories is
introduced. The client adapter holds no cache and no retry logic.

### IV. Quality Gates — **PASS, with an accepted trade-off**

`npm run verify` continues to run format, lint, typecheck, coverage, and E2E, extended to
cover `server/`. Coverage thresholds are preserved, including the per-file thresholds on
`scoring`, `task-lifecycle`, `recurrence`, `day-closure`, and `history` — all of which are
domain files that this feature does not touch.

**Trade-off**: `verify` now requires Docker for a PostgreSQL instance. This is accepted
because the schema's constraints are a designed part of the correctness story
(`data-model.md`), and testing them against a substitute engine would leave them unproven.
The fast domain-unit loop stays database-free, so day-to-day iteration is unaffected.

### V. Controlled Evolution — **PASS**

Feature 002's spec was written and approved before planning, and it records its three
supersessions of feature 001 in an explicit table rather than contradicting 001 in code.
Feature 001's spec remains the authority for all preserved behavior.

The one artifact that must be updated alongside implementation is 001's
`contracts/persistence.md`, whose *storage mechanism* section is superseded by this feature's
`data-model.md` and `contracts/planning-api.md`. Its domain semantics remain binding. This is
tracked as an implementation task rather than left as a silent inconsistency.

### Post-Phase-1 re-evaluation — **PASS**

The Phase 1 design added no new gate concerns. The relational schema (`data-model.md`) moves
several 001 invariants from application convention into database constraints — notably
`UNIQUE (occurrence_id, plan_date)` for FR-027 — which strengthens Principle IV rather than
complicating it. The API contract adds no capability beyond the existing interface.

## Project Structure

### Documentation (this feature)

```text
specs/002-server-backed-persistence/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — 12 decisions with rejected alternatives
├── data-model.md        # Phase 1 — PostgreSQL schema for 001's existing entities
├── quickstart.md        # Phase 1 — run and validate the migrated application
├── contracts/
│   └── planning-api.md  # Phase 1 — HTTP projection of PlanningRepository
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 — created by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
server/                              # NEW — Fastify backend
├── main.ts                          # entry: config → migrate → serve
├── app.ts                           # Fastify factory (built separately so tests can inject)
├── config.ts                        # environment parsing
├── db/
│   ├── schema.ts                    # Kysely Database interface
│   ├── client.ts                    # pg Pool + Kysely; date/timestamptz parsed as strings
│   └── migrations/
│       ├── 001-initial-schema.ts
│       └── index.ts                 # static migration map (bundler-safe)
├── planning/
│   ├── postgres-planning-repository.ts   # implements PlanningRepository, authoritative
│   ├── mappers.ts                        # row ⇄ domain
│   └── *.test.ts                         # 001 suites, retargeted
└── api/
    ├── routes.ts                    # method name → handler
    ├── parsers.ts                   # request validation via existing brand validators
    ├── request-clock.ts             # X-Orbit-Local-Date + X-Orbit-Instant → createFixedClock
    └── *.test.ts                    # transport contract tests

src/                                 # EXISTING — client + shared domain
├── shared/lib/                      # SHARED with server (must stay platform-neutral)
│   ├── ids/, result/, local-date/
├── entities/planning/
│   ├── model/                       # SHARED with server — pure domain, UNCHANGED
│   │   └── planning-repository.ts   # the port; error union updated per FR-014
│   ├── api/
│   │   ├── http/                    # NEW — HttpPlanningRepository
│   │   │   └── http-planning-repository.ts
│   │   ├── indexeddb/               # DELETED
│   │   └── repository-context.tsx   # unchanged
│   └── ui/                          # unchanged
├── app/
│   ├── runtime/
│   │   ├── create-app-runtime.ts    # simplified: health probe replaces DB handshake
│   │   └── habit-boundary.ts        # unchanged — already abstracts prepareOpenPeriod
│   └── providers/
│       ├── AppProviders.tsx         # persistence-status wiring removed
│       └── PersistenceStatusContext.ts   # DELETED (FR-015)
├── pages/, features/                # unchanged except storage error-code handling
└── main.tsx                         # wires HttpPlanningRepository

e2e/
├── fixtures/orbit.fixture.ts        # REWRITTEN — seeds/resets via pg from Node
└── journeys/
    └── device-local-persistence.spec.ts  # REPLACED by a server-persistence journey

Dockerfile                           # NEW — multi-stage build
docker-compose.yml                   # NEW — db + app, named volume
vite.server.config.ts                # NEW — SSR build for the server
vite.config.ts                       # /api dev proxy added
vitest.config.ts                     # third project: `server`
```

**Structure Decision**: A single package with a new top-level `server/` directory, rather
than npm workspaces. The frontend stays exactly where it is, so no existing import path
changes. `src/shared/lib/**` and `src/entities/planning/model/**` become shared code consumed
by both sides through the existing `@/` alias — they are already platform-neutral, and a lint
rule keeps them that way while forbidding `src/` from importing `server/`.

The trade-off is that `src/` now means "client code plus shared domain" rather than "browser
code". This is documented and lint-enforced. The alternative — restructuring into workspaces
— would touch every config file and import path in the repository to achieve directory
tidiness, against Principle III and against the spec's instruction to minimize frontend
changes.

## Implementation Sequence

Detailed tasks are generated by `/speckit-tasks`. The intended order, chosen so the
behavioral safety net exists before the cutover:

1. **Infrastructure** — Docker Compose PostgreSQL, config, Kysely client, migration harness.
2. **Schema** — the initial migration implementing `data-model.md`, with all constraints.
3. **`PostgresPlanningRepository`** — the largest piece. Built against the retargeted 001
   suites, which serve as its specification. Queries first, then commands grouped by user
   story, so `us1`–`us7` go green incrementally.
4. **HTTP layer** — routes, parsers, request clock, health endpoint.
5. **Client adapter** — `HttpPlanningRepository` plus transport contract tests.
6. **Cutover** — wire `main.tsx`, simplify `createAppRuntime`, delete `PersistenceStatusContext`,
   update the error union and its consumers.
7. **Removal** — delete the IndexedDB adapter, its suites, `idb`, and `fake-indexeddb` (FR-002).
8. **E2E** — rewrite fixtures against `pg`; replace the device-local persistence journey with
   a server-persistence journey covering SC-002 and SC-003.
9. **Packaging** — Dockerfile, single-origin static serving, `docker compose up`.
10. **Documentation** — README run instructions; update 001's `contracts/persistence.md`
    storage section.

Step 7 is deliberately after step 6: IndexedDB is removed only once the server path is
proven, so the repository is never in a state where neither implementation works.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Silent behavior drift while reimplementing 2,598 lines of orchestration | Retargeted 001 suites are the acceptance gate for step 3; domain and product-behavior assertions must not be edited (SC-001) |
| `pg` returning `Date` objects for `date`/`timestamptz`, reintroducing timezone bugs | Explicit type parsers configured on the pool; called out in `data-model.md` and covered by tests asserting exact string forms |
| Transaction scope too narrow, leaving partial state on failure | One transaction per boundary operation (research Decision 7); `failures` suite covers rollback (SC-005) |
| The 001 suites turn out to depend on IndexedDB specifics rather than interface behavior | Discovered early — retargeting begins at step 3. Classify each case: an assertion testing *superseded storage mechanics* is replaced with a PostgreSQL equivalent and recorded in `traceability.md`; an assertion testing *domain behavior* that merely reaches the domain through IndexedDB is a coupling defect to fix in the test. Neither is ever resolved by weakening a domain assertion |
| Misclassifying a domain assertion as a storage assertion, to get past a real regression | The two categories are defined in the Summary above and in research.md Decision 11; every replacement is recorded in `traceability.md` with its justification, so the classification is reviewable rather than implicit |
| E2E fixture rewrite is larger than estimated | Isolated to `orbit.fixture.ts`; journeys themselves are untouched because the UI does not change |

## Complexity Tracking

No constitutional violations require justification. The one accepted trade-off — `npm run
verify` now requiring Docker — is recorded under Principle IV above with its rationale, and
is a consequence of testing real database constraints rather than an added abstraction.
