/*
 * Multiverse Mages — what a mage makes when she spends her month casting at the
 * world, and what she eats while she does it.
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
 * ## Holding a node and working one were the same thing, and that was the bug
 *
 * `universe-effects.ts` already runs the wire from knowledge to the economy: a
 * castable, permitted `resource-yield` node raises what every laborer cohort
 * produces, through `stackMagnitudes` and `routeYieldByForm`. That is real and
 * it is not what this file is.
 *
 * What it is, is **ambient**. It costs the mage who knows the node nothing. She
 * contributes it while asleep, while teaching, while researching something
 * else; the multiplier is a property of her *holding* the node and her month is
 * free to spend elsewhere. So a mage had nine goals and not one of them was
 * "use magic" — she could hold a node and could never work one — and the
 * question *"what does permitting this cell get me"* had the same answer
 * whatever anybody did with their time.
 *
 * `GOAL.applyMagic` is the missing verb, and this module is its arithmetic. A
 * mage spends the month casting **one** node she holds at the world. It costs
 * her the month — she is not researching, teaching or scribing that tick — and
 * it costs the universe her rations, which are food somebody else does not eat.
 * In return the universe gets materials directly, in the kinds the node's form
 * is made of.
 *
 * The distinction a reader should hold on to: **the ambient multiplier scales
 * what other people produce; applied work is output the mage produced herself.**
 * Two mechanisms, two channels, and only the second is a choice she made.
 *
 * ## Unit honesty: `resource-yield` is a multiplier and is used as one
 *
 * `contracts.md` §3 gives `resource-yield` the unit
 * *"multiplier-on-materials-per-world-tick"*. Reading a node's magnitude as an
 * absolute quantity of grain would be this module inventing a second semantics
 * for a primitive that already has one, and the two would disagree the first
 * time stacking changed.
 *
 * So the shape is the same one `materialsProduced` uses next door:
 *
 *     output = outputPerMonth × months × (1 + Σ magnitudes)
 *
 * with the fold and the `fp(4096)` cap coming from `stackMagnitudes` rather
 * than from anything here, and the ablation mask threaded through it so that
 * §9's *"researched it, taught it, paid for it and got nothing"* arm means the
 * same thing on this path as on the laborers'.
 *
 * `routeYieldByForm` then splits the result across the three kinds, so *which*
 * material a mage makes is decided by the form of the node she cast — Terram
 * quarries, Herbam feeds and papers, Mentem makes nothing at all. That is the
 * same table `kinds.ts` routes the ambient bonus through, for the same reason:
 * without it, permitting *Creo Herbam* and permitting *Rego Terram* would be
 * the same move.
 *
 * ## Every magnitude here is untuned
 *
 * `docs/design/release-plan.md`: no release before 0.5.0 may claim any of them
 * is balanced. Both live in `autonomy-weight.json` rather than in this file,
 * because `CLAUDE.md` puts every magnitude in validated content data and
 * because a number a sweep cannot see is a number nobody will ever move.
 */

import type { Fixed } from '@mm/sim-core';
import { mul } from '@mm/sim-core';
import type { FormRecord, PrimitiveRecord } from '@mm/content';
import type { AblationMask, ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

import type { MaterialAmounts } from './kinds.js';
import { NO_MATERIALS, routeYieldByForm, totalAmount } from './kinds.js';

/** Mirrors `@mm/content`'s `TuningStatus` without importing a type for a constant. */
export const APPLICATION_TUNING_STATUS = 'untuned';

/** The two `autonomy-weight.json` scalars applied work is priced in. */
export interface ApplicationWeights {
  /**
   * Materials one mage-month of applied magic makes before her node's
   * multiplier, `fp`.
   *
   * Comparable with {@link MATERIALS_PER_LABORER}, and deliberately so: the two
   * numbers are the only way to ask *"is an archmage in a field worth more than
   * the peasants she displaces from it"*, and they are unanswerable if one of
   * them is expressed in a private unit.
   */
  readonly outputPerMonth: Fixed;
  /**
   * Food one applying mage eats that world tick, `fp`.
   *
   * Comparable with {@link SUBSISTENCE_PER_PERSON} for the same reason. This is
   * the whole of *"a mage who works should be visible to `subsistenceDemand`"*:
   * she is not in a `POPULACE_COHORT`, so nothing counted her before, and a
   * producer nobody feeds is a producer whose output is free.
   */
  readonly rationPerMonth: Fixed;
}

/** The ids {@link readApplicationWeights} requires of the weight table. */
export const REQUIRED_APPLICATION_WEIGHTS = [
  'apply-output-per-month',
  'apply-ration-per-month',
] as const;

/** Anything that can answer an `autonomy-weight.json` id by name. */
export interface ApplicationWeightSource {
  autonomyWeight(id: string): number;
}

/**
 * Reads both scalars, once.
 *
 * Eager for the reason `readTargetAppeal` is: the source throws on an id the
 * table does not declare, so a content mistake fails before a single mage has
 * chosen anything rather than on whichever tick first needed the number.
 */
export function readApplicationWeights(source: ApplicationWeightSource): ApplicationWeights {
  return Object.freeze({
    outputPerMonth: source.autonomyWeight('apply-output-per-month'),
    rationPerMonth: source.autonomyWeight('apply-ration-per-month'),
  });
}

/** One mage's month of applied magic, as the arithmetic sees it. */
export interface ApplicationInput {
  readonly weights: ApplicationWeights;
  /** Mage-months spent this tick, `fp`. `MAGE_MONTHS_PER_TICK` for a full month. */
  readonly months: Fixed;
  /** The form of the node she cast. Decides which kinds her output lands in. */
  readonly form: FormRecord;
  /** The `resource-yield` primitive record, for its stacking rule and its cap. */
  readonly resourceYield: PrimitiveRecord;
  /**
   * The node's authored `resource-yield` magnitudes, `fp`.
   *
   * Hers alone — one node, the one she committed to. Not the universe's stacked
   * total: that is the *ambient* channel, and adding it here would pay the
   * whole academy's knowledge into one mage's afternoon.
   */
  readonly magnitudes: readonly Fixed[];
  readonly counters?: ClampCounters | undefined;
  readonly ablation?: AblationMask | undefined;
}

/**
 * What one mage's applied month puts into the stocks, by kind, `fp`.
 *
 * @returns Nothing at all — {@link NO_MATERIALS} — for a form whose weights are
 * all zero, which is `kinds.ts`' intended reading of a form whose material is
 * not a material. Shadow magic still feeds nobody, even when somebody spends a
 * month on it.
 */
export function appliedYield(input: ApplicationInput): MaterialAmounts {
  const months = Math.max(0, input.months);
  if (months === 0) return NO_MATERIALS;
  const multiplier = stackMagnitudes(input.resourceYield, input.magnitudes, {
    ...(input.counters === undefined ? {} : { counters: input.counters }),
    ...(input.ablation === undefined ? {} : { ablation: input.ablation }),
  }).value;
  const output = mul(mul(Math.max(0, input.weights.outputPerMonth), months), multiplier);
  return routeYieldByForm(input.form, output);
}

/**
 * What the universe owes in food for the mages who applied magic this tick.
 *
 * Added to the **subsistence** claim rather than made a fifth claimant, and the
 * choice is a design decision rather than a saving. `CONSUMPTION_ORDER` prices
 * priority, and there is no priority to express here: a casting mage's dinner is
 * a dinner. Ranking it above the populace would let a universe starve its
 * farmers to run its quarries; ranking it below would make applied magic free
 * whenever the harvest was thin, which is precisely when it is not. Paid at the
 * same rank as everybody else's meal is the only reading that makes an applying
 * mage a mouth as well as a pair of hands.
 *
 * It also means she reaches `subsistenceShortfallShare` from both ends — her
 * ration is in the demand and her harvest is in the stock — which is what makes
 * applied food a channel that can move carrying capacity at all.
 *
 * @throws RangeError on a negative or fractional count, which would be a
 * rounding error becoming free food.
 */
export function applicationRations(applyingMages: number, weights: ApplicationWeights): Fixed {
  if (!Number.isInteger(applyingMages) || applyingMages < 0) {
    throw new RangeError(
      `applyingMages must be a non-negative integer, received ${String(applyingMages)}`,
    );
  }
  return applyingMages * Math.max(0, weights.rationPerMonth);
}

/** Whether a form routes anywhere at all. The fourth gate on an applicable node. */
export function formRoutesToMaterials(form: FormRecord): boolean {
  return totalAmount({
    food: Math.max(0, form.yieldWeights.food),
    stone: Math.max(0, form.yieldWeights.stone),
    vellum: Math.max(0, form.yieldWeights.vellum),
  }) > 0;
}
