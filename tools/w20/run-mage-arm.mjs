/*
 * Multiverse Mages — W20: execute one arm of the per-mage composition measurement.
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
 * ## Common random numbers, restated from `w15/run-arm.mjs`
 *
 * `deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex,
 * replicateIndex)`. This file mints its **own** `SWEEP_ID`, distinct from
 * w15's, so the two tools' seeds never collide even though both walk the same
 * two starting positions — `w15-dimensionality-v1` and `w20-mage-composition-v1`
 * name two different sweeps at the same coordinates, not the same sweep twice.
 *
 * ## Usage
 *
 *     node tools/w20/run-mage-arm.mjs --strategies passive-control,archivist \
 *       --replicates 6 --out .w20/arm-a --tag arm-a
 *
 *     node tools/w20/run-mage-arm.mjs --strategies passive-control \
 *       --replicates 1 --ticks 480 --out .w20/smoke --tag smoke
 *
 * One JSON file per strategy, so that parallel processes never contend.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { POOL, content, runOne } from './mage-composition.mjs';

/** The sweep id every arm shares. Part of the seed; holding it constant is the point. */
export const SWEEP_ID = 'w20-mage-composition-v1';

/** The root seed, matching `w15/run-arm.mjs` so the universes are the same familiar ones. */
export const ROOT_SEED = 20260811;

/**
 * The same two starting positions `w15/run-arm.mjs` uses: cell 0 the sparse
 * corner, cell 3 the rich one, from the committed ascension sweep's canonical
 * expansion.
 */
export const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const strategies = (args.strategies ?? POOL.join(',')).split(',').filter(Boolean);
  const replicates = Number(args.replicates ?? 6);
  const worldTickCap = Number(args.ticks ?? 2400);
  const out = args.out ?? '.w20/out';
  const tag = args.tag ?? 'arm';

  const resolved = content();
  mkdirSync(out, { recursive: true });

  for (const strategyId of strategies) {
    const runs = [];
    const started = Date.now();
    for (const cell of CELLS) {
      for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
        const run = runOne({
          content: resolved,
          strategyId,
          coordinates: {
            rootSeed: ROOT_SEED,
            sweepId: SWEEP_ID,
            cellIndex: cell.cellIndex,
            replicateIndex,
          },
          options: { ...cell.options },
          worldTickCap,
        });
        runs.push(run);
        const living = run.terminal.mages.length;
        process.stderr.write(
          `${tag} ${strategyId} cell=${String(cell.cellIndex)} rep=${String(replicateIndex)} ` +
            `ticks=${String(run.ticksRun)} reason=${String(run.terminalReason)} ` +
            `livingMages=${String(living)}\n`,
        );
      }
    }
    const name = `${tag}__${strategyId}.json`;
    const path = join(out, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          tag,
          sweepId: SWEEP_ID,
          rootSeed: ROOT_SEED,
          strategyId,
          worldTickCap,
          replicates,
          cells: CELLS,
          wallClockMs: Date.now() - started,
          runs,
        },
        null,
        1,
      )}\n`,
    );
    process.stderr.write(`${tag} wrote ${path}\n`);
  }
}

main();
