/*
 * Multiverse Mages — what the gate passes, what it fails, and what it refuses
 * to compare at all.
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
 * Tasks 8.4, 8.6, 8.7, 8.8 and 8.10.
 *
 * Every test is written the same way round: assert the outcome, then assert the
 * report says enough to act on. A gate that fails without naming the metric, the
 * two values and the two deltas has told a reader something is wrong and left
 * them to find out what.
 */

import type { GateReport, MetricAggregate, SweepSummary } from '@mm/mc-harness';
import { GATE_STATUS, compareToBaseline, describeGate, missingBaselineReport } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_METRICS,
  fixtureBaseline,
  fixtureSweep,
  fixtureWealthStandardError,
} from './baseline-fixtures.js';

/** The comparison for one metric, or a failure naming the ones that exist. */
function comparisonFor(report: GateReport, metricId: string) {
  const found = report.comparisons.find((entry) => entry.metricId === metricId);
  if (found === undefined) {
    throw new Error(
      `no comparison for ${metricId}; got ${report.comparisons.map((c) => c.metricId).join(', ')}`,
    );
  }
  return found;
}

/** The summary the fixture sweep produces under the given perturbation. */
function summaryOf(options: Parameters<typeof fixtureSweep>[0] = {}): SweepSummary {
  return fixtureSweep(options).summary;
}

/** A summary with one aggregate rewritten, for the cases the knobs do not cover. */
function withAggregate(
  summary: SweepSummary,
  metricId: string,
  patch: Partial<MetricAggregate>,
): SweepSummary {
  return {
    ...summary,
    aggregates: summary.aggregates.map((entry) =>
      entry.metricId === metricId ? { ...entry, ...patch } : entry,
    ),
  };
}

const SE = fixtureWealthStandardError();

describe('a metric inside its tolerance passes, and the report still shows the move', () => {
  it('passes an unperturbed sweep', () => {
    const report = compareToBaseline({ baseline: fixtureBaseline(), summary: summaryOf() });
    expect(report.passed).toBe(true);
    expect(report.invalidations).toEqual([]);
    expect(comparisonFor(report, FIXTURE_METRICS.wealth).status).toBe(GATE_STATUS.pass);
    expect(report.toleranceK).toBe(3);
  });

  it('reports the raw delta and the delta in standard errors, both', () => {
    // A move of one unit against a standard error well under one: inside the
    // 3-SE tolerance, and visibly a real move. That is exactly the "small but
    // significant versus large but noisy" distinction task 8.6 asks to be shown.
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: summaryOf({ wealthShift: 1 }),
    });
    const wealth = comparisonFor(report, FIXTURE_METRICS.wealth);

    expect(report.passed).toBe(true);
    expect(wealth.delta).toBeCloseTo(1, 12);
    expect(wealth.deltaInStandardErrors).toBeCloseTo(1 / SE, 9);
    expect(wealth.baselineValue).not.toBeNull();
    expect(wealth.currentValue).not.toBeNull();
    expect(wealth.tolerance).toBeCloseTo(3 * SE, 12);

    const line = describeGate(report).find((entry) => entry.includes(FIXTURE_METRICS.wealth)) ?? '';
    expect(line).toContain('SE');
    expect(line).toContain('tolerance');
  });

  it('fails a metric beyond its tolerance and names everything', () => {
    const shift = 4 * SE;
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: summaryOf({ wealthShift: shift }),
    });
    const wealth = comparisonFor(report, FIXTURE_METRICS.wealth);

    expect(report.passed).toBe(false);
    expect(wealth.status).toBe(GATE_STATUS.regressed);
    expect(wealth.delta).toBeCloseTo(shift, 9);
    expect(wealth.deltaInStandardErrors).toBeCloseTo(4, 9);

    const text = describeGate(report).join('\n');
    expect(text).toContain('FAIL');
    expect(text).toContain(FIXTURE_METRICS.wealth);
    expect(text).toContain('4.00 SE');
  });

  it('gives two metrics at the same value different tolerances', () => {
    // `fixtureConstant` never varies and `fixtureWealth` does, so the same
    // absolute move fails one and passes the other. That is the whole reason a
    // tolerance is k standard errors rather than one shared percentage.
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: summaryOf({ wealthShift: 1, constantShift: 1 }),
    });
    expect(comparisonFor(report, FIXTURE_METRICS.wealth).status).toBe(GATE_STATUS.pass);
    expect(comparisonFor(report, FIXTURE_METRICS.constant).status).toBe(GATE_STATUS.regressed);
    expect(report.passed).toBe(false);
  });

  it('demands exact equality of a metric that has never varied', () => {
    const unchanged = compareToBaseline({ baseline: fixtureBaseline(), summary: summaryOf() });
    const constant = comparisonFor(unchanged, FIXTURE_METRICS.constant);
    expect(constant.status).toBe(GATE_STATUS.pass);
    expect(constant.tolerance).toBe(0);
    // No Infinity and no NaN: a metric with no scale reports no ratio.
    expect(constant.deltaInStandardErrors).toBeNull();

    const moved = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: summaryOf({ constantShift: 1 }),
    });
    expect(comparisonFor(moved, FIXTURE_METRICS.constant).delta).toBe(1);
    expect(comparisonFor(moved, FIXTURE_METRICS.constant).deltaInStandardErrors).toBeNull();
    expect(moved.passed).toBe(false);
  });
});

describe('unavailable is a first-class answer on both sides', () => {
  it('passes a metric unavailable in the baseline and in the run, and says it gates nothing', () => {
    const report = compareToBaseline({ baseline: fixtureBaseline(), summary: summaryOf() });
    const absent = comparisonFor(report, FIXTURE_METRICS.absent);

    expect(absent.status).toBe(GATE_STATUS.notGated);
    expect(report.passed).toBe(true);
    // Never a zero folded into a pass: no value, no delta, no tolerance.
    expect(absent.baselineValue).toBeNull();
    expect(absent.currentValue).toBeNull();
    expect(absent.delta).toBeNull();
    expect(absent.tolerance).toBeNull();
    expect(describeGate(report).join('\n')).toContain('mechanic-absent');
  });

  it('fails when a metric becomes available, and asks for a regeneration', () => {
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: summaryOf({ absentBecomesAvailable: true }),
    });
    const absent = comparisonFor(report, FIXTURE_METRICS.absent);

    expect(absent.status).toBe(GATE_STATUS.newlyAvailable);
    expect(absent.currentValue).toBeCloseTo(0.25, 12);
    expect(report.passed).toBe(false);
    expect(absent.reason ?? '').toContain('regenerate');
  });

  it('fails when a measured metric stops being measurable', () => {
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: summaryOf({ wealthBecomesUnavailable: true }),
    });
    expect(comparisonFor(report, FIXTURE_METRICS.wealth).status).toBe(GATE_STATUS.newlyUnavailable);
    expect(report.passed).toBe(false);
  });
});

describe('baseline-invalid, and the things that produce it', () => {
  it('refuses a definitionVersion mismatch and invalidates only that metric', () => {
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: withAggregate(summaryOf(), FIXTURE_METRICS.wealth, { definitionVersion: 2 }),
    });
    expect(comparisonFor(report, FIXTURE_METRICS.wealth).status).toBe(GATE_STATUS.baselineInvalid);
    expect(comparisonFor(report, FIXTURE_METRICS.wealth).reason ?? '').toContain(
      'definitionVersion',
    );
    // Versions are per metric, not per sweep: the others still gate.
    expect(comparisonFor(report, FIXTURE_METRICS.constant).status).toBe(GATE_STATUS.pass);
    expect(comparisonFor(report, FIXTURE_METRICS.absent).status).toBe(GATE_STATUS.notGated);
    expect(report.passed).toBe(false);
  });

  it('refuses an aggregation-rule change, which renames a different number', () => {
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: withAggregate(summaryOf(), FIXTURE_METRICS.wealth, { aggregation: 'max' }),
    });
    expect(comparisonFor(report, FIXTURE_METRICS.wealth).status).toBe(GATE_STATUS.baselineInvalid);
  });

  it.each([
    ['buildVersion', '0.4.0'],
    ['contentHash', 'content-changed'],
    ['rngRegistryHash', 'rng-changed'],
    ['observationLayoutDigest', 'layout-changed'],
    ['observationSchemaVersion', 2],
  ])('fails and names the provenance key when %s moves', (key, value) => {
    const base = summaryOf();
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: { ...base, provenance: { ...base.provenance, [key]: value } },
    });
    expect(report.passed).toBe(false);
    expect(report.invalidations.join('\n')).toContain(key);
  });

  it('fails when the sweep configuration hash moved', () => {
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: summaryOf({ configurationHash: 'a-different-experiment' }),
    });
    expect(report.passed).toBe(false);
    expect(report.invalidations.join('\n')).toContain('different experiments');
  });

  it("refuses one sweep's baseline for another sweep", () => {
    const report = compareToBaseline({
      baseline: fixtureBaseline({ sweepId: 'some-other-sweep' }),
      summary: summaryOf(),
    });
    expect(report.passed).toBe(false);
    expect(report.invalidations.join('\n')).toContain('per sweep');
  });

  it('fails a disqualified sweep rather than gating its survivors', () => {
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: summaryOf({ failureCount: 7 }),
    });
    expect(report.passed).toBe(false);
    expect(report.invalidations.join('\n')).toContain('7 failed runs');
  });

  it('fails when the baseline gates a metric the sweep stopped collecting', () => {
    const base = summaryOf();
    const report = compareToBaseline({
      baseline: fixtureBaseline(),
      summary: {
        ...base,
        aggregates: base.aggregates.filter((entry) => entry.metricId !== FIXTURE_METRICS.wealth),
      },
    });
    expect(comparisonFor(report, FIXTURE_METRICS.wealth).status).toBe(GATE_STATUS.baselineInvalid);
    expect(report.passed).toBe(false);
  });

  it('fails when the sweep collects a metric the baseline never heard of', () => {
    const baseline = fixtureBaseline();
    const report = compareToBaseline({
      baseline: fixtureBaseline({
        metrics: baseline.metrics.filter((entry) => entry.metricId !== FIXTURE_METRICS.constant),
      }),
      summary: summaryOf(),
    });
    expect(comparisonFor(report, FIXTURE_METRICS.constant).status).toBe(GATE_STATUS.baselineInvalid);
    expect(report.passed).toBe(false);
  });
});

describe('a missing baseline is a failure, never a pass', () => {
  it('produces a failing report rather than no report', () => {
    const report = missingBaselineReport('balance-gate-v1', ['there is no baseline at /nowhere.']);
    expect(report.passed).toBe(false);
    expect(report.comparisons).toEqual([]);
    expect(describeGate(report).join('\n')).toContain('FAIL');
  });

  it('has no shape in which nothing compared means success', () => {
    // The property in one line: a report with no comparisons never passes, so
    // deleting a baseline cannot go green however the caller reaches this.
    expect(missingBaselineReport('balance-gate-v1', []).passed).toBe(false);
  });
});
