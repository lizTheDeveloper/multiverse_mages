/*
 * Multiverse Mages — W46: does the species affinity term move node *sets*?
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
 * ## The question
 *
 * W20 gave target selection six terms, one of which reads a species'
 * `affinities` out of `species.json` (`autonomy/target-appeal.ts`, the
 * `affinity` term, divisor 2, bound `fp(384)`). It is the only term that is
 * *orthogonal to tier* apart from `role`, and the module's own note says so:
 * the tier-proportional terms bend one queue, `affinity` and `role` are what can
 * make two universes hold genuinely different **sets**.
 *
 * Nobody has measured whether it does. W20's headline — gnome vs human, Jaccard
 * 0.57 — cannot be about this term, because **gnome and human are precisely the
 * two shipped species with no affinity that is live in v1**: gnome's are
 * `imaginem` and `vim`, human's table is empty, and the v1 rectangle is
 * `{intellego, perdo, rego} × {limen, mentem, nomen, terram}`. Seven of the
 * eleven authored affinity entries name forms no v1 cell uses.
 *
 * ## The design: an ablation, not a species comparison
 *
 * Comparing two species arms confounds `affinities` with the other seven traits
 * and with founding order (W19 records that confound). So the primary arm pair
 * is the **same species, same seeds, affinities on versus stripped** — a content
 * ablation, which isolates the term exactly.
 *
 * `human` is the negative control: its authored table is already empty, so the
 * stripped registry is the shipped one for that arm and the two sides must
 * agree on the snapshot hash. If they do not, the ablation harness itself is
 * moving the universe and every other number here is void.
 *
 * ## Usage
 *
 *     node tools/w46/affinity-arms.mjs --replicates 3 --ticks 2400 --out .w46
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTENT_FILES, loadContent, memorySource } from '../../packages/content/dist/index.js';
import { referenceContent } from '../../packages/scenario/dist/index.js';

import { runOne } from '../w15/composition.mjs';

/*
 * W15's coordinates, restated rather than imported: `tools/w15/run-arm.mjs`
 * calls `main()` at module scope, so importing its constants would execute a
 * whole arm. They are copied verbatim and named here so the two measurements
 * sit on the same seeds and the same two starting positions — which is what
 * makes this comparable to the W15/W19/W20 tables at all.
 */
const SWEEP_ID = 'w15-dimensionality-v1';
const ROOT_SEED = 20260811;
const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

/** Where the shipped content files live, relative to this file. */
const DATA_DIR = new URL('../../packages/content/data/', import.meta.url);

/**
 * The founding species mask bit per species.
 *
 * `reference-universe.ts`: *"Bit i selects the ith species `speciesTable`
 * enumerates"*, and that table walks `registry.species`. **That is not
 * `species.json` order** — the loader interns alphabetically, so the shipped
 * file's `human, elf, dwarf, draconic, gnome, orc` becomes `draconic, dwarf,
 * elf, gnome, human, orc` and bit 0 is *draconic*. Reading the order off the
 * file cost this measurement one wrong arm before it was caught; it is read off
 * the registry, which is the thing the mask is actually indexed against.
 */
function speciesOrder(registry) {
  return registry.species.map((entry) => entry.record.id);
}

/** The shipped content documents, as a mutable object keyed by file name. */
function shippedDocuments() {
  const documents = {};
  for (const fileName of CONTENT_FILES) {
    documents[fileName] = JSON.parse(readFileSync(new URL(fileName, DATA_DIR), 'utf8'));
  }
  return documents;
}

/** A registry, optionally with every species' `affinities` emptied. */
function registryOf(stripAffinities) {
  const documents = shippedDocuments();
  if (stripAffinities) {
    for (const record of documents['species.json']) record.affinities = {};
  }
  const files = {};
  for (const fileName of CONTENT_FILES) files[fileName] = JSON.stringify(documents[fileName]);
  return loadContent(memorySource(files, stripAffinities ? 'w46-no-affinity' : 'w46-shipped'));
}

/** |A ∩ B| / |A ∪ B|, with two empty sets counted as identical. */
function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) return 1;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Members of `a` that `b` lacks. */
function uniqueTo(a, b) {
  const right = new Set(b);
  return [...new Set(a)].filter((value) => !right.has(value));
}

/** The union of every *surviving* run's node set in an arm. */
function unionOf(runs, pick) {
  const out = new Set();
  for (const run of runs) {
    const set = pick(run);
    if (set === undefined) continue;
    for (const nodeId of set) out.add(nodeId);
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * One run's node set at a world tick, or `undefined` if the run had ended.
 *
 * `undefined` rather than an empty set, and the difference matters more than it
 * reads: a single-species universe can go extinct, and several of these do. A
 * run that ended at tick 1,294 has no reading at 2,400, and counting it as
 * "held nothing" would make an arm that died young look like an arm that
 * learned nothing — which is the one confusion this whole measurement could
 * produce and not notice.
 */
function setAt(run, worldTick) {
  if (worldTick === null) return run.terminal.nodeIds;
  const sample = run.samples.find((entry) => entry.worldTick === worldTick);
  return sample === undefined ? undefined : sample.nodeIds;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  // Re-reporting a written arm file is free; re-running the arms is twenty
  // minutes. The tables are the part that gets revised.
  if (args.from !== undefined) {
    report(JSON.parse(readFileSync(args.from, 'utf8')).arms);
    return;
  }
  const replicates = Number(args.replicates ?? 3);
  const worldTickCap = Number(args.ticks ?? 2400);
  const out = args.out ?? '.w46';
  const strategyId = args.strategy ?? 'passive-control';
  const wanted = (args.species ?? 'dwarf,elf,human,gnome').split(',').filter(Boolean);

  const registries = { on: registryOf(false), off: registryOf(true) };
  const order = speciesOrder(registries.on);
  const contents = {
    on: referenceContent(registries.on),
    off: referenceContent(registries.off),
  };

  mkdirSync(out, { recursive: true });

  const arms = [];
  for (const speciesId of wanted) {
    const index = order.indexOf(speciesId);
    if (index < 0) throw new Error(`no species "${speciesId}" in content order ${order.join(',')}`);
    const mask = 1 << index;
    for (const affinity of ['on', 'off']) {
      const runs = [];
      const started = Date.now();
      for (const cell of CELLS) {
        for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
          const run = runOne({
            content: contents[affinity],
            strategyId,
            coordinates: {
              rootSeed: ROOT_SEED,
              sweepId: SWEEP_ID,
              cellIndex: cell.cellIndex,
              replicateIndex,
            },
            options: { ...cell.options, foundingSpeciesMask: mask },
            worldTickCap,
          });
          runs.push(run);
          process.stderr.write(
            `w46 ${speciesId} affinity=${affinity} cell=${String(cell.cellIndex)} ` +
              `rep=${String(replicateIndex)} ticks=${String(run.ticksRun)} ` +
              `nodes=${String(run.terminal.nodeIds.length)} hash=${run.snapshotHash.slice(0, 12)}\n`,
          );
        }
      }
      arms.push({
        speciesId,
        affinity,
        mask,
        strategyId,
        worldTickCap,
        replicates,
        wallClockMs: Date.now() - started,
        runs,
      });
    }
  }

  const path = join(out, `w46-affinity-arms.json`);
  writeFileSync(path, `${JSON.stringify({ rootSeed: ROOT_SEED, sweepId: SWEEP_ID, arms }, null, 1)}\n`);
  process.stderr.write(`w46 wrote ${path}\n`);

  report(arms);
}

/**
 * The three tables the writeup needs, printed to stdout.
 *
 * Every table is **paired**: a horizon row only counts a run pair in which
 * *both* sides were still running, so a difference in node sets is never a
 * difference in how long the two universes lasted. `n` is that pair count, and
 * a row with a small `n` is a row about extinction rather than about magic.
 */
function report(arms) {
  const armOf = (speciesId, affinity) =>
    arms.find((arm) => arm.speciesId === speciesId && arm.affinity === affinity);
  const species = [...new Set(arms.map((arm) => arm.speciesId))];
  const horizons = [240, 480, 720, 1200, 1920, 2400, null];

  console.log('\n## Paired ablation: same species, same seeds, affinities on vs stripped\n');
  console.log(
    '| species | horizon | n | on union | off union | unique on | unique off | union Jaccard | ' +
      'mean per-run Jaccard | mean on | mean off |',
  );
  console.log('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const speciesId of species) {
    const on = armOf(speciesId, 'on');
    const off = armOf(speciesId, 'off');
    if (on === undefined || off === undefined) continue;
    for (const horizon of horizons) {
      const pairs = on.runs
        .map((run, index) => [setAt(run, horizon), setAt(off.runs[index], horizon)])
        .filter(([left, right]) => left !== undefined && right !== undefined);
      if (pairs.length === 0) {
        console.log(`| ${speciesId} | ${label(horizon)} | 0 | — | — | — | — | — | — | — | — |`);
        continue;
      }
      const onUnion = unionOf(pairs, (pair) => pair[0]);
      const offUnion = unionOf(pairs, (pair) => pair[1]);
      console.log(
        `| ${speciesId} | ${label(horizon)} | ${String(pairs.length)} | ${String(onUnion.length)} | ` +
          `${String(offUnion.length)} | ${String(uniqueTo(onUnion, offUnion).length)} | ` +
          `${String(uniqueTo(offUnion, onUnion).length)} | ${jaccard(onUnion, offUnion).toFixed(3)} | ` +
          `${mean(pairs.map(([l, r]) => jaccard(l, r))).toFixed(3)} | ` +
          `${mean(pairs.map(([l]) => l.length)).toFixed(1)} | ` +
          `${mean(pairs.map(([, r]) => r.length)).toFixed(1)} |`,
      );
    }
  }

  console.log('\n## Per-run pairs at terminal, with the tick each run reached\n');
  console.log('| species | cell/rep | on ticks | off ticks | on | off | Jaccard | unique on | unique off |');
  console.log('|---|---|--:|--:|--:|--:|--:|--:|--:|');
  for (const speciesId of species) {
    const on = armOf(speciesId, 'on');
    const off = armOf(speciesId, 'off');
    if (on === undefined || off === undefined) continue;
    for (const [index, run] of on.runs.entries()) {
      const other = off.runs[index];
      if (other === undefined) continue;
      console.log(
        `| ${speciesId} | ${String(run.coordinates.cellIndex)}/${String(run.coordinates.replicateIndex)} | ` +
          `${String(run.ticksRun)} | ${String(other.ticksRun)} | ` +
          `${String(run.terminal.nodeIds.length)} | ${String(other.terminal.nodeIds.length)} | ` +
          `${jaccard(run.terminal.nodeIds, other.terminal.nodeIds).toFixed(3)} | ` +
          `${String(uniqueTo(run.terminal.nodeIds, other.terminal.nodeIds).length)} | ` +
          `${String(uniqueTo(other.terminal.nodeIds, run.terminal.nodeIds).length)} |`,
      );
    }
  }

  console.log('\n## Cross-species, affinities on (confounded by every other trait)\n');
  console.log('| pair | horizon | n | A union | B union | unique A | unique B | Jaccard |');
  console.log('|---|--:|--:|--:|--:|--:|--:|--:|');
  for (let i = 0; i < species.length; i += 1) {
    for (let j = i + 1; j < species.length; j += 1) {
      const a = armOf(species[i], 'on');
      const b = armOf(species[j], 'on');
      if (a === undefined || b === undefined) continue;
      for (const horizon of horizons) {
        const left = a.runs.map((run) => setAt(run, horizon)).filter((set) => set !== undefined);
        const right = b.runs.map((run) => setAt(run, horizon)).filter((set) => set !== undefined);
        if (left.length === 0 || right.length === 0) continue;
        const leftUnion = unionOf(left, (set) => set);
        const rightUnion = unionOf(right, (set) => set);
        console.log(
          `| ${species[i]} vs ${species[j]} | ${label(horizon)} | ` +
            `${String(Math.min(left.length, right.length))} | ${String(leftUnion.length)} | ` +
            `${String(rightUnion.length)} | ${String(uniqueTo(leftUnion, rightUnion).length)} | ` +
            `${String(uniqueTo(rightUnion, leftUnion).length)} | ` +
            `${jaccard(leftUnion, rightUnion).toFixed(3)} |`,
        );
      }
    }
  }
}

/** A horizon's column label. `null` is the terminal reading. */
function label(horizon) {
  return horizon === null ? 'terminal' : String(horizon);
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

main();
