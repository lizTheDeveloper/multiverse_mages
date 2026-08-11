/*
 * Multiverse Mages — the shared, scale-free mortality hazard table.
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
import { floorDiv, lerp } from '@mm/sim-core';

/**
 * ## One table for every lifespan
 *
 * `H` is indexed by **normalized** age — age as a fraction of the mage's
 * effective lifespan, at `fp` scale, so `fp(1024)` means "exactly at the nominal
 * lifespan" whether that lifespan is 720 months or 18,000. The per-tick hazard
 * is then `H(normalizedAge) / effectiveLifespanMonths`, which is what makes the
 * same six rows give an orc sixty years and a dragon fifteen hundred.
 *
 * The alternative — a per-species curve — was not considered seriously, and the
 * reason is worth stating because it looks like flexibility given up for
 * nothing. A per-species table is six tables the balance harness has to sweep
 * independently, six places a shape can drift apart, and six chances for one
 * species to acquire a hazard shape nobody meant to author. The scale-free form
 * says something stronger and cheaper: species differ in *how long* they live,
 * not in *the shape* of how they die. `mages-and-species`' design note leaves
 * the door open for a species-specific shape later, on the grounds that adding
 * one is easy and removing one is not.
 *
 * ## The same table serves cohorts
 *
 * `mages-and-species` task 3.8 gives populace cohorts their mortality from
 * *this* table, indexed by the normalized age implied by `birthTickBucket`.
 * That is why the table is exported from the package root rather than kept
 * private to the mage lifecycle: two tables that were supposed to be one is how
 * a universe ends up with mages and commoners ageing on different curves for no
 * authored reason.
 *
 * ## Every magnitude here is untuned
 *
 * The rows are `mages-and-species`' placeholder table, transcribed. They encode
 * a *shape* — flat through young adulthood, rising through midlife, steep past
 * the nominal lifespan — and they claim nothing about being balanced.
 * `docs/design/release-plan.md` forbids any such claim before the balance
 * harness exists at 0.5.0, which is why {@link HAZARD_TABLE_TUNING_STATUS} is a
 * machine-readable value rather than a sentence in this comment.
 */

/** Mirrors `@mm/content`'s `TuningStatus` without importing a content type for a constant. */
export const HAZARD_TABLE_TUNING_STATUS = 'untuned';

/**
 * One knot of the piecewise-linear hazard curve.
 *
 * `normalizedAge` is `fp`; `hazard` is the scale-free numerator, also `fp`, and
 * is deliberately allowed far above `fp(1024)` — it is not a probability. It
 * becomes one only after division by a lifespan, which is the whole point of
 * the scale-free form.
 */
export interface HazardKnot {
  readonly normalizedAge: Fixed;
  readonly hazard: Fixed;
}

/**
 * `H(normalizedAge)`, as data.
 *
 * Ascending in `normalizedAge`, and asserted so by a test rather than assumed:
 * the interpolation below walks the array in order, and an out-of-order knot
 * would produce a silently non-monotonic curve — a mage who gets *safer* as she
 * ages, in a table that still looks plausible read top to bottom.
 *
 * The first two knots share a hazard on purpose. `mages-and-species` describes
 * the region `0 – 256` as "young adulthood, flat", and a flat segment is two
 * knots, not one; writing it as a single knot at 0 would slope the whole of
 * youth upward toward midlife.
 */
export const HAZARD_TABLE: readonly HazardKnot[] = [
  { normalizedAge: 0, hazard: 1024 },
  { normalizedAge: 256, hazard: 1024 },
  { normalizedAge: 512, hazard: 1536 },
  { normalizedAge: 768, hazard: 4096 },
  { normalizedAge: 1024, hazard: 12288 },
  { normalizedAge: 1280, hazard: 49152 },
  { normalizedAge: 1536, hazard: 196608 },
];

/**
 * The scale-free hazard numerator at a normalized age.
 *
 * Constant below the first knot and above the last: extrapolating past the end
 * of the table would take the hazard of a mage at normalized age `fp(3072)` to
 * something like `fp(1.4 million)`, which is not more dead than "effectively
 * certain" and only invites an overflow in the division that follows.
 *
 * @param normalizedAge - Age as a fraction of effective lifespan, in fixed
 * point. Negative values — a mage evaluated before her own birth tick — clamp
 * to the first knot rather than throwing, because the clock is per-universe and
 * an engagement-mode caller can legitimately hold a tick that has not advanced.
 * @returns `H`, in fixed point. Never zero for any input, which is the property
 * the extended-scale division downstream exists to preserve.
 */
export function hazardAt(normalizedAge: Fixed): Fixed {
  const first = HAZARD_TABLE[0];
  const last = HAZARD_TABLE[HAZARD_TABLE.length - 1];
  if (first === undefined || last === undefined) {
    throw new RangeError('the hazard table is empty; H(normalizedAge) is undefined');
  }
  if (normalizedAge <= first.normalizedAge) return first.hazard;
  if (normalizedAge >= last.normalizedAge) return last.hazard;

  for (let i = 1; i < HAZARD_TABLE.length; i += 1) {
    const lower = HAZARD_TABLE[i - 1];
    const upper = HAZARD_TABLE[i];
    if (lower === undefined || upper === undefined) continue;
    if (normalizedAge > upper.normalizedAge) continue;

    const span = upper.normalizedAge - lower.normalizedAge;
    // `t` is the position within the segment at fp scale. Computed with the
    // shared floor division rather than `div`, because both operands are plain
    // fp-scale ages rather than a fixed-point ratio — `div` would scale twice.
    const t = floorDiv((normalizedAge - lower.normalizedAge) * 1024, span);
    return lerp(lower.hazard, upper.hazard, t);
  }

  // Unreachable: `normalizedAge` sits strictly between the first and last knot,
  // so some segment contains it. Present because `noImplicitReturns` is on and
  // a loop the compiler cannot prove exhaustive needs a terminal answer.
  return last.hazard;
}
