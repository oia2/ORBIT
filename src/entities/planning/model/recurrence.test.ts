import { describe, expect, it } from 'vitest';

import { durationMinutes, revision } from '@/shared/lib/ids';
import { localDate } from '@/shared/lib/local-date/local-date';

import type { TaskTemplate } from './task';
import {
  applyRecurrenceRuleChange,
  createInitialRecurrenceVersion,
  effectiveRecurrenceVersionOn,
  isRecurrenceApplicableOn,
  isRecurrenceDateApplicable,
  shouldPreserveOccurrenceForRuleChange,
  stopRecurrence,
  validateRecurrenceRule,
  validateRecurringTaskTemplate,
  type RecurrenceRule,
} from './recurrence';

function expectValue<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw new Error(`Expected success: ${JSON.stringify(result.error)}`);
  }

  return result.value;
}

const MONDAY = localDate('2026-08-10');
const TUESDAY = localDate('2026-08-11');
const WEDNESDAY = localDate('2026-08-12');

const mondayRule: RecurrenceRule = {
  startDate: localDate('2026-08-01'),
  weekdays: [1],
};

describe('recurrence validation and applicability', () => {
  it('requires a positive duration for a recurring task template', () => {
    const valid: TaskTemplate = {
      title: 'Review plan',
      plannedDurationMinutes: durationMinutes(30),
    };
    const invalid = {
      title: 'Review plan',
      plannedDurationMinutes: 0,
    } as unknown as TaskTemplate;

    expect(validateRecurringTaskTemplate(valid)).toEqual({ ok: true, value: valid });
    expect(validateRecurringTaskTemplate(invalid)).toEqual({
      ok: false,
      error: [
        {
          code: 'InvalidDuration',
          field: 'plannedDurationMinutes',
        },
      ],
    });
  });

  it('rejects empty/invalid weekdays and an end before the start', () => {
    expect(
      validateRecurrenceRule({
        startDate: MONDAY,
        weekdays: [],
      }),
    ).toMatchObject({ ok: false, error: [{ code: 'WeekdaysRequired' }] });

    expect(
      validateRecurrenceRule({
        startDate: MONDAY,
        weekdays: [0 as never],
      }),
    ).toMatchObject({ ok: false, error: [{ code: 'InvalidWeekday' }] });

    expect(
      validateRecurrenceRule({
        startDate: WEDNESDAY,
        weekdays: [3],
        endDate: MONDAY,
      }),
    ).toMatchObject({ ok: false, error: [{ code: 'InvalidDateRange' }] });
  });

  it('validates corrupted runtime dates, every weekday shape, and duplicates', () => {
    for (const weekday of ['1', 1.5, 0, 8] as const) {
      expect(
        validateRecurrenceRule({
          startDate: MONDAY,
          weekdays: [weekday as never],
        }),
      ).toMatchObject({ ok: false, error: [{ code: 'InvalidWeekday' }] });
    }

    const corrupt = validateRecurrenceRule({
      startDate: 'not-a-date' as never,
      weekdays: [2, 2],
      endDate: 'also-not-a-date' as never,
    });
    expect(corrupt).toMatchObject({
      ok: false,
      error: [
        { code: 'InvalidStartDate' },
        { code: 'InvalidEndDate' },
        { code: 'DuplicateWeekday', value: 2 },
      ],
    });
  });

  it('treats a matching end date as inclusive', () => {
    const rule: RecurrenceRule = {
      startDate: MONDAY,
      weekdays: [1, 3],
      endDate: WEDNESDAY,
    };

    expect(isRecurrenceDateApplicable(rule, MONDAY)).toBe(true);
    expect(isRecurrenceDateApplicable(rule, TUESDAY)).toBe(false);
    expect(isRecurrenceDateApplicable(rule, WEDNESDAY)).toBe(true);
    expect(isRecurrenceDateApplicable(rule, localDate('2026-08-19'))).toBe(false);
    expect(isRecurrenceDateApplicable(rule, localDate('2026-08-09'))).toBe(false);
    expect(isRecurrenceDateApplicable(rule, 'bad-date' as never)).toBe(false);
    expect(isRecurrenceDateApplicable({ startDate: MONDAY, weekdays: [] }, MONDAY)).toBe(false);
  });
});

describe('effective recurrence versions', () => {
  it('keeps the current date on the old rule and starts a change on D+1', () => {
    const initial = expectValue(createInitialRecurrenceVersion(mondayRule, revision(0)));
    const changed = expectValue(
      applyRecurrenceRuleChange({
        ruleVersions: [initial],
        currentLocalDate: MONDAY,
        nextRule: {
          startDate: localDate('2026-08-01'),
          weekdays: [2],
        },
        revision: revision(1),
      }),
    );

    expect(changed).toHaveLength(2);
    expect(changed[0]).toMatchObject({ effectiveThrough: MONDAY, state: 'active' });
    expect(changed[1]).toMatchObject({ effectiveFrom: TUESDAY, state: 'active' });
    expect(isRecurrenceApplicableOn(changed, MONDAY)).toBe(true);
    expect(isRecurrenceApplicableOn(changed, TUESDAY)).toBe(true);
  });

  it('coalesces repeated same-day changes into one final D+1 version', () => {
    const initial = expectValue(createInitialRecurrenceVersion(mondayRule, revision(0)));
    const first = expectValue(
      applyRecurrenceRuleChange({
        ruleVersions: [initial],
        currentLocalDate: MONDAY,
        nextRule: { startDate: MONDAY, weekdays: [2] },
        revision: revision(1),
      }),
    );
    const final = expectValue(
      applyRecurrenceRuleChange({
        ruleVersions: first,
        currentLocalDate: MONDAY,
        nextRule: { startDate: MONDAY, weekdays: [3] },
        revision: revision(2),
      }),
    );

    expect(final).toHaveLength(2);
    expect(final.filter((version) => version.effectiveFrom === TUESDAY)).toHaveLength(1);
    expect(final[1]).toMatchObject({
      effectiveFrom: TUESDAY,
      revision: revision(2),
      state: 'active',
      rule: { weekdays: [3] },
    });
  });

  it('rejects invalid initial/change rules without changing version history', () => {
    expect(
      createInitialRecurrenceVersion({ startDate: MONDAY, weekdays: [] }, revision(0)),
    ).toMatchObject({ ok: false, error: [{ code: 'WeekdaysRequired' }] });

    const initial = expectValue(createInitialRecurrenceVersion(mondayRule, revision(0)));
    expect(
      applyRecurrenceRuleChange({
        ruleVersions: [initial],
        currentLocalDate: MONDAY,
        nextRule: { startDate: MONDAY, weekdays: [] },
        revision: revision(1),
      }),
    ).toMatchObject({ ok: false, error: [{ code: 'WeekdaysRequired' }] });
  });

  it('selects only the latest intersecting version and handles gaps/stopped periods', () => {
    const oldVersion = {
      revision: revision(0),
      effectiveFrom: localDate('2026-08-01'),
      effectiveThrough: localDate('2026-08-05'),
      state: 'active' as const,
      rule: mondayRule,
    };
    const currentVersion = {
      revision: revision(1),
      effectiveFrom: localDate('2026-08-06'),
      state: 'active' as const,
      rule: mondayRule,
    };
    const stoppedVersion = {
      revision: revision(2),
      effectiveFrom: TUESDAY,
      state: 'stopped' as const,
    };

    expect(effectiveRecurrenceVersionOn([], MONDAY)).toBeUndefined();
    expect(effectiveRecurrenceVersionOn([oldVersion], MONDAY)).toBeUndefined();
    expect(effectiveRecurrenceVersionOn([currentVersion, oldVersion], MONDAY)).toBe(currentVersion);
    expect(isRecurrenceApplicableOn([stoppedVersion], TUESDAY)).toBe(false);

    const changed = expectValue(
      applyRecurrenceRuleChange({
        ruleVersions: [currentVersion, oldVersion],
        currentLocalDate: MONDAY,
        nextRule: { startDate: MONDAY, weekdays: [2] },
        revision: revision(3),
      }),
    );
    expect(changed.map((version) => version.effectiveFrom)).toEqual([
      localDate('2026-08-01'),
      localDate('2026-08-06'),
      TUESDAY,
    ]);

    expect(
      stopRecurrence({
        ruleVersions: [],
        currentLocalDate: MONDAY,
        revision: revision(4),
      }),
    ).toEqual([
      {
        revision: revision(4),
        effectiveFrom: TUESDAY,
        state: 'stopped',
      },
    ]);
  });

  it('models stop as the final coalesced D+1 version', () => {
    const initial = expectValue(createInitialRecurrenceVersion(mondayRule, revision(0)));
    const changed = expectValue(
      applyRecurrenceRuleChange({
        ruleVersions: [initial],
        currentLocalDate: MONDAY,
        nextRule: { startDate: MONDAY, weekdays: [2] },
        revision: revision(1),
      }),
    );
    const stopped = stopRecurrence({
      ruleVersions: changed,
      currentLocalDate: MONDAY,
      revision: revision(2),
    });

    expect(stopped).toHaveLength(2);
    expect(stopped[1]).toEqual({
      revision: revision(2),
      effectiveFrom: TUESDAY,
      state: 'stopped',
    });
    expect(isRecurrenceApplicableOn(stopped, MONDAY)).toBe(true);
    expect(isRecurrenceApplicableOn(stopped, TUESDAY)).toBe(false);
  });

  it('protects past/current occurrences and explicit future exceptions', () => {
    expect(
      shouldPreserveOccurrenceForRuleChange({
        occurrenceDate: localDate('2026-08-09'),
        currentLocalDate: MONDAY,
        isException: false,
        isUserDeleted: false,
      }),
    ).toBe(true);
    expect(
      shouldPreserveOccurrenceForRuleChange({
        occurrenceDate: MONDAY,
        currentLocalDate: MONDAY,
        isException: false,
        isUserDeleted: false,
      }),
    ).toBe(true);
    expect(
      shouldPreserveOccurrenceForRuleChange({
        occurrenceDate: TUESDAY,
        currentLocalDate: MONDAY,
        isException: true,
        isUserDeleted: false,
      }),
    ).toBe(true);
    expect(
      shouldPreserveOccurrenceForRuleChange({
        occurrenceDate: TUESDAY,
        currentLocalDate: MONDAY,
        isException: false,
        isUserDeleted: false,
      }),
    ).toBe(false);
    expect(
      shouldPreserveOccurrenceForRuleChange({
        occurrenceDate: TUESDAY,
        currentLocalDate: MONDAY,
        isException: false,
        isUserDeleted: true,
      }),
    ).toBe(true);
  });
});
