#!/usr/bin/env node
/*
 * Multiverse Mages — W107: does applying magic make the economy cells worth permitting?
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
 * The falsifying measurement for `apply-magic`, taken the way W90 took its own.
 *
 * **The claim under test** is the one `docs/design/campaign-plan.md` §W90
 * recorded as null: *"a resource-yield-maximising ruleset must beat one that
 * ignores the economy, on population or materials."* It measured **+91.4 ±
 * 135.1, 0.68 SE** on `main` and explained why — population is set by land
 * carrying capacity and `subsistenceShortfallShare` is already saturated, so
 * food barely moves the headcount.
 *
 * This is `tools/w77/displacement-arms.mjs` with the displacement 2×2 removed
 * (that content axis is another branch's) and the applied-work series added, so
 * the *same* three rulesets are compared on the *same* seeds:
 *
 * - `yield-max` permits *Intellego* and *Rego* over *Terram* only — the cells in
 *   the v1 subset that carry `resource-yield` and `build-rate` effects.
 * - `breadth` permits the whole v1 rectangle, which is what the reference
 *   universe ships with.
 * - `no-terram` permits the v1 rectangle *without* the form carrying every
 *   economic effect in it: the ruleset that ignores the economy.
 *
 * Two arms W90 did not have, and they are the ones that can move a headcount.
 * **The v1 rectangle cannot make food.** Of the 59 authored `resource-yield`
 * effects at `target: "universe"`, exactly five are in a v1 cell — three
 * *Intellego Terram*, two *Rego Terram* — and all five route to **stone**,
 * because `terram` is the only material-bearing form in the twelve. Population
 * is set by food; so is `subsistenceShortfallShare`. Every ruleset W90 compared
 * was arguing about stone.
 *
 * `permits()` reads the axis bitmask and not the `v1` flag, and the whole grid
 * is authored, so a ruleset may permit a cell outside the twelve and a run will
 * play it. That is what these two do:
 *
 * - `food-max` permits *Creo/Intellego/Rego* over *Aquam/Herbam/Animal* — the
 *   eleven `resource-yield` nodes that route to food.
 * - `no-food` permits the same three techniques over *Mentem/Limen/Nomen*: the
 *   same breadth of magic, none of it edible. This is the honest control for
 *   `food-max`, because it holds the technique axis fixed.
 *
 * Common random numbers throughout: seed *s* is the same universe in every arm.
 *
 *     node tools/w107/apply-arms.mjs [ticks] [seeds]
 */

import { step, rngFromRootSeed } from '@mm/sim-core';
import { componentOf, findUniverse, UNIVERSE } from '@mm/state';
import { defineWorldSimulation } from '@mm/coordination';
import { buildReferenceState, referenceContent, LONG_RUN_OPTIONS, LONG_RUN_SEED } from '@mm/scenario';

const TICKS = Number.parseInt(process.argv[2] ?? '2400', 10);
const SEEDS = Number.parseInt(process.argv[3] ?? '1', 10);

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
  let vellum = 0;
  let applied = 0;
  let appliedMages = 0;
  let peak = 0;
  let completed = 0;
  let shortfall = 0;
  let ticks = 0;
  let last;
  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report = simulation.lastReport();
    if (report === undefined) continue;
    ticks += 1;
    food += report.producedByKind.food;
    stone += report.producedByKind.stone;
    vellum += report.producedByKind.vellum;
    // Absent on a build without the goal, which is the point of reading it with
    // `?? 0` rather than asserting it: the before/after arms run the same tool.
    applied += report.materialsApplied ?? 0;
    appliedMages += report.magesApplying ?? 0;
    completed += report.universitiesCompleted;
    shortfall += report.subsistenceShortfallShare;
    if (report.population > peak) peak = report.population;
    last = report;
  }
  return {
    population: last?.population ?? 0,
    peak,
    food,
    stone,
    vellum,
    applied,
    completed,
    mages: last?.livingMages ?? 0,
    appliedMages: Math.round(appliedMages / Math.max(1, ticks)),
    shortfall: Math.round(shortfall / Math.max(1, ticks)),
    finalShortfall: last?.subsistenceShortfallShare ?? 0,
  };
}

const content = referenceContent();

const rulesets = {
  'yield-max': ['intellego', 'rego'],
  breadth: ['intellego', 'perdo', 'rego'],
  'no-terram': ['intellego', 'perdo', 'rego'],
  'food-max': ['creo', 'intellego', 'rego'],
  'no-food': ['creo', 'intellego', 'rego'],
};
const forms = {
  'yield-max': ['terram'],
  breadth: ['limen', 'mentem', 'nomen', 'terram'],
  'no-terram': ['limen', 'mentem', 'nomen'],
  'food-max': ['animal', 'aquam', 'herbam'],
  'no-food': ['limen', 'mentem', 'nomen'],
};

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The standard error of a mean. `NaN` below two samples, which is honest. */
function se(xs) {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

function arm(axes) {
  const runs = [];
  for (let i = 0; i < SEEDS; i += 1) runs.push(run(content, axes, LONG_RUN_SEED + i));
  const summary = { runs };
  for (const field of Object.keys(runs[0])) summary[field] = Math.round(mean(runs.map((r) => r[field])));
  return summary;
}

const pad = (v, w = 14) => String(v).padStart(w);
console.log(`W107 — apply-magic arms, ${TICKS} ticks, ${SEEDS} seed(s) from ${LONG_RUN_SEED}\n`);
console.log(
  `${'ruleset'.padEnd(11)}${pad('population')}${pad('peak pop')}${pad('food made')}${pad('stone made')}${pad('applied')}${pad('applying')}${pad('built')}${pad('mages')}${pad('subs.short fp')}`,
);
console.log('-'.repeat(137));

const table = {};
for (const rulesetName of Object.keys(rulesets)) {
  const axes = axesFor(content.registry, rulesets[rulesetName], forms[rulesetName]);
  const r = arm(axes);
  table[rulesetName] = r;
  console.log(
    `${rulesetName.padEnd(11)}${pad(r.population)}${pad(r.peak)}${pad(r.food)}${pad(r.stone)}${pad(r.applied)}${pad(r.appliedMages)}${pad(r.completed)}${pad(r.mages)}${pad(`${r.shortfall} (${r.finalShortfall})`)}`,
  );
}

function paired(left, right, field) {
  const deltas = left.runs.map((run, i) => run[field] - right.runs[i][field]);
  return { mean: mean(deltas), se: se(deltas), n: deltas.length };
}

function report(title, note, left, right, fields) {
  console.log(`\n## ${title}`);
  console.log(`   ${note}\n`);
  for (const field of fields) {
    const d = paired(table[left], table[right], field);
    const base = mean(table[right].runs.map((r) => r[field]));
    const ratio = Number.isFinite(d.se) && d.se > 0 ? d.mean / d.se : Number.NaN;
    const percent = base === 0 ? Number.NaN : (100 * d.mean) / base;
    console.log(
      `  ${field.padEnd(11)} ${fmt(d.mean)} ± ${fmt(d.se)}  (n = ${d.n}, ${fmt(ratio, 2)} SE, ` +
        `${fmt(percent, 2)}% of ${Math.round(base)})`,
    );
  }
}

report(
  'Does the yield-maximising ruleset dominate?',
  'Paired over seeds: (yield-max − breadth), same universe both sides.',
  'yield-max',
  'breadth',
  ['population', 'peak', 'food', 'stone'],
);

report(
  'Is permitting the economy cells worth it at all?',
  'Paired over seeds: (breadth − no-terram), same universe both sides.',
  'breadth',
  'no-terram',
  ['population', 'peak', 'food', 'stone'],
);

report(
  'Yield-maximising against a ruleset that ignores the economy',
  'Paired over seeds: (yield-max − no-terram), same universe both sides.',
  'yield-max',
  'no-terram',
  ['population', 'peak', 'food', 'stone'],
);

report(
  'A ruleset that can actually make food, against one that cannot',
  'Paired over seeds: (food-max − no-food), same three techniques both sides.',
  'food-max',
  'no-food',
  ['population', 'peak', 'food', 'stone', 'vellum', 'applied'],
);
