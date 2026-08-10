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

import { ClampCounters, applyCap } from './caps.js';
import type { CapContext } from './caps.js';
import {
  additive,
  additiveIntoMultiplier,
  maxOf,
  multiplicativeOnRemainder,
  presence,
} from './stacking.js';

export interface StackOptions extends CapContext {
  /**
   * Where clamps are counted. Optional so a unit test or a client-side preview
   * need not care; the Monte Carlo harness always passes one, because an
   * uncounted clamp is a balance finding that never surfaces (see `caps.ts`).
   */
  readonly counters?: ClampCounters;
}

/** The stacked, capped magnitude, and whether the cap bound producing it. */
export interface StackOutcome {
  readonly value: Fixed;
  readonly clamped: boolean;
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
 * @param primitive - The registry record; its `stacking` and `cap` decide
 * everything this function does.
 * @param magnitudes - One entry per applying source, in the primitive's own
 * units. Order never matters: every rule here is commutative.
 * @param options - `speciesBase` for a `fraction-of-species-base` cap, and the
 * `counters` the clamp is reported into.
 */
export function stackMagnitudes(
  primitive: PrimitiveRecord,
  magnitudes: readonly Fixed[],
  options: StackOptions = {},
): StackOutcome {
  const stacked = stackByRule(primitive.stacking, magnitudes);
  const capped = applyCap(
    primitive.cap,
    stacked,
    options.speciesBase === undefined ? {} : { speciesBase: options.speciesBase },
  );

  if (capped.clamped) {
    options.counters?.record(primitive.id);
  }

  return capped;
}
