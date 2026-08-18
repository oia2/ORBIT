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
| `npm run test:visual` | 16 passed; 13 baselines replaced once, under owner approval — see [Visual baselines](#visual-baselines-updated-under-owner-approval) |
| `docker compose config` | valid |
| `docker compose down -v && docker compose up -d --build` | image built from the committed Dockerfile; both services healthy |

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

**Result**: pass — the image build and the first-run behavior are both verified.

The packaging step was re-run from a clean state on 2026-08-18:

```
docker compose down -v      # volume harness-sdd-lab_orbit-db-data removed
docker compose up -d --build
```

The image built from the committed Dockerfile — `docker history
harness-sdd-lab-app:latest` shows the runtime layer as
`npm ci --omit=dev --fetch-retries=5 && npm cache clean --force`, matching the
file in the repository. The volume was recreated empty, `db` reached its
healthcheck, and `app` started behind it. Against that genuinely empty database
the running container then:

- applied `001-initial-schema` at startup, leaving 10 tables — the eight domain
  tables plus `kysely_migration` and `kysely_migration_lock`;
- answered `GET /api/health` with `200 {"status":"ok"}`;
- answered `POST /api/planning/getBacklogView` with
  `{"ok":true,"value":{"tasks":[]}}` — **a working, empty ORBIT, not an error**;
- served `index.html` for the deep link `/day/2026-08-13` from the same origin.

An earlier attempt failed with `ECONNRESET` while `npm ci` ran inside the build
container. That was transient npm-registry flakiness, not a defect in the
Dockerfile: the registry answered `npm ping` from the same image, single and
concurrent large tarball downloads from a container both succeeded, and the
unchanged Dockerfile has since built cleanly.

The same first-run path also runs on every E2E execution: `e2e/e2e-server.ts`
drops and recreates the E2E database, and the server migrates it before the 67
Playwright tests run against it. The same behavior was verified against the
built `dist-server/main.js` directly, before the image was exercised.

`docker compose config` is valid.

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

## Visual baselines updated under owner approval

**Closed 2026-08-18.** The baselines previously still showed the removed storage
disclosure. `npm run test:visual` passed 16/16 even so, because the removed
element is small enough that the diff falls under the configured
`maxDiffPixelRatio: 0.002` — so the baselines asserted a claim the product no
longer makes, and could not have caught a regression in that region.

Feature 001 deliberately guarded baseline replacement behind
`ORBIT_VISUAL_BASELINE_APPROVAL=remediated-review-complete`, usable "only for
that reviewed run". The product owner granted that approval for one reviewed
run, scoped to the device-local storage removal. All 13 baselines were
regenerated with `--update-snapshots=all`; `--update-snapshots` alone changed
nothing, because Playwright treats a within-tolerance diff as a match.

The result was audited pixel-by-pixel against the previous baselines before
being accepted. **Every image changed in exactly one region, and no image
changed size:**

| Baselines | Changed region | Pixels | What it is |
| --------- | -------------- | ------ | ---------- |
| 7 desktop (1440px) | `x 24–133, y 832–863` — identical box in all seven | 846 each | The rail disclosure "✓ Сохранено на устройстве" |
| 3 tablet (820px) | `x 36–51, y 1118–1133` | 97 each | The same indicator, icon-only in the compact rail |
| 3 mobile (390px) | `x 303–360, y 705–793` | 1,428–1,522 | The same indicator as a badge |

Each region was cropped from the old and new baseline and compared visually: the
old renders the storage indicator, the new renders the same area empty. Nothing
else differs — no layout shift, no spacing change, no unrelated content. This is
the removal FR-015 requires and nothing more.

## Limitations

- **Sequences are allocated `MAX + 1`, not from a PostgreSQL sequence**, a
  deliberate implementation decision recorded with its reasoning in
  [traceability.md](./traceability.md) Deviation 1 and described in
  `data-model.md`. `task_events.sequence` is a primary key, so a colliding
  allocation would fail its transaction rather than record a duplicate;
  `task_occurrences.created_sequence` has no uniqueness constraint, so a tie
  would leave two backlog rows with equal creation order. Neither arises in the
  single-owner, one-request-at-a-time deployment this feature specifies
  (FR-021, FR-022).
- **E2E runs single-worker.** One shared server database has no per-worker
  isolation, so parallel workers would each see the other's fixture. This is a
  consequence of the migration, not a defect, and is documented in
  `playwright.config.ts`.
- Feature 001's unverified items are unchanged by this feature: no screen-reader
  testing on real devices, and no measured task-completion timings.
