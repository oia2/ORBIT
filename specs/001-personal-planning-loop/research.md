# Phase 0 Research: ORBIT Personal Planning Loop

**Feature**: `001-personal-planning-loop`  
**Date**: 2026-08-10

This document resolves the technical choices needed for the implementation plan. Product behavior remains governed by `spec.md`; technical research does not add product requirements.

## 1. Frontend baseline

**Decision**: Build one client-rendered SPA with React/React DOM 19.2.7 or newer compatible patches, TypeScript 6 in explicit strict mode, Vite 8.1, React Router 8.3, and npm with a committed lockfile. Use Node.js 22.22 or newer for tooling, satisfying the router's stricter baseline. Pin the exact dependency versions selected during scaffolding.

**Rationale**:

- The requested stack is sufficient for a device-local application and does not require a framework with server rendering or server loaders.
- Vite transpiles TypeScript but does not type-check it, so `tsc` remains an independent quality gate.
- npm is the smallest package-management choice for a single package with no workspace or monorepo requirement.

**Alternatives considered**:

- Next.js, Remix, or another full-stack framework: rejected because the MVP has no backend, server rendering, authentication, or remote data loading.
- pnpm/Yarn: not needed for a single-package repository; reconsider only if the repository becomes a workspace.

**Sources**: [React versions](https://react.dev/versions), [Vite guide](https://vite.dev/guide/), [Vite releases](https://vite.dev/releases), [Vite 8 announcement and Node requirements](https://vite.dev/blog/announcing-vite8), [TypeScript 6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html), [React Router 8.3 changelog](https://reactrouter.com/start/start/changelog#v830).

## 2. Pragmatic Feature-Sliced Design

**Decision**: Start with only the five needed layers:

```text
app -> pages -> features -> entities -> shared
```

Use a single cohesive `entities/planning` slice for the MVP bounded context. Keep tasks, habits, recurrence, days, weeks, scoring, closure, and history in separate model files inside that slice. Do not create `widgets`, `processes`, or artificial entity slices initially.

**Rationale**:

- These domain concepts participate in the same invariants and atomic commands. Splitting them into sibling entity slices would create artificial same-layer dependencies or cross-import escape hatches.
- FSD does not require every layer. A layer or slice should exist only when it has a concrete responsibility.
- The structure can be split later if parts acquire genuinely independent change patterns.

**Boundary rules**:

- Cross-layer imports point downward only.
- Cross-slice imports use the target slice's explicit public `index.ts` API.
- Within a slice, use relative full-path imports and do not import the slice's own barrel.
- Use explicit named exports; do not use `export *` barrels.
- Enforce layer direction and deep-import restrictions with ESLint `no-restricted-imports` overrides before adding an architecture-specific linter.

**Alternatives considered**:

- One slice per noun (`task`, `habit`, `day`, `week`, `score`): rejected for the initial MVP because their rules and transactions are tightly coupled.
- A `widgets` layer from day one: deferred until a large composite UI is reused by multiple pages.
- Steiger or `eslint-plugin-boundaries`: deferred; ordinary ESLint restrictions are enough for the initial tree.

**Sources**: [FSD layers](https://feature-sliced.design/docs/reference/layers), [FSD slices and segments](https://feature-sliced.design/docs/reference/slices-segments), [FSD public APIs](https://feature-sliced.design/docs/reference/public-api).

## 3. Routing and application state

**Decision**: Use React Router 8.3 in library/declarative `BrowserRouter` mode. Keep the route set small and date-addressable: week, day, backlog, and history. Use route/page-scoped React state and reducers; inject the planning repository through React context, but do not put domain data in that context.

After a successful command transaction, the owning page re-queries its aggregate
and replaces its local view model. Navigation to another page reads the same
IndexedDB source of truth. Dialog drafts, weekly-goal/dated-task ordering drafts,
History mode/anchor/selected-day state, and disclosure state remain local. The
day-closure draft uses a reducer because it must hold exactly one explicit
disposition for every unfinished task. Backlog has no sort or reorder draft.

History state is `{ mode: Day | Week | Month, anchorDate, selectedDate }`.
First entry uses `currentLocalDate` and Month mode for the current calendar
month. Previous/next steps by one local day, one fixed Monday–Sunday week, or
one calendar month according to mode. Switching mode preserves `selectedDate`,
sets `anchorDate` to it, and changes only the viewing scale: Day shows that date,
Week its containing Monday–Sunday week, and Month its containing month. Month
navigation clamps a selected day number that does not exist in the destination
month to that month's last valid date; that clamped value becomes the actual
selection and no preferred day is retained. Repository queries derive and
validate only bounded indexed periods. Month also returns its calendar and
selected-day details. Day has no Dynamics; Week derives the last eight weeks and
Month derives the last six months, using only task completion rate, habit
completion rate, and the shared 70/30 score. No arbitrary window, search/type
filter, unbounded scan, editing, workout history, state analytics, correlations,
generated insights, invented metrics, or second cache is introduced. Backlog
reads return active undated tasks by immutable creation sequence, oldest first,
with a stable ID tie-break and no filter, manual sort, or reorder surface.

**Rationale**:

- Dated routes should be bookmarkable and provide reliable browser navigation.
- Declarative routing supplies navigation without server loaders, a remote-data cache, or framework mode.
- A second global copy of IndexedDB-backed data would add invalidation and conflict problems without a demonstrated need.

**Alternatives considered**:

- A global state library: not justified for the initial implementation because IndexedDB is the durable authority and page aggregates are small. If implementation evidence shows that shared client state is genuinely required, use Zustand as the only approved fallback, keep persisted domain records in IndexedDB, and record the concrete reason before adding it.
- Redux or another global state library: rejected; Zustand is the user-selected contingency if the need arises.
- TanStack Query: rejected because there is no remote server state or concrete caching/invalidation benefit.
- A single app-wide React data tree: rejected because it would compete with IndexedDB as the authority.
- Hand-written History API routing: rejected because it recreates standard navigation behavior.
- Hash routing: use only if the selected static host cannot provide an SPA fallback.

**Sources**: [React Router modes](https://reactrouter.com/start/modes), [declarative routing](https://reactrouter.com/start/declarative/routing), [React Router 8.3 changelog](https://reactrouter.com/start/start/changelog#v830).

## 4. Pure product logic and local dates

**Decision**: Implement lifecycle, recurrence, score calculation, planned load, closure validation, closure preparation, week completion, and historical aggregation as pure TypeScript modules with no React, router, DOM, or IndexedDB imports.

Use one shared scoring/calculation policy for the Daily Score, Weekly Progress,
and each permitted History Dynamics score point. It accepts integer contributing
counts, applies the 70/30 formula, normalizes an absent category, returns
unavailable when both categories are absent, and rounds the final raw percentage
once to the nearest whole number with exact-half ties upward. The policy therefore
maps `74.4` to `74%`, `74.5` to `75%`, and `74.6` to `75%`. UI components only
render its result.

Represent calendar dates as validated `YYYY-MM-DD` strings and timestamps as UTC ISO strings. Provide a small tested local-date utility and an injected clock. Use `Intl.DateTimeFormat('ru-RU')` only for presentation. Do not add a date library for weekday/start/end recurrence.

The shared calendar utility validates the specification's Monday-first week start and derives the following six dates through Sunday.

**Rationale**:

- The specification makes these behaviors product rules rather than presentation details.
- Pure functions give one testable source of truth across daily, weekly, and historical views.
- Date-only values avoid accidental timezone shifts caused by serializing JavaScript `Date` objects.

**Alternatives considered**:

- Recalculating in page components: rejected because related views could drift.
- A date library: deferred until recurrence or timezone requirements exceed the current date-only rules.

## 5. IndexedDB and repository boundary

**Decision**: Use IndexedDB through `idb` 8, a small typed Promise wrapper. Define one domain-facing `PlanningRepository` port with explicit query and command methods, including atomic `closeDay` and `completeWeek`. The IndexedDB adapter owns schema, migrations, mapping, transactions, and browser errors. React never receives an `IDBDatabase`, object store, or transaction.

Persist normalized current records, immutable per-day task-plan entries, targeted append-only task events, and compact day/week closure summaries. Do not use full event sourcing or duplicate entire day/week JSON snapshots.

**Rationale**:

- IndexedDB provides indexed, structured, transaction-capable local storage.
- `idb` removes event/callback boilerplate while preserving native transaction semantics and typed schemas.
- A domain-oriented port keeps React independent of IndexedDB and lets the real
  adapter be contract-tested without exposing a generic unit of work. No future
  HTTP/API adapter is designed in the MVP.

**Transaction rule**: Gather external input before opening a write transaction. Inside the transaction, use only IndexedDB requests and synchronous/pure calculations, await `tx.done`, and treat any abort as total command failure. Re-check day/week lifecycle and expected revision in the same transaction that writes.

**Alternatives considered**:

- Direct native IndexedDB: rejected because callback and transaction-lifetime boilerplate obscures the important behavior.
- Dexie: rejected because its live queries and higher-level ORM facilities are unnecessary for this MVP.
- `localStorage`: rejected because it lacks structured queries, indexing, and multi-store atomic transactions.
- Generic CRUD repositories or a generic unit of work: rejected as speculative abstraction.
- Event sourcing: rejected; immutable plan entries plus targeted audit events preserve required history without making every projection event-derived.

**Sources**: [MDN: Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [`idb` repository and typed transaction API](https://github.com/jakearchibald/idb), [IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifetime-concept).

## 6. Recurrence materialization

**Decision**: Materialize occurrences lazily and idempotently for a derived
Day/Week/Month page range, preparing only dates whose days remain open, then
ensure the closing day again inside the closure transaction. Recurrence intervals
are inclusive: an occurrence is eligible when `startDate <= date <= endDate`,
and a matching weekday on the optional end date produces an occurrence. Use
unique series/date indexes, definition/rule snapshots, revisions, exception
flags, and deletion tombstones. Automatic materialization emits no audit event;
rule reconciliation removes an untouched future occurrence and its unfinalized
membership as one bundle. Do not generate an unbounded future.

**Rationale**:

- The UI only needs bounded date ranges.
- A unique natural key makes repeated reads safe.
- Tombstones prevent a deliberately deleted occurrence from reappearing.
- Historical occurrence snapshots remain independent of later series edits.

**Alternatives considered**:

- Generate every future occurrence: rejected because optional end dates and rule changes make it unbounded and hard to reconcile.
- Generate only in UI components: rejected because closure must independently guarantee all applicable occurrences exist.

## 7. Styling, responsive UI, and design assets

**Decision**: Use CSS Modules for slice/page styles plus global ORBIT design tokens and reset styles. Reuse approved monoline SVG assets where available. Use semantic HTML, CSS, and small accessible SVG visuals rather than a charting, CSS-in-JS, animation, icon, or component-library dependency. Use the exact DESIGN.md breakpoints and verify the full approved width set.

Russian is the only MVP language. Keep copy as ordinary typed constants near the owning UI instead of introducing an internationalization framework. Use CSS media queries to produce desktop rail, compact/tablet rail, and mobile bottom navigation layouts; mobile must preserve essential information and commands.

**Rationale**:

- The approved prototypes and DESIGN.md already define tokens, layout, motion, and component direction.
- The required visuals are simple enough to remain accessible without a chart library.
- One language does not justify an i18n dependency.

**Alternatives considered**:

- Tailwind, CSS-in-JS, or a general component library: rejected because they would duplicate or dilute the approved ORBIT system.
- An animation library: rejected; the approved restrained transitions and ambient orbit can be implemented in CSS with `prefers-reduced-motion`.
- A chart library: deferred until a visualization cannot be implemented accessibly with semantic text plus simple CSS/SVG.

## 8. Testing and quality gates

**Decision**: Use:

- strict `tsc` type checking;
- ESLint flat configuration with type-aware `typescript-eslint`, React Hooks, React Refresh, JSX accessibility, and Prettier-conflict rules;
- Prettier as a separate formatter;
- Vitest in Node for pure domain tests;
- Vitest + `fake-indexeddb` for the real persistence adapter;
- React Testing Library, `user-event`, `jest-dom`, and jsdom for behavior-heavy UI integration tests;
- a narrow Playwright suite with `@axe-core/playwright` for real IndexedDB persistence, keyboard operation, responsive flows, and browser accessibility checks;
- production Vite build validation.

Most tests belong to pure domain rules. Avoid broad snapshots. Set scoped coverage thresholds for score, lifecycle, recurrence, closure, and historical aggregation rather than a high global UI threshold. The proposed critical-module gate is 100% functions and at least 95% branches, lines, and statements, with all source files included in the coverage report.

**Rationale**:

- jsdom and fake IndexedDB cannot prove real-browser persistence/reload, layout, focus, or overflow behavior.
- Playwright is therefore a concrete requirement-driven addition. Keep seven canonical story-level specifications and execute the complete journey set at representative desktop `1440`, compact/tablet `820`, and mobile `390` CSS-pixel viewports, with keyboard and touch-oriented projects providing the required input-mode evidence without duplicating domain-policy tests.
- Keep runner discovery isolated: Vitest excludes `e2e/`, Playwright uses that directory as its `testDir`, and Playwright starts the built application through a Vite-preview `webServer`.
- Vite build success is not a substitute for TypeScript checking.

**Alternatives considered**:

- Jest: rejected because Vitest reuses Vite's resolution and transformation path.
- No browser tests: rejected because device persistence, responsive behavior, and keyboard flows are explicit requirements.
- Screenshot-heavy testing: rejected because it is brittle and does not prove domain semantics.
- Property-based or mutation testing: deferred until defects or combinatorial growth justify another dependency.

**Sources**: [Vitest guide](https://vitest.dev/guide/), [Vitest environments](https://vitest.dev/guide/environment.html), [Vitest coverage](https://vitest.dev/guide/coverage.html), [Testing Library query priority](https://testing-library.com/docs/queries/about/), [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB), [Playwright best practices](https://playwright.dev/docs/best-practices), [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing), [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/), [Prettier CLI](https://prettier.io/docs/cli/).

## 9. Persistence guarantee and browser limitations

**Decision**: Request persistent storage with `navigator.storage.persist()` when supported, explain that data is device- and browser-profile-local, and guarantee persistence across ordinary sessions in the same browser profile while site storage remains available. The guarantee excludes browser/OS eviction, explicit site-data deletion, private/incognito sessions, and browser-profile deletion/reset. Never report a failed write as successful and never reset the database automatically after an error.

**Rationale**: A web application cannot guarantee that the browser, operating system, user, private-browsing session, or site-data controls will never evict or clear IndexedDB. The Storage API request is best effort and may be denied. The approved FR-053 wording now matches that platform boundary without weakening error visibility.

**Error behavior**: Normalize storage failures into actionable application errors such as unavailable storage, quota exceeded, upgrade blocked, immutable period, revision conflict, and validation failure. Existing records remain untouched when a transaction aborts.

**Source**: [MDN: `StorageManager.persist()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).

**Alternatives considered**: Claiming backup-grade durability, detecting private
mode, silently resetting the database, or hiding failed writes were rejected as
inaccurate or destructive.

## 10. Hosting and installability

**Decision**: Produce static application assets only. Do not choose a hosting provider, backend, PWA manifest, service worker, or offline asset-delivery strategy during the MVP plan. Document that `BrowserRouter` deployment requires an SPA fallback to `index.html`.

**Rationale**: Device-local persistence does not imply installability, guaranteed offline loading, or a cloud deployment. Those capabilities are outside the approved specification.

**Alternatives considered**: Selecting a host, adding a service worker/PWA, or
using hash routing without a deployment constraint were deferred as out of scope.

## 11. Resolved recurrence-rule semantics

**Decision**: A rule change on local date `D` leaves the already formed current open day and all past occurrences unchanged and starts on `D + 1`. Individually edited future occurrences remain explicit exceptions and are never overwritten; only future occurrences without a per-occurrence override are reconciled to the new rule. If the same rule changes several times on `D`, only the final resulting rule is retained as the effective version at the shared `D + 1` boundary; intermediate configurations need not become effective versions.

**Rationale**: This is the user's explicit product clarification and preserves occurrence-level intent while allowing the series to evolve prospectively.

**Implementation consequence**: Append effective rule versions, derive `D + 1`
from the injected local clock, coalesce repeated same-day edits into the latest
pending version, retain user-deletion tombstones and exception metadata, and
reconcile only non-exception future occurrences. Unmodified future rows made
inapplicable may be removed and later re-materialized; do not add a product
`suppressed` outcome. Do not accept an arbitrary effective date from UI commands.

**Alternatives considered**: Applying the rule to the current day or overwriting future per-occurrence edits were rejected by the approved product decision.

## 12. Task checkbox lifecycle, membership, and audit order

**Decision**: On an open dated placement, completion is one reversible checkbox
state. Checking and unchecking append distinct ordered events and update the one
membership for that occurrence/date. Completion never blocks editing or permanent
deletion, but movement is rejected until the task is unchecked. Backlog exposes
no completion or cancellation action. Cancellation exists only as an unfinished
task disposition inside the atomic Close Day command and is immutable immediately
after successful closure.

Membership begins only with the first committed dated placement. Unsaved input
and direct backlog creation create none. Movement leaves the source membership
currently incomplete but mutable while its day stays open. A dated destination
creates a membership only if one does not exist; A→B→A reuses A's membership.
Permanent deletion tombstones the occurrence, excludes every membership whose
day remains open, preserves all closed-day memberships/frozen scores, and records
one deletion event atomically.

Task-event identity and ordering serve different purposes. Keep a stable UUID
for identity, but assign a persisted monotonic sequence in the same transaction
and use it as the authoritative total order. `occurredAt` remains wall-clock
context and cannot order equal-time events reliably.

**Rationale**: These rules preserve mutable current work without changing closed
facts or inflating scoring denominators, and deterministic ordering explains
every checkbox/move/delete event.

**Alternatives considered**: Ordinary cancellation, completed/canceled
reactivation commands, restoring deleted tasks, one-entry-only deletion, duplicate
return memberships, or timestamp-plus-random-UUID ordering were rejected because
they contradict the clarified specification.

## 13. Habit calendar-boundary reconciliation

**Decision**: A habit becomes completed only through an explicit user action. A pending applicable occurrence whose local date is earlier than the injected clock's current local date is changed idempotently to not completed. Run that bounded reconciliation during startup, visibility resume, affected-range preparation, local-date rollover, and relevant commands. A boundary timer may improve immediacy while the page stays open, but correctness always comes from catch-up and never from a background scheduler.

Each habit occurrence embeds ordered outcome events. Boundary reconciliation
appends one `not-completed` event with source `date-boundary`. While the day
remains open, the user may correct that automatic result to completed; the
command appends a user correction event, updates live Daily Score/Weekly Progress projections,
and retains both facts. The initial explicit pending outcome and the specified
automatic-miss correction are auditable; closure freezes the final outcome.

Before a local date ends, day closure is blocked until every applicable pending habit is explicitly marked completed or not completed. After the boundary, reconciliation supplies the missed outcome. Closure may freeze the resulting facts but does not classify an expired habit.

**Rationale**: Browsers can suspend timers or be closed at midnight. Injected-clock catch-up gives deterministic tests and correct outcomes after a missed boundary while preserving the distinction between explicit completion and automatic non-completion.

**Alternatives considered**: Finalizing pending habits during closure, making completion automatic, depending solely on a midnight timer, or leaving expiration query-dependent were rejected by the approved product decisions.

## 14. Closure, goals, and outcome vocabulary

**Decision**:

- A day-closure `move-to-date` disposition accepts only an open destination whose date differs from the closing date. `keep unfinished` remains a distinct valid disposition on the original day.
- Weekly goals support create, edit/rename, reorder, and delete while their
  governing period is mutable. Leading and trailing whitespace is trimmed before
  persistence, whitespace-only values are invalid, and internal whitespace and
  content is otherwise preserved. No measurability classifier, target/unit
  requirement, numeric progress, or score path exists. Measurability may appear
  only as optional authoring guidance.
- Planned load is the factual sum of current scheduled durations. There is no
  configurable capacity, hidden load/capacity/overload threshold, automatic
  overloaded/not-overloaded classification, or proactive overload warning; any
  displayed copy remains neutral and factual.
- User-visible task/habit outcome projections, history rows, fixtures, labels,
  and copy use only specification-defined outcomes/dispositions. Internal
  `planned` membership state is not a product outcome. No layer stores or exposes
  a `partial` task or habit outcome.

**Rationale**: These are product invariants shared by command validation, persistence mapping, projections, and UI affordances, so they belong in typed domain policy rather than page-specific checks.

**Alternatives considered**: Moving back to the closing date, calculating goal progress, or retaining a compatibility `partial` value were rejected because each would add behavior outside the approved specification.

## 15. Design authority and serialized readiness gate

**Decision**: The constitution governs project/process obligations; `spec.md`
governs behavior and data semantics; `contracts/ui-routes.md` governs its
explicit UI/prototype overrides; `DESIGN.md` is the canonical visual-system
contract; and Open Design prototypes are references only where they do not
conflict with those artifacts. The fresh Open Design reconciliation is
serialized because it may change governing artifacts and must not run alongside
dependent UI work. It records source availability/version or the exact failure,
never claims a pass during an outage, and requires approval for significant
deviations.

The 2026-08-11 fresh read-only pull succeeded and the product owner explicitly
approved the six recorded resolutions in `design-reconciliation.md`. The
reconciliation gate is complete, so its dependent visual, component, browser
journey, and other UI work may proceed under those exact resolutions.

**Rationale**: This keeps visual fidelity verifiable without letting an older or
unavailable prototype silently reverse approved behavior.

**Alternatives considered**: Treating stale artifacts as current, passing the
gate on outage, running it concurrently with dependent UI work, allowing a
prototype to override a governing artifact, or blocking all non-visual work were
rejected by the approved gate decision.

## 16. Fixed week identity and dated ordering

**Decision**: Derive a week key as the Monday containing any local date. The
seven-day period is always Monday through Sunday, and ensuring its storage record
is idempotent. Users never name/create arbitrary ranges or create overlaps.
Weekly goals retain explicit array order. Dated tasks use simple integer order.
A newly materialized recurring occurrence is appended to the end of its date's
ordered task list; all existing positions remain unchanged and no recurrence
source, time, priority, or other implicit sorting is introduced. Backlog ignores
dated order and uses immutable creation sequence oldest first.

**Rationale**: A canonical key makes duplicate/overlap checks unnecessary and
keeps the ordering model no more general than current requirements.

**Alternatives considered**: User-created week ranges, fractional/general-purpose
positions, backlog reorder/sort, recurring-task prepend, and recurring-source
grouping were rejected.

## 17. Day-closure calendar eligibility

**Decision**: The atomic closure transaction requires an open source day and
`date <= currentLocalDate`. It rejects every future day. Eligible current/past
days close independently; an older open day is not a prerequisite for closing a
later eligible day. Close-Day cancellation and keep-unfinished both finalize an
incomplete source membership.

**Rationale**: This is the approved calendar boundary and prevents pre-closing
future facts without imposing an unrequested chronological workflow.

**Alternatives considered**: Future-day closure and mandatory chronological
closure were rejected by the approved clarification.

## 18. Weekly progress and History projections

**Decision**: Weekly review displays mandatory derived progress and its raw task
and habit counts/rates. It sums the seven frozen day count pairs, applies the
shared 70/30 policy with missing-category normalization and ties-upward rounding,
and freezes the result/counts at completion; it never averages daily percentages.
Goals and state are excluded.

History uses Day, Week, and Month projections as defined in section 3, defaults
to current Month/current-date anchor, preserves and clamps selection exactly as
specified, is read-only, includes the specified facts, and omits workout history.
Its only Dynamics are the last eight weeks in Week mode and last six months in
Month mode, using task rate, habit rate, and the shared score. No arbitrary
366-day public window remains.

**Rationale**: Raw counts preserve the specified denominator semantics, while
mode-derived indexed ranges implement the exact user navigation without a
broader generic history API.

**Alternatives considered**: Averaging daily percentages, goal-derived progress,
arbitrary history windows/search, and workout history were rejected.

## 19. Approved manual usability protocol

**Decision**: `usability-protocol.md` records the approved production-build
procedure: one representative target user or product owner; written instruction
before timing; timing starts when shown and interaction is possible; timing stops
at the required visible outcome; no UI hints after start; only non-instructional
task clarification; assistance/time-limit failure rules; and external evidence
containing task, elapsed time, pass/fail, and assistance. SC-001 has no time cap;
SC-002, each SC-003 operation, and SC-010 keep their specified limits.

**Rationale**: Acceptance remains reproducible without adding analytics,
telemetry, accounts, or a backend.

**Alternatives considered**: Multi-participant percentages, moderator UI hints,
and product instrumentation were rejected by the approved protocol.
