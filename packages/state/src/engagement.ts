/*
 * Multiverse Mages — engagement-only state and its separation from the world.
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
 * `contracts.md` §1.6: entities *"present only while `clock.mode ==
 * engagement`. Discarded on raid resolution, and **not** written to world
 * snapshots."*
 *
 * ## How the exclusion is achieved: a second store, not a filter
 *
 * Combatants and objectives live in their own {@link SimState}, built from
 * {@link defineEngagementSchema}. The world's snapshot therefore cannot contain
 * them — not because the serializer skips them, but because they are not in the
 * world at all. `serializeState` writes every component of the schema it is
 * given, so a filter would be a rule someone has to remember; a separate schema
 * is a rule the type system and the format enforce between them.
 *
 * `@mm/sim-core`'s entity store anticipates this: its `maxSlots` option is
 * documented as being *"useful for the engagement-scale store, which is
 * short-lived and small, so that runaway summon spawning fails loudly instead
 * of eating memory."*
 *
 * Two more properties fall out of the split, and both are worth more than the
 * filter would have been:
 *
 * - **World entity handles do not churn during a raid.** Spawning three hundred
 *   summons into the world store would allocate and free three hundred world
 *   slots, and every subsequent world entity would land in a different slot than
 *   it would have without the raid. Snapshot bytes depend on slot layout, so two
 *   universes that fought different raids would diverge in their *world*
 *   encodings for reasons that have nothing to do with the world.
 * - **Discarding an engagement is dropping a reference**, not walking a store
 *   destroying entities and hoping nothing was missed.
 *
 * What the world snapshot *does* keep is the clock: `mode` and `engagementTick`
 * are header fields on every snapshot, so a save taken mid-raid restores a world
 * that knows it is frozen in engagement and at which engagement tick — which is
 * exactly what §1.6 asks for, since the raid itself is reconstructed rather than
 * restored.
 */

import type { SimState, System } from '@mm/sim-core';
import { TIME_MODE, createState, enterEngagement, leaveEngagement } from '@mm/sim-core';

import { defineEngagementSchema } from './components.js';
import type { RulesetSnapshot } from './permits.js';

/**
 * `contracts.md` §1.6's `RaidState`.
 *
 * The `objectives` array of §1.6 is **not** a field here: objectives carry
 * coordinates and a status that changes every engagement tick, so they are
 * entities in {@link Engagement.entities} under the `objective` component,
 * where the same iteration and snapshot rules apply to them as to combatants.
 * What remains here is the scalar part of the raid, plus the two frozen
 * rulesets.
 *
 * Note what is absent from §3 and therefore from any content: **no effect
 * primitive may modify `portalStability`.** Its absence from the primitive
 * table is load-bearing rather than incidental — a primitive that could extend a
 * raid would downgrade the termination guarantee from a proof to an
 * observation.
 */
export interface RaidState {
  /** The defender's. Governs legality, and the `cast` / `cost` hooks. */
  readonly hostRuleset: RulesetSnapshot;
  /** The attacker's. Governs the `acquire` / `store` hooks. */
  readonly raiderRuleset: RulesetSnapshot;
  /** Raw integer. Decrements every engagement tick; `0` ends the raid. */
  portalStability: number;
  /**
   * Authored raw integer, **never derived by fixed-point division**.
   *
   * `div` rounds toward negative infinity, so a derived decay silently becomes
   * `0` whenever the divisor exceeds the numerator — a raid that runs forever,
   * with no error and no symptom. {@link beginEngagement} rejects anything
   * below 1 for that reason.
   */
  readonly stabilityDecayPerTick: number;
  /** Derived at portal open. */
  readonly raidSeed: number;
  /** The world tick the raid began at. */
  readonly engagementStartTick: number;
}

/**
 * A raid in progress: the engagement-scale entity store, and the raid's scalars.
 *
 * Deliberately *not* a field on `SimState`. The world state is what a snapshot
 * is; putting an engagement inside it would make "not written to world
 * snapshots" a property of the serializer again.
 */
export interface Engagement {
  /** Combatants, prepared spells, and objectives. Never serialized with the world. */
  readonly entities: SimState;
  readonly raid: RaidState;
}

/** What {@link beginEngagement} needs in order to build a {@link RaidState}. */
export interface BeginEngagementOptions {
  readonly hostRuleset: RulesetSnapshot;
  readonly raiderRuleset: RulesetSnapshot;
  readonly portalStability: number;
  readonly stabilityDecayPerTick: number;
  readonly raidSeed: number;
  /** Systems the engagement scale runs. Supplied by `rules-raid`. */
  readonly systems?: readonly System[];
  /** Slot ceiling for the engagement store. Defaults to `ENGAGEMENT_MAX_SLOTS`. */
  readonly maxSlots?: number;
}

/**
 * Freezes world time for this universe and opens an engagement-scale store.
 *
 * The two rulesets must already be captured — `captureRuleset` does that — and
 * are carried by reference, frozen. Nothing here reads live universe state, and
 * nothing should: `rules-raid` may not depend on `agent-api` (§5), so a raid
 * that consulted a live universe would have no mechanism at all preventing a
 * mid-raid rule change.
 *
 * @throws Error if the two participants disagree on `contentRevision` (§0
 * refuses the interaction outright and names both), if a ruleset is missing,
 * or if the stability decay could never terminate the raid.
 */
export function beginEngagement(world: SimState, options: BeginEngagementOptions): Engagement {
  const { hostRuleset, raiderRuleset } = options;

  if (hostRuleset.contentRevision !== raiderRuleset.contentRevision) {
    throw new Error(
      `Universes may not interact across content revisions: the host is at ` +
        `${hostRuleset.contentRevision} and the raider at ${raiderRuleset.contentRevision}. ` +
        'contracts.md §0 has no partial-compatibility rule and no negotiation — mismatch is ' +
        'refusal with both revisions named.',
    );
  }

  if (!Number.isInteger(options.stabilityDecayPerTick) || options.stabilityDecayPerTick < 1) {
    throw new Error(
      `stabilityDecayPerTick is ${String(options.stabilityDecayPerTick)}; contracts.md §1.6 ` +
        'requires an authored integer of at least 1. A decay of 0 is what a fixed-point division ' +
        'produces when the divisor exceeds the numerator, and it yields a raid that never ends — ' +
        'with no error, and no symptom other than a run that stops advancing.',
    );
  }

  if (!Number.isInteger(options.portalStability) || options.portalStability < 0) {
    throw new Error(
      `portalStability is ${String(options.portalStability)}; it is a raw non-negative integer ` +
        'that decrements every engagement tick until it reaches 0.',
    );
  }

  const engagementStartTick = world.clock.worldTick;
  // Throws if the world is already in engagement mode. That is the right
  // response: a second entry would reset an in-flight raid's clock, which shows
  // up as an unreproducible raid length rather than as an error at its cause.
  enterEngagement(world.clock);

  const entities = createState({
    rootSeed: options.raidSeed,
    schema: defineEngagementSchema(options.systems ?? [], options.maxSlots),
    contentRevision: world.contentRevision,
  });

  return {
    entities,
    raid: {
      hostRuleset,
      raiderRuleset,
      portalStability: options.portalStability,
      stabilityDecayPerTick: options.stabilityDecayPerTick,
      raidSeed: options.raidSeed,
      engagementStartTick,
    },
  };
}

/**
 * Returns the world to world time. World time resumes from exactly the tick it
 * held when the engagement began, because it never moved.
 *
 * The caller drops its {@link Engagement}; §1.6 discards engagement entities on
 * raid resolution, and there is nothing to walk because they were never in the
 * world store.
 */
export function endEngagement(world: SimState): void {
  leaveEngagement(world.clock);
}

/** Whether this universe's clock is frozen in an engagement. */
export function inEngagement(world: SimState): boolean {
  return world.clock.mode === TIME_MODE.engagement;
}

/** Whether the portal has collapsed, ending the raid (§1.6). */
export function raidHasEnded(raid: RaidState): boolean {
  return raid.portalStability <= 0;
}

/**
 * Applies one engagement tick of portal decay, clamped at zero.
 *
 * Clamped so that `portalStability` never goes negative and `raidHasEnded`
 * stays a simple comparison. The decay itself is the authored integer, applied
 * whole — see {@link RaidState.stabilityDecayPerTick}.
 */
export function decayPortal(raid: RaidState): void {
  const remaining = raid.portalStability - raid.stabilityDecayPerTick;
  raid.portalStability = remaining > 0 ? remaining : 0;
}
