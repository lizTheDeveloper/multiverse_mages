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
 * These tests do not fix anything. They pin the behaviour so the arithmetic is
 * checkable, and they state the guard that is missing.
 */

import { describe, expect, it } from 'vitest';

import { assignStrategies } from '../../src/sweep-spec.js';
import type { AgentPoolSpec } from '../../src/sweep-spec.js';

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

  /**
   * The guard that is missing, written as the assertion a sweep validator would
   * make. Left as a documented expectation rather than added to `sweep-spec.ts`,
   * because this branch verifies and does not fix.
   */
  it('has no validator refusing a replicate count below the pool size', () => {
    const counts = coverage(EIGHT, 4, 6);
    expect(counts.size).toBeLessThan(EIGHT.length);
  });
});
