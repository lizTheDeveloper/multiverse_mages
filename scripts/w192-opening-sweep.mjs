#!/usr/bin/env node
/*
 * Multiverse Mages — how wide the opening square can get before progression dies.
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
 * The dynamic half of W192. Run `npm run typecheck` first — this loads `dist/`.
 *
 *     node scripts/w192-opening-sweep.mjs --arms v1,std-4x6,named-4x6 --seeds 6 \
 *       --out tools/w192/frontier.ndjson
 *
 * | flag | default | meaning |
 * |---|---|---|
 * | `--arms a,b,c` | every arm | which arms to run; `--list` prints them |
 * | `--seeds N` | 6 | seeds per arm, taken from the separation seed schedule |
 * | `--ticks N` | 720 | horizon, matching `SEPARATION_HORIZON_TICKS` |
 * | `--tier N` | 3 | the tier arrivals are measured at |
 * | `--out PATH` | required | NDJSON, **one file per invocation** |
 * | `--calibrate` | — | run the legacy six seeds on the v1 rectangle and stop |
 * | `--list` | — | print the arm table and stop |
 *
 * ## Why the output path is required and never globbed
 *
 * `CLAUDE.md`: an aggregator that finds input by shape rather than by name
 * eventually finds the wrong input. Every record carries its own `armId`,
 * `ticks` and `seeds`, and the analyser reads **one named file**, so a second
 * invocation at a different horizon cannot be folded into the first one's
 * denominator.
 *
 * ## Every arm goes through one code path
 *
 * An arm is a pair of axis id lists. It is turned into masks by
 * `explicitOpeningAxes` — the play verb a god calls — and spliced onto the
 * reference content, which `resolveOpeningSquare` then returns unchanged
 * because no `openingTechniqueCount` is given. So the **control arm is not a
 * separate branch**: `v1` names the v1 rectangle's own axes and must produce
 * the identical masks and founding candidates as the shipped default. That is
 * asserted at startup rather than assumed, and the process exits non-zero if it
 * fails — a control that is quietly a different universe is the failure mode
 * this whole measurement exists to avoid.
 */

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  LEGACY_SEED_SET,
  SEPARATION_HORIZON_TICKS,
  explicitOpeningAxes,
  foundingCandidates,
  referenceContent,
  runLongReference,
  separationRunSeeds,
  separationSpeciesIds,
  timeToTierBySpecies,
} from '../packages/scenario/dist/index.js';

const V1_TECHNIQUES = ['intellego', 'perdo', 'rego'];
const V1_FORMS = ['limen', 'mentem', 'nomen', 'terram'];

/** `standardOpeningOrder`'s two sequences, transcribed and checked below. */
const STANDARD_TECHNIQUES = ['intellego', 'perdo', 'rego', 'creo', 'muto'];
const STANDARD_FORMS = [
  'limen',
  'mentem',
  'nomen',
  'terram',
  'animal',
  'aquam',
  'auram',
  'corpus',
  'fatum',
  'herbam',
  'ignem',
  'imaginem',
  'umbra',
  'vim',
];

const std = (t, f) => ({
  techniqueIds: STANDARD_TECHNIQUES.slice(0, t),
  formIds: STANDARD_FORMS.slice(0, f),
});

/**
 * The arms.
 *
 * `std-*` are the nested prefix ladder the existing `openingTechniqueCount` /
 * `openingFormCount` sweep factors can already express, and they are the
 * frontier: size varies, position does not. `named-*` are chosen sets, and they
 * exist because the prefix ladder **cannot reach the one authored
 * anti-requisite pair below 52 cells** — `creo` is 4th in the technique order
 * but `ignem` is 11th and `umbra` 13th in the form order.
 */
const ARMS = {
  v1: { label: 'v1 rectangle (3x4, 12 cells)', ...std(3, 4) },
  'std-3x6': { label: 'standard 3x6, 18 cells', ...std(3, 6) },
  'std-3x8': { label: 'standard 3x8, 24 cells', ...std(3, 8) },
  'std-3x14': { label: 'standard 3x14, 42 cells', ...std(3, 14) },
  'std-4x4': { label: 'standard 4x4, 16 cells', ...std(4, 4) },
  'std-4x6': { label: 'standard 4x6, 24 cells', ...std(4, 6) },
  'std-4x8': { label: 'standard 4x8, 32 cells', ...std(4, 8) },
  'std-4x13': { label: 'standard 4x13, 52 cells — first prefix holding the pair', ...std(4, 13) },
  'std-5x8': { label: 'standard 5x8, 40 cells', ...std(5, 8) },
  'std-5x14': { label: 'the whole grid, 70 cells — PR #137', ...std(5, 14) },
  // Named sets. Each keeps the v1 rectangle whole and adds a *coherent* region.
  'named-4x4': {
    label: 'v1 + creo (16 cells): making joins perceiving, unmaking and commanding',
    techniqueIds: ['creo', 'intellego', 'perdo', 'rego'],
    formIds: ['limen', 'mentem', 'nomen', 'terram'],
  },
  'named-3x6': {
    label: 'v1 + ignem/umbra, no creo (18 cells): the elemental pair without the maker',
    techniqueIds: ['intellego', 'perdo', 'rego'],
    formIds: ['ignem', 'limen', 'mentem', 'nomen', 'terram', 'umbra'],
  },
  'named-4x6': {
    label: 'the exclusion square (24 cells): v1 + creo + ignem + umbra',
    techniqueIds: ['creo', 'intellego', 'perdo', 'rego'],
    formIds: ['ignem', 'limen', 'mentem', 'nomen', 'terram', 'umbra'],
  },
  'named-4x7': {
    label: 'the exclusion square + corpus (28 cells)',
    techniqueIds: ['creo', 'intellego', 'perdo', 'rego'],
    formIds: ['corpus', 'ignem', 'limen', 'mentem', 'nomen', 'terram', 'umbra'],
  },
  'named-2x2': {
    label: 'the exclusion pair alone (4 cells): creo/intellego x ignem/umbra',
    techniqueIds: ['creo', 'intellego'],
    formIds: ['ignem', 'umbra'],
  },
};

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
const integer = (key, fallback) => {
  const raw = options.get(key);
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`--${key} must be > 0`);
  return value;
};

const content = referenceContent();

// The control check. `explicitOpeningAxes` on the v1 rectangle's own axes must
// reproduce the shipped masks and the shipped founding candidates exactly, or
// the "control" arm is a different universe and every difference below it is
// unreadable.
{
  const axes = explicitOpeningAxes(content.registry, V1_TECHNIQUES, V1_FORMS);
  const founding = foundingCandidates(content.registry, axes);
  const same =
    axes.permittedTechniques === content.axes.permittedTechniques &&
    axes.permittedForms === content.axes.permittedForms &&
    founding.length === content.foundingNodeIds.length &&
    founding.every((id, index) => id === content.foundingNodeIds[index]);
  if (!same) {
    process.stderr.write(
      'CONTROL FAILED: explicitOpeningAxes on the v1 axes does not reproduce the shipped ' +
        `opening. shipped=${JSON.stringify(content.axes)} rebuilt=${JSON.stringify(axes)} ` +
        `foundingNodes shipped=${content.foundingNodeIds.length} rebuilt=${founding.length}\n`,
    );
    process.exit(2);
  }
  process.stderr.write(
    `control ok: v1 axes rebuilt identically (${String(content.foundingNodeIds.length)} founding candidates)\n`,
  );
}

if (options.has('list')) {
  for (const [id, arm] of Object.entries(ARMS)) {
    process.stdout.write(
      `${id.padEnd(12)} ${arm.techniqueIds.length}x${arm.formIds.length}  ${arm.label}\n`,
    );
  }
  process.exit(0);
}

const tier = integer('tier', 3);
const ticks = integer('ticks', SEPARATION_HORIZON_TICKS);
const speciesNames = separationSpeciesIds(content);

/** Splices an arm's axes onto the reference content. Nothing else changes. */
function contentFor(arm) {
  const axes = explicitOpeningAxes(content.registry, arm.techniqueIds, arm.formIds);
  return { ...content, axes, foundingNodeIds: foundingCandidates(content.registry, axes) };
}

/** One run, reduced to the columns this measurement is about. */
async function runOne(armId, armContent, runSeed) {
  const started = Date.now();
  const result = await runLongReference({ runSeed, ticks, content: armContent });
  const arrivals = [...timeToTierBySpecies(result, tier)];
  const last = result.ticks[result.ticks.length - 1];
  return {
    armId,
    runSeed,
    ticks,
    tier,
    elapsedMs: Date.now() - started,
    // Criterion 1: arrival per species, `null` for a run that never got there.
    arrivals: Object.fromEntries(
      speciesNames.map((name, index) => [name, arrivals[index] ?? null]),
    ),
    // Criterion 2: the library-depth channel the rate multiplier is a lookup on.
    nodesKnown: last.nodesKnown,
    libraryDepth: last.libraryDepth,
    capitalContribution: last.capitalContribution,
    population: last.population,
    peakPopulation: result.peakPopulation,
    deepestTierBySpecies: Object.fromEntries(
      speciesNames.map((name, index) => [name, last.deepestTierBySpecies[index] ?? 0]),
    ),
    finalSnapshotHash: result.finalSnapshotHash,
  };
}

if (options.has('calibrate')) {
  const armContent = contentFor(ARMS.v1);
  const rows = [];
  for (const seed of LEGACY_SEED_SET) {
    rows.push(await runOne('v1', armContent, seed));
    process.stderr.write(`  calibration seed ${String(seed)} done\n`);
  }
  process.stdout.write(
    `calibration — the legacy six seeds, v1 rectangle, tier ${String(tier)}, ${String(ticks)} ticks\n`,
  );
  for (const name of speciesNames) {
    const observed = rows.map((r) => r.arrivals[name]).filter((v) => v !== null);
    const censored = rows.length - observed.length;
    process.stdout.write(
      observed.length === 0
        ? `  ${name.padEnd(9)} censored in all ${String(rows.length)}\n`
        : `  ${name.padEnd(9)} [${String(Math.min(...observed))}, ${String(Math.max(...observed))}]` +
            (censored > 0 ? `  (${String(censored)} censored)` : '') +
            '\n',
    );
  }
  process.exit(0);
}

const outPath = options.get('out');
if (outPath === undefined || outPath === '') {
  process.stderr.write('--out is required. See the module note on why it is never globbed.\n');
  process.exit(1);
}

const armIds =
  options.get('arms') === undefined || options.get('arms') === ''
    ? Object.keys(ARMS)
    : options.get('arms').split(',').filter(Boolean);
for (const id of armIds) {
  if (ARMS[id] === undefined) throw new RangeError(`unknown arm ${id}. --list prints them.`);
}

const seedCount = integer('seeds', 6);
// The separation instrument's own seed schedule, so an arm here and a set there
// are the same universes rather than two independently invented seed lists.
const seeds = separationRunSeeds(20260811, seedCount);

mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
writeFileSync(outPath, '');

const wallStart = Date.now();
let done = 0;
const total = armIds.length * seeds.length;
for (const armId of armIds) {
  const armContent = contentFor(ARMS[armId]);
  for (const runSeed of seeds) {
    const record = await runOne(armId, armContent, runSeed);
    appendFileSync(outPath, `${JSON.stringify(record)}\n`);
    done += 1;
    const elapsed = Math.round((Date.now() - wallStart) / 1000);
    process.stderr.write(
      `  ${armId} seed ${String(runSeed)} — ${String(done)}/${String(total)}, ${String(elapsed)}s elapsed\n`,
    );
  }
}
process.stderr.write(`wrote ${outPath}\n`);
