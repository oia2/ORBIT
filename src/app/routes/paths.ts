import type { ApplicationClock } from '../../shared/lib/local-date/clock';
import {
  parseLocalDate,
  startOfWeek,
  type LocalDate,
} from '../../shared/lib/local-date/local-date';

export const ROOT_PATH = '/' as const;
export const BACKLOG_PATH = '/backlog' as const;
export const HISTORY_PATH = '/history' as const;

export type WeekPath = `/week/${LocalDate}`;
export type DayPath = `/day/${LocalDate}`;

export function buildWeekPath(date: LocalDate): WeekPath {
  return `/week/${startOfWeek(date)}`;
}

export const weekPath = buildWeekPath;

export function buildDayPath(date: LocalDate): DayPath {
  return `/day/${date}`;
}

export const dayPath = buildDayPath;

export function parseDayRouteDate(value: string): LocalDate | undefined {
  return parseLocalDate(value);
}

export function canonicalWeekStart(value: string): LocalDate | undefined {
  const date = parseLocalDate(value);
  return date === undefined ? undefined : startOfWeek(date);
}

export function currentWeekPath(clock: ApplicationClock): WeekPath {
  return buildWeekPath(clock.currentLocalDate());
}

export function resolveRootPath(clock: ApplicationClock): WeekPath {
  return currentWeekPath(clock);
}
