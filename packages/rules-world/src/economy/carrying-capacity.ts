/*
 * Multiverse Mages — carrying capacity, and the logistic brake that keeps
 * population under it without a ceiling.
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

import type { EntityHandle, Fixed } from '@mm/sim-core';
import { FP_ONE, RNG_STREAM, floorDiv, mul, nextBounded } from '@mm/sim-core';
import type { PrimitiveRecord } from '@mm/content';
import type { ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

import type { StepRng } from '../mages/rng.js';

/**
 * ## A brake, not a ceiling
 *
 * `mages-and-species/design.md` rejects the hard cap by name: *"a hard ceiling
 * makes population a sawtooth against the cap, and every downstream rate
 * inherits the sawtooth. A logistic brake is the same bound with a continuous
 * approach, which is what the 0.4.0 'no unbounded growth' claim needs to be
 * checkable against a stated number."*
 *
 * So births scale by `clamp((K − population) × fp(1024) / K, 0, fp(1024))` and
 * nothing anywhere rejects a birth for being one too many. Population
 * approaches `K` and does not exceed it because the brake reaches zero there,
 * which is a different mechanism from refusing at the door and produces a
 * different shape in every metric derived from population.
 *
 * ## Extinction is an absorbing state and is not prevented
 *
 * A species whose cohorts are all at zero produces no births, forever. That is
 * a legitimate world outcome; the 0.4.0 claim is scenario-specific — *the
 * reference seeded scenario* loses no species over 200 world years — rather
 * than a universal impossibility, and nothing here synthesizes a founding
 * population to keep the claim true.
 *
 * ## One draw per cohort, on stream 6
 *
 * The same arithmetic as promotion and cohort mortality, for the same reason:
 * `contracts.md` §1.3 forbids per-person randomness, and a Bernoulli trial per
 * prospective parent is exactly that, arriving through a mechanism nobody
 * thinks of as "simulating individuals". Integer part plus one fractional draw
 * preserves the expected value exactly at O(cohorts).
 *
 * **Everything here is untuned** (`docs/design/release-plan.md`).
 */

/** People one unit of materials stock can carry. **Untuned.** */
export const CAPACITY_PER_MATERIAL: Fixed = 2;

/** People one completed university seat can carry, beyond materials. **Untuned.** */
export const CAPACITY_PER_UNIVERSITY_SEAT = 40;

/**
 * How far sustained subsistence shortfall can drive `K` down, in `fp`.
 *
 * `fp(512)` — a universe that cannot feed itself halves what it can hold, and
 * no further. Bounded rather than unbounded because an unbounded penalty turns
 * one bad tick into extinction, and the `economy` spec asks for a consequence
 * that is *recorded* rather than for a cliff.
 */
export const MAX_SUBSISTENCE_PENALTY: Fixed = 512;

/** What carrying capacity is derived from. */
export interface CapacityInput {
  /** The universe's materials stock, `fp`. */
  readonly materials: Fixed;
  /** Seats across **completed** universities. Unfinished ones carry nobody. */
  readonly completedCapacity: number;
  /**
   * How badly subsistence went unmet, `fp` in `[0, fp(1024)]` — the share of
   * this tick's subsistence demand that could not be paid.
   */
  readonly subsistenceShortfallShare?: Fixed | undefined;
}

/**
 * The population a universe can carry.
 *
 * @returns A headcount, not a fixed-point value: `K` is compared against a
 * population, and carrying half a person is not a thing.
 */
export function carryingCapacity(input: CapacityInput): number {
  const fromMaterials = floorDiv(Math.max(0, input.materials) * CAPACITY_PER_MATERIAL, FP_ONE);
  const fromSeats = Math.max(0, input.completedCapacity) * CAPACITY_PER_UNIVERSITY_SEAT;
  const base = fromMaterials + fromSeats;

  const share = Math.min(FP_ONE, Math.max(0, input.subsistenceShortfallShare ?? 0));
  if (share === 0) return base;

  // A shortfall of the whole demand costs MAX_SUBSISTENCE_PENALTY of K; half a
  // demand costs half of that. Linear, and stated here because the alternative
  // -- an exponent that "feels like famine" -- is a curve nobody could tune
  // against a measurement.
  const penalty = mul(share, MAX_SUBSISTENCE_PENALTY);
  return floorDiv(base * (FP_ONE - penalty), FP_ONE);
}

/**
 * The logistic brake on births, `fp` in `[0, fp(1024)]`.
 *
 * `fp(1024)` at an empty world, zero at and beyond `K`. A `K` of zero brakes
 * everything to a stop rather than dividing by it — a universe that can carry
 * nobody has no births, which is the right answer and not an error.
 */
export function fertilityBrake(population: number, capacity: number): Fixed {
  if (capacity <= 0) return 0;
  const headroom = capacity - Math.max(0, population);
  if (headroom <= 0) return 0;
  return Math.min(FP_ONE, floorDiv(headroom * FP_ONE, capacity));
}

/** What one cohort's births are computed from. */
export interface BirthInput {
  /** The cohort's member count. */
  readonly count: number;
  /** The species `fertility` trait, `fp`. */
  readonly fertility: Fixed;
  /** The `fertility` primitive record, for its stacking rule and its own cap. */
  readonly fertilityPrimitive: PrimitiveRecord;
  /** `fertility` bonuses from nodes and effects, `fp`. */
  readonly fertilityBonuses: readonly Fixed[];
  /** The logistic brake, from {@link fertilityBrake}. */
  readonly brake: Fixed;
  readonly counters?: ClampCounters | undefined;
}

/** Births per member per world tick at neutral fertility, `fp`. **Untuned.** */
export const BIRTHS_PER_MEMBER: Fixed = 4;

/**
 * Expected births for one cohort this tick, in `fp` — the value before the
 * fractional draw.
 *
 * Separated from {@link cohortBirths} so a test can assert the *expectation*
 * without a stream, which is the only way to check that the brake is monotonic
 * without averaging over draws.
 */
export function expectedBirths(input: BirthInput): Fixed {
  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new RangeError(`a cohort count must be a non-negative integer, received ${String(input.count)}`);
  }
  const multiplier = stackMagnitudes(input.fertilityPrimitive, input.fertilityBonuses, {
    ...(input.counters === undefined ? {} : { counters: input.counters }),
  }).value;

  const base = input.count * BIRTHS_PER_MEMBER;
  const withSpecies = mul(base, input.fertility);
  const withPrimitives = mul(withSpecies, multiplier);
  return mul(withPrimitives, Math.min(FP_ONE, Math.max(0, input.brake)));
}

/**
 * Births for one cohort this tick, as a headcount.
 *
 * Integer part plus **exactly one** draw on stream 6, keyed on the cohort's own
 * handle. The draw is taken whether or not the remainder is zero, so the draw
 * count is a function of the cohort count and nothing else — a conditional draw
 * would make one cohort's sequence depend on another cohort's arithmetic, which
 * is the attribution loss `contracts.md` §6 is about.
 */
export function cohortBirths(rng: StepRng, cohort: EntityHandle, input: BirthInput): number {
  const expected = expectedBirths(input);
  const whole = floorDiv(expected, FP_ONE);
  const remainder = expected - whole * FP_ONE;
  const draw = nextBounded(rng.actorStream(RNG_STREAM.populace, cohort), FP_ONE);
  return whole + (draw < remainder ? 1 : 0);
}
