import { describe, expect, it } from 'vitest';

import {
  addDays,
  compareLocalDates,
  endOfWeek,
  formatLocalDate,
  isLocalDate,
  isMonday,
  localDate,
  parseLocalDate,
  startOfWeek,
  weekDates,
} from './local-date';

describe('LocalDate', () => {
  it.each(['2024-02-29', '2025-01-01', '2026-12-31', '9999-12-31'])(
    'accepts the canonical calendar date %s',
    (value) => {
      expect(isLocalDate(value)).toBe(true);
      expect(parseLocalDate(value)).toBe(value);
      expect(localDate(value)).toBe(value);
    },
  );

  it.each([
    '',
    '2026-1-01',
    '26-01-01',
    '0000-01-01',
    '2023-02-29',
    '2024-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-01-01T00:00:00Z',
  ])('rejects the invalid LocalDate %j', (value) => {
    expect(isLocalDate(value)).toBe(false);
    expect(parseLocalDate(value)).toBeUndefined();
    expect(() => localDate(value)).toThrow(RangeError);
  });
});

describe('Monday-first calendar helpers', () => {
  it.each([
    ['2026-08-10', '2026-08-10', '2026-08-16'],
    ['2026-08-11', '2026-08-10', '2026-08-16'],
    ['2026-08-16', '2026-08-10', '2026-08-16'],
    ['2025-01-01', '2024-12-30', '2025-01-05'],
  ] as const)('derives the Monday-through-Sunday week for %s', (date, monday, sunday) => {
    const value = localDate(date);

    expect(startOfWeek(value)).toBe(monday);
    expect(endOfWeek(value)).toBe(sunday);
    expect(isMonday(startOfWeek(value))).toBe(true);
  });

  it('returns all seven dates exactly once in Monday-first order', () => {
    expect(weekDates(localDate('2024-12-31'))).toEqual([
      '2024-12-30',
      '2024-12-31',
      '2025-01-01',
      '2025-01-02',
      '2025-01-03',
      '2025-01-04',
      '2025-01-05',
    ]);
  });
});

describe('date-only arithmetic and comparison', () => {
  it.each([
    ['2023-12-31', 1, '2024-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2024-02-29', 1, '2024-03-01'],
    ['2025-03-01', -1, '2025-02-28'],
    ['2025-01-01', -2, '2024-12-30'],
    ['2026-08-11', 0, '2026-08-11'],
  ] as const)('adds %i day(s) to %s', (date, amount, expected) => {
    expect(addDays(localDate(date), amount)).toBe(expected);
  });

  it.each([Number.NaN, 1.5, Number.POSITIVE_INFINITY])(
    'rejects a non-integer day delta %s',
    (amount) => {
      expect(() => addDays(localDate('2026-08-11'), amount)).toThrow(RangeError);
    },
  );

  it('compares canonical dates without time-zone conversion', () => {
    const earlier = localDate('2025-12-31');
    const later = localDate('2026-01-01');

    expect(compareLocalDates(earlier, later)).toBe(-1);
    expect(compareLocalDates(later, earlier)).toBe(1);
    expect(compareLocalDates(earlier, earlier)).toBe(0);
  });
});

describe('presentation boundary', () => {
  it('formats a date through an explicit locale without shifting its day', () => {
    expect(
      formatLocalDate(localDate('2026-08-11'), 'ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
    ).toBe('11.08.2026');
  });
});
