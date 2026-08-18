import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import { instant, type Instant } from '@/shared/lib/local-date/clock';
import { localDate, type LocalDate } from '@/shared/lib/local-date/local-date';

import type { Database } from './schema';

export type PlanningDatabase = Kysely<Database>;

/** PostgreSQL type OIDs whose default `pg` parsing would destroy a brand. */
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMPTZ = 1184;

const POSTGRES_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?)?$/;

/**
 * Feature 001's `LocalDate` is a branded `YYYY-MM-DD` string. Passing a `date`
 * column through a JS `Date` would reinterpret it in the process timezone and
 * shift it by a day, which is exactly the dependency FR-009 forbids.
 */
export function parsePostgresDate(value: string): LocalDate {
  return localDate(value);
}

/**
 * Converts PostgreSQL's `timestamptz` text form to feature 001's canonical
 * `Instant` (`YYYY-MM-DDTHH:MM:SS.sssZ`) without constructing a `Date`.
 *
 * PostgreSQL trims trailing zeros from the fractional second, so an instant
 * written as `.000` comes back with no fraction at all and has to be padded
 * back to exactly three digits for the brand to validate.
 */
export function parsePostgresTimestamp(value: string): Instant {
  const match = POSTGRES_TIMESTAMP_PATTERN.exec(value.trim());
  if (match === null) {
    throw new RangeError(`Unrecognized PostgreSQL timestamp: ${value}`);
  }

  const [, date, time, fraction, zulu, sign, offsetHours, offsetMinutes] = match;
  if (date === undefined || time === undefined) {
    throw new RangeError(`Unrecognized PostgreSQL timestamp: ${value}`);
  }

  const offsetIsUtc =
    zulu !== undefined ||
    sign === undefined ||
    (Number(offsetHours ?? '0') === 0 && Number(offsetMinutes ?? '0') === 0);
  if (!offsetIsUtc) {
    // The pool forces `TimeZone=UTC`; a non-zero offset means that setting was
    // lost, and silently shifting the value would corrupt recorded history.
    throw new RangeError(
      `PostgreSQL returned a non-UTC timestamp (${value}); the connection must use TimeZone=UTC.`,
    );
  }

  const milliseconds = (fraction ?? '').padEnd(3, '0').slice(0, 3);
  return instant(`${date}T${time}.${milliseconds}Z`);
}

/**
 * `CreationSequence` and `EventSequence` are branded JS numbers, but `pg`
 * returns `bigint` as a string to avoid precision loss. Both stay far below
 * `Number.MAX_SAFE_INTEGER` in this single-user application, and the conversion
 * refuses anything that would not round-trip.
 */
export function parsePostgresBigInt(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`bigint ${value} is outside the safe integer range`);
  }

  return parsed;
}

function createTypeParsers(): pg.CustomTypesConfig {
  const builtins: (oid: number, format?: unknown) => (value: string) => unknown = (oid, format) =>
    pg.types.getTypeParser(oid, format as never) as (value: string) => unknown;

  return {
    getTypeParser: ((oid: number, format?: unknown) => {
      switch (oid) {
        case OID_DATE:
          return parsePostgresDate;
        case OID_TIMESTAMP:
        case OID_TIMESTAMPTZ:
          return parsePostgresTimestamp;
        case OID_INT8:
          return parsePostgresBigInt;
        default:
          return builtins(oid, format);
      }
    }) as pg.CustomTypesConfig['getTypeParser'],
  };
}

export interface CreatePlanningDatabaseOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
  /** Test-only hook used to assert that reads stay bounded. */
  readonly onQuery?: (sql: string, parameters: readonly unknown[]) => void;
}

export interface PlanningDatabaseHandle {
  readonly db: PlanningDatabase;
  readonly pool: pg.Pool;
  destroy(): Promise<void>;
}

export function createPlanningDatabase(
  options: CreatePlanningDatabaseOptions,
): PlanningDatabaseHandle {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    ...(options.maxConnections === undefined ? {} : { max: options.maxConnections }),
    types: createTypeParsers(),
    // Pins the session so `timestamptz` always renders with a zero offset. The
    // server therefore never depends on the timezone of the machine it runs on.
    options: '-c TimeZone=UTC',
  });

  const { onQuery } = options;
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    ...(onQuery === undefined
      ? {}
      : {
          log: (event) => {
            onQuery(event.query.sql, event.query.parameters);
          },
        }),
  });

  return {
    db,
    pool,
    async destroy(): Promise<void> {
      await db.destroy();
    },
  };
}
