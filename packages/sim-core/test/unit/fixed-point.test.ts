/*
 * Multiverse Mages — fixed-point arithmetic unit tests.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import {
  FP_INT_MAX,
  FP_INT_MIN,
  FP_MAX,
  FP_MIN,
  FP_ONE,
  FP_SHIFT,
  div,
  fromInt,
  lerp,
  mul,
  toInt,
} from '@mm/sim-core';

describe('fixed-point scale', () => {
  it('is 1/1024, matching docs/design/contracts.md §0', () => {
    expect(FP_ONE).toBe(1024);
    expect(FP_SHIFT).toBe(10);
    expect(1 << FP_SHIFT).toBe(FP_ONE);
  });

  it('spans the signed 32-bit domain', () => {
    expect(FP_MIN).toBe(-2147483648);
    expect(FP_MAX).toBe(2147483647);
    expect(FP_INT_MIN).toBe(-2097152);
    expect(FP_INT_MAX).toBe(2097151);
  });
});

describe('fromInt / toInt', () => {
  it('round-trips every integer in the representable domain exactly', () => {
    const cases = [0, 1, -1, 2, -2, 7, -7, 1000, -1000, FP_INT_MIN, FP_INT_MAX];
    for (const n of cases) {
      expect(toInt(fromInt(n))).toBe(n);
    }
  });

  it('round-trips a dense sweep exactly', () => {
    for (let n = -5000; n <= 5000; n += 1) {
      expect(toInt(fromInt(n))).toBe(n);
    }
  });

  it('scales by FP_ONE', () => {
    expect(fromInt(1)).toBe(1024);
    expect(fromInt(-1)).toBe(-1024);
    expect(fromInt(0)).toBe(0);
  });

  it('floors toward negative infinity when truncating fractions', () => {
    expect(toInt(FP_ONE + 1)).toBe(1);
    expect(toInt(FP_ONE - 1)).toBe(0);
    expect(toInt(-1)).toBe(-1);
    expect(toInt(-FP_ONE - 1)).toBe(-2);
    expect(toInt(-FP_ONE + 1)).toBe(-1);
  });

  it('rejects integers outside the representable domain', () => {
    expect(() => fromInt(FP_INT_MAX + 1)).toThrow(RangeError);
    expect(() => fromInt(FP_INT_MIN - 1)).toThrow(RangeError);
    expect(fromInt(FP_INT_MAX)).toBe(2147482624);
    expect(fromInt(FP_INT_MIN)).toBe(FP_MIN);
  });

  it('rejects non-integer input', () => {
    expect(() => fromInt(1.5)).toThrow(RangeError);
    expect(() => toInt(1.5)).toThrow(RangeError);
  });
});

describe('mul', () => {
  it('multiplies exactly when the product is representable', () => {
    expect(mul(fromInt(3), fromInt(4))).toBe(fromInt(12));
    expect(mul(fromInt(-3), fromInt(4))).toBe(fromInt(-12));
    expect(mul(fromInt(-3), fromInt(-4))).toBe(fromInt(12));
    expect(mul(fromInt(5), FP_ONE)).toBe(fromInt(5));
    expect(mul(fromInt(5), 0)).toBe(0);
  });

  it('multiplies fractions', () => {
    const half = FP_ONE / 2;
    expect(mul(fromInt(7), half)).toBe(fromInt(7) / 2);
    expect(mul(half, half)).toBe(FP_ONE / 4);
  });

  it('rounds toward negative infinity, so negatives round away from zero', () => {
    // 1/1024 * 1/1024 = 1/1048576, which is below one unit of least precision.
    expect(mul(1, 1)).toBe(0);
    // -1/1024 * 1/1024 rounds down to the next whole unit rather than to zero.
    expect(mul(-1, 1)).toBe(-1);
    expect(mul(1, -1)).toBe(-1);
    expect(mul(-1, -1)).toBe(0);
  });

  it('is symmetric with div under floor: mul(-a, b) === -mul(a, b) - 1 when inexact', () => {
    const a = 3;
    const b = 5;
    expect(mul(a, b)).toBe(0);
    expect(mul(-a, b)).toBe(-1);
  });

  it('accepts the largest exactly representable product', () => {
    expect(mul(FP_MAX, FP_ONE)).toBe(FP_MAX);
    expect(mul(FP_MIN, FP_ONE)).toBe(FP_MIN);
  });

  it('rejects products that leave the representable domain', () => {
    expect(() => mul(FP_MAX, FP_ONE + 1)).toThrow(RangeError);
    expect(() => mul(FP_MIN, FP_ONE + 1)).toThrow(RangeError);
    expect(() => mul(FP_MAX, FP_MAX)).toThrow(RangeError);
    expect(() => mul(FP_MIN, FP_MIN)).toThrow(RangeError);
  });

  it('rejects operands outside the representable domain', () => {
    expect(() => mul(FP_MAX + 1, FP_ONE)).toThrow(RangeError);
    expect(() => mul(FP_MIN - 1, FP_ONE)).toThrow(RangeError);
    expect(() => mul(1.5, FP_ONE)).toThrow(RangeError);
  });
});

describe('div', () => {
  it('divides exactly when the quotient is representable', () => {
    expect(div(fromInt(12), fromInt(4))).toBe(fromInt(3));
    expect(div(fromInt(-12), fromInt(4))).toBe(fromInt(-3));
    expect(div(fromInt(12), fromInt(-4))).toBe(fromInt(-3));
    expect(div(fromInt(7), fromInt(2))).toBe(fromInt(7) / 2);
  });

  it('rounds toward negative infinity for a negative numerator', () => {
    // 1/3 is 341.33 units; the positive case floors down to 341 and the
    // negative case floors down to -342, one unit further from zero.
    const positive = div(fromInt(1), fromInt(3));
    const negative = div(fromInt(-1), fromInt(3));
    expect(positive).toBe(341);
    expect(negative).toBe(-342);
    expect(negative).toBe(-positive - 1);
  });

  it('rounds identically regardless of which operand carries the sign', () => {
    expect(div(fromInt(-1), fromInt(3))).toBe(div(fromInt(1), fromInt(-3)));
    expect(div(fromInt(-1), fromInt(-3))).toBe(div(fromInt(1), fromInt(3)));
  });

  it('never returns negative zero', () => {
    expect(Object.is(div(0, fromInt(-5)), 0)).toBe(true);
  });

  it('rejects division by zero', () => {
    expect(() => div(fromInt(1), 0)).toThrow(RangeError);
  });

  it('rejects quotients that leave the representable domain', () => {
    // The classic INT_MIN / -1 boundary: the exact quotient is 2^31, one past
    // the largest representable value.
    expect(() => div(FP_MIN, fromInt(-1))).toThrow(RangeError);
    expect(() => div(FP_MAX, 1)).toThrow(RangeError);
  });

  it('accepts the boundary quotient that is still representable', () => {
    expect(div(FP_MIN, fromInt(1))).toBe(FP_MIN);
    expect(div(FP_MAX, fromInt(1))).toBe(FP_MAX);
  });
});

describe('lerp', () => {
  it('returns the endpoints exactly', () => {
    const a = fromInt(10);
    const b = fromInt(30);
    expect(lerp(a, b, 0)).toBe(a);
    expect(lerp(a, b, FP_ONE)).toBe(b);
  });

  it('interpolates linearly', () => {
    const a = fromInt(10);
    const b = fromInt(30);
    expect(lerp(a, b, FP_ONE / 2)).toBe(fromInt(20));
    expect(lerp(a, b, FP_ONE / 4)).toBe(fromInt(15));
  });

  it('interpolates downward as well as upward', () => {
    expect(lerp(fromInt(30), fromInt(10), FP_ONE / 2)).toBe(fromInt(20));
  });

  it('extrapolates beyond t = 1 and below t = 0', () => {
    const a = fromInt(10);
    const b = fromInt(20);
    expect(lerp(a, b, fromInt(2))).toBe(fromInt(30));
    expect(lerp(a, b, -FP_ONE)).toBe(fromInt(0));
  });

  it('is monotone in t for an ascending interval', () => {
    const a = fromInt(-7);
    const b = fromInt(11);
    let previous = lerp(a, b, 0);
    for (let t = 1; t <= FP_ONE; t += 1) {
      const current = lerp(a, b, t);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('rejects an interval whose span is not representable', () => {
    expect(() => lerp(FP_MIN, FP_MAX, FP_ONE / 2)).toThrow(RangeError);
  });

  it('rejects a result that leaves the representable domain', () => {
    expect(() => lerp(fromInt(0), FP_MAX, fromInt(2))).toThrow(RangeError);
  });
});
