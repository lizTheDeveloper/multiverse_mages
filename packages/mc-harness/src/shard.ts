/*
 * Multiverse Mages — sharding a sweep's task space across independent executors.
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
 * W11. Fan-out across many machines, with one rule: **a shard is a subset of
 * the task space and nothing else.**
 *
 * ## Why partitioning coordinates rather than dealing work
 *
 * `seed.ts` derives a run's seed from `(rootSeed, sweepId, cellIndex,
 * replicateIndex)` and from nothing else, and its doc comment says exactly why:
 * a harness that deals seeds as workers become free makes every number the
 * project publishes a function of scheduling. The same argument applies one
 * level up. A distributed executor that handed each container a *slice of the
 * seed space*, or re-seeded per container, would reintroduce the defect that
 * derivation exists to prevent — and this time across machines, where nobody
 * would ever reproduce it.
 *
 * So a shard is chosen by task id, the task id is `cellIndex * replicates +
 * replicateIndex`, and every field of the task the shard executes is built by
 * the same `buildTasks` a local sweep calls. A container therefore cannot
 * express an opinion about what its runs are; it can only execute them.
 *
 * ## Stride, not block
 *
 * `taskId % shardCount === shardIndex`. Consecutive task ids are consecutive
 * *replicates of one cell*, so a block partition would hand one container a
 * whole parameter cell. Cells differ in cost — a cell with more founding nodes
 * carries more population per tick — and the sweep's wall clock is the slowest
 * container's. Striding mixes cells into every shard, which is the cheapest
 * available approximation to equal cost without measuring anything.
 *
 * The partition is not part of the experiment: the head sorts canonically
 * before anything is folded, so nothing downstream can tell which shard ran
 * which run. Stride is chosen for wall clock alone.
 *
 * ## The wire, and the one thing it must not do
 *
 * Shard results cross a process — and a network — boundary as JSON. Plain
 * `JSON.stringify` renders `NaN` and `±Infinity` as `null`, and a `null` read
 * back is indistinguishable from a metric that was never measured. So the wire
 * encoding is {@link canonicalJson}, which refuses all three, and the refusal is
 * the point: a sweep that would have recorded a non-finite number locally fails
 * loudly here instead of shipping a quietly different record.
 */

import type { JsonValue } from './canonical.js';
import { canonicalJson } from './canonical.js';
import type { PoolResult } from './pool.js';
import type { RunOutcome, RunTask } from './protocol.js';

/** Which shard, of how many. */
export interface ShardSelector {
  /** Zero-based index of this shard. */
  readonly shardIndex: number;
  /** How many shards the task space is divided into. */
  readonly shardCount: number;
}

/** One shard's answer: which shard it was, and what its tasks produced. */
export interface ShardResults extends ShardSelector {
  /** `[taskId, result]` pairs, one per task the shard held. */
  readonly results: readonly (readonly [number, PoolResult])[];
}

function assertSelector(selector: ShardSelector): void {
  const { shardIndex, shardCount } = selector;
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new RangeError(`shardCount must be a positive integer, received ${String(shardCount)}.`);
  }
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) {
    throw new RangeError(
      `shardIndex must be an integer in [0, ${String(shardCount - 1)}], received ` +
        `${String(shardIndex)}.`,
    );
  }
}

/** Which shard a task id belongs to. The whole partition, in one line. */
export function shardOfTask(taskId: number, shardCount: number): number {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new RangeError(`shardCount must be a positive integer, received ${String(shardCount)}.`);
  }
  if (!Number.isInteger(taskId) || taskId < 0) {
    throw new RangeError(`taskId must be a non-negative integer, received ${String(taskId)}.`);
  }
  return taskId % shardCount;
}

/**
 * The tasks belonging to one shard, with the task objects untouched.
 *
 * An empty result is legal and is not an error: more shards than tasks is a
 * perfectly good way to run a small sweep on a big fleet, and the alternative —
 * throwing — would make the shard count a property of the sweep rather than of
 * the machine budget.
 */
export function selectShard(
  tasks: ReadonlyMap<number, RunTask>,
  selector: ShardSelector,
): Map<number, RunTask> {
  assertSelector(selector);
  const mine = new Map<number, RunTask>();
  for (const [taskId, task] of tasks) {
    if (shardOfTask(taskId, selector.shardCount) === selector.shardIndex) mine.set(taskId, task);
  }
  return mine;
}

/**
 * Drops keys whose value is `undefined`, without touching anything else.
 *
 * `recordFor` in `runner.ts` already spreads its optionals as
 * `...(outcome.terminalReason === undefined ? {} : { terminalReason })`, so an
 * absent key and a key explicitly set to `undefined` produce the same record on
 * the local path. This makes the wire agree with that, which is preserving an
 * equivalence the harness already has rather than hiding a lost value: a
 * `null`, a non-finite number, or a `bigint` still throws.
 */
function withoutUndefined(outcome: RunOutcome): RunOutcome {
  const entries = Object.entries(outcome).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as unknown as RunOutcome;
}

function forWire(result: PoolResult): PoolResult {
  return result.kind === 'outcome' ? { kind: 'outcome', outcome: withoutUndefined(result.outcome) } : result;
}

/**
 * Encodes one shard's answer for transport.
 *
 * Task ids are sorted, so two shards that computed the same results produce the
 * same bytes and a transport log is diffable.
 *
 * @throws TypeError, from {@link canonicalJson}, naming the field, if any value
 * is non-finite, a bigint, or an explicit `undefined` below the outcome's own
 * top level.
 */
export function encodeShardResults(results: ShardResults): string {
  assertSelector(results);
  const sorted = [...results.results]
    .sort((a, b) => a[0] - b[0])
    .map(([taskId, result]) => [taskId, forWire(result)]);
  return canonicalJson(
    {
      shardIndex: results.shardIndex,
      shardCount: results.shardCount,
      results: sorted,
    } as unknown as JsonValue,
    'shard',
  );
}

/** Parses what {@link encodeShardResults} wrote. */
export function decodeShardResults(text: string): ShardResults {
  const parsed = JSON.parse(text) as {
    shardIndex: number;
    shardCount: number;
    results: (readonly [number, PoolResult])[];
  };
  assertSelector(parsed);
  if (!Array.isArray(parsed.results)) {
    throw new Error('A shard answer must carry a `results` array of [taskId, result] pairs.');
  }
  return { shardIndex: parsed.shardIndex, shardCount: parsed.shardCount, results: parsed.results };
}

/**
 * Merges every shard's answer into the map `runSweep` expects, refusing
 * anything that is not a clean partition of `tasks`.
 *
 * ## Why this refuses rather than filling gaps
 *
 * `runner.ts`'s `recordFor` turns a missing pool result into a `failed` record,
 * which is right for a *worker* that died: the run was dispatched, something
 * about it went wrong, and the run count must still add up. It is wrong for a
 * *container* that was preempted. That is infrastructure, it says nothing about
 * the universe, and writing it as a `failed` record would put transport noise
 * into data a baseline is taken from — invisibly, because the record count
 * would still be right.
 *
 * So a shard that did not come back is an error here, and the caller's job is
 * to re-run it, not to record it.
 *
 * @throws Error naming the missing shard, the duplicated task, the task that
 * answered from the wrong shard, or the id the sweep never declared.
 */
export function mergeShardResults(
  tasks: ReadonlyMap<number, RunTask>,
  shards: readonly ShardResults[],
): Map<number, PoolResult> {
  if (shards.length === 0) {
    throw new Error('No shard answered. A sweep with no results is not a sweep with no runs.');
  }
  const shardCount = (shards[0] as ShardResults).shardCount;
  const answered = new Set<number>();
  for (const shard of shards) {
    if (shard.shardCount !== shardCount) {
      throw new Error(
        `Shards disagree about shardCount: ${String(shardCount)} and ` +
          `${String(shard.shardCount)}. They are answers to two different partitions.`,
      );
    }
    if (answered.has(shard.shardIndex)) {
      throw new Error(`Shard ${String(shard.shardIndex)} answered twice.`);
    }
    answered.add(shard.shardIndex);
  }
  for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
    if (!answered.has(shardIndex)) {
      throw new Error(
        `Shard ${String(shardIndex)} of ${String(shardCount)} did not answer. Its runs are not ` +
          'recorded as failures — a container that vanished is infrastructure, not an outcome. ' +
          'Re-run the shard.',
      );
    }
  }

  const merged = new Map<number, PoolResult>();
  for (const shard of shards) {
    for (const [taskId, result] of shard.results) {
      if (!tasks.has(taskId)) {
        throw new Error(
          `Shard ${String(shard.shardIndex)} answered task ${String(taskId)}, which this sweep ` +
            'never declared.',
        );
      }
      if (shardOfTask(taskId, shardCount) !== shard.shardIndex) {
        throw new Error(
          `Task ${String(taskId)} belongs to shard ` +
            `${String(shardOfTask(taskId, shardCount))} but shard ${String(shard.shardIndex)} ` +
            'answered it. Two shards ran the same coordinates.',
        );
      }
      if (merged.has(taskId)) {
        throw new Error(`Task ${String(taskId)} was answered twice.`);
      }
      merged.set(taskId, result);
    }
  }

  for (const taskId of tasks.keys()) {
    if (!merged.has(taskId)) {
      throw new Error(
        `No shard answered task ${String(taskId)}. The partition is incomplete, so the sweep ` +
          'would be missing runs it declared.',
      );
    }
  }
  return merged;
}
