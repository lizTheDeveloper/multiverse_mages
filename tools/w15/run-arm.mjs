/*
 * Multiverse Mages — W15: execute one arm of the dimensionality measurement.
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
 * ## Common random numbers, and the trap this file exists to avoid
 *
 * `deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex,
 * replicateIndex)`. The committed sweep's `assignment: "round-robin"` deals each
 * strategy a **disjoint** set of replicate indexes, so no two strategies in it
 * ever play the same universe; comparing arms taken from it would compare seeds.
 *
 * Here every arm walks the **identical** coordinate grid, and the factor under
 * test — the strategy, and later the founding species mask — is supplied
 * out-of-band. Two arms therefore differ in exactly the thing being varied.
 *
 * Two starting positions are used rather than one, and they are the committed
 * ascension sweep's corner cells, so that within-strategy variance carries both
 * seed noise and starting-position noise. Both arms see both.
 *
 * ## Usage
 *
 *     node tools/w15/run-arm.mjs --strategies passive-control,archivist \
 *       --replicates 6 --out .w15/arm-a --tag arm-a
 *
 * One JSON file per (strategy, mask), so that parallel processes never contend.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { POOL, content, runOne } from './composition.mjs';

/** The sweep id every arm shares. Part of the seed; holding it constant is the point. */
export const SWEEP_ID = 'w15-dimensionality-v1';

/** The root seed, matching the committed ascension sweep so the universes are familiar ones. */
export const ROOT_SEED = 20260811;

/**
 * The two starting positions, and their cell indexes in the committed ascension
 * sweep's canonical expansion (`cohortSize` × `foundingNodes`, levels [4,12] and
 * [1,4]): cell 0 is the sparse corner, cell 3 the rich one.
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
  const masks = (args.masks ?? '').split(',').filter(Boolean).map(Number);
  // W20's isolating arm: permit the whole 5x14 grid at founding and change
  // nothing else, so "more content" can be told apart from "better-shaped
  // content". Default 0 reproduces every arm recorded before it existed.
  const fullGrid = Number(args['full-grid'] ?? 0);
  const out = args.out ?? '.w15/out';
  const tag = args.tag ?? 'arm';

  const resolved = content();
  mkdirSync(out, { recursive: true });

  const maskLevels = masks.length > 0 ? masks : [undefined];

  for (const strategyId of strategies) {
    for (const mask of maskLevels) {
      const runs = [];
      const started = Date.now();
      for (const cell of CELLS) {
        for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
          const options = {
            ...cell.options,
            ...(mask === undefined ? {} : { foundingSpeciesMask: mask }),
            // `fullGridAtFounding` was W20's own one-bit knob and it is gone: the
            // opening square (#72/#156) says the same thing and more, so the full
            // grid is now "the largest square the content declares" rather than a
            // second notion of enablement. 5 × 14 is the whole 70-cell grid; `0`
            // still means the v1 rectangle, which is what `readCount` defaults to.
            ...(fullGrid === 0 ? {} : { openingTechniqueCount: 5, openingFormCount: 14 }),
          };
          const run = runOne({
            content: resolved,
            strategyId,
            coordinates: {
              rootSeed: ROOT_SEED,
              sweepId: SWEEP_ID,
              cellIndex: cell.cellIndex,
              replicateIndex,
            },
            options,
            worldTickCap,
          });
          runs.push(run);
          process.stderr.write(
            `${tag} ${strategyId} mask=${String(mask)} cell=${String(cell.cellIndex)} ` +
              `rep=${String(replicateIndex)} ticks=${String(run.ticksRun)} ` +
              `reason=${String(run.terminalReason)} nodes=${String(run.terminal.nodeIds.length)}\n`,
          );
        }
      }
      const name = `${tag}__${strategyId}${mask === undefined ? '' : `__mask${String(mask)}`}.json`;
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
            foundingSpeciesMask: mask ?? null,
            fullGridAtFounding: fullGrid,
            openingSquare: fullGrid === 0 ? 'v1-rectangle' : '5x14',
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
}

main();
