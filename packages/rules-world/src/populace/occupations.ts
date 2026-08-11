/*
 * Multiverse Mages — the five occupations, and what each of them means.
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
import type { OccupationValue } from '@mm/state';
import { OCCUPATION } from '@mm/state';

/**
 * `docs/design/contracts.md` §1.3 gives a cohort five occupations and the
 * numbering lives in `@mm/state`. Nothing here redefines them: a second
 * spelling of `laborer = 0` is a second source of truth that disagrees with the
 * first the moment either moves, and the component field is a `u8` written
 * straight from that enum.
 *
 * What this module adds is the *reading* of the five, which the enum cannot
 * carry:
 *
 * - **`idle` is not "unemployed".** The `economy` spec is explicit: it means
 *   "not economically productive", and covers members below `maturityMonths`
 *   and those past productive age as well as adults between jobs. That reading
 *   is what makes {@link RETIREMENT_NORMALIZED_AGE} a mechanism rather than a
 *   decoration — "past productive age" means nothing unless something moves
 *   people there.
 * - **A deterministic iteration order.** {@link OCCUPATIONS_IN_ORDER} is the
 *   allocation order for reallocation and the reporting order for every
 *   per-occupation counter. Ascending enum value, fixed, never a `Object.keys`
 *   walk — the `economy` spec requires allocation order to be "fixed and
 *   reproducible, never dependent on hash iteration order".
 */

/**
 * Every occupation, ascending by contracted value.
 *
 * The one order any pass over occupations uses. Written as a literal rather
 * than derived from `Object.values(OCCUPATION)` so that the order is a
 * declaration a reviewer can check against §1.3, not a property of how the enum
 * object happened to be built.
 */
export const OCCUPATIONS_IN_ORDER: readonly OccupationValue[] = [
  OCCUPATION.laborer,
  OCCUPATION.scribe,
  OCCUPATION.student,
  OCCUPATION.soldier,
  OCCUPATION.idle,
];

/** The five of §1.3. A sixth is a contract change, not a content addition. */
export const OCCUPATION_COUNT: number = OCCUPATIONS_IN_ORDER.length;

/** Whether a `u8` names one of the five contracted occupations. */
export function isOccupation(value: number): value is OccupationValue {
  return Number.isInteger(value) && value >= 0 && value < OCCUPATION_COUNT;
}

/**
 * The occupations that produce something. `idle` is the complement, and
 * `student` is deliberately on this side of the line: a student is consuming
 * university capacity, which is a claim on the economy even though it yields no
 * materials.
 */
export const PRODUCTIVE_OCCUPATIONS: readonly OccupationValue[] = [
  OCCUPATION.laborer,
  OCCUPATION.scribe,
  OCCUPATION.student,
  OCCUPATION.soldier,
];

/** Whether an occupation is one the economy can be asked to staff. */
export function isProductive(occupation: OccupationValue): boolean {
  return occupation !== OCCUPATION.idle;
}

/**
 * The normalized age past which a cohort is retired into `idle`. **Untuned.**
 *
 * `fp(1024)` is exactly the species' nominal lifespan, so `fp(768)` is three
 * quarters of a life — an old-age retirement rather than a mid-career one. The
 * number is a placeholder chosen to make the mechanism observable before the
 * balance harness exists (`docs/design/release-plan.md`: no release before
 * 0.5.0 may claim any magnitude is balanced), and it is stated in *normalized*
 * age precisely so that it is one decision for all six species rather than six.
 *
 * Retirement is a deliberate addition, recorded here because it is not spelled
 * out in `contracts.md`: the `economy` spec's reading of `idle` as covering
 * those "past productive age" is vacuous without something that moves them, and
 * `mages-and-species/design.md` makes the same point about mortality — "only
 * means something if there is an end to be past".
 *
 * Note the interaction with decade bucketing: a cohort's age is that of its
 * bucket midpoint, so the threshold bites within ±60 ticks of where it reads.
 */
export const RETIREMENT_NORMALIZED_AGE: Fixed = floorDiv(FP_ONE * 3, 4);
