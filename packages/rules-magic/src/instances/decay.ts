/*
 * Multiverse Mages — mastery decay, and the floorless kind that loses a node.
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
 * Forgetting, as a deterministic function of elapsed world ticks, the holder's
 * retention, and dormancy — and of nothing else.
 *
 * ## Three rules, and what each one is load-bearing for
 *
 * **Only minds decay.** `locationKind` mind and palace; a grimoire and a
 * shelved library book do not. A book's fragility is `durability`, not
 * forgetting, and conflating the two would make scribing pointless — the one
 * thing writing buys you is that the page does not get worse at remembering.
 *
 * **A held instance has a floor derived from retention.** A mage who genuinely
 * learned something does not silently forget it, so decay settles rather than
 * running to zero. Without the floor, a long-lived elf would forget her own
 * specialty while still alive, which contradicts the "deep specialists" the
 * species model is built on — and unbounded forgetting underneath a compounding
 * capital loop is a stability risk nobody can measure before 0.5.0.
 *
 * **A dormant instance has no floor and is destroyed at zero.** This is the
 * whole mechanism by which forbidding a cell actually costs a civilization
 * something. An interdiction does not erase knowledge on the tick it is issued
 * — that would make one edict a knowledge-genocide button and drown out the
 * mortality and raid signals `knowledgeHalfLife` exists to measure — it erases
 * it *gradually*, visibly, at a rate that differs by species, and recoverably
 * if the god changes their mind in time.
 *
 * **Decay never increases mastery.** The three rules above compose into one
 * invariant that is easy to lose by accident and was in fact lost once: a floor
 * bounds *further loss*, it is not a level an instance is raised to. See
 * {@link decayedMastery} for the re-permitted-fragment case that made this
 * explicit, and `knowledge-instances`' "Re-permitting a fragment does not
 * restore it" scenario.
 *
 * ## No draw, deliberately
 *
 * Nothing in this file takes an `rng`, and that is a design constraint rather
 * than an omission. `contracts.md` §6's stream registry is only worth having if
 * the subsystems that do not need randomness never take any: a decay roll would
 * have to belong to some stream, and every instance's forgetting would then
 * jostle the draw ordinals of whatever else shared it. Adding one here is a
 * signature change, which is what makes it a decision rather than an accident.
 */

import type { ContentId, Fp } from '@mm/content';
import type { Handle, Ruleset, Tick } from '@mm/state';
import { permits } from '@mm/state';
import { div, mul } from '@mm/sim-core';

import type { CellResolver } from './catalog.js';
import { MASTERY_DECAY_PER_TICK, MASTERY_FLOOR_SHARE, MASTERY_MAX } from './constants.js';
import type { KnowledgeLossEvent } from './outcomes.js';
import type { KnowledgeSubsystem } from './subsystem.js';
import { isHeldLocation } from './subsystem.js';

/**
 * The mastery an instance decays toward and never below.
 *
 * Zero when dormant — that is the entire difference between knowledge a
 * civilization merely neglects and knowledge its god has forbidden.
 */
export function masteryFloor(retention: Fp, dormant: boolean): Fp {
  if (dormant) return 0;
  return Math.min(mul(MASTERY_FLOOR_SHARE, retention), MASTERY_MAX);
}

/**
 * Mastery lost per world tick at a given retention. At least one unit, always.
 *
 * The clamp matters more than it looks. `div` rounds toward negative infinity,
 * so a high enough retention would round the per-tick loss to zero and decay
 * would silently switch off — a species that never forgets anything, produced
 * by rounding rather than by a decision, and visible only as a balance number
 * nobody can explain. This is the same trap `contracts.md` §1.6 flags for
 * `stabilityDecayPerTick`, in a different subsystem.
 */
export function masteryDecayPerTick(retention: Fp): Fp {
  if (retention <= 0) return MASTERY_DECAY_PER_TICK;
  return Math.max(div(MASTERY_DECAY_PER_TICK, retention), 1);
}

/**
 * Mastery after `elapsedTicks` of world time. Pure; identical inputs, identical
 * output, and **never greater than the mastery it was given**.
 *
 * ## The floor bounds further loss; it is not a level to be raised to
 *
 * `Math.max(mastery - lost, masteryFloor(...))` alone is only correct while
 * `mastery` is at or above the floor — which holds for an instance that has
 * always been non-dormant, because decay only ever subtracts. It stops holding
 * the moment an interdiction lifts. Dormant decay is floorless, so a survivor
 * can sit anywhere down to a single unit; the first non-dormant sweep after the
 * god relents would then clamp that fragment *up* to the ordinary retention
 * floor — a function named `decayedMastery` handing back more than it was
 * given, in one tick, worth over a hundred ticks of ordinary forgetting.
 *
 * That is a live exploit, not a curiosity: revoke an interdiction one tick
 * before an instance would have hit zero and been destroyed, and the fragment
 * is healed for free. It also inverts the file header's promise. Forbidding a
 * cell erases knowledge "gradually... and recoverably if the god changes their
 * mind in time" — recovering means *keeping what survived*, not being handed
 * back what was already lost. Nothing in this subsystem restores mastery;
 * **`practice.ts` does**, and it is the operation this sentence spent three
 * releases asking somebody to perform. Decay is still monotone: the two
 * operations move mastery in opposite directions and neither is allowed to move
 * it in the other's.
 *
 * So the floor is clamped to the incoming mastery before it is applied: decay
 * is a monotonically non-increasing function of mastery, unconditionally. An
 * instance already below its floor keeps exactly what it has and loses no more,
 * which is the weakest reading that is still monotone — the alternative,
 * letting it keep falling to zero, would delete knowledge the god has already
 * un-forbidden.
 *
 * `knowledge-instances`' spec MUST clause bounds decay only from below, so this
 * is settled on the module's own prose plus the exploit above, and the spec's
 * decay requirement has been amended to say it outright.
 */
export function decayedMastery(
  mastery: Fp,
  elapsedTicks: number,
  retention: Fp,
  dormant: boolean,
): Fp {
  if (elapsedTicks <= 0) return mastery;
  const lost = masteryDecayPerTick(retention) * elapsedTicks;
  const floor = Math.min(masteryFloor(retention, dormant), mastery);
  return Math.max(mastery - lost, floor);
}

export interface DecayInputs {
  readonly knowledge: KnowledgeSubsystem;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  /** World ticks elapsed since the last sweep. */
  readonly elapsedTicks: number;
  /** The tick a destroyed instance is reported lost on. */
  readonly worldTick: Tick;
  /**
   * The holder's species `retention` (`contracts.md` §2.4).
   *
   * A callback keyed on the opaque holder handle rather than a value, because
   * one sweep covers holders of different species and this package may not read
   * a species record to find out which. `rules-world` knows; this asks.
   */
  retentionOf(holder: Handle): Fp;
}

/**
 * Decays every held instance in the universe, destroying any that reach zero.
 *
 * ## Zero mastery is destruction whether or not the cell is forbidden
 *
 * `knowledge-instances` only *requires* destruction on the dormant path, and
 * for a while this loop only implemented that — because a non-dormant instance
 * was assumed to be caught by its retention floor before reaching zero. It is
 * not, at low enough retention: `masteryFloor` is `mul(MASTERY_FLOOR_SHARE,
 * retention)`, which floors to `0` for any retention at or below `3`, and
 * `species.schema.json` admits fixed-point traits down to `1`. Shipped v1
 * content sits between `512` and `1536`, so this is an authoring hazard rather
 * than a live bug — but the failure it produces is silent and permanent.
 *
 * The failure is a zombie instance: mastery `0`, still counted by the existence
 * index, so the node "exists" in a universe where nobody knows any of it. It
 * can never be taught (the eligibility threshold), never be scribed, and never
 * emit the loss event that `knowledgeHalfLife` and `libraryDependence` are
 * computed from — the node would simply never die, and the 0.3.0 measurements
 * would be quietly wrong rather than visibly absent. Destroying at zero on both
 * paths keeps existence meaning "somebody knows this", which is what
 * `contracts.md` says an instance is for.
 *
 * Dormancy is still the whole distinction, and it is unchanged: it is the
 * *floor* that dormancy removes, and a non-dormant instance under any content
 * a sane author writes never reaches zero to begin with.
 *
 * @returns one loss event per node whose last instance this sweep destroyed,
 * in ascending slot order.
 */
export function decayHeldKnowledge(inputs: DecayInputs): KnowledgeLossEvent[] {
  const lost: KnowledgeLossEvent[] = [];
  // Dormancy is a fact about the ruleset and the node, not about the instance,
  // and the sweep asks it once per instance — thousands of times a tick for the
  // handful of distinct nodes a universe knows. The ruleset cannot change
  // inside one sweep, so the answers are reused within it and discarded with
  // it. Nothing here caches across a tick.
  const dormantByNode = new Map<ContentId, boolean>();
  for (const instance of inputs.knowledge.instances()) {
    const view = inputs.knowledge.read(instance);
    if (!isHeldLocation(view.locationKind)) continue;

    let dormant = dormantByNode.get(view.nodeId);
    if (dormant === undefined) {
      dormant = !permits(inputs.ruleset, inputs.cells.cellOf(view.nodeId));
      dormantByNode.set(view.nodeId, dormant);
    }
    const retention = inputs.retentionOf(view.locationId);
    const mastery = decayedMastery(view.mastery, inputs.elapsedTicks, retention, dormant);

    if (mastery <= 0) {
      const event = inputs.knowledge.destroyInstance(instance, inputs.worldTick);
      if (event !== undefined) lost.push(event);
      continue;
    }
    inputs.knowledge.setMastery(instance, mastery);
  }
  return lost;
}
