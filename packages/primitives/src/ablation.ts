/*
 * Multiverse Mages — the ablation mask, and what "neutralized" means per rule.
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
 * ## Why the mask is here and not in the harness
 *
 * `winRateByPrimitive` measures a primitive's contribution by neutralizing it
 * and comparing paired runs. The comparison is only meaningful if the two arms
 * are the *same universe* differing in one thing, and there are two obvious
 * implementations that quietly break that.
 *
 * **Editing content.** Deleting the primitive from `primitive.json`, or
 * stripping it out of the nodes that grant it, changes `contentRevision` — which
 * `contracts.md` §0 makes a compatibility gate — and, worse, changes what is
 * learnable and what it costs. Mages in the ablated arm would research a
 * different graph at different prices, and the measured delta would confound
 * "this primitive matters" with "this research path got cheaper". So the mask
 * never touches content: the node is still there, still costs the same, still
 * gets researched. It simply does nothing.
 *
 * **Neutralizing at the call site.** Every consumer that reads a stacked
 * magnitude would need its own "…unless ablated" branch, fifteen of them would
 * be written slightly differently, and `BAN_INLINE_PRIMITIVE_STACKING` exists
 * precisely because that is how the stacking rules themselves would have gone.
 * So the mask is applied in exactly one place — {@link stackMagnitudes} in
 * `stack.ts`, the single entry point every rules package already must use — and
 * a consumer cannot see an unmasked magnitude without going around the ban.
 *
 * ## One primitive per mask, structurally
 *
 * The design note is explicit that pairwise interaction ablation is out of
 * scope: fifteen primitives make 105 pairs, two orders of magnitude of sweep
 * cost for a question nobody has asked. A mask therefore names **one**
 * primitive or none, so a pairwise arm is not a thing that can be built and
 * then mislabelled. A sweep still names many primitives — one arm each — and
 * {@link ablationMaskFor} is the boundary where a per-arm request becomes a
 * mask, and where a request naming two is refused with its reason.
 *
 * ## Why the identities are a table rather than "call the rule with no sources"
 *
 * Passing an empty multiset to each rule would produce the right numbers today
 * and would silently produce *some* number for a stacking class added later.
 * `contracts.md` §3 names five neutralizations; a sixth class arriving without
 * one is exactly what task 7.9's conformance check exists to catch, and a
 * mechanism that defaults cannot be caught. So the identities are declared
 * here, exhaustively over {@link PrimitiveStackingRule} — adding a class is a
 * compile error — and `test/unit/ablation.test.ts` checks the declaration
 * against each rule's own documented empty case so the two cannot drift.
 */

import { FP_ONE } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';

import type { PrimitiveStackingRule } from './stacking.js';

/**
 * What one arm of an ablation sweep neutralizes.
 *
 * Carries no arithmetic and no content: it is a name, and the question "is this
 * primitive the ablated one".
 */
export interface AblationMask {
  /** The neutralized primitive, or `undefined` on the control arm. */
  readonly neutralizedPrimitiveId: string | undefined;
  /** Whether `primitiveId` is the one this arm neutralizes. */
  neutralizes(primitiveId: string): boolean;
}

/**
 * The control arm: nothing is neutralized.
 *
 * Also the default inside {@link stackMagnitudes}, so ordinary play, the golden
 * replay fixtures, and every existing caller take the identical code path they
 * always took. Ablation that changed unablated behaviour would be the one
 * failure this whole mechanism must never have.
 */
export const NO_ABLATION: AblationMask = Object.freeze({
  neutralizedPrimitiveId: undefined,
  neutralizes(): boolean {
    return false;
  },
});

/**
 * The mask for an arm that neutralizes `primitiveId`.
 *
 * The id is not validated against the registry here — this package holds no
 * content — but it is checked for being a name at all, because a mask built
 * from an empty string neutralizes nothing while claiming to be an ablation
 * arm, and that arm's result would be recorded as a measured effect of zero.
 * {@link ablationConformance} is where a mask is checked against real content.
 *
 * @throws RangeError if `primitiveId` is empty.
 */
export function neutralizing(primitiveId: string): AblationMask {
  if (primitiveId.length === 0) {
    throw new RangeError(
      'an ablation mask must name a primitive id; received an empty string. ' +
        'Use NO_ABLATION for the control arm.',
    );
  }
  return Object.freeze({
    neutralizedPrimitiveId: primitiveId,
    neutralizes(candidate: string): boolean {
      return candidate === primitiveId;
    },
  });
}

/**
 * Builds the mask for **one arm** from the primitive ids that arm requests.
 *
 * Zero ids is the control arm. One id is an ablation arm. Two or more is a
 * pairwise ablation, which this change declares out of scope, and refusing it
 * here — naming both primitives — is the difference between an explained "no"
 * and an arm labelled `ward+blink` that in fact ablated only `ward`.
 *
 * @throws RangeError naming the requested ids if more than one is given.
 */
export function ablationMaskFor(primitiveIds: readonly string[]): AblationMask {
  const first = primitiveIds[0];
  if (first === undefined) {
    return NO_ABLATION;
  }
  if (primitiveIds.length > 1) {
    throw new RangeError(
      `ablation is single-primitive only; one arm cannot neutralize ${String(primitiveIds.length)} ` +
        `primitives at once (${primitiveIds.join(', ')}). Interaction ablation is deliberately ` +
        'out of scope: fifteen primitives make 105 pairs. Schedule one arm per primitive instead.',
    );
  }
  return neutralizing(first);
}

/**
 * The value a neutralized primitive contributes, per stacking class.
 *
 * Read it as "what this rule produces when nothing applies", which is what
 * neutralization means: the primitive is present in content, researched,
 * taught, and paid for, and contributes nothing.
 *
 * - **`additive`**, and `summed-then-single-ward` which sums the same way — `0`.
 *   Adding nothing. The ward half of `summed-then-single-ward` is a separate
 *   step (`applyWard`) applied to whatever damage survived, and it needs no
 *   special case: zero damage warded is zero damage.
 * - **`additive-into-multiplier` — `FP_ONE`, and this is the one that matters.**
 *   The magnitudes stacked here are *bonuses* into `(1 + Σbonus)`, so removing
 *   every bonus leaves the multiplier at 1.0, not at 0. Substituting `0`
 *   because the other four classes use it would not neutralize `research-rate`,
 *   it would multiply the ablated arm's research, teaching, scribing, building,
 *   resource, fertility and worship rates by zero. That arm loses every pair,
 *   the attribution comes back enormous and confident, and nothing in the
 *   pipeline looks wrong.
 * - **`multiplicative-on-remainder`** — `0` prevented, so the whole effect
 *   survives. The stacked value is the *prevented fraction*; zero prevention is
 *   the absence of a ward, and `FP_ONE` here would mean total immunity.
 * - **`max`** — `0`. Deliberately the constant and not `maxOf([])`'s reasoning:
 *   `maxOf` seeds from the first magnitude so that an all-negative debuff set
 *   stacks to the largest debuff rather than to zero, which is right for play
 *   and wrong for ablation. A neutralized primitive contributes nothing, and
 *   nothing is `0` whatever sign its sources had.
 * - **`presence`** — `0`, the gate reading as absent. `portal` is the only
 *   member, and neutralizing it removes raiding outright, which is why §7
 *   reports `portal` as `not-attributable` rather than as a win rate.
 * - **`diminishing`** — `0`, same reasoning as `max`: it is a fold over an
 *   empty multiset, not a rate with an implicit "no bonus" state, and the
 *   only member (`lifespan`) already means "0 additional months" at `0`.
 */
export const NEUTRALIZED_MAGNITUDE: Readonly<Record<PrimitiveStackingRule, Fixed>> = Object.freeze({
  additive: 0,
  'summed-then-single-ward': 0,
  'additive-into-multiplier': FP_ONE,
  'multiplicative-on-remainder': 0,
  max: 0,
  presence: 0,
  diminishing: 0,
});

/**
 * The declared neutralization for a stacking class.
 *
 * Throws rather than defaulting. A stacking class with no declared
 * neutralization is not a value this function can guess: four of the five
 * declared classes neutralize to `0` and the fifth to `FP_ONE`, so guessing has
 * an 80% chance of being right and a 20% chance of inverting the measurement
 * the caller is about to record as a balance finding.
 *
 * @throws RangeError naming the class.
 */
export function neutralizedMagnitude(stacking: PrimitiveStackingRule): Fixed {
  const declared = NEUTRALIZED_MAGNITUDE[stacking] as Fixed | undefined;
  if (declared === undefined) {
    throw new RangeError(
      `no neutralization rule is declared for stacking class "${String(stacking)}". ` +
        'Add one to NEUTRALIZED_MAGNITUDE in packages/primitives/src/ablation.ts — ' +
        'ablation must not default, because the identity differs by class.',
    );
  }
  return declared;
}
