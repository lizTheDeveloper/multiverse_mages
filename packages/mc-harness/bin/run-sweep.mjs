#!/usr/bin/env node
/*
 * Multiverse Mages — sweep execution entry point.
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
 * A shell over `runSweepCommand`, which is where the logic lives so the unit
 * tests can exercise it. Run `npm run typecheck` first, or `npm run verify`,
 * which orders them.
 *
 * The shell owns the one thing the library cannot: a dynamic `import()` of the
 * scenario module named on the command line. `contracts.md` §5's boundary
 * scanner correctly refuses to guess at a computed specifier, so the import
 * lives out here rather than inside `src/`.
 *
 *     node packages/mc-harness/bin/run-sweep.mjs \
 *       --scenario ./balance/scenario.mjs \
 *       --sweep    ./balance/sweeps/gate.sweep.json \
 *       --out      ./balance/results \
 *       --workers  8
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { DEFAULT_OUTPUT_MODE, runSweepCommand } from '../dist/index.js';

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
  for (const required of ['scenario', 'sweep', 'out']) {
    if (args[required] === undefined) throw new Error(`--${required} is required.`);
  }

  const scenario = await import(pathToFileURL(args.scenario).href);
  const spec = JSON.parse(readFileSync(args.sweep, 'utf8'));

  const { exitCode } = await runSweepCommand(
    {
      spec,
      outputDirectory: args.out,
      workerCount: args.workers === undefined ? 1 : Number.parseInt(args.workers, 10),
      outputMode: args.mode === undefined ? DEFAULT_OUTPUT_MODE : args.mode,
    },
    scenario,
    sink,
  );
  process.exitCode = exitCode;
} catch (error) {
  sink.err(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
