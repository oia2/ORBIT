# Baseline: before ORBIT Planning Refinements

**Feature**: `003-planning-refinements` | **Recorded**: 2026-08-22 | **Tasks**: T001, T002

Established so that any later failure is attributable to this feature rather than inherited.

## Blocker found and fixed before the baseline could be taken

`npm run verify` could not pass on this machine at all. `format:check` failed on **161 files**
— effectively the whole repository.

**Cause**: `git config core.autocrlf` is `true` and the repository had no `.gitattributes`, so
every file was checked out with CRLF line endings while Prettier's default
`endOfLine: "lf"` requires LF. The committed blobs were already LF; only the working tree
differed. This is an environment artifact of this Windows checkout, not a code defect, and it
predates this feature.

**Fix** (setup, not feature work):

- Added `.gitattributes` with `* text=auto eol=lf` plus binary rules, so every checkout is LF
  on every platform.
- Normalized the 211 tracked text files in the working tree to LF and ran
  `git add --renormalize .`.

**Verified non-destructive**: `git diff` and `git diff --stat` were both empty afterwards, and
`git status` returned to clean apart from this feature's own files. No file content changed.

## Quality gates on the untouched branch

| Gate | Result |
| ---- | ------ |
| `npm run format:check` | ✅ pass (after the `.gitattributes` fix above) |
| `npm run lint` (`--max-warnings 0`) | ✅ pass |
| `npm run typecheck` (`tsc -b`) | ✅ pass |
| `npm run test:server` | ✅ pass |
| `npm run test:coverage` | ✅ pass — 53 files, **404 tests** |
| `npm run test:e2e` | ✅ pass — **67 tests** in 5.1m, including 16 visual baselines |
| `npm run test:server:tz` (non-UTC) | ✅ pass — 22 files, **199 tests** |

`npm run verify` exit code **0**.

> Caveat: the recorded `verify` run overlapped the first US2 edits, so its e2e phase built
> from a partially updated tree. It passed, but T086 re-runs the whole gate on the finished
> branch and that run is the authoritative one.

## Live database before the upgrade

Taken from the running production instance (`harness-sdd-lab-db-1`).

| Table | Rows |
| ----- | ---- |
| `weeks` | 6 |
| `days` | 42 |
| `task_occurrences` | 20 |
| `task_plan_entries` | 20 |
| `task_events` | 106 → 108 (the owner kept using the app during setup) |
| `habit_definitions` | 2 |
| `habit_occurrences` | 22 |
| `task_series` | 0 |

### Closed days and their frozen snapshots

| Date | task | habit | value | `plannedLoadMinutes` |
| ---- | ---- | ----- | ----- | -------------------- |
| 2026-08-18 | 4/4 | 2/2 | 100 | 185 |
| 2026-08-19 | 5/5 | 2/2 | 100 | 420 |
| 2026-08-20 | 4/4 | 2/2 | 100 | 285 |

All three carry `weightsApplied: {task: 70, habit: 30}`, which migration
`002-single-weight-snapshots` removes. Every count and every `plannedLoadMinutes` above must
be **byte-identical** after the upgrade (FR-002, FR-021, SC-011).

### Data coverage

`task_plan_entries` span `2026-08-18` → `2026-08-23`; `task_events` span
`2026-08-18T08:44Z` → `2026-08-22T07:42Z`. `days` and `weeks` reach back to `2026-07-20`, but
those are empty calendar scaffolding created by `ensureCalendarWeek` when History was browsed
backwards — they never held content. See [research.md](./research.md) Finding A1.

## Backups

| Artifact | Size | Purpose |
| -------- | ---- | ------- |
| `orbit-pre-003.dump` | 34 397 bytes | The quickstart §0 pre-upgrade dump |
| `backups/orbit-2026-08-22T10-34-06-007.dump` | 34 397 bytes | Produced by the new `npm run db:backup` |

**Restore proven** (T003): the backup was restored into a scratch database
`orbit_restore_check` with `npm run db:restore`, yielding 42 days, 20 plan entries, and 108
task events — matching the source. The owner's `orbit` database was never written to.

Both paths are gitignored (`*.dump`, `backups/`).

## Live upgrade result (T011)

Executed the volume-safe `docker compose up -d --build` upgrade on 2026-08-22. A fresh
pre-upgrade backup, `backups/orbit-2026-08-22T11-56-59-509.dump` (34 397 bytes), was taken
first. The first automated build attempts stopped before deployment on transient npm registry
`ECONNRESET` errors; the owner completed the same build after connectivity recovered. The
existing app and database remained running throughout those failed attempts.

| Check | Before | After | Result |
| ----- | ------ | ----- | ------ |
| `weeks` | 6 | 6 | ✅ identical |
| `days` | 42 | 42 | ✅ identical |
| `task_occurrences` | 20 | 20 | ✅ identical |
| `task_plan_entries` | 20 | 20 | ✅ identical |
| `task_events` | 108 | 108 | ✅ identical |
| `habit_definitions` | 2 | 2 | ✅ identical |
| `habit_occurrences` | 22 | 22 | ✅ identical |
| `task_series` | 0 | 0 | ✅ identical |

Migrations `002-single-weight-snapshots` and `003-habit-duration` were recorded by Kysely.
For the three closed days, task counts, habit counts, and `plannedLoadMinutes` remained
byte-identical to the table above. All values remained 100% under the single-weight rule,
and `weightsApplied` is absent from every closure snapshot. Restarting the app left the
snapshots unchanged, proving the deployed migration path is idempotent.
