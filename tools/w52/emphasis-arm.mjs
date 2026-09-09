/*
 * Multiverse Mages — W52: does a god's emphasis reorder the queue, or only
 * hurry it along?
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
 * ## What this measures
 *
 * `encourageResearch` is the god's only verb that names a *cell* as a
 * preference, and until this workstream it was implemented as a **rate** — it
 * fed `research-rate`, so an encouraged cell was researched faster and never
 * chosen sooner. `docs/design/strategy-dimensionality.md` measured what that
 * costs: cross-strategy containment **1.000** for every pair inside v1, because
 * every universe walks one cost queue and one set therefore always contains the
 * other.
 *
 * Three arms answer the two questions that separates:
 *
 * | arm | build | `--emphasis` | what the verb does |
 * |---|---|---|---|
 * | A | `main` at the branch point | `on` | a rate, and nothing else |
 * | B | this branch | `on` | a preference, and nothing else |
 * | C | this branch | `off` | nothing at all |
 *
 * **B − C is the preference term. A − C is the rate removal.** Neither is
 * readable from a two-arm before-and-after, which is why there are three.
 *
 * ## Compatible with W15's analysis on purpose
 *
 * The arm files this writes have the shape `tools/w15/run-arm.mjs` writes, so
 * `tools/w15/analyse.mjs` reads them unmodified and the containment, spectrum,
 * `betweenShare` and prefix-fidelity figures are computed by the same code that
 * produced the numbers in the record. Reimplementing containment here would
 * produce a figure that *looks* comparable to the table in
 * `strategy-dimensionality.md` and is not.
 *
 * The seeds, sweep id and two starting positions are W15's, restated rather
 * than imported for the reason `tools/w46/affinity-arms.mjs` gives: W15's
 * `run-arm.mjs` calls `main()` at module scope, so importing it runs an arm.
 *
 * ## Two things this probe reads that W15's did not
 *
 * - **Encouraged cells, every sample.** If containment does not move, "the term
 *   is too weak" and "every bot encouraged the same cells" are different
 *   findings and only one of them is about the term. `narrow-depth` and
 *   `portal-rush` both take slot 0 of `encourageResearch`, which is the same
 *   cell ranking, so correlated encouragement is a live possibility rather than
 *   a hypothetical.
 * - **A reconstructed `permit-then-idle`.** The campaign's negative control is
 *   documented in `docs/design/campaign-plan.md` — *"permit actions for 140 of
 *   2400 ticks, then an empty preference list for the rest"* — and it is **not
 *   on `main`**; the commits carrying it were never merged. It is rebuilt here
 *   as a host-side probe rather than added to `BOT_POOL`, because a probe that
 *   ships is a ninth competitor in every tournament that has already been run.
 *   Its win rate is comparable **between these arms** and not to the 38/40 in
 *   the record, which came from a ten-strategy pool on a different build.
 *
 * ## Usage
 *
 *     node tools/w52/emphasis-arm.mjs --emphasis on --replicates 6 \
 *       --out .w52/arm-b --tag arm-b
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import { CONTENT_FILES, loadContent, memorySource } from '../../packages/content/dist/index.js';
import {
  ENCOURAGED_CELL,
  KNOWLEDGE_INSTANCE,
  collectRecords,
} from '../../packages/state/dist/index.js';
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';
import { GOD_ACTION, createSession } from '../../packages/agent-api/dist/index.js';
import {
  ASCENSION_STANCE,
  BOT_POOL,
  adaptAgentSession,
  botStrategyRegistry,
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

/** `ERA_TICKS` in `contracts.md` §1.1. Composition is sampled on this grid. */
const ERA_TICKS = 240;

/** W15's sweep id. Part of the seed; holding it constant is the point. */
const SWEEP_ID = 'w15-dimensionality-v1';

/** W15's root seed, matching the committed ascension sweep. */
const ROOT_SEED = 20260811;

/** W15's two starting positions: cell 0 the sparse corner, cell 3 the rich one. */
const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

/** The eight shipped strategies plus the reconstructed idle probe. */
const POOL = Object.freeze([
  'passive-control',
  'uniform-random-legal',
  'permissive-breadth',
  'narrow-depth',
  'denial-warden',
  'archivist',
  'portal-rush',
  'worship-maximizer',
  'permit-then-idle',
]);

/** How many rounds the idle probe spends permitting. One round is one world tick. */
const IDLE_PROBE_ROUNDS = 140;

/**
 * The campaign's negative control, reconstructed.
 *
 * Permits a technique and a form on a rotation for its first
 * {@link IDLE_PROBE_ROUNDS} rounds and then returns an empty preference list
 * forever, which `policyFor` turns into `noop`. The rotations are the 1-based
 * ids `strategies.ts` uses; naming `0` would be refused by the dispatch and the
 * probe would quietly buy less than it claims.
 *
 * **A reconstruction, and labelled as one.** The original is described in
 * `docs/design/campaign-plan.md` and lives on branches that were never merged.
 */
const PERMIT_THEN_IDLE = Object.freeze({
  strategyId: 'permit-then-idle',
  version: 1,
  hypothesis:
    'Whether the god has anything to do after permitting. It buys the grid and then submits ' +
    'nothing, so every verb that acts on a running universe is measured as a difference from a ' +
    'god who has already stopped playing.',
  ascension: {
    when: ASCENSION_STANCE.whenEligible,
    because:
      'It has to be able to score, or its win rate measures its silence about ascension rather ' +
      'than its silence about everything else. Declaring when eligible is the stance every other ' +
      'unrestricted strategy in the pool takes, so the comparison is one variable.',
  },
  signatureActions: [GOD_ACTION.permitTechnique, GOD_ACTION.permitForm],
  preferences: ({ round }) =>
    round >= IDLE_PROBE_ROUNDS
      ? []
      : [
          { action: GOD_ACTION.permitTechnique, parameter: 1 + (round % 5) },
          { action: GOD_ACTION.permitForm, parameter: 1 + (round % 14) },
        ],
});

/** The registry the arms run against: the shipped pool plus the probe. */
const REGISTRY = botStrategyRegistry([...BOT_POOL, PERMIT_THEN_IDLE]);

/** Where the shipped content files live, relative to this file. */
const DATA_DIR = new URL('../../packages/content/data/', import.meta.url);

/**
 * The content, with the emphasis term optionally neutralized.
 *
 * **Ablated through the divisor, not the bound.** Zeroing `target-bound-emphasis`
 * is the obvious move and the loader refuses it by name — *"a bound below 1
 * removes the god's emphasis from target selection entirely, which is an
 * ablation rather than a tuning value"* — which is the check doing its job:
 * an ablation should be visible as one. A divisor above the largest magnitude
 * `emphasisAt` can produce floors every emphasis to zero through `floorDiv`,
 * so the term is present in the sum, present in the breakdown, and worth
 * nothing. Same shape W46 used for affinities, and legal content either way.
 *
 * The divisor is derived from `encourage-magnitude` rather than written as a
 * literal, and the resulting term is checked to be zero before a single run
 * starts: an ablation arm that quietly failed to ablate would report the
 * treatment twice and call it a control.
 *
 * On a build where the constant does not exist (arm A, `main` before this
 * change), `--emphasis off` is refused rather than silently ignored.
 */
function contentFor(emphasis) {
  if (emphasis === 'on') return referenceContent();

  const documents = {};
  for (const fileName of CONTENT_FILES) {
    documents[fileName] = JSON.parse(readFileSync(new URL(fileName, DATA_DIR), 'utf8'));
  }
  const weights = documents['autonomy-weight.json'];
  const divisor = weights.find((record) => record.id === 'target-emphasis-divisor');
  if (divisor === undefined) {
    throw new Error(
      'This build has no `target-emphasis-divisor` in autonomy-weight.json, so there is no ' +
        'emphasis term to ablate. `--emphasis off` is only meaningful on the branch that adds it.',
    );
  }
  const magnitude = documents['god-constant.json'].find(
    (record) => record.id === 'encourage-magnitude',
  );
  if (magnitude === undefined) throw new Error('no `encourage-magnitude` in god-constant.json.');
  divisor.value = magnitude.value + 1;
  if (Math.floor(magnitude.value / divisor.value) !== 0) {
    throw new Error(
      `A divisor of ${String(divisor.value)} does not floor an emphasis of ` +
        `${String(magnitude.value)} to zero, so this arm is not the control it claims to be.`,
    );
  }
  const files = {};
  for (const fileName of CONTENT_FILES) files[fileName] = JSON.stringify(documents[fileName]);
  return referenceContent(loadContent(memorySource(files, 'w52-emphasis-off')));
}

/** Distinct node ids held, and instances per node, read off one state. */
function compositionOf(state) {
  const counts = new Map();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    counts.set(row.nodeId, (counts.get(row.nodeId) ?? 0) + 1);
  }
  const nodeIds = [...counts.keys()].sort((a, b) => a - b);
  return { nodeIds, counts: nodeIds.map((id) => counts.get(id)) };
}

/** Which cells carry a live emphasis on this tick, ascending. */
function encouragedOn(state, worldTick) {
  return collectRecords(state, ENCOURAGED_CELL)
    .filter(({ row }) => row.expiryTick > worldTick)
    .map(({ row }) => row.cellId)
    .sort((a, b) => a - b);
}

/**
 * One run, with composition and live emphasis sampled every era boundary.
 *
 * The probe draws no randomness and mutates nothing, exactly as W15's does;
 * {@link probeIsInert} is the check rather than the claim.
 */
function runOne(input) {
  const {
    content,
    strategyId,
    coordinates,
    options = {},
    worldTickCap = 2400,
    probe = true,
    sampleEveryTicks = ERA_TICKS,
  } = input;

  const runSeed = deriveRunSeed(coordinates);
  const simulation = defineWorldSimulation(content.deps);

  const samples = [];
  /** Every cell that ever carried an emphasis, and how many samples saw it. */
  const encouragedSeen = new Map();
  let liveState;
  let sampledAt = -1;

  const schema = probe
    ? defineWorld({
        components: simulation.schema.components,
        systems: [
          ...simulation.schema.systems,
          {
            name: 'w52-emphasis-probe',
            run(ctx) {
              liveState = ctx.state;
              for (const cellId of encouragedOn(ctx.state, ctx.tick)) {
                encouragedSeen.set(cellId, (encouragedSeen.get(cellId) ?? 0) + 1);
              }
              if (ctx.tick % sampleEveryTicks === 0 && ctx.tick !== sampledAt) {
                sampledAt = ctx.tick;
                samples.push({
                  worldTick: ctx.tick,
                  ...compositionOf(ctx.state),
                  encouraged: encouragedOn(ctx.state, ctx.tick),
                });
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
      buildReferenceState({
        runSeed: seed,
        options: referenceOptions(config),
        content,
        schema,
      }),
  };

  const raw = createSession({ scenario, agentSlotIndex: 0, strategyId });
  const session = adaptAgentSession(raw);

  const episode = runEpisode({
    session,
    runSeed,
    scenarioConfig: { worldTickCap, options },
    policies: policiesForRun({ registry: REGISTRY, strategies: [strategyId], runSeed }),
    worldTickCap,
  });

  const terminal =
    liveState === undefined
      ? { worldTick: 0, nodeIds: [], counts: [] }
      : { worldTick: episode.ticksRun, ...compositionOf(liveState) };

  return {
    strategyId,
    coordinates,
    runSeed,
    options,
    status: episode.status,
    terminalReason: episode.terminalReason,
    ticksRun: episode.ticksRun,
    snapshotHash: raw.snapshotHash(),
    samples,
    terminal,
    /** Cell id → ticks it spent under emphasis. Empty for a god that never encouraged. */
    encouragedTicks: Object.fromEntries([...encouragedSeen.entries()].sort((a, b) => a[0] - b[0])),
  };
}

/** A probed and an unprobed run at the same coordinates must be the same run. */
function probeIsInert(content, strategyId, coordinates, worldTickCap) {
  const withProbe = runOne({ content, strategyId, coordinates, worldTickCap, probe: true });
  const without = runOne({ content, strategyId, coordinates, worldTickCap, probe: false });
  return {
    strategyId,
    agrees:
      withProbe.snapshotHash === without.snapshotHash &&
      withProbe.terminalReason === without.terminalReason &&
      withProbe.ticksRun === without.ticksRun,
    probed: {
      snapshotHash: withProbe.snapshotHash,
      terminalReason: withProbe.terminalReason,
      ticksRun: withProbe.ticksRun,
    },
    unprobed: {
      snapshotHash: without.snapshotHash,
      terminalReason: without.terminalReason,
      ticksRun: without.ticksRun,
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const emphasis = args.emphasis ?? 'on';
  if (emphasis !== 'on' && emphasis !== 'off') {
    throw new Error(`--emphasis takes "on" or "off", not ${String(emphasis)}.`);
  }
  const strategies = (args.strategies ?? POOL.join(',')).split(',').filter(Boolean);
  const replicates = Number(args.replicates ?? 6);
  const worldTickCap = Number(args.ticks ?? 2400);
  const out = args.out ?? '.w52/out';
  const tag = args.tag ?? 'arm';

  const resolved = contentFor(emphasis);
  mkdirSync(out, { recursive: true });

  if (args.inert !== undefined) {
    const report = probeIsInert(
      resolved,
      args.inert,
      { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: 0, replicateIndex: 0 },
      worldTickCap,
    );
    process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
    return;
  }

  for (const strategyId of strategies) {
    const runs = [];
    const started = Date.now();
    for (const cell of CELLS) {
      for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
        const run = runOne({
          content: resolved,
          strategyId,
          coordinates: {
            rootSeed: ROOT_SEED,
            sweepId: SWEEP_ID,
            cellIndex: cell.cellIndex,
            replicateIndex,
          },
          options: { ...cell.options },
          worldTickCap,
        });
        runs.push(run);
        process.stderr.write(
          `${tag} ${strategyId} cell=${String(cell.cellIndex)} rep=${String(replicateIndex)} ` +
            `ticks=${String(run.ticksRun)} reason=${String(run.terminalReason)} ` +
            `nodes=${String(run.terminal.nodeIds.length)} ` +
            `cells=${Object.keys(run.encouragedTicks).length}\n`,
        );
      }
    }
    const path = join(out, `${tag}__${strategyId}.json`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          tag,
          emphasis,
          sweepId: SWEEP_ID,
          rootSeed: ROOT_SEED,
          strategyId,
          foundingSpeciesMask: null,
          worldTickCap,
          replicates,
          cells: CELLS,
          wallClockMs: Date.now() - started,
          runs,
        },
        null,
        1,
      )}\n`,
    );
    process.stderr.write(`${tag} wrote ${path}\n`);
  }
}

main();
