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
 * ## Three commands, and the asymmetry between them is the point
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
 * {@link resealCommand} writes a baseline's **provenance** and nothing else,
 * under the same by-hand rule, and only after a verification sweep has shown
 * that no gated metric moved. It exists because the gate refuses on a
 * provenance mismatch before reading any metric, which made a content-only
 * change unmergeable without re-recording numbers that had not moved. See
 * `reseal.ts` for why it runs a sweep it then throws away.
 *
 * The one thing shared between all three is {@link compareToBaseline}, so that
 * the movement a regeneration records in `supersededDeltas`, the movement a
 * re-seal refuses over, and the movement the gate would have reported are the
 * same arithmetic rather than three implementations of it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Baseline } from './baseline.js';
import { encodeBaseline, encodedFieldSpan, parseBaseline } from './baseline.js';
import type { CliSink, ScenarioModule } from './cli.js';
import type { GateReport } from './gate.js';
import { compareToBaseline, describeGate, missingBaselineReport } from './gate.js';
import { regenerateBaseline } from './regenerate.js';
import { describeDrift, resealBaseline } from './reseal.js';
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

/** Arguments the re-seal command accepts, already parsed. */
export interface ResealArgs extends GateSweepOptions {
  /** The calendar date the re-seal is taken, `YYYY-MM-DD`. Recorded in the note. */
  readonly sealedOn: string;
  /** Extra context, appended *after* the mandatory note rather than replacing it. */
  readonly notes?: readonly string[];
  /** Verify and report, and write nothing whatever the verdict. */
  readonly dryRun: boolean;
}

/** Where a re-seal's own assertion looks: the encoded metric block, byte for byte. */
const SEALED_FIELD = 'metrics';

/**
 * Re-seals a committed baseline's provenance against this build, having first
 * established by measurement that no metric moved.
 *
 * The order is the opposite of {@link regenerateCommand}'s and for the same
 * reason: the cheap refusals come first, and the sweep is dispatched only once
 * the file it would re-seal has been read and found intact. What is *not*
 * optional is the sweep itself. There is no flag that skips it, because a
 * re-seal whose invariance claim is unchecked is exactly the silent laundering
 * it exists to replace.
 */
export async function resealCommand(
  args: ResealArgs,
  scenario: ScenarioModule,
  sink: CliSink,
): Promise<number> {
  const loaded = loadBaseline(args.baselinePath);
  if ('problems' in loaded) {
    sink.err(
      `The baseline at ${args.baselinePath} cannot be re-sealed, and nothing was written. A ` +
        're-seal preserves a file\'s metrics verbatim, which is only meaningful if the file is ' +
        'intact to begin with.',
    );
    for (const problem of loaded.problems) sink.err(`  ${problem}`);
    return 1;
  }
  const previousText = readFileSync(args.baselinePath, 'utf8');

  const sweepFile = readSweepFile(args.sweepPath, scenario.registries);
  if ('problems' in sweepFile) {
    sink.err(`The sweep at ${args.sweepPath} is not usable, and nothing was written.`);
    for (const problem of sweepFile.problems) sink.err(`  ${problem}`);
    return 1;
  }
  const { spec } = sweepFile;

  sink.out(
    `Verifying ${spec.sweepId} against its committed baseline. This runs the gate sweep, and ` +
      'discards every number it produces: the re-seal writes provenance only.',
  );

  let result: SweepResult;
  try {
    result = await executeSweep(spec, args, scenario);
  } catch (error: unknown) {
    sink.err(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const resealed = resealBaseline({
    baseline: loaded.baseline,
    summary: result.summary,
    sealedOn: args.sealedOn,
    ...(args.notes === undefined ? {} : { notes: args.notes }),
  });

  if ('problems' in resealed) {
    sink.err(`Refusing to re-seal ${spec.sweepId}, and nothing was written.`);
    for (const problem of resealed.problems) sink.err(`  ${problem}`);
    return 1;
  }

  // Reported on the way through, pass or fail, and before the write. This is
  // the row-attributing instrument: a re-seal banks no number, and the author
  // is shown every movement it is sealing over rather than being told only
  // about the ones that broke a tolerance.
  sink.out(`Observed movement, none of it written (k = ${String(loaded.baseline.toleranceK)}):`);
  for (const entry of resealed.drift) sink.out(`  ${describeDrift(entry)}`);
  for (const moved of resealed.movedKeys) sink.out(`  ${moved}`);

  const encoded = encodeBaseline(resealed.baseline);
  const before = encodedFieldSpan(previousText, SEALED_FIELD);
  const after = encodedFieldSpan(encoded, SEALED_FIELD);
  if (before === undefined || after === undefined || before !== after) {
    sink.err(
      `The re-sealed ${args.baselinePath} does not carry a byte-identical ${SEALED_FIELD} block, ` +
        'and nothing was written. That is the one invariant this command promises, so a re-seal ' +
        'that cannot demonstrate it is a bug in this command and not a result.',
    );
    return 1;
  }

  if (args.dryRun) {
    sink.out(
      `--dry-run: ${args.baselinePath} is unchanged. It would have been re-sealed to contentHash ` +
        `${resealed.baseline.contentHash}.`,
    );
    return 0;
  }

  writeFileSync(args.baselinePath, encoded, 'utf8');
  sink.out(
    `Re-sealed ${args.baselinePath} (contentHash ${loaded.baseline.contentHash} → ` +
      `${resealed.baseline.contentHash}). No metric value moved; ` +
      `${String(loaded.baseline.notes.length)} note(s) preserved and one appended.`,
  );
  return 0;
}
