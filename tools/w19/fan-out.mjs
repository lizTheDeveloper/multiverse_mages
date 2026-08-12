/*
 * Multiverse Mages — W19: fan the horizon arms out across local processes.
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
 * ## What varies, and what does not
 *
 * Exactly one thing varies between horizons: `--ticks`. `run-arm.mjs`'s
 * `SWEEP_ID`, `ROOT_SEED`, cell list and replicate range are untouched, and
 * `deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex,
 * replicateIndex)` — so the seven horizons are the *same universes*, read at
 * seven different moments. Seed equality is true by construction here and is
 * verified after the fact by `summarise.mjs`, which compares the recorded
 * `runSeed` pairwise across horizons rather than trusting this comment.
 *
 * The strategy is passed explicitly on the command line, never dealt by index,
 * so `assignStrategies`'s `strategies[replicateIndex % poolSize]` — the trap
 * that silently drops strategies when the replicate count does not divide the
 * pool — is not on this path at all. Coverage is asserted anyway.
 *
 * ## Usage
 *
 *     node tools/w19/fan-out.mjs --arm a --out .w19/arm-a --jobs 14
 *     node tools/w19/fan-out.mjs --arm b --out .w19/arm-b --jobs 14
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** The seven horizons, in world ticks. All are multiples of 150. */
export const HORIZONS = Object.freeze([300, 450, 600, 900, 1200, 1800, 2400]);

/**
 * The composition sampling grid. 150 divides every horizon, which is what makes
 * "the 2400 arm's sample at tick H equals the H-capped arm's terminal" a
 * checkable claim rather than an assumption.
 */
export const SAMPLE_TICKS = 150;

/** The full pool as `BOT_POOL` holds it — ten, including the two probes. */
export const POOL_10 = Object.freeze([
  'passive-control',
  'uniform-random-legal',
  'permissive-breadth',
  'narrow-depth',
  'denial-warden',
  'archivist',
  'portal-rush',
  'worship-maximizer',
  'idle-then-declare',
  'permit-then-idle',
]);

/**
 * Arm B's strategies and masks. Gnome (8) and human (16) are the pair W15 found
 * share `depthCeiling: 4` and reach the identical 49 nodes at 2400 — so if any
 * two species diverge before exhaustion, these are the ones whose divergence
 * cannot be explained by the ceiling.
 */
export const SPECIES_STRATEGIES = Object.freeze([
  'passive-control',
  'archivist',
  'permissive-breadth',
]);
export const SPECIES_MASKS = Object.freeze([8, 16]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

function jobsFor(arm, out, replicates) {
  const jobs = [];
  for (const ticks of HORIZONS) {
    const dir = join(out, `h${String(ticks)}`);
    if (arm === 'a') {
      for (const strategyId of POOL_10) {
        jobs.push({ dir, ticks, strategyId, mask: undefined, replicates });
      }
    } else {
      for (const strategyId of SPECIES_STRATEGIES) {
        for (const mask of SPECIES_MASKS) {
          jobs.push({ dir, ticks, strategyId, mask, replicates });
        }
      }
    }
  }
  // Longest first: a 2400-tick job started last would be the tail of the whole
  // fan-out with thirteen idle cores behind it.
  return jobs.sort((x, y) => y.ticks - x.ticks);
}

function runJob(job) {
  return new Promise((resolve, reject) => {
    mkdirSync(job.dir, { recursive: true });
    const argv = [
      'tools/w15/run-arm.mjs',
      '--strategies',
      job.strategyId,
      '--replicates',
      String(job.replicates),
      '--ticks',
      String(job.ticks),
      '--sample',
      String(SAMPLE_TICKS),
      '--out',
      job.dir,
      '--tag',
      `h${String(job.ticks)}`,
    ];
    if (job.mask !== undefined) argv.push('--masks', String(job.mask));
    const child = spawn(process.execPath, argv, { stdio: ['ignore', 'inherit', 'ignore'] });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(job);
      else reject(new Error(`${job.strategyId}@${String(job.ticks)} exited ${String(code)}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const arm = args.arm ?? 'a';
  const out = args.out ?? `.w19/arm-${arm}`;
  const replicates = Number(args.replicates ?? (arm === 'a' ? 20 : 12));
  const concurrency = Number(args.jobs ?? 14);

  const queue = jobsFor(arm, out, replicates);
  const total = queue.length;
  let done = 0;
  const started = Date.now();

  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    for (;;) {
      const job = queue.shift();
      if (job === undefined) return;
      await runJob(job);
      done += 1;
      process.stderr.write(
        `[w19] ${String(done)}/${String(total)} done — ${job.strategyId}@${String(job.ticks)}` +
          `${job.mask === undefined ? '' : ` mask${String(job.mask)}`} ` +
          `(${String(Math.round((Date.now() - started) / 1000))}s)\n`,
      );
    }
  });

  await Promise.all(workers);
  process.stderr.write(
    `[w19] arm ${arm}: ${String(total)} jobs in ` +
      `${String(Math.round((Date.now() - started) / 1000))}s\n`,
  );
}

await main();
