# Contract: Planning API Delta

**Feature**: `003-planning-refinements` | **Date**: 2026-08-22

## Status of related contracts

| Contract | Status under 003 |
| -------- | ---------------- |
| `002/contracts/planning-api.md` | **Extended.** Transport, headers, envelope, error mapping, and every method not listed below are unchanged and remain binding. |
| `001/contracts/domain-commands.md` | **Extended.** One new command (`reopenDay`); four existing inputs change shape. |
| `001/contracts/ui-routes.md` | **Unchanged.** This feature adds no route. |

## Design basis

Unchanged from 002: the TypeScript `PlanningRepository` interface
(`src/entities/planning/model/planning-repository.ts`) is authoritative, and the HTTP API is
its one-to-one projection at `POST /api/planning/:method`. Where this document and the
interface disagree, the interface wins.

Everything below is a **delta**. The transport contract — `POST`, JSON both directions,
required `X-Orbit-Local-Date` and `X-Orbit-Instant` headers, `{ok:true, value, affectedDates,
affectedWeeks}` / `{ok:false, error}` envelopes, and the domain-error to HTTP-status mapping —
is inherited verbatim from 002.

---

## 1. New command: `reopenDay`

Satisfies FR-009 through FR-015. Modelled directly on the existing `closeDay`.

```ts
interface ReopenDayInput {
  readonly date: LocalDate;
  readonly expectedDayRevision: Revision;
}

reopenDay(input: ReopenDayInput): Promise<CommandResult<undefined>>;
```

**HTTP**: `POST /api/planning/reopenDay`

**Request**

```json
{ "date": "2026-08-20", "expectedDayRevision": 58 }
```

**Success response**

```json
{
  "ok": true,
  "value": null,
  "affectedDates": ["2026-08-20"],
  "affectedWeeks": ["2026-08-17"]
}
```

`affectedDates` contains **only the reopened date**. A day that received a task at closure is
deliberately not listed, because reopening does not write to it (FR-015).

**Errors**

| Condition | Error | Client message |
| --------- | ----- | -------------- |
| Day does not exist | `NotFound` (entity `Day`) | «День не найден.» |
| Day is already open | `InvalidTransition` (`currentState: 'open'`, `attemptedTransition: 'reopen'`) | «День уже открыт.» |
| **The day's week is completed** | `PeriodImmutable` with `weekStart` | «Нельзя открыть день: неделя уже завершена.» |
| Stale revision | `RevisionConflict` | existing generic reload-and-retry message |

The `PeriodImmutable` case is the one FR-014 requires to be *stated* rather than silently
failing — it carries `weekStart`, so the UI can name the blocking week. No new error code is
introduced; all four already exist in `DomainOrStorageError`.

**Atomicity**: one transaction, exactly like `closeDay` — the day row, the restored task
occurrences, their memberships, and the `closure-reopen` audit events commit together or not
at all.

**Effects**: specified in [data-model.md §2](../data-model.md). Summarised: the day returns to
`open` and drops its snapshot; occurrences that closure finalized *onto no placement*
(`completed`, `kept-unfinished`, `canceled`) return to the day; occurrences closure
*relocated* (`moved`, `backlogged`) stay where they are.

---

## 2. Changed input: `EditTaskOccurrenceInput` — clearable notes

Satisfies FR-024.

```diff
 interface EditTaskOccurrenceInput {
   readonly occurrenceId: TaskOccurrenceId;
   readonly title?: string;
-  readonly notes?: string;
+  /** `undefined` leaves the field unchanged; `null` explicitly clears it. */
+  readonly notes?: string | null;
   readonly startTime?: string | null;
   readonly endTime?: string | null;
   readonly durationMinutes?: DurationMinutes;
   readonly expectedRevision: Revision;
 }
```

This adopts, for `notes`, the convention `startTime` and `endTime` already use in this same
type. Today `notes: undefined` is the only representable "no value", so a note can be written
but never removed.

**Compatibility**: additive at the wire level — an existing caller sending a string or
omitting the field behaves exactly as before. Only `null` is new.

**Whitespace**: a note of only whitespace is canonicalised to cleared, consistent with how
`canonicalRequiredText` already treats blank input elsewhere.

---

## 3. Changed input: `CreateHabitDefinitionInput` — optional duration

Satisfies FR-029.

```diff
 interface CreateHabitDefinitionInput {
   readonly title: string;
+  readonly durationMinutes?: DurationMinutes;
   readonly recurrenceRule: RecurrenceRule;
 }
```

Omitted means no duration, which contributes nothing to planned load (FR-031).
`DurationMinutes` is the existing positive-integer brand; a non-positive value is a
`ValidationFailure` on field `durationMinutes`.

---

## 4. Changed input: `EditHabitOccurrenceInput` — duration alongside title

Satisfies FR-029 and FR-030.

```diff
 interface EditHabitOccurrenceInput {
   readonly occurrenceId: HabitOccurrenceId;
   readonly title: string;
+  /** `undefined` leaves it unchanged; `null` clears it. */
+  readonly durationMinutes?: DurationMinutes | null;
   readonly expectedRevision: Revision;
 }
```

This edits the **occurrence's snapshot**, which is what planned load reads, so the change is
scoped to that occurrence's day. Editing an occurrence on a closed day is refused with the
existing `PeriodImmutable`, unchanged.

---

## 5. New command: `updateHabitDuration`

Satisfies FR-030 and FR-034 — setting the duration once for a habit rather than day by day.

```ts
interface UpdateHabitDurationInput {
  readonly definitionId: HabitDefinitionId;
  /** `null` clears the duration. */
  readonly durationMinutes: DurationMinutes | null;
  readonly expectedRevision: Revision;
}

updateHabitDuration(input: UpdateHabitDurationInput): Promise<CommandResult<undefined>>;
```

**HTTP**: `POST /api/planning/updateHabitDuration`

**Effects**: writes the definition, then propagates the new value into the
`definitionSnapshot` of every occurrence of that definition **whose day is open**. Occurrences
on closed days are skipped, so no frozen planned load moves (FR-034).

`affectedDates` lists exactly the open dates whose occurrences were updated; `affectedWeeks`
lists their open weeks. This is what drives the existing client refresh, so a duration change
is reflected immediately wherever those days are shown.

**Errors**: `NotFound` (entity `HabitDefinition`), `RevisionConflict`, and
`ValidationFailure` on `durationMinutes` for a non-positive value. All existing codes.

**Why a separate command rather than extending `updateHabitRule`**: that command exists to
version the recurrence rule and writes a new `RecurrenceRuleVersion`. A duration change is not
a rule change and must not create a rule version, or every duration edit would fork the
habit's recurrence history.

---

## 6. Changed response shape: `ScoreBreakdown` in every projection

Satisfies FR-016 and FR-020. This affects **no request**, and every response that carries a
score: `getDayView`, `getWeekView`, `getHistoryView`, `closeDay`, `completeWeek`.

```diff
 interface ScoreBreakdown {
   readonly task: CompletionCategoryBreakdown;
   readonly habit: CompletionCategoryBreakdown;
   readonly value: number | 'unavailable';
-  readonly weightsApplied: { readonly task: 0|70|100; readonly habit: 0|30|100 };
 }
```

`value` is now the single-weight ratio defined in [data-model.md §1](../data-model.md). The
per-category `task` and `habit` breakdowns are byte-identical to before — FR-019 keeps them
visible, and the snapshot migration reads them.

**This is a breaking response change**, and deliberately so: `weightsApplied` would otherwise
report a weighting that no longer exists. Because client and server share one TypeScript
domain, `tsc -b` locates every reader before anything ships. There is no external consumer —
the API is same-origin and unauthenticated by design (002 FR-016, FR-021).

---

## 7. Changed behavior: `getWeekView` returns real progress for an open week

Satisfies FR-008. **No shape change** — a correctness fix to an existing field.

`server/planning/queries.ts:128` currently returns, for an open week:

```ts
progress: week.status === 'completed' ? week.completionSnapshot.progress : unavailableScore()
```

`unavailableScore()` is a fabricated `task 0/0, habit 0/0, unavailable`. The server reports an
empty aggregate for a week that has data. It is masked today only because `WeekPage` ignores
it and recomputes the value client-side.

**After**: an open week returns the true aggregate of its days' scores, computed by the same
shared derivation the Day page and History use. A completed week continues to return its
frozen `completionSnapshot.progress`, unchanged.

The client-side duplicate `calculateOpenWeeklyProgress` (`WeekPage.tsx:143`) is deleted, so
the three surfaces agree structurally rather than by coincidence (research Decision 3).

---

## 8. Contract test obligations

| Obligation | Requirement |
| ---------- | ----------- |
| `reopenDay` round-trips: close → reopen → the day's live score equals the discarded snapshot | FR-010, FR-013 |
| `reopenDay` refuses a day in a completed week with `PeriodImmutable` carrying `weekStart` | FR-014 |
| `reopenDay` leaves a moved task on its destination day, and leaves that day's records untouched | FR-012, FR-015 |
| `reopenDay` writes one `closure-reopen` event per restored occurrence, in sequence | FR-011 |
| `reopenDay` rolls back completely on failure — no day reopened without its occurrences restored | 002 FR-007 (atomicity, carried forward) |
| `editTaskOccurrence` with `notes: null` clears; with `notes: undefined` preserves | FR-024 |
| `updateHabitDuration` changes open days' load and leaves closed days' frozen load untouched | FR-030, FR-034 |
| `getDayView`, `getWeekView`, and `getHistoryView` report identical counts and value for the same closed day | FR-008 |
| No response anywhere contains `weightsApplied` | FR-020 |
