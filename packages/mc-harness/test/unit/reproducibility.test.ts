/*
 * Multiverse Mages — sweep reproducibility, tasks 4.5, 4.8 and 4.9.
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
 * The claim under test is the release claim: two executions of the same sweep at
 * the same root seed produce **byte-identical** per-run records and identical
 * aggregates, with no numerical tolerance anywhere in the comparison.
 *
 * The interesting execution is the second one, which runs on eight workers with
 * a pseudo-random per-run delay so that runs complete in a materially different
 * order than the first. That is the perturbation the whole design is built to
 * be immune to, and asserting immunity without applying the perturbation would
 * be asserting nothing.
 */

import type { RunRecord, SweepResult } from '@mm/mc-harness';
import { encodeRecord, reaggregate, readRunRecords, reproducibleSummary, runSweep } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_PROVENANCE,
  POOL_WORKER_URL,
  TOY_REGISTRIES,
  toySweep,
  withTempDirectoryAsync,
} from './fixtures.js';
import { makeToyExecutor } from '../fixtures/toy-world.js';

const spec = toySweep({ replicates: 8 });

function bytes(records: readonly RunRecord[]): string {
  return records.map((record) => encodeRecord(record)).join('\n');
}

async function execute(workerCount: number, jitterMs: number): Promise<SweepResult> {
  return await runSweep({
    spec,
    registries: TOY_REGISTRIES,
    execution: {
      mode: 'workers',
      workerUrl: POOL_WORKER_URL,
      workerCount,
      workerData: { jitterMs },
    },
    provenance: FIXTURE_PROVENANCE,
    // Injected so the two summaries differ in nothing *except* what the
    // performance exclusion is supposed to cover — see the separate test below,
    // which uses the real clock.
    now: () => 0,
  });
}

describe('repeated sweeps agree exactly', () => {
  it('is byte-identical across two executions whose completion orders differ', async () => {
    const first = await execute(1, 0);
    const second = await execute(8, 12);

    expect(bytes(second.records)).toBe(bytes(first.records));
    expect(second.summary.aggregates).toEqual(first.summary.aggregates);
    expect(reproducibleSummary(second.summary)).toEqual(reproducibleSummary(first.summary));

    // Not vacuous: the sweep must actually have produced varied floating-point
    // aggregates for "identical" to be a claim about anything.
    const wealth = first.summary.aggregates.find((a) => a.metricId === 'toyFinalWealth');
    expect(wealth?.sampleCount).toBe(first.plan.runCount);
    expect(Number.isInteger(wealth?.value)).toBe(false);
  }, 120_000);

  it('would notice a difference: the comparison is not equality with itself', async () => {
    // The negative control for the test above. A sweep at a different root seed
    // must fail the same byte comparison, or the comparison proves nothing.
    const first = await execute(1, 0);
    const other = await runSweep({
      spec: toySweep({ replicates: 8, rootSeed: spec.rootSeed + 1 }),
      registries: TOY_REGISTRIES,
      execution: { mode: 'inline', execute: makeToyExecutor() },
      provenance: FIXTURE_PROVENANCE,
      now: () => 0,
    });
    expect(bytes(other.records)).not.toBe(bytes(first.records));
  }, 120_000);

  it('agrees between the worker path and the single-threaded inline path', async () => {
    // The reproduction CLI runs inline. If the two paths disagreed, reproducing
    // a run would prove nothing about the run that was recorded.
    const viaWorkers = await execute(4, 3);
    const inline = await runSweep({
      spec,
      registries: TOY_REGISTRIES,
      execution: { mode: 'inline', execute: makeToyExecutor() },
      provenance: FIXTURE_PROVENANCE,
      now: () => 0,
    });
    expect(bytes(inline.records)).toBe(bytes(viaWorkers.records));
  }, 120_000);
});

describe('aggregation from stored records matches live aggregation', () => {
  it('recomputes the same aggregates offline, from the file alone', async () => {
    await withTempDirectoryAsync(async (directory) => {
      const result = await runSweep({
        spec,
        registries: TOY_REGISTRIES,
        execution: { mode: 'workers', workerUrl: POOL_WORKER_URL, workerCount: 4, workerData: { jitterMs: 5 } },
        provenance: FIXTURE_PROVENANCE,
        output: { directory, mode: 'refuse' },
        now: () => 0,
      });

      const stored = readRunRecords(result.runsPath as string);
      const offline = reaggregate(stored, spec, TOY_REGISTRIES);

      expect(offline.aggregates).toEqual(result.summary.aggregates);
      expect(offline.countsByStatus).toEqual(result.summary.countsByStatus);
      expect(offline.failureCount).toBe(result.summary.failureCount);
      expect(offline.disqualified).toBe(result.summary.disqualified);

      // And it holds when the file is read back in a scrambled order, which is
      // what an offline tool concatenating shards would produce.
      const scrambled = [...stored].reverse();
      expect(reaggregate(scrambled, spec, TOY_REGISTRIES).aggregates).toEqual(offline.aggregates);
    });
  }, 120_000);
});

describe('performance data does not pollute reproducibility', () => {
  it('records real timings that differ, in a section the comparison excludes', async () => {
    const first = await runSweep({
      spec: toySweep({ replicates: 4 }),
      registries: TOY_REGISTRIES,
      execution: { mode: 'inline', execute: makeToyExecutor() },
      provenance: FIXTURE_PROVENANCE,
      referenceRunsPerSecond: 1234,
    });
    const second = await runSweep({
      spec: toySweep({ replicates: 4 }),
      registries: TOY_REGISTRIES,
      execution: { mode: 'inline', execute: makeToyExecutor({ jitterMs: 4 }) },
      provenance: FIXTURE_PROVENANCE,
      referenceRunsPerSecond: 1234,
    });

    // Real clocks, so the two wall-clock figures are genuinely different …
    expect(second.summary.performance.wallClockMs).not.toBe(first.summary.performance.wallClockMs);
    expect(second.summary.performance.wallClockMs).toBeGreaterThan(0);
    expect(first.summary.performance.runsPerSecond).toBeGreaterThan(0);
    expect(first.summary.performance.worldTicksPerSecond).toBeGreaterThan(0);
    expect(first.summary.performance.totalWorldTicks).toBeGreaterThan(0);
    // … the recorded figure travels beside the measured one, so the gap is visible …
    expect(first.summary.performance.referenceRunsPerSecond).toBe(1234);
    // … and everything outside the performance section is still exactly equal.
    expect(reproducibleSummary(second.summary)).toEqual(reproducibleSummary(first.summary));
    expect(bytes(second.records)).toBe(bytes(first.records));
  }, 60_000);
});

describe('the plan is reported before execution begins', () => {
  it('calls back with the cell and run counts before the first run executes', async () => {
    const events: string[] = [];
    await runSweep({
      spec: toySweep({ replicates: 2 }),
      registries: TOY_REGISTRIES,
      execution: {
        mode: 'inline',
        execute: async (task) => {
          events.push(`run:${String(task.coordinates.cellIndex)}`);
          return await makeToyExecutor()(task);
        },
      },
      provenance: FIXTURE_PROVENANCE,
      onPlan: (plan) => events.push(`plan:${String(plan.cellCount)}:${String(plan.runCount)}`),
      now: () => 0,
    });
    expect(events[0]).toBe('plan:6:12');
    expect(events.slice(1).every((event) => event.startsWith('run:'))).toBe(true);
  });
});
