#!/usr/bin/env node
/*
 * Multiverse Mages — the balance regression gate entry point.
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
 * A shell over `gateCommand`. Run `npm run typecheck` first, or `npm run
 * verify`, which orders them: this loads `dist/`.
 *
 *     node packages/mc-harness/bin/balance-gate.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --sweep    ./balance/sweeps/balance-gate.sweep.json \
 *       --baseline ./balance/baselines/balance-gate-v1.baseline.json \
 *       --workers  4
 *
 * This is what CI runs, and it reads the baseline without ever writing one.
 * Regeneration lives in its own entrypoint beside this one, deliberately a
 * different file invoked by a person with a written rationale — and this file
 * does not name it, so that nothing here can grow a path to it. See
 * `balance/README.md`.
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { gateCommand } from '../dist/index.js';

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

const sink = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

try {
  const args = parse(process.argv.slice(2));
  for (const required of ['scenario', 'sweep', 'baseline']) {
    if (args[required] === undefined) throw new Error(`--${required} is required.`);
  }

  const scenario = await import(pathToFileURL(args.scenario).href);

  const { exitCode } = await gateCommand(
    {
      sweepPath: args.sweep,
      baselinePath: args.baseline,
      outputDirectory: args.out === undefined ? 'mc-results/gate' : args.out,
      workerCount: args.workers === undefined ? 4 : Number.parseInt(args.workers, 10),
    },
    scenario,
    sink,
  );
  process.exitCode = exitCode;
} catch (error) {
  sink.err(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
