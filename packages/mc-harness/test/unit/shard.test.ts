/*
 * Multiverse Mages — sharding the task space, W11.
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
 * The one property that makes distributed execution trustworthy: a shard is a
 * **subset of the task space and nothing else**. It does not re-seed, it does
 * not renumber, and it does not change what a task is.
 *
 * The tests below are therefore about the partition rather than about
 * execution. If the partition is a partition — total, disjoint, and
 * task-preserving — then a distributed sweep is the same experiment as a local
 * one by construction, because everything downstream of dispatch already sorts
 * canonically and folds in that order.
 */

import type { RunTask, SweepSpec } from '@mm/mc-harness';
import { buildTasks, expandSweep, selectShard, shardAssignment } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { TOY_REGISTRIES, toySweep } from './fixtures.js';

function allTasks(overrides: Partial<SweepSpec> = {}): Map<number, RunTask> {
  const spec = toySweep(overrides);
  return buildTasks(spec, expandSweep(spec, TOY_REGISTRIES));
}

/** Canonical JSON of a task, so "the same task" means the same bytes. */
function encode(task: RunTask): string {
  return JSON.stringify(task, Object.keys(task).sort());
}

describe('selectShard partitions the task space', () => {
  it('covers every task exactly once across all shards', () => {
    const tasks = allTasks();
    for (const shardCount of [1, 2, 3, 5, 7, 24]) {
      const seen = new Map<number, number>();
      for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
        for (const taskId of selectShard(tasks, { shardIndex, shardCount }).keys()) {
          seen.set(taskId, (seen.get(taskId) ?? 0) + 1);
        }
      }
      expect(seen.size).toBe(tasks.size);
      for (const [taskId, count] of seen) {
        expect(`${String(taskId)}:${String(count)}`).toBe(`${String(taskId)}:1`);
      }
    }
  });

  it('hands each shard the identical task object the whole sweep would build', () => {
    const tasks = allTasks();
    const shardCount = 5;
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
      for (const [taskId, task] of selectShard(tasks, { shardIndex, shardCount })) {
        expect(encode(task)).toBe(encode(tasks.get(taskId) as RunTask));
      }
    }
  });

  it('is the identity at shardCount 1', () => {
    const tasks = allTasks();
    const shard = selectShard(tasks, { shardIndex: 0, shardCount: 1 });
    expect([...shard.keys()].sort((a, b) => a - b)).toEqual(
      [...tasks.keys()].sort((a, b) => a - b),
    );
  });

  it('keeps every shard within one task of every other', () => {
    // The deal, not the hash, is what does this. A partition that only hashed
    // would give Poisson-sized shards, and the sweep's wall clock is the
    // largest one's.
    const tasks = allTasks();
    for (const shardCount of [3, 5, 7, 11]) {
      const sizes = Array.from(
        { length: shardCount },
        (_unused, shardIndex) => selectShard(tasks, { shardIndex, shardCount }).size,
      );
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  /**
   * The regression this partition exists for, measured before it was fixed.
   *
   * `assignStrategies` gives run `strategies[replicateIndex % poolSize]`, and
   * `taskId = cellIndex * replicates + replicateIndex`. Under a `taskId %
   * shardCount` stride with `shardCount` a multiple of the pool size and
   * `replicates` a multiple of `shardCount`, every task in a shard shares a
   * `replicateIndex % poolSize` — so every container runs one strategy, and
   * since strategies differ several-fold in cost, the sweep's wall clock
   * becomes the slowest strategy's. Observed on Modal: 2160 s of shard work
   * took 186 s of wall clock on 96 cores, with one shard at 143 s.
   *
   * The positive control is the first assertion: the stride really does alias
   * on this shape. Without it the second assertion proves nothing.
   */
  it('does not alias with the round-robin strategy assignment', () => {
    const poolSize = 2; // `toySweep`'s pool: toy-passive, toy-greedy.
    const shardCount = 4; // A multiple of the pool size — the aliasing case.
    const tasks = allTasks({ replicates: 8 });

    const strategiesUnder = (assign: (taskId: number) => number): number[] =>
      Array.from({ length: shardCount }, (_unused, shardIndex) => {
        const seen = new Set<string>();
        for (const [taskId, task] of tasks) {
          if (assign(taskId) === shardIndex) seen.add(task.strategies.join('|'));
        }
        return seen.size;
      });

    // Positive control: the stride collapses each shard onto one strategy.
    expect(strategiesUnder((taskId) => taskId % shardCount)).toEqual(
      Array.from({ length: shardCount }, () => 1),
    );

    const assignment = shardAssignment(tasks.keys(), shardCount);
    expect(strategiesUnder((taskId) => assignment.get(taskId) as number)).toEqual(
      Array.from({ length: shardCount }, () => poolSize),
    );
  });

  it('agrees with shardAssignment, and does not depend on iteration order', () => {
    const tasks = allTasks();
    const shardCount = 6;
    const forwards = shardAssignment(tasks.keys(), shardCount);
    const backwards = shardAssignment([...tasks.keys()].reverse(), shardCount);
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
      for (const taskId of selectShard(tasks, { shardIndex, shardCount }).keys()) {
        expect(forwards.get(taskId)).toBe(shardIndex);
        expect(backwards.get(taskId)).toBe(shardIndex);
      }
    }
  });

  it('refuses an out-of-range or non-integer shard', () => {
    const tasks = allTasks();
    expect(() => selectShard(tasks, { shardIndex: 3, shardCount: 3 })).toThrow(/shardIndex/);
    expect(() => selectShard(tasks, { shardIndex: -1, shardCount: 3 })).toThrow(/shardIndex/);
    expect(() => selectShard(tasks, { shardIndex: 0, shardCount: 0 })).toThrow(/shardCount/);
    expect(() => selectShard(tasks, { shardIndex: 0, shardCount: 1.5 })).toThrow(/shardCount/);
  });

  it('gives an empty shard rather than throwing when there are fewer tasks than shards', () => {
    const tasks = allTasks({ factors: [{ id: 'growth', levels: [0] }], replicates: 1 });
    expect(tasks.size).toBe(1);
    const sizes = Array.from(
      { length: 4 },
      (_unused, shardIndex) => selectShard(tasks, { shardIndex, shardCount: 4 }).size,
    );
    expect(sizes.filter((size) => size === 1)).toHaveLength(1);
    expect(sizes.filter((size) => size === 0)).toHaveLength(3);
  });
});
