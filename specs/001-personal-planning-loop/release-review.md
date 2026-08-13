# Release visual-conformance review

**Reviewed**: 2026-08-13 (post-remediation rerun)  
**Scope**: T105 against the frozen Open Design sources, approved reconciliation,
`DESIGN.md`, and the actual deterministic production preview  
**Result**: PASS — T105 complete; no manual product-owner approval is claimed

## Evidence boundary

T105 was reopened because the prior record had no retained rendered comparison.
The replacement gate was established before UI repair and initially failed all
16 checks: 13 captures had no approved baselines and three page/shell geometry
checks lacked their required design hooks. No image from the broken UI was
accepted.

The completed evidence consists of:

- immutable Open Design sources, metadata, hashes, and deterministic reference
  renders in [`visual-reference`](visual-reference/open-design/MANIFEST.md);
- deterministic populated/empty IndexedDB fixtures and a fixed application
  clock (`2026-05-20T05:00:00Z`, 12:00 `Asia/Krasnoyarsk`);
- 13 committed full-page application baselines covering the seven required
  desktop states and populated Day/Week/History at 820px and 390px;
- three structural checks for rail geometry, primary page composition, priority
  order, and horizontal overflow;
- the retained build/revision, viewport, seed, capture, and SHA-256 manifest in
  [`visual-evidence/2026-08-13/README.md`](visual-evidence/2026-08-13/README.md);
- the seven-state reference/actual comparison, embedded plates, and difference
  classifications in
  [`visual-evidence/2026-08-13/comparison.md`](visual-evidence/2026-08-13/comparison.md).

The reviewed baseline-creation run passed 16/16. A subsequent run without
update authority also passed 16/16 with a maximum allowed pixel-difference ratio
of 0.002. A negative control proved that `--update-snapshots` without the review
token fails before replacement; the tested baseline hash remained unchanged.

Functional journeys, axe, responsive overflow, component tests, and
`npm run verify` remain separate gates and are not used as substitutes for this
visual result.

## Required rendered states

| Required state | Retained comparison | Result |
|---|---|---|
| Shared shell, desktop 1440x900 | [Shell plate and matrix row](visual-evidence/2026-08-13/comparison.md#shared-shell) | PASS |
| Day populated, desktop 1440x900 | [Day populated plate](visual-evidence/2026-08-13/comparison.md#day--populated) | PASS |
| Day empty, desktop 1440x900 | [Day empty plate](visual-evidence/2026-08-13/comparison.md#day--empty) | PASS |
| Week populated, desktop 1440x900 | [Week populated plate](visual-evidence/2026-08-13/comparison.md#week--populated) | PASS |
| Week empty, desktop 1440x900 | [Week empty plate](visual-evidence/2026-08-13/comparison.md#week--empty) | PASS |
| History Month populated, desktop 1440x900 | [History populated plate](visual-evidence/2026-08-13/comparison.md#history-month--populated) | PASS |
| History Month empty, desktop 1440x900 | [History empty plate](visual-evidence/2026-08-13/comparison.md#history-month--empty) | PASS |
| Day/Week/History populated, tablet 820x1180 | [Responsive manifest](visual-evidence/2026-08-13/README.md#responsive-actual-baseline-manifest) | PASS |
| Day/Week/History populated, mobile 390x844 | [Responsive manifest](visual-evidence/2026-08-13/README.md#responsive-actual-baseline-manifest) | PASS |

Open Design contains no distinct empty-state capture for Day, Week, or History.
Those rows compare the required empty rendering with the corresponding approved
page composition and the frozen ORBIT card/empty-state grammar. This limitation
is recorded rather than converted into fabricated source approval.

## Material differences and classifications

All remaining material differences from the raw prototype are
`APPROVED_DEVIATION` and trace to the approved reconciliation:

- Shell: Backlog replaces Workouts; the ready persistence disclosure uses the
  exact compact `Сохранено на устройстве` status plus discoverable details.
- Day: the capacity card is semantically replaced by a factual duration/count
  load card; score is 70% tasks/30% habits with state excluded; workout content
  is removed; Close Day is explicit.
- Week: Weekly Progress is the required live/finalized 70/30 aggregate; goals
  are descriptive; workout content is absent; specification-required day
  planning is a compact, mostly collapsed supporting section instead of seven
  equal CRUD cards.
- History: selection/period behavior follows the approved Day/Week/Month rules;
  Dynamics is absent in Day and limited to eight weeks/six months with task
  rate, habit rate, and 70/30 score; workout and invented analytics are absent.
- Empty states: required first-use states apply canonical ORBIT card and empty
  grammar because no separate prototype capture exists.

No remaining difference is classified as `IMPLEMENTATION_DEFECT`,
`DESIGN_RECONCILIATION_DEFECT`, `MISSING_ACCEPTANCE_GATE`, or
`UNCERTAIN_REQUIRES_PRODUCT_OWNER`. No specification was changed to legitimize
the former UI.

## Corrected visual defects

- Shared foundation: canonical tokens and typography, 220px/88px/floating-nav
  shell, orbital brand, gutters/content bounds, page headers, controls, compact
  action disclosures, cards, rows, OrbitMetric, and responsive priority order.
- Day: composed date header, factual load card, compact tasks, primary score
  orbit, habits, separate contextual state, explicit Close Day, and designed
  populated/empty states.
- Week: composed period controls, dominant neutral progress orbit, live/frozen
  70/30 summary, semantic daily bars, habit matrix, integrated descriptive goals,
  and a collapsed supporting planner rather than a seven-column CRUD wall.
- History: active-period header and integrated scale control, aligned calendar
  including adjacent-month cells, adjacent selected-day detail, factual task and
  habit rows, three-series static Dynamics charts, and a composed no-data state.

## Corroborating reruns

- T103 production-preview journey matrix: 33/33 passed across desktop Chromium,
  tablet WebKit at 820px, and mobile WebKit at 390px.
- T104 post-remediation content audit: current in
  [`content-review.md`](content-review.md); the final verification coverage phase
  passed 61 test files and 416 tests.

These results corroborate stability but do not supply the visual pass above.
T106 was rerun against this stable implementation and passed; its evidence is
recorded in [`architecture-review.md`](architecture-review.md). T107–T110 remain
blocked by their declared dependency order; no manual accessibility or
usability evidence is asserted here.
