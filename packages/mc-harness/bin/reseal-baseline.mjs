#!/usr/bin/env node
/*
 * Multiverse Mages — provenance-only baseline re-seal entry point.
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
 * **The second of the two things in this repository that write a baseline, and
 * like the first, nothing automated may invoke it.** Not `npm test`, not
 * `npm run verify`, not either CI system, and not an npm script — a re-seal
 * reachable from CI would be strictly worse than a regeneration reachable from
 * CI, because it is the cheaper of the two to run and produces a smaller diff.
 * `baseline-reseal.test.ts` reads the CI configuration and fails if that stops
 * being true.
 *
 * ## What it is for
 *
 * The balance gate refuses `baseline-invalid` on a `provenance` mismatch
 * **before it reads any metric**. A change that moves the content revision
 * without moving any behaviour therefore fails a required check with no remedy
 * short of re-recording numbers that did not move. This is the remedy: it
 * rewrites `provenance`, appends one note saying plainly that nothing was
 * measured, recomputes `contentHash`, and passes every metric line through byte
 * for byte.
 *
 *     node packages/mc-harness/bin/reseal-baseline.mjs \
 *       --scenario  ./packages/scenario/bin/scenario.mjs \
 *       --sweep     ./balance/sweeps/balance-gate.sweep.json \
 *       --baseline  ./balance/baselines/balance-gate-v1.baseline.json \
 *       --sealed-on 2026-08-14 \
 *       --workers   4
 *
 * Add `--dry-run true` to run the verification and print the movement without
 * touching the file. Add `--note "…"`, repeatably, for anything a reader must
 * know beyond the note the command writes for itself.
 *
 * ## It runs the sweep, and there is no flag that skips it
 *
 * A content hash says nothing about behaviour, so the only sound way to know a
 * re-seal is the right tool is to measure and discard the measurement. The
 * verification sweep costs exactly what the gate costs — 4 s, 27 s and 10 s for
 * the three gates inside the required check, and ~1000 s for the two-hundred-
 * year one. If any gated metric has left its tolerance, become available,
 * stopped being available or changed its `definitionVersion`, this refuses and
 * names it. Re-sealing over a real movement would hide a regression behind a
 * fresh seal, so the command must not be usable that way.
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { resealCommand } from '../dist/index.js';

/** Repeated flags accumulate; everything else takes the last value given. */
const REPEATABLE = new Set(['note']);

function parse(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (typeof key !== 'string' || !key.startsWith('--') || value === undefined) {
      throw new Error(`Unparseable argument near ${String(key)}. Every flag takes a value.`);
    }
    const name = key.slice(2);
    if (REPEATABLE.has(name)) {
      args[name] = [...(args[name] ?? []), value];
    } else {
      args[name] = value;
    }
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

  process.exitCode = await resealCommand(
    {
      sweepPath: args.sweep,
      baselinePath: args.baseline,
      outputDirectory: args.out === undefined ? 'mc-results/reseal' : args.out,
      workerCount: args.workers === undefined ? 4 : Number.parseInt(args.workers, 10),
      // Undefined rather than today's date when the flag is absent: the command
      // demands a date it can put in the note, and a default taken from the
      // wall clock would make two runs of one command write different files.
      sealedOn: args['sealed-on'],
      ...(args.note === undefined ? {} : { notes: args.note }),
      dryRun: args['dry-run'] === 'true',
    },
    scenario,
    sink,
  );
} catch (error) {
  sink.err(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
