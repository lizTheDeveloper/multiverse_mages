/*
 * Multiverse Mages — tests for the core's single integer-division helper.
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

import { floorDiv } from '@mm/sim-core';

describe('floorDiv', () => {
  it('divides exactly when the division is even', () => {
    expect(floorDiv(12, 4)).toBe(3);
    expect(floorDiv(-12, 4)).toBe(-3);
    expect(floorDiv(12, -4)).toBe(-3);
    expect(floorDiv(-12, -4)).toBe(3);
  });

  it('rounds toward negative infinity, not toward zero', () => {
    // Truncating division would give 3 and -3. Floor gives 3 and -4.
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(7, -2)).toBe(-4);
    expect(floorDiv(-7, -2)).toBe(3);
  });

  it('matches Math.floor of the float quotient across a swept range', () => {
    for (let numerator = -50; numerator <= 50; numerator += 1) {
      for (let denominator = -7; denominator <= 7; denominator += 1) {
        if (denominator === 0) continue;
        // `+ 0` normalises Math.floor's -0 to 0; the helper deliberately does
        // the same, and the following test pins that behaviour directly.
        expect(floorDiv(numerator, denominator)).toBe(Math.floor(numerator / denominator) + 0);
      }
    }
  });

  it('is exact well beyond the 32-bit range', () => {
    // 2^41 is the largest magnitude the fixed-point helpers feed in. Bit
    // operators would silently truncate here; this helper must not.
    expect(floorDiv(2199023255552, 1024)).toBe(2147483648);
    expect(floorDiv(-2199023255552, 1024)).toBe(-2147483648);
    expect(floorDiv(2199023255551, 1024)).toBe(2147483647);
    expect(floorDiv(-2199023255551, 1024)).toBe(-2147483648);
  });

  it('never returns negative zero', () => {
    // A -0 in simulation state is a byte-determinism hazard: it compares equal
    // to 0 but is a distinct value under Object.is and serializes differently.
    expect(Object.is(floorDiv(0, -1024), 0)).toBe(true);
    expect(Object.is(floorDiv(-1, 1024), -1)).toBe(true);
    expect(Object.is(floorDiv(-1, -1024), 0)).toBe(true);
  });

  it('rejects a zero denominator', () => {
    expect(() => floorDiv(1, 0)).toThrow(RangeError);
  });

  it('rejects non-integer and unsafe operands', () => {
    expect(() => floorDiv(1.5, 2)).toThrow(RangeError);
    expect(() => floorDiv(3, 1.5)).toThrow(RangeError);
    expect(() => floorDiv(Number.NaN, 2)).toThrow(RangeError);
    expect(() => floorDiv(Number.POSITIVE_INFINITY, 2)).toThrow(RangeError);
    expect(() => floorDiv(Number.MAX_SAFE_INTEGER + 2, 2)).toThrow(RangeError);
  });
});
