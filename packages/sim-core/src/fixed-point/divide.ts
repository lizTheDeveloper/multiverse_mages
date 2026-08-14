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

// ---------------------------------------------------------------------------
// The annihilation sentinel.
// ---------------------------------------------------------------------------

/**
 * One division that turned a non-zero numerator into exactly zero.
 *
 * Carries the operands and nothing else. Attribution — which call site, how
 * often, whether it is the same site every tick — is the consumer's job, and
 * deliberately so: the core performs no I/O and cannot afford to capture a
 * stack on a hot path.
 */
export interface FixedPointAnnihilation {
  readonly numerator: number;
  readonly denominator: number;
}

/** Called for every division whose exact result floored to zero. */
export type AnnihilationSentinel = (event: FixedPointAnnihilation) => void;

let activeAnnihilationSentinel: AnnihilationSentinel | undefined;

/**
 * Watches for the rounding step that silently deletes a quantity, and is off by
 * default.
 *
 * ## The defect it exists to find
 *
 * `installValueSentinel` in `component.ts` catches values that are not
 * integers. This catches the opposite failure: a value that is a *perfectly
 * legal* integer — zero — arrived at because this function rounded a small
 * non-zero quotient down. Nothing is corrupt, nothing throws, and the resulting
 * zero is indistinguishable from a zero that was meant.
 *
 * The project has met this failure four times and defended it by hand each
 * time. `planConstructionLabour` floored a backlog into a headcount of zero and
 * froze every building at 98% forever. `RaidState.stabilityDecayPerTick` is an
 * authored integer rather than a derived one, with a comment explaining that a
 * derived decay gives "a raid that runs forever, with no error and no symptom".
 * `laggedWorship` moves one unit when its step floors away. Each fix was a site
 * someone happened to look at.
 *
 * ## Why it lives here rather than in `mul` and `div`
 *
 * It was in `mul` and `div` first, and an adversarial reviewer pointed out that
 * this made the registry built on it claim a completeness it did not have:
 * the rules path calls `floorDiv` **directly** at eighty sites, and every one of
 * them was invisible. `materialsProduced` floors each material kind's share
 * through a bare `floorDiv`; so does the cohort transfer budget, which is zero
 * for any cohort below sixteen members.
 *
 * This function is the only `/` in the simulation core, and `mul`, `div` and
 * `toInt` all route through it. Watching it is therefore not a wider sample of
 * the floors — it is all of them.
 *
 * ## Cost, and why it may not change a result
 *
 * One comparison against `undefined` when nothing is installed, on the core's
 * hottest function. Measured: no difference outside run-to-run noise. The
 * sentinel is observation-only and must stay so — a callback that mutated state
 * would break INV-5, which requires that a run with recording enabled and one
 * without produce identical results.
 *
 * @param next - The sentinel to install, or `undefined` to remove it.
 * @returns The sentinel that was installed before, so a caller can restore it.
 */
export function installAnnihilationSentinel(
  next: AnnihilationSentinel | undefined,
): AnnihilationSentinel | undefined {
  const previous = activeAnnihilationSentinel;
  activeAnnihilationSentinel = next;
  return previous;
}

/** Whether an annihilation sentinel is currently watching. */
export function annihilationSentinelInstalled(): boolean {
  return activeAnnihilationSentinel !== undefined;
}

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
  if (activeAnnihilationSentinel !== undefined && quotient === 0 && numerator !== 0) {
    activeAnnihilationSentinel({ numerator, denominator });
  }

  return quotient === 0 ? 0 : quotient;
}
