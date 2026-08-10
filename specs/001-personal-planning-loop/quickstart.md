# Quickstart and Validation Guide

**Feature**: `001-personal-planning-loop`  
**Purpose**: Implementation/acceptance workflow after scaffolding. Planning creates
no application code.

## 1. Prerequisites and gates

- Node.js 22.22 or newer and npm
- Modern Chromium and WebKit browsers
- No backend, database server, account, secret, API key, or cloud service

Before implementation, confirm `spec.md`, `plan.md`, `research.md`,
`data-model.md`, and contracts agree on:

- fixed Monday–Sunday week identity;
- completion check/uncheck, movement-only-when-incomplete, Close-Day-only
  cancellation, and terminal deletion across all still-open memberships;
- oldest-first backlog without completion/cancel/reorder/sort;
- unique A→B→A membership reuse;
- inclusive recurrence, D+1 changes, same-day coalescing, and future exceptions;
- habit boundary miss plus open-day correction with both events retained;
- future-day closure rejection and independently eligible nonchronological closure;
- boundary-trimmed free-form goals with whitespace-only rejection, preserved
  internal content, and no measurability/numeric progress;
- Daily Score/Weekly Progress 70/30 counts, normalization, unavailable state, and
  ties-upward;
- factual load without configurable capacity, automatic load/capacity/overload
  threshold, classification, or warning;
- Day/Week/Month read-only History and no workout history;
- browser-profile-local persistence boundary.

The Open Design reconciliation is serialized. The 2026-08-10 attempt failed with
`Transport closed`; see `design-reconciliation.md`. Do not start affected visual,
component, browser-journey, or other UI work until a successful pull records
source version/availability, resolves differences, and obtains approval. Do not
report the failed gate as passed. Toolchain, pure-domain, contract, and non-visual
adapter work may continue.

The approved manual acceptance procedure is already recorded in
`usability-protocol.md`. Execute it only against the production build.

## 2. Expected setup

After scaffolding:

```bash
npm install
npx playwright install
npm run dev
```

The SPA opens in Russian without sign-in. It shows the unique current
Monday–Sunday week, ensuring its empty record idempotently when needed. Once a
lockfile exists, clean environments use `npm ci`.

## 3. Script contract

```text
npm run dev
npm run preview
npm run typecheck        # tsc -b --pretty false
npm run lint             # eslint . --max-warnings 0
npm run format           # prettier . --write
npm run format:check     # prettier . --check
npm run test             # vitest run
npm run test:watch       # vitest
npm run test:coverage    # vitest run --coverage
npm run build            # Vite production build
npm run test:e2e         # build + Playwright against production preview
npm run verify           # format:check, lint, typecheck, coverage, test:e2e
```

Vitest excludes `e2e/**`; Playwright uses `e2e` and starts Vite preview after a
build. Tools ignore generated `dist`, `coverage`, `playwright-report`, and
`test-results`. Vite build does not replace type checking.

## 4. Automated test map

### Pure domain (Vitest/Node)

- Canonical Monday key, exactly seven owned dates, idempotent week ensure
- Boundary-trimmed free-form goal CRUD/reorder with whitespace-only rejection,
  internal-content preservation, and no measurability/numeric/score path
- Completion check/uncheck events; completed-task edit/delete; move rejected
  until unchecked; ordinary cancellation absent
- First committed dated membership, no backlog/draft membership, unique A→B→A
  reuse, repeated/cross-week movement
- Permanent deletion excludes every still-open membership, preserves closed ones,
  and leaves frozen scores unchanged
- Backlog oldest-first creation sequence and no reorder/sort/checkbox/cancel
- Inclusive recurrence, D+1 rule change, same-day coalescing, exception and
  user-deletion preservation, future unmodified row reconciliation
- Boundary habit miss idempotence, automatic-miss correction, both durable events,
  and closure freeze
- Future-day closure rejection, eligible out-of-order closure, full disposition
  map, pending-habit and same-date destination guards
- Daily Score/Weekly Progress counts, equal memberships, normalization, unavailable result,
  exact ties-upward, and weekly aggregation from raw counts—not daily averages
- Duration-only load and pre-disposition snapshot with no configurable capacity,
  automatic load/capacity/overload threshold, or overload classification
- Day/Week/Month History selectors, plan-versus-actual explanations, and direct
  retrieval of finalized weekly progress with contributing counts/rates
- No `partial` or `suppressed` task/habit product outcome

Critical policy modules target 100% functions and at least 95% branches, lines,
and statements. Include untested source files; do not impose a shallow global UI
threshold.

### Persistence integration (Vitest + fake IndexedDB)

- V1 initialization/migration harness and close/reopen round trip
- Repository contract and atomic rollback/error mapping
- Fixed-week records and goal round trip
- `createdSequence` backlog order with no position field
- Check/uncheck and equal-timestamp task-event ordering
- A→B→A unique membership and mixed open/closed deletion transaction
- Recurrence idempotence, rule coalescing, exception/tombstone preservation
- Habit boundary/correction embedded events after reload
- Future closure rejection, nonchronological eligibility, destination and pending
  guards, frozen day/week snapshots
- Indexed Day/Week/Month History joins, including weekly progress; no arbitrary
  window API
- Revision/immutability conflicts, quota/abort mapping, and upgrade blocking

### UI integration (after design gate)

- Completion checkbox, completed edit/delete, and move-disabled-until-unchecked
- Backlog actions/order and absence of completion/cancel/reorder/sort/filter
- Free-form goal boundary trimming, whitespace-only rejection, internal-content
  preservation, and no measurability/numeric progress
- Transparent Daily Score/Weekly Progress counts/rates and factual load without
  overload copy
- Recurrence inclusive end and final D+1 messaging
- Habit catch-up and allowed correction
- Close Day eligibility, four explicit dispositions, pending/future/same-date guards
- Weekly progress display/finalization
- History current-Month default, Day/Week/Month controls/steps, Month calendar and
  selected-day details, weekly-progress display, applicable Dynamics,
  read-only/no workout behavior
- Loading/empty/error/immutable states and dialog focus behavior

### Real browser (after design gate)

Keep seven canonical story journeys: week planning; task execution/movement;
recurrence; deliberate closure; habits/state/score/load; weekly review/completion;
and History, with the History journey locating weekly progress explicitly.
Execute all at `1440`, `820`, and `390` CSS pixels. Use keyboard-only
desktop Chromium and touch-oriented tablet/mobile projects. Reuse them for real
IndexedDB reload, immutable history, responsive actions, and boundary catch-up.
Add targeted axe scans plus final manual keyboard/real-touch review.

## 5. Deterministic calculations

| Applicable facts | Expected result |
|---|---|
| 2/3 tasks, 1/2 habits | `66.67% * 70% + 50% * 30% = 61.67%`, display 62% |
| 1/2 tasks, no habits | Tasks normalize to 100%, display 50% |
| no tasks, 3/4 habits | Habits normalize to 100%, display 75% |
| 1/8 tasks, no habits | Exact 12.5% rounds upward to 13% |
| raw 74.4 / 74.5 / 74.6 | 74% / 75% / 75% |
| no applicable tasks/habits | unavailable, not 0% |

Deletion reach example:

1. Move one logical task A→B→C while all three days are open.
2. Close A while its membership is incomplete.
3. Permanently delete the task from C/backlog.
4. Expected: A remains in its frozen denominator; B and C are excluded; one
   deletion event remains; no membership date or closed score changes.

Load example: current scheduled durations 30, 45, and 15 minutes produce 90
minutes. If present immediately before closure, the snapshot stays 90 after
closure moves/cancels tasks. It produces no capacity/overload label.

## 6. Manual product walkthrough

### Week and backlog

1. Open any date and verify the unique containing Monday–Sunday week.
2. Add free-form goals; verify boundary trimming, whitespace-only rejection, and
   preserved internal content; rename/reorder/delete one; and verify no
   measurability rejection or numeric progress appears.
3. Add dated tasks with durations and one direct-backlog task.
4. Verify factual day loads and matching current data across week/day views.
5. Verify backlog oldest-first order and edit/delete/schedule actions only.

### Task execution and deletion

1. Check/uncheck completion and verify both events/current projections.
2. While checked, edit the task and verify movement remains blocked until
   unchecked; deletion remains available.
3. Move an incomplete task A→B→A, complete it at A, and verify one membership per
   date: A completed, B incomplete.
4. Delete a moved task with open and closed memberships; verify only open ones
   leave denominators and no restore/ordinary cancel action exists.

### Recurrence and habit boundary

1. Create weekday recurring task/habit rules with an inclusive matching end date.
2. Edit/delete one occurrence; preserve siblings. Change the rule repeatedly in
   one day; keep only final D+1 behavior and explicit future exceptions.
3. Let an injected-clock test expire a pending habit; verify not-completed event.
4. Correct that automatic result while open; verify completed plus both events.

### Day closure

1. Verify a future day cannot start/confirm closure and that an older open day
   does not block a later eligible day.
2. Resolve every pending applicable habit.
3. Assign keep, move date, move backlog, and cancel across unfinished tasks with
   no default; reject the closing date as destination.
4. Confirm and verify immutable score counts/rates, factual load, state, and
   dispositions; every later mutation fails.

### Weekly review and History

1. Close all seven days, review raw task/habit counts/rates and derived weekly
   progress, add reflection, and complete the week.
2. Verify goals/state never enter progress and the frozen breakdown is immutable.
3. Open History: expect current Month/current-date anchor. Exercise exact
   previous/next steps in Day, Week, and Month; inspect Month selected-day details
   and Dynamics where the reconciled design applies.
4. Navigate to a completed week and locate its finalized weekly progress plus
   contributing task/habit counts and rates.
5. Verify all facts are read-only and no workout layer/tab/data exists.

### Device-local boundary

1. Reload/restart the same normal browser profile and recover data.
2. Verify copy explains device/profile locality and site-data/eviction/private/
   profile-reset exclusions without implying sync or backup.
3. Inject quota/transaction failures and verify no false success or history loss.

## 7. Responsive/accessibility acceptance

Run every primary journey at `390`, `820`, and `1440`, plus overflow/action checks
at `360, 390, 430, 600, 768, 820, 1024, 1366, 1440, 1920`.

Manually verify navigation layouts, 44px targets, visible/logical focus, labels,
non-color status, textual Daily Score/Weekly Progress explanation, contrast/zoom/reflow,
reduced motion, neutral Russian copy, and essential mobile actions. Axe supplements
but does not replace review.

Execute `usability-protocol.md` against the production build. SC-001 has no time
limit but fails with UI assistance; SC-002 is 10 minutes; every SC-003 operation
is timed independently at 30 seconds; SC-010 is 30 seconds. Record evidence
outside ORBIT. Separately review every presented low-completion/load/missed-habit/
low-state message: zero punitive, shaming, alarmist, unsupported praise, overload
classification, or proactive overload warning.

## 8. Architecture/design review

- React imports no IndexedDB implementation; domain imports no React/DOM/router.
- FSD imports point downward; no empty layers, generic repository, backend,
  auth/sync, global cache, workout, PWA, capacity, or speculative formula system.
- One shared scoring/calculation policy serves the Daily Score and Weekly
  Progress and rounds once.
- Membership/date identity, open-only deletion reach, and event order are tested.
- Habit expiry/correction is idempotent, clock-driven, and auditable.
- Backlog has immutable creation order; goals are boundary-trimmed free-form text
  with whitespace-only rejection and otherwise preserved internal content.
- History uses only Day/Week/Month mode queries and contains no workout/editing.
- UI tokens/layout/voice follow reconciled design sources after the gate succeeds.
- Daily Score/Weekly Progress labels use 70/30; state is context; planned load
  has no configurable capacity, automatic load/capacity/overload threshold, or
  overload classification.
- Weekly progress counts/rates are visible and freeze at completion.
- Closure/completion success appears only after atomic commit.
- `npm run verify` and the FR/SC traceability review both pass before release.
