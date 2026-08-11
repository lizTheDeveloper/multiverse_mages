/*
 * Multiverse Mages — age bands, derived from normalized age so six species
 * share three boundaries.
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

import { HAZARD_TABLE } from '../mages/hazard-table.js';

/**
 * ## Bands are a fraction of a life, never a count of months
 *
 * The `mage-autonomy` spec states it as a scenario: *"an elf and an orc are
 * each at normalized age `fp(512)` → both are in the same age band, despite an
 * absolute age difference of centuries."* Boundaries in months would need six
 * sets of numbers, and the shape they encode — a mage becomes senescent at some
 * proportion of her own life — is the same shape for all six. This is the same
 * argument `hazard-table.ts` makes for a scale-free `H`, one level up.
 *
 * ## The boundaries are the hazard table's own knots
 *
 * `fp(256)` and `fp(768)` are not fresh numbers. They are two of the seven
 * normalized ages `HAZARD_TABLE` is authored at: `256` is where "young
 * adulthood, flat" ends, and `768` is where the table's own comment says
 * "decline begins". Reading them off the table rather than restating them means
 * a tuning pass that moves the hazard curve moves the bands with it, instead of
 * leaving behind a `senescent` band that starts somewhere the mortality data no
 * longer thinks is interesting.
 *
 * That coupling is deliberate and is the reason this module imports the table
 * instead of declaring `fp(256)` twice. It also means there is exactly one
 * place to look when a balance analyst asks what "senescent" meant in a run.
 *
 * ## Why three bands and not five
 *
 * Each band is a row of the age-term table, so bands are a tuning surface the
 * balance harness has to sweep. Three is the fewest that expresses the thing
 * the design actually asks for — an early band that seeks teaching, a middle
 * band that produces, and a late band that preserves — and
 * `mages-and-species/design.md` gives the late band a structural job:
 * *"a species' `knowledgeHalfLife` depends on its age distribution, not merely
 * its lifespan."* A fourth band would need its own reason, and none has one.
 */

/**
 * The three bands, ascending.
 *
 * Values are stable in the same way goal ids are — they appear in the goal
 * histogram keyed by band and will key ablation output at 0.5.0.
 */
export const AGE_BAND = {
  /** Below the end of the hazard table's flat young-adult segment. */
  young: 0,
  /** Between the flat segment and the onset of decline. */
  prime: 1,
  /** At or past the onset of decline. */
  senescent: 2,
} as const;

/** Any band value. */
export type AgeBandValue = (typeof AGE_BAND)[keyof typeof AGE_BAND];

/** Every band, ascending, for iteration and for histogram key order. */
export const AGE_BANDS_IN_ORDER: readonly AgeBandValue[] = [
  AGE_BAND.young,
  AGE_BAND.prime,
  AGE_BAND.senescent,
];

/** Names for messages and histogram keys. Never keyed on mechanically. */
export const AGE_BAND_NAMES: Readonly<Record<AgeBandValue, string>> = {
  [AGE_BAND.young]: 'young',
  [AGE_BAND.prime]: 'prime',
  [AGE_BAND.senescent]: 'senescent',
};

/**
 * Reads a normalized age off the hazard table by knot index.
 *
 * @throws RangeError when the table is shorter than the index, which would mean
 * a tuning pass deleted a knot the bands are defined against. Throwing at
 * module load beats silently defaulting to `fp(0)` and putting every mage in
 * the world into the senescent band.
 */
function knotAge(index: number): Fixed {
  const knot = HAZARD_TABLE[index];
  if (knot === undefined) {
    throw new RangeError(
      `the hazard table has no knot ${String(index)}; age bands are defined against its knots, ` +
        'so removing one is a change to what "senescent" means and not only to mortality',
    );
  }
  return knot.normalizedAge;
}

/**
 * Normalized age at which `young` becomes `prime` — the end of the hazard
 * table's flat segment, `fp(256)`.
 */
export const PRIME_BEGINS_AT: Fixed = knotAge(1);

/**
 * Normalized age at which `prime` becomes `senescent` — where the hazard table
 * says decline begins, `fp(768)`.
 */
export const SENESCENCE_BEGINS_AT: Fixed = knotAge(3);

/**
 * The band a normalized age falls in.
 *
 * Half-open intervals, low end inclusive: exactly at {@link PRIME_BEGINS_AT} a
 * mage is `prime`, and exactly at {@link SENESCENCE_BEGINS_AT} she is
 * `senescent`. Stated because the spec's scenario turns on a mage *crossing*
 * into the senescent band, and a boundary that belongs to neither side is a
 * crossing that happens twice or not at all.
 *
 * @param normalizedAge - Age as a fraction of effective lifespan, `fp`.
 * Negative — a mage evaluated before her own birth tick — reads as `young`,
 * matching `hazardAt`'s clamp rather than throwing, because the world clock is
 * per-universe and a frozen engagement tick is a legitimate caller.
 */
export function ageBandOf(normalizedAge: Fixed): AgeBandValue {
  if (normalizedAge < PRIME_BEGINS_AT) return AGE_BAND.young;
  if (normalizedAge < SENESCENCE_BEGINS_AT) return AGE_BAND.prime;
  return AGE_BAND.senescent;
}
