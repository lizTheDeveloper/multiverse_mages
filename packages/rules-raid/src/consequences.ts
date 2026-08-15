/*
 * Multiverse Mages — what a raid does to two worlds, applied all at once.
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
 * The write-back: one delta, one ordered application, and no half-updated world.
 *
 * ## Why the order is what it is
 *
 * 1. **Casualties.** A mage at zero hit points is dead in her own universe, and
 *    her mind and memory palace empty through `knowledge-model`'s ordinary death
 *    path rather than through a special raid rule. A detachment decrements its
 *    cohort by exactly its strength. Summons write back nothing — they never
 *    existed at world scale, so there is nothing for them to have been.
 * 2. **Stranded raiders.** An attacker still on the field at collapse is lost
 *    with the portal, and takes what she stole with her.
 * 3. **Instance destruction and transfer.** Burned libraries lose their
 *    contents; looted grimoires *move* rather than vanish.
 * 4. **Theft insertion.** What a surviving raider took is created in her
 *    universe at zero mastery.
 * 5. **Existence recomputation.** Both universes' node existence is recomputed
 *    from the instance index — never cached (§1.5) — and the nodes that fell to
 *    zero are recorded.
 *
 * **Step 4 precedes step 5 deliberately.** A node whose last host instance
 * burned in the same raid that a raider stole it *survives* — abroad, in the
 * mind of the thief who took it, and lost forever to the universe that invented
 * it. That is the most evocative outcome the knowledge model can produce and it
 * should be reachable rather than accidentally ordered out of existence.
 *
 * ## Atomic, and what that costs
 *
 * Worlds are persistent across runs (vision §8a), so a partial application on a
 * crashed worker is a corrupted universe rather than a lost battle. The whole
 * delta is computed first — {@link RaidOutcome} — and then applied by a function
 * that performs no arithmetic that could throw. Where a step *could* fail, it is
 * validated in the planning pass rather than defended in the applying one: a
 * try/catch around a half-applied write is not atomicity, it is a smaller
 * window.
 */

import type { ContentId } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import { RNG_STREAM, floorDiv, nextBounded } from '@mm/sim-core';
import type { Handle } from '@mm/state';
import {
  COMBATANT_SOURCE_KIND,
  GRIMOIRE,
  HOLDER_KIND,
  LOCATION_KIND,
  MAGE,
  OBJECTIVE_STATUS,
  POPULACE_COHORT,
  RAID_SIDE,
  attachRecord,
  collectRecords,
  componentOf,
} from '@mm/state';
import { destroyGrimoire } from '@mm/rules-magic';

import { OBJECTIVE_KIND } from './objectives.js';
import type { Raid } from './raid.js';
import { existingNodes, isAlive } from './raid.js';
import type { KnowledgeMovement, RaidOutcome } from './outcome.js';

/** What the write-back changed, over and above the outcome record it applied. */
export interface AppliedConsequences {
  readonly nodesLostByHost: readonly ContentId[];
  readonly nodesGainedByRaider: readonly ContentId[];
}

/**
 * Applies a resolved raid to both worlds.
 *
 * @throws Error if the raid has not been resolved. Applying an unresolved raid
 * would write a battle that has not finished, and the shape of that failure —
 * a universe missing some of its casualties — is one nobody would recognise.
 */
export function applyRaidOutcome(raid: Raid, outcome: RaidOutcome): AppliedConsequences {
  const hostBefore = existingNodes(raid.host);
  const raiderBefore = existingNodes(raid.attacker);
  const worldTick = raid.host.world.clock.worldTick;

  // ---- 1 & 2. Casualties, stranded raiders included. ----
  for (const casualty of outcome.casualties) {
    const participant = casualty.side === RAID_SIDE.attacker ? raid.attacker : raid.host;
    const mages = componentOf(participant.world, MAGE);
    if (!mages.has(casualty.mageId)) continue;
    // The one write to `alive`, and it is only ever to 0. Nothing in this
    // package sets it to 1; the conformance scan says so.
    mages.set(casualty.mageId, 'alive', 0);
    // Her mind and her palace empty through knowledge-model's ordinary death
    // path. A special raid rule here would be a second way for a mage to lose
    // what she knew, and the two would drift.
    participant.knowledge.destroyInstancesHeldBy(casualty.mageId, worldTick);
  }

  for (const loss of outcome.cohortLosses) {
    const participant = loss.side === RAID_SIDE.attacker ? raid.attacker : raid.host;
    const cohorts = componentOf(participant.world, POPULACE_COHORT);
    if (!cohorts.has(loss.cohortId)) continue;
    const remaining = cohorts.get(loss.cohortId, 'count') - loss.count;
    // Never below zero. A cohort that lent more detachments than it had people
    // is a bug in derivation, and a negative count would turn it into a
    // population that grows when it is attacked.
    cohorts.set(loss.cohortId, 'count', remaining > 0 ? remaining : 0);
  }

  // ---- 3. Instance destruction and transfer. ----
  const movements: KnowledgeMovement[] = [...outcome.knowledgeMovements];
  for (const objective of outcome.objectives) {
    if (objective.kind !== OBJECTIVE_KIND.library) continue;
    if (objective.status === OBJECTIVE_STATUS.held) continue;
    movements.push(...settleLibrary(raid, objective.targetId, worldTick));
  }

  // ---- 4. Theft insertion, before existence is recomputed. ----
  const gained: ContentId[] = [];
  for (const movement of movements) {
    if (movement.verb !== 'copied' || movement.forfeited) continue;
    const thief = thiefMageOf(raid, movement.byCombatant);
    if (thief === 0) continue;
    raid.attacker.knowledge.createInstance({
      nodeId: movement.nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: thief,
      // The world tick the raid resumes at, which is the tick it paused at:
      // a raid consumes zero world ticks.
      acquiredTick: raid.attacker.world.clock.worldTick,
      // Zero mastery. She has the shape of it and not the practice, so she
      // cannot teach it onward without further study — which is what keeps
      // theft from being a shortcut past the whole knowledge model.
      mastery: 0,
    });
    gained.push(movement.nodeId);
  }

  // ---- 5. Existence, recomputed and never cached (§1.5). ----
  const hostAfter = existingNodes(raid.host);
  const raiderAfter = existingNodes(raid.attacker);

  const nodesLostByHost = [...hostBefore].filter((nodeId) => !hostAfter.has(nodeId)).sort((a, b) => a - b);
  const nodesGainedByRaider = [...raiderAfter]
    .filter((nodeId) => !raiderBefore.has(nodeId))
    .sort((a, b) => a - b);

  // `gained` and `nodesGainedByRaider` are deliberately different lists.
  // The first is every instance inserted; the second is every node that was not
  // in the universe before. A raider who steals a node her own universe already
  // knows has gained an instance and not a node, and only the second reading is
  // what §1.5's existence question means.
  void gained;

  return { nodesLostByHost, nodesGainedByRaider };
}

/**
 * What happens to a library that was reached: the raiders carry off what they
 * can, and what they leave behind burns unless it was made well enough not to.
 *
 * **This is the only path in the game that moves or destroys written
 * knowledge.** Until something called it, `durability` was a field written once
 * at scribing and read nowhere, `destroyGrimoire` and `destroyLibrary` had no
 * production callers at all, and the only knowledge a universe could ever lose
 * was whatever its own god interdicted — loss was a thing the player
 * administered rather than feared.
 *
 * Vision §8 gives the attacker two verbs, not one: *"attacker wins by
 * **destroying or looting** a target"*. §5 makes the difference mechanical — a
 * grimoire is *"portable, lootable, burnable"* — and the two produce genuinely
 * different worlds:
 *
 * - **Looted.** The book *moves*. The host's copy is gone and the raider's
 *   universe has one it did not have. Nothing leaves the multiverse; it changes
 *   hands. This is the verb that matters most: a god can only research what
 *   their own ruleset permits, so a book taken from a universe that permitted
 *   other cells is knowledge no amount of domestic research could ever have
 *   reached. §4a's split is what makes it survive the trip — *"what a raider
 *   knows and how she carries it follow her own"* tradition, not the host's —
 *   and a node her own universe forbids arrives real and inert, which is
 *   `raid-engagement`'s own task 8.14.
 * - **Burned.** The instance is destroyed. If it was the last one anywhere, §8's
 *   stake applies in full: *"knowledge whose last instance dies with a mage or
 *   burns in a library is lost and must be rediscovered"*.
 *
 * How many books a warband carries is {@link RaidTuning.lootedGrimoiresPerRaid},
 * an untuned content magnitude. A raid that took everything would make burning
 * unreachable and durability decorative; a raid that took nothing would leave
 * the multiverse's 249 nodes outside the enabled cells permanently out of
 * anyone's reach.
 *
 * **Durability gates burning and nothing else, and that is a decision this
 * change declines to extend.** §6's *"dwarven grimoires resist destruction"* is
 * about fire, and the roll is taken on **stream 5** — the registry's *"scribing
 * outcomes and grimoire durability"* — because a book's resistance to fire is
 * the same property its scribe gave it. Whether a well-made book should also be
 * *harder to carry off* is not something vision §5, §6 or §8 says, and it is a
 * rule rather than a magnitude, so it is raised here rather than answered:
 * making durability resist looting would turn the dwarf's line into a general
 * defence of the archive, which is a different and larger claim than the one
 * the species table makes.
 *
 * Memory palace instances are untouched here and cannot be: they are not at a
 * library, they are in a mage's head, and the Art of Memory's `store` hook
 * declares them unburnable and unlootable. A palace dies with its holder and by
 * no other route.
 */
function settleLibrary(raid: Raid, libraryId: Handle, worldTick: number): KnowledgeMovement[] {
  const movements: KnowledgeMovement[] = [];
  const host = raid.host;
  const shelved = collectRecords(host.world, GRIMOIRE).filter(
    (entry) => entry.row.holderKind === HOLDER_KIND.library && entry.row.holderId === libraryId,
  );

  // Instances that survived on their shelf, so the sweep below — which exists
  // for whatever the library held *without* a grimoire record — does not burn
  // the books this loop just spared. A shelved grimoire's instance sits at
  // `(library, libraryId)`, the same address a loose one does, so the two are
  // distinguishable only by having been walked here first.
  const spared = new Set<Handle>();
  let carried = 0;

  shelved.forEach((entry, ordinal) => {
    const instance = host.knowledge.instanceForGrimoire(entry.handle);
    if (instance === 0) return;

    if (carried < raid.tuning.lootedGrimoiresPerRaid) {
      carried += 1;
      const view = host.knowledge.read(instance);
      // Read before the destroy, because the destroy is what makes the answer
      // unavailable. Ascending shelf order, so two peers carry the same books.
      destroyGrimoire(host.knowledge, entry.handle, worldTick);
      shelveLoot(raid, entry.row.nodeId, entry.row.durability, view.mastery, worldTick);
      movements.push({
        nodeId: entry.row.nodeId,
        verb: 'moved',
        byCombatant: 0,
        forfeited: false,
      });
      return;
    }

    const stream = raid.rng.actorStream(RNG_STREAM.scribing, worldTick, ordinal);
    // A dwarven book resists fire; it is not fireproof. The cap is the same
    // ceiling §3 puts on ward, and it is content rather than a literal.
    const resist = Math.min(entry.row.durability, raid.tuning.grimoireBurnResistCap);
    if (nextBounded(stream, 1024) < resist) {
      spared.add(instance);
      return;
    }

    // `destroyGrimoire` rather than a bare `destroyInstance`: it is
    // `knowledge-model`'s own name for this, it owns the book-and-contents
    // pair, and routing through it is what keeps this from becoming a second
    // destruction mechanism beside the one the model already publishes.
    destroyGrimoire(host.knowledge, entry.handle, worldTick);
    movements.push({
      nodeId: entry.row.nodeId,
      verb: 'destroyed',
      byCombatant: 0,
      forfeited: false,
    });
  });

  // Whatever else the library held — instances shelved without a grimoire
  // record — burns with it. Nothing gave those a durability, so nothing
  // resists.
  for (const instance of host.knowledge.instancesAt(LOCATION_KIND.library, libraryId)) {
    if (spared.has(instance)) continue;
    const view = host.knowledge.read(instance);
    host.knowledge.destroyInstance(instance, worldTick);
    movements.push({
      nodeId: view.nodeId,
      verb: 'destroyed',
      byCombatant: 0,
      forfeited: false,
    });
  }

  return movements;
}

/**
 * Puts a looted book on the raider's side of the portal.
 *
 * Unowned rather than shelved, and that is the same choice `disownGrimoire`
 * makes for a dead author's library: the raider's universe may have no library
 * at all, and inventing a shelf for a book to land on would be this function
 * deciding where another universe keeps its things. An unowned book is still a
 * book — its node exists in that universe, and §1.5's existence question is
 * answered by the instance and not by who is holding it.
 *
 * The book keeps its durability, because durability is a fact about how it was
 * made and not about who owns it: a dwarven grimoire carried home by an orc is
 * still a dwarven grimoire, and it is what makes the raid a transfer of
 * *quality* and not only of contents.
 */
function shelveLoot(
  raid: Raid,
  nodeId: ContentId,
  durability: Fixed,
  mastery: Fixed,
  worldTick: number,
): void {
  const world = raid.attacker.world;
  const grimoire = world.entities.create();
  attachRecord(world, GRIMOIRE, grimoire, {
    nodeId,
    durability,
    holderKind: HOLDER_KIND.unowned,
    holderId: 0,
  });
  raid.attacker.knowledge.createInstance({
    nodeId,
    locationKind: LOCATION_KIND.grimoire,
    locationId: grimoire,
    // The world tick the raid resumes at, which is the tick it paused at: a
    // raid consumes zero world ticks.
    acquiredTick: worldTick,
    // The mastery the book was written at, carried across unchanged. A book
    // does not forget on the journey, and re-rolling it here would make the
    // same grimoire worth different amounts depending on who took it.
    mastery,
    grimoire,
  });
}

/** The world mage behind a combatant handle, or `0` if there is none. */
function thiefMageOf(raid: Raid, combatant: Handle): Handle {
  for (const brief of raid.rosters[RAID_SIDE.attacker].briefs) {
    if (brief.handle !== combatant) continue;
    if (brief.sourceKind !== COMBATANT_SOURCE_KIND.mage) return 0;
    return brief.sourceId;
  }
  return 0;
}

/**
 * Whether any attacker combatant is still standing on the field.
 *
 * Used by the stranded-raider rule and nothing else. Written here rather than
 * inline so that "still on the field" has one definition: alive, and not
 * withdrawn.
 */
export function strandedAttackers(raid: Raid): number {
  let count = 0;
  for (const brief of raid.rosters[RAID_SIDE.attacker].briefs) {
    if (isAlive(raid, brief) && !brief.withdrawn) count += 1;
  }
  return count;
}

/** The vigor a combatant has left, for the observation block's own summary. */
export function fractionOf(part: Fixed, whole: Fixed): Fixed {
  if (whole <= 0) return 0;
  return floorDiv(part * 1024, whole);
}

/** Every attacker who came home, and what each brought. */
export function returnedWithKnowledge(raid: Raid): readonly (readonly [Handle, readonly ContentId[]])[] {
  const out: (readonly [Handle, readonly ContentId[]])[] = [];
  for (const brief of raid.rosters[RAID_SIDE.attacker].briefs) {
    if (!brief.withdrawn || !isAlive(raid, brief)) continue;
    if (brief.stolen.length === 0) continue;
    out.push([brief.sourceId, [...brief.stolen]] as const);
  }
  return out;
}
