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
 * ## No draw, deliberately
 *
 * Nothing in this file takes an `rng`, and that is a design constraint rather
 * than an omission. `contracts.md` §6's stream registry is only worth having if
 * the subsystems that do not need randomness never take any: a decay roll would
 * have to belong to some stream, and every instance's forgetting would then
 * jostle the draw ordinals of whatever else shared it. Adding one here is a
 * signature change, which is what makes it a decision rather than an accident.
 */

import type { Fp } from '@mm/content';
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

/** Mastery after `elapsedTicks` of world time. Pure; identical inputs, identical output. */
export function decayedMastery(
  mastery: Fp,
  elapsedTicks: number,
  retention: Fp,
  dormant: boolean,
): Fp {
  if (elapsedTicks <= 0) return mastery;
  const lost = masteryDecayPerTick(retention) * elapsedTicks;
  return Math.max(mastery - lost, masteryFloor(retention, dormant));
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
 * Decays every held instance in the universe, destroying the dormant ones that
 * reach zero.
 *
 * @returns one loss event per node whose last instance this sweep destroyed,
 * in ascending slot order.
 */
export function decayHeldKnowledge(inputs: DecayInputs): KnowledgeLossEvent[] {
  const lost: KnowledgeLossEvent[] = [];
  for (const instance of inputs.knowledge.instances()) {
    const view = inputs.knowledge.read(instance);
    if (!isHeldLocation(view.locationKind)) continue;

    const dormant = !permits(inputs.ruleset, inputs.cells.cellOf(view.nodeId));
    const retention = inputs.retentionOf(view.locationId);
    const mastery = decayedMastery(view.mastery, inputs.elapsedTicks, retention, dormant);

    if (dormant && mastery <= 0) {
      const event = inputs.knowledge.destroyInstance(instance, inputs.worldTick);
      if (event !== undefined) lost.push(event);
      continue;
    }
    inputs.knowledge.setMastery(instance, mastery);
  }
  return lost;
}
