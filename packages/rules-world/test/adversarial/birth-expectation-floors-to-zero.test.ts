/*
 * Multiverse Mages — adversarial: births round to nothing before the draw that
 * was supposed to carry them.
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
 * # A regression guard on the births expectation
 *
 * These tests were written to fail, and did. The defect is fixed —
 * `expectedBirths` now carries the expectation at `BIRTH_RATE_ONE` and the draw
 * is taken over that same range — so they are kept as the guard, with the
 * original analysis intact because the fix is not self-evident from the code.
 *
 * ## (a) The behaviour that was incorrect
 *
 * `expectedBirths` computes
 * `mul(mul(mul(count × BIRTHS_PER_MEMBER, fertility), primitiveMultiplier), brake)`.
 * Every `mul` floors toward negative infinity at `fp` scale, so each of the
 * three discards up to one `fp` unit — and one `fp` unit is `1/1024` of a
 * birth, which is the *entire* resolution the downstream fractional draw
 * operates at. `cohortBirths` then takes its single stream-6 draw against
 * `expected - floor(expected)`, so whatever the three `mul`s threw away is
 * already gone before the draw exists to recover it.
 *
 * Two consequences, both asserted below:
 *
 * 1. A cohort whose true expectation is a fraction of an `fp` unit expects
 *    **exactly zero** births, on every tick, for every seed, forever. It is
 *    not "unlikely to reproduce"; it is sterile, and nothing counts it.
 * 2. Because the floor is applied *per cohort*, the same headcount produces
 *    different births depending on how finely it happens to be bucketed. A
 *    species' populace is legitimately spread across
 *    `5 occupations × ceil(lifespanMonths / 120)` cohorts (`design.md`'s own
 *    bound), so the penalty falls hardest on the longest-lived species — which
 *    silently biases exactly the differentiation 0.4.0 claims to ship.
 *
 * ## (b) The lines that say it should be otherwise
 *
 * `packages/rules-world/src/economy/carrying-capacity.ts`, file header:
 *
 *   > One draw per cohort, on stream 6 [...] Integer part plus one fractional
 *   > draw **preserves the expected value exactly** at O(cohorts).
 *
 * It does not preserve it exactly. It preserves whatever survives three floors.
 *
 * `openspec/changes/mages-and-species/design.md`, on the identical
 * integer-plus-one-draw arithmetic used for promotion, records the alternative
 * it rejected and why:
 *
 *   > *Alternative considered:* pure integer truncation with no remainder draw.
 *   > Rejected — for small cohorts and low-aptitude species it truncates to
 *   > zero every time, so orcs and dragons would produce literally no mages,
 *   > **and the bias is silent**.
 *
 * The births path reintroduces that rejected behaviour by flooring upstream of
 * the draw instead of it.
 *
 * `docs/design/contracts.md` §3 states the general rule this is an instance of:
 *
 *   > **Extended precision is mandatory wherever a per-tick rate derives from a
 *   > long span.** [...] a defect that would survive thousands of Monte Carlo
 *   > runs looking like a species that is merely very long-lived.
 *
 * A birth rate per member per month *is* a per-tick rate derived from a long
 * span: a member produces a handful of children across hundreds of months, so
 * the per-month number is inherently sub-`fp`. This package already ships the
 * fix for the mortality instance of the same trap — `lifespan-rate.ts`'s
 * `perLifespanRate`, whose own header says the narrowing "must never be applied
 * before a comparison against a draw". `expectedBirths` narrows first.
 *
 * ## (c) Why the asserted values are the right ones
 *
 * Test 1 asserts that the per-tick *expectation* is non-zero, and that sampling
 * it over many seeds converges on the analytic figure. At the lowest `fertility`
 * in shipped content the true expectation over 2,400 ticks is ≈1.76 births; the
 * implementation delivered 0, deterministically, for every seed, because the
 * expectation itself was 0.
 *
 * **Corrected during the fix.** This test originally ran one seed and required
 * at least one child, and this paragraph claimed that "an implementation that
 * carried the expectation at extended scale satisfies it". That was wrong, and
 * finding out why is the reason it is written down here: at an expectation of
 * 1.76, an unbiased implementation still yields zero for about e^-1.76 ≈ 17% of
 * seeds, so the assertion was a coin flip that happened to land on the seed
 * chosen — and one that would have gone red on any later change to draw
 * ordering or scale. A red test that a correct change causes is worse than no
 * test. Asserted as the expectation and its mean instead, which is the property
 * the defect actually violated.
 *
 * Test 2 asserts that a headcount which expects births when held as one cohort
 * does not expect *exactly zero* when the same people are held as several. Both
 * assertions in it are satisfied simultaneously by any implementation that does
 * not floor per cohort; neither demands a particular magnitude. This is the
 * mutual-satisfiability check the brief requires, done explicitly: the failing
 * assertion asks for `> 0`, and the control assertion in the same test shows
 * `> 0` is reachable from the same inputs.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';

import {
  BIRTHS_PER_MEMBER,
  BIRTH_RATE_ONE,
  cohortBirths,
  expectedBirths,
  fertilityBrake,
} from '../../src/index.js';
import type { BirthInput } from '../../src/index.js';

import { primitiveNamed } from '../unit/universities-fixtures.js';
import { stepRng } from '../unit/mage-fixtures.js';

/**
 * The lowest `fertility` magnitude the shipped content authors, as a bare
 * number.
 *
 * Written as a literal rather than read from the registry on purpose: this file
 * is about fixed-point arithmetic, not about any particular content row, and a
 * lookup would make the test read as a claim about a species rather than about
 * a `mul` chain.
 */
const LOW_FERTILITY = 96;

/** World ticks in two hundred world years, at twelve ticks to the year. */
const TWO_HUNDRED_YEARS = 200 * 12;

const birthsOf = (overrides: Partial<BirthInput> = {}): BirthInput => ({
  count: 1000,
  fertility: FP_ONE,
  fertilityPrimitive: primitiveNamed('fertility'),
  fertilityBonuses: [],
  brake: FP_ONE,
  ...overrides,
});

describe('a small cohort at a low fertility is slow rather than sterile', () => {
  it('carries an expectation a small low-fertility cohort can actually sample', () => {
    // Control: the same arithmetic at a neutral rate is fine, so the inputs
    // below are not simply degenerate.
    expect(expectedBirths(birthsOf({ count: 2 }))).toBe(2 * BIRTHS_PER_MEMBER);

    const input = birthsOf({ count: 2, fertility: LOW_FERTILITY });

    // True expectation: 2 × 4 × 96 / 1024 = 0.75 fp units per tick, i.e. about
    // 1.76 children across the run. The first `mul` floored it to 0 and the
    // remainder draw never saw a remainder.
    //
    // ## Asserted as an expectation, not as one sample
    //
    // This originally ran one seed for two hundred years and required at least
    // one child. That assertion is a coin flip wearing a property's clothes: at
    // a true expectation of 1.76, *any* unbiased implementation produces zero
    // for about e^-1.76 ≈ 17% of seeds. It would have passed or failed on which
    // seed was written down, and it would have flipped on any change to draw
    // ordering or scale — a test that goes red for a correct change is worse
    // than no test, because the next person to see it red will assume it lies.
    //
    // The defect was never about one run. It was that the *expectation itself*
    // was zero, so the two things worth asserting are that the expectation
    // survives the arithmetic, and that sampling it is unbiased in the mean.

    // The expectation survives: this is the defect, stated directly. At fp
    // scale this was 0; at BIRTH_RATE_ONE it is the real 0.75 of an fp unit.
    const expectedPerTick = expectedBirths(input);
    expect(expectedPerTick).toBeGreaterThan(0);
    expect(expectedPerTick).toBe((2 * BIRTHS_PER_MEMBER * LOW_FERTILITY) / FP_ONE);

    // And sampling it is unbiased. Averaged over many seeds the run converges
    // on the analytic figure; a single seed is allowed to be a 0 or a 4.
    const SEEDS = 200;
    const expectedPerRun = (expectedPerTick * TWO_HUNDRED_YEARS) / BIRTH_RATE_ONE;
    let total = 0;
    let seedsWithAnyChild = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      let born = 0;
      for (let tick = 0; tick < TWO_HUNDRED_YEARS; tick += 1) {
        born += cohortBirths(stepRng(seed, tick), 11, input);
      }
      total += born;
      if (born > 0) seedsWithAnyChild += 1;
    }

    // Within 15% of 1.76 children per run. Wide enough that it is not a
    // restatement of the generator, tight enough that reinstating any of the
    // three floors — which zeroes it outright — cannot pass.
    const mean = total / SEEDS;
    expect(mean).toBeGreaterThan(expectedPerRun * 0.85);
    expect(mean).toBeLessThan(expectedPerRun * 1.15);

    // And the sterility claim, which is what the defect actually produced:
    // the great majority of seeds must yield a child, not merely the mean.
    expect(seedsWithAnyChild).toBeGreaterThan(SEEDS * 0.7);
  });
});

describe('the same people expect different births depending on the bucketing', () => {
  it('does not fall to zero when a population is held as several cohorts', () => {
    // Nineteen twentieths of carrying capacity is an ordinary steady state,
    // not an edge: a logistic brake is designed to leave a universe sitting
    // just under `K`, approaching it and never reaching it. The brake is a
    // twentieth of full and comfortably non-zero.
    const brake = fertilityBrake(9500, 10_000);
    expect(brake).toBeGreaterThan(0);

    // One thousand people, held one way and then another. Four per cohort is
    // not a contrivance: `design.md` bounds cohorts at
    // `6 × 5 × ceil(maxLifespanMonths / 120)`, which is 750 buckets for the
    // longest-lived row in shipped content, so a four-figure population of a
    // long-lived kind averages low single digits per cohort.
    const asOneCohort = expectedBirths(birthsOf({ count: 1000, brake }));
    const asManyCohorts = 250 * expectedBirths(birthsOf({ count: 4, brake }));

    // Control: the unpartitioned form does expect births, so the partitioned
    // form asking for more than zero is satisfiable from these same inputs.
    expect(asOneCohort).toBeGreaterThan(0);
    expect(asManyCohorts).toBeGreaterThan(0);
  });
});
