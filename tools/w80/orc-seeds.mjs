/*
 * Multiverse Mages — W80: is orc's roster a casualty of the price curve, or noise?
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
 * `loss-shock-recovery.test.ts` runs at **one** seed, `LONG_RUN_SEED`, and at
 * that seed orc's pre-shock roster went from three living mages to zero when
 * `node.json` was priced. Two readings fit a single reading of a single seed
 * and it cannot separate them: the price curve harms the species with
 * `depthCeiling` 3 and two exhaustible cells, or orc is marginal enough that any
 * perturbation re-rolls whether it is alive at tick 1200.
 *
 * This runs the same shocked long run at five seeds and prints the per-species
 * pre-shock roster, so the same file swap that produced the disagreement can be
 * read as a distribution instead of as a point.
 *
 *     node tools/w80/orc-seeds.mjs --tag priced
 *
 * The seeds are `LONG_RUN_SEED` and its four successors: pinned, legible, and
 * chosen before any of them was run.
 */

import { runLongReference, referenceContent } from '../../packages/scenario/dist/index.js';

const LONG_RUN_SEED = 0x0009_0001;
const SEEDS = [LONG_RUN_SEED, LONG_RUN_SEED + 1, LONG_RUN_SEED + 2, LONG_RUN_SEED + 3, LONG_RUN_SEED + 4];
const SHOCK_TICK = 1200;
const TICKS = 2400;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tag = args.tag ?? 'arm';
  const content = referenceContent();
  const speciesIds = content.registry.species.map((entry) => entry.record.id);

  process.stdout.write(`${tag}  contentRevision ${content.registry.contentRevision}\n`);
  process.stdout.write(`seed        ${speciesIds.map((id) => id.padStart(9)).join('')}   total\n`);

  const totals = speciesIds.map(() => 0);
  const zeroes = speciesIds.map(() => 0);
  for (const runSeed of SEEDS) {
    const run = await runLongReference({
      content,
      runSeed,
      ticks: TICKS,
      shock: { atTick: SHOCK_TICK, everyKth: 2 },
    });
    const pre = run.shock.preShockBySpecies;
    pre.forEach((count, index) => {
      totals[index] += count;
      if (count === 0) zeroes[index] += 1;
    });
    process.stdout.write(
      `${String(runSeed).padStart(10)}  ${pre.map((count) => String(count).padStart(9)).join('')}   ` +
        `${String(pre.reduce((a, b) => a + b, 0)).padStart(5)}\n`,
    );
  }
  process.stdout.write(
    `mean        ${totals.map((sum) => (sum / SEEDS.length).toFixed(1).padStart(9)).join('')}\n`,
  );
  process.stdout.write(
    `zero-seeds  ${zeroes.map((count) => `${String(count)}/${String(SEEDS.length)}`.padStart(9)).join('')}\n`,
  );
}

await main();
