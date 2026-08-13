declare const localDateBrand: unique symbol;

export type LocalDate = string & {
  readonly [localDateBrand]: 'LocalDate';
};

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WeekDates = readonly [
  LocalDate,
  LocalDate,
  LocalDate,
  LocalDate,
  LocalDate,
  LocalDate,
  LocalDate,
];

interface LocalDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }

  return DAYS_IN_MONTH[month - 1] ?? 0;
}

function parseParts(value: string): LocalDateParts | undefined {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (match === null) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return undefined;
  }

  return { year, month, day };
}

function formatParts({ year, month, day }: LocalDateParts): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0',
  )}` as LocalDate;
}

function toUtcDate(value: LocalDate): Date {
  const parts = parseParts(value);
  if (parts === undefined) {
    throw new RangeError(`Invalid LocalDate: ${value}`);
  }

  const result = new Date(0);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  return result;
}

export function isLocalDate(value: unknown): value is LocalDate {
  return typeof value === 'string' && parseParts(value) !== undefined;
}

export function parseLocalDate(value: unknown): LocalDate | undefined {
  return isLocalDate(value) ? value : undefined;
}

export function localDate(value: string): LocalDate {
  const parsed = parseLocalDate(value);
  if (parsed === undefined) {
    throw new RangeError(`Invalid LocalDate: ${value}`);
  }

  return parsed;
}

export function localDateFromParts(year: number, month: number, day: number): LocalDate {
  if (![year, month, day].every(Number.isSafeInteger)) {
    throw new RangeError('LocalDate parts must be safe integers');
  }

  const value = formatParts({ year, month, day });
  return localDate(value);
}

export function getLocalDateParts(value: LocalDate): Readonly<LocalDateParts> {
  const parts = parseParts(value);
  if (parts === undefined) {
    throw new RangeError(`Invalid LocalDate: ${value}`);
  }

  return parts;
}

export function compareLocalDates(left: LocalDate, right: LocalDate): -1 | 0 | 1 {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function addDays(value: LocalDate, amount: number): LocalDate {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Day delta must be a safe integer: ${String(amount)}`);
  }

  const result = toUtcDate(value);
  result.setUTCDate(result.getUTCDate() + amount);

  const year = result.getUTCFullYear();
  if (!Number.isFinite(result.getTime()) || year < 1 || year > 9999) {
    throw new RangeError(`LocalDate arithmetic is outside 0001-01-01 through 9999-12-31`);
  }

  return localDateFromParts(year, result.getUTCMonth() + 1, result.getUTCDate());
}

export function isoWeekday(value: LocalDate): IsoWeekday {
  const sundayFirst = toUtcDate(value).getUTCDay();
  return (sundayFirst === 0 ? 7 : sundayFirst) as IsoWeekday;
}

export function isMonday(value: LocalDate): boolean {
  return isoWeekday(value) === 1;
}

export function startOfWeek(value: LocalDate): LocalDate {
  return addDays(value, 1 - isoWeekday(value));
}

export const mondayOfWeek = startOfWeek;

export function endOfWeek(value: LocalDate): LocalDate {
  return addDays(startOfWeek(value), 6);
}

export function weekDates(value: LocalDate): WeekDates {
  const monday = startOfWeek(value);
  return [
    monday,
    addDays(monday, 1),
    addDays(monday, 2),
    addDays(monday, 3),
    addDays(monday, 4),
    addDays(monday, 5),
    addDays(monday, 6),
  ];
}

export function toPresentationDate(value: LocalDate): Date {
  const result = toUtcDate(value);
  result.setUTCHours(12);
  return result;
}

export function formatLocalDate(
  value: LocalDate,
  locale: Intl.LocalesArgument = 'ru-RU',
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    toPresentationDate(value),
  );
}
