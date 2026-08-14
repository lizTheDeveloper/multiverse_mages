/*
 * Multiverse Mages — W58: the committed, checkable form of the raw results.
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
 * The run files are several megabytes of node-id lists, and `.gitignore` already
 * excludes `.w15/` for the same reason: raw sample dumps are regenerable from
 * the tool and the seed, and a public repository is not a data lake.
 *
 * What is *not* regenerable in a hurry is the claim, so the two CSVs written
 * here are committed: one row per run for Test 1, one row per (arm, seed,
 * horizon) for Test 2. Both are small, both are diffable, and both let a reader
 * recompute every rate in the writeup without running anything.
 *
 *     node tools/w58/distil.mjs --test1 mc-results/w58/test1 --test2 mc-results/w58/test2 --out balance/w58
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseArgs } from './harness.mjs';

const TEST2_COLUMNS = [
  'permittedTechniques',
  'permittedForms',
  'edictBudget',
  'blessings',
  'favor',
  'worship',
  'worshipTier',
  'materials',
  'favorWasted',
  'populace',
  'magesAlive',
  'magesTotal',
  'universities',
  'libraries',
  'grimoires',
  'nodesKnown',
  'instances',
  'masteryTotal',
  'everKnownCount',
  'goalTargetCount',
  'effortTargetCount',
  'effortProgressTotal',
  'ascensionPath',
  'ascensionFirstMetTick',
  'stasisTicks',
  'lowWorshipTicks',
  'deepestTier',
  'goodEraRun',
];

function readAll(dir, prefix) {
  return readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = args.out ?? 'balance/w58';
  mkdirSync(out, { recursive: true });

  if (args.test1 !== undefined) {
    const rows = ['strategyId,cellIndex,cellLabel,replicateIndex,runSeed,status,terminalReason,ticksRun,nodesKnown,instances,grimoires,populace,magesAlive,favor,worship,submissions,rejections,snapshotHash'];
    for (const file of readAll(args.test1, 'test1__')) {
      for (const run of file.runs) {
        rows.push(
          [
            run.strategyId,
            run.cellIndex,
            run.cellLabel,
            run.replicateIndex,
            run.runSeed,
            run.status,
            run.terminalReason,
            run.ticksRun,
            run.terminal?.nodesKnown ?? '',
            run.terminal?.instances ?? '',
            run.terminal?.grimoires ?? '',
            run.terminal?.populace ?? '',
            run.terminal?.magesAlive ?? '',
            run.terminal?.favor ?? '',
            run.terminal?.worship ?? '',
            run.submissions,
            run.rejections,
            run.snapshotHash,
          ].join(','),
        );
      }
    }
    const path = join(out, 'w58-test1-runs.csv');
    writeFileSync(path, `${rows.join('\n')}\n`);
    process.stderr.write(`wrote ${path} (${String(rows.length - 1)} runs)\n`);
  }

  if (args.test2 !== undefined) {
    const rows = [`strategyId,cellIndex,replicateIndex,runSeed,worldTick,${TEST2_COLUMNS.join(',')}`];
    for (const file of readAll(args.test2, 'test2__')) {
      for (const run of file.runs) {
        for (const sample of run.samples) {
          rows.push(
            [run.strategyId, run.cellIndex, run.replicateIndex, run.runSeed, sample.worldTick]
              .concat(TEST2_COLUMNS.map((column) => sample[column] ?? ''))
              .join(','),
          );
        }
        rows.push(
          [run.strategyId, run.cellIndex, run.replicateIndex, run.runSeed, `terminal:${String(run.ticksRun)}`]
            .concat(TEST2_COLUMNS.map((column) => run.terminal?.[column] ?? ''))
            .join(','),
        );
      }
    }
    const path = join(out, 'w58-test2-trajectories.csv');
    writeFileSync(path, `${rows.join('\n')}\n`);
    process.stderr.write(`wrote ${path} (${String(rows.length - 1)} samples)\n`);
  }
}

main();
