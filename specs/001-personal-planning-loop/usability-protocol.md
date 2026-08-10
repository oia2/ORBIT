# MVP Manual Usability Protocol

**Feature**: `001-personal-planning-loop`  
**Status**: Approved through the 2026-08-10 specification clarification  
**Execution point**: Production build, after affected UI work is complete

This protocol is the external acceptance procedure for SC-001, SC-002, SC-003,
and SC-010. It does not authorize analytics, telemetry, accounts, or a backend.

## Participant and environment

- Use one representative target user or the product owner.
- Use the production build with its normal device-local persistence behavior.
- Prepare the written task instruction and starting data before timing begins.

## Timing and assistance

1. Show the written task instruction before timing.
2. Start timing when the instruction is presented and the participant can begin
   interacting.
3. Stop timing when the required visible outcome is achieved.
4. After timing starts, the moderator provides no UI guidance or hints.
5. Ordinary clarification of the written task is allowed only when it does not
   explain how to use ORBIT.
6. Any UI assistance fails a criterion that requires completion without
   assistance. Exceeding a stated time limit fails that timed criterion.

## Acceptance tasks

| Criterion | Task and pass condition |
|---|---|
| SC-001 | Create a weekly goal, add and assign tasks with durations, complete a task, and reach day closure without UI assistance. No time limit is added. |
| SC-002 | Create a representative weekly plan with three goals and ten tasks in 10 minutes or less. |
| SC-003 | Time each applicable operation independently: create a task; edit, check completion, uncheck completion, move, or delete an existing task. Each must take 30 seconds or less. Cancellation is not an ordinary task operation and is evaluated only inside Close Day. |
| SC-010 | Use Day, Week, or Month History navigation to locate a requested prior period, task, habit occurrence, score, weekly progress, load, or reflection in 30 seconds or less. Use scenario variants so weekly progress is directly exercised. |

## Evidence record

Record evidence outside ORBIT with these fields:

| Field | Required value |
|---|---|
| Criterion and task | SC identifier plus the exact written instruction |
| Participant | Representative target user or product owner |
| Build | Production-build identifier |
| Elapsed time | Actual recorded duration for every criterion; SC-001 has no time-based pass/fail threshold |
| Assistance | None, or a factual description of any assistance |
| Result | Pass or fail, with the unmet condition when failed |

Do not add product instrumentation solely to collect this evidence.
