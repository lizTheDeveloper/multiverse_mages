/*
 * Multiverse Mages — W53: which of this branch's two mechanics deletes orc.
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
 * The reference long run, printed one world year per row, with the per-species
 * roster beside the economy that feeds it.
 *
 * It exists because `loss-shock-recovery.test.ts` reports orc with a pre-shock
 * roster of **zero** at tick 1200, and a roster of zero is compatible with two
 * different stories: a species that was never founded, and a species that was
 * founded and then starved. Those have opposite fixes, and only a time series
 * tells them apart. The economy columns are here for the same reason: if
 * `shortKinds.food` and a falling `carryingCapacity` lead the orc decline, the
 * mechanism is the economy; if orc dwindles while food is healthy, it is
 * goal-side.
 *
 * Reads nothing the tests do not already read — `runLongReference` and the
 * `WorldStepReport` it records — so a number here can be quoted beside a test
 * failure without a second dialect.
 *
 *     node tools/w53/species-collapse.mjs --ticks 1200 --label head
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { runLongReference, referenceContent } from '../../packages/scenario/dist/index.js';

function parseArgs(argv) {
  const args = { ticks: 1200, label: 'run', out: undefined, every: 12, seeds: undefined, windows: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--ticks') { args.ticks = Number(value); index += 1; }
    else if (flag === '--label') { args.label = String(value); index += 1; }
    else if (flag === '--out') { args.out = String(value); index += 1; }
    else if (flag === '--every') { args.every = Number(value); index += 1; }
    else if (flag === '--seeds') { args.seeds = String(value); index += 1; }
    else if (flag === '--windows') { args.windows = Number(value); index += 1; }
  }
  return args;
}

const FP = 1024;
const fp = (value) => (value / FP).toFixed(1);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = referenceContent();
  if (args.seeds !== undefined) {
    const seeds = args.seeds.split(',').map((value) => Number(value));
    const speciesIdsMulti = content.registry.species.map((entry) => entry.record.id);
    const totals = speciesIdsMulti.map(() => 0);
    for (const seed of seeds) {
      const run = await runLongReference({ content, ticks: args.ticks, runSeed: seed });
      const last = run.ticks[run.ticks.length - 1];
      const mages = [...last.magesBySpecies].slice(0, speciesIdsMulti.length);
      if (args.windows !== undefined) {
        const span = args.windows;
        const scribedWindows = [];
        const taughtWindows = [];
        for (let start = 0; start < run.ticks.length; start += span) {
          const slice = run.ticks.slice(start, start + span);
          scribedWindows.push(slice.reduce((t, x) => t + x.report.grimoiresScribed, 0));
          taughtWindows.push(slice.reduce((t, x) => t + x.report.lessonsTaught, 0));
        }
        console.log(
          `${args.label} seed=${seed} scribedWindows=${scribedWindows.join('/')} last=${scribedWindows[scribedWindows.length - 1]}` +
            ` taughtWindows=${taughtWindows.join('/')} depth=${last.libraryDepth} books=${last.grimoires}` +
            ` mages=${speciesIdsMulti.map((id, i) => `${id}:${mages[i]}`).join(' ')}`,
        );
        continue;
      }
      mages.forEach((n, i) => { totals[i] += n; });
      console.log(
        `${args.label} seed=${seed} mages=` +
          speciesIdsMulti.map((id, i) => `${id}:${mages[i]}`).join(' ') +
          ` pop=${last.population} books=${last.grimoires} depth=${last.libraryDepth}`,
      );
    }
    console.log(
      `${args.label} MEAN over ${seeds.length} seeds: ` +
        speciesIdsMulti.map((id, i) => `${id}:${(totals[i] / seeds.length).toFixed(2)}`).join(' '),
    );
    return;
  }
  const speciesIds = content.registry.species.map((entry) => entry.record.id);

  const result = await runLongReference({ content, ticks: args.ticks });

  const rows = [];
  let carried = { births: 0, populaceDeaths: 0, mageDeaths: 0, magesPromoted: 0, lessons: 0, practice: 0, scribed: 0 };

  result.ticks.forEach((tick, index) => {
    const report = tick.report;
    carried.births += report.births;
    carried.populaceDeaths += report.populaceDeaths;
    carried.mageDeaths += report.mageDeaths;
    carried.magesPromoted += report.magesPromoted;
    carried.lessons += report.lessonsTaught;
    carried.practice += report.practiceCompleted ?? 0;
    carried.scribed += report.grimoiresScribed;
    if ((index + 1) % args.every !== 0) return;
    rows.push({
      tick: index + 1,
      mages: [...tick.magesBySpecies].slice(0, speciesIds.length),
      pop: [...tick.populationBySpecies].slice(0, speciesIds.length),
      population: tick.population,
      K: report.carryingCapacity,
      shortfall: report.subsistenceShortfallShare,
      foodProduced: report.producedByKind.food,
      foodLeft: report.remainingByKind.food,
      vellumProduced: report.producedByKind.vellum,
      vellumLeft: report.remainingByKind.vellum,
      stoneLeft: report.remainingByKind.stone,
      short: Object.entries(report.shortKinds).filter(([, v]) => v).map(([k]) => k).join(','),
      economicNodes: report.economicNodes,
      practisedInstances: report.practisedInstances ?? null,
      libraryDepth: tick.libraryDepth,
      grimoires: tick.grimoires,
      nodesKnown: tick.nodesKnown,
      yearFlows: { ...carried },
    });
    carried = { births: 0, populaceDeaths: 0, mageDeaths: 0, magesPromoted: 0, lessons: 0, practice: 0, scribed: 0 };
  });

  console.log(`label=${args.label} ticks=${args.ticks} species=${speciesIds.join(',')}`);
  console.log(
    'tick | ' + speciesIds.map((id) => id.padStart(8)).join(' ') +
      ' | pop     K    short | food+ foodLeft vell+ vellLeft | econN prac | births pDied mDied prom lessons practice scribed | depth books',
  );
  for (const row of rows) {
    console.log(
      String(row.tick).padStart(4) + ' | ' +
        row.mages.map((n) => String(n).padStart(8)).join(' ') + ' | ' +
        String(row.population).padStart(6) + ' ' + String(row.K).padStart(5) + ' ' +
        String(row.shortfall).padStart(5) + ' | ' +
        fp(row.foodProduced).padStart(7) + ' ' + fp(row.foodLeft).padStart(8) + ' ' +
        fp(row.vellumProduced).padStart(6) + ' ' + fp(row.vellumLeft).padStart(8) + ' | ' +
        String(row.economicNodes).padStart(5) + ' ' + String(row.practisedInstances).padStart(4) + ' | ' +
        String(row.yearFlows.births).padStart(6) + ' ' + String(row.yearFlows.populaceDeaths).padStart(5) + ' ' +
        String(row.yearFlows.mageDeaths).padStart(5) + ' ' + String(row.yearFlows.magesPromoted).padStart(4) + ' ' +
        String(row.yearFlows.lessons).padStart(7) + ' ' + String(row.yearFlows.practice).padStart(8) + ' ' +
        String(row.yearFlows.scribed).padStart(7) + ' | ' +
        String(row.libraryDepth).padStart(5) + ' ' + String(row.grimoires).padStart(5) +
        (row.short === '' ? '' : `  SHORT:${row.short}`),
    );
  }

  const final = rows[rows.length - 1];
  console.log(
    `final: mages=${JSON.stringify(Object.fromEntries(speciesIds.map((id, i) => [id, final.mages[i]])))}` +
      ` pop=${JSON.stringify(Object.fromEntries(speciesIds.map((id, i) => [id, final.pop[i]])))}`,
  );

  if (args.out !== undefined) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, JSON.stringify({ label: args.label, speciesIds, rows }, null, 1));
    console.log(`wrote ${args.out}`);
  }
}

await main();
