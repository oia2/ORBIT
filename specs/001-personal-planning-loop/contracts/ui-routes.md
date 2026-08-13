# Contract: Routes, Responsive Shell, and UX States

**Authority**: The constitution governs project/process obligations; `spec.md`
governs behavior/data semantics; this contract governs explicit UI/prototype
overrides; `DESIGN.md` governs the canonical visual system; and Open Design
prototypes are references only where they do not conflict. Workout Session has
no MVP route or History layer.

## 1. Canonical routes

| Route | Responsibility | Editable state |
|---|---|---|
| `/` | Redirect to `/week/:weekStart` for the Monday containing `currentLocalDate` | N/A |
| `/week/:weekStart` | Plan/review one unique fixed Monday–Sunday week, goals, day summaries, outcomes, Daily Score/Weekly Progress, load, state, reflection | Open-period records only; completed week read-only |
| `/day/:date` | Plan/execute/review one day and explicit closure | Open day only; closed day read-only |
| `/backlog` | Oldest-first undated holding area with edit/delete/schedule actions | Active backlog items only |
| `/history` | Read-only Day/Week/Month History; first entry is current Month/current-date anchor | Never editable |
| `*` | Neutral Russian not-found state with return to current period | N/A |

`weekStart` is a valid Monday local date. A valid non-Monday value redirects to
its containing Monday; malformed/impossible dates render not-found. `date` is a
valid local date. Ensuring a missing canonical week is internal/idempotent; the
UI never creates, names, or selects an arbitrary/overlapping week range.

Task editor, recurrence editor, day closure, and week completion are page-scoped
dialogs. Open and historical states use the same canonical dated routes; lifecycle
controls actions.

## 2. Page/feature ownership

| Page | Feature slices it composes |
|---|---|
| Week | `manage-week` goals, `manage-task`, `manage-habit`, `complete-week` |
| Day | `manage-task`, `manage-habit`, `record-daily-state`, `close-day` |
| Backlog | `manage-task` edit/delete/schedule only |
| History | Read-only planning projections; no mutation feature |

Pages load/re-query one aggregate after a committed command. Feature models own
user intent/dialog orchestration; `entities/planning` owns product policy;
`shared/ui` remains product-agnostic.

Weekly goals trim leading and trailing whitespace before persistence, reject a
whitespace-only result, otherwise preserve internal whitespace/content, and
expose create, edit/rename, reorder, and delete. There is no measurability
validator or numeric progress control.

On an open dated task, the completion checkbox can be checked/unchecked; editing
and permanent deletion remain available while checked. Movement remains disabled
with an explanation until unchecked. Ordinary task cards/forms never expose
cancellation. Backlog exposes no checkbox, cancel, reorder, sort, or filter and
renders immutable creation order oldest first. Ordinary move-to-date choices
exclude the current source date and every closed date.

## 3. History interaction

- First entry derives `currentLocalDate`, selects Month mode, shows the current
  calendar month, and selects the anchored date.
- Day/Week/Month mode controls are visible and keyboard/touch operable.
- Switching mode preserves `selectedDate`, sets `anchorDate` to it, and changes
  viewing scale only. Day shows that date, Week its containing Monday–Sunday
  week, and Month its containing calendar month.
- Previous/next changes the displayed period by exactly one local day, one fixed
  Monday–Sunday week, or one calendar month according to the active mode.
- Day and Week show their full specified facts. Month shows its calendar and a
  selected-day details panel.
- Month navigation clamps a missing selected day number to the destination
  month's last valid day. That clamped date becomes the actual `selectedDate`;
  no hidden preferred day-of-month is retained.
- Day History has no Dynamics. Week History shows the last eight weeks and Month
  History the last six months. Dynamics uses only task completion rate, habit
  completion rate, and the specification-defined 70/30 score; it has no workout
  data, state analytics, correlations, generated insights, invented metrics, or
  other analytics.
- Finalized facts are read-only. History has no edit controls, workout layer,
  workout tab, or workout data.
- The same facts remain understandable at every responsive layout.

These History decisions were explicitly approved by the product owner on
2026-08-11 and are recorded in `design-reconciliation.md`.

## 4. Recurrence editor

The editor labels the optional end date inclusive and states the concrete next
effective date derived from the clock. It explains that past/current-day and
explicit future exceptions remain unchanged. It offers no caller-selected
effective date. Repeated same-day edits update the same pending next-date version.
If midnight changes the effective date between review and confirmation, refresh
the explanation and require confirmation against the new date.

## 5. Responsive shell

Use the reconciled `DESIGN.md` breakpoints:

| Width | Contract |
|---|---|
| `>=1051px` | 220px desktop rail; approved multi-column layouts |
| `721–1050px` | 88px compact rail; intentional collapsed layouts |
| `<=720px` | Fixed bottom navigation, 16px gutters, stacked priority content |

Essential actions/explanations remain at every breakpoint. Verify no horizontal
page scroll at `360, 390, 430, 600, 768, 820, 1024, 1366, 1440, 1920` CSS pixels.
The shell exposes, in canonical order, Today, Week, Backlog, and History only.
Backlog occupies the approved reference rail position that previously linked to
the out-of-scope Workouts destination. Russian is default.

In the normal ready state, the rail footer presents the non-color status text
`Сохранено на устройстве` and an accessible info/details affordance for the full
device/browser-profile persistence disclosure. The full disclosure remains
discoverable without permanently displacing the application layout. Persistence
failures remain prominent error states and never collapse into the passive footer.

## 6. Required page states

Every persistence-reading route defines initialization, loading, first-use empty,
data-present, validation failure without draft loss, persistence/quota failure,
upgrade blocked, immutable state, and invalid/not-found state.

Storage copy identifies the browser-profile/device boundary and exclusions without
implying cloud backup/sync. Failed writes never render as saved. Closure/week
completion renders success only after commit.

Startup, resume, date rollover, and affected open-period navigation prepare habit
outcomes. A boundary miss appears not completed after catch-up. While the day is
open, the user can record a pending outcome and correct an automatic miss to
completed; the correction preserves both events.

## 7. Accessibility and copy

- Primary controls work with keyboard and touch and have at least a 44px target.
- Inputs keep visible labels; icon-only controls have accessible names.
- Focus is visible; dialogs manage entry, Escape where safe, and focus return.
- Status uses text/icon/number/position in addition to color.
- Daily Score and Weekly Progress visuals have adjacent counts/rates and consume
  the domain's rounded result without recalculation.
- Reduced-motion removes ambient/continuous motion without hiding state changes.
- Errors/loading announcements use appropriate live regions.
- Completion, load, state, and missed-routine copy is factual and neutral—never
  punitive, praising, alarmist, or unsupported.
- Planned load never triggers a configurable capacity comparison, hidden
  load/capacity/overload threshold, automatic overloaded/not-overloaded label, or
  proactive warning.

## 8. Day-closure interaction

1. Show Close Day only for an open `date <= currentLocalDate`; future days cannot
   begin/confirm closure. An older open day does not block another eligible day.
2. Show every unfinished task and any applicable pending habit.
3. Before the date ends, require every pending habit to be explicitly completed
   or not completed. After the boundary, show caught-up automatic misses.
4. Preselect no disposition/default.
5. Require exactly one visible choice per unfinished task: keep unfinished, move
   to selected date, move to backlog, or cancel.
6. Require a concrete open destination different from the closing date.
7. Keep confirm unavailable until all choices are valid and no habit is pending.
8. On conflict, preserve draft where possible, refresh facts, and request repair.
9. On committed success, show immutable review with score counts/rates, factual
   load snapshot, state, and dispositions.

Cancellation exists only in step 5 and has no later reactivation because the
successful closure immediately freezes the source day.

## 9. Weekly review

Review displays descriptive goals, planned/actual task/habit outcomes, daily
scores, factual loads, state context, reflection, and mandatory derived weekly
progress with contributing task/habit counts and rates. It never averages daily
percentages or derives progress from goals/state. After all seven days close,
explicit completion freezes reflection, counts/rates, and progress.

## 10. Design reconciliation

| Current reference implication | Specification contract |
|---|---|
| 50/30/20 tasks/habits/state | 70/30 tasks/habits; state excluded; missing category normalized |
| Fixed 360-minute capacity or load/overload threshold | Factual duration load only; no capacity, hidden load threshold, overload class/warning |
| Workout navigation/history | No workout route, data, command, navigation, History layer, or tab |
| localStorage/sync implication | IndexedDB in one browser profile/device; no account/sync |
| “Tomorrow” shortcut/default | Explicit selected open date; no automatic carry-forward |
| DESIGN score-color/status thresholds | Daily Score uses `>=70` good, `50–69` neutral/warning, `<50` low; Weekly Progress keeps a primary accent/neutral aggregate while daily bars may use those thresholds; numeric result and task/habit counts or rates remain visible |
| Sub-44px or color-only control | Accessibility requirements take precedence |

The primary Daily Score and Weekly Progress use the approved orbit composition;
Weekly Progress retains its required primary accent/neutral treatment. An orbit
cannot encode capacity or an unsupported classification. User-visible outcomes
never include `partial` or persistence-only recurrence markers.

The Daily planning/load region retains the approved prominence and card hierarchy
but presents factual scheduled-task values only. It has no capacity denominator,
reserve, utilization progress, threshold, overload classification, or proactive
warning. Weekly goals remain descriptive and use compact contextual CRUD actions,
never numeric progress. History Dynamics retains the approved chart/card hierarchy
while visualizing only task completion rate, habit completion rate, and the shared
70/30 score.

## 11. Serialized gate status

The full serialized read-only Open Design pull succeeded on 2026-08-11. The
source inventory, comparison, six explicit decisions, and product-owner approval
are recorded in `design-reconciliation.md`; the pre-UI gate has passed.

`usability-protocol.md` is already approved/recorded and must be used against the
production build for SC-001/002/003/010; it requires no product telemetry.
