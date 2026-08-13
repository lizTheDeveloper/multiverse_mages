#!/usr/bin/env node
/*
 * Multiverse Mages — what happens when a god founds more than it can build.
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
 * The adversarial probe for W29's construction phase.
 *
 * `planConstructionLabour` sizes the crew from the **backlog**:
 * `LABORERS_PER_BUILD_UNIT` is forty people per whole university, so N unfinished
 * sites summon 40N laborers. The reference universe has fewer than forty
 * laborers in total, and `mc-harness` records that the *archivist* strategy
 * "takes slot 0 every round, founding hundreds and completing none".
 *
 * So the question is not hypothetical: does over-founding divert the entire
 * workforce onto sites, and does the universe then starve? A famine caused by a
 * god who founded more than it could staff is a legitimate and even desirable
 * outcome. A workforce that stands idle at sites it cannot buy stone for, while
 * the fields go unworked, is not — that is waste with no decision behind it.
 *
 * Usage: node tools/w29/over-founding.mjs [sites] [ticks]
 */

import { step, rngFromRootSeed } from '@mm/sim-core';
import { attachRecord, componentOf, UNIVERSITY, findUniverse, MATERIAL_STOCK } from '@mm/state';
import { defineWorldSimulation } from '@mm/coordination';
import { buildReferenceState, referenceContent, LONG_RUN_OPTIONS, LONG_RUN_SEED } from '@mm/scenario';

const SITES = Number.parseInt(process.argv[2] ?? '100', 10);
const TICKS = Number.parseInt(process.argv[3] ?? '150', 10);

const content = referenceContent();

function run(sites) {
  const simulation = defineWorldSimulation(content.deps);
  let state = buildReferenceState({
    runSeed: LONG_RUN_SEED,
    options: LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });
  const universe = findUniverse(state);
  for (let i = 0; i < sites; i += 1) {
    const site = state.entities.create();
    attachRecord(state, UNIVERSITY, site, { libraryId: 0, capacity: 40, buildProgress: 0 });
  }

  let food = 0;
  let stalled = 0;
  let completed = 0;
  let last;
  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report = simulation.lastReport();
    if (report === undefined) continue;
    food += report.producedByKind.food;
    completed += report.universitiesCompleted;
    if (report.constructionStoneOwed < report.constructionStonePaid) stalled += 1;
    last = report;
  }
  const stocks = componentOf(state, MATERIAL_STOCK);
  return {
    sites,
    food,
    completed,
    stalled,
    population: last?.population ?? 0,
    subsistenceShort: last?.subsistenceShortfallShare ?? 0,
    finalFood: stocks.has(universe) ? stocks.get(universe, 'food') : 0,
  };
}

const pad = (v, w = 14) => String(v).padStart(w);
console.log(`W29 — over-founding, ${TICKS} ticks, seed ${LONG_RUN_SEED}\n`);
console.log(`${'sites founded'.padEnd(20)}${pad('food made')}${pad('finished')}${pad('population')}${pad('final food')}${pad('subs.short fp')}`);
console.log('-'.repeat(90));
for (const n of [0, 1, 5, 20, SITES]) {
  const r = run(n);
  console.log(
    `${String(n).padEnd(20)}${pad(r.food)}${pad(r.completed)}${pad(r.population)}${pad(r.finalFood)}${pad(r.subsistenceShort)}`,
  );
}
