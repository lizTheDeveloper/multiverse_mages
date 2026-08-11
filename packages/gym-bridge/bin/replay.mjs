#!/usr/bin/env node
/*
 * Multiverse Mages — replaying a recorded episode, in a process that did not record it.
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
 * `docs/design/release-plan.md` §0.11.0's claim, made checkable by hand:
 *
 *     node packages/gym-bridge/bin/replay.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --record   ./episode.ndjson
 *
 * Exit `0` when the replayed snapshot hash equals the recorded one, `1` when it
 * does not, `2` when the record cannot be replayed at all — a refusal, which is
 * *not* the same verdict as a divergence and must not be reported as one.
 *
 * The unit suite proves the same property in-process. This exists because the
 * claim is about a *recorded* episode surviving a process boundary, and a test
 * that never leaves the process is not evidence about that.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

import { EnvVector, parseRecord, publishedContract, replayRecord } from '../dist/index.js';

const USAGE = `mm-gym-replay — replay a recorded episode and compare snapshot hashes.

  --scenario <module>   Module exporting createScenario() or scenario. Required.
  --record <file>       An NDJSON episode record. Required.
  --help                This text.

Exit 0: the hashes match. Exit 1: they diverge. Exit 2: the record was refused,
which is a different verdict and is reported as one.`;

function parseArgs(argv) {
  const known = new Set(['--scenario', '--record']);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!known.has(flag)) throw new Error(`Unknown option ${flag}. Run with --help.`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    args[flag.slice(2)] = value;
    index += 1;
  }
  return args;
}

async function loadScenario(specifier) {
  const module = await import(new URL(specifier, `file://${process.cwd()}/`).href);
  const built =
    typeof module.createScenario === 'function'
      ? module.createScenario()
      : (module.scenario ?? module.default?.scenario);
  if (built === undefined || typeof built.create !== 'function') {
    throw new Error(`${specifier} exports no scenario.`);
  }
  return { scenario: built, provenance: module.provenance };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (args.scenario === undefined || args.record === undefined) {
    process.stderr.write(`--scenario and --record are both required.\n\n${USAGE}\n`);
    return 2;
  }

  const { scenario, provenance } = await loadScenario(args.scenario);
  const record = parseRecord(readFileSync(args.record, 'utf8'));
  const build = publishedContract({
    scenarioId: scenario.scenarioId,
    contentHash: provenance?.contentHash ?? 'unknown',
    buildVersion: provenance?.buildVersion ?? 'unknown',
  });

  const result = replayRecord(record, new EnvVector({ scenario, envCount: 1 }), build);
  process.stdout.write(
    `${result.matched ? 'match' : 'DIVERGED'}  recorded=${result.recordedHash} ` +
      `replayed=${result.replayedHash} actions=${String(result.actionsReplayed)} ` +
      `status=${result.status}\n`,
  );
  if (!result.matched) {
    process.stderr.write(
      'The replayed episode did not reach the recorded snapshot hash. That is the measurement ' +
        'release-plan.md §0.11.0 names as disproving this release’s claim — before treating it as ' +
        'one, check that the record’s contentHash matches this build’s, since a retuned universe ' +
        'diverges legitimately and the header says which content it was made under.\n',
    );
  }
  return result.matched ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    // 2, not 1. A refused record is not a diverged replay, and a script that
    // treated the two the same would report a versioning problem as a
    // determinism failure.
    process.exitCode = 2;
  },
);
