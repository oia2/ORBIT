# Data Model: ORBIT Personal Planning Loop

**Feature**: `001-personal-planning-loop`  
**Source of behavior**: `spec.md`

The model separates a task's current placement from its unique historical
membership on each committed date. Open memberships may still change under the
approved completion, return, and deletion rules; day closure freezes them.

## 1. Shared value types

| Type | Representation | Rules |
|---|---|---|
| `LocalDate` | `YYYY-MM-DD` string | Valid local calendar date; never serialized from a local-midnight `Date` |
| `Instant` | UTC ISO timestamp | Wall-clock context; not a total-order key |
| `EntityId` | UUID string | Generated with `crypto.randomUUID()` |
| `EventSequence` | positive auto-increment integer | Authoritative total order for task events |
| `CreationSequence` | positive integer | Immutable task-creation order assigned transactionally by the adapter; backlog sorts ascending |
| `DurationMinutes` | positive integer | Required for dated tasks; may be absent in backlog |
| `Revision` | non-negative integer | Aggregate concurrency guard |
| `DayPosition` | non-negative integer | Explicit order within one dated task list; renumbered on reorder |

Weekly-goal order is the order of its embedded array. Backlog has no position
field, sort preference, or reorder state.

All persistence records are plain serializable values, never class instances,
React state, `Date`, or IndexedDB handles.

## 2. Relationship overview

```text
Week (fixed Monday–Sunday) ── contains ──> Day
  │                                      │
  ├── embeds ordered WeeklyGoal[]        ├── embeds DailyStateEntry
  └── final WeekCompletionSnapshot       └── final DayClosureSnapshot

TaskSeries ── generates ──> TaskOccurrence ── has ──> TaskPlanEntry
                                      │                 │
                                      └──── TaskEvent ──┘

HabitDefinition ── generates ──> HabitOccurrence
                                      └── embeds HabitOutcomeEvent[]
```

A `TaskOccurrence` has at most one current placement and at most one
`TaskPlanEntry` for each date. Movement never changes a membership's date.
Returning to a still-open date reuses its existing membership.

## 3. Core records

### Week

| Field | Meaning |
|---|---|
| `startDate` | Natural identity: Monday of the fixed local calendar week |
| `goals` | Embedded ordered `WeeklyGoal[]` |
| `status` | `open` or `completed` |
| `reflection` | Optional review text recorded before completion |
| `completionSnapshot` | Present only after explicit completion |
| `completedAt` | Authoritative completion instant |
| `revision` | Concurrency guard |

Every date maps algorithmically to one Monday key. Ensuring a missing week record
is idempotent; the product never creates arbitrary, duplicate, or overlapping
week ranges.

`WeeklyGoal` contains `id`, a canonical free-form `statement`, and audit
timestamps. Before persistence, leading and trailing whitespace is trimmed and a
whitespace-only value is rejected; internal whitespace and content is otherwise
preserved. Array order is user-controlled. There is no measurability classifier,
target/unit schema, numeric progress, or score contribution.

### Day

| Field | Meaning |
|---|---|
| `date` | Natural identity |
| `weekStart` | Derived owning Monday |
| `status` | `open` or `closed` |
| `state` | Optional `DailyStateEntry` |
| `closureSnapshot` | Present only after explicit closure |
| `closedAt` | Authoritative closure instant |
| `revision` | Concurrency guard |

`DailyStateEntry` contains optional `energy` and `mood` values on the five-point
ordinal scale, optional non-negative integer `sleepDurationMinutes`, and
`updatedAt`. State is contextual and never enters a score or load calculation.

### RecurrenceRule and versions

| Field | Meaning |
|---|---|
| `startDate` | First eligible date |
| `weekdays` | Non-empty set of applicable weekdays |
| `endDate` | Optional inclusive end date |

Validation rejects an end date earlier than the start. A matching end date
produces an occurrence. `RecurrenceRuleVersion` contains `revision`,
`effectiveFrom`, optional `effectiveThrough`, and a rule snapshot or stopped
marker. Versions are ordered and non-overlapping. A change on local date `D`
starts at `D + 1`; repeated changes on `D` replace the still-pending `D + 1`
version so only the final configuration becomes effective.

### TaskSeries

| Field | Meaning |
|---|---|
| `id` | Series identity |
| `template` | Current title, notes, and positive planned duration |
| `ruleVersions` | Effective recurrence-rule history |
| `revision` | Concurrency guard |

Active/stopped status is derived from the final rule version rather than stored
twice. Changing a series never rewrites past/current-day occurrences or future
occurrences with an explicit per-occurrence exception.

### TaskOccurrence

Represents a one-off task or one logical instance of a recurring task.

| Field | Meaning |
|---|---|
| `id` | Stable identity across movement |
| `seriesId` | Optional series identity |
| `nominalDate` | Recurrence date; absent for direct-backlog one-offs |
| `ruleRevision` | Optional generating rule version |
| `title`, `notes`, `plannedDurationMinutes` | Current occurrence values |
| `isException` | True after occurrence-only editing |
| `placement` | `{ kind: 'day', date }`, `{ kind: 'backlog' }`, or `{ kind: 'none' }` |
| `state` | `active`, `finalized`, or `deleted` |
| `completion` | Optional `incomplete` or `completed`; present only on an active dated placement |
| `actualCompletedAt` | Current completion instant when checked |
| `dayPosition` | Optional dated-list order; never used in backlog; generated insertion awaits the design gate |
| `createdSequence` | Immutable creation order used by backlog |
| `revision` | Command concurrency guard |

Checking/unchecking completion is allowed only while the dated day/week is open.
Completion does not block editing/deletion, but movement requires `incomplete`.
Backlog has no completion/cancel state. `finalized` means closure left no active
placement; cancellation is represented only by the immutable source plan entry
and closure event. `deleted` is a permanent user tombstone.

When rule reconciliation makes an unmodified future generated occurrence
inapplicable, the adapter atomically removes the occurrence and its unfinalized
membership. Automatic materialization emits no TaskEvent, so removal cannot leave
an orphan audit reference. A later applicable rule may materialize a new bundle.
User-deleted tombstones and rows with any explicit occurrence edit/outcome/move
(`isException`) are never removed by rule reconciliation.

### TaskPlanEntry

One scoring membership for one logical occurrence on one committed local date.

| Field | Meaning |
|---|---|
| `id` | Entry identity |
| `occurrenceId` | Logical task occurrence |
| `date`, `weekStart` | Immutable membership date and owning Monday |
| `plannedSnapshot` | Title, notes, and duration last current on this membership while open |
| `outcome` | `planned`, `completed`, `moved`, `backlogged`, `canceled`, `kept-unfinished`, or `deleted` |
| `destination` | Date or backlog for a movement outcome |
| `enteredAt` | First committed dated-placement instant |
| `finalizedAt` | Present only after day closure or permanent deletion |

Scoring classification:

- `completed`: numerator +1, denominator +1.
- `planned`, `moved`, `backlogged`, `canceled`, `kept-unfinished`: numerator 0,
  denominator +1.
- `deleted`: numerator 0, denominator 0.

Movement does not finalize the source while its day remains open. Returning
reuses `[occurrenceId, date]`, clears its movement destination, and makes it the
current planned membership again; it may then complete. Other visited dates
remain incomplete. Closure freezes every retained membership for the day.

Permanent task deletion scans all memberships for the occurrence, changes every
membership whose day is still open to `deleted`, and leaves every closed-day
entry untouched. It then tombstones the occurrence and appends one deletion
event in the same transaction.

### TaskEvent

Append-only explanatory event with:

- `id`, `sequence`, `occurrenceId`, optional `seriesId`/`planEntryId`;
- `type`: create, edit, completion-checked,
  completion-unchecked, move-to-date, move-to-backlog, schedule-from-backlog,
  delete, recurrence change, occurrence exception, closure keep, closure move,
  or closure cancel;
- minimal before/after/destination payload, `effectiveDate`, and `occurredAt`.

`sequence`, not timestamp or UUID, is the authoritative order. Events explain
history but are not full event sourcing and never add scoring memberships.

### HabitDefinition

| Field | Meaning |
|---|---|
| `id` | Definition identity |
| `title` | User-visible behavior name |
| `ruleVersions` | Effective recurrence-rule history |
| `revision` | Concurrency guard |

Active/stopped status is derived from the last rule version.

### HabitOccurrence

| Field | Meaning |
|---|---|
| `id` | Occurrence identity |
| `definitionId` | Owning definition |
| `date`, `weekStart` | Applicable date and owning week |
| `definitionSnapshot`, `ruleRevision` | Historical generation context |
| `isException` | Occurrence-only edit marker |
| `outcome` | `pending`, `completed`, `not-completed`, or `deleted` |
| `outcomeEvents` | Ordered embedded `HabitOutcomeEvent[]` |
| `updatedAt` | Last permitted open-period change |

`HabitOutcomeEvent` contains an ordinal, `occurredAt`, resulting outcome, and
source: `user`, `date-boundary`, or `user-correction`. Boundary catch-up appends
one `date-boundary/not-completed` event idempotently. While the day remains open,
the required correction appends `user-correction/completed`, updates the live
score, and retains both events. The initial explicit action moves `pending` to
completed or not-completed; the specified automatic-miss correction moves that
boundary-caused result to completed. Closure freezes the final outcome and event
array. User deletion is a permanent denominator-excluded
tombstone; unmodified future rows removed by rule reconciliation are not user
deletions.

## 4. Immutable summaries

### ScoreBreakdown

```text
task:  { completed, applicable, rate | unavailable }
habit: { completed, applicable, rate | unavailable }
value: integer percentage | unavailable
weightsApplied: normalized task/habit weights
```

The shared scoring/calculation policy builds the Daily Score and Weekly Progress
breakdowns:

1. A zero-applicable category is absent, not a zero rate.
2. Both present: `taskRate * 0.70 + habitRate * 0.30`.
3. Only one present: normalize it to 100%.
4. Neither present: unavailable.
5. Round the final raw percentage once; exact `.5` ties go upward.

### DayClosureSnapshot

| Field | Meaning |
|---|---|
| `score` | Final `ScoreBreakdown` including contributing counts/rates |
| `plannedLoadMinutes` | Sum immediately before closure dispositions |

`Day.closedAt`, immutable plan entries/events, habit occurrences/events, and
daily state provide the remaining review facts without duplicating a whole day.

### WeekCompletionSnapshot

| Field | Meaning |
|---|---|
| `progress` | Weekly Progress breakdown from summed frozen daily task/habit counts |

The calculation never averages daily percentages. `Week.completedAt`, its
reflection, and seven immutable days provide the other review facts.

## 5. State transitions

### Task

```text
direct backlog active -- schedule --> dated active/incomplete + first membership
dated active/incomplete -- check --> dated active/completed
dated active/completed -- uncheck --> dated active/incomplete
dated active/completed -- edit/delete --> allowed while day open
dated active/completed -- move --> rejected until unchecked
dated active/incomplete -- move date/backlog --> source incomplete + new placement
any active open placement -- delete --> occurrence tombstone + all open memberships excluded
closed-day/completed-week state -- any mutation --> rejected
```

Close Day handles unfinished-task keep, move, backlog, or cancel. Keep/cancel
finalizes the source incomplete and leaves no active placement; move continues
the same logical occurrence at its destination. No ordinary cancel or restore
transition exists.

### Day

```text
open + date <= currentLocalDate
  -- closeDay(valid full disposition map and no pending habit) --> closed
future open day -- closeDay --> rejected
closed -- any mutation/reopen --> rejected
```

Eligible days close independently; an older open day is not a prerequisite.

### Week

```text
open -- completeWeek(all 7 owned days closed, optional reflection) --> completed
completed -- any mutation/reopen --> rejected
```

### Habit occurrence

```text
pending -- explicit user --> completed | not-completed
pending after local-date boundary -- catch-up --> not-completed
automatic not-completed + open day -- explicit correction --> completed
open occurrence -- explicit delete --> deleted
closed occurrence -- any mutation --> rejected
```

## 6. Derived projections

- `DayView`: lifecycle, ordered task memberships/current placement, applicable
  habits, state, score breakdown, current/frozen load, and closure eligibility.
- `WeekView`: ordered goals, seven day summaries, outcomes, daily scores/loads,
  state context, mandatory weekly progress/counts/rates, and reflection lifecycle.
- `BacklogView`: active undated tasks ordered by `createdSequence`, oldest first,
  with edit/delete/schedule capabilities only.
- `HistoryDayView`: one anchored date and its specified read-only facts.
- `HistoryWeekView`: one anchored fixed Monday–Sunday period and its facts.
- `HistoryMonthView`: one calendar month, its calendar, selected-day details,
  weekly progress/reflections where applicable, and a Dynamics presentation whose
  exact visual content remains gated on fresh approved design evidence.

History exposes no editing or workout layers/tabs/data. Mode switching and
short-month selected-date behavior are presentation decisions blocked on the
successful design reconciliation; no extra stored entity is introduced for them.

## 7. IndexedDB persistence shape

| Store | Key | Required indexes |
|---|---|---|
| `weeks` | `startDate` | none |
| `days` | `date` | `by-weekStart` |
| `taskSeries` | `id` | none |
| `taskOccurrences` | `id` | unique `by-series-date`; unique `by-created-sequence`; `by-placement-created` on `[placementKey, createdSequence]` |
| `taskPlanEntries` | `id` | unique `by-occurrence-date`; `by-date`; `by-weekStart` |
| `taskEvents` | `sequence` auto-increment | unique `by-id`; `by-occurrence-sequence`; `by-series-sequence`; `by-effective-date-sequence` |
| `habitDefinitions` | `id` | none |
| `habitOccurrences` | `id` | unique `by-definition-date`; `by-date`; `by-weekStart` |

Weekly goals/completion stay embedded in `weeks`; daily state/closure stay in
`days`; habit outcome history stays with its occurrence. No generic meta,
history, snapshot, or habit-event store is needed in version 1.

## 8. Cross-record invariants

- A week key is Monday and owns exactly the following seven dates through Sunday.
- A dated active task has a positive duration and exactly one current membership
  for that placement. Explicitly organized tasks have an integer day position;
  generated-occurrence insertion position awaits the approved design gate.
- A direct-backlog task has no membership, duration requirement, completion
  state, or manual position; backlog order is immutable creation order.
- One occurrence has at most one membership per date and one current placement.
- Automatic materialization creates no TaskEvent. Removing an unmodified future
  generated task removes its unfinalized occurrence/membership bundle atomically.
- A move changes no membership date; a return reuses the unique open membership.
- Checking/unchecking, current state, and its audit event commit together.
- Permanent deletion excludes all and only still-open memberships for the logical
  occurrence, leaves closed memberships unchanged, and bumps each affected open
  day/week in one transaction.
- A recurrence end date is inclusive. Changes on `D` begin on `D + 1`, same-day
  changes coalesce, and past/current-day plus explicit future exceptions remain.
- User-deleted occurrence tombstones cannot regenerate. Unmodified future rows
  made inapplicable by a rule change may be removed/re-materialized and never
  appear as a product outcome.
- Boundary habit misses and allowed corrections are both durable events; only
  explicit user action can produce completed.
- Day closure requires `date <= currentLocalDate`, exactly one disposition for
  every unfinished task, no same-date destination, and no pending habit.
- Closed days/completed weeks reject every mutation; eligible days need not close
  chronologically.
- Daily state never enters the Daily Score or planned load. Goals never enter the
  Daily Score or Weekly Progress.
- Planned load is duration-only and has no configurable capacity, hidden
  load/capacity/overload threshold, automatic overload classification, or
  proactive overload warning.
- The Daily Score and Weekly Progress use the shared scoring/calculation policy:
  equal memberships, 70/30 weights, missing-category normalization, unavailable
  behavior, and exact-half-ties-upward final rounding.
- Week completion requires exactly seven closed owned days and freezes weekly
  progress with its raw counts/rates.
- Product task/habit outcome types contain no `partial` or `suppressed` member.
