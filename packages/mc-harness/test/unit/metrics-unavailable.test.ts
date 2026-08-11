/*
 * Multiverse Mages — the unavailable status, its four reason codes, and the
 * rule that an unavailable value never folds into an aggregate. Task 6.3.
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
 * ## The failure this file exists to make impossible
 *
 * `design.md` rejects two tempting shortcuts by name. Reporting **zero** for an
 * absent mechanic *"aggregates into means as a real observation, and a metric
 * that reads `winRateByPrimitive: 0` for every primitive looks like a finding"*.
 * Reporting **null** is worse, because `canonicalJson` and `JSON.stringify`
 * between them make a null indistinguishable from a dropped key.
 *
 * Both shortcuts fail loudly in one specific shape, and it is the shape asserted
 * below: a mean of a single measurement of 10, alongside two unavailable
 * entries, is **10** — not `10/3`, not `0`, and not `null`. Every other
 * assertion here is a variation on distinguishing that.
 *
 * Note what the assertions are *against*: `aggregateMetrics` in `aggregate.ts`,
 * the fold the sweep summary actually uses. Testing a private helper would prove
 * the arithmetic and not the property.
 */

import type { MetricEntries, RunRecord } from '@mm/mc-harness';
import {
  BALANCE_METRIC_REGISTRY,
  METRIC_SCOPE,
  MECHANICS_AT_0_5_0,
  UNAVAILABLE_REASON,
  aggregateMetrics,
  collectArmMetrics,
  collectRunMetrics,
  isMeasured,
  metricRegistry,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { syntheticRecord } from './fixtures.js';
import { arm, armRun, telemetry } from './metrics-fixtures.js';

const METRIC = 'probe';

const REGISTRY = metricRegistry([
  { id: METRIC, definitionVersion: 1, aggregation: 'mean', unit: 'dimensionless' },
]);

function records(entries: readonly MetricEntries[]): RunRecord[] {
  return entries.map((metrics, index) =>
    syntheticRecord({ cellIndex: 0, replicateIndex: index, metrics }),
  );
}

describe('the four reason codes are distinct and complete', () => {
  it('names exactly the four the capability spec requires', () => {
    expect(Object.values(UNAVAILABLE_REASON).sort()).toEqual([
      'censored',
      'mechanic-absent',
      'no-observations',
      'per-arm-scope',
    ]);
  });

  it('gives each a different meaning a reader can act on', () => {
    // Enumerated rather than asserted structurally, because the value of the
    // codes is entirely in their being four different answers to "why is there
    // no number here" — and a fifth added without thought would collapse two.
    expect(new Set(Object.values(UNAVAILABLE_REASON)).size).toBe(4);
  });
});

describe('an unavailable value never folds into an aggregate (task 6.3)', () => {
  it('means a single measurement of 10 among two absences, not 10/3', () => {
    const aggregates = aggregateMetrics(
      records([
        { [METRIC]: { status: 'measured', value: 10 } },
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.mechanicAbsent } },
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.censored } },
      ]),
      [METRIC],
      REGISTRY,
    );
    const aggregate = aggregates[0];
    expect(aggregate?.value).toBe(10);
    expect(aggregate?.value).not.toBeCloseTo(10 / 3, 6);
    expect(aggregate?.sampleCount).toBe(1);
    expect(aggregate?.unavailableByReason).toEqual({ censored: 1, 'mechanic-absent': 1 });
  });

  it('is null, never 0, when every run reported unavailable', () => {
    // Zero would fold as a real observation into any later re-aggregation and
    // would read, in a results file, as a measured value of exactly nothing.
    const aggregates = aggregateMetrics(
      records([
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.mechanicAbsent } },
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.mechanicAbsent } },
      ]),
      [METRIC],
      REGISTRY,
    );
    expect(aggregates[0]?.value).toBeNull();
    expect(aggregates[0]?.sampleCount).toBe(0);
    expect(aggregates[0]?.unavailableByReason).toEqual({ 'mechanic-absent': 2 });
  });

  it('keeps a measured zero and an unavailable entry apart', () => {
    // The distinction the whole scheme rests on: "the mechanic produced 0" and
    // "there was no mechanic" must not aggregate to the same number.
    const measuredZero = aggregateMetrics(
      records([
        { [METRIC]: { status: 'measured', value: 0 } },
        { [METRIC]: { status: 'measured', value: 10 } },
      ]),
      [METRIC],
      REGISTRY,
    );
    const oneAbsent = aggregateMetrics(
      records([
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.mechanicAbsent } },
        { [METRIC]: { status: 'measured', value: 10 } },
      ]),
      [METRIC],
      REGISTRY,
    );
    expect(measuredZero[0]?.value).toBe(5);
    expect(oneAbsent[0]?.value).toBe(10);
  });

  it('counts by reason, so a run of censorings is visible rather than merely absent', () => {
    const aggregates = aggregateMetrics(
      records([
        { [METRIC]: { status: 'measured', value: 4 } },
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.censored } },
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.censored } },
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.noObservations } },
      ]),
      [METRIC],
      REGISTRY,
    );
    expect(aggregates[0]?.value).toBe(4);
    expect(aggregates[0]?.unavailableByReason).toEqual({ censored: 2, 'no-observations': 1 });
  });

  it('holds for min and max too, not only for the mean', () => {
    // A `min` fold that treated unavailable as 0 would report 0 as the minimum
    // of a metric no run measured below 7 — and `min` is exactly where a
    // spurious zero is most convincing.
    for (const aggregation of ['min', 'max'] as const) {
      const registry = metricRegistry([
        { id: METRIC, definitionVersion: 1, aggregation, unit: 'dimensionless' },
      ]);
      const aggregates = aggregateMetrics(
        records([
          { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.mechanicAbsent } },
          { [METRIC]: { status: 'measured', value: 7 } },
          { [METRIC]: { status: 'measured', value: 9 } },
        ]),
        [METRIC],
        registry,
      );
      expect(aggregates[0]?.value).toBe(aggregation === 'min' ? 7 : 9);
    }
  });

  it('holds for sum: three absences add nothing at all', () => {
    const registry = metricRegistry([
      { id: METRIC, definitionVersion: 1, aggregation: 'sum', unit: 'dimensionless' },
    ]);
    const aggregates = aggregateMetrics(
      records([
        { [METRIC]: { status: 'measured', value: 5 } },
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.perArmScope } },
        { [METRIC]: { status: 'unavailable', reason: UNAVAILABLE_REASON.perArmScope } },
      ]),
      [METRIC],
      registry,
    );
    expect(aggregates[0]?.value).toBe(5);
  });
});

describe('every registered metric is present in every run record', () => {
  it('produces an entry for all twelve, on a build where most mechanics are absent', () => {
    const entries = collectRunMetrics(telemetry({ mechanics: MECHANICS_AT_0_5_0 }));
    expect(Object.keys(entries).sort()).toEqual([...BALANCE_METRIC_REGISTRY.ids]);
    for (const id of BALANCE_METRIC_REGISTRY.ids) {
      expect(entries[id], `${id} has no entry`).toBeDefined();
    }
  });

  it('marks every per-arm metric per-arm-scope in a run record', () => {
    const entries = collectRunMetrics(telemetry());
    for (const definition of BALANCE_METRIC_REGISTRY.definitions) {
      if (definition.scope !== METRIC_SCOPE.perArm) continue;
      expect(entries[definition.id], definition.id).toEqual({
        status: 'unavailable',
        reason: UNAVAILABLE_REASON.perArmScope,
      });
    }
  });

  it('reports the three raid metrics as mechanic-absent before raids exist', () => {
    // The capability spec's scenario, with prestige alongside: raid metrics on a
    // build where `raid-engagement` has not landed.
    const runEntries = collectRunMetrics(telemetry());
    const armEntries = collectArmMetrics(arm({ runs: [armRun()] }));
    expect(runEntries['raidLengthDistribution']).toMatchObject({
      status: 'unavailable',
      reason: UNAVAILABLE_REASON.mechanicAbsent,
    });
    expect(armEntries['winRateByPrimitive']).toMatchObject({
      reason: UNAVAILABLE_REASON.mechanicAbsent,
    });
    expect(armEntries['prestigeAdvantage']).toMatchObject({
      reason: UNAVAILABLE_REASON.mechanicAbsent,
    });
  });

  it('does not report every metric as absent — some genuinely collect', () => {
    // A positive control for the assertion above. A registry that reported
    // `mechanic-absent` for all twelve would satisfy every "is it absent?" test
    // in this file and would measure nothing at all.
    const entries = collectRunMetrics(
      telemetry({
        census: [
          { worldTick: 0, existingNodeIds: [1, 2, 3, 4], singleInstanceNodeIds: [1] },
          { worldTick: 12, existingNodeIds: [4], singleInstanceNodeIds: [4] },
          { worldTick: 24, existingNodeIds: [4], singleInstanceNodeIds: [4] },
        ],
        ticksRun: 24,
        tierFirstReached: [{ speciesId: 'human', tier: 1, worldTick: 12 }],
        accounting: { submissions: 50, rejections: 5, byActionId: { '3': 5 } },
      }),
    );
    const measuredIds = Object.entries(entries)
      .filter(([, entry]) => isMeasured(entry))
      .map(([id]) => id)
      .sort();
    expect(measuredIds).toEqual([
      'illegalActionRate',
      'knowledgeHalfLife',
      'libraryDependence',
      'timeToTierBySpecies',
    ]);
  });

  it('fails the run when a collector raises, rather than writing the record without it', () => {
    // "A dead collector is a failure, not a gap." The throw carries the metric
    // id so the failure names what broke.
    expect(() => collectRunMetrics(telemetry({ speciesIds: ['human'] }))).toThrow(
      /timeToTierBySpecies/,
    );
  });
});
