/*
 * Multiverse Mages — the simulation core's one and only division.
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

/**
 * ## Why this module exists at all
 *
 * The rules path is float-free (`docs/design/contracts.md` §0), and ESLint
 * mechanically enforces that: `Math.floor`, `Math.trunc`, `Math.round`, and
 * every other floating-point member of `Math` are banned inside
 * `packages/sim-core/src`, as are non-integer numeric literals. What the lint
 * config deliberately does *not* ban is the binary `/` operator, because
 * integer division has to happen somewhere and a banned operator cannot be
 * escaped from.
 *
 * This file is that somewhere. It contains **the only `/` in the simulation
 * core**, in exactly one expression, in exactly one function. Fixed-point
 * `mul`, `div`, `toInt`, and `lerp` all route through {@link floorDiv}; the
 * PRNG needs no division at all (it uses shift and remainder, both exact on
 * integers). Keeping the module this small is the point: the whole surface a
 * reviewer has to trust for rounding behaviour is fifteen lines, and any future
 * `/` elsewhere in the core is a diff that stands out.
 *
 * ## Why floor rather than truncate
 *
 * `/` in JavaScript is floating-point division and `(a / b) | 0` truncates
 * toward zero *and* silently wraps above 2^31. Truncation is the wrong default
 * for a rules path: it makes the rounding of a value depend on its sign, so a
 * damage formula behaves differently for a negative modifier than a positive
 * one, and the asymmetry only ever surfaces as a balance mystery. Rounding
 * toward negative infinity is uniform — `floorDiv(n, d)` is the mathematical
 * floor for every sign combination — which is what the spec requires of
 * "a single shared helper so that rounding behaviour is uniform".
 *
 * ## Why the result is exact
 *
 * `n % d` on integers is exact in IEEE-754 (the remainder is representable
 * whenever the operands are). Subtracting it leaves a value that is an exact
 * multiple of `d`, so the subsequent `/` produces an integer that is exactly
 * representable, and IEEE-754 division is correctly rounded — meaning it
 * returns that integer with no error at all. No rounding mode, no platform
 * variance, no accumulated drift.
 */

/** Guards the inputs so the exactness argument above actually holds. */
function assertSafeInteger(value: number, role: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `floorDiv ${role} must be a safe integer, received ${String(value)}. ` +
        'The rules path is integer-only; convert with the fixed-point helpers.',
    );
  }
}

/**
 * Integer division rounding toward negative infinity.
 *
 * `floorDiv(7, 2) === 3`, `floorDiv(-7, 2) === -4`, `floorDiv(7, -2) === -4`,
 * `floorDiv(-7, -2) === 3`.
 *
 * @param numerator - Any safe integer.
 * @param denominator - Any non-zero safe integer.
 * @returns The largest integer not greater than `numerator / denominator`.
 * @throws RangeError if either operand is not a safe integer, if the
 * denominator is zero, or if the intermediate `numerator - remainder` would
 * leave the safe-integer range (which would make the result unverifiable).
 */
export function floorDiv(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, 'numerator');
  assertSafeInteger(denominator, 'denominator');
  if (denominator === 0) {
    throw new RangeError('floorDiv by zero');
  }

  // Shift the remainder so it carries the sign of the denominator. Once
  // `0 <= remainder/denominator < 1`, `numerator - remainder` is the largest
  // exact multiple of the denominator at or below the numerator, so the
  // quotient below is the floor rather than the truncation.
  let remainder = numerator % denominator;
  if (remainder !== 0 && remainder < 0 !== denominator < 0) {
    remainder += denominator;
  }

  const shifted = numerator - remainder;
  assertSafeInteger(shifted, 'numerator less its remainder');

  // ---- The only division operator in the simulation core. ----
  // Exact by construction: `shifted` is an integer multiple of `denominator`.
  const quotient = shifted / denominator;

  // Normalise -0 to 0. They compare equal under `===` but not under
  // `Object.is`, and a -0 that reaches a snapshot is a byte-determinism hazard
  // for no benefit whatsoever.
  return quotient === 0 ? 0 : quotient;
}
