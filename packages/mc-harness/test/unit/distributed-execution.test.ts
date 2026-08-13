/*
 * Multiverse Mages — distributed sweep execution, W11.
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
 * The claim: a sweep whose runs execute in N independent processes produces the
 * **same bytes** as the same sweep executed locally. Not the same numbers to a
 * tolerance — the same file.
 *
 * The perturbation matters as much as the assertion. Each simulated shard here
 * runs on a different worker count with a different per-run delay, so runs
 * complete in a materially different order, and every shard's results cross a
 * **serialization boundary** — `encodeShardResults` then `decodeShardResults` —
 * before the head sees them. Without the round trip this would test sharding
 * and quietly skip the wire, which is where a distributed executor actually
 * loses information: `JSON.stringify` turns `NaN` into `null`, and a `null`
 * read back is indistinguishable from a missing measurement.
 *
 * `reproducibleSummary` is what the summaries are compared through, because
 * `records.ts` already declares the performance section excluded from every
 * reproducibility comparison (task 4.9) and `balance/README.md`'s own
 * reproducibility checks use exactly that exclusion. A distributed sweep is
 * *expected* to disagree about wall clock and worker count.
 */

import type { PoolResult, RunRecord, RunTask, SweepResult } from '@mm/mc-harness';
import {
  buildTasks,
  decodeShardResults,
  encodeRecord,
  encodeShardResults,
  expandSweep,
  mergeShardResults,
  reproducibleSummary,
  runSweep,
  runTasksOnPool,
  selectShard,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_PROVENANCE,
  POOL_WORKER_URL,
  TOY_REGISTRIES,
  toySweep,
} from './fixtures.js';

const spec = toySweep({ replicates: 8 });

function bytes(records: readonly RunRecord[]): string {
  return records.map((record) => encodeRecord(record)).join('\n');
}

/**
 * Stands in for a container: it receives only its own shard, executes it on its
 * own pool, and answers over the wire encoding. It is handed the whole task map
 * only because a real shard rebuilds it from the spec — `buildTasks` is a pure
 * function of `(spec, plan)`, so the two are the same tasks either way.
 */
async function runShard(
  tasks: ReadonlyMap<number, RunTask>,
  shardIndex: number,
  shardCount: number,
  workerCount: number,
  jitterMs: number,
): Promise<string> {
  const mine = selectShard(tasks, { shardIndex, shardCount });
  const results = await runTasksOnPool(mine, {
    workerUrl: POOL_WORKER_URL,
    workerCount,
    perRunTimeoutMs: spec.termination.perRunTimeoutMs,
    workerData: { jitterMs },
  });
  return encodeShardResults({ shardIndex, shardCount, results: [...results] });
}

async function distributedSweep(shardCount: number): Promise<SweepResult> {
  return await runSweep({
    spec,
    registries: TOY_REGISTRIES,
    execution: {
      mode: 'distributed',
      workerCount: shardCount,
      dispatch: async (dispatched): Promise<Map<number, PoolResult>> => {
        const wires: string[] = [];
        for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
          // Deliberately uneven: different pool widths and different delays per
          // shard, so completion order differs between shards and between runs.
          wires.push(
            await runShard(dispatched, shardIndex, shardCount, 1 + (shardIndex % 3), shardIndex * 4),
          );
        }
        return mergeShardResults(
          dispatched,
          wires.map((wire) => decodeShardResults(wire)),
        );
      },
    },
    provenance: FIXTURE_PROVENANCE,
    now: () => 0,
  });
}

async function localSweep(workerCount: number): Promise<SweepResult> {
  return await runSweep({
    spec,
    registries: TOY_REGISTRIES,
    execution: {
      mode: 'workers',
      workerUrl: POOL_WORKER_URL,
      workerCount,
      workerData: { jitterMs: 0 },
    },
    provenance: FIXTURE_PROVENANCE,
    now: () => 0,
  });
}

describe('a sharded sweep is the same experiment as a local one', () => {
  it('is byte-identical to the local worker path', async () => {
    const local = await localSweep(1);
    const distributed = await distributedSweep(5);

    expect(bytes(distributed.records)).toBe(bytes(local.records));
    expect(reproducibleSummary(distributed.summary)).toEqual(reproducibleSummary(local.summary));

    // Not vacuous: the sweep must produce genuinely varied floating-point
    // aggregates for "identical" to be a claim about anything.
    const wealth = local.summary.aggregates.find((a) => a.metricId === 'toyFinalWealth');
    expect(wealth?.sampleCount).toBe(local.plan.runCount);
    expect(Number.isInteger(wealth?.value)).toBe(false);
  }, 180_000);

  it('is byte-identical at every shard count, including more shards than tasks', async () => {
    const local = await localSweep(2);
    for (const shardCount of [1, 2, 7, 64]) {
      const distributed = await distributedSweep(shardCount);
      expect(bytes(distributed.records)).toBe(bytes(local.records));
    }
  }, 300_000);

  it('would notice a difference: the comparison is not equality with itself', async () => {
    // The negative control. Without it, "byte-identical" would also be true of a
    // comparison that never looked at the records.
    const local = await localSweep(1);
    const other = await runSweep({
      spec: toySweep({ replicates: 8, rootSeed: spec.rootSeed + 1 }),
      registries: TOY_REGISTRIES,
      execution: { mode: 'workers', workerUrl: POOL_WORKER_URL, workerCount: 1 },
      provenance: FIXTURE_PROVENANCE,
      now: () => 0,
    });
    expect(bytes(other.records)).not.toBe(bytes(local.records));
  }, 120_000);
});

describe('the wire refuses to lose information', () => {
  it('throws on a non-finite metric rather than shipping it as null', () => {
    const poisoned: PoolResult = {
      kind: 'outcome',
      outcome: {
        status: 'truncated',
        terminalReason: 0,
        ticksRun: 1,
        metrics: { toyFinalWealth: { status: 'measured', value: Number.POSITIVE_INFINITY } },
        accounting: { submissions: 0, rejections: 0, byActionId: {} },
        provenance: FIXTURE_PROVENANCE,
      },
    };
    expect(() => encodeShardResults({ shardIndex: 0, shardCount: 1, results: [[0, poisoned]] })).toThrow(
      /non-finite|Infinity/,
    );
  });

  it('omits an absent optional exactly as the local path does', () => {
    // `recordFor` already treats an absent `terminalReason` and one explicitly
    // set to `undefined` as the same thing. The wire must agree, or a sweep
    // would encode locally and fail remotely on the same executor.
    const withUndefined = {
      kind: 'outcome',
      outcome: {
        status: 'truncated',
        terminalReason: undefined,
        ticksRun: 1,
        metrics: {},
        accounting: { submissions: 0, rejections: 0, byActionId: {} },
        provenance: FIXTURE_PROVENANCE,
        armContribution: undefined,
      },
    } as unknown as PoolResult;
    const wire = encodeShardResults({ shardIndex: 0, shardCount: 1, results: [[0, withUndefined]] });
    const back = decodeShardResults(wire);
    const pair = back.results[0] as readonly [number, PoolResult];
    const result = pair[1];
    expect(result.kind).toBe('outcome');
    expect(Object.keys((result as { outcome: object }).outcome).sort()).toEqual([
      'accounting',
      'metrics',
      'provenance',
      'status',
      'ticksRun',
    ]);
  });
});

describe('merging shards refuses anything that is not a clean partition', () => {
  const plan = expandSweep(spec, TOY_REGISTRIES);
  const tasks = buildTasks(spec, plan);
  const stub: PoolResult = {
    kind: 'failure',
    failure: { classification: 'protocol', message: 'stub' },
  };

  function shardFor(shardIndex: number, shardCount: number) {
    return {
      shardIndex,
      shardCount,
      results: [...selectShard(tasks, { shardIndex, shardCount }).keys()].map(
        (taskId) => [taskId, stub] as const,
      ),
    };
  }

  it('accepts a complete partition', () => {
    const merged = mergeShardResults(tasks, [shardFor(0, 3), shardFor(1, 3), shardFor(2, 3)]);
    expect(merged.size).toBe(tasks.size);
  });

  it('refuses a missing shard rather than silently producing failed records', () => {
    // A container that vanished is infrastructure, not a run outcome. Writing
    // its tasks as `failed` records would put infra noise into baseline-grade
    // data and would also be invisible in the record count.
    expect(() => mergeShardResults(tasks, [shardFor(0, 3), shardFor(2, 3)])).toThrow(/Shard 1/);
  });

  it('refuses a duplicated task id', () => {
    const good = shardFor(0, 3);
    const doubled = { ...good, results: [...good.results, good.results[0] as never] };
    expect(() => mergeShardResults(tasks, [doubled, shardFor(1, 3), shardFor(2, 3)])).toThrow(
      /twice|duplicate/i,
    );
  });

  it('refuses a task id that does not belong to the shard that answered it', () => {
    const zero = shardFor(0, 3);
    const one = shardFor(1, 3);
    const swapped = { ...zero, results: [...zero.results.slice(1), one.results[0] as never] };
    expect(() =>
      mergeShardResults(tasks, [swapped, one, shardFor(2, 3)]),
    ).toThrow(/shard/);
  });

  it('refuses shards that disagree about how many there are', () => {
    expect(() => mergeShardResults(tasks, [shardFor(0, 3), shardFor(1, 4)])).toThrow(/shardCount/);
  });

  it('refuses a result for a task the sweep never declared', () => {
    const good = shardFor(0, 1);
    const alien = { ...good, results: [...good.results, [999999, stub] as const] };
    expect(() => mergeShardResults(tasks, [alien])).toThrow(/999999/);
  });
});
