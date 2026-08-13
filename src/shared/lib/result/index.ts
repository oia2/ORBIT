export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function mapResult<T, E, U>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
  return isOk(result) ? ok(transform(result.value)) : result;
}

export function mapError<T, E, F>(result: Result<T, E>, transform: (error: E) => F): Result<T, F> {
  return isErr(result) ? err(transform(result.error)) : result;
}

export function andThen<T, E, U, F>(
  result: Result<T, E>,
  transform: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return isOk(result) ? transform(result.value) : result;
}

export interface ResultMatcher<T, E, U, V = U> {
  readonly ok: (value: T) => U;
  readonly err: (error: E) => V;
}

export function matchResult<T, E, U, V = U>(
  result: Result<T, E>,
  matcher: ResultMatcher<T, E, U, V>,
): U | V {
  return isOk(result) ? matcher.ok(result.value) : matcher.err(result.error);
}

export function unwrapOr<T, E, U>(result: Result<T, E>, fallback: U): T | U {
  return isOk(result) ? result.value : fallback;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }

  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

function describeUnexpectedValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function assertNever(value: never, context = 'Unhandled value'): never {
  throw new Error(`${context}: ${describeUnexpectedValue(value)}`);
}

export const exhaustive = assertNever;
