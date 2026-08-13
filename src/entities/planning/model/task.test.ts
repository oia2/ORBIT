import { describe, expect, it } from 'vitest';

import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';
import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  type TaskOccurrenceId,
} from '@/shared/lib/ids';
import { isOk } from '@/shared/lib/result';

import {
  createOneOffTask,
  ensureDatedMembership,
  reorderDatedTasks,
  sortDatedTaskOccurrences,
  type OneOffTaskPlanningResult,
} from './task';

const createdAt = instant('2026-08-11T01:00:00.000Z');
const taskOneId = entityId<'task-occurrence'>('123e4567-e89b-42d3-a456-426614174011');
const taskTwoId = entityId<'task-occurrence'>('123e4567-e89b-42d3-a456-426614174012');
const firstEntryId = entityId<'task-plan-entry'>('123e4567-e89b-42d3-a456-426614174021');
const secondEntryId = entityId<'task-plan-entry'>('123e4567-e89b-42d3-a456-426614174022');

function requireCreated(result: ReturnType<typeof createOneOffTask>): OneOffTaskPlanningResult {
  expect(isOk(result)).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected task creation, received ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function createDatedTask(
  id: TaskOccurrenceId,
  planEntryId: typeof firstEntryId,
  position: number,
  sequence: number,
): OneOffTaskPlanningResult {
  return requireCreated(
    createOneOffTask({
      id,
      planEntryId,
      title: `Task ${String(sequence)}`,
      placement: { kind: 'day', date: localDate('2026-08-12') },
      plannedDurationMinutes: 30,
      dayPosition: position,
      createdSequence: creationSequence(sequence),
      createdAt,
    }),
  );
}

describe('one-off task planning', () => {
  it('creates the first historical membership only for a committed dated placement', () => {
    const created = createDatedTask(taskOneId, firstEntryId, 2, 1);

    expect(created.occurrence).toMatchObject({
      id: taskOneId,
      state: 'active',
      placement: { kind: 'day', date: '2026-08-12' },
      plannedDurationMinutes: 30,
      dayPosition: 2,
      completion: 'incomplete',
      createdSequence: 1,
      revision: 0,
    });
    expect(created.planEntries).toEqual([
      {
        id: firstEntryId,
        occurrenceId: taskOneId,
        date: '2026-08-12',
        weekStart: '2026-08-10',
        plannedSnapshot: {
          title: 'Task 1',
          plannedDurationMinutes: 30,
        },
        outcome: 'planned',
        enteredAt: createdAt,
      },
    ]);
  });

  it.each([undefined, 0, -1, 1.5])(
    'rejects dated planning without a positive integer duration (%s)',
    (plannedDurationMinutes) => {
      const result = createOneOffTask({
        id: taskOneId,
        planEntryId: firstEntryId,
        title: 'Invalid duration',
        placement: { kind: 'day', date: localDate('2026-08-12') },
        plannedDurationMinutes,
        dayPosition: 0,
        createdSequence: creationSequence(1),
        createdAt,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DatedDurationRequired');
      }
    },
  );

  it('creates direct backlog tasks with optional duration and no dated membership/order/completion', () => {
    const withoutDuration = requireCreated(
      createOneOffTask({
        id: taskOneId,
        title: 'Backlog task',
        placement: { kind: 'backlog' },
        createdSequence: creationSequence(1),
        createdAt,
      }),
    );
    const withDuration = requireCreated(
      createOneOffTask({
        id: taskTwoId,
        title: 'Estimated backlog task',
        placement: { kind: 'backlog' },
        plannedDurationMinutes: 45,
        createdSequence: creationSequence(2),
        createdAt,
      }),
    );

    expect(withoutDuration.planEntries).toEqual([]);
    expect(withDuration.planEntries).toEqual([]);
    expect(withDuration.occurrence.plannedDurationMinutes).toBe(45);
    for (const key of ['completion', 'dayPosition', 'actualCompletedAt']) {
      expect(withoutDuration.occurrence).not.toHaveProperty(key);
    }
    expect(withoutDuration.occurrence).not.toHaveProperty('plannedDurationMinutes');
  });

  it('reuses the unique occurrence/date membership instead of inflating it', () => {
    const created = createDatedTask(taskOneId, firstEntryId, 0, 1);
    const ensured = ensureDatedMembership({
      occurrence: created.occurrence,
      date: localDate('2026-08-12'),
      memberships: created.planEntries,
      planEntryId: secondEntryId,
      enteredAt: instant('2026-08-12T02:00:00.000Z'),
    });

    expect(ensured.ok).toBe(true);
    if (ensured.ok) {
      expect(ensured.value.created).toBe(false);
      expect(ensured.value.membership).toBe(created.planEntries[0]);
      expect(ensured.value.memberships).toBe(created.planEntries);
      expect(ensured.value.memberships).toHaveLength(1);
    }
  });
});

describe('explicit dated ordering', () => {
  it('sorts by integer day position and rewrites an exact requested order', () => {
    const first = createDatedTask(taskOneId, firstEntryId, 5, 1);
    const second = createDatedTask(taskTwoId, secondEntryId, 1, 2);
    const occurrences = [first.occurrence, second.occurrence];

    expect(
      sortDatedTaskOccurrences(occurrences, localDate('2026-08-12')).map((task) => task.id),
    ).toEqual([taskTwoId, taskOneId]);

    const reordered = reorderDatedTasks({
      occurrences,
      date: localDate('2026-08-12'),
      orderedOccurrenceIds: [taskOneId, taskTwoId],
    });
    expect(reordered.ok).toBe(true);
    if (reordered.ok) {
      const sorted = sortDatedTaskOccurrences(reordered.value, localDate('2026-08-12'));
      expect(sorted.map((task) => task.id)).toEqual([taskOneId, taskTwoId]);
      expect(sorted.map((task) => task.dayPosition)).toEqual([dayPosition(0), dayPosition(1)]);
      expect(sorted.map((task) => task.revision)).toEqual([1, 1]);
    }
  });

  it.each([
    { orderedOccurrenceIds: [taskOneId] },
    { orderedOccurrenceIds: [taskOneId, taskOneId] },
  ])('rejects a dated order that is not an exact permutation', ({ orderedOccurrenceIds }) => {
    const first = createDatedTask(taskOneId, firstEntryId, 0, 1);
    const second = createDatedTask(taskTwoId, secondEntryId, 1, 2);

    expect(
      reorderDatedTasks({
        occurrences: [first.occurrence, second.occurrence],
        date: localDate('2026-08-12'),
        orderedOccurrenceIds,
      }),
    ).toEqual({ ok: false, error: { code: 'DatedOrderMismatch' } });
  });

  it('retains current duration types when tasks are copied by domain policy', () => {
    const first = createDatedTask(taskOneId, firstEntryId, 0, 1);
    expect({ ...first.occurrence, plannedDurationMinutes: durationMinutes(45) }).toMatchObject({
      plannedDurationMinutes: 45,
    });
  });
});
