/*
 * Multiverse Mages — insight is what a faculty teaches out of, and it is spent
 * teaching.
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
 * ## The sink `insight` earns its slot with
 *
 * `docs/design/economy-flow-models.md` §4: *"a resource earns its slot when it
 * has its own sink and its own scarcity regime."* Four stocks with no sink
 * would be one resource with four labels. `insight` is produced by Mentem and
 * Imaginem — §4.2's Mentem *"is the only form with no reverb at all"*, because
 * it is not happening in the world — and it is spent here, on **university
 * teaching throughput**.
 *
 * ## A drain, not a gate
 *
 * §3.3 draws the line: *"A drain **destroys** unconditionally and accumulates
 * nothing. A gate accumulates nothing either but destroys only as a side
 * effect."* The distinction is why this module returns a **share** rather than
 * a boolean. A design in which a stocked universe teaches faster and an empty
 * one teaches at the base rate is a switch wearing a policy's clothes: it reads
 * as *"insight funds teaching"* and behaves as *"insight ≥ threshold"*, and
 * nothing in the numbers would ever say which.
 *
 * So the insight actually spent is proportional to the teaching actually done,
 * and the acceleration is proportional to the insight actually spent. A
 * universe with half the insight its faculty could use buys half the
 * acceleration and is charged for half. There is no cliff anywhere on the
 * curve.
 *
 * ## The one array, and the cap it is under — `material-economy` precondition 0.4
 *
 * The subsidy is a `teach-rate` **magnitude**, appended to the array
 * `world-step.ts` already builds from the god's `blessTeachRate` and the mage's
 * own `academic.teachRate`. One array, one `stackMagnitudes`, one `fp(4096)`
 * cap. `mages-and-species/design.md` names the alternative and refuses it:
 * *"two caps on the same quantity is how a rate ends up at 4.0 × 2.0 without
 * anyone deciding it should be 8.0."*
 *
 * That is a **condition**, not a preference. `material-economy`'s design.md
 * §0.4 records the verdict that `insight` does not double-count
 * `encourage-research` — and records that it holds *only* on this wiring:
 *
 * > `encourage-research` … Its outcome is `research-rate` — the rate at which a
 * > mage *discovers* a node. `insight`'s sink is university teaching
 * > throughput, which is `teach-rate` — the rate at which a mage *transfers* a
 * > node she already holds. … If instead it were wired as its own multiplier on
 * > teaching output, or routed to `research-rate`, it *would* be the third
 * > lever on one outcome and this verdict flips.
 *
 * ## Every magnitude here is untuned
 *
 * `docs/design/release-plan.md`: no release before 0.5.0 may claim any of them
 * is balanced. Both live in `autonomy-weight.json` rather than in this file,
 * because `CLAUDE.md` puts every magnitude in validated content data and
 * because a number a sweep cannot see is a number nobody will ever move.
 */

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';

/** The two `autonomy-weight.json` scalars teaching throughput is priced in. */
export interface TeachingWeights {
  /**
   * `insight` one mage-month of teaching consumes, `fp`.
   *
   * Comparable with `casting-vellum-per-month` next door, and denominated the
   * same way for the same reason: *"is a month at the lectern dearer than a
   * month at the bench"* is unanswerable if the two are in private units.
   */
  readonly insightPerMonth: Fixed;
  /**
   * The `teach-rate` magnitude a **fully funded** teaching month adds, `fp`.
   *
   * A magnitude, not a multiplier — `contracts.md` §3 makes `teach-rate`
   * `additive-into-multiplier`, so this joins the sum inside `(1 + Σ)` and is
   * capped with everything else in it.
   */
  readonly insightTeachBonus: Fixed;
}

/** The ids {@link readTeachingWeights} requires of the weight table. */
export const REQUIRED_TEACHING_WEIGHTS = [
  'teaching-insight-per-month',
  'teaching-insight-bonus',
] as const;

/** Anything that can answer an `autonomy-weight.json` id by name. */
export interface TeachingWeightSource {
  autonomyWeight(id: string): Fixed;
}

/**
 * Reads both scalars, once.
 *
 * Eager for the reason `readApplicationWeights` is: the source throws on an id
 * the table does not declare, so a content mistake fails before a single lesson
 * has been taught rather than on whichever tick first needed the number.
 */
export function readTeachingWeights(source: TeachingWeightSource): TeachingWeights {
  return Object.freeze({
    insightPerMonth: source.autonomyWeight('teaching-insight-per-month'),
    insightTeachBonus: source.autonomyWeight('teaching-insight-bonus'),
  });
}

/**
 * What a given number of teaching mage-months would draw from the `insight`
 * stock, `fp`.
 *
 * @throws RangeError on negative mage-months, which would be teaching paying
 * *into* the stock through the consumption path — the same refusal
 * `castingDemand` and `consumeMaterials` both make, and for the same reason: a
 * negative cost is how a rounding error becomes free materials.
 */
export function teachingInsightDemand(mageMonths: Fixed, weights: TeachingWeights): Fixed {
  if (mageMonths < 0) {
    throw new RangeError(
      `teaching was asked for ${String(mageMonths)} mage-months; a negative demand would pay ` +
        'insight into the stock through the consumption path, which is not what teaching is',
    );
  }
  return mul(mageMonths, Math.max(0, weights.insightPerMonth));
}

/**
 * The share of the faculty's teaching the stock can fund this tick, `fp`.
 *
 * `FP_ONE` when the insight covers every teaching month asked for, a
 * proportional fraction when it does not, and `0` for an empty stock.
 *
 * Proportional rather than all-or-nothing, and shared rather than spent down a
 * walk, for the reason `affordableMageMonths` gives next door: *"the arbitrary
 * subset would depend on iteration order, and `contracts.md` §6 spends real
 * effort keeping iteration order out of outcomes."* Every teacher alive this
 * tick gets the same fraction of the subsidy, whatever order the roster is
 * walked in.
 */
export function fundedTeachingShare(
  mageMonths: Fixed,
  available: Fixed,
  weights: TeachingWeights,
): Fixed {
  if (mageMonths <= 0) return FP_ONE;
  if (weights.insightPerMonth <= 0) return FP_ONE;
  const owed = teachingInsightDemand(mageMonths, weights);
  if (owed <= 0) return FP_ONE;
  if (owed <= available) return FP_ONE;
  if (available <= 0) return 0;
  // Floor division: a partial share is rounded *down*, so the stock is never
  // overdrawn by rounding. The remainder stays in the stock.
  return floorDiv(Math.max(0, available) * FP_ONE, owed);
}

/**
 * The `teach-rate` magnitude this tick's funding buys, `fp`.
 *
 * Zero when the stock is empty, which is the pre-`material-economy` behaviour
 * exactly: a universe with no insight teaches at the rate its god and its
 * scholars supply, and nothing else changes. That is what makes the sink
 * additive rather than a tax.
 */
export function insightTeachingBonus(share: Fixed, weights: TeachingWeights): Fixed {
  const bounded = Math.min(FP_ONE, Math.max(0, share));
  return mul(Math.max(0, weights.insightTeachBonus), bounded);
}
