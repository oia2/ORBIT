import { describe, expect, it } from 'vitest';

import { createFixedClock, instant } from '@/shared/lib/local-date/clock';
import { entityId, revision } from '@/shared/lib/ids';
import { localDate, startOfWeek } from '@/shared/lib/local-date/local-date';

import {
  catchUpHabitDateBoundary,
  clearHabitOutcome,
  correctBoundaryMissToCompleted,
  deleteHabitOccurrence,
  isHabitOccurrenceApplicable,
  recordHabitOutcome,
  type HabitOccurrence,
} from './habit';

const DATE = localDate('2026-08-10');
const NEXT_DATE = localDate('2026-08-11');
const FIRST_INSTANT = instant('2026-08-10T10:00:00.000Z');
const BOUNDARY_INSTANT = instant('2026-08-11T00:00:01.000Z');
const CORRECTION_INSTANT = instant('2026-08-11T07:00:00.000Z');

function pendingOccurrence(): HabitOccurrence {
  return {
    id: entityId<'habit-occurrence'>('00000000-0000-4000-8000-000000000601'),
    definitionId: entityId<'habit-definition'>('00000000-0000-4000-8000-000000000602'),
    date: DATE,
    weekStart: startOfWeek(DATE),
    definitionSnapshot: { title: 'Walk' },
    ruleRevision: revision(0),
    isException: false,
    outcome: 'pending',
    outcomeEvents: [],
    updatedAt: instant('2026-08-10T00:00:00.000Z'),
  };
}

function clock(currentLocalDate: typeof DATE, value: typeof FIRST_INSTANT) {
  return createFixedClock({ currentLocalDate, instant: value });
}

function valueOf<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw new Error(`Expected success: ${JSON.stringify(result.error)}`);
  }

  return result.value;
}

describe('clearing a user mark', () => {
  function completedOccurrence(): HabitOccurrence {
    return valueOf(
      recordHabitOutcome({
        occurrence: pendingOccurrence(),
        outcome: 'completed',
        dayStatus: 'open',
        clock: clock(DATE, FIRST_INSTANT),
      }),
    ).occurrence;
  }

  it('returns a user-marked habit to pending while the day is open', () => {
    const transition = valueOf(
      clearHabitOutcome({
        occurrence: completedOccurrence(),
        dayStatus: 'open',
        clock: clock(DATE, CORRECTION_INSTANT),
      }),
    );

    expect(transition.occurrence.outcome).toBe('pending');
    expect(transition.occurrence.outcomeEvents.at(-1)).toMatchObject({
      source: 'user-cleared',
      outcome: 'pending',
    });
    // The original mark stays in the audit trail.
    expect(transition.occurrence.outcomeEvents).toHaveLength(2);
  });

  it('refuses to clear a closed day or an automatic boundary miss', () => {
    expect(
      clearHabitOutcome({
        occurrence: completedOccurrence(),
        dayStatus: 'closed',
        clock: clock(DATE, CORRECTION_INSTANT),
      }).ok,
    ).toBe(false);

    const missed = valueOf(
      catchUpHabitDateBoundary({
        occurrence: pendingOccurrence(),
        dayStatus: 'open',
        clock: clock(NEXT_DATE, BOUNDARY_INSTANT),
      }),
    ).occurrence;
    expect(
      clearHabitOutcome({
        occurrence: missed,
        dayStatus: 'open',
        clock: clock(NEXT_DATE, CORRECTION_INSTANT),
      }).ok,
    ).toBe(false);
  });
});

describe('habit outcome transitions', () => {
  it.each(['completed', 'not-completed'] as const)(
    'records an explicit pending -> %s user outcome',
    (outcome) => {
      const transition = valueOf(
        recordHabitOutcome({
          occurrence: pendingOccurrence(),
          outcome,
          dayStatus: 'open',
          clock: clock(DATE, FIRST_INSTANT),
        }),
      );

      expect(transition.changed).toBe(true);
      expect(transition.occurrence.outcome).toBe(outcome);
      expect(transition.occurrence.outcomeEvents).toEqual([
        {
          ordinal: 1,
          occurredAt: FIRST_INSTANT,
          source: 'user',
          outcome,
        },
      ]);
    },
  );

  it('uses the injected clock to mark an expired pending habit not completed', () => {
    const sameDate = valueOf(
      catchUpHabitDateBoundary({
        occurrence: pendingOccurrence(),
        dayStatus: 'open',
        clock: clock(DATE, FIRST_INSTANT),
      }),
    );
    expect(sameDate.changed).toBe(false);

    const expired = valueOf(
      catchUpHabitDateBoundary({
        occurrence: pendingOccurrence(),
        dayStatus: 'open',
        clock: clock(NEXT_DATE, BOUNDARY_INSTANT),
      }),
    );
    expect(expired.occurrence.outcome).toBe('not-completed');
    expect(expired.occurrence.outcomeEvents).toEqual([
      {
        ordinal: 1,
        occurredAt: BOUNDARY_INSTANT,
        source: 'date-boundary',
        outcome: 'not-completed',
      },
    ]);
  });

  it('makes date-boundary catch-up idempotent', () => {
    const first = valueOf(
      catchUpHabitDateBoundary({
        occurrence: pendingOccurrence(),
        dayStatus: 'open',
        clock: clock(NEXT_DATE, BOUNDARY_INSTANT),
      }),
    );
    const second = valueOf(
      catchUpHabitDateBoundary({
        occurrence: first.occurrence,
        dayStatus: 'open',
        clock: clock(NEXT_DATE, CORRECTION_INSTANT),
      }),
    );

    expect(second.changed).toBe(false);
    expect(second.occurrence.outcomeEvents).toHaveLength(1);
  });

  it('corrects only an automatic miss and retains both ordered events', () => {
    const missed = valueOf(
      catchUpHabitDateBoundary({
        occurrence: pendingOccurrence(),
        dayStatus: 'open',
        clock: clock(NEXT_DATE, BOUNDARY_INSTANT),
      }),
    );
    const corrected = valueOf(
      correctBoundaryMissToCompleted({
        occurrence: missed.occurrence,
        dayStatus: 'open',
        clock: clock(NEXT_DATE, CORRECTION_INSTANT),
      }),
    );

    expect(corrected.occurrence.outcome).toBe('completed');
    expect(corrected.occurrence.outcomeEvents).toEqual([
      {
        ordinal: 1,
        occurredAt: BOUNDARY_INSTANT,
        source: 'date-boundary',
        outcome: 'not-completed',
      },
      {
        ordinal: 2,
        occurredAt: CORRECTION_INSTANT,
        source: 'user-correction',
        outcome: 'completed',
      },
    ]);

    const explicitMiss = valueOf(
      recordHabitOutcome({
        occurrence: pendingOccurrence(),
        outcome: 'not-completed',
        dayStatus: 'open',
        clock: clock(DATE, FIRST_INSTANT),
      }),
    );
    expect(
      correctBoundaryMissToCompleted({
        occurrence: explicitMiss.occurrence,
        dayStatus: 'open',
        clock: clock(NEXT_DATE, CORRECTION_INSTANT),
      }),
    ).toMatchObject({ ok: false, error: { code: 'InvalidTransition' } });
  });

  it('deletes an open occurrence as an excluded tombstone without losing outcome events', () => {
    const completed = valueOf(
      recordHabitOutcome({
        occurrence: pendingOccurrence(),
        outcome: 'completed',
        dayStatus: 'open',
        clock: clock(DATE, FIRST_INSTANT),
      }),
    );
    const deleted = valueOf(
      deleteHabitOccurrence({
        occurrence: completed.occurrence,
        dayStatus: 'open',
        clock: clock(DATE, CORRECTION_INSTANT),
      }),
    );

    expect(deleted.occurrence.outcome).toBe('deleted');
    expect(deleted.occurrence.outcomeEvents).toEqual(completed.occurrence.outcomeEvents);
    expect(isHabitOccurrenceApplicable(deleted.occurrence)).toBe(false);
  });

  it('rejects every mutation when the governing day is closed', () => {
    expect(
      recordHabitOutcome({
        occurrence: pendingOccurrence(),
        outcome: 'completed',
        dayStatus: 'closed',
        clock: clock(DATE, FIRST_INSTANT),
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable', date: DATE } });

    expect(
      catchUpHabitDateBoundary({
        occurrence: pendingOccurrence(),
        dayStatus: 'closed',
        clock: clock(NEXT_DATE, BOUNDARY_INSTANT),
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable', date: DATE } });

    expect(
      deleteHabitOccurrence({
        occurrence: pendingOccurrence(),
        dayStatus: 'closed',
        clock: clock(DATE, FIRST_INSTANT),
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable', date: DATE } });

    const missed = valueOf(
      catchUpHabitDateBoundary({
        occurrence: pendingOccurrence(),
        dayStatus: 'open',
        clock: clock(NEXT_DATE, BOUNDARY_INSTANT),
      }),
    );
    expect(
      correctBoundaryMissToCompleted({
        occurrence: missed.occurrence,
        dayStatus: 'closed',
        clock: clock(NEXT_DATE, CORRECTION_INSTANT),
      }),
    ).toMatchObject({ ok: false, error: { code: 'PeriodImmutable', date: DATE } });
  });
});
