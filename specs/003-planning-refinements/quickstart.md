# Quickstart & Validation: ORBIT Planning Refinements

**Feature**: `003-planning-refinements` | **Date**: 2026-08-22

How to run this feature's changes and prove each user story works end to end. Every scenario
below maps to acceptance criteria in [spec.md](./spec.md).

> **Read §0 before anything else.** This feature ships a migration that rewrites stored
> snapshots in the owner's live database. The backup is a required step, not a suggestion.

---

## 0. Back up the live database first *(required — spec FR-002)*

The running instance holds real data from 2026-08-18 onward. Take a dump **before** the new
build starts, because the server applies migrations at startup.

```bash
docker compose exec -T db pg_dump -U orbit -d orbit --format=custom > orbit-pre-003.dump
ls -l orbit-pre-003.dump          # must be non-empty
```

Record the "before" numbers so §1 can compare against them:

```bash
docker compose exec -T db psql -U orbit -d orbit -c "
  select 'weeks' t, count(*) from weeks
  union all select 'days', count(*) from days
  union all select 'task_occurrences', count(*) from task_occurrences
  union all select 'task_plan_entries', count(*) from task_plan_entries
  union all select 'task_events', count(*) from task_events
  union all select 'habit_occurrences', count(*) from habit_occurrences;"

docker compose exec -T db psql -U orbit -d orbit -c "
  select date, closure_snapshot->'score'->'task' as task,
                closure_snapshot->'score'->'habit' as habit,
                closure_snapshot->'score'->'value' as value,
                closure_snapshot->>'plannedLoadMinutes' as load
  from days where status='closed' order by date;"
```

**Restore path** if anything goes wrong:

```bash
docker compose exec -T db pg_restore -U orbit -d orbit --clean --if-exists < orbit-pre-003.dump
```

---

## 1. Upgrade without destroying data *(User Story 1 — FR-001, FR-002, FR-003)*

**Never use `docker compose down -v`.** The `-v` flag deletes the `orbit-db-data` volume,
which is what emptied the database on 2026-08-18 (see [research.md](./research.md) Finding
A1).

```bash
docker compose up -d --build        # rebuilds app, keeps the volume, migrates at startup
docker compose logs app | tail -30  # migrations must report success before serving
```

**Expected**: the migration log lists `002-single-weight-snapshots` and
`003-habit-duration` as applied, and the server starts.

**Verify nothing was lost** — re-run both queries from §0 and compare:

| Check | Expected |
| ----- | -------- |
| Every row count | **identical** to the pre-upgrade numbers |
| Every closed day's `task` and `habit` count objects | **identical** |
| Every closed day's `plannedLoadMinutes` | **identical** |
| `closure_snapshot->'score'->'weightsApplied'` | **absent** on every row (FR-021) |
| `closure_snapshot->'score'->'value'` | recomputed by the single-weight rule |

```bash
# weightsApplied must be gone everywhere
docker compose exec -T db psql -U orbit -d orbit -c "
  select count(*) as leftover from days
  where closure_snapshot->'score' ? 'weightsApplied';"      # expect 0
```

**Migration is idempotent** — restarting must not change anything:

```bash
docker compose restart app
# re-run the closed-day query; values must be unchanged
```

### Persistence across browser close and the date boundary

1. Open <http://localhost:3000>, record a task, a habit outcome, a note, and daily state.
2. Close the browser completely and reopen it → every record is present and unchanged.
3. Restart the stack with `docker compose restart` → every record is still present.

The automated equivalents are the server persistence regression test and the Playwright
journey; this manual pass is the owner-facing confirmation of SC-001 and SC-002.

---

## 2. Local development

```bash
docker compose up -d db     # PostgreSQL only, on the same named volume
npm ci
npm run dev                 # client on :5173
npm run dev:server          # API on :3000
```

Server and e2e tests need the database running. To work against a throwaway database instead
of the owner's data, point `DATABASE_URL` at a separate database — **do not** reset `orbit`.

---

## 3. Quality gate

```bash
npm run verify            # format:check, lint, typecheck, test:server, test:coverage, test:e2e
npm run test:server:tz    # the same server suite under a non-UTC timezone
npm run test:visual       # visual checks for the changed surfaces
```

All must pass before this feature is considered complete (constitution IV).

---

## 4. Scenario validation

Each scenario states what to do and what must be true. They are ordered by the implementation
sequence in [plan.md](./plan.md), so each can be run as soon as its story lands.

### 4.1 Closed-day counts agree everywhere *(US2 — FR-006, FR-007, FR-008)*

1. On an open day, complete some but not all tasks — note the panel, e.g. «Задачи 3 из 5».
2. Close the day, choosing a disposition for each unfinished task.
3. **Expected**: the panel still reads «3 из 5», never «0 из 5».
4. Open the same date on the **Week** page and on the **History** page.
5. **Expected**: all three show identical counts and an identical percentage.

Tasks moved, backlogged, or cancelled at closure stay in the denominator and count as not
completed (decision D3) — a day of 5 tasks with 3 done and 2 moved reads 3 из 5.

**API-level check**, which is where the fixed `getWeekView` is visible:

```bash
curl -s -X POST http://localhost:3000/api/planning/getWeekView \
  -H 'Content-Type: application/json' \
  -H "X-Orbit-Local-Date: $(date +%F)" -H "X-Orbit-Instant: $(date -u +%FT%T.000Z)" \
  -d '{"dateOrWeekStart":"2026-08-17"}'
```

**Expected**: for an **open** week, `progress` is the real aggregate of its days — not
`{"task":{"completed":0,"applicable":0},"value":"unavailable"}`, which is what it returns
today.

### 4.2 Single weight *(US4 — FR-016 to FR-020)*

| Set up | Expected result |
| ------ | --------------- |
| 9 tasks all completed + 1 habit not completed | **90%** |
| 1 task completed + 3 habits all missed | **25%** |
| Tasks only, 3 of 5 done, no habits | **60%** — equal to the task rate |
| A day with no tasks and no habits | «нет данных», **not** 0% |

Then check the copy (FR-020, SC-006):

- «Как считается результат» no longer says «задачи 70%, привычки 30%».
- The dynamics legend no longer says «Результат 70/30».

```bash
grep -rn "70/30\|70%\|привычки 30" src/ | grep -v node_modules   # expect no user-facing hits
```

### 4.3 Reopen a day *(US3 — FR-009 to FR-015)*

1. Close a day, marking one task complete, keeping one unfinished, and **moving one to
   tomorrow**.
2. Reopen the day.
3. **Expected**:
   - the day is editable again and shows a live result, not a frozen one;
   - the live result equals the snapshot that was just discarded;
   - the completed task is still completed; the kept-unfinished task is editable again;
   - **the moved task is still on tomorrow** and tomorrow's records are unchanged (D1, FR-012,
     FR-015);
   - the Week and History pages show the day as open.
4. Mark the previously unfinished task complete and close the day again.
5. **Expected**: the new snapshot reflects the correction.
6. Complete the week, then try to reopen one of its days.
7. **Expected**: refused, with «неделя уже завершена» stated — not a silent failure and not an
   apparently-available control (FR-014).

Audit check (FR-011):

```bash
docker compose exec -T db psql -U orbit -d orbit -c "
  select sequence, effective_date, payload->>'type' as type
  from task_events where payload->>'type' in ('closure-keep','closure-move','closure-reopen')
  order by sequence desc limit 10;"
```

**Expected**: a `closure-reopen` event per restored occurrence, after the closure events.

### 4.4 Task notes *(US5 — FR-023 to FR-028)*

1. Activate the note button beside a task's completion checkbox on an open day → a modal
   opens with an empty, editable text area.
2. Write and save a note, reload the page, reopen the modal → the note is still there.
3. The compact row action indicates that the task carries a note.
4. Clear the note and save → it is gone after a reload (this is what `notes: null` enables).
5. Open the same task on the Week planner, the Backlog, and History → the same text.
6. Open it on a **closed** day → the modal is readable, not editable.
7. On a recurring task, edit one occurrence's note → other occurrences are unaffected
   (FR-027).

### 4.5 Habit duration *(US6 — FR-029 to FR-034)*

1. Note the current day's planned load.
2. Give a habit that applies today a duration of 45 minutes.
3. **Expected**: today's planned load grows by exactly 45 minutes, and **no percentage
   changes** (FR-033).
4. **Expected**: an already-closed day that contained that habit shows its **unchanged**
   frozen load (FR-034).
5. Clear the duration → the load returns to its previous value (FR-031).
6. The duration is displayed wherever the habit is listed, like a task's duration.

### 4.6 History dynamics *(US7 — FR-035 to FR-039)*

1. Switch History to **month** mode on a month containing recorded work.
2. Select an **empty** day inside that month.
3. **Expected**: the chart still shows that month's aggregated values — this is the reported
   bug, and today it blanks to «Данных для динамики пока нет».
4. **Expected**: each point represents a whole month, not the selected day.
5. Switch to **week** mode → each point represents a whole week.
6. Navigate to a range where some periods have data and some do not.
7. **Expected**: empty periods render as gaps; the chart still draws (FR-038). It shows the
   empty state only when **every** period is empty (FR-039).

### 4.7 Week planner expand-all *(US8 — FR-040 to FR-042)*

1. On the Week page with days collapsed, activate the expand-all control → all seven expand.
2. Activate it again → all seven collapse.
3. Expand all, then collapse one day individually → only that day collapses (FR-042).
4. The control's label states what it will do next (FR-041).

---

## 5. Rollback

| Situation | Action |
| --------- | ------ |
| Migration failed at startup | The server refuses to serve; Kysely rolled the migration back. Fix and redeploy — no restore needed. |
| Snapshots look wrong after upgrade | `pg_restore` from `orbit-pre-003.dump` (§0), then redeploy the previous image. |
| A day was reopened by mistake | Close it again — the closure recomputes from current facts. Nothing is lost, and the audit trail records both actions. |

`docker compose down` alone is always safe; it preserves the volume. Only `down -v` destroys
data, and this feature never requires it.
