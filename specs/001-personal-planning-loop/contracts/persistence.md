# Contract: Device-Local Persistence

> **Superseded in part by feature 002 (`002-server-backed-persistence`), 2026-08-17.**
>
> The **storage mechanism** described here — the IndexedDB adapter, its stores
> and indexes, its transaction and database-lifecycle rules, and its
> storage-specific error codes (`StorageUnavailable`, `QuotaExceeded`,
> `UpgradeBlocked`, `UnexpectedStorageFailure`) — is replaced by
> `specs/002-server-backed-persistence/data-model.md` and
> `specs/002-server-backed-persistence/contracts/planning-api.md`. The
> IndexedDB adapter no longer exists in the codebase.
>
> The **domain semantics** in this document remain binding and unchanged:
> the `PlanningRepository` port and its named use cases, one transaction per
> boundary operation, fixed weeks and task membership, recurrence and
> habit-boundary rules, day/week finalization, history access, and optimistic
> concurrency by revision. Feature 002 preserves every one of them, and proves
> it by running this feature's repository suites against the new implementation
> (`specs/002-server-backed-persistence/traceability.md`).
>
> Sections that describe the mechanism rather than the domain — §2 Store
> contract, §8 Database lifecycle and concurrency, and the storage-error part of
> §9 — should be read as a record of what 001 shipped, not as a current
> constraint.

**Adapter**: IndexedDB via `idb` (superseded — see above)  
**Database version**: 1 for the initial schema

## 1. Architectural boundary

`entities/planning/model` defines a domain-oriented `PlanningRepository` port;
`entities/planning/api/indexeddb` implements it. The port is justified now by
domain/UI separation, atomic use-case commands, and adapter contract testing. It
does not design a future HTTP/API adapter.

The port exposes named queries/commands from `domain-commands.md`, never generic
`save<T>`, browser transactions, store names, or persistence DTOs. React imports
no `idb`, schema, migration, or adapter implementation.

## 2. Store contract

| Store | Key path | Indexes |
|---|---|---|
| `weeks` | `startDate` | none |
| `days` | `date` | `by-weekStart` on `weekStart` |
| `taskSeries` | `id` | none |
| `taskOccurrences` | `id` | unique `by-series-date` on `[seriesId, nominalDate]`; unique `by-created-sequence` on `createdSequence`; `by-placement-created` on `[placementKey, createdSequence]` |
| `taskPlanEntries` | `id` | unique `by-occurrence-date` on `[occurrenceId, date]`; `by-date`; `by-weekStart` |
| `taskEvents` | `sequence` auto-increment | unique `by-id`; `by-occurrence-sequence`; `by-series-sequence`; `by-effective-date-sequence` |
| `habitDefinitions` | `id` | none |
| `habitOccurrences` | `id` | unique `by-definition-date`; `by-date`; `by-weekStart` |

Stored `taskSeries.template`, `taskOccurrences`, and `taskPlanEntries.plannedSnapshot`
records may carry optional `startTime`/`endTime` strings (`"HH:MM"`) per FR-015a.
They are plain optional value properties on existing stores: they add no index and
require no schema version change, so records written before the field existed stay
valid and simply read back without it.

`placementKey` is `day:YYYY-MM-DD`, `backlog`, or `none`. Backlog queries use
the compound index prefix `backlog` and ascending `createdSequence`; UUID breaks
an impossible/corrupt equal-sequence tie. No backlog position or sort preference
is persisted.

The adapter assigns `createdSequence` by reading the highest value through the
unique creation index and allocating the next values inside the same serialized
`taskOccurrences` readwrite transaction. Task-event sequence separately remains
the authoritative audit order when wall-clock timestamps tie.

Rule versions are embedded in task series/habit definitions. Active/stopped
status is derived from the last version; no duplicate status field/index exists.
Habit outcome events are embedded and ordered within their occurrence, avoiding
a ninth store.

## 3. Transaction ownership

| Operation | Transaction scope |
|---|---|
| Ensure fixed week / goal operations | `weeks`, and `days` only when first ensuring seven canonical dates |
| Task create/edit/check/uncheck/move | Governing `days`/`weeks`, `taskOccurrences`, `taskPlanEntries`, `taskEvents`, and series when relevant |
| Permanent task deletion | Occurrence/event plus every plan entry and every affected open day/week; closed entries are read but never changed |
| Habit outcome/correction/delete/rule change | Governing `days`/`weeks`, definitions, and occurrences with embedded outcome events |
| Bounded recurrence preparation/catch-up | Intersecting definitions/series, occurrences, entries/events, and affected open day/week revisions |
| `closeDay` | Source/destination periods and all affected task/habit stores in one transaction |
| `completeWeek` | `weeks` and seven `days` in one transaction |

Rules:

- Re-read lifecycle/date/revision guards in the transaction that writes.
- Do no network, rendering, timers, dialog waits, or unrelated promises inside a
  live IndexedDB transaction.
- Emit success only after `tx.done`; abort leaves all stores unchanged.
- Instants, current-date eligibility, and recurrence boundaries come from the
  injected application clock.
- Never automatically delete/recreate the database after an error.
- A child mutation changing a day projection/score/load bumps that Day and its
  owning Week. Cross-date moves and multi-membership deletion bump every affected
  open aggregate; closed aggregates are never bumped.
- Strict durability may be requested for `closeDay`, `completeWeek`, and permanent
  deletion when the browser supports the hint; correctness never relies on it.

## 4. Fixed weeks and task membership

`ensureCalendarWeek(date)` derives the containing Monday and uses that as the
only Week key. It idempotently creates the Week and missing seven Day records.
No name/range/overlap probe is stored or accepted because two local dates with
the same derived Monday are the same week.

A committed dated placement looks up the unique `[occurrenceId,date]` entry:

- absent: create membership with the current planned snapshot;
- present and day open: reuse it, including A→B→A return;
- present and day closed: reject mutation.

Movement changes current placement and marks the source currently incomplete but
does not finalize an open source membership. An ordinary dated destination must
be open and different from the source date; backlog is undated. Day closure
finalizes retained entries. Unsaved form input/direct backlog creation writes no
membership.

Permanent task deletion uses the occurrence index prefix to read every
membership, reads each owning Day, changes only open-day entries to `deleted`,
leaves closed entries/snapshots unchanged, tombstones the occurrence, appends the
event, and updates every affected open revision atomically.

## 5. Recurrence and habit-boundary persistence

For each mode/page-derived open date range:

1. Read rule versions intersecting the range.
2. Calculate applicable dates with inclusive start/end and weekday matching.
3. Preserve past/current-day rows, explicit future exceptions, and user-deleted
   tombstones.
4. Remove only an unmodified, unfinalized future generated occurrence and its
   unfinalized membership as one bundle when made inapplicable. Automatic
   materialization emits no TaskEvent, so no orphan event remains. Re-materialize
   a new bundle later if a rule again applies. Do not persist or expose a
   `suppressed` task/habit outcome.
5. Insert only missing applicable occurrences and assign creation sequences. A
   generated recurring task takes the next final `dayPosition` for its date;
   existing task positions remain unchanged and no implicit sort is applied.
6. For a pending applicable habit where `date < currentLocalDate`, append one
   `date-boundary/not-completed` outcome event and update outcome idempotently.
7. When the allowed correction command succeeds on an open day, append
   `user-correction/completed`; retain both events and update the score revision.
8. Re-run preparation for the closing date inside `closeDay`.

Rule change on `D` ends the old version on `D` and starts the final coalesced new
version on `D + 1`. Public commands cannot choose the boundary.

## 6. Day/week finalization

`closeDay` transaction checks, before success:

- source Day/Week is open and revision current;
- `date <= currentLocalDate` (future dates return `FutureDayClosure`);
- no older-day prerequisite exists;
- materialization/catch-up is current and no applicable habit remains pending;
- disposition keys exactly equal unfinished tasks;
- each destination is open and differs from the closing date.

It captures duration-only load before dispositions, finalizes memberships and
events, stores score counts/rates/value plus load, and closes the Day. Cancellation
exists only here. No configurable capacity, hidden load/capacity/overload
threshold, automatic overload classification, or proactive warning value is
persisted.

`completeWeek` verifies the one canonical Week and all seven owned Days closed,
sums frozen raw task/habit counts, calculates/stores final weekly progress and
reflection, and makes the Week immutable. It never averages daily percentages.

No formula-version field or speculative formula-migration system is stored. A
future behavior change must first update the specification and design the needed
migration without rewriting finalized facts.

## 7. History access

The History page service first prepares only open dates in the derived mode
range, then invokes the read-only repository query; closed dates remain
mutation-free. The adapter accepts only the discriminated Day/Week/Month query contract and
derives an indexed internal range:

- Day: one date;
- Week: containing fixed Monday–Sunday dates;
- Month: first through last date of one calendar month plus selected-day detail.

There is no public arbitrary 366-day window or unbounded history scan. The
adapter joins normalized days, memberships, task events, habit occurrences and
their outcome events, weeks/progress/reflections, and state/load facts. History
queries never write, materialize, expose workout data, or provide edit commands.

## 8. Database lifecycle and concurrency

- Open `orbit-planning` at version 1.
- Future migrations use sequential `if (oldVersion < n)` upgrade steps and never
  rewrite finalized facts.
- On `blocking`/`versionchange`, close this connection and require reload.
- On `blocked`, explain another ORBIT tab must close/reload; do not spin forever.
- On `terminated`, discard the adapter and reopen only through controlled startup.
- Mutating commands carry aggregate revisions; stale revisions reject and reload.
- Do not add `BroadcastChannel`, shared workers, live queries, or cross-tab sync.

## 9. Storage durability and errors

Request persistent storage when supported and communicate the same-profile/device
boundary plus explicit exclusions for site-data deletion, browser/OS eviction,
private/incognito lifecycle, and profile deletion/reset. A denied request does
not erase data. Quota/open/write/upgrade failures map to domain errors, abort the
attempted transaction, preserve prior facts, and never masquerade as success.

## 10. Repository verification contract

Use fresh `fake-indexeddb` databases per test; do not build a second full in-memory
repository. Required cases include:

- v1 initialization and migration harness;
- canonical Monday week idempotence and seven-day ownership;
- boundary-trimmed free-form goal CRUD/reorder with whitespace-only rejection,
  internal whitespace/content preservation, and no measurability/numeric fields;
- backlog oldest-first creation order and absence of persisted reorder state;
- check/uncheck event ordering; completed-task edit/delete; move rejection until
  unchecked; no ordinary cancel command;
- A→B→A unique membership reuse and multi-open-date movement;
- permanent deletion across several open memberships plus unchanged closed ones;
- recurrence inclusive end, D+1/coalescing, exception/tombstone preservation,
  and removal/re-materialization of unmodified future rows;
- habit boundary miss plus allowed correction with both embedded events after
  reload;
- future-day closure rejection, independently eligible out-of-order closure,
  same-date destination rejection, pending-habit guard, atomic rollback;
- frozen Daily Score/Weekly Progress counts and duration-only load behavior with
  ties-upward rounding;
- Day/Week/Month indexed History facts and no generic window API;
- stale revision/immutable-period errors, connection close/reopen, quota/abort
  mapping, and upgrade blocking.

Real-browser tests remain necessary for physical reload persistence, responsive
behavior, and browser lifecycle/error messaging.
