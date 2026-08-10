/*
 * Multiverse Mages — species rediscovery affinity, and the floor under it.
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

import type { SpeciesRecord } from '@mm/content';

import { SPECIES_TRAIT_REGISTRY, applySpeciesTrait } from './traits.js';

/**
 * ## The floor exists to keep a shipped release note true
 *
 * `docs/design/release-plan.md`'s **0.3.0 claim** is that rediscovering a lost
 * node costs *at least three times* its original research cost. `contracts.md`
 * §2.3 carries the content-side half of that as an authoring invariant on
 * `rediscoveryMultiplier`. This module is the other half: species
 * `rediscoveryAffinity` is applied *first*, and the result is then floored at
 * `fp(3072)`, because affinity alone would otherwise take a node authored at
 * exactly 3.0 down to 1.71× for a gnome and falsify a claim that has already
 * shipped.
 *
 * The alternative — letting a species trait break the floor, on the grounds
 * that a claim about content should not constrain a trait — was considered and
 * rejected in `mages-and-species`' design note. A release note that quietly
 * stops being true is worse than an awkward clamp, and the clamp is at least
 * *counted*.
 *
 * ## The floor is not supposed to bind
 *
 * A clamp that fires on every call is a trait that does not exist: every
 * species would rediscover at exactly the floor and `rediscoveryAffinity` would
 * be decoration. That is why `contracts.md` §2.3 asks v1 nodes to be authored
 * above the break-even of `3072 × 1792 / 1024 = 5376` rather than at the floor,
 * and why {@link RediscoveryClampCounter} is a required argument rather than an
 * optional one. The clamp count is the number that tells 0.5.0 whether the
 * trait is differentiating anything, and a counter nobody is forced to pass is
 * a counter that is not passed.
 */

/**
 * The hard floor on the effective rediscovery multiplier, in fixed point.
 *
 * A contract constant (`contracts.md` §2.3), not content: it is the numeric
 * form of a release claim, so it is pinned in code where changing it is a diff
 * a reviewer reads as "we are withdrawing the 0.3.0 claim".
 */
export const REDISCOVERY_FLOOR: Fixed = 3072;

/**
 * Counts how often the floor bound, i.e. how often species affinity was
 * discarded.
 *
 * Mutable and passed in, rather than returned, because the caller is a per-tick
 * loop and the interesting figure is the total over a run — that is what feeds
 * the per-tick emission the 0.4.0 brakes are supposed to be observable through.
 */
export interface RediscoveryClampCounter {
  /** Calls whose result was raised to {@link REDISCOVERY_FLOOR}. */
  floored: number;
  /** Calls made, so `floored` can be read as a share rather than a raw count. */
  evaluated: number;
}

export function createRediscoveryClampCounter(): RediscoveryClampCounter {
  return { floored: 0, evaluated: 0 };
}

/**
 * The rediscovery cost multiplier a given species pays for a given node.
 *
 * `effective = max(base × fp(1024) / rediscoveryAffinity, fp(3072))`, with the
 * division routed through {@link applySpeciesTrait} so that the direction of
 * the trait is decided in exactly one place.
 *
 * @param base - The node's authored `rediscoveryMultiplier`, in fixed point.
 * @param rediscoveryAffinity - The species' trait value, in fixed point.
 * @param counter - Accumulates floor clamps. Required on purpose; see above.
 */
export function effectiveRediscoveryMultiplier(
  base: Fixed,
  rediscoveryAffinity: Fixed,
  counter: RediscoveryClampCounter,
): Fixed {
  const scaled = applySpeciesTrait(
    SPECIES_TRAIT_REGISTRY.rediscoveryAffinity,
    base,
    rediscoveryAffinity,
  );
  counter.evaluated += 1;
  if (scaled < REDISCOVERY_FLOOR) {
    counter.floored += 1;
    return REDISCOVERY_FLOOR;
  }
  return scaled;
}

/** {@link effectiveRediscoveryMultiplier}, reading the trait off a species record. */
export function speciesRediscoveryMultiplier(
  base: Fixed,
  species: SpeciesRecord,
  counter: RediscoveryClampCounter,
): Fixed {
  return effectiveRediscoveryMultiplier(base, species.rediscoveryAffinity, counter);
}
