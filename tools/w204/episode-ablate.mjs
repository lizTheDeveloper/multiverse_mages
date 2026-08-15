#!/usr/bin/env node
/*
 * Multiverse Mages — W204: the same ablation question, asked of a run that has
 * a god in it.
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
 * `runLongReference` submits no actions, ever. That is the right driver for the
 * world's own evolution and the wrong one for anything a god touches: the three
 * knowledge-bonus channels are fed by blessing and encouragement constants and
 * by nothing else, so a no-action run makes all three return an empty list
 * forever — correctly, and indistinguishably from a channel that is dead.
 *
 * This asks the same ablation question through `executeReferenceRun`, which
 * installs the raid system and runs a real strategy against a real god. The
 * comparison is the whole run record — every declared metric, every census
 * sample, every checkpoint, every raid — rather than a chosen vector.
 *
 * Usage: node tools/w204/episode-ablate.mjs [--strategy worship-maximizer]
 *                                           [--ticks 600] [--seeds 2]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { hashBytes } from '@mm/sim-core';
import { executeReferenceRun, referenceContent } from '@mm/scenario';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const STRATEGY = flag('strategy', 'worship-maximizer');
const TICKS = Number.parseInt(flag('ticks', '600'), 10);
const SEED_COUNT = Number.parseInt(flag('seeds', '2'), 10);
const JSON_OUT = flag('json', undefined);
const SEEDS = [0x0bad_c0de, 0x00ab_cdef, 0x1234_5678, 0x0004_1000].slice(0, SEED_COUNT);

const base = referenceContent();

/** Call through, keep the length, return zeros. Never short-circuit. */
const zeroing = (field) => {
  const original = base.deps[field];
  return (...args) => original(...args).map(() => 0);
};

const withDeps = (overrides) => ({ ...base, deps: { ...base.deps, ...overrides } });

const ARMS = [
  { id: 'control', content: base, ablated: [] },
  { id: 'primitive:lifespan', content: base, ablated: ['lifespan'] },
  { id: 'primitive:teach-rate', content: base, ablated: ['teach-rate'] },
  { id: 'primitive:research-rate', content: base, ablated: ['research-rate'] },
  { id: 'primitive:scribe-rate', content: base, ablated: ['scribe-rate'] },
  { id: 'primitive:fertility', content: base, ablated: ['fertility'] },
  { id: 'primitive:build-rate', content: base, ablated: ['build-rate'] },
  { id: 'primitive:resource-yield', content: base, ablated: ['resource-yield'] },
  { id: 'primitive:worship-yield', content: base, ablated: ['worship-yield'] },
  { id: 'primitive:direct-damage', content: base, ablated: ['direct-damage'] },
  { id: 'primitive:ward', content: base, ablated: ['ward'] },
  { id: 'primitive:knowledge-steal', content: base, ablated: ['knowledge-steal'] },
  { id: 'primitive:concealment', content: base, ablated: ['concealment'] },
  { id: 'primitive:summon', content: base, ablated: ['summon'] },
  { id: 'primitive:blink', content: base, ablated: ['blink'] },
  { id: 'primitive:area-denial', content: base, ablated: ['area-denial'] },
  { id: 'channel:lifespanEffectsFor', content: withDeps({ lifespanEffectsFor: zeroing('lifespanEffectsFor') }), ablated: [] },
  { id: 'channel:researchBonusesFor', content: withDeps({ researchBonusesFor: zeroing('researchBonusesFor') }), ablated: [] },
  { id: 'channel:teachBonusesFor', content: withDeps({ teachBonusesFor: zeroing('teachBonusesFor') }), ablated: [] },
];

function runOne(arm, runSeed) {
  const result = executeReferenceRun(
    {
      coordinates: { sweepId: 'w204-episode', cellId: arm.id, replicate: runSeed },
      runSeed,
      levels: {},
      strategies: [STRATEGY],
      worldTickCap: TICKS,
      metrics: ['combatActionEconomy'],
      ablatedPrimitives: arm.ablated,
      // A one-sided arm needs a slot to be the ablated one; this pool has a
      // single slot, so the neutralized ruleset is the whole universe's.
      ...(arm.ablated.length === 0 ? {} : { ablatedSlotIndex: 0 }),
    },
    { content: arm.content },
  );
  const record = {
    status: result.outcome.status,
    terminalReason: result.outcome.terminalReason,
    ticksRun: result.outcome.ticksRun,
    accounting: result.outcome.accounting,
    samples: result.samples,
    checkpoints: result.telemetry.checkpoints,
    census: result.telemetry.census,
    tierFirstReached: result.telemetry.tierFirstReached,
    raids: result.raids,
  };
  const text = JSON.stringify(record);
  const last = result.samples.at(-1);
  return {
    hash: hashBytes(new TextEncoder().encode(text)),
    raids: (result.raids ?? []).length,
    ticksRun: result.outcome.ticksRun,
    status: result.outcome.status,
    summary: {
      population: last?.population,
      livingMages: last?.livingMages,
      nodesKnown: last?.nodesKnown,
      grimoires: last?.grimoires,
      libraryDepth: last?.libraryDepth,
    },
  };
}

console.log(
  `W204 episode ablation — strategy ${STRATEGY}, ${String(TICKS)} ticks, ${String(SEEDS.length)} seed(s).\n` +
    'The comparison is the whole run record: metrics, every census sample, every checkpoint, every raid.\n',
);

const controls = SEEDS.map((seed) => runOne(ARMS[0], seed));
const controlTwice = runOne(ARMS[0], SEEDS[0]);
if (controlTwice.hash !== controls[0].hash) {
  console.error('SELF-CHECK FAILED: two control runs at the same seed disagree. Nothing is reported.');
  process.exit(2);
}
console.log(`self-check: control reproducible (${controls[0].hash}), ${String(controls[0].raids)} raids, status ${controls[0].status}.\n`);

const rows = [];
for (const arm of ARMS.slice(1)) {
  const seeds = SEEDS.map((seed, index) => {
    const run = runOne(arm, seed);
    return { seed, hash: run.hash, identical: run.hash === controls[index].hash, summary: run.summary, control: controls[index].summary };
  });
  const moved = seeds.some((s) => !s.identical);
  rows.push({ id: arm.id, moved, seeds });
  const detail = moved
    ? seeds
        .filter((s) => !s.identical)
        .map((s) => {
          const diffs = Object.entries(s.summary)
            .filter(([key, value]) => value !== s.control[key])
            .map(([key, value]) => `${key} ${String(s.control[key])}->${String(value)}`);
          return diffs.length === 0 ? 'record moved, terminal census unchanged' : diffs.join(', ');
        })
        .join(' | ')
    : `identical on all ${String(SEEDS.length)} seeds`;
  console.log(`${arm.id.padEnd(32)}${(moved ? 'MOVES' : 'inert').padEnd(8)}${detail}`);
}

if (JSON_OUT !== undefined) {
  writeFileSync(JSON_OUT, `${JSON.stringify({ strategy: STRATEGY, ticks: TICKS, seeds: SEEDS, rows }, undefined, 2)}\n`);
  console.log(`\nwrote ${JSON_OUT}`);
}
