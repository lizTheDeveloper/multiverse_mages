/*
 * Multiverse Mages — combatants, derived from a world that has no coordinates.
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
 * Where a raid's combatants come from, and where they emphatically do not go.
 *
 * ## Derived, not promoted
 *
 * `contracts.md` §0: *"only engagement entities have positions… world-scale
 * entities have no coordinates — the component model must not assume
 * otherwise."* So a raid does not give a mage an `x`. It **derives** a
 * combatant from her — a separate entity, in a separate store, holding a
 * `sourceId` handle back into her universe — and throws it away at resolution.
 * `@mm/state`'s `assertNoWorldPositions` makes the world half of that
 * structural; this module is the other half, and the property is asserted
 * directly in the tests.
 *
 * A soldier cohort is likewise never promoted to individuals (§1.3, *"a
 * performance contract, not a modelling preference"*). It lends a **detachment**
 * — one combatant standing for a counted portion of the cohort — and the cohort
 * loses exactly that portion if the detachment dies.
 *
 * ## Selection is deterministic and capped, and the cap is the reason
 *
 * `maxCombatantsPerSide` is what makes per-tick work bounded, which is half of
 * "a raid's total work is bounded" (the other half is the tick count). Selection
 * therefore has to be a *rule* rather than "the first N the iterator produced":
 * eligible mages are ordered by depth of knowledge, ties broken on ascending
 * entity handle, and the top N are taken. An iteration-order cap would make
 * which mages fight depend on the create/destroy history of the world store,
 * which is exactly the kind of thing two peers can disagree about while agreeing
 * about the world.
 *
 * ## Species enters through `laborAffinity`, and this is a placeholder
 *
 * `contracts.md` §2.4 records that soldier effectiveness — a `martialAffinity`
 * field — is *deliberately absent*, and invites `raid-engagement` to amend that
 * section *with a use in hand*. This change has the use and does not take the
 * invitation, for one reason: a species trait added now would be authored
 * against no measurement, and every magnitude in this change is already an
 * untuned guess. So `maxHp` scales by `laborAffinity` — the one trait in §2.4
 * about a body rather than a mind — and it is marked here as standing in for the
 * field that should eventually replace it. Recorded rather than quietly chosen,
 * because a reader comparing §2.4's note against this code will otherwise think
 * one of them is wrong.
 */

import type { ContentId, SpeciesRecord } from '@mm/content';
import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { Handle, MageRecord, PopulaceCohortRecord, RaidSideValue } from '@mm/state';
import {
  COMBATANT,
  COMBATANT_SOURCE_KIND,
  MAGE,
  MAGE_ROLE,
  OCCUPATION,
  POPULACE_COHORT,
  RAID_SIDE,
  attachRecord,
  collectRecords,
} from '@mm/state';
import type { MagicGrid } from '@mm/rules-magic';

import type { HeldInstance } from './arbitration.js';
import type { Point } from './geometry.js';
import type { CombatantKey } from './keys.js';
import type { RaidTuning } from './tuning.js';

/** One living mage of a universe, with what she knows. */
export interface EligibleMage {
  readonly handle: Handle;
  readonly record: MageRecord;
  readonly held: readonly HeldInstance[];
  /** Deepest node tier she holds usably, or `0`. */
  readonly deepestTier: number;
}

/** One soldier cohort, and what it can lend. */
export interface EligibleCohort {
  readonly handle: Handle;
  readonly record: PopulaceCohortRecord;
}

/**
 * The working state of one combatant that `contracts.md` §1.6's component row
 * does not carry.
 *
 * The row is authoritative for everything §1.6 names — position, hit points,
 * vigor, concealment — and this object holds only what the contract leaves out:
 * the stable key, the legal-node mask, the readied list, and the raid-scoped
 * bookkeeping. Duplicating a §1.6 field here would be a second source of truth
 * for a number that gets written every tick.
 */
export interface CombatantBrief {
  readonly handle: EntityHandle;
  readonly key: CombatantKey;
  readonly side: RaidSideValue;
  readonly sourceKind: number;
  readonly sourceId: Handle;
  /** Layer 1 of arbitration, computed once at portal open. */
  legalNodes: ReadonlySet<ContentId>;
  /**
   * Every node this combatant holds, legal here or not.
   *
   * Distinct from {@link legalNodes} on purpose: `permits()` gates **casting**
   * and never possession (`contracts.md` §1.1), so a thief already knows a node
   * her host forbids and has no reason to steal a second copy of it. Using the
   * legal mask for that question would make a raider re-steal, every tick, the
   * one thing she came in already knowing.
   */
  readonly knownNodes: ReadonlySet<ContentId>;
  /** `contracts.md` §1.6's `preparedSpells`, readied at home and spent abroad. */
  preparedSpells: readonly number[];
  /** `ward` sources this combatant carries, already legality-filtered. */
  readonly wardSources: readonly Fixed[];
  /** The intrinsic per-tick damage of a detachment or a summon; `0` for a mage. */
  readonly intrinsicDamage: Fixed;
  /** The reach of that intrinsic attack; `0` for a mage. */
  readonly intrinsicRange: Fixed;
  /** People a detachment stands for, so its cohort can lose exactly them. */
  readonly detachmentStrength: number;
  /** Nodes stolen this raid, kept only if this combatant withdraws alive. */
  readonly stolen: ContentId[];
  /** Whether this combatant has left through the portal. Attackers only. */
  withdrawn: boolean;
}

/** Everything one side brings, in ascending combatant key. */
export interface SideRoster {
  readonly briefs: CombatantBrief[];
  /** Next spawn ordinal. Never reused, so a dead summon's key never returns. */
  nextSpawnOrdinal: number;
  summonsAlive: number;
}

/**
 * Every living mage of a universe that may fight, deepest first.
 *
 * `roles` selects who is eligible: attackers field raiders, defenders field
 * wardens and the affiliated staff of whatever the raid is threatening. A mage
 * with no role in the list stays home, which is what makes `assign role`
 * (action 10) a decision with a raid consequence rather than a label.
 */
export function eligibleMages(
  world: SimState,
  roles: ReadonlySet<number>,
  heldOf: (mage: Handle) => readonly HeldInstance[],
  grid: MagicGrid,
): EligibleMage[] {
  const found: EligibleMage[] = [];
  for (const entry of collectRecords(world, MAGE)) {
    if (entry.row.alive !== 1) continue;
    if (!roles.has(entry.row.roleId)) continue;
    const held = heldOf(entry.handle);
    let deepestTier = 0;
    for (const instance of held) {
      const tier = grid.hasNode(instance.nodeId) ? grid.tierOf(instance.nodeId) : 0;
      if (tier > deepestTier) deepestTier = tier;
    }
    found.push({
      handle: entry.handle,
      record: entry.row as MageRecord,
      held,
      deepestTier,
    });
  }
  // Deepest first, then ascending handle. A *rule*, not an iteration order:
  // "the first N the store produced" would make which mages fight depend on the
  // create/destroy history of the world rather than on the world.
  found.sort((a, b) => b.deepestTier - a.deepestTier || a.handle - b.handle);
  return found;
}

/** Every soldier cohort with anybody in it, ascending by handle. */
export function eligibleCohorts(world: SimState): EligibleCohort[] {
  const found: EligibleCohort[] = [];
  for (const entry of collectRecords(world, POPULACE_COHORT)) {
    if (entry.row.occupation !== OCCUPATION.soldier) continue;
    if (entry.row.count <= 0) continue;
    found.push({ handle: entry.handle, record: entry.row as PopulaceCohortRecord });
  }
  found.sort((a, b) => a.handle - b.handle);
  return found;
}

/**
 * A mage combatant's hit points.
 *
 * Base, plus depth of knowledge, scaled by species. Every term is a content
 * magnitude and the whole formula is untuned — see this module's opening note
 * on `laborAffinity`.
 *
 * The species scaling multiplies *before* it divides, which is
 * `contracts.md` §3's extended-precision rule: `mul(base, affinity)` at fp scale
 * would floor the affinity's effect on a small base, and a species trait that
 * stops mattering for weak mages is a balance finding nobody authored.
 */
export function mageMaxHp(tuning: RaidTuning, species: SpeciesRecord, deepestTier: number): Fixed {
  const beforeSpecies = tuning.combatantBaseMaxHp + tuning.combatantHpPerTier * deepestTier;
  return floorDiv(beforeSpecies * species.laborAffinity, FP_ONE);
}

/** Creates one combatant row in the engagement store and its working brief. */
export function spawnCombatant(
  engagement: SimState,
  roster: SideRoster,
  spec: {
    readonly side: RaidSideValue;
    readonly sourceKind: number;
    readonly sourceId: Handle;
    readonly position: Point;
    readonly hp: Fixed;
    readonly vigor: Fixed;
    readonly concealment: Fixed;
    readonly legalNodes?: ReadonlySet<ContentId>;
    readonly knownNodes?: ReadonlySet<ContentId>;
    readonly preparedSpells?: readonly number[];
    readonly wardSources?: readonly Fixed[];
    readonly intrinsicDamage?: Fixed;
    readonly intrinsicRange?: Fixed;
    readonly detachmentStrength?: number;
  },
): CombatantBrief {
  const handle = engagement.entities.create();
  attachRecord(engagement, COMBATANT, handle, {
    sourceKind: spec.sourceKind,
    sourceId: spec.sourceId,
    side: spec.side,
    x: spec.position.x,
    y: spec.position.y,
    hp: spec.hp,
    maxHp: spec.hp,
    vigor: spec.vigor,
    maxVigor: spec.vigor,
    concealment: spec.concealment,
  });

  const brief: CombatantBrief = {
    handle,
    key: { side: spec.side, spawnOrdinal: roster.nextSpawnOrdinal },
    side: spec.side,
    sourceKind: spec.sourceKind,
    sourceId: spec.sourceId,
    legalNodes: spec.legalNodes ?? new Set<ContentId>(),
    knownNodes: spec.knownNodes ?? new Set<ContentId>(),
    preparedSpells: spec.preparedSpells ?? [],
    wardSources: spec.wardSources ?? [],
    intrinsicDamage: spec.intrinsicDamage ?? 0,
    intrinsicRange: spec.intrinsicRange ?? 0,
    detachmentStrength: spec.detachmentStrength ?? 0,
    stolen: [],
    withdrawn: false,
  };
  // Never reused within a raid, even when the combatant dies: a dead summon's
  // luck must not transfer to whoever is created next.
  roster.nextSpawnOrdinal += 1;
  if (spec.sourceKind === COMBATANT_SOURCE_KIND.summon) roster.summonsAlive += 1;
  roster.briefs.push(brief);
  return brief;
}

/** An empty roster for one side. */
export function emptyRoster(): SideRoster {
  return { briefs: [], nextSpawnOrdinal: 0, summonsAlive: 0 };
}

/** Whether this side may field another combatant at all. */
export function sideHasRoom(roster: SideRoster, tuning: RaidTuning): boolean {
  return roster.briefs.length < tuning.maxCombatantsPerSide;
}

/**
 * Whether this side may field another **summon**.
 *
 * Both caps are checked, and the summon cap is the one that should bind first —
 * the content loader rejects a set in which it does not, because a summon cap
 * above the side cap is decorative.
 */
export function sideHasSummonRoom(roster: SideRoster, tuning: RaidTuning): boolean {
  return sideHasRoom(roster, tuning) && roster.summonsAlive < tuning.maxSummonsPerSide;
}

/**
 * Which roles each side draws its mages from.
 *
 * Attackers field **raiders only**, which is what makes action 10 — assign role
 * — a decision with a raid consequence rather than a label. Defenders field
 * everybody: a universe under attack does not get to say that its professors
 * were busy.
 */
export const RAIDING_ROLES: ReadonlySet<number> = new Set<number>([MAGE_ROLE.raider]);

/**
 * Wardens lead the defence, and every **standing** mage is there too.
 *
 * ## Students are not on this list, and the omission is a decision
 *
 * W193 made a student a `MAGE` row, so *"everybody defends"* would now put
 * children in a battle line by default — the set is enumerated rather than
 * derived, so nothing changed silently, and this comment is the record of the
 * choice rather than of an accident.
 *
 * Two reasons, and the second is the stronger one. The fiction: a first-year who
 * knows one tier-1 node is not a combatant, and `magical-prevalence.md`'s
 * taxonomy makes *"able to defend at any given random time"* an end state a
 * student has not reached. And the measurement: a defender pool that grew by the
 * whole student body the month enrolment landed would move every raid outcome in
 * every committed baseline for a reason unrelated to raids, and W193 already has
 * enough to answer for.
 *
 * The consequence is real and worth naming: a universe can be *"knowledge-rich
 * and undefended"* in a new way — a great many enrolled students and few
 * graduates is a soft target. That is a strategic shape, not a bug, and the god
 * closes it by building enough curriculum to graduate them.
 */
export const DEFENDING_ROLES: ReadonlySet<number> = new Set<number>([
  MAGE_ROLE.warden,
  MAGE_ROLE.professor,
  MAGE_ROLE.researcher,
  MAGE_ROLE.raider,
]);

/** The side a participant fights on, spelled out so call sites do not guess. */
export const ATTACKER: RaidSideValue = RAID_SIDE.attacker;
export const DEFENDER: RaidSideValue = RAID_SIDE.defender;
