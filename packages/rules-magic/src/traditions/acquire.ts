/*
 * Multiverse Mages — the `acquire` tradition hook: how knowledge enters a mind.
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
import { FP_ONE, mul } from '@mm/sim-core';

import type { ResolvedHook } from './hook-for.js';
import { assertHookPoint, integerParam, unimplementedKind } from './hook-for.js';

/**
 * Hook one of four (`vision.md` §4a): **how knowledge enters a mind.**
 *
 * The whole of this hook's authority is the four numbers in
 * {@link AcquireTerms}. That is not a simplification — it is the containment.
 * `acquire` may make learning dearer or cheaper and may say what mastery a new
 * instance carries; it may not touch decay, storage, casting, or cost, and the
 * way it is prevented from doing so is that it has no vocabulary for any of
 * them. A hook that leaked outside its declared point would be a fifth hook
 * arriving without a name, and it is the specific failure the conformance check
 * in task 6.14 and the differentiation test in 6.15 both exist to catch.
 *
 * World-time, therefore home-tradition across a portal: a raider does not
 * forget how she learned things by walking through a door.
 */
export interface AcquireTerms {
  /**
   * Progress a mage must accumulate to derive the node unaided. `fp`, in
   * mage-months, already scaled by whatever the caller's rates say.
   */
  readonly researchCost: Fixed;
  /** Progress a teacher/student pair must accumulate. `fp`, mage-months. */
  readonly teachCost: Fixed;
  /**
   * Mastery a freshly created instance carries.
   *
   * Under `standard` this is the caller's ramp value — usually `0`, because
   * `contracts.md` §1.5 defines `0` as "just learned" and the effect pipeline
   * gives a held instance no output until it clears an activation threshold.
   */
  readonly initialMastery: Fixed;
  /**
   * Mastery an instance acquired by `knowledge-steal` carries on arrival.
   *
   * Separate from {@link initialMastery} because a tradition may reasonably
   * treat a copied instance differently from a derived one, and because
   * `vision.md` §4a's "vicious synergy with knowledge-theft" is precisely a
   * statement about *this* number under True Naming.
   */
  readonly stolenMastery: Fixed;
}

/** What the caller has computed before the tradition gets a say. */
export interface AcquireInputs {
  /** `researchCost` from content, scaled by the caller's rates. `fp`. */
  readonly baseResearchCost: Fixed;
  /** `teachCost` from content, scaled by the caller's rates. `fp`. */
  readonly baseTeachCost: Fixed;
  /** Mastery a new instance would carry with no tradition involved. `fp`. */
  readonly baseInitialMastery: Fixed;
  /** Mastery a stolen instance would carry with no tradition involved. `fp`. */
  readonly baseStolenMastery: Fixed;
}

/**
 * Applies a resolved `acquire` hook to the caller's costs.
 *
 * Pure, and takes every world-side rate as a parameter, because `contracts.md`
 * §5 forbids `rules-magic` from importing `rules-world`: species `learnRate`
 * lives over there, and reaching for it would be the import cycle the module
 * boundary exists to prevent.
 */
export function applyAcquire(hook: ResolvedHook, inputs: AcquireInputs): AcquireTerms {
  assertHookPoint(hook, 'acquire');

  switch (hook.kind) {
    case 'standard':
      return standardAcquire(inputs);
    case 'true-name':
      return trueNameAcquire(hook, inputs);
    default:
      throw unimplementedKind(hook);
  }
}

/**
 * The baseline every tradition falls back to: the caller's numbers, unchanged.
 *
 * Written as an explicit branch rather than as "no hook" so that two of the
 * three v1 traditions genuinely execute a `standard` acquire rather than
 * skipping the dispatch. A path nothing runs is a path nothing tests, and the
 * differentiation test's *agreement* half depends on `standard` being a real
 * answer rather than an absence.
 */
function standardAcquire(inputs: AcquireInputs): AcquireTerms {
  return {
    researchCost: inputs.baseResearchCost,
    teachCost: inputs.baseTeachCost,
    initialMastery: inputs.baseInitialMastery,
    stolenMastery: inputs.baseStolenMastery,
  };
}

/**
 * True Naming: the knowledge instance *is* a name.
 *
 * A true name must be discovered, so research is dearer. A name can be spoken,
 * so teaching is cheaper. And a name is either known or not — there is no
 * half-remembered name — so every instance is created at the declared mastery,
 * whether it was derived, taught, or stolen. `contracts.md` §1.5 puts
 * `fp(1024)` at "teachable without loss", which is why v1 content declares
 * exactly that and why a True Naming instance transmits down a teaching chain
 * without degrading.
 *
 * The stolen case is the same number on purpose. `vision.md` §4a calls True
 * Naming's synergy with knowledge-theft *vicious*, and vicious in both
 * directions: a raider who reads one name out of a True Naming mage's head
 * walks away with a complete instance, and so does the True Naming universe's
 * own raider. One hook produces both halves; nothing about theft is special-cased.
 */
function trueNameAcquire(hook: ResolvedHook, inputs: AcquireInputs): AcquireTerms {
  const mastery = integerParam(hook, 'instanceMastery');
  return {
    researchCost: scaleCost(inputs.baseResearchCost, integerParam(hook, 'researchCostMultiplier')),
    teachCost: scaleCost(inputs.baseTeachCost, integerParam(hook, 'teachCostMultiplier')),
    initialMastery: mastery,
    stolenMastery: mastery,
  };
}

/**
 * A cost times an `fp` multiplier, floored — and never below `1`.
 *
 * The floor is not a rounding nicety. `mul` rounds toward negative infinity
 * like every other division in the rules path (`contracts.md` §3), so a cheap
 * enough node under a small enough multiplier floors to `0`, and a cost of zero
 * is knowledge acquired instantly and for nothing. That is the same class of
 * defect as §1.6's `stabilityDecayPerTick`: a derived value that silently
 * becomes zero, with no error and no symptom, and a hook that would have looked
 * merely generous while actually switching the acquisition loop off.
 */
function scaleCost(base: Fixed, multiplier: number): Fixed {
  if (base <= 0) return base;
  const scaled = mul(base, multiplier);
  return scaled < 1 ? 1 : scaled;
}

/** `fp(1)`, exported so callers can state "unchanged" without a literal. */
export const UNCHANGED_MULTIPLIER: Fixed = FP_ONE;
