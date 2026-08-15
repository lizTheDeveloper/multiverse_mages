#!/usr/bin/env node
/*
 * Multiverse Mages — the task 9.9 species-spread metric, per opening square.
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
 * Criterion 3 of W192. Run `npm run typecheck` first — this loads `dist/`.
 *
 *     node scripts/w192-opening-occupancy.mjs --seeds 4 --out balance/w192/occupancy.ndjson
 *
 * ## Same call the pinned number comes from
 *
 * `species-occupancy.test.ts` pins `collectSpeciesCellOccupancy` at **0.0473**
 * over a twenty-world-year run from `LONG_RUN_SEED` on the v1 rectangle, and
 * records 0.0729 before earlier changes. This makes the identical call — same
 * horizon, same seed, same collector — and varies only the opening square, so
 * the `v1` arm here **must** reproduce 0.0473. It is asserted at startup and the
 * process exits non-zero if it does not: a spread metric measured by a second
 * implementation of the run loop is a second number, not a comparison.
 *
 * Extra seeds beyond `LONG_RUN_SEED` are reported separately and never folded
 * into the pinned reading, because the pin is a single-seed fact and averaging
 * it away would make the control uncheckable.
 */

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { collectSpeciesCellOccupancy, MECHANICS_AT_0_5_0 } from '../packages/mc-harness/dist/index.js';
import { defineWorldSimulation } from '../packages/coordination/dist/index.js';
import { MagicGrid } from '../packages/rules-magic/dist/index.js';
import { rngFromRootSeed, step } from '../packages/sim-core/dist/index.js';
import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  TICKS_PER_WORLD_YEAR,
  buildReferenceState,
  explicitOpeningAxes,
  foundingCandidates,
  referenceContent,
  speciesCellOccupancy,
} from '../packages/scenario/dist/index.js';

import { candidates as staticCandidates } from './w192-opening-reach.mjs';

/**
 * The horizon the pin was taken at: twenty world years, 240 ticks.
 *
 * The control is always run here whatever `--ticks` says, because the pinned
 * 0.0473 is a fact about *this* horizon and a control taken somewhere else is
 * not a control. `--ticks` then re-runs the arms at a second horizon — 720 is
 * the one the frontier measurement uses — so the two readings can be put beside
 * each other without either pretending to be the other.
 */
const PINNED_HORIZON_TICKS = 20 * TICKS_PER_WORLD_YEAR;
const PINNED_V1_VALUE = 0.0473;

const content = referenceContent();
const grid = MagicGrid.from(content.registry);

function parseArgv(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith('--') ? '' : next;
    out.set(token.slice(2), value);
    if (value !== '') i += 1;
  }
  return out;
}

const options = parseArgv(process.argv.slice(2));
const seedCount = Number.parseInt(options.get('seeds') ?? '1', 10);
const horizonTicks = Number.parseInt(options.get('ticks') ?? String(20 * TICKS_PER_WORLD_YEAR), 10);

/** A run telemetry carrying nothing but the occupancy sample, as the test does. */
function telemetryFor(sample) {
  return {
    coordinates: { rootSeed: 1, sweepId: 'w192-occupancy', cellIndex: 0, replicateIndex: 0 },
    status: 'stagnated',
    ticksRun: sample.worldTick,
    mechanics: MECHANICS_AT_0_5_0,
    census: [],
    speciesIds: sample.species.map((entry) => entry.speciesId),
    tierFirstReached: [],
    checkpoints: [],
    raids: undefined,
    accounting: { submissions: 0, rejections: 0, byActionId: {} },
    speciesCellOccupancy: sample,
  };
}

function measure(techniqueIds, formIds, runSeed, horizonTicks) {
  const axes = explicitOpeningAxes(content.registry, techniqueIds, formIds);
  const armContent = {
    ...content,
    axes,
    foundingNodeIds: foundingCandidates(content.registry, axes),
  };
  const simulation = defineWorldSimulation(armContent.deps);
  let state = buildReferenceState({
    runSeed,
    options: LONG_RUN_OPTIONS,
    content: armContent,
    schema: simulation.schema,
  });
  for (let index = 0; index < horizonTicks; index += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
  }
  const sample = speciesCellOccupancy(state, content.registry, grid, { ...axes, edicts: [] });
  const entry = collectSpeciesCellOccupancy(telemetryFor(sample));
  return { sample, entry };
}

// The control. Must reproduce the pin, or nothing below is a comparison.
const controlIds = staticCandidates().find((c) => c.label === 'standard 3x4');
const control = measure(controlIds.techniqueIds, controlIds.formIds, LONG_RUN_SEED, PINNED_HORIZON_TICKS);
if (Math.abs(control.entry.value - PINNED_V1_VALUE) > 5e-5) {
  process.stderr.write(
    `CONTROL FAILED: v1 rectangle measures ${String(control.entry.value)}, ` +
      `species-occupancy.test.ts pins ${String(PINNED_V1_VALUE)}. The instrument disagrees with ` +
      'the committed number and no arm below it is readable.\n',
  );
  process.exit(2);
}
process.stderr.write(`control ok: v1 rectangle reproduces the pinned ${String(PINNED_V1_VALUE)}\n`);

const outPath = options.get('out');
if (outPath === undefined || outPath === '') {
  process.stderr.write('--out is required.\n');
  process.exit(1);
}
mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
writeFileSync(outPath, '');

// Seeds beyond the pinned one, offset so they cannot collide with it.
const seeds = Array.from({ length: seedCount }, (_u, i) => (i === 0 ? LONG_RUN_SEED : LONG_RUN_SEED + i * 7919));

for (const candidate of staticCandidates()) {
  for (const runSeed of seeds) {
    const { sample, entry } = measure(candidate.techniqueIds, candidate.formIds, runSeed, horizonTicks);
    const record = {
      label: candidate.label,
      kind: candidate.kind,
      techniqueIds: candidate.techniqueIds,
      formIds: candidate.formIds,
      runSeed,
      pinnedSeed: runSeed === LONG_RUN_SEED,
      horizonTicks,
      enabledCells: sample.enabledCells,
      spread: entry.status === 'measured' ? entry.value : null,
      status: entry.status,
      detail: entry.detail ?? null,
      species: sample.species.map((s) => ({
        speciesId: s.speciesId,
        occupiedCells: s.occupiedCells,
        occupiedEnabledCells: s.occupiedEnabledCells,
        nodesHeld: s.nodesHeld,
        livingMages: s.livingMages,
      })),
    };
    appendFileSync(outPath, `${JSON.stringify(record)}\n`);
    process.stderr.write(
      `  ${candidate.label.padEnd(28)} seed ${String(runSeed)} spread=${String(record.spread)}\n`,
    );
  }
}
process.stderr.write(`wrote ${outPath}\n`);
