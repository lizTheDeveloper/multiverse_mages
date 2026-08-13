/*
 * Multiverse Mages — W78: whether two universities on one seed can hold
 * different magic.
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
 * S2's falsifying measurement: *"`universityProfile`'s `dominantCell` differs
 * between two universities on the same seed."*
 *
 * `universityProfile` is production code (`rules-world/src/universities/`) that
 * until now only a test had ever called, so there was no instrument and no
 * before-figure. This is the instrument. It is deliberately **not** a registered
 * metric: a metric is a thing a sweep collects on every run and a baseline gates
 * on, and nothing here is tuned or gated yet.
 *
 * It reports a **time series**, not a verdict. `universityPreference` sends every
 * mage to whichever library is deepest, so a boundary could produce real
 * divergence and then have it homogenised by migration; a single end-of-run
 * yes/no cannot tell those apart, and *how long* two institutions stay different
 * is the number that says whether the container holds.
 *
 *     node scripts/w78-university-divergence.mjs
 *
 * Run `npm run typecheck` first — this loads `dist/`.
 */

import { defineWorldSimulation } from '../packages/coordination/dist/index.js';
import { MagicGrid } from '../packages/rules-magic/dist/index.js';
import { dominantCell, universityProfile } from '../packages/rules-world/dist/index.js';
import { rngFromRootSeed, step } from '../packages/sim-core/dist/index.js';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  UNIVERSITY,
  collectRecords,
  componentOf,
} from '../packages/state/dist/index.js';
import { LONG_RUN_OPTIONS, LONG_RUN_SEED, TICKS_PER_WORLD_YEAR } from '../packages/scenario/dist/long-run.js';
import {
  buildReferenceState,
  referenceContent,
} from '../packages/scenario/dist/reference-universe.js';

/** Two academies, everything else exactly the long run's starting position. */
const OPTIONS = Object.freeze({ ...LONG_RUN_OPTIONS, foundingUniversities: 2 });

/** Every world year for the first ten, then every ten to a century. */
const HORIZONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 80, 100, 150, 200].map(
  (year) => year * TICKS_PER_WORLD_YEAR,
);

const content = referenceContent();
const grid = MagicGrid.from(content.registry);
const simulation = defineWorldSimulation(content.deps);
const cellName = new Map(content.registry.cells.map((entry) => [entry.contentId, entry.record.id]));

let state = buildReferenceState({
  runSeed: LONG_RUN_SEED,
  options: OPTIONS,
  content,
  schema: simulation.schema,
});

/** Every academy, its library, and the living mages currently affiliated to it. */
function academies(current) {
  const universities = componentOf(current, UNIVERSITY);
  const mages = componentOf(current, MAGE);
  const alive = mages.field('alive');
  const affiliation = mages.field('universityId');

  const residents = new Map();
  let unaffiliated = 0;
  mages.forEach((row, handle) => {
    if (alive[row] === 0) return;
    const university = affiliation[row];
    if (university === 0) {
      unaffiliated += 1;
      return;
    }
    const found = residents.get(university);
    if (found === undefined) residents.set(university, [handle]);
    else found.push(handle);
  });

  const found = [];
  universities.forEach((row, handle) => {
    found.push({
      handle,
      library: universities.get(handle, 'libraryId'),
      residentMages: residents.get(handle) ?? [],
    });
  });
  return { found, unaffiliated };
}

console.log('# W78 — can two universities on one seed hold different magic?\n');
console.log(
  `Seed ${LONG_RUN_SEED}, no actions submitted, two academies founded at tick zero with the six ` +
    'founders dealt round-robin between them, so each opens holding three of the six founding ' +
    'grants. Everything else is `LONG_RUN_OPTIONS`.\n',
);
console.log(
  '`dominantCell` is the highest-weighted cell of a profile derived from the academy library plus ' +
    'its resident mages, distinct nodes counted once. **Differing dominant cells is the ' +
    'measurement S2 asks for.**\n',
);

/**
 * The distinct nodes one academy holds, by the same inclusion rule
 * `universityProfile` uses — its own shelf, or the mind or palace of one of its
 * residents.
 *
 * The profile reports *how many* and *in which cells*; the node ids are what
 * make "these two hold different things" separable from "these two hold the same
 * 51 nodes and one of them has a fifth copy in a cell the other has four in".
 * With `dominantCell` alone the second reads as divergence, which is exactly the
 * illusion vision §13 records as *two distinct nodes against 1,263 books*.
 */
function heldNodes(current, academy) {
  const residents = new Set(academy.residentMages);
  const nodes = new Set();
  for (const { row } of collectRecords(current, KNOWLEDGE_INSTANCE)) {
    const inLibrary =
      row.locationKind === LOCATION_KIND.library && row.locationId === academy.library;
    const inAResident =
      (row.locationKind === LOCATION_KIND.mind || row.locationKind === LOCATION_KIND.palace) &&
      residents.has(row.locationId);
    if (inLibrary || inAResident) nodes.add(row.nodeId);
  }
  return nodes;
}

console.log(
  '| world year | A nodes | A dominant | B nodes | B dominant | dominant differs | shared | ' +
    'A only | B only | A staff | B staff | unaffiliated | lessons |',
);
console.log('|---:|---:|---|---:|---|:---:|---:|---:|---:|---:|---:|---:|---:|');

let tick = 0;
let lessonsTaught = 0;
const rows = [];
for (const horizon of HORIZONS) {
  while (tick < horizon) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    lessonsTaught += simulation.lastReport()?.lessonsTaught ?? 0;
    tick += 1;
  }
  const { found, unaffiliated } = academies(state);
  const profiles = found.map((academy) =>
    universityProfile(state, {
      library: academy.library,
      residentMages: academy.residentMages,
      cellOf: (nodeId) => grid.cellOf(nodeId),
    }),
  );
  const held = found.map((academy) => heldNodes(state, academy));
  const shared = [...held[0]].filter((nodeId) => held[1].has(nodeId)).length;
  const dominants = profiles.map((profile) => dominantCell(profile));
  const differ = dominants[0] !== dominants[1];
  rows.push({
    year: horizon / TICKS_PER_WORLD_YEAR,
    profiles,
    dominants,
    differ,
    shared,
    onlyA: held[0].size - shared,
    onlyB: held[1].size - shared,
    staff: found.map((academy) => academy.residentMages.length),
    unaffiliated,
  });
  const last = rows[rows.length - 1];
  const name = (id) => (id === 0 ? '—' : (cellName.get(id) ?? String(id)));
  console.log(
    `| ${last.year} | ${profiles[0].distinctNodes} | ${name(dominants[0])} | ` +
      `${profiles[1].distinctNodes} | ${name(dominants[1])} | ${differ ? 'yes' : 'no'} | ` +
      `${shared} | ${last.onlyA} | ${last.onlyB} | ${last.staff[0]} | ${last.staff[1]} | ` +
      `${unaffiliated} | ${lessonsTaught} |`,
  );
}

const differing = rows.filter((row) => row.differ);
console.log(
  `\n**Dominant cells differ at ${differing.length} of ${rows.length} sampled horizons**` +
    (differing.length === 0
      ? '. The two academies are indistinguishable in what they are good at.'
      : `, first at world year ${differing[0].year} and last at world year ${
          differing[differing.length - 1].year
        }.`),
);

const exclusive = rows.filter((row) => row.onlyA > 0 || row.onlyB > 0);
console.log(
  `**Either academy holds a node the other does not at ${exclusive.length} of ${rows.length} ` +
    'sampled horizons.** This is the stronger reading and the one to trust: a differing ' +
    '`dominantCell` over two identical node sets is a tie-break wobble on a near-uniform ' +
    'histogram, not a difference in what the institution knows.',
);
const final = rows[rows.length - 1];
console.log(
  `At world year ${final.year}: ${final.shared} nodes shared, ${final.onlyA} held only by A, ` +
    `${final.onlyB} held only by B.`,
);

console.log('\n## Full cell profiles at the last horizon\n');
const last = rows[rows.length - 1];
for (const [index, profile] of last.profiles.entries()) {
  const cells = profile.cells
    .map((entry) => `${cellName.get(entry.cellId) ?? String(entry.cellId)}×${entry.weight}`)
    .join(' ');
  console.log(`- Academy ${'AB'[index]}: ${cells === '' ? '— (holds nothing)' : cells}`);
}
