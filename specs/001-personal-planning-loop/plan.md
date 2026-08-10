# Implementation Plan: ORBIT Personal Planning Loop

**Branch**: `001-personal-planning-loop` (feature identifier; no Git branch hook is configured)  
**Date**: 2026-08-10  
**Spec**: [spec.md](spec.md)  
**Planning status**: Phase 0/1 non-visual design artifacts are reconciled with
the clarified specification; the external visual design gate remains pending.
The approved usability protocol is recorded in `usability-protocol.md`. A fresh
Open Design read was attempted on 2026-08-10 and failed with `Transport closed`,
so affected UI/component/browser work remains blocked by the serialized design
gate; toolchain, pure-domain, contract, and non-visual adapter work may continue.

**Input**: The approved feature specification, project constitution, repository-root `DESIGN.md`, approved ORBIT Open Design context, and the technical direction supplied with `$speckit-plan`.

## Summary

Build the first ORBIT planning loop as one frontend-only React SPA for a single
local user. TypeScript domain modules provide the only implementations of fixed
Monday–Sunday week identity, reversible open-day completion checkboxes, recurring
occurrences, calendar-boundary habit outcomes and corrections, historical plan
memberships, factual planned load, eligible day/week closure, Day/Week/Month
History, and the ties-upward 70/30 Daily Score and Weekly Progress. A small domain-facing repository
isolates React and product logic from a versioned IndexedDB adapter. Pages use
scoped React state and reload their aggregate after committed commands; no
backend, account, synchronization, global data store, or query cache is introduced.

The UI follows the approved Weekly Dashboard v2, Daily View v2, History, shared flow assets, and ORBIT design system, with the specification explicitly overriding the prototype's old score, fixed capacity, workout, storage, and carry-forward implications. Desktop, tablet, and mobile use intentional layouts rather than a scaled desktop canvas.

## Scoped source authority

1. The constitution is the highest authority for process, governance, quality,
   simplicity, and change control.
2. `spec.md` governs observable product behavior, data semantics, business rules,
   and acceptance criteria within those constitutional constraints.
3. Approved Open Design prototypes and `DESIGN.md` govern visual and interaction
   direction, responsive behavior, motion, and accessibility, subject to the
   specification's product semantics.
4. This plan and its Phase 0/1 artifacts govern implementation structure.
5. `tasks.md` governs implementation sequence but must remain consistent with the
   specification and this plan.

If implementation exposes a significant conflict or missing behavior, stop the affected work and update the governing source instead of hiding a choice in code.

## Technical Context

**Language/Version**: TypeScript 6.0 with explicit `strict: true`; React/React DOM 19.2.7+; Node.js 22.22+ for tooling

**Primary Dependencies**: React/React DOM, Vite 8.1, React Router 8.3 library/declarative mode, `idb` 8; CSS Modules and native `Intl`/Web APIs. No component, chart, form, date, animation, global-state, or query-cache library initially. If a demonstrated shared client-state need emerges, Zustand is the approved fallback and must not replace IndexedDB as durable authority.

**Storage**: Origin-scoped IndexedDB database `orbit-planning`, schema version 1, accessed only through a typed domain-facing repository adapter; persistent-storage request when supported

**Testing**: Vitest (Node/jsdom), V8 coverage, React Testing Library, `user-event`, `jest-dom`, `fake-indexeddb`, Playwright, `@axe-core/playwright`; table-driven domain tests over snapshots

**Target Platform**: Static client-rendered web application for modern evergreen desktop, tablet, and mobile browsers supported by the selected Vite baseline; Chromium and WebKit are explicit validation targets

**Project Type**: Single-package frontend SPA; no server project

**Performance Goals**: No product latency or frame-rate SLO is specified.
Objective gates use a reproducible 52-week seeded fixture, require indexed reads
for the selected Day (one date), Week (one fixed Monday–Sunday period), or Month
(one calendar month) without unbounded store scans, keep recurrence work
range-bounded, and prove no horizontal overflow or lost essential action at the
approved widths. Motion is reviewed for reduced-motion/design conformance, not
against an invented subjective jank threshold.

**Constraints**: One local user; same browser profile/device; no account/authentication/backend/cloud/sync; closed days/completed weeks immutable; Russian default; full keyboard/touch journeys; 44px targets; reduced motion; factual neutral feedback; specification overrides prototype behavior

**Scale/Scope**: Four primary route areas (week, day, backlog, history), seven
approved product journeys, indexed Day/Week/Month access to one user's retained
personal history, a reproducible 52-week validation fixture, and no multi-user
or collaborative scale. The fixture is a test input, not a product record-count
promise.

## Constitution Check

### Gate before Phase 0 research

| Principle | Result | Evidence |
|---|---|---|
| I. Explicit Product Decisions | PASS | `spec.md` defines fixed calendar weeks, the checkbox task lifecycle, Close-Day-only cancellation, one membership per occurrence/date, open-membership deletion scope, recurrence and habit correction, closure eligibility, free-form goals, weekly progress, History modes, and factual non-classified load. |
| II. Design Guidance and UX Consistency | PENDING — affected UI blocked | `DESIGN.md` and Open Design remain visual/interaction sources subject to `spec.md`. The serialized read-only refresh failed with `Transport closed` and is recorded in `design-reconciliation.md`; no pass is claimed. Toolchain, pure-domain, contract, and non-visual adapter work may continue. |
| III. Simplicity and Maintainability | PASS | One SPA, five needed FSD layers, one cohesive planning slice, one repository seam, no backend/global cache/ORM/event sourcing/empty layers. Every additional runtime dependency has a concrete current purpose. |
| IV. Quality Gates | PASS for planning | Technical gates are selected: strict type checking, typed lint, formatting, unit/integration/browser testing, policy coverage, accessibility checks, and production build validation. The specification-approved one-participant procedure is recorded in `usability-protocol.md`; execution waits for the production build. |
| V. Controlled Evolution | PASS | No product scope is added. Design/spec defects become source-artifact changes before affected implementation proceeds. |

### Gate re-check after Phase 1 design

| Principle | Result | Phase 1 confirmation |
|---|---|---|
| I. Explicit Product Decisions | PASS | Contracts encode fixed week identity, reversible completion, movement/member reuse, mixed open/closed deletion reach, backlog restrictions, recurrence, habit correction, closure date eligibility, the Daily Score and Weekly Progress, and Day/Week/Month History without adding product policy. |
| II. Design Guidance and UX Consistency | PENDING — affected UI blocked | `contracts/ui-routes.md` fixes known responsive, accessibility, closure, History, and reconciliation rules, but fresh source evidence is unavailable. The failed attempt is recorded; a successful serialized pull and approval of significant deviations remain mandatory. |
| III. Simplicity and Maintainability | PASS | Data model uses eight focused stores, normalized facts plus compact closure summaries, embedded habit outcome audit facts, bounded lazy recurrence, and one domain repository—no speculative backend or formula-version machinery. |
| IV. Quality Gates | PASS for planning | `quickstart.md` defines scripts, test layers, responsive widths, the `verify` gate, and the approved external usability procedure. Manual execution remains a release activity, not a planning unknown. |
| V. Controlled Evolution | PASS | All approved behavior was added to `spec.md` before Phase 1 artifacts were revised; known design conflicts remain explicitly blocked rather than silently implemented. |

No constitutional exception is requested. Design-source freshness is a real
serialized pre-UI gate and is not waived or silently passed. The usability
protocol itself is approved and recorded; only its production-build execution
remains. Neither statement authorizes affected visual implementation while the
design gate is blocked.

## Project Structure

### Documentation (this feature)

```text
specs/001-personal-planning-loop/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── usability-protocol.md    # Approved manual acceptance procedure
├── design-reconciliation.md # Latest source attempt and blocking status
├── contracts/
│   ├── domain-commands.md
│   ├── persistence.md
│   └── ui-routes.md
└── tasks.md                 # Regenerated by $speckit-tasks after this plan refresh
```

### Source Code (repository root)

```text
src/
├── main.tsx
├── app/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   └── AppShell.module.css
│   ├── providers/
│   │   └── AppProviders.tsx
│   ├── runtime/
│   │   └── create-app-runtime.ts
│   ├── routes/
│   │   ├── AppRouter.tsx
│   │   └── paths.ts
│   └── styles/
│       └── global.css
├── pages/
│   ├── week/
│   │   ├── model/use-week-page.ts
│   │   ├── ui/WeekPage.tsx
│   │   └── index.ts
│   ├── day/
│   │   ├── model/use-day-page.ts
│   │   ├── ui/DayPage.tsx
│   │   └── index.ts
│   ├── backlog/
│   │   ├── model/use-backlog-page.ts
│   │   ├── ui/BacklogPage.tsx
│   │   └── index.ts
│   ├── history/
│   │   ├── model/use-history-page.ts
│   │   ├── ui/HistoryPage.tsx
│   │   └── index.ts
│   └── not-found/
│       ├── ui/NotFoundPage.tsx
│       └── index.ts
├── features/
│   ├── manage-week/
│   │   ├── model/
│   │   ├── ui/
│   │   └── index.ts
│   ├── manage-task/
│   │   ├── model/
│   │   ├── ui/
│   │   └── index.ts
│   ├── manage-habit/
│   │   ├── model/
│   │   ├── ui/
│   │   └── index.ts
│   ├── record-daily-state/
│   │   ├── model/
│   │   ├── ui/
│   │   └── index.ts
│   ├── close-day/
│   │   ├── model/
│   │   ├── ui/
│   │   └── index.ts
│   └── complete-week/
│       ├── model/
│       ├── ui/
│       └── index.ts
├── entities/
│   └── planning/
│       ├── model/
│       │   ├── task.ts
│       │   ├── habit.ts
│       │   ├── recurrence.ts
│       │   ├── day.ts
│       │   ├── week.ts
│       │   ├── history.ts
│       │   ├── task-lifecycle.ts
│       │   ├── occurrence-materialization.ts
│       │   ├── scoring.ts
│       │   ├── planned-load.ts
│       │   ├── day-closure.ts
│       │   ├── week-completion.ts
│       │   ├── selectors.ts
│       │   └── planning-repository.ts
│       ├── api/
│       │   ├── repository-context.tsx
│       │   └── indexeddb/
│       │       ├── database.ts
│       │       ├── schema.ts
│       │       ├── migrations.ts
│       │       ├── mappers.ts
│       │       └── indexeddb-planning-repository.ts
│       ├── ui/
│       │   ├── TaskRow.tsx
│       │   ├── HabitRow.tsx
│       │   ├── ScoreBreakdown.tsx
│       │   └── PeriodStatus.tsx
│       └── index.ts
└── shared/
    ├── lib/
    │   ├── local-date/
    │   ├── ids/
    │   └── result/
    ├── styles/
    │   └── orbit-tokens.css
    └── ui/
        ├── button/
        ├── dialog/
        ├── form-field/
        ├── icon/
        └── orbit-metric/

tests/
├── setup/
└── fixtures/

e2e/
├── fixtures/
└── journeys/
```

Domain, feature, component, and repository tests are colocated beside their source; `tests/` contains cross-cutting setup/fixtures only.

**Structure Decision**: Use the minimum FSD stack `app -> pages -> features -> entities -> shared`. `app` initializes providers/router/shell; `pages` load route aggregates; `features` express user intent; the cohesive `entities/planning` slice owns product rules, projections, repository port, and its domain-specific IndexedDB adapter; `shared` contains only product-agnostic infrastructure/UI. Do not create `widgets` until a composite is actually reused, and never create the deprecated `processes` layer.

## FSD and Import Strategy

- Configure `@/` to resolve `src/` in TypeScript, Vite, Vitest, and ESLint.
- Cross-layer imports point downward only.
- Cross-slice consumers import a slice's explicit `index.ts` public API.
- Internal files use relative full-path imports and never their own barrel.
- Use named exports; no wildcard barrels inside `model`, `api`, or `ui`.
- Pages do not import pages; features do not import sibling features.
- Enforce direction/deep-import rules with path-specific flat-ESLint `no-restricted-imports` before adding an architecture plugin.
- Keep policy in `entities/planning/model`; feature models orchestrate a user action around that policy and the repository.

## Application Initialization and State

1. Non-React `app/runtime/create-app-runtime.ts` synchronously returns an observable bootstrap resource and begins opening the versioned database, creating the adapter, and requesting persistent storage when supported.
2. `main.tsx` creates that resource outside React and mounts `AppProviders` immediately. The provider subscribes to `initializing`, `blocked`, `failure`, or `ready` and renders the appropriate startup state while the open promise remains pending or settles.
3. `entities/planning/api/repository-context.tsx` defines the ready-repository context/provider/hook; `app` supplies the concrete adapter only in the ready state, and lower layers import the hook downward through the planning slice's public API.
4. Context exposes only the `PlanningRepository` port, not application records or browser transaction objects.
5. A route page loads one aggregate/view model and owns it with `useState`/`useReducer`.
6. Feature models invoke repository commands and return a committed receipt; the owning page receives `onCommitted` and re-queries the affected aggregate once.
7. Navigating to another route always reads the same repository. Dialog drafts,
   weekly-goal/dated-task ordering drafts, History `{ mode, anchorDate,
   selectedDate }` state, and disclosure remain page-scoped. Backlog has no sort
   or reorder draft. Day closure uses a reducer for its complete disposition map.
8. The runtime derives the current `LocalDate` through the injected clock and invokes idempotent expired-habit reconciliation on startup, visibility resume, affected open-range preparation, and local-date rollover. While the app remains open, one rescheduled boundary timer may trigger that same command; correctness never depends on the timer because the next affected read or command catches up.

No optimistic domain cache or app-wide copy of IndexedDB data is planned. If simultaneous mounted consumers later demonstrate a real shared-state problem, Zustand is the selected fallback. Its scope must be documented first and should initially carry ephemeral UI/co-ordination state or revision signals, not become a second persisted domain store.

## Domain Model and Policy Boundary

The pure planning model owns these single implementations:

- task transition validation and audit-effect preparation: completion is a
  reversible checkbox on an open dated placement, editing/deletion remain
  available while completed, movement requires first unchecking, backlog has no
  completion/cancel action, deletion is terminal, and cancellation exists only
  as an unfinished-task Close Day disposition;
- separation of task occurrence/current placement from dated historical plan entries;
- occurrence-only recurrence exceptions, inclusive rule end dates, and future
  rule revisions that retain only the final same-day configuration for `D + 1`;
- bounded idempotent task/habit occurrence materialization;
- idempotent pending-to-not-completed reconciliation for expired applicable
  habits, explicit correction of that automatic result to completed while the
  day remains open, retention of both events, and no dependency on explicit day
  closure;
- Daily Score/Weekly Progress contributing-count aggregation;
- one shared 70/30 scoring/calculation policy with unavailable behavior and exact
  half-percentage ties rounded upward for the Daily Score and Weekly Progress;
- planned-load calculation and pre-disposition snapshot;
- day-closure validation/preparation, including `date <= currentLocalDate`,
  nonchronological eligibility, complete task dispositions,
  destination-date inequality, and the pre-boundary pending-habit gate;
- week-completion validation/preparation;
- closed/completed-period guards;
- current and historical selectors.

React renders policy results and maps user input to commands; it does not infer statuses, weights, denominators, closure completeness, recurrence applicability, or immutability.

Use validated date-only strings and an injected clock so recurrence/closure tests do not depend on machine timezone. Add no date library until rules exceed start/end/weekday arithmetic.

## Persistence Model

Use the eight-store schema specified in [data-model.md](data-model.md) and [contracts/persistence.md](contracts/persistence.md):

```text
weeks
days
taskSeries
taskOccurrences
taskPlanEntries
taskEvents
habitDefinitions
habitOccurrences
```

Key decisions:

- Weeks are fixed Monday–Sunday calendar aggregates keyed by their Monday date.
  Ensuring a missing record is idempotent; users never create arbitrary,
  overlapping, or duplicate week ranges.
- Weekly goals are one ordered embedded collection of free-form text supporting
  create, edit/rename, reorder, and delete while the week is mutable. Leading and
  trailing whitespace is trimmed before persistence; whitespace-only values are
  invalid; internal whitespace and content is otherwise preserved. Goals have no
  measurability validator or numeric progress field.
- `TaskPlanEntry` is the historical scoring boundary. Membership starts at the
  first committed dated placement; unsaved drafts and direct backlog creation
  create none. Moving retains the source membership as currently incomplete but
  not immutable while its day remains open; source dates never change.
- One occurrence/date has one scoring membership entry. An explicit return to a previously visited still-open date reuses that entry while events preserve intermediate moves.
- Checking/unchecking changes the current open placement between completed and
  incomplete and appends both audit events. It never erases earlier events.
- Permanent task deletion tombstones the logical occurrence and, atomically,
  excludes every membership whose day remains open; memberships in closed days
  and their finalized scores remain unchanged. A user-deleted recurring
  occurrence keeps its tombstone; unmodified future rows made inapplicable by a
  rule change are removed and may be materialized again if a later rule applies.
- Task events are append-only explanatory audit facts, not full event sourcing.
  An auto-increment event sequence provides authoritative order when timestamps tie;
  UUID event IDs remain stable identities.
- Recurrence ranges include a matching end date, and repeated same-day changes
  replace only the still-pending `D + 1` effective version.
- User-visible task/habit outcome projections, fixtures, labels, and copy contain
  no `partial` state. Internal `planned` membership state is not a product
  outcome.
- Weekly goals and week completion summary stay in `weeks`; daily state and closure summary stay in `days`.
- Habit occurrences retain a compact ordered outcome-event list so an automatic
  boundary miss and a later allowed correction remain visible without adding a
  ninth store.
- Closure snapshots store counts, rates, rounded result, load, and time;
  normalized finalized records remain the detailed history.
- Database version upgrades are sequential and never rewrite finalized facts.
- Series/definitions retain effective recurrence-rule versions so later changes cannot corrupt dates that were not materialized yet.
- Mutations carry expected revisions and re-check lifecycle guards inside the same write transaction. Any child change that affects a day bumps that day and its owning week revision; cross-date moves bump every affected aggregate.

The adapter maps browser errors to domain-facing failures and never deletes the database automatically. React components never import its implementation.

## Key Data Flows

### Read and ordinary command

```text
Route page
  -> for open range: idempotent prepareOpenPeriod write
  -> page projection query hook
  -> PlanningRepository query
  -> IndexedDB indexed projection
  -> domain selector/view model
  -> React render

User action
  -> feature model
  -> pure validation/effect preparation
  -> PlanningRepository command transaction
  -> committed receipt
  -> owning page re-query
```

Startup, visibility resume, and local-date rollover call the same bounded preparation
path so expired pending habits are reconciled even when the browser was suspended at
midnight.

### Task movement

```text
explicit destination
  -> require current task incomplete; validate source open and dated destination open/different + revisions
  -> retain source TaskPlanEntry as moved/backlogged and currently incomplete
  -> update same TaskOccurrence current placement
  -> create a dated destination membership only when absent; otherwise reuse it
  -> append TaskEvent
  -> commit all or none
```

Closure movement additionally rejects `destinationDate == closingDate`; ordinary
movement also rejects the current source date. Dated destinations are rechecked
open inside the transaction; backlog is undated and has no period-openness check.

### Completion checkbox

```text
check or uncheck completion
  -> require a dated placement whose day/week remains mutable + expected revision
  -> reject completion controls for backlog/deleted/finalized occurrences
  -> update the current membership to completed or incomplete
  -> append the completion-toggle TaskEvent without erasing earlier events
  -> commit current state + audit fact together
```

Completed tasks remain editable and permanently deletable, but movement is
rejected until the task is unchecked. Ordinary task interaction never exposes
cancellation.

### Permanent task deletion

```text
delete logical occurrence from an open dated placement or backlog
  -> verify expected revision and current-placement mutability
  -> read every membership for the occurrence
  -> mark every membership whose day is still open as deleted/excluded
  -> leave every closed-day membership and frozen score unchanged
  -> tombstone occurrence + append deletion event
  -> bump every affected open day/week and commit atomically
```

### Day closure

```text
load day + exact unfinished set
  -> user chooses one disposition for every task
  -> one readwrite transaction:
       require date <= injected currentLocalDate
       re-check lifecycle/revision/destinations
       ensure applicable occurrences
       reconcile already expired pending habits from the injected local date
       if the date has not ended, reject while any applicable habit is pending
       reject every move-to-date destination equal to the closing date
       capture planned load before dispositions
       calculate final contributing counts + score
       apply all task dispositions/events/destinations
       save DayClosureSnapshot + closed status
  -> tx.done
  -> immutable day review
```

Before the date boundary, the user must explicitly mark every applicable pending
habit completed or not completed before confirmation. After the boundary, the
idempotent expiry rule has already made pending habits not completed. Closure consumes
those final facts; it does not decide an expired habit's outcome.

Eligible current/past days close independently; an older open day does not block
a later eligible day. A future date is always rejected.

### Habit boundary and correction

```text
date boundary catch-up
  -> append one date-boundary not-completed event when pending expires
  -> update the current outcome idempotently

explicit correction while the day remains open
  -> require the current not-completed outcome came from date-boundary catch-up
  -> append a user correction-to-completed event
  -> update the live Daily Score/Weekly Progress projections
  -> closure freezes the final outcome and both events
```

The specified explicit user paths—recording a pending occurrence as completed or
not completed, and correcting an automatic miss to completed—append events.
Closure freezes the resulting facts.

No network, UI wait, or unrelated async operation runs inside the live IndexedDB transaction.

### Week completion

```text
explicit completion + optional reflection
  -> verify seven closed days in one transaction
  -> sum frozen daily task/habit counts
  -> shared scoring/calculation policy
  -> save final Weekly Progress breakdown/reflection
  -> mark week completed and immutable
```

### Recurrence

```text
requested open date range
  -> read intersecting effective rule versions (not only current active status)
  -> pure applicable-date calculation with an inclusive matching end date
  -> unique series/date or definition/date lookup
  -> preserve past/current day, user-deleted tombstones, and future exceptions
  -> for repeated edits on D, retain only the final pending D + 1 version
  -> reconcile only unmodified dates from the rule version's next-date boundary
  -> insert only missing unmodified occurrences
```

Day closure repeats bounded materialization for correctness; UI loading is not the only trigger.

## UI, Responsive, and Design Strategy

- Use React Router library/declarative `BrowserRouter` routes `/week/:weekStart`, `/day/:date`, `/backlog`, and `/history`; `/` redirects to the Monday containing the current local date, and `*` renders not-found. Validate/canonicalize week/date parameters as defined in the UI contract.
- Use CSS Modules plus canonical `orbit-tokens.css` and global reset/layout styles.
- Reuse approved monoline SVG assets; use semantic HTML/CSS and accessible simple SVG only where a visual materially helps.
- No Tailwind, CSS-in-JS, chart/component/icon/animation/form/i18n library initially.
- Keep Russian strings near owning UI; add localization infrastructure only with a localization requirement.
- Backlog renders active undated tasks by immutable creation sequence, oldest
  first, and exposes edit, delete, and schedule actions only—no completion,
  cancellation, reorder, sort, or filter surface.
- History first opens in Month mode for the current calendar month anchored to
  `currentLocalDate`. Day/Week/Month previous/next moves exactly one day, one
  fixed Monday–Sunday week, or one calendar month. Month retains its calendar,
  selected-day details, and applicable Dynamics; all History facts are read-only
  and no workout layer, tab, or data is present.
- Before a History read, its page service prepares only open dates inside the
  derived mode range so lazy recurrence and habit-boundary catch-up are current;
  the History repository query itself remains read-only and closed dates are
  never mutated.
- Weekly review always displays derived weekly progress plus contributing task
  and habit counts/rates and freezes them at explicit week completion. Goals and
  daily state never contribute.
- Planned load is a factual duration sum only. No configurable capacity, hidden
  load/capacity/overload threshold, automatic overload classification, or
  proactive overload warning is rendered.
- Implement DESIGN.md layouts at `>=1051`, `721–1050`, and `<=720` pixels, preserving essential actions and data.
- Verify all seven primary flows at representative desktop, tablet, and mobile
  widths (`1440`, `820`, and `390`), plus horizontal overflow/essential actions at
  `360/390/430/600/768/820/1024/1366/1440/1920`.
- Meet keyboard, touch, focus, non-color, contrast, labels, dialog-focus, textual score explanation, and reduced-motion contracts.
- Use at most one ambient orbit treatment around the primary aggregate; it must not imply a capacity goal.

### Explicit design reconciliation

| Reference conflict | Planned implementation |
|---|---|
| Prototype/DESIGN formula 50/30/20 | Specification formula 70/30; daily state is context only |
| Fixed 360-minute capacity or automatic load/capacity/overload thresholds | Duration-derived planned load only; no configurable capacity, hidden load/capacity/overload threshold, automatic overload classification, or proactive warning |
| DESIGN score color/status/presentation semantics | Settle them through the serialized Open Design reconciliation; the load/overload prohibition is not a general ban on score visual semantics |
| Workout Session/navigation/history | No workout route, storage, feature, navigation, or History layer/tab/data in MVP |
| localStorage wording or implied sync | IndexedDB in one browser profile/device; no account or synchronization |
| “Tomorrow” carry-forward shortcut/default | Explicit selected open date; no silent/default movement |
| Any sub-44px or color-only prototype control | Constitution/spec/DESIGN accessibility requirements take precedence |

The Open Design project previously verified for this feature is `Личная операционная система`, including Weekly Dashboard v2, Daily View v2, History, shared flow CSS/JS, Workout Session reference, and the root ORBIT design-system artifact. The serialized read-only attempt on 2026-08-10 returned `Transport closed`; `design-reconciliation.md` records the failure and does not claim a pass or source version. A successful fresh pull, version/availability record, conflict review, and approval of every significant deviation remain mandatory before affected UI/component/browser work. Until then, toolchain, pure-domain, contract, and non-visual adapter work may continue. Exact score color/status/presentation semantics, History mode-switch/short-month selection, and Dynamics presentation remain within this blocked design reconciliation and must not be invented in UI code.

## Testing Strategy

### Static gates

- `tsc -b --pretty false` with strict project references as appropriate
- ESLint flat configuration with `@eslint/js`, type-aware `typescript-eslint`, React Hooks, React Refresh, `jsx-a11y`, and `eslint-config-prettier` last
- Prettier as a separate `--check` gate
- Vite production build

### Pure domain tests (majority of suite)

Table-test scoring-policy categories/weights/exact-half-ties-upward/unavailable behavior;
task outcome denominators; completion check/uncheck with retained audit events;
completed-task edit/delete plus movement rejection until unchecked; terminal
multi-open-membership deletion with closed-membership preservation; weekly-goal
boundary trimming, whitespace-only rejection, internal-content preservation, and
create/rename/reorder/delete without measurability validation;
inclusive recurrence end dates, same-day coalescing, exceptions, and tombstones;
idempotent habit expiry and allowed correction with both events retained across
midnight/startup/resume; early-closure pending-habit rejection; future-day
closure rejection and nonchronological eligible closure; same-date destination
rejection; factual load without overload classification; closure completeness;
weekly aggregation; exhaustive non-partial outcome unions; and Day/Week/Month
historical selectors.
Inject clock/date boundaries.

Critical policy modules—scoring, lifecycle, recurrence, closure, historical aggregation—target 100% functions and at least 95% branches/lines/statements. Include untested source files in reports. Do not impose a high global UI percentage that encourages shallow tests.

### Persistence integration

Use the real adapter with `fake-indexeddb`: schema/migration, repository contract,
authoritative event-sequence ordering including equal timestamps, idempotent
materialization and expired-habit catch-up/correction, weekly-goal operations,
completion toggles, mixed open/closed membership deletion, multi-store atomic
commands, rollback, revisions, immutability, and
database-connection close/reopen round trips.

### Component integration

Use Testing Library only for UI risk: task validation and check/uncheck controls;
movement disabled until unchecked; backlog action restrictions and oldest-first
order; free-form weekly-goal operations without measurability validation;
Daily Score/Weekly Progress/load explanation; recurrence end and next-date messaging; closure
reducer/dialog including future-date, pending-habit, and same-date guards;
Day/Week/Month History states; immutable/deleted controls; focus behavior; and
loading/empty/storage error states. Query by role/label and use real user-event
interactions. Avoid broad snapshots.

### Browser validation

Use a focused Playwright suite because jsdom/fake IndexedDB cannot verify physical
reload persistence, browser focus/layout, responsive navigation, or real IndexedDB
lifecycle. Keep seven canonical story-level scenarios and execute the full set in a
keyboard-only desktop Chromium project, a tablet project at `820`, and a touch-oriented
mobile WebKit project at `390`; retain the wider width checks and targeted axe scans.
Playwright uses only `e2e/` and starts the built app through Vite preview; Vitest
excludes `e2e/`. Retain manual real-touch, keyboard, and accessibility/design checks.

### Product acceptance outside the automated suite

SC-001, SC-002, SC-003, and SC-010 use the specification-approved procedure
recorded in `usability-protocol.md`: one representative target user or the
product owner, the production build, written instructions, defined timer
boundaries, no UI hints, and external evidence. SC-001 has no maximum time;
SC-002, each independently timed SC-003 operation, and SC-010 retain their stated
limits. Execute the protocol after implementation and record evidence outside
the application. Do not add analytics,
accounts, or a telemetry backend for this purpose. SC-014 receives an exhaustive
Russian message-corpus review, while SC-012/SC-013 combine full three-viewport browser
journeys with manual touch, keyboard, status, motion, and viewport review.

`npm run verify` runs format check, lint, typecheck, coverage tests, production build, and browser tests before completion. Maintain an FR/SC-to-test matrix for the calculation, recurrence, closure, cross-view consistency, immutability, responsive, accessibility, and persistence criteria.

## Implementation Phases

### Phase 0 — Product/design readiness

- Refresh current Open Design bundles read-only, record source versions/availability,
  and compare them with `DESIGN.md` and `spec.md`.
- Treat `spec.md` as authoritative for lifecycle, recurrence, habit-boundary,
  rounding, outcome, closure, goal, scoring, storage, and workout semantics.
- Identify every material visual/interaction deviation. Obtain explicit product-owner
  approval and update the governing source artifact before affected UI work.
- Settle score color/status/presentation semantics against the current Open Design
  and `DESIGN.md`; do not infer a blanket score-visual prohibition from the ban on
  automatic load/capacity/overload thresholds.
- Keep the specification-approved participant, timing, assistance/failure,
  scenario, and evidence procedure recorded in `usability-protocol.md`.

**Exit**: Current design sources and approvals are recorded, material conflicts
have approved resolutions, and `usability-protocol.md` is approved. **Current
status: partially met**—the protocol is approved/recorded, but the serialized
design pull failed and is recorded in `design-reconciliation.md`. Until a fresh
pull clears that gate, affected UI/component/browser work remains blocked;
toolchain, pure-domain, contract, and non-visual adapter work may proceed.

### Phase 1 — Toolchain and architectural skeleton

- Scaffold React/TypeScript/Vite single package and npm lockfile.
- Configure strict TypeScript, Vite aliases, flat ESLint/import boundaries, Prettier, Vitest, Testing Library, fake IndexedDB, Playwright/axe, and scripts.
- Create only the FSD directories immediately needed. After the Phase 0 design gate,
  implement app initialization/loading/error shell and canonical tokens.

**Exit**: The toolchain-only scaffold passes format, lint, typecheck, tests, and build. After the Phase 0 design gate clears, routing and the responsive shell also render in Russian at approved widths; that visual portion cannot satisfy exit while the gate is blocked.

### Phase 2 — Shared foundation only

- Implement validated local-date/injected-clock, IDs, revisions, result,
  duration, simple dated-list ordering, immutable creation sequence, and
  exhaustive-match utilities.
- Define plain serializable record contracts, repository query/command/failure DTOs,
  the version-1 IndexedDB schema/migrations/mappers, transaction skeleton, bootstrap,
  routes, and deterministic fixtures.
- Keep story policy out of this phase: no lifecycle, recurrence, scoring, closure,
  weekly review, or history behavior is implemented here.

**Exit**: Shared contracts and infrastructure pass their focused tests, and every story
can add policy vertically without importing browser persistence into pure domain code.

### Phase 3 — User Story 1: weekly/daily planning (P1)

- Start with failing domain, adapter, component, and browser acceptance tests.
- Implement idempotent fixed-week records, trimmed free-form weekly-goal
  create/edit-or-rename/reorder/delete with whitespace-only rejection, internal
  whitespace/content preservation, and no measurability validation,
  dated/backlog task planning, factual planned load, week/day projections, and
  responsive pages. Backlog is oldest-first and has no manual ordering controls.
- Expose no numeric weekly-goal progress field, capacity, or overload classifier.

**Exit**: Story 1 independently plans and reloads a week with consistent goal ordering,
task placement, and duration-derived load across week/day views.

### Phase 4 — User Story 2: task execution and history (P1)

- Start with the complete lifecycle truth table and persistence rollback tests.
- Implement check/uncheck completion, edit, move, backlog scheduling, and
  permanent deletion. Completed tasks remain editable/deletable but cannot move
  until unchecked; ordinary cancellation is absent. Deletion atomically excludes
  all still-open memberships and preserves closed memberships/events.
- Implement deterministic event-sequence ordering, backlog edit/delete/schedule
  behavior, plan-versus-actual projections, and responsive controls.

**Exit**: Story 2 passes domain, adapter, UI, reload, cross-view, immutable-history, and
equal-timestamp event-order tests without rewriting source plan facts.

### Phase 5 — User Story 3: recurrence and habit boundary (P1)

- Start with inclusive-end, next-date, same-day-coalescing, exception, tombstone,
  idempotence, and midnight/startup/resume catch-up tests.
- Implement task/habit series and occurrence-only editing/deletion; preserve past/current
  occurrences and future exceptions; retain only the final same-day `D + 1` version.
- Implement injected-clock expired-habit reconciliation and the reusable explicit
  completed/not-completed habit-outcome command needed by closure. Retain the
  automatic miss and allowed open-day correction-to-completed as separate events.

**Exit**: Story 3 passes domain, adapter, UI, reload, and calendar-boundary tests; no
background scheduler or unbounded future generation is required for correctness.

### Phase 6 — User Story 4: deliberate day closure (P1)

- Start with shared score truth tables and closure domain/adapter/dialog/browser tests.
- Implement one shared scoring/calculation policy for the Daily Score and Weekly
  Progress with exact half ties upward and no `partial` outcome; capture
  pre-disposition load and final contributing counts.
- Implement all four task dispositions with no default, require
  `date <= currentLocalDate`, allow eligible days to close independently, reject
  the closing date as a move-to-date destination, require dated destinations
  open, reconcile expired habits, and block pre-boundary closure until every
  applicable habit has an explicit outcome. Backlog remains undated.
- Commit the immutable closure snapshot and all effects atomically.

**Exit**: Stories 1–4 form the P1 baseline and pass all closure, score, load,
immutability, rollback, keyboard, touch, and three-viewport checks.

### Phase 7 — User Story 5: habits, state, score, and load (P2)

- Extend the reusable habit-outcome control into ordinary day interaction.
- Implement energy, mood, and sleep validation/persistence and prove state never enters
  score or load calculations.
- Render live/frozen score counts/rates, unavailable state, and duration-only load in
  day and week summaries, using factual neutral language and no hidden
  load/capacity/overload threshold, overload label, or proactive warning.

**Exit**: Story 5 reproduces every displayed score/load from visible facts, proves
boundary outcomes survive reload, and never exposes partial completion.

### Phase 8 — User Story 6: weekly review and completion (P2)

- Start with seven-closed-day, frozen raw-count, SC-015 denominator,
  ties-upward rounding, reflection, mandatory weekly-progress display, and
  immutability tests.
- Implement review projections that show weekly task/habit counts and rates, and
  atomic week completion using the shared scoring/calculation policy over summed
  frozen counts—not an average of daily percentages. Goals/state contribute
  nothing.

**Exit**: Story 6 preserves the reflection/final breakdown and rejects every later
mutation while future-plan changes leave completed-week facts unchanged.

### Phase 9 — User Story 7: Day/Week/Month History (P2)

- Start with default current-date/Month state, exact Day/Week/Month period-step,
  indexed period selector, Month calendar/selected-day, deterministic-order, and
  historical-detail tests; do not add a filter/search/edit/workout contract.
- Implement deterministic event order and plan/disposition/outcome explanations using
  only the specification's user-visible vocabulary; `partial` is absent from types,
  fixtures, labels, and views. Present weekly progress, Month selected-day details,
  and Dynamics only as settled by the successful design reconciliation; internal
  planning/reconciliation markers are never presented as outcomes.

**Exit**: Story 7 navigates and explains prior Day/Week/Month facts without
unbounded store scans, editing immutable records, or exposing workout history.

### Phase 10 — Cross-browser, accessibility, and release hardening

- Complete all seven Playwright journeys at desktop, tablet, and mobile, real IndexedDB
  reload tests, wider width/overflow checks, axe scans, and manual
  keyboard/touch/contrast/reduced-motion review.
- Validate every route/dialog/control/history label in Russian, review the exhaustive
  feedback-message corpus, and reconcile current Open Design/DESIGN.md evidence.
- Execute and record the approved manual usability checks—timed only where
  SC-002, SC-003, and SC-010 specify—without adding product telemetry.
- Audit actual dependencies, FSD layers, abstractions, and infrastructure; remove any
  unsupported complexity or link each retained addition to a concrete current need.
- Run the FR/SC traceability review and full `npm run verify` production gate.

**Exit**: All configured quality gates and approved specification checks pass;
device-local limitations are accurately communicated; design deviations and retained
complexity have recorded approvals/justifications.

## Important Boundaries

| Boundary | Enforced rule |
|---|---|
| React -> persistence | React sees domain queries/commands only; never IndexedDB objects/schema |
| UI -> product policy | UI renders domain results; never recalculates score/lifecycle/closure rules |
| Domain -> infrastructure | Pure model imports no React, browser storage, router, or DOM code |
| Current -> history | Membership identity/date remain fixed; its outcome/applicability may change only while the owning day is open under move/return/completion/deletion rules |
| Completion checkbox -> audit history | Checking/unchecking changes current open state while both ordered events remain queryable; cancellation is closure-only |
| Deletion -> scoring history | One atomic deletion excludes every still-open membership for the occurrence and leaves every closed membership/frozen score unchanged |
| Open -> closed/completed | Repository transaction re-checks lifecycle; immutable periods reject writes |
| Recurrence series -> occurrence | A change on date `D` starts on `D + 1`; same-day edits coalesce to the final effective version, the inclusive end date can produce an occurrence, and past/current-day occurrences plus future per-occurrence exceptions stay unchanged |
| Local-date boundary -> habit outcome | Injected-clock reconciliation expires pending habits; initial explicit outcomes and automatic-miss correction append events; closure freezes the facts |
| Goal text -> score | Boundary-trimmed free-form goals reject whitespace-only values, preserve internal whitespace/content, have no measurability validator, and never contribute numeric progress or score input |
| Raw score -> displayed/frozen score | The shared policy rounds once to the nearest whole percentage with exact `.5` ties upward |
| Closing day -> eligibility/destination | Source date is not later than current local date; eligible days close independently; a dated move destination is open and different from the closing date, while backlog is undated |
| Event timestamp -> total audit order | Timestamp communicates wall-clock time; a monotonic persisted sequence is the authoritative tie-breaker/order |
| Outcome vocabulary -> storage/UI | User-visible projections use only specification-defined outcomes/dispositions; persistence-only recurrence markers are not product outcomes, and `partial` cannot be stored or rendered |
| Local persistence boundary | The repository port isolates domain/UI from IndexedDB today; no speculative HTTP/auth/sync adapter exists |
| IndexedDB -> Zustand contingency | IndexedDB remains durable authority; Zustand, if justified, coordinates client state only |

## Technical Risks and Explicit Decisions

| Risk/decision | Impact | Mitigation/gate |
|---|---|---|
| Browser storage can be evicted or cleared | Device-local storage is not backup-grade durability | Follow the approved normal-profile/site-storage boundary, request persistence where supported, explain exclusions/locality, and never hide write failures |
| Latest Open Design refresh attempt unavailable | The previously verified prototype may no longer be current | Failure is recorded in `design-reconciliation.md`; mandatory successful serialized read-only pull before affected UI code, with version/differences/approvals |
| Rule-version reconciliation is date-sensitive | An off-by-one or overwrite could change current-day facts or user exceptions | Derive `D + 1` from the injected clock, retain effective intervals/exception flags, reconcile only unmodified future occurrences, and table-test boundaries |
| Browser suspension spans a local-date boundary | A pending applicable habit could remain stale after midnight | Run the same bounded idempotent expiry command on startup, visibility resume, affected-range preparation, and rollover; test catch-up without depending on a live timer |
| Completion toggles or deletion rewrite facts | Earlier checkbox events or closed memberships could disappear | Append ordered toggle/deletion events; deletion scans all memberships, changes open ones only, and preserves frozen closed facts atomically |
| Floating-point scoring boundaries | Daily Score and Weekly Progress views could disagree at exact halves | Aggregate integer counts, apply the shared scoring/calculation policy once, then use the explicit ties-upward helper; table-test `74.4`, `74.5`, and `74.6` equivalents |
| Same-timestamp audit events | UUID/timestamp sorting cannot provide deterministic history | Persist an auto-increment monotonic event sequence and order all audit projections by it |
| Five-point energy/mood and sleep-duration controls must remain contextual | UI could accidentally turn state into a score or medical signal | Encode the specified ordinal/duration value types, neutral labels, and tests proving state never reaches score inputs |
| Monday-first seven-day week | Calendar grouping must be consistent across routes and recurrence | Validate `weekStart` as Monday and derive Monday–Sunday dates with the shared local-date utility |
| IndexedDB transaction lifetime | Unrelated async work can auto-close a transaction | Prepare external input first; only IDB requests/pure calculation inside; await `tx.done`; integration-test rollback |
| Schema evolution | Migration could rewrite historical truth | Keep sequential schema migrations and never recompute or rewrite finalized snapshots |
| Design details await fresh source | Score color/status/presentation semantics, History mode-switch/short-month selection, Dynamics visuals, and generated-recurring-task insertion position are not defined locally | Keep affected UI blocked; add no new metric/default, and resolve through the successful design reconciliation before implementation |
| Multiple open tabs | Stale commands could conflict despite no sync feature | Same-transaction revisions/guards; reject/reload; no cross-tab synchronization machinery in MVP |
| `BrowserRouter` on static hosting | Deep links fail without fallback | Require host rewrite to `index.html`, or explicitly revisit routing if the chosen host cannot support it |
| FSD over-structuring | Empty slices and artificial dependencies slow the MVP | Start with five layers/one planning slice; add slices/layers only after concrete reuse/change boundaries |
| Real-browser suite growth | Slow/brittle quality gate | Keep E2E to critical persistence/responsive/accessibility journeys; keep policy coverage in fast domain tests |

## Complexity Tracking

No constitution violation or complexity exception is required. The repository boundary and focused Playwright suite are not exceptions: atomic multi-store persistence and real-browser persistence/responsive/accessibility requirements provide their concrete justification. Before implementation handoff, the final artifact audit must confirm that every dependency and layer serves a current requirement, every cross-slice import uses a public API, and no speculative state manager, service, slice, or abstraction has entered the plan.

## Phase Outputs

- [research.md](research.md): resolved technical decisions, alternatives, and primary sources
- [data-model.md](data-model.md): entities, state transitions, snapshots, stores, invariants, and product gates
- [domain-commands.md](contracts/domain-commands.md): query/command, score, closure, and error contracts
- [persistence.md](contracts/persistence.md): IndexedDB schema, transaction, migration, and adapter contracts
- [ui-routes.md](contracts/ui-routes.md): routing, responsive, accessibility, closure, and design reconciliation contracts
- [quickstart.md](quickstart.md): scripts, automated/manual validation, deterministic examples, and acceptance checklists
- [usability-protocol.md](usability-protocol.md): approved one-participant production-build manual acceptance procedure
- [design-reconciliation.md](design-reconciliation.md): serialized Open Design attempt, recorded failure, known overrides, and remaining pre-UI actions
