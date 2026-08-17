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
import type { AblationMask, ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

import type { LandAptitude } from './aptitude.js';
import { NEUTRAL_LAND_APTITUDE } from './aptitude.js';
import type { LandMaterialKind, MaterialAmounts, MaterialKind } from './kinds.js';
import { LAND_MATERIAL_KINDS, MATERIAL_KINDS, zeroAmounts } from './kinds.js';

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

/**
 * ## `labor` is people, not magic, and that is why its faucet is here
 *
 * Every other kind is made by a mage spending a month — `application.ts`'s
 * channel — and `labor` was authored the same way: Corpus is the only form whose
 * `yieldWeights` name it. Measured over 600 reference ticks on
 * `w247/material-economy-build`, **`labor` production was exactly zero**, and
 * the reason is not that the wire was missing. It is that `labor`'s **sink has a
 * different shape from every other kind's**.
 *
 * | kind | sink | fires |
 * | --- | --- | --- |
 * | `essence` | `issue-dispensation` | when the god chooses |
 * | `passage` | `open-portal` | when the god chooses |
 * | `insight` | `bless-mage`, and teaching | teaching is continuous |
 * | **`labor`** | **the construction hire, and `fund-university`** | **every tick, automatically** |
 *
 * A faucet that fires when *a mage chooses to spend a month* cannot feed a drain
 * that fires *every tick whatever anybody chooses*. That race has already been
 * measured twice: pricing `fund-university` in `labor` left it legal on **8
 * ticks of 585**, and a reserve floor under the hire — the correct fix for the
 * race, and kept — could only reach **13 of 600**, with a bounding experiment at
 * **46 of 600** for a reserve so high the hire never drew at all. A finite
 * endowment redistributed between two claimants is a runway, not an income.
 *
 * So the faucet takes the shape of the sink: **automatic, per tick, proportional
 * to the populace**. Hands for hire are the one material a universe makes
 * without magic, which is also the truer fiction — Corpus magic is what
 * *amplifies* a workforce, and it still does, through
 * {@link ProductionInput.resourceYieldBonuses}.
 *
 * ## It is an allocation, not new supply
 *
 * The share comes off {@link MATERIALS_PER_LABORER} **before** the territory
 * split, by subtraction, so a laborer's month is divided between working the
 * land and standing available for hire — the total she produces is unchanged.
 * The alternative, adding `labor` on top, would have every laborer working a
 * full month in the fields *and* a further fraction of a month on a building
 * site, which is the "labour is exclusive" defect `assignedToSites` exists to
 * prevent, re-introduced one layer down.
 *
 * Subtraction rather than a second multiply is also what keeps the split exact
 * in fixed point: `worked = base − hireable` cannot lose a unit to two
 * independent roundings.
 *
 * ## The magnitude is content, and it is untuned
 *
 * `labor-share-of-month` in `autonomy-weight.json`. At `fp(64)` — one part in
 * sixteen — and `MATERIALS_PER_LABORER` of sixteen, a neutral laborer offers
 * exactly **one `fp` of `labor` per tick**, the same unit as
 * {@link SUBSISTENCE_PER_PERSON}. That is an anchor rather than a tuning:
 * `carrying-capacity.ts` records that the food margin is structural for any
 * laborer share above one eighth, so one sixteenth is half of the headroom the
 * economy already had and cannot be what starves a run. **Untuned**, and no
 * release before 0.5.0 may claim otherwise.
 */
export const REQUIRED_PRODUCTION_WEIGHTS = ['labor-share-of-month'] as const;

/** The one `autonomy-weight.json` scalar land production is priced in. */
export interface ProductionWeights {
  /**
   * The fraction of a laborer's month that is hands for hire rather than work
   * on the land, `fp` in `0..fp(1024)`.
   */
  readonly hireableShare: Fixed;
}

/** Anything that can answer an `autonomy-weight.json` id by name. */
export interface ProductionWeightSource {
  autonomyWeight(id: string): number;
}

/**
 * Reads the hireable share, once.
 *
 * Eager, and range-checked here rather than per tick: a share above `fp(1024)`
 * would make `worked` negative and turn the land into a *sink*, which is a
 * content mistake that should fail before a single field has been worked rather
 * than surface as an unexplained shortfall two hundred ticks in.
 */
export function readProductionWeights(source: ProductionWeightSource): ProductionWeights {
  const hireableShare = source.autonomyWeight('labor-share-of-month');
  if (!Number.isInteger(hireableShare) || hireableShare < 0 || hireableShare > FP_ONE) {
    throw new RangeError(
      `labor-share-of-month is ${String(hireableShare)}; it is the fraction of a laborer's month ` +
        `that is hands for hire and must be an integer in 0..${String(FP_ONE)}. Above fp(1024) the ` +
        'land would consume rather than produce',
    );
  }
  return Object.freeze({ hireableShare });
}

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
  /**
   * How much of the month is hands for hire rather than work on the land.
   *
   * Required rather than defaulted to zero, and the friction is the point: a
   * caller that forgot it would get a silently dry `labor` faucet, which is
   * precisely the defect this field exists to end. See
   * {@link REQUIRED_PRODUCTION_WEIGHTS}.
   */
  readonly production: ProductionWeights;
  /**
   * How this cohort's species tilts the land mix, `fp` per land kind.
   *
   * **A mix, never a magnitude.** {@link materialsProduced} renormalizes the
   * tilted shares back to `fp(1024)`, so a species good at stone makes more
   * stone and less grain out of the same month rather than more of everything;
   * the magnitude stays entirely in {@link ProductionInput.laborAffinity}. See
   * `aptitude.ts` for where the numbers come from — they are derived from the
   * species' authored form affinities through `form.json`'s own weights, not
   * authored a second time.
   *
   * Optional, and absent is `NEUTRAL_LAND_APTITUDE`, whose renormalization is
   * **exactly** the identity: every caller written before this existed produces
   * the byte-identical basket it always did. That is the migration path and the
   * positive control in one, and `production-aptitude.test.ts` asserts equality
   * rather than closeness.
   */
  readonly aptitude?: LandAptitude | undefined;
  readonly counters?: ClampCounters | undefined;
  /**
   * §9's ablation mask, for the arm that neutralizes `resource-yield`.
   *
   * Threaded rather than simulated by emptying the bonus lists, and the
   * difference is the whole point of `ablation.ts`: an empty list is a universe
   * that never learned the magic, while a neutralized primitive is one that
   * researched it, taught it, paid for it and got nothing. Only the second
   * isolates the primitive from everything else permitting a cell changes.
   */
  readonly ablation?: AblationMask | undefined;
}

/** No bonuses of any kind — the neutral input, and the shape a caller starts from. */
export const NO_YIELD_BONUSES: Readonly<Record<MaterialKind, readonly Fixed[]>> =
  Object.freeze(
    Object.fromEntries(MATERIAL_KINDS.map((kind) => [kind, [] as readonly Fixed[]])) as Record<
      MaterialKind,
      readonly Fixed[]
    >,
  );

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
    ...(input.ablation === undefined ? {} : { ablation: input.ablation }),
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
 *
 * `labor` comes off the top rather than out of the territory split, because a
 * share of land is a fact about acreage and hands for hire are not — see
 * {@link REQUIRED_PRODUCTION_WEIGHTS} for why the faucet is here at all. It
 * takes the same `resource-yield` multiplier as every other kind, so a universe
 * that permitted Corpus amplifies its workforce exactly as one that permitted
 * Terram amplifies its quarries.
 *
 * The three kinds that are neither land nor labour — `essence`, `insight`,
 * `passage` — are untouched here and stay at zero. They are made by a mage
 * spending a month, in `application.ts`, and a laborer in a field produces none
 * of them.
 */
export function materialsProduced(input: ProductionInput): MaterialAmounts {
  if (!Number.isInteger(input.laborerCount) || input.laborerCount < 0) {
    throw new RangeError(
      `laborerCount must be a non-negative integer, received ${String(input.laborerCount)}`,
    );
  }
  const base = mul(input.laborerCount * MATERIALS_PER_LABORER, input.laborAffinity);
  // Allocation, by subtraction. The two halves sum to `base` exactly whatever
  // the rounding does, which a second `mul` for the land half would not.
  const hireable = mul(base, Math.min(FP_ONE, Math.max(0, input.production.hireableShare)));
  const worked = base - hireable;
  const shares = tiltedShares(input.shares, input.aptitude ?? NEUTRAL_LAND_APTITUDE);
  const produced = zeroAmounts();
  for (const kind of LAND_MATERIAL_KINDS) {
    const ofKind = floorDiv(worked * Math.max(0, shares[kind]), FP_ONE);
    produced[kind] = mul(ofKind, resourceYieldMultiplier(input, kind));
  }
  produced.labor = mul(hireable, resourceYieldMultiplier(input, 'labor'));
  return produced;
}

/**
 * The land shares this cohort actually works, after its species' tilt.
 *
 * Renormalized back to exactly `fp(1024)` — the same two-floors-and-a-remainder
 * shape `landYieldShares` uses, and for the same reason: the three must sum to
 * `FP_ONE` however the division lands, because `materialsProduced` splits a
 * fixed number of person-months by them and a sum of 1025 would be free food.
 *
 * **Neutral aptitude is the exact identity, by arithmetic rather than by a
 * branch.** With every slot at `fp(1)` the weighted values are the shares times
 * `FP_ONE`, the total is `FP_ONE × FP_ONE`, and each floored quotient is the
 * share back. There is deliberately no `if (aptitude is neutral) return shares`
 * fast path: a branch would be a second implementation of the identity that
 * could stop agreeing with the arithmetic one.
 *
 * A tilt that zeroes everything — reachable only from a hand-built input, since
 * `speciesLandAptitude` floors at the authored affinity — leaves the shares
 * untouched rather than starving the universe on a division by zero.
 */
function tiltedShares(shares: MaterialAmounts, aptitude: LandAptitude): MaterialAmounts {
  const weighted: Record<LandMaterialKind, Fixed> = { food: 0, stone: 0, vellum: 0 };
  let total = 0;
  for (const kind of LAND_MATERIAL_KINDS) {
    weighted[kind] = Math.max(0, shares[kind]) * Math.max(0, aptitude[kind]);
    total += weighted[kind];
  }
  if (total <= 0) return shares;

  const stone = floorDiv(weighted.stone * FP_ONE, total);
  const vellum = floorDiv(weighted.vellum * FP_ONE, total);
  return { ...zeroAmounts(), food: FP_ONE - stone - vellum, stone, vellum };
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
  'casting',
  'teaching',
  'libraryUpkeep',
  'scribing',
  'construction',
  'constructionLabor',
] as const;

/** One of the five claims. */
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
  // **Vellum, and the choice was measured rather than argued.**
  //
  // `substrate.md` §6 asks for a `casting` claim so that working magic is
  // priced against the economy instead of being free. Which stock it comes out
  // of decides whether the claim means anything, because of a property of
  // `consumeMaterials` that is easy to miss: `remaining` is tracked **per
  // kind**, so `CONSUMPTION_ORDER` only ranks claimants that *share* a kind. A
  // claimant's position is otherwise inert.
  //
  // Stone was the intuitive answer — reagents, foci, apparatus — and it is
  // wrong. Measured over the 2,400-tick reference run: stone is **never short**
  // and grows monotonically to 4.4M, because construction demand falls to zero
  // once the buildings are up. A claim on a surplus stock is a cost that never
  // costs anything, which is the same failure as an unconsumed primitive
  // wearing different clothes.
  //
  // Vellum is contended: it reaches **zero** by world-tick 1200 and is short on
  // **530 of 2,400 ticks**. So a casting claim here actually binds — and it
  // binds against `libraryUpkeep` and `scribing`, which is what makes
  // `substrate.md` §7.1's recorded decision *"magic competes with the library,
  // not with bread"* true rather than merely stated. Under stone that sentence
  // would have been false, and nothing would have caught it.
  //
  // The reading is not a stretch: a working consumes its notes, its diagrams,
  // its prepared surfaces. Magic and the archive want the same skins.
  casting: 'vellum',
  // **`material-economy`'s two world-loop sinks, and each is alone in its
  // kind.** `CONSUMPTION_ORDER` only ranks claimants that share a stock, so
  // both positions are inert today and are declared anyway: the order is what a
  // reviewer checks, and a second insight claimant added later has to be placed
  // against this one rather than appended wherever it happened to be written.
  //
  // Teaching is paid at the lectern rather than here — `world-step.ts` reserves
  // the share before a single lesson is given, exactly as scribing is paid at
  // the desk — so the figure that arrives here is what was actually spent.
  teaching: 'insight',
  libraryUpkeep: 'vellum',
  scribing: 'vellum',
  construction: 'stone',
  // Hired person-months, over and above the crew the populace supplied. Never
  // charged for a month a site could not use: `advanceUniversities` attributes
  // the months a site actually bought to the crew first, and only the excess to
  // this claimant, so a universe with no building work demands zero and a
  // universe with no `labor` builds exactly as it did before this change.
  constructionLabor: 'labor',
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
  const shortKinds = Object.fromEntries(
    MATERIAL_KINDS.map((kind) => [kind, false]),
  ) as Record<MaterialKind, boolean>;
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
 * The most any one stock may hold, `fp`.
 *
 * ## Why there is a ceiling at all, and why it is here rather than nowhere
 *
 * `MATERIAL_STOCK`'s columns are `i32`. A stock that grew past `2^31 - 1` would
 * not throw; it would wrap, land negative, and be caught — if at all — by
 * {@link assertMaterialsNonNegative} several phases later, reported as a
 * negative stock rather than as an overflow. That is the shape of defect that
 * produces plausible output for a long time.
 *
 * `2^30 - 1` is the same bound `node.schema.json` puts on every authored `fp`
 * magnitude, which makes it the largest quantity anything in this project is
 * allowed to *mean*, and it leaves a whole bit of headroom under the column's
 * own limit so that a sum taken across kinds cannot wrap either.
 *
 * ## It spills; it does not truncate
 *
 * `docs/design/economy-flow-models.md` §3.3's corollary, quoted in
 * `material-economy`'s proposal: a silent truncation *"both breaks conservation
 * and destroys the signal that would feed back to whatever is overproducing"*.
 * So the excess is **returned** by {@link applyStockCeiling} rather than
 * dropped, the tick reports it, and the ledger group 6 builds can put it on the
 * sink side of `delta == faucet - sink` instead of finding a kind that does not
 * balance.
 *
 * **It does not bind on any run this repository has measured.** The reference
 * universe's largest stock over 2,400 ticks is stone at roughly 4.4M, four
 * hundred times under this. That is the intent: a ceiling that bound in ordinary
 * play would be a balance decision wearing an overflow guard's clothes.
 */
export const MATERIAL_STOCK_CEILING: Fixed = 1_073_741_823;

/** A stock bounded at the ceiling, and whatever would not fit. */
export interface CeilingOutcome {
  /** Every kind at or below {@link MATERIAL_STOCK_CEILING}. */
  readonly stock: MaterialAmounts;
  /** What each kind lost to the ceiling. Recorded, never silent. */
  readonly spilled: MaterialAmounts;
  /** Whether anything spilled at all, for the once-per-tick reporting path. */
  readonly anySpill: boolean;
}

/**
 * Bounds every kind at {@link MATERIAL_STOCK_CEILING}, returning what spilled.
 *
 * Called at the tick boundary, on the closing figure, so that exactly one place
 * in the loop can lose a material to a ceiling and exactly one number says how
 * much. A per-faucet clamp would be four places, three of which would forget to
 * report.
 */
export function applyStockCeiling(stock: MaterialAmounts): CeilingOutcome {
  const bounded = zeroAmounts();
  const spilled = zeroAmounts();
  let anySpill = false;
  for (const kind of MATERIAL_KINDS) {
    const held = stock[kind];
    if (held > MATERIAL_STOCK_CEILING) {
      bounded[kind] = MATERIAL_STOCK_CEILING;
      spilled[kind] = held - MATERIAL_STOCK_CEILING;
      anySpill = true;
    } else {
      bounded[kind] = held;
    }
  }
  return { stock: bounded, spilled, anySpill };
}

/**
 * One tick's material flow, per kind: what arrived and what left.
 *
 * ## Why a ledger and not another level metric
 *
 * `economy-flow-models.md` §5.2 is blunt about the gap: *"Every metric in the
 * registry measures a level, a rate, or a distribution at a checkpoint. None
 * reconciles flows. The favor ledger is the exception and proves the point — it
 * is the only place a closing balance is asserted against opening + in − out."*
 * This extends that shape to materials, which is what §3.4 asks for.
 *
 * A level tells you the granary is empty. It cannot tell you whether the food
 * was eaten, spilled over a ceiling, or quietly lost by a phase that decremented
 * a stock without telling anybody — and the third is a defect that produces
 * plausible output indefinitely, because an economy that leaks slowly looks
 * exactly like an economy that is merely poor.
 *
 * ## What counts as a faucet and what counts as a sink
 *
 * A **faucet** creates material that did not exist: laborers working the land,
 * and mages casting into a form that routes to a kind. A **sink** destroys it:
 * every claimant paid through {@link consumeMaterials}, the scribes paid at the
 * desk, and the ceiling spill.
 *
 * **The spill is on the sink side and this is the reason it must be.**
 * `MATERIAL_STOCK_CEILING` returns what did not fit rather than dropping it
 * precisely so that this arithmetic has somewhere to put it. A silent
 * truncation would show up here as a kind that does not balance, reported as a
 * leak, which is the diagnosis a reader would then have to un-make.
 *
 * **A stock held back by a floor is neither.** `spendableLabor`'s reserve is a
 * bound on how much a drain may take, not a transfer: the reserved `labor` is
 * still in the stock at the end of the tick, so it appears on neither side and
 * conservation is untouched by it. That is the property that made a floor the
 * right shape for the two-claimant race on `labor` — a gate or a holding pool
 * would both have needed the ledger to learn about them.
 *
 * **The god's spend is outside this ledger, and deliberately.** The intervention
 * system runs *before* the world system in the same step, so a material cost it
 * deducted is already in the opening balance the world tick reads. This
 * reconciles the world loop's own flows against its own opening figure; folding
 * in a deduction that happened before that figure was taken would make every
 * tick a god acted on read as a leak.
 */
export interface MaterialLedger {
  /** The stocks the tick opened with, per kind. */
  readonly opening: MaterialAmounts;
  /** The stocks the tick closed with, per kind. */
  readonly closing: MaterialAmounts;
  /** Everything created this tick, per kind. */
  readonly faucet: MaterialAmounts;
  /** Everything destroyed this tick, per kind — spill included. */
  readonly sink: MaterialAmounts;
}

/** One kind that failed `delta == faucet - sink`, with the arithmetic. */
export interface ConservationBreach {
  readonly kind: MaterialKind;
  /** `closing - opening`. */
  readonly delta: Fixed;
  /** `faucet - sink`, which `delta` must equal. */
  readonly expected: Fixed;
  /** `delta - expected`. Positive is material from nowhere; negative is a leak. */
  readonly discrepancy: Fixed;
}

/**
 * Every kind whose stock did not move by exactly what the tick recorded.
 *
 * Returns a list rather than throwing, so a caller can report it as a metric —
 * `economy-flow-models.md` §3.4 asks for the conservation check to be
 * **reported**, not only tested, and a function that can only throw cannot be a
 * series. {@link assertMaterialsConserved} is the throwing wrapper.
 *
 * Exact, with no tolerance. Every quantity here is a fixed-point integer and an
 * epsilon would hide precisely the slow one-unit-per-tick leak this exists to
 * find.
 */
export function conservationBreaches(ledger: MaterialLedger): ConservationBreach[] {
  const breaches: ConservationBreach[] = [];
  for (const kind of MATERIAL_KINDS) {
    const delta = ledger.closing[kind] - ledger.opening[kind];
    const expected = ledger.faucet[kind] - ledger.sink[kind];
    if (delta === expected) continue;
    breaches.push({ kind, delta, expected, discrepancy: delta - expected });
  }
  return breaches;
}

/**
 * Throws unless every kind satisfies `delta == faucet - sink`.
 *
 * Names the kind and the tick, which the spec requires of it: *"the conservation
 * assertion fails and names the kind and the tick."* A message reading only
 * "conservation failed" would send a reader to re-derive by hand the thing the
 * check already knew.
 */
export function assertMaterialsConserved(ledger: MaterialLedger, worldTick: number): void {
  const breaches = conservationBreaches(ledger);
  if (breaches.length === 0) return;
  const detail = breaches
    .map(
      (breach) =>
        `${breach.kind} moved by ${String(breach.delta)} while the tick recorded a faucet less a ` +
        `sink of ${String(breach.expected)}, a discrepancy of ${String(breach.discrepancy)}`,
    )
    .join('; ');
  throw new Error(
    `material conservation failed at world tick ${String(worldTick)}: ${detail}. Every kind's ` +
      'stock must move by exactly what the tick produced less what it consumed, spill included — ' +
      'a flow that changes a stock without recording itself is the defect this asserts against.',
  );
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
