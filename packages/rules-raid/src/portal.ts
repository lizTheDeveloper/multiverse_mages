/*
 * Multiverse Mages — who may open a portal, and what stands on the field when
 * one does.
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
 * The open-portal gate, and the deployment that follows it.
 *
 * ## The gate is the **attacker's** ruleset alone
 *
 * The portal spell is cast in the attacker's own sky, so the attacker's universe
 * must permit `rego-limen` and must have a living mage holding a node carrying
 * the `portal` primitive. The host's ruleset governs everything cast *after*
 * arrival and nothing before it.
 *
 * The alternative — requiring both ends to permit `rego-limen` — was rejected
 * for a design reason and a rules reason, and the consequence is stated plainly
 * so that it reads as design rather than as an oversight:
 *
 * - **Design.** Forbidding one form would grant total raid immunity, which is a
 *   strictly dominant play the moment any player finds it, and it would collapse
 *   the whole engagement layer for that matchup.
 * - **Rules.** Vision §3 scopes arbitration to magic *cast inside* a universe,
 *   and the opening is not cast inside the host.
 *
 * So: **forbidding `rego-limen` denies you the ability to raid, never the
 * ability to be raided.**
 *
 * ## A failed gate is a mask, never an exception
 *
 * `contracts.md` §4.2 requires an illegal action to be *"a no-op and a counter
 * increment — never an exception, never a silent partial effect"*. This module
 * therefore answers a **question** — {@link portalGate} — and the action layer
 * masks on the answer. Nothing here throws on a refusal, because a throw
 * crossing into `agent-api` would be an exception an RL agent could provoke a
 * thousand times a second.
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import { NULL_ENTITY } from '@mm/sim-core';
import type { Handle, RaidSideValue, Ruleset } from '@mm/state';
import { COMBATANT_SOURCE_KIND, MAGE, RAID_SIDE, collectRecords, permits } from '@mm/state';
import type { MagicGrid } from '@mm/rules-magic';
import { costSplit, prepare } from '@mm/rules-magic';

import { COMBAT_PRIMITIVES } from './arbitration.js';
import type { EligibleMage } from './combatants.js';
import {
  DEFENDING_ROLES,
  RAIDING_ROLES,
  eligibleCohorts,
  eligibleMages,
  mageMaxHp,
  sideHasRoom,
  spawnCombatant,
} from './combatants.js';
import { generateObjectives, readObjectiveSources } from './objectives.js';
import type { Raid, RaidParticipant } from './raid.js';
import { CASTABLE_MASTERY, deploymentPosition, heldInstancesOf } from './raid.js';
import type { RaidTuning } from './tuning.js';

/** `contracts.md` §2.2: the one cell the v1 subset is required to include. */
export const PORTAL_CELL_ID = 'rego-limen';

/** Why a portal may not open, or `''` if it may. */
export type PortalRefusal =
  | ''
  /** The attacker's own ruleset forbids `rego-limen`, by axis or by edict. */
  | 'cell-forbidden'
  /** No living mage of the attacker usably holds a node carrying `portal`. */
  | 'knowledge-lost'
  /** The attacker cannot pay for action 14. */
  | 'unaffordable'
  /** A raid is already in progress. Nested raids are forbidden. */
  | 'already-engaged';

/** What the gate found. */
export interface PortalGate {
  readonly open: boolean;
  readonly refusal: PortalRefusal;
}

const ALLOWED: PortalGate = Object.freeze({ open: true, refusal: '' as const });

function refuse(refusal: Exclude<PortalRefusal, ''>): PortalGate {
  return { open: false, refusal };
}

/**
 * Whether the attacking universe may open a portal at all.
 *
 * The host is not a parameter, and that absence is the rule: *"the host
 * universe's ruleset MUST NOT be consulted when deciding whether a portal may
 * open."* A signature that could not consult it is a stronger guarantee than a
 * comment saying it does not.
 */
export function portalGate(options: {
  readonly attackerWorld: SimState;
  readonly attackerRuleset: Ruleset;
  readonly registry: ContentRegistry;
  readonly grid: MagicGrid;
  readonly favor: Fixed;
  readonly favorCost: Fixed;
  readonly alreadyEngaged: boolean;
  readonly heldOf: (mage: Handle) => readonly { readonly nodeId: ContentId; readonly locationKind: number; readonly mastery: Fixed }[];
}): PortalGate {
  // Nested raids are forbidden: a universe participates in at most one raid at
  // a time, and the open-portal action is masked while the clock is in
  // engagement mode.
  if (options.alreadyEngaged) return refuse('already-engaged');

  const portalCell = options.grid.cellByName(PORTAL_CELL_ID).cellId;
  if (!permits(options.attackerRuleset, portalCell)) return refuse('cell-forbidden');

  if (!hasPortalKnowledge(options)) return refuse('knowledge-lost');

  if (options.favor < options.favorCost) return refuse('unaffordable');

  return ALLOWED;
}

/**
 * Whether any living mage usably holds a node carrying the `portal` primitive.
 *
 * "Usably" is doing real work: a node held only in a book on a shelf is not a
 * spell anybody can cast, and a node below the activation threshold is knowledge
 * that does not do anything yet. Both are `rules-magic`'s rules, applied here
 * rather than re-derived.
 *
 * This is also what makes the scenario *"portal knowledge has been lost"* real
 * rather than theoretical: when the last instance of every `portal`-carrying
 * node is destroyed — in a raid, by a dead mage, by a burned library — the
 * action masks itself until such a node is rediscovered or re-taught.
 */
function hasPortalKnowledge(options: {
  readonly attackerWorld: SimState;
  readonly registry: ContentRegistry;
  readonly heldOf: (mage: Handle) => readonly { readonly nodeId: ContentId; readonly locationKind: number; readonly mastery: Fixed }[];
}): boolean {
  for (const entry of collectRecords(options.attackerWorld, MAGE)) {
    if (entry.row.alive !== 1) continue;
    for (const instance of options.heldOf(entry.handle)) {
      if (instance.mastery < CASTABLE_MASTERY) continue;
      const node = options.registry.node(instance.nodeId);
      if (node === undefined) continue;
      if (node.effects.some((effect) => effect.primitive === COMBAT_PRIMITIVES.portal)) return true;
    }
  }
  return false;
}

/**
 * Derives both sides' combatants and generates the objectives.
 *
 * Called once, immediately after `openPortal`. Split from it so that the two
 * halves are separately testable: a raid with a battlefield and no combatants is
 * a legitimate thing to construct in a test about terrain, and a raid whose
 * deployment threw halfway would otherwise leave a half-populated engagement.
 */
export function deployRaid(raid: Raid): void {
  deploySide(raid, RAID_SIDE.attacker, raid.attacker, RAIDING_ROLES);
  deploySide(raid, RAID_SIDE.defender, raid.host, DEFENDING_ROLES);

  const defenders = eligibleMages(
    raid.host.world,
    DEFENDING_ROLES,
    (mage) => heldInstancesOf(raid.host, mage),
    raid.grid,
  );
  const archmage = defenders[0];
  raid.objectives.push(
    ...generateObjectives(
      raid.engagement.entities,
      readObjectiveSources(
        raid.host.world,
        (library) => raid.host.knowledge.instancesAt(3, library),
        (instance) => raid.host.knowledge.read(instance).nodeId,
        { handle: archmage?.handle ?? NULL_ENTITY, tier: archmage?.deepestTier ?? 0 },
        raid.grid,
      ),
      raid.tuning,
      raid.terrain,
      raid.rng,
    ),
  );
}

/** Everything one side brings: its mages first, then whatever soldiers remain. */
function deploySide(
  raid: Raid,
  side: RaidSideValue,
  participant: RaidParticipant,
  roles: ReadonlySet<number>,
): void {
  const roster = raid.rosters[side];
  const tuning: RaidTuning = raid.tuning;

  const mages = eligibleMages(
    participant.world,
    roles,
    (mage) => heldInstancesOf(participant, mage),
    raid.grid,
  );

  for (const mage of mages) {
    if (!sideHasRoom(roster, tuning)) break;
    spawnMage(raid, side, participant, mage);
  }

  for (const cohort of eligibleCohorts(participant.world)) {
    let remaining = cohort.record.count;
    while (remaining >= tuning.detachmentStrength && sideHasRoom(roster, tuning)) {
      spawnCombatant(raid.engagement.entities, roster, {
        side,
        // §1.3: a cohort is never promoted to individuals. It lends a counted
        // portion of itself and gets the survivors back.
        sourceKind: COMBATANT_SOURCE_KIND.soldierDetachment,
        sourceId: cohort.handle,
        position: deploymentPosition(raid, side, roster.nextSpawnOrdinal),
        hp: tuning.detachmentMaxHp,
        vigor: 0,
        concealment: 0,
        intrinsicDamage: tuning.detachmentDamage,
        intrinsicRange: tuning.detachmentRange,
        detachmentStrength: tuning.detachmentStrength,
      });
      remaining -= tuning.detachmentStrength;
    }
  }
}

/**
 * One mage, with the two things arbitration computes once at portal open: her
 * legal-node mask, and her readied list.
 *
 * The order is load-bearing. The mask is computed **first**, and the readied
 * list is drawn from it — *"those nodes are excluded from `preparedSpells`,
 * because the legal-node mask is applied before preparation"*. Preparing first
 * and filtering afterwards would produce a raider who arrives holding spells she
 * cannot cast, which is a different and worse mechanic: it wastes her slots
 * under a `prepared` host hook.
 */
function spawnMage(
  raid: Raid,
  side: RaidSideValue,
  participant: RaidParticipant,
  mage: EligibleMage,
): void {
  const roster = raid.rosters[side];
  const held = mage.held;
  const legalNodes = raid.arbiter.legalNodeMask(held, CASTABLE_MASTERY);
  const defences = raid.arbiter.passiveDefences(
    held,
    CASTABLE_MASTERY,
    raid.tuning.combatantBaseConcealment,
  );

  // `contracts.md` §1.6: readied at home, spent abroad. The candidate pool is
  // what her **home** `store` hook makes reachable; the readied list is the
  // **host's** `cast` hook applied to it. Both halves are already implemented in
  // `@mm/rules-magic`, and are used rather than re-derived.
  const reachable = held
    .filter((instance) =>
      participant.hooks.homeStore.holdableLocationKinds.includes(instance.locationKind as 1 | 2 | 3 | 4),
    )
    .map((instance) => instance.nodeId)
    .filter((nodeId) => legalNodes.has(nodeId))
    .sort((a, b) => a - b);

  // `prepare`, one node at a time, rather than a slice. It is the same list
  // under both v1 cast kinds — the loop stops at the first refusal, and a slot
  // bound refuses in exactly the position `slice` would have cut — and it is the
  // hook's own rule rather than this module's reading of it. `prepare` had no
  // production caller anywhere; a third cast kind with a rule about *what* may
  // be readied, not only how many, would have been authored and ignored here.
  //
  // `usable` and `dormant` are settled rather than re-asked: `reachable` is
  // already filtered to instances her home `store` hook holds, above
  // `CASTABLE_MASTERY`, in cells the host permits — `legalNodes` is that mask,
  // and the module note says it is applied *before* preparation on purpose.
  const hostCast = participant.hooks.hostCast;
  let preparedSpells: readonly number[] = reachable;
  if (hostCast.preparationRequired) {
    let readied: readonly number[] = [];
    for (const nodeId of reachable) {
      const outcome = prepare(hostCast, readied, { nodeId, usable: true, dormant: false });
      if (!outcome.prepared) break;
      readied = outcome.preparedSpells;
    }
    preparedSpells = readied;
  }

  const wardSources: Fixed[] = defences.ward > 0 ? [defences.ward] : [];

  spawnCombatant(raid.engagement.entities, roster, {
    side,
    sourceKind: COMBATANT_SOURCE_KIND.mage,
    sourceId: mage.handle,
    position: deploymentPosition(raid, side, roster.nextSpawnOrdinal),
    hp: mageMaxHp(raid.tuning, participant.speciesOf(mage.record.speciesId), mage.deepestTier),
    vigor: Math.max(0, mage.record.maxVigor - readyingCost(raid, preparedSpells)),
    concealment: defences.concealment,
    legalNodes,
    knownNodes: new Set(held.map((instance) => instance.nodeId)),
    preparedSpells,
    wardSources,
  });
}

/**
 * What readying this list cost, before a single spell is released.
 *
 * The half of the `cost` hook the game never charged. `castCost` was live in
 * `arbitration.resolveCast` and `costSplit` — the function whose entire purpose
 * is that the two halves sum to the base price under every kind — had no caller,
 * so a `prepaid` tradition was not a tradition that charges early. It was a
 * tradition that **charges nothing**: `resolveCast` returned `castCost(prepaid,
 * price) === 0`, and `firstCastableNode` skips the affordability test outright
 * when `paidAtPreparation`. Vancian memorisation, the reference universe's own
 * tradition, cast for free and without limit.
 *
 * `costSplit` rather than `preparationCost` alone, deliberately: the invariant
 * worth honouring is that the two halves sum to the base cost, and reading the
 * pair from the function that states it is what keeps the release side from
 * being charged twice when a kind changes.
 *
 * **The host's `cost` hook, not the raider's.** Her preparations are readied at
 * portal entry, which is the moment this runs, and the host is who prices
 * everything from that moment on — `firstCastableNode` already reads
 * `hostCost.paidAtPreparation` for the same decision, so one hook answers the
 * whole question. §1.6's split gives `preparedSpells` a *home* origin and no
 * home price; that a `prepaid` raider entering a `standard` sky therefore pays
 * at release and not at readying is the split working, not a gap in it.
 *
 * Untuned, like every magnitude it reads.
 */
function readyingCost(raid: Raid, preparedSpells: readonly number[]): Fixed {
  const hostCost = raid.host.hooks.hostCost;
  let total = 0;
  for (const nodeId of preparedSpells) {
    const node = raid.registry.node(nodeId);
    if (node === undefined) continue;
    const price = raid.tuning.castVigorBase + raid.tuning.castVigorPerTier * node.tier;
    total += costSplit(hostCost, price).atPreparation;
  }
  return total;
}
