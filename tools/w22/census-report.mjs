/*
 * Multiverse Mages — W22: the knowledge census, taken on the reference universe.
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
 * Prints what `@mm/agent-api`'s knowledge census says about a real universe:
 * the per-node counts, the fragility lists, the location split the author asked
 * for, and the per-mage containment relation W20 and W21 will be measured with.
 *
 * **Reads only.** It steps a reference universe with no god actions — the same
 * zero-input run `docs/design/vision-audit.md` Proof 3 took — and calls the
 * census. It regenerates no golden and no baseline, and it writes nothing into
 * the repository. The inertness of the census itself is a committed test
 * (`packages/scenario/test/unit/knowledge-census-inertness.test.ts`); this tool
 * re-checks it at its own horizon anyway, because a proof taken at 240 ticks is
 * not a proof at 2,400.
 *
 * ## Usage
 *
 *     npm run typecheck                        # the dist/ builds this reads
 *     node tools/w22/census-report.mjs         # defaults: seed 0x00090001, 2400 ticks
 *     node tools/w22/census-report.mjs --ticks 600 --seed 0x12340001 --json out.json
 *
 * The defaults match the audit's Proof 3 coordinates so the two tables can be
 * put side by side. They will not match exactly — this branch carries merges the
 * audit did not see — and a *shape* change (grimoire suddenly non-zero, node
 * count wildly off) is the thing worth investigating, not a drifted count.
 */

import { writeFileSync } from 'node:fs';

import { rngFromRootSeed, snapshotHash, step } from '../../packages/sim-core/dist/index.js';
import {
  knowledgeCensus,
  locationSharePerMille,
  mageContainment,
} from '../../packages/agent-api/dist/index.js';
import { referenceContent, referenceScenario } from '../../packages/scenario/dist/index.js';

/** Proof 3's coordinates, so the two tables are comparable. */
const DEFAULT_SEED = 0x0009_0001;
const DEFAULT_TICKS = 2400;

function parseArgs(argv) {
  const out = { seed: DEFAULT_SEED, ticks: DEFAULT_TICKS, json: undefined, cohortSize: 4, foundingNodes: 4 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--seed') out.seed = Number(value);
    else if (key === '--ticks') out.ticks = Number(value);
    else if (key === '--json') out.json = value;
    else if (key === '--cohort-size') out.cohortSize = Number(value);
    else if (key === '--founding-nodes') out.foundingNodes = Number(value);
    else if (key !== undefined) throw new Error(`Unknown argument ${String(key)}`);
  }
  return out;
}

/**
 * One zero-input run. `censusEvery > 0` interleaves census calls, which is the
 * arm the inertness check compares against a clean one.
 */
function play(content, { seed, ticks, cohortSize, foundingNodes }, censusEvery) {
  const run = referenceScenario(content);
  let state = run.scenario.create(seed, {
    worldTickCap: ticks,
    options: { cohortSize, foundingNodes },
  });
  for (let tick = 0; tick < ticks; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    if (censusEvery > 0 && tick % censusEvery === 0) mageContainment(knowledgeCensus(state));
  }
  return { state, hash: snapshotHash(state) };
}

function histogram(census) {
  const buckets = new Map();
  for (const entry of census.byNode) {
    const bucket =
      entry.total === 1 ? '1' : entry.total <= 4 ? '2-4' : entry.total <= 16 ? '5-16' : entry.total <= 64 ? '17-64' : '65+';
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return buckets;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = referenceContent();

  const censused = play(content, args, 12);
  const clean = play(content, args, 0);
  const inert =
    censused.hash === clean.hash &&
    censused.state.clock.worldTick === clean.state.clock.worldTick &&
    censused.state.illegalActionCount === clean.state.illegalActionCount;

  const census = knowledgeCensus(clean.state);
  const containment = mageContainment(census);
  const containmentAll = mageContainment(census, { livingOnly: false });
  const share = locationSharePerMille(census.whereKept);
  const totals = census.byNode.reduce((acc, e) => acc + e.total, 0);

  const lines = [];
  const say = (s) => lines.push(s);

  say(`# W22 knowledge census — reference universe`);
  say('');
  say(`seed 0x${args.seed.toString(16).padStart(8, '0')} · ${String(args.ticks)} ticks · zero god input`);
  say(`cohortSize ${String(args.cohortSize)} · foundingNodes ${String(args.foundingNodes)}`);
  say(`snapshot hash ${clean.hash}`);
  say('');
  say(`## Inertness — the census must move nothing`);
  say('');
  say(`censused hash  ${censused.hash}`);
  say(`clean hash     ${clean.hash}`);
  say(`INERT: ${inert ? 'yes' : 'NO — every number below is void'}`);
  say('');
  say(`## Where the physical knowledge is kept`);
  say('');
  say(`| location | instances | per mille |`);
  say(`|---|--:|--:|`);
  say(`| mind | ${String(census.whereKept.mind)} | ${String(share.mind)} |`);
  say(`| grimoire | ${String(census.whereKept.grimoire)} | ${String(share.grimoire)} |`);
  say(`| library | ${String(census.whereKept.library)} | ${String(share.library)} |`);
  say(`| palace | ${String(census.whereKept.palace)} | ${String(share.palace)} |`);
  say(`| malformed | ${String(census.whereKept.malformed)} | — |`);
  say(`| **total** | **${String(census.instanceTotal)}** | |`);
  say('');
  say(`## Per-node census`);
  say('');
  say(`| fact | value |`);
  say(`|---|--:|`);
  say(`| distinct nodes held | ${String(census.nodesHeld)} |`);
  say(`| total instances | ${String(census.instanceTotal)} |`);
  say(
    `| mean copies per node | ${census.nodesHeld === 0 ? '—' : (totals / census.nodesHeld).toFixed(1)} |`,
  );
  say(`| min redundancy | ${String(census.minRedundancy)} |`);
  say(`| max redundancy | ${String(census.maxRedundancy)} |`);
  say(`| **nodes at exactly one instance** | **${String(census.fragileNodeIds.length)}** |`);
  say(`| nodes with no written copy | ${String(census.unwrittenNodeIds.length)} |`);
  say(`| nodes whose copies share one location | ${String(census.singleLocationNodeIds.length)} |`);
  say('');
  say(`redundancy histogram: ${[...histogram(census).entries()].map(([k, v]) => `${k}:${String(v)}`).join(' · ')}`);
  if (census.fragileNodeIds.length > 0) {
    say(`single-instance node ids: ${census.fragileNodeIds.join(', ')}`);
  }
  if (census.unwrittenNodeIds.length > 0 && census.unwrittenNodeIds.length <= 40) {
    say(`unwritten node ids: ${census.unwrittenNodeIds.join(', ')}`);
  }
  say('');
  say(`## Per-mage repertoire and containment`);
  say('');
  const holders = census.repertoires.filter((r) => r.nodeIds.length > 0);
  const living = census.repertoires.filter((r) => r.alive);
  say(`| fact | value |`);
  say(`|---|--:|`);
  say(`| mage rows | ${String(census.repertoires.length)} |`);
  say(`| living mages | ${String(living.length)} |`);
  say(`| mages holding at least one node | ${String(holders.length)} |`);
  say(`| living holders (the containment population) | ${String(containment.holders)} |`);
  say(`| pairs | ${String(containment.pairs)} |`);
  say(`| **incomparable pairs** | **${String(containment.incomparablePairs)}** |`);
  say(`| strict containment pairs | ${String(containment.strictContainmentPairs)} |`);
  say(`| identical pairs | ${String(containment.identicalPairs)} |`);
  say(`| disjoint pairs | ${String(containment.disjointPairs)} |`);
  say(`| union of living repertoires | ${String(containment.unionSize)} |`);
  say(`| intersection of living repertoires | ${String(containment.intersectionSize)} |`);
  say(`| largest repertoire | ${String(containment.largestRepertoire)} |`);
  say(`| smallest repertoire | ${String(containment.smallestRepertoire)} |`);
  say(
    `| incomparable pairs including the dead | ${String(containmentAll.incomparablePairs)} of ${String(containmentAll.pairs)} |`,
  );
  const fraction =
    containment.pairs === 0 ? '—' : (containment.incomparablePairs / containment.pairs).toFixed(3);
  say('');
  say(`incomparable fraction: ${fraction}`);
  say('');
  const sample = holders.slice(0, 5);
  if (sample.length > 0) {
    say(`first ${String(sample.length)} holders, as the client would render them:`);
    for (const r of sample) {
      say(
        `  mage ${String(r.mageHandle)} (${r.alive ? 'alive' : 'dead'}): ${String(r.nodeIds.length)} nodes — ${r.nodeIds.slice(0, 12).join(', ')}${r.nodeIds.length > 12 ? ' …' : ''}`,
      );
    }
  }

  const text = lines.join('\n');
  process.stdout.write(`${text}\n`);

  if (args.json !== undefined) {
    writeFileSync(
      args.json,
      `${JSON.stringify(
        {
          seed: args.seed,
          ticks: args.ticks,
          cohortSize: args.cohortSize,
          foundingNodes: args.foundingNodes,
          inert,
          snapshotHash: clean.hash,
          censusedHash: censused.hash,
          whereKept: census.whereKept,
          share,
          nodesHeld: census.nodesHeld,
          instanceTotal: census.instanceTotal,
          minRedundancy: census.minRedundancy,
          maxRedundancy: census.maxRedundancy,
          fragileNodeIds: census.fragileNodeIds,
          unwrittenNodeIds: census.unwrittenNodeIds,
          singleLocationNodeIds: census.singleLocationNodeIds,
          containment,
          containmentAll,
        },
        undefined,
        2,
      )}\n`,
    );
  }

  if (!inert) process.exitCode = 1;
}

main();
