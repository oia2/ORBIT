import { describe, expect, it } from 'vitest';

import type { Day } from './day';
import type { TaskPeriodState } from './task-lifecycle';
import * as taskLifecycle from './task-lifecycle';
import {
  prepareTaskCompletion,
  prepareTaskDeletion,
  prepareTaskEdit,
  prepareTaskMoveToBacklog,
  prepareTaskMoveToDate,
} from './task-lifecycle';
import type {
  BacklogTaskOccurrence,
  CompletedDatedTaskOccurrence,
  IncompleteDatedTaskOccurrence,
  PlannedTaskPlanEntry,
  TaskPlanEntry,
} from './task';
import type { Week } from './week';
import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  nonNegativeDurationMinutes,
  revision,
} from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate, startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';
import type { Result } from '@/shared/lib/result';

const DATE_A = localDate('2026-08-11');
const DATE_B = localDate('2026-08-12');
const DATE_C = localDate('2026-08-19');
const OCCURRED_AT = instant('2026-08-11T08:00:00.000Z');
const LATER = instant('2026-08-11T09:00:00.000Z');

function id<TKind extends string>(suffix: string) {
  return entityId<TKind>(`123e4567-e89b-42d3-a456-42661417${suffix}`);
}

function period(
  date: LocalDate,
  statuses: { readonly day?: Day['status']; readonly week?: Week['status'] } = {},
): TaskPeriodState {
  const weekStart = startOfWeek(date);
  const day =
    statuses.day === 'closed'
      ? ({
          date,
          weekStart,
          status: 'closed',
          revision: revision(1),
          closedAt: OCCURRED_AT,
          closureSnapshot: {
            score: {
              task: { completed: 0, applicable: 1, rate: 0 },
              habit: { completed: 0, applicable: 0, rate: 'unavailable' },
              value: 0,
            },
            plannedLoadMinutes: nonNegativeDurationMinutes(30),
          },
        } satisfies Day)
      : ({ date, weekStart, status: 'open', revision: revision(0) } satisfies Day);
  const week =
    statuses.week === 'completed'
      ? ({
          startDate: weekStart,
          goals: [],
          status: 'completed',
          revision: revision(1),
          completedAt: OCCURRED_AT,
          completionSnapshot: {
            progress: {
              task: { completed: 0, applicable: 1, rate: 0 },
              habit: { completed: 0, applicable: 0, rate: 'unavailable' },
              value: 0,
            },
          },
        } satisfies Week)
      : ({
          startDate: weekStart,
          goals: [],
          status: 'open',
          revision: revision(0),
        } satisfies Week);

  return { day, week };
}

function incomplete(
  overrides: Partial<IncompleteDatedTaskOccurrence> = {},
): IncompleteDatedTaskOccurrence {
  return {
    id: id<'task-occurrence'>('4101'),
    title: 'Original plan',
    notes: 'Initial notes',
    state: 'active',
    placement: { kind: 'day', date: DATE_A },
    plannedDurationMinutes: durationMinutes(30),
    dayPosition: dayPosition(0),
    completion: 'incomplete',
    isException: false,
    createdSequence: creationSequence(1),
    revision: revision(0),
    ...overrides,
  };
}

/** `exactOptionalPropertyTypes` forbids `{notes: undefined}`, so remove the key. */
function withoutNote(occurrence: IncompleteDatedTaskOccurrence): IncompleteDatedTaskOccurrence {
  const { notes, ...rest } = occurrence;
  void notes;
  return rest;
}

function completed(
  overrides: Partial<CompletedDatedTaskOccurrence> = {},
): CompletedDatedTaskOccurrence {
  return {
    ...incomplete(),
    completion: 'completed',
    actualCompletedAt: OCCURRED_AT,
    revision: revision(1),
    ...overrides,
  };
}

function backlog(overrides: Partial<BacklogTaskOccurrence> = {}): BacklogTaskOccurrence {
  return {
    id: id<'task-occurrence'>('4101'),
    title: 'Backlog task',
    state: 'active',
    placement: { kind: 'backlog' },
    isException: false,
    createdSequence: creationSequence(1),
    revision: revision(0),
    ...overrides,
  };
}

function membership(
  date: LocalDate,
  overrides: Partial<PlannedTaskPlanEntry> = {},
): PlannedTaskPlanEntry {
  return {
    id: id<'task-plan-entry'>(date === DATE_A ? '4201' : date === DATE_B ? '4202' : '4203'),
    occurrenceId: id<'task-occurrence'>('4101'),
    date,
    weekStart: startOfWeek(date),
    plannedSnapshot: {
      title: `Plan for ${date}`,
      plannedDurationMinutes: durationMinutes(30),
    },
    outcome: 'planned',
    enteredAt: OCCURRED_AT,
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

describe('task completion and editing truth table', () => {
  it('checks and unchecks one open dated membership with distinct audit effects', () => {
    const checked = requireOk(
      prepareTaskCompletion({
        occurrence: incomplete(),
        membership: membership(DATE_A),
        period: period(DATE_A),
        completed: true,
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(checked.occurrence).toMatchObject({
      completion: 'completed',
      actualCompletedAt: OCCURRED_AT,
      revision: 1,
    });
    expect(checked.membership.outcome).toBe('completed');
    expect(checked.event).toMatchObject({
      type: 'completion-checked',
      planEntryId: checked.membership.id,
      effectiveDate: DATE_A,
      payload: { date: DATE_A },
    });

    const unchecked = requireOk(
      prepareTaskCompletion({
        occurrence: checked.occurrence,
        membership: checked.membership,
        period: period(DATE_A),
        completed: false,
        occurredAt: LATER,
      }),
    );
    expect(unchecked.occurrence).toMatchObject({ completion: 'incomplete', revision: 2 });
    expect(unchecked.occurrence).not.toHaveProperty('actualCompletedAt');
    expect(unchecked.membership.outcome).toBe('planned');
    expect(unchecked.event.type).toBe('completion-unchecked');
  });

  it('allows editing a completed task but rejects movement until it is unchecked', () => {
    const occurrence = completed();
    const edited = requireOk(
      prepareTaskEdit({
        occurrence,
        period: period(DATE_A),
        after: {
          title: 'Edited while completed',
          notes: 'Updated notes',
          plannedDurationMinutes: durationMinutes(45),
        },
        occurredAt: LATER,
      }),
    );

    expect(edited.occurrence).toMatchObject({
      title: 'Edited while completed',
      completion: 'completed',
      actualCompletedAt: OCCURRED_AT,
      revision: 2,
    });
    expect(edited.event).toMatchObject({
      type: 'edit',
      payload: {
        before: { title: 'Original plan', plannedDurationMinutes: 30 },
        after: { title: 'Edited while completed', plannedDurationMinutes: 45 },
      },
    });

    expect(
      prepareTaskMoveToDate({
        occurrence: edited.occurrence,
        memberships: [membership(DATE_A)],
        sourcePeriod: period(DATE_A),
        destinationPeriod: period(DATE_B),
        destinationDate: DATE_B,
        durationMinutes: 45,
        dayPosition: 0,
        destinationPlanEntryId: id<'task-plan-entry'>('4202'),
        occurredAt: LATER,
      }),
    ).toEqual({
      ok: false,
      error: { code: 'TaskMustBeIncompleteToMove', occurrenceId: occurrence.id },
    });
  });

  it('rejects completion outside the dated checkbox transition table', () => {
    expect(
      prepareTaskCompletion({
        occurrence: incomplete(),
        membership: membership(DATE_A),
        period: period(DATE_A),
        completed: false,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    expect(
      prepareTaskCompletion({
        occurrence: backlog(),
        membership: membership(DATE_A),
        period: period(DATE_A),
        completed: true,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
  });

  it('edits an undated backlog task without requiring a governing period', () => {
    const edited = requireOk(
      prepareTaskEdit({
        occurrence: backlog(),
        effectiveDate: DATE_A,
        after: {
          title: 'Edited backlog task',
          plannedDurationMinutes: durationMinutes(20),
        },
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(edited.occurrence).toMatchObject({
      placement: { kind: 'backlog' },
      title: 'Edited backlog task',
      plannedDurationMinutes: 20,
    });
    expect(edited.event.type).toBe('edit');
  });

  it.each([
    { day: 'closed' as const, week: 'open' as const },
    { day: 'open' as const, week: 'completed' as const },
  ])('rejects all dated mutations when the governing $day/$week period is immutable', (state) => {
    const immutable = period(DATE_A, state);
    const occurrence = incomplete();
    const entry = membership(DATE_A);

    for (const result of [
      prepareTaskCompletion({
        occurrence,
        membership: entry,
        period: immutable,
        completed: true,
        occurredAt: OCCURRED_AT,
      }),
      prepareTaskEdit({
        occurrence,
        period: immutable,
        after: { title: 'No mutation', plannedDurationMinutes: durationMinutes(30) },
        occurredAt: OCCURRED_AT,
      }),
      prepareTaskDeletion({
        occurrence,
        membershipPeriods: [{ membership: entry, period: immutable }],
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });
    }
  });
});

describe('task movement truth table', () => {
  it('moves A→B→A while reusing A and leaving B incomplete', () => {
    const a = membership(DATE_A);
    const movedToB = requireOk(
      prepareTaskMoveToDate({
        occurrence: incomplete(),
        memberships: [a],
        sourcePeriod: period(DATE_A),
        destinationPeriod: period(DATE_B),
        destinationDate: DATE_B,
        durationMinutes: 40,
        dayPosition: 1,
        destinationPlanEntryId: id<'task-plan-entry'>('4202'),
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(movedToB.sourceMembership).toMatchObject({
      id: a.id,
      outcome: 'moved',
      destination: { kind: 'day', date: DATE_B },
    });
    expect(movedToB.destinationMembership).toMatchObject({ date: DATE_B, outcome: 'planned' });
    expect(movedToB.destinationCreated).toBe(true);
    expect(movedToB.event.type).toBe('move-to-date');

    const movedBackToA = requireOk(
      prepareTaskMoveToDate({
        occurrence: movedToB.occurrence,
        memberships: movedToB.memberships,
        sourcePeriod: period(DATE_B),
        destinationPeriod: period(DATE_A),
        destinationDate: DATE_A,
        durationMinutes: 35,
        dayPosition: 0,
        destinationPlanEntryId: id<'task-plan-entry'>('4299'),
        occurredAt: LATER,
      }),
    );

    expect(movedBackToA.memberships).toHaveLength(2);
    expect(movedBackToA.destinationCreated).toBe(false);
    expect(movedBackToA.destinationMembership).toMatchObject({
      id: a.id,
      date: DATE_A,
      outcome: 'planned',
      plannedSnapshot: { plannedDurationMinutes: 35 },
    });
    expect(movedBackToA.sourceMembership).toMatchObject({
      date: DATE_B,
      outcome: 'moved',
      destination: { kind: 'day', date: DATE_A },
    });
  });

  it('requires a different, open dated target and a positive integer duration', () => {
    const occurrence = incomplete();
    const memberships = [membership(DATE_A)];
    const base = {
      occurrence,
      memberships,
      sourcePeriod: period(DATE_A),
      destinationPlanEntryId: id<'task-plan-entry'>('4202'),
      dayPosition: 0,
      occurredAt: OCCURRED_AT,
    } as const;

    expect(
      prepareTaskMoveToDate({
        ...base,
        destinationPeriod: period(DATE_A),
        destinationDate: DATE_A,
        durationMinutes: 30,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    expect(
      prepareTaskMoveToDate({
        ...base,
        destinationPeriod: period(DATE_B, { day: 'closed' }),
        destinationDate: DATE_B,
        durationMinutes: 30,
      }),
    ).toEqual({ ok: false, error: { code: 'MoveTargetClosed', destinationDate: DATE_B } });
    expect(
      prepareTaskMoveToDate({
        ...base,
        destinationPeriod: period(DATE_B, { week: 'completed' }),
        destinationDate: DATE_B,
        durationMinutes: 30,
      }),
    ).toEqual({ ok: false, error: { code: 'MoveTargetClosed', destinationDate: DATE_B } });

    for (const invalidDuration of [0, -1, 1.5]) {
      expect(
        prepareTaskMoveToDate({
          ...base,
          destinationPeriod: period(DATE_B),
          destinationDate: DATE_B,
          durationMinutes: invalidDuration,
        }),
      ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    }
  });

  it.each([
    { day: 'closed' as const, week: 'open' as const },
    { day: 'open' as const, week: 'completed' as const },
  ])('rejects movement from an immutable $day/$week source period', (state) => {
    const occurrence = incomplete();
    const memberships = [membership(DATE_A)];
    const sourcePeriod = period(DATE_A, state);

    expect(
      prepareTaskMoveToDate({
        occurrence,
        memberships,
        sourcePeriod,
        destinationPeriod: period(DATE_B),
        destinationDate: DATE_B,
        durationMinutes: 30,
        dayPosition: 0,
        destinationPlanEntryId: id<'task-plan-entry'>('4202'),
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });
    expect(
      prepareTaskMoveToBacklog({
        occurrence,
        memberships,
        sourcePeriod,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });
  });

  it('moves a dated task to undated backlog without any destination-period check', () => {
    const moved = requireOk(
      prepareTaskMoveToBacklog({
        occurrence: incomplete(),
        memberships: [membership(DATE_A)],
        sourcePeriod: period(DATE_A),
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(moved.occurrence).toMatchObject({
      state: 'active',
      placement: { kind: 'backlog' },
      revision: 1,
    });
    for (const datedField of ['completion', 'actualCompletedAt', 'dayPosition']) {
      expect(moved.occurrence).not.toHaveProperty(datedField);
    }
    expect(moved.sourceMembership.outcome).toBe('backlogged');
    expect(moved.event.type).toBe('move-to-backlog');
  });

  it('schedules backlog only to an open date with a positive duration', () => {
    const base = {
      occurrence: backlog(),
      memberships: [] as readonly TaskPlanEntry[],
      destinationPeriod: period(DATE_C),
      destinationDate: DATE_C,
      dayPosition: 0,
      destinationPlanEntryId: id<'task-plan-entry'>('4203'),
      occurredAt: OCCURRED_AT,
    } as const;

    expect(prepareTaskMoveToDate({ ...base, durationMinutes: 0 })).toMatchObject({
      ok: false,
      error: { code: 'ValidationFailure' },
    });

    const scheduled = requireOk(prepareTaskMoveToDate({ ...base, durationMinutes: 25 }));
    expect(scheduled.occurrence).toMatchObject({
      placement: { kind: 'day', date: DATE_C },
      completion: 'incomplete',
      plannedDurationMinutes: 25,
    });
    expect(scheduled.memberships).toHaveLength(1);
    expect(scheduled.event.type).toBe('schedule-from-backlog');
  });
});

describe('terminal task deletion', () => {
  it('deletes every open membership, preserves closed history, and permits completed deletion', () => {
    const openA = membership(DATE_A);
    const openB = membership(DATE_B);
    const closedC = {
      ...membership(DATE_C),
      outcome: 'completed',
      finalizedAt: OCCURRED_AT,
    } as const satisfies TaskPlanEntry;

    const deleted = requireOk(
      prepareTaskDeletion({
        occurrence: completed(),
        membershipPeriods: [
          { membership: openA, period: period(DATE_A) },
          { membership: openB, period: period(DATE_B) },
          { membership: closedC, period: period(DATE_C, { day: 'closed' }) },
        ],
        effectiveDate: DATE_A,
        occurredAt: LATER,
      }),
    );

    expect(deleted.occurrence).toMatchObject({ state: 'deleted', placement: { kind: 'none' } });
    expect(deleted.affectedOpenDates).toEqual([DATE_A, DATE_B]);
    expect(deleted.memberships.find((entry) => entry.date === DATE_A)).toMatchObject({
      outcome: 'deleted',
      finalizedAt: LATER,
    });
    expect(deleted.memberships.find((entry) => entry.date === DATE_B)).toMatchObject({
      outcome: 'deleted',
      finalizedAt: LATER,
    });
    expect(deleted.memberships.find((entry) => entry.date === DATE_C)).toBe(closedC);
    expect(deleted.event.type).toBe('delete');
  });

  it('does not expose ordinary cancellation, restoration, or a second deletion transition', () => {
    const first = requireOk(
      prepareTaskDeletion({
        occurrence: backlog(),
        membershipPeriods: [],
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(
      prepareTaskDeletion({
        occurrence: first.occurrence,
        membershipPeriods: [],
        effectiveDate: DATE_A,
        occurredAt: LATER,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    expect(taskLifecycle).not.toHaveProperty('cancelTask');
    expect(taskLifecycle).not.toHaveProperty('restoreTask');
    expect(taskLifecycle).not.toHaveProperty('restoreDeletedTask');
  });
});

describe('task lifecycle malformed-record and boundary guards', () => {
  it('preserves recurring metadata while covering minimal optional task values', () => {
    const { notes: _notes, dayPosition: _position, ...withoutOptionalValues } = incomplete();
    void _notes;
    void _position;
    const recurringSeriesId = id<'task-series'>('4001');
    const recurring: IncompleteDatedTaskOccurrence = {
      ...withoutOptionalValues,
      seriesId: recurringSeriesId,
      nominalDate: DATE_A,
      ruleRevision: revision(3),
    };
    const checked = requireOk(
      prepareTaskCompletion({
        occurrence: recurring,
        membership: membership(DATE_A),
        period: period(DATE_A),
        completed: true,
        occurredAt: OCCURRED_AT,
      }),
    );
    expect(checked.occurrence).toMatchObject({
      seriesId: recurring.seriesId,
      nominalDate: DATE_A,
      ruleRevision: revision(3),
    });
    expect(checked.occurrence).not.toHaveProperty('dayPosition');
    expect(checked.event).toMatchObject({ seriesId: recurring.seriesId });
    const unchecked = requireOk(
      prepareTaskCompletion({
        occurrence: checked.occurrence,
        membership: checked.membership,
        period: period(DATE_A),
        completed: false,
        occurredAt: LATER,
      }),
    );
    expect(unchecked.event).toMatchObject({
      type: 'completion-unchecked',
      seriesId: recurring.seriesId,
    });

    const edited = requireOk(
      prepareTaskEdit({
        occurrence: recurring,
        period: period(DATE_A),
        after: { title: 'Recurring edit', plannedDurationMinutes: durationMinutes(35) },
        occurredAt: LATER,
      }),
    );
    expect(edited.event).toMatchObject({ type: 'edit', seriesId: recurring.seriesId });
    const moved = requireOk(
      prepareTaskMoveToDate({
        occurrence: recurring,
        memberships: [membership(DATE_A)],
        sourcePeriod: period(DATE_A),
        destinationPeriod: period(DATE_B),
        destinationDate: DATE_B,
        durationMinutes: 35,
        dayPosition: 0,
        destinationPlanEntryId: id<'task-plan-entry'>('4296'),
        occurredAt: LATER,
      }),
    );
    expect(moved.event).toMatchObject({ type: 'move-to-date', seriesId: recurring.seriesId });
    const movedToBacklog = requireOk(
      prepareTaskMoveToBacklog({
        occurrence: moved.occurrence,
        memberships: moved.memberships,
        sourcePeriod: period(DATE_B),
        occurredAt: LATER,
      }),
    );
    expect(movedToBacklog.event).toMatchObject({
      type: 'move-to-backlog',
      seriesId: recurring.seriesId,
    });

    const editedBacklog = requireOk(
      prepareTaskEdit({
        occurrence: backlog({ seriesId: recurringSeriesId }),
        after: { title: 'Minimal backlog edit' },
        effectiveDate: DATE_A,
        occurredAt: LATER,
      }),
    );
    expect(editedBacklog.event).toMatchObject({ type: 'edit', seriesId: recurring.seriesId });

    const deleted = requireOk(
      prepareTaskDeletion({
        occurrence: backlog(),
        membershipPeriods: [],
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).occurrence;
    expect(
      prepareTaskMoveToDate({
        occurrence: deleted,
        memberships: [],
        destinationPeriod: period(DATE_B),
        destinationDate: DATE_B,
        durationMinutes: 30,
        dayPosition: 0,
        destinationPlanEntryId: id<'task-plan-entry'>('4297'),
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
  });

  it('rejects missing/mismatched periods and memberships before completion', () => {
    const occurrence = incomplete();
    const entry = membership(DATE_A);
    expect(
      prepareTaskCompletion({
        occurrence,
        membership: entry,
        period: undefined as never,
        completed: true,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });

    expect(
      prepareTaskCompletion({
        occurrence,
        membership: entry,
        period: { ...period(DATE_A), day: { ...period(DATE_A).day, date: DATE_B } },
        completed: true,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    expect(
      prepareTaskCompletion({
        occurrence,
        membership: entry,
        period: {
          ...period(DATE_A),
          week: { ...period(DATE_A).week, startDate: startOfWeek(DATE_C) },
        },
        completed: true,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });

    const mismatchedPeriod = {
      ...period(DATE_A),
      day: { ...period(DATE_A).day, weekStart: startOfWeek(DATE_C) },
    } as TaskPeriodState;
    expect(
      prepareTaskCompletion({
        occurrence,
        membership: entry,
        period: mismatchedPeriod,
        completed: true,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });

    for (const invalidMembership of [
      { ...entry, occurrenceId: id<'task-occurrence'>('4199') },
      { ...entry, date: DATE_B },
      { ...entry, finalizedAt: OCCURRED_AT },
    ]) {
      expect(
        prepareTaskCompletion({
          occurrence,
          membership: invalidMembership,
          period: period(DATE_A),
          completed: true,
          occurredAt: OCCURRED_AT,
        }),
      ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    }
    expect(
      prepareTaskCompletion({
        occurrence: completed(),
        membership: entry,
        period: period(DATE_A),
        completed: true,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
  });

  it('validates every edit shape, including backlog audit dates', () => {
    const deleted = requireOk(
      prepareTaskDeletion({
        occurrence: backlog(),
        membershipPeriods: [],
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).occurrence;
    expect(
      prepareTaskEdit({
        occurrence: deleted,
        after: { title: 'No edit' },
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    expect(
      prepareTaskEdit({
        occurrence: backlog(),
        after: { title: '   ' },
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    expect(
      prepareTaskEdit({
        occurrence: backlog(),
        after: { title: 'Invalid duration', plannedDurationMinutes: 0 as never },
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    expect(
      prepareTaskEdit({
        occurrence: incomplete(),
        after: { title: 'Missing duration' },
        period: period(DATE_A),
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    expect(
      prepareTaskEdit({
        occurrence: backlog(),
        after: { title: 'Missing effective date' },
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
  });

  it('rejects malformed destinations, positions, and membership collisions', () => {
    const occurrence = incomplete();
    const source = membership(DATE_A);
    const base = {
      occurrence,
      memberships: [source] as readonly TaskPlanEntry[],
      sourcePeriod: period(DATE_A),
      destinationPeriod: period(DATE_B),
      destinationDate: DATE_B,
      durationMinutes: 30,
      dayPosition: 0,
      destinationPlanEntryId: id<'task-plan-entry'>('4290'),
      occurredAt: OCCURRED_AT,
    } as const;

    expect(prepareTaskMoveToDate({ ...base, dayPosition: -1 })).toMatchObject({
      ok: false,
      error: { code: 'ValidationFailure' },
    });
    expect(
      prepareTaskMoveToDate({
        ...base,
        destinationPeriod: {
          ...period(DATE_B),
          day: { ...period(DATE_B).day, weekStart: startOfWeek(DATE_C) },
        },
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    expect(prepareTaskMoveToDate({ ...base, memberships: [] })).toMatchObject({
      ok: false,
      error: { code: 'InvalidTransition' },
    });
    expect(
      prepareTaskMoveToDate({
        ...base,
        memberships: [{ ...source, finalizedAt: OCCURRED_AT }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });
    expect(
      prepareTaskMoveToDate({
        ...base,
        memberships: [source, membership(DATE_B), { ...membership(DATE_B), id: id('4291') }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    expect(
      prepareTaskMoveToDate({
        ...base,
        memberships: [source, { ...membership(DATE_B), finalizedAt: OCCURRED_AT }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });
    const colliding = { ...membership(DATE_C), id: base.destinationPlanEntryId };
    expect(prepareTaskMoveToDate({ ...base, memberships: [source, colliding] })).toMatchObject({
      ok: false,
      error: { code: 'ValidationFailure' },
    });
  });

  it('rejects backlog moves outside their exact source transition', () => {
    expect(
      prepareTaskMoveToBacklog({
        occurrence: backlog(),
        memberships: [],
        sourcePeriod: period(DATE_A),
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    expect(
      prepareTaskMoveToBacklog({
        occurrence: completed(),
        memberships: [membership(DATE_A)],
        sourcePeriod: period(DATE_A),
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'TaskMustBeIncompleteToMove' } });
    expect(
      prepareTaskMoveToBacklog({
        occurrence: incomplete(),
        memberships: [],
        sourcePeriod: period(DATE_A),
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    expect(
      prepareTaskMoveToBacklog({
        occurrence: incomplete(),
        memberships: [{ ...membership(DATE_A), finalizedAt: OCCURRED_AT }],
        sourcePeriod: period(DATE_A),
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });
  });

  it('rejects inconsistent or immutable membership graphs before deletion', () => {
    const occurrence = incomplete();
    const source = membership(DATE_A);
    expect(
      prepareTaskDeletion({
        occurrence,
        membershipPeriods: [
          {
            membership: { ...source, occurrenceId: id<'task-occurrence'>('4199') },
            period: period(DATE_A),
          },
        ],
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    expect(
      prepareTaskDeletion({
        occurrence,
        membershipPeriods: [
          { membership: source, period: period(DATE_A) },
          { membership: { ...source, id: id('4298') }, period: period(DATE_A) },
        ],
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
    expect(
      prepareTaskDeletion({
        occurrence,
        membershipPeriods: [
          {
            membership: source,
            period: {
              ...period(DATE_A),
              day: { ...period(DATE_A).day, weekStart: startOfWeek(DATE_C) },
            },
          },
        ],
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    expect(
      prepareTaskDeletion({
        occurrence,
        membershipPeriods: [],
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ValidationFailure' } });
    expect(
      prepareTaskDeletion({
        occurrence,
        membershipPeriods: [
          { membership: { ...source, finalizedAt: OCCURRED_AT }, period: period(DATE_A) },
        ],
        effectiveDate: DATE_A,
        occurredAt: OCCURRED_AT,
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable' } });
  });
});

/*
 * 003 US5 (FR-024). `after` is a complete value snapshot, so it is
 * authoritative for the note. Before 003 the previous note was spread in from
 * the occurrence and survived every edit, which made a note writable but never
 * removable.
 */
describe('003 US5: task notes are editable and clearable', () => {
  it('sets a note on a task that had none', () => {
    const edited = requireOk(
      prepareTaskEdit({
        occurrence: withoutNote(incomplete()),
        period: period(DATE_A),
        after: {
          title: 'Original plan',
          notes: 'Ask about the invoice first',
          plannedDurationMinutes: durationMinutes(30),
        },
        occurredAt: LATER,
      }),
    );

    expect(edited.occurrence.notes).toBe('Ask about the invoice first');
  });

  it('replaces an existing note', () => {
    const edited = requireOk(
      prepareTaskEdit({
        occurrence: incomplete(),
        period: period(DATE_A),
        after: {
          title: 'Original plan',
          notes: 'Rewritten',
          plannedDurationMinutes: durationMinutes(30),
        },
        occurredAt: LATER,
      }),
    );

    expect(edited.occurrence.notes).toBe('Rewritten');
  });

  it('clears the note when the edited snapshot carries none', () => {
    const edited = requireOk(
      prepareTaskEdit({
        occurrence: incomplete(),
        period: period(DATE_A),
        after: { title: 'Original plan', plannedDurationMinutes: durationMinutes(30) },
        occurredAt: LATER,
      }),
    );

    expect(edited.occurrence).not.toHaveProperty('notes');
  });

  it('treats a whitespace-only note as cleared', () => {
    const edited = requireOk(
      prepareTaskEdit({
        occurrence: incomplete(),
        period: period(DATE_A),
        after: {
          title: 'Original plan',
          notes: '   \n  ',
          plannedDurationMinutes: durationMinutes(30),
        },
        occurredAt: LATER,
      }),
    );

    expect(edited.occurrence).not.toHaveProperty('notes');
  });

  it('trims a note before storing it', () => {
    const edited = requireOk(
      prepareTaskEdit({
        occurrence: incomplete(),
        period: period(DATE_A),
        after: {
          title: 'Original plan',
          notes: '  padded  ',
          plannedDurationMinutes: durationMinutes(30),
        },
        occurredAt: LATER,
      }),
    );

    expect(edited.occurrence.notes).toBe('padded');
  });

  it('clears the note on a backlog task too', () => {
    const edited = requireOk(
      prepareTaskEdit({
        occurrence: {
          ...incomplete(),
          state: 'active',
          placement: { kind: 'backlog' },
        } as never,
        after: { title: 'Original plan' },
        effectiveDate: DATE_A,
        occurredAt: LATER,
      }),
    );

    expect(edited.occurrence).not.toHaveProperty('notes');
  });

  it('records the note change in the edit event payload', () => {
    const edited = requireOk(
      prepareTaskEdit({
        occurrence: incomplete(),
        period: period(DATE_A),
        after: {
          title: 'Original plan',
          notes: 'Rewritten',
          plannedDurationMinutes: durationMinutes(30),
        },
        occurredAt: LATER,
      }),
    );

    expect(edited.event.payload).toMatchObject({
      before: { notes: 'Initial notes' },
      after: { notes: 'Rewritten' },
    });
  });
});
