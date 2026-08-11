/*
 * Multiverse Mages — the balance gate and baseline regeneration command lines.
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
 * The logic behind `bin/balance-gate.mjs` (task 8.9) and
 * `bin/regenerate-baseline.mjs` (task 9.1), split from the shells for the reason
 * `cli.ts` gives: the branches that matter here — "the baseline file is gone",
 * "the rationale is blank", "the sweep is disqualified" — are exactly the ones
 * that only run on a bad day, and a CLI whose logic lives in its shell is a CLI
 * nobody unit tests.
 *
 * ## Two commands, and the asymmetry between them is the point
 *
 * {@link gateCommand} runs in CI on every push. It reads a baseline and never
 * writes one.
 *
 * {@link regenerateCommand} writes a baseline and is invoked by a person, by
 * hand, with a written rationale. It is reachable from `bin/` and from nowhere
 * else: not from `npm test`, not from `npm run verify`, not from either CI
 * system. `baseline-regeneration.test.ts` asserts that, by reading the CI
 * configuration files (task 9.6).
 *
 * The one thing shared between them is {@link compareToBaseline}, so that the
 * movement a regeneration records in `supersededDeltas` and the movement the
 * gate would have reported are the same arithmetic rather than two
 * implementations of it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Baseline } from './baseline.js';
import { encodeBaseline, parseBaseline } from './baseline.js';
import type { CliSink, ScenarioModule } from './cli.js';
import type { GateReport } from './gate.js';
import { compareToBaseline, describeGate, missingBaselineReport } from './gate.js';
import { regenerateBaseline } from './regenerate.js';
import type { SweepResult } from './runner.js';
import { runSweep } from './runner.js';
import { OUTPUT_MODE } from './storage.js';
import { readSweepFile } from './sweep-file.js';
import type { SweepSpec } from './sweep-spec.js';

/** How both commands execute their sweep. */
export interface GateSweepOptions {
  /** Path to the committed sweep file under `balance/sweeps/`. */
  readonly sweepPath: string;
  /** Path to the committed baseline file. */
  readonly baselinePath: string;
  /** Where run records are written. Gitignored; the gate's output is disposable. */
  readonly outputDirectory: string;
  readonly workerCount: number;
}

/** Reads a baseline file, distinguishing "absent" from "unusable". */
export function loadBaseline(
  path: string,
): { readonly baseline: Baseline } | { readonly problems: readonly string[] } {
  if (!existsSync(path)) {
    return {
      problems: [
        `there is no baseline at ${path}. A gated sweep without a committed baseline fails: ` +
          'deleting the file would otherwise be the cheapest possible silent regeneration, and a ' +
          'gate that passes when its baseline is missing reports green forever.',
      ],
    };
  }
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error: unknown) {
    return { problems: [`the baseline at ${path} could not be read: ${(error as Error).message}`] };
  }
  return parseBaseline(text);
}

/** Runs the sweep both commands run. Separated so neither owns dispatch policy. */
async function executeSweep(
  spec: SweepSpec,
  options: GateSweepOptions,
  scenario: ScenarioModule,
): Promise<SweepResult> {
  if (scenario.workerUrl === undefined) {
    throw new Error('The scenario module exports no workerUrl, so the pool has nothing to load.');
  }
  return runSweep({
    spec,
    registries: scenario.registries,
    execution: {
      mode: 'workers',
      workerUrl: scenario.workerUrl,
      workerCount: options.workerCount,
    },
    provenance: scenario.provenance,
    output: { directory: options.outputDirectory, mode: OUTPUT_MODE.newFile },
  });
}

/** What {@link gateCommand} produced, so a test can read the report and not only the exit code. */
export interface GateCommandResult {
  readonly exitCode: number;
  readonly report: GateReport;
}

/**
 * Runs the gate sweep and compares it against the committed baseline.
 *
 * Exits non-zero for a failing comparison, a missing or malformed baseline, a
 * disqualified sweep, or an unreadable sweep file. It writes run records to
 * `outputDirectory` and **nothing else** — in particular it never touches the
 * baseline, which is the property task 9.7 tests.
 */
export async function gateCommand(
  options: GateSweepOptions,
  scenario: ScenarioModule,
  sink: CliSink,
): Promise<GateCommandResult> {
  const sweepFile = readSweepFile(options.sweepPath, scenario.registries);
  if ('problems' in sweepFile) {
    const report = missingBaselineReport(options.sweepPath, sweepFile.problems);
    for (const line of describeGate(report)) sink.err(line);
    return { exitCode: 1, report };
  }
  const { spec } = sweepFile;

  // Read the baseline before running the sweep. A missing baseline is a failure
  // whether or not the sweep would have passed, and discovering it after the
  // compute is spent teaches people to run the gate less often.
  const loaded = loadBaseline(options.baselinePath);
  if ('problems' in loaded) {
    const report = missingBaselineReport(spec.sweepId, loaded.problems);
    for (const line of describeGate(report)) sink.err(line);
    return { exitCode: 1, report };
  }

  let result: SweepResult;
  try {
    result = await executeSweep(spec, options, scenario);
  } catch (error: unknown) {
    const report = missingBaselineReport(spec.sweepId, [
      error instanceof Error ? error.message : String(error),
    ]);
    for (const line of describeGate(report)) sink.err(line);
    return { exitCode: 1, report };
  }

  sink.out(
    `Ran ${String(result.records.length)} runs of ${spec.sweepId} in ` +
      `${(result.summary.performance.wallClockMs / 1000).toFixed(1)} s on ` +
      `${String(result.summary.performance.workerCount)} workers.`,
  );

  const report = compareToBaseline({ baseline: loaded.baseline, summary: result.summary });
  for (const line of describeGate(report)) {
    if (report.passed) sink.out(line);
    else sink.err(line);
  }
  return { exitCode: report.passed ? 0 : 1, report };
}

/** Arguments the regeneration command accepts, already parsed. */
export interface RegenerateArgs extends GateSweepOptions {
  /** Required. The command refuses to write without it (task 9.2). */
  readonly rationale: string;
  /** Caveats stored in the file, for a reader who was not in the room. */
  readonly notes?: readonly string[];
  /** The *k* of the k-standard-error rule. Changing it is a tolerance change. */
  readonly toleranceK: number;
}

/**
 * Regenerates a committed baseline from a fresh sweep.
 *
 * The order of checks is deliberate: the rationale is demanded **before** the
 * sweep is dispatched, so that a regeneration attempted without one costs a
 * second rather than a minute of compute and a moment of temptation.
 */
export async function regenerateCommand(
  args: RegenerateArgs,
  scenario: ScenarioModule,
  sink: CliSink,
): Promise<number> {
  if (typeof args.rationale !== 'string' || args.rationale.trim().length === 0) {
    sink.err(
      'A rationale is required, and nothing was written. Regenerating a baseline is a claim that ' +
        'behaviour changed on purpose; the rationale is where that claim is made, and a reviewer ' +
        'reads it in the diff. Pass --rationale "…".',
    );
    return 1;
  }

  // The file this command would destroy is inspected before the experiment it
  // would run. Cheapest refusals first, and the cheapest of all is the one that
  // says "the thing you are about to overwrite is not what you think it is".
  let previous: Baseline | undefined;
  if (existsSync(args.baselinePath)) {
    const loaded = loadBaseline(args.baselinePath);
    if ('problems' in loaded) {
      sink.err(
        `The baseline already at ${args.baselinePath} is malformed, and nothing was written. ` +
          'Regenerating over it would launder a hand edit into a signed file — which is the one ' +
          'thing this command exists to prevent. Restore it from version control, or delete it ' +
          'deliberately in its own commit.',
      );
      for (const problem of loaded.problems) sink.err(`  ${problem}`);
      return 1;
    }
    previous = loaded.baseline;
  }

  const sweepFile = readSweepFile(args.sweepPath, scenario.registries);
  if ('problems' in sweepFile) {
    sink.err(`The sweep at ${args.sweepPath} is not usable, and nothing was written.`);
    for (const problem of sweepFile.problems) sink.err(`  ${problem}`);
    return 1;
  }
  const { spec } = sweepFile;

  let result: SweepResult;
  try {
    result = await executeSweep(spec, args, scenario);
  } catch (error: unknown) {
    sink.err(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const regenerated = regenerateBaseline({
    summary: result.summary,
    records: result.records,
    rationale: args.rationale,
    ...(args.notes === undefined ? {} : { notes: args.notes }),
    toleranceK: args.toleranceK,
    ...(previous === undefined ? {} : { previous }),
  });
  if ('problems' in regenerated) {
    sink.err(`Refusing to regenerate ${spec.sweepId}, and nothing was written.`);
    for (const problem of regenerated.problems) sink.err(`  ${problem}`);
    return 1;
  }

  mkdirSync(dirname(args.baselinePath), { recursive: true });
  writeFileSync(args.baselinePath, encodeBaseline(regenerated.baseline), 'utf8');

  sink.out(`Wrote ${args.baselinePath} (contentHash ${regenerated.baseline.contentHash}).`);
  if (previous !== undefined && previous.toleranceK !== args.toleranceK) {
    sink.out(
      `  tolerance k: ${String(previous.toleranceK)} → ${String(args.toleranceK)} — every ` +
        'tolerance in the file moved with it.',
    );
  }
  sink.out(`  rationale: ${args.rationale.trim()}`);
  if (regenerated.changes.length === 0) {
    sink.out('  no metric moved.');
  } else {
    for (const change of regenerated.changes) sink.out(`  ${change}`);
  }
  return 0;
}
