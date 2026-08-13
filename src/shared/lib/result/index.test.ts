import { describe, expect, it, vi } from 'vitest';

import {
  andThen,
  assertNever,
  err,
  isErr,
  isOk,
  mapError,
  mapResult,
  matchResult,
  ok,
  unwrapOr,
  type Result,
} from './index';

describe('Result helpers', () => {
  it('constructs and narrows success and failure values', () => {
    const success: Result<number, string> = ok(2);
    const failure: Result<number, string> = err('failed');

    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(isOk(failure)).toBe(false);
    expect(isErr(failure)).toBe(true);

    if (isOk(success)) {
      expect(success.value).toBe(2);
    }
    if (isErr(failure)) {
      expect(failure.error).toBe('failed');
    }
  });

  it('maps only the active branch', () => {
    const successMapper = vi.fn((value: number) => value * 2);
    const errorMapper = vi.fn((error: string) => error.length);

    expect(mapResult(ok(3), successMapper)).toEqual(ok(6));
    expect(mapResult(err('no'), successMapper)).toEqual(err('no'));
    expect(mapError(ok(3), errorMapper)).toEqual(ok(3));
    expect(mapError(err('no'), errorMapper)).toEqual(err(2));
    expect(successMapper).toHaveBeenCalledTimes(1);
    expect(errorMapper).toHaveBeenCalledTimes(1);
  });

  it('chains successful work and preserves the first error', () => {
    expect(andThen(ok(4), (value) => ok(value / 2))).toEqual(ok(2));
    expect(andThen(ok(4), () => err('second'))).toEqual(err('second'));
    expect(andThen(err('first'), () => ok(2))).toEqual(err('first'));
  });

  it('matches exactly one branch and supports a fallback value', () => {
    expect(
      matchResult(ok(4), {
        ok: (value) => `value:${String(value)}`,
        err: (error: string) => `error:${error}`,
      }),
    ).toBe('value:4');
    expect(
      matchResult(err('no'), {
        ok: (value: number) => `value:${String(value)}`,
        err: (error) => `error:${error}`,
      }),
    ).toBe('error:no');
    expect(unwrapOr(ok(4), 0)).toBe(4);
    expect(unwrapOr(err('no'), 0)).toBe(0);
  });
});

describe('exhaustive matching', () => {
  it('throws with context if an impossible runtime value reaches assertNever', () => {
    expect(() => assertNever('unexpected' as never, 'Unhandled outcome')).toThrow(
      'Unhandled outcome: unexpected',
    );
  });
});
