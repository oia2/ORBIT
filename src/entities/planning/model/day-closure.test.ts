import { describe, expect, it } from 'vitest';

import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  revision,
  type DayPosition,
  type DurationMinutes,
} from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate, startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';
import type { Result } from '@/shared/lib/result';

import { createOpenDay, type ClosedDay, type Day } from './day';
import { selectDaySignals } from './selectors';
import * as dayClosure from './day-closure';
import {
  prepareDayClosure,
  type DayClosurePreparation,
  type PrepareDayClosureInput,
} from './day-closure';
import type { HabitOccurrence, HabitOutcome } from './habit';
import type { TaskPeriodState } from './task-lifecycle';
import type {
  CompletedDatedTaskOccurrence,
  CompletedTaskPlanEntry,
  DeletedTaskPlanEntry,
  IncompleteDatedTaskOccurrence,
  MovedTaskPlanEntry,
  PlannedTaskPlanEntry,
  TaskOccurrence,
  TaskPlanEntry,
} from './task';
import type { Week } from './week';

const OLDER_DATE = localDate('2026-08-10');
const SOURCE_DATE = localDate('2026-08-11');
const DESTINATION_DATE = localDate('2026-08-12');
const CLOSED_DESTINATION_DATE = localDate('2026-08-13');
const NOW = instant('2026-08-11T15:00:00.000Z');
const ENTERED_AT = instant('2026-08-10T08:00:00.000Z');
const CLOCK = createFixedClock({ instant: NOW, currentLocalDate: SOURCE_DATE });

function id<TKind extends string>(suffix: string) {
  return entityId<TKind>(`123e4567-e89b-42d3-a456-42661417${suffix}`);
}

function incompleteTask(
  suffix: string,
  minutes = 30,
  overrides: Partial<IncompleteDatedTaskOccurrence> = {},
): IncompleteDatedTaskOccurrence {
  return {
    id: id<'task-occurrence'>(suffix),
    title: `Task ${suffix}`,
    state: 'active',
    placement: { kind: 'day', date: SOURCE_DATE },
    plannedDurationMinutes: durationMinutes(minutes),
    dayPosition: dayPosition(Number(suffix.at(-1)) || 0),
    completion: 'incomplete',
    isException: false,
    createdSequence: creationSequence(Number(suffix) || 1),
    revision: revision(0),
    ...overrides,
  };
}

function completedTask(suffix: string, minutes = 30): CompletedDatedTaskOccurrence {
  return {
    ...incompleteTask(suffix, minutes),
    completion: 'completed',
    actualCompletedAt: NOW,
  };
}

function plannedMembership(
  occurrence: TaskOccurrence,
  date = SOURCE_DATE,
  overrides: Partial<PlannedTaskPlanEntry> = {},
): PlannedTaskPlanEntry {
  const plannedDurationMinutes = occurrence.plannedDurationMinutes ?? durationMinutes(30);
  return {
    id: id<'task-plan-entry'>(`6${occurrence.id.slice(-3)}`),
    occurrenceId: occurrence.id,
    date,
    weekStart: startOfWeek(date),
    plannedSnapshot: {
      title: occurrence.title,
      plannedDurationMinutes,
    },
    outcome: 'planned',
    enteredAt: ENTERED_AT,
    ...overrides,
  };
}

function completedMembership(
  occurrence: TaskOccurrence,
  date = SOURCE_DATE,
): CompletedTaskPlanEntry {
  return { ...plannedMembership(occurrence, date), outcome: 'completed' };
}

function habitOccurrence(
  suffix: string,
  outcome: HabitOutcome,
  date = SOURCE_DATE,
): HabitOccurrence {
  return {
    id: id<'habit-occurrence'>(suffix),
    definitionId: id<'habit-definition'>(`7${suffix.slice(-3)}`),
    date,
    weekStart: startOfWeek(date),
    definitionSnapshot: { title: `Habit ${suffix}` },
    ruleRevision: revision(0),
    isException: false,
    outcome,
    outcomeEvents: [],
    updatedAt: NOW,
  };
}

function closedDay(date: LocalDate): ClosedDay {
  return {
    date,
    weekStart: startOfWeek(date),
    status: 'closed',
    revision: revision(1),
    closureSnapshot: {
      score: {
        task: { completed: 0, applicable: 0, rate: 'unavailable' },
        habit: { completed: 0, applicable: 0, rate: 'unavailable' },
        value: 'unavailable',
      },
      plannedLoadMinutes: 0 as never,
    },
    closedAt: NOW,
  };
}

function openWeek(date: LocalDate): Week {
  return {
    startDate: startOfWeek(date),
    goals: [],
    status: 'open',
    revision: revision(0),
  };
}

function completedWeek(date: LocalDate): Week {
  return {
    startDate: startOfWeek(date),
    goals: [],
    status: 'completed',
    revision: revision(1),
    completionSnapshot: {
      progress: {
        task: { completed: 0, applicable: 0, rate: 'unavailable' },
        habit: { completed: 0, applicable: 0, rate: 'unavailable' },
        value: 'unavailable',
      },
    },
    completedAt: NOW,
  };
}

function period(
  date: LocalDate,
  overrides: { readonly day?: Day; readonly week?: Week } = {},
): TaskPeriodState {
  return {
    day: overrides.day ?? createOpenDay(date),
    week: overrides.week ?? openWeek(date),
  };
}

function closureInput(overrides: Partial<PrepareDayClosureInput> = {}): PrepareDayClosureInput {
  return {
    sourcePeriod: period(SOURCE_DATE),
    clock: CLOCK,
    dispositions: {},
    taskOccurrences: [],
    taskPlanEntries: [],
    habitOccurrences: [],
    destinationPeriods: [],
    destinationPlanEntryIds: {},
    ...overrides,
  };
}

function requireOk<T, E>(result: Result<T, E>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected success, received ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function effectEntry(
  preparation: DayClosurePreparation,
  occurrenceId: TaskOccurrence['id'],
  date: LocalDate,
): TaskPlanEntry | undefined {
  return preparation.effects.taskPlanEntries.find(
    (entry) => entry.occurrenceId === occurrenceId && entry.date === date,
  );
}

describe('day-closure calendar and lifecycle eligibility', () => {
  it('closes current and past days independently without inspecting older open days', () => {
    const current = requireOk(
      prepareDayClosure(closureInput({ destinationPeriods: [period(OLDER_DATE)] })),
    );
    expect(current.effects.day).toMatchObject({
      date: SOURCE_DATE,
      status: 'closed',
      closedAt: NOW,
      revision: 1,
    });

    const past = requireOk(
      prepareDayClosure(
        closureInput({
          sourcePeriod: period(OLDER_DATE),
          destinationPeriods: [period(localDate('2026-08-09'))],
        }),
      ),
    );
    expect(past.effects.day.date).toBe(OLDER_DATE);
  });

  it('rejects future closure from the injected local-date clock', () => {
    expect(prepareDayClosure(closureInput({ sourcePeriod: period(DESTINATION_DATE) }))).toEqual({
      ok: false,
      error: {
        code: 'FutureDayClosure',
        date: DESTINATION_DATE,
        currentLocalDate: SOURCE_DATE,
      },
    });
  });

  it('rejects a closed day and exposes no reopen transition', () => {
    expect(
      prepareDayClosure(
        closureInput({
          sourcePeriod: period(SOURCE_DATE, { day: closedDay(SOURCE_DATE) }),
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: 'PeriodImmutable', date: SOURCE_DATE },
    });
    expect(
      prepareDayClosure(
        closureInput({
          sourcePeriod: period(SOURCE_DATE, { week: completedWeek(SOURCE_DATE) }),
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: 'PeriodImmutable', weekStart: startOfWeek(SOURCE_DATE) },
    });
    expect(dayClosure).not.toHaveProperty('reopenDay');
  });

  it('rejects source records that do not own the closing date', () => {
    const wrongWeekStart = localDate('2026-08-17');
    expect(
      prepareDayClosure(
        closureInput({
          sourcePeriod: {
            day: { ...createOpenDay(SOURCE_DATE), weekStart: wrongWeekStart },
            week: openWeek(SOURCE_DATE),
          },
        }),
      ),
    ).toEqual({
      ok: false,
      error: {
        code: 'ClosureDataInvariant',
        message: `Source period records do not own ${SOURCE_DATE}`,
      },
    });
  });
});

describe('exact explicit closure dispositions', () => {
  it('requires exactly the current unfinished occurrence set with no default', () => {
    const first = incompleteTask('5101');
    const second = incompleteTask('5102');
    const completed = completedTask('5103');
    const base = closureInput({
      taskOccurrences: [first, second, completed],
      taskPlanEntries: [
        plannedMembership(first),
        plannedMembership(second),
        completedMembership(completed),
      ],
    });

    expect(
      prepareDayClosure({
        ...base,
        dispositions: { [first.id]: { kind: 'keep-unfinished' } },
      }),
    ).toEqual({
      ok: false,
      error: {
        code: 'ClosureDispositionMismatch',
        expectedOccurrenceIds: [first.id, second.id],
        receivedOccurrenceIds: [first.id],
      },
    });

    expect(
      prepareDayClosure({
        ...base,
        dispositions: {
          [first.id]: { kind: 'keep-unfinished' },
          [second.id]: { kind: 'cancel' },
          [completed.id]: { kind: 'cancel' },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'ClosureDispositionMismatch',
        expectedOccurrenceIds: [first.id, second.id],
        receivedOccurrenceIds: [first.id, second.id, completed.id],
      },
    });

    expect(
      prepareDayClosure({
        ...base,
        dispositions: {
          [first.id]: { kind: 'keep-unfinished' },
          [second.id]: undefined as never,
        },
      }),
    ).toEqual({
      ok: false,
      error: { code: 'InvalidClosureDisposition', occurrenceId: second.id },
    });
    expect(dayClosure).not.toHaveProperty('defaultDisposition');
  });

  it('prepares all four dispositions, final outcomes, score, load, and audit effects', () => {
    const keep = incompleteTask('5201', 10);
    const moveDate = incompleteTask('5202', 20);
    const moveBacklog = incompleteTask('5203', 30);
    const cancel = incompleteTask('5204', 40);
    const completed = completedTask('5205', 50);
    const completedHabit = habitOccurrence('5301', 'completed');
    const missedHabit = habitOccurrence('5302', 'not-completed');
    const deletedHabit = habitOccurrence('5303', 'deleted');
    const input = closureInput({
      taskOccurrences: [keep, moveDate, moveBacklog, cancel, completed],
      taskPlanEntries: [
        plannedMembership(keep),
        plannedMembership(moveDate),
        plannedMembership(moveBacklog),
        plannedMembership(cancel),
        completedMembership(completed),
      ],
      habitOccurrences: [completedHabit, missedHabit, deletedHabit],
      dispositions: {
        [keep.id]: { kind: 'keep-unfinished' },
        [moveDate.id]: {
          kind: 'move-to-date',
          destinationDate: DESTINATION_DATE,
          durationMinutes: durationMinutes(25),
          dayPosition: dayPosition(2),
        },
        [moveBacklog.id]: { kind: 'move-to-backlog' },
        [cancel.id]: { kind: 'cancel' },
      },
      destinationPeriods: [period(DESTINATION_DATE)],
      destinationPlanEntryIds: {
        [moveDate.id]: id<'task-plan-entry'>('6202'),
      },
    });
    const before = JSON.stringify(input);
    const prepared = requireOk(prepareDayClosure(input));

    expect(JSON.stringify(input)).toBe(before);
    expect(prepared.effects.day.closureSnapshot).toEqual({
      plannedLoadMinutes: 150,
      score: {
        task: { completed: 1, applicable: 5, rate: 1 / 5 },
        habit: { completed: 1, applicable: 2, rate: 1 / 2 },
        value: 29,
      },
    });

    expect(effectEntry(prepared, keep.id, SOURCE_DATE)).toMatchObject({
      outcome: 'kept-unfinished',
      finalizedAt: NOW,
    });
    expect(effectEntry(prepared, moveDate.id, SOURCE_DATE)).toMatchObject({
      outcome: 'moved',
      destination: { kind: 'day', date: DESTINATION_DATE },
      finalizedAt: NOW,
    });
    expect(effectEntry(prepared, moveDate.id, DESTINATION_DATE)).toMatchObject({
      id: id<'task-plan-entry'>('6202'),
      outcome: 'planned',
      plannedSnapshot: { plannedDurationMinutes: 25 },
    });
    expect(effectEntry(prepared, moveBacklog.id, SOURCE_DATE)).toMatchObject({
      outcome: 'backlogged',
      destination: { kind: 'backlog' },
      finalizedAt: NOW,
    });
    expect(effectEntry(prepared, cancel.id, SOURCE_DATE)).toMatchObject({
      outcome: 'canceled',
      finalizedAt: NOW,
    });
    expect(effectEntry(prepared, completed.id, SOURCE_DATE)).toMatchObject({
      outcome: 'completed',
      finalizedAt: NOW,
    });

    expect(prepared.effects.taskOccurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: keep.id, state: 'finalized', placement: { kind: 'none' } }),
        expect.objectContaining({
          id: moveDate.id,
          state: 'active',
          placement: { kind: 'day', date: DESTINATION_DATE },
          completion: 'incomplete',
          plannedDurationMinutes: 25,
          dayPosition: 2,
        }),
        expect.objectContaining({
          id: moveBacklog.id,
          state: 'active',
          placement: { kind: 'backlog' },
        }),
        expect.objectContaining({
          id: cancel.id,
          state: 'finalized',
          placement: { kind: 'none' },
        }),
        expect.objectContaining({
          id: completed.id,
          state: 'finalized',
          placement: { kind: 'none' },
        }),
      ]),
    );
    expect(prepared.effects.taskEvents.map((event) => event.type)).toEqual([
      'closure-keep',
      'closure-move',
      'closure-move',
      'closure-cancel',
    ]);
    expect(
      prepared.effects.taskEvents.every((event) => !('id' in event) && !('sequence' in event)),
    ).toBe(true);
  });
});

describe('closure destination and habit gates', () => {
  function moveInput(overrides: Partial<PrepareDayClosureInput> = {}): PrepareDayClosureInput {
    const task = incompleteTask('5401');
    return closureInput({
      taskOccurrences: [task],
      taskPlanEntries: [plannedMembership(task)],
      dispositions: {
        [task.id]: {
          kind: 'move-to-date',
          destinationDate: DESTINATION_DATE,
          durationMinutes: durationMinutes(30),
          dayPosition: dayPosition(0),
        },
      },
      destinationPeriods: [period(DESTINATION_DATE)],
      destinationPlanEntryIds: { [task.id]: id<'task-plan-entry'>('6401') },
      ...overrides,
    });
  }

  it('requires a different, open destination with a positive duration', () => {
    const taskId = id<'task-occurrence'>('5401');
    expect(
      prepareDayClosure(
        moveInput({
          dispositions: {
            [taskId]: {
              kind: 'move-to-date',
              destinationDate: SOURCE_DATE,
              durationMinutes: durationMinutes(30),
              dayPosition: dayPosition(0),
            },
          },
          destinationPeriods: [period(SOURCE_DATE)],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'InvalidClosureDestination', reason: 'same-date' },
    });

    expect(
      prepareDayClosure(
        moveInput({
          destinationPeriods: [period(DESTINATION_DATE, { day: closedDay(DESTINATION_DATE) })],
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: 'MoveTargetClosed', destinationDate: DESTINATION_DATE },
    });

    expect(
      prepareDayClosure(
        moveInput({
          destinationPeriods: [],
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: 'MoveTargetClosed', destinationDate: DESTINATION_DATE },
    });

    expect(
      prepareDayClosure(
        moveInput({
          destinationPeriods: [period(DESTINATION_DATE, { week: completedWeek(DESTINATION_DATE) })],
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: 'MoveTargetClosed', destinationDate: DESTINATION_DATE },
    });

    expect(
      prepareDayClosure(
        moveInput({
          dispositions: {
            [taskId]: {
              kind: 'move-to-date',
              destinationDate: DESTINATION_DATE,
              durationMinutes: 0 as DurationMinutes,
              dayPosition: dayPosition(0),
            },
          },
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'InvalidClosureDestination', reason: 'non-positive-duration' },
    });

    expect(
      prepareDayClosure(
        moveInput({
          dispositions: {
            [taskId]: {
              kind: 'move-to-date',
              destinationDate: DESTINATION_DATE,
              durationMinutes: durationMinutes(30),
              dayPosition: -1 as DayPosition,
            },
          },
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'InvalidClosureDestination', reason: 'invalid-day-position' },
    });
  });

  it('requires an allocated id only for a new destination membership and reuses an existing one', () => {
    const task = incompleteTask('5501');
    const missingId = moveInput({
      taskOccurrences: [task],
      taskPlanEntries: [plannedMembership(task)],
      dispositions: {
        [task.id]: {
          kind: 'move-to-date',
          destinationDate: DESTINATION_DATE,
          durationMinutes: durationMinutes(45),
          dayPosition: dayPosition(1),
        },
      },
      destinationPlanEntryIds: {},
    });
    expect(prepareDayClosure(missingId)).toEqual({
      ok: false,
      error: { code: 'DestinationPlanEntryIdRequired', occurrenceId: task.id },
    });

    const existing = {
      ...plannedMembership(task, DESTINATION_DATE),
      outcome: 'moved',
      destination: { kind: 'day', date: SOURCE_DATE },
    } as const satisfies MovedTaskPlanEntry;
    const reused = requireOk(
      prepareDayClosure({
        ...missingId,
        taskPlanEntries: [plannedMembership(task), existing],
      }),
    );
    expect(effectEntry(reused, task.id, DESTINATION_DATE)).toEqual({
      id: existing.id,
      occurrenceId: existing.occurrenceId,
      date: existing.date,
      weekStart: existing.weekStart,
      enteredAt: existing.enteredAt,
      plannedSnapshot: {
        title: task.title,
        plannedDurationMinutes: durationMinutes(45),
      },
      outcome: 'planned',
    });
  });

  it('preserves optional recurrence context and notes in occurrence, audit, and destination effects', () => {
    const task = incompleteTask('5551', 30, {
      seriesId: id<'task-series'>('7551'),
      nominalDate: SOURCE_DATE,
      ruleRevision: revision(2),
      notes: 'Retain this context',
    });
    const prepared = requireOk(
      prepareDayClosure(
        closureInput({
          taskOccurrences: [task],
          taskPlanEntries: [plannedMembership(task)],
          dispositions: {
            [task.id]: {
              kind: 'move-to-date',
              destinationDate: DESTINATION_DATE,
              durationMinutes: durationMinutes(35),
              dayPosition: dayPosition(3),
            },
          },
          destinationPeriods: [period(DESTINATION_DATE)],
          destinationPlanEntryIds: {
            [task.id]: id<'task-plan-entry'>('6551'),
          },
        }),
      ),
    );

    expect(prepared.effects.taskOccurrences[0]).toMatchObject({
      seriesId: task.seriesId,
      nominalDate: SOURCE_DATE,
      ruleRevision: 2,
      notes: 'Retain this context',
    });
    expect(prepared.effects.taskEvents[0]).toMatchObject({ seriesId: task.seriesId });
    expect(effectEntry(prepared, task.id, DESTINATION_DATE)).toMatchObject({
      plannedSnapshot: { notes: 'Retain this context' },
    });
  });

  it('rejects duplicate or immutable destination memberships', () => {
    const task = incompleteTask('5552');
    const source = plannedMembership(task);
    const existing = plannedMembership(task, DESTINATION_DATE);
    const base = closureInput({
      taskOccurrences: [task],
      dispositions: {
        [task.id]: {
          kind: 'move-to-date',
          destinationDate: DESTINATION_DATE,
          durationMinutes: durationMinutes(30),
          dayPosition: dayPosition(0),
        },
      },
      destinationPeriods: [period(DESTINATION_DATE)],
    });

    expect(
      prepareDayClosure({
        ...base,
        taskPlanEntries: [source, existing, { ...existing, id: id<'task-plan-entry'>('6553') }],
      }),
    ).toEqual({
      ok: false,
      error: {
        code: 'ClosureDataInvariant',
        message: `Duplicate membership for ${task.id} on ${DESTINATION_DATE}`,
      },
    });

    const deleted = {
      ...existing,
      outcome: 'deleted',
      finalizedAt: ENTERED_AT,
    } as const satisfies DeletedTaskPlanEntry;
    expect(prepareDayClosure({ ...base, taskPlanEntries: [source, deleted] })).toEqual({
      ok: false,
      error: {
        code: 'ClosureDataInvariant',
        message: `Destination membership for ${task.id} is immutable`,
      },
    });
  });

  it('blocks only applicable pending habits on the closing date', () => {
    const pending = habitOccurrence('5601', 'pending');
    const deleted = habitOccurrence('5602', 'deleted');
    const otherDate = habitOccurrence('5603', 'pending', DESTINATION_DATE);
    const blocked = closureInput({ habitOccurrences: [pending, deleted, otherDate] });

    expect(prepareDayClosure(blocked)).toEqual({
      ok: false,
      error: { code: 'PendingHabitOutcomes', occurrenceIds: [pending.id] },
    });

    const completed = { ...pending, outcome: 'completed' } as const satisfies HabitOccurrence;
    expect(
      prepareDayClosure(closureInput({ habitOccurrences: [completed, deleted, otherDate] })).ok,
    ).toBe(true);
  });
});

describe('rollback-friendly preparation', () => {
  it('returns no effects and mutates no input when any later disposition is invalid', () => {
    const keep = incompleteTask('5701');
    const invalidMove = incompleteTask('5702');
    const input = closureInput({
      taskOccurrences: [keep, invalidMove],
      taskPlanEntries: [plannedMembership(keep), plannedMembership(invalidMove)],
      dispositions: {
        [keep.id]: { kind: 'keep-unfinished' },
        [invalidMove.id]: {
          kind: 'move-to-date',
          destinationDate: CLOSED_DESTINATION_DATE,
          durationMinutes: durationMinutes(30),
          dayPosition: dayPosition(0),
        },
      },
      destinationPeriods: [
        period(CLOSED_DESTINATION_DATE, { day: closedDay(CLOSED_DESTINATION_DATE) }),
      ],
      destinationPlanEntryIds: {
        [invalidMove.id]: id<'task-plan-entry'>('6702'),
      },
    });
    const before = JSON.stringify(input);
    const result = prepareDayClosure(input);

    expect(result).toEqual({
      ok: false,
      error: { code: 'MoveTargetClosed', destinationDate: CLOSED_DESTINATION_DATE },
    });
    expect(result).not.toHaveProperty('value');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects missing, deleted, duplicate-current, and duplicate-source membership facts', () => {
    const task = incompleteTask('5801');
    const disposition = { [task.id]: { kind: 'keep-unfinished' as const } };
    expect(
      prepareDayClosure(closureInput({ taskOccurrences: [task], dispositions: disposition })),
    ).toEqual({
      ok: false,
      error: {
        code: 'ClosureDataInvariant',
        message: `Expected one source membership for ${task.id} on ${SOURCE_DATE}`,
      },
    });

    const deletedSource = {
      ...plannedMembership(task),
      outcome: 'deleted',
      finalizedAt: ENTERED_AT,
    } as const satisfies DeletedTaskPlanEntry;
    expect(
      prepareDayClosure(
        closureInput({
          taskOccurrences: [task],
          taskPlanEntries: [deletedSource],
          dispositions: disposition,
        }),
      ),
    ).toEqual({
      ok: false,
      error: {
        code: 'ClosureDataInvariant',
        message: `Current occurrence ${task.id} has a deleted source membership`,
      },
    });

    expect(
      prepareDayClosure(
        closureInput({
          taskOccurrences: [task, { ...task }],
          taskPlanEntries: [plannedMembership(task)],
          dispositions: disposition,
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: 'ClosureDataInvariant', message: 'Duplicate current task occurrence ID' },
    });

    const movedAway = incompleteTask('5802', 30, {
      placement: { kind: 'day', date: DESTINATION_DATE },
    });
    const duplicate = plannedMembership(movedAway, SOURCE_DATE);
    expect(
      prepareDayClosure(
        closureInput({
          taskOccurrences: [movedAway],
          taskPlanEntries: [duplicate, { ...duplicate, id: id<'task-plan-entry'>('6803') }],
        }),
      ),
    ).toEqual({
      ok: false,
      error: { code: 'ClosureDataInvariant', message: 'Duplicate source task membership' },
    });
  });

  it('finalizes moved-away memberships and leaves deleted memberships excluded', () => {
    const movedAway = incompleteTask('5901', 30, {
      placement: { kind: 'day', date: DESTINATION_DATE },
    });
    const moved = {
      ...plannedMembership(movedAway, SOURCE_DATE),
      outcome: 'moved',
      destination: { kind: 'day', date: DESTINATION_DATE },
    } as const satisfies MovedTaskPlanEntry;
    const deletedTask = incompleteTask('5902', 20, {
      placement: { kind: 'day', date: DESTINATION_DATE },
    });
    const deleted = {
      ...plannedMembership(deletedTask, SOURCE_DATE),
      outcome: 'deleted',
      finalizedAt: ENTERED_AT,
    } as const satisfies DeletedTaskPlanEntry;

    const prepared = requireOk(
      prepareDayClosure(
        closureInput({
          taskOccurrences: [movedAway, deletedTask],
          taskPlanEntries: [moved, deleted],
        }),
      ),
    );
    expect(prepared.effects.taskOccurrences).toEqual([]);
    expect(prepared.effects.taskPlanEntries).toEqual([{ ...moved, finalizedAt: NOW }]);
    expect(prepared.effects.day.closureSnapshot.score.task).toEqual({
      completed: 0,
      applicable: 1,
      rate: 0,
    });
  });
});

/*
 * 003 US2 (FR-006, FR-007, FR-008). Before 003 the frozen counts and the live
 * counts were produced by two separate implementations that agreed only by
 * coincidence. They now share one derivation, and these tests are what keeps
 * them from drifting apart again.
 */
describe('003 US2: the closure snapshot reports what the day actually was', () => {
  const completedOne = completedTask('a001');
  const completedTwo = completedTask('a002');
  const completedThree = completedTask('a003');
  const unfinishedKept = incompleteTask('a004');
  const unfinishedMoved = incompleteTask('a005');

  const occurrences = [completedOne, completedTwo, completedThree, unfinishedKept, unfinishedMoved];
  const entries = [
    completedMembership(completedOne),
    completedMembership(completedTwo),
    completedMembership(completedThree),
    plannedMembership(unfinishedKept),
    plannedMembership(unfinishedMoved),
  ];
  const habits = [habitOccurrence('b001', 'completed'), habitOccurrence('b002', 'not-completed')];

  function closeMixedDay() {
    return requireOk(
      prepareDayClosure(
        closureInput({
          dispositions: {
            [unfinishedKept.id]: { kind: 'keep-unfinished' },
            [unfinishedMoved.id]: {
              kind: 'move-to-date',
              destinationDate: DESTINATION_DATE,
              durationMinutes: durationMinutes(30),
              dayPosition: dayPosition(0),
            },
          },
          taskOccurrences: occurrences,
          taskPlanEntries: entries,
          habitOccurrences: habits,
          destinationPeriods: [period(DESTINATION_DATE)],
          destinationPlanEntryIds: { [unfinishedMoved.id]: id<'task-plan-entry'>('9999') },
        }),
      ),
    );
  }

  it('records the completed tasks it had, never zero (FR-006)', () => {
    const { score } = closeMixedDay().effects.day.closureSnapshot;

    expect(score.task).toEqual({ completed: 3, applicable: 5, rate: 3 / 5 });
    expect(score.habit).toEqual({ completed: 1, applicable: 2, rate: 1 / 2 });
  });

  it('freezes exactly the counts the open day was showing a moment earlier (FR-008)', () => {
    const live = selectDaySignals({
      day: createOpenDay(SOURCE_DATE),
      occurrences,
      planEntries: entries,
      habits,
    });
    const frozen = closeMixedDay().effects.day.closureSnapshot.score;

    expect(frozen.task).toEqual(live.score.task);
    expect(frozen.habit).toEqual(live.score.habit);
    expect(frozen.value).toEqual(live.score.value);
  });

  it('keeps a task moved at closure in the denominator, uncompleted (D3, FR-007)', () => {
    const { score } = closeMixedDay().effects.day.closureSnapshot;

    // The moved task was planned for this day and was not done here, so it
    // lowers the day's result rather than disappearing from it.
    expect(score.task.applicable).toBe(5);
    expect(score.task.completed).toBe(3);
  });

  it('keeps a task cancelled at closure in the denominator, uncompleted (D3, FR-007)', () => {
    const cancelled = incompleteTask('a006');
    const prepared = requireOk(
      prepareDayClosure(
        closureInput({
          dispositions: { [cancelled.id]: { kind: 'cancel' } },
          taskOccurrences: [completedOne, cancelled],
          taskPlanEntries: [completedMembership(completedOne), plannedMembership(cancelled)],
        }),
      ),
    );

    expect(prepared.effects.day.closureSnapshot.score.task).toEqual({
      completed: 1,
      applicable: 2,
      rate: 1 / 2,
    });
  });

  it('keeps a task sent to the backlog at closure in the denominator (D3, FR-007)', () => {
    const backlogged = incompleteTask('a007');
    const prepared = requireOk(
      prepareDayClosure(
        closureInput({
          dispositions: { [backlogged.id]: { kind: 'move-to-backlog' } },
          taskOccurrences: [completedOne, backlogged],
          taskPlanEntries: [completedMembership(completedOne), plannedMembership(backlogged)],
        }),
      ),
    );

    expect(prepared.effects.day.closureSnapshot.score.task).toEqual({
      completed: 1,
      applicable: 2,
      rate: 1 / 2,
    });
  });

  it('excludes a deleted membership from both counts', () => {
    const deleted = incompleteTask('a008');
    const prepared = requireOk(
      prepareDayClosure(
        closureInput({
          taskOccurrences: [completedOne],
          taskPlanEntries: [
            completedMembership(completedOne),
            {
              ...plannedMembership(deleted),
              outcome: 'deleted',
              finalizedAt: ENTERED_AT,
            } as const satisfies DeletedTaskPlanEntry,
          ],
          habitOccurrences: [habitOccurrence('b003', 'deleted')],
        }),
      ),
    );

    expect(prepared.effects.day.closureSnapshot.score.task).toEqual({
      completed: 1,
      applicable: 1,
      rate: 1,
    });
    expect(prepared.effects.day.closureSnapshot.score.habit.applicable).toBe(0);
  });
});
