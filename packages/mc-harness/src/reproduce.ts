/*
 * Multiverse Mages — single-run reproduction from a record's derivation inputs.
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
 * Task 4.6.
 *
 * The claim this file has to make good on is narrow and load-bearing: **one run
 * out of ten thousand can be re-executed alone, in the main thread, from the
 * four numbers written in its record**, with no reference to the sweep that
 * produced it and no worker in sight. That is what makes a `failed` record
 * actionable rather than a shrug, and it is the practical payoff of deriving
 * seeds instead of dealing them.
 *
 * The reproduction rebuilds the task through {@link buildTasks} — the same
 * construction the sweep used — and then filters to the one requested. Rebuilding
 * the whole plan to use one row of it looks wasteful and is not: the task's
 * factor levels come from the factorial expansion, and re-deriving them by hand
 * would be a second implementation of the expansion, free to disagree with the
 * first about which levels `cellIndex` 37 names.
 *
 * ## What "reproduces" is checked to mean
 *
 * {@link compareToRecord} reports field-by-field differences rather than a
 * boolean. A reproduction that says only "differs" leaves the reader to diff two
 * JSON blobs by eye, and the interesting case — the metric that moved while
 * everything else held — is exactly the one that gets lost that way.
 */

import { canonicalJson } from './canonical.js';
import type { JsonValue } from './canonical.js';
import { runTasksInline } from './pool.js';
import type { Provenance, RunExecutor, RunTask } from './protocol.js';
import type { RunRecord } from './records.js';
import { buildRunRecord } from './records.js';
import { buildTasks } from './tasks.js';
import { seedMatchesCoordinates } from './seed.js';
import type { SweepRegistries, SweepSpec } from './sweep-spec.js';
import { expandSweep } from './sweep-spec.js';

/** Which run to reproduce. */
export interface RunSelector {
  readonly cellIndex: number;
  readonly replicateIndex: number;
}

/** Everything {@link reproduceRun} needs. */
export interface ReproduceOptions {
  readonly spec: SweepSpec;
  readonly registries: SweepRegistries;
  readonly select: RunSelector;
  readonly execute: RunExecutor;
  /** Used for a `failed` reproduction, which reports no provenance of its own. */
  readonly provenance: Provenance;
}

/** Rebuilds one run's task from the sweep specification and its coordinates. */
export function taskFor(
  spec: SweepSpec,
  registries: SweepRegistries,
  select: RunSelector,
): RunTask {
  const plan = expandSweep(spec, registries);
  if (select.cellIndex < 0 || select.cellIndex >= plan.cellCount) {
    throw new Error(
      `Cell ${String(select.cellIndex)} is outside sweep ${spec.sweepId}, which has ` +
        `${String(plan.cellCount)} cells.`,
    );
  }
  if (select.replicateIndex < 0 || select.replicateIndex >= spec.replicates) {
    throw new Error(
      `Replicate ${String(select.replicateIndex)} is outside sweep ${spec.sweepId}, which declares ` +
        `${String(spec.replicates)} replicates per cell.`,
    );
  }
  const tasks = buildTasks(spec, plan);
  const taskId = select.cellIndex * spec.replicates + select.replicateIndex;
  const task = tasks.get(taskId);
  if (task === undefined) {
    throw new Error(`No task for cell ${String(select.cellIndex)}, replicate ${String(select.replicateIndex)}.`);
  }
  return task;
}

/** One run, re-executed in this thread. */
export interface ReproductionResult {
  readonly task: RunTask;
  readonly record: RunRecord;
}

/**
 * Re-executes one run, single-threaded, in this process.
 *
 * Uses {@link runTasksInline} rather than a bare call to the executor so that a
 * throw is classified and recorded exactly as the sweep would have classified
 * and recorded it. "Reproduces the same failure" is only meaningful if the
 * failure is described in the same words.
 */
export async function reproduceRun(options: ReproduceOptions): Promise<ReproductionResult> {
  const task = taskFor(options.spec, options.registries, options.select);
  const results = await runTasksInline(new Map([[0, task]]), options.execute);
  const result = results.get(0);

  // The same `buildRunRecord` the sweep used, so a reproduction and the record
  // it reproduces are the same shape by construction rather than by agreement.
  if (result === undefined || result.kind === 'failure') {
    return {
      task,
      record: buildRunRecord({
        task,
        status: 'failed',
        ticksRun: 0,
        metrics: {},
        accounting: { submissions: 0, rejections: 0, byActionId: {} },
        provenance: options.provenance,
        failure: result?.failure ?? { classification: 'protocol', message: 'No result produced.' },
      }),
    };
  }
  const { outcome } = result;
  return {
    task,
    record: buildRunRecord({
      task,
      status: outcome.status,
      ticksRun: outcome.ticksRun,
      metrics: outcome.metrics,
      accounting: outcome.accounting,
      provenance: outcome.provenance,
      // Carried, because a reproduction that dropped it would be byte-different
      // from the record it reproduces — and the whole claim of this path is that
      // it is not.
      ...(outcome.armContribution === undefined
        ? {}
        : { armContribution: outcome.armContribution }),
    }),
  };
}

/**
 * Field-by-field differences between a reproduction and a stored record.
 *
 * The performance section is not in a run record, so nothing needs excluding
 * here — which is itself the argument for keeping timings out of run records in
 * the first place.
 */
export function compareToRecord(reproduced: RunRecord, stored: RunRecord): string[] {
  const differences: string[] = [];

  if (!seedMatchesCoordinates(stored.coordinates, stored.runSeed)) {
    differences.push(
      `the stored record's seed ${String(stored.runSeed)} is not what its own coordinates derive. ` +
        'Either the file was edited or the derivation changed; the seedDerivationVersion says ' +
        `it was ${String(stored.seedDerivationVersion)}.`,
    );
  }

  const fields: (keyof RunRecord)[] = [
    'coordinates',
    'runSeed',
    'levels',
    'strategies',
    'status',
    'ticksRun',
    'metrics',
    'accounting',
    'provenance',
  ];
  for (const field of fields) {
    const left = canonicalJson(reproduced[field] as unknown as JsonValue, String(field));
    const right = canonicalJson(stored[field] as unknown as JsonValue, String(field));
    if (left !== right) {
      differences.push(`${String(field)}: reproduced ${left}, stored ${right}`);
    }
  }
  return differences;
}
