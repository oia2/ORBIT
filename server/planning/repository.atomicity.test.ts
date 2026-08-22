import { beforeEach, describe, expect, it } from 'vitest';

import { dayPosition, durationMinutes, nonNegativeDurationMinutes } from '@/shared/lib/ids';
import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import {
  createRepositoryUnderTest,
  type RepositoryUnderTest,
} from './test-support/repository-harness';

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');
const NOW = instant('2026-08-11T15:00:00.000Z');

const CLOCK = createFixedClock({ instant: NOW, currentLocalDate: TUESDAY });

/**
 * A repository that hands out the same identifier every time.
 *
 * The second row it inserts into any keyed table therefore collides, which
 * fails a command part-way through without needing to guess how many
 * identifiers it allocates first. It is a blunt instrument, and that is the
 * point: it makes the failure deterministic.
 */
const COLLIDING_ID = '00000000-0000-4000-8000-0000000f0001';

/**
 * SC-005: a command that fails part-way leaves zero partial state.
 *
 * `closeDay` is the case that decides it. One closure writes the day, several
 * task occurrences, their memberships, an audit event per disposition, and the
 * habit occurrences the boundary catch-up touched. If atomicity is going to
 * break anywhere it breaks here — a half-closed day would show a frozen score
 * over tasks that were never dispositioned.
 */
describe('command atomicity', () => {
  let harness: RepositoryUnderTest;

  beforeEach(async () => {
    harness = await createRepositoryUnderTest({ clock: CLOCK });
    await harness.repository.ensureCalendarWeek({ date: TUESDAY });

    for (const [index, title] of ['Keep', 'Move', 'Cancel'].entries()) {
      const created = await harness.repository.createTask({
        title,
        placement: { kind: 'day', date: TUESDAY },
        durationMinutes: durationMinutes(30),
        dayPosition: dayPosition(index),
      });
      if (!created.ok) throw new Error(created.error.code);
    }
  });

  async function dispositionsForEveryTask() {
    const occurrences = await harness.database.getAllTaskOccurrences();
    return Object.fromEntries(
      occurrences.map((occurrence, index) => [
        occurrence.id,
        index === 1
          ? {
              kind: 'move-to-date' as const,
              destinationDate: WEDNESDAY,
              durationMinutes: durationMinutes(30),
              dayPosition: dayPosition(0),
            }
          : { kind: 'keep-unfinished' as const },
      ]),
    );
  }

  it('leaves nothing behind when a closure fails after writing part of its effects', async () => {
    const day = await harness.database.getDay(TUESDAY);
    if (day === undefined) throw new Error('missing day');
    const dispositions = await dispositionsForEveryTask();
    const before = await harness.database.snapshotAllStores();

    // Rebuilt against the same data — `reopen` does not truncate.
    const colliding = harness.reopen({ clock: CLOCK, generateUuid: () => COLLIDING_ID });
    const attempt = await colliding.repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: day.revision,
      dispositions,
    });

    expect(attempt).toMatchObject({ ok: false });
    // Not one row moved: the day is still open, no occurrence was finalized,
    // no membership was given an outcome, and no audit event was appended.
    await expect(harness.database.snapshotAllStores()).resolves.toEqual(before);
    expect(await harness.database.getDay(TUESDAY)).toMatchObject({ status: 'open' });
    expect(await harness.database.countTaskEvents()).toBe(before.taskEvents?.length ?? 0);
  });

  it('leaves nothing behind when the domain rejects a closure after it was prepared', async () => {
    const day = await harness.database.getDay(TUESDAY);
    if (day === undefined) throw new Error('missing day');
    const dispositions = await dispositionsForEveryTask();

    // A disposition naming a destination that is not open: the domain rejects
    // the whole closure only after the repository has read and prepared it.
    const destination = await harness.database.getDay(WEDNESDAY);
    if (destination === undefined) throw new Error('missing destination');
    await harness.database.putDay({
      ...destination,
      status: 'closed',
      closedAt: NOW,
      closureSnapshot: {
        score: {
          task: { completed: 0, applicable: 0, rate: 'unavailable' },
          habit: { completed: 0, applicable: 0, rate: 'unavailable' },
          value: 'unavailable',
        },
        plannedLoadMinutes: nonNegativeDurationMinutes(0),
      },
    });
    const before = await harness.database.snapshotAllStores();

    const attempt = await harness.repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: day.revision,
      dispositions,
    });

    expect(attempt).toMatchObject({ ok: false, error: { code: 'MoveTargetClosed' } });
    await expect(harness.database.snapshotAllStores()).resolves.toEqual(before);
  });

  it('leaves nothing behind when materialization fails inside prepareOpenPeriod', async () => {
    const created = await harness.repository.createHabitDefinition({
      title: 'Habit',
      recurrenceRule: { startDate: MONDAY, weekdays: [1, 2, 3] },
    });
    if (!created.ok) throw new Error(created.error.code);
    const before = await harness.database.snapshotAllStores();

    // Materializing Monday, Tuesday and Wednesday needs three habit occurrence
    // ids; handing out one id makes the second insert collide, after the first
    // has already been written in the same transaction.
    const colliding = harness.reopen({ clock: CLOCK, generateUuid: () => COLLIDING_ID });
    const attempt = await colliding.repository.prepareOpenPeriod({
      kind: 'week',
      weekStart: MONDAY,
    });

    expect(attempt).toMatchObject({ ok: false });
    await expect(harness.database.snapshotAllStores()).resolves.toEqual(before);
    expect(await harness.database.countHabitOccurrences()).toBe(0);
  });

  it('commits every effect of a closure together when it succeeds', async () => {
    const day = await harness.database.getDay(TUESDAY);
    if (day === undefined) throw new Error('missing day');
    const dispositions = await dispositionsForEveryTask();

    const closed = await harness.repository.closeDay({
      date: TUESDAY,
      expectedDayRevision: day.revision,
      dispositions,
    });

    expect(closed).toMatchObject({ ok: true });
    // The counterpart of the rollback cases: on success every effect landed.
    expect(await harness.database.getDay(TUESDAY)).toMatchObject({ status: 'closed' });
    const memberships = await harness.database.getPlanEntriesByDate(TUESDAY);
    expect(memberships).toHaveLength(3);
    expect(memberships.every((entry) => entry.finalizedAt === NOW)).toBe(true);
    expect(await harness.database.getPlanEntriesByDate(WEDNESDAY)).toHaveLength(1);
    const closureEvents = (await harness.database.getAllTaskEvents()).filter((event) =>
      event.type.startsWith('closure-'),
    );
    expect(closureEvents).toHaveLength(3);
  });
});
