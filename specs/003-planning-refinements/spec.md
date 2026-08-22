# Feature Specification: ORBIT Planning Refinements

**Feature Branch**: `feat/planning-refinements`

**Created**: 2026-08-22

**Status**: Implemented and verified (2026-08-22)

**Input**: User description (translated from Russian):

> Project refinements:
> 1. A button on the week to expand all days at once
> 2. For a task, the ability to expand it or something similar, so that text can be written
> 3. Optionally add a time (duration) to a habit
> 4. Right now habits statically take 30%. That is, even on a full day, if it has one simple
>    habit, it does not reflect the real load. For simplicity, let everything have one weight.
> 6. Bug on closing: the day panel shows 0 out of however many tasks.
> 7. Saved state disappeared, possibly after the day ended, or after closing the browser.
> 8. Make it possible to open a day.
> 9. Bug with dynamics on the History page: it does not show dynamics if an empty day is open.
>
> Follow-up: "It is also important that the data in the database is preserved."

## Context and Relationship to Features 001 and 002

`001-personal-planning-loop` remains the source of truth for ORBIT product behavior and
domain semantics. `002-server-backed-persistence` moved storage and authoritative mutations
to the server database and changed nothing else.

This feature is the first one that **changes product behavior** since 001. It does four
things:

1. Fixes three defects in behavior that 001 already specifies (closed-day score panel,
   persistence of saved state, History dynamics).
2. Changes the day and week scoring policy from the fixed 70/30 task/habit split to a
   single uniform per-item weight.
3. Adds three capabilities that 001 does not cover (task notes, optional habit duration,
   expand-all on the week planner).
4. Makes a closed day reversible, which 001 deliberately did not allow.

Requirements of 001 that this specification supersedes are listed in
[Superseded Requirements](#superseded-requirements) below.

The user's follow-up constraint is binding on all of the above: **existing data in the
production database MUST survive this change.** No requirement here may be satisfied by
recreating, resetting, or discarding the database.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saved work is never lost (Priority: P1)

As the single ORBIT user, everything I record — tasks, habits, outcomes, weekly goals,
daily state, notes — stays exactly as I left it when I close the browser, come back the
next day after the date has rolled over, or the application is restarted or redeployed.

**Why this priority**: The user reports that saved state disappeared. Nothing else in this
feature has value on top of a store the user cannot trust. This is the foundation.

**Independent Test**: Record data across a day and a week, close the browser, advance past
the local date boundary, restart the application, and reopen ORBIT. Every record is still
present and unchanged.

**Acceptance Scenarios**:

1. **Given** a day with recorded tasks, habit outcomes, and daily state, **When** the
   browser is closed and reopened, **Then** every record is shown exactly as it was.
2. **Given** an open day with recorded work, **When** the local date rolls over to the next
   day and the user returns, **Then** the previous day's records are still present and the
   day is still open with its work intact.
3. **Given** a database containing existing ORBIT data, **When** the application is
   restarted or a new version is deployed, **Then** all pre-existing records remain
   readable and unchanged.
4. **Given** any write the user performs, **When** the write cannot be persisted, **Then**
   ORBIT reports the failure and never presents unsaved work as saved.

---

### User Story 2 - A closed day reports what actually happened (Priority: P1)

When I close a day, the day panel keeps showing the true counts — how many tasks I
completed out of how many applied, and the same for habits — instead of resetting to zero.

**Why this priority**: A closed day's snapshot is the permanent record. If it is wrong, the
whole History surface is wrong, and the scoring change in User Story 4 would only freeze a
wrong number more precisely.

**Independent Test**: Open a day, complete some tasks and habits, close the day, and
compare the panel before and after closing.

**Acceptance Scenarios**:

1. **Given** an open day where 3 of 5 tasks are completed and the panel shows 3 of 5,
   **When** the day is closed with dispositions chosen for the 2 unfinished tasks,
   **Then** the closed-day panel shows the same completed count of 3, not 0.
2. **Given** an open day where all habits are marked completed, **When** the day is closed,
   **Then** the closed-day habit counts match what was shown while the day was open.
3. **Given** a closed day, **When** it is viewed on the Day page, the Week page, and the
   History page, **Then** all three show identical counts and an identical result.

---

### User Story 3 - A day can be reopened (Priority: P1)

When I close a day by mistake, or realise afterwards that I recorded something wrongly, I
can open that day again and correct it, then close it again.

**Why this priority**: Closing a day is currently irreversible, and the user has hit that
wall. Combined with User Story 2 it is what makes closing a day safe to do at all.

**Independent Test**: Close a day, reopen it, change a task outcome, and close it again.
The day's result reflects the correction.

**Acceptance Scenarios**:

1. **Given** a closed day, **When** the user reopens it, **Then** the day becomes editable
   again and its frozen score snapshot is replaced by a live result.
2. **Given** a reopened day, **When** the user changes outcomes and closes it again,
   **Then** the new closure snapshot reflects the corrected facts.
3. **Given** a reopened day, **When** the user views the week and History, **Then** both
   show the day as open and neither reports a stale closed result for it.
4. **Given** a closed day whose closure moved a task to another date, **When** the day is
   reopened, **Then** that task stays on its destination date and the user moves it back
   themselves if they want it here.
5. **Given** a closed day whose closure kept a task unfinished or cancelled it, **When** the
   day is reopened, **Then** that task is live on the day again and its completion can be
   corrected.
6. **Given** a closed day that belongs to a completed week, **When** the user looks for the
   reopen control, **Then** ORBIT states that the day cannot be reopened because its week is
   completed, instead of failing silently.

---

### User Story 4 - Every item counts the same (Priority: P2)

My day and week results are computed by counting all my items equally, so one habit on a
busy day no longer swings the result the way ten tasks do.

**Why this priority**: This is the change the user asked for explicitly, and it changes how
every result in the product reads. It depends on User Story 2 being fixed first so the
counts it aggregates are correct.

**Independent Test**: Build a day with 9 tasks and 1 habit, complete all tasks and miss the
habit, and confirm the day result is 90%, not 70%.

**Acceptance Scenarios**:

1. **Given** a day with 9 applicable tasks (all completed) and 1 applicable habit (not
   completed), **When** the day result is shown, **Then** it is 90%.
2. **Given** a day with 1 applicable task (completed) and 3 applicable habits (all missed),
   **When** the day result is shown, **Then** it is 25%.
3. **Given** a day with only tasks and no habits, **When** the day result is shown, **Then**
   it equals the task completion rate, as before.
4. **Given** a day with no applicable items at all, **When** the day result is shown,
   **Then** it is reported as having no data, not as 0%.
5. **Given** any surface that explains how the result is computed, **When** it is read,
   **Then** it describes the single-weight rule and no longer mentions 70/30.

---

### User Story 5 - Tasks carry written detail (Priority: P2)

I can open a task's note from its row and read or write free text in a focused modal, so the
task title does not have to carry everything I need to remember.

**Why this priority**: A frequently needed capability that is independent of the scoring and
closure work, and does not block anything else.

**Independent Test**: Open a task's note from the action beside its completion checkbox,
write and save it, reload the page, and read the note back in the modal.

**Acceptance Scenarios**:

1. **Given** a task on an open day, **When** the user activates the note action beside its
   completion control, **Then** a modal with an editable free text area is shown, empty for a
   task that has no note.
2. **Given** a task with a note, **When** the user edits and saves the note, **Then** the
   note is persisted and is shown again after a reload.
3. **Given** a task with a note, **When** its row is shown, **Then** the note action visually
   indicates that the task carries a note.
4. **Given** a task on a closed day or in History, **When** the user opens its note, **Then**
   the modal shows the note as readable but not editable.
5. **Given** a task on the Day page, the Week planner, the Backlog, and History, **When**
   the same task's note is opened on any of them, **Then** the same note text is shown.

---

### User Story 6 - Habits can carry a duration (Priority: P2)

I can optionally give a habit a duration, so a 45-minute workout contributes to my day's
planned load the same way a task of the same length does.

**Why this priority**: Independent of the scoring rule, and the reason the user gave for
wanting it — that the day's load should reflect reality — only holds once it is included in
planned load.

**Independent Test**: Give a habit a 45-minute duration and confirm the day's planned load
grows by 45 minutes.

**Acceptance Scenarios**:

1. **Given** a habit being created or edited, **When** the user sets a duration, **Then**
   the duration is optional and can be left empty.
2. **Given** a habit with a duration, **When** the day's planned load is shown, **Then** the
   habit's duration is included in it alongside task durations.
3. **Given** a habit with no duration, **When** the day's planned load is shown, **Then** the
   load is exactly what it was before this feature.
4. **Given** a habit with a duration, **When** the habit is shown on the Day page, the Week
   planner, and History, **Then** the duration is displayed the same way a task duration is.
5. **Given** a habit's duration is changed, **When** already-closed days that contained that
   habit are viewed, **Then** their frozen planned load is unchanged.

---

### User Story 7 - History dynamics always reflects the period (Priority: P2)

The dynamics chart on the History page shows the trend for the periods I am looking at,
regardless of which individual day happens to be selected inside them.

**Why this priority**: A visible defect that makes an existing surface look broken, but the
underlying data is already correct — only the projection is wrong.

**Independent Test**: In month mode, select an empty day inside a month that contains
recorded work. The chart still shows that month's data.

**Acceptance Scenarios**:

1. **Given** month mode with a month containing recorded work, **When** an empty day inside
   that month is selected, **Then** the chart still shows the month's aggregated values.
2. **Given** month mode, **When** the chart is read, **Then** each point represents one
   whole month's aggregated result, not one selected day's result.
3. **Given** week mode, **When** the chart is read, **Then** each point represents one whole
   week's aggregated result.
4. **Given** a period in the chart that genuinely contains no applicable items, **When** the
   chart is read, **Then** that point is shown as having no data while the other points are
   still drawn.
5. **Given** the chart legend, **When** it is read, **Then** it describes the single-weight
   result and no longer says 70/30.

---

### User Story 8 - Expand the whole week at once (Priority: P3)

I can expand every day of the week planner with one control instead of opening seven days
one at a time.

**Why this priority**: A convenience improvement with no dependencies and the smallest
scope in this feature.

**Independent Test**: Activate the control on the week planner and confirm all seven days
expand; activate it again and confirm they collapse.

**Acceptance Scenarios**:

1. **Given** the week planner with some days collapsed, **When** the user activates the
   expand-all control, **Then** all seven days are expanded.
2. **Given** the week planner with all days expanded, **When** the user activates the
   control, **Then** all seven days are collapsed.
3. **Given** days expanded through the control, **When** the user collapses one day
   individually, **Then** only that day collapses and the others stay expanded.

---

### Edge Cases

- **Reopening a day inside a completed week.** Refused, with the reason stated (FR-014).
  Reopening a completed week is out of scope for this feature.
- **Reopening a day whose closure moved tasks to another day.** The moved tasks stay on
  their destination day, whether that day is still open or already closed (FR-012). The
  reopened day keeps them in its own counts as not completed (FR-007), so no task is left
  without a placement and none gets two.
- **A task cancelled at closure, on a day that is then reopened.** It becomes live on the
  reopened day again (FR-013) and can be completed or cancelled again at the next closure.
- **Repeated closing and reopening of the same day.** Each closure must produce a snapshot
  consistent with the facts at that moment, and the audit trail must record every closure
  and every reopening.
- **A day with no applicable items at all.** It reports "no data" both while open and once
  closed, and must not be counted as a 0% day in weekly progress or in History dynamics.
- **A habit whose duration is set after days containing it were already closed.** The frozen
  planned load on those days does not change.
- **A habit duration long enough to make the day's planned load exceed 24 hours.** ORBIT
  reports load factually and applies no capacity limit, so this is displayed, not blocked.
- **A very long task note.** The note is stored and displayed in full without breaking the
  layout of the surrounding list.
- **A note on a recurring task.** The note belongs to the individual occurrence, not to the
  whole series.
- **The date boundary passing while the browser tab is open.** Existing records stay intact
  and the open day is not silently discarded.

## Requirements *(mandatory)*

### Functional Requirements

#### Persistence and data preservation

- **FR-001**: All user-recorded ORBIT data MUST remain intact and unchanged across browser
  close and reopen, across the local date boundary, and across application restart and
  redeployment.
- **FR-002**: This feature MUST preserve all data already present in an existing ORBIT
  database. No part of it may be delivered in a form that requires the database to be reset,
  recreated, or emptied.
- **FR-003**: Records created before this feature MUST remain readable and usable
  afterwards, including days and weeks that are already closed or completed.
- **FR-004**: When a write cannot be persisted, ORBIT MUST report the failure to the user
  and MUST NOT present the unsaved work as saved. (Carried forward from 002 FR-011.)
- **FR-005**: ORBIT MUST NOT delete, reset, or overwrite existing user records as a side
  effect of opening, viewing, or preparing a period.

#### Closed-day facts

- **FR-006**: A closed day's recorded completed counts MUST equal the completed counts that
  were true for that day at the moment it was closed. Completed tasks MUST NOT be recorded
  or displayed as zero.
- **FR-007**: A closed day's recorded applicable counts MUST be derived from the same rule
  as the live counts for an open day, with the closure dispositions applied. A task that was
  moved to another date, sent to the backlog, or cancelled at closure MUST still count as an
  applicable item of that day and MUST count as not completed: it was planned for that day
  and was not done there. A day with 5 tasks of which 3 were completed and 2 were moved
  therefore records 3 of 5.
- **FR-008**: The Day page, the Week page, and the History page MUST show identical counts
  and an identical result for the same closed day.

#### Reopening a day

- **FR-009**: Users MUST be able to reopen a closed day and edit it again.
- **FR-010**: Reopening a day MUST discard that day's frozen score snapshot so the day's
  result is computed live again, and MUST be reflected immediately on the Day page, the
  Week page, and the History page.
- **FR-011**: Reopening a day MUST be recorded in the audit trail, as day closure already
  is, so the sequence of closures and reopenings for a day is recoverable.
- **FR-012**: Reopening a day MUST NOT undo the task dispositions that closure applied. A
  task that closure moved to another date or sent to the backlog MUST stay where closure put
  it; if the user wants it back on the reopened day, they move it back themselves.
- **FR-013**: Reopening a day MUST make that day editable again for every item that still
  belongs to it. Tasks whose closure disposition left them with no other placement — kept
  unfinished, cancelled, or completed — MUST be live on the reopened day again, so their
  completion can be corrected. Habit outcomes on the day MUST be editable again.
- **FR-014**: A day whose week is already completed MUST NOT be reopened. ORBIT MUST state
  this reason to the user rather than failing silently or leaving the control apparently
  available. The same applies to any other case in which reopening is refused.
- **FR-015**: Reopening a day MUST NOT alter any other day's records, including a day that
  received a task moved out of the reopened day at closure.

#### Single-weight result

- **FR-016**: The day result MUST be the number of completed applicable items on that day
  divided by the total number of applicable items on that day, expressed as a percentage,
  where each task and each habit counts as exactly one item of equal weight.
- **FR-017**: Weekly progress MUST be computed by the same single-weight rule aggregated
  across the week's days.
- **FR-018**: When a day or week has no applicable items, its result MUST be reported as
  having no data, distinct from a result of 0%.
- **FR-019**: The separate task and habit breakdowns ("N of M tasks", "N of M habits") MUST
  remain visible; only the weighting used to combine them changes.
- **FR-020**: Every explanatory text, label, and legend that states the 70/30 split MUST be
  updated to describe the single-weight rule.
- **FR-021**: Every already-frozen closed-day and completed-week snapshot MUST be recomputed
  once under the single-weight rule, so the whole history reads on one consistent scale. The
  recomputation MUST derive the new percentage from the counts each snapshot already holds;
  it MUST NOT change any recorded count, any planned load, any closure disposition, or any
  audit record, and it MUST NOT reopen any period.
- **FR-022**: The recomputation in FR-021 MUST be applied to existing production data
  without loss, as part of the same data-preserving upgrade required by FR-002.

#### Task notes

- **FR-023**: Users MUST be able to open a task's free text note in a modal from a compact
  row action placed beside the completion control, and close the modal again.
- **FR-024**: Users MUST be able to write, edit, and clear a task's note while the task's day
  is open, and the note MUST be persisted.
- **FR-025**: A task note MUST be read-only wherever the task's period is immutable — a
  closed day, a completed week, and History.
- **FR-026**: A task row that carries a note MUST indicate that fact on its note action.
- **FR-027**: A task note MUST belong to the individual task occurrence, not to a recurring
  series, so editing one occurrence's note does not change another occurrence's note.
- **FR-028**: The same note MUST be shown for the same task on every surface that lists it.

#### Habit duration

- **FR-029**: Users MUST be able to set an optional duration on a habit, and to leave it
  unset or clear it.
- **FR-030**: A habit's duration MUST contribute to the planned load of each day on which
  that habit applies, in the same units and alongside task durations.
- **FR-031**: A habit with no duration MUST contribute nothing to planned load, leaving the
  reported load identical to its value before this feature.
- **FR-032**: A habit's duration MUST be displayed wherever the habit is listed, using the
  same presentation as a task's duration.
- **FR-033**: A habit's duration MUST NOT affect the result or the counts in any way; it
  affects planned load only.
- **FR-034**: Changing a habit's duration MUST NOT change the frozen planned load of any
  already-closed day.

#### History dynamics

- **FR-035**: In month mode, each point of the dynamics chart MUST represent the aggregated
  result of one whole month.
- **FR-036**: In week mode, each point of the dynamics chart MUST represent the aggregated
  result of one whole week.
- **FR-037**: The dynamics chart MUST NOT depend on which individual day is selected inside
  the displayed period.
- **FR-038**: A period that genuinely has no applicable items MUST be drawn as a no-data
  point without suppressing the rest of the chart.
- **FR-039**: The chart MUST be treated as empty only when every period in its range has no
  data.

#### Week planner expand-all

- **FR-040**: The week planner MUST provide a single control that expands all seven days at
  once and collapses them all again.
- **FR-041**: The control MUST indicate its current effect, so the user knows whether
  activating it will expand or collapse.
- **FR-042**: Individual day expansion MUST continue to work independently after the control
  has been used.

### Key Entities

- **Day**: A local calendar date owned by exactly one week. Gains the ability to return from
  a closed state to an open state, discarding its frozen closure snapshot.
- **Day closure snapshot**: The frozen result and planned load recorded when a day is
  closed. Its result is now computed under the single-weight rule, and it ceases to exist
  when the day is reopened.
- **Task occurrence**: A single dated or backlogged task. Gains a user-editable free text
  note that belongs to the occurrence.
- **Habit definition**: A recurring habit. Gains an optional duration.
- **Habit occurrence**: One habit on one date. Carries the duration in effect for that date
  and contributes it to the day's planned load.
- **Result (score)**: The completion percentage for a day or week, now the ratio of completed
  applicable items to all applicable items, with tasks and habits weighted equally.
- **Planned load**: The factual total duration planned for a date, now the sum of task
  durations and habit durations. It remains a fact with no capacity, threshold, or warning.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After closing the browser, crossing a date boundary, and restarting the
  application, 100% of previously recorded days, tasks, habits, outcomes, goals, daily
  states, and notes are still present and unchanged.
- **SC-002**: Upgrading an existing ORBIT installation to this version preserves 100% of the
  records that existed before the upgrade.
- **SC-003**: For every closed day, the completed and applicable counts shown after closing
  equal the counts shown immediately before closing, in 100% of closures.
- **SC-004**: A user who closes a day by mistake can reopen it, correct it, and close it
  again without losing any of that day's other records.
- **SC-005**: A day with 9 completed tasks and 1 missed habit reports 90%, and a day with 1
  completed task and 3 missed habits reports 25%.
- **SC-006**: No user-visible text anywhere in the product describes the result as a 70/30
  split after this feature ships.
- **SC-007**: A note written on a task is readable on every surface that lists that task,
  and survives a page reload.
- **SC-008**: Giving a habit a duration of N minutes increases the planned load of each day
  it applies to by exactly N minutes, and changes no result percentage.
- **SC-009**: With at least one period in range containing data, the History dynamics chart
  renders data for that period regardless of which day is selected, in 100% of cases.
- **SC-010**: Expanding all seven days of the week planner takes one interaction instead of
  seven.
- **SC-011**: After the upgrade, every closed day and completed week that already existed
  reports a result consistent with the single-weight rule and its own recorded counts, with
  those counts unchanged from before the upgrade.

## Superseded Requirements

| Existing requirement | Status under 003 |
| -------------------- | ---------------- |
| **001** — day and week result computed as tasks 70% / habits 30% | **Superseded** by FR-016 and FR-017. Each applicable item now carries equal weight, and FR-021 rescales the existing history to match. |
| **001** — a closed day is permanently immutable | **Superseded** by FR-009 through FR-015. A closed day can be reopened; while it remains closed it is still immutable, and a day inside a completed week stays immutable. |
| **001** — planned load is the sum of task durations | **Superseded** by FR-030. Habit durations, when set, are included. |

All other requirements of 001 and 002 remain in force. In particular, planned load remains a
factual total with no capacity, threshold, classification, or warning; the result is still
unaffected by daily state; and every write is still applied atomically on the server.

## Assumptions

- The reported loss of saved state (item 7) is a defect in the current product rather than an
  intended behavior, and its cause will be identified during planning. The requirement is
  stated as an observable guarantee (FR-001 to FR-005) so that it holds regardless of which
  layer turns out to be responsible.
- "One weight for everything" means one weight per *item* — each task and each habit counts
  once — rather than an equal 50/50 split between the task category and the habit category.
  This is what produces the 90% result the user's complaint implies for a day of nine tasks
  and one habit.
- A habit's duration is a property of the habit itself rather than something entered per day.
- Habit duration affects planned load only, never the result. Under the single-weight rule a
  habit already counts as one item regardless of how long it takes.
- Task notes are plain text without formatting, links, or attachments.
- The task note reuses the notes concept already present in the ORBIT domain model, so a
  task's note and its planned snapshot stay consistent with existing revision and history
  semantics.
- Reopening a day is available to the single ORBIT user without any additional permission
  workflow beyond a clear confirmation step.
- The existing Russian-language user interface remains the only interface; all new labels and
  explanatory text are written in Russian in the existing voice.
- The existing database, the existing server API boundary, and the existing planning
  repository contract are carried forward; any schema change is applied as an additive,
  data-preserving migration.
- Existing automated quality gates (format, lint, typecheck, unit, UI, server, and end-to-end
  tests) continue to apply to all changes in this feature.
- The user's numbered list skips item 5; no requirement is missing as a result.

## Resolved Decisions

Three decisions materially changed the scope of this feature and had no safe default. They
were put to the project owner on 2026-08-22 and answered as follows.

| # | Decision | Answer | Requirements |
| - | -------- | ------ | ------------ |
| **D1** | Reopening a day and its closure dispositions | Reopening only clears the closed status; the dispositions closure applied are **not** rolled back. | FR-012, FR-013, FR-014 |
| **D2** | Existing frozen snapshots computed under 70/30 | **Recompute** all of them once under the single-weight rule, so the whole history reads on one scale. | FR-021, FR-022 |
| **D3** | The denominator at closure | Tasks moved, backlogged, or cancelled at closure **still count** as applicable items of that day — current behavior is kept. | FR-007 |

Two consequences of D1 are product decisions in their own right and are recorded explicitly
rather than left implicit:

- A reopened day must still be *usable*, so tasks that closure left with no other placement
  (kept unfinished, cancelled, completed) return to the day as live items whose completion
  can be corrected (FR-013). Without this, reopening a day would let the user change nothing
  and User Story 3 would deliver no value. Tasks that closure relocated — moved to another
  date or to the backlog — are the ones D1 protects, and they stay where they are.
- Because D1 does not reopen periods, a day belonging to a completed week cannot be reopened
  without leaving that week's frozen progress wrong. Such a day therefore stays closed and
  ORBIT says why (FR-014). Reopening a completed week is out of scope.
