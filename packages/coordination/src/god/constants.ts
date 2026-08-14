/*
 * Multiverse Mages — the god-agency magnitudes, resolved once from content into
 * a typed struct.
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
 * `god-constant.json` and `god-cost.json` are the authority; this is the shape
 * the rules read them through.
 *
 * ## Why a resolved struct rather than string lookups at the call site
 *
 * Two reasons, and the second is the one that matters. The cheap one is that
 * `constants.worshipLagRise` is read inside a per-tick loop and a map lookup
 * per read is work nobody needs. The real one is that a string lookup is a
 * typo waiting to happen: `godConstant('worship-lag-rise')` and
 * `godConstant('worship-rise-lag')` are the same shape to a compiler, and the
 * second throws at runtime — in a Monte Carlo worker, hours in. Resolving the
 * whole set once, at world construction, converts every such mistake into a
 * failure at the moment content is loaded.
 *
 * The loader has already checked the required set is complete, so
 * {@link resolveGodConstants} cannot half-succeed: `godConstant` throws for a
 * name nothing declares, and the names here are exactly the ones
 * `REQUIRED_GOD_CONSTANTS` lists.
 *
 * ## Everything here is untuned
 *
 * Every value carries `tuningStatus: "untuned"` in content, and
 * `release-plan.md` forbids anything below 0.5.0 from claiming otherwise.
 * Nothing in this package may hardcode one of these numbers; the conformance
 * test in `god-conformance.test.ts` scans for it.
 */

import type { ContentRegistry, Fp } from '@mm/content';

/** Costs by `contracts.md` §4.2 action id, plus the two prices that have no id. */
export interface GodCosts {
  /** Base favor price of each action id `0..15`, before hysteresis and tier scaling. */
  readonly byAction: readonly Fp[];
  /** Action 11 with a target of 0 — §4.2 gives founding and funding one id. */
  readonly foundUniversity: Fp;
}

/** Every magnitude the god-agency rules read, resolved. */
export interface GodConstants {
  // Worship.
  readonly worshipMagePerHead: Fp;
  readonly worshipMageBlessedBonus: Fp;
  readonly worshipMageCap: Fp;
  readonly worshipMageHalf: Fp;
  readonly worshipUniversityPerUnit: Fp;
  readonly worshipUniversityCap: Fp;
  readonly worshipUniversityHalf: Fp;
  readonly worshipPopulacePerHead: Fp;
  readonly worshipPopulaceCap: Fp;
  readonly worshipPopulaceHalf: Fp;
  // `worship-max` is deliberately **not** a field here. See the note on
  // `resolveGodConstants` below before adding one back.
  readonly worshipLagRise: Fp;
  readonly worshipLagFall: Fp;
  readonly worshipTierBase: Fp;
  readonly worshipTierCount: number;

  // Favor.
  readonly favorRegenBase: Fp;
  readonly favorPerWorship: Fp;
  readonly favorCapBase: Fp;
  readonly favorCapPerTier: Fp;
  readonly hysteresisDecayTicks: number;
  readonly hysteresisStep: Fp;

  // Upheaval.
  readonly upheavalTicks: number;
  readonly upheavalShockFloor: Fp;
  readonly traditionShock: Fp;
  readonly traditionShockTicks: number;

  // Interventions.
  readonly blessResearchRate: Fp;
  readonly blessTeachRate: Fp;
  readonly blessLifespanMonths: number;
  readonly blessDurationTicks: number;
  readonly encourageMagnitude: Fp;
  readonly encourageDecayPerTick: Fp;
  readonly encourageMaxCells: number;
  readonly grantMastery: Fp;
  /** Founding grants available before the universe has discovered anything. */
  readonly foundingGrantBudgetStart: number;
  /** Self-discovered nodes that earn one further grant. `0` disables accrual. */
  readonly foundingGrantAccrualNodes: number;
  /** Ceiling on grants ever authorized — the allowance plus everything accrued. */
  readonly foundingGrantBudgetCap: number;
  readonly fundProgress: Fp;
  readonly foundUniversityCapacity: number;

  // Ascension.
  readonly ascensionMinTick: number;
  readonly ascensionTierGate: number;
  readonly ascensionEraCount: number;
  readonly ascensionDependenceMax: Fp;
  readonly ascensionLossMax: number;
  /** Permitted cells that must stand at their floor for Path A. */
  readonly ascensionSummitCells: number;
  /** Surviving instances a mastered cell's deepest node needs. */
  readonly ascensionSummitCopies: number;
  /** Nodes a passing era boundary must hold. */
  readonly ascensionCanonBreadth: number;
  /** Distinct cells a passing era boundary must hold nodes in. */
  readonly ascensionCanonCells: number;
  /** Share of the canon a passing era may lose, fp. Floored by `ascensionLossMax`. */
  readonly ascensionLossFraction: Fp;

  // Stagnation.
  readonly stagnationMagelessTicks: number;
  readonly stagnationWorshipFloor: Fp;
  readonly stagnationWorshipTicks: number;
  readonly stagnationStasisTicks: number;
  readonly stagnationHealthFloor: Fp;

  // Prestige and legacy.
  readonly prestigeEarnMax: Fp;
  readonly prestigeRetention: Fp;
  readonly prestigeCap: Fp;
  readonly prestigeBaseAscended: Fp;
  readonly prestigeBaseCutoff: Fp;
  readonly prestigeBaseStagnated: Fp;
  readonly prestigePerTier: Fp;
  readonly prestigePerEra: Fp;
  readonly prestigePerWorshipTier: Fp;
  readonly legacyCap: Fp;
  readonly legacyHalf: Fp;
  readonly legacyArchiveNodes: number;
  readonly legacyArchiveMaxTier: number;
  readonly legacyHeadstartFraction: Fp;
  /**
   * The world tick the three `legacyBaseline*` values below are measured at.
   *
   * **Provenance, not an input.** No formula reads it: `legacyGrant` scales the
   * baselines by a fraction and never asks when they were taken. It is here so
   * that the numbers beside it are falsifiable — a baseline without the tick it
   * was measured at is a magnitude nobody can reproduce or disprove.
   *
   * It is also **staged ahead of a consumer that is named in content**. All
   * three baselines carry glosses disowning themselves — *"Placeholder for the
   * median unaided universe's ... A measurement that has not been taken: the
   * first prestigeAdvantage sweep replaces it"* — and this is the tick that
   * sweep has to read them at. Today two of the three are not measurements at
   * all: `legacy-baseline-materials` is `1024000`, which is `scenario`'s
   * `STARTING_MATERIALS` exactly, and `legacy-baseline-populace` is `72`, which
   * is its founding population exactly (4 per cohort × 6 species × 3
   * occupations). They are the starting position wearing the name of a tick-120
   * median.
   *
   * So the owed work is a measurement, and this constant is the half of it that
   * can be authored in advance. It is not deleted, for two reasons: dropping it
   * from `god-constant.json` would move `contentRevision`, which sits inside
   * every snapshot; and dropping only the field here — leaving the constant
   * required and consumed by nothing — would take the finding off
   * `check:reachability`'s report without changing anything true about the
   * repository, which is the silence that check is written to refuse.
   */
  readonly legacyReferenceTick: number;
  readonly legacyBaselineFavor: Fp;
  readonly legacyBaselineMaterials: Fp;
  readonly legacyBaselinePopulace: number;
}

/** Both tables, as the world loop carries them. */
export interface GodContent {
  readonly constants: GodConstants;
  readonly costs: GodCosts;
}

/** The highest action id `contracts.md` §4.2 declares. */
const ACTION_ID_MAX = 15;

/**
 * Reads the whole constant set out of a loaded registry.
 *
 * ## Why `worship-max` is resolved into nothing
 *
 * It is the one required god constant with no field on {@link GodConstants},
 * and the omission is load-bearing rather than an oversight.
 *
 * `worship-max` is a **claim about the formula, checked at load** — `god.ts`
 * refuses any content set where it is not exactly
 * `worship-mage-cap + worship-university-cap + worship-populace-cap`. It is not
 * a clamp, and `worship.ts` says at length why it must never become one: every
 * source class saturates strictly below its own cap, so their sum is strictly
 * below the ceiling for every finite input, and a `Math.min` on the result
 * *"would make that identity untestable, because the clamp would hide a broken
 * one."*
 *
 * Measured on the shipped content rather than argued: with 10⁸ mages, 10⁸
 * universities and 10⁸ people — nine orders of magnitude past anything carrying
 * capacity permits — the worship target is **9,213 against a ceiling of 9,216**,
 * 99.97% of it, with each class still strictly under its own cap. There is no
 * runaway to bound.
 *
 * So a field here would be a number the rules path reads in order to enforce
 * something already true by construction. It carried one anyway until
 * `check:reachability` pointed out that nothing read it, which is exactly the
 * signal that check exists to give. **Adding it back means adding a clamp**, and
 * that is a regression with a paper trail, not a cleanup.
 *
 * The constant stays required, stays in `god-constant.json`, and keeps its
 * reader: the loader. Deleting it from content would move `contentRevision`, and
 * `contentRevision` sits in every snapshot.
 */
export function resolveGodConstants(registry: ContentRegistry): GodConstants {
  const value = (id: string): number => registry.godConstant(id);
  return Object.freeze({
    worshipMagePerHead: value('worship-mage-per-head'),
    worshipMageBlessedBonus: value('worship-mage-blessed-bonus'),
    worshipMageCap: value('worship-mage-cap'),
    worshipMageHalf: value('worship-mage-half'),
    worshipUniversityPerUnit: value('worship-university-per-unit'),
    worshipUniversityCap: value('worship-university-cap'),
    worshipUniversityHalf: value('worship-university-half'),
    worshipPopulacePerHead: value('worship-populace-per-head'),
    worshipPopulaceCap: value('worship-populace-cap'),
    worshipPopulaceHalf: value('worship-populace-half'),
    // No `worshipMax`. See the note above — the ceiling is an identity the
    // content loader checks, not a number the rules path applies.
    worshipLagRise: value('worship-lag-rise'),
    worshipLagFall: value('worship-lag-fall'),
    worshipTierBase: value('worship-tier-base'),
    worshipTierCount: value('worship-tier-count'),

    favorRegenBase: value('favor-regen-base'),
    favorPerWorship: value('favor-per-worship'),
    favorCapBase: value('favor-cap-base'),
    favorCapPerTier: value('favor-cap-per-tier'),
    hysteresisDecayTicks: value('hysteresis-decay-ticks'),
    hysteresisStep: value('hysteresis-step'),

    upheavalTicks: value('upheaval-ticks'),
    upheavalShockFloor: value('upheaval-shock-floor'),
    traditionShock: value('tradition-shock'),
    traditionShockTicks: value('tradition-shock-ticks'),

    blessResearchRate: value('bless-research-rate'),
    blessTeachRate: value('bless-teach-rate'),
    blessLifespanMonths: value('bless-lifespan-months'),
    blessDurationTicks: value('bless-duration-ticks'),
    encourageMagnitude: value('encourage-magnitude'),
    encourageDecayPerTick: value('encourage-decay-per-tick'),
    encourageMaxCells: value('encourage-max-cells'),
    grantMastery: value('grant-mastery'),
    foundingGrantBudgetStart: value('founding-grant-budget-start'),
    foundingGrantAccrualNodes: value('founding-grant-accrual-nodes'),
    foundingGrantBudgetCap: value('founding-grant-budget-cap'),
    fundProgress: value('fund-progress'),
    foundUniversityCapacity: value('found-university-capacity'),

    ascensionMinTick: value('ascension-min-tick'),
    ascensionTierGate: value('ascension-tier-gate'),
    ascensionEraCount: value('ascension-era-count'),
    ascensionDependenceMax: value('ascension-dependence-max'),
    ascensionLossMax: value('ascension-loss-max'),
    ascensionSummitCells: value('ascension-summit-cells'),
    ascensionSummitCopies: value('ascension-summit-copies'),
    ascensionCanonBreadth: value('ascension-canon-breadth'),
    ascensionCanonCells: value('ascension-canon-cells'),
    ascensionLossFraction: value('ascension-loss-fraction'),

    stagnationMagelessTicks: value('stagnation-mageless-ticks'),
    stagnationWorshipFloor: value('stagnation-worship-floor'),
    stagnationWorshipTicks: value('stagnation-worship-ticks'),
    stagnationStasisTicks: value('stagnation-stasis-ticks'),
    stagnationHealthFloor: value('stagnation-health-floor'),

    prestigeEarnMax: value('prestige-earn-max'),
    prestigeRetention: value('prestige-retention'),
    prestigeCap: value('prestige-cap'),
    prestigeBaseAscended: value('prestige-base-ascended'),
    prestigeBaseCutoff: value('prestige-base-cutoff'),
    prestigeBaseStagnated: value('prestige-base-stagnated'),
    prestigePerTier: value('prestige-per-tier'),
    prestigePerEra: value('prestige-per-era'),
    prestigePerWorshipTier: value('prestige-per-worship-tier'),
    legacyCap: value('legacy-cap'),
    legacyHalf: value('legacy-half'),
    legacyArchiveNodes: value('legacy-archive-nodes'),
    legacyArchiveMaxTier: value('legacy-archive-max-tier'),
    legacyHeadstartFraction: value('legacy-headstart-fraction'),
    legacyReferenceTick: value('legacy-reference-tick'),
    legacyBaselineFavor: value('legacy-baseline-favor'),
    legacyBaselineMaterials: value('legacy-baseline-materials'),
    legacyBaselinePopulace: value('legacy-baseline-populace'),
  });
}

/**
 * Reads the cost table into a dense array indexed by action id.
 *
 * Dense rather than a map, and indexed by the §4.2 id rather than by the
 * content id, because the id is the thing every caller has. The loader has
 * already proved the covering is complete, so an index in range is never a
 * miss — which is why this can return a plain array and the lookup can be one
 * read.
 */
export function resolveGodCosts(registry: ContentRegistry): GodCosts {
  const byAction: Fp[] = [];
  for (let actionId = 0; actionId <= ACTION_ID_MAX; actionId += 1) {
    const record = registry.godCost(actionId);
    if (record === undefined) {
      throw new Error(
        `god-cost.json declares no price for action id ${String(actionId)}. The loader checks ` +
          'this covering on every load, so reaching here means the registry was built by ' +
          'something other than loadContent().',
      );
    }
    byAction.push(record.favorCost);
  }
  return Object.freeze({
    byAction: Object.freeze(byAction),
    foundUniversity: registry.godConstant('found-university-cost'),
  });
}

/** Both tables at once, which is how the world loop is handed them. */
export function resolveGodContent(registry: ContentRegistry): GodContent {
  return Object.freeze({
    constants: resolveGodConstants(registry),
    costs: resolveGodCosts(registry),
  });
}
