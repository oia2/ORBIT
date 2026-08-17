# Contract: ORBIT Planning HTTP API

**Feature**: `002-server-backed-persistence` | **Date**: 2026-08-17

## Status of related 001 contracts

| 001 contract | Status under 002 |
| ------------ | ---------------- |
| `contracts/ui-routes.md` | **Unchanged.** 002 FR-024 forbids UI changes. |
| `contracts/domain-commands.md` | **Unchanged.** The named use cases, inputs, and results are preserved verbatim (002 FR-013). |
| `contracts/persistence.md` | **Superseded** by this document and `data-model.md` for the storage mechanism. Its *domain* semantics remain binding. |

## Design basis

This API is a direct projection of the existing `PlanningRepository` TypeScript interface
(`src/entities/planning/model/planning-repository.ts`). That interface is the contract 002
must preserve, so the API mirrors it one-to-one rather than modelling resources
independently (research Decision 3).

**The interface is authoritative.** Every request body below is the corresponding method's
input type; every response body is its result type. Where this document and the TypeScript
interface disagree, the interface wins.

## Transport

| Aspect | Value |
| ------ | ----- |
| Base path | `/api` |
| Method | `POST` for all planning operations |
| Content type | `application/json` both directions |
| Origin | Same origin as the frontend (002 FR-016). No CORS configuration ships. |
| Authentication | None (002 FR-021, FR-022) |

### Required request header

```
X-Orbit-Local-Date: YYYY-MM-DD
```

The client's current local date, from the browser's `ApplicationClock`. **Required on every
`/api/planning/*` request.** The server builds a per-request clock from it, so that closure
eligibility, recurrence effective dates, and the habit boundary miss behave identically
regardless of the server's timezone (002 FR-009).

A missing or malformed value is a `400`. The server never falls back to its own date — that
fallback is precisely what FR-009 prohibits.

Audit instants (`now()`) come from the **server's** UTC clock, not the client
(research Decision 5).

## Endpoints

`POST /api/planning/<methodName>`, where `<methodName>` is the exact `PlanningRepository`
method name. Request body is the method's single input object; `getBacklogView` takes `{}`.

### Queries — respond with `QueryResult<T>`

| Endpoint | Input | Result value |
| -------- | ----- | ------------ |
| `getWeekView` | `{ dateOrWeekStart }` | `WeekView` |
| `getDayView` | `{ date }` | `DayView` |
| `getBacklogView` | `{}` | `BacklogView` |
| `getHistoryView` | `HistoryQuery` | `HistoryView` |
| `getTaskHistory` | `{ occurrenceId }` | `TaskHistoryView` |

### Commands — respond with `CommandResult<T>`

| Endpoint | Result value |
| -------- | ------------ |
| `prepareOpenPeriod` | `undefined` |
| `ensureCalendarWeek` | `LocalDate` |
| `addWeeklyGoal` | `WeekGoalId` |
| `editWeeklyGoal`, `reorderWeeklyGoals`, `deleteWeeklyGoal` | `undefined` |
| `createTask` | `TaskOccurrenceId` |
| `editTaskOccurrence`, `setTaskCompletion`, `moveTaskToDate`, `moveTaskToBacklog`, `deleteTaskOccurrence`, `reorderDatedTasks` | `undefined` |
| `createTaskSeries` | `TaskSeriesId` |
| `updateTaskSeriesRule`, `stopTaskSeries` | `undefined` |
| `createHabitDefinition` | `HabitDefinitionId` |
| `updateHabitRule`, `stopHabitDefinition`, `editHabitOccurrence`, `recordHabitOutcome`, `correctBoundaryMissToCompleted`, `clearHabitOutcome`, `deleteHabitOccurrence` | `undefined` |
| `saveDailyState` | `undefined` |
| `closeDay` | `DayClosureSnapshot` |
| `completeWeek` | `WeekCompletionSnapshot` |

32 endpoints total: 5 queries, 27 commands.

### `GET /api/health`

Used once at client bootstrap (research Decision 12). Returns `200 {"status":"ok"}` when the
server is running and the database is reachable, `503` otherwise. Takes no local-date header.

## Response envelopes

Unchanged from the TypeScript interface:

```jsonc
// QueryResult<T>
{ "ok": true, "value": /* T */ }
{ "ok": false, "error": { "code": "...", /* ... */ } }

// CommandResult<T>
{ "ok": true, "value": /* T */, "affectedDates": ["2026-08-17"], "affectedWeeks": ["2026-08-17"] }
{ "ok": false, "error": { "code": "...", /* ... */ } }
```

`affectedDates` and `affectedWeeks` drive the client's cache invalidation and must be
returned exactly as the repository computes them.

## Status codes

**A domain rejection is an HTTP 200.** If the server evaluated the request against the
domain rules, the answer — positive or negative — is a `200` carrying the result envelope
(research Decision 4). Feature 001 models failures as values, and re-encoding them as HTTP
statuses would be lossy and would place domain meaning in two places.

| Status | Meaning | Client mapping |
| ------ | ------- | -------------- |
| `200` | Evaluated. Body is the envelope, `ok: true` or `ok: false`. | Return the envelope as-is |
| `400` | Malformed JSON, or missing/invalid `X-Orbit-Local-Date` | `UnexpectedServerFailure` |
| `404` | Unknown method | `UnexpectedServerFailure` |
| `500` | Unexpected server failure | `UnexpectedServerFailure` |
| `503` | Database unreachable | `ServerUnavailable` |
| network failure / no response | — | `ServerUnavailable` |

Invalid *field* values inside a well-formed body are **not** `400`. They are a `200` carrying
`{ ok: false, error: { code: 'ValidationFailure', issues: [...] } }`, which is the behavior
feature 001 already defines for bad input.

## Error codes

Per 002 FR-014: every domain error meaning from 001 is preserved; only the storage-specific
ones change. The exported type name `DomainOrStorageError` is retained to avoid churn in
consumers.

### Preserved unchanged (11)

`ValidationFailure`, `NotFound`, `PeriodImmutable`, `InvalidTransition`,
`TaskMustBeIncompleteToMove`, `MoveTargetClosed`, `FutureDayClosure`, `PendingHabitOutcomes`,
`ClosureDispositionMismatch`, `WeekNotClosable`, `RevisionConflict`

Their payload fields are unchanged. `RevisionConflict` in particular keeps carrying
`expectedRevision` and `actualRevision`, since 002 FR-008 preserves optimistic concurrency.

### Replaced

| 001 code | 002 code | Payload |
| -------- | -------- | ------- |
| `StorageUnavailable` | `ServerUnavailable` | `{ message: string }` |
| `UnexpectedStorageFailure` | `UnexpectedServerFailure` | `{ message: string }` |

### Removed

`QuotaExceeded` and `UpgradeBlocked` — both are IndexedDB-specific with no server analogue.
Client code handling them is deleted, not adapted.

## Serialization rules

The domain uses branded primitives that are plain JSON values at the wire level. Two rules
keep them intact:

1. **Dates and instants stay strings, end to end.** `LocalDate` is `YYYY-MM-DD`; `Instant` is
   canonical UTC `YYYY-MM-DDTHH:MM:SS.sssZ`. The `pg` driver must be configured to return
   `date` and `timestamptz` as strings. Passing either through a JS `Date` would reintroduce
   the timezone dependency FR-009 forbids.
2. **Optional means absent.** A `?` field is omitted from JSON, never sent as `null`, so it
   round-trips to `undefined`. (`EditTaskOccurrenceInput` is the deliberate exception:
   `startTime`/`endTime` accept explicit `null` to *clear* a value, distinct from `undefined`
   meaning "leave unchanged" — see the interface comment at
   `planning-repository.ts:163`. This distinction must survive the wire.)

## Validation

The server re-parses and re-validates every field of every request, and never trusts a
client-supplied brand (002 FR-005, FR-006). Validation reuses the existing brand validators
in `@/shared/lib/ids` and `@/shared/lib/local-date` rather than a schema library
(research Decision 8).

The server also rejects anything the interface never exposed — notably caller-supplied audit
instants and caller-supplied recurrence effective dates, which the interface comment at
`planning-repository.ts:291` already calls out as deliberately absent from the boundary.

## Client adapter

`createHttpPlanningRepository({ baseUrl, clock, fetch })` implements `PlanningRepository`
for the browser. Every method:

1. `POST`s to `/api/planning/<methodName>` with the input as the body and
   `X-Orbit-Local-Date` from the injected clock.
2. On `200`, parses and returns the envelope unchanged.
3. On any other status or a network failure, returns
   `{ ok: false, error: { code: 'ServerUnavailable' | 'UnexpectedServerFailure', message } }`.

It holds no cache, no queue, no local store, and no retry logic — 002 FR-002 and FR-023
forbid all of them. A failed call fails, visibly (002 FR-011).

## Explicitly not in this contract

- Authentication, sessions, accounts, per-user scoping (FR-021, FR-022)
- Realtime, WebSocket, SSE, polling for changes (FR-023)
- Offline queuing, retry, background sync (FR-023)
- Bulk import, export, or migration endpoints (FR-003)
- Test-only or seeding routes — E2E fixtures reach PostgreSQL directly from Node instead
- Pagination — the deployment holds one person's planning history (`data-model.md`)
