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
 * # THESE TESTS FAIL ON PURPOSE
 *
 * ## (a) The behaviour believed to be incorrect
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
 * the draw instead of instead of it.
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
 * Test 1 asserts only that a positive population with a positive fertility and
 * an unbraked world produces **at least one child in two hundred world years**.
 * At the lowest `fertility` in shipped content the true expectation over 2,400
 * ticks is ≈1.76 births; the implementation delivers 0, deterministically, for
 * every seed. "More than zero children in two centuries" is not a balance claim
 * and needs no harness to adjudicate — an implementation that carried the
 * expectation at extended scale, exactly as the hazard path already does,
 * satisfies it.
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

describe('a small cohort at a low fertility is sterile rather than slow', () => {
  it('produces no child at all in two hundred world years', () => {
    // Control: the same arithmetic at a neutral rate is fine, so the inputs
    // below are not simply degenerate.
    expect(expectedBirths(birthsOf({ count: 2 }))).toBe(2 * BIRTHS_PER_MEMBER);

    const input = birthsOf({ count: 2, fertility: LOW_FERTILITY });

    // True expectation: 2 × 4 × 96 / 1024 = 0.75 fp units per tick, i.e. about
    // 1.76 children across the run. The first `mul` floors it to 0 and the
    // remainder draw never sees a remainder.
    let born = 0;
    for (let tick = 0; tick < TWO_HUNDRED_YEARS; tick += 1) {
      born += cohortBirths(stepRng(4242, tick), 11, input);
    }

    expect(born).toBeGreaterThan(0);
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
