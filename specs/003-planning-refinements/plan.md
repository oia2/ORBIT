# Implementation Plan: ORBIT Planning Refinements

**Branch**: `feat/planning-refinements` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-planning-refinements/spec.md`

## Summary

Three reported defects and five behavior changes to a working, deployed ORBIT. Phase 0
investigated the defects against the live production database rather than only the source,
and that changed the shape of the work:

- **Item 7 (lost state)** — no ongoing defect exists. The database volume was created on
  2026-08-18, the day 002 shipped, and every record since is continuous. The loss was the
  002 cutover discarding device-local IndexedDB data, as 002 permitted. User Story 1 is
  therefore delivered as *proof, protection, and recovery*: a persistence regression test, a
  volume-safe upgrade procedure, and a backup/restore path.
- **Item 6 (closed day shows 0 of N)** — not reproducible: the domain math, the three stored
  snapshots, and the live API all report truthful counts. One real defect was found in the
  same area — `getWeekView` fabricates `0/0` progress for an open week and is masked only by
  the client recomputing it. User Story 2 fixes that, collapses three parallel score
  derivations into one, and pins the agreement with tests.
- **Item 9 (dynamics)** — proven root cause in one client file: month-mode chart points read
  the *selected day's* score instead of the month's aggregate.

The behavior changes are then layered on that unified derivation: one weight per item
replacing 70/30 (with a migration that rescales existing frozen snapshots), a reopenable day,
task notes, optional habit duration, and an expand-all control on the week planner.

Evidence for every claim above is in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node ≥ 22.22.0, ES modules

**Primary Dependencies**: React 19.2, React Router 8.3, Fastify 5.12, Kysely 0.29 + `pg` 8.23

**Storage**: PostgreSQL 17 (single `orbit` database, 8 tables, static Kysely migration map).
This feature adds one additive column (`habit_definitions.duration_minutes`) and one
data migration that rewrites two `jsonb` snapshot columns in place.

**Testing**: Vitest 4.1 (domain, UI via jsdom + Testing Library, server against a real
PostgreSQL), Playwright 1.62 (e2e + visual), `@axe-core/playwright` for accessibility

**Target Platform**: Single-user self-hosted web app; one Docker Compose stack (`app` + `db`)
on the owner's machine, served at `http://localhost:3000`

**Project Type**: Web application — React SPA (`src/`) and Fastify API (`server/`) sharing one
pure domain layer (`src/entities/planning/model/`) that runs unmodified in both

**Performance Goals**: Unchanged from 002. Every read stays bounded by a page-derived date
range; no query added by this feature scans a dated table without a date predicate.

**Constraints**:
- **Existing production data must survive.** No requirement may be met by resetting the
  database (spec FR-002). The migration is idempotent and derives only from stored counts.
- Closed days and completed weeks stay immutable except through the new explicit reopen
  command; the frozen `plannedLoadMinutes` and every recorded count are never rewritten.
- The domain layer stays pure — no DOM, no `pg`, no browser globals.
- UI text stays Russian, in the existing voice.

**Scale/Scope**: One user, ~6 weeks of live history (20 task occurrences, 106 audit events,
22 habit occurrences). 8 user stories, 42 functional requirements. Roughly 25 source files
touched across domain, server, and UI, plus 2 migrations.

## Constitution Check

*GATE: evaluated before Phase 0 research and re-evaluated after Phase 1 design.*

### I. Explicit Product Decisions — **PASS**

Three decisions that would otherwise have been resolved silently were put to the owner and
answered before planning: reopening semantics (D1), the fate of existing 70/30 snapshots
(D2), and the closure denominator (D3). All three are recorded in the spec's **Resolved
Decisions** section and referenced from the requirements they govern. Two consequences
derived from D1 — that a reopened day returns its non-relocated tasks to live editing, and
that a day in a completed week cannot be reopened — are stated explicitly in the spec rather
than left implicit in code.

### II. Design Guidance and UX Consistency — **PASS with declared deviations**

Every new surface reuses an existing ORBIT pattern: the reopen action mirrors the existing
close-day card and its confirmation dialog; the note action sits beside the existing completion
control and reuses the shared accessible `Dialog`; the habit duration
field reuses the task duration input; the expand-all control reuses the planner header's
quiet button.

Three deviations from the approved 001 design are required by this feature's requirements
and are declared here rather than introduced silently:

| Deviation | Driven by | Source artifact to update |
| --------- | --------- | ------------------------- |
| The "Как считается результат" explainer no longer says "задачи 70%, привычки 30%" | FR-020 | `DESIGN.md`, and the copy in `ScoreBreakdown.tsx` |
| The dynamics legend "Результат 70/30" is renamed | FR-020 | `DESIGN.md`, `HistoryPage.tsx` |
| The closed-day card no longer says "Повторное открытие недоступно." | FR-009 | `DESIGN.md`, `DayPage.tsx` |
| Task notes open in a focused modal from a compact action beside completion, rather than expanding below the row | FR-023, owner refinement 2026-08-22 | `DESIGN.md`, `TaskRow.tsx` |

`DESIGN.md` is updated in the same change as the code, per principle II.

### III. Simplicity and Maintainability — **PASS**

The feature *removes* more structure than it adds. Three parallel day-score derivations
collapse to one (research Decision 3); the client-side `calculateOpenWeeklyProgress`
duplicate is deleted; `AppliedScoreWeights` is deleted rather than kept as a dead field.

No new abstraction, layer, dependency, or infrastructure is introduced. Task notes reuse the
`notes` field that already exists end-to-end. Habit duration reuses the existing
definition-snapshot pattern. Expand-all reuses state the page already holds. The only genuinely
new domain concept is `prepareDayReopening`, which the spec requires and which is modelled
directly on the existing `prepareDayClosure`.

Notably, no work is planned against the persistence layer, because Phase 0 found no defect
there. Speculative hardening was considered and rejected under this principle.

### IV. Quality Gates — **PASS**

`npm run verify` is the gate: `format:check`, `lint --max-warnings 0`, `tsc -b`,
`test:server`, `test:coverage`, `test:e2e`. `npm run test:server:tz` runs the server suite
again under a non-UTC timezone, as 002 established. `npm run test:visual` covers the changed
surfaces.

The Playwright matrix runs every database-backed functional journey once in desktop Chromium;
tablet and mobile WebKit run the responsive/accessibility smoke journey, while visual coverage
for all three viewport classes remains in `test:visual`. This preserves cross-device evidence
without tripling identical server-contract journeys; the measured e2e gate is 60.4 seconds for
25 passing tests. Retries are disabled so deterministic failures surface immediately with their
retained trace instead of multiplying gate time.

Every behavior change in this feature carries automated coverage — the table in research
Part C maps layer to what is added. The migration gets its own test asserting idempotence,
count preservation, and that no other table is touched. No check is claimed as
not-applicable.

### V. Controlled Evolution — **PASS**

This is the first behavior change since 001, and it is represented by a specification before
implementation. The three 001 requirements it overrides are named in the spec's **Superseded
Requirements** table rather than being contradicted in code. Where Phase 0 found the
implementation and the record disagreeing — `getWeekView` returning a value it knows is false
— the fix is in the source artifact and its contract, not a local workaround.

### Specification and Design Authority — **PASS**

No conflict between spec, plan, and design references remains open. The three ambiguities
that existed were resolved as D1–D3 before this plan was written.

**Result: all gates pass. The Complexity Tracking section is therefore empty and omitted.**

## Project Structure

### Documentation (this feature)

```text
specs/003-planning-refinements/
├── plan.md              # This file
├── spec.md              # Feature specification (with Resolved Decisions D1–D3)
├── research.md          # Phase 0 output — defect forensics and design decisions
├── data-model.md        # Phase 1 output — entity and schema changes
├── quickstart.md        # Phase 1 output — validation guide
├── contracts/
│   └── planning-api.md  # Phase 1 output — repository/API delta against 002
├── checklists/
│   └── requirements.md  # Specification quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

Only the paths this feature touches are listed. The layout itself is unchanged from 002:
a feature-sliced React client, a Fastify server, and one shared pure domain layer.

```text
src/
├── entities/planning/
│   ├── model/                       # Pure domain — runs in browser and on Node
│   │   ├── day-counts.ts            # NEW      shared cycle-safe day counting (FR-006–FR-008)
│   │   ├── scoring.ts               # CHANGED  single weight per item (FR-016)
│   │   ├── day.ts                   # CHANGED  ScoreBreakdown drops AppliedScoreWeights
│   │   ├── day-closure.ts           # CHANGED  uses the shared counting function
│   │   ├── day-reopening.ts         # NEW      prepareDayReopening (FR-009–FR-015)
│   │   ├── selectors.ts             # CHANGED  one shared day-count derivation
│   │   ├── planned-load.ts          # CHANGED  includes habit durations (FR-030)
│   │   ├── habit.ts                 # CHANGED  duration on definition + snapshot
│   │   ├── task.ts                  # CHANGED  'closure-reopen' event type
│   │   ├── task-lifecycle.ts        # CHANGED  notes clearable (FR-024)
│   │   ├── week-completion.ts       # CHANGED  aggregates through the shared rule
│   │   └── planning-repository.ts   # CHANGED  reopenDay + input shape changes
│   └── ui/
│       ├── ScoreBreakdown.tsx       # CHANGED  explainer copy (FR-020)
│       ├── TaskRow.tsx              # CHANGED  shared note action + modal (FR-023–FR-028)
│       └── HabitRow.tsx             # CHANGED  duration display (FR-032)
├── features/
│   ├── reopen-day/                  # NEW      hook + confirmation dialog
│   ├── manage-task/                 # CHANGED  note editing
│   └── manage-habit/                # CHANGED  duration field
├── pages/
│   ├── day/ui/DayPage.tsx           # CHANGED  reopen action, factual load copy
│   ├── week/ui/WeekPage.tsx         # CHANGED  expand-all, notes, habit duration
│   ├── backlog/ui/BacklogPage.tsx   # CHANGED  read-only task notes (FR-028)
│   └── history/
│       ├── model/use-history-page.ts # CHANGED month aggregate (FR-035–FR-039)
│       └── ui/HistoryPage.tsx        # CHANGED read-only notes + habit duration
└── app/ …                           # unchanged

server/
├── db/
│   ├── schema.ts                    # CHANGED  habit_definitions.duration_minutes
│   └── migrations/
│       ├── index.ts                 # CHANGED  register the two new migrations
│       ├── 002-single-weight-snapshots.ts   # NEW  rescale frozen snapshots (FR-021)
│       └── 003-habit-duration.ts            # NEW  additive column (FR-029)
└── planning/
    ├── reopening.ts                 # NEW      reopenDay transaction
    ├── queries.ts                   # CHANGED  real open-week progress
    ├── habits.ts                    # CHANGED  duration create/edit + propagation
    ├── mappers.ts                   # CHANGED  duration column mapping
    └── postgres-planning-repository.ts  # CHANGED  wire reopenDay

e2e/                                 # CHANGED  reopen, notes, expand-all journeys
README.md                            # CHANGED  volume-safe upgrade + backup/restore
DESIGN.md                            # CHANGED  the three declared deviations
package.json                         # CHANGED  db:backup / db:restore scripts
```

**Structure Decision**: The 002 structure is kept exactly. The client/server split with a
shared pure domain is what lets the single-weight rule, the reopen transition, and the
planned-load change be written once and be correct on both sides — so this feature adds no
structural choice of its own. The one new client feature slice (`features/reopen-day/`)
follows the existing `features/close-day/` shape (a `model/` hook plus a `ui/` dialog),
and the one new server module (`server/planning/reopening.ts`) follows
`server/planning/closure.ts`.

The shared record-to-count derivation is implemented in `model/day-counts.ts`, not
`model/scoring.ts` as T016 originally named. `habit.ts` already imports scoring types, so
making `scoring.ts` import habit records would create a domain import cycle. The separate
pure-domain module preserves the planned single derivation and the existing layer boundary
without adding an abstraction or runtime dependency.

## Phase 1 Design Artifacts

| Artifact | Contents |
| -------- | -------- |
| [data-model.md](./data-model.md) | Entity changes, the two migrations, and the stored-shape delta for `ScoreBreakdown` and `HabitDefinitionSnapshot` |
| [contracts/planning-api.md](./contracts/planning-api.md) | The `PlanningRepository` delta against 002: one new method, four changed input types, one changed error set |
| [quickstart.md](./quickstart.md) | The runnable validation guide, including the pre-upgrade backup and the before/after data-preservation check |

## Implementation Sequence

The spec's user-story priorities give the order, with one dependency added by research
Decision 3.

| Order | Work | Requirements | Why here |
| ----- | ---- | ------------ | -------- |
| 1 | Persistence proof, backup/restore, upgrade procedure | FR-001–FR-005 | Must exist before any migration runs against live data |
| 2 | One shared day-score derivation; fix `getWeekView`; pin FR-008 by test | FR-006–FR-008 | Precondition for the weighting change; without it the change lands in four places |
| 3 | Single-weight scoring + snapshot migration | FR-016–FR-022 | Depends on 2 |
| 4 | Reopen a day | FR-009–FR-015 | Independent of 3; depends on 2 for the live-score path |
| 5 | Task notes | FR-023–FR-028 | Independent |
| 6 | Habit duration + planned load | FR-029–FR-034 | Independent |
| 7 | History dynamics | FR-035–FR-039 | Depends on 3 for the values it charts |
| 8 | Week planner expand-all | FR-040–FR-042 | Independent, smallest |

Items 1, 2 and 4 are the P1 stories; 3, 5, 6 and 7 are P2; 8 is P3. Each is independently
testable and independently shippable, as the spec requires.

## Post-Design Constitution Re-Check

Re-evaluated after the Phase 1 artifacts were written. **No gate moved.**

- The contract delta adds exactly one repository method and changes four input types; no
  generic CRUD, no new persistence seam, no new abstraction — principle III holds.
- The data-model delta is one additive column plus one in-place `jsonb` rewrite that
  preserves every count; no destructive operation reaches the owner's data — the FR-002
  constraint holds by construction.
- No new NEEDS CLARIFICATION arose during design. D1–D3 covered every ambiguity the design
  actually encountered.
- The three declared design deviations remain the only ones, and each has a named source
  artifact to update in the same change — principle II holds.
