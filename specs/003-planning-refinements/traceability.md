# Traceability: ORBIT Planning Refinements

**Feature**: `003-planning-refinements` | **Date**: 2026-08-22

Every functional requirement is tied to an assertion that ran in the final gates. File names
below identify the primary evidence; several requirements also have contract and E2E coverage.

| Requirement | Primary automated or live evidence | Level |
| ----------- | ---------------------------------- | ----- |
| FR-001 | `server/planning/repository.persistence.test.ts`; `e2e/journeys/server-persistence.spec.ts` | Server + E2E |
| FR-002 | `server/db/migrations/migrations.test.ts`; live before/after table in `baseline.md` | Migration + live |
| FR-003 | `repository.persistence.test.ts`; live row/snapshot comparison in `baseline.md` | Server + live |
| FR-004 | `src/entities/planning/api/http/http-planning-repository.test.ts`; `server-unavailable.spec.ts` | Client + E2E |
| FR-005 | `repository.persistence.test.ts` preserves touched task/habit records across `prepareOpenPeriod` | Server |
| FR-006 | `src/entities/planning/model/day-closure.test.ts` compares live and frozen counts | Domain |
| FR-007 | `day-closure.test.ts` pins moved/backlogged/cancelled denominator membership | Domain |
| FR-008 | `server/planning/repository.day-closure.test.ts` compares Day, Week, and History | Server contract |
| FR-009 | `day-reopening.test.ts`; `ReopenDayDialog.test.tsx`; `04-day-closure.spec.ts` | Domain + UI + E2E |
| FR-010 | `day-reopening.test.ts`; Week/History rendering tests; close→reopen E2E | Domain + UI + E2E |
| FR-011 | `server/planning/repository.day-reopening.test.ts` checks ordered `closure-reopen` events | Server |
| FR-012 | `day-reopening.test.ts` leaves moved/backlogged occurrences untouched | Domain |
| FR-013 | `day-reopening.test.ts` restores completed, kept-unfinished, and cancelled memberships | Domain |
| FR-014 | reopening domain/server guard tests and Day page explained-unavailable tests | Domain + server + UI |
| FR-015 | `repository.day-reopening.test.ts` proves a moved task's destination day is not written | Server |
| FR-016 | `src/entities/planning/model/scoring.test.ts` includes 9+1→90 and 1+3→25 | Domain |
| FR-017 | `src/entities/planning/model/week-completion.test.ts` proves aggregate/direct equivalence | Domain |
| FR-018 | `scoring.test.ts` returns `unavailable` for a zero denominator | Domain |
| FR-019 | `ScoreBreakdown.test.tsx` and page rendering tests keep both category breakdowns | UI |
| FR-020 | `ScoreBreakdown.test.tsx`, `HistoryPage.rendered.test.tsx`, and `05-daily-signals.spec.ts` assert single-weight copy | UI + E2E |
| FR-021 | `server/db/migrations/migrations.test.ts` checks rescaling, shape preservation, and idempotence | Migration |
| FR-022 | migration test plus the live upgrade comparison in `baseline.md` | Migration + live |
| FR-023 | `TaskRow.test.tsx` opens the note modal from the compact row action | UI |
| FR-024 | `task-lifecycle.test.ts`; `TaskRow.test.tsx`; `02-task-execution.spec.ts` cover set/edit/clear/reload | Domain + UI + E2E |
| FR-025 | `TaskRow.test.tsx` checks the read-only modal; Backlog and History page tests prove immutable consumers expose no editor | UI |
| FR-026 | `TaskRow.test.tsx` checks the note-exists dot on the row action | UI |
| FR-027 | `selectors.us5.test.ts` and lifecycle fixtures prove notes belong to occurrences | Domain |
| FR-028 | `DayPage.test.tsx`, `WeekPage.test.tsx`, `BacklogPage.test.tsx`, and `HistoryPage.rendered.test.tsx` open the same occurrence note on all four surfaces | UI integration |
| FR-029 | habit model/API/parser tests and `HabitRecurrenceDialog.test.tsx` cover set/unset/clear | Domain + contract + UI |
| FR-030 | `planned-load.test.ts` adds habit duration to task duration | Domain |
| FR-031 | `planned-load.test.ts` proves an absent duration contributes zero | Domain |
| FR-032 | `HabitRow.test.tsx`, `DayPage.test.tsx`, `WeekPage.test.tsx`, and `HistoryPage.rendered.test.tsx` check duration on every habit-list surface | UI integration |
| FR-033 | `planned-load.test.ts` and scoring tests prove duration never changes counts/value | Domain |
| FR-034 | `repository.daily-signals.test.ts` preserves frozen closed-day load | Server |
| FR-035 | `use-history-page.test.tsx` and `history.us7.test.ts` aggregate month points | Domain + client model |
| FR-036 | the same history suites aggregate week points | Domain + client model |
| FR-037 | `use-history-page.test.tsx` varies selected day without changing the point | Client model |
| FR-038 | `HistoryPage.rendered.test.tsx` draws mixed data/no-data periods as gaps | UI |
| FR-039 | `HistoryPage.rendered.test.tsx` shows empty state only when every point lacks data | UI |
| FR-040 | `WeekPage.test.tsx`; `01-week-planning.spec.ts` expand all seven days in one action | UI + E2E |
| FR-041 | `WeekPage.test.tsx` asserts the current expand/collapse effect label | UI |
| FR-042 | `WeekPage.test.tsx` asserts individual toggling after expand-all | UI |

## Cross-cutting evidence

- `npm run verify`: format, lint with zero warnings, typecheck, 232 server tests, 722
  coverage tests, and 25 Playwright journeys all passed. The E2E stage completed in 1.3
  minutes with retries disabled; the entire sequential verify pipeline completed in 220.4s.
- `npm run test:server:tz`: 232/232 passed under the non-UTC verification config.
- `npm run test:visual`: 16/16 approved desktop/tablet/mobile baselines passed.
- Live deployment: health, Day, Week, and month History read APIs returned successful current
  projections after migrations 002 and 003; the live data-preservation comparison is in
  `baseline.md`.

## Owner refinement recorded during implementation

The original FR-023 in-place disclosure was replaced by the owner's 2026-08-22 decision:
notes open in the shared modal from a compact action beside the completion checkbox. The
specification, plan, tasks, quickstart, `DESIGN.md`, UI tests, E2E journey, and visual baselines
all describe and verify the refined interaction.
