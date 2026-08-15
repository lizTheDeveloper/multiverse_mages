/*
 * Multiverse Mages — enrolment: where a cohort member becomes an individual.
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
import { FP_INT_MAX, FP_MAX, FP_ONE, RNG_STREAM, floorDiv, fromInt, nextBounded } from '@mm/sim-core';

import { SPECIES_TRAIT_REGISTRY, applySpeciesTrait } from '../traits.js';
import type { StepRng } from './rng.js';

/**
 * ## The one place a person crosses from the aggregate into the individual
 *
 * **W193 moved *when* that crossing happens, not how.** It used to happen at
 * graduation: a cohort spent `maturityMonths` in the `student` occupation and
 * `mageAptitude` decided, at the end, which fraction of it had been worth
 * teaching. It now happens at **enrolment**, and the fraction is
 * `enrolmentFraction(prevalence, mageAptitude)` — see `enrolment.ts` for why
 * those are two stages of one pipeline rather than two overlapping gates. The
 * arithmetic below is untouched, because it was never the part that was wrong.
 *
 * `docs/design/contracts.md` §1.3 is normative and blunt: *"Only mages are
 * individuals; everyone else is a counted cohort."* It calls this a
 * **performance contract, not a modelling preference**, because simulating a
 * whole population as individuals is precisely what would make Monte Carlo
 * unaffordable.
 *
 * Promotion is where that contract is most likely to be broken *by accident*,
 * because the obvious, correct-looking implementation is a Bernoulli trial per
 * student:
 *
 * ```
 * for (const student of cohort) if (draw() < aptitude) promote(student);   // NO
 * ```
 *
 * Nothing about that reads as a contract violation. It is not called
 * "simulating individuals"; it is called "rolling for each student". And it
 * costs one RNG draw per person per promotion event, over populations in the
 * tens of thousands — the exact cost §1.3 exists to forbid, arriving through a
 * mechanism nobody thinks of by that name.
 *
 * So the count is arithmetic: `floor(count × eligibleFraction / fp(1024))`, plus one
 * more if a **single** draw on stream 1 falls below the fixed-point remainder.
 * The expected value is preserved exactly, and the draw count is `O(cohorts)`
 * rather than `O(people)`.
 *
 * ## Why the remainder draw is not optional
 *
 * Plain integer truncation is simpler and needs no draw at all. It is also
 * silently biased to zero for exactly the species the vision cares about
 * distinguishing: a small cohort at a low aptitude truncates to no mages, every
 * time, forever. A species can be *rare* by design; it may not be rare because
 * of a floor.
 */

/** The outcome of enrolling from one cohort, with the arithmetic left inspectable. */
export interface PromotionOutcome {
  /** Mages to create. `integerPart`, plus one if the remainder draw succeeded. */
  readonly promoted: number;
  /**
   * Cohort members not promoted.
   *
   * **They do not stay students.** The `mage-lifecycle` spec requires that no
   * member remains in the `student` occupation past maturity; moving them is
   * the populace layer's, because occupation is a cohort field and this module
   * does not own one. Returned explicitly so that "the caller forgot" is a
   * visible omission rather than an invisible one.
   *
   * Since W193 these are the **latent-but-unactivated**: people the species
   * ceiling or the aptitude gate kept out of a seat. `magical-prevalence.md`
   * wants that gap legible — *"12,000 people, 1,200 latent, 340 found"* — and
   * this number is one half of it.
   */
  readonly notPromoted: number;
  /** `floor(count × eligibleFraction / fp(1024))`. */
  readonly integerPart: number;
  /** The fixed-point remainder the single draw was compared against, in `[0, fp(1024))`. */
  readonly remainder: Fixed;
  /** Whether that draw succeeded. */
  readonly remainderPromoted: boolean;
  /**
   * Draws taken on stream 1 by this call. Always exactly 1.
   *
   * A returned constant rather than a comment: the spec's scenario is that a
   * cohort of 10,000 makes one draw and not 10,000, and a field the test can
   * read is a claim the implementation has to keep making.
   */
  readonly draws: number;
}

/**
 * The largest cohort this arithmetic can promote at a given aptitude.
 *
 * Two ceilings bind, and the smaller wins: the count itself must survive
 * `fromInt` (`FP_INT_MAX`), and the product `count × eligibleFraction` must stay
 * inside the 32-bit fixed-point domain. At the highest aptitude the schema
 * permits, the result is still over a million people in one decade bucket of
 * one species — far above anything the carrying-capacity brake allows — and
 * refusing loudly beats overflowing into a plausible smaller number.
 */
export function maxPromotableCount(eligibleFraction: Fixed): number {
  if (!Number.isInteger(eligibleFraction) || eligibleFraction <= 0) {
    throw new RangeError(
      'eligibleFraction must be a positive fixed-point integer, received ' +
        String(eligibleFraction),
    );
  }
  return Math.min(FP_INT_MAX, floorDiv(FP_MAX, eligibleFraction));
}

/**
 * How many mages a matured student cohort yields, and the single draw that
 * decides the fraction.
 *
 * @param rng - The step's RNG, already bound to this tick.
 * @param cohort - The cohort's **entity handle**, used as the actor key. Never
 * its index in a cohort list: `contracts.md` §6 requires a stable identity, and
 * a positional key means creating one cohort re-rolls the promotions of every
 * cohort behind it — insertion invariance lost, and every committed baseline
 * with it.
 * @param count - Members of the cohort that have reached `maturityMonths`.
 * @param eligibleFraction - The fraction of them who reach a seat, in fixed
 * point. `enrolment.ts`'s `enrolmentFraction(prevalence, mageAptitude)` since
 * W193; a bare `mageAptitude` before it, which is why the parameter is named for
 * its role and not for the trait that used to fill it.
 */
export function promoteStudentCohort(
  rng: StepRng,
  cohort: EntityHandle,
  count: number,
  eligibleFraction: Fixed,
): PromotionOutcome {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`a cohort count must be a non-negative integer, received ${String(count)}`);
  }
  const limit = maxPromotableCount(eligibleFraction);
  if (count > limit) {
    throw new RangeError(
      `cohort of ${String(count)} exceeds the ${String(limit)} this arithmetic can promote at ` +
        `fraction ${String(eligibleFraction)} without leaving the fixed-point domain. A cohort ` +
        'this ' +
        'large means the carrying-capacity brake is not doing its job; splitting the cohort here ' +
        'would hide that.',
    );
  }

  // `applySpeciesTrait` rather than a bare multiply, so the direction of
  // `mageAptitude` is decided in the trait registry and nowhere else. For a
  // multiplier trait the result is `count × aptitude` exactly, i.e. the number
  // of mages expressed in fixed point — integer part and remainder both intact,
  // which a `toInt` here would have thrown away.
  const expected = applySpeciesTrait(
    SPECIES_TRAIT_REGISTRY.mageAptitude,
    fromInt(count),
    eligibleFraction,
  );
  const integerPart = floorDiv(expected, FP_ONE);
  const remainder = expected - integerPart * FP_ONE;

  // One draw. Always one, even when the remainder is zero: a call whose draw
  // count depended on the data would shift every later draw in the stream for
  // some cohorts and not others, which is the insertion-variance defect wearing
  // a different hat.
  const draw = nextBounded(rng.actorStream(RNG_STREAM.mageBirth, cohort), FP_ONE);
  const remainderPromoted = draw < remainder;
  const promoted = integerPart + (remainderPromoted ? 1 : 0);

  return {
    promoted,
    notPromoted: count - promoted,
    integerPart,
    remainder,
    remainderPromoted,
    draws: 1,
  };
}
