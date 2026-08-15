/*
 * Multiverse Mages — what a month of magical work costs the archive.
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
 * The `casting` claim — `substrate.md` §6's *"spell materials"*, priced.
 *
 * ## What it charges for, and what it deliberately does not
 *
 * **An act, not a holding.** The claim is on mage-months of magical *work*
 * actually spent this tick, not on the standing effects a universe gets for
 * knowing a node. Charging for holding would be an upkeep on knowledge, which
 * is `libraryUpkeep`'s job and is already paid on the shelves; it would also
 * make forgetting a node a *saving*, which is the opposite of everything §5 of
 * `vision.md` is built to say.
 *
 * Research is the act charged, and it was chosen by measurement: over the
 * 2,400-tick reference run research completes on **1,837 ticks** and costs
 * nothing material today, while teaching (1,206 lessons) and scribing (901
 * grimoires) already have costs — scribing's is literally the `scribing`
 * claimant next door. Research was the magical work that was free.
 *
 * ## Why the shortfall has teeth
 *
 * A cost nothing refuses is not a cost. When the vellum will not cover the
 * month, the mage-months that cannot be supplied **do not accrue** — the
 * banked effort stays banked and the frontier stalls until the economy can
 * carry it again. Nothing is destroyed and no run can spiral: a universe that
 * cannot pay simply does not advance that tick, and picks up where it left off.
 *
 * That is deliberately gentler than the alternative of voiding banked progress,
 * because `research.ts` already treats a zero effective rate as *"the month
 * produces nothing"* and this is the same statement made by the economy rather
 * than by the multiplier.
 */

import type { Fixed } from '@mm/sim-core';
import { floorDiv, mul } from '@mm/sim-core';

/** The weight ids this module reads, so the contract is checked both ways. */
export const REQUIRED_CASTING_WEIGHTS = ['casting-vellum-per-month'] as const;

/** Reads one authored `autonomy-weight.json` scalar. */
export interface CastingWeightSource {
  autonomyWeight(id: string): Fixed;
}

/** The authored cost of a mage-month of magical work. */
export interface CastingWeights {
  /**
   * Vellum one mage-month of magical work consumes, `fp`.
   *
   * Comparable with `MATERIALS_PER_LABORER` on purpose, for the reason
   * {@link ApplicationWeights.outputPerMonth} gives about its own unit: the
   * question *"is a month at the bench worth the month in the field it
   * displaces"* is unanswerable if the two are expressed privately.
   */
  readonly vellumPerMonth: Fixed;
}

/** Reads the casting weights from validated content. */
export function readCastingWeights(source: CastingWeightSource): CastingWeights {
  return Object.freeze({ vellumPerMonth: source.autonomyWeight('casting-vellum-per-month') });
}

/**
 * Vellum owed for a tick's magical work.
 *
 * @throws RangeError on negative mage-months, which would be work paying *into*
 * the archive — the same refusal `consumeMaterials` makes on a negative demand,
 * and for the same reason: a negative cost is how a rounding error becomes free
 * materials.
 */
export function castingDemand(mageMonths: Fixed, weights: CastingWeights): Fixed {
  if (mageMonths < 0) {
    throw new RangeError(
      `casting was asked for ${String(mageMonths)} mage-months; a negative demand would pay ` +
        'vellum into the stock through the consumption path, which is not what casting is',
    );
  }
  return mul(mageMonths, weights.vellumPerMonth);
}

/**
 * How many of the mage-months asked for the stock can actually supply.
 *
 * Returns the mage-months to *grant*, which is all of them when the vellum
 * covers the demand and a proportional share when it does not. Proportional
 * rather than all-or-nothing so that a thin month slows every researcher a
 * little instead of stopping an arbitrary subset entirely — the arbitrary
 * subset would depend on iteration order, and `contracts.md` §6 spends real
 * effort keeping iteration order out of outcomes.
 */
export function affordableMageMonths(
  mageMonths: Fixed,
  available: Fixed,
  weights: CastingWeights,
): Fixed {
  if (mageMonths <= 0) return 0;
  if (weights.vellumPerMonth <= 0) return mageMonths;
  const owed = castingDemand(mageMonths, weights);
  if (owed <= available) return mageMonths;
  if (available <= 0) return 0;
  // Floor division: a partial month is rounded *down*, so the stock is never
  // overdrawn by rounding. The remainder stays in the stock rather than being
  // granted for free.
  return floorDiv(available * mageMonths, owed);
}
