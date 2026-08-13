/*
 * Multiverse Mages — fixed-point arithmetic for the rules path.
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

import { floorDiv } from './divide.js';

/**
 * A rules-path number: a signed 32-bit integer holding a value scaled by
 * {@link FP_ONE}, so `1024` means 1.0 and `-512` means -0.5.
 *
 * This is a documentation alias, not a branded type. Addition, subtraction, and
 * negation of two `Fixed` values are plain integer operations and stay correct
 * with `+`, `-`, and unary minus — branding would force a cast at every one of
 * them and buy nothing that the lint rules do not already enforce. Only scaling
 * operations need helpers, and those are {@link mul}, {@link div}, and
 * {@link lerp}.
 */
export type Fixed = number;

/** Bits of fraction. `FP_ONE === 1 << FP_SHIFT`. */
export const FP_SHIFT = 10;

/** The fixed-point representation of 1.0. See `docs/design/contracts.md` §0. */
export const FP_ONE: Fixed = 1024;

/** Smallest representable `Fixed` (-2^31), i.e. -2097152.0. */
export const FP_MIN: Fixed = -2147483648;

/** Largest representable `Fixed` (2^31 - 1), i.e. just under 2097152.0. */
export const FP_MAX: Fixed = 2147483647;

/** Smallest whole number `fromInt` accepts. */
export const FP_INT_MIN = -2097152;

/** Largest whole number `fromInt` accepts. */
export const FP_INT_MAX = 2097151;

function assertFixed(value: Fixed, role: string): void {
  if (!Number.isInteger(value) || value < FP_MIN || value > FP_MAX) {
    throw new RangeError(
      `${role} must be a Fixed value in [${String(FP_MIN)}, ${String(FP_MAX)}], ` +
        `received ${String(value)}`,
    );
  }
}

/**
 * Output check for the scaling helpers.
 *
 * `Number.isInteger` first, and it is not redundant with the range comparison.
 * `NaN < FP_MIN` and `NaN > FP_MAX` are *both* false, so a range-only check
 * waves NaN through as a valid `Fixed` — and a NaN written to an `i32` column
 * becomes `0`, which is indistinguishable from "this effect contributed
 * nothing". A guard that cannot fire on the failure it exists to catch is worse
 * than no guard, because it is why nobody looks here.
 *
 * `assertFixed` has always rejected NaN this way; the operand checks on `mul`,
 * `div`, and `lerp` mean no NaN can currently reach this function. That is a
 * property of today's call sites, not of this function, and it is exactly the
 * sort of property that stops holding without anyone noticing.
 */
function assertRepresentable(value: number, operation: string): Fixed {
  if (!Number.isInteger(value)) {
    throw new RangeError(
      `${operation} produced a non-integer fixed-point value: ${String(value)}. ` +
        'The rules path is integer-only; a NaN or fractional result here means an ' +
        'unguarded value reached the arithmetic.',
    );
  }
  if (value < FP_MIN || value > FP_MAX) {
    throw new RangeError(
      `${operation} overflowed the fixed-point domain: ${String(value)} is outside ` +
        `[${String(FP_MIN)}, ${String(FP_MAX)}]`,
    );
  }
  return value;
}

/**
 * Converts a whole number to fixed-point exactly.
 *
 * @throws RangeError outside `[FP_INT_MIN, FP_INT_MAX]`, where the scaled value
 * would not fit the 32-bit domain.
 */
export function fromInt(value: number): Fixed {
  if (!Number.isInteger(value) || value < FP_INT_MIN || value > FP_INT_MAX) {
    throw new RangeError(
      `fromInt expects a whole number in [${String(FP_INT_MIN)}, ${String(FP_INT_MAX)}], ` +
        `received ${String(value)}`,
    );
  }
  return value * FP_ONE;
}

/**
 * Converts fixed-point back to a whole number, discarding the fraction by
 * rounding toward negative infinity — the same direction as every other
 * division in the core, so `toInt` never disagrees with `div` about which way a
 * value went.
 *
 * `toInt(fromInt(n)) === n` exactly for every `n` in the representable domain.
 */
export function toInt(value: Fixed): number {
  assertFixed(value, 'toInt operand');
  return floorDiv(value, FP_ONE);
}

/**
 * Fixed-point multiplication: `(a * b) / FP_ONE`, floored.
 *
 * The intermediate `a * b` is computed as a double on purpose. Any product that
 * survives the range check below is at most 2^41 in magnitude, far inside the
 * exact-integer range of a double, so no precision is lost; anything larger is
 * an overflow that this function refuses rather than silently truncates.
 *
 * @throws RangeError if an operand is outside the `Fixed` domain, or if the
 * product is.
 */
export function mul(a: Fixed, b: Fixed): Fixed {
  assertFixed(a, 'mul left operand');
  assertFixed(b, 'mul right operand');

  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    // |a*b| > 2^53 implies |result| > 2^43, so this is unconditionally an
    // overflow. Rejecting it here also keeps floorDiv's "exact integer in,
    // exact integer out" contract unconditional.
    throw new RangeError(
      `mul overflowed: ${String(a)} * ${String(b)} exceeds exact integer arithmetic`,
    );
  }
  return assertRepresentable(floorDiv(product, FP_ONE), 'mul');
}

/**
 * Fixed-point division: `(a * FP_ONE) / b`, floored toward negative infinity.
 *
 * The scaled numerator is at most 2^41, so it is always exact; the single
 * rounding step is {@link floorDiv}'s.
 *
 * @throws RangeError on a zero divisor, an operand outside the `Fixed` domain,
 * or a quotient outside it — including the `FP_MIN / -1` boundary, whose exact
 * quotient is one past `FP_MAX`.
 */
export function div(a: Fixed, b: Fixed): Fixed {
  assertFixed(a, 'div numerator');
  assertFixed(b, 'div denominator');
  if (b === 0) {
    throw new RangeError('div by zero');
  }
  return assertRepresentable(floorDiv(a * FP_ONE, b), 'div');
}

/**
 * Linear interpolation: `a + (b - a) * t`, with `t` in fixed-point so that
 * `t === 0` yields `a` and `t === FP_ONE` yields `b`, both exactly. Values of
 * `t` outside `[0, FP_ONE]` extrapolate rather than clamp; clamping is a
 * caller's decision, not an arithmetic one.
 *
 * Written as `a + mul(b - a, t)` rather than `mul(a, FP_ONE - t) + mul(b, t)`
 * because only the first form is exact at both endpoints — the second rounds
 * twice and can miss `b` by a unit.
 *
 * @throws RangeError if the span `b - a`, or the result, leaves the `Fixed`
 * domain.
 */
export function lerp(a: Fixed, b: Fixed, t: Fixed): Fixed {
  assertFixed(a, 'lerp start');
  assertFixed(b, 'lerp end');
  assertFixed(t, 'lerp parameter');

  const span = b - a;
  if (span < FP_MIN || span > FP_MAX) {
    throw new RangeError(
      `lerp span overflowed the fixed-point domain: ${String(b)} - ${String(a)} = ${String(span)}`,
    );
  }
  return assertRepresentable(a + mul(span, t), 'lerp');
}
