#!/usr/bin/env node
/*
 * Multiverse Mages — the build-rate causal chain, printed.
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
 * The numbers behind `packages/scenario/test/unit/causal-chain-build-rate.test.ts`.
 *
 * The test asserts the *relations* — permitted beats forbidden, ablated matches
 * forbidden — because a test that pinned the magnitudes would fail on every
 * content retune and teach a reader to widen it. This prints the magnitudes, so
 * a human can see how large the effect is and whether it is worth caring about.
 *
 * Usage: node tools/w29/causal-chain.mjs [ticks]
 */

import { rngFromRootSeed, step } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  UNIVERSE,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  componentOf,
  findUniverse,
} from '@mm/state';
import { defineWorldSimulation, neutralizing } from '@mm/coordination';
import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  referenceContent,
} from '@mm/scenario';

const TICKS = Number.parseInt(process.argv[2] ?? '180', 10);
const content = referenceContent();

const terramCells = new Set(
  content.registry.cells.filter((c) => c.record.form === 'terram').map((c) => c.record.id),
);
const terramNodes = new Set(
  content.registry.nodes.filter((n) => terramCells.has(n.record.cell)).map((n) => n.contentId),
);
const terramBit = content.registry.forms.find((f) => f.record.id === 'terram').record.bit;

function runArm(arm) {
  const deps = arm.ablate ? { ...content.deps, ablation: neutralizing('build-rate') } : content.deps;
  const simulation = defineWorldSimulation(deps);
  let state = buildReferenceState({
    runSeed: LONG_RUN_SEED,
    options: LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });
  const universes = componentOf(state, UNIVERSE);
  const universe = findUniverse(state);
  if (arm.forbid) {
    universes.set(universe, 'permittedForms', universes.get(universe, 'permittedForms') & ~(1 << terramBit));
  }
  const site = state.entities.create();
  attachRecord(state, UNIVERSITY, site, { libraryId: 0, capacity: 40, buildProgress: 0 });

  let ticksToComplete = -1;
  let stoneOwed = 0;
  let peakSources = 0;
  const magnitudes = new Set();
  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const r = simulation.lastReport();
    if (r === undefined) continue;
    stoneOwed += r.constructionStoneOwed;
    peakSources = Math.max(peakSources, r.buildRateSources);
    for (const m of r.buildRateMagnitudes) magnitudes.add(m);
    if (ticksToComplete < 0 && r.universitiesCompleted > 0) ticksToComplete = tick + 1;
  }
  let terram = 0;
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (terramNodes.has(row.nodeId)) terram += 1;
  }
  return { ticksToComplete, stoneOwed, peakSources, terram, magnitudes: [...magnitudes].sort((a, b) => a - b) };
}

const arms = {
  permitted: runArm({}),
  forbidden: runArm({ forbid: true }),
  ablated: runArm({ ablate: true }),
};

const pad = (v, w = 14) => String(v).padStart(w);
console.log(`W29 — the build-rate causal chain, ${TICKS} months, seed ${LONG_RUN_SEED}\n`);
console.log(`${'metric'.padEnd(26)}${pad('Terram ok')}${pad('Terram off')}${pad('rate ablated')}`);
console.log('-'.repeat(68));
const row = (label, pick) =>
  console.log(
    `${label.padEnd(26)}${pad(pick(arms.permitted))}${pad(pick(arms.forbidden))}${pad(pick(arms.ablated))}`,
  );
row('months to open', (a) => a.ticksToComplete);
row('stone spent building', (a) => a.stoneOwed);
row('build-rate sources (peak)', (a) => a.peakSources);
row('Terram instances held', (a) => a.terram);
console.log(`\nmagnitudes reaching construction (permitted): ${arms.permitted.magnitudes.join(', ')}`);
