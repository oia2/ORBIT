import { describe, expect, it } from 'vitest';

import { createFixedClock, instant } from '../../shared/lib/local-date/clock';
import { localDate } from '../../shared/lib/local-date/local-date';

import {
  BACKLOG_PATH,
  HISTORY_PATH,
  ROOT_PATH,
  buildDayPath,
  buildWeekPath,
  canonicalWeekStart,
  currentWeekPath,
  parseDayRouteDate,
  resolveRootPath,
} from './paths';

describe('canonical ORBIT paths', () => {
  it('exposes the three static route paths', () => {
    expect(ROOT_PATH).toBe('/');
    expect(BACKLOG_PATH).toBe('/backlog');
    expect(HISTORY_PATH).toBe('/history');
  });

  it('builds a canonical Monday week path from any date in that week', () => {
    expect(buildWeekPath(localDate('2026-08-10'))).toBe('/week/2026-08-10');
    expect(buildWeekPath(localDate('2026-08-16'))).toBe('/week/2026-08-10');
  });

  it('builds a canonical day path', () => {
    expect(buildDayPath(localDate('2026-08-11'))).toBe('/day/2026-08-11');
  });

  it.each([
    ['2026-08-10', '2026-08-10'],
    ['2026-08-16', '2026-08-10'],
    ['not-a-date', undefined],
    ['2026-02-30', undefined],
  ] as const)('canonicalizes the week route value %s', (value, expected) => {
    expect(canonicalWeekStart(value)).toBe(expected);
  });

  it.each([
    ['2026-08-11', '2026-08-11'],
    ['2026-02-30', undefined],
    ['11.08.2026', undefined],
  ] as const)('validates the day route value %s', (value, expected) => {
    expect(parseDayRouteDate(value)).toBe(expected);
  });
});

describe('current/root week derivation', () => {
  it('derives the containing week from the injected application clock', () => {
    const clock = createFixedClock({
      instant: instant('2026-08-16T10:00:00.000Z'),
      currentLocalDate: localDate('2026-08-16'),
    });

    expect(currentWeekPath(clock)).toBe('/week/2026-08-10');
    expect(resolveRootPath(clock)).toBe('/week/2026-08-10');
  });
});
