# Traceability matrix

**Feature**: ORBIT Personal Planning Loop
**Compiled**: 2026-08-17 (T109)
**Build under evidence**: production build of the 2026-08-16/17 remediation
**Gate run**: `npm run verify` — exit 0 (format, lint, strict typecheck, coverage
86.29% statements / 80.36% branches over 439 unit tests, production build, 49
Playwright tests across `desktop-chromium-keyboard`, `tablet-webkit-touch`,
`mobile-webkit-touch`, and `visual-chromium`).

## How to read this

Every extant requirement maps to at least one passing automated check. Paths are
repository-relative. Journey files run in all three device projects, so a journey
row is evidence at 1440, 820, and 390 simultaneously.

Requirement identifiers are those currently in `spec.md`. FR-014 does not exist
(it was withdrawn before implementation); FR-015a was added by the Session
2026-08-16 amendment.

## Functional requirements

| Requirement | Evidence |
|---|---|
| FR-001 fixed Monday–Sunday weeks | `src/entities/planning/model/week.test.ts`; `src/shared/lib/local-date/local-date.test.ts`; `e2e/journeys/01-week-planning.spec.ts` |
| FR-002 weekly goal CRUD + reorder + trimming | `week.test.ts`; `indexeddb-planning-repository.us1.test.ts`; `src/features/manage-week/**`; `01-week-planning.spec.ts` |
| FR-003 no numeric goal progress | `week.test.ts`; `src/pages/week/ui/WeekPage.test.tsx`; `01-week-planning.spec.ts` asserts absence |
| FR-004 create/assign tasks | `task.test.ts`; `indexeddb-planning-repository.us1.test.ts`; `01-week-planning.spec.ts` |
| FR-005 positive dated duration | `task.test.ts`; `src/features/manage-task/ui/TaskEditorDialog.test.tsx`; `03-recurrence.spec.ts` (rejects `0`) |
| FR-006 weekly and daily views | `src/pages/week/ui/WeekPage.test.tsx`; `src/pages/day/ui/DayPage.test.tsx`; `01-week-planning.spec.ts` |
| FR-007 planned vs actual separated | `history.test.ts`; `src/entities/planning/ui/TaskRow.test.tsx`; `02-task-execution.spec.ts` |
| FR-008 edit/delete on an open day | `task-lifecycle.test.ts`; `indexeddb-planning-repository.us2.test.ts`; `02-task-execution.spec.ts` |
| FR-009 reversible completion | `task-lifecycle.test.ts`; `src/features/manage-task/ui/TaskExecution.test.tsx`; `02-task-execution.spec.ts` |
| FR-010 movement rules | `task-lifecycle.test.ts`; `indexeddb-planning-repository.us2.test.ts`; `02-task-execution.spec.ts` |
| FR-011 no ordinary cancellation | `TaskExecution.test.tsx`; `02-task-execution.spec.ts` asserts absence |
| FR-012 task event history | `history.test.ts`; `indexeddb-planning-repository.us2.test.ts` |
| FR-013 consistent cross-view change | `selectors.us5.test.ts`; `WeekPage.test.tsx`; `01-week-planning.spec.ts` |
| FR-015 recurrence rules (task dates; habit weekdays only) | `recurrence.test.ts`; `src/features/manage-habit/ui/HabitRecurrenceDialog.test.tsx`; `03-recurrence.spec.ts` |
| FR-015a optional task start/end time | `task.test.ts` (`validateTaskTimeRange`); `TaskEditorDialog.test.tsx`; `TaskRow.test.tsx`; `data-model.md`, `contracts/domain-commands.md`, `contracts/persistence.md` |
| FR-016 per-date occurrences, append order | `occurrence-materialization.test.ts`; `indexeddb-planning-repository.us3.test.ts`; `03-recurrence.spec.ts` |
| FR-017 occurrence-only edit | `occurrence-materialization.test.ts`; `03-recurrence.spec.ts` |
| FR-018 occurrence-only delete | `occurrence-materialization.test.ts`; `indexeddb-planning-repository.us3.test.ts` |
| FR-019 rule change preserves past/current | `recurrence.test.ts`; `03-recurrence.spec.ts` |
| FR-020 habit outcome, undo, boundary miss, closure gate | `habit.test.ts` (`recordHabitOutcome`, `clearHabitOutcome`, `catchUpHabitDateBoundary`, `correctBoundaryMissToCompleted`); `src/features/manage-habit/ui/HabitOutcomeControl.test.tsx`; `src/features/close-day/ui/CloseDayDialog.test.tsx`; `04-day-closure.spec.ts` |
| FR-021 closed-period immutability | `day-closure.test.ts`; `indexeddb-planning-repository.us4.test.ts`; `02-task-execution.spec.ts` (mixed deletion) |
| FR-022 explicit habit outcome | `habit.test.ts`; `HabitOutcomeControl.test.tsx`; `03-recurrence.spec.ts` |
| FR-023 energy/mood/sleep | `day.test.ts`; `src/features/record-daily-state/ui/DailyStateForm.test.tsx`; `05-daily-signals.spec.ts` |
| FR-024 labeled, date-associated state | `DailyStateForm.test.tsx`; `05-daily-signals.spec.ts` |
| FR-025 state excluded from score | `scoring.test.ts`; `selectors.us5.test.ts`; `src/pages/day/ui/DaySignals.test.tsx` |
| FR-026 habit/state changes propagate | `indexeddb-planning-repository.us5.test.ts`; `05-daily-signals.spec.ts` |
| FR-027 membership begins at first dated placement | `history.test.ts`; `indexeddb-planning-repository.us2.test.ts` |
| FR-028 move preserves source membership | `history.test.ts`; `02-task-execution.spec.ts` |
| FR-029 habit completion rate | `habit.test.ts`; `scoring.test.ts` |
| FR-030 delete excludes open memberships | `history.test.ts`; `indexeddb-planning-repository.us2.test.ts`; `02-task-execution.spec.ts` |
| FR-031 70/30 weighting | `scoring.test.ts`; `src/entities/planning/ui/ScoreBreakdown.test.tsx` |
| FR-032 normalization when one category applies | `scoring.test.ts` |
| FR-033 unavailable when neither applies | `scoring.test.ts`; `ScoreBreakdown.test.tsx`; `src/shared/ui/orbit-metric/OrbitMetric.test.tsx` |
| FR-034 rates, percentage, thresholds, status bands | `ScoreBreakdown.test.tsx`; `OrbitMetric.test.tsx`; `src/app/layout/AppShell.test.tsx`; `05-daily-signals.spec.ts` |
| FR-035 live open-day score | `selectors.us5.test.ts`; `DaySignals.test.tsx` |
| FR-036 planned load = sum of durations | `planned-load.test.ts`; `DayPage.test.tsx`; `01-week-planning.spec.ts` |
| FR-037 closure freezes load | `day-closure.test.ts`; `indexeddb-planning-repository.us4.test.ts` |
| FR-038 no configurable capacity | `planned-load.test.ts`; `DayPage.test.tsx` and `05-daily-signals.spec.ts` assert absence |
| FR-039 Close Day only for eligible day | `day-closure.test.ts`; `04-day-closure.spec.ts` (future day rejected) |
| FR-040 identify every unfinished item | `day-closure.test.ts`; `CloseDayDialog.test.tsx`; `04-day-closure.spec.ts` |
| FR-041 no silent default | `closure-reducer` via `CloseDayDialog.test.tsx`; `04-day-closure.spec.ts` |
| FR-042 closure record | `day-closure.test.ts`; `indexeddb-planning-repository.us4.test.ts` |
| FR-043 open/closed communicated | `src/entities/planning/ui/TaskRow.test.tsx` (`PeriodStatus`); `DayPage.branches.test.tsx` |
| FR-044 closed day immutable, no reopen | `day-closure.test.ts`; `04-day-closure.spec.ts` |
| FR-045 weekly reflection after seven closed days | `week-completion.test.ts`; `src/features/complete-week/ui/CompleteWeekDialog.test.tsx`; `06-weekly-review.spec.ts` |
| FR-046 completed week immutable | `week-completion.test.ts`; `indexeddb-planning-repository.us6.test.ts`; `06-weekly-review.spec.ts` |
| FR-047 weekly review contents | `WeekPage.us6.test.tsx`; `06-weekly-review.spec.ts` |
| FR-048 Weekly Progress aggregate | `week-completion.test.ts`; `scoring.test.ts`; `06-weekly-review.spec.ts` |
| FR-049 future adjustment preserves facts | `week-completion.test.ts`; `06-weekly-review.spec.ts` |
| FR-050 read-only History Day/Week/Month | `history.us7.test.ts`; `src/pages/history/ui/HistoryPage.rendered.test.tsx`; `07-history.spec.ts` |
| FR-051 historical outcome vocabulary | `history.us7.test.ts`; `TaskRow.test.tsx` (frozen dispositions) |
| FR-052 single user, no account | `AppShell.test.tsx`; `device-local-persistence.spec.ts` asserts absence of account UI |
| FR-053 device-local durability | `indexeddb-planning-repository.failures.test.ts`; `src/app/providers/AppProviders.test.tsx`; `device-local-persistence.spec.ts` |
| FR-054 no synchronization | `architecture-review.md` scope audit; `device-local-persistence.spec.ts` |
| FR-055 desktop and mobile journeys | all seven journeys in the tablet and mobile projects; `responsive-accessibility.spec.ts` |
| FR-056 shared layout system | `AppShell.test.tsx` (responsive foundations); `e2e/visual/responsive.visual.spec.ts` |
| FR-057 neutral factual copy | `content-review.md` (T104 + T111 addendum); `AppShell.test.tsx` prohibits judgemental wording |
| FR-058 status without color alone | `AppShell.test.tsx`; `responsive-accessibility.spec.ts` |
| FR-059 Russian default | every component test asserts Russian strings; `AppShell.test.tsx` |

## Success criteria

| Criterion | Evidence |
|---|---|
| SC-001 first useful week | `01-week-planning.spec.ts` — **no human timing** (T108 removed) |
| SC-002 plan a week ≤10 min | `01-week-planning.spec.ts` covers the operations — **no measured human time** |
| SC-003 core operations ≤30 s each | `02-task-execution.spec.ts`, `05-daily-signals.spec.ts` — **no measured human time** |
| SC-004 honest history after moves | `history.test.ts`; `02-task-execution.spec.ts` |
| SC-005 explicit closure, no silent carry-forward | `day-closure.test.ts`; `04-day-closure.spec.ts` |
| SC-006 reproducible score | `scoring.test.ts`; `ScoreBreakdown.test.tsx`; `05-daily-signals.spec.ts` |
| SC-007 recurrence isolation | `occurrence-materialization.test.ts`; `03-recurrence.spec.ts` |
| SC-008 habit boundary correctness | `habit.test.ts`; `src/app/runtime/habit-boundary.test.ts` |
| SC-009 weekly review completeness | `week-completion.test.ts`; `06-weekly-review.spec.ts` |
| SC-010 History retrieval ≤30 s | `07-history.spec.ts`; `indexeddb-planning-repository.seeded-scale.test.ts` (52-week indexed fixture, no unbounded scans) — **no measured human time** |
| SC-011 data survives reload | `device-local-persistence.spec.ts`; `indexeddb-planning-repository.failures.test.ts` |
| SC-012 responsive parity | `responsive-accessibility.spec.ts`; `e2e/visual/responsive.visual.spec.ts` |
| SC-013 no serious accessibility violations | `responsive-accessibility.spec.ts` (axe serious/critical) — **automated scan only** |
| SC-014 no punitive or praising copy | `content-review.md` T111 addendum; `AppShell.test.tsx` |
| SC-015 no prohibited scope | `architecture-review.md` T114 addendum (zero matches for backend/account/sync/PWA/telemetry) |

## Explicitly not evidenced

T107 and T108 were removed from `tasks.md` by product-owner decision on
2026-08-17 because they require physical devices with assistive technology and a
human participant, neither of which is available for this delivery. As a direct
consequence:

- **No real-device or screen-reader verification exists.** Substitutes in force:
  keyboard journeys in Chromium at 1440, touch journeys in WebKit at 820 and 390,
  reflow and overflow checks across 360–1920, targeted axe serious/critical scans,
  reduced-motion and non-color status assertions.
- **No measured human timing exists** for SC-001, SC-002, SC-003, or SC-010. Those
  rows are covered functionally but their time bounds are unverified.

The 52-week seeded fixture (`tests/fixtures/personal-history.ts`,
`e2e/fixtures/personal-history.ts`) backs the indexed-read evidence for FR-050 and
SC-010 without asserting a latency SLO, per the specification's own constraint.

## Result

Every extant requirement FR-001–FR-013, FR-015, FR-015a, FR-016–FR-059 and every
criterion SC-001–SC-015 maps to at least one passing automated check, with the two
timing and assistive-technology limitations above stated rather than inferred. No
row is missing or failing, so no work returns to an owning task.
