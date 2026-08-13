import { describe, expect, it } from 'vitest';

import { createFixedClock, createSystemClock, instant, isInstant, parseInstant } from './clock';
import { localDate } from './local-date';

describe('Instant', () => {
  it('accepts canonical UTC instants', () => {
    const value = '2026-08-11T05:30:00.000Z';

    expect(isInstant(value)).toBe(true);
    expect(parseInstant(value)).toBe(value);
    expect(instant(value)).toBe(value);
  });

  it.each([
    '',
    '2026-08-11',
    '2026-08-11T05:30:00Z',
    '2026-08-11T12:30:00.000+07:00',
    '2026-02-30T00:00:00.000Z',
  ])('rejects a non-canonical UTC instant %j', (value) => {
    expect(isInstant(value)).toBe(false);
    expect(parseInstant(value)).toBeUndefined();
    expect(() => instant(value)).toThrow(RangeError);
  });
});

describe('ApplicationClock', () => {
  it('provides deterministic injected instants and local dates', () => {
    const clock = createFixedClock({
      instant: instant('2026-08-11T05:30:00.000Z'),
      currentLocalDate: localDate('2026-08-11'),
    });

    expect(clock.now()).toBe('2026-08-11T05:30:00.000Z');
    expect(clock.currentLocalDate()).toBe('2026-08-11');
  });

  it('derives the local calendar date in an injected time zone', () => {
    const clock = createSystemClock({
      now: () => new Date('2026-08-10T18:30:00.000Z'),
      timeZone: 'Asia/Krasnoyarsk',
    });

    expect(clock.now()).toBe('2026-08-10T18:30:00.000Z');
    expect(clock.currentLocalDate()).toBe('2026-08-11');
  });

  it('samples the injected time source once per operation', () => {
    const fallback = new Date('2026-08-10T18:00:00.000Z');
    const samples = [new Date('2026-08-10T17:00:00.000Z'), fallback] as const;
    let index = 0;
    const clock = createSystemClock({
      now: () => samples[index++] ?? fallback,
      timeZone: 'UTC',
    });

    expect(clock.now()).toBe('2026-08-10T17:00:00.000Z');
    expect(clock.currentLocalDate()).toBe('2026-08-10');
    expect(index).toBe(2);
  });
});
