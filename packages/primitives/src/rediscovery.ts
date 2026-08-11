/*
 * Multiverse Mages — the effective rediscovery multiplier, and the floor under it.
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
 * ## Why this arithmetic lives in `@mm/primitives`
 *
 * It was implemented twice — once in `rules-magic` (`instances/research.ts`)
 * and once in `rules-world` (`rediscovery.ts`) — computing *opposite* things.
 * `rules-magic` read `rediscoveryAffinity` as a multiplier, so a species good
 * at rediscovery paid more; `rules-world` read it as a divisor, so it paid
 * less. Both suites were green only because `contracts.md` §5 rule 3 forbids
 * the two packages importing each other, so nothing ever compared them. The
 * first caller to wire a mage's species into a research operation would have
 * silently taken whichever one it happened to import.
 *
 * That same §5 rule is why the fix cannot be "have one import the other". The
 * shared helper needs a home both rules packages may reach, and `@mm/primitives`
 * is it, for the reason its own barrel comment already gives: *"It sits between
 * `sim-core` and the rules packages because it is the only thing `rules-magic`,
 * `rules-world`, and `rules-raid` must agree on numerically."* This is exactly
 * such a number. `@mm/state` was the other candidate and is the wrong one: it
 * holds §1's world-state *shapes* and one predicate, and it takes no position
 * on arithmetic. §3's rule that a floor is never re-derived outside the one
 * shared helper points the same way — `caps.ts` is already here.
 *
 * ## The direction is `contracts.md` §2.4's, and it is a divisor
 *
 * §2.4 is normative and says `rediscoveryAffinity` is an *"fp DIVISOR against
 * `rediscoveryMultiplier`. Higher is better"*, so that all eight species traits
 * are read the same way round and vision §5's gnomes — who are good at
 * rediscovery — carry a *high* number. The shipped content agrees (gnome
 * `fp(1792)`, orc `fp(512)`), and so does the derivation of `content`'s
 * `V1_REDISCOVERY_AUTHORING_FLOOR`, which is `3072 × 1792 / 1024 = 5376`: a
 * break-even that only exists under division.
 *
 * `openspec/changes/knowledge-model/specs/knowledge-instances/spec.md` said the
 * opposite — *"the subject with the lower affinity requires strictly less
 * progress"* — and the spec has been corrected against the contract rather than
 * the other way about. `contracts.md` is normative; the spec was not.
 *
 * `rules-world`'s `SPECIES_TRAIT_REGISTRY` still *declares* that direction, as
 * one row of the eight-trait table whose whole purpose is that direction is
 * data rather than convention. It is not imported here — `primitives` sits
 * below `rules-world` and may not reach up — so the two are bound instead by a
 * conformance test in `rules-world` asserting that `applySpeciesTrait` on the
 * `rediscoveryAffinity` descriptor and {@link effectiveRediscoveryMultiplier}
 * produce the same number. Declaration in one place, arithmetic in one place,
 * and a check that they have not drifted apart.
 *
 * ## The floor exists to keep a shipped release note true
 *
 * `docs/design/release-plan.md`'s **0.3.0 claim** is that rediscovering a lost
 * node costs *at least three times* its original research cost. `contracts.md`
 * §2.3 carries the content-side half as an authoring invariant on
 * `rediscoveryMultiplier`. This module is the other half: affinity is applied
 * *first*, and the result is then floored at `fp(3072)`, because affinity alone
 * would otherwise take a node authored at exactly 3.0 down to 1.71× for a gnome
 * and falsify a claim that has already shipped.
 *
 * The alternative — clamping the content value and *then* applying affinity —
 * puts the guarantee back on the side of the composition that breaks it.
 *
 * ## The floor is not supposed to bind
 *
 * A clamp that fires on every call is a trait that does not exist: every
 * species would rediscover at exactly the floor and `rediscoveryAffinity` would
 * be decoration. That is why `contracts.md` §2.3 asks v1 nodes to be authored
 * above the break-even of `3072 × 1792 / 1024 = 5376` rather than at the floor,
 * and why {@link RediscoveryClampCounter} is a required argument rather than an
 * optional one. `caps.ts` makes the general form of this argument: a cap that
 * binds every time and a cap that never binds produce identical output, so the
 * balance finding is invisible without a count. The clamp count is the number
 * that tells 0.5.0 whether the trait is differentiating anything, and a counter
 * nobody is forced to pass is a counter that is not passed.
 */

import { div } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import type { SpeciesRecord } from '@mm/content';

/**
 * The hard floor on the effective rediscovery multiplier, in fixed point.
 *
 * A contract constant (`contracts.md` §2.3), not content: it is the numeric
 * form of a release claim, so it is pinned in code where changing it is a diff
 * a reviewer reads as "we are withdrawing the 0.3.0 claim".
 *
 * **This is the only copy.** It previously existed twice more — as
 * `REDISCOVERY_FLOOR` in `rules-world` and `REDISCOVERY_MULTIPLIER_FLOOR` in
 * `rules-magic` — which is one release claim expressed as three constants that
 * could disagree. Lowering this number is not a tuning change; it falsifies a
 * released claim.
 */
export const REDISCOVERY_FLOOR: Fixed = 3072;

/**
 * Counts how often the floor bound, i.e. how often species affinity was
 * discarded.
 *
 * Mutable and passed in, rather than returned, because the caller is a per-tick
 * loop and the interesting figure is the total over a run — that is what feeds
 * the per-tick emission the 0.4.0 brakes are supposed to be observable through.
 *
 * Deliberately not `ClampCounters`, which counts clamps per primitive id and
 * has no notion of an evaluation that did *not* clamp. Here the denominator is
 * the point: "the floor bound 40 times" says nothing without "out of how many",
 * because it is the *share* that distinguishes a floor that is doing its job
 * from one that has eaten the trait.
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
 * `effective = max(base × fp(1024) / rediscoveryAffinity, fp(3072))` — a
 * division, per `contracts.md` §2.4, so that a *higher* affinity makes
 * rediscovery cheaper and the trait reads the same way round as the other
 * seven. See the module note for why that reading and not the other.
 *
 * @param base - The node's authored `rediscoveryMultiplier`, in fixed point.
 * @param rediscoveryAffinity - The species' trait value, in fixed point.
 * @param counter - Accumulates floor clamps. Required on purpose; see above.
 *
 * @throws RangeError on a non-positive affinity. Content validation floors `fp`
 * traits at 1, so this is unreachable from valid content — it is here because a
 * divisor of zero would otherwise be the one input that turns a uniform rule
 * into a bare "div by zero", and a species-shaped fault should say so.
 */
export function effectiveRediscoveryMultiplier(
  base: Fixed,
  rediscoveryAffinity: Fixed,
  counter: RediscoveryClampCounter,
): Fixed {
  if (!Number.isInteger(rediscoveryAffinity) || rediscoveryAffinity <= 0) {
    throw new RangeError(
      `rediscoveryAffinity must be a positive fixed-point integer, received ` +
        `${String(rediscoveryAffinity)}. Content validation should have rejected this before ` +
        `it reached the rules path.`,
    );
  }

  const scaled = div(base, rediscoveryAffinity);
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
