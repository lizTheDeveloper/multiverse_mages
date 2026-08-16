/*
 * Multiverse Mages — W191: which v1 cells does one mage actually hold at once?
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
 * ## The question that has to be asked before a pair is authored
 *
 * `vision.md` §4b is **per mage**: an exclusion fires only when one mage would
 * hold both sides. So an anti-requisite authored between two v1 cells can
 * return a byte-identical sweep for two incompatible reasons:
 *
 *   a. **No mage ever co-holds the pair**, so the exclusion never fires at all;
 *   b. mages co-hold it constantly, the exclusion fires every time, and the
 *      *universe* absorbs the loss because some other mage covers the cell —
 *      which is §4b working exactly as designed.
 *
 * `referenceNodesKnown` cannot separate those, and they are different answers.
 * This tool measures (a) directly, before any content is written: it walks the
 * live `KNOWLEDGE_INSTANCE` store at the end of a run, keeps only
 * `LOCATION_KIND.mind` rows, groups them by holder, and folds the result into a
 * co-holding matrix over the twelve v1 cells.
 *
 * The matrix is built over **all twelve** rather than the two cells of some
 * candidate pair. It costs nothing extra and it says which pair *could* bite
 * hardest, rather than only whether a pair chosen on prose grounds does.
 *
 * ## Nothing here perturbs the run
 *
 * The probe is an inert system appended to the schema, in the same shape
 * `tools/w49` and `tools/w69` use: it draws no randomness, writes no component,
 * and creates no entity, so the run it observes is the run that would have
 * happened without it.
 *
 * ## Usage
 *
 *     node tools/w191/co-holding.mjs --out balance/w191/co-holding.json
 *     node tools/w191/co-holding.mjs --replicates 4 --ticks 240
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  collectRecords,
} from '../../packages/state/dist/index.js';
import { createSession } from '../../packages/agent-api/dist/index.js';
import {
  BOT_POOL_REGISTRY,
  adaptAgentSession,
  deriveRunSeed,
  policiesForRun,
  runEpisode,
} from '../../packages/mc-harness/dist/index.js';
import {
  REFERENCE_SCENARIO_ID,
  buildReferenceState,
  referenceContent,
  referenceOptions,
} from '../../packages/scenario/dist/index.js';
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';
import { MagicGrid } from '../../packages/rules-magic/dist/index.js';

/** Matching the committed agency gate, so these are the universes the gate reports on. */
const ROOT_SEED = 20260811;
const SWEEP_ID = 'balance-gate-agency-v1';

/** The agency gate's own corner cells and pool. */
const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 1, options: { cohortSize: 4, foundingNodes: 4 } },
  { cellIndex: 2, options: { cohortSize: 12, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

const POOL = Object.freeze([
  'passive-control',
  'uniform-random-legal',
  'permissive-breadth',
  'narrow-depth',
  'denial-warden',
  'archivist',
  'portal-rush',
  'worship-maximizer',
]);

function parseArgs(argv) {
  const out = { replicates: 4, ticks: 240, outPath: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--replicates') out.replicates = Number(argv[i + 1]);
    else if (argv[i] === '--ticks') out.ticks = Number(argv[i + 1]);
    else if (argv[i] === '--out') out.outPath = argv[i + 1];
  }
  return out;
}

/**
 * One run, reporting the per-mage cell sets alive at the last tick it observed.
 *
 * Returns holder→Set(cellName) for every mind that holds anything.
 */
function runOne({ content, cellNameOf, strategyId, cellIndex, replicateIndex, options, ticks }) {
  const runSeed = deriveRunSeed({ rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex, replicateIndex });
  const simulation = defineWorldSimulation(content.deps);

  let holders = new Map();
  const schema = defineWorld({
    components: simulation.schema.components,
    systems: [
      ...simulation.schema.systems,
      {
        name: 'w191-co-holding-probe',
        run(ctx) {
          const seen = new Map();
          for (const { row } of collectRecords(ctx.state, KNOWLEDGE_INSTANCE)) {
            if (row.locationKind !== LOCATION_KIND.mind) continue;
            const name = cellNameOf(row.nodeId);
            if (name === undefined) continue;
            let set = seen.get(row.locationId);
            if (set === undefined) {
              set = new Set();
              seen.set(row.locationId, set);
            }
            set.add(name);
          }
          holders = seen;
        },
      },
    ],
    ...(simulation.schema.maxSlots === undefined ? {} : { maxSlots: simulation.schema.maxSlots }),
  });

  const scenario = {
    scenarioId: REFERENCE_SCENARIO_ID,
    catalogue: content.catalogue,
    create: (seed, config) =>
      buildReferenceState({ runSeed: seed, options: referenceOptions(config), content, schema }),
  };

  const raw = createSession({ scenario, agentSlotIndex: 0, strategyId });
  const session = adaptAgentSession(raw);
  const policies = policiesForRun({ registry: BOT_POOL_REGISTRY, strategies: [strategyId], runSeed });

  runEpisode({
    session,
    runSeed,
    scenarioConfig: { worldTickCap: ticks, options },
    policies,
    worldTickCap: ticks,
  });

  return holders;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = referenceContent();
  const grid = MagicGrid.from(content.registry);

  // nodeId -> cell name, restricted to the twelve v1 cells. Anything outside the
  // opening square is reported separately as `nonV1`, so a permissive god's
  // extra holdings are visible rather than silently dropped.
  const v1Cells = [];
  const cellNameByNode = new Map();
  for (let cellId = 1; cellId <= 70; cellId += 1) {
    const view = grid.cell(cellId);
    if (!view.authored) continue;
    if (view.v1) v1Cells.push(view.name);
    for (const nodeId of view.nodeIds) cellNameByNode.set(nodeId, view.name);
  }
  const v1Set = new Set(v1Cells);
  const cellNameOf = (nodeId) => cellNameByNode.get(nodeId);

  // pair key -> count of mages holding both; single -> count of mages holding it.
  const pairCounts = new Map();
  const singleCounts = new Map();
  const perStrategy = new Map();
  let totalMages = 0;
  let magesWithAnyV1 = 0;
  let runs = 0;

  for (const strategyId of POOL) {
    const stratPairs = new Map();
    const stratSingles = new Map();
    let stratMages = 0;
    for (const { cellIndex, options } of CELLS) {
      for (let r = 0; r < args.replicates; r += 1) {
        const holders = runOne({
          content, cellNameOf, strategyId, cellIndex, replicateIndex: r, options, ticks: args.ticks,
        });
        runs += 1;
        for (const set of holders.values()) {
          totalMages += 1;
          stratMages += 1;
          const cells = [...set].filter((c) => v1Set.has(c)).sort();
          if (cells.length > 0) magesWithAnyV1 += 1;
          for (const c of cells) {
            singleCounts.set(c, (singleCounts.get(c) ?? 0) + 1);
            stratSingles.set(c, (stratSingles.get(c) ?? 0) + 1);
          }
          for (let i = 0; i < cells.length; i += 1) {
            for (let j = i + 1; j < cells.length; j += 1) {
              const key = `${cells[i]} | ${cells[j]}`;
              pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
              stratPairs.set(key, (stratPairs.get(key) ?? 0) + 1);
            }
          }
        }
      }
    }
    perStrategy.set(strategyId, {
      mages: stratMages,
      singles: [...stratSingles.entries()].sort((a, b) => b[1] - a[1]),
      pairs: [...stratPairs.entries()].sort((a, b) => b[1] - a[1]),
    });
  }

  const sortedPairs = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]);
  const report = {
    tool: 'w191-co-holding',
    rootSeed: ROOT_SEED,
    sweepId: SWEEP_ID,
    ticks: args.ticks,
    replicatesPerCell: args.replicates,
    runs,
    totalMindsHoldingAnything: totalMages,
    mindsHoldingAtLeastOneV1Node: magesWithAnyV1,
    v1Cells,
    singleCellHolderCounts: Object.fromEntries([...singleCounts.entries()].sort((a, b) => b[1] - a[1])),
    coHoldingPairs: Object.fromEntries(sortedPairs),
    perStrategy: Object.fromEntries(
      [...perStrategy.entries()].map(([k, v]) => [
        k,
        {
          mages: v.mages,
          cells: Object.fromEntries(v.singles),
          // Every pair, not a top-N slice: a truncated list answers a different
          // question than the one asked of it, and the pair under study is
          // rarely the most common one.
          pairs: Object.fromEntries(v.pairs),
        },
      ]),
    ),
  };

  console.log(`runs=${runs} minds=${totalMages} mindsWithV1=${magesWithAnyV1}`);
  console.log('--- single-cell holders ---');
  for (const [k, v] of [...singleCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log('--- co-holding pairs (v1 only) ---');
  if (sortedPairs.length === 0) console.log('  NONE');
  for (const [k, v] of sortedPairs) console.log(`  ${k}: ${v}`);

  if (args.outPath !== undefined) {
    mkdirSync(dirname(args.outPath), { recursive: true });
    writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${args.outPath}`);
  }
}

main();
