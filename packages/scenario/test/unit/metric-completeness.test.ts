/*
 * Multiverse Mages — task 10.4: every registered metric is in every record.
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
 * Task 10.4 — *"verify every registered metric is present in every run record of
 * the reference sweep, as a value or an explicit `unavailable` status"* — and the
 * whole point of it is that it is what turns the registry from a list into a
 * contract.
 *
 * ## Why the check is equality and not coverage
 *
 * Both directions do work, and they fail in opposite ways:
 *
 * - A **missing** key makes "the collector broke" and "the mechanic does not
 *   exist yet" indistinguishable in a file that will be read years from now.
 *   That is the failure `design.md` names: *"a missing key is a harness failure,
 *   an unavailable status is an honest answer"*.
 * - An **extra** key is a column in a results file with no definition behind it.
 *   It gets aggregated, baselined, and then defended, because nobody deletes a
 *   green gated metric.
 *
 * ## Why it runs a sweep instead of inspecting a builder
 *
 * `records.ts` enforces the key set when it builds a record, and that enforcement
 * has its own unit test. This file asserts the property **end to end, over
 * records that came back through a real executor** — because the interesting
 * failure is not "the builder forgot to check", it is "the executor collected a
 * different set from the one the sweep declared and nothing noticed". Only a run
 * can show that.
 *
 * ## The two registries, and why both are checked here
 *
 * A reference sweep declares the scenario's **vital signs** (`measures.ts`) and is
 * validated against them. `contracts.md` §7's twelve balance metrics are a
 * different registry, and the five arm-scoped ones are reported in the summary
 * rather than in a record — so "every registered metric" has two readings and
 * both of them are contracts. Checking only the sweep's own registry would leave
 * §7 unchecked at the level where it matters; checking only §7 would assert
 * something no reference record was ever supposed to carry.
 */

import type { RunRecord } from '@mm/mc-harness';
import {
  BALANCE_METRIC_REGISTRY,
  METRIC_SCOPE,
  UNAVAILABLE_REASON,
  buildRunRecord,
  runSweep,
} from '@mm/mc-harness';
import {
  REFERENCE_METRIC_IDS,
  REFERENCE_REGISTRIES,
  REFERENCE_SWEEP,
  makeReferenceExecutor,
  referenceContent,
  referenceProvenance,
} from '@mm/scenario';
import { beforeAll, describe, expect, it } from 'vitest';

const SWEEP_TIMEOUT_MS = 300_000;

const content = referenceContent();

let records: readonly RunRecord[] = [];
let armMetricIds: readonly string[] = [];
let armId: string | undefined;

beforeAll(async () => {
  // Inline rather than on workers: this file asserts what a record contains,
  // and worker-count invariance is `reference-sweep.test.ts`'s claim to make.
  const result = await runSweep({
    spec: REFERENCE_SWEEP,
    registries: REFERENCE_REGISTRIES,
    execution: { mode: 'inline', execute: makeReferenceExecutor({ content }) },
    provenance: referenceProvenance(content),
  });
  records = result.records;
  armMetricIds = Object.keys(result.summary.armMetrics ?? {}).sort();
  armId = result.summary.armId;
}, SWEEP_TIMEOUT_MS);

describe('every run record carries exactly the metrics the sweep declared', () => {
  it('produced a record per run, and enough of them to be worth checking', () => {
    expect(records.length).toBe(REFERENCE_SWEEP.replicates * 4);
  });

  it('carries an entry for every declared metric, in every record', () => {
    const declared = [...REFERENCE_SWEEP.metrics].sort();
    for (const record of records) {
      expect(
        Object.keys(record.metrics).sort(),
        `run ${String(record.runSeed)} (cell ${String(record.coordinates.cellIndex)}, replicate ` +
          `${String(record.coordinates.replicateIndex)}) has the wrong metric key set`,
      ).toEqual(declared);
    }
  });

  it('declares only metrics the reference scenario defines', () => {
    // The other half of the equality: a sweep cannot declare a metric the
    // executor has no collector for, or every run would fail at the end rather
    // than the sweep failing at the start.
    for (const metricId of REFERENCE_SWEEP.metrics) {
      expect(REFERENCE_METRIC_IDS).toContain(metricId);
    }
  });

  it('gives every entry a status, and never a bare number or a null', () => {
    for (const record of records) {
      for (const [metricId, entry] of Object.entries(record.metrics)) {
        expect(entry, `${metricId} in run ${String(record.runSeed)}`).toBeDefined();
        expect(['measured', 'unavailable']).toContain(entry.status);
        if (entry.status === 'measured') {
          expect(Number.isFinite(entry.value)).toBe(true);
        } else {
          expect(Object.values(UNAVAILABLE_REASON)).toContain(entry.reason);
        }
      }
    }
  });

  it('refuses a record whose key set is wider than the sweep', () => {
    // The positive control. Without it the assertions above pass just as
    // happily against a builder with no check in it at all.
    const target = records[0] as RunRecord;
    expect(() => {
      const widened = { ...target.metrics, inventedMetric: { status: 'measured', value: 1 } };
      // Rebuilding through the same path the sweep used is the point: this is
      // not a hand-written guard, it is the guard every record went through.
      return rebuild(target, widened);
    }).toThrow(/did not declare/);
  });
});

describe('the summary carries every arm-scoped metric of contracts.md §7', () => {
  it('names the arm the sweep constitutes', () => {
    expect(armId).toBe(REFERENCE_SWEEP.sweepId);
  });

  it('covers the per-arm half of §7 exactly, with no extras and no omissions', () => {
    const perArm = BALANCE_METRIC_REGISTRY.definitions
      .filter((definition) => definition.scope === METRIC_SCOPE.perArm)
      .map((definition) => definition.id)
      .sort();
    expect(armMetricIds).toEqual(perArm);
  });
});

/**
 * Rebuilds one record's metric entries through the harness's own builder.
 *
 * Through the *same* builder every record went through, not a hand-written
 * guard: a positive control that exercised a copy of the check would prove only
 * that the copy works.
 */
function rebuild(record: RunRecord, metrics: Record<string, unknown>): RunRecord {
  return buildRunRecord({
    task: {
      coordinates: record.coordinates,
      runSeed: record.runSeed,
      levels: record.levels,
      strategies: record.strategies,
      worldTickCap: REFERENCE_SWEEP.termination.worldTickCap,
      metrics: [...REFERENCE_SWEEP.metrics].sort(),
      ablatedPrimitives: [],
    },
    status: record.status,
    ticksRun: record.ticksRun,
    metrics: metrics as RunRecord['metrics'],
    accounting: record.accounting,
    provenance: record.provenance,
  });
}
