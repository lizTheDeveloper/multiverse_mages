/*
 * Multiverse Mages — the per-tick mortality hazard, and the roll against it.
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

import type { EntityHandle, Fixed } from '@mm/sim-core';
import { RNG_STREAM, nextBounded } from '@mm/sim-core';

import { LIFESPAN_RATE_ONE, perLifespanRate } from '../lifespan-rate.js';
import { ageInMonths, normalizedAge } from './age.js';
import { hazardAt } from './hazard-table.js';
import type { StepRng } from './rng.js';

/**
 * ## A hazard, not a schedule
 *
 * Each living mage draws once per world tick against
 * `H(normalizedAge) / effectiveLifespanMonths`. Nothing anywhere records when a
 * mage is *going* to die, and `docs/design/contracts.md` §3 ties that choice to
 * the `lifespan` primitive: additive months applied at arbitrary times cannot be
 * reconciled with a date rolled eighty years ago except by rewriting the date
 * every time an effect lands, deterministically, across every ordering of
 * effects. The hazard reproduces the same distribution and has no date to
 * rewrite.
 *
 * ## The division that this whole module is arranged around
 *
 * `contracts.md` §3 states the defect outright, and it is the reason
 * {@link perLifespanRate} exists as a module rather than as a line:
 *
 * > A draconic lifespan of 18,000 months divided at `fp` scale floors to **zero
 * > hazard**, and dragons become silently immortal.
 *
 * It is worse than the quotation suggests. At the flat young-adult hazard of
 * `fp(1024)`, the naive division floors to zero for **four** of the six shipped
 * species, not one — elves, dwarves, dragons and gnomes are all immortal
 * through their entire youth, and every one of them looks merely long-lived in
 * the output. So the fix cannot be a special case for the longest-lived
 * species; it has to be the arithmetic.
 *
 * Two consequences are enforced here rather than left to discipline:
 *
 * - The hazard is produced at **extended scale** and the draw is taken over
 *   `LIFESPAN_RATE_ONE`, not over `fp(1024)`. Narrowing before the comparison
 *   reintroduces the exact floor the widening escaped, while still appearing to
 *   use the safe helper.
 * - {@link perTickHazard} returns the extended-scale value and says so in its
 *   type name, so a caller who compares it against an `fp` draw has written
 *   something that reads wrong.
 */

/**
 * A per-tick probability in units of `1 / LIFESPAN_RATE_ONE`.
 *
 * A distinct name from `Fixed` because the two are not interchangeable and the
 * confusion between them is the defect. `1024` at this scale is one in a
 * thousand and change; `1024` at `fp` scale is certainty.
 */
export type ExtendedRate = number;

/** Everything a hazard evaluation needs. All of it derived; none of it stored. */
export interface HazardInput {
  /** The current world tick. */
  readonly worldTick: number;
  /** The mage's `birthTick` component field. */
  readonly birthTick: number;
  /** From {@link effectiveLifespan}, recomputed this tick. */
  readonly effectiveLifespanMonths: number;
}

/**
 * The per-tick hazard for one mage, at extended scale.
 *
 * @returns A rate in units of `1 / LIFESPAN_RATE_ONE`. **Strictly positive for
 * every species at every age**, because `H` is never zero and
 * {@link perLifespanRate} does not floor it — that is the property the
 * `mage-lifecycle` spec requires a test to assert on a dragon specifically.
 *
 * It may exceed `LIFESPAN_RATE_ONE`, and that is not an error: a mage whose
 * effective lifespan a curse has driven down to a handful of months has a
 * hazard above certainty, and clamping it would be arithmetic dressed up as
 * safety. The comparison against the draw treats anything at or above the
 * bound as certain death, which is what it means.
 */
export function perTickHazard(input: HazardInput): ExtendedRate {
  const age = ageInMonths(input.worldTick, input.birthTick);
  const normalized = normalizedAge(age, input.effectiveLifespanMonths);
  const hazard = hazardAt(normalized);
  return perLifespanRate(hazard, input.effectiveLifespanMonths);
}

/** The `H` value behind a hazard, for emission and for reading the curve in a test. */
export function hazardNumerator(input: HazardInput): Fixed {
  return hazardAt(normalizedAge(ageInMonths(input.worldTick, input.birthTick), input.effectiveLifespanMonths));
}

/**
 * Rolls one mage's mortality for one world tick.
 *
 * **Stream 2, keyed on the mage's handle.** `contracts.md` §6 assigns mortality
 * its own subsystem and requires the actor key to be a stable identity, never
 * an array index — key it positionally and inserting one mage re-rolls the
 * mortality of every mage behind her, which is not a bug that announces itself.
 * The run stays deterministic and reproducible; it is the *attribution* that
 * dies, and with it every committed balance baseline.
 *
 * Exactly one draw per living mage per world tick. The bound is
 * `LIFESPAN_RATE_ONE`, a power of two, so `nextBounded`'s rejection loop can
 * never fire and "one draw" is one `uint32`, not one on average.
 *
 * @param rng - The step's RNG, already bound to this tick.
 * @param mage - The mage's handle. This is the actor key.
 * @returns True if the mage dies this tick. Acting on that — destroying
 * instances, handing on grimoires — is `death.ts`'s, so that a test can
 * evaluate mortality without a knowledge gateway.
 */
export function rollMortality(rng: StepRng, mage: EntityHandle, input: HazardInput): boolean {
  const hazard = perTickHazard(input);
  const draw = nextBounded(rng.actorStream(RNG_STREAM.mortality, mage), LIFESPAN_RATE_ONE);
  return draw < hazard;
}
