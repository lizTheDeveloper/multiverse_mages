/*
 * Multiverse Mages — the occupation-trajectory probe.
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
 * Prints the occupation mix of the reference universe over time, beside the one
 * column that found W185: **how many people sit in cohorts too small to
 * transfer.**
 *
 * The defect this exists to keep visible is that a cohort is keyed on species ×
 * occupation × birth decade, so a populace of a few hundred is scattered across
 * dozens of cohorts of single digits. While the transfer budget was computed
 * per cohort and floored, that fragmentation meant the labour market moved
 * nobody at all — measured over 600 ticks, reallocation moved *zero* scribes in
 * either direction, and injecting scribe demand of 44 produced a byte-identical
 * run. The `frozen` column below is that measurement, taken directly rather
 * than inferred: people in cohorts smaller than `1 / TRANSFER_RATE_PER_TICK`.
 *
 * It is a probe and not a test. The assertions live in
 * `packages/rules-world/test/unit/populace-occupations.test.ts`; this is for
 * looking at a run and seeing the shape.
 *
 * Run after `npm run typecheck`, which emits the `dist/` this loads:
 *
 *     node scripts/w185-cohort-probe.mjs [ticks] [cohortSize]
 */

import { FP_ONE, floorDiv, rngFromRootSeed, step } from '@mm/sim-core';
import { defineWorldSimulation } from '@mm/coordination';
import { MAGE, POPULACE_COHORT, collectRecords } from '@mm/state';
import { TRANSFER_RATE_PER_TICK } from '@mm/rules-world';
import {
  LONG_RUN_OPTIONS,
  buildReferenceState,
  referenceContent,
} from '@mm/scenario';

const TICKS = Number(process.argv[2] ?? 600);
const COHORT_SIZE = Number(process.argv[3] ?? 4);
const SEEDS = [0x0009_0001, 20_260_811];
const NAMES = ['laborer', 'scribe', 'student', 'soldier', 'idle'];

/** The cohort size below which a share of the transfer pool rounds to nothing. */
const FROZEN_BELOW = (() => {
  let count = 1;
  while (count < 4096 && floorDiv(count * TRANSFER_RATE_PER_TICK, FP_ONE) === 0) count += 1;
  return count;
})();

function census(state) {
  const byOccupation = [0, 0, 0, 0, 0];
  let frozen = 0;
  for (const { row } of collectRecords(state, POPULACE_COHORT)) {
    if (row.count <= 0) continue;
    byOccupation[row.occupation] += row.count;
    if (row.count < FROZEN_BELOW) frozen += row.count;
  }
  const population = byOccupation.reduce((total, value) => total + value, 0);
  return { byOccupation, frozen, population, mages: collectRecords(state, MAGE).length };
}

const MARKS = new Set([0, 60, 120, 240, 360, 480, 600].filter((tick) => tick <= TICKS));
MARKS.add(TICKS);

console.log(
  `reference universe, cohortSize ${String(COHORT_SIZE)}, ` +
    `a cohort below ${String(FROZEN_BELOW)} members cannot fund a whole transfer\n`,
);

for (const seed of SEEDS) {
  const content = referenceContent();
  const simulation = defineWorldSimulation(content.deps);
  let state = buildReferenceState({
    runSeed: seed,
    options: { ...LONG_RUN_OPTIONS, cohortSize: COHORT_SIZE, foundingNodes: 4 },
    content,
    schema: simulation.schema,
  });

  console.log(`seed 0x${(seed >>> 0).toString(16)}`);
  console.log(
    'tick' + NAMES.map((name) => name.padStart(9)).join('') + '      pop    mages   frozen',
  );
  const show = (tick) => {
    const sample = census(state);
    console.log(
      String(tick).padStart(4) +
        sample.byOccupation.map((value) => String(value).padStart(9)).join('') +
        String(sample.population).padStart(9) +
        String(sample.mages).padStart(9) +
        String(sample.frozen).padStart(9),
    );
  };

  show(0);
  for (let tick = 1; tick <= TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    if (MARKS.has(tick)) show(tick);
  }
  console.log('');
}
