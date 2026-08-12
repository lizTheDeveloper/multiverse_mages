/*
 * Multiverse Mages — materials: three kinds, made by labour on differing land,
 * spent in a fixed order, never negative.
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

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';
import type { PrimitiveRecord } from '@mm/content';
import type { ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

import type { MaterialAmounts, MaterialKind } from './kinds.js';
import { MATERIAL_KINDS, zeroAmounts } from './kinds.js';

/**
 * ## Three stocks, four claimants, and an order that is still a decision
 *
 * The `economy` spec requires materials to be *"met in a documented
 * deterministic priority order"* and the stock never to go negative. Both halves
 * live here, and neither construction nor scribing nor library upkeep writes a
 * stock itself — each returns what it *would* spend and this module decides who
 * is paid. Four writers with four opinions about the order is the negative-stock
 * defect written as an architecture, and that is now true **per kind**.
 *
 * ## What changed, and what the order is still for
 *
 * There used to be one stock. `kinds.ts` says at length why there are three;
 * the consequence here is that each claimant is denominated in the kind it
 * actually spends:
 *
 * | Claimant | Paid in | Because |
 * | --- | --- | --- |
 * | subsistence | `food` | people eat food |
 * | library upkeep | `vellum` | a shelf is kept in parchment |
 * | scribing | `vellum` | §6a: *"so does every grimoire"* |
 * | construction | `stone` | §4: *"Rego Terram letting universities go up faster"* |
 *
 * {@link CONSUMPTION_ORDER} is unchanged and still walked in full. A reviewer
 * should know exactly how much of it survives: **only the vellum pair still
 * competes.** Library upkeep is paid before scribing out of the same stock, and
 * that ordering is the one this module still adjudicates — knowledge already
 * held before knowledge not yet written, because `contracts.md` §1.5 makes
 * losing an instance permanent in a way a delayed grimoire is not. Subsistence
 * and construction no longer contend with anything, and that is the point rather
 * than a loss: a universe can no longer starve its people to finish a building,
 * because a building is not made of food.
 *
 * **There is no substitution between kinds, deliberately.** Letting a hungry
 * universe eat its quarry would be a market, and a market is a mechanic nobody
 * asked for that dissolves the differentiation the three kinds exist to create.
 * A shortfall in one kind is a shortfall, and it is recorded as one.
 *
 * ## Every magnitude here is untuned
 *
 * `docs/design/release-plan.md`: no release before 0.5.0 may claim any of them
 * is balanced.
 */

/**
 * Materials of **all kinds together** one laborer produces per world tick at
 * neutral affinity, `fp`. **Untuned.**
 *
 * Sixteen, where the single-stock economy had eight, and the doubling is not a
 * buff. Territory splits this figure into three by
 * {@link territoryYieldShares}, and the shipped territory's food share is
 * `470/1024` — so a neutral laborer on the shipped land feeds **7.5**, against
 * the 8 the scalar economy gave. Food is the claim that dominates the economy
 * by an order of magnitude, so food is the dimension in which "roughly
 * unchanged" was the thing to hold; holding the *total* unchanged instead would
 * have cut the food supply by half and starved the 200-year reference run for a
 * reason that has nothing to do with what this change is about.
 *
 * The other two kinds are new supply that used to be food and now is not, which
 * is exactly the differentiation: `3.8` stone and `4.7` vellum per laborer per
 * tick on the shipped mix.
 */
export const MATERIALS_PER_LABORER: Fixed = 16;

/** Food one person consumes per world tick to stay alive, `fp`. **Untuned.** */
export const SUBSISTENCE_PER_PERSON: Fixed = 1;

/** What materials production is made of. */
export interface ProductionInput {
  /** Laborer cohort members. */
  readonly laborerCount: number;
  /** The `laborAffinity` of the species supplying them, `fp`. */
  readonly laborAffinity: Fixed;
  /**
   * What this universe's land yields, as shares summing to `fp(1024)` — from
   * {@link territoryYieldShares}. The **mix**; labour supplies the magnitude.
   */
  readonly shares: MaterialAmounts;
  /** The `resource-yield` primitive record, for its stacking rule and cap. */
  readonly resourceYield: PrimitiveRecord;
  /**
   * `resource-yield` bonuses from nodes and effects, `fp`, **per kind**.
   *
   * Per kind rather than one list, because that is the whole mechanism: a
   * `resource-yield` node in a *Creo Herbam* cell raises food and a node in a
   * *Rego Terram* cell raises stone, and if both went into one list the two
   * cells would be interchangeable and no ruleset would be worth choosing over
   * another. `routeYieldByForm` is what fills these.
   */
  readonly resourceYieldBonuses: Readonly<Record<MaterialKind, readonly Fixed[]>>;
  readonly counters?: ClampCounters | undefined;
}

/** No bonuses of any kind — the neutral input, and the shape a caller starts from. */
export const NO_YIELD_BONUSES: Readonly<Record<MaterialKind, readonly Fixed[]>> = {
  food: [],
  stone: [],
  vellum: [],
};

/**
 * The `(1 + Σ)` `resource-yield` multiplier for one kind, capped once by the
 * shared implementation.
 *
 * One cap **per kind**, not one cap shared across the three. The alternative
 * was considered and is worse: a shared cap would make a universe that has
 * saturated its food magic unable to benefit from any quarrying magic at all,
 * which reads as a bug to every player who hits it and is impossible to explain
 * from the primitive's stated unit.
 */
export function resourceYieldMultiplier(input: ProductionInput, kind: MaterialKind): Fixed {
  return stackMagnitudes(input.resourceYield, input.resourceYieldBonuses[kind], {
    ...(input.counters === undefined ? {} : { counters: input.counters }),
  }).value;
}

/**
 * Materials one laborer cohort produces this world tick, by kind, `fp`.
 *
 * Per cohort rather than per universe, because `laborAffinity` is a species
 * trait and a universe holds several species. Summing across cohorts is the
 * caller's, and it is a sum rather than an average for the obvious reason: an
 * average would let one high-affinity cohort raise the output of every other.
 *
 * The territory share is applied **before** the yield multiplier, so a universe
 * whose land yields little stone gets a proportionally small absolute return
 * from stone magic rather than a large one on a small base. That is the reading
 * that makes siting matter: magic amplifies what the land already does.
 */
export function materialsProduced(input: ProductionInput): MaterialAmounts {
  if (!Number.isInteger(input.laborerCount) || input.laborerCount < 0) {
    throw new RangeError(
      `laborerCount must be a non-negative integer, received ${String(input.laborerCount)}`,
    );
  }
  const base = mul(input.laborerCount * MATERIALS_PER_LABORER, input.laborAffinity);
  const produced = zeroAmounts();
  for (const kind of MATERIAL_KINDS) {
    const ofKind = floorDiv(base * Math.max(0, input.shares[kind]), FP_ONE);
    produced[kind] = mul(ofKind, resourceYieldMultiplier(input, kind));
  }
  return produced;
}

/** What a whole populace eats this tick, `fp` of `food`. */
export function subsistenceDemand(population: number): Fixed {
  if (!Number.isInteger(population) || population < 0) {
    throw new RangeError(`population must be a non-negative integer, received ${String(population)}`);
  }
  return population * SUBSISTENCE_PER_PERSON;
}

/**
 * The four claims on the stocks, in the order they are paid.
 *
 * Declared as a literal rather than derived from the demand record's keys, for
 * the reason `OCCUPATIONS_IN_ORDER` gives next door: the order is a decision a
 * reviewer checks, not a property of how an object literal was built.
 */
export const CONSUMPTION_ORDER = [
  'subsistence',
  'libraryUpkeep',
  'scribing',
  'construction',
] as const;

/** One of the four claims. */
export type ConsumptionKind = (typeof CONSUMPTION_ORDER)[number];

/**
 * Which stock each claimant is paid out of.
 *
 * A total function over {@link CONSUMPTION_ORDER}, checked by the type rather
 * than by a default case, so adding a fifth claimant is a compile error until
 * somebody decides what it is made of. That is the intended friction: "which
 * material is this?" is the question the single-stock economy never had to ask
 * and never got a useful answer out of.
 */
export const CLAIMANT_KIND: Readonly<Record<ConsumptionKind, MaterialKind>> = {
  subsistence: 'food',
  libraryUpkeep: 'vellum',
  scribing: 'vellum',
  construction: 'stone',
};

/** What each claimant is asking for this tick, `fp` of its own kind. */
export type ConsumptionDemand = Readonly<Record<ConsumptionKind, Fixed>>;

/** What each claimant got, and what it went without. */
export interface ConsumptionOutcome {
  readonly spent: Readonly<Record<ConsumptionKind, Fixed>>;
  /** Demand that could not be met, per claimant. Recorded, never silent. */
  readonly shortfall: Readonly<Record<ConsumptionKind, Fixed>>;
  /** The stocks afterwards. No kind ever negative. */
  readonly remaining: MaterialAmounts;
  /** Whether anything went short at all, for the once-per-tick reporting path. */
  readonly anyShortfall: boolean;
  /**
   * Which kinds went short, so a reader can tell a universe that cannot feed
   * itself from one that cannot write anything down.
   *
   * This is the field the single-stock economy could not have had, and the
   * reason the whole change was worth making: *"one undifferentiated number
   * cannot express a shortage of vellum as distinct from a shortage of food."*
   */
  readonly shortKinds: Readonly<Record<MaterialKind, boolean>>;
}

function zeroPerClaimant(): Record<ConsumptionKind, Fixed> {
  const record = {} as Record<ConsumptionKind, Fixed>;
  for (const kind of CONSUMPTION_ORDER) record[kind] = 0;
  return record;
}

/**
 * Spends the stocks down the priority order.
 *
 * @returns Every claimant's outcome and the remaining stocks. Nothing is
 * partially refused silently: a claimant that got half of what it asked for has
 * half in `spent` and half in `shortfall`, and the sum of the two is always the
 * demand.
 * @throws RangeError on a negative demand, which would be a claimant *paying
 * into* a stock through the consumption path. Production has its own entry
 * point, and a negative cost is how a rounding error becomes free materials.
 */
export function consumeMaterials(
  stock: MaterialAmounts,
  demand: ConsumptionDemand,
): ConsumptionOutcome {
  const spent = zeroPerClaimant();
  const shortfall = zeroPerClaimant();
  const remaining = zeroAmounts();
  for (const kind of MATERIAL_KINDS) remaining[kind] = Math.max(0, stock[kind]);
  const shortKinds: Record<MaterialKind, boolean> = { food: false, stone: false, vellum: false };
  let anyShortfall = false;

  for (const claimant of CONSUMPTION_ORDER) {
    const wanted = demand[claimant];
    if (wanted < 0) {
      throw new RangeError(
        `${claimant} demanded ${String(wanted)} materials; a negative demand would pay into the ` +
          'stock through the consumption path, which is not what consumption is',
      );
    }
    const kind = CLAIMANT_KIND[claimant];
    const paid = Math.min(wanted, remaining[kind]);
    spent[claimant] = paid;
    shortfall[claimant] = wanted - paid;
    if (shortfall[claimant] > 0) {
      anyShortfall = true;
      shortKinds[kind] = true;
    }
    remaining[kind] -= paid;
  }

  return { spent, shortfall, remaining, anyShortfall, shortKinds };
}

/**
 * Asserts the invariant the `economy` spec states as a MUST, for every kind.
 *
 * Called at the tick boundary rather than trusted. A negative stock is the sort
 * of defect that produces plausible output for a long time — every demand is
 * met, because a negative stock still satisfies `x >= wanted` in a comparison
 * somebody wrote the other way round.
 */
export function assertMaterialsNonNegative(stock: MaterialAmounts): void {
  for (const kind of MATERIAL_KINDS) {
    if (stock[kind] < 0) {
      throw new Error(
        `the ${kind} stock is ${String(stock[kind])}; the economy spec requires it never to go ` +
          'below zero, and every claimant is paid through consumeMaterials precisely so that it ' +
          'cannot',
      );
    }
  }
}
