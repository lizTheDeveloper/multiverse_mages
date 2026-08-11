/*
 * Multiverse Mages — the personality a mage is born with and never changes.
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

import type { EntityHandle, Fixed, RngStream } from '@mm/sim-core';
import { FP_ONE, RNG_STREAM, nextBounded } from '@mm/sim-core';

import type { SpeciesRecord } from '@mm/content';

import type { StepRng } from './rng.js';

/**
 * ## Why only one of the three axes is species-differentiated
 *
 * `docs/design/contracts.md` §1.2 gives every mage `curiosity`, `ambition` and
 * `caution`. §2.4 gives a *species* a mean for `curiosity` and for nothing else.
 * That asymmetry looks like an oversight in a schema and is read here as
 * deliberate, following `mages-and-species`' design note: adding `ambitionMean`
 * and `cautionMean` would be tidier and would triple the species-level
 * personality surface the balance harness has to sweep, in service of two axes
 * `vision.md` §6 says nothing about. Species differ in curiosity; individuals
 * differ in everything.
 *
 * So the means are `(species.curiosity, fp(1024), fp(1024))`, and ambition and
 * caution vary by individual around a shared centre.
 *
 * ## The deviation is bounded, symmetric, and untuned
 *
 * Bounded and symmetric so that the expected mean of a rolled axis is its
 * declared mean — which is the property the spec's "ambition and caution are
 * species-neutral" scenario actually tests, and which a one-sided or unbounded
 * deviation would quietly break.
 *
 * {@link PERSONALITY_DEVIATION} is chosen so that no shipped species can be
 * pushed outside `[0, fp(2048)]` by the roll: the most curious species sits at
 * `fp(1792)` and the least at `fp(256)`, and a deviation of `fp(256)` reaches
 * exactly the ceiling and exactly the floor without crossing either. That is
 * not an aesthetic preference — clamping is *asymmetric*, so a deviation wide
 * enough to clamp would pull the realised mean back toward the centre for
 * extreme species only, and the "expected mean is the declared mean" property
 * would hold for four species and silently fail for two.
 *
 * The magnitude is nonetheless **untuned**, like every other magnitude in this
 * change. `docs/design/release-plan.md` permits no claim that it is the right
 * spread before the balance harness exists at 0.5.0; what it claims today is
 * only that it keeps the arithmetic honest.
 */

/** Machine-readable, for the same reason species content carries one. */
export const PERSONALITY_TUNING_STATUS = 'untuned';

/** `contracts.md` §1.2 personality values clamp to `[0, fp(2048)]`. */
export const PERSONALITY_FLOOR: Fixed = 0;

/** The upper end of that interval. */
export const PERSONALITY_CEILING: Fixed = 2048;

/**
 * Half-width of the symmetric interval a rolled axis may deviate by, in fixed
 * point. See this module's opening note for why it is exactly this wide.
 */
export const PERSONALITY_DEVIATION: Fixed = 256;

/** The three axes, in the order they are drawn. */
export interface Personality {
  readonly curiosity: Fixed;
  readonly ambition: Fixed;
  readonly caution: Fixed;
}

/**
 * The means a species rolls around.
 *
 * `curiosity` comes from the species' own trait; the other two centre on
 * `fp(1024)`. `contracts.md` §2.4 also allows a species to carry an optional
 * `personality` block of explicit means, and where it does, it wins — the block
 * exists precisely so a species can say something the derived default cannot,
 * and a loader-visible field that the rules path ignores is worse than no field
 * at all. No shipped species declares one, so today this reduces to exactly
 * what the `mage-lifecycle` spec states.
 */
export function personalityMeans(species: SpeciesRecord): Personality {
  const declared = species.personality;
  return {
    curiosity: declared?.curiosity ?? species.curiosity,
    ambition: declared?.ambition ?? FP_ONE,
    caution: declared?.caution ?? FP_ONE,
  };
}

/** Clamps one axis into `[PERSONALITY_FLOOR, PERSONALITY_CEILING]`. */
function clampAxis(value: Fixed): Fixed {
  return Math.min(PERSONALITY_CEILING, Math.max(PERSONALITY_FLOOR, value));
}

/**
 * Rolls one axis: `mean + uniform(−deviation, +deviation)`, then clamped.
 *
 * The interval is inclusive at both ends — `2 × deviation + 1` outcomes — so
 * that it is genuinely symmetric about zero. A half-open interval would be
 * biased downward by half a unit on every roll of every mage in the game,
 * forever, which is small enough never to be noticed and large enough to sit
 * inside every committed baseline.
 *
 * Takes an already-positioned {@link RngStream} rather than the step's RNG, and
 * that signature is the fix for a real defect rather than a stylistic
 * preference. `actorStream` returns a *fresh cursor at the start of the stream*
 * on every call — deliberately, since it is a pure function of its coordinates
 * — so three axes each calling `actorStream` would each read the same first
 * draw and every mage in the game would be born with three identical
 * personality values. Perfectly deterministic, perfectly reproducible, and
 * wrong.
 */
function rollAxis(stream: RngStream, mean: Fixed): Fixed {
  const span = PERSONALITY_DEVIATION * 2 + 1;
  const offset = nextBounded(stream, span) - PERSONALITY_DEVIATION;
  return clampAxis(mean + offset);
}

/**
 * A newly promoted mage's personality.
 *
 * **Stream 1, keyed on the mage's handle**, per `contracts.md` §6 — mage birth
 * and personality rolls share a subsystem, and the actor key is a stable
 * identity so that promoting one mage does not re-roll another.
 *
 * Three draws are taken from one actor stream, in field order: curiosity,
 * ambition, caution. **That order is load-bearing.** The stream is a pure
 * function of its coordinates, so reordering the three assignments here does
 * not merely relabel values — it changes what every mage in every committed
 * replay was born with.
 *
 * Nothing may call this a second time for the same mage. Personality is
 * immutable after promotion (`mage-lifecycle` spec), and this function returns a
 * new record rather than mutating one, so the only way to change a mage's
 * personality is to write to her component row — which nothing in this package
 * does outside promotion.
 */
export function rollPersonality(
  rng: StepRng,
  mage: EntityHandle,
  species: SpeciesRecord,
): Personality {
  const means = personalityMeans(species);
  const stream = rng.actorStream(RNG_STREAM.mageBirth, mage);
  // Drawn into locals in declaration order rather than inline in the object
  // literal: property evaluation order in an object literal is well defined,
  // but it is not the kind of well-defined a reader checks, and getting it
  // wrong here would silently permute what every mage was born with.
  const curiosity = rollAxis(stream, means.curiosity);
  const ambition = rollAxis(stream, means.ambition);
  const caution = rollAxis(stream, means.caution);
  return { curiosity, ambition, caution };
}
