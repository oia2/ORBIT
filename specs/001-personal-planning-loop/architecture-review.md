# Architecture and scope review

**Reviewed**: 2026-08-13 (post-remediation rerun)  
**Scope**: T106 against the stable T105 implementation and retained visual evidence  
**Result**: PASS — no application, dependency, or configuration change was required

## Evidence boundary

This rerun audits architecture and product scope only. The current T105 result is
independently retained in [`release-review.md`](release-review.md) and
[`visual-evidence/2026-08-13/README.md`](visual-evidence/2026-08-13/README.md);
visual conformance is not inferred from lint, typecheck, functional tests, or this
review. T107 manual accessibility and T108 usability evidence have not been run or
claimed.

## Runtime dependencies

`package.json` still has exactly four direct runtime dependencies:

- `react@19.2.7` and `react-dom@19.2.7` render the single-page application;
- `react-router@8.3.0` implements the canonical Day, Week, Backlog, History,
  redirect, and not-found route behavior;
- `idb@8.0.3` supplies typed IndexedDB opening, requests, transactions, and
  lifecycle handling.

`npm ls --omit=dev --all` adds only the expected transitive packages
`scheduler@0.27.0` (React DOM) and `cookie-es@3.1.1` (React Router). There is no
backend, account/authentication, synchronization, telemetry, analytics, state-store,
query-cache, chart, date, PWA/service-worker, or transport runtime dependency. All
Playwright, axe, fake IndexedDB, test, build, lint, formatting, and type packages
remain development-only.

## FSD direction and public APIs

Shipped source follows `app -> pages -> features -> entities -> shared`:

- `app` composes runtime, providers, shell, router, and page public APIs;
- pages import feature and `entities/planning` public entry points;
- features import the `entities/planning` public entry point and shared primitives;
- the planning entity imports shared primitives only;
- shared source imports no product layer.

The path-specific `no-restricted-imports` rules in `eslint.config.js` reject upward
layer imports, page-to-page and feature-to-feature coupling, and deep feature/entity
imports from pages and features. The production-source import scan found no deep
`@/pages/*/*`, `@/features/*/*`, or `@/entities/*/*` consumer import. The app
composition root imports the concrete database-open and repository factory seams
through `@/entities/planning`; it does not import schema records or browser
transactions.

Colocated entity tests may import their own internals. Three app unit tests import
the named `PlanningRepository` port declaration directly to create narrow mocks;
they do not ship and do not bypass the runtime boundary. The deterministic E2E seed
fixture also imports IndexedDB schema and domain fixture types directly because its
explicit job is to populate the browser database before application startup. That
test-only access is confined to `e2e/fixtures/visual.fixture.ts` and does not create
a second product repository or public API.

The retained slice barrels expose named hooks, reducers, components, product
projections/types, the repository port/provider, and the two concrete bootstrap
seams needed by `app`. They expose no wildcard barrels, generic CRUD, unit of work,
store names, IDB handles, transaction types, global domain cache, or query cache.

## Repository and domain boundaries

The only durable adapter remains
`src/entities/planning/api/indexeddb/indexeddb-planning-repository.ts`. All `idb`,
`IDBPDatabase`, and `IDBPTransaction` production references are confined to
`src/entities/planning/api/indexeddb/`; React pages and features see only named
queries/commands on `PlanningRepository`. The schema remains version 1 with the
same eight focused stores. No HTTP, storage-sync, authentication, or alternative
persistence adapter exists.

Product policy remains in pure `entities/planning/model`; feature hooks translate
user intent into repository commands and pages reload projections after commits.
The only application-wide React contexts are the repository port provider and the
small persistence-status value used by the shell. Neither contains planning records
or acts as a domain/query cache.

The visual remediation's presentation additions preserve these boundaries:

- `useWeekPage` composes the existing Week projection with seven existing Day
  projections in page-local state so the open Week can render task/habit facts. It
  adds no repository method, schema record, persisted aggregate, or shared cache.
- History Dynamics derives its three approved display series from existing
  repository projections and holds them only in page-local state; no chart library,
  analytics store, or telemetry path was introduced.
- `data-od-id` attributes are inert DOM anchors for structural screenshot checks.
  They contain no state and do not affect persistence or domain commands.
- `e2e/fixtures/visual.fixture.ts` uses a fixed clock and deterministic IndexedDB
  seed only inside Playwright; it is absent from the production import graph.

## Prohibited-scope audit

Production source contains no backend/HTTP/fetch/WebSocket/EventSource adapter; no
account, login, authentication, or user-switching surface; no cross-device or
cross-tab sync, `BroadcastChannel`, or `SharedWorker`; no global planning cache,
query client, Zustand, or Redux store; no service worker, web manifest, Workbox, or
PWA registration; no workout/exercise module; and no telemetry/analytics SDK or
event path. It also contains no `localStorage` or `sessionStorage` fallback.

The sole production match for `capacity` is the explanatory comment in
`planned-load.ts` stating that factual load has no capacity, threshold,
classification, or warning. There is no capacity field, overload calculation,
threshold policy, or overload UI. This is an enforcement note, not added scope.

## Commands and results

All commands ran from `C:\Projects\harness-sdd-lab` on 2026-08-13:

```powershell
npm ls --omit=dev --depth=0
npm ls --omit=dev --all
npm run lint
npm run typecheck
```

Results: both dependency-tree commands completed cleanly; lint passed with zero
warnings; strict TypeScript project typecheck passed.

Static evidence was collected with these read-only searches:

```powershell
rg -n --glob '*.ts' --glob '*.tsx' '@/' src
rg -n -P --glob '*.ts' --glob '*.tsx' --glob '!*.test.ts' --glob '!*.test.tsx' 'from [\x27\x22]@/(pages|features|entities)/[^\x27\x22]+/' src
rg -n --glob '*.ts' --glob '*.tsx' --glob '!*.test.ts' --glob '!*.test.tsx' "from 'idb'|indexedDB|IDBDatabase|IDBPDatabase|IDBTransaction" src
rg -n -i -P --glob '*.ts' --glob '*.tsx' --glob '!*.test.ts' --glob '!*.test.tsx' '\b(account|authentication|login|sign-in|telemetry|analytics|workout|exercise|overload|capacity|QueryClient|QueryCache|Zustand|Redux)\b' src
rg -n -i -P --glob '*.ts' --glob '*.tsx' --glob '!*.test.ts' --glob '!*.test.tsx' '\b(fetch|WebSocket|EventSource|BroadcastChannel|SharedWorker|serviceWorker|localStorage|sessionStorage)\b' src
Get-ChildItem -Recurse -File -Include manifest.webmanifest,manifest.json,sw.js,sw.ts,service-worker.js,service-worker.ts,vite-plugin-pwa* | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\visual-reference\\|\\playwright-report\\|\\test-results\\|\\dist\\' }
```

Results: zero shipped deep feature/entity imports; IndexedDB references only in the
one adapter directory; zero prohibited API/dependency matches; zero application PWA
artifacts. The broader vocabulary search produced only the anti-capacity comment
described above.

## T106 disposition

Every retained runtime dependency, layer, public export, adapter seam, and new
presentation/test addition has a concrete current requirement. No unsupported
architecture or scope was found, so T106 may be marked complete. This review does
not unblock release acceptance by itself: T107–T110 retain their declared sequence.
