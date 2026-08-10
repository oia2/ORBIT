# Open Design Reconciliation Record

**Feature**: `001-personal-planning-loop`  
**Gate**: Serialized pre-UI reconciliation  
**Status**: BLOCKED — source unavailable

## Latest read-only attempt

| Field | Value |
|---|---|
| Attempt date | 2026-08-10 |
| Operation | List available Open Design projects before pulling the approved ORBIT artifacts |
| Result | Failed |
| Recorded failure | `Transport closed` |
| Source version | Unavailable; no version may be inferred from stale local references |

The gate has not passed. Affected visual, component, browser-journey, and other
UI work must remain blocked. Toolchain, pure-domain, contract, and non-visual
adapter work may continue. The next attempt must be serialized and must not run
in parallel with dependent UI work.

## Required successful reconciliation

Before affected UI work begins:

1. Pull the current Weekly Dashboard, Daily View, History, shared flow assets,
   and ORBIT design-system artifacts read-only.
2. Record project/artifact identifiers, source versions, and availability.
3. Compare them with `DESIGN.md` and `spec.md`.
4. Record every significant deviation and obtain product-owner approval.
5. Update the governing specification or design artifact when required.

Known specification overrides to verify include the shared 70/30
scoring/calculation policy for the Daily Score and Weekly Progress, daily state as
context only, fixed Monday–Sunday weeks, factual load without a configurable or
hidden load/capacity/overload threshold or automatic overload classification, the
simplified checkbox task lifecycle, Close-Day-only cancellation, Day/Week/Month
History, and omission of workout navigation and workout-history layers.

The successful design read must also settle these presentation details before
their UI is implemented: Daily Score/Weekly Progress color/status/presentation semantics without
conflating them with prohibited automatic load/capacity/overload thresholds,
mode-switch anchor behavior, Month selected-day behavior when the prior day
number does not exist in the destination month, and the exact
applicability/presentation of Dynamics. It must also settle the initial
dated-list insertion position for a newly materialized recurring task; no
append/prepend/grouping default is approved by the specification.
