/*
 * Multiverse Mages — W53: the same measurement W49 took, on both sides of the
 * practice gate.
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
 * ## Why this file is W49's with two columns added
 *
 * W49 measured the quantity a mētis mechanic would accrue on, before the
 * mechanic existed, and found that `permit-then-idle` — a bot that presses two
 * buttons for 140 of 2400 ticks and then does nothing — scored **1.0001×**
 * `permissive-breadth` on it. Its diagnosis was structural: no autonomy goal
 * applied magic to anything, so application was passive and an idle universe
 * applied exactly as much as a busy one.
 *
 * W53 built the missing goal. This tool is W49's, unchanged in its arithmetic,
 * with the columns that make the two sides comparable in one run:
 *
 * - **`appliedUseInstanceTicks`** — W49's original predicate, ungated. Kept
 *   byte-for-byte so that a number produced here can be set beside the record
 *   rather than beside a new dialect.
 * - **`gatedUseInstanceTicks`** — the same predicate plus the production gate
 *   `universe-effects.ts` now applies to `resource-yield`: the instance's holder
 *   must be committed to `GOAL.practice` on that node.
 * - **`teachableInstanceShare`** and **`nodesWithATeachableCopy`** — the two
 *   numbers `ages-of-magic.md` §2c quotes as 93.4% and 28-of-51, so that
 *   "publish-or-perish closed" is a measurement rather than an argument.
 * - **`practiceCompleted`** — projects that restored a quantum, off the world
 *   report, which is the cheapest reading of whether the mechanic runs at all.
 *
 * ## What it measures
 *
 * **`appliedUseInstanceTicks`** — the accrual predicate, evaluated per tick and
 * summed over a run. One credit per (instance, tick) for every knowledge
 * instance that:
 *
 * 1. sits at `mind` or `palace` (`CONTRIBUTING_LOCATION_KINDS`),
 * 2. holds `mastery >= MASTERY_ACTIVATION_THRESHOLD`,
 * 3. whose cell is `permits(ruleset, cell)` **at application time**, and
 * 4. whose node carries a `target: "universe"` effect on `resource-yield` or
 *    `build-rate`.
 *
 * Those are `gatherEffects`' four gates plus `universe-effects.ts`'s two
 * filters, restated. They are restated rather than called because the accrual
 * needs the **holder** — `row.locationId`, which is the mage's `EntityHandle`
 * for those two location kinds — and `EffectSourceInstance` drops it at
 * `universe-effects.ts:250`. The restatement is checked against the production
 * path: {@link main} compares this probe's per-tick instance count against the
 * world report's own `economicNodes`, and reports the agreement rather than
 * assuming it.
 *
 * It also reports the same total **broken down by form**, which is the
 * differentiation claim: *"a realm that irrigates accumulates Aquam mētis; one
 * that quarries accumulates Terram."*
 *
 * ## The probe is inert
 *
 * Same construction as `tools/w15/composition.mjs`: one extra system appended to
 * the reference schema, drawing no randomness and mutating nothing.
 * `--check-inert` runs a probed and an unprobed episode at the same coordinates
 * and compares snapshot hash, terminal reason and tick count.
 *
 * ## Usage
 *
 *     node tools/w49/applied-use.mjs --strategies passive-control,permit-then-idle \
 *       --replicates 4 --ticks 2400 --out .w49/applied-use.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { defineWorld } from '../../packages/sim-core/dist/index.js';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  collectRecords,
  findUniverse,
  permits,
  readRulesetForObservation,
} from '../../packages/state/dist/index.js';
import { GOAL, readCommitment } from '../../packages/rules-world/dist/index.js';
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';
import {
  DEFAULT_TEACH_THRESHOLD,
  MASTERY_ACTIVATION_THRESHOLD,
} from '../../packages/rules-magic/dist/index.js';
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

/** The two primitives `universe-effects.ts` actually spends. */
const ECONOMIC_PRIMITIVES = new Set(['resource-yield', 'build-rate']);

/** The sweep id every arm shares. Part of the seed; holding it constant is the point. */
export const SWEEP_ID = 'w49-applied-use-v1';

/** Matching the committed sweeps, so the universes are familiar ones. */
export const ROOT_SEED = 20260811;

/**
 * The committed ascension sweep's corner cells: 0 is the sparse start, 3 the
 * rich one. Both arms see both, so within-strategy variance carries starting
 * position as well as seed.
 */
export const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

/**
 * Which nodes carry an economic universe effect, and which form each sits in.
 *
 * Built once per content load, exactly as `universeEffectIndex` builds its own —
 * through the **cell**, because that is where the grid keeps the association.
 */
function economicNodeIndex(registry) {
  const formById = new Map(registry.forms.map((f) => [f.contentId, f.record]));
  const formByCell = new Map();
  const techniqueByCell = new Map();
  for (const cell of registry.cells) {
    const form = formById.get(registry.intern('form', cell.record.form));
    if (form !== undefined) formByCell.set(cell.contentId, form);
    techniqueByCell.set(cell.contentId, cell.record.technique);
  }
  const economic = new Map();
  for (const node of registry.nodes) {
    const carries = node.record.effects.some(
      (e) => e.target === 'universe' && ECONOMIC_PRIMITIVES.has(e.primitive),
    );
    if (!carries) continue;
    const cellId = registry.intern('cell', node.record.cell);
    economic.set(node.contentId, {
      form: formByCell.get(cellId)?.name ?? formByCell.get(cellId)?.id ?? String(node.record.cell),
      technique: techniqueByCell.get(cellId) ?? '?',
    });
  }
  return economic;
}

const CONTRIBUTING = new Set([LOCATION_KIND.mind, LOCATION_KIND.palace]);

/**
 * The accrual predicate, evaluated over one state.
 *
 * Returns the per-holder credit for this tick and the totals, so that the same
 * pass answers "how much" and "to whom" and "in what form".
 */
const EMPTY_TICK = {
  instances: 0,
  gated: 0,
  holders: new Map(),
  byForm: new Map(),
  heldInstances: 0,
  teachableInstances: 0,
  nodesHeld: 0,
  nodesTeachable: 0,
};

function appliedUseOf(state, economic, cells) {
  const universe = findUniverse(state);
  if (universe === 0) return EMPTY_TICK;
  const ruleset = readRulesetForObservation(state, universe);

  const holders = new Map();
  const byForm = new Map();
  let instances = 0;
  let gated = 0;

  // The teachability census, §2c's two numbers. Over **held** instances only —
  // a shelved book has no mastery in the sense the teach threshold means, and
  // `canTeach` reads a mage's own copy.
  let heldInstances = 0;
  let teachableInstances = 0;
  const nodesHeld = new Set();
  const nodesTeachable = new Set();

  // One commitment read per holder per tick, not per instance: a mage holding
  // forty nodes would otherwise be forty component lookups, and the answer is
  // the same every time.
  const commitmentOf = new Map();
  const practisedNode = (holder) => {
    if (commitmentOf.has(holder)) return commitmentOf.get(holder);
    const commitment = readCommitment(state, holder);
    const node =
      commitment !== undefined && commitment.goalId === GOAL.practice
        ? commitment.targetNodeId
        : 0;
    commitmentOf.set(holder, node);
    return node;
  };

  const permitted = new Map();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (!CONTRIBUTING.has(row.locationKind)) continue;

    heldInstances += 1;
    nodesHeld.add(row.nodeId);
    if (row.mastery >= DEFAULT_TEACH_THRESHOLD) {
      teachableInstances += 1;
      nodesTeachable.add(row.nodeId);
    }

    if (row.mastery < MASTERY_ACTIVATION_THRESHOLD) continue;
    const shape = economic.get(row.nodeId);
    if (shape === undefined) continue;
    let ok = permitted.get(row.nodeId);
    if (ok === undefined) {
      ok = permits(ruleset, cells.cellOf(row.nodeId));
      permitted.set(row.nodeId, ok);
    }
    if (!ok) continue;
    instances += 1;
    holders.set(row.locationId, (holders.get(row.locationId) ?? 0) + 1);
    byForm.set(shape.form, (byForm.get(shape.form) ?? 0) + 1);
    // The production gate, restated. `universe-effects.ts` applies it to the
    // *input* of `gatherEffects` because `EffectSourceInstance` drops the
    // holder; the same reason forces the restatement here, and `main()`'s
    // agreement check is what keeps the two honest.
    if (practisedNode(row.locationId) === row.nodeId) gated += 1;
  }
  return {
    instances,
    gated,
    holders,
    byForm,
    heldInstances,
    teachableInstances,
    nodesHeld: nodesHeld.size,
    nodesTeachable: nodesTeachable.size,
  };
}

/** One run, with the accrual predicate summed every tick. */
export function runOne(input) {
  const { content, economic, strategyId, coordinates, options = {}, worldTickCap, probe = true } = input;

  const runSeed = deriveRunSeed(coordinates);
  // `defineWorldSimulation` takes deps and nothing else — it installs its own
  // `onReport` and hands the result back through `lastReport()`. Passing a
  // second argument here silently did nothing, and the agreement check below
  // reported "clean" for every run because `report` was permanently undefined.
  // A vacuous check is worse than no check, so this reads the accessor.
  const simulation = defineWorldSimulation(content.deps);

  let appliedUseInstanceTicks = 0;
  let gatedUseInstanceTicks = 0;
  let heldInstanceTicks = 0;
  let teachableInstanceTicks = 0;
  let nodesHeldTicks = 0;
  let nodesTeachableTicks = 0;
  let practiceCompleted = 0;
  let reportedEconomicNodeTicks = 0;
  let ticksWithAnyApplication = 0;
  let ticksObserved = 0;
  let disagreements = 0;
  let ticksWithoutReport = 0;
  const holderTotals = new Map();
  const formTotals = new Map();
  let peakHolders = 0;

  const schema = probe
    ? defineWorld({
        components: simulation.schema.components,
        systems: [
          ...simulation.schema.systems,
          {
            name: 'w49-applied-use-probe',
            run(ctx) {
              const used = appliedUseOf(ctx.state, economic, content.deps.cells);
              ticksObserved += 1;
              appliedUseInstanceTicks += used.instances;
              gatedUseInstanceTicks += used.gated;
              heldInstanceTicks += used.heldInstances;
              teachableInstanceTicks += used.teachableInstances;
              nodesHeldTicks += used.nodesHeld;
              nodesTeachableTicks += used.nodesTeachable;
              if (used.instances > 0) ticksWithAnyApplication += 1;
              peakHolders = Math.max(peakHolders, used.holders.size);
              for (const [handle, n] of used.holders)
                holderTotals.set(handle, (holderTotals.get(handle) ?? 0) + n);
              for (const [form, n] of used.byForm)
                formTotals.set(form, (formTotals.get(form) ?? 0) + n);
              // The production path's own count, for the agreement check. It is
              // per contribution rather than per instance, so it is >= ours when
              // a node carries both economic primitives; never <.
              const report = simulation.lastReport();
              if (report === undefined) {
                ticksWithoutReport += 1;
              } else {
                reportedEconomicNodeTicks += report.economicNodes;
                practiceCompleted += report.practiceCompleted ?? 0;
                // The report counts **gated** resource-yield contributions plus
                // **ungated** build-rate ones, so it is compared against the
                // gated probe figure. Against the ungated one the check would
                // pass vacuously in the wrong direction now that the production
                // path gates and the old predicate does not.
                if (report.economicNodes < used.gated) disagreements += 1;
              }
            },
          },
        ],
        ...(simulation.schema.maxSlots === undefined ? {} : { maxSlots: simulation.schema.maxSlots }),
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
    status: episode.status,
    terminalReason: episode.terminalReason,
    ticksRun: episode.ticksRun,
    snapshotHash: raw.snapshotHash(),
    ticksObserved,
    appliedUseInstanceTicks,
    gatedUseInstanceTicks,
    heldInstanceTicks,
    teachableInstanceTicks,
    nodesHeldTicks,
    nodesTeachableTicks,
    practiceCompleted,
    reportedEconomicNodeTicks,
    ticksWithAnyApplication,
    disagreements,
    ticksWithoutReport,
    peakHolders,
    distinctHolders: holderTotals.size,
    byForm: Object.fromEntries([...formTotals].sort((a, b) => b[1] - a[1])),
    holderTop: [...holderTotals.values()].sort((a, b) => b - a).slice(0, 5),
  };
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

/**
 * The probe's own validity check, following `tools/w15/composition.mjs`.
 *
 * A probed and an unprobed run at the same coordinates must be the same run.
 * Reported rather than asserted, so a failure appears in the writeup as a
 * refusal to report numbers instead of as a stack trace nobody kept.
 */
export function probeIsInert(content, economic, strategyId, coordinates, options, worldTickCap) {
  const withProbe = runOne({ content, economic, strategyId, coordinates, options, worldTickCap, probe: true });
  const without = runOne({ content, economic, strategyId, coordinates, options, worldTickCap, probe: false });
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const strategies = (args.strategies ?? 'passive-control,permit-then-idle,permissive-breadth').split(',');
  const replicates = Number(args.replicates ?? 4);
  const worldTickCap = Number(args.ticks ?? 2400);
  const out = args.out;

  const content = referenceContent();
  const economic = economicNodeIndex(content.registry);
  process.stderr.write(`nodes carrying an economic universe effect: ${String(economic.size)}\n`);

  if (args['check-inert'] !== undefined || process.argv.includes('--check-inert')) {
    let allAgree = true;
    for (const strategyId of strategies) {
      for (const cell of CELLS) {
        const verdict = probeIsInert(
          content,
          economic,
          strategyId,
          { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: cell.cellIndex, replicateIndex: 0 },
          cell.options,
          worldTickCap,
        );
        allAgree = allAgree && verdict.agrees;
        process.stdout.write(
          `inert ${verdict.agrees ? 'YES' : 'NO '} ${pad(strategyId, 22)} cell=${String(cell.cellIndex)} ` +
            `${verdict.probed.snapshotHash} vs ${verdict.unprobed.snapshotHash} ` +
            `ticks ${String(verdict.probed.ticksRun)}/${String(verdict.unprobed.ticksRun)} ` +
            `reason ${String(verdict.probed.terminalReason)}/${String(verdict.unprobed.terminalReason)}\n`,
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
          economic,
          strategyId,
          coordinates: { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: cell.cellIndex, replicateIndex },
          options: cell.options,
          worldTickCap,
        });
        runs.push(run);
        process.stderr.write(
          `${strategyId} cell=${String(cell.cellIndex)} rep=${String(replicateIndex)} ` +
            `ticks=${String(run.ticksRun)} status=${run.status} ` +
            `use=${String(run.appliedUseInstanceTicks)} ` +
            `gated=${String(run.gatedUseInstanceTicks)} ` +
            `practice=${String(run.practiceCompleted)} ` +
            `(${String(Date.now() - started)}ms)\n`,
        );
      }
    }
  }

  const byStrategy = new Map();
  for (const run of runs) {
    const acc = byStrategy.get(run.strategyId) ?? {
      n: 0, use: 0, gated: 0, ticks: 0, live: 0, holders: 0, forms: new Map(), disagreements: 0,
      held: 0, teachable: 0, nodesHeld: 0, nodesTeachable: 0, practice: 0,
    };
    acc.n += 1;
    acc.use += run.appliedUseInstanceTicks;
    acc.gated += run.gatedUseInstanceTicks;
    acc.ticks += run.ticksObserved;
    acc.live += run.ticksWithAnyApplication;
    acc.holders += run.distinctHolders;
    acc.disagreements += run.disagreements;
    acc.held += run.heldInstanceTicks;
    acc.teachable += run.teachableInstanceTicks;
    acc.nodesHeld += run.nodesHeldTicks;
    acc.nodesTeachable += run.nodesTeachableTicks;
    acc.practice += run.practiceCompleted;
    for (const [form, n] of Object.entries(run.byForm)) acc.forms.set(form, (acc.forms.get(form) ?? 0) + n);
    byStrategy.set(run.strategyId, acc);
  }

  process.stdout.write(
    `\n${pad('strategy', 22)}${num('runs', 5)}${num('use/run', 12)}${num('gated/run', 12)}` +
      `${num('use/tick', 10)}${num('gated/tick', 12)}${num('practice', 10)}${num('holders', 9)}\n`,
  );
  for (const [strategyId, acc] of byStrategy) {
    process.stdout.write(
      `${pad(strategyId, 22)}${num(acc.n, 5)}${num(Math.round(acc.use / acc.n), 12)}` +
        `${num(Math.round(acc.gated / acc.n), 12)}` +
        `${num((acc.use / acc.ticks).toFixed(2), 10)}` +
        `${num((acc.gated / acc.ticks).toFixed(3), 12)}` +
        `${num(Math.round(acc.practice / acc.n), 10)}` +
        `${num((acc.holders / acc.n).toFixed(1), 9)}\n`,
    );
  }

  // Question 2: publish or perish. `ages-of-magic.md` §2c's two numbers, taken
  // the same way over every tick of every run rather than at one instant, so a
  // run that recovers late is not read as a run that never fell.
  process.stdout.write(
    `\n${pad('strategy', 22)}${num('teachable%', 12)}${num('nodes w/ copy', 15)}${num('held/tick', 12)}\n`,
  );
  for (const [strategyId, acc] of byStrategy) {
    process.stdout.write(
      `${pad(strategyId, 22)}${num(((acc.teachable / Math.max(acc.held, 1)) * 100).toFixed(1), 12)}` +
        `${num(`${(acc.nodesTeachable / Math.max(acc.ticks, 1)).toFixed(1)}/${(acc.nodesHeld / Math.max(acc.ticks, 1)).toFixed(1)}`, 15)}` +
        `${num((acc.held / Math.max(acc.ticks, 1)).toFixed(1), 12)}\n`,
    );
  }

  // Questions 1 and 3, as the two ratios the brief names. Printed rather than
  // left to a reader with a calculator, because the whole point of the exercise
  // is whether these two numbers moved.
  const useOf = (id) => {
    const acc = byStrategy.get(id);
    return acc === undefined ? undefined : { use: acc.use / acc.n, gated: acc.gated / acc.n };
  };
  const idle = useOf('permit-then-idle');
  const breadth = useOf('permissive-breadth');
  const warden = useOf('denial-warden');
  const passive = useOf('passive-control');
  const ratio = (a, b, key) =>
    a === undefined || b === undefined || b[key] === 0 ? 'n/a' : (a[key] / b[key]).toFixed(4);
  process.stdout.write(
    `\nthe two ratios this was built to move\n` +
      `  permit-then-idle / permissive-breadth  ungated: ${ratio(idle, breadth, 'use')}` +
      `   gated: ${ratio(idle, breadth, 'gated')}\n` +
      `  passive-control / denial-warden       ungated: ${ratio(passive, warden, 'use')}` +
      `   gated: ${ratio(passive, warden, 'gated')}\n`,
  );
  // Agreement with the production path.
  //
  // Two known, expected asymmetries, neither of which is a predicate mismatch:
  //
  // 1. The world report counts **contributions**, one per (instance, economic
  //    primitive), while the probe counts **instances**. A node carrying both
  //    `resource-yield` and `build-rate` is two contributions and one instance,
  //    so the report is systematically the larger.
  // 2. `universeEconomyBonuses` runs in phase 1, before mortality, work,
  //    autonomy and decay; the probe runs after all of them. So the probe sees
  //    the state at the *end* of the tick and the report describes its
  //    *beginning*. An instance gained this tick is in the probe's count and not
  //    the report's.
  //
  // Both push in opposite directions and neither is corrected here, because
  // correcting them would mean the probe re-deriving the phase order — the
  // second private rule this whole file exists to avoid. What is reported is the
  // ratio, and how often the report came in below the probe, which is the only
  // direction (2) can produce.
  const totalDisagreements = runs.reduce((a, r) => a + r.disagreements, 0);
  const totalUnreported = runs.reduce((a, r) => a + r.ticksWithoutReport, 0);
  const totalObserved = runs.reduce((a, r) => a + r.ticksObserved, 0);
  const probeTotal = runs.reduce((a, r) => a + r.appliedUseInstanceTicks, 0);
  const reportTotal = runs.reduce((a, r) => a + r.reportedEconomicNodeTicks, 0);
  process.stdout.write(
    `\nagreement with the production path\n` +
      `  ticks carrying a world report : ${String(totalObserved - totalUnreported)}/${String(totalObserved)}\n` +
      `  probe instance-ticks          : ${String(probeTotal)}\n` +
      `  report contribution-ticks     : ${String(reportTotal)}\n` +
      `  report / probe                : ${(reportTotal / Math.max(probeTotal, 1)).toFixed(4)}\n` +
      `  ticks where report < probe    : ${String(totalDisagreements)} (${((totalDisagreements / Math.max(totalObserved, 1)) * 100).toFixed(2)}%)\n`,
  );
  if (totalUnreported === totalObserved) {
    process.stdout.write('THE AGREEMENT CHECK DID NOT RUN — no tick carried a report.\n');
  }

  if (out !== undefined) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ sweepId: SWEEP_ID, rootSeed: ROOT_SEED, worldTickCap, runs }, null, 2)}\n`);
    process.stderr.write(`wrote ${out}\n`);
  }
}

main();
