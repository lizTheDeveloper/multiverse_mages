/*
 * Multiverse Mages — W69: what a founding-grant budget actually binds.
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
 * ## The question, and the one that has to be asked first
 *
 * `docs/design/campaign-plan.md` sets the measurement for the founding-grant
 * budget: *"`permit-then-idle` stops matching `permissive-breadth`'s 231-node
 * profile … If a grant budget does not move it, the budget is not doing the
 * work."*
 *
 * That is a measurement of a **pair neither half of which grants anything**.
 * `PERMIT_THEN_IDLE.preferences` submits `permitTechnique` and `permitForm` for
 * 140 rounds and an empty list thereafter; `PERMISSIVE_BREADTH.preferences`
 * submits permits, a dispensation, a funding and an encouragement, and action 8
 * appears in neither. Only `archivist` and `narrow-depth` name
 * `grantFoundingKnowledge` at all.
 *
 * So the headline measurement is a **null by construction**, and the honest
 * thing to do is prove that rather than assert it — and then measure the budget
 * where it can possibly bind. This tool does both, in that order:
 *
 * 1. **Reach.** For every strategy in the pool, how many founding grants does it
 *    actually apply over a full run? A budget can only constrain a strategy that
 *    spends. `grantsUsed` on the budget row is the count, written by the one
 *    place that applies a grant, so it cannot disagree with the rules.
 * 2. **The negative control, both endpoints.** `permit-then-idle` and
 *    `permissive-breadth` at the two controls the brief demands — budget `0`
 *    (no grants at all) and unbounded (today's behaviour) — reported as wins,
 *    mean nodes known, **and snapshot hash**. Identical hashes are the strongest
 *    available statement of a null: not "the difference was inside the noise"
 *    but "there was no difference".
 * 3. **The curve, where the budget bites.** The grant-spending strategies across
 *    the swept range, so the deliverable is a curve rather than a point.
 *
 * ## The budget is read from state, not from content
 *
 * `worldDeps` resolves the god constants once per worker and shares the frozen
 * struct across every run it executes, so a per-arm budget cannot come from
 * content at read time. It is seeded into the `grant-budget` row at founding —
 * from `god-constant.json` by default, and from the `grantBudgetStart`,
 * `grantAccrualNodes` and `grantBudgetCap` scenario options when a sweep names
 * them. Those three are registered factors, which is what makes this a swept
 * parameter rather than a number somebody guessed.
 *
 * ## Unbounded is a level, not a special case
 *
 * The "no budget" control is `grantBudgetStart: 4096`, which is the shipped
 * default and is unreachable: the grid holds 300 nodes and only prerequisite-free
 * ones in permitted cells are grantable. A sentinel would have been a branch in
 * the rules path; a large integer is the same behaviour with no branch, and the
 * hash comparison in arm 2 is what proves the two are the same run.
 *
 * ## Usage
 *
 *     node tools/w69/grant-budget.mjs --reach            # arm 1, cheap
 *     node tools/w69/grant-budget.mjs --control          # arm 2
 *     node tools/w69/grant-budget.mjs --curve            # arm 3
 *     node tools/w69/grant-budget.mjs --zero             # arm 4
 *     node tools/w69/grant-budget.mjs --all --out balance/results-w69.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import {
  EVER_KNOWN,
  GRANT_BUDGET,
  KNOWLEDGE_INSTANCE,
  collectRecords,
  componentOf,
  findUniverse,
  readRecord,
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

/** The sweep id every arm shares. Part of the derived seed; holding it constant is the point. */
export const SWEEP_ID = 'w69-grant-budget-v1';

/** Matching the committed sweeps, so the universes are familiar ones. */
export const ROOT_SEED = 20260811;

/**
 * The committed ascension sweep's corner cells: 0 is the sparse start, 3 the rich
 * one. Every arm sees both, so within-strategy variance carries the starting
 * position as well as the seed — and the two differ in `foundingNodes`, which is
 * the factor the budget most obviously interacts with.
 */
export const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

/**
 * The swept budget levels, both controls included.
 *
 * `0` means the god may make **no founding grant during the run**. It is not
 * "pure discovery": the scenario's own tick-zero seeding is `foundingNodes`, a
 * separate factor deliberately outside the budget, so a budget-0 universe still
 * starts holding one or four seeded nodes. Arm 4 is the true zero.
 *
 * `4096` is today's behaviour. A range whose endpoints are not controls cannot
 * say whether the mechanic did anything, so both ends are here.
 */
export const BUDGET_LEVELS = Object.freeze([0, 1, 2, 4, 4096]);

/** Every strategy that names action 8 in its preference list, plus the control pair. */
export const GRANTING_STRATEGIES = Object.freeze([
  'archivist',
  'narrow-depth',
  // The one strategy the smoke test observed actually landing a grant. It reaches
  // action 8 by drawing uniformly over the legal set rather than by preferring it,
  // which makes it the pool's only unbiased probe of whether the verb is reachable.
  'uniform-random-legal',
]);
export const CONTROL_PAIR = Object.freeze(['permit-then-idle', 'permissive-breadth']);

/** The whole pool, for the reach census. */
export const POOL = Object.freeze([...BOT_POOL_REGISTRY.ids]);

/**
 * One run, reporting what the budget did to it.
 *
 * No probe system is installed and nothing is appended to the schema: everything
 * reported is either the episode's own outcome or a row the rules themselves
 * wrote, so there is no inertness to argue about.
 */
export function runOne(input) {
  const { content, strategyId, cellIndex, replicateIndex, options, worldTickCap } = input;

  const runSeed = deriveRunSeed({
    rootSeed: ROOT_SEED,
    sweepId: SWEEP_ID,
    cellIndex,
    replicateIndex,
  });
  const simulation = defineWorldSimulation(content.deps);

  // An inert reader appended to the schema, exactly as `tools/w49` does it: it
  // draws no randomness and writes nothing, so the run it observes is the run
  // that would have happened. It exists because `AgentSession` publishes a
  // snapshot hash but not the state behind it, and `grantsUsed` is written by
  // the rules rather than reported by the episode.
  let ledger;
  let nodesKnown = 0;
  let everKnown = 0;
  const schema = defineWorld({
    components: simulation.schema.components,
    systems: [
      ...simulation.schema.systems,
      {
        name: 'w69-grant-budget-probe',
        run(ctx) {
          // `nodesKnown` as the campaign counts it: distinct nodes with at least
          // one surviving instance anywhere. Ever-known beside it, because the
          // accrual reads ever-known and the two diverge exactly when the loss
          // channel bites — which is a thing a budget curve has to be read against.
          const distinct = new Set();
          for (const { row } of collectRecords(ctx.state, KNOWLEDGE_INSTANCE)) {
            distinct.add(row.nodeId);
          }
          nodesKnown = distinct.size;
          everKnown = componentOf(ctx.state, EVER_KNOWN).size;

          const universe = findUniverse(ctx.state);
          if (universe === 0) return;
          if (!componentOf(ctx.state, GRANT_BUDGET).has(universe)) return;
          ledger = readRecord(ctx.state, GRANT_BUDGET, universe);
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

  // Wrapping the policy is the only place that can separate the three things a
  // zero-grant run could mean: the mask never opened action 8, or it opened and
  // the strategy never chose it, or it chose it and the rules refused. Those
  // call for three different conclusions about a budget, and `EpisodeAccounting`
  // records rejections by action but not *submissions* by action, so a bot that
  // never asks and a bot whose every ask is admitted-then-refused look identical
  // in it.
  const counters = {
    maskOpenTicks: 0,
    ticks: 0,
    grantSubmissions: 0,
    // Why the entry was clear, when it was. `candidatesEmpty` means the list had
    // nothing in it — no grantable node, or an exhausted budget. `unaffordable`
    // means the list was non-empty and `applyAffordability` cleared the entry
    // because the favor pool could not pay the cheapest grant. The two call for
    // opposite conclusions and would otherwise be one number.
    closedCandidatesEmpty: 0,
    closedUnaffordable: 0,
  };
  const policies = policiesForRun({
    registry: BOT_POOL_REGISTRY,
    strategies: [strategyId],
    runSeed,
  }).map((policy) => (observation, mask, slot) => {
    counters.ticks += 1;
    if (mask[8] === 1) {
      counters.maskOpenTicks += 1;
    } else if ((raw.candidates().get(8) ?? []).length === 0) {
      counters.closedCandidatesEmpty += 1;
    } else {
      counters.closedUnaffordable += 1;
    }
    const chosen = policy(observation, mask, slot);
    const action = typeof chosen === 'number' ? chosen : chosen?.action;
    if (action === 8) counters.grantSubmissions += 1;
    return chosen;
  });

  const episode = runEpisode({
    session,
    runSeed,
    scenarioConfig: { worldTickCap, options },
    policies,
    worldTickCap,
  });

  const accounting = episode.accounting;
  const budget = ledger;

  return {
    strategyId,
    cellIndex,
    replicateIndex,
    runSeed,
    options,
    status: episode.status,
    terminalReason: episode.terminalReason,
    ticksRun: episode.ticksRun,
    snapshotHash: raw.snapshotHash(),
    submitted: accounting?.submitted ?? null,
    rejected: accounting?.rejected ?? null,
    rejectedAsGrant: accounting?.rejectedByAction?.[8] ?? 0,
    illegalActionCount: raw.illegalActionCount(),
    ticks: counters.ticks,
    maskOpenTicks: counters.maskOpenTicks,
    closedCandidatesEmpty: counters.closedCandidatesEmpty,
    closedUnaffordable: counters.closedUnaffordable,
    grantSubmissions: counters.grantSubmissions,
    nodesKnown,
    everKnown,
    grantsUsed: budget?.grantsUsed ?? null,
    seededNodes: budget?.seededNodes ?? null,
    startingGrants: budget?.startingGrants ?? null,
  };
}

/** Every run of one (strategy, budget) arm, over both cells. */
function runArm(content, strategyId, budgetStart, replicates, worldTickCap) {
  const runs = [];
  for (const cell of CELLS) {
    for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
      runs.push(
        runOne({
          content,
          strategyId,
          cellIndex: cell.cellIndex,
          replicateIndex,
          options:
            budgetStart === null ? { ...cell.options } : { ...cell.options, grantBudgetStart: budgetStart },
          worldTickCap,
        }),
      );
    }
  }
  return runs;
}

/** `ascended` is the terminal status the tournament scores a win on. */
const isWin = (run) => run.terminalReason === 'ascensionApotheosis' || run.terminalReason === 'ascensionCanon';

const mean = (values) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

function summarize(runs) {
  const wins = runs.filter(isWin).length;
  const grants = runs.map((run) => run.grantsUsed ?? 0);
  const total = grants.reduce((a, b) => a + b, 0);
  return {
    nodesKnownMean: mean(runs.map((run) => run.nodesKnown ?? 0)),
    everKnownMean: mean(runs.map((run) => run.everKnown ?? 0)),
    closedCandidatesEmpty: runs.reduce((sum, run) => sum + (run.closedCandidatesEmpty ?? 0), 0),
    closedUnaffordable: runs.reduce((sum, run) => sum + (run.closedUnaffordable ?? 0), 0),
    n: runs.length,
    wins,
    rate: runs.length === 0 ? 0 : wins / runs.length,
    grantsUsedTotal: total,
    grantsUsedMean: runs.length === 0 ? 0 : total / runs.length,
    grantsUsedMax: grants.length === 0 ? 0 : Math.max(...grants),
    grantSubmissions: runs.reduce((sum, run) => sum + (run.grantSubmissions ?? 0), 0),
    maskOpenTicks: runs.reduce((sum, run) => sum + (run.maskOpenTicks ?? 0), 0),
    ticks: runs.reduce((sum, run) => sum + (run.ticks ?? 0), 0),
    illegalActions: runs.reduce((sum, run) => sum + (run.illegalActionCount ?? 0), 0),
    hashes: [...new Set(runs.map((run) => run.snapshotHash))].sort(),
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
    args[key.slice(2)] = next === undefined || next.startsWith('--') ? true : next;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const all = args.all === true;
  const replicates = Number(args.replicates ?? 4);
  const worldTickCap = Number(args.ticks ?? 2400);
  const content = referenceContent();
  const result = { sweepId: SWEEP_ID, rootSeed: ROOT_SEED, worldTickCap, replicates, arms: {} };

  // Written after every arm rather than once at the end. These runs are long and
  // the machine they share is not idle; an arm that completed is a measurement,
  // and losing it because a later arm was interrupted would be losing data that
  // had already been paid for.
  const save = () => {
    if (typeof args.out !== 'string') return;
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
  };

  // -------------------------------------------------------------------------
  // Arm 1: reach. Which strategies can a grant budget possibly bind?
  // -------------------------------------------------------------------------
  if (all || args.reach === true) {
    process.stdout.write('\n== arm 1: reach — founding grants applied, by strategy ==\n');
    process.stdout.write('   (budget unbounded, so this is every grant each strategy wants)\n\n');
    process.stdout.write(
      `   ${pad('strategy', 22)}${num('runs', 5)}${num('ticks', 8)}${num('mask open', 11)}` +
        `${num('no cands', 10)}${num('unafford', 10)}${num('asked', 7)}${num('granted', 9)}` +
        `${num('nodes', 8)}${num('illegal', 9)}\n`,
    );
    const reach = {};
    for (const strategyId of POOL) {
      const runs = runArm(content, strategyId, 4096, replicates, worldTickCap);
      const summary = summarize(runs);
      reach[strategyId] = summary;
      process.stdout.write(
        `   ${pad(strategyId, 22)}${num(summary.n, 5)}${num(summary.ticks, 8)}` +
          `${num(summary.maskOpenTicks, 11)}${num(summary.closedCandidatesEmpty, 10)}` +
          `${num(summary.closedUnaffordable, 10)}${num(summary.grantSubmissions, 7)}` +
          `${num(summary.grantsUsedTotal, 9)}${num(summary.nodesKnownMean.toFixed(1), 8)}` +
          `${num(summary.illegalActions, 9)}\n`,
      );
    }
    result.arms.reach = reach;
    save();
    const spenders = Object.entries(reach)
      .filter(([, s]) => s.grantsUsedTotal > 0)
      .map(([id]) => id);
    process.stdout.write(
      `\n   strategies a founding-grant budget can bind: ${spenders.length === 0 ? '(none)' : spenders.join(', ')}\n`,
    );
  }

  // -------------------------------------------------------------------------
  // Arm 2: the negative control at both endpoints.
  // -------------------------------------------------------------------------
  if (all || args.control === true) {
    process.stdout.write('\n== arm 2: the negative control, budget 0 against unbounded ==\n');
    process.stdout.write(
      '   Compared per coordinate, not by snapshot hash: the budget row is itself\n' +
        '   inside the hashed state, so `startingGrants: 0` and `4096` differ as bytes\n' +
        '   however identical the run. `deriveRunSeed` ignores the options, so the two\n' +
        '   arms share a seed at every coordinate and the outcome tuple is comparable.\n\n',
    );
    const control = {};
    for (const strategyId of CONTROL_PAIR) {
      control[strategyId] = {};
      const byBudget = {};
      for (const budget of [0, 4096]) {
        const runs = runArm(content, strategyId, budget, replicates, worldTickCap);
        byBudget[budget] = runs;
        const summary = summarize(runs);
        control[strategyId][budget] = summary;
        process.stdout.write(
          `   ${pad(strategyId, 22)} budget ${pad(budget, 6)} ` +
            `wins ${num(summary.wins, 3)}/${num(summary.n, 3)}  ` +
            `nodes ${num(summary.nodesKnownMean.toFixed(1), 7)}  ` +
            `everKnown ${num(summary.everKnownMean.toFixed(1), 7)}  ` +
            `grants ${num(summary.grantsUsedTotal, 4)}\n`,
        );
      }
      const tuple = (run) => `${run.ticksRun}/${run.terminalReason}/${run.nodesKnown}/${run.everKnown}`;
      const zero = byBudget[0].map(tuple);
      const open = byBudget[4096].map(tuple);
      const identical = zero.length === open.length && zero.every((value, i) => value === open[i]);
      control[strategyId].pairedIdentical = identical;
      control[strategyId].coordinates = zero.length;
      process.stdout.write(
        `   ${pad(strategyId, 22)} (ticksRun, terminalReason, nodesKnown, everKnown) identical at ` +
          `${String(zero.length)}/${String(zero.length)} coordinates: ` +
          `${identical ? 'YES — the budget changed nothing' : 'NO'}\n\n`,
      );
    }
    result.arms.control = control;
    save();
  }

  // -------------------------------------------------------------------------
  // Arm 3: the curve, over the strategies that actually spend.
  // -------------------------------------------------------------------------
  if (all || args.curve === true) {
    process.stdout.write('\n== arm 3: the curve, over the strategies that spend grants ==\n\n');
    const curve = {};
    for (const strategyId of GRANTING_STRATEGIES) {
      curve[strategyId] = {};
      process.stdout.write(`   ${strategyId}\n`);
      process.stdout.write(
        `      ${pad('budget', 8)}${num('wins', 6)}${num('n', 5)}${num('rate', 8)}` +
          `${num('grants', 9)}${num('nodes', 9)}${num('everKnown', 11)}\n`,
      );
      for (const budget of BUDGET_LEVELS) {
        const runs = runArm(content, strategyId, budget, replicates, worldTickCap);
        const summary = summarize(runs);
        curve[strategyId][budget] = summary;
        process.stdout.write(
          `      ${pad(budget, 8)}${num(summary.wins, 6)}${num(summary.n, 5)}` +
            `${num(summary.rate.toFixed(3), 8)}${num(summary.grantsUsedTotal, 9)}` +
            `${num(summary.nodesKnownMean.toFixed(1), 9)}${num(summary.everKnownMean.toFixed(1), 11)}\n`,
        );
      }
      process.stdout.write('\n');
    }
    result.arms.curve = curve;
    save();
  }

  // -------------------------------------------------------------------------
  // Arm 4: the true zero — nothing seeded at founding and nothing grantable after.
  // -------------------------------------------------------------------------
  if (all || args.zero === true) {
    process.stdout.write('\n== arm 4: the true zero — foundingNodes 0 and no grant budget ==\n');
    process.stdout.write(
      '   Arm 3\'s budget-0 level is not pure discovery: `foundingNodes` seeds the\n' +
        '   universe at tick zero and is outside the budget by design. This arm turns\n' +
        '   both off, which is the only configuration in which a universe holds nothing\n' +
        '   a god put there.\n\n',
    );
    process.stdout.write(
      `   ${pad('strategy', 22)}${pad('seeding', 26)}${num('wins', 6)}${num('n', 5)}${num('nodes', 9)}\n`,
    );
    const zero = {};
    for (const strategyId of [...CONTROL_PAIR, ...GRANTING_STRATEGIES]) {
      zero[strategyId] = {};
      for (const [label, options] of [
        ['foundingNodes 1, unbounded', { cohortSize: 4, foundingNodes: 1, grantBudgetStart: 4096 }],
        ['foundingNodes 0, unbounded', { cohortSize: 4, foundingNodes: 0, grantBudgetStart: 4096 }],
        ['foundingNodes 0, budget 0', { cohortSize: 4, foundingNodes: 0, grantBudgetStart: 0 }],
      ]) {
        const runs = [];
        for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
          runs.push(
            runOne({ content, strategyId, cellIndex: 0, replicateIndex, options, worldTickCap }),
          );
        }
        const summary = summarize(runs);
        zero[strategyId][label] = summary;
        process.stdout.write(
          `   ${pad(strategyId, 22)}${pad(label, 26)}${num(summary.wins, 6)}${num(summary.n, 5)}` +
            `${num(summary.nodesKnownMean.toFixed(1), 9)}\n`,
        );
      }
    }
    result.arms.zero = zero;
    save();
    process.stdout.write('\n');
  }

  save();
  if (typeof args.out === 'string') process.stdout.write(`\nWrote ${args.out}\n`);
}

main();
