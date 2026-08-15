/*
 * Multiverse Mages — W49: how much magic a universe actually applies to its economy.
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
 * ## The question this answers, and why it comes before any code
 *
 * `docs/design/raid-engagement.md` §11c proposes that mētis accrues from
 * **applied use**, and claims that this attacks `permit-then-idle` structurally:
 * *"the bot that permits everything and does nothing accumulates none. Not
 * because it was penalised, but because mētis is a record of practice and it did
 * not practise."*
 *
 * That claim has a precondition nobody had checked: **that an idle god's
 * universe does not apply magic to its economy anyway.** W29's wire
 * (`packages/coordination/src/universe-effects.ts`) reads
 * `KNOWLEDGE_INSTANCE` every tick and derives multipliers from it. No autonomy
 * goal casts anything; `packages/rules-world/src/autonomy/goals.ts` has nine
 * goals and not one of them applies magic. So application is **passive**, and if
 * it is passive then an idle universe practises exactly as much as a busy one
 * and the mechanic is decoration.
 *
 * This tool measures the quantity the mechanic would accrue on, before the
 * mechanic exists.
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
import { defineWorldSimulation } from '../../packages/coordination/dist/index.js';
import { MASTERY_ACTIVATION_THRESHOLD } from '../../packages/rules-magic/dist/index.js';
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
function appliedUseOf(state, economic, cells) {
  const universe = findUniverse(state);
  if (universe === 0) return { instances: 0, holders: new Map(), byForm: new Map() };
  const ruleset = readRulesetForObservation(state, universe);

  const holders = new Map();
  const byForm = new Map();
  let instances = 0;

  const permitted = new Map();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (!CONTRIBUTING.has(row.locationKind)) continue;
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
  }
  return { instances, holders, byForm };
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
                if (report.economicNodes < used.instances) disagreements += 1;
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
            `appliedUse=${String(run.appliedUseInstanceTicks)} ` +
            `holders=${String(run.distinctHolders)} ` +
            `(${String(Date.now() - started)}ms)\n`,
        );
      }
    }
  }

  const byStrategy = new Map();
  for (const run of runs) {
    const acc = byStrategy.get(run.strategyId) ?? { n: 0, use: 0, ticks: 0, live: 0, holders: 0, forms: new Map(), disagreements: 0 };
    acc.n += 1;
    acc.use += run.appliedUseInstanceTicks;
    acc.ticks += run.ticksObserved;
    acc.live += run.ticksWithAnyApplication;
    acc.holders += run.distinctHolders;
    acc.disagreements += run.disagreements;
    for (const [form, n] of Object.entries(run.byForm)) acc.forms.set(form, (acc.forms.get(form) ?? 0) + n);
    byStrategy.set(run.strategyId, acc);
  }

  process.stdout.write(
    `\n${pad('strategy', 22)}${num('runs', 5)}${num('use/run', 12)}${num('use/tick', 10)}` +
      `${num('live%', 8)}${num('holders', 9)}  top forms\n`,
  );
  for (const [strategyId, acc] of byStrategy) {
    const topForms = [...acc.forms].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([f, n]) => `${f} ${String(Math.round((n / acc.use) * 100))}%`).join(', ');
    process.stdout.write(
      `${pad(strategyId, 22)}${num(acc.n, 5)}${num(Math.round(acc.use / acc.n), 12)}` +
        `${num((acc.use / acc.ticks).toFixed(2), 10)}` +
        `${num(((acc.live / acc.ticks) * 100).toFixed(1), 8)}` +
        `${num((acc.holders / acc.n).toFixed(1), 9)}  ${topForms}\n`,
    );
  }
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
