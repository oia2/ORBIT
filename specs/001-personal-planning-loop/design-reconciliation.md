# Open Design Reconciliation Record

**Feature**: `001-personal-planning-loop`  
**Gate**: Serialized pre-UI reconciliation  
**Status**: PASSED — fresh source reconciled and product-owner approval recorded

## Latest serialized read-only attempt

| Field | Value |
|---|---|
| Attempt time | 2026-08-11T05:45:33Z |
| Operation | Listed Open Design projects, selected the project linked to this repository, listed its files, and pulled the current Weekly Dashboard, Daily View, History, shared-flow, and ORBIT design-system bundles read-only and sequentially |
| Result | Source pull succeeded; every requested bundle reported `truncated: false` |
| Project | `d2947ccd-a591-41df-bf13-ea7f41e2f3eb` — `Личная операционная система` |
| Repository link | `C:\Projects\harness-sdd-lab` |
| Observed project snapshot | `updatedAt=2026-08-10T06:34:41.088Z`; project status `succeeded` at `2026-08-10T06:34:40.473Z` |
| Related design-system project checked | `brand-product-ae9c9b` — `Product`, `designSystemId=user:product`, `updatedAt=2026-08-07T09:15:19.954Z` |
| Mutation | None; only Open Design list/get operations were used |

Open Design does not expose an immutable project revision for this snapshot. Its
project status named run `1952702a-e6f1-471a-bbe3-e33ddc9c36f3`, but the
supplemental read-only run lookup returned exactly:

```text
daemon 404 on http://127.0.0.1:51982/api/runs/1952702a-e6f1-471a-bbe3-e33ddc9c36f3: {"error":{"code":"NOT_FOUND","message":"run not found"}}
```

Consequently, the source observation is versioned below by the exposed project
timestamp, artifact manifest version/timestamp, and file modification timestamp;
the missing run is not treated as an inferred source version.

## Pulled source inventory

| Required source | Open Design identifier | Exposed version evidence | Availability |
|---|---|---|---|
| Weekly Dashboard | `weekly-dashboard-v2.html` | Manifest v1, `complete`, manifest `updatedAt=2026-08-07T09:36:45.558Z`; file `mtime=2026-08-09T08:42:06.763Z` | Full bundle available |
| Daily View | `daily-detail-v2.html` | Manifest v1, `complete`, manifest `updatedAt=2026-08-07T09:38:24.836Z`; file `mtime=2026-08-09T08:52:05.472Z` | Full bundle available |
| History | `history.html` | Manifest v1, `complete`, manifest `updatedAt=2026-08-07T09:47:33.322Z`; file `mtime=2026-08-09T08:20:18.385Z` | Full bundle available |
| Shared flow behavior | `orbit-flow-v2.js` | `mtime=2026-08-09T08:52:05.474Z` | Included in all three current screen bundles |
| Shared flow styling | `orbit-flow-v2.css` | `mtime=2026-08-09T08:37:14.649Z` | Included in all three current screen bundles |
| Shared tokens | `orbit-tokens.css` | `mtime=2026-08-07T08:58:29.668Z` | Included in the screen and design-system bundles |
| ORBIT component reference | `orbit-design-system.html` | Manifest v1, `complete`, manifest `updatedAt=2026-08-07T08:58:29.669Z` | Full executable bundle available with `life-os.css`, `life-os.js`, and tokens |
| ORBIT written design contract | `DESIGN.md` | Source `Version: 0.1`; file `mtime=2026-08-07T09:08:47.014Z` | Full file available; normalized content matched repository `DESIGN.md` at pull time. The governing repository contract was then reconciled as version 0.2 with the approved authority and score presentation |
| ORBIT design-system plugin provenance | `plugin-source/orbit-design-system-msiq61l3/open-design.json` and `references/provenance.json` | Plugin `0.1.0`; candidate `b2b94ce5-b1eb-4ea7-806c-cc86ea9650b9`; provenance run `f60fefb9-fd8a-4af7-b8d5-a70ba460ee5e` | Available |
| Imported design-system source copy | Project `brand-product-ae9c9b`, `assets/DESIGN.md` | `mtime=2026-08-07T09:13:11.988Z` | Full file available; exactly matches the ORBIT `DESIGN.md` returned by the linked screen project |
| Imported design-system generated summary | Project `brand-product-ae9c9b`, top-level `DESIGN.md` | `mtime=2026-08-07T09:13:16.310Z` | Available but titled `Product` and generated as a white/Inter/blue generic brand; it is not the approved ORBIT contract |

## Reconciliation against governing artifacts

`spec.md` remains authoritative for behavior and data semantics;
`contracts/ui-routes.md` already records the known prototype overrides. The
fresh source confirms the following current state.

| Area | Fresh Open Design evidence | Governing contract and disposition |
|---|---|---|
| Daily Score and Weekly Progress calculation | `orbit-flow-v2.js` calculates both aggregates from tasks 50%, habits 30%, and state 20%; the design-system example repeats that formula | Superseded by the specification's shared 70% task / 30% habit policy, missing-category normalization, half-ties-upward rounding, and exclusion of state |
| Score presentation | Daily View renders one numeric percent in an orbit, threshold-colored status (`>=70`, `50–69`, `<50`) and text labels; Weekly Dashboard keeps its primary orbit accent/neutral while threshold-coloring daily bars; `DESIGN.md` defines the same threshold bands globally | Approved: both show numeric percentage and task/habit counts or rates. Daily Score uses `>=70` good, `50–69` neutral/warning, `<50` low. Weekly Progress keeps its primary aggregate orbit accent/neutral; daily bars may use those thresholds. No additional textual score label is required |
| Planned load | Daily View fixes capacity at `360`, shows planned/capacity, reserve, an `is-over` class, and overload copy | Must be reduced to factual scheduled-task duration only, with no capacity value, hidden/configurable threshold, automatic classification, or proactive warning |
| Weekly goals | Weekly Dashboard asks for a measurable criterion and renders independent numeric goal progress | Weekly goals remain descriptive free-form text with CRUD/reorder only; there is no measurability validator or independently editable progress |
| Task lifecycle and closure | Ordinary task editing has no cancel action, but Close Day preselects the first select option, `Перенести на завтра`, and offers only tomorrow rather than an explicit date | Cancellation remains Close-Day-only, but the preselected tomorrow shortcut conflicts with no-default disposition and explicit different open-date selection requirements |
| Workout scope | Week, Day, mobile navigation, History tabs, History details, and shared behavior contain workout functionality | Omit every workout route, command, navigation item, History layer/tab, and workout datum |
| Device persistence | Shared behavior writes prototype state through `localStorage` | IndexedDB in one browser profile/device remains required; there is no account or synchronization claim |
| Design-system identity | The linked screen project contains the titled/versioned ORBIT plugin and exact ORBIT contract. A separate imported `user:product` project retains that ORBIT contract only as `assets/DESIGN.md`, while its generated top-level summary changes to a generic light `Product` brand | The generic generated summary conflicts with ORBIT's canonical graphite, font, and accent rules and must not govern implementation. The exact ORBIT contract and linked project's ORBIT plugin remain the applicable references |
| History mode switch | The source keeps a static May calendar/selected DOM day, changes only a hard-coded period title, resets `historyOffset` to zero on every mode switch, and does not derive an anchor from the selected date | Approved: preserve `selectedDate`, set `anchorDate` to it, and change only scale; Day shows it, Week its containing Monday–Sunday week, and Month its containing month |
| Unequal-month selected day | Previous/next only changes one of three hard-coded labels; it does not regenerate a calendar or handle a missing day number | Approved: clamp to the destination month's last valid day, make that the actual `selectedDate`, and retain no hidden preferred day-of-month |
| Dynamics | History always presents fixed Overview, Tasks, and Workouts tabs for the last eight weeks, independent of Day/Week/Month mode | Approved: none in Day; last eight weeks in Week; last six months in Month; metrics only task completion rate, habit completion rate, and specification-defined 70/30 score. No workout, state analytics, correlations, generated insights, invented metrics, or other analytics |
| Recurring-task insertion | The prototype stores a repeat label on a task and generic `createTask` appends a newly created row, but it has no future-occurrence materialization operation | Approved: append each newly materialized recurring occurrence to the end of its date's ordered task list, change no existing order, and introduce no implicit sorting |

The fresh read confirms that the specification's 70/30 scoring policy, daily
state as context only, fixed Monday–Sunday weeks, factual load, simplified
checkbox lifecycle, Close-Day-only cancellation, Day/Week/Month History, and
workout omission override prototype behavior. The unrelated generic `Product`
summary does not replace the canonical ORBIT visual contract.

## Product-owner decisions and approval (2026-08-11)

The product owner explicitly approved the six resolutions recorded in the table
above and these prototype deviations: specification 70/30 task/habit scoring in
place of 50/30/20; state excluded from score; factual scheduled-task duration
with no capacity, overload threshold, automatic load classification, or proactive
warning; descriptive free-form weekly goals with no numeric progress or
measurability validator; IndexedDB instead of prototype `localStorage`; complete
workout omission; no default Close Day disposition; and an explicit valid target
date for carrying an unfinished task forward.

The governing authority is: constitution for project/process obligations;
`spec.md` for behavior and data semantics; `contracts/ui-routes.md` for explicit
UI/prototype overrides; `DESIGN.md` for the canonical visual system; and Open
Design prototypes only where they do not conflict with those artifacts.

All affected governing artifacts encode these resolutions. T001 therefore passes
on 2026-08-11 and dependent visual, component, browser-journey, and other UI work
may proceed. These approvals are exact and do not authorize additional metrics,
analytics, sorting, score states, or prototype behaviors.

## Positive visual invariants and remediation decisions (2026-08-13)

The product owner accepted the forensic visual audit and confirmed that T001's
source acquisition remains valid. The earlier pass settles prototype conflicts;
it does not substitute for rendered visual-conformance evidence. The following
non-conflicting invariants remain mandatory for T105:

| Area | Positive visual invariant |
|---|---|
| Shared shell | Preserve the approved 220px desktop rail, orbital brand, navigation rhythm, content bounds/gutters, composed page headers, and bottom-of-rail persistence status. |
| Day | Preserve the approved asymmetric page hierarchy: factual planning/load region, compact task surface, one primary Daily Score orbit, habits, state, explicit Close Day, and intentional empty/data-present states. |
| Week | Preserve one dominant Weekly Progress orbit, daily-result visualization, task/habit summaries, descriptive goals, compact contextual actions, and intentional empty/data-present states. |
| History | Preserve integrated period navigation and mode switch, an aligned month calendar, adjacent selected-day detail on desktop, factual historical rows, and static-readable Dynamics charts/cards. |
| ORBIT system | Preserve canonical typography, graphite palette, borders, radii, spacing, restrained accent use, control treatment, and one primary orbital gesture per applicable screen. |

The product owner resolved every open remediation choice as follows:

1. The canonical MVP navigation order is Today, Week, Backlog, History. Backlog
   replaces the reference Workouts destination.
2. Remove the full-width persistence banner. Normal ready state shows
   `Сохранено на устройстве` with non-color indication at the rail bottom and an
   accessible info/details affordance for the full locality disclosure. Storage
   failures remain prominent errors.
3. Keep the approved Daily planning/load region and prominence, but show only
   factual scheduled-task values such as duration, task count, or an already
   specified factual schedule range. Never show capacity, reserve, utilization,
   overload, thresholds, or a capacity-implying progress bar.
4. Keep goals descriptive and visually integrated. Goal CRUD remains available
   through compact/contextual actions; numeric progress and button walls remain
   prohibited.
5. Keep the approved History Dynamics hierarchy and chart/card composition, but
   visualize only task rate, habit rate, and the specification-defined 70/30
   score. Workouts and all additional analytics remain prohibited.

T105 was reopened because its former evidence contained no retained rendered
comparison. T106 is stale until T105 passes again. T103 and T104 retain their
historical records but must be rerun after remediation; T107-T110 remain blocked.

## Post-remediation gate status (2026-08-13)

T103 and T104 were rerun against the remediated production build. T105 now
passes with frozen reference, actual baseline, embedded comparison, deterministic
viewport/seed/clock/build provenance, difference classifications, and a guarded
16-check visual suite. T106 was rerun after that stable visual gate and passes.
T107–T110 remain blocked and no manual accessibility, usability, or release
approval is inferred from these automated results.
