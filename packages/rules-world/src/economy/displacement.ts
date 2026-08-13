/*
 * Multiverse Mages — what magic costs the role it replaces.
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
 * ## Why this module exists
 *
 * Across the three hundred authored nodes there are 59 `resource-yield`
 * effects, 55 `research-rate` and 33 `build-rate`, and **every one of them is a
 * pure bonus**. Nothing an academic learns has ever cost the universe anything,
 * so no ruleset is worth weighing against another on anything but breadth: more
 * permitted cells is more output, always, with no term on the other side.
 *
 * `node.schema.json`'s optional `displacement` is the other side, and this
 * module is the arithmetic behind it: *the thing that raises output also
 * removes the role that used to produce it.* A spell that quarries stone
 * without hands raises the yield of a quarry and empties it of quarrymen, and
 * the people who used to work it still eat.
 *
 * The shape was found by accident before it was authored. A measured run on
 * better ground lost **18.4%** of its population because students do not farm;
 * that was displacement arriving unauthored, in a mechanism nobody wrote.
 * Authoring it makes the pattern a data field on an effect instead of seven
 * separate mechanics, and — the point of doing it this way — makes it
 * *authorable*: the tradeoff moves by editing `node.json`, not by editing here.
 *
 * ## The arithmetic is not this module's
 *
 * Shares stack **multiplicative-on-remainder**, which is `@mm/primitives`'
 * `multiplicativeOnRemainder` and nothing else. Each contributing instance
 * removes its share of *what is left*, so two five-per-cent spells remove
 * 9.75%, not 10%, and no number of them reaches the whole workforce. That is
 * the same rule `ward` and `concealment` use and it is imported rather than
 * re-derived, for the reason `contracts.md` §3 gives: the single most likely
 * silent disagreement between two implementers is exactly this fold.
 *
 * ## Why the cap is here and not in `primitive.json`
 *
 * A cap needs a home, and the obvious one — a `displacement` primitive with a
 * declared cap — is refused. There are sixteen primitives and all three hundred
 * nodes are `tuningStatus: "untuned"`; adding a seventeenth adds an unswept
 * axis to a harness that has not finished sweeping the ones it has, and the
 * whole argument for a data field is that it is *not* a new primitive.
 *
 * So the ceiling is a constant here, in the same class as
 * `MASTERY_ACTIVATION_THRESHOLD` and `MATERIALS_PER_LABORER` — a placeholder
 * the balance harness may move, taken as a parameter at every entry point so
 * that moving it does not mean editing this file. It is still clamped through
 * `applyCap` and still counted through {@link ClampCounters}, because a cap
 * that binds on every evaluation and a cap that never binds produce identical
 * output and only the counter tells them apart.
 */

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv } from '@mm/sim-core';
import type { PrimitiveCap } from '@mm/content';
import type { ClampCounters } from '@mm/primitives';
import { applyCap, multiplicativeOnRemainder } from '@mm/primitives';

/**
 * The id displacement clamps are counted under.
 *
 * Not a primitive id — `ClampCounters` keys on strings and the registry is not
 * consulted — and deliberately spelled so that a reader of a harness report
 * cannot mistake it for one. It sorts among the primitives in that report,
 * which is what makes "the displacement ceiling is pinned" as visible as "the
 * `research-rate` cap is pinned".
 */
export const DISPLACEMENT_CLAMP_ID = 'labor-displacement';

/**
 * The most of a workforce that magic may ever replace, `fp`. **Untuned.**
 *
 * `fp(512)` is half. The ceiling exists because the fold cannot reach one on
 * its own but can get close enough to make a universe's materials production
 * a rounding error, and a civilization whose fields are entirely empty is a
 * state nobody chose — it is what a long enough list of small numbers does.
 * Half is a legible claim a reviewer can argue with: *magic never does more
 * than half the work.*
 *
 * Stated as a `PrimitiveCap` rather than a bare number so that the clamp goes
 * through the one implementation in `@mm/primitives`, which counts it.
 */
export const DISPLACED_LABOR_CAP: PrimitiveCap = { kind: 'fp', value: 512 };

/** What {@link stackDisplacedLabor} was told, beyond the shares themselves. */
export interface DisplacementOptions {
  /** Where the ceiling's clamp is counted. Optional; the harness passes one. */
  readonly counters?: ClampCounters | undefined;
  /** Defaults to {@link DISPLACED_LABOR_CAP}. */
  readonly cap?: PrimitiveCap | undefined;
}

/** The combined share, and whether the ceiling decided it. */
export interface DisplacementOutcome {
  /** The share of the workforce displaced, `fp`. `0` when nothing displaces. */
  readonly fraction: Fixed;
  /** True exactly when the cap bound. */
  readonly clamped: boolean;
}

/** Nothing displaces anything — the shape a universe with no such magic has. */
export const NO_DISPLACEMENT: DisplacementOutcome = { fraction: 0, clamped: false };

/**
 * Folds one instance's shares into the share of the workforce magic replaces.
 *
 * @param shares - One entry per contributing instance, `fp`, each the share
 * *that instance* removes. Order does not matter: `multiplicativeOnRemainder`
 * sorts before folding, because floored multiplication does not associate and
 * two peers must agree to the unit.
 * @returns `0` for no shares — the identity of the rule, which is what a
 * universe with no displacing magic has, rather than a missing value a caller
 * substitutes a default for.
 */
export function stackDisplacedLabor(
  shares: readonly Fixed[],
  options: DisplacementOptions = {},
): DisplacementOutcome {
  const cap = options.cap ?? DISPLACED_LABOR_CAP;
  const capped = applyCap(cap, multiplicativeOnRemainder(shares));
  if (capped.clamped) options.counters?.record(DISPLACEMENT_CLAMP_ID);
  return { fraction: capped.value, clamped: capped.clamped };
}

/**
 * How many of a cohort's laborers are left after displacement.
 *
 * The **displaced count is rounded to nearest**, and the choice matters more
 * than a rounding choice usually does, because the populace is stored in
 * decade-of-birth cohorts and a share is applied to each of them separately.
 * Rounding the displaced count *up* — equivalently, flooring the survivors —
 * makes any share at all take the whole of a one-person cohort, so a 2.5%
 * spell empties a cohort of one and takes a fifth of a cohort of five. The
 * error is one-sided, it grows with how finely the populace happens to be
 * split, and it is largest in exactly the early game the balance harness
 * cares most about. Rounding to nearest is unbiased at every cohort size and
 * costs only that a share under a half displaces nobody from a cohort of one,
 * which is the correct answer to "half a person".
 *
 * The displaced are **not** moved to another occupation and are not removed
 * from the populace. They are still counted, still fed, and still bear
 * children; what has gone is the work they used to do. That is what makes this
 * a cost rather than a re-labelling — a universe that displaces half its
 * laborers has the same mouths and half the harvest.
 *
 * @param laborers - Headcount, a plain integer and not `fp`.
 * @param fraction - The combined share from {@link stackDisplacedLabor}, `fp`.
 */
export function laborAfterDisplacement(laborers: number, fraction: Fixed): number {
  if (!Number.isInteger(laborers) || laborers < 0) {
    throw new RangeError(
      `laborAfterDisplacement needs a non-negative integer headcount, received ${String(laborers)}`,
    );
  }
  if (fraction <= 0) return laborers;
  const share = Math.min(fraction, FP_ONE);
  // `+ FP_ONE / 2` before the floor is round-half-up, through the repository's
  // one rounding helper. Both operands are non-negative here, so half-up and
  // half-away-from-zero are the same rule and there is no sign asymmetry for
  // `contracts.md` §3 to object to.
  const displacedCount = floorDiv(laborers * share + FP_ONE / 2, FP_ONE);
  return laborers - Math.min(laborers, displacedCount);
}
