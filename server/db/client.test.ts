import { sql } from 'kysely';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { revision } from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import { openSharedTestDatabase, type TestDatabase } from '../test-support/database';
import { parsePostgresBigInt, parsePostgresDate, parsePostgresTimestamp } from './client';

const MONDAY = localDate('2026-08-10');

describe('parsePostgresTimestamp', () => {
  it('pads a trimmed fractional second back to the canonical three digits', () => {
    expect(parsePostgresTimestamp('2026-08-10 07:08:09+00')).toBe('2026-08-10T07:08:09.000Z');
    expect(parsePostgresTimestamp('2026-08-10 07:08:09.1+00')).toBe('2026-08-10T07:08:09.100Z');
    expect(parsePostgresTimestamp('2026-08-10 07:08:09.123+00')).toBe('2026-08-10T07:08:09.123Z');
  });

  it('truncates sub-millisecond precision rather than rounding into another second', () => {
    expect(parsePostgresTimestamp('2026-08-10 07:08:09.123456+00')).toBe(
      '2026-08-10T07:08:09.123Z',
    );
  });

  it('refuses a non-UTC offset instead of silently shifting the recorded instant', () => {
    expect(() => parsePostgresTimestamp('2026-08-10 09:08:09+02')).toThrow(/TimeZone=UTC/);
  });
});

describe('parsePostgresBigInt', () => {
  it('refuses a value that would not survive the round trip', () => {
    expect(parsePostgresBigInt('42')).toBe(42);
    expect(() => parsePostgresBigInt('9223372036854775807')).toThrow(/safe integer/);
  });
});

describe('parsePostgresDate', () => {
  it('returns the branded string form unchanged', () => {
    expect(parsePostgresDate('2026-08-10')).toBe(MONDAY);
  });
});

describe('planning database type parsers', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await openSharedTestDatabase();
  });

  beforeEach(async () => {
    await database.truncateAll();
  });

  it('round-trips a LocalDate as a byte-identical branded string', async () => {
    await database.db
      .insertInto('weeks')
      .values({
        start_date: MONDAY,
        status: 'open',
        goals: JSON.stringify([]),
        reflection: null,
        completion_snapshot: null,
        completed_at: null,
        revision: revision(0),
      })
      .execute();

    const stored = await database.db
      .selectFrom('weeks')
      .selectAll()
      .where('start_date', '=', MONDAY)
      .executeTakeFirstOrThrow();

    expect(stored.start_date).toBe(MONDAY);
    expect(typeof stored.start_date).toBe('string');
  });

  it.each([
    instant('2026-08-10T07:08:09.000Z'),
    instant('2026-08-10T07:08:09.123Z'),
    instant('2026-08-10T00:00:00.900Z'),
    instant('2026-12-31T23:59:59.999Z'),
  ])('round-trips %s as a byte-identical branded Instant', async (value) => {
    await database.db
      .insertInto('weeks')
      .values({
        start_date: MONDAY,
        status: 'completed',
        goals: JSON.stringify([]),
        reflection: null,
        completion_snapshot: JSON.stringify({
          progress: {
            task: { completed: 0, applicable: 0, rate: 'unavailable' },
            habit: { completed: 0, applicable: 0, rate: 'unavailable' },
            value: 'unavailable',
            weightsApplied: { task: 0, habit: 0 },
          },
        }),
        completed_at: value,
        revision: revision(1),
      })
      .execute();

    const stored = await database.db
      .selectFrom('weeks')
      .select('completed_at')
      .where('start_date', '=', MONDAY)
      .executeTakeFirstOrThrow();

    expect(stored.completed_at).toBe(value);
  });

  it('returns bigint columns as safe JS numbers', async () => {
    const [row] = await sql<{
      readonly value: number;
    }>`SELECT 9007199254740991::bigint AS value`
      .execute(database.db)
      .then((result) => result.rows);

    expect(row?.value).toBe(Number.MAX_SAFE_INTEGER);
  });
});
