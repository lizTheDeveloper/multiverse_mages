/*
 * Multiverse Mages — sweep execution: plan, dispatch, record, aggregate.
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
 * The order of operations, which is itself part of the contract:
 *
 * 1. **Validate and expand.** A sweep naming an unknown metric exits before a
 *    single run is dispatched (task 3.4), and the cell and run counts are
 *    reported before execution begins (task 3.5). Discovering the typo after
 *    forty minutes of compute is the failure mode both tasks exist to prevent.
 * 2. **Derive every seed.** All of them, up front, from coordinates — never
 *    dealt to workers as they become free.
 * 3. **Dispatch.** The pool decides only which worker runs what.
 * 4. **Record in canonical order.** Results come back in completion order and
 *    are immediately re-sorted; nothing downstream of here ever sees the order
 *    they arrived in.
 * 5. **Aggregate, then write the summary.**
 *
 * The one thing this module deliberately does not own is *what a run is*. The
 * caller supplies a {@link RunExecutor}, which is the only code that touches the
 * simulation. That keeps `contracts.md` §5's boundary intact and, more
 * practically, lets the harness be built and proven while the agent session it
 * will eventually drive is still being written next door.
 */

import { performance } from 'node:perf_hooks';

import { aggregateMetrics, countByFailureClass, countByStatus, sortCanonically, totalWorldTicks } from './aggregate.js';
import type { MetricEntries } from './metrics.js';
import type { PoolResult } from './pool.js';
import { runTasksInline, runTasksOnPool } from './pool.js';
import type { Provenance, RunExecutor, RunTask } from './protocol.js';
import type { RunRecord, SweepSummary } from './records.js';
import { RECORD_FORMAT_VERSION, buildRunRecord, provenanceDisagreements, provenanceProblems } from './records.js';
import { deriveRunSeed } from './seed.js';
import { TERMINAL_STATUS } from './session.js';
import type { OutputMode } from './storage.js';
import { openSweepOutput } from './storage.js';
import type { SweepPlan, SweepRegistries, SweepSpec } from './sweep-spec.js';
import { assignStrategies, expandSweep } from './sweep-spec.js';

/** Where the runs execute. */
export type SweepExecution =
  | {
      readonly mode: 'workers';
      /** Module the workers load; it must call `serveRuns`. */
      readonly workerUrl: URL | string;
      readonly workerCount: number;
      readonly workerData?: unknown;
    }
  | {
      readonly mode: 'inline';
      /** Runs in this thread, one after another. The reproduction path. */
      readonly execute: RunExecutor;
    };

/** Everything {@link runSweep} needs. */
export interface RunSweepOptions {
  readonly spec: SweepSpec;
  readonly registries: SweepRegistries;
  readonly execution: SweepExecution;
  /**
   * What the harness believes about the build. Used verbatim for `failed`
   * records, which have no executor to report their own, and compared against
   * every executor-reported block so a worker running different content is
   * visible rather than averaged in.
   */
  readonly provenance: Provenance;
  /** Where to write. Omit to compute a sweep without touching the filesystem. */
  readonly output?: { readonly directory: string; readonly mode: OutputMode };
  /** Called once, after validation and before the first dispatch (task 3.5). */
  readonly onPlan?: (plan: SweepPlan) => void;
  /** Wall clock, injectable so a test can pin the performance section. */
  readonly now?: () => number;
  /** Recorded throughput to report the measured figure against, if known. */
  readonly referenceRunsPerSecond?: number;
}

/** What a completed sweep produced. */
export interface SweepResult {
  readonly plan: SweepPlan;
  /** In canonical order, always. */
  readonly records: readonly RunRecord[];
  readonly summary: SweepSummary;
  readonly runsPath?: string;
  readonly summaryPath?: string;
}

/** Metric entries for a run that never produced any. Not zeros — nothing. */
const NO_METRICS: MetricEntries = Object.freeze({});

/** Accounting for a run that never submitted an action. */
const NO_ACCOUNTING = Object.freeze({ submissions: 0, rejections: 0, byActionId: Object.freeze({}) });

/**
 * Builds every task of a sweep, in canonical order, with seeds already derived.
 *
 * Exported because the reproduction path builds exactly one of these and must
 * build it the same way — a second construction site for tasks is a second
 * opinion about what a run is.
 */
export function buildTasks(spec: SweepSpec, plan: SweepPlan): Map<number, RunTask> {
  const tasks = new Map<number, RunTask>();
  for (const cell of plan.cells) {
    for (let replicateIndex = 0; replicateIndex < spec.replicates; replicateIndex += 1) {
      const coordinates = {
        rootSeed: spec.rootSeed,
        sweepId: spec.sweepId,
        cellIndex: cell.cellIndex,
        replicateIndex,
      };
      const taskId = cell.cellIndex * spec.replicates + replicateIndex;
      tasks.set(taskId, {
        coordinates,
        runSeed: deriveRunSeed(coordinates),
        levels: cell.levels,
        strategies: assignStrategies(spec.agentPool, cell.cellIndex, replicateIndex),
        worldTickCap: spec.termination.worldTickCap,
        metrics: [...spec.metrics].sort(),
        ablatedPrimitives: [...spec.ablation.primitives].sort(),
      });
    }
  }
  return tasks;
}

/** Turns one pool result into a record. Failures become `failed` records. */
function recordFor(task: RunTask, result: PoolResult | undefined, fallback: Provenance): RunRecord {
  if (result === undefined) {
    return buildRunRecord({
      task,
      status: TERMINAL_STATUS.failed,
      ticksRun: 0,
      metrics: NO_METRICS,
      accounting: NO_ACCOUNTING,
      provenance: fallback,
      failure: {
        classification: 'protocol',
        message: 'The pool returned no result for this task. This is a harness bug, recorded ' +
          'rather than dropped so the run count still adds up.',
      },
    });
  }
  if (result.kind === 'failure') {
    return buildRunRecord({
      task,
      status: TERMINAL_STATUS.failed,
      ticksRun: 0,
      metrics: NO_METRICS,
      accounting: NO_ACCOUNTING,
      provenance: fallback,
      failure: result.failure,
    });
  }
  const { outcome } = result;
  return buildRunRecord({
    task,
    status: outcome.status,
    ticksRun: outcome.ticksRun,
    metrics: outcome.metrics,
    accounting: outcome.accounting,
    provenance: outcome.provenance,
  });
}

/**
 * Runs a sweep end to end.
 *
 * @throws Error if the sweep specification does not validate, if the supplied
 * provenance block is incomplete, or if the records disagree about provenance —
 * the last of which the capability spec requires to fail the sweep by name.
 */
export async function runSweep(options: RunSweepOptions): Promise<SweepResult> {
  const { spec, registries, execution, provenance } = options;

  const blockProblems = provenanceProblems(provenance);
  if (blockProblems.length > 0) {
    throw new Error(
      `The sweep's provenance block is incomplete and no run was dispatched:\n  ${blockProblems.join('\n  ')}`,
    );
  }

  const plan = expandSweep(spec, registries);
  options.onPlan?.(plan);

  const tasks = buildTasks(spec, plan);
  const now = options.now ?? (() => performance.now());

  const startedAt = now();
  const results =
    execution.mode === 'inline'
      ? await runTasksInline(tasks, execution.execute)
      : await runTasksOnPool(tasks, {
          workerUrl: execution.workerUrl,
          workerCount: execution.workerCount,
          perRunTimeoutMs: spec.termination.perRunTimeoutMs,
          ...(execution.workerData === undefined ? {} : { workerData: execution.workerData }),
        });
  const wallClockMs = now() - startedAt;

  const records = sortCanonically(
    [...tasks].map(([taskId, task]) => recordFor(task, results.get(taskId), provenance)),
  );

  const output =
    options.output === undefined
      ? undefined
      : openSweepOutput({
          directory: options.output.directory,
          sweepId: spec.sweepId,
          mode: options.output.mode,
        });
  try {
    if (output !== undefined) {
      for (const record of records) output.appendRecord(record);
    }

    const disagreements = provenanceDisagreements(records);
    if (disagreements.length > 0) {
      throw new Error(
        `Sweep ${spec.sweepId} produced records with disagreeing provenance, so its aggregates ` +
          `would describe two different builds:\n  ${disagreements.join('\n  ')}`,
      );
    }

    const ticks = totalWorldTicks(records);
    const seconds = wallClockMs / 1000;
    const failuresByClass = countByFailureClass(records);
    const failureCount = records.filter((record) => record.status === TERMINAL_STATUS.failed).length;

    const summary: SweepSummary = {
      recordFormatVersion: RECORD_FORMAT_VERSION,
      sweepId: spec.sweepId,
      kind: spec.kind,
      rootSeed: spec.rootSeed,
      configurationHash: plan.configurationHash,
      cellCount: plan.cellCount,
      runCount: plan.runCount,
      countsByStatus: countByStatus(records),
      failureCount,
      failuresByClass,
      failureThreshold: spec.failureThreshold,
      disqualified: failureCount > spec.failureThreshold,
      aggregates: aggregateMetrics(records, spec.metrics, registries.metrics),
      provenance,
      performance: {
        wallClockMs,
        runsPerSecond: seconds > 0 ? records.length / seconds : 0,
        worldTicksPerSecond: seconds > 0 ? ticks / seconds : 0,
        workerCount: execution.mode === 'workers' ? execution.workerCount : 1,
        totalWorldTicks: ticks,
        ...(options.referenceRunsPerSecond === undefined
          ? {}
          : { referenceRunsPerSecond: options.referenceRunsPerSecond }),
      },
    };

    output?.writeSummary(summary);

    return {
      plan,
      records,
      summary,
      ...(output === undefined ? {} : { runsPath: output.runsPath, summaryPath: output.summaryPath }),
    };
  } finally {
    output?.close();
  }
}

/**
 * Recomputes a sweep's aggregates from stored records alone (task 4.5).
 *
 * The offline path and the live path share {@link aggregateMetrics} rather than
 * having one each. That is the point: two implementations of a fold that must
 * agree to the last bit is a promise nobody can keep, and the test that they
 * agree would then be testing whether two people made the same rounding
 * decision on a Tuesday.
 */
export function reaggregate(
  records: readonly RunRecord[],
  spec: SweepSpec,
  registries: SweepRegistries,
): Pick<SweepSummary, 'aggregates' | 'countsByStatus' | 'failuresByClass' | 'failureCount' | 'disqualified'> {
  const failureCount = records.filter((record) => record.status === TERMINAL_STATUS.failed).length;
  return {
    aggregates: aggregateMetrics(records, spec.metrics, registries.metrics),
    countsByStatus: countByStatus(records),
    failuresByClass: countByFailureClass(records),
    failureCount,
    disqualified: failureCount > spec.failureThreshold,
  };
}
