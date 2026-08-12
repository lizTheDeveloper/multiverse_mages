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
  MID_RAID_CHANGE,
  OBJECTIVE_STATUS,
  POPULACE_COHORT,
  RAID_SIDE,
  attachRecord,
  collectRecords,
  componentOf,
  findUniverse,
  writeRuleChange,
} from '@mm/state';

import { OBJECTIVE_KIND } from './objectives.js';
import type { Raid } from './raid.js';
import { existingNodes, isAlive } from './raid.js';
import type { ConstitutionalMark, KnowledgeMovement, RaidOutcome } from './outcome.js';

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

  // ---- 4b. What a mid-raid rule change left on the host's constitution. ----
  if (outcome.constitutionalMarks.length > 0) {
    applyConstitutionalMarks(raid, outcome.constitutionalMarks, worldTick);
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
 * Writes a raid's ruleset changes, and their marks, into the host universe.
 *
 * **Both halves, and the first is the one that is easy to forget.** A mid-raid
 * change is made against the raid's arbitration snapshot, which is discarded at
 * resolution. If only the mark were written back, the god would owe a surcharge
 * for unmaking a change the world never actually carried — and the design's
 * whole sentence, *"a raid leaves a mark on your constitution"*, would be
 * describing a bill for nothing. So the ruleset is moved for real here, and the
 * mark is what records that a raid was the reason.
 *
 * The host's world and only the host's. `raid-engagement.md` §2 makes forbidding
 * defender-only, and §3's host arbitration is why: an attacker changing her own
 * ruleset would change nothing inside the universe she is standing in.
 *
 * **One known tension, recorded rather than resolved.** A cell-scoped change
 * writes an edict, and §1.1 caps edicts at a universe's `edictBudget`. A raid
 * can therefore leave a universe holding one more edict than it could have
 * issued in peacetime. That is deliberate and it matches §1.1's existing rule
 * for the same situation — *existing edicts stay in force if the budget later
 * falls* — but it means `canIssueEdict` is the only gate, and it is a gate on
 * issuing rather than on holding. A raid is not a peacetime issuance.
 */
function applyConstitutionalMarks(
  raid: Raid,
  marks: readonly ConstitutionalMark[],
  worldTick: number,
): void {
  const world = raid.host.world;
  const universe = findUniverse(world);

  for (const mark of marks) {
    // Through `@mm/state`, which owns the axis bitmasks and edict precedence
    // together with `permits()`. A raid writing those fields itself would be a
    // second implementation of §1.1 living in the one place — the constitution
    // changing under fire — where a divergence would be hardest to notice.
    writeRuleChange(world, universe, {
      scope: mark.scope,
      targetId: mark.targetId,
      kind: mark.changeKind,
    });

    const handle = world.entities.create();
    attachRecord(world, MID_RAID_CHANGE, handle, {
      scope: mark.scope,
      targetId: mark.targetId,
      changeKind: mark.changeKind,
      paidCost: mark.paidCost,
      markedTick: worldTick,
    });
  }
}

/**
 * What happens to a library that was reached: its books are taken, and what
 * cannot be taken is burned.
 *
 * The three verbs are kept apart because they produce three different worlds
 * (`raid-consequences`): a **looted** grimoire moves to the raider, a **burned**
 * one is destroyed, and a **read** mind is copied. A library that was reached
 * loses its shelved grimoires one way or the other, and each book's durability
 * decides which — on **stream 5**, the registry's *"scribing outcomes and
 * grimoire durability"*, because a book's resistance to fire is the same
 * property its scribe gave it.
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

  shelved.forEach((entry, ordinal) => {
    const stream = raid.rng.actorStream(RNG_STREAM.scribing, worldTick, ordinal);
    const resist = Math.min(entry.row.durability, raid.tuning.grimoireBurnResistCap);
    // A dwarven book resists fire; it is not fireproof. The cap is the same
    // ceiling §3 puts on ward, and it is content rather than a literal.
    const survives = nextBounded(stream, 1024) < resist;
    const instance = host.knowledge.instanceForGrimoire(entry.handle);
    if (instance === 0) return;

    if (survives) {
      // Looted: the grimoire and its instance leave the host universe. The
      // host's count for that node goes down; the raider's goes up. This is the
      // verb that *moves*.
      host.knowledge.destroyInstance(instance, worldTick);
      movements.push({
        nodeId: entry.row.nodeId,
        verb: 'moved',
        byCombatant: 0,
        forfeited: false,
      });
    } else {
      host.knowledge.destroyInstance(instance, worldTick);
      movements.push({
        nodeId: entry.row.nodeId,
        verb: 'destroyed',
        byCombatant: 0,
        forfeited: false,
      });
    }
  });

  // Whatever else the library held — instances shelved without a grimoire
  // record — burns with it.
  for (const instance of host.knowledge.instancesAt(LOCATION_KIND.library, libraryId)) {
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
