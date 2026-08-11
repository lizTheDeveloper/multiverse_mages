#!/usr/bin/env node
/*
 * Multiverse Mages — deliberate baseline regeneration entry point.
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
 * **This file is the only thing in the repository that writes a baseline, and
 * nothing automated may invoke it.** Not `npm test`, not `npm run verify`, not
 * either CI system. `baseline-regeneration.test.ts` reads
 * `.github/workflows/ci.yml`, `scripts/ci-check.sh` and the root `package.json`
 * and fails if any of them names it (task 9.6).
 *
 * The rule is CLAUDE.md's rule about `npm run goldens:regen`, applied to the
 * other kind of committed measurement: a regenerated baseline is a claim that
 * behaviour changed on purpose, and reviewers read the diff as one. So the
 * command demands a written rationale, stores it in the file, and records what
 * moved and by how much against the baseline it supersedes.
 *
 *     node packages/mc-harness/bin/regenerate-baseline.mjs \
 *       --scenario  ./packages/scenario/bin/scenario.mjs \
 *       --sweep     ./balance/sweeps/balance-gate.sweep.json \
 *       --baseline  ./balance/baselines/balance-gate-v1.baseline.json \
 *       --rationale "grimoire shelving landed; libraryDependence is live" \
 *       --note      "still a degenerate universe: see the file's other notes" \
 *       --workers   4
 *
 * `--tolerance-k` changes every tolerance in the file at once and needs the same
 * rationale, because widening a tolerance and regenerating a baseline are the
 * same act wearing different clothes.
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { regenerateCommand } from '../dist/index.js';

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

  process.exitCode = await regenerateCommand(
    {
      sweepPath: args.sweep,
      baselinePath: args.baseline,
      outputDirectory: args.out === undefined ? 'mc-results/regenerate' : args.out,
      workerCount: args.workers === undefined ? 4 : Number.parseInt(args.workers, 10),
      // Undefined rather than "" when the flag is absent, so the command's own
      // refusal is what reports it rather than a blank string sneaking through.
      rationale: args.rationale,
      ...(args.note === undefined ? {} : { notes: args.note }),
      toleranceK:
        args['tolerance-k'] === undefined ? 3 : Number.parseFloat(args['tolerance-k']),
    },
    scenario,
    sink,
  );
} catch (error) {
  sink.err(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
