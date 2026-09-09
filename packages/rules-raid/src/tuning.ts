/*
 * Multiverse Mages — every magnitude a raid is made of, read once from content.
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
 * `raid-constant.json` (`contracts.md` §2.10), projected into one frozen record.
 *
 * **Read once, at portal open, and carried.** Not because a registry lookup is
 * slow, but because a raid is specified as a reproducible function of
 * `(attacker snapshot, host snapshot, raidSeed)` and content is not one of those
 * three. Reading a magnitude per tick would let a hot-reloaded registry change
 * the game halfway through a battle, which is the same class of defect the
 * ruleset snapshot exists to prevent one layer up.
 *
 * **Nothing here is a literal.** `CLAUDE.md` requires content to live in
 * validated data files, and the loader checks this exact set in both directions,
 * so a magnitude that appears here and not in content fails the load rather than
 * silently arriving as `0`.
 *
 * The one number that is *not* content is {@link MAX_ENGAGEMENT_TICKS}, and its
 * absence is deliberate — see `packages/content/src/raid.ts`.
 */

import type { Fixed } from '@mm/sim-core';

/**
 * The part of `@mm/content`'s registry this module reads.
 *
 * Narrowed to one method so a test can tune a raid without a filesystem, and so
 * a reviewer can see that nothing here reaches a node, a species, or a cell.
 */
export interface RaidConstantSource {
  raidConstant(id: string): number;
}

/** Every magnitude a raid is made of, in the units `contracts.md` §2.10 declares. */
export interface RaidTuning {
  // ---- Termination. The two integers the whole proof rests on. ----
  /** Raw integer a portal opens at, before jitter. */
  readonly portalStabilityInitial: number;
  /** Half-width of the uniform opening jitter, on stream 10. Raw. */
  readonly portalStabilityJitter: number;
  /** Raw integer subtracted every engagement tick. Authored, never derived. */
  readonly stabilityDecayPerTick: number;

  // ---- Bounds on per-tick work. ----
  readonly maxCombatantsPerSide: number;
  readonly maxSummonsPerSide: number;
  readonly maxObjectivesPerRaid: number;

  // ---- The battlefield. All fp metres. ----
  readonly battlefieldExtent: Fixed;
  readonly terrainCellSize: Fixed;
  readonly terrainImpassableChance: Fixed;
  readonly terrainBlockingChance: Fixed;
  readonly terrainRoughChance: Fixed;
  readonly terrainRoughMoveCost: Fixed;
  readonly deploymentZoneDepth: Fixed;
  readonly movementPerTick: Fixed;
  readonly maxInteractionRadius: Fixed;
  readonly castRange: Fixed;
  readonly areaDenialRadius: Fixed;
  readonly theftRange: Fixed;
  readonly objectiveInteractionRadius: Fixed;
  readonly objectiveProgressPerTick: Fixed;
  readonly portalMargin: Fixed;
  /**
   * Engagement ticks a raider stays before withdrawal outscores everything.
   *
   * Elapsed ticks, not remaining stability. The stability form was measured dead
   * — see the constant's gloss and `scripts/w182-withdrawal.mjs` — because the
   * portal outlives the raid by a factor of twenty and its jitter is wider than
   * any raid is long.
   */
  readonly withdrawAfterTicks: number;

  // ---- The engagement's three phases (`raid-engagement.md` §2). ----
  /** Engagement tick muster ends on regardless of contact. Ticks. */
  readonly musterCeilingTicks: number;
  /** Engagement tick at or after which the raid is watch-only. Ticks. */
  readonly resolutionOnsetTicks: number;

  // ---- The raid verb set (`raid-engagement.md` §3). All fp. ----
  /** Favor the defender pays to forbid mid-raid. */
  readonly verbForbidCost: Fixed;
  /** Favor the defender pays to permit mid-raid. Equal, and the equality matters. */
  readonly verbPermitCost: Fixed;
  /** Favor the defender pays to levy a detachment from a non-fighting cohort. */
  readonly verbLevyCost: Fixed;
  /** Favor the defender pays to ward her side. */
  readonly verbWardCost: Fixed;
  /** Ward added per defender, as one more stacked source. */
  readonly verbWardMagnitude: Fixed;
  /** Vis the attacker spends to mend her raiders. */
  readonly verbMendCost: Fixed;
  /** Hit points restored per raider, capped at her `maxHp`. */
  readonly verbMendHitPoints: Fixed;
  /** Vis the attacker spends to conceal her party. */
  readonly verbConcealCost: Fixed;
  /** Concealment added per raider. */
  readonly verbConcealMagnitude: Fixed;
  /** Ceiling on a combatant's concealment however it was raised. */
  readonly concealmentCap: Fixed;
  /** Vis a raiding party carries through the portal. Authored, not a balance. */
  readonly attackerVisStock: Fixed;

  // ---- Derived combatant statistics. Untuned placeholders, every one. ----
  readonly combatantBaseMaxHp: Fixed;
  readonly combatantHpPerTier: Fixed;
  readonly combatantBaseConcealment: Fixed;
  readonly castVigorBase: Fixed;
  readonly castVigorPerTier: Fixed;
  readonly summonMaxHp: Fixed;
  readonly summonDamage: Fixed;
  readonly detachmentMaxHp: Fixed;
  readonly detachmentDamage: Fixed;
  readonly detachmentRange: Fixed;
  readonly detachmentStrength: number;

  // ---- What is at stake. ----
  readonly objectiveValuePerInstance: Fixed;
  readonly objectiveValuePerTier: Fixed;
  readonly archmageObjectiveValue: Fixed;
  readonly universityObjectiveValue: Fixed;
  readonly victoryThresholdFraction: Fixed;
  readonly grimoireBurnResistCap: Fixed;
  /**
   * Grimoires a warband carries back through the portal, per library reached.
   *
   * A raw count, not `fp`. §8 gives the attacker two verbs — *"destroying or
   * looting"* — and this is where they divide: the first books off the shelf
   * are taken, the rest face a fire their durability may survive. A cap high
   * enough to empty a shelf would make burning unreachable and `durability`
   * decorative; a cap of zero would leave the nodes outside a universe's own
   * permitted cells unreachable by any means at all.
   */
  readonly lootedGrimoiresPerRaid: number;
}

/**
 * Reads the whole table, once.
 *
 * Every field is read eagerly rather than lazily. `raidConstant` throws on an
 * id the table does not declare, so an eager read turns a content mistake into
 * a failure at portal open — before a raid has half happened — instead of on
 * whichever tick first needed the missing number.
 */
export function readRaidTuning(source: RaidConstantSource): RaidTuning {
  const at = (id: string): number => source.raidConstant(id);
  return Object.freeze({
    portalStabilityInitial: at('portal-stability-initial'),
    portalStabilityJitter: at('portal-stability-jitter'),
    stabilityDecayPerTick: at('stability-decay-per-tick'),

    maxCombatantsPerSide: at('max-combatants-per-side'),
    maxSummonsPerSide: at('max-summons-per-side'),
    maxObjectivesPerRaid: at('max-objectives-per-raid'),

    battlefieldExtent: at('battlefield-extent'),
    terrainCellSize: at('terrain-cell-size'),
    terrainImpassableChance: at('terrain-impassable-chance'),
    terrainBlockingChance: at('terrain-blocking-chance'),
    terrainRoughChance: at('terrain-rough-chance'),
    terrainRoughMoveCost: at('terrain-rough-move-cost'),
    deploymentZoneDepth: at('deployment-zone-depth'),
    movementPerTick: at('movement-per-tick'),
    maxInteractionRadius: at('max-interaction-radius'),
    castRange: at('cast-range'),
    areaDenialRadius: at('area-denial-radius'),
    theftRange: at('theft-range'),
    objectiveInteractionRadius: at('objective-interaction-radius'),
    objectiveProgressPerTick: at('objective-progress-per-tick'),
    portalMargin: at('portal-margin'),
    withdrawAfterTicks: at('withdraw-after-ticks'),

    musterCeilingTicks: at('muster-ceiling-ticks'),
    resolutionOnsetTicks: at('resolution-onset-ticks'),

    verbForbidCost: at('verb-forbid-cost'),
    verbPermitCost: at('verb-permit-cost'),
    verbLevyCost: at('verb-levy-cost'),
    verbWardCost: at('verb-ward-cost'),
    verbWardMagnitude: at('verb-ward-magnitude'),
    verbMendCost: at('verb-mend-cost'),
    verbMendHitPoints: at('verb-mend-hit-points'),
    verbConcealCost: at('verb-conceal-cost'),
    verbConcealMagnitude: at('verb-conceal-magnitude'),
    concealmentCap: at('concealment-cap'),
    attackerVisStock: at('attacker-vis-stock'),

    combatantBaseMaxHp: at('combatant-base-max-hp'),
    combatantHpPerTier: at('combatant-hp-per-tier'),
    combatantBaseConcealment: at('combatant-base-concealment'),
    castVigorBase: at('cast-vigor-base'),
    castVigorPerTier: at('cast-vigor-per-tier'),
    summonMaxHp: at('summon-max-hp'),
    summonDamage: at('summon-damage'),
    detachmentMaxHp: at('detachment-max-hp'),
    detachmentDamage: at('detachment-damage'),
    detachmentRange: at('detachment-range'),
    detachmentStrength: at('detachment-strength'),

    objectiveValuePerInstance: at('objective-value-per-instance'),
    objectiveValuePerTier: at('objective-value-per-tier'),
    archmageObjectiveValue: at('archmage-objective-value'),
    universityObjectiveValue: at('university-objective-value'),
    victoryThresholdFraction: at('victory-threshold-fraction'),
    grimoireBurnResistCap: at('grimoire-burn-resist-cap'),
    lootedGrimoiresPerRaid: at('looted-grimoires-per-raid'),
  });
}
