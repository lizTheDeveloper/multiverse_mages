/*
 * Multiverse Mages — worship: a saturating, lagged measurement of the
 * civilization, and the tiers it grants.
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
 * `contracts.md` §8 leaves the worship formula to `god-agency`. This is it.
 *
 * ## Worship is a measurement, not a stock
 *
 * It is recomputed from current state every world tick and the stored value
 * only *lags* toward what was computed. Nothing adds to it and nothing spends
 * it. That is the single most consequential anti-snowball decision in the
 * change, and it is structural rather than numeric: an accumulating worship
 * stock rewards *history*, so a god who was large in era 2 stays powerful in
 * era 5 having lost everything, and every extra tick of dominance is banked
 * permanently. That integral is precisely the runaway vision §7 warns about. A
 * measured worship rewards only current standing, so a drawdown is felt in full
 * and past dominance buys nothing.
 *
 * ## The loop is bounded by construction, in four separate places
 *
 * The §7 worship loop is the compounding loop in this design — worship buys
 * favor, favor buys interventions, interventions grow the civilization, the
 * civilization is what worship measures — so "can it run away" has to be
 * answerable without running it. Four structural bounds, in the order they
 * bite:
 *
 * 1. **Each source class saturates.** {@link sat} is bounded above by `cap` for
 *    every non-negative input, so the mage class cannot exceed `worshipMageCap`
 *    however many mages exist. Concave, so the second fifty mages are worth
 *    less than the first fifty.
 * 2. **The ceiling is the sum of the caps, not a clamp.** `worshipMax` is
 *    checked at load to equal the three caps summed, so it is a property of the
 *    formula. Nothing here calls `Math.min` on the result, and a test seeds a
 *    million of everything to prove it.
 * 3. **The inputs are themselves bounded.** Populace is bounded by carrying
 *    capacity, which `carrying-capacity.ts` derives from territory — the one
 *    economic quantity a run cannot manufacture. Mages come from the populace.
 *    Universities cost materials, which come from the populace.
 * 4. **The knowledge loop is not an input at all.** See below.
 *
 * The lag adds a fifth, softer one: because worship only ever moves a fraction
 * of the way to its target, and the target is bounded, worship is bounded by
 * the same number without any per-tick check.
 *
 * ## What worship must never read
 *
 * Not library depth, not node tiers known, not instance counts, not research
 * rate. §6a's knowledge-as-capital loop compounds on library depth and §7's
 * worship loop compounds on worship; joining them directly would produce one
 * loop with the *product* of the two gains, which is exactly the failure §6a
 * predicts. They are joined only where a deeper library eventually produces
 * more mages, and mage headcount is the most heavily saturated input here.
 *
 * `god-conformance.test.ts` asserts this module imports no knowledge component
 * and names no knowledge field, so the rule is checked rather than remembered.
 * The flavour that decoupling costs is bought back by the `worship-yield`
 * effect primitive, which multiplies favor *regeneration* through a channel
 * `contracts.md` §3 already caps at 2× — knowledge can buy favor, but only
 * through a capped door.
 */

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';

import type { GodConstants } from './constants.js';

/**
 * Hyperbolic saturation: `cap × x / (x + half)`.
 *
 * Bounded above by `cap` for every `x ≥ 0`, equal to `cap / 2` at `x = half`,
 * concave throughout, and integer-only — no square root, no logarithm, no
 * table. Those four properties are the whole reason this shape was chosen over
 * a global concave transform: a logarithm has no absolute ceiling, so
 * `worshipMax` would have to come back as an arbitrary clamp.
 *
 * ## The multiply happens before the divide, and that is not an accident
 *
 * `cap × x` first, then one floor division by `(x + half)`. Written the other
 * way — `cap × (x / (x + half))` — the inner quotient is a proper fraction that
 * floors to zero for every input below `half`, so a universe with forty-nine
 * mages would worship exactly nothing and a universe with fifty would worship
 * half the cap. That is the shipped defect class `contracts.md` §3 warns about:
 * *a `mul` chain that floored a per-tick rate to zero before the draw meant to
 * carry it*. The order here keeps the numerator at full magnitude until the one
 * division.
 *
 * The product is taken in plain integers rather than through `mul`, because
 * `mul` is fixed-point multiplication — it divides by `FP_ONE` on the way out —
 * and what is wanted here is `cap` scaled by the *ratio* `x : (x + half)`,
 * which is a division of one integer product by another. Both operands are
 * `fp`, and the ratio is dimensionless, so the result comes out in `fp`
 * directly.
 *
 * Rounds toward negative infinity through the single shared `floorDiv`, per
 * `contracts.md` §3's rounding rule.
 *
 * @param x - Raw input, `fp`, non-negative.
 * @param cap - The class ceiling, `fp`.
 * @param half - Input at which the class yields half its cap, `fp`. Positive.
 * @returns `fp`, in `[0, cap)`.
 */
export function sat(x: Fixed, cap: Fixed, half: Fixed): Fixed {
  if (x <= 0) return 0;
  if (half <= 0) {
    throw new RangeError(
      `sat() was given a half-point of ${String(half)}. The half-point is the input at which a ` +
        'class yields half its cap; at zero the function is a step, and at a negative value it ' +
        'is a division by a quantity that crosses zero.',
    );
  }
  return floorDiv(cap * x, x + half);
}

/** What worship is computed from. Counts and one flag; deliberately no knowledge. */
export interface WorshipSources {
  /** Living mages. */
  readonly mages: number;
  /** Of those, the ones currently blessed. */
  readonly blessedMages: number;
  /** Universities whose `buildProgress` has reached `fp(1024)`. */
  readonly completedUniversities: number;
  /** Populace across every cohort of every species. */
  readonly populace: number;
}

/** One class's raw input and what it saturated to. Reported per `worshipSnowball`. */
export interface WorshipClassContribution {
  readonly raw: Fixed;
  readonly saturated: Fixed;
}

/** The target, and how each class got there. */
export interface WorshipTarget {
  readonly target: Fixed;
  readonly mages: WorshipClassContribution;
  readonly universities: WorshipClassContribution;
  readonly populace: WorshipClassContribution;
}

/**
 * The worship the civilization currently justifies, before the lag and before
 * any upheaval shock.
 *
 * Per-class saturation rather than one global transform, for two reasons the
 * harness cares about. It lets a retune answer *"is the university path
 * over-rewarded?"* by moving one pair of numbers. And it keeps the classes
 * separable in the metrics — §7's `worshipSnowball` must be *attributable to a
 * source class without a second sweep*, which a single global transform makes
 * impossible because every class's contribution is folded before it is
 * measured.
 */
export function worshipTarget(
  sources: WorshipSources,
  constants: GodConstants,
): WorshipTarget {
  const blessed = Math.min(Math.max(sources.blessedMages, 0), Math.max(sources.mages, 0));
  const mageRaw =
    Math.max(sources.mages, 0) * constants.worshipMagePerHead +
    blessed * constants.worshipMageBlessedBonus;
  const universityRaw =
    Math.max(sources.completedUniversities, 0) * constants.worshipUniversityPerUnit;
  const populaceRaw = Math.max(sources.populace, 0) * constants.worshipPopulacePerHead;

  const mages = {
    raw: mageRaw,
    saturated: sat(mageRaw, constants.worshipMageCap, constants.worshipMageHalf),
  };
  const universities = {
    raw: universityRaw,
    saturated: sat(universityRaw, constants.worshipUniversityCap, constants.worshipUniversityHalf),
  };
  const populace = {
    raw: populaceRaw,
    saturated: sat(populaceRaw, constants.worshipPopulaceCap, constants.worshipPopulaceHalf),
  };

  return {
    // No clamp. The sum of three values each strictly below its own cap is
    // strictly below the sum of the caps, which is `worshipMax` by the identity
    // the content loader checks. Adding a `Math.min` here would make that
    // identity untestable, because the clamp would hide a broken one.
    target: mages.saturated + universities.saturated + populace.saturated,
    mages,
    universities,
    populace,
  };
}

/**
 * The strongest shock the content declares: the floor a *combination* is held at.
 *
 * Not `upheavalShockFloor` on its own, and that distinction is a defect this
 * function exists to keep fixed. `upheaval-shock-floor` is `fp(512)` and
 * `tradition-shock` is `fp(256)`, and the constant's own gloss says what it
 * bounds — *"the strongest a **forbidding** shock may be"*. Flooring a combined
 * factor against it silently raised a tradition change's shock to exactly the
 * magnitude of an ordinary forbidding, so the requirement that *"the worship
 * target is multiplied by `fp(256)` for 120 world ticks"* was unsatisfiable and
 * vision §4a's *"throws the civilization into upheaval"* cost the same as
 * forbidding one form.
 *
 * Taking the minimum over the declared magnitudes fixes that without loosening
 * the bound: no combination of shocks, of any kinds, in any number, can take the
 * worship target below the single most ruinous thing the content prices. So
 * upheaval remains a decade of ruin rather than an extinction event, and the
 * bound moves with a retune rather than having to be remembered.
 */
export function strongestDeclaredShock(constants: GodConstants): Fixed {
  return Math.min(constants.upheavalShockFloor, constants.traditionShock);
}

/**
 * Applies the shocks in force to a worship target.
 *
 * Shocks combine through the shared multiplicative-on-remainder arithmetic —
 * each takes its fraction of what the previous one left — rather than by
 * summing their reductions, which could take the target below zero with three
 * overlapping shocks. The product is then held at
 * {@link strongestDeclaredShock}, so overlapping shocks bite harder than one
 * shock and still cannot compound toward nothing.
 *
 * @param factors - One per shock in force, each `fp` and at or below `fp(1024)`.
 */
export function shockedTarget(
  target: Fixed,
  factors: readonly Fixed[],
  constants: GodConstants,
): Fixed {
  if (factors.length === 0) return target;
  let combined: Fixed = FP_ONE;
  for (const factor of factors) {
    // `mul` floors, which favours the shocked universe's opponent — stated
    // because §3 asks every rounding direction to be stated in terms of who it
    // favours.
    combined = mul(combined, Math.max(Math.min(factor, FP_ONE), 0));
  }
  return mul(target, Math.max(combined, strongestDeclaredShock(constants)));
}

/**
 * One tick of the asymmetric first-order lag.
 *
 * `worship' = worship + (target − worship) × LAG / fp(1024)`, with `LAG_RISE`
 * when the target is above and `LAG_FALL` when it is below.
 *
 * The asymmetry *is* the damping, and the content loader refuses a set where
 * fall does not exceed rise. A leader who loses a university or a cohort takes
 * the full hit in about five ticks and spends about twenty earning it back:
 * setbacks bite, recoveries are slow. Instantaneous recomputation was the
 * alternative and removes the lever entirely, as well as making favor
 * regeneration a step function at every birth and death.
 *
 * ## Convergence, and the one-unit shortfall a floor would have left
 *
 * `mul` floors toward negative infinity, so a *rising* gap of one unit floors
 * to zero and worship would stall one unit short of its target forever — the
 * shipped defect class where *"a floor rounded a one-unit shortfall away"*. So
 * a rising step that computes to zero while a gap remains moves one unit, and a
 * falling one likewise. The step never overshoots, because the gap is at least
 * one unit whenever the correction is applied.
 */
export function laggedWorship(
  worship: Fixed,
  target: Fixed,
  constants: GodConstants,
): Fixed {
  const gap = target - worship;
  if (gap === 0) return worship;
  const rate = gap > 0 ? constants.worshipLagRise : constants.worshipLagFall;
  const step = mul(gap, rate);
  if (step !== 0) return worship + step;
  return gap > 0 ? worship + 1 : worship - 1;
}

/**
 * The tier `worship` currently stands at: how many of the geometric thresholds
 * `base × 2^t` it meets or exceeds, for `t` in `0..count-1`.
 *
 * Geometric rather than linear because each tier has to be a real step: linear
 * thresholds over a saturating quantity would put every tier boundary in the
 * range a mid-game universe crosses in a decade, and the top two would be
 * unreachable at all.
 *
 * The tier *count* is not a tuning knob — `edictBudget = 1 + tier` and §4.1
 * sizes the observation's ruleset block on `EDICT_BUDGET_MAX` — so it is read
 * from content but changing it is a contract change, which is what the constant's
 * gloss says.
 */
export function worshipTierOf(worship: Fixed, constants: GodConstants): number {
  let tier = 0;
  let threshold = constants.worshipTierBase;
  for (let step = 0; step < constants.worshipTierCount; step += 1) {
    if (worship < threshold) break;
    tier += 1;
    threshold *= 2;
  }
  return tier;
}

/**
 * `edictBudget = 1 + worshipTier`, held below `EDICT_BUDGET_MAX`.
 *
 * The `Math.min` is not a tuning decision and is not expected to fire: with
 * five thresholds the budget reaches 6 against a pinned maximum of 8. It is
 * there because §1.1 says the budget *never* exceeds the maximum and §4.1 sizes
 * the observation vector on it — a content set that added tier thresholds would
 * otherwise write edicts into a block that has no slots for them, and the
 * symptom would be an observation silently missing a player's ruleset.
 */
export function edictBudgetFor(worshipTier: number, edictBudgetMax: number): number {
  return Math.min(1 + worshipTier, edictBudgetMax);
}

/** The favor pool's ceiling at a worship tier. */
export function favorCapFor(worshipTier: number, constants: GodConstants): Fixed {
  return constants.favorCapBase + worshipTier * constants.favorCapPerTier;
}
