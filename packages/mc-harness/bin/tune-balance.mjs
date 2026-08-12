#!/usr/bin/env node
/*
 * Multiverse Mages — search the untuned constants for a ruleset with variety.
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
 * Coordinate descent over `god-constant.json`, scored by `src/tuner.ts`.
 *
 *     node packages/mc-harness/bin/tune-balance.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --replicates 6 --passes 2 --out ./balance/tuning
 *
 * ## Why this writes to `packages/content/data` at all
 *
 * `content-set.ts` loads the shipped content once per process and caches it,
 * and there is no override hook — deliberately, because a scenario that could
 * be handed different constants at runtime is a scenario whose recorded
 * provenance no longer identifies what was run. So the only way to evaluate a
 * candidate ruleset is to write it and start fresh workers. That is what this
 * does, and it is why the restore path below is the most important code here.
 *
 * ## The file is restored on every exit path
 *
 * The original bytes are read once, before anything runs, and written back in a
 * `finally` and on `SIGINT`/`SIGTERM`. A tuner that dies half way through and
 * leaves the repository holding a candidate ruleset would be a tool that
 * corrupts the thing it is tuning, and the failure would show up later as an
 * unexplained balance-gate diff. `--apply` writes the winner **after** the
 * restore, as a separate, deliberate act.
 *
 * ## What this does NOT do
 *
 * It does not regenerate any baseline and it does not touch a golden replay
 * fixture. Baselines are a separate, explicit command with a written rationale;
 * goldens are determinism claims and are not balance at all. A tuner that could
 * quietly move either would be able to make itself right.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { scoreBalance, candidatesForAxis } from '../dist/tuner.js';

const USAGE = `mm-tune-balance — coordinate descent over the untuned ascension constants.

  --scenario <module>    Scenario module. Required.
  --replicates <n>       Replicates per cell per candidate. Default 6.
  --passes <n>           Coordinate-descent passes over every axis. Default 2.
  --workers <n>          Sweep workers. Default 8.
  --out <dir>            Where the trial log is written. Required.
  --apply                Write the winning constants back at the end.
  --help

Without --apply nothing in packages/content is changed: the file is restored on
every exit path, including SIGINT. Baselines are never regenerated here and
golden fixtures are never touched.`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const CONSTANTS = path.join(REPO, 'packages/content/data/god-constant.json');
const SWEEP_TEMPLATE = path.join(REPO, 'balance/sweeps/balance-gate-ascension.sweep.json');
const RUN_SWEEP = path.join(REPO, 'packages/mc-harness/bin/run-sweep.mjs');

/**
 * The axes, and why each level is on the list.
 *
 * Every one of these carries `tuningStatus: "untuned"` in the content file, and
 * the glosses there already author a retune *order* — `ascension-tier-gate` is
 * named "the first knob turned when ascensionRate leaves its 5-20% band", then
 * `ascension-era-count`, then `ascension-dependence-max`. The axis order below
 * is that order, so a coordinate pass turns the knobs the content data says to
 * turn, in the sequence it says to turn them.
 */
const AXES = [
  // Path A's gate. `worship-tier-count` is 5, so 5 is the ceiling and this knob
  // is spent after one step — worth knowing before the search reports success.
  { constantId: 'ascension-tier-gate', levels: [3, 4, 5] },
  // Path B's length, and the knob that actually moves the measured wins:
  // ERA_TICKS is 240, so 4 eras completes at tick 960, which is exactly where
  // they cluster.
  //
  // The levels run to 9 and stop. At the 2400-tick horizon there are exactly
  // ten eras, so `ascension-era-count: 10` requires every era in the run to
  // pass and is unwinnable by construction rather than by balance — the first
  // search included it, measured 0.000, and spent eleven trials sitting on a
  // ruleset nobody could win. 7 and 9 were missing from that grid, and the
  // rate fell from 0.458 at 8 straight to 0.000 at 10, so the interesting
  // region was never sampled.
  { constantId: 'ascension-era-count', levels: [4, 5, 6, 7, 8, 9] },
  { constantId: 'ascension-dependence-max', levels: [64, 128, 192, 256] },
  { constantId: 'ascension-loss-max', levels: [0, 1, 2, 3] },
  { constantId: 'ascension-min-tick', levels: [600, 900, 1200] },
  // ---- The positive-achievement constants -------------------------------
  //
  // The levels here are not a guess and they are not a geometric ladder. They
  // bracket a *measured* window whose two edges both mean something, taken by
  // driving all eight pool strategies through the reference universe and reading
  // the god tick report's `ascensionProgress` block at every era boundary:
  //
  //   strategy                masteredCells  nodesKnown  cellsKnown
  //   passive-control                    12          51          12
  //   uniform-random-legal               12          51          12
  //   archivist / portal-rush /
  //     worship-maximizer                12          51          12
  //   permissive-breadth                 15         262          70
  //   narrow-depth                        0           9           5
  //   denial-warden                       0           5           5
  //
  // The v1 rectangle is twelve cells holding fifty-one nodes and an unattended
  // universe learns **all of them**, so 12 and 51 are the passive ceiling: any
  // level at or below them is met by doing nothing, and any level above them
  // requires the god to have permitted an axis the universe did not start with.
  // Each list therefore runs identity -> passive ceiling -> the window above it.
  //
  // The gap between the passive ceiling (12 cells) and the best-playing strategy
  // in the pool (15) is three cells wide, and that is a measurement of the pool
  // rather than of the game: five of eight strategies produce a universe
  // *indistinguishable* from the one the god never touched.
  { constantId: 'ascension-summit-cells', levels: [1, 12, 13, 14, 15] },
  { constantId: 'ascension-summit-copies', levels: [2, 4] },
  { constantId: 'ascension-canon-breadth', levels: [0, 51, 77, 102, 180] },
  { constantId: 'ascension-canon-cells', levels: [0, 12, 18, 24, 36] },
  { constantId: 'ascension-loss-fraction', levels: [0, 26, 51, 102] },
];

const WEIGHTS = { variety: 1, correlation: 1, exploit: 1 };
const BAND = { min: 0.05, max: 0.2 };

function parseArgs(argv) {
  const known = new Set(['--scenario', '--replicates', '--passes', '--workers', '--out']);
  const args = { replicates: 6, passes: 2, workers: 8, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (flag === '--apply') {
      args.apply = true;
      continue;
    }
    if (!known.has(flag)) throw new Error(`Unknown option ${flag}. Run with --help.`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    const key = flag.slice(2);
    args[key] = key === 'scenario' || key === 'out' ? value : Number(value);
    index += 1;
  }
  for (const required of ['scenario', 'out']) {
    if (args[required] === undefined) throw new Error(`--${required} is required.`);
  }
  return args;
}

/** Reads the tunable constants out of the content file as a plain vector. */
function vectorOf(constants) {
  const out = {};
  for (const axis of AXES) {
    const record = constants.find((entry) => entry.id === axis.constantId);
    if (record === undefined) throw new Error(`${axis.constantId} is not in god-constant.json.`);
    out[axis.constantId] = record.value;
  }
  return out;
}

/** Writes a candidate vector into the content file, preserving everything else. */
function writeVector(constants, vector) {
  const next = constants.map((entry) =>
    vector[entry.id] === undefined ? entry : { ...entry, value: vector[entry.id] },
  );
  writeFileSync(CONSTANTS, `${JSON.stringify(next, null, 2)}\n`);
}

function runSweep(args, sweepPath, outDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        RUN_SWEEP,
        '--scenario',
        args.scenario,
        '--sweep',
        sweepPath,
        '--out',
        outDir,
        '--workers',
        String(args.workers),
      ],
      { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`run-sweep exited ${code}: ${stderr.slice(0, 400)}`));
      else resolve();
    });
  });
}

/** Folds a sweep's records into the per-strategy outcomes the score wants. */
function outcomesOf(ndjsonPath) {
  const byStrategy = new Map();
  for (const line of readFileSync(ndjsonPath, 'utf8').trim().split('\n')) {
    const record = JSON.parse(line);
    const id = record.strategies[0];
    const entry = byStrategy.get(id) ?? { ascended: 0, runs: 0, nodes: 0 };
    entry.runs += 1;
    if (record.status === 'ascended') entry.ascended += 1;
    entry.nodes += record.metrics.referenceNodesKnown?.value ?? 0;
    byStrategy.set(id, entry);
  }
  return [...byStrategy.entries()]
    .map(([strategyId, entry]) => ({
      strategyId,
      ascended: entry.ascended,
      runs: entry.runs,
      meanNodesKnown: entry.runs === 0 ? 0 : entry.nodes / entry.runs,
    }))
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId));
}

/**
 * The sweep id every candidate is evaluated under. **Constant on purpose.**
 *
 * `seed.ts` derives a run's seed from `(rootSeed, sweepId, cellIndex,
 * replicateIndex)` and says so in its opening line. A tuner that gave each
 * trial its own `sweepId` would therefore evaluate every candidate on a
 * *different* set of universes, and the difference between two candidates would
 * carry the difference between two seed sets as well as the change in
 * constants. That is what the first two searches did, and it is why their
 * comparisons were noisier than the run counts alone imply.
 *
 * Holding it constant is the common-random-numbers trick: every candidate plays
 * the same universes, so the paired difference is the effect of the constants
 * and nothing else. Trials are told apart by their output directory instead.
 */
const SHARED_SWEEP_ID = 'tune-shared-seeds';

async function evaluate(args, constants, vector, trialDir, trialId) {
  writeVector(constants, vector);
  const sweep = JSON.parse(readFileSync(SWEEP_TEMPLATE, 'utf8'));
  sweep.sweepId = SHARED_SWEEP_ID;
  sweep.replicates = args.replicates;
  const trialOut = path.join(trialDir, `trial-${trialId}`);
  mkdirSync(trialOut, { recursive: true });
  const sweepPath = path.join(trialOut, 'candidate.sweep.json');
  writeFileSync(sweepPath, JSON.stringify(sweep, null, 2));
  await runSweep(args, sweepPath, trialOut);
  const outcomes = outcomesOf(path.join(trialOut, `${SHARED_SWEEP_ID}.0.runs.ndjson`));
  return { outcomes, score: scoreBalance(outcomes, WEIGHTS, BAND) };
}

function report(vector, score) {
  const flag = score.feasible ? 'FEASIBLE' : 'infeasible';
  const terms =
    `rate ${score.ascensionRate.toFixed(3)}` +
    ` variety ${score.variety.toFixed(3)}` +
    ` corr ${score.correlation.toFixed(2)}` +
    ` exploit ${score.exploitMargin.toFixed(3)}` +
    ` top ${score.topShare.toFixed(2)}`;
  const vec = AXES.map((axis) => `${axis.constantId.replace('ascension-', '')}=${vector[axis.constantId]}`).join(' ');
  return `${flag} score ${score.score.toFixed(4)} | ${terms} | ${vec}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const originalBytes = readFileSync(CONSTANTS, 'utf8');
  const constants = JSON.parse(originalBytes);
  const restore = () => writeFileSync(CONSTANTS, originalBytes);
  const onSignal = () => {
    restore();
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const outDir = path.resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const trialDir = path.join(tmpdir(), `mm-tune-${process.pid}`);
  mkdirSync(trialDir, { recursive: true });

  const log = [];
  let incumbent = vectorOf(constants);
  let best;
  let trialId = 0;

  try {
    best = (await evaluate(args, constants, incumbent, trialDir, trialId++)).score;
    process.stdout.write(`baseline  ${report(incumbent, best)}\n`);
    log.push({ trial: 0, vector: { ...incumbent }, score: best });

    for (let pass = 1; pass <= args.passes; pass += 1) {
      let improvedThisPass = false;
      for (const axis of AXES) {
        for (const candidate of candidatesForAxis(incumbent, axis)) {
          const { score } = await evaluate(args, constants, candidate, trialDir, trialId);
          log.push({ trial: trialId, vector: { ...candidate }, score });
          // Feasibility first: a candidate that satisfies the hard constraints
          // beats every candidate that does not, whatever their scores. Only
          // among equals in feasibility does the weighted score decide.
          const better =
            score.feasible !== best.feasible ? score.feasible : score.score > best.score;
          process.stdout.write(`p${pass} t${trialId} ${better ? '*' : ' '} ${report(candidate, score)}\n`);
          trialId += 1;
          if (better) {
            best = score;
            incumbent = candidate;
            improvedThisPass = true;
          }
        }
      }
      if (!improvedThisPass) {
        process.stdout.write(`pass ${pass}: no axis improved; converged.\n`);
        break;
      }
    }
  } finally {
    restore();
  }

  writeFileSync(
    path.join(outDir, 'tuning-log.json'),
    `${JSON.stringify({ axes: AXES, weights: WEIGHTS, band: BAND, best: { vector: incumbent, score: best }, trials: log }, null, 2)}\n`,
  );

  process.stdout.write(`\nbest      ${report(incumbent, best)}\n`);
  for (const note of best.notes) process.stdout.write(`  - ${note}\n`);
  process.stdout.write(`\ntrial log: ${path.join(outDir, 'tuning-log.json')}\n`);

  if (args.apply) {
    writeVector(constants, incumbent);
    process.stdout.write(
      'applied. The balance gates will now fail until their baselines are regenerated ' +
        'deliberately, with a written rationale. That is the intended tripwire, not a bug.\n',
    );
  } else {
    process.stdout.write('content restored; pass --apply to keep the winner.\n');
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
