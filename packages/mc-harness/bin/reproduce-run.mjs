#!/usr/bin/env node
/*
 * Multiverse Mages — single-run reproduction entry point.
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
 * Re-executes one recorded run, alone, in this process, on the main thread —
 * which is the point: this is the entry point a debugger attaches to.
 *
 * A shell over `reproduceCommand`. See `run-sweep.mjs` for why the dynamic
 * import of the scenario module lives out here rather than in `src/`.
 *
 *     node packages/mc-harness/bin/reproduce-run.mjs \
 *       --scenario  ./balance/scenario.mjs \
 *       --sweep     ./balance/sweeps/gate.sweep.json \
 *       --cell      12 \
 *       --replicate 3 \
 *       --compare   ./balance/results/gate.0.runs.ndjson
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { reproduceCommand } from '../dist/index.js';

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
  for (const required of ['scenario', 'sweep', 'cell', 'replicate']) {
    if (args[required] === undefined) throw new Error(`--${required} is required.`);
  }

  const scenario = await import(pathToFileURL(args.scenario).href);
  const spec = JSON.parse(readFileSync(args.sweep, 'utf8'));

  process.exitCode = await reproduceCommand(
    {
      spec,
      cellIndex: Number.parseInt(args.cell, 10),
      replicateIndex: Number.parseInt(args.replicate, 10),
      ...(args.compare === undefined ? {} : { comparePath: args.compare }),
    },
    scenario,
    sink,
  );
} catch (error) {
  sink.err(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
