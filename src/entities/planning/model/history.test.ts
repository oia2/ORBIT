import { describe, expect, it } from 'vitest';

import {
  explainTaskMembership,
  orderTaskEvents,
  orderTaskMemberships,
  type TaskMembershipHistoryFact,
} from './history';
import {
  selectCurrentTaskMembership,
  selectOpenBacklogView,
  selectTaskHistoryView,
} from './selectors';
import type {
  BacklogTaskOccurrence,
  CompletedDatedTaskOccurrence,
  DeletedTaskOccurrence,
  TaskEvent,
  TaskOccurrence,
  TaskPlanEntry,
} from './task';
import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  eventSequence,
  revision,
} from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate, startOfWeek, type LocalDate } from '@/shared/lib/local-date/local-date';

const DATE_A = localDate('2026-08-11');
const DATE_B = localDate('2026-08-12');
const DATE_C = localDate('2026-08-19');
const SAME_INSTANT = instant('2026-08-11T08:00:00.000Z');

function id<TKind extends string>(suffix: string) {
  return entityId<TKind>(`123e4567-e89b-42d3-a456-42661418${suffix}`);
}

const occurrenceId = id<'task-occurrence'>('4101');

function currentCompleted(
  overrides: Partial<CompletedDatedTaskOccurrence> = {},
): CompletedDatedTaskOccurrence {
  return {
    id: occurrenceId,
    title: 'Current title',
    notes: 'Current notes',
    state: 'active',
    placement: { kind: 'day', date: DATE_A },
    plannedDurationMinutes: durationMinutes(45),
    dayPosition: dayPosition(0),
    completion: 'completed',
    actualCompletedAt: SAME_INSTANT,
    isException: false,
    createdSequence: creationSequence(1),
    revision: revision(4),
    ...overrides,
  };
}

function planEntry(date: LocalDate, overrides: Partial<TaskPlanEntry> = {}): TaskPlanEntry {
  return {
    id: id<'task-plan-entry'>(date === DATE_A ? '4201' : date === DATE_B ? '4202' : '4203'),
    occurrenceId,
    date,
    weekStart: startOfWeek(date),
    plannedSnapshot: {
      title: `Original plan ${date}`,
      notes: 'Original notes',
      plannedDurationMinutes: durationMinutes(30),
    },
    enteredAt: SAME_INSTANT,
    outcome: 'planned',
    ...overrides,
  } as TaskPlanEntry;
}

function moveEvent(
  sequence: number,
  fromDate: LocalDate,
  destinationDate: LocalDate,
  suffix: string,
): Extract<TaskEvent, { type: 'move-to-date' }> {
  return {
    id: id<'task-event'>(suffix),
    sequence: eventSequence(sequence),
    occurrenceId,
    effectiveDate: fromDate,
    occurredAt: SAME_INSTANT,
    type: 'move-to-date',
    payload: {
      from: { kind: 'day', date: fromDate },
      destination: { kind: 'day', date: destinationDate },
    },
  };
}

describe('current and historical task membership selectors', () => {
  it('selects only the unique membership matching the current occurrence/date', () => {
    const a = planEntry(DATE_A, { outcome: 'completed' });
    const b = planEntry(DATE_B, {
      outcome: 'moved',
      destination: { kind: 'day', date: DATE_A },
    });

    expect(
      selectCurrentTaskMembership({ occurrence: currentCompleted(), memberships: [b, a] }),
    ).toBe(a);
    expect(
      selectCurrentTaskMembership({
        occurrence: {
          ...currentCompleted(),
          state: 'deleted',
          placement: { kind: 'none' },
        },
        memberships: [a, b],
      }),
    ).toBeUndefined();
    expect(() =>
      selectCurrentTaskMembership({ occurrence: currentCompleted(), memberships: [a, { ...a }] }),
    ).toThrow(/exactly one membership/i);
  });

  it('preserves repeated and cross-week memberships while reusing A on A→B→A', () => {
    const a = planEntry(DATE_A, { outcome: 'completed' });
    const b = planEntry(DATE_B, {
      outcome: 'moved',
      destination: { kind: 'day', date: DATE_A },
    });
    const c = planEntry(DATE_C, {
      outcome: 'moved',
      destination: { kind: 'day', date: DATE_B },
    });
    const events = [
      moveEvent(4, DATE_B, DATE_A, '4304'),
      moveEvent(2, DATE_A, DATE_C, '4302'),
      moveEvent(3, DATE_C, DATE_B, '4303'),
    ];

    const view = selectTaskHistoryView({
      occurrence: currentCompleted(),
      memberships: [c, b, a],
      events,
    });

    expect(view.memberships.map((entry) => entry.date)).toEqual([DATE_A, DATE_B, DATE_C]);
    expect(
      new Set(view.memberships.map((entry) => `${entry.occurrenceId}:${entry.date}`)).size,
    ).toBe(3);
    expect(view.events.map((event) => event.sequence)).toEqual([2, 3, 4]);
    expect(view.membershipFacts.map((fact) => fact.membership.date)).toEqual([
      DATE_A,
      DATE_B,
      DATE_C,
    ]);
  });

  it('orders equal-time audit facts only by persisted EventSequence', () => {
    const events = [
      moveEvent(30, DATE_B, DATE_A, '4301'),
      moveEvent(10, DATE_A, DATE_B, '4399'),
      moveEvent(20, DATE_B, DATE_C, '4302'),
    ];

    expect(orderTaskEvents(events).map((event) => event.sequence)).toEqual([10, 20, 30]);
    expect(events.map((event) => event.sequence)).toEqual([30, 10, 20]);
  });

  it('orders membership history by immutable date/entry facts, not input order', () => {
    const a = planEntry(DATE_A);
    const b = planEntry(DATE_B);
    const c = planEntry(DATE_C);

    expect(orderTaskMemberships([c, a, b]).map((entry) => entry.date)).toEqual([
      DATE_A,
      DATE_B,
      DATE_C,
    ]);
  });
});

describe('plan, disposition, and actual explanations', () => {
  it('keeps the historical plan separate from movement disposition and current actual outcome', () => {
    const occurrence = currentCompleted();
    const completedA = planEntry(DATE_A, { outcome: 'completed' });
    const movedB = planEntry(DATE_B, {
      outcome: 'moved',
      destination: { kind: 'day', date: DATE_A },
    });

    expect(explainTaskMembership(occurrence, completedA)).toEqual({
      membership: completedA,
      planned: completedA.plannedSnapshot,
      disposition: { outcome: 'completed' },
      actual: { outcome: 'completed', completedAt: SAME_INSTANT },
      isCurrentPlacement: true,
    } satisfies TaskMembershipHistoryFact);
    expect(explainTaskMembership(occurrence, movedB)).toEqual({
      membership: movedB,
      planned: movedB.plannedSnapshot,
      disposition: {
        outcome: 'moved',
        destination: { kind: 'day', date: DATE_A },
      },
      actual: { outcome: 'incomplete' },
      isCurrentPlacement: false,
    } satisfies TaskMembershipHistoryFact);
    expect(completedA.plannedSnapshot.title).toBe('Original plan 2026-08-11');
    expect(occurrence.title).toBe('Current title');
  });

  it('retains both excluded open memberships and preserved closed actuals after mixed deletion', () => {
    const deletedOccurrence: DeletedTaskOccurrence = {
      id: occurrenceId,
      title: 'Deleted task',
      state: 'deleted',
      placement: { kind: 'none' },
      isException: false,
      createdSequence: creationSequence(1),
      revision: revision(5),
    };
    const excludedOpen = planEntry(DATE_A, {
      outcome: 'deleted',
      finalizedAt: SAME_INSTANT,
    });
    const preservedClosed = planEntry(DATE_C, {
      outcome: 'completed',
      finalizedAt: SAME_INSTANT,
    });

    const view = selectTaskHistoryView({
      occurrence: deletedOccurrence,
      memberships: [preservedClosed, excludedOpen],
      events: [],
    });

    expect(view.membershipFacts.map((fact) => fact.actual.outcome)).toEqual([
      'excluded',
      'completed',
    ]);
    expect(view.membershipFacts[1]?.membership).toBe(preservedClosed);
  });
});

describe('backlog history-adjacent selection', () => {
  function backlogTask(
    sequence: number,
    suffix: string,
    state: TaskOccurrence['state'] = 'active',
  ): TaskOccurrence {
    const common = {
      id: id<'task-occurrence'>(suffix),
      title: `Backlog ${String(sequence)}`,
      isException: false,
      createdSequence: creationSequence(sequence),
      revision: revision(0),
    } as const;
    if (state === 'deleted') {
      return { ...common, state, placement: { kind: 'none' } };
    }
    if (state === 'finalized') {
      return { ...common, state, placement: { kind: 'none' } };
    }
    return { ...common, state, placement: { kind: 'backlog' } } satisfies BacklogTaskOccurrence;
  }

  it('returns only active backlog items in oldest-first creation order', () => {
    const newer = backlogTask(3, '4403');
    const older = backlogTask(1, '4401');
    const deleted = backlogTask(2, '4402', 'deleted');

    const view = selectOpenBacklogView({ occurrences: [newer, deleted, older] });

    expect(view.tasks.map((task) => task.createdSequence)).toEqual([1, 3]);
    expect(view).not.toHaveProperty('completion');
    expect(view).not.toHaveProperty('cancel');
    expect(view).not.toHaveProperty('restore');
  });
});
