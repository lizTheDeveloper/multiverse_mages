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
 * `universe-effects.ts` already wires knowledge to the economy: a castable,
 * permitted `resource-yield` node raises what every laborer cohort produces,
 * through `stackMagnitudes` and `routeYieldByForm`. Real, and not this file.
 *
 * That channel is **ambient** — it costs the knower nothing. She contributes it
 * asleep, teaching, researching something else; the multiplier is a property of
 * *holding* the node and her month stays free. So a mage had nine goals and not
 * one was "use magic", and *"what does permitting this cell get me"* had the
 * same answer whatever anybody did with their time.
 *
 * `GOAL.applyMagic` is the missing verb and this module is its arithmetic: a
 * mage spends the month casting **one** node she holds at the world. It costs
 * her the month — no researching, teaching or scribing that tick — and costs
 * the universe her rations, food somebody else does not eat. In return the
 * universe gets materials directly, in the kinds the node's form is made of.
 *
 * The distinction to hold on to: **the ambient multiplier scales what other
 * people produce; applied work is output the mage produced herself.** Two
 * channels, and only the second is a choice she made.
 *
 * ## Unit honesty: `resource-yield` is a multiplier and is used as one
 *
 * `contracts.md` §3 gives `resource-yield` the unit
 * *"multiplier-on-materials-per-world-tick"*. Reading a magnitude as an absolute
 * quantity of grain would invent a second semantics for a primitive that has
 * one, and the two would disagree the first time stacking changed.
 *
 * So the shape is `materialsProduced`'s, next door:
 *
 *     output = outputPerMonth × months × (1 + Σ magnitudes)
 *
 * with the fold and the `fp(4096)` cap from `stackMagnitudes`, not from here,
 * and the ablation mask threaded through so §9's *"researched it, taught it,
 * paid for it and got nothing"* arm means the same on this path as on the
 * laborers'.
 *
 * `routeYieldByForm` splits the result across the three kinds, so *which*
 * material a mage makes follows the form she cast — Terram quarries, Herbam
 * feeds and papers, Mentem makes nothing. Same table `kinds.ts` routes the
 * ambient bonus through, same reason: without it, permitting *Creo Herbam* and
 * permitting *Rego Terram* would be the same move.
 *
 * ## Every magnitude here is untuned
 *
 * `docs/design/release-plan.md`: no release before 0.5.0 may claim any is
 * balanced. Both live in `autonomy-weight.json`, not here: `CLAUDE.md` puts
 * every magnitude in validated content data, and a number a sweep cannot see is
 * a number nobody moves.
 */

import type { Fixed } from '@mm/sim-core';
import { mul } from '@mm/sim-core';
import type { FormRecord, PrimitiveRecord } from '@mm/content';
import type { AblationMask, ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

import type { MaterialAmounts } from './kinds.js';
import { MATERIAL_KINDS, NO_MATERIALS, routeYieldByForm, totalAmount, zeroAmounts } from './kinds.js';

/** Mirrors `@mm/content`'s `TuningStatus` without importing a type for a constant. */
export const APPLICATION_TUNING_STATUS = 'untuned';

/** The two `autonomy-weight.json` scalars applied work is priced in. */
export interface ApplicationWeights {
  /**
   * Materials one mage-month of applied magic makes before her node's
   * multiplier, `fp`.
   *
   * Deliberately comparable with {@link MATERIALS_PER_LABORER}: the pair is the
   * only way to ask *"is an archmage in a field worth more than the peasants she
   * displaces from it"*, and a private unit on either side unanswers it.
   */
  readonly outputPerMonth: Fixed;
  /**
   * Food one applying mage eats that world tick, `fp`.
   *
   * Comparable with {@link SUBSISTENCE_PER_PERSON}, same reason. The whole of
   * *"a mage who works should be visible to `subsistenceDemand`"*: she is in no
   * `POPULACE_COHORT`, so nothing counted her before, and a producer nobody
   * feeds is a producer whose output is free.
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
 * Eager for `readTargetAppeal`'s reason: the source throws on an undeclared id,
 * so a content mistake fails before any mage has chosen anything rather than on
 * whichever tick first needed the number.
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
   * Hers alone — the one node she committed to. Not the universe's stacked
   * total: that is the *ambient* channel, and adding it here would pay the whole
   * academy's knowledge into one mage's afternoon.
   */
  readonly magnitudes: readonly Fixed[];
  readonly counters?: ClampCounters | undefined;
  readonly ablation?: AblationMask | undefined;
}

/**
 * What one mage's applied month puts into the stocks, by kind, `fp`.
 *
 * @returns {@link NO_MATERIALS} for a form whose weights are all zero —
 * `kinds.ts`' intended reading of a form whose material is not a material.
 * Shadow magic still feeds nobody, even given a month.
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
 * Added to the **subsistence** claim rather than made a fifth claimant — a
 * design decision, not a saving. `CONSUMPTION_ORDER` prices priority and there
 * is none to express here: a casting mage's dinner is a dinner. Above the
 * populace would let a universe starve its farmers to run its quarries; below
 * would make applied magic free whenever the harvest was thin, which is exactly
 * when it is not. Same rank as everybody else's meal is the only reading that
 * makes her a mouth as well as a pair of hands.
 *
 * It also puts her in `subsistenceShortfallShare` from both ends — ration in the
 * demand, harvest in the stock — which is what lets applied food move carrying
 * capacity at all.
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

/**
 * Whether a form routes anywhere at all. The fourth gate on an applicable node.
 *
 * **Every kind, not the three land yields.** This predicate decides whether a
 * mage may choose `GOAL.applyMagic` on a node at all, and while it asked only
 * about `food`, `stone` and `vellum` it answered `false` for every Mentem and
 * Limen node in the v1 opening square — the two forms that are *in* the shipped
 * opening. The faucet for `insight` and `passage` would have existed in the
 * arithmetic and been unreachable from any run, which is the failure this whole
 * change is about, one layer down.
 */
export function formRoutesToMaterials(form: FormRecord): boolean {
  const weights = zeroAmounts();
  for (const kind of MATERIAL_KINDS) weights[kind] = Math.max(0, form.yieldWeights[kind]);
  return totalAmount(weights) > 0;
}
