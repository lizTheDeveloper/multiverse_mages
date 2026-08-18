/*
 * Multiverse Mages — the seven kinds of material, and the two tables that route
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
 * ## Seven, not fourteen — and the first three are not the whole story
 *
 * Fourteen stocks would be fourteen tuning surfaces and thirteen more chances
 * for a claimant to starve on a technicality. The set is the smallest one in
 * which every link of the chain has a producer, a consumer that already
 * existed, and a cell of the grid whose magic relieves it:
 *
 * | Kind | The forms it is made of (§4.2) | Spent on |
 * | --- | --- | --- |
 * | `food` | Herbam *"fibre"*, Aquam *"flow"*, Animal *"sinew"* | subsistence |
 * | `stone` | Terram *"mass, gravel, stone"*, Ignem the kiln, Auram the bellows | construction |
 * | `vellum` | Animal the parchment, Herbam the paper, Nomen *"naming is speech"* | scribing, library upkeep |
 * | `labor` | Corpus — a body is what work is made of | construction, beside stone |
 * | `essence` | Vim *"the carrier itself, unfiltered"* | the price of a dispensation |
 * | `insight` | Mentem *"no reverb at all"*, Imaginem | university teaching throughput |
 * | `passage` | Limen, Fatum, Umbra *"only tail"* | opening a portal |
 *
 * The last four are `material-economy`'s and they arrived because **three was
 * not enough to make the grid legible**: seven of the fourteen forms routed
 * nowhere, two of them (`mentem`, `limen`) inside the v1 opening square, so a
 * god who opened on mind-magic and thresholds generated no economy at all.
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
 * ## A form whose magic is not *food* is still a material
 *
 * This section used to say the opposite, and the record of the reversal is
 * worth more than the corrected text. It read: *"Mentem, Vim, Umbra, Fatum,
 * Limen, Imaginem and Corpus carry all-zero weights in `form.json`, and this is
 * a statement rather than an omission… Shadow magic feeds nobody."*
 *
 * The observation was right and the conclusion was wrong. §4.2 does say Mentem
 * *"is the only form with no reverb at all"* — it is not happening in the
 * world — and what follows is not that mind-magic produces nothing, but that
 * what it produces is not **grain**. It produces `insight`. Vim, *"the carrier
 * itself, unfiltered"*, is `essence`. Umbra, *"everything in the reverb tail"*,
 * is `passage`, which is what a threshold yields.
 *
 * A universe that permits only those forms still cannot eat. That is the true
 * half of the old paragraph and it survives: `food` has exactly three producing
 * forms and none of them is Mentem. What does not survive is the claim that
 * such a universe has *no economy* — it has an economy the three-kind stock
 * could not see.
 *
 * **Every magnitude reachable from here is untuned** (`docs/design/release-plan.md`).
 */

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { FormRecord, TerritoryRecord } from '@mm/content';

/**
 * The seven kinds, in a fixed order.
 *
 * A literal tuple rather than the keys of an object, for the reason
 * `CONSUMPTION_ORDER` next door is one: *"the order is a decision a reviewer
 * checks, not a property of how an object literal was built"*. It is also what
 * makes "exactly these kinds, in this order" countable by a test rather than
 * asserted in prose — and the order is `MATERIAL_STOCK`'s column order, which is
 * appended to and never reordered.
 */
export const MATERIAL_KINDS = [
  'food',
  'stone',
  'vellum',
  'labor',
  'essence',
  'insight',
  'passage',
] as const;

/** One of the seven. */
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/**
 * The three that come out of **land**, and the reason the other four do not.
 *
 * `territoryYieldShares` splits a territory's yield across kinds, and
 * `territory.schema.json` names three: a river delta yields grain and a
 * highland yields stone, and no arrangement of acreage yields `insight`. The
 * four `material-economy` added are made by a mage spending a month — they come
 * out of `application.ts`'s applied channel and nowhere else — so a laborer in
 * a field produces exactly zero of them, by having no share rather than by a
 * special case.
 *
 * Kept as its own list rather than derived by subtraction, for the reason
 * `MATERIAL_KINDS` is a literal: which kinds land yields is a decision a
 * reviewer checks, not a property of how a filter was written.
 */
export const LAND_MATERIAL_KINDS = ['food', 'stone', 'vellum'] as const;

/** One of the three kinds land yields. */
export type LandMaterialKind = (typeof LAND_MATERIAL_KINDS)[number];

/** A quantity of each kind. `fp` unless the field carrying it says otherwise. */
export type MaterialAmounts = Readonly<Record<MaterialKind, Fixed>>;

/** Nothing of anything — the identity for every sum below. */
export const NO_MATERIALS: MaterialAmounts = Object.freeze(zeroAmounts());

/** A fresh mutable record at zero, one field per kind. */
export function zeroAmounts(): Record<MaterialKind, Fixed> {
  return { food: 0, stone: 0, vellum: 0, labor: 0, essence: 0, insight: 0, passage: 0 };
}

/** Adds two baskets, kind by kind. */
export function addAmounts(a: MaterialAmounts, b: MaterialAmounts): MaterialAmounts {
  const sum = zeroAmounts();
  for (const kind of MATERIAL_KINDS) sum[kind] = a[kind] + b[kind];
  return sum;
}

/**
 * Every kind summed.
 *
 * The one place a total is taken, and it exists for **reporting and for the
 * observation block**, never for spending. Nothing may pay a claimant out of a
 * total: that would be cross-kind substitution, and no substitution is
 * implemented — it would undo the differentiation this module exists to create.
 *
 * An earlier revision added "a market is a mechanic nobody asked for". That was
 * an agent's caution written in the register of a design ruling; the author has
 * since said it was not his. See `materials.ts`'s note for the full account and
 * why the class matters. The mechanical claim above stands and the prohibition
 * on spending from a total stands; **the question of whether this game has a
 * market is open, and this comment does not close it.**
 */
export function totalAmount(amounts: MaterialAmounts): Fixed {
  let total = 0;
  for (const kind of MATERIAL_KINDS) total += amounts[kind];
  return total;
}

/**
 * The three land kinds summed, which is **not** the same question.
 *
 * Two callers need this rather than {@link totalAmount}, and both would be
 * silently wrong with it:
 *
 * - **The autonomy outlook.** A mage's *"can this universe afford to do
 *   things"* term is scored against what the claimants she can see are paid in
 *   — subsistence, scribing, casting, construction — and every one of those is
 *   `food`, `stone` or `vellum`. Folding in a stock of `passage` the god is
 *   saving for a portal would make her more optimistic about a shelf that is
 *   still empty.
 * - **`territoryYieldShares`**, whose denominator is the land's own yield.
 *
 * `@mm/agent-api`'s observation and player-state deliberately do *not* call
 * this: both spell the three-term sum out inline, because §4.1's `materials`
 * channel is a contract and a helper that widened one day would move a slot
 * every trained agent depends on without moving the layout digest that is
 * supposed to catch it.
 */
export function landTotal(amounts: MaterialAmounts): Fixed {
  let total = 0;
  for (const kind of LAND_MATERIAL_KINDS) total += amounts[kind];
  return total;
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
 * ## And *what a universe holds* is now read off state, which it was not
 *
 * This function takes a **content set**: every territory the author wrote down,
 * summed. For as long as the world loop called it once per run and handed the
 * answer to every universe, the sentence above was aspiration — two universes
 * in one run got the identical basket mix however much or little ground each
 * actually held, because the mix was a property of `territory.json` rather than
 * of anybody's land. `TERRITORY_HOLDING` had shipped in world revision 10 and
 * the production path never consulted it.
 *
 * {@link landYieldShares} is the arithmetic, and `territory-holdings.ts`'
 * `heldTerritoryYieldShares` is the state-side caller — the exact counterpart
 * of `heldTerritoryExtent` beside it, and split for the same §2.7 reason. This
 * function stays as the **content** question, which is what a founding
 * endowment and a documented bound are stated in terms of.
 *
 * @returns Shares in `fp`, summing to exactly `fp(1024)`. A universe with no
 * land — or land that yields nothing at all — gets the whole share in `food`,
 * because a populace with no economy should starve visibly at the subsistence
 * line rather than through a division by zero.
 */
export function territoryYieldShares(regions: readonly TerritoryRecord[]): MaterialAmounts {
  return landYieldShares(regions);
}

/**
 * A stretch of country, reduced to the two fields the share arithmetic reads.
 *
 * The narrow shape both sides of `contracts.md` §2.7's split can satisfy: a
 * `TerritoryRecord` straight out of content, and a `territory-holding` row
 * paired with its kind's authored yield. Declared here rather than in
 * `territory-holdings.ts` so that {@link landYieldShares} is the **one**
 * implementation of the arithmetic — the alternative was a second copy that
 * agreed with this one on the day it was written.
 */
export interface LandYield {
  /** Land units held, a count rather than `fp`. */
  readonly landUnits: number;
  /** What one unit of this kind of country produces, per land kind, `fp`. */
  readonly yieldPerLandUnit: Readonly<Record<LandMaterialKind, Fixed>>;
}

/**
 * The shares themselves, over anything that can name its acreage and its mix.
 *
 * @returns Shares in `fp`, summing to exactly `fp(1024)`. An empty list — or
 * land that yields nothing at all — gets the whole share in `food`, for the
 * reason {@link territoryYieldShares} gives: a populace with no economy should
 * starve visibly at the subsistence line rather than through a division by zero.
 */
export function landYieldShares(regions: readonly LandYield[]): MaterialAmounts {
  const weighted = zeroAmounts();
  for (const region of regions) {
    const land = Math.max(0, region.landUnits);
    for (const kind of LAND_MATERIAL_KINDS) {
      weighted[kind] += land * Math.max(0, region.yieldPerLandUnit[kind]);
    }
  }

  const total = landTotal(weighted);
  if (total <= 0) return { ...zeroAmounts(), food: FP_ONE };

  // Two of the three are floored and the first takes the remainder, so the three
  // sum to exactly `FP_ONE` however the division lands. Distributing the
  // remainder "fairly" would cost a sort and buy nothing: the residue is at most
  // two parts in 1024, and it goes to food for the same reason the migration's
  // does — subsistence is paid first.
  const stone = floorDiv(weighted.stone * FP_ONE, total);
  const vellum = floorDiv(weighted.vellum * FP_ONE, total);
  return { ...zeroAmounts(), food: FP_ONE - stone - vellum, stone, vellum };
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
  // **The magnitude is signed here; the bound is downstream, and mechanical.**
  //
  // This clamped the magnitude with `Math.max(0, …)` while `node.schema.json`
  // set `minimum: 1`, when no negative could arrive and the clamp described
  // impossible input. Signed magnitudes make a negative `resource-yield`
  // authorable — a node whose magic *costs* the economy — and clamping it at
  // this door would discard the cost before anything could bound it, which is
  // the naive shape: a floor chosen to avoid a negative rather than derived
  // from what the quantity is.
  //
  // The real bound sits where the mechanism supplies one. What this function
  // feeds is `resourceYieldBonuses`, which `resourceYieldMultiplier` stacks
  // into an `additive-into-multiplier` and `stackingFloor` floors at `fp(0)`.
  // That floor *is* mechanical: labour with every debuff in the world produces
  // **nothing**, and there is no arrangement of magic under which a cohort
  // digging in a quarry yields anti-stone. So a cost reduces the multiplier
  // toward zero and stops there, by arithmetic, in the one place every
  // consumer shares — rather than by four consumers each deciding what a
  // negative means.
  //
  // The weights keep their clamp, and that asymmetry is deliberate rather than
  // an oversight. A negative weight would be a *form* claiming that producing
  // food consumes stone: a statement about the material taxonomy, not about
  // one working, and nothing in `form.json` means it. The sign comes from the
  // node; the mix stays a non-negative property of the form.
  const routed = zeroAmounts();
  for (const kind of MATERIAL_KINDS) {
    routed[kind] = floorDiv(magnitude * Math.max(0, form.yieldWeights[kind]), FP_ONE);
  }
  return routed;
}
