import {
  createFixedClock,
  parseInstant,
  type ApplicationClock,
} from '@/shared/lib/local-date/clock';
import { parseLocalDate } from '@/shared/lib/local-date/local-date';

export const LOCAL_DATE_HEADER = 'x-orbit-local-date';
export const INSTANT_HEADER = 'x-orbit-instant';

export type RequestHeaders = Readonly<Record<string, string | readonly string[] | undefined>>;

export type RequestClockResult =
  | { readonly ok: true; readonly clock: ApplicationClock }
  | { readonly ok: false; readonly message: string };

function headerValue(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] as string | undefined;
  return undefined;
}

/**
 * Rebuilds feature 001's clock from the caller's complete reading.
 *
 * The server has no clock of its own: it never calls `createSystemClock`,
 * `Date.now()`, `new Date()`, or reads its timezone. A missing or malformed
 * header is a `400` — there is no fallback to server time, because that
 * fallback is exactly what FR-009 prohibits. Both halves travel together
 * because a clock whose halves can disagree is a time model feature 001 does
 * not have.
 */
export function readRequestClock(headers: RequestHeaders): RequestClockResult {
  const rawDate = headerValue(headers, LOCAL_DATE_HEADER);
  const rawInstant = headerValue(headers, INSTANT_HEADER);

  if (rawDate === undefined || rawInstant === undefined) {
    const missing = [
      ...(rawDate === undefined ? ['X-Orbit-Local-Date'] : []),
      ...(rawInstant === undefined ? ['X-Orbit-Instant'] : []),
    ];
    return { ok: false, message: `Missing required clock header(s): ${missing.join(', ')}.` };
  }

  const currentLocalDate = parseLocalDate(rawDate);
  if (currentLocalDate === undefined) {
    return { ok: false, message: `X-Orbit-Local-Date must be YYYY-MM-DD; received "${rawDate}".` };
  }

  const instantValue = parseInstant(rawInstant);
  if (instantValue === undefined) {
    return {
      ok: false,
      message: `X-Orbit-Instant must be a canonical UTC instant (YYYY-MM-DDTHH:MM:SS.sssZ); received "${rawInstant}".`,
    };
  }

  return { ok: true, clock: createFixedClock({ instant: instantValue, currentLocalDate }) };
}
