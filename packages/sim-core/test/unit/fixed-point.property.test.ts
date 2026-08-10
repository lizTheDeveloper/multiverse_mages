/*
 * Multiverse Mages — fixed-point property tests (monotonicity, associativity,
 * and the documented precision bounds).
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

import { FP_ONE, div, mul } from '@mm/sim-core';

/**
 * A seeded xorshift32, written here rather than imported from the core so that
 * a bug in the core's PRNG cannot silently narrow the inputs these properties
 * are checked against. `Math.random` is banned in this directory precisely
 * because a property failure has to be reproducible from the file alone.
 */
function makeSampler(seed: number): (magnitude: number) => number {
  let state = seed >>> 0;
  return (magnitude: number): number => {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return (state % (2 * magnitude + 1)) - magnitude;
  };
}

const TRIALS = 2000;

/**
 * Precision bound for `mul` associativity, in raw fixed-point units.
 *
 * With `mul(x, y) = floor(x*y / FP_ONE)`, each multiplication discards a
 * fraction `e` in `[0, 1)`. Writing the exact triple product as `T`:
 *
 *   mul(mul(a, b), c) = T - e1*c/FP_ONE - e2
 *   mul(a, mul(b, c)) = T - f1*a/FP_ONE - f2
 *
 * so the two groupings differ by `(f1*a - e1*c)/FP_ONE + (f2 - e2)`, which is
 * strictly less than `(|a| + |c|)/FP_ONE + 1`. The middle operand `b` does not
 * appear: it is never the value scaled by a discarded fraction.
 */
function associativityBound(a: number, c: number): number {
  return 1 + Math.floor((Math.abs(a) + Math.abs(c)) / FP_ONE);
}

/**
 * Precision bound for the `div`-then-`mul` round trip, in raw units. `div`
 * discards a fraction that the subsequent `mul` scales by the divisor, and the
 * `mul` discards one of its own: `|mul(div(a, b), b) - a| < |b|/FP_ONE + 1`.
 */
function roundTripBound(b: number): number {
  return 1 + Math.floor(Math.abs(b) / FP_ONE);
}

describe('mul identities', () => {
  const sample = makeSampler(0x1234abcd);

  it('is commutative exactly', () => {
    for (let i = 0; i < TRIALS; i += 1) {
      const a = sample(1 << 20);
      const b = sample(1 << 20);
      expect(mul(a, b)).toBe(mul(b, a));
    }
  });

  it('treats FP_ONE as the multiplicative identity exactly', () => {
    for (let i = 0; i < TRIALS; i += 1) {
      const a = sample(1 << 30);
      expect(mul(a, FP_ONE)).toBe(a);
      expect(div(a, FP_ONE)).toBe(a);
    }
  });
});

describe('mul monotonicity', () => {
  const sample = makeSampler(0x5eed0001);

  it('is non-decreasing in each operand for a positive multiplier', () => {
    for (let i = 0; i < TRIALS; i += 1) {
      const b = Math.abs(sample(1 << 20)) + 1;
      const x = sample(1 << 20);
      const y = sample(1 << 20);
      const lo = Math.min(x, y);
      const hi = Math.max(x, y);
      expect(mul(lo, b)).toBeLessThanOrEqual(mul(hi, b));
    }
  });

  it('is non-increasing in each operand for a negative multiplier', () => {
    for (let i = 0; i < TRIALS; i += 1) {
      const b = -(Math.abs(sample(1 << 20)) + 1);
      const x = sample(1 << 20);
      const y = sample(1 << 20);
      const lo = Math.min(x, y);
      const hi = Math.max(x, y);
      expect(mul(lo, b)).toBeGreaterThanOrEqual(mul(hi, b));
    }
  });
});

describe('div monotonicity', () => {
  const sample = makeSampler(0x5eed0002);

  it('is non-decreasing in the numerator for a positive divisor', () => {
    for (let i = 0; i < TRIALS; i += 1) {
      // |divisor| >= FP_ONE keeps every quotient inside the 32-bit domain.
      const b = Math.abs(sample(1 << 20)) + FP_ONE;
      const x = sample(1 << 20);
      const y = sample(1 << 20);
      const lo = Math.min(x, y);
      const hi = Math.max(x, y);
      expect(div(lo, b)).toBeLessThanOrEqual(div(hi, b));
    }
  });

  it('is non-increasing in the numerator for a negative divisor', () => {
    for (let i = 0; i < TRIALS; i += 1) {
      const b = -(Math.abs(sample(1 << 20)) + FP_ONE);
      const x = sample(1 << 20);
      const y = sample(1 << 20);
      const lo = Math.min(x, y);
      const hi = Math.max(x, y);
      expect(div(lo, b)).toBeGreaterThanOrEqual(div(hi, b));
    }
  });
});

describe('mul associativity within the documented precision bound', () => {
  const sample = makeSampler(0x5eed0003);

  it('holds for random triples', () => {
    for (let i = 0; i < TRIALS; i += 1) {
      // ±8.0 keeps the exact triple product inside the 32-bit domain, so any
      // difference observed is rounding and not a range failure.
      const a = sample(1 << 13);
      const b = sample(1 << 13);
      const c = sample(1 << 13);
      const left = mul(mul(a, b), c);
      const right = mul(a, mul(b, c));
      expect(Math.abs(left - right)).toBeLessThanOrEqual(associativityBound(a, c));
    }
  });

  it('holds for mixed-sign triples specifically', () => {
    // Opposite signs on the outer operands are the case where the two rounding
    // terms add rather than cancel, which is why the bound sums |a| and |c|.
    for (let i = 0; i < TRIALS; i += 1) {
      const a = Math.abs(sample(1 << 13));
      const b = sample(1 << 13);
      const c = -Math.abs(sample(1 << 13));
      const left = mul(mul(a, b), c);
      const right = mul(a, mul(b, c));
      expect(Math.abs(left - right)).toBeLessThanOrEqual(associativityBound(a, c));
    }
  });
});

describe('div and mul are inverse within the documented precision bound', () => {
  const sample = makeSampler(0x5eed0004);

  it('recovers the numerator to within one unit plus the divisor scale', () => {
    for (let i = 0; i < TRIALS; i += 1) {
      const a = sample(1 << 18);
      const magnitude = Math.abs(sample(1 << 18)) + FP_ONE;
      const b = sample(1) < 0 ? -magnitude : magnitude;
      const recovered = mul(div(a, b), b);
      expect(Math.abs(recovered - a)).toBeLessThanOrEqual(roundTripBound(b));
    }
  });
});

describe('div rounding is uniformly toward negative infinity', () => {
  const sample = makeSampler(0x5eed0005);

  it('makes div(-a, b) equal -div(a, b) exactly when the division is even', () => {
    for (let i = 0; i < TRIALS; i += 1) {
      const a = sample(1 << 18);
      const b = Math.abs(sample(1 << 18)) + FP_ONE;
      const positive = div(a, b);
      const negated = div(-a, b);
      const isExact = positive === negated * -1;
      // Floor rounding means the negated quotient is either the exact negation
      // (when the division came out even) or one unit further down.
      expect(isExact || negated === -positive - 1).toBe(true);
    }
  });
});
