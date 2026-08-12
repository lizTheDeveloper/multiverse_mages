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

import type { RunTask } from '@mm/mc-harness';
import { buildTasks, expandSweep, selectShard, shardOfTask } from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { TOY_REGISTRIES, toySweep } from './fixtures.js';

function allTasks(): Map<number, RunTask> {
  const spec = toySweep();
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

  it('spreads consecutive task ids across shards rather than blocking them', () => {
    // Stride, not block. Cells differ in cost — a long-horizon cell can cost
    // several times a short one — and a block partition puts a whole expensive
    // cell on one container while the rest idle. Consecutive task ids are
    // consecutive replicates of one cell, so striding is what mixes cells.
    const tasks = allTasks();
    const shardCount = 4;
    const first = selectShard(tasks, { shardIndex: 0, shardCount });
    const ids = [...first.keys()].sort((a, b) => a - b);
    expect(ids.length).toBeGreaterThan(1);
    expect((ids[1] as number) - (ids[0] as number)).toBe(shardCount);
  });

  it('agrees with shardOfTask', () => {
    const tasks = allTasks();
    const shardCount = 6;
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
      for (const taskId of selectShard(tasks, { shardIndex, shardCount }).keys()) {
        expect(shardOfTask(taskId, shardCount)).toBe(shardIndex);
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
    const spec = toySweep({ factors: [{ id: 'growth', levels: [0] }], replicates: 1 });
    const tasks = buildTasks(spec, expandSweep(spec, TOY_REGISTRIES));
    expect(tasks.size).toBe(1);
    expect(selectShard(tasks, { shardIndex: 0, shardCount: 4 }).size).toBe(1);
    expect(selectShard(tasks, { shardIndex: 3, shardCount: 4 }).size).toBe(0);
  });
});
