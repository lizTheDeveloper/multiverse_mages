/*
 * Multiverse Mages — a named warband in, the same mages out, transformed.
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
 * The raid subsystem in isolation, at the fidelity the question actually needs.
 *
 * `raid-engine.test.ts`'s `build()` proves the two structural claims — every
 * raid terminates, and arbitration does not leak — over a two-mage fixture, and
 * it reads the {@link RaidOutcome} to do it. That is the right instrument for
 * those claims and the wrong one for this question, which is not *"did the raid
 * end"* but ***"what happened to the people who went"***.
 *
 * So this harness takes a **named** warband, resolves a whole raid, applies its
 * consequences, and hands back one {@link MageFate} per mage — matched by name,
 * with her world state read before the portal opened and again after it closed.
 * A test can then say *"Brannoc died, Sela came home with `im-read-the-surface`,
 * and the host lost `cig-the-uncontained-hour` entirely"* and have every clause
 * be an assertion rather than a count.
 *
 * ## What this harness can and cannot report, and why that is the finding
 *
 * Three fates were asked of it. Only two exist as world state:
 *
 * - **Death is real and it writes back.** `applyRaidOutcome` sets `MAGE.alive`
 *   to `0` and empties the dead mage's mind through `knowledge-model`'s ordinary
 *   death path. {@link MageFate.died} is a reading of the world, not of the
 *   ledger.
 * - **Wounds are real *inside* the engagement and nowhere else.** A combatant's
 *   `hp` is a `COMBATANT` row in the engagement store, which is discarded when
 *   the portal closes; nothing copies any part of it back onto the mage. So
 *   {@link MageFate.engagementHpAtEnd} can show a survivor who was nearly killed
 *   while {@link MageFate.worldVigorAfter} is byte-identical to what she left
 *   with. Both are reported, separately and deliberately: a harness that folded
 *   them into one "wounded" flag would invent the write-back this project does
 *   not have.
 * - **Capture does not exist at all.** Not as a `MAGE` field, not as an outcome
 *   record, not as a word anywhere in `packages/`. The nearest thing is the
 *   stranded-raider rule, and that is *death with forfeiture* — an attacker left
 *   on the field is killed and loses what she stole — which is a different event
 *   from being taken. {@link MageFate.captured} is therefore a constant `false`
 *   with a comment, rather than a field left out: a missing field reads as an
 *   oversight, and this is a design gap worth being able to point at.
 */

import type { ContentId } from '@mm/content';
import type { EntityHandle, SimState } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import type { Handle, RaidSideValue, RulesetSnapshot } from '@mm/state';
import {
  COMBATANT,
  COMBATANT_SOURCE_KIND,
  MAGE,
  MAGE_ROLE,
  RAID_SIDE,
  componentOf,
} from '@mm/state';
import type { KnowledgeSubsystem } from '@mm/rules-magic';
import type { AppliedConsequences, CombatantBrief, Raid, RaidOutcome, RaidTuning } from '@mm/rules-raid';
import {
  applyRaidOutcome,
  closePortal,
  deployRaid,
  existingNodes,
  openPortal,
  runRaid,
} from '@mm/rules-raid';

import {
  addMage,
  addSoldiers,
  addUniversity,
  emptyWorld,
  grid,
  knowledgeFor,
  nodeId,
  participant,
  registry,
  ruleset,
  traditionId,
  tuning,
} from './raid-fixture.js';

/** One mage the caller names and sends. */
export interface WarbandMember {
  /** How the test refers to her. Unique within her side. */
  readonly name: string;
  readonly species?: string;
  /** Nodes she knows, by content id string. */
  readonly nodes?: readonly string[];
  readonly mastery?: number;
  readonly vigor?: number;
}

/** What became of one named mage. Every field is read from the world, not the ledger. */
export interface MageFate {
  readonly name: string;
  readonly side: RaidSideValue;
  /** Her handle in her **own** universe. */
  readonly mageId: Handle;

  /**
   * Whether she was actually derived into a combatant.
   *
   * `eligibleMages` selects by role and the per-side cap truncates, so a warband
   * larger than `maxCombatantsPerSide` sends only its deepest members. A fate
   * with `fielded: false` is a mage who stayed home, and reporting that is what
   * keeps "she came back unhurt" from silently meaning "she never went".
   */
  readonly fielded: boolean;

  readonly aliveBefore: boolean;
  readonly aliveAfter: boolean;
  /** Alive when the portal opened and dead once the consequences landed. */
  readonly died: boolean;
  /**
   * Killed by the stranded-raider rule rather than by damage: alive on the field
   * and not withdrawn when the portal collapsed. Death, not capture.
   */
  readonly stranded: boolean;
  /** Whether she left through the portal under her own power. Attackers only. */
  readonly withdrew: boolean;

  /**
   * **Always `false`, and structurally so.** Capture has no representation
   * anywhere in this project — see the module header. Kept as a field so a test
   * that wants to assert the gap can assert it.
   */
  readonly captured: false;

  /** `MAGE.vigor` before the portal opened, `fp`. */
  readonly worldVigorBefore: Fixed;
  /** `MAGE.vigor` after the consequences landed, `fp`. Nothing writes it. */
  readonly worldVigorAfter: Fixed;

  /**
   * Her `COMBATANT.hp` when the raid resolved, `fp`, or `undefined` if she was
   * never fielded or her row was removed. Engagement scope: this number dies
   * with the engagement store and reaches no world.
   */
  readonly engagementHpAtEnd: Fixed | undefined;
  /** Her `COMBATANT.maxHp`, `fp`, for the same row. */
  readonly engagementMaxHp: Fixed | undefined;
  /** True when she finished the engagement below the hit points she entered with. */
  readonly tookDamage: boolean;

  /** Nodes she held before, ascending. */
  readonly knownBefore: readonly ContentId[];
  /** Nodes she holds after, ascending. */
  readonly knownAfter: readonly ContentId[];
  /** Nodes she read off an enemy during the raid, whether or not she kept them. */
  readonly stolen: readonly ContentId[];
  /** Nodes that are in her mind afterwards and were not before. */
  readonly carriedHome: readonly ContentId[];
}

/** The whole transformation: two universes before, two after, and everyone's fate. */
export interface WarbandResult {
  readonly raid: Raid;
  readonly outcome: RaidOutcome;
  readonly applied: AppliedConsequences;
  /** One per named member, attackers first, in the order the caller gave them. */
  readonly fates: readonly MageFate[];

  readonly hostNodesBefore: readonly ContentId[];
  readonly hostNodesAfter: readonly ContentId[];
  readonly attackerNodesBefore: readonly ContentId[];
  readonly attackerNodesAfter: readonly ContentId[];

  readonly attackerWorld: SimState;
  readonly hostWorld: SimState;
}

export interface WarbandOptions {
  readonly attackers: readonly WarbandMember[];
  readonly defenders: readonly WarbandMember[];
  /** People in a soldier cohort on each side. Omitted means none. */
  readonly attackerSoldiers?: number;
  readonly defenderSoldiers?: number;
  /** Nodes shelved as grimoires in the host's library. */
  readonly hostShelves?: readonly string[];
  readonly hostDurability?: number;
  readonly hostRuleset?: RulesetSnapshot;
  readonly attackerRuleset?: RulesetSnapshot;
  readonly hostTradition?: string;
  readonly seed?: number;
  readonly tuningOverride?: Partial<RaidTuning>;
}

/** A named mage, before the portal opened. */
interface Enlisted {
  readonly name: string;
  readonly side: RaidSideValue;
  readonly mageId: EntityHandle;
  readonly world: SimState;
  readonly knowledge: KnowledgeSubsystem;
  readonly vigorBefore: Fixed;
  readonly aliveBefore: boolean;
  readonly knownBefore: readonly ContentId[];
}

/** Nodes a mage holds in her mind, ascending, read straight out of the index. */
function heldNodes(knowledge: KnowledgeSubsystem, mage: Handle): ContentId[] {
  return knowledge
    .instancesHeldBy(mage)
    .map((instance) => knowledge.read(instance).nodeId)
    .sort((a, b) => a - b);
}

/**
 * Sends a warband through a portal and reports what came back.
 *
 * The whole sequence, in the order `rules-raid` requires it: open, deploy, run
 * to termination, apply the consequences to both worlds, close. `applyRaidOutcome`
 * is called **before** `closePortal`, because the write-back reads the rosters
 * and the engagement store that closing the portal is entitled to let go of.
 */
export function resolveWarband(options: WarbandOptions): WarbandResult {
  const attackerWorld = emptyWorld();
  const hostWorld = emptyWorld();
  const attackerKnowledge = knowledgeFor(attackerWorld);
  const hostKnowledge = knowledgeFor(hostWorld);

  const hostSnapshot =
    options.hostRuleset ??
    ruleset({ traditionId: traditionId(options.hostTradition ?? 'vancian-memorization') });
  const attackerSnapshot = options.attackerRuleset ?? ruleset({});

  const enlist = (
    member: WarbandMember,
    side: RaidSideValue,
    world: SimState,
    knowledge: KnowledgeSubsystem,
  ): Enlisted => {
    const mageId = addMage(world, knowledge, {
      ...(member.species === undefined ? {} : { species: member.species }),
      // Attackers raid, defenders ward. The roles `eligibleMages` selects on.
      role: side === RAID_SIDE.attacker ? MAGE_ROLE.raider : MAGE_ROLE.warden,
      nodes: member.nodes ?? [],
      ...(member.mastery === undefined ? {} : { mastery: member.mastery }),
      ...(member.vigor === undefined ? {} : { vigor: member.vigor }),
    });
    return {
      name: member.name,
      side,
      mageId,
      world,
      knowledge,
      vigorBefore: componentOf(world, MAGE).get(mageId, 'vigor'),
      aliveBefore: componentOf(world, MAGE).get(mageId, 'alive') === 1,
      knownBefore: heldNodes(knowledge, mageId),
    };
  };

  const enlisted: Enlisted[] = [
    ...options.attackers.map((member) =>
      enlist(member, RAID_SIDE.attacker, attackerWorld, attackerKnowledge),
    ),
    ...options.defenders.map((member) =>
      enlist(member, RAID_SIDE.defender, hostWorld, hostKnowledge),
    ),
  ];

  if (options.hostShelves !== undefined) {
    addUniversity(hostWorld, hostKnowledge, options.hostShelves, options.hostDurability ?? 512);
  }
  if (options.attackerSoldiers !== undefined) addSoldiers(attackerWorld, options.attackerSoldiers);
  if (options.defenderSoldiers !== undefined) addSoldiers(hostWorld, options.defenderSoldiers);

  const hostNodesBefore = [...existingNodesOf(hostWorld, hostKnowledge, hostSnapshot)].sort(
    (a, b) => a - b,
  );
  const attackerNodesBefore = [
    ...existingNodesOf(attackerWorld, attackerKnowledge, attackerSnapshot),
  ].sort((a, b) => a - b);

  const raid = openPortal({
    attacker: participant(
      attackerWorld,
      attackerKnowledge,
      attackerSnapshot,
      hostSnapshot.traditionId,
    ),
    host: participant(hostWorld, hostKnowledge, hostSnapshot, hostSnapshot.traditionId),
    registry,
    grid,
    tuning: { ...tuning, ...options.tuningOverride },
    raidSeed: options.seed ?? 0x5eed_1234,
  });
  deployRaid(raid);

  const outcome = runRaid(raid);

  // The engagement reading has to be taken while the engagement store still
  // exists, and before the write-back — which does not touch it, but reading
  // afterwards would make that a claim rather than an ordering.
  const briefByMage = new Map<Handle, CombatantBrief>();
  for (const roster of raid.rosters) {
    for (const brief of roster.briefs) {
      if (brief.sourceKind !== COMBATANT_SOURCE_KIND.mage) continue;
      briefByMage.set(brief.sourceId, brief);
    }
  }
  const combatants = componentOf(raid.engagement.entities, COMBATANT);
  const engagementRow = new Map<Handle, { hp: Fixed; maxHp: Fixed }>();
  for (const [mageId, brief] of briefByMage) {
    if (!combatants.has(brief.handle)) continue;
    engagementRow.set(mageId, {
      hp: combatants.get(brief.handle, 'hp'),
      maxHp: combatants.get(brief.handle, 'maxHp'),
    });
  }

  const applied = applyRaidOutcome(raid, outcome);

  // Keyed by `side:mageId`, never by handle alone. The two universes number
  // their entities independently, so the raider and the warden created first
  // both hold handle 1 — and a set of bare handles reports the defender as
  // stranded because the attacker beside her was. `CasualtyRecord` carries the
  // side precisely so this join has something to be correct about.
  const strandedMages = new Set<string>(
    outcome.casualties
      .filter((casualty) => casualty.stranded)
      .map((casualty) => `${String(casualty.side)}:${String(casualty.mageId)}`),
  );

  const fates: MageFate[] = enlisted.map((member) => {
    const brief = briefByMage.get(member.mageId);
    const row = engagementRow.get(member.mageId);
    const mages = componentOf(member.world, MAGE);
    const aliveAfter = mages.get(member.mageId, 'alive') === 1;
    const knownAfter = heldNodes(member.knowledge, member.mageId);
    const before = new Set(member.knownBefore);
    return {
      name: member.name,
      side: member.side,
      mageId: member.mageId,
      fielded: brief !== undefined,
      aliveBefore: member.aliveBefore,
      aliveAfter,
      died: member.aliveBefore && !aliveAfter,
      stranded: strandedMages.has(`${String(member.side)}:${String(member.mageId)}`),
      withdrew: brief?.withdrawn ?? false,
      captured: false,
      worldVigorBefore: member.vigorBefore,
      worldVigorAfter: mages.get(member.mageId, 'vigor'),
      engagementHpAtEnd: row?.hp,
      engagementMaxHp: row?.maxHp,
      tookDamage: row !== undefined && row.hp < row.maxHp,
      knownBefore: member.knownBefore,
      knownAfter,
      stolen: [...(brief?.stolen ?? [])].sort((a, b) => a - b),
      carriedHome: knownAfter.filter((node) => !before.has(node)),
    };
  });

  const hostNodesAfter = [...existingNodes(raid.host)].sort((a, b) => a - b);
  const attackerNodesAfter = [...existingNodes(raid.attacker)].sort((a, b) => a - b);

  closePortal(raid);

  return {
    raid,
    outcome,
    applied,
    fates,
    hostNodesBefore,
    hostNodesAfter,
    attackerNodesBefore,
    attackerNodesAfter,
    attackerWorld,
    hostWorld,
  };
}

/**
 * The nodes a universe has an instance of, before there is a `Raid` to ask.
 *
 * `existingNodes` takes a `RaidParticipant`, which only exists once the portal
 * is being opened; the "before" reading has to be taken earlier than that. So
 * this builds the participant shape `existingNodes` reads and asks it the same
 * question, rather than reimplementing §1.5's existence rule beside it.
 */
function existingNodesOf(
  world: SimState,
  knowledge: KnowledgeSubsystem,
  snapshot: RulesetSnapshot,
): ReadonlySet<ContentId> {
  return existingNodes(participant(world, knowledge, snapshot, snapshot.traditionId));
}

/** A fate by name, so a test reads as prose. */
export function fateOf(result: WarbandResult, name: string): MageFate {
  const found = result.fates.find((fate) => fate.name === name);
  if (found === undefined) throw new Error(`no mage named ${name} was sent`);
  return found;
}

/** The interned id of a node, re-exported so a test needs one import. */
export { nodeId };
