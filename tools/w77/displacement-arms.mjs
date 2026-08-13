#!/usr/bin/env node
/*
 * Multiverse Mages — W77: does displacement stop yield-maximising from winning?
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
 * The falsifying measurement for the displacement change, run as a 2x2.
 *
 * **The claim.** Before this change every economy effect in the shipped content
 * is a pure bonus, so the ruleset that permits the economy cells dominates the
 * one that does not, on population, unconditionally. Authoring a displacement
 * cost on the *Rego Terram* effects should take that domination away — the
 * spells that quarry and build without hands empty the fields of the people who
 * used to do it, and those people still eat.
 *
 * **The design.** Two rulesets crossed with two content sets, four arms, one
 * seed each, common random numbers throughout:
 *
 * - `yield-max` permits *Intellego* and *Rego* over *Terram* only: the two
 *   cells in the v1 subset that carry any `resource-yield` or `build-rate`
 *   effect at all. This is what "a resource-yield-maximising strategy" can mean
 *   in a game whose god acts by permitting axes.
 * - `breadth` permits the whole v1 rectangle, which is what the reference
 *   universe ships with.
 * - `authored` is the shipped content. `stripped` is the same registry with
 *   every `displacement` deleted — the world exactly as it was before this
 *   change, on this build, so that the comparison is not across two binaries.
 *
 * `collectRunMetrics` has no production caller on `main`, so the numbers come
 * from the world loop's own per-tick report rather than from a sweep record.
 *
 *     node tools/w77/displacement-arms.mjs [ticks]
 */

import { readFileSync, readdirSync } from 'node:fs';

import { step, rngFromRootSeed } from '@mm/sim-core';
import { componentOf, findUniverse, UNIVERSE } from '@mm/state';
import { loadContent, memorySource } from '@mm/content';
import { defineWorldSimulation } from '@mm/coordination';
import { buildReferenceState, referenceContent, LONG_RUN_OPTIONS, LONG_RUN_SEED } from '@mm/scenario';

const TICKS = Number.parseInt(process.argv[2] ?? '2400', 10);
const SEEDS = Number.parseInt(process.argv[3] ?? '1', 10);
const DATA = new URL('../../packages/content/data/', import.meta.url);

/** The shipped data files, as text, so one arm can edit them before loading. */
function shippedFiles() {
  const files = {};
  for (const name of readdirSync(DATA)) {
    if (name.endsWith('.json')) files[name] = readFileSync(new URL(name, DATA), 'utf8');
  }
  return files;
}

/** The registry with every authored `displacement` removed. */
function strippedRegistry() {
  const files = shippedFiles();
  const nodes = JSON.parse(files['node.json']);
  let removed = 0;
  for (const node of nodes) {
    for (const effect of node.effects) {
      if (effect.displacement !== undefined) {
        delete effect.displacement;
        removed += 1;
      }
    }
  }
  files['node.json'] = JSON.stringify(nodes);
  return { registry: loadContent(memorySource(files, 'w77-stripped')), removed };
}

/** The axis masks a ruleset arm permits. */
function axesFor(registry, techniques, forms) {
  const bit = (entries, id) => {
    const found = entries.find((entry) => entry.record.id === id);
    if (found === undefined) throw new Error(`no such axis ${id}`);
    return 1 << found.record.bit;
  };
  return {
    permittedTechniques: techniques.reduce((mask, id) => mask | bit(registry.techniques, id), 0),
    permittedForms: forms.reduce((mask, id) => mask | bit(registry.forms, id), 0),
  };
}

function run(content, axes, runSeed) {
  const simulation = defineWorldSimulation(content.deps);
  let state = buildReferenceState({
    runSeed,
    options: LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });
  const universes = componentOf(state, UNIVERSE);
  const universe = findUniverse(state);
  universes.set(universe, 'permittedTechniques', axes.permittedTechniques);
  universes.set(universe, 'permittedForms', axes.permittedForms);

  let food = 0;
  let stone = 0;
  let peak = 0;
  let completed = 0;
  let shortfall = 0;
  let displaced = 0;
  let ticks = 0;
  let last;
  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report = simulation.lastReport();
    if (report === undefined) continue;
    ticks += 1;
    food += report.producedByKind.food;
    stone += report.producedByKind.stone;
    completed += report.universitiesCompleted;
    shortfall += report.subsistenceShortfallShare;
    displaced += report.displacedLaborShare;
    if (report.population > peak) peak = report.population;
    last = report;
  }
  return {
    population: last?.population ?? 0,
    peak,
    food,
    stone,
    completed,
    mages: last?.livingMages ?? 0,
    // Means over the run, in fp. The two that say whether the mechanism fired
    // and whether anything downstream could still feel it.
    displaced: Math.round(displaced / Math.max(1, ticks)),
    shortfall: Math.round(shortfall / Math.max(1, ticks)),
    finalDisplaced: last?.displacedLaborShare ?? 0,
    finalShortfall: last?.subsistenceShortfallShare ?? 0,
  };
}

const stripped = strippedRegistry();
const contents = {
  authored: referenceContent(),
  stripped: referenceContent(stripped.registry),
};
const rulesets = {
  'yield-max': ['intellego', 'rego'],
  breadth: ['intellego', 'perdo', 'rego'],
};
const forms = {
  'yield-max': ['terram'],
  breadth: ['limen', 'mentem', 'nomen', 'terram'],
};

/** The mean of one field across the seeds, rounded — every field is a count. */
function meanOf(runs, field) {
  return Math.round(runs.reduce((sum, r) => sum + r[field], 0) / runs.length);
}

/**
 * Runs every seed for one arm and averages.
 *
 * Common random numbers: seed `s` is the same universe in all four arms, so a
 * between-arm difference is the arm and not the draw. Seeds are consecutive
 * from `LONG_RUN_SEED` rather than chosen, because a chosen seed is a chosen
 * result.
 */
function arm(content, axes) {
  const runs = [];
  for (let i = 0; i < SEEDS; i += 1) runs.push(run(content, axes, LONG_RUN_SEED + i));
  const out = {};
  for (const field of Object.keys(runs[0])) out[field] = meanOf(runs, field);
  return out;
}

const pad = (v, w = 13) => String(v).padStart(w);
console.log(`W77 — displacement arms, ${TICKS} ticks, ${SEEDS} seed(s) from ${LONG_RUN_SEED}`);
console.log(`stripped registry removed ${stripped.removed} authored displacements\n`);
console.log(
  `${'content'.padEnd(11)}${'ruleset'.padEnd(11)}${pad('population')}${pad('peak pop')}${pad('food made')}${pad('stone made')}${pad('built')}${pad('mages')}${pad('displaced fp')}${pad('subs.short fp')}`,
);
console.log('-'.repeat(126));

const table = {};
for (const [contentName, content] of Object.entries(contents)) {
  for (const rulesetName of Object.keys(rulesets)) {
    const axes = axesFor(content.registry, rulesets[rulesetName], forms[rulesetName]);
    const r = arm(content, axes);
    table[`${contentName}/${rulesetName}`] = r;
    console.log(
      `${contentName.padEnd(11)}${rulesetName.padEnd(11)}${pad(r.population)}${pad(r.peak)}${pad(r.food)}${pad(r.stone)}${pad(r.completed)}${pad(r.mages)}${pad(`${r.displaced} (${r.finalDisplaced})`)}${pad(`${r.shortfall} (${r.finalShortfall})`)}`,
    );
  }
}

console.log('\nyield-max minus breadth, on population — the domination this change is aimed at:');
for (const contentName of Object.keys(contents)) {
  const y = table[`${contentName}/yield-max`];
  const b = table[`${contentName}/breadth`];
  const delta = y.population - b.population;
  const peak = y.peak - b.peak;
  console.log(
    `  ${contentName.padEnd(10)} final ${delta > 0 ? '+' : ''}${delta} (${y.population} vs ${b.population}), ` +
      `peak ${peak > 0 ? '+' : ''}${peak} (${y.peak} vs ${b.peak})`,
  );
}
