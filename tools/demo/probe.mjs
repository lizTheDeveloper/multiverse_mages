/*
 * Multiverse Mages — demo measurement tooling. Not the core, not shipped.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The before/after probe behind `docs/design/demo-playable.md`.
 *
 * Builds the reference scenario exactly the way `scripts/play-server.mjs`
 * builds it -- `referenceScenario(content, { raids: true })`, `createSession`,
 * `reset(seed, { worldTickCap: 4000 })` -- runs N no-op ticks with
 * `{ kind: 0 }` (the shape the play server submits, **not**
 * `record-session.mjs`'s `{ id }`, which `admit()` rejects), and prints the
 * quantities `ui/console/index.html` draws.
 *
 * `ticksRun` and `status` are reported because a quantity read off an episode
 * that ended early is not comparable with one that did not, and the table in
 * the demo doc claims both sides ran the same number of ticks.
 *
 *     node tools/demo/probe.mjs "$PWD" 20260813 400
 *
 * Run it twice on the same tree before believing any difference: identical
 * output is the cheap positive control that a diff between two trees means
 * anything at all.
 */
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2];
const SEED = Number(process.argv[3] ?? '20260813');
const TICKS = Number(process.argv[4] ?? '40');
const CAP = 4000;

const api = await import(pathToFileURL(path.join(ROOT, 'packages/agent-api/dist/index.js')).href);
const scn = await import(pathToFileURL(path.join(ROOT, 'packages/scenario/dist/index.js')).href);

const { OBSERVATION_BLOCKS, OBSERVATION_DESCRIPTORS, createSession } = api;
const { referenceContent, referenceScenario } = scn;

const content = referenceContent();
const { scenario } = referenceScenario(content, { raids: true });
const session = createSession({ scenario, strategyId: 'probe-demo-x7k2' });
session.reset(SEED, { worldTickCap: CAP });

let ticksRun = 0;
for (let t = 0; t < TICKS; t += 1) {
  if (session.status() !== 'running') break;
  session.submit({ kind: 0 });
  ticksRun += 1;
}

const norm = session.observe();
const raw = norm.map((v, i) => Math.round(v * OBSERVATION_DESCRIPTORS[i].divisor));
const blocks = Object.fromEntries(OBSERVATION_BLOCKS.map((b) => [b.name, b]));
const block = (name) => {
  const b = blocks[name];
  if (b === undefined) return null;
  return raw.slice(b.offset, b.offset + b.size);
};

const [universities, capacity, libraryDepth, grimoires] = block('institutions');

// knowledge: 70 cells x 3 channels (nodesKnown, deepestTier, redundancy).
const k = block('knowledge');
const CH = 3;
let liveCells = 0;
let nodesKnown = 0;
let deepestTierMax = 0;
let redundancy = 0;
for (let i = 0; i * CH < k.length; i += 1) {
  const at = i * CH;
  if (k[at] > 0) liveCells += 1;
  nodesKnown += k[at];
  deepestTierMax = Math.max(deepestTierMax, k[at + 1]);
  redundancy += k[at + 2];
}

// mages: species x tier slots. Slot 0 of each species is the untaught.
const m = block('mages');
const SPECIES = 8;
const SLOTS = m.length / SPECIES;
let magesLiving = 0;
let magesTaught = 0;
const perSpecies = [];
for (let s = 0; s < SPECIES; s += 1) {
  const tiers = m.slice(s * SLOTS, (s + 1) * SLOTS);
  const lv = tiers.reduce((a, b) => a + b, 0);
  const tg = tiers.slice(1).reduce((a, b) => a + b, 0);
  magesLiving += lv;
  magesTaught += tg;
  if (lv > 0) perSpecies.push({ species: s, tiers, living: lv, taught: tg });
}

console.log(JSON.stringify({
  seed: SEED,
  ticks: TICKS,
  ticksRun,
  status: session.status(),
  snapshotHash: session.snapshotHash(),
  drawn: {
    universities, capacity, libraryDepth, grimoires,
    liveCells, nodesKnown, deepestTierMax, redundancy,
    magesLiving, magesTaught,
  },
  mageTierSlots: SLOTS,
  perSpecies,
  resourcesRaw: block('resources'),
}, null, 2));
