#!/usr/bin/env node
/*
 * Multiverse Mages — what a stand-in rival's arrivals cost a headless universe.
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
 * Six fixed seeds, the default reference scenario with raids on, no god
 * action, 600 world ticks. Reports, per seed and in total, the stand-in raids
 * that arrived, the mages they killed, the nodes they extinguished, and the
 * mages alive at the end. Every balance baseline is taken on universes that
 * stand-ins raid, so this is the number that says how far a raid tuning moves
 * them. Deterministic; exit `1` if no seed is raided at all (a probe that saw
 * no arrival cannot report their cost).
 *
 *   node scripts/standin-lethality-probe.mjs
 */

import { rngFromRootSeed, step } from '@mm/sim-core';
import { referenceContent, referenceScenario } from '@mm/scenario';
import { MAGE, collectRecords } from '@mm/state';

const content = referenceContent();
const total = { raids: 0, casualties: 0, alive: 0, nodesLost: 0 };
for (const seed of [0x0bad_c0de, 0x00ab_cdef, 0x1234_5678, 0x0000_022b, 0x0a97_0001, 0x2222_2222]) {
  const run = referenceScenario(content, { raids: true, telemetry: false });
  let state = run.scenario.create(seed, { worldTickCap: 600 });
  for (let tick = 0; tick < 600; tick += 1) state = step(state, [], rngFromRootSeed(state.rootSeed));
  const raids = run.raids();
  const alive = collectRecords(state, MAGE).filter((entry) => entry.row.alive === 1).length;
  const casualties = raids.reduce((n, raid) => n + raid.localCasualties, 0);
  const nodesLost = raids.reduce((n, raid) => n + raid.nodesLostLocally, 0);
  total.raids += raids.length;
  total.casualties += casualties;
  total.alive += alive;
  total.nodesLost += nodesLost;
  console.log(`0x${seed.toString(16)} raids ${raids.length} casualties ${casualties} nodesLost ${nodesLost} alive@600 ${alive}`);
}
console.log('TOTAL', JSON.stringify(total));
if (total.raids === 0) {
  console.error('BROKEN PROBE: no stand-in arrived on any seed.');
  process.exit(1);
}
