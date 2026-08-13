#!/usr/bin/env node
/*
 * Multiverse Mages — a sweep executed across many independent containers.
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
 * W11's head process. **`bin/run-sweep.mjs` is untouched and remains the
 * default**: a separate entry point rather than a `--distributed` flag, so that
 * "local execution keeps working with no Modal account" is true by inspection
 * rather than by argument.
 *
 *     node packages/mc-harness/bin/run-sweep-distributed.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --sweep    ./balance/sweeps/balance-gate-ascension.sweep.json \
 *       --out      ./balance/results \
 *       --shards   24 \
 *       --backend  modal
 *
 * ## What this process does, and what it refuses to do
 *
 * It expands the sweep, hands the *specification* to a backend that runs shards
 * somewhere, merges what comes back, and then runs the ordinary `runSweep` with
 * `mode: 'distributed'`. Everything after dispatch — building records, sorting
 * canonically, opening the output, folding the aggregates, writing the summary
 * — is the same code `run-sweep.mjs` runs, because it *is* that code. A
 * distributed sweep therefore writes the same `.runs.ndjson` and
 * `.summary.json` shapes, and every existing consumer of them works unchanged.
 *
 * Two refusals are load-bearing:
 *
 * **A shard that did not come back is an error, not a set of failed runs.**
 * `mergeShardResults` enforces it. A worker that died is plausibly the run's
 * fault and `recordFor` is right to record it; a container that was preempted
 * is infrastructure, and recording it as `failed` would put transport noise
 * into data a baseline is taken from — invisibly, since the record count would
 * still be right. The backend retries a shard once; after that this exits
 * non-zero having written nothing.
 *
 * **Every record's provenance must equal this build's.** `runSweep` compares
 * records to *each other*, which catches one bad container and does not catch a
 * whole fleet running a stale image — they agree perfectly with one another and
 * with nothing else. So the check below is head-against-shards, and it happens
 * inside the dispatch callback, before `openSweepOutput` is ever reached.
 *
 * ## Backends
 *
 * - `local` spawns `run-shard.mjs` as child processes on this machine. It needs
 *   no Modal account and it is what the test suite exercises, which is what
 *   makes the sharding itself checkable in `npm run verify`.
 * - `modal` spawns `tools/modal/sweep_fanout.py`, which owns everything to do
 *   with Modal. No Modal client library is imported by any JavaScript here and
 *   none appears in any `package.json`. Credentials come from the operator's
 *   own environment at run time and are never read, logged, or written by this
 *   repository.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DEFAULT_OUTPUT_MODE,
  canonicalJson,
  decodeShardResults,
  mergeShardResults,
  runSweep,
  validateSweep,
} from '../dist/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const RUN_SHARD = path.join(REPO, 'packages/mc-harness/bin/run-shard.mjs');
const MODAL_BRIDGE = path.join(REPO, 'tools/modal/sweep_fanout.py');

const USAGE = `mm-run-sweep-distributed — one sweep, many containers, the same bytes.

  --scenario <module>       Scenario module. Required.
  --sweep <file>            Sweep specification JSON. Required.
  --out <dir>               Where .runs.ndjson and .summary.json are written. Required.
  --shards <n>              How many independent executors. Default 8.
  --backend local|modal     Where shards run. Default local.
  --workers-per-shard <n>   Worker threads inside each shard. Default 1.
  --mode new-file|refuse    Output mode, as run-sweep.mjs. Default new-file.
  --job-dir <dir>           Keep the job and shard answers here instead of a temp dir.
  --modal-cpu <n>           CPU cores requested per Modal container. Default 2.
  --modal-app <name>        Modal app name. Default mm-sweep-fanout.
  --help

Modal credentials are read by the Modal client from the operator's own
environment. Nothing in this repository stores, prints or transmits them.`;

function parse(argv) {
  const args = {
    shards: 8,
    backend: 'local',
    'workers-per-shard': 1,
    mode: DEFAULT_OUTPUT_MODE,
    'modal-cpu': 2,
    'modal-app': 'mm-sweep-fanout',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (typeof flag !== 'string' || !flag.startsWith('--')) {
      throw new Error(`Unparseable argument ${String(flag)}. Run with --help.`);
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    const key = flag.slice(2);
    const numeric = ['shards', 'workers-per-shard', 'modal-cpu'];
    args[key] = numeric.includes(key) ? Number.parseInt(value, 10) : value;
    index += 1;
  }
  for (const required of ['scenario', 'sweep', 'out']) {
    if (args[required] === undefined) throw new Error(`--${required} is required.`);
  }
  if (!Number.isInteger(args.shards) || args.shards < 1) {
    throw new Error(`--shards must be a positive integer, received ${String(args.shards)}.`);
  }
  if (args.backend !== 'local' && args.backend !== 'modal') {
    throw new Error(`--backend must be "local" or "modal", received ${String(args.backend)}.`);
  }
  return args;
}

/** Runs a child to completion, streaming its stderr through, and resolves its exit code. */
function run(command, commandArgs, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) process.stderr.write(`${label} exited ${String(code)}.\n`);
      resolve(code ?? 1);
    });
  });
}

/**
 * The `local` backend: `--shards` child processes on this machine.
 *
 * Sequential in batches of `--shards` is not a scheduling policy worth having;
 * every shard is started at once and the operating system schedules them. This
 * backend exists to prove the partition is neutral and to run without a Modal
 * account, not to be fast.
 */
async function runLocalBackend(jobPath, resultsDir, args) {
  const attempt = async (shardIndex) =>
    await run(
      process.execPath,
      [
        RUN_SHARD,
        '--scenario',
        args.scenario,
        '--job',
        jobPath,
        '--shard',
        String(shardIndex),
        '--result',
        path.join(resultsDir, `shard-${String(shardIndex)}.json`),
      ],
      `shard ${String(shardIndex)}`,
    );

  const codes = await Promise.all(
    Array.from({ length: args.shards }, (_unused, shardIndex) => attempt(shardIndex)),
  );
  // Exactly one retry, and only for shards that failed. Beyond one, a repeated
  // failure is a defect rather than a flake and re-running it buries the cause.
  const failed = codes.flatMap((code, shardIndex) => (code === 0 ? [] : [shardIndex]));
  if (failed.length === 0) return;
  process.stderr.write(`retrying shards ${failed.join(', ')} once.\n`);
  for (const shardIndex of failed) {
    rmSync(path.join(resultsDir, `shard-${String(shardIndex)}.json`), { force: true });
  }
  const retried = await Promise.all(failed.map((shardIndex) => attempt(shardIndex)));
  const stillFailed = failed.filter((_unused, position) => retried[position] !== 0);
  if (stillFailed.length > 0) {
    throw new Error(
      `Shards ${stillFailed.join(', ')} failed twice. Nothing was written — a sweep missing runs ` +
        'it declared is not the sweep it declares itself to be.',
    );
  }
}

/** The `modal` backend: hands the job directory to the Python bridge and nothing else. */
async function runModalBackend(jobPath, resultsDir, args) {
  const python = process.env.MM_PYTHON ?? 'python3';
  const code = await run(
    python,
    [
      MODAL_BRIDGE,
      '--job',
      jobPath,
      '--results',
      resultsDir,
      '--shards',
      String(args.shards),
      '--cpu',
      String(args['modal-cpu']),
      '--app',
      String(args['modal-app']),
    ],
    'the Modal bridge',
  );
  if (code !== 0) {
    throw new Error(
      'The Modal bridge exited non-zero. Nothing was written. Modal credentials come from your ' +
        'own environment — run `modal token new` if you have none.',
    );
  }
}

function readShardAnswers(resultsDir, shardCount) {
  const present = new Set(
    readdirSync(resultsDir)
      .map((entry) => /^shard-(\d+)\.json$/.exec(entry))
      .filter((match) => match !== null)
      .map((match) => Number.parseInt(match[1], 10)),
  );
  const missing = [];
  for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
    if (!present.has(shardIndex)) missing.push(shardIndex);
  }
  if (missing.length > 0) {
    throw new Error(
      `Shards ${missing.join(', ')} left no answer in ${resultsDir}. Their runs are not recorded ` +
        'as failures: a container that vanished is infrastructure, not an outcome.',
    );
  }
  return Array.from({ length: shardCount }, (_unused, shardIndex) =>
    decodeShardResults(readFileSync(path.join(resultsDir, `shard-${String(shardIndex)}.json`), 'utf8')),
  );
}

/**
 * Refuses a fleet that ran a different build than this head.
 *
 * `runSweep`'s own `provenanceDisagreements` compares records to each other, so
 * a hundred containers all running the same stale image pass it unanimously.
 * This is the check that does not.
 */
function assertProvenanceMatchesHead(merged, expected) {
  const reference = canonicalJson(expected, 'provenance');
  for (const [taskId, result] of merged) {
    if (result.kind !== 'outcome') continue;
    const seen = canonicalJson(result.outcome.provenance, 'provenance');
    if (seen !== reference) {
      throw new Error(
        `Task ${String(taskId)} was executed against a different build than this head describes, ` +
          'so its records would be a sample of two universes. Nothing was written.\n' +
          `  head:  ${reference}\n  shard: ${seen}`,
      );
    }
  }
}

let jobDirectory;
let temporary = false;
try {
  const args = parse(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }

  const scenario = await import(pathToFileURL(args.scenario).href);
  const spec = JSON.parse(readFileSync(args.sweep, 'utf8'));

  const problems = validateSweep(spec, scenario.registries);
  if (problems.length > 0) {
    throw new Error(
      `Sweep ${String(spec.sweepId)} is not valid. No shard was dispatched.\n  ` +
        problems.join('\n  '),
    );
  }

  if (args['job-dir'] === undefined) {
    jobDirectory = mkdtempSync(path.join(tmpdir(), 'mm-sweep-job-'));
    temporary = true;
  } else {
    jobDirectory = path.resolve(args['job-dir']);
    mkdirSync(jobDirectory, { recursive: true });
  }
  const resultsDir = path.join(jobDirectory, 'results');
  mkdirSync(resultsDir, { recursive: true });
  const jobPath = path.join(jobDirectory, 'job.json');

  // The specification travels with the job. A container therefore needs no
  // access to `balance/sweeps/`, and cannot be running a different sweep file
  // than the head believes it is.
  writeFileSync(
    jobPath,
    `${canonicalJson(
      { spec, shardCount: args.shards, workerCount: args['workers-per-shard'] },
      'job',
    )}\n`,
  );

  const backend = args.backend === 'modal' ? runModalBackend : runLocalBackend;

  const result = await runSweep({
    spec,
    registries: scenario.registries,
    execution: {
      mode: 'distributed',
      workerCount: args.shards * args['workers-per-shard'],
      // The fan-out happens *inside* the dispatch callback, not before
      // `runSweep` is called, so that the summary's `wallClockMs` covers the
      // time the runs actually took. Dispatching outside it produced a
      // throughput figure four orders of magnitude too high — it was timing the
      // merge — and a performance section that flatters itself is worse than
      // none, because someone will size a sweep from it.
      dispatch: async (tasks) => {
        process.stdout.write(
          `Dispatching ${String(args.shards)} shards to the ${args.backend} backend, ` +
            `${String(args['workers-per-shard'])} worker(s) each.\n`,
        );
        await backend(jobPath, resultsDir, args);
        const merged = mergeShardResults(tasks, readShardAnswers(resultsDir, args.shards));
        assertProvenanceMatchesHead(merged, scenario.provenance);
        return merged;
      },
    },
    provenance: scenario.provenance,
    output: { directory: args.out, mode: args.mode },
    onPlan: (plan) => {
      process.stdout.write(
        `Sweep ${plan.sweepId} (${plan.kind}): ${String(plan.cellCount)} cells, ` +
          `${String(plan.runCount)} runs, configuration ${plan.configurationHash.slice(0, 16)}.\n`,
      );
    },
  });

  const { summary } = result;
  process.stdout.write(`Wrote ${String(result.records.length)} records to ${result.runsPath}.\n`);
  for (const [status, count] of Object.entries(summary.countsByStatus)) {
    process.stdout.write(`  ${status}: ${String(count)}\n`);
  }
  process.stdout.write('  by terminal reason:\n');
  for (const [reason, count] of Object.entries(summary.countsByTerminalReason)) {
    process.stdout.write(`    ${reason}: ${String(count)}\n`);
  }
  process.stdout.write(
    `  throughput: ${summary.performance.runsPerSecond.toFixed(2)} runs/s, ` +
      `${summary.performance.worldTicksPerSecond.toFixed(0)} world ticks/s across ` +
      `${String(summary.performance.workerCount)} executors\n`,
  );
  if (summary.disqualified) {
    process.stderr.write(
      `Sweep ${summary.sweepId} is disqualified: ${String(summary.failureCount)} failed runs ` +
        `exceeds the declared threshold of ${String(summary.failureThreshold)}.\n`,
    );
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  if (temporary && jobDirectory !== undefined) rmSync(jobDirectory, { recursive: true, force: true });
}
