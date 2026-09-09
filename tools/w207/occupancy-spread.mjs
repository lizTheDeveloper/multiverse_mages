/*
 * Multiverse Mages — the species occupancy spread of the v1 rectangle, across seeds.
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
 * # Why this exists beside `w192-opening-occupancy.mjs`
 *
 * That script compares *opening squares* to each other and hard-codes
 * `PINNED_V1_VALUE = 0.0473` as its positive control, so it refuses on any tree
 * where the shipped pin has moved. That refusal is correct and must not be
 * edited away: it is the only thing standing between the frontier table and an
 * instrument that has quietly stopped agreeing with the suite.
 *
 * This script asks a different question — **what is the distribution of the v1
 * rectangle's occupancy spread across seeds, on whatever tree it is run on** —
 * and so it takes its control from the command line instead of a constant.
 * `--control <value>` is the number `species-occupancy.test.ts` pins on *this*
 * ref; the script refuses to print a distribution unless the pinned seed
 * reproduces it. Run it on `origin/main` with `--control 0.0473` and it is the
 * shipped instrument's own calibration; run it on a branch with the branch's
 * measured pin and it proves the probe reads what the test reads.
 *
 * Exit codes are three, deliberately (`CLAUDE.md`, "a checker that answers about
 * the wrong input"):
 *
 * - `0` — the control reproduced and a distribution was printed.
 * - `2` — the control did not reproduce. The probe is broken *or* the tree has
 *   moved; either way nothing below it is readable, and this is not "the answer
 *   is no".
 * - `1` — bad arguments.
 *
 * ## The question it is here to answer
 *
 * The pinned 0.0473 has been read as an effect size twice — as a 54 % change in
 * W188, and as a point estimate in W205, which then showed it to be **one seed
 * from a distribution whose mean is 0.117** (`opening-square-width.md` §5, six
 * seeds, mean 0.1168 ± 0.0228 SE). A third confident reading of a single seed's
 * Gini would be this campaign's most repeated mistake. So this prints every
 * seed, the mean, the standard error and the between-seed sd, and says where
 * the pinned seed falls inside its own distribution.
 *
 * Usage:
 *
 *     node tools/w207/occupancy-spread.mjs --seeds 12 --control 0.0473
 *
 * Seeds follow `w192-opening-occupancy.mjs` exactly — `LONG_RUN_SEED + i*7919`,
 * with `i = 0` the pinned seed — so the two are directly comparable and the
 * committed six-seed table is a prefix of this one.
 */

import process from 'node:process';

import { collectSpeciesCellOccupancy, MECHANICS_AT_0_5_0 } from '../../packages/mc-harness/dist/index.js';
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';
import { MagicGrid } from '../../packages/rules-magic/dist/index.js';
import { rngFromRootSeed, step } from '../../packages/sim-core/dist/index.js';
import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  referenceContent,
  speciesCellOccupancy,
  TICKS_PER_WORLD_YEAR,
} from '../../packages/scenario/dist/index.js';

const HORIZON_TICKS = 20 * TICKS_PER_WORLD_YEAR;

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}

const seedCount = Number.parseInt(flag('seeds', '12'), 10);
const controlRaw = flag('control', undefined);
if (controlRaw === undefined || !Number.isFinite(Number(controlRaw))) {
  process.stderr.write('--control <value> is required: the value species-occupancy.test.ts pins on this ref.\n');
  process.exit(1);
}
const control = Number(controlRaw);

const content = referenceContent();
const grid = MagicGrid.from(content.registry);
const simulation = defineWorldSimulation(content.deps);

function telemetryFor(sample) {
  return {
    coordinates: { rootSeed: 1, sweepId: 'w207-occupancy', cellIndex: 0, replicateIndex: 0 },
    status: 'stagnated',
    ticksRun: sample.worldTick,
    mechanics: MECHANICS_AT_0_5_0,
    census: [],
    speciesIds: sample.species.map((entry) => entry.speciesId),
    tierFirstReached: [],
    checkpoints: [],
    raids: undefined,
    accounting: { submissions: 0, rejections: 0, byActionId: {} },
    speciesCellOccupancy: sample,
  };
}

function measure(runSeed) {
  let state = buildReferenceState({
    runSeed,
    options: LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });
  for (let index = 0; index < HORIZON_TICKS; index += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
  }
  const sample = speciesCellOccupancy(state, content.registry, grid, { ...content.axes, edicts: [] });
  const entry = collectSpeciesCellOccupancy(telemetryFor(sample));
  return { sample, entry };
}

const seeds = Array.from({ length: seedCount }, (_u, i) => (i === 0 ? LONG_RUN_SEED : LONG_RUN_SEED + i * 7919));

const pinned = measure(LONG_RUN_SEED);
if (pinned.entry.status !== 'measured' || Math.abs(pinned.entry.value - control) > 5e-5) {
  process.stderr.write(
    `CONTROL FAILED: the pinned seed measures ${String(pinned.entry.value)}, --control says ` +
      `${String(control)}. The probe and the suite disagree, so no distribution below it is ` +
      'readable. This is not "the answer is no".\n',
  );
  process.exit(2);
}
process.stderr.write(`control ok: the pinned seed reproduces ${String(control)}\n`);

const values = [];
for (const runSeed of seeds) {
  const { sample, entry } = runSeed === LONG_RUN_SEED ? pinned : measure(runSeed);
  const value = entry.status === 'measured' ? entry.value : null;
  values.push(value);
  const occ = sample.species.map((s) => `${s.speciesId}:${String(s.occupiedCells)}`).join(' ');
  process.stdout.write(
    `seed ${String(runSeed).padStart(10)}${runSeed === LONG_RUN_SEED ? ' *pinned*' : '        '} ` +
      `spread ${value === null ? 'n/a' : value.toFixed(4)}   ${occ}\n`,
  );
}

const measured = values.filter((v) => v !== null);
const n = measured.length;
const mean = measured.reduce((a, b) => a + b, 0) / n;
const sd = Math.sqrt(measured.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
const se = sd / Math.sqrt(n);
const sorted = [...measured].sort((a, b) => a - b);
const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
const rank = sorted.indexOf(pinned.entry.value) + 1;

process.stdout.write(
  `\nv1 3x4, ${String(n)} seeds, ${String(HORIZON_TICKS)} ticks: ` +
    `mean ${mean.toFixed(4)} +/- ${se.toFixed(4)} SE (sd ${sd.toFixed(4)}), ` +
    `median ${median.toFixed(4)}, range [${sorted[0].toFixed(4)}, ${sorted[n - 1].toFixed(4)}]\n`,
);
process.stdout.write(
  `the pinned seed reads ${pinned.entry.value.toFixed(4)} — rank ${String(rank)}/${String(n)}, ` +
    `${((pinned.entry.value - mean) / sd).toFixed(2)} sd from the mean of its own distribution\n`,
);
