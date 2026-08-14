#!/usr/bin/env node
/*
 * Multiverse Mages — one shard of a sweep, executed wherever this process is.
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
 * The remote half of W11's fan-out, and deliberately the dumbest process in it.
 *
 *     node packages/mc-harness/bin/run-shard.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --job      /job/job.json \
 *       --shard    3 \
 *       --result   /out/shard-3.json
 *
 * `job.json` carries `{ spec, shardCount, workerCount }` — the sweep
 * specification verbatim, so a container needs no access to the repository's
 * `balance/sweeps/` and cannot be running a different sweep file than the head.
 *
 * ## What it may not do
 *
 * It does not choose seeds. It expands the sweep and calls `buildTasks` exactly
 * as a local sweep would, then keeps the subset `selectShard` gives it. Every
 * field of every task is therefore a pure function of `(spec, cellIndex,
 * replicateIndex)`, which is the property that makes a distributed sweep the
 * same experiment as a local one.
 *
 * It does not write results files. `storage.ts` opens its output with the `wx`
 * flag and assumes a single writer per execution index; the head owns that.
 *
 * It does not aggregate. Aggregation folds in canonical order over the whole
 * sweep, and a shard has seen a fifth of it.
 *
 * ## stdout is the answer, or a file is
 *
 * With `--result`, the shard's answer is written there and stdout is left for
 * progress. Without it, the answer goes to stdout and nothing else does — the
 * scenario module is loaded *after* argument parsing so that a module that
 * prints on import cannot corrupt the answer.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  buildTasks,
  encodeShardResults,
  expandSweep,
  runTasksOnPool,
  selectShard,
  validateSweep,
} from '../dist/index.js';

function parse(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (typeof key !== 'string' || !key.startsWith('--') || value === undefined) {
      throw new Error(`Unparseable argument near ${String(key)}. Every flag takes a value.`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

try {
  const args = parse(process.argv.slice(2));
  for (const required of ['scenario', 'job', 'shard']) {
    if (args[required] === undefined) throw new Error(`--${required} is required.`);
  }

  const job = JSON.parse(readFileSync(args.job, 'utf8'));
  const shardIndex = Number.parseInt(args.shard, 10);
  const { spec, shardCount, workerCount } = job;

  const scenario = await import(pathToFileURL(args.scenario).href);

  const problems = validateSweep(spec, scenario.registries);
  if (problems.length > 0) {
    throw new Error(
      `Shard ${String(shardIndex)} was handed a sweep that does not validate against this ` +
        `build's registries, so it dispatched nothing:\n  ${problems.join('\n  ')}`,
    );
  }
  if (scenario.workerUrl === undefined) {
    throw new Error('The scenario module exports no workerUrl, so the pool has nothing to load.');
  }

  const tasks = buildTasks(spec, expandSweep(spec, scenario.registries));
  const mine = selectShard(tasks, { shardIndex, shardCount });
  process.stderr.write(
    `shard ${String(shardIndex)}/${String(shardCount)}: ${String(mine.size)} of ` +
      `${String(tasks.size)} runs on ${String(workerCount)} workers\n`,
  );

  const results = await runTasksOnPool(mine, {
    workerUrl: scenario.workerUrl,
    workerCount,
    perRunTimeoutMs: spec.termination.perRunTimeoutMs,
  });

  // Canonical encoding, not `JSON.stringify`. It refuses NaN, Infinity and an
  // explicit undefined rather than rendering them as null, and a null read back
  // is indistinguishable from a metric that was never measured. See `shard.ts`.
  const answer = encodeShardResults({ shardIndex, shardCount, results: [...results] });

  if (args.result === undefined) process.stdout.write(`${answer}\n`);
  else writeFileSync(args.result, `${answer}\n`, { flag: 'wx' });
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
}
