#!/usr/bin/env node
/*
 * Multiverse Mages — two universes, one seed, two forms: does the god's choice
 * of Animal over Herbam change what the economy makes?
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
 * ## The whole-run arm of the pre-registered null
 *
 * One universe permitting only Creo/Rego **Animal**, one permitting only
 * Creo/Rego **Herbam**, same seed, same founding options, same everything else.
 * Reports the `food` and `vellum` trajectories — closing stock and cumulative
 * production — for both.
 *
 * ## This measurement is not by itself attributable, and says so
 *
 * The two cell pairs are **not authored alike**. They hold different nodes at
 * different tiers carrying different magnitudes, so a separation here can come
 * from the content as easily as from the yield table. `--out` therefore also
 * carries `cellContent`: the node count and the summed authored
 * `resource-yield` magnitude of each arm's two cells, measured from the same
 * registry the run uses. A reader comparing two runs must read that block
 * first.
 *
 * The **attributable** measurement is `tools/w-yields/form-routing.mjs`, which
 * hands one identical magnitude to both forms and so differs in nothing but the
 * routing. This probe answers the different question of whether the routing
 * survives contact with a universe.
 *
 * Usage: node tools/w-yields/two-arm.mjs --out <path> [--ticks 400] [--seed N]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { createSession } from '@mm/agent-api';
import {
  AUDIT_RUN_SEED,
  explicitOpeningAxes,
  foundingCandidates,
  referenceContent,
  referenceScenario,
  shippedContent,
} from '@mm/scenario';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const out = flag('out', undefined);
if (out === undefined) {
  console.error('--out <path> is required: this probe never writes to a directory it globs later');
  process.exit(2);
}
const ticks = Number.parseInt(flag('ticks', '400'), 10);
const seed = Number.parseInt(flag('seed', String(AUDIT_RUN_SEED)), 10);
const sampleEvery = Number.parseInt(flag('sample', '50'), 10);

const TECHNIQUES = ['creo', 'rego'];
const ARMS = ['animal', 'herbam'];

const registry = shippedContent();

/** The authored content of one arm's cells, so a separation can be attributed. */
function cellContentOf(formId) {
  const cells = registry.cells
    .filter((entry) => entry.record.form === formId && TECHNIQUES.includes(entry.record.technique))
    .map((entry) => entry.record.id);
  const nodes = registry.nodes.filter((entry) => cells.includes(entry.record.cell));
  let resourceYieldMagnitude = 0;
  let resourceYieldNodes = 0;
  for (const entry of nodes) {
    const carried = entry.record.effects.filter(
      (effect) => effect.target === 'universe' && effect.primitive === 'resource-yield',
    );
    if (carried.length > 0) resourceYieldNodes += 1;
    for (const effect of carried) resourceYieldMagnitude += effect.magnitude;
  }
  return { cells, nodes: nodes.length, resourceYieldNodes, resourceYieldMagnitude };
}

function runArm(formId) {
  const base = referenceContent();
  const axes = explicitOpeningAxes(base.registry, TECHNIQUES, [formId]);
  const content = {
    ...base,
    axes,
    foundingNodeIds: foundingCandidates(base.registry, axes),
  };
  const { scenario, lastReport } = referenceScenario(content);
  const session = createSession({ scenario, agentSlotIndex: 0, strategyId: `w-yields-${formId}` });
  session.reset(seed, { worldTickCap: ticks, options: {} });

  const applied = { food: 0, vellum: 0, stone: 0 };
  const land = { food: 0, vellum: 0, stone: 0 };
  const samples = [];
  let reports = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    session.submit({ kind: 0, params: [] });
    const report = lastReport();
    if (report === undefined) continue;
    reports += 1;
    for (const kind of ['food', 'vellum', 'stone']) {
      applied[kind] += report.appliedByKind[kind];
      land[kind] += report.producedByKind[kind];
    }
    if (reports % sampleEvery === 0) {
      samples.push({
        worldTick: report.worldTick,
        stockFood: report.remainingByKind.food,
        stockVellum: report.remainingByKind.vellum,
        stockStone: report.remainingByKind.stone,
        appliedFood: applied.food,
        appliedVellum: applied.vellum,
        appliedStone: applied.stone,
        landFood: land.food,
        landVellum: land.vellum,
        landStone: land.stone,
        economicNodes: report.economicNodes,
      });
    }
  }
  return {
    formId,
    foundingNodeCount: content.foundingNodeIds.length,
    worldReports: reports,
    applied,
    land,
    samples,
    cellContent: cellContentOf(formId),
  };
}

const arms = ARMS.map((formId) => runArm(formId));

// Third exit for a broken probe. An arm that produced no world reports, or one
// that could permit no founding node at all, cannot say anything about a yield
// table, and printing "identical" from it would be a confident nonsense.
for (const arm of arms) {
  if (arm.worldReports === 0 || arm.foundingNodeCount === 0) {
    console.error(
      `PROBE BROKEN: arm "${arm.formId}" produced ${String(arm.worldReports)} world reports from ` +
        `${String(arm.foundingNodeCount)} founding nodes. This is not a statement that the two ` +
        'arms agree.',
    );
    process.exit(3);
  }
}

const [animal, herbam] = arms;
/**
 * The composition of the **applied** channel, `vellum` per 1024 of `food`.
 *
 * This is the number the yield table owns and the only one in this probe that
 * is attributable to it. `appliedByKind` is phase 5a — a mage spending her month
 * casting a node in a permitted cell — and it is the one channel that runs
 * through `routeYieldByForm`. The magnitudes differ between arms because the two
 * cell pairs are not authored alike and the two universes grow differently; the
 * **ratio** does not, on a tree where `animal` and `herbam` carry the same
 * weights. That is the pre-registered null in the form a whole run can carry it.
 */
const appliedComposition = (arm) =>
  arm.applied.food === 0 ? null : Math.round((arm.applied.vellum * 1024) / arm.applied.food);

/**
 * The same ratio for the **land** channel, printed beside it and **not** a
 * control — the honest version of a line that first claimed to be one.
 *
 * Land production is *split* by `territoryYieldShares`, which never sees a
 * form. But each kind's split is then multiplied by `resourceYieldMultiplier`,
 * whose per-kind bonus lists are filled by `routeYieldByForm` from the nodes
 * the universe practises. So a re-author of `form.json` reaches this ratio too,
 * one step later, and a probe asserting it stayed put would have been asserting
 * something false. Measured on `4621db1a` **before** any edit, the two arms
 * already read 634 and 626 — the ambient multiplier and per-cohort flooring,
 * not a pure share.
 */
const landComposition = (arm) =>
  arm.land.food === 0 ? null : Math.round((arm.land.vellum * 1024) / arm.land.food);

const identical =
  JSON.stringify(animal.samples) === JSON.stringify(herbam.samples) &&
  JSON.stringify(animal.applied) === JSON.stringify(herbam.applied);

const payload = {
  probe: 'w-yields-two-arm',
  takenAt: new Date().toISOString(),
  requestedTicks: ticks,
  runSeed: seed,
  techniques: TECHNIQUES,
  arms,
  armsIdentical: identical,
  appliedCompositionVellumPerFood: Object.fromEntries(
    arms.map((arm) => [arm.formId, appliedComposition(arm)]),
  ),
  landCompositionVellumPerFood: Object.fromEntries(
    arms.map((arm) => [arm.formId, landComposition(arm)]),
  ),
};
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`two-arm Animal vs Herbam — seed ${String(seed)}, --ticks ${String(ticks)} -> ${out}`);
console.log('attribution — the authored content of each arm is NOT alike:');
for (const arm of arms) {
  const c = arm.cellContent;
  console.log(
    `  ${arm.formId.padEnd(7)} cells ${c.cells.join(',').padEnd(28)} nodes ${String(c.nodes).padStart(3)}  ` +
      `resource-yield nodes ${String(c.resourceYieldNodes).padStart(3)}  summed magnitude ${String(c.resourceYieldMagnitude).padStart(6)}  ` +
      `founding nodes ${String(arm.foundingNodeCount).padStart(3)}`,
  );
}
console.log('');
console.log('applied channel (phase 5a, the one routeYieldByForm owns), cumulative:');
console.log('tick     animal food  herbam food  animal vellum herbam vellum');
const rows = Math.max(animal.samples.length, herbam.samples.length);
for (let index = 0; index < rows; index += 1) {
  const a = animal.samples[index];
  const h = herbam.samples[index];
  const cell = (value) => String(value ?? '-').padStart(13);
  console.log(
    `t${String(a?.worldTick ?? h?.worldTick ?? '?').padEnd(6)} ${cell(a?.appliedFood)} ${cell(h?.appliedFood)} ${cell(a?.appliedVellum)} ${cell(h?.appliedVellum)}`,
  );
}
console.log('');
console.log('cumulative, by channel:');
for (const channel of ['applied', 'land']) {
  for (const kind of ['food', 'vellum', 'stone']) {
    const a = animal[channel][kind];
    const h = herbam[channel][kind];
    const delta = h === 0 ? '-' : `${(((a - h) / h) * 100).toFixed(1)}%`;
    console.log(
      `  ${channel.padEnd(8)}${kind.padEnd(7)} animal ${String(a).padStart(12)}   herbam ${String(h).padStart(12)}   animal-vs-herbam ${delta.padStart(8)}`,
    );
  }
}
console.log('');
console.log('THE ATTRIBUTABLE NUMBER — vellum per 1024 food:');
console.log(
  `  applied (form-routed)   animal ${String(appliedComposition(animal)).padStart(6)}   herbam ${String(appliedComposition(herbam)).padStart(6)}   ` +
    (appliedComposition(animal) === appliedComposition(herbam) ? 'IDENTICAL — the null holds' : 'SEPARATE'),
);
console.log(
  `  land (territory-routed) animal ${String(landComposition(animal)).padStart(6)}   herbam ${String(landComposition(herbam)).padStart(6)}   ` +
    '(not a control — see the note in this file)',
);
console.log(identical ? 'applied baskets byte-identical between arms' : 'applied baskets differ between arms');
