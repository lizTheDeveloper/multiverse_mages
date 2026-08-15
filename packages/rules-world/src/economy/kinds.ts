/*
 * Multiverse Mages — the three kinds of material, and the two tables that route
 * territory and form to them.
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
 * ## The grid was already a materials taxonomy and the economy was not using it
 *
 * `docs/design/sound-design.md` §4.2 is titled **"Forms are materials"** and
 * names all fourteen: Animal *"breath, sinew, wet transient"*, Aquam *"flow,
 * bubble, resonant vessel"*, Herbam *"fibre, splinter, dry crackle"*, Terram
 * *"mass, gravel, stone"*, Ignem *"crackle over broadband noise"*. The magic
 * system has fourteen materials. The economy had one integer.
 *
 * That is why nothing the god does to the economy has ever been worth doing.
 * With one stock, permitting *Creo Herbam* and permitting *Rego Terram* are the
 * same move — both end up adding to the same number — so no ruleset is
 * distinguishable from any other by its economy, and vision §4's own worked
 * example (*"Rego Terram letting universities go up faster"*) had nothing to
 * land on.
 *
 * ## Three, not fourteen
 *
 * Fourteen stocks would be fourteen tuning surfaces and thirteen more chances
 * for a claimant to starve on a technicality. Three is the smallest set in which
 * every link of the chain has a producer, a consumer that already existed, and a
 * cell of the grid whose magic relieves it:
 *
 * | Kind | The forms it is made of (§4.2) | Spent on |
 * | --- | --- | --- |
 * | `food` | Herbam *"fibre"*, Aquam *"flow"*, Animal *"sinew"* | subsistence |
 * | `stone` | Terram *"mass, gravel, stone"*, Ignem the kiln, Auram the bellows | construction |
 * | `vellum` | Animal the parchment, Herbam the paper, Nomen *"naming is speech"* | scribing, library upkeep |
 *
 * ## Forms are deliberately not partitioned
 *
 * Herbam and Animal each feed **both** the table and the shelf, because they
 * genuinely do: the same herd is dinner and parchment. Forcing a partition to
 * make the arithmetic tidy would be the arithmetic authoring the fiction.
 *
 * What discriminates two universes is not that each form has one kind — it is
 * that the *sets differ*. A universe permitting only Terram quarries and
 * starves. One permitting only Herbam eats and writes and cannot build. That is
 * the comparison `packages/coordination/test` measures, and it is the answer to
 * *"different universes aren't really different"*.
 *
 * ## And a form whose magic is not a material routes nowhere
 *
 * Mentem, Vim, Umbra, Fatum, Limen, Imaginem and Corpus carry all-zero weights
 * in `form.json`, and this is a statement rather than an omission. §4.2:
 * Mentem *"is the only form with no reverb at all"* because it is not happening
 * in the world; Vim is *"the carrier itself, unfiltered"*; Umbra is
 * *"everything in the reverb tail, nothing in the dry signal"*. Shadow magic
 * feeds nobody. A universe that permits only those forms has a magnificent
 * arsenal and no economy, and that is a coherent — if hungry — world.
 *
 * **Every magnitude reachable from here is untuned** (`docs/design/release-plan.md`).
 */

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { FormRecord, TerritoryRecord } from '@mm/content';

/**
 * The three kinds, in a fixed order.
 *
 * A literal tuple rather than the keys of an object, for the reason
 * `CONSUMPTION_ORDER` next door is one: *"the order is a decision a reviewer
 * checks, not a property of how an object literal was built"*. It is also what
 * makes "exactly three kinds" countable by a test rather than asserted in prose.
 */
export const MATERIAL_KINDS = ['food', 'stone', 'vellum'] as const;

/** One of the three. */
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** A quantity of each kind. `fp` unless the field carrying it says otherwise. */
export type MaterialAmounts = Readonly<Record<MaterialKind, Fixed>>;

/** Nothing of anything — the identity for every sum below. */
export const NO_MATERIALS: MaterialAmounts = { food: 0, stone: 0, vellum: 0 };

/** A fresh mutable triple at zero. */
export function zeroAmounts(): Record<MaterialKind, Fixed> {
  return { food: 0, stone: 0, vellum: 0 };
}

/** Adds two baskets, kind by kind. */
export function addAmounts(a: MaterialAmounts, b: MaterialAmounts): MaterialAmounts {
  return { food: a.food + b.food, stone: a.stone + b.stone, vellum: a.vellum + b.vellum };
}

/**
 * Every kind summed.
 *
 * The one place a total is taken, and it exists for **reporting and for the
 * observation block**, never for spending. Nothing may pay a claimant out of a
 * total: that would be cross-kind substitution, which is a market, and a market
 * is a mechanic nobody asked for that would undo the differentiation this module
 * exists to create.
 */
export function totalAmount(amounts: MaterialAmounts): Fixed {
  return amounts.food + amounts.stone + amounts.vellum;
}

/**
 * What a universe's land yields, as **shares summing to `fp(1024)`**.
 *
 * ## Shares rather than absolute yields, and this is the load-bearing choice
 *
 * The obvious design is to have territory produce materials directly —
 * `Σ landUnits × yieldPerLandUnit` — and it is wrong twice. It makes production
 * independent of how many people are working, which deletes the populace from
 * the economy; and it makes total output a function of how much land the content
 * author wrote down, so a content retune silently rescales every balance
 * baseline in the project.
 *
 * So territory decides the **mix** and labour decides the **magnitude**. A
 * universe of river delta and one of highland waste put the same person-months
 * in and get differently-shaped baskets out. That is economic differentiation
 * sited in territory kinds, with no entity gaining a coordinate: a share is a
 * property of *what land a universe holds*, which vision §7a permits, and never
 * of where anything is.
 *
 * @returns Shares in `fp`, summing to exactly `fp(1024)`. A universe with no
 * land — or land that yields nothing at all — gets the whole share in `food`,
 * because a populace with no economy should starve visibly at the subsistence
 * line rather than through a division by zero.
 */
export function territoryYieldShares(regions: readonly TerritoryRecord[]): MaterialAmounts {
  const weighted = zeroAmounts();
  for (const region of regions) {
    const land = Math.max(0, region.landUnits);
    for (const kind of MATERIAL_KINDS) {
      weighted[kind] += land * Math.max(0, region.yieldPerLandUnit[kind]);
    }
  }

  const total = totalAmount(weighted);
  if (total <= 0) return { food: FP_ONE, stone: 0, vellum: 0 };

  // Two of the three are floored and the first takes the remainder, so the three
  // sum to exactly `FP_ONE` however the division lands. Distributing the
  // remainder "fairly" would cost a sort and buy nothing: the residue is at most
  // two parts in 1024, and it goes to food for the same reason the migration's
  // does — subsistence is paid first.
  const stone = floorDiv(weighted.stone * FP_ONE, total);
  const vellum = floorDiv(weighted.vellum * FP_ONE, total);
  return { food: FP_ONE - stone - vellum, stone, vellum };
}

/**
 * How a `resource-yield` magnitude on a node of this form is split across kinds.
 *
 * The weights are content (`form.json`), not code, so that "Herbam feeds people"
 * is a number a balance sweep can move rather than a branch a balance sweep
 * cannot see.
 *
 * @returns The magnitude routed to each kind, `fp`. A form whose weights are all
 * zero contributes nothing anywhere, which is the intended reading of a form
 * whose material is not a material.
 */
export function routeYieldByForm(form: FormRecord, magnitude: Fixed): MaterialAmounts {
  // **The magnitude is signed; the weights are not.**
  //
  // This clamped the magnitude with `Math.max(0, …)` while `node.schema.json`
  // set `minimum: 1`, when no negative could reach it and the clamp was a
  // statement about impossible input. Signed magnitudes make a negative
  // `resource-yield` authorable content — a node whose magic *costs* the
  // economy — so clamping it here would silently discard the cost before the
  // material routing ever saw it.
  //
  // The weights keep their clamp. A negative weight would be a form asserting
  // that producing food consumes stone, which is a claim about the material
  // taxonomy rather than about one working, and nothing in `form.json` means
  // it. So the *sign* now comes from the node, and the *mix* stays a
  // non-negative property of the form: a negative magnitude routes
  // proportionally negative amounts to exactly the kinds a positive one would
  // have fed.
  return {
    food: floorDiv(magnitude * Math.max(0, form.yieldWeights.food), FP_ONE),
    stone: floorDiv(magnitude * Math.max(0, form.yieldWeights.stone), FP_ONE),
    vellum: floorDiv(magnitude * Math.max(0, form.yieldWeights.vellum), FP_ONE),
  };
}
