#!/usr/bin/env node
/*
 * Multiverse Mages — two universes, one content set, one seed, different ground.
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
 * ## The land arm of the pre-registered null
 *
 * `TERRITORY_HOLDING` shipped in world revision 10 and the production path never
 * read it. `yieldShares` was a `WorldStepDeps` field built once at the
 * composition root from **every territory in the content set** and handed to
 * every universe in the run — *"fixed for the length of a run"*, in its own
 * docblock. So two universes holding entirely different ground produced the
 * identical basket mix, and `territory.json`'s prose (`upland-pasture` *"carries
 * herds rather than fields"*, `river-delta` *"three harvests a year"*) reached
 * nothing at all.
 *
 * This probe changes **only the holding rows**. Same content set, same seed,
 * same founding options, same everything else: each arm's scenario is wrapped so
 * that `create` attaches its own `territory-holding` rows before the first tick,
 * which is what makes `materializeTerritoryHoldings` stand down. The endowment
 * on `WorldStepDeps` is untouched and identical in both arms — so a separation
 * here can only have come through state.
 *
 * The pre-registered null: on a tree where production reads the run-global
 * shares, the two arms' `producedByKind` **composition** is identical by
 * construction, whatever the magnitudes do.
 *
 * Usage: node tools/w-yields/land-two-arm.mjs --out <path> [--ticks 300] [--seed N]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { createSession } from '@mm/agent-api';
import { TERRITORY_HOLDING, attachRecord } from '@mm/state';
import { AUDIT_RUN_SEED, referenceContent, referenceScenario, shippedContent } from '@mm/scenario';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const out = flag('out', undefined);
if (out === undefined) {
  console.error('--out <path> is required: this probe never writes to a directory it globs later');
  process.exit(2);
}
const ticks = Number.parseInt(flag('ticks', '300'), 10);
const seed = Number.parseInt(flag('seed', String(AUDIT_RUN_SEED)), 10);

const registry = shippedContent();
const kindId = (id) => {
  const entry = registry.territories.find((candidate) => candidate.record.id === id);
  if (entry === undefined) throw new Error(`the shipped content set declares no territory "${id}"`);
  return entry.contentId;
};

/**
 * The two holdings. Equal acreage on purpose: 6,000 land units each, which is
 * the shipped endowment's own total, so the arms differ in the *kind* of country
 * and not in how much of it there is. A probe that also moved the acreage could
 * not say which of the two produced the separation.
 */
const ARMS = [
  { name: 'delta', rows: [{ kind: 'river-delta', landUnits: 6000 }] },
  { name: 'pasture', rows: [{ kind: 'upland-pasture', landUnits: 6000 }] },
];

function runArm(arm) {
  const content = referenceContent();
  const { scenario, lastReport } = referenceScenario(content);
  const seeded = {
    ...scenario,
    create(runSeed, config) {
      const state = scenario.create(runSeed, config);
      for (const row of arm.rows) {
        const handle = state.entities.create();
        attachRecord(state, TERRITORY_HOLDING, handle, {
          kindId: kindId(row.kind),
          landUnits: row.landUnits,
        });
      }
      return state;
    },
  };
  const session = createSession({
    scenario: seeded,
    agentSlotIndex: 0,
    strategyId: `w-yields-land-${arm.name}`,
  });
  session.reset(seed, { worldTickCap: ticks, options: {} });

  const land = { food: 0, stone: 0, vellum: 0 };
  let reports = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    session.submit({ kind: 0, params: [] });
    const report = lastReport();
    if (report === undefined) continue;
    reports += 1;
    for (const kind of ['food', 'stone', 'vellum']) land[kind] += report.producedByKind[kind];
  }
  return { ...arm, worldReports: reports, land };
}

const results = ARMS.map((arm) => runArm(arm));

// Third exit for a broken probe: an arm with no reports, or one whose land
// channel is dry, cannot say anything about a mix, and printing "identical" from
// it would be a confident nonsense.
for (const arm of results) {
  const total = arm.land.food + arm.land.stone + arm.land.vellum;
  if (arm.worldReports === 0 || total === 0) {
    console.error(
      `PROBE BROKEN: arm "${arm.name}" produced ${String(arm.worldReports)} world reports and ` +
        `${String(total)} of land materials. This is not a statement that the two arms agree.`,
    );
    process.exit(3);
  }
}

/** The mix, per 1024 of the arm's own land output — magnitude divided out. */
const mixOf = (arm) => {
  const total = arm.land.food + arm.land.stone + arm.land.vellum;
  return Object.fromEntries(
    ['food', 'stone', 'vellum'].map((kind) => [kind, Math.round((arm.land[kind] * 1024) / total)]),
  );
};

const mixes = Object.fromEntries(results.map((arm) => [arm.name, mixOf(arm)]));
const identical = JSON.stringify(mixes.delta) === JSON.stringify(mixes.pasture);

const payload = {
  probe: 'w-yields-land-two-arm',
  takenAt: new Date().toISOString(),
  requestedTicks: ticks,
  runSeed: seed,
  arms: results,
  landMixPer1024: mixes,
  mixesIdentical: identical,
};
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`land two-arm — seed ${String(seed)}, --ticks ${String(ticks)} -> ${out}`);
console.log('arm       holding                    land food     land stone    land vellum');
for (const arm of results) {
  console.log(
    `${arm.name.padEnd(9)} ${arm.rows.map((row) => `${row.kind} x${String(row.landUnits)}`).join(', ').padEnd(26)} ` +
      `${String(arm.land.food).padStart(12)} ${String(arm.land.stone).padStart(14)} ${String(arm.land.vellum).padStart(14)}`,
  );
}
console.log('');
console.log('THE ATTRIBUTABLE NUMBER — land mix, per 1024 of that arm’s own land output:');
for (const [name, mix] of Object.entries(mixes)) {
  console.log(
    `  ${name.padEnd(9)} food ${String(mix.food).padStart(5)}   stone ${String(mix.stone).padStart(5)}   vellum ${String(mix.vellum).padStart(5)}`,
  );
}
console.log(identical ? 'MIXES IDENTICAL — the null holds' : 'MIXES SEPARATE');
