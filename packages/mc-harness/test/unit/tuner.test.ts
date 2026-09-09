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
  CORRELATION_MIN_SUPPORT,
  DOMINANCE_LIMIT,
  EXPLOIT_MARGIN_MIN,
  EXPLOIT_PROBE,
  EXPLOIT_PROBES,
  candidatesForAxis,
  correlationOf,
  scoreBalance,
  spearmanOf,
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

/**
 * The same, but over an arbitrary strategy list, so a fixture can name the
 * adversarial probes that are not in the shipped eight.
 */
function poolWith(
  spec: Record<string, readonly [number, number]>,
  runs = 10,
): StrategyOutcome[] {
  const ids = [...new Set([...POOL, ...Object.keys(spec)])];
  return ids.map((strategyId) => {
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
    // The measured state after the harness artifact was fixed: portal-rush,
    // worship-maximizer and archivist all sit at the passive baseline of 51
    // nodes, and so does the passive control. The winners know exactly what the
    // losers know, so no relationship with winning is detectable — which is the
    // finding. Three winners, so the support gate is satisfied and the number
    // being reported is the coefficient rather than the absence of one.
    const flat = 50;
    const outcomes = pool(
      { 'portal-rush': [2, flat], 'worship-maximizer': [2, flat], archivist: [2, flat] },
      10,
    );
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    expect(score.nonZeroStrategies).toBe(3);
    expect(score.correlation).toBe(0);
    expect(score.notes.join(' ')).toContain('does not measure play');
  });

  it('reports 0 rather than NaN when one side has no variance', () => {
    expect(correlationOf([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(correlationOf([1, 2, 3], [5, 5, 5])).toBe(0);
    expect(correlationOf([1], [2])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// W18 (C): Spearman beside Pearson, and the support count beside both.
// ---------------------------------------------------------------------------

describe('the correlation term reports its own shape, because neither coefficient can', () => {
  /**
   * The measured W6 pool, transcribed from the campaign board: `permissive-
   * breadth` takes 12 of its 12 runs and reaches 262 nodes, every other strategy
   * ascends zero times, and the losers sit at the passive ceiling of 51 apart
   * from the two deniers.
   */
  const MEASURED_W6 = pool(
    {
      'permissive-breadth': [12, 262],
      'passive-control': [0, 51],
      'uniform-random-legal': [0, 51],
      archivist: [0, 51],
      'portal-rush': [0, 51],
      'worship-maximizer': [0, 51],
      'narrow-depth': [0, 9],
      'denial-warden': [0, 5],
    },
    12,
  );

  it('reproduces the review\'s shape, and states plainly where it cannot reproduce its digits', () => {
    const score = scoreBalance(MEASURED_W6, WEIGHTS, BAND);

    // The adversarial review reported Pearson +0.955 and Spearman +0.615. This
    // fixture reads +0.970 and +0.661. **The gap is the fixture, not the
    // arithmetic**, and it is recorded rather than tuned away: the node means
    // above are the campaign board's rounded per-strategy figures (262, 51, 9,
    // 5), and the review computed from the sweep's exact means, which are not
    // in the board. Both coefficients are sensitive to those magnitudes —
    // Spearman through the tie structure, since which strategies sit at exactly
    // 51.0 decides how many ranks are shared.
    //
    // Fitting the fixture until the digits matched would be inventing data to
    // reproduce a number, which is the failure mode this whole workstream is
    // about. `spearmanOf` is pinned by hand-computed arithmetic instead, below.
    expect(score.correlation).toBeCloseTo(0.97, 2);
    expect(score.spearman).toBeCloseTo(0.661, 2);
    expect(score.nonZeroStrategies).toBe(1);
  });

  it('computes Spearman with average ranks, checked against the arithmetic by hand', () => {
    // x = [1, 2, 2, 4]: the two ties span ranks 2 and 3, so both take 2.5.
    //   ranks x = [1, 2.5, 2.5, 4], mean 2.5, dx = [-1.5, 0, 0, 1.5]
    //   ranks y = [1, 2, 3, 4],     mean 2.5, dy = [-1.5, -0.5, 0.5, 1.5]
    //   sxy = 2.25 + 0 + 0 + 2.25 = 4.5
    //   sxx = 4.5, syy = 5  ->  r = 4.5 / sqrt(22.5) = 0.94868...
    // Ordinal ranks would have given [1, 2, 3, 4] against [1, 2, 3, 4] and
    // reported a perfect 1, inventing an order between the two tied values out
    // of their array positions. That is the failure this case pins.
    expect(spearmanOf([1, 2, 2, 4], [10, 20, 30, 40])).toBeCloseTo(4.5 / Math.sqrt(22.5), 12);
    expect(spearmanOf([1, 2, 2, 4], [10, 20, 30, 40])).toBeLessThan(1);
    // Perfectly monotone but wildly non-linear: Spearman is exactly 1 where
    // Pearson is not, which is the whole reason both are reported.
    expect(spearmanOf([1, 2, 3, 4], [1, 2, 3, 4000])).toBeCloseTo(1, 12);
    expect(correlationOf([1, 2, 3, 4], [1, 2, 3, 4000])).toBeLessThan(0.9);
    // No variance on one side is 0, matching correlationOf's contract.
    expect(spearmanOf([1, 1, 1], [1, 2, 3])).toBe(0);
  });

  it('is the finding: BOTH coefficients are comfortably positive on one point', () => {
    const score = scoreBalance(MEASURED_W6, WEIGHTS, BAND);
    // This is why the repair could not be a threshold. Any cut-off that admits
    // a real relationship also admits this, because the number is high in both
    // coefficients — the degeneracy is in the *support*, not in the magnitude.
    expect(score.correlation).toBeGreaterThan(0.5);
    expect(score.spearman).toBeGreaterThan(0.5);
  });

  it('drops to nothing scored, because one winner is not a relationship', () => {
    const score = scoreBalance(MEASURED_W6, WEIGHTS, BAND);
    expect(score.nonZeroStrategies).toBeLessThan(CORRELATION_MIN_SUPPORT);
    expect(score.notes.join(' ')).toContain('leveraged point');
    // The whole in-band score is variety + correlation + exploit - dominance,
    // and with variety 0, an unsupported correlation and a 100% top share the
    // only surviving term is the exploit margin.
    const supported = scoreBalance(
      pool(
        {
          'permissive-breadth': [5, 262],
          archivist: [4, 150],
          'narrow-depth': [3, 90],
        },
        12,
      ),
      WEIGHTS,
      BAND,
    );
    expect(supported.nonZeroStrategies).toBe(3);
    expect(supported.score).toBeGreaterThan(score.score);
  });

  it('gives ties the average rank, so seven strategies at zero are not ordered by array position', () => {
    // Reversing the order of the tied losers must not move Spearman.
    const reversed = [...MEASURED_W6].reverse();
    expect(spearmanOf(
      MEASURED_W6.map((entry) => entry.ascended / entry.runs),
      MEASURED_W6.map((entry) => entry.meanNodesKnown),
    )).toBeCloseTo(
      spearmanOf(
        reversed.map((entry) => entry.ascended / entry.runs),
        reversed.map((entry) => entry.meanNodesKnown),
      ),
      12,
    );
  });

  it('scores the weaker of the two coefficients, not the flattering one', () => {
    // Monotone but sharply non-linear: Spearman is 1 and Pearson is lower, so
    // the scored term must follow Pearson here — and on the measured pool,
    // where Pearson is the higher of the two, it must follow Spearman.
    const outcomes = pool(
      { 'permissive-breadth': [6, 1000], archivist: [4, 60], 'narrow-depth': [2, 55] },
      12,
    );
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    expect(score.spearman).toBeGreaterThan(score.correlation);
    // variety + min(pearson, spearman) + exploit - dominance, so recovering the
    // correlation term from the score identifies which coefficient was used.
    const dominance = score.topShare > DOMINANCE_LIMIT ? score.topShare - DOMINANCE_LIMIT : 0;
    const used = score.score - score.variety - score.exploitMargin + dominance;
    expect(used).toBeCloseTo(Math.min(score.correlation, score.spearman), 10);
  });
});

// ---------------------------------------------------------------------------
// W18 (B): the exploit margin excludes its own probes.
// ---------------------------------------------------------------------------

describe('the exploit probes', () => {
  it('are three, not one, and passive-control is none of them', () => {
    // passive-control's stance is `never`, so "it does not win" is true by
    // construction and measures nothing.
    expect(EXPLOIT_PROBES).not.toContain('passive-control');
    expect([...EXPLOIT_PROBES].sort()).toEqual([
      'idle-then-declare',
      'permit-then-idle',
      'uniform-random-legal',
    ]);
    expect(EXPLOIT_PROBE).toBe('uniform-random-legal');
  });

  it('margin is positive when deliberate strategies out-win the random bot', () => {
    const outcomes = pool(
      { 'permissive-breadth': [6, 220], archivist: [5, 150], 'uniform-random-legal': [1, 50] },
      10,
    );
    expect(scoreBalance(outcomes, WEIGHTS, BAND).exploitMargin).toBeGreaterThan(0);
  });

  it('excludes the probe from the mean it is compared against', () => {
    const outcomes = pool(
      { 'permissive-breadth': [7, 220], 'uniform-random-legal': [1, 50] },
      10,
    );
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    // Seven non-probe strategies, one of them at 0.7: 0.7/7 = 0.1. Including
    // the probe would have divided by eight and given 0.0875 — and, more to the
    // point, would have made the margin identically `ascensionRate - probeRate`.
    expect(score.deliberateMean).toBeCloseTo(0.1, 10);
    expect(score.probeRate).toBeCloseTo(0.1, 10);
    expect(score.exploitMargin).toBeCloseTo(0, 10);
  });

  it('takes the worst probe, so beating two of three is not passing', () => {
    const outcomes = poolWith(
      {
        'permissive-breadth': [6, 262],
        archivist: [4, 150],
        'narrow-depth': [2, 90],
        'uniform-random-legal': [0, 50],
        'idle-then-declare': [0, 51],
        // The degenerate-play probe: it permits for 140 ticks and idles for
        // 2260, and it measured permissive-breadth's exact profile.
        'permit-then-idle': [6, 231],
      },
      12,
    );
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    expect(score.probeRate).toBeCloseTo(0.5, 10);
    expect(score.exploitMargin).toBeLessThan(0);
    expect(score.feasible).toBe(false);
    expect(score.notes.join(' ')).toContain('permit-then-idle');
  });

  it('is unmeasured rather than zero when the pool declares no probe at all', () => {
    const noProbe = pool({ 'permissive-breadth': [6, 262], archivist: [4, 150] }, 10).filter(
      (entry) => !EXPLOIT_PROBES.includes(entry.strategyId),
    );
    const score = scoreBalance(noProbe, WEIGHTS, BAND);
    expect(Number.isNaN(score.exploitMargin)).toBe(true);
    expect(score.feasible).toBe(false);
    expect(score.notes.join(' ')).toContain('unmeasured constraint');
  });
});

describe('the exploit margin is no longer a restatement of the band', () => {
  it('can fail while the band passes', () => {
    const outcomes = poolWith(
      {
        'permissive-breadth': [3, 262],
        archivist: [2, 150],
        'narrow-depth': [1, 90],
        'idle-then-declare': [6, 51],
      },
      12,
    );
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    expect(score.inBand).toBe(true);
    expect(score.exploitMargin).toBeLessThan(0);
  });

  it('can pass while the band fails, which the old identity made impossible', () => {
    // Every deliberate strategy wins outright and no probe ever does: the
    // exploit margin is the maximum 1.0 and the ruleset is far too easy.
    const outcomes = poolWith(
      {
        'permissive-breadth': [12, 262],
        archivist: [12, 150],
        'narrow-depth': [12, 90],
        'denial-warden': [12, 60],
        'passive-control': [12, 51],
        'portal-rush': [12, 51],
        'worship-maximizer': [12, 51],
        'uniform-random-legal': [0, 51],
      },
      12,
    );
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    expect(score.inBand).toBe(false);
    expect(score.exploitMargin).toBeCloseTo(1, 10);
  });

  it('and its threshold is not the band floor, which is what made the two read as one', () => {
    expect(EXPLOIT_MARGIN_MIN).not.toBe(BAND.min);
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

describe('feasibility is a constraint, not a preference', () => {
  it('marks a varied, in-band ruleset infeasible when the idle probe still wins', () => {
    // The exact shape of the current build: everybody ascends at the passive
    // baseline and the bot that plays nothing wins as often as anyone.
    const outcomes = pool(
      {
        'uniform-random-legal': [3, 50],
        'portal-rush': [2, 50],
        'worship-maximizer': [2, 50],
        archivist: [1, 50],
      },
      10,
    );
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    expect(score.inBand).toBe(true);
    expect(score.variety).toBeGreaterThan(0.4);
    expect(score.feasible).toBe(false);
    expect(score.notes.join(' ')).toContain('infeasible');
  });

  it('is feasible only when the pool beats the probe by the required margin', () => {
    const outcomes = pool(
      { 'permissive-breadth': [4, 220], archivist: [4, 180], 'narrow-depth': [3, 120] },
      10,
    );
    const score = scoreBalance(outcomes, WEIGHTS, BAND);
    expect(score.inBand).toBe(true);
    expect(score.exploitMargin).toBeGreaterThanOrEqual(EXPLOIT_MARGIN_MIN);
    expect(score.feasible).toBe(true);
  });

  it('an out-of-band candidate is never feasible, whatever its exploit margin', () => {
    const outcomes = pool(
      Object.fromEntries(POOL.map((id) => [id, [9, 200] as const])) as never,
      10,
    );
    expect(scoreBalance(outcomes, WEIGHTS, BAND).feasible).toBe(false);
  });
});
