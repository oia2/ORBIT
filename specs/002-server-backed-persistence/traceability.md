# Suite Traceability: Feature 001 → PostgreSQL

**Feature**: `002-server-backed-persistence` | **Date**: 2026-08-17

## Why this document exists

SC-001 says feature 001's repository suites must pass against
`PostgresPlanningRepository` with **no test altered to accommodate different
product behavior**. A green run only counts as evidence if the suites still
assert what they asserted under IndexedDB.

Two categories of assertion are treated differently, and the difference is the
whole point:

- **Domain and product-behavior assertions must not change.** Scoring,
  recurrence, closure, membership, history, revisions, immutability. Editing one
  of these to reach green would conceal exactly the drift SC-001 exists to
  catch.
- **IndexedDB storage-mechanism assertions must change**, because 002 removes
  the mechanism they describe and FR-014 replaces the error codes they assert
  on.

Every assertion in the second category is listed below with its replacement and
the reason. **The `failures` suite is not verbatim** — most of it is replacement
— and this document says so plainly rather than letting a green run overstate
the evidence.

## What "retargeted" changed in every suite

Three seams changed everywhere. None of them is an assertion:

1. **Construction.** `createIndexedDbPlanningRepository(database, { clock })`
   became `createRepositoryUnderTest({ clock, generateUuid })`, which builds
   `PostgresPlanningRepository` against the per-worker test database.
2. **Direct store access.** The suites read and seeded IndexedDB object stores
   directly (`database.get('days', date)`, `database.getAllFromIndex(...)`).
   Those calls became the equivalent methods on `TestPlanningStore`
   (`database.getDay(date)`, `database.getDaysByWeekStart(...)`), which map rows
   back to the same domain objects **and preserve IndexedDB's ordering**: an
   index scan yields records ordered by index key then primary key, and several
   001 assertions depend on that order.
3. **Reopening.** "Close and reopen the database" became "build a second
   repository against the same database".

## Per-suite record

| 001 suite | New file | Assertions |
| --------- | -------- | ---------- |
| `us1` (week planning) | `repository.week-planning.test.ts` | **Verbatim** |
| `us2` (task execution) | `repository.task-execution.test.ts` | **Verbatim** |
| `us3` (recurrence) | `repository.recurrence.test.ts` | **Verbatim** |
| `us4` (day closure) | `repository.day-closure.test.ts` | **Verbatim** |
| `us5` (daily signals) | `repository.daily-signals.test.ts` | **Verbatim** |
| `us6` (weekly review) | `repository.weekly-review.test.ts` | **Verbatim** |
| `us7` (history) | `repository.history.test.ts` | 5 of 7 verbatim; **2 replaced** |
| `foundation` | `repository.foundation.test.ts` | 5 of 6 verbatim; **1 replaced** |
| `seeded-scale` | `repository.seeded-scale.test.ts` | Domain assertions verbatim; **storage-mechanism assertions replaced** |
| `failures` | `repository.failures.test.ts` | **Not verbatim.** 2 of 6 preserved; 4 replaced |

## Every replaced assertion

### `foundation` — 1 replacement

| Replaced | Replacement | Why |
| -------- | ----------- | --- |
| `normalizes storage failures without deleting or resetting the database`: asserted `QuotaExceeded` / `StorageUnavailable` / `UnexpectedStorageFailure` from `DOMException` names, and that `indexedDB.deleteDatabase` was never called. | `normalizes server failures without dropping or resetting the database`: asserts `ServerUnavailable` / `UnexpectedServerFailure` from PostgreSQL error codes and connection errors, and that no `DROP` or `TRUNCATE` statement is issued during a failed command. | 002 FR-014 replaces the two storage codes and deletes `QuotaExceeded` and `UpgradeBlocked` outright; `DOMException` does not exist on the server. The preserved property is the one that mattered: a failure is classified honestly and never resolved by discarding data. |

The other five foundation tests are verbatim, including `revisionGuard` and
`mutableDayGuard` (imported from `server/planning/errors.ts` instead of
`indexedDbRepositoryInternals`) and the gap-free creation/event sequence
allocation asserting `1, 2`.

### `us7` (history) — 2 replacements

| Replaced | Replacement | Why |
| -------- | ----------- | --- |
| `rejects a Month selectedDate outside the anchor month before opening a transaction`, asserted by spying on `IDBDatabase.prototype.transaction`. | Same test name and same domain assertion (`ValidationFailure` on `selectedDate`), asserted by spying on the Kysely instance's `transaction`. | The product behavior — an invalid selection is rejected before any storage work begins — is unchanged and still asserted. Only the object being spied on changed. |
| `uses only readonly, bounded primary/index reads for a mode-derived query`, asserted on `IDBObjectStore.getAll`, `IDBIndex.getAll`, cursor calls, and index names. | `uses only read-only, bounded statements for a mode-derived query`: the projection runs in exactly one `start transaction isolation level repeatable read read only`, issues no `INSERT`/`UPDATE`/`DELETE`, and every statement against a dated table carries a `WHERE` predicate with bounds. | IndexedDB indexes and key ranges have no analogue. The property asserted is the same one: no unbounded scan, no write during a read. |

### `seeded-scale` — replacements

| Replaced | Replacement | Why |
| -------- | ----------- | --- |
| In `rebuilds the same 52-week model and browser snapshots…`: assertions on `buildPersonalHistoryBrowserFixture()`, `buildPersonalHistoryOrbitSeed()`, and `seedPersonalHistory()` — the in-browser V1 seed snapshot. | The fixture-determinism and exact record-count assertions are kept verbatim, and the counts are additionally asserted against the real database after seeding. | 002 FR-002 removes in-browser seeding entirely: E2E fixtures reach PostgreSQL directly from Node (T074). Those assertions described a mechanism that no longer exists. What the suite was really guarding — that the fixture is deterministic and has exactly 52/364/728/728/1442/364 records — is preserved and strengthened. |
| IndexedDB spy assertions in `uses bounded indexed Day, Week, and Month reads…` (`IDBDatabase.transaction` mode, `getAll` key ranges, index names). | Four read transactions, each `repeatable read read only`; no write statements; every read of a history-sized table carries a `WHERE` with parameters; and **the same concrete date bounds 001 asserted on its key ranges** are asserted on the query parameters. | Same property, stated in the new mechanism's terms. The date bounds carried over unchanged. |
| IndexedDB spy assertions in `prepares only open dates inside the requested Month and never scans dated stores unbounded`. | Same domain assertions verbatim (affected dates/weeks, frozen day and week untouched, counts unchanged, prepared vs. pending habit outcomes), with the boundedness assertions restated over recorded SQL: every dated read is keyed by a date, and only the open week's dates are ever queried. | Same property, same bounds. |

### `failures` — the suite that is not verbatim

| 001 test | Status | Detail |
| -------- | ------ | ------ |
| `closes and reopens the real adapter with all committed facts intact` | **Preserved**, construction seam only | Renamed to `reconnects to the real database…`. Every assertion identical. |
| `rejects a stale aggregate revision without writing or reporting success` | **Preserved verbatim** | The full `RevisionConflict` payload, including `expectedRevision: 0` / `actualRevision: 1`, and the unchanged-facts assertion. |
| `maps quota rejection / transaction abort, rolls back partial writes, and never resets the database` | **Replaced** | Split into two: `rolls back every partial write when a statement fails mid-transaction` (a genuine mid-command failure, injected by claiming the audit event id `createTask` is about to use, so the final statement violates `task_events_id_key` after the occurrence and membership rows were written) and `surfaces a schema constraint violation as a server failure, not a domain outcome`. IndexedDB quota exhaustion has no PostgreSQL analogue and `QuotaExceeded` is deleted by FR-014. The preserved property: a command that fails part-way leaves nothing behind and is never reported as success. |
| `waits on a blocked upgrade, then reopens without resetting prior facts` | **Replaced** | Became `re-runs migrations against an existing database without touching prior facts`. IndexedDB blocks a version change while another connection is open; PostgreSQL runs migrations once at startup (FR-019) and `UpgradeBlocked` is deleted by FR-014. The preserved property: re-running schema setup never discards data. |
| `reports forced termination, rejects the stale adapter, and recovers only by reopening` | **Replaced** | Became `reports a lost connection, rejects the stale handle, and recovers on reconnect`. A terminated IndexedDB connection becomes a destroyed connection pool; the command fails visibly as `ServerUnavailable` (not `StorageUnavailable`, per FR-014), nothing is presented as saved, and reconnecting restores both the prior facts and the ability to write. |

**Nothing in this suite weakened a domain assertion.** Every domain error code it
asserted — `RevisionConflict` above all — carries over with its exact payload.

## Deviations from the design documents

Two implementation choices depart from `data-model.md` and `tasks.md`. Both are
recorded here rather than left silent (Constitution Principle V).

### 1. Creation and event sequences are allocated as `MAX + 1`, not from a PostgreSQL sequence

`data-model.md` declares `task_occurrence_created_sequence` and
`task_event_sequence`. The implementation instead allocates
`MAX(created_sequence) + 1` and `MAX(sequence) + 1` inside the command
transaction, exactly as feature 001's `allocateNextCreationSequence` and
`allocateNextEventSequence` did, and the migration declares no sequences.

**Why**: a PostgreSQL sequence advances on rollback, so it produces gaps. 001's
suites assert the concrete values — `createdSequence` of `[1, 2]` in the
recurrence suite, event sequences of `[1, 2, 3, 4]` in the task-execution
suite — and the seeded-scale fixture inserts 1,442 events with explicit
sequence values, which a sequence would immediately fall out of step with.
Using a sequence would have meant editing those assertions, which SC-001
forbids.

The property `data-model.md` was actually protecting is preserved in full:
`sequence` remains the ordering authority, derived from stored rows rather than
from the clock, so a client device clock that moves backwards cannot reorder
history. Only the allocation mechanism differs. `data-model.md` states that
where it and the TypeScript types disagree, the types win.

### 2. `tsconfig.server.json` uses bundler module resolution, not `nodenext`

`tasks.md` T003 specified `module: nodenext`. The shared domain under `src/` is
written for bundler resolution — extensionless imports and directory-index
imports such as `@/shared/lib/ids` — and `nodenext` rejects both. Honouring T003
would have meant rewriting every import path in `src/`, which is precisely the
repo-wide churn `plan.md`'s Structure Decision rejects.

The server ships as a Vite SSR bundle and its tests run under Vitest, so bundler
resolution describes the real runtime accurately. `module: ESNext` +
`moduleResolution: Bundler` is used instead, matching `tsconfig.app.json`.

## How to re-verify

```bash
docker compose up -d db
npm run test:server
```

A green run means the domain assertions above are still true of
`PostgresPlanningRepository`. If a domain assertion ever needs editing to reach
green, that is a behavior regression to report — not a test to fix.
