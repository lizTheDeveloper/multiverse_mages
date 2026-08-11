/*
 * Multiverse Mages — the shared Gini estimator and both snowball metrics.
 * Task 6.8.
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

import type { ArmRunSummary, CheckpointSample } from '@mm/mc-harness';
import {
  NO_MECHANICS,
  SNOWBALL_CHECKPOINT_TICKS,
  checkpointGinis,
  collectCapitalSnowball,
  collectWorshipSnowball,
  gini,
  nearestRank,
  tailRatio,
} from '@mm/mc-harness';

import { ALL_MECHANICS, arm, armRun } from './metrics-fixtures.js';

/** Checkpoint samples for every pinned checkpoint, with one quantity varying. */
function checkpoints(
  libraryNodeCount: number,
  favorRegenPerTick: number | null = null,
): CheckpointSample[] {
  return SNOWBALL_CHECKPOINT_TICKS.map((worldTick) => ({
    worldTick,
    favorRegenPerTick,
    libraryNodeCount,
  }));
}

describe('the shared Gini estimator (task 6.8)', () => {
  it('is 0 for a perfectly equal sample', () => {
    expect(gini([5, 5, 5, 5]).coefficient).toBeCloseTo(0, 12);
  });

  it('reproduces the pinned formula on a hand-checked sample', () => {
    // x = [1, 2, 3, 4], n = 4, Σx = 10, Σ i·x_i = 1+4+9+16 = 30
    //   G = 2·30 / (4·10) − 5/4 = 1.5 − 1.25 = 0.25
    const result = gini([4, 1, 3, 2]);
    expect(result.coefficient).toBeCloseTo(0.25, 12);
    expect(result.sampleCount).toBe(4);
    expect(result.total).toBe(10);
  });

  it('sorts ascending itself, so the caller order cannot change the answer', () => {
    expect(gini([9, 1, 1, 1]).coefficient).toBeCloseTo(gini([1, 1, 1, 9]).coefficient ?? -1, 12);
  });

  it('approaches (n−1)/n for one holder taking everything', () => {
    // The population estimator's maximum, since no small-sample correction is
    // applied. Pinned, so a later change to the convention is a redefinition.
    expect(gini([0, 0, 0, 100]).coefficient).toBeCloseTo(0.75, 12);
  });

  it('is 0, not NaN, when every value is zero', () => {
    // Perfect equality. NaN would fail canonicalJson at the moment the metric
    // reported the most equal distribution available.
    const result = gini([0, 0, 0]);
    expect(result.coefficient).toBe(0);
    expect(result.total).toBe(0);
  });

  it('is null, not 0, for an empty sample', () => {
    expect(gini([]).coefficient).toBeNull();
    expect(gini([]).sampleCount).toBe(0);
  });

  it('refuses a negative quantity', () => {
    expect(() => gini([1, -1])).toThrow(/non-negative/);
  });

  it('computes §7’s p95:p50 tail ratio alongside the coefficient', () => {
    // §7 asks for both: a coefficient is a whole-distribution summary and the
    // ratio is a statement about the tail. A sample can pass either and fail
    // the other.
    expect(tailRatio([1, 1, 1, 1, 3])).toBeCloseTo(3, 12);
    expect(tailRatio([0, 0, 0])).toBeNull();
    expect(tailRatio([])).toBeNull();
  });

  it('uses nearest-rank percentiles, not interpolation', () => {
    expect(nearestRank([10, 20, 30, 40], 0.5)).toBe(20);
    expect(nearestRank([10, 20, 30, 40], 0.95)).toBe(40);
  });
});

describe('checkpoints, exclusions, and their counts', () => {
  it('reports one coefficient per pinned checkpoint tick', () => {
    expect([...SNOWBALL_CHECKPOINT_TICKS]).toEqual([60, 120, 240, 480, 1200]);
    const results = checkpointGinis(
      arm({ runs: [armRun({ checkpoints: checkpoints(4) }), armRun({ checkpoints: checkpoints(8) })] }),
      'libraryNodeCount',
    );
    expect(results.map((entry) => entry.worldTick)).toEqual([60, 120, 240, 480, 1200]);
    for (const result of results) expect(result.sampleCount).toBe(2);
  });

  it('excludes runs that terminated before a checkpoint and counts them', () => {
    // The capability spec's scenario: 30 of 200 runs terminate before 1200.
    const runs: ArmRunSummary[] = [];
    for (let index = 0; index < 170; index += 1) {
      runs.push(armRun({ ticksRun: 1200, checkpoints: checkpoints(index) }));
    }
    for (let index = 0; index < 30; index += 1) {
      runs.push(armRun({ ticksRun: 300, checkpoints: checkpoints(index) }));
    }
    const atTwelveHundred = checkpointGinis(arm({ runs }), 'libraryNodeCount').find(
      (entry) => entry.worldTick === 1200,
    );
    expect(atTwelveHundred?.sampleCount).toBe(170);
    expect(atTwelveHundred?.excludedEarlyTerminations).toBe(30);
  });

  it('does not fold an early termination in as a zero', () => {
    // Folding it as 0 would make early terminations read as extreme inequality,
    // inflating the very coefficient §7 thresholds at ≤ 0.35.
    const equal = [armRun({ checkpoints: checkpoints(5) }), armRun({ checkpoints: checkpoints(5) })];
    const withEarly = [...equal, armRun({ ticksRun: 60, checkpoints: checkpoints(5) })];
    const result = checkpointGinis(arm({ runs: withEarly }), 'libraryNodeCount').find(
      (entry) => entry.worldTick === 1200,
    );
    expect(result?.coefficient).toBeCloseTo(0, 12);
    expect(result?.sampleCount).toBe(2);
  });

  it('counts a run that reached the checkpoint but reported no sample', () => {
    const result = checkpointGinis(
      arm({ runs: [armRun({ checkpoints: [] }), armRun({ checkpoints: checkpoints(3) })] }),
      'libraryNodeCount',
    ).find((entry) => entry.worldTick === 60);
    expect(result?.excludedMissing).toBe(1);
    expect(result?.sampleCount).toBe(1);
  });
});

describe('worshipSnowball gates on the mechanic, not on the sample', () => {
  it('reports mechanic-absent rather than a coefficient of nothing, on a build with no god', () => {
    // Not the 0.5.0 default any more: `god-agency` landed, so this build has a
    // worship formula and a favor regeneration rate, and `MECHANICS_AT_0_5_0`
    // says so. The flag is still what the collector reads, and a caller running
    // a world with no god installed must still get `mechanic-absent` rather
    // than a Gini coefficient of a quantity that does not exist.
    const entry = collectWorshipSnowball(
      arm({ mechanics: NO_MECHANICS, runs: [armRun({ checkpoints: checkpoints(0, 4) })] }),
    );
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'mechanic-absent' });
    expect(entry.detail?.['owner']).toBe('god-agency');
  });

  it('does not report mechanic-absent on this build, because the mechanic is here', () => {
    const entry = collectWorshipSnowball(
      arm({ runs: [armRun({ checkpoints: checkpoints(0, 4) })] }),
    );
    expect(entry.status === 'unavailable' ? entry.reason : 'measured').not.toBe('mechanic-absent');
  });

  it('measures the instantaneous rate once the mechanic exists', () => {
    // "Instantaneous rate, not accumulated total": the value contributed is the
    // regeneration per tick at the checkpoint, whatever has been banked.
    const entry = collectWorshipSnowball(
      arm({
        mechanics: ALL_MECHANICS,
        runs: [
          armRun({ checkpoints: checkpoints(9999, 1) }),
          armRun({ checkpoints: checkpoints(0, 1) }),
          armRun({ checkpoints: checkpoints(0, 1) }),
        ],
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBeCloseTo(0, 12);
  });

  it('reports no-observations when the mechanic exists but no checkpoint had a sample', () => {
    const entry = collectWorshipSnowball(
      arm({ mechanics: ALL_MECHANICS, runs: [armRun({ checkpoints: [] })] }),
    );
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'no-observations' });
  });
});

describe('capitalSnowball genuinely collects at 0.5.0', () => {
  it('measures library depth without needing any absent mechanic', () => {
    const entry = collectCapitalSnowball(
      arm({
        runs: [
          armRun({ checkpoints: checkpoints(1) }),
          armRun({ checkpoints: checkpoints(2) }),
          armRun({ checkpoints: checkpoints(3) }),
          armRun({ checkpoints: checkpoints(4) }),
        ],
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBeCloseTo(0.25, 12);
    expect(entry.detail?.['scalarCheckpointTick']).toBe(1200);
  });

  it('reports every checkpoint in the detail, not only the scalar', () => {
    const entry = collectCapitalSnowball(
      arm({ runs: [armRun({ checkpoints: checkpoints(1) }), armRun({ checkpoints: checkpoints(3) })] }),
    );
    const detail = entry.detail?.['checkpoints'] as readonly { worldTick: number }[];
    expect(detail.map((sample) => sample.worldTick)).toEqual([60, 120, 240, 480, 1200]);
  });

  it('reports 0 for an arm where every run holds nothing', () => {
    // A real measurement of a perfectly equal distribution, not a placeholder.
    const entry = collectCapitalSnowball(
      arm({ runs: [armRun({ checkpoints: checkpoints(0) }), armRun({ checkpoints: checkpoints(0) })] }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBe(0);
  });

  it('reports no-observations for an empty arm rather than a coefficient', () => {
    expect(collectCapitalSnowball(arm({ runs: [] }))).toMatchObject({
      status: 'unavailable',
      reason: 'no-observations',
    });
  });
});
