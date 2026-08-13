# Contract: Domain Queries and Commands

**Scope**: In-process TypeScript contracts. ORBIT MVP has no HTTP API.

Features/pages call explicit planning queries and commands. React never mutates
records, derives lifecycle rules, or calculates score/load policy.

## 1. Result contract

```text
CommandResult<T> =
  | { ok: true; value: T; affectedDates: LocalDate[]; affectedWeeks: LocalDate[] }
  | { ok: false; error: DomainOrStorageError }
```

| Code | Meaning | Required handling |
|---|---|---|
| `ValidationFailure` | Field/date/domain input is invalid | Keep draft and identify fields neutrally |
| `NotFound` | Referenced record no longer exists | Reload owning projection |
| `PeriodImmutable` | Governing day/week is finalized | Show immutable status; never retry silently |
| `InvalidTransition` | Current state cannot accept command | Reload and explain current state |
| `TaskMustBeIncompleteToMove` | Movement was requested while checked completed | Preserve intent and require unchecking first |
| `MoveTargetClosed` | Selected destination is no longer open | Preserve draft and request another destination |
| `FutureDayClosure` | `closeDay.date > currentLocalDate` | Keep day open and explain eligibility |
| `PendingHabitOutcomes` | Early closure still has pending habits | Require explicit outcomes |
| `ClosureDispositionMismatch` | Disposition map is missing/stale/duplicated | Reload closure review |
| `WeekNotClosable` | One or more of seven days remains open | Identify open dates |
| `RevisionConflict` | Aggregate changed after load | Reload; never overwrite blindly |
| `StorageUnavailable` | IndexedDB cannot be used | Preserve UI draft where possible; retry explicitly |
| `QuotaExceeded` | Browser refused additional storage | Report that nothing committed |
| `UpgradeBlocked` | Another connection blocks upgrade | Ask user to close/reload the other tab |
| `UnexpectedStorageFailure` | Unclassified database failure | Report failure; never claim success |

Russian user copy is factual and neutral. Planned load never produces a
configurable capacity comparison, hidden load/capacity/overload threshold,
automatic overload classification, or proactive warning.

## 2. Query contract

For an open Day/Week period or any History mode containing open dates, the page
service first runs idempotent internal preparation for only those open dates and
then reads the projection.
Preparation materializes missing occurrences and catches up expired habits. The
same bounded command runs on startup, visibility resume, local-date rollover, and
inside `closeDay`; page preparation is not a correctness dependency.

| Query | Input | Output |
|---|---|---|
| `getWeekView` | any `date` or canonical Monday `weekStart` | Unique fixed Monday–Sunday `WeekView` with ordered goals, seven days, outcomes, loads, state, daily scores, weekly-progress preview/final, reflection lifecycle |
| `getDayView` | `date` | `DayView` with dated-order tasks, habits, state, load, score, unfinished set, and closure eligibility |
| `getBacklogView` | none | Active undated tasks ordered by `createdSequence` oldest first, ID tie-break |
| `getHistoryView` | discriminated `HistoryQuery` below | Read-only mode-specific projection of all specified historical facts |
| `getTaskHistory` | `occurrenceId` | Memberships and audit events ordered by persisted sequence |

```text
HistoryQuery =
  | { mode: 'day'; anchorDate }
  | { mode: 'week'; anchorDate }
  | { mode: 'month'; anchorDate; selectedDate }
```

- Day derives exactly `anchorDate`.
- Week derives the fixed Monday–Sunday range containing `anchorDate`.
- Month derives the first through last date of `anchorDate`'s calendar month and
  requires `selectedDate` to belong to that month.
- First-entry and previous/next state belong to the page contract: current-date
  Month default and exact one-day/one-week/one-month steps.
- Queries use indexes and never expose an arbitrary `{from,to}` or unbounded scan.
- History is read-only and includes dated tasks, recurrence, habits and their
  outcome events, state, daily score, weekly progress, load, and reflection.
  It exposes no workout history or editing.
- Month returns calendar cells and selected-day facts. Page orchestration may
  issue only the additional bounded period queries needed for approved Dynamics:
  the last eight weeks in Week mode and the last six months in Month mode. Day
  has no Dynamics. Each point contains only task completion rate, habit completion
  rate, and the shared 70/30 score; it introduces no arbitrary range query,
  workout/state analytics, correlations, generated insights, or other metric.

## 3. Planning commands

### Internal open-period preparation

`prepareOpenPeriod(derivedRange)` is bounded and idempotent. It:

- materializes missing applicable task/habit occurrences for open dates;
- assigns each new occurrence an immutable creation sequence;
- emits no TaskEvent for automatic materialization;
- removes an unmodified, unfinalized future generated occurrence together with
  its unfinalized membership when a changed rule makes it inapplicable;
- preserves user-deleted tombstones and per-occurrence exceptions;
- appends one `date-boundary/not-completed` habit event when an applicable
  pending occurrence has `date < currentLocalDate`;
- increments affected day/week revisions.

No `suppressed` product outcome is stored or returned.

### Fixed week and weekly goals

- `ensureCalendarWeek({ date })` derives its Monday and idempotently ensures the
  fixed seven-day records. It accepts no name, range, or vacancy list.
- `addWeeklyGoal({ weekStart, statement, expectedRevision })`
- `editWeeklyGoal({ weekStart, goalId, statement, expectedRevision })`
- `reorderWeeklyGoals({ weekStart, orderedGoalIds, expectedRevision })`
- `deleteWeeklyGoal({ weekStart, goalId, expectedRevision })`

Goal statements are boundary-trimmed before persistence, must contain at least
one non-whitespace character, and otherwise preserve internal whitespace and
content. The same rule applies to create and edit. There is no
measurability/target/unit validation and no numeric progress field. Completed
weeks reject all goal commands.

### One-off and occurrence task commands

- `createTask({ title, notes?, placement, durationMinutes?, dayPosition? })`
- `editTaskOccurrence({ occurrenceId, title?, notes?, durationMinutes?, expectedRevision })`
- `setTaskCompletion({ occurrenceId, date, completed: boolean, expectedRevision })`
- `moveTaskToDate({ occurrenceId, destinationDate, durationMinutes, dayPosition, expectedRevision })`
- `moveTaskToBacklog({ occurrenceId, expectedRevision })`
- `deleteTaskOccurrence({ occurrenceId, expectedRevision })`
- `reorderDatedTasks({ date, orderedOccurrenceIds, expectedDayRevision })`

Rules:

- A committed dated placement requires a positive integer duration and creates
  or reuses exactly one `[occurrenceId,date]` membership. Unsaved input and direct
  backlog placement create none.
- Backlog assigns no position and exposes edit/delete/schedule only. Its order is
  immutable creation sequence; no reorder/sort command exists.
- Checking/unchecking is accepted only for a dated task in an open day/week and
  appends the corresponding event. Completed tasks remain editable/deletable.
- Every movement is explicit and requires the current task to be incomplete.
  A dated destination must be open and differ from the current source date;
  backlog is undated and has no period check. Source membership/date and the
  movement event remain.
- A→B→A reuses A's still-open membership; events retain both moves and no
  denominator is inflated.
- Ordinary cancellation has no command. Cancellation is a Close Day disposition.
- Permanent deletion is one transaction: find all memberships for the logical
  occurrence; change/exclude every one whose day remains open; leave every
  closed-day membership/frozen score unchanged; tombstone the occurrence; append
  the deletion event; bump every affected open day/week.
- Dated task reorder uses simple integer order. A newly materialized recurring
  task receives the next final position on its date, leaving all existing
  positions unchanged and introducing no implicit source/time/priority sort.

### Recurring tasks and habits

- `createTaskSeries({ template, recurrenceRule })`
- `updateTaskSeriesRule({ seriesId, recurrenceRule, expectedRevision })`
- `stopTaskSeries({ seriesId, expectedRevision })`
- `createHabitDefinition({ title, recurrenceRule })`
- `updateHabitRule({ definitionId, recurrenceRule, expectedRevision })`
- `stopHabitDefinition({ definitionId, expectedRevision })`
- occurrence-only task/habit edit/delete commands preserve sibling occurrences.

The application derives `effectiveFrom = currentLocalDate + 1`; callers cannot
choose it. A matching inclusive end date produces an occurrence. Same-day edits
coalesce into the final pending next-date version. Past/current-day occurrences
and explicit future exceptions are preserved; only unmodified future rows are
reconciled. User-deleted tombstones prevent regeneration.

### Habit outcomes

- `recordHabitOutcome({ occurrenceId, outcome: completed | not-completed, expectedRevision })`
  records the initial explicit outcome for a pending occurrence in an open day
  and appends a `user` event.
- `correctBoundaryMissToCompleted({ occurrenceId, expectedRevision })` accepts a
  current `not-completed` whose latest cause is `date-boundary` while its day is
  open, appends `user-correction/completed`, and refreshes live scores.
- `deleteHabitOccurrence({ occurrenceId, expectedRevision })` writes a permanent
  user tombstone and excludes it from the habit denominator while open.

`completed` is never automatic, the specified user actions remain auditable, and
closure never invents an expired result.

### Daily state

`saveDailyState({ date, energy?, mood?, sleepDurationMinutes?, expectedDayRevision })`
accepts only an open day. Energy/mood are integers 1–5 and sleep is a
non-negative integer duration. State never enters a score/load API.

## 4. Score and load policy

```text
calculateCompletionScore({
  task:  { completed, applicable },
  habit: { completed, applicable }
}) -> ScoreBreakdown
```

| Applicable categories | Calculation |
|---|---|
| tasks + habits | `roundHalfUp(taskRate * 70 + habitRate * 30)` |
| tasks only | `roundHalfUp(taskRate * 100)` |
| habits only | `roundHalfUp(habitRate * 100)` |
| neither | unavailable |

Task membership outcomes `planned`, `moved`, `backlogged`, `canceled`, and
`kept-unfinished` count only in the denominator; `completed` counts in both;
`deleted` counts in neither. Habit `pending`/`not-completed` counts only in the
denominator, `completed` in both, and `deleted` in neither.

The shared scoring/calculation policy aggregates integer counts, applies weights
once, then rounds the final non-negative value with `floor(raw + 0.5)`. The Daily
Score uses current/frozen daily counts; Weekly Progress sums the seven frozen
count pairs and never averages daily percentages. Goals and daily state are
excluded. Each permitted History Dynamics point applies this same count-based
policy for its bounded period and never averages displayed percentages.

`calculatePlannedLoad` sums positive durations of non-deleted tasks currently
placed on the open day. Closure captures it before dispositions. No configurable
capacity, hidden load/capacity/overload threshold, automatic overload
classification, or proactive warning API exists.

## 5. Atomic day closure

```text
closeDay({
  date,
  expectedDayRevision,
  dispositions: Record<TaskOccurrenceId,
    | { kind: 'keep-unfinished' }
    | { kind: 'move-to-date'; destinationDate; durationMinutes; dayPosition }
    | { kind: 'move-to-backlog' }
    | { kind: 'cancel' }
  >
})
```

Inside one write transaction:

1. Require the source day/week open, revisions current, and
   `date <= injectedCurrentLocalDate`; otherwise reject future closure.
2. Do not inspect older days as a prerequisite—eligible days close independently.
3. Materialize the closing date and reconcile expired pending habits.
4. Reject any remaining applicable pending habit.
5. Require the exact current unfinished-task set as disposition keys.
6. Require one choice per task with no default.
7. Recheck every selected destination is open and differs from `date`.
8. Capture factual planned load before dispositions.
9. Finalize each source membership; keep/cancel are incomplete, moves continue
   the same logical occurrence at destination/backlog.
10. Calculate/store final counts, rates, rounded score, load snapshot, and
    closure instant; append events; mark the day closed.
11. Return success only after `tx.done`.

Any failure aborts every source/destination/audit/snapshot write.

## 6. Atomic week completion

```text
completeWeek({ weekStart, reflection?, expectedWeekRevision })
```

One transaction verifies the unique fixed week and all seven owned days are
closed, sums their frozen task/habit counts, calculates weekly progress with the
shared policy, stores the reflection plus final breakdown/counts/rates and
completion instant, and marks the week immutable. No command can reopen it.

All instants and current-date decisions come from the injected application clock;
public commands do not accept caller-selected historical timestamps.
