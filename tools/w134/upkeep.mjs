/*
 * Multiverse Mages — W134: is the dwarf regression the upkeep brake, or scribing?
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
 * W116 (`tools/w116/affiliation.mjs`) measured, at two hundred world years,
 * dwarf grimoires falling **242.5 -> 51.8** while dwarf living population
 * roughly doubled. Two hypotheses were on the table:
 *
 * - **H1** — `applyLibraryUpkeep` is newly *reached*: this is the first build
 *   that keeps a library deep enough to owe upkeep it cannot pay, so the books
 *   are being destroyed. `degradeLibrary` -> `destroyInstance` takes the paired
 *   `GRIMOIRE` row with the instance, so this channel can reach the metric.
 * - **H2** — dwarves are correct to suffer: the best scribe in the game
 *   (`scribeAffinity` 1792) is exactly who a shelf tax should bite.
 *
 * Both are statements about **destruction**. There is a third family the W116
 * table cannot distinguish from either, and it has to be excluded first:
 *
 * - **H3** — the books were never written. Final grimoires =
 *   cumulative scribed - cumulative destroyed, and W116 only ever reported the
 *   left-hand side.
 *
 * ## How this tool answers it
 *
 * `defineWorldSimulation` already emits everything needed, once per world tick,
 * through `lastReport()`: `grimoiresScribed`, `materialsScribed`,
 * `libraryUpkeepOwed`, `libraryUpkeepPaid`, `libraryInstancesDegraded`,
 * `materialsProduced`, `shortKinds`. **Nothing in the rules path is modified**
 * — no new RNG stream, no new draw, no reordering — so the run this observes is
 * the run that would have happened, and the seeds are W116's so the arms are
 * the same universes.
 *
 * The accumulator is guarded on `report.worldTick` advancing: the probe system
 * is appended after the world system, and a tick where the world system did not
 * run (an engagement freeze, a terminal world) leaves the previous report in
 * place. Counting it twice would inflate every total silently.
 *
 * ## The positive control
 *
 * Three instruments in this campaign have reported a confident zero while being
 * broken, so this one refuses to report until it has seen the counter fire.
 *
 * 1. `--control` calls `applyLibraryUpkeep` directly on a two-hundred-instance
 *    library with a stock of zero and asserts a shortfall and a degradation.
 *    That controls the *function*.
 * 2. Every arm reports the **first world tick at which each counter fired**, or
 *    `never`. A zero beside a sibling arm's "first fired at tick 37" is a
 *    reading; a bare zero is the failure mode above. That controls the *probe*,
 *    because those fields travel the same `lastReport()` path as the totals.
 *
 * ## Usage
 *
 *     node tools/w134/upkeep.mjs --control
 *     node tools/w134/upkeep.mjs --replicates 20 --ticks 2400 \
 *       --arms dwarf,elf,draconic,human,all-six --out /tmp/w134-after.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import {
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  OCCUPATION,
  POPULACE_COHORT,
  collectRecords,
  componentOf,
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
import {
  DEGRADATION_PER_SHORTFALL,
  LIBRARY_UPKEEP_PER_INSTANCE,
  applyLibraryUpkeep,
} from '../../packages/rules-world/dist/index.js';

/** W116's identifiers, held constant so these are the same universes. */
export const SWEEP_ID = 'w116-affiliation-v1';
export const ROOT_SEED = 20260811;

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
 * The positive control: a case where upkeep is known to be owed and unpayable.
 *
 * Asserted rather than printed, so a build in which the brake stopped biting
 * fails here instead of reporting a plausible zero downstream.
 */
export function control() {
  const distinctByTier = [200, 0, 0, 0, 0, 0, 0];
  const depth = {
    distinctByTier,
    cumulativeByTier: distinctByTier.map((_value, index) =>
      distinctByTier.slice(0, index + 1).reduce((sum, value) => sum + value, 0),
    ),
    distinctNodes: 200,
    instanceCount: 200,
    grimoireCount: 200,
  };
  const { outcomes, materialsRemaining } = applyLibraryUpkeep([{ handle: 1, depth }], 0);
  const outcome = outcomes[0];
  const expectedShortfall = 200 * LIBRARY_UPKEEP_PER_INSTANCE;
  const expectedDegraded = Math.min(200, Math.floor(expectedShortfall / DEGRADATION_PER_SHORTFALL));
  const ok =
    outcome !== undefined &&
    outcome.paid === 0 &&
    outcome.shortfall === expectedShortfall &&
    outcome.degradedInstances === expectedDegraded &&
    materialsRemaining === 0;
  if (!ok) {
    throw new Error(
      `positive control failed: ${JSON.stringify({ outcome, materialsRemaining, expectedShortfall, expectedDegraded })}`,
    );
  }
  return {
    upkeepPerInstance: LIBRARY_UPKEEP_PER_INSTANCE,
    degradationPerShortfall: DEGRADATION_PER_SHORTFALL,
    shortfall: outcome.shortfall,
    degradedInstances: outcome.degradedInstances,
  };
}

function emptyTally() {
  return {
    ticks: 0,
    // Destruction side.
    upkeepOwedTicks: 0,
    upkeepUnpayableTicks: 0,
    degradeTicks: 0,
    upkeepOwedTotal: 0,
    upkeepPaidTotal: 0,
    upkeepShortfallTotal: 0,
    instancesDegraded: 0,
    firstOwedTick: -1,
    firstUnpayableTick: -1,
    firstDegradeTick: -1,
    // Production side.
    grimoiresScribed: 0,
    materialsScribed: 0,
    scribeTicks: 0,
    researchCompleted: 0,
    lessonsTaught: 0,
    // The denominator: what the economy had to divide.
    materialsProducedTotal: 0,
    vellumProducedTotal: 0,
    vellumFinal: 0,
    vellumShortTicks: 0,
    peakPopulation: 0,
    nodesLostTotal: 0,
  };
}

function accumulate(tally, report) {
  tally.ticks += 1;
  const owed = report.libraryUpkeepOwed;
  const paid = report.libraryUpkeepPaid;
  if (owed > 0) {
    tally.upkeepOwedTicks += 1;
    if (tally.firstOwedTick < 0) tally.firstOwedTick = report.worldTick;
  }
  if (owed > paid) {
    tally.upkeepUnpayableTicks += 1;
    if (tally.firstUnpayableTick < 0) tally.firstUnpayableTick = report.worldTick;
  }
  if (report.libraryInstancesDegraded > 0) {
    tally.degradeTicks += 1;
    if (tally.firstDegradeTick < 0) tally.firstDegradeTick = report.worldTick;
  }
  tally.upkeepOwedTotal += owed;
  tally.upkeepPaidTotal += paid;
  tally.upkeepShortfallTotal += Math.max(0, owed - paid);
  tally.instancesDegraded += report.libraryInstancesDegraded;

  if (report.grimoiresScribed > 0) tally.scribeTicks += 1;
  tally.grimoiresScribed += report.grimoiresScribed;
  tally.materialsScribed += report.materialsScribed;
  tally.researchCompleted += report.researchCompleted;
  tally.lessonsTaught += report.lessonsTaught;

  tally.materialsProducedTotal += report.materialsProduced;
  tally.vellumProducedTotal += report.producedByKind.vellum;
  tally.vellumFinal = report.remainingByKind.vellum;
  // `shortKinds` is a Record keyed by material kind, not an array. Reading
  // `.length` on it yields `undefined`, and `undefined > 0` is `false` — a
  // counter that reports a confident zero forever. Named here because the first
  // draft of this tool did exactly that.
  if (report.shortKinds.vellum) tally.vellumShortTicks += 1;
  if (report.population > tally.peakPopulation) tally.peakPopulation = report.population;
  tally.nodesLostTotal += report.nodesLost;
}

/** One run: W116's two ratios, plus the flows behind them. */
export function runOne({ content, strategyId, cellIndex, replicateIndex, options, worldTickCap }) {
  const runSeed = deriveRunSeed({ rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex, replicateIndex });
  const simulation = defineWorldSimulation(content.deps);

  const tally = emptyTally();
  let lastSeenTick = -1;
  let observed = {
    living: 0,
    affiliated: 0,
    grimoires: 0,
    shelvedGrimoires: 0,
    shelvedInstances: 0,
    nodesKnown: 0,
    laborers: 0,
    scribes: 0,
    populace: 0,
  };

  const schema = defineWorld({
    components: simulation.schema.components,
    systems: [
      ...simulation.schema.systems,
      {
        name: 'w134-upkeep-probe',
        run(ctx) {
          // Guarded on the tick advancing. `lastReport()` keeps the previous
          // report when the world system did not run this tick, and counting it
          // again would inflate every total by the length of the freeze.
          const report = simulation.lastReport();
          if (report !== undefined && report.worldTick !== lastSeenTick) {
            lastSeenTick = report.worldTick;
            accumulate(tally, report);
          }

          let living = 0;
          let affiliated = 0;
          for (const { row } of collectRecords(ctx.state, MAGE)) {
            if (row.alive === 0) continue;
            living += 1;
            if (row.universityId !== 0) affiliated += 1;
          }

          const grimoires = componentOf(ctx.state, GRIMOIRE).size;
          let shelvedGrimoires = 0;
          for (const { row } of collectRecords(ctx.state, GRIMOIRE)) {
            // Through the constant. `HOLDER_KIND.library` is 2 and
            // `LOCATION_KIND.library` is 3, and the literal 3 read here counts
            // `inTransit` instead — a wrong number that looks like a right one.
            if (row.holderKind === HOLDER_KIND.library) shelvedGrimoires += 1;
          }

          const distinct = new Set();
          let shelvedInstances = 0;
          for (const { row } of collectRecords(ctx.state, KNOWLEDGE_INSTANCE)) {
            distinct.add(row.nodeId);
            if (row.locationKind === LOCATION_KIND.library) shelvedInstances += 1;
          }

          let laborers = 0;
          let scribes = 0;
          let populace = 0;
          for (const { row } of collectRecords(ctx.state, POPULACE_COHORT)) {
            populace += row.count;
            if (row.occupation === OCCUPATION.laborer) laborers += row.count;
            if (row.occupation === OCCUPATION.scribe) scribes += row.count;
          }

          observed = {
            living,
            affiliated,
            grimoires,
            shelvedGrimoires,
            shelvedInstances,
            nodesKnown: distinct.size,
            laborers,
            scribes,
            populace,
          };
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

  return { strategyId, cellIndex, replicateIndex, ...observed, ...tally };
}

function summarize(values) {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, se: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n === 1) return { n, mean, se: 0 };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  return { n, mean, se: Math.sqrt(variance / n) };
}

const SUMMARIZED = Object.freeze([
  'living',
  'affiliated',
  'grimoires',
  'shelvedGrimoires',
  'shelvedInstances',
  'nodesKnown',
  'laborers',
  'scribes',
  'populace',
  'grimoiresScribed',
  'materialsScribed',
  'instancesDegraded',
  'upkeepOwedTicks',
  'upkeepUnpayableTicks',
  'degradeTicks',
  'upkeepOwedTotal',
  'upkeepPaidTotal',
  'upkeepShortfallTotal',
  'materialsProducedTotal',
  'vellumProducedTotal',
  'vellumFinal',
  'vellumShortTicks',
  'peakPopulation',
  'nodesLostTotal',
  'researchCompleted',
  'lessonsTaught',
  'scribeTicks',
]);

function parseArgs(argv) {
  const args = { replicates: 20, ticks: 2400, out: undefined, arms: undefined, control: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--replicates') args.replicates = Number(argv[(i += 1)]);
    else if (flag === '--ticks') args.ticks = Number(argv[(i += 1)]);
    else if (flag === '--out') args.out = argv[(i += 1)];
    else if (flag === '--arms') args.arms = String(argv[(i += 1)]).split(',');
    else if (flag === '--control') args.control = true;
  }
  return args;
}

function firstOf(runs, key) {
  const fired = runs.map((run) => run[key]).filter((tick) => tick >= 0);
  return fired.length === 0 ? null : Math.min(...fired);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const controlResult = control();
  process.stdout.write(
    `positive control: one 200-instance library, stock 0 -> shortfall ${String(controlResult.shortfall)} fp, ` +
      `${String(controlResult.degradedInstances)} instances degraded ` +
      `(upkeep/instance ${String(controlResult.upkeepPerInstance)}, degradation/shortfall ${String(controlResult.degradationPerShortfall)})\n`,
  );
  if (args.control) return;

  const content = referenceContent();
  const { speciesOf, ids } = speciesTable(content.registry);
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
    const stats = {};
    for (const key of SUMMARIZED) stats[key] = summarize(runs.map((run) => run[key]));
    const row = {
      arm: arm.id,
      mask: arm.mask,
      n: runs.length,
      stats,
      // A zero here is only readable beside a sibling that fired. Null is
      // "never in any replicate of this arm", which is a finding, not a gap.
      firstOwedTick: firstOf(runs, 'firstOwedTick'),
      firstUnpayableTick: firstOf(runs, 'firstUnpayableTick'),
      firstDegradeTick: firstOf(runs, 'firstDegradeTick'),
      runsWithAnyUnpayable: runs.filter((run) => run.upkeepUnpayableTicks > 0).length,
      runsWithAnyDegrade: runs.filter((run) => run.instancesDegraded > 0).length,
      runs,
    };
    rows.push(row);
    process.stdout.write(
      `${row.arm.padEnd(10)} n=${String(row.n).padStart(3)}` +
        `  grimoires ${stats.grimoires.mean.toFixed(1)}` +
        `  scribed ${stats.grimoiresScribed.mean.toFixed(1)}` +
        `  degraded ${stats.instancesDegraded.mean.toFixed(1)}` +
        `  owedTicks ${stats.upkeepOwedTicks.mean.toFixed(1)}` +
        `  unpayableTicks ${stats.upkeepUnpayableTicks.mean.toFixed(1)}` +
        `  firstOwed ${String(row.firstOwedTick)}` +
        `  firstUnpayable ${String(row.firstUnpayableTick)}` +
        `  firstDegrade ${String(row.firstDegradeTick)}\n`,
    );
  }

  const report = {
    sweepId: SWEEP_ID,
    rootSeed: ROOT_SEED,
    worldTickCap: args.ticks,
    replicates: args.replicates,
    strategies: [...STRATEGIES],
    control: controlResult,
    rows,
  };
  if (args.out !== undefined) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`wrote ${args.out}\n`);
  }
}

if (process.argv[1]?.endsWith('upkeep.mjs')) main();
