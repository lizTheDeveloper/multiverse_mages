/*
 * Multiverse Mages — registry-driven dispatch from a primitive to its rule.
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
 * The single entry point every rules package should use.
 *
 * A caller hands over a primitive record and the magnitudes of the sources
 * applying to one target, and gets back the stacked, capped value plus whether
 * the cap bound. It never chooses the rule; the registry does. That is the
 * point — "which rule does `ward` use" must have exactly one answer, held as
 * data, not remembered independently at each call site.
 */

import type { Fixed } from '@mm/sim-core';
import type { PrimitiveRecord, PrimitiveStacking } from '@mm/content';

import { NO_ABLATION, neutralizedMagnitude } from './ablation.js';
import type { AblationMask } from './ablation.js';
import { ClampCounters, applyCap, applyFloor, stackingFloor } from './caps.js';
import type { CapContext } from './caps.js';
import {
  additive,
  additiveIntoMultiplier,
  maxOf,
  multiplicativeOnRemainder,
  presence,
} from './stacking.js';

export interface EffectControl {
  readonly floor?: Fixed;
  readonly ceiling?: Fixed;
}

export function combineControls(controls: readonly EffectControl[]): EffectControl {
  let floor: Fixed | undefined;
  let ceiling: Fixed | undefined;
  for (const control of controls) {
    if (control.floor !== undefined) {
      floor = floor === undefined ? control.floor : Math.max(floor, control.floor);
    }
    if (control.ceiling !== undefined) {
      ceiling = ceiling === undefined ? control.ceiling : Math.min(ceiling, control.ceiling);
    }
  }
  const combined: { floor?: Fixed; ceiling?: Fixed } = {};
  if (floor !== undefined) combined.floor = floor;
  if (ceiling !== undefined) combined.ceiling = ceiling;
  return combined;
}

export interface StackOptions extends CapContext {
  /**
   * Where clamps are counted. Optional so a unit test or a client-side preview
   * need not care; the Monte Carlo harness always passes one, because an
   * uncounted clamp is a balance finding that never surfaces (see `caps.ts`).
   */
  readonly counters?: ClampCounters;
  /**
   * Which primitive this arm neutralizes, if any. Defaults to
   * {@link NO_ABLATION}, so every existing caller and every golden replay
   * fixture takes the path it always took.
   */
  readonly ablation?: AblationMask;
  readonly floor?: Fixed;
  readonly clamp?: EffectControl;
}

/** The stacked, bounded magnitude, and which of the two bounds produced it. */
export interface StackOutcome {
  readonly value: Fixed;
  /** The primitive's `cap` bound: the value was too **high**. */
  readonly clamped: boolean;
  /**
   * The stacking rule's floor bound: the value was too **low**.
   *
   * Only `additive-into-multiplier` has one (`caps.ts`, {@link
   * import('./caps.js').stackingFloor}), so this is `false` for every other
   * rule and for every stack of purely positive magnitudes — which is every
   * stack that existed before content could express a cost.
   */
  readonly floored: boolean;
}

/**
 * Applies the rule the registry declares for `stacking`.
 *
 * The `switch` is exhaustive over {@link PrimitiveStacking} with no `default`
 * branch on purpose: adding a stacking rule to `primitive.schema.json` without
 * implementing it here becomes a *compile* error rather than a value silently
 * falling through to a plausible-looking sum.
 *
 * `summed-then-single-ward` stacks as a plain sum here. The ward half of that
 * rule is a second, separate step — `applyWard` — because it needs the target's
 * combined ward fraction, which is a different primitive's stack. Splitting it
 * is what makes "one ward factor applied to the sum" enforceable: there is no
 * way to express "a ward factor applied to each hit" with these pieces.
 */
function stackByRule(stacking: PrimitiveStacking, magnitudes: readonly Fixed[]): Fixed {
  switch (stacking) {
    case 'additive':
    case 'summed-then-single-ward':
      return additive(magnitudes);
    case 'additive-into-multiplier':
      return additiveIntoMultiplier(magnitudes);
    case 'multiplicative-on-remainder':
      return multiplicativeOnRemainder(magnitudes);
    case 'max':
      return maxOf(magnitudes);
    case 'presence':
      return presence(magnitudes);
  }
}

/**
 * Stacks the magnitudes of every source of one primitive on one target, then
 * clamps to the primitive's cap and counts the clamp.
 *
 * ## Where ablation happens, and why it is these three lines
 *
 * A neutralized primitive contributes its rule's identity instead of its
 * sources (`ablation.ts`). That substitution is here rather than at any call
 * site for the same reason the arithmetic is: `BAN_INLINE_PRIMITIVE_STACKING`
 * makes this the one function a rules package may use to turn sources into a
 * magnitude, so putting the mask inside it means no consumer can read an
 * unmasked value, and none of them needs to know ablation exists.
 *
 * The masked branch takes the same cap and the same counter as the unmasked
 * one — not a shortcut return — so an arm ablating `lifespan` still raises the
 * same missing-`speciesBase` error its control would, rather than passing
 * where the control fails.
 *
 * Nothing is *combined* on the masked path, which is the point: neutralization
 * is "this primitive had no sources", and there is no arithmetic in that.
 *
 * @param primitive - The registry record; its `stacking` and `cap` decide
 * everything this function does.
 * @param magnitudes - One entry per applying source, in the primitive's own
 * units. Order never matters: every rule here is commutative.
 * @param options - `speciesBase` for a `fraction-of-species-base` cap, the
 * `counters` the clamp is reported into, and the `ablation` mask.
 */
export function stackMagnitudes(
  primitive: PrimitiveRecord,
  magnitudes: readonly Fixed[],
  options: StackOptions = {},
): StackOutcome {
  const ablation = options.ablation ?? NO_ABLATION;
  const stacking = primitive.stacking as PrimitiveStacking;
  let value = ablation.neutralizes(primitive.id)
    ? neutralizedMagnitude(stacking)
    : stackByRule(stacking, magnitudes);

  let clamped = false;
  let floored = false;

  // Primitive floor (from stacking rule)
  const ruleFloor = applyFloor(stackingFloor(stacking), value);
  if (ruleFloor.floored) {
    value = ruleFloor.value;
    floored = true;
    options.counters?.recordFloor(primitive.id);
  }

  // Authored floor (from options)
  if (options.floor !== undefined && value < options.floor) {
    value = options.floor;
    floored = true;
    options.counters?.record(primitive.id);
  }

  // Control clamp (Rego's gate)
  if (options.clamp !== undefined) {
    let { floor: clampFloor } = options.clamp;
    const { ceiling } = options.clamp;
    if (clampFloor !== undefined && ceiling !== undefined && clampFloor > ceiling) {
      clampFloor = ceiling;
    }
    let stageClamped = false;
    if (clampFloor !== undefined && value < clampFloor) {
      value = clampFloor;
      stageClamped = true;
    }
    if (ceiling !== undefined && value > ceiling) {
      value = ceiling;
      stageClamped = true;
    }
    if (stageClamped) {
      clamped = true;
      options.counters?.record(primitive.id);
    }
  }

  // Cap (the primitive's authored cap)
  const capped = applyCap(
    primitive.cap,
    value,
    options.speciesBase === undefined ? {} : { speciesBase: options.speciesBase },
  );

  if (capped.clamped) {
    clamped = true;
    options.counters?.record(primitive.id);
  }

  return { value: capped.value, clamped, floored };
}
