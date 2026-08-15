/*
 * Multiverse Mages — what the two world-scale rate consumers do at zero.
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
 * Signed magnitudes make `(1 + Σ)` able to cross zero, and these two consumers
 * multiply straight through it. Before `@mm/primitives` floored the fold, an
 * adversarial pass found both:
 *
 * - `scribingThroughput` returned **negative scribe-months** — a university
 *   un-copying its own books;
 * - `expectedBirths` returned **−4 births** for a cohort of a million.
 *
 * Neither has a guard of its own, and neither should: a bound repeated per
 * consumer is a bound three consumers get to disagree about. The floor is one
 * rule at one boundary, and these tests are what fails if it is removed.
 *
 * Both files also pin the *upper* half of the same statement — that the cost
 * genuinely bites below the floor rather than being ignored — because a
 * consumer that clamped its own input would pass the zero assertions while
 * making the cost do nothing, which is the failure this whole change exists to
 * end.
 *
 * `expectedBirths` is not reachable from the world loop today: `world-step.ts`
 * passes `fertilityBonuses: []` and no node authors a `fertility` effect. The
 * assertion is here anyway, because the wire is a one-line change and the
 * negative headcount it would produce is state corruption rather than a bad
 * balance number.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import { ClampCounters } from '@mm/primitives';

import type { BirthInput, UniversityRecord } from '../../src/index.js';
import {
  BUILD_COMPLETE,
  SCRIBE_MONTHS_PER_SCRIBE,
  expectedBirths,
  scribeRateMultiplier,
  scribingThroughput,
} from '../../src/index.js';

import { primitiveNamed, scribeRatePrimitive } from './universities-fixtures.js';

const finished: UniversityRecord = { libraryId: 0, capacity: 40, buildProgress: BUILD_COMPLETE };

const staffed = (scribeRateBonuses: readonly number[]) => ({
  scribeCount: 10,
  scribeAffinity: FP_ONE,
  scribeRate: scribeRatePrimitive(),
  scribeRateBonuses,
});

const births = (fertilityBonuses: readonly number[]): BirthInput => ({
  count: 1_000_000,
  fertility: FP_ONE,
  fertilityPrimitive: primitiveNamed('fertility'),
  fertilityBonuses,
  brake: FP_ONE,
});

describe('scribing honours a cost and never runs backwards', () => {
  it('produces less than neutral under a cost', () => {
    const neutral = scribingThroughput(finished, staffed([]));
    const costed = scribingThroughput(finished, staffed([-512]));
    expect(neutral).toBe(10 * SCRIBE_MONTHS_PER_SCRIBE);
    expect(costed).toBeLessThan(neutral);
    expect(costed).toBeGreaterThan(0);
  });

  it('produces exactly zero when the costs floor the rate, never a negative', () => {
    expect(scribeRateMultiplier(staffed([-FP_ONE * 3]))).toBe(0);
    expect(scribingThroughput(finished, staffed([-FP_ONE * 3]))).toBe(0);
  });

  it('reports the floor rather than swallowing it', () => {
    const counters = new ClampCounters();
    scribeRateMultiplier({ ...staffed([-FP_ONE * 3]), counters });
    expect(counters.floorCount('scribe-rate')).toBe(1);
    // Not a ceiling clamp. `world-step.ts` reports `rateClamps.total()` into
    // the capital emission and this must not appear there.
    expect(counters.total()).toBe(0);
  });
});

describe('a cohort never has a negative number of births', () => {
  it('bears fewer children under a fertility cost', () => {
    const neutral = expectedBirths(births([]));
    const costed = expectedBirths(births([-512]));
    expect(costed).toBeLessThan(neutral);
    expect(costed).toBeGreaterThan(0);
  });

  it('bears exactly none once the costs floor the multiplier', () => {
    // −4 before the floor existed, at exactly this cohort size.
    expect(expectedBirths(births([-FP_ONE - 4]))).toBe(0);
    expect(expectedBirths(births([-FP_ONE * 8]))).toBe(0);
  });
});
