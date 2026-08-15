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
import type { PrimitiveRecord } from '@mm/content';

import { NO_ABLATION, neutralizedMagnitude } from './ablation.js';
import type { AblationMask } from './ablation.js';
import { ClampCounters, applyCap } from './caps.js';
import type { CapContext } from './caps.js';
import {
  additive,
  additiveIntoMultiplier,
  diminishing,
  maxOf,
  multiplicativeOnRemainder,
  presence,
} from './stacking.js';
import type { PrimitiveStackingRule } from './stacking.js';

/**
 * A floor/ceiling pair on a stacked outcome. The shape a primitive's own
 * `floor` takes in `primitive.json` (a bare floor, no ceiling), and the shape
 * Rego's `control` payload takes on an effect (`docs/design/compositional-
 * content.md` §3.3 — "Snap, lock, gate" — either bound, or both).
 */
export interface EffectControl {
  readonly floor?: Fixed;
  readonly ceiling?: Fixed;
}

/**
 * Combines every `control`-mode contribution touching one primitive into the
 * single clamp `stackMagnitudes` applies.
 *
 * **Floor is the max of the floors; ceiling is the min of the ceilings** — the
 * tightest reliability guarantee and the tightest upside limit both win,
 * because `contracts.md` §3's `control` payload doc is explicit that a floor
 * is reliability *bought* and a ceiling is upside *sold*: two Rego sources
 * each buying a guarantee should not let one erase the other's purchase, and
 * two each selling upside should not let the more generous seller undo the
 * stricter one.
 *
 * Order-independent by construction (`max`/`min` are commutative and
 * associative) — proved directly in `test/unit/stack.test.ts` rather than
 * merely assumed, for the same reason every other fold in this package is:
 * two peers combining the same controls in a different order must reach the
 * same clamp.
 *
 * @returns `{}` for no controls — an absent clamp, not a clamp of nothing.
 */
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
   * Every stage below that binds — the primitive floor, the control clamp,
   * and the cap — records into it independently, the way the cap alone used
   * to: a call where two stages bind in the same evaluation counts twice,
   * because "how often does a floor bind and a cap also bind" is itself a
   * balance question this counter exists to make visible.
   */
  readonly counters?: ClampCounters;
  /**
   * Which primitive this arm neutralizes, if any. Defaults to
   * {@link NO_ABLATION}, so every existing caller and every golden replay
   * fixture takes the path it always took.
   */
  readonly ablation?: AblationMask;
  /**
   * The primitive's own authored floor (`primitive.json`'s `floor` field,
   * `docs/design/compositional-content.md` §3.3). Applied immediately after
   * the stacking rule folds — and after ablation, so a neutralized primitive
   * is floored exactly as its control arm would be, the same uniformity the
   * cap already gives ablation. The caller reads `primitive.floor` and passes
   * it here rather than `stackMagnitudes` reading the registry record itself,
   * because `@mm/content`'s `PrimitiveRecord` type does not declare the field
   * yet (a different task group's package) and this keeps that gap from
   * reaching into this package at all.
   */
  readonly floor?: Fixed;
  /**
   * Rego's combined control clamp for this call — the output of
   * {@link combineControls} over every `control`-mode contribution touching
   * this primitive. Applied after the primitive floor and before the cap.
   *
   * **If `floor` exceeds `ceiling`, the ceiling wins**: a gate whose minimum
   * is above its maximum is not a wide-open gate, it is a shut one, so the
   * conflicting floor is dropped down to the ceiling rather than the other
   * way around — the effective range collapses to the single point at
   * `ceiling` rather than expanding to satisfy the floor. This is `stack.ts`'s
   * problem and not `EffectControl`'s: `combineControls` never itself invents
   * a floor above a ceiling (each bound only tightens), so a conflict can only
   * arise from one control source declaring both at once, or two rounds of
   * combination — and either way it is resolved once, here, uniformly.
   */
  readonly clamp?: EffectControl;
}

/** The stacked, capped magnitude, and whether any stage clamped producing it. */
export interface StackOutcome {
  readonly value: Fixed;
  readonly clamped: boolean;
}

/**
 * Applies the rule the registry declares for `stacking`.
 *
 * The `switch` is exhaustive over {@link PrimitiveStackingRule} with no
 * `default` branch on purpose: adding a stacking rule to
 * `primitive.schema.json` without implementing it here becomes a *compile*
 * error rather than a value silently falling through to a plausible-looking
 * sum.
 *
 * `summed-then-single-ward` stacks as a plain sum here. The ward half of that
 * rule is a second, separate step — `applyWard` — because it needs the target's
 * combined ward fraction, which is a different primitive's stack. Splitting it
 * is what makes "one ward factor applied to the sum" enforceable: there is no
 * way to express "a ward factor applied to each hit" with these pieces.
 */
function stackByRule(stacking: PrimitiveStackingRule, magnitudes: readonly Fixed[]): Fixed {
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
    case 'diminishing':
      return diminishing(magnitudes);
  }
}

/**
 * Stacks the magnitudes of every source of one primitive on one target, then
 * applies — in this exact order — the primitive's own floor, Rego's combined
 * control clamp, and finally the primitive's cap. Each stage that binds is
 * counted (see {@link StackOptions.counters}).
 *
 * ## Why this order
 *
 * `docs/design/compositional-content.md` §3.3/§3.4: the fold produces the raw
 * stacked magnitude; the primitive's own floor is the first guard against a
 * division hazard (a Perdo stack driving a world-scale rate to zero or
 * negative) and applies before anything a *player's* Rego spell can override,
 * because that floor exists to protect the arithmetic rather than to be a
 * tradeable bound; the control clamp is the genuine trade Rego offers —
 * reliability bought against upside sold — and is allowed to move the value
 * within the primitive's floor..cap band but never past the cap itself, which
 * is why it runs before the cap rather than after; the cap is `contracts.md`
 * §3's ceiling and always has the last word.
 *
 * ## Where ablation happens, and why it is these few lines
 *
 * A neutralized primitive contributes its rule's identity instead of its
 * sources (`ablation.ts`). That substitution is here rather than at any call
 * site for the same reason the arithmetic is: `BAN_INLINE_PRIMITIVE_STACKING`
 * makes this the one function a rules package may use to turn sources into a
 * magnitude, so putting the mask inside it means no consumer can read an
 * unmasked value, and none of them needs to know ablation exists.
 *
 * The masked branch takes the same floor, clamp, cap and counter as the
 * unmasked one — not a shortcut return — so an arm ablating `lifespan` still
 * raises the same missing-`speciesBase` error its control would, rather than
 * passing where the control fails.
 *
 * Nothing is *combined* on the masked path, which is the point: neutralization
 * is "this primitive had no sources", and there is no arithmetic in that.
 *
 * @param primitive - The registry record; its `stacking` and `cap` decide
 * most of what this function does.
 * @param magnitudes - One entry per applying source, in the primitive's own
 * units. Order never matters: every rule here is commutative.
 * @param options - `speciesBase` for a `fraction-of-species-base` cap, the
 * `counters` clamps are reported into, the `ablation` mask, the primitive's
 * `floor`, and Rego's combined `clamp`.
 */
export function stackMagnitudes(
  primitive: PrimitiveRecord,
  magnitudes: readonly Fixed[],
  options: StackOptions = {},
): StackOutcome {
  const ablation = options.ablation ?? NO_ABLATION;
  // See PrimitiveStackingRule's doc: `@mm/content` does not type `diminishing`
  // yet, but `primitive.json` (this change's own data) authors it, and the
  // loader passes the field through untouched. One cast, at this one boundary.
  const stacking = primitive.stacking as PrimitiveStackingRule;
  let value = ablation.neutralizes(primitive.id)
    ? neutralizedMagnitude(stacking)
    : stackByRule(stacking, magnitudes);

  let clamped = false;

  if (options.floor !== undefined && value < options.floor) {
    value = options.floor;
    clamped = true;
    options.counters?.record(primitive.id);
  }

  if (options.clamp !== undefined) {
    let { floor } = options.clamp;
    const { ceiling } = options.clamp;
    if (floor !== undefined && ceiling !== undefined && floor > ceiling) {
      // The ceiling wins: see StackOptions.clamp's doc. The range collapses to
      // the single point at `ceiling` rather than widening to honour `floor`.
      floor = ceiling;
    }
    let stageClamped = false;
    if (floor !== undefined && value < floor) {
      value = floor;
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

  const capped = applyCap(
    primitive.cap,
    value,
    options.speciesBase === undefined ? {} : { speciesBase: options.speciesBase },
  );

  if (capped.clamped) {
    clamped = true;
    options.counters?.record(primitive.id);
  }

  return { value: capped.value, clamped };
}
