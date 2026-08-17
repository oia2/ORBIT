# Quickstart: ORBIT Server-Backed Persistence

**Feature**: `002-server-backed-persistence` | **Date**: 2026-08-17

How to run the migrated application and validate that it satisfies the spec. Schema details
are in [data-model.md](./data-model.md); endpoint details are in
[contracts/planning-api.md](./contracts/planning-api.md).

## Prerequisites

- Node.js ≥ 22.22.0
- Docker with Compose v2

## Configuration

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DATABASE_URL` | `postgres://orbit:orbit@localhost:5432/orbit` | PostgreSQL connection |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | In `production`, the server also serves `dist/` |

A committed `.env.example` documents these. Compose supplies them to the `app` service.

## Run for development

PostgreSQL in Docker; web and API on the host.

```bash
docker compose up -d db     # PostgreSQL only, on the named volume
npm install
npm run dev:server          # Fastify on :3000, migrations applied at startup
npm run dev                 # Vite on :5173, proxying /api -> :3000
```

Open `http://localhost:5173`. The Vite proxy means the client uses relative `/api` paths in
development exactly as in production — there is no API base URL to configure anywhere
(FR-016).

## Run the complete application

```bash
docker compose up
```

Builds the frontend and server into one image and starts it alongside PostgreSQL. Open
`http://localhost:3000` — one origin serves both the interface and `/api`.

This is the SC-009 path: from a clean checkout, one command, no manual setup steps. Migrations
run automatically at startup, so a first run against an empty volume yields a working, empty
ORBIT (FR-004).

## Quality gates

```bash
npm run verify
```

Runs format check, lint, typecheck, coverage, and E2E across client and server.

**Requires `docker compose up -d db`** — server tests run against real PostgreSQL because the
schema's constraints are part of the correctness story (research Decision 6).

Individual suites:

```bash
npm run test              # domain + UI tests; no database needed
npm run test:server       # repository + transport tests; needs PostgreSQL
npm run test:e2e          # Playwright against the built app
```

## Validation scenarios

Each maps to spec success criteria. These are the acceptance checks for the feature.

### 1. Behavior is unchanged — SC-001

```bash
docker compose up -d db
npm run test:server
```

**Expected**: feature 001's retargeted repository suites (`us1`–`us7`, `failures`,
`foundation`, `seeded-scale`) pass against `PostgresPlanningRepository`.

**The assertions must not have been edited.** A green run only counts as evidence if the
suites still assert what they asserted under IndexedDB. If any assertion needed changing,
that is a behavior change and must be reported, not accommodated.

### 2. Data is not tied to one browser — SC-002, SC-003

1. `docker compose up`, open `http://localhost:3000`, create a weekly goal and two tasks.
2. Open the same URL in a **different browser** → the same goal and tasks are present.
3. In the first browser, clear all site data and reload → data is still present.
4. Inspect browser storage → **no** ORBIT IndexedDB database exists (FR-002, SC-008).

### 3. Failures are reported honestly — SC-004

1. With the app open, `docker compose stop db`.
2. Attempt to create a task → a clear failure is shown; the task is **not** rendered as saved.
3. Reload → an unavailable-data message, not an empty plan presented as real (FR-012).
4. `docker compose start db`, retry → the operation succeeds and prior data is intact.

### 4. Operations are atomic — SC-005

Covered by the `failures` suite: a command failing mid-transaction must leave no partial
state. `closeDay` is the case that matters most — it touches days, occurrences, plan entries,
events, and habit occurrences in one transaction (FR-007).

### 5. Concurrency is safe — SC-006

Covered by repository tests: two commands against the same `expectedRevision` — the first
succeeds, the second returns `RevisionConflict` with `expectedRevision` and `actualRevision`,
and does not overwrite (FR-008).

### 6. Timezone independence — SC-007

Run the server with a non-UTC `TZ` (e.g. `TZ=Pacific/Auckland`) and a client local date that
differs from the server's date. Day-closure eligibility, recurrence effective dates, and the
habit boundary miss must follow the **client's** date (FR-009).

```bash
TZ=Pacific/Auckland npm run test:server
```

**Expected**: identical results to a UTC run. Any difference means server date leakage.

### 7. Data survives restart — SC-010

```bash
docker compose up -d
# record data through the UI
docker compose down          # NOT -v; that would remove the volume
docker compose up -d
```

**Expected**: all data present. The named volume `orbit-db-data` is what makes this true;
`docker compose down -v` deletes it and is the documented way to start clean.

### 8. Responsiveness — SC-011

Open a day and a week view, save a task, toggle completion. Each completes in under 1 second
on a local deployment.

### 9. No new product surface — SC-013

Compare the running application against feature 001's approved design references and visual
snapshots. **Expected**: zero new screens, controls, settings, or workflows, and no wording
change other than the removal of device-local storage messaging (FR-015, FR-024).

The Playwright visual suite (`npm run test:visual`) is the mechanical check; snapshots should
not need updating, and any snapshot diff is a finding to investigate rather than to accept.

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `ServerUnavailable` on every action | API or database not running | `docker compose ps`; check `db` is healthy |
| Server exits at startup | Migration failure or bad `DATABASE_URL` | Read the startup log; migrations run before listening |
| `npm run test:server` fails to connect | PostgreSQL not started | `docker compose up -d db` |
| Dates off by one day | `pg` returning `Date` objects instead of strings | Check the type parsers on the pool (`data-model.md`) |
| Stale data after a code change | Old volume from an earlier schema | `docker compose down -v` to start clean |

## Rollback

The feature branch is the rollback unit: revert it and `master` returns to the IndexedDB
implementation. There is no data migration in either direction (FR-003), so server data does
not transfer back to a browser — this is expected and accepted by the spec.
