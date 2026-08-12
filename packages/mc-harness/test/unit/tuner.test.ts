/*
 * Multiverse Mages — the balance score refuses the failures it was written for.
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
 * The tests that matter here are not "does entropy compute". They are the
 * measured historical failures, written as cases: a ruleset that sat inside the
 * §7 band while one strategy won everything must not score well, and a ruleset
 * where the idle probe beats the pool must be marked even if it is varied.
 */

import { describe, expect, it } from 'vitest';

import type { StrategyOutcome } from '../../src/tuner.js';
import {
  DOMINANCE_LIMIT,
  EXPLOIT_PROBE,
  candidatesForAxis,
  correlationOf,
  scoreBalance,
  varietyOf,
} from '../../src/tuner.js';

const WEIGHTS = { variety: 1, correlation: 1, exploit: 1 } as const;
const BAND = { min: 0.05, max: 0.2 } as const;

const POOL = [
  'passive-control',
  'uniform-random-legal',
  'permissive-breadth',
  'narrow-depth',
  'denial-warden',
  'archivist',
  'portal-rush',
  'worship-maximizer',
] as const;

/** Builds a pool outcome from `{ strategyId: [ascended, meanNodes] }`. */
function pool(
  spec: Partial<Record<(typeof POOL)[number], readonly [number, number]>>,
  runs = 10,
): StrategyOutcome[] {
  return POOL.map((strategyId) => {
    const entry = spec[strategyId] ?? ([0, 50] as const);
    return { strategyId, ascended: entry[0], runs, meanNodesKnown: entry[1] };
  });
}

describe('the historical failure this score exists to refuse', () => {
  it('marks the ruleset where the band was green and one strategy won everything', () => {
    // The measured 0.125: 10 of 80 runs ascended, all ten of them the random
    // bot. In band, and the game had one strategy.
    const measured = pool({ 'uniform-random-legal': [10, 50] }, 10);
    const score = scoreBalance(measured, WEIGHTS, BAND);

    expect(score.inBand).toBe(true);
    expect(score.topShare).toBe(1);
    expect(score.variety).toBe(0);
    // The probe beat the pool, so the margin is negative and the note says so.
    expect(score.exploitMargin).toBeLessThan(0);
    expect(score.notes.join(' ')).toContain('reachable without playing');
  });

  it('prefers a spread of winners to a single winner at the same rate', () => {
    const concentrated = pool({ 'permissive-breadth': [8, 200] }, 10);
    const spread = pool(
      {
        'permissive-breadth': [3, 200],
        archivist: [3, 150],
        'narrow-depth': [2, 120],
      },
      10,
    );
    expect(scoreBalance(spread, WEIGHTS, BAND).score).toBeGreaterThan(
      scoreBalance(concentrated, WEIGHTS, BAND).score,
    );
  });
});

describe('the band gate dominates everything else', () => {
  it('ranks any in-band candidate above any out-of-band one, however varied', () => {
    // Everybody ascends: maximally varied, and not a game.
    const everyoneWins = pool(
      Object.fromEntries(POOL.map((id) => [id, [10, 100] as const])) as never,
      10,
    );
    const dullButInBand = pool({ 'permissive-breadth': [8, 200] }, 10);

    const varied = scoreBalance(everyoneWins, WEIGHTS, BAND);
    const dull = scoreBalance(dullButInBand, WEIGHTS, BAND);

    expect(varied.ascensionRate).toBe(1);
    expect(varied.inBand).toBe(false);
    expect(varied.variety).toBeGreaterThan(0.9);
    expect(dull.score).toBeGreaterThan(varied.score);
  });

  it('scores a further-out candidate below a nearer-out one, so search has a gradient', () => {
    const near = pool({ 'permissive-breadth': [3, 200] }, 10); // 0.0375, just under
    const far = pool(Object.fromEntries(POOL.map((id) => [id, [10, 100] as const])) as never, 10);
    expect(scoreBalance(near, WEIGHTS, BAND).score).toBeGreaterThan(
      scoreBalance(far, WEIGHTS, BAND).score,
    );
  });

  it('an empty pool is out of band rather than a division by zero', () => {
    const score = scoreBalance(pool({}, 10), WEIGHTS, BAND);
    expect(score.ascensionRate).toBe(0);
    expect(Number.isFinite(score.score)).toBe(true);
  });

  it('ranks an unwinnable ruleset below one that is far too easy', () => {
    // The first search run converged on ascensionRate 0.000 and preferred it to
    // 0.458. Absolute distance said so honestly: the floor is 0.05 and the
    // ceiling 0.20, so nobody-wins is 0.05 out and 46%-win is 0.26 out. The
    // band's own asymmetry had become a preference for an unwinnable game.
    const unwinnable = pool({}, 10);
    const farTooEasy = pool(
      {
        'permissive-breadth': [10, 200],
        archivist: [10, 120],
        'portal-rush': [10, 51],
        'worship-maximizer': [7, 51],
        'uniform-random-legal': [7, 50],
      },
      10,
    );
    const easyScore = scoreBalance(farTooEasy, WEIGHTS, BAND);
    expect(easyScore.ascensionRate).toBeCloseTo(0.55, 2);
    expect(easyScore.inBand).toBe(false);
    expect(scoreBalance(unwinnable, WEIGHTS, BAND).score).toBeLessThan(easyScore.score);
  });

  it('says unwinnable rather than reporting a variety of zero as if it were measured', () => {
    const score = scoreBalance(pool({}, 10), WEIGHTS, BAND);
    expect(score.notes.join(' ')).toContain('unwinnable');
  });

  it('measures distance relative to the edge it missed, so too-hard and too-easy compare', () => {
    // Equal *relative* misses score equally. Half the floor (0.025, out by 50%
    // of 0.05) against one and a half times the ceiling (0.30, out by 50% of
    // 0.20). Note these are not "half" and "double" — relative distance is not
    // symmetric in the ratio, and pairing them that way was the first version
    // of this test and was wrong.
    const runs = 40; // 8 strategies x 40 = 320 runs
    const tooHard = pool({ archivist: [8, 120] }, runs); // 8/320 = 0.025
    const tooEasy = pool(
      Object.fromEntries(POOL.map((id) => [id, [12, 120] as const])) as never,
      runs,
    ); // 96/320 = 0.30
    const hard = scoreBalance(tooHard, WEIGHTS, BAND);
    const easy = scoreBalance(tooEasy, WEIGHTS, BAND);
    expect(hard.ascensionRate).toBeCloseTo(0.025, 3);
    expect(easy.ascensionRate).toBeCloseTo(0.3, 3);
    expect(hard.inBand).toBe(false);
    expect(easy.inBand).toBe(false);
    expect(hard.score).toBeCloseTo(easy.score, 6);
  });
});

describe('variety', () => {
  it('is zero when one strategy takes every win and 1 when all share equally', () => {
    expect(varietyOf(pool({ archivist: [8, 50] }, 10))).toBe(0);
    const equal = pool(Object.fromEntries(POOL.map((id) => [id, [1, 50] as const])) as never, 10);
    expect(varietyOf(equal)).toBeCloseTo(1, 10);
  });

  it('normalises over the whole pool, not over the winners only', () => {
    // Two strategies splitting every win evenly must NOT score a perfect
    // variety just because they are even with each other.
    const twoOfEight = pool({ archivist: [4, 50], 'portal-rush': [4, 50] }, 10);
    expect(varietyOf(twoOfEight)).toBeLessThan(0.5);
  });
});

describe('correlation between winning and knowing magic', () => {
  it('is positive when the strategies that win are the ones that learned more', () => {
    const outcomes = pool(
      { 'permissive-breadth': [6, 220], archivist: [3, 120], 'narrow-depth': [0, 7] },
      10,
    );
    expect(scoreBalance(outcomes, WEIGHTS, BAND).correlation).toBeGreaterThan(0);
  });

  it('is flagged when winners know no more magic than losers', () => {
    // The measured state after the harness artifact was fixed: portal-rush and
    // worship-maximizer ascend 12/12 at 50.9 and 51.0 nodes, against a
    // passive-control that never declares and sits at 51.0. The winners are at
    // the passive baseline, so knowledge has no variance across the pool and no
    // relationship with winning is detectable — which is the finding.
    const flat = 50;
    const outcomes = pool(
      { 'portal-rush': [4, flat], 'worship-maximizer': [4, flat] },
      10,
    );
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    expect(score.correlation).toBe(0);
    expect(score.notes.join(' ')).toContain('does not measure play');
  });

  it('reports 0 rather than NaN when one side has no variance', () => {
    expect(correlationOf([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(correlationOf([1, 2, 3], [5, 5, 5])).toBe(0);
    expect(correlationOf([1], [2])).toBe(0);
  });
});

describe('the exploit probe', () => {
  it('is uniform-random-legal, not passive-control', () => {
    // passive-control's stance is `never`, so "it does not win" is true by
    // construction and measures nothing.
    expect(EXPLOIT_PROBE).toBe('uniform-random-legal');
  });

  it('margin is positive when deliberate strategies out-win the random bot', () => {
    const outcomes = pool(
      { 'permissive-breadth': [6, 220], archivist: [5, 150], 'uniform-random-legal': [1, 50] },
      10,
    );
    expect(scoreBalance(outcomes, WEIGHTS, BAND).exploitMargin).toBeGreaterThan(0);
  });
});

describe('dominance', () => {
  it('penalises a strategy holding more than the limit of all wins', () => {
    const outcomes = pool({ archivist: [7, 50], 'portal-rush': [1, 50] }, 10);
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    expect(score.topShare).toBeGreaterThan(DOMINANCE_LIMIT);
    expect(score.notes.join(' ')).toContain('dominance limit');
  });
});

describe('the search visits every level and never re-runs the incumbent', () => {
  it('skips the level the incumbent already holds', () => {
    const incumbent = { 'ascension-tier-gate': 4, 'ascension-era-count': 4 };
    const candidates = candidatesForAxis(incumbent, {
      constantId: 'ascension-tier-gate',
      levels: [3, 4, 5],
    });
    expect(candidates).toHaveLength(2);
    expect(candidates.map((entry) => entry['ascension-tier-gate'])).toEqual([3, 5]);
  });

  it('carries every other constant through unchanged', () => {
    const incumbent = { 'ascension-tier-gate': 4, 'ascension-era-count': 4 };
    for (const candidate of candidatesForAxis(incumbent, {
      constantId: 'ascension-tier-gate',
      levels: [5, 6],
    })) {
      expect(candidate['ascension-era-count']).toBe(4);
    }
  });

  it('returns nothing when the axis offers only the incumbent, so a pass terminates', () => {
    expect(
      candidatesForAxis({ 'ascension-tier-gate': 5 }, {
        constantId: 'ascension-tier-gate',
        levels: [5],
      }),
    ).toEqual([]);
  });
});
