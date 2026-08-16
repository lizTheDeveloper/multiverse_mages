/*
 * Multiverse Mages — what the economy is asking the populace for.
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

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { OccupationValue } from '@mm/state';
import { OCCUPATION } from '@mm/state';

import { OCCUPATIONS_IN_ORDER } from './occupations.js';

/**
 * The `economy` spec names exactly four things reallocation is driven by:
 * *"universities under construction, the scribing queue, university capacity,
 * and the standing soldier target"*. This module is those four turned into a
 * headcount per occupation, and deliberately nothing else.
 *
 * ## Why it is a struct of scalars rather than a walk over universities
 *
 * Universities are `mages-and-species` task group 6 and do not exist yet. The
 * shape that keeps this module honest in the meantime is a **port**: the four
 * quantities arrive as integers, and the capability that owns each one supplies
 * it. That is not a placeholder to be replaced later — it is the boundary that
 * stops the populace controller from reaching into university internals and
 * acquiring a fifth input nobody sanctioned.
 *
 * It also keeps the `economy` spec's position ban trivially true: there is
 * nothing here to compute a distance *from*. Cohorts have no coordinates
 * (`contracts.md` §0), so demand is a scalar per occupation and assignment is a
 * handle relationship, never a travel time.
 *
 * ## Every coefficient below is untuned
 *
 * There is no balance harness before 0.5.0 (`docs/design/release-plan.md`).
 * These numbers were chosen to make the mechanism observable in a 200-year run,
 * not to be right, and no release before 0.5.0 may claim otherwise.
 */

/**
 * Laborers wanted per `fp(1024)` of outstanding university `buildProgress`.
 * **Untuned.**
 *
 * `buildProgress` runs 0 to `fp(1024)` (`contracts.md` §1.4), so one
 * incomplete university at zero progress asks for this many laborers, falling
 * to none as it completes. Expressed per unit of *remaining* progress rather
 * than per site so that a nearly finished building stops hoarding a workforce.
 */
export const LABORERS_PER_BUILD_UNIT = 40;

/** Scribes wanted per grimoire waiting in the scribing queue. **Untuned.** */
export const SCRIBES_PER_QUEUED_GRIMOIRE = 2;

/**
 * The standing soldier target every production run passes. **Zero, and it is a
 * citation rather than a stub.**
 *
 * This is a named constant instead of a literal `0` at the call site because
 * the literal was indistinguishable from an unfinished wire, and was read as
 * one. It is not. The design text that speaks directly to the size of a
 * standing army says there should not be one —
 * `docs/design/ages-of-magic.md` §2b:
 *
 * > **A university's stationed mages are its faculty, its researchers and its
 * > garrison at once.** There is no separate military. The soldier's line — *"The
 * > mages go through the portal. Someone's got to be on this side"* — is about
 * > the faculty.
 *
 * The raid engine agrees from the other side: `rules-raid`'s `combatants.ts`
 * fields defenders from the `warden`, `professor`, `researcher` and `raider`
 * mage roles, and soldier detachments are an addendum to that roster rather
 * than its core.
 *
 * ## What would have to exist before this becomes a number
 *
 * Three things, and none of them do:
 *
 * - **A source for the magnitude.** `openspec/changes/mages-and-species/specs/economy/spec.md`
 *   names the standing soldier target as a reallocation driver and stops; no
 *   spec, vision section or content constant states a fraction, a ratio, or a
 *   per-portal rule. Every other coefficient in this module is untuned but
 *   *sourced* — a quantity the universe demonstrably owes or wants. This one
 *   would be invented, which `contracts.md`'s refusal to add `martialAffinity`
 *   establishes as the wrong move: the capability that holds the measurement
 *   owns the number, and `raid-engagement` has not claimed it.
 * - **Somewhere to read it from.** There is no soldier-target field in world
 *   state and no god action that sets one. `assignRole` writes a *mage's* §7
 *   standing role, which is a per-mage bias and not a populace headcount.
 * - **A target large enough to buy anything.** `raid-constant.json`'s
 *   `detachment-strength` is 100 and `portal.ts` deploys
 *   `while (remaining >= detachmentStrength)`, **per cohort**. Cohorts are keyed
 *   by `(speciesId, occupation, birthTickBucket)`, so a universe-wide target
 *   spread across several species and birth decades fragments into cohorts well
 *   under 100 and fields **zero** detachments while charging full subsistence.
 *   Any future target has to clear that fragmentation, not just the raw 100.
 *
 * So: named, cited, and left. Changing it is a design decision with an owner,
 * and this constant is where that decision gets recorded when someone makes it.
 */
export const NO_STANDING_ARMY = 0;

/**
 * The quantities demand is computed from. Every one is supplied by the
 * capability that owns it.
 */
export interface DemandInputs {
  /**
   * Summed *remaining* `buildProgress` across universities under construction,
   * in `fp`. `fp(1024)` is one whole university still to build.
   */
  readonly constructionBacklog: Fixed;
  /** Grimoires queued for scribing. */
  readonly scribingQueueDepth: number;
  /** Student seats across completed universities — `contracts.md` §1.4 `capacity`. */
  readonly universityCapacity: number;
  /**
   * People of school age who could be magic users at all — the sum over cohorts
   * of `count × prevalence[species] × mageAptitude[species]`.
   *
   * **The fix for W193's first defect, and it is one line below.** Student
   * demand used to be `universityCapacity` alone: intake was *seats*, so the
   * number of mages a universe produced was a property of its buildings and not
   * of its people, and doubling the population changed nothing. Seats are a
   * **ceiling**, not a demand. What the labour market should ask for is the
   * smaller of *how many could go* and *how many will fit*.
   *
   * Supplied by the caller rather than computed here, for the reason this
   * module's header gives about `universityCapacity`: cohorts are the populace
   * layer's and species content is `@mm/content`'s, and a demand module that
   * walked either would be acquiring an input nobody sanctioned.
   */
  readonly latentMagicUsers: number;
  /** The universe's standing soldier target. */
  readonly standingSoldierTarget: number;
}

/** A headcount wanted per occupation. `idle` is the residual and never demanded. */
export type OccupationDemand = Readonly<Record<OccupationValue, number>>;

/** No demand at all — the starting point, and what an empty world asks for. */
export const NO_DEMAND: OccupationDemand = {
  [OCCUPATION.laborer]: 0,
  [OCCUPATION.scribe]: 0,
  [OCCUPATION.student]: 0,
  [OCCUPATION.soldier]: 0,
  [OCCUPATION.idle]: 0,
};

function assertNonNegativeInteger(value: number, role: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${role} must be a non-negative integer, received ${String(value)}`);
  }
}

/**
 * Turns the four inputs into a headcount per occupation.
 *
 * `idle` is always zero: it is what everybody not wanted elsewhere falls back
 * to, so demanding it would be demanding that people stop working.
 */
export function computeOccupationDemand(inputs: DemandInputs): OccupationDemand {
  assertNonNegativeInteger(inputs.constructionBacklog, 'constructionBacklog');
  assertNonNegativeInteger(inputs.scribingQueueDepth, 'scribingQueueDepth');
  assertNonNegativeInteger(inputs.universityCapacity, 'universityCapacity');
  assertNonNegativeInteger(inputs.latentMagicUsers, 'latentMagicUsers');
  assertNonNegativeInteger(inputs.standingSoldierTarget, 'standingSoldierTarget');

  return {
    [OCCUPATION.laborer]: floorDiv(inputs.constructionBacklog * LABORERS_PER_BUILD_UNIT, FP_ONE),
    [OCCUPATION.scribe]: inputs.scribingQueueDepth * SCRIBES_PER_QUEUED_GRIMOIRE,
    // `min`, not `universityCapacity`. See {@link DemandInputs.latentMagicUsers}:
    // a universe cannot school more people than it has seats, and it should not
    // ask for more students than it has people who could become mages. The
    // shortfall between the two is `magical-prevalence.md`'s whole point — empty
    // seats mean a population too small or too mundane, and unmet student demand
    // means a god who has not built enough. `unmetDemand` tells them apart.
    [OCCUPATION.student]: Math.min(inputs.universityCapacity, inputs.latentMagicUsers),
    [OCCUPATION.soldier]: inputs.standingSoldierTarget,
    [OCCUPATION.idle]: 0,
  };
}

/**
 * Demand that went unmet this tick, per occupation, in the one iteration order.
 *
 * Required to be *observable* by the `economy` spec — "the unmet demand per
 * occupation is recorded and is observable" — not merely accounted for. A
 * transfer rate that is too slow and a populace that is too small look
 * identical in the occupation mix; they look different here.
 */
export type UnmetDemand = Readonly<Record<OccupationValue, number>>;

/**
 * A zeroed counter per occupation, with keys inserted in
 * {@link OCCUPATIONS_IN_ORDER}.
 *
 * The insertion order is not cosmetic. These records are reported and compared,
 * and a record built by whatever order a loop happened to reach is a record
 * whose serialization depends on control flow rather than on the contract.
 */
export function zeroPerOccupation(): Record<OccupationValue, number> {
  const counters = {} as Record<OccupationValue, number>;
  for (const occupation of OCCUPATIONS_IN_ORDER) {
    counters[occupation] = 0;
  }
  return counters;
}
