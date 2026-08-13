import { localDateFromParts, type LocalDate } from './local-date';

declare const instantBrand: unique symbol;

export type Instant = string & {
  readonly [instantBrand]: 'Instant';
};

export interface ApplicationClock {
  now(): Instant;
  currentLocalDate(): LocalDate;
}

export interface SystemClockOptions {
  readonly now?: () => Date;
  readonly timeZone?: string;
}

export interface FixedClockValue {
  readonly instant: Instant;
  readonly currentLocalDate: LocalDate;
}

const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isInstant(value: unknown): value is Instant {
  if (typeof value !== 'string' || !INSTANT_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function parseInstant(value: unknown): Instant | undefined {
  return isInstant(value) ? value : undefined;
}

export function instant(value: string): Instant {
  const parsed = parseInstant(value);
  if (parsed === undefined) {
    throw new RangeError(`Invalid canonical UTC instant: ${value}`);
  }

  return parsed;
}

function instantFromDate(value: Date): Instant {
  if (!Number.isFinite(value.getTime())) {
    throw new RangeError('Clock returned an invalid Date');
  }

  return instant(value.toISOString());
}

function requiredDatePart(
  parts: readonly Intl.DateTimeFormatPart[],
  type: 'year' | 'month' | 'day',
): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new RangeError(`Unable to derive ${type} from the application clock`);
  }

  return Number(value);
}

export function createSystemClock(options: SystemClockOptions = {}): ApplicationClock {
  const sampleNow = options.now ?? (() => new Date());
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-iso8601-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  });

  return Object.freeze({
    now: (): Instant => instantFromDate(sampleNow()),
    currentLocalDate: (): LocalDate => {
      const sample = sampleNow();
      if (!Number.isFinite(sample.getTime())) {
        throw new RangeError('Clock returned an invalid Date');
      }

      const parts = formatter.formatToParts(sample);
      return localDateFromParts(
        requiredDatePart(parts, 'year'),
        requiredDatePart(parts, 'month'),
        requiredDatePart(parts, 'day'),
      );
    },
  });
}

export function createFixedClock(value: FixedClockValue): ApplicationClock {
  return Object.freeze({
    now: (): Instant => value.instant,
    currentLocalDate: (): LocalDate => value.currentLocalDate,
  });
}
