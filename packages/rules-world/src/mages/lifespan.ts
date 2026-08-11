/*
 * Multiverse Mages — effective lifespan: derived variance, and the capped
 * `lifespan` primitive.
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
import { fromInt, handleGeneration, handleIndex, toInt } from '@mm/sim-core';

import type { PrimitiveRecord, SpeciesRecord } from '@mm/content';

import type { ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

/**
 * ## Two quantities that must not become fields
 *
 * A mage's effective lifespan is her species' base, plus a per-individual
 * variance, plus whatever `lifespan` effects are active on her right now.
 * `docs/design/contracts.md` §3 and the `mage-lifecycle` spec are explicit that
 * **neither of the last two may be stored**, and the reasons differ:
 *
 * - **Variance** is a field per mage across thousands of mages, holding
 *   information already recoverable from the handle. It is derived from
 *   `(rootSeed, mageId, generation, birthTick)` instead, and the generation
 *   counter is what makes that safe against slot reuse — the mage who inherits
 *   a dead mage's slot inherits a different generation and therefore a
 *   different variance, rather than her predecessor's luck.
 * - **`lifespan` effects** are *additive months applied at arbitrary times*
 *   (`contracts.md` §3). A stored total would have to be rewritten every time a
 *   blessing lands or lapses, and getting that rewrite deterministic across
 *   effect ordering is harder than recomputing the sum. Recomputation is also
 *   what makes a god's blessing able to save a mage who is *already* old — the
 *   design's stated reason for a per-tick hazard over a death date.
 *
 * ## The cap goes through `@mm/primitives`, not through a `Math.min` here
 *
 * `lifespan` stacks additively and caps at `+50%` of species base
 * (`contracts.md` §3), and the cap is a `fraction-of-species-base` kind that
 * only the caller can supply a base for. Routing it through
 * {@link stackMagnitudes} is what gets the declared rule, the declared cap, and
 * the clamp *count* in one call — and the count is the point. A cap that binds
 * on every evaluation and a cap that never binds produce identical numbers;
 * only the counter distinguishes "blessings are working" from "blessings are
 * pinned at the ceiling and the trait is decoration".
 */

/**
 * The floor under an effective lifespan, in months.
 *
 * A `lifespan` effect may be negative — `contracts.md` §3 caps the primitive
 * above and deliberately not below, so a curse can shorten a life. Nothing
 * stops a large enough curse from taking the total to zero or past it, and a
 * non-positive lifespan is not a very short life: it is a division by zero
 * inside `perLifespanRate` and a `normalizedAge` that throws. One month is the
 * shortest lifespan the arithmetic can express, so it is where the floor sits.
 */
export const MIN_EFFECTIVE_LIFESPAN_MONTHS = 1;

/** Odd 32-bit constants, so no input can cancel another. Murmur3's finalizer constants. */
const MIX_A = 0x85ebca6b;
const MIX_B = 0xc2b2ae35;
const MIX_SEED = 0x9e3779b1;
const MIX_INDEX = 0x27d4eb2f;
const MIX_GENERATION = 0x165667b1;
const MIX_BIRTH = 0x2545f491;

/** Murmur3's 32-bit finalizer. Integer-only, four operations, full avalanche. */
function fmix32(value: number): number {
  let h = value >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, MIX_A) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, MIX_B) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/**
 * The deterministic hash behind a mage's lifespan variance.
 *
 * **Not a draw, and that distinction is load-bearing.** Nothing here touches an
 * RNG stream, which is why computing a mage's effective lifespan at promotion
 * does not consume a mortality draw — the `mage-lifecycle` spec requires that
 * *no* draw is made on stream 2 at promotion, and a variance implemented as a
 * stream-1 draw would have needed storing, since a stream is re-derived per
 * tick and would give a different answer next month.
 *
 * `mageId` and `generation` are mixed separately even though a handle packs
 * both, because the spec names four inputs and a reader should be able to see
 * four.
 */
function varianceHash(
  rootSeed: number,
  mage: EntityHandle,
  birthTick: number,
): number {
  let h = fmix32(Math.imul(rootSeed >>> 0, MIX_SEED) >>> 0);
  h = fmix32((h ^ Math.imul(handleIndex(mage), MIX_INDEX)) >>> 0);
  h = fmix32((h ^ Math.imul(handleGeneration(mage), MIX_GENERATION)) >>> 0);
  h = fmix32((h ^ Math.imul(birthTick | 0, MIX_BIRTH)) >>> 0);
  return h;
}

/**
 * A mage's lifespan variance in months, derived rather than stored.
 *
 * Uniform over `[−varianceMonths, +varianceMonths]` inclusive. The residual
 * modulo bias — the hash range is `2^32`, which is not a multiple of the span —
 * is below one part in ten million for every shipped species and is accepted
 * here where it would not be for a probability draw: this offset decides how
 * long one mage lives, not whether an event fires, and the rejection loop that
 * removes the bias in `nextBounded` needs a stream to draw again from, which is
 * exactly what this function must not have.
 *
 * @param varianceMonths - The species' `lifespanVarianceMonths`. Zero yields a
 * zero offset rather than dividing by one and returning a constant.
 * @throws RangeError on a negative variance, which the schema forbids and which
 * would otherwise silently invert the interval.
 */
export function lifespanVarianceOffsetMonths(
  rootSeed: number,
  mage: EntityHandle,
  birthTick: number,
  varianceMonths: number,
): number {
  if (!Number.isInteger(varianceMonths) || varianceMonths < 0) {
    throw new RangeError(
      `lifespanVarianceMonths must be a non-negative integer, received ${String(varianceMonths)}`,
    );
  }
  if (varianceMonths === 0) return 0;

  const span = varianceMonths * 2 + 1;
  return (varianceHash(rootSeed, mage, birthTick) % span) - varianceMonths;
}

/** Everything {@link effectiveLifespan} needs, and nothing it could read from state instead. */
export interface EffectiveLifespanInput {
  readonly species: SpeciesRecord;
  /** The mage's handle. Carries the generation that makes slot reuse safe. */
  readonly mage: EntityHandle;
  /** The mage's `birthTick` component field. */
  readonly birthTick: number;
  /** The universe's root seed, from the `RngSource` the step was given. */
  readonly rootSeed: number;
  /** The `lifespan` record from the content registry, carrying its stacking rule and cap. */
  readonly lifespanPrimitive: PrimitiveRecord;
  /**
   * Magnitudes of every `lifespan` effect active on this mage *now*, in fp
   * months. Recomputed by the caller at each hazard evaluation; an empty array
   * is the ordinary case.
   */
  readonly effectMagnitudes: readonly Fixed[];
  /** Where the `+50%` clamp is counted. Optional only so a unit test need not care. */
  readonly counters?: ClampCounters;
}

/** An effective lifespan, with the three terms that produced it kept separable. */
export interface EffectiveLifespan {
  /** What the hazard evaluation divides by. Always at least {@link MIN_EFFECTIVE_LIFESPAN_MONTHS}. */
  readonly months: number;
  /** The species base, unmodified. */
  readonly baseMonths: number;
  /** The derived per-mage offset. */
  readonly varianceMonths: number;
  /** Months contributed by active `lifespan` effects, after stacking and the cap. */
  readonly bonusMonths: number;
  /** True when the `+50%` cap bound. Also recorded into `counters` when one was passed. */
  readonly clamped: boolean;
  /** True when the floor bound, i.e. a curse drove the total non-positive. */
  readonly floored: boolean;
}

/**
 * A mage's effective lifespan in months, recomputed from scratch.
 *
 * Called at **every** hazard evaluation. That is not an efficiency oversight —
 * it is the mechanism by which a `lifespan` blessing lowers an old mage's
 * hazard on the very next tick, which a death date rolled at birth cannot
 * express without a special case.
 */
export function effectiveLifespan(input: EffectiveLifespanInput): EffectiveLifespan {
  const baseMonths = input.species.lifespanMonths;
  const varianceMonths = lifespanVarianceOffsetMonths(
    input.rootSeed,
    input.mage,
    input.birthTick,
    input.species.lifespanVarianceMonths,
  );

  const stacked = stackMagnitudes(input.lifespanPrimitive, input.effectMagnitudes, {
    // The cap is a fraction *of the base*, not of the varied lifespan: two mages
    // of one species may be blessed by the same amount regardless of which of
    // them drew the longer natural life.
    speciesBase: fromInt(baseMonths),
    ...(input.counters === undefined ? {} : { counters: input.counters }),
  });
  const bonusMonths = toInt(stacked.value);

  const total = baseMonths + varianceMonths + bonusMonths;
  const floored = total < MIN_EFFECTIVE_LIFESPAN_MONTHS;

  return {
    months: floored ? MIN_EFFECTIVE_LIFESPAN_MONTHS : total,
    baseMonths,
    varianceMonths,
    bonusMonths,
    clamped: stacked.clamped,
    floored,
  };
}
