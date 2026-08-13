import { describe, expect, it } from 'vitest';

import {
  creationSequence,
  dayPosition,
  durationMinutes,
  entityId,
  eventSequence,
  generateEntityId,
  isEntityId,
  isNonNegativeInteger,
  isPositiveInteger,
  nextCreationSequence,
  nextEventSequence,
  nextRevision,
  nonNegativeDurationMinutes,
  revision,
  type TaskOccurrenceId,
} from './index';

describe('typed entity identifiers', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000';

  it('validates and brands UUID identifiers without changing serialization', () => {
    const occurrenceId = entityId<'task-occurrence'>(uuid) satisfies TaskOccurrenceId;

    expect(occurrenceId).toBe(uuid);
    expect(isEntityId(occurrenceId)).toBe(true);
    expect(JSON.stringify({ occurrenceId })).toBe(`{"occurrenceId":"${uuid}"}`);
  });

  it('generates typed IDs through an injectable UUID source', () => {
    expect(generateEntityId<'task-occurrence'>(() => uuid)).toBe(uuid);
  });

  it.each(['', 'not-a-uuid', '123e4567-e89b-02d3-a456-426614174000'])(
    'rejects invalid UUID input %j',
    (value) => {
      expect(isEntityId(value)).toBe(false);
      expect(() => entityId(value)).toThrow(RangeError);
      expect(() => generateEntityId(() => value)).toThrow(RangeError);
    },
  );
});

describe('integer value objects', () => {
  it.each([0, 1, Number.MAX_SAFE_INTEGER])('accepts non-negative safe integer %s', (value) => {
    expect(isNonNegativeInteger(value)).toBe(true);
  });

  it.each([1, Number.MAX_SAFE_INTEGER])('accepts positive safe integer %s', (value) => {
    expect(isPositiveInteger(value)).toBe(true);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid integer value %s',
    (value) => {
      expect(isNonNegativeInteger(value)).toBe(false);
      expect(() => revision(value)).toThrow(RangeError);
      expect(() => dayPosition(value)).toThrow(RangeError);
      expect(() => nonNegativeDurationMinutes(value)).toThrow(RangeError);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid positive integer value %s',
    (value) => {
      expect(isPositiveInteger(value)).toBe(false);
      expect(() => eventSequence(value)).toThrow(RangeError);
      expect(() => creationSequence(value)).toThrow(RangeError);
      expect(() => durationMinutes(value)).toThrow(RangeError);
    },
  );

  it('brands each specified numeric value without changing its serialized value', () => {
    expect(revision(0)).toBe(0);
    expect(eventSequence(1)).toBe(1);
    expect(creationSequence(1)).toBe(1);
    expect(dayPosition(0)).toBe(0);
    expect(durationMinutes(30)).toBe(30);
    expect(nonNegativeDurationMinutes(0)).toBe(0);
  });

  it('increments revisions and sequences with the correct lower bounds', () => {
    expect(nextRevision(revision(0))).toBe(1);
    expect(nextEventSequence(eventSequence(1))).toBe(2);
    expect(nextCreationSequence(creationSequence(1))).toBe(2);
  });

  it('rejects increments beyond the safe integer boundary', () => {
    expect(() => nextRevision(revision(Number.MAX_SAFE_INTEGER))).toThrow(RangeError);
    expect(() => nextEventSequence(eventSequence(Number.MAX_SAFE_INTEGER))).toThrow(RangeError);
    expect(() => nextCreationSequence(creationSequence(Number.MAX_SAFE_INTEGER))).toThrow(
      RangeError,
    );
  });
});
