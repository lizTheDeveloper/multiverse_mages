/*
 * Multiverse Mages — W6 verification: round-robin silently drops strategies when
 * the replicate count is not a multiple of the pool size.
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
 * The defect, stated as arithmetic.
 *
 * `assignStrategies` under `round-robin` at one agent slot returns
 * `strategies[replicateIndex % size]`, and **`cellIndex` does not enter it**. So
 * the set of strategies a sweep ever runs is `strategies[0 .. min(replicates,
 * size) - 1]`, no matter how many factor cells there are: adding cells multiplies
 * the runs each *already-covered* strategy gets and never reaches a new one.
 *
 * `bin/tune-balance.mjs` defaults to `--replicates 6` against
 * `balance-gate-ascension.sweep.json`, whose pool is eight strategies. Every
 * trial of the search therefore evaluates a **six**-strategy pool of 24 runs, and
 * `portal-rush` and `worship-maximizer` are never assigned a single run. Nothing
 * warns: `outcomesOf` folds the records that exist, so `scoreBalance` receives
 * six outcomes and normalises `varietyOf` by `log(6)`, and `exploitMargin`'s
 * `poolMean` averages six rates rather than eight.
 *
 * The consequence for a reported number: a scan reporting `rate 0.167 exploit
 * +0.167` on "the eight-strategy sweep" is reporting `1/6`, not `1/8` — one
 * strategy winning all four of its runs in a six-strategy pool. The same ruleset
 * measured at `--replicates 24` (96 runs, twelve per strategy, all eight
 * covered) reads 0.115.
 *
 * The first four tests pin the arithmetic, which is unchanged: `assignStrategies`
 * still cycles on the replicate index and still ignores `cellIndex`, because
 * that is what round-robin *means* and changing it would silently re-seed every
 * committed sweep.
 *
 * **W18 supplies the guard the last test used to record as missing.**
 * `validateSweep` now refuses a round-robin sweep whose replicate count is not a
 * multiple of its pool size, and `coverageProblem` asserts the coverage that was
 * actually observed after the records come back. Refusal rather than a warning:
 * this defect reached a committed constant once already.
 */

import { describe, expect, it } from 'vitest';

import { coverageProblem } from '../../src/tuner.js';
import type { StrategyOutcome } from '../../src/tuner.js';
import { assignStrategies, roundRobinCoverageProblem, validateSweep } from '../../src/sweep-spec.js';
import type { AgentPoolSpec } from '../../src/sweep-spec.js';
import { TOY_REGISTRIES, toySweep } from './fixtures.js';

const EIGHT = [
  'passive-control',
  'uniform-random-legal',
  'permissive-breadth',
  'narrow-depth',
  'denial-warden',
  'archivist',
  'portal-rush',
  'worship-maximizer',
];

const pool = (strategies: readonly string[]): AgentPoolSpec =>
  ({ strategies: [...strategies], assignment: 'round-robin', slots: 1 }) as AgentPoolSpec;

/** Every strategy the sweep would ever assign, with its run count. */
function coverage(strategies: readonly string[], cells: number, replicates: number) {
  const counts = new Map<string, number>();
  for (let cell = 0; cell < cells; cell += 1) {
    for (let replicate = 0; replicate < replicates; replicate += 1) {
      const id = assignStrategies(pool(strategies), cell, replicate)[0] as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

describe('round-robin coverage depends on replicates alone, never on the cell count', () => {
  it('drops portal-rush and worship-maximizer at the tuner\'s default of 6 replicates', () => {
    const counts = coverage(EIGHT, 4, 6);
    expect([...counts.keys()].sort()).toEqual(
      ['archivist', 'denial-warden', 'narrow-depth', 'passive-control', 'permissive-breadth', 'uniform-random-legal'],
    );
    expect(counts.has('portal-rush')).toBe(false);
    expect(counts.has('worship-maximizer')).toBe(false);
    // 24 runs, four each, over six strategies. A single winner therefore reads
    // 4/24 = 0.1667 rather than the 0.125 an eight-strategy pool would give.
    expect([...counts.values()]).toEqual([4, 4, 4, 4, 4, 4]);
  });

  it('is not rescued by adding factor cells, because cellIndex does not enter the formula', () => {
    for (const cells of [1, 4, 16, 64]) {
      const counts = coverage(EIGHT, cells, 6);
      expect(counts.size, `${cells} cells still reaches only six strategies`).toBe(6);
    }
  });

  it('covers the whole pool exactly when replicates is at least the pool size', () => {
    for (const replicates of [8, 24, 96]) {
      const counts = coverage(EIGHT, 4, replicates);
      expect(counts.size).toBe(8);
      expect(new Set(counts.values()).size, 'and covers it evenly when it divides').toBe(1);
    }
  });

  it('is uneven, not merely incomplete, when replicates is not a multiple of the pool size', () => {
    // 12 replicates over 8 strategies: four strategies get 8 runs and four get 4.
    // `ascensionRate` (a run-weighted ratio) and `exploitMargin`'s `poolMean` (an
    // unweighted mean of per-strategy rates) then disagree, which is the one
    // regime where the two headline numbers are not the same quantity.
    const counts = coverage(EIGHT, 4, 12);
    expect([...counts.values()].sort((a, b) => a - b)).toEqual([4, 4, 4, 4, 8, 8, 8, 8]);
  });

});

// ---------------------------------------------------------------------------
// W18: the guard, supplied.
// ---------------------------------------------------------------------------

describe('the sweep validator refuses a pool it would not cover', () => {
  it('names the tuner default that produced the shipped constant', () => {
    const problem = roundRobinCoverageProblem(EIGHT.length, 6);
    expect(problem).toContain('replicates is 6');
    expect(problem).toContain('only 6');
    expect(problem).toContain('dropping 2');
    expect(problem).toContain('multiple of 8');
  });

  it('accepts exactly the multiples, and nothing else', () => {
    for (const replicates of [8, 16, 24, 96]) {
      expect(roundRobinCoverageProblem(8, replicates), `${String(replicates)} divides`).toBeUndefined();
    }
    for (const replicates of [1, 6, 7, 9, 12, 20]) {
      expect(roundRobinCoverageProblem(8, replicates), `${String(replicates)} does not`).toBeDefined();
    }
  });

  it('refuses the covered-but-uneven case, which is the one the two headline numbers disagree in', () => {
    // 12 replicates over 8 strategies reaches all eight — and gives four of them
    // twice the runs of the other four, so `ascensionRate` (run-weighted) and the
    // exploit margin's pool mean (unweighted over strategies) stop being the same
    // quantity. Coverage alone would have let this through.
    expect(coverage(EIGHT, 4, 12).size).toBe(8);
    expect(roundRobinCoverageProblem(8, 12)).toContain('unevenly');
  });

  it('is wired into validateSweep, so an under-covering sweep never dispatches', () => {
    const bad = toySweep({ replicates: 3 }); // pool of two, round-robin
    const problems = validateSweep(bad, TOY_REGISTRIES);
    expect(problems.some((problem) => problem.includes('round-robin'))).toBe(true);
    // The committed shape — replicates a multiple of the pool — still validates.
    expect(validateSweep(toySweep({ replicates: 4 }), TOY_REGISTRIES)).toEqual([]);
  });

  it('leaves fixed and mirrored assignment alone: neither cycles on the replicate index', () => {
    const fixedSpec = toySweep({
      replicates: 3,
      agentPool: { strategies: ['toy-passive', 'toy-greedy'], assignment: 'fixed', slots: 1 },
    });
    expect(validateSweep(fixedSpec, TOY_REGISTRIES)).toEqual([]);
  });
});

describe('observed coverage is asserted after the records come back', () => {
  const outcome = (strategyId: string, runs: number): StrategyOutcome => ({
    strategyId,
    ascended: 0,
    runs,
    meanNodesKnown: 51,
  });

  it('catches the six-strategy fold that scored the eight-strategy sweep', () => {
    const folded = EIGHT.slice(0, 6).map((id) => outcome(id, 4));
    const problem = coverageProblem(folded, EIGHT);
    expect(problem).toContain('portal-rush');
    expect(problem).toContain('worship-maximizer');
    expect(problem).toContain('never ran');
  });

  it('catches uneven coverage even when every strategy appears', () => {
    const folded = EIGHT.map((id, index) => outcome(id, index < 4 ? 8 : 4));
    expect(coverageProblem(folded, EIGHT)).toContain('unevenly');
  });

  it('catches a strategy the pool never declared', () => {
    const folded = [...EIGHT, 'permit-then-idle'].map((id) => outcome(id, 4));
    expect(coverageProblem(folded, EIGHT)).toContain('permit-then-idle');
  });

  it('passes only on full, even coverage', () => {
    expect(coverageProblem(EIGHT.map((id) => outcome(id, 12)), EIGHT)).toBeUndefined();
  });
});
