/*
 * Multiverse Mages — W61: how much of the grid each species actually occupies.
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
 * The current value of `speciesCellOccupancy`, over the two-hundred-world-year
 * reference run.
 *
 * The long horizon lives here rather than in the test suite: 2,400 ticks of
 * unbroken synchronous work in a vitest worker is exactly how this project
 * produces a `[vitest-worker]` timeout with no named failing test. The test
 * pins the twenty-year reading; this reports the whole curve, and the whole
 * curve is where the result is.
 *
 * **This is a reading, not a target.** All six species carry
 * `"tuningStatus": "untuned"`, and the metric was added so that the tuning is
 * measurable. Nothing here says what the spread ought to be, and no balance
 * gate reads it.
 *
 *     node scripts/w61-species-cell-occupancy.mjs
 *
 * Run `npm run typecheck` first — this loads `dist/`.
 */

import { defineWorldSimulation } from '../packages/coordination/dist/index.js';
import {
  MECHANICS_AT_0_5_0,
  collectSpeciesCellOccupancy,
} from '../packages/mc-harness/dist/index.js';
import { MagicGrid } from '../packages/rules-magic/dist/index.js';
import { rngFromRootSeed, step } from '../packages/sim-core/dist/index.js';
import { v1RulesetAxes } from '../packages/scenario/dist/content-set.js';
import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  LONG_RUN_TICKS,
  TICKS_PER_WORLD_YEAR,
} from '../packages/scenario/dist/long-run.js';
import {
  buildReferenceState,
  referenceContent,
} from '../packages/scenario/dist/reference-universe.js';
import { speciesCellOccupancy } from '../packages/scenario/dist/species-occupancy.js';

const content = referenceContent();
const grid = MagicGrid.from(content.registry);
const ruleset = { ...v1RulesetAxes(content.registry), edicts: [] };
const simulation = defineWorldSimulation(content.deps);

let state = buildReferenceState({
  runSeed: LONG_RUN_SEED,
  options: LONG_RUN_OPTIONS,
  content,
  schema: simulation.schema,
});

/** Founding, then every twenty world years to the long-run horizon. */
const HORIZONS = [0];
for (let tick = 20 * TICKS_PER_WORLD_YEAR; tick <= LONG_RUN_TICKS; tick += 20 * TICKS_PER_WORLD_YEAR) {
  HORIZONS.push(tick);
}

console.log('# W61 — realised species cell occupancy, reference universe\n');
console.log(
  `Seed ${LONG_RUN_SEED}, no actions submitted, ${LONG_RUN_TICKS} world ticks ` +
    `(${LONG_RUN_TICKS / TICKS_PER_WORLD_YEAR} world years).`,
);
console.log(
  'A cell is occupied when a **living** mage of the species holds a knowledge instance of some',
);
console.log('node in it, in a mind. Books do not count; dead mages do not count.\n');
console.log(
  'Every species is `tuningStatus: untuned`. This is a reading, not a target, and no gate reads it.\n',
);

const cellName = new Map(content.registry.cells.map((entry) => [entry.contentId, entry.record.id]));

/** A run telemetry carrying nothing but the occupancy sample under test. */
const telemetryFor = (sample) => ({
  coordinates: { rootSeed: LONG_RUN_SEED, sweepId: 'w61-occupancy', cellIndex: 0, replicateIndex: 0 },
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
});

const rows = [];
let tick = 0;
for (const horizon of HORIZONS) {
  while (tick < horizon) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    tick += 1;
  }
  const sample = speciesCellOccupancy(state, content.registry, grid, ruleset);
  rows.push({ sample, entry: collectSpeciesCellOccupancy(telemetryFor(sample)) });
}

const speciesIds = rows[0].sample.species.map((entry) => entry.speciesId);

console.log(
  `Grid ${rows[0].sample.gridCells} cells, of which the v1 ruleset permits ` +
    `${rows[0].sample.enabledCells}. **Occupancy can never exceed the enabled count**, which is ` +
    'the ceiling every row below is pressed against — `speciesGridVersatility` reports all six ' +
    'species *capable* of staffing 70/70, and that is a different question.\n',
);

console.log('## Occupied cells per species, by world year\n');
const header = ['world year', ...speciesIds, 'Gini'];
console.log(`| ${header.join(' | ')} |`);
console.log(`|${header.map(() => '---').join('|')}|`);
for (const { sample, entry } of rows) {
  const cells = sample.species.map((s) => String(s.occupiedCells));
  console.log(
    `| ${sample.worldTick / TICKS_PER_WORLD_YEAR} | ${cells.join(' | ')} | ` +
      `${entry.value === undefined ? 'n/a' : entry.value.toFixed(4)} |`,
  );
}

console.log('\n## Living mages per species, by world year\n');
console.log(`| ${header.slice(0, -1).join(' | ')} |`);
console.log(`|${header.slice(0, -1).map(() => '---').join('|')}|`);
for (const { sample } of rows) {
  const living = sample.species.map((s) => String(s.livingMages));
  console.log(`| ${sample.worldTick / TICKS_PER_WORLD_YEAR} | ${living.join(' | ')} |`);
}

console.log('\n## Which cells, at the horizons where the answer changes\n');
console.log('A count says a species is behind. The ids say *what* it is behind in, which is the');
console.log('difference between a slow species and one locked out of a technique.\n');
for (const { sample, entry } of rows) {
  const detail = entry.detail;
  console.log(
    `**World year ${sample.worldTick / TICKS_PER_WORLD_YEAR}** — cells any species holds: ` +
      `${detail.cellsOccupiedByAnySpecies}, of which ${detail.cellsWithASoleOccupant} have a ` +
      'sole occupant.\n',
  );
  for (const species of sample.species) {
    const cells = species.occupiedCellIds.map((id) => cellName.get(id)).join(' ');
    console.log(`- \`${species.speciesId}\` (${species.livingMages} alive): ${cells === '' ? '—' : cells}`);
  }
  console.log('');
}

const final = rows[rows.length - 1];
const extinct = final.sample.species.filter((s) => s.livingMages === 0).map((s) => s.speciesId);
console.log(
  `\nAt world year ${final.sample.worldTick / TICKS_PER_WORLD_YEAR}: Gini ` +
    `${final.entry.value.toFixed(4)}; ` +
    (extinct.length === 0
      ? 'every species still has living mages.'
      : `**${extinct.join(' and ')} ${extinct.length === 1 ? 'has' : 'have'} no living mages left**, ` +
        'so their occupancy is zero for want of a roster rather than for want of capability.'),
);
