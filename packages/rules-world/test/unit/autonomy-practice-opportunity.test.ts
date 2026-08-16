/*
 * Multiverse Mages — practice's opportunity term, pinned rather than asserted
 * in a comment.
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
 * **This file exists because the defect it pins was a false comment nothing
 * checked.**
 *
 * `STALE_HOLDING_CAP` shipped documented as *"chosen so that the two together
 * cannot exceed `TERM_BOUND.opportunity`"*, of a term that read
 * `candidateOpportunity(practiceTargets.length) + min(staleHoldings, 3) x 96`.
 * Four candidates and three stale holdings are `256 + 288 = 544` against a bound
 * of `512`. The arithmetic in the sentence was wrong on the day it was written,
 * the term therefore clamped on ordinary inputs — the dead signal the sentence
 * said it had been designed to avoid — and `practice` carried the largest
 * opportunity in the table against `scribe`'s ceiling of 256. The whole suite
 * was green throughout, because nothing anywhere evaluated this term at its
 * documented worst case.
 *
 * So the claim is a test now. Every other goal's opportunity term is exercised
 * somewhere by scoring; this one is exercised *at its maximum*, which is the
 * only input where the bug was visible.
 */

import { describe, expect, it } from 'vitest';

import {
  GOAL,
  OPPORTUNITY_PER_STALE_HOLDING,
  STALE_HOLDING_CAP,
  TERM_BOUND,
  opportunityTerm,
} from '../../src/index.js';

import { goalAppealWeights, outlook, target } from './autonomy-fixtures.js';

/** An outlook with a stated number of stale holdings and candidates. */
function practising(staleHoldings: number, candidates: number) {
  return outlook({
    staleHoldings,
    practiceTargets: Array.from({ length: candidates }, (_unused, index) => target(61 + index)),
  });
}

describe("practice's opportunity is the stale-holding count and nothing else", () => {
  it('is zero for a mage with nothing below the teaching threshold', () => {
    // Candidates without staleness cannot happen since `practisableBy` gates on
    // the threshold, but the term must not invent pressure if they ever do.
    expect(opportunityTerm(GOAL.practice, practising(0, 4), goalAppealWeights)).toBe(0);
  });

  it('rises one quantum per stale holding, up to the cap', () => {
    for (let stale = 0; stale <= STALE_HOLDING_CAP; stale += 1) {
      expect(opportunityTerm(GOAL.practice, practising(stale, stale), goalAppealWeights)).toBe(
        stale * OPPORTUNITY_PER_STALE_HOLDING,
      );
    }
  });

  it('is concave by truncation — a fourth stale holding adds nothing', () => {
    const atCap = opportunityTerm(GOAL.practice, practising(STALE_HOLDING_CAP, 4), goalAppealWeights);
    expect(opportunityTerm(GOAL.practice, practising(STALE_HOLDING_CAP + 9, 4), goalAppealWeights)).toBe(atCap);
  });

  it('does not count the candidate list as well, which is the same fact twice', () => {
    // `practiceTargets` is the truncated stale holdings since `practisableBy`
    // began gating on `DEFAULT_TEACH_THRESHOLD`. Adding a candidate term to a
    // staleness term over the same set counts one situation twice, and the sum
    // is what used to overflow the bound. Same staleness, more candidates, same
    // answer.
    const one = opportunityTerm(GOAL.practice, practising(2, 1), goalAppealWeights);
    expect(opportunityTerm(GOAL.practice, practising(2, 4), goalAppealWeights)).toBe(one);
  });

  it('never reaches its own clamp, which the removed term did on ordinary input', () => {
    // The worst case the shipped comment named: the cap in both counts.
    const worst = opportunityTerm(GOAL.practice, practising(STALE_HOLDING_CAP, 4), goalAppealWeights);
    expect(worst).toBe(STALE_HOLDING_CAP * OPPORTUNITY_PER_STALE_HOLDING);
    expect(worst).toBeLessThan(TERM_BOUND.opportunity);
    // And the arithmetic the old comment got wrong, stated as a number so a
    // future edit to either constant fails here rather than silently clamping.
    expect(STALE_HOLDING_CAP * OPPORTUNITY_PER_STALE_HOLDING).toBe(288);
    expect(TERM_BOUND.opportunity).toBe(512);
  });
});
