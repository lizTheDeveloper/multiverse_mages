/*
 * Multiverse Mages — what a raid leaves behind, computed before anything moves.
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
 * The `RaidOutcome` record: the complete, immutable description of what a raid
 * did, computed **before** a single field of either world state is written.
 *
 * Two things depend on it being complete before application, and they are
 * different things:
 *
 * - **Atomicity.** A raid never leaves either world partially updated. Worlds
 *   are persistent across runs (vision §8a), so a partial application on a
 *   crashed worker is a corrupted universe rather than a lost battle. Computing
 *   the whole delta first is what makes "apply it or apply none of it" a
 *   property of the code rather than a hope about where it might fail.
 * - **Measurement.** `contracts.md` §7 asks four raid metrics of this record,
 *   and asks them *without re-simulating*: `raidLengthDistribution`,
 *   `libraryDependence`'s raid contribution, `winRateByPrimitive`, and the
 *   arbitration invariant. A record that had to be recomputed from the world
 *   afterwards would measure the world, not the raid.
 */

import type { ContentId } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import type { Handle, RaidSideValue } from '@mm/state';

import type { ObjectiveKindValue } from './objectives.js';
import type { RaidEndReasonValue } from './termination.js';

/** One mage who does not come home. */
export interface CasualtyRecord {
  readonly side: RaidSideValue;
  /** The mage's handle in her **own** universe. */
  readonly mageId: Handle;
  /** True when she was alive at collapse and had not withdrawn. */
  readonly stranded: boolean;
}

/** One cohort that lent a detachment and did not get it back. */
export interface CohortLossRecord {
  readonly side: RaidSideValue;
  readonly cohortId: Handle;
  /** People lost. Exactly the detachment's strength, never a fraction of it. */
  readonly count: number;
}

/** One objective, as it stood when the portal closed. */
export interface ObjectiveOutcome {
  readonly kind: ObjectiveKindValue;
  readonly targetId: Handle;
  readonly value: Fixed;
  /** {@link OBJECTIVE_STATUS}. */
  readonly status: number;
}

/**
 * One knowledge instance that left the host universe, and how.
 *
 * The three verbs are distinct entries rather than one "taken" flag because
 * they produce three different worlds: reading a mind **copies**, looting a
 * grimoire **moves**, burning **destroys**. A record that conflated them could
 * not answer "did the host still know this afterwards", which is the only
 * question `libraryDependence` is about.
 */
export interface KnowledgeMovement {
  readonly nodeId: ContentId;
  readonly verb: 'copied' | 'moved' | 'destroyed';
  /** The combatant that did it, or `0` for a library burned without a thief. */
  readonly byCombatant: Handle;
  /**
   * True when the raider who took it did not withdraw alive, so nothing is
   * inserted at home. Recorded rather than dropped: a theft that was forfeited
   * is a different event from a theft that never happened, and only one of them
   * says the mechanic is working.
   */
  readonly forfeited: boolean;
}

/** Everything one raid did. Frozen; the write-back reads it and never edits it. */
export interface RaidOutcome {
  readonly victor: RaidSideValue;
  readonly reason: RaidEndReasonValue;
  /** Engagement ticks stepped. `raidLengthDistribution` reads exactly this. */
  readonly resolutionTick: number;
  /** The bound this raid was created with, so the tail can be checked against it. */
  readonly maxTicks: number;

  readonly casualties: readonly CasualtyRecord[];
  readonly cohortLosses: readonly CohortLossRecord[];
  readonly objectives: readonly ObjectiveOutcome[];

  /** Instances that left the host universe, by verb. */
  readonly knowledgeMovements: readonly KnowledgeMovement[];
  /** Nodes the host universe no longer has any instance of. */
  readonly nodesLostByHost: readonly ContentId[];
  /** Nodes the attacker's universe gained an instance of. */
  readonly nodesGainedByRaider: readonly ContentId[];

  /**
   * **The 0.9.0 invariant.** Across a sweep with the selection mask enabled this
   * must aggregate to zero; a non-zero value fails the balance gate. It is not
   * "how many illegal casts happened" — it is "how many times the assertion had
   * to be the thing that stopped one", which is a different and much more
   * alarming number.
   */
  readonly forbiddenCastsBlocked: number;
  /** Primitive cap clamps, by primitive id, ascending. */
  readonly capClamps: readonly (readonly [string, number])[];

  /**
   * Per-primitive attribution: how much of each combat primitive each side
   * actually put on the field.
   *
   * Enough for `winRateByPrimitive`'s ablation to attribute a win-rate delta
   * without re-simulating, and deliberately raw rather than normalised — a
   * normalisation chosen here would be a definition the metric layer owns
   * (`contracts.md` §7 puts definitions in `agent-interface`, thresholds here).
   */
  readonly primitiveApplication: readonly (readonly [string, PrimitiveApplication])[];

  /** Peak simultaneous combatants per side, for the cap's own bound test. */
  readonly peakCombatants: readonly [number, number];
}

/** How much of one primitive one raid saw, by side. */
export interface PrimitiveApplication {
  /** Total magnitude applied by the attacker's combatants, `fp`. */
  readonly attacker: Fixed;
  /** Total magnitude applied by the defender's combatants, `fp`. */
  readonly defender: Fixed;
  /** Times the primitive was applied at all, both sides. */
  readonly applications: number;
}

/** A mutable accumulator the engine fills as the raid runs. */
export class OutcomeLedger {
  readonly casualties: CasualtyRecord[] = [];
  readonly cohortLosses: CohortLossRecord[] = [];
  readonly knowledgeMovements: KnowledgeMovement[] = [];
  readonly peakCombatants: [number, number] = [0, 0];
  readonly #primitives = new Map<string, { attacker: Fixed; defender: Fixed; applications: number }>();

  /** Records one application of one primitive by one side. */
  applied(primitiveId: string, side: RaidSideValue, magnitude: Fixed): void {
    const entry = this.#primitives.get(primitiveId) ?? { attacker: 0, defender: 0, applications: 0 };
    if (side === 0) entry.attacker += magnitude;
    else entry.defender += magnitude;
    entry.applications += 1;
    this.#primitives.set(primitiveId, entry);
  }

  /** Notes the current per-side combatant counts against their high-water marks. */
  observeCounts(attackers: number, defenders: number): void {
    if (attackers > this.peakCombatants[0]) this.peakCombatants[0] = attackers;
    if (defenders > this.peakCombatants[1]) this.peakCombatants[1] = defenders;
  }

  /** Sorted by primitive id, because a report whose row order moves is a diff nobody reads. */
  primitiveApplication(): readonly (readonly [string, PrimitiveApplication])[] {
    return [...this.#primitives.entries()]
      .map(([id, entry]) => [id, { ...entry }] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
}
