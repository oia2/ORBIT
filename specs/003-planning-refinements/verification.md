# Verification: ORBIT Planning Refinements

**Feature**: `003-planning-refinements` | **Date**: 2026-08-22
**Branch**: `feat/planning-refinements`

## Environment and final gates

| Item | Result |
| ---- | ------ |
| Node.js | 22.22.3 |
| PostgreSQL | 17, Docker Compose `db`, persistent named volume |
| Host timezone | `Asia/Krasnoyarsk` (UTC+7) |
| `npm run verify` | pass |
| Format / lint / typecheck | pass; lint uses `--max-warnings 0` |
| Server tests | 232 passed, 24 files |
| Non-UTC server tests | 232 passed, 24 files |
| Coverage | 722 passed, 79 files; 86.54% statements, 81.32% branches, 86.35% functions, 87.78% lines |
| E2E | 25 passed in 1.3m with retries disabled; the full sequential `npm run verify` completed in 220.4s |
| Visual | 16 passed; 6 reviewed baselines updated for planned UI changes |

The e2e matrix runs all functional database-backed journeys once in desktop Chromium and
device-specific responsive/accessibility smoke checks in tablet/mobile WebKit. Visual checks
retain desktop, tablet, and mobile viewport coverage. Retries are disabled: a deterministic
failure now exits once with its retained trace instead of multiplying the gate to five minutes.

The convergence pass added the missing read-only note actions to Backlog and History, habit
duration facts to Week and History, and a focused reopen-dialog suite. The final gate therefore
contains 4 additional UI tests without adding a Playwright project or repeating database-backed
journeys on tablet/mobile.

## Live upgrade verification

The owner completed `docker compose up -d --build` after transient registry `ECONNRESET`
failures. Migrations `002-single-weight-snapshots` and `003-habit-duration` are recorded in the
live Kysely migration table. Before and after counts were identical: 6 weeks, 42 days, 20 task
occurrences, 20 plan entries, 108 task events, 2 habit definitions, 22 habit occurrences, and
0 task series. The three closed days kept every task/habit count and frozen load; only
`weightsApplied` disappeared. An app restart left the migrated snapshots unchanged.

After the owner-refined note UI and final test fixes, the complete source was rebuilt and
redeployed successfully once more. The recreated app reported health `ok`; the database still
held 42 days, all three migrations, and zero snapshots with `weightsApplied`.

A fresh 34,397-byte pre-upgrade backup exists at
`backups/orbit-2026-08-22T11-56-59-509.dump`. Full evidence is recorded in `baseline.md`.

## Success criteria

| Criterion | Result | Evidence and proof strength |
| --------- | ------ | --------------------------- |
| SC-001 | PASS | **Direct automated**: server reconnect/date-boundary regression and browser-context E2E preserve tasks, note, state, and records. |
| SC-002 | PASS | **Direct live**: the recorded live before/after upgrade comparison preserved every row. |
| SC-003 | PASS | **Direct automated**: closure domain and server cross-surface tests preserve completed/applicable counts in every tested closure. |
| SC-004 | PASS | **Direct automated**: close→reopen→correct→close E2E plus atomic server rollback tests. |
| SC-005 | PASS | **Direct automated**: scoring table proves 9+1→90% and 1+3→25%. |
| SC-006 | PASS | **Direct automated/static**: UI/E2E copy tests pass; source search has no user-facing 70/30 text (remaining hits are comments/tests). |
| SC-007 | PASS | **Direct automated**: note modal set/reload/read/clear E2E and Day/Week/Backlog/History rendering tests. |
| SC-008 | PASS | **Direct automated**: planned-load domain/server/UI tests add exactly N minutes, preserve score, and freeze closed load. |
| SC-009 | PASS | **Direct automated**: History client/domain/rendering tests and E2E keep populated period points independent of selected day. |
| SC-010 | PASS | **Direct automated**: Week UI test and E2E expand all seven days with one interaction. |
| SC-011 | PASS | **Direct migration + live**: migration tests recompute snapshots idempotently and the live comparison preserves counts. |

## Quickstart scenario validation (T087)

Sections 4.1–4.7 were executed by their production-build Playwright equivalents against an
isolated PostgreSQL database: closure/count agreement, single weight, reopen/correct/reclose,
task-note persistence, habit duration/load, History dynamics, and week expand-all all passed.

On the owner's live instance, a non-mutating smoke check returned:

- health `ok`;
- Day 2026-08-22: successful open-day projection;
- Week 2026-08-17: successful open-week projection with live progress 77;
- month History: successful month projection.

This is **direct evidence for the built mutation flows** and **proxy evidence for replaying all
mutations in the owner's production database**. The destructive/polluting manual replay was
intentionally not performed: it would add test tasks, audit events, closures, and corrections to
real personal history without improving coverage beyond the same production bundle and real
PostgreSQL path exercised by E2E. The production migration and reads themselves were verified
directly, not by proxy.

## Visual review

The owner refinement moved task notes from a lower in-row disclosure to a modal opened by a
compact action beside completion controls. The reviewed planner screenshots show the note icon
beside checkbox/menu controls without horizontal overflow. Six expected baselines changed:
desktop History populated, tablet Week/History populated, mobile Week populated, and mobile
History populated (the last one was re-reviewed after the convergence duration/note facts added
18 px to the page). After single-baseline approval-token replacement, a clean
`npm run test:visual` passed 16/16.

## Declared design deviations

All four deviations in `plan.md` have matching `DESIGN.md` records and implementation changes:
single-weight score copy, formula-neutral History legend, reopenable closed-day copy, and the
owner-refined task-note modal/action placement.
