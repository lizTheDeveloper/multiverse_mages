/*
 * Multiverse Mages — W116: who is affiliated, and what that costs the shelves.
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
 * `completeAffiliation` had no production caller, so the only affiliated mages
 * in any universe were the ones created affiliated — the founders. An
 * unaffiliated mage may neither scribe (`scribeThroughputFor` returns zero for
 * `universityId === 0`) nor ward, so "how many mages belong to an institution"
 * is upstream of the whole scribing channel.
 *
 * This tool measures two ratios per founding species, at the end of a run:
 *
 * - **affiliated / living** — the fraction of the mage population that may
 *   scribe or ward at all.
 * - **grimoires / living** — what the shelves got out of them.
 *
 * Both are read from the entity store by an inert probe system appended to the
 * schema, exactly as `tools/w69` does it: it draws no randomness and writes
 * nothing, so the run it observes is the run that would have happened.
 *
 * ## Arms are species, because the defect reads differently per species
 *
 * `foundingSpeciesMask` is the committed instrument (`reference-universe.ts`),
 * and the arms below are its single-species levels plus the all-six control.
 * A species whose founder lives eighteen thousand months keeps scribing through
 * the whole run because *she* is affiliated; one whose founder dies at nine
 * hundred and sixty stops dead, because nobody she leaves behind ever joins
 * anything. That is the effect this tool exists to size, and it is invisible in
 * any pooled number.
 *
 * ## Usage
 *
 *     node tools/w116/affiliation.mjs --replicates 20 --ticks 2400 \
 *       --out balance/results-w116-before.json
 *
 * Run it on the unchanged tree first. The seeds are derived from a fixed
 * `sweepId` and `rootSeed`, so the same command on the changed tree runs the
 * same universes and the two files are a paired comparison rather than two
 * samples.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
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
  speciesTable,
} from '../../packages/scenario/dist/index.js';
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';

/** Part of every derived seed. Holding it constant across trees is the point. */
export const SWEEP_ID = 'w116-affiliation-v1';

/** The root seed the committed species sweep uses, so these are familiar universes. */
export const ROOT_SEED = 20260811;

/** The pool the committed species sweep assigns round-robin. */
export const STRATEGIES = Object.freeze([
  'passive-control',
  'uniform-random-legal',
  'permissive-breadth',
  'narrow-depth',
  'denial-warden',
  'archivist',
  'portal-rush',
  'worship-maximizer',
  'idle-then-declare',
  'permit-then-idle',
]);

/**
 * One run, reporting the two ratios and the counts behind them.
 *
 * The counts are reported beside the ratios rather than instead of them,
 * because a ratio over a population of four and a ratio over a population of
 * four hundred are not the same measurement and the species arms span both.
 */
export function runOne({ content, strategyId, cellIndex, replicateIndex, options, worldTickCap }) {
  const runSeed = deriveRunSeed({ rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex, replicateIndex });
  const simulation = defineWorldSimulation(content.deps);

  let observed = { living: 0, affiliated: 0, grimoires: 0, nodesKnown: 0 };
  const schema = defineWorld({
    components: simulation.schema.components,
    systems: [
      ...simulation.schema.systems,
      {
        name: 'w116-affiliation-probe',
        run(ctx) {
          let living = 0;
          let affiliated = 0;
          for (const { row } of collectRecords(ctx.state, MAGE)) {
            if (row.alive === 0) continue;
            living += 1;
            if (row.universityId !== 0) affiliated += 1;
          }
          let grimoires = 0;
          const distinct = new Set();
          for (const { row } of collectRecords(ctx.state, KNOWLEDGE_INSTANCE)) {
            distinct.add(row.nodeId);
            if (row.locationKind === LOCATION_KIND.grimoire) grimoires += 1;
          }
          observed = { living, affiliated, grimoires, nodesKnown: distinct.size };
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

  const session = adaptAgentSession(createSession({ scenario, agentSlotIndex: 0, strategyId }));
  const policies = policiesForRun({ registry: BOT_POOL_REGISTRY, strategies: [strategyId], runSeed });

  runEpisode({ session, runSeed, scenarioConfig: { worldTickCap, options }, policies, worldTickCap });

  return { strategyId, cellIndex, replicateIndex, ...observed };
}

/** Mean and standard error, the two numbers every table in `balance/` reports. */
function summarize(values) {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, se: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n === 1) return { n, mean, se: 0 };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  return { n, mean, se: Math.sqrt(variance / n) };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function parseArgs(argv) {
  const args = { replicates: 20, ticks: 2400, out: undefined, arms: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--replicates') args.replicates = Number(argv[(i += 1)]);
    else if (flag === '--ticks') args.ticks = Number(argv[(i += 1)]);
    else if (flag === '--out') args.out = argv[(i += 1)];
    else if (flag === '--arms') args.arms = String(argv[(i += 1)]).split(',');
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = referenceContent();
  const { speciesOf, ids } = speciesTable(content.registry);

  // Bit *i* of the mask selects the *i*th species `speciesTable` enumerates, and
  // zero selects all of them. The arm list is therefore derived from the shipped
  // registry rather than written down, so a content set that gains a species
  // gains an arm instead of silently dropping one.
  const arms = [
    ...ids.map((speciesId, index) => ({
      id: speciesOf(speciesId)?.id ?? `species-${String(index)}`,
      cellIndex: index,
      mask: 1 << index,
    })),
    { id: 'all-six', cellIndex: ids.length, mask: 0 },
  ].filter((arm) => args.arms === undefined || args.arms.includes(arm.id));

  const rows = [];
  for (const arm of arms) {
    const runs = [];
    for (let replicateIndex = 0; replicateIndex < args.replicates; replicateIndex += 1) {
      const strategyId = STRATEGIES[replicateIndex % STRATEGIES.length];
      runs.push(
        runOne({
          content,
          strategyId,
          cellIndex: arm.cellIndex,
          replicateIndex,
          options: { foundingSpeciesMask: arm.mask },
          worldTickCap: args.ticks,
        }),
      );
    }
    const living = summarize(runs.map((run) => run.living));
    const affiliated = summarize(runs.map((run) => run.affiliated));
    const grimoires = summarize(runs.map((run) => run.grimoires));
    const nodesKnown = summarize(runs.map((run) => run.nodesKnown));
    const row = {
      arm: arm.id,
      mask: arm.mask,
      n: runs.length,
      living,
      affiliated,
      grimoires,
      nodesKnown,
      // Ratios of the means rather than means of the per-run ratios: a run whose
      // mage population is zero has no ratio at all, and dropping it would make
      // the denominator differ between the two columns.
      affiliatedShare: ratio(affiliated.mean, living.mean),
      grimoiresPerMage: ratio(grimoires.mean, living.mean),
      runs,
    };
    rows.push(row);
    process.stdout.write(
      `${row.arm.padEnd(10)} n=${String(row.n).padStart(3)}  living ${row.living.mean.toFixed(2)}` +
        `  affiliated ${row.affiliated.mean.toFixed(2)}  share ${row.affiliatedShare.toFixed(4)}` +
        `  grimoires ${row.grimoires.mean.toFixed(2)}` +
        `  per mage ${row.grimoiresPerMage.toFixed(4)}\n`,
    );
  }

  const report = {
    sweepId: SWEEP_ID,
    rootSeed: ROOT_SEED,
    worldTickCap: args.ticks,
    replicates: args.replicates,
    strategies: [...STRATEGIES],
    rows,
  };
  if (args.out !== undefined) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`wrote ${args.out}\n`);
  }
}

if (process.argv[1]?.endsWith('affiliation.mjs')) main();
