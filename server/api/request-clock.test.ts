import { describe, expect, it } from 'vitest';

import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { INSTANT_HEADER, LOCAL_DATE_HEADER, readRequestClock } from './request-clock';

const DATE = localDate('2026-08-11');
const NOW = instant('2026-08-11T08:00:00.000Z');

describe('readRequestClock', () => {
  it('rebuilds the caller clock from both headers', () => {
    const result = readRequestClock({
      [LOCAL_DATE_HEADER]: DATE,
      [INSTANT_HEADER]: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.clock.currentLocalDate()).toBe(DATE);
    expect(result.clock.now()).toBe(NOW);
  });

  it('reads the first value when a header repeats', () => {
    const result = readRequestClock({
      [LOCAL_DATE_HEADER]: [DATE, '2026-01-01'],
      [INSTANT_HEADER]: NOW,
    });

    expect(result.ok && result.clock.currentLocalDate()).toBe(DATE);
  });

  it.each([
    ['both headers missing', {}],
    ['the local date missing', { [INSTANT_HEADER]: NOW }],
    ['the instant missing', { [LOCAL_DATE_HEADER]: DATE }],
  ])('refuses a request with %s rather than falling back to server time', (_label, headers) => {
    const result = readRequestClock(headers);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a rejection');
    expect(result.message).toMatch(/Missing required clock header/);
  });

  it.each([
    ['2026-13-01', 'a month that does not exist'],
    ['2026-02-30', 'a day that does not exist'],
    ['11-08-2026', 'the wrong field order'],
    ['2026-8-1', 'unpadded fields'],
    ['', 'an empty value'],
  ])('rejects the malformed local date %s (%s)', (value) => {
    const result = readRequestClock({
      [LOCAL_DATE_HEADER]: value,
      [INSTANT_HEADER]: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a rejection');
    expect(result.message).toMatch(/X-Orbit-Local-Date/);
  });

  it.each([
    ['2026-08-11T08:00:00Z', 'no milliseconds'],
    ['2026-08-11T08:00:00.000+02:00', 'a non-UTC offset'],
    ['2026-08-11 08:00:00.000Z', 'a space separator'],
    ['2026-08-11T25:00:00.000Z', 'an impossible hour'],
    ['not-an-instant', 'nonsense'],
  ])('rejects the malformed instant %s (%s)', (value) => {
    const result = readRequestClock({
      [LOCAL_DATE_HEADER]: DATE,
      [INSTANT_HEADER]: value,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a rejection');
    expect(result.message).toMatch(/X-Orbit-Instant/);
  });

  it('returns a fixed clock, so repeated reads within a request never drift', () => {
    const result = readRequestClock({
      [LOCAL_DATE_HEADER]: DATE,
      [INSTANT_HEADER]: NOW,
    });

    if (!result.ok) throw new Error(result.message);
    expect(result.clock.now()).toBe(result.clock.now());
    expect(result.clock.currentLocalDate()).toBe(result.clock.currentLocalDate());
  });
});
