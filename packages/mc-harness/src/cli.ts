/*
 * Multiverse Mages — the sweep and single-run reproduction command lines.
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
 * The logic behind `bin/run-sweep.mjs` and `bin/reproduce-run.mjs`.
 *
 * It lives here rather than in the shells for the reason `packages/content`
 * gives for the same split: a CLI whose logic is in the shell is a CLI nobody
 * unit tests, and the branches that matter — "the sweep file names an unknown
 * metric", "results already exist" — are exactly the ones that only run on a bad
 * day. Everything below is a pure-ish function returning an exit code and
 * writing through an injected sink, so a test can read what a user would see.
 *
 * The shells own two things this module cannot: reading `process.argv`, and the
 * dynamic `import()` that loads the caller's scenario module. That import is
 * genuinely dynamic — the module to load is named on the command line — and it
 * lives outside `src/` deliberately, because `contracts.md` §5's boundary
 * scanner cannot read a computed specifier and correctly refuses to guess.
 */

import type { RunExecutor, Provenance } from './protocol.js';
import { compareToRecord, reproduceRun } from './reproduce.js';
import type { SweepResult } from './runner.js';
import { runSweep } from './runner.js';
import { readRunRecords } from './storage.js';
import type { OutputMode } from './storage.js';
import { OUTPUT_MODE } from './storage.js';
import type { SweepRegistries, SweepSpec } from './sweep-spec.js';
import { validateSweep } from './sweep-spec.js';

/** Where a command's human-readable output goes. */
export interface CliSink {
  out(line: string): void;
  err(line: string): void;
}

/** Everything a scenario module must export for the CLIs to drive it. */
export interface ScenarioModule {
  /** Runs one task. The only code that touches the simulation. */
  readonly executor: RunExecutor;
  /** The registries the sweep file is validated against. */
  readonly registries: SweepRegistries;
  /** What the harness believes about this build. */
  readonly provenance: Provenance;
  /** Module the pool's workers load. Required by `run-sweep`, unused by `reproduce`. */
  readonly workerUrl?: URL | string;
}

/** Arguments `run-sweep` accepts, already parsed. */
export interface RunSweepArgs {
  readonly spec: SweepSpec;
  readonly outputDirectory: string;
  readonly workerCount: number;
  readonly outputMode: OutputMode;
}

/**
 * Validates and reports a sweep without running it.
 *
 * The "gate sweeps are distinguishable" scenario in one call: it answers which
 * kind of sweep a file declares, and what it will cost, without executing a
 * single run.
 */
export function describeSweep(
  spec: SweepSpec,
  registries: SweepRegistries,
  sink: CliSink,
): number {
  const problems = validateSweep(spec, registries);
  if (problems.length > 0) {
    sink.err(`Sweep ${String(spec.sweepId)} is not valid. No run was dispatched.`);
    for (const problem of problems) sink.err(`  ${problem}`);
    return 1;
  }
  const cellCount = spec.factors.reduce((count, factor) => count * factor.levels.length, 1);
  sink.out(
    `Sweep ${spec.sweepId} (${spec.kind}): ${String(cellCount)} parameter cells × ` +
      `${String(spec.replicates)} replicates = ${String(cellCount * spec.replicates)} runs.`,
  );
  return 0;
}

/** Runs a sweep, reporting the plan first and the summary last. */
export async function runSweepCommand(
  args: RunSweepArgs,
  scenario: ScenarioModule,
  sink: CliSink,
): Promise<{ readonly exitCode: number; readonly result?: SweepResult }> {
  const problems = validateSweep(args.spec, scenario.registries);
  if (problems.length > 0) {
    sink.err(`Sweep ${String(args.spec.sweepId)} is not valid. No run was dispatched.`);
    for (const problem of problems) sink.err(`  ${problem}`);
    return { exitCode: 1 };
  }
  if (scenario.workerUrl === undefined) {
    sink.err('The scenario module exports no workerUrl, so the pool has nothing to load.');
    return { exitCode: 1 };
  }

  let result: SweepResult;
  try {
    result = await runSweep({
      spec: args.spec,
      registries: scenario.registries,
      execution: {
        mode: 'workers',
        workerUrl: scenario.workerUrl,
        workerCount: args.workerCount,
      },
      provenance: scenario.provenance,
      output: { directory: args.outputDirectory, mode: args.outputMode },
      onPlan: (plan) => {
        sink.out(
          `Sweep ${plan.sweepId} (${plan.kind}): ${String(plan.cellCount)} cells, ` +
            `${String(plan.runCount)} runs, configuration ${plan.configurationHash.slice(0, 16)}.`,
        );
      },
    });
  } catch (error: unknown) {
    sink.err(error instanceof Error ? error.message : String(error));
    return { exitCode: 1 };
  }

  const { summary } = result;
  sink.out(`Wrote ${String(result.records.length)} records to ${String(result.runsPath)}.`);
  for (const [status, count] of Object.entries(summary.countsByStatus)) {
    sink.out(`  ${status}: ${String(count)}`);
  }
  sink.out(
    `  throughput: ${summary.performance.runsPerSecond.toFixed(2)} runs/s, ` +
      `${summary.performance.worldTicksPerSecond.toFixed(0)} world ticks/s on ` +
      `${String(summary.performance.workerCount)} workers`,
  );
  if (summary.disqualified) {
    sink.err(
      `Sweep ${summary.sweepId} is disqualified: ${String(summary.failureCount)} failed runs ` +
        `exceeds the declared threshold of ${String(summary.failureThreshold)}. It may not ` +
        'produce a baseline.',
    );
    return { exitCode: 1, result };
  }
  return { exitCode: 0, result };
}

/** Arguments `reproduce-run` accepts, already parsed. */
export interface ReproduceArgs {
  readonly spec: SweepSpec;
  readonly cellIndex: number;
  readonly replicateIndex: number;
  /** A results file to compare against. Optional: a run can be reproduced blind. */
  readonly comparePath?: string;
}

/**
 * Re-executes one run in this thread and, if given a results file, says exactly
 * how the reproduction differs from what was recorded.
 */
export async function reproduceCommand(
  args: ReproduceArgs,
  scenario: ScenarioModule,
  sink: CliSink,
): Promise<number> {
  let reproduction;
  try {
    reproduction = await reproduceRun({
      spec: args.spec,
      registries: scenario.registries,
      select: { cellIndex: args.cellIndex, replicateIndex: args.replicateIndex },
      execute: scenario.executor,
      provenance: scenario.provenance,
    });
  } catch (error: unknown) {
    sink.err(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const { record } = reproduction;
  sink.out(
    `Reproduced ${args.spec.sweepId} cell ${String(args.cellIndex)} replicate ` +
      `${String(args.replicateIndex)} at seed ${String(record.runSeed)}: ${record.status} after ` +
      `${String(record.ticksRun)} world ticks.`,
  );
  if (record.failure !== undefined) {
    sink.out(`  failure (${record.failure.classification}): ${record.failure.message}`);
  }

  if (args.comparePath === undefined) return 0;

  const stored = readRunRecords(args.comparePath).find(
    (candidate) =>
      candidate.coordinates.cellIndex === args.cellIndex &&
      candidate.coordinates.replicateIndex === args.replicateIndex,
  );
  if (stored === undefined) {
    sink.err(
      `${args.comparePath} holds no record for cell ${String(args.cellIndex)} replicate ` +
        `${String(args.replicateIndex)}.`,
    );
    return 1;
  }
  const differences = compareToRecord(record, stored);
  if (differences.length === 0) {
    sink.out('  identical to the stored record.');
    return 0;
  }
  sink.err('  differs from the stored record:');
  for (const difference of differences) sink.err(`    ${difference}`);
  return 1;
}

/** The default output mode: never overwrite, always take a new file. */
export const DEFAULT_OUTPUT_MODE: OutputMode = OUTPUT_MODE.newFile;
