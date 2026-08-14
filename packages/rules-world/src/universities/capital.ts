/*
 * Multiverse Mages — knowledge as capital, with four brakes and a way to
 * measure them.
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
import { floorDiv } from '@mm/sim-core';
import type { PrimitiveRecord } from '@mm/content';
import type { AblationMask, ClampCounters } from '@mm/primitives';
import { stackMagnitudes } from '@mm/primitives';

import type { LibraryDepth } from './library.js';
import { TIER_COUNT, libraryUpkeep, relevantDepth } from './library.js';

/**
 * ## The second compounding loop in the design, and the change that creates it
 *
 * Vision §6a: a deep library trains better mages, who research faster, who
 * deepen the library. `mages-and-species/design.md` answers it with four
 * independent brakes rather than one, on the grounds that *"a single brake is a
 * single point of failure: one mistuned constant and the loop is either runaway
 * or dead."*
 *
 * Three of the four live elsewhere and are named here so the set is legible in
 * one place:
 *
 * 1. **Concave returns on depth** — this module. {@link LIBRARY_CONTRIBUTION}
 *    is piecewise-linear with strictly non-increasing marginal return and an
 *    explicit saturation point, and the property is a *test over the table*
 *    rather than a comment, so a tuning pass that accidentally makes a segment
 *    convex fails CI instead of producing a runaway three thousand Monte Carlo
 *    runs later.
 * 2. **Relevance gating by depth ceiling** — `library.ts`'s `relevantDepth`.
 * 3. **The mage-month bottleneck** — the populace layer. The library raises the
 *    *rate*; it does not raise the number of mages, which grows only through
 *    promotion gated by capacity, aptitude, and a logistically braked fertility.
 * 4. **Upkeep linear in holdings** — `library.ts`'s `libraryUpkeep`, applied by
 *    {@link applyLibraryUpkeep} below.
 *
 * ## The contribution is a bonus, not a multiplier
 *
 * This is the decision the design records because the tempting implementation
 * is the other one: *"the tempting implementation is a separate
 * `libraryMultiplier` applied after the primitives — and that implementation
 * would silently escape the cap that `contracts.md` §3 says exists specifically
 * to contain this loop."*
 *
 * So {@link libraryContribution} returns an `fp` **bonus**, and
 * {@link capitalRateMultiplier} is the only function that consumes it: it drops
 * the bonus into the same array as every node-sourced bonus and hands the array
 * to `stackMagnitudes`, which applies §3's `(1 + Σ)` rule and the `fp(4096)`
 * cap once. There is no second cap, because *"two caps on the same quantity is
 * how a rate ends up at 4.0 × 2.0 without anyone deciding it should be 8.0."*
 * `universities-capital-routing.test.ts` scans this package for any other use
 * of the contribution.
 *
 * ## Bounded is not measured, so the state is emitted from day one
 *
 * `contracts.md` §7's `capitalSnowball` cannot be computed until 0.5.0, but it
 * must be computable *without retrofitting the simulation*. {@link emitCapital}
 * therefore reports, per university per tick, the relevant depth by tier, the
 * effective contribution after lookup and clamping, and the clamp count — which
 * is exactly the input a Gini coefficient over library depth needs.
 *
 * **Every magnitude here is untuned** (`docs/design/release-plan.md`).
 */

/** Mirrors `@mm/content`'s `TuningStatus` without importing a type for a constant. */
export const CAPITAL_TABLE_TUNING_STATUS = 'untuned';

/** One knot of the piecewise-linear contribution curve. */
export interface ContributionKnot {
  /** Relevant distinct nodes held. */
  readonly nodes: number;
  /** The `fp` bonus contributed at that depth. */
  readonly contribution: Fixed;
}

/**
 * The library contribution table, as data. **Untuned.**
 *
 * `mages-and-species/design.md`'s placeholder table, transcribed. The marginal
 * return per node over each segment runs 16.0, 8.0, 4.0, 1.2, 0.33 — strictly
 * decreasing, which is the property `capital-table.test.ts` asserts rather than
 * assumes.
 *
 * The first knot is `(0, 0)` because an empty library contributes nothing, and
 * the last is the **saturation point**: past {@link SATURATION_NODES} the curve
 * is flat, so a library ten times deeper than the saturation point is worth
 * exactly as much as one at it. That is what makes the fourth brake bite —
 * benefit stops and upkeep does not.
 */
export const LIBRARY_CONTRIBUTION: readonly ContributionKnot[] = [
  { nodes: 0, contribution: 0 },
  { nodes: 8, contribution: 128 },
  { nodes: 32, contribution: 320 },
  { nodes: 96, contribution: 576 },
  { nodes: 256, contribution: 768 },
  { nodes: 640, contribution: 896 },
];

/** Relevant distinct nodes past which the contribution stops growing. */
export const SATURATION_NODES: number =
  LIBRARY_CONTRIBUTION[LIBRARY_CONTRIBUTION.length - 1]?.nodes ?? 0;

/** The contribution at and beyond saturation, in `fp`. */
export const SATURATION_CONTRIBUTION: Fixed =
  LIBRARY_CONTRIBUTION[LIBRARY_CONTRIBUTION.length - 1]?.contribution ?? 0;

/**
 * The `fp` rate bonus a library of a given relevant depth contributes.
 *
 * Linear within a segment, flat past the last knot. Interpolated with
 * `floorDiv` rather than `lerp`, because the interpolation is over a *node
 * count* rather than over a fixed-point fraction: converting the position to
 * `fp` first and lerping would round twice and could make a segment
 * non-monotonic in the last unit, which is precisely the property the table
 * exists to guarantee.
 *
 * @param relevantNodes - Distinct nodes at or below the learner's depth
 * ceiling. Negative reads as zero rather than throwing: a caller with a
 * negative count has a defect elsewhere, and the contribution for it is not in
 * doubt.
 */
export function libraryContribution(relevantNodes: number): Fixed {
  if (relevantNodes <= 0) return 0;
  if (relevantNodes >= SATURATION_NODES) return SATURATION_CONTRIBUTION;

  for (let index = 1; index < LIBRARY_CONTRIBUTION.length; index += 1) {
    const lower = LIBRARY_CONTRIBUTION[index - 1];
    const upper = LIBRARY_CONTRIBUTION[index];
    if (lower === undefined || upper === undefined) continue;
    if (relevantNodes > upper.nodes) continue;

    const span = upper.nodes - lower.nodes;
    const rise = upper.contribution - lower.contribution;
    return lower.contribution + floorDiv((relevantNodes - lower.nodes) * rise, span);
  }
  return SATURATION_CONTRIBUTION;
}

/**
 * The contribution a specific learner gets from a specific library.
 *
 * Brake 1 and brake 2 composed, in the only order that makes sense: gate by the
 * learner's ceiling, then look the gated count up in the table.
 */
export function contributionFor(depth: LibraryDepth, depthCeiling: number): Fixed {
  return libraryContribution(relevantDepth(depth, depthCeiling));
}

/**
 * The whole of the loop's closing edge, in one call, for the coordinating layer.
 *
 * `capitalRateMultiplier` takes the contribution as a value so that a caller
 * with a per-tick depth does not recount the shelves per mage. That leaves the
 * *lookup* — {@link contributionFor} — as something a caller outside this module
 * would otherwise have to perform, and `universities-capital-routing.test.ts`
 * exists to say that nobody does: *"a second caller of the library contribution
 * is a second opinion about what a library is worth, and only one of them goes
 * through the capped accumulator."*
 *
 * So the loop calls this, and the lookup stays here. The `depth` argument is
 * `undefined` for a mage with no institution behind her, which is the ordinary
 * case for most of a universe's history and is not an error: an unaffiliated
 * mage works at the rate her own month buys her.
 */
export function libraryRateMultiplier(
  primitive: PrimitiveRecord,
  nodeBonuses: readonly Fixed[],
  depth: LibraryDepth | undefined,
  depthCeiling: number,
  counters?: ClampCounters,
  ablation?: AblationMask,
): CapitalRateOutcome {
  const bonus = depth === undefined ? 0 : contributionFor(depth, depthCeiling);
  return capitalRateMultiplier(primitive, nodeBonuses, bonus, counters, ablation);
}

/** What a capped rate evaluation produced, and whether the cap bound. */
export interface CapitalRateOutcome {
  /** The `(1 + Σ)` multiplier, capped once. */
  readonly multiplier: Fixed;
  /** Whether `contracts.md` §3's cap changed the answer. */
  readonly clamped: boolean;
  /** The library's contribution that went into the sum, for emission. */
  readonly contribution: Fixed;
}

/**
 * The one place a library's contribution reaches a rate.
 *
 * @param primitive - `research-rate`, `teach-rate`, or `scribe-rate`. Any of
 * the three; the routing is identical, which is the point.
 * @param nodeBonuses - Bonuses from nodes and effects, in `fp`.
 * @param contribution - The library's contribution, from
 * {@link contributionFor}. Passed as a value rather than computed here so that
 * a caller with a cached-per-tick depth does not recount the shelves per mage.
 * @param ablation - §9's mask. Absent is the control arm, which is what every
 * ordinary run uses.
 *
 * ## The mask was missing here until the academic primitives had node sources
 *
 * `stackMagnitudes` is the single place a mask is applied, and this function is
 * the only route by which the three academic rates reach it. Until
 * `coordination/academic-effects.ts` existed, `nodeBonuses` carried only the
 * god's constants and an arm naming `research-rate` had nothing to neutralize,
 * so the omission was invisible. It is not invisible now: a sweep arm
 * neutralizing one of these three would otherwise report *no effect* while the
 * effect ran at full strength, which is a false causal claim rather than a
 * missing one.
 */
export function capitalRateMultiplier(
  primitive: PrimitiveRecord,
  nodeBonuses: readonly Fixed[],
  contribution: Fixed,
  counters?: ClampCounters,
  ablation?: AblationMask,
): CapitalRateOutcome {
  const outcome = stackMagnitudes(primitive, [...nodeBonuses, contribution], {
    ...(counters === undefined ? {} : { counters }),
    ...(ablation === undefined ? {} : { ablation }),
  });
  return { multiplier: outcome.value, clamped: outcome.clamped, contribution };
}

/**
 * What one university's capital looked like on one world tick.
 *
 * The `universities` spec requires exactly these three, and requires them to be
 * enough to compute `capitalSnowball` at 0.5.0 *"with no additional
 * instrumentation added to the simulation"*. That is the reason the per-tier
 * array is emitted rather than only the total: a Gini coefficient over library
 * depth is computed across universes at a fixed tick, and a later question
 * about which tiers were carrying it cannot be answered from a scalar.
 */
export interface CapitalEmission {
  readonly university: EntityHandle;
  /** Distinct nodes at or below each tier. Always {@link TIER_COUNT} long. */
  readonly relevantByTier: readonly number[];
  /** The effective contribution after lookup and clamping, `fp`. */
  readonly effectiveContribution: Fixed;
  /** Times the shared cap bound during this tick's evaluations. */
  readonly clampCount: number;
}

/**
 * Builds one university's per-tick capital emission.
 *
 * @param depthCeiling - The ceiling the effective contribution is reported at.
 * A universe with several species has several answers; the emission reports one
 * and the per-tier array carries enough to recompute the others, which is the
 * cheaper half of the trade and the one that keeps the output a fixed size.
 */
export function emitCapital(
  university: EntityHandle,
  depth: LibraryDepth,
  depthCeiling: number,
  clampCount = 0,
): CapitalEmission {
  return {
    university,
    relevantByTier: depth.cumulativeByTier.slice(0, TIER_COUNT),
    effectiveContribution: contributionFor(depth, depthCeiling),
    clampCount,
  };
}

/** What upkeep cost one library, and what it cost the library. */
export interface UpkeepOutcome {
  readonly library: EntityHandle;
  /** Materials actually paid, `fp`. */
  readonly paid: Fixed;
  /** Materials owed and not paid, `fp`. */
  readonly shortfall: Fixed;
  /**
   * Instances this library must give up because it could not be maintained.
   *
   * A count rather than a list of handles: *which* instance is destroyed is the
   * knowledge subsystem's decision (`contracts.md` §5 rule 3 — this package may
   * not reach into `rules-magic`), and this side owns only how many.
   */
  readonly degradedInstances: number;
}

/** Materials of unpaid upkeep that cost a library one instance. **Untuned.** */
export const DEGRADATION_PER_SHORTFALL: Fixed = 32;

/**
 * Charges every library its upkeep against a shared materials stock.
 *
 * **Ascending library handle, always.** The `universities` spec requires
 * degradation to be applied *"in a documented deterministic order"*, and this
 * is that order: handles are stable identities, and paying in the order the
 * libraries happen to appear in an iteration would make which library goes
 * short depend on the history that reached the state rather than on the state.
 *
 * @returns One outcome per library, in the same ascending order, and the
 * materials left. The stock is returned rather than mutated for the reason
 * `advanceConstruction` gives: the materials stock has four claimants and one
 * of them must not be able to write it behind the others' backs.
 */
export function applyLibraryUpkeep(
  libraries: readonly { handle: EntityHandle; depth: LibraryDepth }[],
  materials: Fixed,
): { outcomes: readonly UpkeepOutcome[]; materialsRemaining: Fixed } {
  const ordered = [...libraries].sort((a, b) => a.handle - b.handle);
  let remaining = Math.max(0, materials);
  const outcomes: UpkeepOutcome[] = [];

  for (const { handle, depth } of ordered) {
    const owed = libraryUpkeep(depth);
    const paid = Math.min(owed, remaining);
    remaining -= paid;
    const shortfall = owed - paid;
    outcomes.push({
      library: handle,
      paid,
      shortfall,
      // Floor, so a shortfall smaller than one instance's worth costs nothing
      // this tick. It is not banked -- a "pending degradation" counter would be
      // a field on a component `contracts.md` §1.5 does not have, and a library
      // that is one unit short every tick forever is a library whose universe
      // has a materials problem the economy layer will report.
      degradedInstances: Math.min(depth.instanceCount, floorDiv(shortfall, DEGRADATION_PER_SHORTFALL)),
    });
  }

  return { outcomes, materialsRemaining: remaining };
}
