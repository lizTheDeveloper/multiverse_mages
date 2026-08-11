/*
 * Multiverse Mages — a mage's age, derived at every point of use.
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

/**
 * ## Why there is a module for a subtraction
 *
 * `docs/design/contracts.md` §1.2 says it in six words — *"age is derived,
 * never stored"* — and the `mage-lifecycle` spec repeats it as a requirement
 * with its own conformance check. A stored age is a second source of truth: a
 * snapshot preserves it, a migration carries it forward, and the moment one
 * code path forgets to increment it the world contains two answers to how old a
 * mage is, both of which look right at the call site that reads them.
 *
 * The functions here exist so that the derivation is spelled once and so the
 * conformance check has something to point at as the sanctioned alternative.
 * They are trivial on purpose. The rule they encode is not.
 *
 * ## Age does not advance during an engagement, and that is free
 *
 * `contracts.md` §0 freezes world time for the two universes in a raid, so a
 * `worldTick` that does not move produces an age that does not move —
 * automatically, with no engagement-mode branch anywhere in this file. That is
 * the second argument for deriving rather than storing: a stored age would need
 * somebody to *remember* not to increment it inside an engagement, and nothing
 * would ever tell them they had forgotten.
 */

/**
 * A mage's age in world ticks (months).
 *
 * @param worldTick - The current world tick. Never an engagement tick: an
 * engagement tick is 100 ms of fictional time and has nothing to say about age.
 * @param birthTick - The mage's `birthTick` component field.
 * @returns `worldTick − birthTick`, which is negative for a mage not yet born.
 * Negative is returned rather than clamped so a caller that has passed the
 * wrong clock sees an impossible number instead of a plausible zero.
 */
export function ageInMonths(worldTick: number, birthTick: number): number {
  return worldTick - birthTick;
}

/**
 * Age as a fraction of effective lifespan, in fixed point.
 *
 * `fp(1024)` is exactly the nominal lifespan; `fp(2048)` is twice it. This is
 * the index into the shared hazard table, and it is what lets one table serve
 * every species (see `hazard-table.ts`).
 *
 * **This division is by a lifespan and does not go through `perLifespanRate`,
 * deliberately.** The extended-scale helper exists for quantities of the form
 * `X / lifespanMonths` that are *per-tick rates*, where flooring to zero makes a
 * dragon immortal. A ratio is not such a quantity: a dragon 17 months old
 * genuinely is at normalized age 0, and the fp scale carries the answer with
 * three significant figures across every shipped lifespan. The conformance check
 * in `test/unit/lifespan-division.test.ts` knows about this call site by name
 * and requires that reason to be written down — which is this paragraph.
 *
 * @throws RangeError if `effectiveLifespanMonths` is not a positive integer. A
 * zero lifespan is a construction error upstream, and returning a plausible
 * number for it would hide the mage whose species record failed to load.
 */
export function normalizedAge(ageMonths: number, effectiveLifespanMonths: number): Fixed {
  if (!Number.isInteger(effectiveLifespanMonths) || effectiveLifespanMonths <= 0) {
    throw new RangeError(
      'normalizedAge needs a positive integer effectiveLifespanMonths, received ' +
        `${String(effectiveLifespanMonths)}`,
    );
  }
  return floorDiv(ageMonths * FP_ONE, effectiveLifespanMonths);
}
