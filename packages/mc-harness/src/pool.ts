/*
 * Multiverse Mages — the headless worker pool.
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
 * Tasks 3.2 and 3.7.
 *
 * ## What the pool is allowed to decide
 *
 * Which worker executes a run, and when. That is the complete list. It does not
 * choose seeds — those are derived from coordinates before the pool ever sees a
 * task — and it does not aggregate, because aggregation folds floating point and
 * therefore may not happen in completion order. The pool returns a map keyed by
 * task id and the caller sorts it; a pool that returned an array in completion
 * order would be handing its scheduling nondeterminism straight into the
 * results, one convenience method at a time.
 *
 * ## Failure isolation
 *
 * A run can fail in four ways the pool can see, and each is classified rather
 * than collapsed into "error":
 *
 * - the executor threw, reported by the worker and answered without killing it;
 * - the run outlived `perRunTimeoutMs` and was abandoned;
 * - the worker emitted `error`, which for a `worker_threads` worker means an
 *   uncaught exception at module scope or in a listener;
 * - the worker exited while holding a task — an `process.exit()`, an OOM kill.
 *
 * The last three destroy the worker, so it is replaced and the sweep continues.
 * A worker that died is never reused: its heap is exactly the thing that was
 * suspect, and reusing it would let one bad run contaminate the next.
 *
 * **Stale events are dropped by generation.** A worker that is terminated after
 * a timeout still emits `exit`, and often `error`, milliseconds later. Without a
 * generation counter those arrive after the replacement has already picked up
 * the next task, and the pool records a failure against a run that is executing
 * perfectly well elsewhere. That is a bug that shows up as one unexplained
 * `failed` record per thousand runs, which is precisely the rate at which nobody
 * investigates.
 */

import { Worker } from 'node:worker_threads';

import type { FailureClass, RunTask, WorkerRequest, WorkerResponse } from './protocol.js';
import { FAILURE_CLASS } from './protocol.js';
import type { RunOutcome } from './protocol.js';

/** A run the pool could not obtain an outcome for. */
export interface PoolFailure {
  readonly classification: FailureClass;
  readonly message: string;
}

/** What the pool obtained for one task. */
export type PoolResult =
  | { readonly kind: 'outcome'; readonly outcome: RunOutcome }
  | { readonly kind: 'failure'; readonly failure: PoolFailure };

/** How to run a pool. */
export interface PoolOptions {
  /** Module the workers load. It must call `serveRuns`. */
  readonly workerUrl: URL | string;
  /** How many workers. At least one; results must not depend on it. */
  readonly workerCount: number;
  /** Wall-clock milliseconds a single run may take before it is abandoned. */
  readonly perRunTimeoutMs: number;
  /** Passed to every worker as `workerData`. Structured-cloneable. */
  readonly workerData?: unknown;
}

/** One worker and the task it is holding. */
interface Slot {
  worker: Worker | null;
  /** Incremented on every replacement; events from an older generation are stale. */
  generation: number;
  taskId: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Runs every task and returns one result per task, keyed by task id.
 *
 * Task ids are the caller's; the pool treats them as opaque identities and
 * promises only that the returned map has exactly one entry per input task —
 * "no duplicates and no omissions", which is the capability spec's third
 * scenario and the one a scheduler bug breaks silently.
 *
 * @throws Error if `workerCount` is not a positive integer, or if the task list
 * contains a duplicate id.
 */
export async function runTasksOnPool(
  tasks: ReadonlyMap<number, RunTask>,
  options: PoolOptions,
): Promise<Map<number, PoolResult>> {
  const { workerUrl, workerCount, perRunTimeoutMs } = options;
  if (!Number.isInteger(workerCount) || workerCount < 1) {
    throw new Error(`workerCount must be a positive integer, received ${String(workerCount)}.`);
  }
  if (!Number.isInteger(perRunTimeoutMs) || perRunTimeoutMs < 1) {
    throw new Error(`perRunTimeoutMs must be a positive integer, received ${String(perRunTimeoutMs)}.`);
  }

  const pending: { taskId: number; task: RunTask }[] = [...tasks].map(([taskId, task]) => ({
    taskId,
    task,
  }));
  const results = new Map<number, PoolResult>();
  if (pending.length === 0) return results;

  return await new Promise<Map<number, PoolResult>>((resolve, reject) => {
    const slots: Slot[] = [];
    let cursor = 0;
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      for (const slot of slots) {
        if (slot.timer !== null) clearTimeout(slot.timer);
        slot.timer = null;
        const worker = slot.worker;
        slot.worker = null;
        if (worker !== null) void worker.terminate();
      }
      resolve(results);
    };

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      for (const slot of slots) {
        if (slot.timer !== null) clearTimeout(slot.timer);
        const worker = slot.worker;
        slot.worker = null;
        if (worker !== null) void worker.terminate();
      }
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    /** Records a result once. A second record for one task is a pool bug. */
    const record = (taskId: number, result: PoolResult): void => {
      if (results.has(taskId)) {
        fail(
          new Error(
            `The pool produced two results for task ${String(taskId)}. One run, one record — a ` +
              'duplicate here would appear in the aggregate as a real observation.',
          ),
        );
        return;
      }
      results.set(taskId, result);
    };

    const clearTimer = (slot: Slot): void => {
      if (slot.timer !== null) {
        clearTimeout(slot.timer);
        slot.timer = null;
      }
    };

    /** Hands the slot its next task, or retires it when the queue is empty. */
    const pump = (slot: Slot): void => {
      if (settled) return;
      if (cursor >= pending.length) {
        const worker = slot.worker;
        slot.worker = null;
        slot.taskId = null;
        if (worker !== null) {
          const shutdown: WorkerRequest = { kind: 'shutdown' };
          worker.postMessage(shutdown);
          void worker.terminate();
        }
        if (results.size === pending.length) finish();
        return;
      }
      const next = pending[cursor] as { taskId: number; task: RunTask };
      cursor += 1;
      slot.taskId = next.taskId;
      const generation = slot.generation;
      slot.timer = setTimeout(() => {
        if (slot.generation !== generation) return;
        onSlotLost(
          slot,
          FAILURE_CLASS.timeout,
          `Run exceeded the declared per-run timeout of ${String(perRunTimeoutMs)} ms and was ` +
            'abandoned. Its worker was replaced.',
        );
      }, perRunTimeoutMs);
      const request: WorkerRequest = { kind: 'run', taskId: next.taskId, task: next.task };
      slot.worker?.postMessage(request);
    };

    /**
     * The worker holding this slot is gone or must go. Record whatever task it
     * held as failed, replace it, and carry on.
     */
    const onSlotLost = (slot: Slot, classification: FailureClass, message: string): void => {
      if (settled) return;
      clearTimer(slot);
      const taskId = slot.taskId;
      slot.taskId = null;
      slot.generation += 1;
      const dead = slot.worker;
      slot.worker = null;
      if (dead !== null) void dead.terminate();
      if (taskId !== null && !results.has(taskId)) {
        record(taskId, { kind: 'failure', failure: { classification, message } });
      }
      if (settled) return;
      if (cursor >= pending.length && results.size === pending.length) {
        finish();
        return;
      }
      spawn(slot);
      pump(slot);
    };

    const spawn = (slot: Slot): void => {
      if (settled) return;
      const generation = slot.generation;
      let worker: Worker;
      try {
        worker = new Worker(workerUrl, options.workerData === undefined ? {} : { workerData: options.workerData });
      } catch (error: unknown) {
        fail(error);
        return;
      }
      slot.worker = worker;

      worker.on('message', (message: WorkerResponse) => {
        if (settled || slot.generation !== generation) return;
        if (message.kind === 'ready') return;
        if (message.kind !== 'result' && message.kind !== 'threw') {
          onSlotLost(
            slot,
            FAILURE_CLASS.protocol,
            `Worker sent an unrecognized message: ${JSON.stringify(message)}`,
          );
          return;
        }
        if (message.taskId !== slot.taskId) {
          onSlotLost(
            slot,
            FAILURE_CLASS.protocol,
            `Worker answered task ${String(message.taskId)} while holding ${String(slot.taskId)}.`,
          );
          return;
        }
        clearTimer(slot);
        const taskId = message.taskId;
        slot.taskId = null;
        if (message.kind === 'result') {
          record(taskId, { kind: 'outcome', outcome: message.outcome });
        } else {
          record(taskId, {
            kind: 'failure',
            failure: { classification: FAILURE_CLASS.threw, message: message.message },
          });
        }
        pump(slot);
      });

      worker.on('error', (error: Error) => {
        if (settled || slot.generation !== generation) return;
        onSlotLost(slot, FAILURE_CLASS.workerError, error.stack ?? error.message);
      });

      worker.on('exit', () => {
        if (settled || slot.generation !== generation) return;
        if (slot.taskId === null) return; // retired deliberately by `pump`
        onSlotLost(slot, FAILURE_CLASS.workerExit, 'Worker exited while executing a run.');
      });
    };

    const count = Math.min(workerCount, pending.length);
    for (let index = 0; index < count; index += 1) {
      const slot: Slot = { worker: null, generation: 0, taskId: null, timer: null };
      slots.push(slot);
      spawn(slot);
    }
    for (const slot of slots) pump(slot);
  });
}

/**
 * Runs every task in this thread, one after another.
 *
 * The reproduction path (task 4.6) and the fallback when a caller wants no
 * processes at all. It shares the pool's result shape exactly, so the record
 * builder cannot tell which produced a result — which is the property that lets
 * the reproduction CLI claim to reproduce a sweep run rather than to
 * approximate it.
 *
 * There is no timeout here on purpose. A single-threaded timeout would have to
 * be a race against code that holds the only thread, and it would be a promise
 * this function cannot keep. The reproduction path is the one where a hang is
 * *wanted*: it is where a debugger gets attached.
 */
export async function runTasksInline(
  tasks: ReadonlyMap<number, RunTask>,
  execute: (task: RunTask) => RunOutcome | Promise<RunOutcome>,
): Promise<Map<number, PoolResult>> {
  const results = new Map<number, PoolResult>();
  for (const [taskId, task] of tasks) {
    try {
      const outcome = await execute(task);
      results.set(taskId, { kind: 'outcome', outcome });
    } catch (error: unknown) {
      results.set(taskId, {
        kind: 'failure',
        failure: {
          classification: FAILURE_CLASS.threw,
          message: error instanceof Error ? (error.stack ?? error.message) : String(error),
        },
      });
    }
  }
  return results;
}
