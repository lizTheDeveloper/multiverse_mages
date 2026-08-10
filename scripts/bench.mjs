#!/usr/bin/env node
/*
 * Multiverse Mages — the timing half of the population benchmark.
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
 * Times `runPopulationBenchmark` and prints one JSON object on stdout.
 *
 * **This file exists because the workload may not read a clock.**
 * `packages/sim-core/src` bans `Date` and `performance` by lint, and the pure
 * workload in `packages/sim-core/bench/population.ts` holds itself to the same
 * bar. A benchmark, however, is nothing but a clock reading and a division. The
 * two are reconciled by splitting rather than by exempting: the workload
 * computes, this runner measures, and nothing that reads wall-clock time or
 * performs floating-point arithmetic ever enters the package.
 *
 * The floats here are not a loophole. Dividing a tick count by an elapsed
 * duration is analysis of a run that has already finished — it cannot influence
 * a single simulated value, because by the time it happens the final snapshot
 * hash is already fixed. That is the line: floats may describe the simulation,
 * never participate in it.
 *
 * Usage:
 *
 *     npm run bench
 *     npm run bench -- --entities 20000 --ticks 200 --seed 7
 *     npm run bench --silent -- --ticks 50 | jq .stepsPerSecond
 *
 * `--silent` suppresses npm's own banner, which is what you want when piping.
 * Machine-readable output is one object on stdout; everything advisory goes to
 * stderr, so a consumer can read stdout blind.
 */

import process from 'node:process';

import { runPopulationBenchmark } from '../.tsbuild/bench-run/bench/population.js';

/** Defaults: big enough to be a real measurement, small enough to finish. */
const DEFAULTS = {
  entities: 10000,
  ticks: 100,
  seed: 1,
  /** Untimed ticks, to let the JIT settle before the measured pass. */
  warmupTicks: 10,
};

const USAGE = `Usage: node scripts/bench.mjs [options]

  --entities <n>   Steady-state live population        (default ${DEFAULTS.entities})
  --ticks <n>      Ticks to simulate, timed            (default ${DEFAULTS.ticks})
  --seed <n>       Root seed, uint32                   (default ${DEFAULTS.seed})
  --churn <n>      Entities replaced per tick          (default entities/64, min 1)
  --warmup <n>     Untimed warmup ticks, 0 to skip     (default ${DEFAULTS.warmupTicks})
  --help           Print this and exit
`;

/**
 * Parses `--flag value` pairs into integers.
 *
 * Rejects anything non-integer rather than coercing it. A benchmark invoked
 * with `--ticks 1e5` that silently ran 1 tick would publish a throughput number
 * a hundred thousand times too optimistic, and nothing downstream would catch
 * it — the JSON would look entirely reasonable.
 */
function parseArgs(argv) {
  const options = {
    entities: DEFAULTS.entities,
    ticks: DEFAULTS.ticks,
    seed: DEFAULTS.seed,
    warmupTicks: DEFAULTS.warmupTicks,
    churn: undefined,
  };
  const names = {
    '--entities': 'entities',
    '--ticks': 'ticks',
    '--seed': 'seed',
    '--churn': 'churn',
    '--warmup': 'warmupTicks',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      process.stderr.write(USAGE);
      process.exit(0);
    }
    const key = names[flag];
    if (key === undefined) {
      throw new Error(`Unknown option "${flag}".\n\n${USAGE}`);
    }
    const raw = argv[i + 1];
    i += 1;
    if (raw === undefined) {
      throw new Error(`Option "${flag}" needs a value.\n\n${USAGE}`);
    }
    if (!/^\d+$/.test(raw)) {
      throw new Error(`Option "${flag}" needs a non-negative integer, got "${raw}".`);
    }
    options[key] = Number.parseInt(raw, 10);
  }

  return options;
}

/** Elapsed seconds between two `hrtime.bigint()` readings, as a float. */
function secondsBetween(startNs, endNs) {
  return Number(endNs - startNs) / 1e9;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const config = {
    entityCount: options.entities,
    ticks: options.ticks,
    seed: options.seed,
    ...(options.churn === undefined ? {} : { churnPerTick: options.churn }),
  };

  // Warm-up is a full, untimed call. Its result is kept for one reason: it must
  // equal the timed run's. Two identical configs that disagree on the final
  // hash mean the core picked up a nondeterministic dependency, and catching
  // that here — in the process that is about to publish a throughput number —
  // is free.
  let warmupHash;
  if (options.warmupTicks > 0) {
    warmupHash = runPopulationBenchmark({ ...config, ticks: options.warmupTicks })
      .finalSnapshotHash;
  }

  const startNs = process.hrtime.bigint();
  const result = runPopulationBenchmark(config);
  const endNs = process.hrtime.bigint();

  if (options.warmupTicks > 0) {
    const check = runPopulationBenchmark({ ...config, ticks: options.warmupTicks })
      .finalSnapshotHash;
    if (check !== warmupHash) {
      process.stderr.write(
        `Determinism check FAILED: two runs of the same config produced ${warmupHash} and ${check}.\n` +
          'The measured throughput below would be meaningless; refusing to print it.\n',
      );
      process.exit(1);
    }
  }

  const seconds = secondsBetween(startNs, endNs);
  if (seconds <= 0) {
    process.stderr.write(
      'Measured duration was zero. Raise --ticks or --entities so the run is long enough to time.\n',
    );
    process.exit(1);
  }

  const report = {
    entityCount: result.entityCount,
    ticks: result.ticks,
    seed: result.seed,
    churnPerTick: result.churnPerTick,
    warmupTicks: options.warmupTicks,
    elapsedSeconds: seconds,
    stepsPerSecond: result.ticks / seconds,
    entityUpdates: result.entityUpdates,
    entityUpdatesPerSecond: result.entityUpdates / seconds,
    entityUpdatesPerStep: result.entityUpdates / result.ticks,
    created: result.created,
    destroyed: result.destroyed,
    finalLiveCount: result.finalLiveCount,
    finalWorldTick: result.finalWorldTick,
    finalSnapshotHash: result.finalSnapshotHash,
    nodeVersion: process.version,
  };

  process.stdout.write(`${JSON.stringify(report)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
