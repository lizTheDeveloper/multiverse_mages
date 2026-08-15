/*
 * Multiverse Mages — W196: how many nodes ever become teachable by rising.
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
 * ## The question, and why the answer has to be executed rather than read
 *
 * Five source files assert that `setMastery` has one rules-path caller and that
 * it only ever lowers, so a self-researched node — born at
 * `DEFAULT_INITIAL_MASTERY` (256) — can never reach `DEFAULT_TEACH_THRESHOLD`
 * (512). That is a claim about a *run*, not about a call graph, and
 * `CLAUDE.md`'s rule is that an absence claim needs execution. This tool
 * executes it.
 *
 * ## The two numbers, kept apart on purpose
 *
 * **`upwardCrossings`** — one credit per (instance, tick) where an instance's
 * mastery was observed **below** the teach threshold on the previous tick and
 * **at or above** it now. This is the headline: the number of times knowledge
 * *became* teachable by rising. It is `0` before the change, for every seed.
 *
 * **`bornTeachableNodes`** — distinct nodes whose instance was already at or
 * above the threshold the first tick the probe saw it. That is a god's founding
 * grant at `grantMastery` (1024), and it is **not** a crossing.
 *
 * Keeping them apart is what makes the headline honest. "Distinct nodes with a
 * teachable instance" is non-zero before the change and always was — every one
 * of them was handed down at 1024 and is sliding back toward its floor. The
 * question is whether anything ever comes *up*.
 *
 * `bornTeachableNodes` is also this probe's **positive control**. Both figures
 * come out of the same comparison against the same threshold, over the same
 * instance rows. A run reporting `bornTeachable > 0` has demonstrated that the
 * comparison fires; a run reporting `bornTeachable == 0` has demonstrated
 * nothing at all, and the tool says so rather than reporting `crossings=0` as
 * an answer. `CLAUDE.md`: a checker that answers about the wrong input is worse
 * than no checker, so there is a third exit for *the probe is broken*.
 *
 * ## The goal histogram travels with the crossing count
 *
 * `goalTicks` counts `GOAL_COMMITMENT` rows by goal id every tick. Without it a
 * `0` crossing count after the change is undiagnosable: it could mean the new
 * goal is never selected by the argmax, or that it is selected and its ceiling
 * is too low to matter. Those are different bugs and they have different fixes.
 *
 * ## The probe is inert
 *
 * It appends a read-only system and takes no RNG draw. `--check-inert` runs a
 * probed and an unprobed episode at the same coordinates and compares snapshot
 * hash, terminal reason and tick count, exactly as `tools/w49/applied-use.mjs`
 * does. A measurement that perturbs its own run is not a measurement.
 *
 * ## Usage
 *
 *     node tools/w196/mastery-crossings.mjs --ticks 600 --replicates 2
 *     node tools/w196/mastery-crossings.mjs --check-inert
 *
 * `--out <path>` writes the per-run records as JSON. The path is **named, not
 * globbed**: `CLAUDE.md` records an aggregator that folded every `.ndjson`
 * under a directory and silently ate a previous run's records at a different
 * `--ticks`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import {
  GOAL_COMMITMENT,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  collectRecords,
} from '../../packages/state/dist/index.js';
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';
import { DEFAULT_TEACH_THRESHOLD } from '../../packages/rules-magic/dist/index.js';
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

/** The sweep id every arm shares. Part of the seed; holding it constant is the point. */
export const SWEEP_ID = 'w196-mastery-crossings-v1';

/** Matching `tools/w49` and the committed sweeps, so the universes are familiar ones. */
export const ROOT_SEED = 20260811;

/** The committed ascension sweep's corner cells: 0 sparse, 3 rich. */
export const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

/** Mastery lives in a mind or a memory palace; a book's mastery is not a mage's. */
const HELD = new Set([LOCATION_KIND.mind, LOCATION_KIND.palace]);

/** One run, with every held instance's mastery compared against last tick's. */
export function runOne(input) {
  const {
    content,
    strategyId,
    coordinates,
    options = {},
    worldTickCap,
    probe = true,
    threshold = DEFAULT_TEACH_THRESHOLD,
  } = input;

  const runSeed = deriveRunSeed(coordinates);
  const simulation = defineWorldSimulation(content.deps);

  /** instance handle -> mastery as of the previous tick. */
  const lastMastery = new Map();
  const crossedNodes = new Set();
  const bornTeachableNodes = new Set();
  const teachableNodesEver = new Set();
  const crossingHolders = new Set();
  const goalTicks = new Map();
  let upwardCrossings = 0;
  let ticksObserved = 0;
  let peakTeachableInstances = 0;

  const schema = probe
    ? defineWorld({
        components: simulation.schema.components,
        systems: [
          ...simulation.schema.systems,
          {
            name: 'w196-mastery-crossing-probe',
            run(ctx) {
              ticksObserved += 1;
              const seen = new Set();
              let teachableNow = 0;
              for (const { handle, row } of collectRecords(ctx.state, KNOWLEDGE_INSTANCE)) {
                if (!HELD.has(row.locationKind)) continue;
                seen.add(handle);
                const previous = lastMastery.get(handle);
                lastMastery.set(handle, row.mastery);
                const teachable = row.mastery >= threshold;
                if (teachable) {
                  teachableNow += 1;
                  teachableNodesEver.add(row.nodeId);
                }
                if (previous === undefined) {
                  // First sight. Already teachable means it was created that
                  // way — a god's grant — which is the positive control, not a
                  // crossing.
                  if (teachable) bornTeachableNodes.add(row.nodeId);
                  continue;
                }
                if (previous < threshold && teachable) {
                  upwardCrossings += 1;
                  crossedNodes.add(row.nodeId);
                  crossingHolders.add(row.locationId);
                }
              }
              peakTeachableInstances = Math.max(peakTeachableInstances, teachableNow);
              // A destroyed handle must not keep its old mastery: slots are
              // reused, and a reused slot whose predecessor sat above the
              // threshold would fabricate a *downward* history for its
              // successor — or, worse, suppress a real crossing.
              for (const handle of lastMastery.keys()) {
                if (!seen.has(handle)) lastMastery.delete(handle);
              }
              for (const { row } of collectRecords(ctx.state, GOAL_COMMITMENT)) {
                goalTicks.set(row.goalId, (goalTicks.get(row.goalId) ?? 0) + 1);
              }
            },
          },
        ],
        ...(simulation.schema.maxSlots === undefined
          ? {}
          : { maxSlots: simulation.schema.maxSlots }),
      })
    : simulation.schema;

  const scenario = {
    scenarioId: REFERENCE_SCENARIO_ID,
    catalogue: content.catalogue,
    create: (seed, config) =>
      buildReferenceState({ runSeed: seed, options: referenceOptions(config), content, schema }),
  };

  const raw = createSession({ scenario, agentSlotIndex: 0, strategyId });
  const session = adaptAgentSession(raw);
  const episode = runEpisode({
    session,
    runSeed,
    scenarioConfig: { worldTickCap, options },
    policies: policiesForRun({ registry: BOT_POOL_REGISTRY, strategies: [strategyId], runSeed }),
    worldTickCap,
  });

  return {
    strategyId,
    coordinates,
    runSeed,
    options,
    threshold,
    status: episode.status,
    terminalReason: episode.terminalReason,
    ticksRun: episode.ticksRun,
    snapshotHash: raw.snapshotHash(),
    ticksObserved,
    upwardCrossings,
    nodesCrossedUp: crossedNodes.size,
    crossedNodeIds: [...crossedNodes].sort((a, b) => a - b),
    crossingHolders: crossingHolders.size,
    bornTeachableNodes: bornTeachableNodes.size,
    teachableNodesEver: teachableNodesEver.size,
    peakTeachableInstances,
    goalTicks: Object.fromEntries([...goalTicks].sort((a, b) => a[0] - b[0])),
  };
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    const next = argv[i + 1];
    args[key.slice(2)] = next === undefined || next.startsWith('--') ? 'yes' : next;
  }
  return args;
}

/** A probed and an unprobed run at the same coordinates must be the same run. */
export function probeIsInert(content, strategyId, coordinates, options, worldTickCap) {
  const withProbe = runOne({ content, strategyId, coordinates, options, worldTickCap, probe: true });
  const without = runOne({ content, strategyId, coordinates, options, worldTickCap, probe: false });
  return {
    strategyId,
    agrees:
      withProbe.snapshotHash === without.snapshotHash &&
      withProbe.terminalReason === without.terminalReason &&
      withProbe.ticksRun === without.ticksRun,
    probed: withProbe,
    unprobed: without,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const strategies = (args.strategies ?? 'passive-control,permissive-breadth').split(',');
  const replicates = Number(args.replicates ?? 2);
  const worldTickCap = Number(args.ticks ?? 600);

  const content = referenceContent();
  process.stderr.write(`teach threshold: ${String(DEFAULT_TEACH_THRESHOLD)}\n`);

  if (args['check-inert'] !== undefined) {
    let allAgree = true;
    for (const strategyId of strategies) {
      for (const cell of CELLS) {
        const verdict = probeIsInert(
          content,
          strategyId,
          { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: cell.cellIndex, replicateIndex: 0 },
          cell.options,
          worldTickCap,
        );
        allAgree = allAgree && verdict.agrees;
        process.stdout.write(
          `inert ${verdict.agrees ? 'YES' : 'NO '} ${pad(strategyId, 22)} cell=${String(cell.cellIndex)} ` +
            `${verdict.probed.snapshotHash} vs ${verdict.unprobed.snapshotHash} ` +
            `ticks ${String(verdict.probed.ticksRun)}/${String(verdict.unprobed.ticksRun)}\n`,
        );
      }
    }
    process.stdout.write(
      allAgree
        ? '\nThe probe is inert: every probed run is byte-identical to its unprobed twin.\n'
        : '\nTHE PROBE IS NOT INERT. Every number this tool produces is void.\n',
    );
    if (!allAgree) process.exitCode = 1;
    return;
  }

  const runs = [];
  for (const strategyId of strategies) {
    for (const cell of CELLS) {
      for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
        const started = Date.now();
        const run = runOne({
          content,
          strategyId,
          coordinates: {
            rootSeed: ROOT_SEED,
            sweepId: SWEEP_ID,
            cellIndex: cell.cellIndex,
            replicateIndex,
          },
          options: cell.options,
          worldTickCap,
        });
        runs.push(run);
        process.stderr.write(
          `${pad(strategyId, 20)} cell=${String(cell.cellIndex)} rep=${String(replicateIndex)} ` +
            `ticks=${String(run.ticksRun)} crossings=${String(run.upwardCrossings)} ` +
            `nodesUp=${String(run.nodesCrossedUp)} born=${String(run.bornTeachableNodes)} ` +
            `(${String(Date.now() - started)}ms)\n`,
        );
      }
    }
  }

  const totals = {
    runs: runs.length,
    upwardCrossings: 0,
    nodesCrossedUp: new Set(),
    bornTeachableNodes: new Set(),
    teachableNodesEver: new Set(),
    goalTicks: new Map(),
  };
  for (const run of runs) {
    totals.upwardCrossings += run.upwardCrossings;
    for (const id of run.crossedNodeIds) totals.nodesCrossedUp.add(id);
    for (const [goal, n] of Object.entries(run.goalTicks))
      totals.goalTicks.set(Number(goal), (totals.goalTicks.get(Number(goal)) ?? 0) + n);
  }
  const bornAnywhere = runs.reduce((acc, r) => acc + r.bornTeachableNodes, 0);

  process.stdout.write('\n');
  process.stdout.write(
    `${pad('strategy', 20)} ${pad('cell', 5)} ${pad('rep', 4)} ${num('ticks', 6)} ${num('crossings', 10)} ${num('nodesUp', 8)} ${num('born', 5)} ${num('everTeach', 10)}\n`,
  );
  for (const run of runs) {
    process.stdout.write(
      `${pad(run.strategyId, 20)} ${pad(run.coordinates.cellIndex, 5)} ${pad(run.coordinates.replicateIndex, 4)} ` +
        `${num(run.ticksRun, 6)} ${num(run.upwardCrossings, 10)} ${num(run.nodesCrossedUp, 8)} ` +
        `${num(run.bornTeachableNodes, 5)} ${num(run.teachableNodesEver, 10)}\n`,
    );
  }
  process.stdout.write(
    `\nUPWARD CROSSINGS, all runs: ${String(totals.upwardCrossings)} over ${String(totals.nodesCrossedUp.size)} distinct nodes\n`,
  );
  process.stdout.write(
    `goal (mage,tick) counts: ${[...totals.goalTicks].map(([g, n]) => `${String(g)}=${String(n)}`).join(' ')}\n`,
  );

  if (bornAnywhere === 0) {
    process.stdout.write(
      '\nTHE PROBE IS BROKEN, not the answer. No instance was ever seen at or above the\n' +
        'threshold — not even a founding grant, which is created at 1024. The comparison\n' +
        'has not been shown to fire, so a crossing count of zero means nothing.\n',
    );
    process.exitCode = 42;
  }

  if (args.out !== undefined) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify({ runs, worldTickCap }, undefined, 2)}\n`);
    process.stderr.write(`wrote ${args.out}\n`);
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('mastery-crossings.mjs')) main();
