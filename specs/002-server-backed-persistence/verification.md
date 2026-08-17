# Verification: ORBIT Server-Backed Persistence

**Feature**: `002-server-backed-persistence` | **Date**: 2026-08-18
**Branch**: `feat/server-backed-persistence`

How each success criterion was checked, and what the check actually proves.
Where a criterion is only partly proven, this document says so rather than
rounding up.

## Environment

| Item | Value |
| ---- | ----- |
| Node.js | 22.22.3 |
| PostgreSQL | 17 (`postgres:17-alpine`, Docker Compose service `db`) |
| Host timezone during verification | `Asia/Krasnoyarsk` (UTC+7) — deliberately not UTC |

## Gate results

| Gate | Result |
| ---- | ------ |
| `npm run format:check` | pass |
| `npm run lint` | pass (0 errors, 0 warnings, `--max-warnings 0`) |
| `npm run typecheck` | pass (`tsc -b`, three projects) |
| `npm run test:server` | **199 passed**, 21 files |
| `npm run test:server:tz` | **199 passed**, identical results under `Pacific/Auckland` |
| `npm run test:coverage` | **603 passed**, 75 files — 86.4% statements, 81.54% branches, 86.51% functions (thresholds 85/80/80) |
| `npm run test:e2e` | 67 Playwright tests across four projects |
| `npm run test:visual` | 16 passed, no baseline replaced |

## Success criteria

### SC-001 — behavior is unchanged

**Method**: feature 001's nine repository suites (`us1`–`us7`, `foundation`,
`failures`, `seeded-scale`) were moved to `server/planning/` and pointed at
`PostgresPlanningRepository`. Domain and product-behavior assertions were not
edited.

**Result**: pass, with the extent of the evidence stated precisely in
[traceability.md](./traceability.md).

- Seven suites are **verbatim** apart from the construction seam and direct
  store access: `us1`–`us7`.
- `foundation` has **one** replaced assertion (the IndexedDB failure taxonomy,
  which FR-014 deletes).
- `seeded-scale` keeps every domain assertion; its IndexedDB spy assertions are
  restated over recorded SQL, including the same concrete date bounds.
- **`failures` is not verbatim.** Two of six tests are preserved; four are
  replaced, because quota exhaustion, blocked version upgrades and forced
  connection termination have no PostgreSQL analogue. Every domain error code
  it asserted — `RevisionConflict` above all — carries over with its exact
  payload.

No domain assertion was weakened to reach green.

### SC-002 — the same data is visible from a different browser

**Method**: `e2e/journeys/server-persistence.spec.ts` records a task in one
browser context, then opens an independent context and reads it back.

**Result**: pass.

### SC-003 — data survives clearing site data

**Method**: same journey clears cookies, `localStorage`, `sessionStorage` and
every IndexedDB database, then reloads.

**Result**: pass — the plan is still there, because it was never in the browser.

### SC-004 — failures are reported honestly

**Method**: `e2e/journeys/server-unavailable.spec.ts` covers three scenarios —
unreachable on load, unreachable mid-session, and recovery.

**Result**: pass. The assertions target the *quiet* failure mode specifically:
an empty plan is never shown in place of "we could not find out", and a task
that failed to save is absent both immediately and after a reload against the
healthy server.

### SC-005 — operations are atomic

**Method**: `server/planning/repository.atomicity.test.ts`, with `closeDay` as
the primary case — it writes the day, several occurrences, their memberships,
one audit event per disposition, and habit occurrences in a single transaction.

**Result**: pass. Three failure modes (a statement failing part-way, a domain
rejection after preparation, a materialization failure inside
`prepareOpenPeriod`) each leave the full store snapshot byte-identical. The
success case is asserted alongside them, so the rollback tests cannot pass
vacuously.

### SC-006 — concurrency is safe

**Method**: `server/planning/repository.concurrency.test.ts`. Each competitor
runs on its **own connection pool**, so these are genuinely concurrent
transactions rather than interleaved calls on one connection.

**Result**: pass. Two writers holding the same `expectedRevision` produce
exactly one success and one `RevisionConflict` carrying `expectedRevision: 0`
and `actualRevision: 1`; a burst of four produces one winner and three
conflicts. In every case the aggregate advanced by exactly one revision and the
losers wrote nothing.

The mechanism is an `UPDATE … WHERE revision = $expected` guard: under `READ
COMMITTED` the second writer blocks on the row lock, then re-evaluates the
predicate against the committed row and matches zero rows.

### SC-007 — the server has no clock of its own

**Method**: two independent checks.

1. `npm run test:server:tz` runs every server suite with
   `TZ=Pacific/Auckland` (UTC+12) via Vitest's `test.env`. The host ran at
   `Asia/Krasnoyarsk` (UTC+7), so the two runs are five hours and one
   date-line apart. The override was confirmed to apply
   (`Intl.DateTimeFormat().resolvedOptions().timeZone` reported
   `Pacific/Auckland`, offset −720) rather than being assumed.
2. `grep` over `server/` for `createSystemClock`, `Date.now()`, `new Date(`,
   `Intl.`, `getTimezoneOffset` and `toLocale`.

**Result**: pass. 199/199 identical under both timezones, and **zero**
occurrences in code — the only textual matches are inside the comment in
`server/api/request-clock.ts` that states the rule.

The `pg` pool additionally pins its session with `-c TimeZone=UTC`, and the
`timestamptz` parser refuses a non-zero offset rather than silently shifting a
recorded instant.

### SC-008 — browser storage holds no planning records

**Method**: `e2e/journeys/server-persistence.spec.ts` reads
`indexedDB.databases()`, `localStorage` and `sessionStorage` after recording a
task.

**Result**: pass — all three are empty. No `orbit-planning` database exists.

### SC-009 — one command runs everything from a clean checkout

**Method**: `docker compose up` builds the client and server into one image and
starts it beside PostgreSQL on the named volume.

**Result**: **the behavior is verified; the container image build is not.**

The first-run behavior FR-004 and SC-009 actually describe was verified
directly. Against a genuinely empty database — created fresh, with no tables and
no migration bookkeeping — the built `dist-server/main.js`:

- applied its migrations at startup, creating all eight tables plus
  `kysely_migration` / `kysely_migration_lock`;
- answered `GET /api/health` with `200 {"status":"ok"}`;
- answered `POST /api/planning/getBacklogView` with
  `{"ok":true,"value":{"tasks":[]}}` — **a working, empty ORBIT, not an error**;
- served `index.html` for the deep link `/day/2026-08-13`, from the same origin.

The same path runs on every E2E execution: `e2e/e2e-server.ts` drops and
recreates the E2E database, and the server migrates it before the 67 Playwright
tests run against it.

`docker compose config` is valid. The **image build could not be completed in
this environment** — `npm ci` inside the build container cannot reach the npm
registry here, while the same install succeeds from the host. So
`docker compose up` as a single literal command remains unexercised; everything
it would start has been exercised individually.

### SC-010 — data survives a restart

**Method**: the `db` service stores its data on the named volume
`orbit-db-data`, and `docker compose down` does not remove named volumes.

**Result**: pass, verified directly.

1. Recorded a week and its seven days through the running server.
2. `docker compose down` — the container and network were removed; the volume
   `harness-sdd-lab_orbit-db-data` remained.
3. `docker compose up -d db`.
4. Re-read the data: the same week at the same revision, and the same seven
   days. Byte-identical.

`docker compose down -v` is the documented way to start clean, and is the only
form that removes the volume.

### SC-011 — the `PlanningRepository` interface is preserved

**Method**: `server/api/contract.test.ts` asserts that the client adapter and
the server route table expose exactly the same 32 method names, and drives a
full planning session through both.

**Result**: pass. No method was added, removed or renamed; the exported error
type name `DomainOrStorageError` is retained.

### SC-012 — no new product surface

**Method**: `npm run test:visual` (16 snapshot and layout checks), plus a review
of every user-facing string this feature touched.

**Result**: pass on screens and controls — **zero** new screens, controls,
settings or workflows. The wording result needs stating precisely.

## User-facing wording changed (T099)

SC-012 allows "the removal of device-local storage messaging". Six strings
changed. Four are removals; two are **replacements**, and this document calls
them that rather than rounding them into the allowance.

| Where | Change | Kind |
| ----- | ------ | ---- |
| `AppShell` rail | The whole storage disclosure removed: "Сохранено на устройстве", "Локальное хранение", and the paragraph about the browser profile, site data, private mode and storage eviction | **Removal** (FR-015) |
| `AppProviders` blocked state | Both screens removed: "Нужно перезагрузить ORBIT" and "Обновление ожидает другую вкладку" | **Removal** — no version upgrade can be blocked once IndexedDB is gone |
| `AppProviders` initializing | "Подготавливаем локальные данные…" → "Загружаем данные…" | **Replacement** — the word "локальные" became false |
| `AppProviders` failure | "Локальные данные недоступны" / "Не удалось открыть локальное хранилище планов…" → "Данные недоступны" / "Не удалось связаться с сервером ORBIT…" | **Replacement** — the old text named a storage mechanism that no longer exists |
| `HistoryPage` loading | "Собираем факты выбранного периода на этом устройстве…" → "Собираем факты выбранного периода…" | **Removal** of "на этом устройстве" |
| `use-backlog-page` | "Хранилище переполнено. Изменения не сохранены." → "Сервер ORBIT недоступен. Данные не загружены." | **Replacement** — `QuotaExceeded` is deleted by FR-014 |

The two replacements are not new product surface: each names the same failure to
the user in terms that are now true. Keeping "Не удалось открыть локальное
хранилище планов" while the data lives on a server would have been a false
statement, which is the opposite of what 001's honest-reporting rule asks for.

## Open item for product-owner review

**The visual baselines still show the removed storage disclosure.**

`npm run test:visual` passes 16/16, but that is not by itself proof of an
unchanged interface: the removed element is small enough that the diff falls
under the configured `maxDiffPixelRatio: 0.002`. Inspecting
`desktop-shared-shell.png` confirms it still renders "✓ Сохранено на
устройстве" in the rail.

Feature 001 deliberately guarded baseline replacement behind
`ORBIT_VISUAL_BASELINE_APPROVAL=remediated-review-complete`, described as
usable "only for that reviewed run". That guard worked as designed and refused
an update here. Setting it is a reviewed decision, so the baselines were left
untouched.

**Recommended action**: a reviewer confirms the rail is the only difference,
then re-runs with the approval token so the baselines stop asserting a claim the
product no longer makes.

## Limitations

- **The container image build is unverified in this environment** (SC-009).
  `npm ci` inside the build container cannot reach the npm registry here, while
  the same install succeeds from the host. The Dockerfile is standard
  multi-stage and nothing about it is known to be wrong, but it has not been
  executed to completion. The behavior it packages — automatic migration on a
  first run, single-origin serving, volume persistence — was each verified
  directly against the built server, so what remains unproven is the packaging
  step itself, not the deployment behavior.
- **Sequences are allocated `MAX + 1`, not from a PostgreSQL sequence**, a
  deliberate deviation from `data-model.md` recorded with its reasoning in
  [traceability.md](./traceability.md).
- **E2E runs single-worker.** One shared server database has no per-worker
  isolation, so parallel workers would each see the other's fixture. This is a
  consequence of the migration, not a defect, and is documented in
  `playwright.config.ts`.
- Feature 001's unverified items are unchanged by this feature: no screen-reader
  testing on real devices, and no measured task-completion timings.
