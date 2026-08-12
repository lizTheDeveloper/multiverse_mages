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

import { MATERIALS_PER_LABORER } from '../economy/materials.js';

import { OCCUPATIONS_IN_ORDER } from './occupations.js';

/**
 * The `economy` spec named four things reallocation is driven by:
 * *"universities under construction, the scribing queue, university capacity,
 * and the standing soldier target"*. This module is those four turned into a
 * headcount per occupation — **plus a fifth, added by W23 and recorded in the
 * spec rather than smuggled in.**
 *
 * ## The fifth input, and why the four were not enough
 *
 * The four were written before anything ran a universe for two hundred years.
 * When something did, the reference run reached tick 2400 with **17,188 idle
 * people against 67 laborers**: total demand across all four occupations is
 * roughly a hundred jobs, everybody else falls back to `idle`, and an idle
 * person eats one material a tick and produces none. Material production
 * therefore never tracks what the universe owes, the stock empties around tick
 * 600 and never returns, and the library — vision §5's written record — decays
 * to zero for want of upkeep nobody was ever asked to earn.
 *
 * The missing driver is the bill itself. `materialsObligation` is what the
 * universe owes this tick that a laborer's output could cover, and
 * {@link LABORER_MATERIALS_YIELD} turns it into a headcount. Vision §6a:
 * *"**Materials** — the physical substrate. Buildings consume it; so does every
 * grimoire, which is why a universe can be knowledge-rich and unable to write
 * any of it down."* A universe that cannot staff its own subsistence is not
 * knowledge-rich and materials-poor; it is simply not asking.
 *
 * The deviation is amended into
 * `openspec/changes/mages-and-species/specs/economy/spec.md` with its reasoning,
 * in the style of `contracts.md` §5's recorded package deviations. It is **not**
 * a licence for a sixth: a driver belongs here only if it is a quantity the
 * universe owes or wants, readable from world state, and traceable to a vision
 * sentence.
 *
 * ## Why it is a struct of scalars rather than a walk over universities
 *
 * Universities are `mages-and-species` task group 6 and do not exist yet. The
 * shape that keeps this module honest in the meantime is a **port**: the
 * quantities arrive as integers, and the capability that owns each one supplies
 * it. That is not a placeholder to be replaced later — it is the boundary that
 * stops the populace controller from reaching into university internals and
 * acquiring an input nobody sanctioned.
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
 * Materials one laborer is assumed to produce in a tick, for the purpose of
 * *asking for* laborers. **Untuned.**
 *
 * Deliberately the same figure as `economy/materials.ts`'s
 * `MATERIALS_PER_LABORER`, and deliberately **blind to species affinity**. The
 * real yield is `count × MATERIALS_PER_LABORER × laborAffinity × yield`, so an
 * orcish universe (`laborAffinity` 1536) over-staffs by half and a draconic one
 * (512) under-staffs by half. That error is a magnitude, and 0.5.0's harness is
 * where magnitudes get settled; reading affinity here would make the demand
 * signal a function of which species happen to be idle this tick, which is a
 * mechanism, and a worse one — the mix changes under the controller as it acts.
 *
 * It is imported rather than restated so the two cannot drift apart silently.
 */
export const LABORER_MATERIALS_YIELD: Fixed = MATERIALS_PER_LABORER;

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
  /**
   * Grimoires queued for scribing.
   *
   * Supplied by `coordination` as the count of nodes the universe holds with
   * **no written copy** — every instance at `mind:` or `palace:`, none at
   * `grimoire:` or `library:`. Vision §5 makes a node's existence the existence
   * of one instance and §6 gives scribes the job of copying, so the honest
   * queue is the part of what is known that would die with its holders.
   *
   * It is a **want, not an affordability check**. §6a's *"a universe can be
   * knowledge-rich and unable to write any of it down"* is enforced at the desk
   * — `scribe()` refuses on `insufficient-materials` and the work phase reserves
   * subsistence and library upkeep ahead of the scribes — and asking demand to
   * check the till as well would count the same constraint twice and hide it.
   */
  readonly scribingQueueDepth: number;
  /** Student seats across completed universities — `contracts.md` §1.4 `capacity`. */
  readonly universityCapacity: number;
  /**
   * The universe's standing soldier target.
   *
   * **Still supplied as `0` in every production run, and W23 left it that way
   * deliberately.** There is no field for it anywhere in world state:
   * `assignRole` writes a *mage's* §7 standing role (`researcher`, `warden`,
   * `professor`, `raider`), which is a per-mage bias, not a populace headcount.
   * Wiring this would mean either inventing a driver out of raid activity — a
   * magnitude with no vision sentence behind it — or adding a god-set target,
   * which is `god-agency`'s contract to write. Named and left, not faked.
   */
  readonly standingSoldierTarget: number;
  /**
   * Materials the universe owes this tick that laborers could cover, `fp`.
   *
   * Subsistence plus library upkeep — the two claimants that are owed every
   * tick whether anyone plans for them or not. Construction is excluded: it is
   * already asked for through {@link DemandInputs.constructionBacklog}, and
   * charging for it here would ask twice.
   *
   * This is the fifth driver the module note explains. It is what turns
   * `idle` from the default state of the entire populace into a residual.
   */
  readonly materialsObligation: Fixed;
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
  assertNonNegativeInteger(inputs.standingSoldierTarget, 'standingSoldierTarget');
  assertNonNegativeInteger(inputs.materialsObligation, 'materialsObligation');

  return {
    // Two terms, summed rather than maximised: a universe building a university
    // still has to eat while it builds. Rounded **up**, so an obligation of one
    // material still asks for the one laborer who could cover it — a floor here
    // would leave every bill below `LABORER_MATERIALS_YIELD` permanently
    // unstaffed, which is the same class of silence this input was added to end.
    [OCCUPATION.laborer]:
      floorDiv(inputs.constructionBacklog * LABORERS_PER_BUILD_UNIT, FP_ONE) +
      ceilDiv(inputs.materialsObligation, LABORER_MATERIALS_YIELD),
    [OCCUPATION.scribe]: inputs.scribingQueueDepth * SCRIBES_PER_QUEUED_GRIMOIRE,
    [OCCUPATION.student]: inputs.universityCapacity,
    [OCCUPATION.soldier]: inputs.standingSoldierTarget,
    [OCCUPATION.idle]: 0,
  };
}

/**
 * `ceil(a / b)` over non-negative integers, without leaving the integers.
 *
 * `Math.ceil(a / b)` would be a float division in the rules path, which
 * `CLAUDE.md`'s determinism constraint forbids outright — and it is not merely
 * stylistic here: above 2^53 the float result is wrong, and a materials stock
 * is an `i32` sum that a long run pushes hard.
 */
function ceilDiv(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return floorDiv(numerator + denominator - 1, denominator);
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
