# Feature Specification: ORBIT Server-Backed Persistence

**Feature Branch**: `feat/server-backed-persistence`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "Migrate ORBIT from device-local IndexedDB persistence to a
simple client-server architecture without changing existing product behavior. Replace
IndexedDB completely; the React client communicates with a backend API; the backend
persists all ORBIT data in a server database that becomes the only canonical data store.
Existing IndexedDB data may be discarded and there is no migration workflow. Preserve all
existing ORBIT behavior, domain rules, scoring, recurrence, history semantics, revisions,
immutable closed periods, and existing user flows. Preserve the current
`PlanningRepository` boundary where practical. Authoritative mutations and transactions
move to the server. Keep the existing React frontend."

## Context and Relationship to Feature 001

`001-personal-planning-loop` is implemented, verified, and closed. It remains the source of
truth for **all** ORBIT product behavior and domain semantics. This feature changes **where
data lives and who applies mutations**, and nothing else.

This specification supersedes exactly three requirements of feature 001, and only to the
extent that they describe device-local browser storage:

| 001 requirement | Status under 002 |
| --------------- | ---------------- |
| **001 FR-053** — data remains available in the same browser profile while site storage remains available; persistent browser storage is requested; the device-local boundary is communicated | **Superseded.** Data lives in the server database. The browser storage guarantee, the persistent-storage request, and the "local to this device/browser profile" messaging no longer apply. The obligation to surface persistence failures rather than report a failed write as saved is **retained and carried forward** by FR-011. |
| **001 FR-054** — MUST NOT synchronize planning or historical data between devices, and MUST make the device-local boundary understandable | **Superseded.** Data is not synchronized; it is *centralized*. There is one canonical store, so any browser reaching the same deployment reads and writes the same data. There is no replication, merge, conflict resolution, or offline queue. |
| **001 SC-011** — return in a later session to the same browser profile and recover the recorded data | **Superseded** by SC-002 and SC-003, which strengthen the guarantee: data is recoverable from any browser reaching the same deployment, including after browser site data is cleared. Its persistence-failure clause is retained by SC-004. |

Every other requirement, clarification, entity, and success criterion of feature 001
remains binding and unchanged. In particular, **001 FR-052 is retained**: ORBIT still
serves one user, with no account creation, sign-in, or user switching.

## Clarifications

### Session 2026-08-17

- Q: How is the conflict between server-backed storage and 001's device-local guarantee
  resolved? → A: 002 supersedes 001 FR-053 and FR-054 only insofar as they mandate
  device-local browser storage. The server database becomes the single canonical store for
  the single owner. This is centralization, not synchronization: no replication, no local
  writable replica, no merge, no conflict resolution beyond the revision checks that
  feature 001 already defines.
- Q: Must existing IndexedDB data be migrated? → A: No. Existing device-local data may be
  discarded. There is no import flow, no dual-write period, no fallback, and no
  migration UI. A deployment starts from an empty server database.
- Q: What access control does the server require? → A: The simplest arrangement the
  existing single-user model permits. No accounts, registration, sessions, sign-in, or
  user-management functionality is introduced. The deployment is single-owner and is
  intended to run where only its owner can reach it; exposing it on an untrusted network
  is outside this feature.
- Q: Which side determines the current time, given that day-closure eligibility, recurrence
  effective dates, the habit boundary miss, and every recorded audit timestamp depend on
  it? → A: The client. It supplies **both** the current local date and the current instant
  with each request, and the server reconstructs feature 001's existing application clock
  from those two values. Server behavior must not depend on the server's own timezone,
  system date, or system time. This keeps 001's clock semantics identical — the whole clock
  crosses the boundary, not half of it — regardless of where the server runs.
- Q: What happens when the server cannot be reached? → A: The operation fails visibly and
  is never presented as saved. Offline reads, offline writes, local caching for
  availability, and retry queues are out of scope.
- Q: Does the `PlanningRepository` boundary change? → A: Its named use cases, inputs,
  projections, and result shapes are preserved. The boundary remains the only persistence
  surface pages and features touch, so page and feature code requires no behavioral change.
  Storage-specific error codes that describe browser storage are replaced by equivalents
  describing server availability.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use ORBIT Unchanged Against Server-Backed Storage (Priority: P1)

As the ORBIT owner, I open the application and carry out the complete planning loop —
weekly goals, tasks, recurrence, habits, daily state, scoring, day closure, week
completion, and history — and every rule, calculation, and restriction behaves exactly as
it did before, even though my data is now kept by the server rather than by my browser.

**Why this priority**: The entire justification for this feature is that the product does
not change. If any observable behavior differs, the migration has failed regardless of what
else works.

**Independent Test**: Execute the full behavioral suite that feature 001 was accepted
against — its acceptance scenarios and automated tests — against the server-backed
application, and confirm the same outcomes with no test rewritten to accommodate different
behavior.

**Acceptance Scenarios**:

1. **Given** a server-backed deployment, **When** the owner performs any operation defined
   by feature 001, **Then** the resulting data, projections, scores, ordering, and error
   responses match feature 001's defined behavior exactly.
2. **Given** a closed day or completed week, **When** any edit, completion toggle, move,
   deletion, or reopening is attempted, **Then** it is rejected and the finalized record is
   preserved, as required by 001 FR-021, FR-044, and FR-046.
3. **Given** a recurrence rule changed several times in one local day, **When** the
   next-date boundary is reached, **Then** only the final rule is retained as the effective
   version, as required by 001 FR-019.
4. **Given** an applicable habit occurrence still pending when its local date ends,
   **When** the boundary passes, **Then** it automatically becomes not completed and
   remains correctable while its day is open, as required by 001 FR-020.
5. **Given** any scoring, planned-load, or weekly-progress calculation, **When** it is
   presented, **Then** it produces the same value that feature 001 defines, including its
   rounding and normalization rules.
6. **Given** the owner is using the application, **When** they inspect any screen, **Then**
   no new screen, control, setting, or workflow has appeared as a result of this feature.

---

### User Story 2 - Data Is No Longer Tied to One Browser (Priority: P1)

As the ORBIT owner, my planning data belongs to the ORBIT deployment rather than to a
particular browser, so I can clear my browser data, use a different browser, or use a
different device on the same deployment and still find my plans and history intact.

**Why this priority**: This is the concrete benefit the migration delivers, and it is what
makes the change worth making at all.

**Independent Test**: Record identifiable data in one browser, then open the same
deployment from a different browser and from a browser whose site data has been cleared,
and confirm the same data is present and identical.

**Acceptance Scenarios**:

1. **Given** planning data recorded in one browser, **When** the owner opens the same
   deployment in a different browser or on a different device, **Then** the same goals,
   tasks, habits, state, scores, closures, and history are present and identical.
2. **Given** planning data recorded in a browser, **When** the owner clears that browser's
   site data and reopens the application, **Then** no planning data has been lost.
3. **Given** the application is running, **When** browser storage is inspected, **Then** no
   planning data is being kept there as part of normal operation.
4. **Given** two browser windows open on the same deployment, **When** a change made in one
   is followed by a fresh read in the other, **Then** the second window observes the
   change; live push updates are not expected or required.

---

### User Story 3 - Failures Are Reported Honestly (Priority: P2)

As the ORBIT owner, when the application cannot reach its server or a change cannot be
saved, I am told clearly and the change is never shown to me as if it had been saved.

**Why this priority**: Feature 001 made honest persistence reporting a hard rule. A server
introduces a new and more frequent way for saving to fail, so the rule matters more, not
less. It is P2 only because it is meaningless without US1 and US2 in place.

**Independent Test**: Stop the server, attempt reads and writes, and confirm each surfaces
a clear failure and that no attempted change is presented as saved. Restart the server and
confirm the application recovers on the next attempt without losing previously saved data.

**Acceptance Scenarios**:

1. **Given** the server is unreachable, **When** the owner attempts a change, **Then**
   ORBIT reports the failure and does not present the change as saved.
2. **Given** the server is unreachable, **When** the owner opens a view, **Then** ORBIT
   reports that the data could not be loaded rather than showing an empty or stale plan as
   if it were the real record.
3. **Given** a change was rejected because its period is immutable or its revision is
   stale, **When** the owner sees the result, **Then** the existing feature 001 error
   meaning is conveyed and no partial change has been recorded.
4. **Given** the server becomes reachable again, **When** the owner retries, **Then** the
   operation proceeds normally and all previously saved data is intact.

---

### User Story 4 - Run the Complete Application Simply (Priority: P2)

As the ORBIT owner or a developer, I can start the complete application — interface,
backend, and database — with a single documented command, and the data I record survives
stopping and restarting it.

**Why this priority**: A server and a database turn a single static frontend into a
multi-part system. Without a simple, reliable way to run all of it, the migration makes the
project harder to use than it was.

**Independent Test**: From a clean checkout, follow the documented instructions, reach a
working application, record data, stop everything, start it again, and confirm the data is
still there.

**Acceptance Scenarios**:

1. **Given** a clean checkout and the documented prerequisites, **When** the documented
   startup command is run, **Then** the complete application becomes available and usable
   without further manual setup steps.
2. **Given** a running deployment holding recorded data, **When** it is stopped and started
   again, **Then** all previously recorded data is still present.
3. **Given** a first-ever start against an empty database, **When** the owner opens ORBIT,
   **Then** the application works correctly as a new, empty planning space rather than
   failing.
4. **Given** the running application, **When** the owner uses the interface and it exchanges
   data with the backend, **Then** it does so without the owner needing to configure or be
   aware of separate addresses for the interface and the backend.

### Edge Cases

- The server is unreachable when the application first loads, mid-session, or partway
  through a multi-step flow such as day closure.
- The database is reachable but the server cannot complete a request.
- A day closure, week completion, or task move fails partway through: no partial result may
  remain, because feature 001 treats each of these as one atomic outcome.
- Two windows or devices submit changes to the same day, week, task, or habit; feature
  001's existing revision-conflict rules decide the outcome and no data is silently
  overwritten.
- A change is submitted against a revision that a concurrent change has already advanced.
- The client's local date and the server's system date disagree, including across a
  midnight boundary and when the server runs in a different timezone.
- The owner's device clock changes, or a request crosses a local midnight boundary.
- A first start runs against a completely empty database.
- The deployment is started against a database whose stored structure predates the current
  application version.
- The database's persistent storage is removed and recreated empty.
- A browser profile still holds data from the previous device-local version of ORBIT.
- History or weekly views request a period containing large volumes of accumulated data.

## Requirements *(mandatory)*

### Functional Requirements

#### Canonical Storage

- **FR-001**: The server database MUST be the only canonical store for all ORBIT planning
  and historical data. No other store may hold authoritative data.
- **FR-002**: Browser-local database storage MUST NOT participate in normal runtime
  persistence. ORBIT MUST NOT read planning data from it, write planning data to it, or
  fall back to it when the server is unavailable.
- **FR-003**: Data previously held in browser-local storage MAY be discarded. ORBIT MUST
  NOT provide an import, export, dual-write, fallback, or migration workflow for it, and
  MUST NOT present the owner with any new screen, prompt, or setting related to it.
- **FR-004**: A deployment started against an empty database MUST behave as a correct,
  empty ORBIT installation rather than reporting an error state.

#### Authoritative Server Behavior

- **FR-005**: The server MUST apply every mutation authoritatively. The client MUST NOT be
  able to record a change that the server's domain rules would reject.
- **FR-006**: The server MUST enforce every domain rule, validation, and restriction
  defined by feature 001, including immutable closed days and completed weeks, task
  lifecycle restrictions, closure eligibility and disposition rules, recurrence semantics,
  and scoring inputs, regardless of what the client sends.
- **FR-007**: Each operation defined at the persistence boundary MUST succeed or fail as a
  single unit. A rejected or failed operation MUST leave no partial change recorded. This
  applies in particular to day closure, week completion, task movement, goal reordering,
  and recurrence rule changes.
- **FR-008**: The server MUST enforce the revision checks that feature 001 already defines.
  A change submitted against a stale revision MUST be rejected with the existing conflict
  meaning and MUST NOT overwrite the newer state.
- **FR-009**: The client MUST supply both the current local date and the current instant
  with each request that depends on them, and the server MUST reconstruct feature 001's
  application clock from exactly those two supplied values. Every time-dependent server
  behavior — closure eligibility, recurrence effective dates, the automatic habit boundary
  miss, and every recorded audit timestamp — MUST derive from that reconstructed clock and
  MUST NOT read the server's own timezone, system date, or system time, so that behavior is
  identical to feature 001 regardless of where the server runs.
- **FR-010**: The server MUST NOT introduce any product rule, default, calculation, or
  restriction that feature 001 does not define.

#### Client Behavior and Boundary

- **FR-011**: When an operation cannot be completed, ORBIT MUST report the failure to the
  owner and MUST NOT present the change as saved. This carries forward the honest-reporting
  obligation of 001 FR-053 and 001 SC-011 into the server-backed architecture.
- **FR-012**: When data cannot be loaded, ORBIT MUST communicate that the data is
  unavailable rather than presenting an empty or stale view as the true record.
- **FR-013**: The persistence boundary MUST remain the only persistence surface that pages
  and features use, and MUST preserve its existing named use cases, inputs, and returned
  projections so that page and feature code requires no behavioral change.
- **FR-014**: Persistence error meanings that describe browser storage MUST be replaced by
  equivalents describing server or database availability. Every domain error meaning
  defined by feature 001 MUST be preserved unchanged.
- **FR-015**: ORBIT MUST NOT request persistent browser storage, and MUST NOT present
  messaging describing data as local to the current device or browser profile, since
  neither is true after this feature.
- **FR-016**: The interface MUST reach the backend without requiring the owner to configure
  or be aware of separate addresses for the interface and the backend.

#### Deployment and Operation

- **FR-017**: The complete application — interface, backend, and database — MUST be startable
  with a single documented command from a clean checkout, given documented prerequisites.
- **FR-018**: Recorded data MUST survive stopping and restarting the deployment.
- **FR-019**: The database structure MUST be established and updated by a repeatable,
  automated mechanism rather than by manual steps, so that a fresh start and an existing
  deployment both reach the correct structure.
- **FR-020**: Deployment configuration such as connection details and ports MUST be
  supplied through configuration rather than embedded in application code, and the project
  MUST document the values needed to run it.

#### Access and Scope Constraints

- **FR-021**: ORBIT MUST retain the single-user, no-account model of 001 FR-052. This
  feature MUST NOT add accounts, registration, sign-in, sessions, user switching,
  multi-user data separation, or collaboration.
- **FR-022**: Access control MUST remain as simple as the single-user model permits. The
  deployment is single-owner and intended to run where only its owner can reach it;
  hardening it for an untrusted network is outside this feature.
- **FR-023**: This feature MUST NOT add offline reads, offline writes, local writable
  replicas, background synchronization, retry queues, conflict merging, realtime or pushed
  updates, idempotency keys, request deduplication, replay protection, or new analytics.
- **FR-024**: This feature MUST NOT change any user-facing wording, layout, interaction, or
  workflow defined by feature 001 and its approved design references, except where wording
  described device-local storage as required by FR-015.

### Key Entities

- **Canonical Data Store**: The single server-side store holding every ORBIT entity defined
  by feature 001 — weeks, weekly goals, days, tasks, task occurrences, task plan
  memberships, task events, backlog, recurrence rules, habit definitions, habit
  occurrences, daily state entries, closure snapshots, weekly progress, and reflections —
  with the same meaning and relationships feature 001 defines.
- **Planning Boundary**: The single named-use-case surface through which the interface
  reads projections and requests changes. Its use cases, inputs, and projections are those
  feature 001 established; only the mechanism behind it changes.
- **Backend Service**: The component that receives requests from the interface, applies
  feature 001's domain rules authoritatively, performs each operation as a single atomic
  unit, and reads and writes the canonical data store.
- **Client Clock Reading**: The current local date and current instant, both determined on
  the owner's device and supplied together with requests that depend on them. The server
  reconstructs feature 001's application clock from this pair, so that all time-dependent
  behavior and every recorded timestamp remain identical to feature 001 regardless of the
  server's timezone or system time.
- **Deployment**: The runnable combination of interface, backend service, and database,
  together with the persistent storage that preserves recorded data across restarts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of feature 001's acceptance scenarios and automated behavioral tests
  pass against the server-backed application, with no test altered to accommodate different
  product behavior.
- **SC-002**: In 100% of cross-browser checks, data recorded in one browser is present and
  identical when the same deployment is opened from a different browser or device.
- **SC-003**: In 100% of browser-storage-clearing checks, clearing the browser's site data
  results in 0% loss of recorded planning data.
- **SC-004**: In 100% of simulated failure scenarios — server unreachable, request failure,
  and rejected change — ORBIT reports the failure and 0% of failed changes are presented as
  saved.
- **SC-005**: In 100% of interrupted or rejected multi-step operations, including day
  closure and week completion, 0 partial changes remain recorded.
- **SC-006**: In 100% of concurrent-change tests, a change submitted against a stale
  revision is rejected and 0% of newer changes are silently overwritten.
- **SC-007**: In 100% of time-dependent tests, behavior and every recorded timestamp are
  identical when the server runs in a different timezone from the client and when its system
  clock is offset from the client's, including across a local midnight boundary.
- **SC-008**: Browser-local database storage holds 0 planning records during normal
  operation, and the application performs 0 planning reads or writes against it.
- **SC-009**: From a clean checkout with documented prerequisites, a single documented
  command produces a working application with no additional manual setup steps.
- **SC-010**: In 100% of restart tests, data recorded before stopping the deployment is
  present after starting it again.
- **SC-011**: Common planning operations — opening a day or week, saving a task, toggling
  completion — complete in under 1 second on a local deployment, so the interface remains as
  responsive as it was before the migration.
- **SC-012**: Every quality gate that feature 001 was accepted against passes for the
  migrated application.
- **SC-013**: Review confirms 0 new user-facing screens, controls, settings, or workflows
  compared with feature 001, and 0 changes to user-facing wording other than the removal of
  device-local storage messaging.

## Technical Direction *(product-owner supplied; binding input to planning)*

Recorded here as an explicit constraint on `/speckit-plan` rather than as a product
requirement. The requirements above are deliberately technology-neutral; this section names
the chosen technologies so the plan does not re-open settled decisions.

- TypeScript throughout.
- The existing React/Vite frontend is kept.
- Fastify backend.
- PostgreSQL as the database, accessed via Kysely with `pg`.
- PostgreSQL runs as a Docker Compose service using a persistent Docker volume. No external
  or managed database is required.
- Docker Compose runs the complete application.
- Prefer a single origin serving both the interface and the API.
- Keep the implementation and deployment model as simple as possible. Do not introduce
  abstractions or infrastructure for hypothetical future requirements, consistent with
  constitution Principle III.

## Assumptions

- Feature 001's specification, domain model, and approved design references remain
  authoritative for everything except where the table in "Context and Relationship to
  Feature 001" records an explicit supersession.
- The deployment serves a single owner and runs where only that owner can reach it —
  typically a local machine or a private host. Public exposure, hardening, and hostile-network
  concerns are outside this feature.
- Discarding existing device-local data is acceptable because ORBIT has not been operated as
  a production system with data the owner needs to keep.
- One ORBIT deployment holds one owner's data. Separating data by user does not arise,
  because 001 FR-052's single-user model is retained.
- The owner's device clock is the authority for both the current local date and the current
  instant, exactly as it is in feature 001. The server holds no independent notion of "now".
- The owner is online with respect to their ORBIT deployment while using it. Offline use was
  never a feature 001 guarantee beyond device-local storage, and is explicitly out of scope
  here.
- Data volume remains that of a single individual's personal planning history, so no
  partitioning, archival, or scale-out concern arises.
- Feature 001's existing automated test suite is the primary instrument for proving behavior
  is unchanged, and its domain logic is reusable by a server without semantic modification.

## Scope Boundaries

### In Scope

- Replacing browser-local database storage with a server-backed canonical store.
- Introducing a backend service that applies feature 001's domain rules authoritatively and
  performs each boundary operation atomically.
- Adapting the persistence boundary implementation while preserving its use cases, inputs,
  and projections.
- Replacing browser-storage error meanings with server-availability equivalents.
- Removing the persistent-browser-storage request and device-local storage messaging.
- A repeatable automated mechanism for establishing and updating the database structure.
- A single documented command that runs the complete application with data surviving
  restarts.

### Out of Scope

- Any change to product behavior, domain rules, scoring, recurrence, history semantics,
  closure rules, or user flows defined by feature 001.
- New planning features or new analytics.
- Migrating, importing, exporting, or preserving existing device-local data, and any user
  interface for doing so.
- Offline-first support, offline reads or writes, local writable replicas, background
  synchronization, retry queues, and conflict merging beyond feature 001's existing
  revision checks.
- Idempotency keys, request deduplication, and replay protection. Each individual request
  is applied atomically (FR-007), but the feature adds no machinery to recognise a
  duplicated or retried request as one already applied.
- Realtime or pushed updates, and collaboration.
- Accounts, registration, sign-in, sessions, user switching, multi-user support, and
  user-management functionality.
- Hardening the deployment for untrusted networks, hosting, scaling, backup and restore
  procedures, and monitoring.
- Reopening any product decision recorded in feature 001 that this specification does not
  explicitly supersede.

## Dependencies

- `001-personal-planning-loop` — its `spec.md`, `data-model.md`, `contracts/`, and approved
  design references remain the authority for all preserved behavior.
- Feature 001's automated test suite and quality gates, which are the evidence that behavior
  is unchanged.
- Container tooling on the machine running ORBIT, for the documented single-command startup.
