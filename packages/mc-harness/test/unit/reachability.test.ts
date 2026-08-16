/*
 * Multiverse Mages — the metric reachability guard, checked.
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
 * The property under test is not "the arithmetic is right" — it is **that the
 * third verdict is reachable and that it wins where it must**. A reachability
 * harness that could only ever say `moves` or `inert` would be the same instrument
 * this module was written to retire, and the way that happens in practice is
 * that `not-measurable` becomes unreachable by construction and nobody notices,
 * because the tests only ever feed it well-formed pairs.
 */

import { describe, expect, it } from 'vitest';

import {
  REACHABILITY_REASON,
  REACHABILITY_VERDICT,
  REACHABILITY_Z_95,
  classifyPaired,
  leverReached,
  mergeReachability,
  pairedDifference,
  pairedRunSeedProblems,
  quantile975,
  quarantineList,
  reachabilityReportProblems,
} from '../../src/reachability.js';
import type { MetricReachability, ReachabilityPair } from '../../src/reachability.js';

/** A probe input with everything healthy, so each test can break exactly one thing. */
function input(overrides: Partial<Parameters<typeof classifyPaired>[0]> = {}) {
  return classifyPaired({
    metricId: 'referencePopulation',
    probeId: 'probe',
    mechanism: 'the founding cohort',
    hasProducer: true,
    leverReached: true,
    pairs: [],
    ...overrides,
  });
}

/** `n` pairs whose delta is exactly `delta`, at distinct seeds. */
function flatPairs(n: number, delta: number): ReachabilityPair[] {
  return Array.from({ length: n }, (_unused, index) => ({
    runSeed: 1000 + index,
    control: 100,
    ablated: 100 + delta,
  }));
}

describe('pairedDifference', () => {
  it('estimates the mean of the per-pair deltas, not the difference of the means', () => {
    // Deliberately built so the two would agree — the discriminating case is the
    // interval, below, which pairing makes narrow and pooling would not.
    const estimate = pairedDifference([
      { runSeed: 1, control: 10, ablated: 14 },
      { runSeed: 2, control: 90, ablated: 96 },
      { runSeed: 3, control: 50, ablated: 55 },
    ]);
    expect(estimate.meanDifference).toBeCloseTo(5, 10);
    expect(estimate.controlMean).toBeCloseTo(50, 10);
    expect(estimate.ablatedMean).toBeCloseTo(55, 10);
    expect(estimate.pairs).toBe(3);
  });

  it('gives a zero-width interval when every delta is identical', () => {
    // The determinism argument standard-error.ts already makes for the gate's
    // tolerances: a quantity that has never varied cannot move by chance.
    const estimate = pairedDifference(flatPairs(8, 3));
    expect(estimate.standardDeviation).toBe(0);
    expect(estimate.low).toBe(3);
    expect(estimate.high).toBe(3);
  });

  it('gives an infinite interval and no estimate from zero pairs', () => {
    const estimate = pairedDifference([]);
    expect(estimate.pairs).toBe(0);
    expect(estimate.low).toBe(Number.NEGATIVE_INFINITY);
    expect(estimate.high).toBe(Number.POSITIVE_INFINITY);
  });

  it('is not sensitive to pair order, which worker completion order is', () => {
    const pairs: ReachabilityPair[] = [
      { runSeed: 1, control: 10, ablated: 14 },
      { runSeed: 2, control: 90, ablated: 96 },
      { runSeed: 3, control: 50, ablated: 55 },
      { runSeed: 4, control: 7, ablated: 2 },
    ];
    const forward = pairedDifference(pairs);
    const backward = pairedDifference([...pairs].reverse());
    expect(backward.meanDifference).toBeCloseTo(forward.meanDifference, 12);
    expect(backward.standardDeviation).toBeCloseTo(forward.standardDeviation, 12);
  });
});

describe('quantile975', () => {
  it('uses t at small samples and z past the table', () => {
    expect(quantile975(1)).toBeGreaterThan(12);
    expect(quantile975(10)).toBeCloseTo(2.228, 3);
    expect(quantile975(31)).toBe(REACHABILITY_Z_95);
    expect(quantile975(1000)).toBe(REACHABILITY_Z_95);
  });

  it('widens rather than narrows at a sample size that cannot support an interval', () => {
    expect(quantile975(0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('classifyPaired refuses before it reports', () => {
  it('reports no-producer without looking at the pairs at all', () => {
    // The discriminating detail: pairs that *would* have read as `moves`.
    const result = input({ hasProducer: false, pairs: flatPairs(30, 50) });
    expect(result.verdict).toBe(REACHABILITY_VERDICT.notMeasurable);
    expect(result.reason).toBe(REACHABILITY_REASON.noProducer);
    expect(result.estimate).toBeNull();
  });

  it('reports lever-did-not-reach rather than inert when nothing the probe touched moved', () => {
    // This is the whole point of the third verdict. A dead lever produces a zero
    // delta for every metric, and eleven `inert` verdicts from it would be the
    // ablation-mask failure repeated.
    const result = input({ leverReached: false, pairs: flatPairs(30, 0) });
    expect(result.verdict).toBe(REACHABILITY_VERDICT.notMeasurable);
    expect(result.reason).toBe(REACHABILITY_REASON.leverDidNotReach);
    expect(result.detail).toContain('did not reach the simulation');
  });

  it('separates "the pipeline answered unavailable" from "nothing was paired"', () => {
    expect(input({ unavailableRuns: 12 }).reason).toBe(REACHABILITY_REASON.noObservations);
    expect(input({ unavailableRuns: 0 }).reason).toBe(REACHABILITY_REASON.noPairs);
  });

  it('reports inert with the point estimate, never instead of it', () => {
    const result = input({
      pairs: [
        { runSeed: 1, control: 10, ablated: 11 },
        { runSeed: 2, control: 10, ablated: 9 },
        { runSeed: 3, control: 10, ablated: 12 },
        { runSeed: 4, control: 10, ablated: 8 },
      ],
    });
    expect(result.verdict).toBe(REACHABILITY_VERDICT.inert);
    expect(result.reason).toBe(REACHABILITY_REASON.intervalCoversZero);
    expect(result.estimate).not.toBeNull();
    expect(result.estimate?.pairs).toBe(4);
  });

  it('reports moves when the paired interval excludes zero', () => {
    const result = input({ pairs: flatPairs(20, -6) });
    expect(result.verdict).toBe(REACHABILITY_VERDICT.moves);
    expect(result.reason).toBe(REACHABILITY_REASON.intervalExcludesZero);
    expect(result.estimate?.meanDifference).toBeCloseTo(-6, 10);
  });
});

describe('pairedRunSeedProblems', () => {
  const arm = (armId: string, seeds: readonly number[]) => ({
    armId,
    tasks: new Map(
      seeds.map((runSeed, index) => [
        index,
        { coordinates: { cellIndex: 0, replicateIndex: index }, runSeed },
      ]),
    ),
  });

  it('is silent on arms that share seeds', () => {
    expect(pairedRunSeedProblems([arm('control', [7, 8, 9]), arm('probe', [7, 8, 9])])).toEqual([]);
  });

  it('names the coordinates and both seeds when an arm derives a different one', () => {
    const problems = pairedRunSeedProblems([arm('control', [7, 8]), arm('probe', [7, 99])]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('0:1');
    expect(problems[0]).toContain('99');
    expect(problems[0]).toContain('sampling noise');
  });

  it('names a cell an arm is missing and a cell it invented', () => {
    expect(pairedRunSeedProblems([arm('control', [7, 8]), arm('probe', [7])])).toHaveLength(1);
    expect(pairedRunSeedProblems([arm('control', [7]), arm('probe', [7, 8])])).toHaveLength(1);
  });

  it('does not object to arms running different factor levels, which is the treatment', () => {
    // The one rule that separates this from ablation.ts's `pairedSeedProblems`.
    // These arms carry no levels at all and the check must never reach for them:
    // a reachability probe's lever *is* a level, so requiring them to match would
    // reject every probe in the table.
    expect(pairedRunSeedProblems([arm('control', [7, 8]), arm('probe', [7, 8])])).toEqual([]);
  });
});

describe('leverReached', () => {
  it('is the weakest possible bar: one changed number anywhere', () => {
    expect(leverReached(flatPairs(50, 0))).toBe(false);
    expect(leverReached([...flatPairs(49, 0), { runSeed: 9, control: 1, ablated: 2 }])).toBe(true);
    expect(leverReached([])).toBe(false);
  });
});

describe('mergeReachability', () => {
  const at = (verdict: MetricReachability['verdict'], probeId: string): MetricReachability => ({
    metricId: 'm',
    probeId,
    verdict,
    reason: REACHABILITY_REASON.noPairs,
    mechanism: 'x',
    estimate: null,
    detail: '',
  });

  it('lets one probe that moved the metric outrank every probe that did not', () => {
    const merged = mergeReachability([
      at(REACHABILITY_VERDICT.notMeasurable, 'a'),
      at(REACHABILITY_VERDICT.moves, 'b'),
      at(REACHABILITY_VERDICT.inert, 'c'),
    ]);
    expect(merged.verdict).toBe(REACHABILITY_VERDICT.moves);
    expect(merged.probeId).toBe('b');
  });

  it('prefers an experiment that ran and found nothing over one that could not run', () => {
    const merged = mergeReachability([
      at(REACHABILITY_VERDICT.notMeasurable, 'a'),
      at(REACHABILITY_VERDICT.inert, 'c'),
    ]);
    expect(merged.verdict).toBe(REACHABILITY_VERDICT.inert);
  });

  it('refuses to invent a verdict for a metric no probe named', () => {
    expect(() => mergeReachability([])).toThrow(/no results/i);
  });
});

describe('quarantineList', () => {
  const at = (metricId: string, verdict: MetricReachability['verdict']): MetricReachability => ({
    metricId,
    probeId: 'p',
    verdict,
    reason: REACHABILITY_REASON.noPairs,
    mechanism: 'x',
    estimate: null,
    detail: '',
  });

  it('is inert union not-measurable, sorted, and excludes only what moved', () => {
    expect(
      quarantineList([
        at('zeta', REACHABILITY_VERDICT.inert),
        at('alpha', REACHABILITY_VERDICT.moves),
        at('mu', REACHABILITY_VERDICT.notMeasurable),
      ]),
    ).toEqual(['mu', 'zeta']);
  });
});

describe('reachabilityReportProblems', () => {
  const at = (metricId: string): MetricReachability => ({
    metricId,
    probeId: 'p',
    verdict: REACHABILITY_VERDICT.moves,
    reason: REACHABILITY_REASON.intervalExcludesZero,
    mechanism: 'x',
    estimate: null,
    detail: '',
  });

  it('names a registered metric with no verdict, because a missing one reads as cleared', () => {
    const problems = reachabilityReportProblems({
      registeredMetricIds: ['a', 'b', 'c'],
      results: [at('a'), at('c')],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('b is a registered metric with no reachability verdict');
  });

  it('names a verdict for a metric in no registry', () => {
    const problems = reachabilityReportProblems({
      registeredMetricIds: ['a'],
      results: [at('a'), at('ghost')],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ghost');
  });

  it('is silent on a complete report', () => {
    expect(
      reachabilityReportProblems({ registeredMetricIds: ['a', 'b'], results: [at('a'), at('b')] }),
    ).toEqual([]);
  });
});
