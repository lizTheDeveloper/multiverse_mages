/*
 * Multiverse Mages — W60: reading the favor economy a run actually produces.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the LICENSE
 * file at the repository root — GNU Affero General Public License, either
 * version 3 of the License, or (at your option) any later version. See
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * ## Why this is not a metric in `mc-harness`
 *
 * The registered metrics cannot answer the question `daily-relevance` asks.
 * Ten of the fifteen have no production caller — `collectRunMetrics` is called
 * by nothing — and of the three gates that do run, two play no god verb at all,
 * so `favor` never leaves zero in them. The gate that does play verbs sets its
 * tolerance from a standard error pooled across arms spanning a factor of
 * forty, which is wide enough that a mechanic could double favor regeneration
 * and pass.
 *
 * So the instrument is built here, bespoke and paired, in W15's shape: the same
 * seeds on both sides of the factor, the factor supplied out of band, and a
 * probe that must prove itself inert before any number it produced is quoted.
 *
 * ## What it reads, and why those quantities
 *
 * `worship-yield` does **not** move worship. It multiplies **favor
 * regeneration** — `favor.ts`: *"the one licensed multiplier on regeneration,
 * stacked additively into `(1 + Σ)` … it does not raise `favorCap`, so a god
 * who over-invests in it simply wastes more, visibly."* That sentence names the
 * two readouts:
 *
 * - **`favorRegenerated`** — the sum over ticks of what regeneration produced
 *   *before* the pool cap. This is the quantity `worship-yield` multiplies, and
 *   it is therefore the most direct reading of the mechanic there is. It is
 *   reconstructed rather than read, because nothing writes it to state: it is
 *   `gained + discarded`, and both are recoverable per tick from the pool and
 *   the running `favorWasted` counter.
 * - **`favorWasted`** — cumulative, in `GOD_STATE`. For a god who never spends,
 *   the pool pins to its cap within a few ticks and every further point of
 *   regeneration is wasted, so *waste is the whole signal* in a passive arm. A
 *   measurement that read only `favor` would report "unchanged" for a mechanic
 *   that had doubled its input, which is exactly the failure mode this file
 *   exists to avoid.
 *
 * Alongside them, the **yield census**: which `worship-yield` nodes had an
 * instance this tick, and — separately — which of those sat in a cell the
 * ruleset **forbade**. The second list is the accounting readout for the
 * missing `permits()` check. It is computed here independently of the rule, so
 * it reports the same number whether or not the rule has been fixed, which is
 * what lets the fix be priced from a single run rather than inferred from two.
 *
 * ## Usage
 *
 *     node tools/w60/relevance-arms.mjs --replicates 3 --ticks 2400
 */

import { defineWorld, mul } from '../../packages/sim-core/dist/index.js';
import {
  EDICT,
  EDICT_KIND,
  UNIVERSE,
  attachRecord,
  godStateOrEmpty,
  permits,
  readRulesetForObservation,
  readUniverse,
  findUniverse,
} from '../../packages/state/dist/index.js';
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';
import { GOD_ACTION, createSession } from '../../packages/agent-api/dist/index.js';
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
  referenceOptions,
} from '../../packages/scenario/dist/index.js';

/** `ERA_TICKS` in `contracts.md` §1.1. The era grid every sample sits on. */
export const ERA_TICKS = 240;

/** `fp(1.0)`. */
export const FP_ONE = 1024;

/**
 * One tick's yield census, read independently of the rule under test.
 *
 * Both halves are magnitude sums rather than node counts, because the rule
 * stacks magnitudes and a count would make a `fp(384)` node and a `fp(128)`
 * node interchangeable — which is the difference the relevance term is about.
 */
function yieldCensus(state, deps, ruleset) {
  const knowledge = deps.knowledgeFor(state);
  let permittedSum = 0;
  let forbiddenSum = 0;
  let permittedNodes = 0;
  let forbiddenNodes = 0;
  let relevanceWeighted = 0;
  for (const [nodeId, magnitudes] of deps.god.worshipYieldNodes) {
    if (knowledge.instanceCount(nodeId) === 0) continue;
    const total = magnitudes.reduce((sum, value) => sum + value, 0);
    const cellId = deps.cells.cellOf(nodeId);
    if (permits(ruleset, cellId)) {
      permittedSum += total;
      permittedNodes += 1;
      const relevance = deps.god.cellRelevance?.get(cellId) ?? FP_ONE;
      for (const magnitude of magnitudes) relevanceWeighted += mul(magnitude, relevance);
    } else {
      forbiddenSum += total;
      forbiddenNodes += 1;
    }
  }
  return { permittedSum, forbiddenSum, permittedNodes, forbiddenNodes, relevanceWeighted };
}

/**
 * One run, with the favor economy sampled every tick and summarised on the era
 * grid.
 *
 * `probe: false` runs the identical episode through the unmodified schema,
 * which is what {@link probeIsInert} compares against. The probe draws no
 * randomness, writes nothing, and is appended after `god-outcome`, so every
 * quantity it reads is the one the tick actually produced.
 */
export function runOne(input) {
  const {
    content,
    strategyId,
    coordinates,
    options = {},
    worldTickCap = 2400,
    probe = true,
    sampleEveryTicks = ERA_TICKS,
    dispensations = [],
    policy,
  } = input;

  const runSeed = deriveRunSeed(coordinates);
  const simulation = defineWorldSimulation(content.deps);
  const deps = content.deps;

  const samples = [];
  const totals = {
    ticks: 0,
    worship: 0,
    favor: 0,
    favorCap: 0,
    worshipTier: 0,
    favorRegenerated: 0,
    yieldPermitted: 0,
    yieldForbidden: 0,
    yieldRelevanceWeighted: 0,
    ticksWithForbiddenYield: 0,
  };
  let previousFavor = 0;
  let previousWasted = 0;
  let last;

  const observe = (ctx) => {
    const universe = findUniverse(ctx.state);
    if (universe === 0) return;
    const record = readUniverse(ctx.state, universe);
    const god = godStateOrEmpty(ctx.state, universe);
    const ruleset = readRulesetForObservation(ctx.state, universe);
    const census = yieldCensus(ctx.state, deps, ruleset);

    // `gained + discarded`, reconstructed: `gained` is the pool's rise, and the
    // pool moves for exactly two reasons — regeneration adds and an
    // intervention spends. A tick in which the god spent therefore *understates*
    // regeneration here, and that is stated rather than corrected, because the
    // correction would need the intervention report and the report is a closure
    // this file has no honest way to read. Both sides of every arm pair are
    // understated identically, and the passive arms — where the whole point is
    // that nothing is spent — are exact.
    const gained = Math.max(record.favor - previousFavor, 0);
    const discarded = Math.max(god.favorWasted - previousWasted, 0);
    previousFavor = record.favor;
    previousWasted = god.favorWasted;

    totals.ticks += 1;
    totals.worship += record.worship;
    totals.favor += record.favor;
    totals.favorCap += record.favorCap;
    totals.worshipTier += record.worshipTier;
    totals.favorRegenerated += gained + discarded;
    totals.yieldPermitted += census.permittedSum;
    totals.yieldForbidden += census.forbiddenSum;
    totals.yieldRelevanceWeighted += census.relevanceWeighted;
    if (census.forbiddenNodes > 0) totals.ticksWithForbiddenYield += 1;

    last = {
      worldTick: ctx.tick,
      worship: record.worship,
      favor: record.favor,
      favorCap: record.favorCap,
      worshipTier: record.worshipTier,
      favorWasted: god.favorWasted,
      peakWorshipTier: god.peakWorshipTier,
      ...census,
    };
    if (ctx.tick % sampleEveryTicks === 0) samples.push(last);
  };

  const schema = probe
    ? defineWorld({
        components: simulation.schema.components,
        systems: [
          ...simulation.schema.systems,
          { name: 'w60-favor-probe', run: observe },
        ],
        ...(simulation.schema.maxSlots === undefined
          ? {}
          : { maxSlots: simulation.schema.maxSlots }),
      })
    : simulation.schema;

  const scenario = {
    scenarioId: REFERENCE_SCENARIO_ID,
    catalogue: content.catalogue,
    create: (seed, config) => {
      const state = buildReferenceState({
        runSeed: seed,
        options: referenceOptions(config, content.registry),
        content,
        schema,
      });
      // Seeded dispensations, in ascending cell id so the starting position is
      // reproducible from its own description rather than from the order an
      // arm listed its cells. Each gets its own entity, which is how
      // `interventions.ts` issues one and what `readEdicts` walks.
      for (const cellId of [...dispensations].sort((a, b) => a - b)) {
        attachRecord(state, EDICT, state.entities.create(), {
          cellId,
          kind: EDICT_KIND.dispensation,
        });
      }
      return state;
    },
  };

  const raw = createSession({ scenario, agentSlotIndex: 0, strategyId });
  const session = adaptAgentSession(raw);

  const episode = runEpisode({
    session,
    runSeed,
    scenarioConfig: { worldTickCap, options },
    // A caller may hand in its own `SlotPolicy` instead of naming a pool
    // strategy. The pool has no bot that lets a cell prosper and then outlaws
    // it, and that is the only sequence in which the missing `permits()` check
    // could ever have been observed — see `lateWardenPolicy`.
    policies: policy === undefined
      ? policiesForRun({ registry: BOT_POOL_REGISTRY, strategies: [strategyId], runSeed })
      : [policy()],
    worldTickCap,
  });

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
    totals,
    terminal: last ?? null,
  };
}

/**
 * The probe's own validity check.
 *
 * A probed and an unprobed run at the same coordinates must be the same run.
 * Reported rather than thrown, so a failure appears in the writeup as a refusal
 * to quote numbers instead of as a stack trace nobody kept.
 */
/**
 * A god who lets a cell prosper and then outlaws it.
 *
 * Holds — the passive control's own submission — for `notBefore` rounds, then
 * issues an interdiction on `cellId` every round thereafter. The repeat is not
 * redundancy: the edict budget falls with the worship tier and the resolver
 * refuses a submission over budget, so a god who issued once and stopped would
 * have her prohibition quietly lapse and the arm would be measuring that
 * instead.
 *
 * This is the missing-`permits()` demonstration, and it has to be written
 * because **no shipped bot produces the sequence**. `denial-warden` interdicts
 * from round one, which strangles the research that would have produced the
 * instances, so across ninety measured runs of the pool it never once held an
 * instanced node in a forbidden cell. That is a real finding about the pool and
 * it is also exactly why an untested null here would have been worthless.
 */
export function lateWardenPolicy(cellId, notBefore) {
  return () => {
    let round = 0;
    return () => {
      round += 1;
      if (round <= notBefore) return { action: GOD_ACTION.noop };
      return { action: GOD_ACTION.issueInterdiction, parameter: cellId };
    };
  };
}

export function probeIsInert(content, strategyId, coordinates, worldTickCap, options, dispensations) {
  const shared = { content, strategyId, coordinates, worldTickCap, options, dispensations };
  const withProbe = runOne({ ...shared, probe: true });
  const without = runOne({ ...shared, probe: false });
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

export { UNIVERSE };
