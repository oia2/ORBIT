# Feature Specification: ORBIT Personal Planning Loop

**Feature Branch**: No branch created (before_specify hook not configured)

**Created**: 2026-08-10

**Status**: Approved for Implementation

**Input**: Define the first usable ORBIT release around the loop
plan → execute → record → review → adjust, covering weekly and daily planning,
task execution, recurring tasks and habits, daily state, explicit closure,
reflection, and trustworthy history.

## Clarifications

### Session 2026-08-10

- Workouts are outside the first MVP.
- The MVP serves one user, stores data on the current device, requires no
  account, and does not synchronize data across devices.
- Device-local data is guaranteed across normal application sessions in the
  same browser profile while site storage remains available. The guarantee does
  not cover explicit site-data deletion, browser/operating-system eviction,
  private/incognito sessions, or browser-profile deletion/reset. ORBIT requests
  persistent storage when supported, explains the local boundary, and surfaces
  persistence failures instead of treating failed writes as successful.
- Q: Which task lifecycle reversals are allowed before a period is finalized? →
  A: For a task on an open day, completion is a reversible checkbox state;
  checking marks it completed and unchecking marks it incomplete. Completion
  does not block editing or permanent deletion, but a completed task must be
  unchecked before it can move. Ordinary task interaction has no cancel action;
  cancellation is available only as a Close Day disposition for an unfinished
  task. Closed-day facts cannot be changed.
- Q: Is a recurrence end date inclusive? → A: Yes. A matching occurrence
  exists on the end date.
- Q: How are multiple changes to the same recurrence rule on one local day
  retained? → A: Only the final rule for the next-local-date boundary is
  retained as the effective version. Intermediate configurations need not be
  effective versions; past and current-day occurrences and individually edited
  future occurrences remain unchanged.
- Q: What happens to a habit occurrence still pending when its local date ends?
  → A: It automatically becomes not completed. Only an explicit user action
  marks it completed. While that day remains open, the user may explicitly
  correct the automatic result to completed; the score updates and history
  retains both the boundary result and correction. Day closure makes the final
  outcome immutable.
- Q: How does early day closure handle applicable habits that are still pending?
  → A: Before the local date ends, closure is allowed only after the user
  explicitly marks every pending applicable habit completed or not completed.
- Q: How are exact half-percentage score ties rounded? → A: They round upward
  for both the Daily Score and Weekly Progress: 74.4 becomes 74%, 74.5 becomes
  75%, and 74.6 becomes 75%.
- Q: Does the MVP support a partial task or habit outcome? → A: No. History
  uses only the explicitly defined outcomes and dispositions.
- Q: May day closure move an unfinished task back to the date being closed? →
  A: No. A move-to-date destination must differ from the closing date and must
  be a valid open day.
- Q: Which operations are supported for weekly goals? → A: Weekly goals can
  be created, edited or renamed, reordered, and deleted. ORBIT boundary-trims
  their free-form text before persistence, rejects a whitespace-only result, and
  otherwise preserves internal whitespace and content. ORBIT does not
  algorithmically judge measurability, and goals have no independently editable
  numeric progress.
- Closed days and completed weeks are immutable and cannot be reopened in the
  MVP.
- Weekly goals are descriptive statements of intended outcomes and have no
  independently edited progress percentage.
- The daily score uses task completion at 70% and habit completion at 30%,
  normalizes weights when a category is not applicable, and excludes daily
  state.
- Planned daily load is the sum of scheduled task durations. The MVP has no
  separately configured daily-capacity value.
- Each retained task-plan membership has equal weight in the daily task
  completion rate. One logical task occurrence has at most one membership per
  local date; returning to that date reuses it. Memberships finalized moved away
  or canceled count as incomplete, while a reused membership may complete if the
  task returns and is completed before that day closes. Deleted memberships are
  excluded.
- The daily score is a live preview and is finalized as a whole percentage when
  the day closes.
- Weekly Progress is one derived aggregate using weekly task completion at 70%
  and weekly habit completion at 30%. Descriptive weekly goals do not contribute
  to Weekly Progress.
- Q: How are weeks identified? → A: ORBIT uses fixed local-calendar
  Monday–Sunday weeks; every local date belongs to exactly one week, and
  duplicate or overlapping week ownership is invalid.
- Q: When does dated task history begin and how do repeated moves behave? → A:
  Historical scoring membership begins with the first committed dated placement.
  One logical occurrence has at most one membership per local date; returning to
  a previously visited open date reuses that membership while movement events
  remain in history and denominators never inflate.
- Q: Which open days may be closed? → A: A day may close only when its date is
  not later than the current local date. Eligible days need not close in order;
  an older open day does not block closure of a later eligible day.
- Q: How is backlog ordered? → A: Backlog is an undated holding area displayed
  in deterministic creation order, oldest first, with no manual reorder or sort
  control in the MVP.
- Q: What navigation does History provide? → A: History defaults to the current
  calendar month in Month mode and supports Day, Week, and Month modes with
  previous/next steps of one day, one Monday–Sunday week, or one calendar month.
  Month mode keeps the approved calendar, selected-day details, and applicable
  Dynamics section; finalized facts are read-only and workouts remain excluded.
- Q: How are timed usability criteria accepted for the MVP? → A: One
  representative target user or product owner uses the production build under
  the defined no-assistance timing protocol; evidence is recorded outside ORBIT
  without analytics, telemetry, accounts, or a backend.
- Q: Does ORBIT classify overload? → A: No. ORBIT shows factual duration-derived
  planned load but has no configurable capacity, hidden load/capacity threshold,
  overload label, or proactive overload warning in the MVP.
- Q: How is weekly progress presented? → A: Weekly review displays the mandatory
  derived task-and-habit progress and finalizes it when the week is completed;
  weekly goals never receive an editable numeric progress value.
- Q: How does design reconciliation gate implementation? → A: The fresh
  read-only Open Design reconciliation is a serialized pre-UI gate. If the source
  is unavailable, the failure is recorded and affected UI work remains blocked.
- Q: Which scoring memberships are excluded when a moved task is permanently
  deleted? → A: Every membership for that logical task occurrence whose day is
  still open is excluded. Memberships in closed days remain immutable and
  unchanged.
- Q: Which threshold rules are prohibited in the MVP? → A: ORBIT must not infer
  overload or use a hidden or configurable load/capacity/overload threshold.
  Score color, status, and presentation semantics are not prohibited in general;
  they remain governed by the serialized Open Design reconciliation.
- Q: How is whitespace handled in weekly-goal text? → A: Input must contain at
  least one non-whitespace character. ORBIT trims leading and trailing whitespace
  before persistence, rejects a whitespace-only result, and otherwise preserves
  internal whitespace and content.
- Q: What is the canonical product term for the derived weekly aggregate? → A:
  Weekly Progress is the sole product, UI, and entity term. The underlying 70/30
  logic is the shared scoring/calculation policy, not a separate Weekly Score.

### Session 2026-08-11

- The product owner approved the fresh Open Design reconciliation and every
  significant prototype deviation recorded in `design-reconciliation.md`.
- Daily Score uses semantic threshold coloring: `>=70%` good, `50–69%`
  neutral/warning, and `<50%` low. Weekly Progress keeps its primary aggregate
  orbit accent/neutral, while its individual daily bars may use those thresholds.
  Both aggregates show the numeric percentage and task/habit completion counts
  or rates. No additional textual score label is required for MVP.
- Switching Day, Week, or Month History mode preserves `selectedDate` and sets
  `anchorDate` to it. The mode changes viewing scale only: Day shows that date,
  Week shows its containing Monday–Sunday week, and Month shows its containing
  month.
- Month navigation clamps a selected day number that does not exist in the
  destination month to that month's last valid day. The clamped date becomes the
  actual `selectedDate`; no hidden preferred day-of-month is retained.
- Dynamics is absent from Day History. Week History covers the last eight weeks;
  Month History covers the last six months. It may show only task completion
  rate, habit completion rate, and the specification-defined 70/30 score. It has
  no workout data, state analytics, correlations, generated insights, invented
  metrics, or additional analytics.
- A newly materialized recurring-task occurrence is appended to the end of its
  date's ordered task list. Existing order is otherwise unchanged; no recurrence
  source, time, priority, or other implicit sort is introduced.
- Authority is constitution, then `spec.md` for behavior/data semantics, then
  `contracts/ui-routes.md` for explicit UI/prototype overrides, then `DESIGN.md`
  for the canonical visual system. Open Design prototypes are references only
  where they do not conflict. The approved deviations include 70/30 scoring with
  state excluded, factual load without capacity/overload semantics, descriptive
  goals, IndexedDB, complete workout omission, no Close Day default, and only
  explicit valid-date carry-forward.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plan a Calendar Week (Priority: P1)

As an individual planning a week, I can create, edit, reorder, and delete
free-form descriptive goals, create tasks with planned durations, and organize
those tasks across the fixed Monday–Sunday calendar week so that I know what I
intend to accomplish and the load planned for each day.

**Why this priority**: Planning establishes the baseline against which execution
and reflection can be understood.

**Independent Test**: A user can open the fixed calendar week containing a
selected local date, create, rename, reorder, and delete weekly goals, create
several tasks, assign the tasks to different days, and see consistent planned
information and load totals in the weekly and daily views without creating an
overlapping or duplicate week.

**Acceptance Scenarios**:

1. **Given** an empty week, **When** the user writes a weekly goal and adds tasks
   with durations to specific days, **Then** the weekly plan shows the goal,
   tasks, planned days, and the load derived for each day.
2. **Given** existing weekly goals, **When** the user edits or renames, reorders,
   or deletes a goal, **Then** every current view shows the resulting ordered
   goal list.
3. **Given** an existing weekly plan, **When** the user edits a task or task
   duration, **Then** every current view that presents the item or affected load
   shows the updated planned information.
4. **Given** a weekly goal, **When** the user reviews it, **Then** ORBIT shows the
   goal statement without an independently editable progress percentage.
5. **Given** any local date, **When** the user opens its weekly plan, **Then**
   ORBIT shows the unique Monday–Sunday calendar week containing that date and
   does not offer creation of an overlapping or duplicate week range.
6. **Given** weekly-goal input, **When** the user saves it, **Then** ORBIT trims
   leading and trailing whitespace, rejects the value unless at least one
   non-whitespace character remains, otherwise preserves its internal whitespace
   and content, and does not judge whether it is measurable; any measurability
   prompt is optional authoring guidance only.

---

### User Story 2 - Execute Tasks Without Rewriting History (Priority: P1)

As a user working through an open day, I can edit or delete its tasks, check or
uncheck completion, and move an incomplete task to another open date or backlog,
while ORBIT keeps planned activity distinct from what actually happened. I can
edit, delete, or schedule an undated backlog task, but backlog is not a task
execution surface.

**Why this priority**: The product loop only works when execution can be compared
with the plan rather than replacing it.

**Independent Test**: A dated task can be checked complete and unchecked back to
incomplete while its day is open; completion does not prevent editing or
permanent deletion, but movement requires an incomplete task. An incomplete task
can move to an open date or backlog without rewriting source membership, and an
undated backlog task can be edited, deleted, or scheduled without exposing
completion or ordinary cancellation controls.

**Acceptance Scenarios**:

1. **Given** a planned task, **When** the user completes it, **Then** ORBIT records
   the actual outcome and shows completion consistently in the daily, weekly,
   and historical views.
2. **Given** a completed task on an open day, **When** the user unchecks it,
   **Then** ORBIT marks it incomplete again and updates every current view while
   retaining the task's change history.
3. **Given** a completed task on an open day, **When** the user edits or deletes
   it, **Then** editing remains available and deletion remains final; **When**
   movement is attempted, **Then** ORBIT requires the task to be unchecked first.
4. **Given** an incomplete dated task, **When** the user explicitly moves it,
   **Then** the selected destination is another valid open date or backlog, the
   new placement is visible, and the source date retains its historical
   membership and movement fact.
5. **Given** one logical task moves A → B → A while both dates remain open,
   **When** it returns to A and is completed there, **Then** A has one reused
   completed membership, B has one incomplete moved-away membership, every
   movement event remains in history, and no denominator is inflated.
6. **Given** an undated backlog task, **When** it is shown in backlog, **Then** it
   has edit, permanent-delete, and schedule-to-open-date actions but no completion
   checkbox, ordinary cancel action, manual reorder control, or user sorting
   control; items appear oldest first by creation order.
7. **Given** a task the user no longer wants in an open plan, **When** the user
   deletes it through its form, **Then** deletion is final, every membership for
   that logical occurrence on a still-open day is excluded from scoring,
   closed-day memberships remain unchanged, and no restoration action is offered.
8. **Given** an ordinary task card or form, **When** the user reviews available
   actions, **Then** no cancel action is present because cancellation is only an
   unfinished-task disposition during Close Day.
9. **Given** a task belonging to a closed day or completed week, **When** any
   edit, completion toggle, move, deletion, or reopening is attempted, **Then**
   ORBIT rejects it and preserves the finalized record.

---

### User Story 3 - Manage Recurring Occurrences (Priority: P1)

As a user with repeating work and habits, I can define a recurrence rule that
creates separate dated occurrences and change one occurrence without rewriting
the rest of the series or its history.

**Why this priority**: Recurrence must save planning effort without weakening
the distinction between an intended series and what happened on each date.

**Independent Test**: A recurring task and habit can generate occurrences
through an inclusive end date; editing or deleting one occurrence affects only
that date; and rule changes preserve past/current-day occurrences and future
exceptions, retain only the final same-day configuration for the next-date
boundary, and apply from that boundary to unmodified future occurrences.

**Acceptance Scenarios**:

1. **Given** a recurring task or habit, **When** its rule applies to several
   dates, **Then** ORBIT creates a separate identifiable occurrence for every
   applicable date.
2. **Given** a recurrence with an end date that matches an applicable weekday,
   **When** occurrences are evaluated through that date, **Then** an occurrence
   exists on the end date.
3. **Given** several occurrences in a series, **When** the user edits or deletes
   one occurrence in an open period, **Then** no other occurrence or the series
   definition is changed.
4. **Given** historical, current-day, and future occurrences, including an
   individually edited future occurrence, **When** the user changes the
   recurrence rule, **Then** past and the already formed current-day occurrence
   remain unchanged, the edited future occurrence remains an explicit
   exception, and the new rule applies from the next date only to future
   occurrences without an override.
5. **Given** the same recurrence rule is changed multiple times during one local
   day, **When** the next-date boundary is reached, **Then** only the final
   resulting rule is retained as the effective version for that boundary.
6. **Given** an applicable habit occurrence still pending when its local date
   ends, **When** the date boundary passes, **Then** it automatically becomes
   not completed regardless of whether the day has been explicitly closed.
7. **Given** a habit was automatically marked not completed at its local-date
   boundary and its day remains open, **When** the user explicitly corrects it to
   completed, **Then** ORBIT updates the live score, preserves both the automatic
   transition and correction in history, and makes the final outcome immutable
   only when the day closes.

---

### User Story 4 - Close a Day Deliberately (Priority: P1)

As a user finishing a day, I can explicitly close it, review its outcomes, and
decide what happens to every unfinished task so that ORBIT never carries work
forward without my action.

**Why this priority**: Explicit day closure connects execution with an honest
record and prevents silent rescheduling.

**Independent Test**: A current or past open day cannot close until every
unfinished task has one of the four allowed dispositions. If the local date has
not ended, every applicable habit must also have an explicit outcome. A future
day is rejected, eligible days may close in any order, and successful closure
makes the day immutable.

**Acceptance Scenarios**:

1. **Given** a day with unfinished tasks, **When** the user starts day closure,
   **Then** ORBIT identifies every unfinished task and requires a disposition
   for each one.
2. **Given** an unfinished task during closure, **When** the user chooses to keep
   it unfinished, move it to a selected date, move it to the backlog, or cancel
   it, **Then** ORBIT records that exact disposition without applying a silent
   default.
3. **Given** an unfinished task during closure, **When** the user selects a
   move-to-date disposition, **Then** ORBIT requires a valid open destination
   different from the date being closed and rejects the closing date itself.
4. **Given** the local date has not ended and an applicable habit is pending,
   **When** the user attempts to confirm closure, **Then** ORBIT requires the
   user to mark that habit completed or not completed before closure can proceed.
5. **Given** all unfinished tasks have dispositions and any required habit
   outcomes are resolved, **When** the user confirms closure, **Then** the day is
   marked closed, its plan and actual outcomes are preserved, and its records can
   no longer be changed or reopened.
6. **Given** an open day whose date is later than the current local date,
   **When** the user attempts to close it, **Then** ORBIT rejects closure.
7. **Given** an older eligible day remains open and a later open day is also not
   later than the current local date, **When** the later day independently meets
   every closure condition, **Then** ORBIT permits its closure without requiring
   the older day to close first.

---

### User Story 5 - Record Habits, State, Score, and Load (Priority: P2)

As a user observing daily execution, I can record habit outcomes and basic state,
see a transparent task-and-habit score, and compare that result with the total
duration of work I planned.

**Why this priority**: These signals explain the day without turning contextual
wellbeing data into a judgment.

**Independent Test**: A user can record task and habit outcomes plus energy,
mood, and sleep, then verify the daily score and planned-load calculation from
visible inputs.

**Acceptance Scenarios**:

1. **Given** applicable tasks and habits, **When** some are completed, **Then**
   the daily score applies 70% to the task completion rate and 30% to the habit
   completion rate.
2. **Given** only tasks or only habits are applicable, **When** the score is
   calculated, **Then** the available category is normalized to 100% rather than
   treating the absent category as zero.
3. **Given** no applicable tasks or habits, **When** the day is viewed, **Then**
   ORBIT shows that no score is available rather than displaying zero.
4. **Given** energy, mood, or sleep values, **When** the score is calculated,
   **Then** those state values remain visible context and do not affect the
   result.
5. **Given** tasks scheduled for a day, **When** their durations change, **Then**
   the planned load equals the factual sum of those durations; ORBIT does not
   compare it with a configurable capacity or hidden load/capacity/overload
   threshold, classify the day as overloaded or not overloaded, or generate a
   proactive overload warning.

---

### User Story 6 - Review the Week and Adjust the Next Plan (Priority: P2)

As a user completing a week, I can compare planned and actual task and habit
outcomes, review descriptive goals, daily context, and derived weekly progress,
record a reflection, and use what I learn to adjust a future plan.

**Why this priority**: Review and adjustment complete the product loop and turn
recorded data into future decisions.

**Independent Test**: A completed week can be reviewed with its derived weekly
progress and contributing task and habit counts without changing historical
outcomes; the user can record a reflection, finalize the week, and create a
changed plan for a later period.

**Acceptance Scenarios**:

1. **Given** a week with recorded activity, **When** the user opens weekly review,
   **Then** ORBIT shows descriptive goals, planned and actual task and habit
   outcomes, daily scores, planned loads, daily-state context, and derived weekly
   progress with its contributing task and habit rates.
2. **Given** the weekly review, **When** the user records a reflection and marks
   the week complete, **Then** the reflection and derived weekly progress with
   its contributing counts are finalized with that week, and the completed week
   becomes immutable.
3. **Given** insights from a completed week, **When** the user adjusts a future
   goal, task, habit, or recurrence rule, **Then** the completed week remains
   unchanged.

---

### User Story 7 - Review Historical Activity (Priority: P2)

As a user looking for patterns over time, I can inspect read-only historical
facts in Day, Week, and Month modes, including tasks, recurring occurrences,
habit outcomes, state, scores, loads, weekly progress, and reflections, so that
I can understand what actually happened.

**Why this priority**: Trustworthy history is required for reflection and future
adjustment.

**Independent Test**: History opens anchored to the current local date in Month
mode for the current calendar month. The user can navigate by exactly one day,
one Monday–Sunday week, or one calendar month according to the selected mode,
inspect selected-day and applicable Dynamics details, and distinguish the
original plan, later dispositions, and actual outcomes without editing finalized
facts or encountering workout-history functionality.

**Acceptance Scenarios**:

1. **Given** the current local date, **When** the user opens History, **Then**
   History anchors that date and defaults to Month mode for the current calendar
   month, showing the month calendar and selected-day details for the anchored
   date.
2. **Given** History in Day, Week, or Month mode, **When** the user chooses
   previous or next, **Then** the displayed period moves by exactly one local
   day, one fixed Monday–Sunday calendar week, or one calendar month respectively.
3. **Given** Month mode, **When** the user selects a calendar date, **Then** the
   selected-day details panel shows that date and the Dynamics section remains
   available where applicable.
4. **Given** finalized history in any mode, **When** the user reviews it,
   **Then** the facts are read-only and History exposes no editing or
   workout-history layers, tabs, or data.
5. **Given** a task that was moved, placed in backlog, or canceled during day
   closure, **When** the user views the original day, **Then** the plan,
   not-completed outcome, and disposition remain distinguishable.
6. **Given** multiple weeks of device-local data, **When** the user selects a
   prior day, week, or month, **Then** ORBIT presents the correct immutable facts
   for that period.
7. **Given** a historical record, **When** the user changes between desktop and
   mobile layouts on the same device, **Then** the same facts remain
   understandable.

### Edge Cases

- The selected day, week, or month contains no goals, tasks, habits, state, or
  history.
- A task is moved repeatedly, including A → B → A or across week boundaries;
  each visited date has at most one membership, returning reuses that membership,
  and movement history remains ordered without inflating a denominator.
- A completed task is selected for movement before it has been unchecked.
- An undated backlog task is selected for completion or manual reordering.
- A user attempts to edit, delete, move, or toggle completion for an occurrence
  in a closed day or completed week.
- A user attempts to uncheck completion after the owning day or week has been
  finalized, or attempts to restore a deleted task.
- Day closure contains several unfinished tasks that need different
  dispositions.
- Day closure attempts to move an unfinished task to the same date being closed.
- A future open day is selected for closure, or a later eligible day is closed
  while an older eligible day remains open.
- The current local date is closed before midnight while an applicable habit is
  still pending; closure must wait for the user to record its explicit outcome.
- A recurring occurrence is missed, deleted, canceled, edited individually, or
  affected by a future-only rule change.
- A rule changes while the current open day already contains an occurrence; the
  current occurrence stays unchanged and the new rule begins on the next date.
- The same recurrence rule is changed multiple times on one local date; only the
  final configuration is retained for the next-date effective boundary.
- An individually edited future occurrence crosses a later rule-change boundary
  and must remain an explicit exception.
- A recurrence crosses a week boundary or a local calendar-date boundary.
- An open day remains unclosed after local midnight; every still-pending
  applicable habit occurrence becomes not completed at the date boundary, but
  the user may explicitly correct that automatic result while the day remains
  open and history must retain both events.
- A task or habit occurrence is deleted before closure and must no longer count
  as applicable for the daily score.
- A moved task with memberships on several dates is permanently deleted; every
  still-open date excludes its membership while every closed date remains
  immutable.
- A moved-away, backlogged, canceled-at-closure, or kept-unfinished membership
  remains incomplete on that date unless the task returns to that still-open
  date and is completed there before closure, or the logical task occurrence is
  permanently deleted while that date remains open. Permanent deletion excludes
  every still-open membership under FR-030; intervening closed dates remain
  incomplete and no date receives a duplicate membership.
- A day has only tasks, only habits, or neither category applicable.
- A goal statement has no directly associated tasks or habits.
- A completed period is selected for editing or reopening.
- Daily-state data is incomplete or changed before closure.
- A scheduled task has no valid duration.
- Device-local data is opened from a different device where it is unavailable.
- A current-view update conflicts with an older value visible elsewhere.
- When completion, daily state, missed habits, or factual planned-load
  information is presented, it uses neutral language; planned load never
  triggers an overload classification or warning.
- The interface is used at narrow mobile widths, with keyboard-only input,
  touch, or reduced-motion preferences.

## Requirements *(mandatory)*

### Functional Requirements

#### Weekly and Daily Planning

- **FR-001**: ORBIT MUST organize planning into fixed local-calendar weeks from
  Monday through Sunday. Every local date MUST belong to exactly one calendar
  week, and ORBIT MUST NOT create duplicate or overlapping week ownership. The
  user edits the plan associated with that calendar grouping rather than
  creating an arbitrary seven-day range.
- **FR-002**: ORBIT MUST let the user create, edit or rename, reorder, and delete
  weekly goals. Before persistence, ORBIT MUST trim leading and trailing
  whitespace from goal text and MUST reject the result unless it contains at
  least one non-whitespace character. Internal whitespace and content MUST
  otherwise be preserved. ORBIT MUST NOT algorithmically determine whether a
  goal is measurable; measurability MAY appear only as optional authoring
  guidance.
- **FR-003**: A weekly goal MUST NOT expose an independently editable progress
  percentage or numeric progress field.
- **FR-004**: ORBIT MUST let the user create tasks, assign them to individual
  days or the backlog, and organize dated tasks within a week.
- **FR-005**: Every task scheduled to a day MUST have a positive planned duration
  so that the day's planned load can be calculated.
- **FR-006**: ORBIT MUST provide weekly and daily views that identify the active
  period and present the same underlying planned items consistently.
- **FR-007**: ORBIT MUST keep planned values and actual outcomes as distinct,
  labeled information wherever both are relevant.

#### Task Lifecycle and Consistency

- **FR-008**: For a task belonging to an open day, ORBIT MUST let the user edit
  it, permanently delete it, check it completed, and uncheck it back to
  incomplete. Completion MUST NOT block editing or deletion. A completed task
  MUST NOT move until the user first unchecks it. Deletion MUST be final and,
  as a plan correction, MUST exclude every membership for that logical task
  occurrence whose day remains open; memberships in closed days MUST remain
  unchanged.
- **FR-009**: Checking completion MUST record the task's current completed
  outcome without erasing planned placement or change history. Unchecking while
  the day remains open MUST restore the current outcome to incomplete and update
  every current projection.
- **FR-010**: An incomplete dated task MAY move only through an explicit user
  action to another valid open date or to backlog; ORBIT MUST NOT move unfinished
  tasks automatically. Backlog MUST be an undated holding area where a task may
  be edited, permanently deleted, or scheduled to a valid open date. Backlog
  tasks MUST NOT expose completion or ordinary cancellation controls. Backlog
  MUST use deterministic creation order, oldest first, and MUST NOT expose manual
  reordering or user sorting in the MVP.
- **FR-011**: ORBIT MUST NOT expose cancellation as an ordinary task-card or
  task-form action. Cancellation MUST exist only as one explicit Close Day
  disposition for an unfinished task and MUST produce a historical canceled,
  incomplete outcome distinct from completion, deletion, or movement.
- **FR-012**: ORBIT MUST preserve the task events needed to reconstruct what was
  planned, what changed, and what actually happened, including completion
  checkbox changes, edits, movements, deletion, and Close Day dispositions,
  without erasing earlier events.
- **FR-013**: A current task change MUST appear consistently in all related
  current views, preventing conflicting states, while closed historical views
  remain unchanged.

#### Recurring Tasks and Habits

- **FR-015**: ORBIT MUST let the user define a recurrence rule for a task or
  habit using an effective start date and one or more applicable weekdays, with
  an optional inclusive end date or explicit stop action. If the end date
  matches the rule, that date MUST produce an occurrence.
- **FR-016**: Each applicable date MUST produce a separate task or habit
  occurrence with its own identity and outcome. A newly materialized recurring
  task occurrence MUST be appended to the end of that date's ordered task list
  without otherwise changing existing order or applying an implicit sort.
- **FR-017**: Editing one occurrence MUST affect only that occurrence and MUST
  NOT modify the recurrence rule or other occurrences.
- **FR-018**: Deleting one occurrence in an open period MUST remove only that
  occurrence and MUST NOT delete the series or any other occurrence.
- **FR-019**: Changing a recurrence rule MUST leave all past occurrences and the
  already formed current open day's occurrence unchanged. The new rule MUST
  become effective on the next local date and MUST apply only to future
  occurrences without an explicit per-occurrence override. Any individually
  edited future occurrence MUST remain an explicit exception and MUST NOT be
  overwritten by a later rule change. If the same rule is changed more than once
  on one local date, only the final resulting rule for the next-date boundary
  MUST be retained as the effective recurrence version; intermediate same-day
  configurations need not become effective versions.
- **FR-020**: A habit occurrence MUST become completed only through explicit user
  action. If an applicable occurrence is still pending when its local calendar
  date ends, it MUST automatically become not completed. While that day remains
  open, the user MUST be able to correct the automatic result to completed; the
  correction MUST update the live score and history MUST preserve both the
  automatic boundary transition and correction. Successful day closure MUST
  make the final outcome immutable. Before the local date ends, ORBIT MUST reject
  closure while any applicable habit remains pending.
- **FR-021**: Task and habit occurrences in a closed day or completed week MUST
  NOT be editable, deletable, or returned to an earlier lifecycle state.

#### Habits and Daily State

- **FR-022**: ORBIT MUST let the user explicitly record a completed or
  not-completed outcome for each applicable habit occurrence and, while its day
  remains open, correct an automatic boundary miss to completed.
- **FR-023**: ORBIT MUST let the user record energy, mood, and sleep for an open
  day.
- **FR-024**: Daily-state values MUST be clearly labeled, associated with a date,
  and distinguishable from planned goals, tasks, habits, and calculated scores.
- **FR-025**: Daily-state values MUST NOT affect task completion, habit
  completion, the daily score, or weekly task-and-habit progress.
- **FR-026**: Habit and daily-state changes in an open period MUST appear
  consistently wherever those values are presented.

#### Daily Score and Planned Load

- **FR-027**: Historical scoring membership MUST begin when a task is first
  committed to a dated plan; unsaved form input MUST NOT create membership. One
  logical task occurrence MUST have at most one membership for a given local
  date. Returning to a previously visited still-open date MUST reuse its existing
  membership. Each retained membership MUST have equal weight in that day's task
  completion rate, which MUST equal completed memberships divided by all
  non-deleted memberships in the day's historical plan.
- **FR-028**: Moving a task away MUST preserve its source-date membership and
  movement fact. A membership that is kept unfinished, remains moved away, is
  moved to backlog, or is canceled during Close Day MUST finalize as incomplete
  unless the logical task occurrence is permanently deleted while that
  membership's day remains open, in which case FR-030 excludes the membership.
  If the task returns to a previously visited still-open date and is completed
  there before closure, that date's single reused membership MAY finalize as
  completed; other visited source dates remain incomplete unless FR-030 excludes
  them. Repeated movements MUST NOT create duplicate memberships or inflate any
  denominator.
- **FR-029**: The daily habit completion rate MUST equal completed applicable
  habit occurrences divided by all applicable habit occurrences for that day.
- **FR-030**: Permanently deleting a task occurrence from an open dated placement
  or from backlog MUST exclude every membership for that logical occurrence
  whose day remains open from its task denominator. Memberships in closed days
  MUST remain immutable and unchanged. A habit occurrence deleted while its
  period is open MUST cease to be applicable and MUST be excluded from its habit
  denominator. Deletion MUST remain represented in history.
- **FR-031**: When both categories are applicable, the daily score MUST equal
  70% of the task completion rate plus 30% of the habit completion rate.
- **FR-032**: When only one category is applicable, its available weight MUST be
  normalized to 100%; the absent category MUST NOT be treated as zero.
- **FR-033**: When neither tasks nor habits are applicable, ORBIT MUST present
  the daily score as unavailable rather than zero.
- **FR-034**: ORBIT MUST display the score's contributing task and habit rates so
  that the result is explainable. It MUST display the numeric whole percentage.
  Daily Score MUST use semantic threshold coloring: `>=70%` good, `50–69%`
  neutral/warning, and `<50%` low. No additional textual score label is required.
- **FR-035**: While a day is open, its score MUST reflect current outcomes as a
  live preview. The displayed score MUST be rounded to the nearest whole
  percentage, with an exact half-percentage tie rounded upward: 74.4% becomes
  74%, 74.5% becomes 75%, and 74.6% becomes 75%. Day closure MUST preserve that
  final integer score and its contributing counts as part of the immutable day
  record.
- **FR-036**: The current planned load for an open day MUST equal the sum of the
  planned durations of all non-deleted tasks currently scheduled to that day.
- **FR-037**: Day closure MUST preserve the planned-load snapshot from before
  unfinished-task dispositions so later movement does not rewrite the original
  day's planned load.
- **FR-038**: The MVP MUST NOT introduce a separately user-configurable daily
  capacity value or capacity target, a hidden overload threshold, automatic
  overloaded/not-overloaded classification, or proactive overload warnings.

#### Day and Week Closure

- **FR-039**: ORBIT MUST provide an explicit Close Day action only for a
  currently open day satisfying `date <= currentLocalDate`. ORBIT MUST reject
  closure of a future day. Eligible days MAY close in any order; an older open
  day MUST NOT block closure of a later eligible day.
- **FR-040**: Before day closure, ORBIT MUST identify every unfinished task and
  require exactly one explicit disposition: keep unfinished on the original
  day, move to a selected date, move to backlog, or cancel. A selected move date
  MUST differ from the date being closed and MUST be a valid open day.
  Keeping a task unfinished MUST produce a final not-completed outcome on the
  immutable original day rather than leave an active task there.
- **FR-041**: No closure default MAY silently move an unfinished task to another
  day, week, or backlog.
- **FR-042**: Closing a day MUST create a reviewable record of its plan, planned
  load, task and habit outcomes, daily score, daily state, and unfinished-task
  dispositions.
- **FR-043**: ORBIT MUST clearly communicate whether a day is open or closed.
- **FR-044**: A closed day MUST be immutable and MUST NOT be reopened in the MVP.
- **FR-045**: After all seven days are closed, ORBIT MUST let the user record a
  weekly reflection and explicitly mark the reviewed week complete.
- **FR-046**: A completed week and its reflection MUST be immutable and MUST NOT
  be reopened in the MVP.

#### Weekly Review and Historical Truth

- **FR-047**: Weekly review MUST show descriptive weekly goals, planned and
  actual task and habit outcomes, daily scores, planned loads, daily-state
  context, derived weekly progress with its contributing task and habit
  rates/counts, and the weekly reflection.
- **FR-048**: Weekly Progress MUST be one derived aggregate. The weekly task rate
  MUST equal completed task-plan memberships divided by all non-deleted task-plan
  memberships belonging to the week's historical day plans. Repeated movement
  MUST retain at most one membership per logical occurrence and local date; a
  membership left moved away or canceled MUST count there as incomplete, while a
  task that returns to a still-open date and completes there MAY complete that
  reused membership. Permanent task deletion MUST exclude every membership for
  that occurrence on a still-open day and MUST leave closed-day memberships
  unchanged. The
  weekly habit rate MUST equal
  completed applicable habit occurrences divided by all applicable habit
  occurrences in the week. When both categories are applicable, Weekly Progress
  MUST equal 70% of the weekly task rate plus 30% of the weekly habit rate. When
  only one category applies, its weight MUST normalize to 100%; when neither
  applies, Weekly Progress MUST be unavailable rather than zero. Weekly goals
  and daily-state values MUST NOT contribute directly. The Weekly Progress result
  MUST be rounded to the nearest whole percentage using the same
  exact-half-ties-upward rule as the Daily Score and finalized with its
  contributing counts when the week is completed. Its primary aggregate orbit
  MUST retain the primary accent/neutral treatment; individual daily bars MAY
  use the Daily Score semantic thresholds. No additional textual score label is
  required.
- **FR-049**: Adjusting a future plan after review MUST NOT change the facts of a
  completed week.
- **FR-050**: ORBIT MUST provide a read-only History experience with Day, Week,
  and Month modes for browsing dated tasks, recurring occurrences, habit
  outcomes, state entries, daily scores, weekly progress, planned loads, and
  reflections. On first entry, History MUST anchor the current local date and
  default to Month mode for the current calendar month. Previous/next navigation
  MUST move exactly one local day in Day mode, one fixed Monday–Sunday week in
  Week mode, and one calendar month in Month mode. Month mode MUST show its
  calendar and selected-day details panel. Switching modes MUST preserve
  `selectedDate`, set `anchorDate` to that date, and change only the viewing
  scale. Month navigation MUST clamp a selected day number missing in the
  destination month to its last valid date and retain no hidden preferred day.
  Day History MUST have no Dynamics. Week History MUST show Dynamics across the
  last eight weeks, and Month History across the last six months, using only task
  completion rate, habit completion rate, and the specification-defined 70/30
  score. Dynamics MUST NOT add state analytics, correlations, generated
  insights, invented metrics, or additional analytics. History MUST NOT provide
  editing or workout-history layers, tabs, or data.
- **FR-051**: Historical views MUST preserve unfinished, not-completed, moved,
  backlogged, canceled, completed, and deleted-occurrence facts needed to explain
  the record. They MUST retain repeated-movement events plus automatic habit
  boundary and correction events needed to explain final outcomes, without
  treating audit events as additional scoring records. The MVP MUST NOT
  represent partial completion as a task or habit outcome.

#### Product and Experience Constraints

- **FR-052**: The MVP MUST serve one user without requiring or offering account
  creation, sign-in, or user switching.
- **FR-053**: MVP data MUST remain available across normal product sessions in
  the same browser profile while site storage remains available. ORBIT MUST
  request persistent storage when the browser supports that request, MUST
  clearly communicate that data is local to the current device/browser profile,
  and MUST surface persistence failures rather than report a failed write as
  successful. This guarantee MUST NOT claim protection from explicit site-data
  deletion, browser or operating-system storage eviction, private/incognito
  session lifecycle, or browser-profile deletion/reset.
- **FR-054**: The MVP MUST NOT synchronize planning or historical data between
  devices and MUST make the device-local boundary understandable to the user.
- **FR-055**: The product MUST support complete primary journeys on desktop and
  mobile layouts without removing essential information or actions.
- **FR-056**: Related desktop and mobile layouts on the same device MUST use the
  same product semantics and data.
- **FR-057**: When ORBIT presents completion, planned-load, daily-state, or
  missed-routine information, its wording MUST be factual and neutral rather
  than punitive, praising, alarmist, or unsupported. Planned-load presentation
  MUST NOT imply an automatic overload classification.
- **FR-058**: Status MUST remain understandable without relying on color alone,
  and all primary actions MUST be operable by keyboard and touch.
- **FR-059**: The default product language MUST be Russian, consistent with the
  approved ORBIT design context.

### Design and UX Context

- Approved ORBIT Open Design prototypes for Weekly Dashboard, Daily View, and
  History, together with the ORBIT Design System and DESIGN.md, are the primary
  MVP visual and interaction references. Product behavior defined by this
  specification takes precedence when a prototype conflicts with the approved
  semantics. Workout Session remains design context but is outside MVP behavior.
- Daily Score and Weekly Progress MUST follow the approved presentation in
  FR-034 and FR-048. The ban on automatic overload inference and hidden or
  configurable load/capacity/overload thresholds is independent of score visual
  semantics.
- The approved general History layout, Month calendar, selected-day details, and
  applicable Dynamics section remain the interaction reference; workout-history
  layers, tabs, and data are omitted from the MVP even if an older prototype
  still shows them.
- The approved design direction requires a responsive product rather than a
  scaled desktop view, with essential content and actions preserved on mobile.
- Product feedback MUST use concrete, non-judgmental language and MUST explain
  aggregate results rather than presenting opaque numbers.
- Touch targets, visible focus, keyboard access, non-color status cues, readable
  contrast, and reduced-motion behavior are required parts of the experience.
- The prototype's tasks-50%/habits-30%/state-20% score, fixed capacity, workout
  functionality, and implied synchronization behavior are superseded by this
  specification.
- Any significant departure from the approved design references MUST be explicit
  and reflected in the specification or the governing design artifact.

### Key Entities

- **Planning Owner**: The single local user whose plans and history are stored on
  the current device without an account.
- **Week**: The fixed local-calendar Monday–Sunday grouping identified by its
  Monday date, containing goals, dated occurrences, daily records, and an
  optional reflection before completion. Each day belongs to exactly one week;
  weeks cannot overlap or be duplicated.
- **Weekly Goal**: Free-form descriptive text ordered within its calendar week.
  Leading and trailing whitespace is trimmed before persistence; a retained value
  contains at least one non-whitespace character, while internal whitespace and
  content is otherwise preserved. It has no independently edited progress value
  or numeric contribution to score, and ORBIT does not validate measurability.
- **Day**: A dated planning and execution period belonging to exactly one week,
  with an open or immutable closed lifecycle state. An open day is eligible for
  closure only when `date <= currentLocalDate`.
- **Task**: A unit of planned work with duration, current placement, completion
  checkbox state, actual outcome, and change history. While its day is open,
  completion is reversible and does not block editing or permanent deletion;
  movement requires an incomplete task. Cancellation exists only as a Close Day
  disposition.
- **Recurrence Rule**: A definition that determines future applicable dates for
  a recurring task or habit, including an optional inclusive end date.
- **Task Occurrence**: A separately identifiable logical task instance whose
  identity persists across dated and backlog movement, with its own planned
  values, duration, current placement, outcome, and closure disposition.
- **Task Plan Membership**: The unique historical and scoring membership for one
  task occurrence on one local date, created by its first committed dated
  placement and reused if the occurrence returns to that still-open date. Task
  deletion excludes it only while its day remains open; closure makes it
  immutable.
- **Task Event**: A dated record of creation, edit, movement, backlog placement,
  backlog scheduling, completion checkbox changes, deletion, or Close Day
  disposition. Events explain history but do not create scoring memberships.
- **Backlog**: The undated collection of explicitly deferred tasks from which
  the user can later assign a task to an open date. Backlog tasks may be edited,
  permanently deleted, or scheduled, but have no completion or ordinary cancel
  control; display uses stable creation order, oldest first, with no manual sort
  or reorder control.
- **Habit Definition**: A recurring behavior and its recurrence rule.
- **Habit Occurrence**: A separately identifiable dated instance that is pending
  until explicitly marked completed or not completed, and that automatically
  becomes not completed if still pending when its local date ends. While its day
  remains open, that automatic result may be explicitly corrected to completed,
  with both events retained in history.
- **Daily State Entry**: The user's dated self-report for energy, mood, and sleep;
  it provides context but no score contribution.
- **Daily Score**: The explainable 70% task and 30% habit aggregate, normalized
  over applicable categories and finalized at day closure.
- **Weekly Progress**: The explainable 70% weekly task and 30% weekly habit
  aggregate, normalized over applicable categories and finalized at week
  completion.
- **Planned Load**: The sum of task durations scheduled for a day, preserved as a
  closure snapshot and never compared with a capacity or overload threshold.
- **Day Closure**: The explicit closure event for an eligible open day whose date
  is not later than the current local date, including the disposition of every
  unfinished task. Eligible days close independently rather than chronologically.
- **History View**: The read-only Day, Week, or Month presentation anchored to a
  local date, with deterministic period navigation, Month calendar and
  selected-day details, applicable Dynamics, and no workout-history functionality.
- **Weekly Reflection**: Notes associated with review of a week before it becomes
  immutable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

For SC-001, SC-002, SC-003, and SC-010, manual usability acceptance MUST use the
production build with one representative target user or the product owner. The
written task instruction MUST be shown before timing; timing starts when the
instruction is presented and the participant can begin interacting, and stops
when the required visible outcome is achieved. After timing starts, the moderator
MUST NOT provide UI guidance or hints; ordinary clarification of the written task
is allowed only when it does not explain how to use ORBIT. UI assistance fails a
criterion stated as without assistance, and exceeding a specified time fails that
timed criterion. Evidence recorded outside ORBIT MUST include the task, elapsed
time, pass/fail result, and any assistance. ORBIT MUST NOT add analytics,
telemetry, accounts, or a backend solely to collect this evidence.

- **SC-001**: Under the MVP manual usability protocol, the participant can
  create a weekly goal, add and assign tasks with durations, complete a task,
  and reach day closure without UI assistance.
- **SC-002**: Under the MVP manual usability protocol, the participant can create
  a representative weekly plan containing three goals and ten tasks in 10
  minutes or less.
- **SC-003**: Under the MVP manual usability protocol, the participant can
  perform each applicable operation—create a task, or edit, check completion,
  uncheck completion, move, or delete an existing task—from an applicable current
  view in 30 seconds or less, with each operation timed independently.
  Cancellation is evaluated only as a Close Day disposition, not as a standalone
  task-card operation.
- **SC-004**: In 100% of day-closure validation scenarios, every unfinished task
  receives one of the four allowed dispositions and zero unfinished tasks are
  silently moved; every move-to-date destination differs from the closing date
  and is a valid open day; closure before the local date ends is rejected while
  any applicable habit remains pending; every future-day closure is rejected;
  and an older open day does not block a later independently eligible day.
- **SC-005**: In 100% of recurrence tests, an occurrence edit or deletion affects
  only that occurrence; an inclusive matching end date produces an occurrence;
  a rule change leaves past and the already formed current-day occurrence
  unchanged, starts on the next date, preserves individually edited future
  exceptions, and updates only unmodified future occurrences; and multiple
  same-day changes retain only the final rule for the next-date boundary.
- **SC-006**: In 100% of score tests, ORBIT applies the 70%/30% formula, correctly
  normalizes a missing category, excludes daily state, and shows no score when
  neither category applies; exact half-percentage ties round upward; every habit
  still pending at its local-date boundary becomes not completed independently
  of closure; and an explicit correction while the day remains open updates the
  live score while preserving both events in history.
- **SC-007**: In 100% of planned-load tests, the displayed open-day load equals
  the sum of current scheduled-task durations and the closed-day snapshot
  remains unchanged after dispositions.
- **SC-008**: In 100% of cross-view consistency tests, a current task, habit,
  state, score, or load change, including checking or unchecking task completion,
  produces the same current value wherever shown.
- **SC-009**: In 100% of historical-integrity tests, completed days and weeks
  reject modification, reopening, and lifecycle undo, and their planned and
  actual records remain distinguishable.
- **SC-010**: Under the MVP manual usability protocol, the participant can use
  Day, Week, or Month History navigation to locate a requested prior period,
  task, habit occurrence, score, weekly progress, load, or reflection in 30
  seconds or less.
- **SC-011**: A user can begin using ORBIT without creating an account, return in
  a later normal session to the same browser profile while site storage remains
  available, and recover the previously recorded data. In 100% of simulated
  persistence-failure scenarios, ORBIT reports the failure and does not present
  the failed write as saved.
- **SC-012**: All primary journeys can be completed at the approved mobile,
  tablet, and desktop viewport sizes without horizontal scrolling or loss of an
  essential action.
- **SC-013**: All primary journeys can be completed with keyboard-only input and
  with touch; status and outcomes remain understandable without color or motion.
- **SC-014**: Content review finds punitive, shaming, alarmist, or unsupported
  praise in 0% of presented low-completion, planned-load, missed-habit, and
  low-state copy, and finds zero automatic overload classifications or proactive
  overload warnings.
- **SC-015**: In 100% of weekly-progress tests, ORBIT applies equal task weights,
  creates no more than one task-plan membership per logical occurrence and local
  date, reuses that membership on A → B → A returns, preserves every other
  moved-away or canceled membership as incomplete, excludes every membership on
  a still-open day when its logical task occurrence is permanently deleted,
  preserves closed-day memberships unchanged, uses applicable habit occurrences,
  applies the 70%/30% category weights with missing-category normalization, and
  rounds the result to the nearest whole percentage with exact half-percentage
  ties rounded upward.

## Assumptions

- ORBIT serves one individual planner on one device; shared plans, team roles,
  accounts, user switching, and cross-device synchronization are outside this
  feature.
- Calendar planning uses fixed local-calendar Monday–Sunday weeks. Every local
  date belongs to exactly one such week, identified by its Monday start date.
- Recurrence in the MVP is weekday-based, with an effective start date and an
  optional inclusive end date or stop action. More complex interval rules are
  outside this feature.
- Energy and mood are self-reported on a clearly labeled five-point ordinal
  scale; sleep is recorded as a duration. These values are reflective context,
  not medical assessment.
- Scheduled task duration is recorded in minutes; backlog tasks may omit a
  duration until assigned to a date.
- Deleting a dated occurrence is permitted only while its day and week remain
  open. An undated backlog task may be permanently deleted as defined by FR-010.
  For a task occurrence, deletion is final, affects applicability as defined by
  the scoring requirements, and remains explainable through task-event history.
- ORBIT does not automatically remove device-local records. Persistence is
  evaluated in normal sessions within the same browser profile while site
  storage remains available; explicit site-data deletion, storage eviction,
  private/incognito lifecycle, and profile deletion/reset are platform/user
  boundaries outside the persistence guarantee.
- The Open Design prototypes guide interaction and presentation but do not
  override the explicit product rules in this specification.
- Social features, gamification, coaching, workouts, nutrition tracking, medical
  advice, external calendar integrations, and advanced predictive analytics are
  outside this feature.

## Scope Boundaries

### In Scope

- The complete plan → execute → record → review → adjust loop for weekly and
  daily personal planning.
- Descriptive weekly goals, dated task and habit occurrences, task durations,
  daily planned load, the 70%/30% daily score, derived weekly progress, explicit
  closure, immutable history, weekly reflection, and responsive device-local
  use.

### Out of Scope

- Workouts, exercises, sets, workout history, and reuse of previous workout
  results.
- Arbitrary, overlapping, or duplicate user-created week ranges.
- Manual backlog sorting or reordering, and user-facing backlog sort controls.
- Standalone task cancellation outside the Close Day workflow.
- Accounts, sign-in, user switching, multi-device synchronization, and
  collaborative planning.
- Reopening or modifying closed days and completed weeks.
- Partial completion outcomes for tasks or habits.
- A configurable daily-capacity target, hidden overload threshold, automatic
  overload classification, or proactive overload warning.
- Public profiles, social comparison, punitive streak mechanics, automated
  coaching, medical interpretation, nutrition management, and predictive
  recommendations.
- Implementation technology, architecture, deployment model, or integration
  protocol decisions.

## Dependencies

- The 2026-08-11 serialized read-only Open Design reconciliation and explicit
  product-owner approval are recorded in `design-reconciliation.md`; the pre-UI
  gate is complete. `spec.md` governs behavior/data semantics,
  `contracts/ui-routes.md` governs explicit UI/prototype overrides, and
  `DESIGN.md` governs the canonical visual system. Open Design prototypes are
  reference material only where they do not conflict.
- The MVP usability protocol MUST be recorded and product-owner approved before
  affected UI/component/browser work or manual usability acceptance begins.
- No runtime service, third-party integration, or implementation dependency is
  defined by this specification.
