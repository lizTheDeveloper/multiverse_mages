#!/usr/bin/env node
/*
 * Multiverse Mages — two universes that differ only in which forms they permit.
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
 * The measurement W29 exists to make.
 *
 * An external review asked *"why do the god's verbs produce no marginal value
 * over autonomous mage behaviour?"*, and the campaign's own log recorded the
 * consequence: five strategies submitting different actions produced **the same
 * universe**, to the node. If permitting a form cannot change what a universe
 * has at the end of a run, then no ruleset is worth choosing and the god is
 * decoration.
 *
 * So this runs the same seed, the same species, the same founding position and
 * the same content twice, varying **one** thing: which forms are permitted.
 *
 * - **The quarry** permits Terram, Ignem and Auram — the three forms
 *   `sound-design.md` §4.2 makes `stone` out of. It should build and starve.
 * - **The granary** permits Herbam, Aquam and Animal — the forms `food` and
 *   `vellum` are made of. It should eat, write, and be unable to raise a wall.
 *
 * Both keep every technique, so the difference is not "one universe knows more
 * magic". It is the same amount of magic pointed at different materials.
 *
 * Usage: node tools/w29/two-universes.mjs [ticks]
 */

import { step, rngFromRootSeed } from '@mm/sim-core';
import {
  attachRecord,
  componentOf,
  MATERIAL_STOCK,
  UNIVERSE,
  UNIVERSITY,
  findUniverse,
} from '@mm/state';
import { defineWorldSimulation } from '@mm/coordination';
import { buildReferenceState, referenceContent, LONG_RUN_OPTIONS, LONG_RUN_SEED } from '@mm/scenario';

const TICKS = Number.parseInt(process.argv[2] ?? '600', 10);

const content = referenceContent();
const formBit = new Map(content.registry.forms.map((f) => [f.record.id, f.record.bit]));
const maskOf = (ids) => ids.reduce((mask, id) => mask | (1 << formBit.get(id)), 0);

/**
 * The two rulesets, and why they are masks over forms rather than over cells.
 *
 * Vision §4: *"Nineteen primary switches — five techniques and fourteen forms —
 * each independently permitted or forbidden."* Permitting a form is one of the
 * god's cheapest and broadest verbs, so it is the verb whose marginal value the
 * review was asking about. An edict would have been a finer instrument and a
 * less honest one: a single-cell exception could be tuned until it mattered.
 */
const ARMS = [
  { id: 'quarry', forms: ['terram', 'ignem', 'auram'] },
  { id: 'granary', forms: ['herbam', 'aquam', 'animal'] },
  // The before. Same ruleset as the granary, with the knowledge-to-economy wire
  // pulled out — which is exactly the shipped behaviour before this change:
  // `resourceYieldBonuses: []` as a literal, and no caller for `build-rate` at
  // all. Everything else is identical, so the difference between this arm and
  // the granary is the whole of what W29 added.
  { id: 'inert', forms: ['herbam', 'aquam', 'animal'], inert: true },
];

function runArm(arm) {
  const deps = arm.inert === true ? { ...content.deps, universeEffects: undefined } : content.deps;
  const simulation = defineWorldSimulation(deps);
  let state = buildReferenceState({
    runSeed: LONG_RUN_SEED,
    options: LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });

  // The one difference. Written after the founding state is built, so every
  // other thing about the two runs — cohorts, mages, the founding grant, the
  // entity handles they landed on — is identical by construction.
  const universe = findUniverse(state);
  componentOf(state, UNIVERSE).set(universe, 'permittedForms', maskOf(arm.forms));

  // A second university, unfinished, in both arms.
  //
  // The reference universe seeds exactly one academy and seeds it *complete*, on
  // the argument that a half-built one would teach nobody for years and every
  // knowledge measurement would be measuring the opening delay. That is still
  // right, and it means a passive run has nothing to build — so `build-rate`
  // would go unexercised in this probe for a reason that has nothing to do with
  // whether it works.
  //
  // Seeding a site here is therefore an *instrument*: it is what the god's
  // `fundUniversity` verb produces, placed by hand so the probe does not also
  // have to model a god. Both arms get the same one, at the same handle, on the
  // same tick.
  const site = state.entities.create();
  attachRecord(state, UNIVERSITY, site, { libraryId: 0, capacity: 40, buildProgress: 0 });

  const totals = {
    food: 0,
    stone: 0,
    vellum: 0,
    buildProgress: 0,
    completed: 0,
    economicNodes: 0,
    buildRateSources: 0,
    stoneOwed: 0,
    stonePaid: 0,
  };
  let shortTicks = { food: 0, stone: 0, vellum: 0 };
  let last;
  // The `build-rate` headline. Progress itself is capped at completion, so it is
  // the same 1024 in every arm however fast it got there — a metric that cannot
  // move is not a measurement. How many months the crew took, and how much stone
  // it burned doing it, are what the multiplier actually changes.
  let ticksToComplete;

  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report = simulation.lastReport();
    if (report === undefined) continue;
    totals.food += report.producedByKind.food;
    totals.stone += report.producedByKind.stone;
    totals.vellum += report.producedByKind.vellum;
    totals.buildProgress += report.buildProgressAdded;
    totals.completed += report.universitiesCompleted;
    if (ticksToComplete === undefined && report.universitiesCompleted > 0) {
      ticksToComplete = tick + 1;
    }
    totals.economicNodes += report.economicNodes;
    totals.buildRateSources += report.buildRateSources;
    totals.stoneOwed += report.constructionStoneOwed;
    totals.stonePaid += report.constructionStonePaid;
    for (const kind of ['food', 'stone', 'vellum']) {
      if (report.shortKinds[kind]) shortTicks[kind] += 1;
    }
    last = report;
  }

  const stocks = componentOf(state, MATERIAL_STOCK);
  return {
    id: arm.id,
    totals,
    shortTicks,
    finalStock: stocks.has(universe)
      ? {
          food: stocks.get(universe, 'food'),
          stone: stocks.get(universe, 'stone'),
          vellum: stocks.get(universe, 'vellum'),
        }
      : { food: 0, stone: 0, vellum: 0 },
    population: last?.population ?? 0,
    carryingCapacity: last?.carryingCapacity ?? 0,
    grimoires: last?.grimoiresScribed ?? 0,
    economicNodesFinal: last?.economicNodes ?? 0,
    buildRateFinal: last?.buildRateSources ?? 0,
    ticksToComplete: ticksToComplete ?? -1,
  };
}

const results = ARMS.map(runArm);
const pad = (v, w = 12) => String(v).padStart(w);

console.log(`W29 — two universes, ${TICKS} ticks, seed ${LONG_RUN_SEED}`);
console.log('Identical in every respect but the permitted forms.\n');
console.log(`${'metric'.padEnd(28)}${ARMS.map((a) => pad(a.id)).join('')}`);
console.log('-'.repeat(28 + 12 * ARMS.length));
const row = (label, pick) =>
  console.log(`${label.padEnd(28)}${results.map((r) => pad(pick(r))).join('')}`);

row('food produced (fp)', (r) => r.totals.food);
row('stone produced (fp)', (r) => r.totals.stone);
row('vellum produced (fp)', (r) => r.totals.vellum);
row('build progress (fp)', (r) => r.totals.buildProgress);
row('universities completed', (r) => r.totals.completed);
row('ticks to finish the site', (r) => (r.ticksToComplete < 0 ? 'never' : r.ticksToComplete));
row('stone owed by building', (r) => r.totals.stoneOwed);
row('stone paid to building', (r) => r.totals.stonePaid);
row('contributions/tick (final)', (r) => r.economicNodesFinal);
row('build-rate sources (final)', (r) => r.buildRateFinal);
row('ticks short of food', (r) => r.shortTicks.food);
row('ticks short of stone', (r) => r.shortTicks.stone);
row('ticks short of vellum', (r) => r.shortTicks.vellum);
row('final food stock', (r) => r.finalStock.food);
row('final stone stock', (r) => r.finalStock.stone);
row('final vellum stock', (r) => r.finalStock.vellum);
row('population', (r) => r.population);
row('carrying capacity', (r) => r.carryingCapacity);

const SERIES = [
  ['food', (r) => r.totals.food],
  ['stone', (r) => r.totals.stone],
  ['vellum', (r) => r.totals.vellum],
  // Not `buildProgress`: it is capped at completion and reads the same in every
  // arm. The months and the stone are what `build-rate` moves.
  ['stonePerBuilding', (r) => r.totals.stoneOwed],
  ['ticksToBuild', (r) => r.ticksToComplete],
];

const byId = new Map(results.map((r) => [r.id, r]));
const differing = SERIES.filter(
  ([, pick]) => pick(byId.get('quarry')) !== pick(byId.get('granary')),
);
const moved = SERIES.filter(([, pick]) => pick(byId.get('granary')) !== pick(byId.get('inert')));

console.log(
  `\nRULESET TEST — quarry vs granary: ${String(differing.length)} of 5 series differ: ` +
    `${differing.map(([id]) => id).join(', ') || '(none)'}`,
);
console.log(
  `INERTNESS TEST — granary vs inert: ${String(moved.length)} of 5 series moved: ` +
    `${moved.map(([id]) => id).join(', ') || '(none)'}`,
);
for (const [id, pick] of SERIES) {
  const before = pick(byId.get('inert'));
  const after = pick(byId.get('granary'));
  const delta = before === 0 ? (after === 0 ? '0' : 'from zero') : `${String(Math.round(((after - before) / before) * 1000) / 10)}%`;
  console.log(`  ${id.padEnd(16)}${pad(before)}${pad(after)}   ${delta}`);
}

if (differing.length === 0) {
  console.log(
    '\nNONE DIFFER. Two universes with different rulesets produced the same economy, which is the\n' +
      'exact finding this change was built to overturn. Do not report success.',
  );
  process.exitCode = 1;
}
