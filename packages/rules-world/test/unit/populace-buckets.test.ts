/*
 * Multiverse Mages — decade bucketing of populace cohorts.
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

import { describe, expect, it } from 'vitest';

import { FP_ONE, WORLD_TICKS_PER_YEAR } from '@mm/sim-core';

import {
  BIRTH_BUCKET_TICKS,
  birthBucketOf,
  bucketMidBirthTick,
  cohortAgeMonths,
  normalizedCohortAge,
} from '@mm/rules-world';

describe('a birth bucket is a decade of world time', () => {
  it('is ten world years wide, which is what makes the entity bound a decade count', () => {
    expect(BIRTH_BUCKET_TICKS).toBe(10 * WORLD_TICKS_PER_YEAR);
    expect(BIRTH_BUCKET_TICKS).toBe(120);
  });

  it('floors a birth tick to the start of its decade', () => {
    expect(birthBucketOf(0)).toBe(0);
    expect(birthBucketOf(119)).toBe(0);
    expect(birthBucketOf(120)).toBe(120);
    expect(birthBucketOf(3599)).toBe(3480);
  });

  it('floors toward negative infinity, so a pre-epoch founder does not land a decade late', () => {
    // A scenario that seeds a founding population with birth ticks before tick 0
    // is the ordinary case, not an exotic one. Truncation toward zero would put
    // tick -1 and tick +1 in the same bucket.
    expect(birthBucketOf(-1)).toBe(-120);
    expect(birthBucketOf(-120)).toBe(-120);
    expect(birthBucketOf(-121)).toBe(-240);
  });

  it('is idempotent: bucketing a bucket returns it unchanged', () => {
    for (const tick of [-360, -120, 0, 120, 4800]) {
      expect(birthBucketOf(birthBucketOf(tick))).toBe(birthBucketOf(tick));
    }
  });

  it('rejects a non-integer tick rather than truncating it', () => {
    expect(() => birthBucketOf(1.5)).toThrow(RangeError);
  });
});

describe('a cohort ages from the middle of its bucket', () => {
  it('takes the bucket midpoint as the representative birth tick', () => {
    // Bounded, symmetric error of ±60 ticks. Taking the bucket *start* would
    // make every cohort up to a decade older than its members really are, which
    // biases mortality upward for every species by the same absolute amount —
    // and therefore hardest on the short-lived ones.
    expect(bucketMidBirthTick(0)).toBe(60);
    expect(bucketMidBirthTick(120)).toBe(180);
    expect(bucketMidBirthTick(-120)).toBe(-60);
  });

  it('clamps age at zero for the newborn half-decade', () => {
    // Newborns enter the bucket containing the current tick, so for up to 60
    // ticks the representative birth is in the future. A negative age would
    // index the hazard table below its first entry.
    expect(cohortAgeMonths(0, 0)).toBe(0);
    expect(cohortAgeMonths(0, 59)).toBe(0);
    expect(cohortAgeMonths(0, 60)).toBe(0);
    expect(cohortAgeMonths(0, 61)).toBe(1);
  });

  it('advances one month per world tick once past the midpoint', () => {
    expect(cohortAgeMonths(0, 1260)).toBe(1200);
    expect(cohortAgeMonths(120, 1260)).toBe(1080);
  });
});

describe('normalized age is scale-free', () => {
  it('is fp(1024) at exactly the species lifespan', () => {
    expect(normalizedCohortAge(3000, 3000)).toBe(FP_ONE);
    expect(normalizedCohortAge(18000, 18000)).toBe(FP_ONE);
  });

  it('gives species of very different lifespans the same index at the same life fraction', () => {
    // The whole reason the hazard table is scale-free: one table, six species.
    expect(normalizedCohortAge(1500, 3000)).toBe(normalizedCohortAge(9000, 18000));
  });

  it('does not floor to zero for a long-lived species one month old', () => {
    // Not a precision claim — normalized age genuinely is zero for the first
    // 17 months of an 18,000-month life at fp scale. Recorded so that the
    // *hazard* precision trap is not confused with this one: the table is
    // indexed coarsely on purpose, and it is the division by lifespanMonths
    // that must not floor. See lifespan-rate.ts.
    expect(normalizedCohortAge(18, 18000)).toBe(1);
    expect(normalizedCohortAge(17, 18000)).toBe(0);
  });

  it('rejects a non-positive lifespan instead of dividing by zero', () => {
    expect(() => normalizedCohortAge(10, 0)).toThrow(RangeError);
  });
});
