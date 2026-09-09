#!/usr/bin/env node
/*
 * Multiverse Mages — the metric reachability harness: for every registered
 * metric, whether it can be made to move at all.
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
 * ## What this asks, and why nothing may be optimised before it
 *
 * `check:coverage` asks who authored a primitive. `check:consumption` asks
 * whether what the academics know can move one. `check:reachability` asks
 * whether production code calls a rules-path symbol. **None of them asks the
 * question that cost the campaign ten instruments**, which is:
 *
 * > For this metric — can anything make it move?
 *
 * `docs/design/self-evolving-search.md` makes that stage 0 of the self-evolving
 * search and says nothing runs before it, because *"an autonomous optimiser
 * pointed at a metric that cannot move will run forever and report progress"*.
 * Ten of the campaign's findings were instruments not touching the thing they
 * named, and **every one of them was green.**
 *
 * So this script ablates a declared mechanism, runs paired arms under common
 * random numbers, and publishes one of three verdicts per metric — `moves`,
 * `inert`, `not-measurable` — plus the quarantine list, which is the deliverable
 * as much as the harness is.
 *
 *     npm run typecheck && npm run check:metric-reachability
 *
 * It writes `balance/metric-reachability.json`, stamped with the git SHA it was
 * taken on, because a finding about code is a finding about a ref and this one
 * will rot the day somebody wires a collector.
 *
 * ## It is not in `npm run verify`, deliberately
 *
 * Two reasons, and the second is the important one. It costs minutes rather than
 * seconds; and **a quarantine list must not be something anyone is under
 * pressure to shorten.** A blocking check turns "this metric cannot move" into a
 * build failure, and the cheapest way to clear a build failure is to stop
 * measuring. Non-blocking keeps the list honest. It exits 0 on any complete
 * report and non-zero only when the report is *incomplete* — a registered metric
 * with no verdict, which is the silently-skipped metric the guard forbids.
 *
 * ## The lever is a factor level, and that is a finding, not a preference
 *
 * The obvious design is to reuse `ablation.ts`'s primitive mask: it already
 * schedules paired mirrored arms on shared seeds, and `winRateByPrimitive` is
 * built on it. **It does not reach the simulation.** `RunTask.ablatedPrimitives`
 * is built by `buildTasks`, carried across the worker boundary by
 * `protocol.ts`, and read by nothing: `ablationMaskFor` is exported from
 * `@mm/primitives` and its only callers are its own unit test and
 * `conformance.ts`. `packages/scenario`'s executor never looks at the field.
 *
 * That is stronger than the campaign's own note that *"an ablation mask never
 * reached the god subsystem"* — as of this commit it reaches no subsystem at
 * all. So the probes below use levers that demonstrably do reach: the scenario's
 * registered factors, and the executor's `raids` switch. **Probe
 * `primitive-mask` is kept anyway, and is expected to report
 * `lever-did-not-reach`** — a verdict that never fires is a verdict nobody has
 * tested, and this one is the guard's whole reason for having three outcomes
 * instead of two.
 *
 * ## Determinism, and the one thing this script is not allowed to do
 *
 * No new RNG stream is allocated and none is drawn from: every probe is a
 * different *configuration* of runs the harness already knows how to schedule,
 * and `deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex,
 * replicateIndex)` — never of the factor levels. That is what makes the arms
 * paired, and it is checked rather than assumed, by `pairedRunSeedProblems`, before
 * a single run is dispatched. Appending a stream would force a re-baseline
 * (`contracts.md` §6); this needs none, and changes no simulation behaviour at
 * all — it only reads.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BALANCE_METRIC_IDS,
  REACHABILITY_VERDICT,
  buildTasks,
  classifyPaired,
  expandSweep,
  leverReached,
  mergeReachability,
  pairedRunSeedProblems,
  quarantineList,
  reachabilityReportProblems,
  runSweep,
} from '@mm/mc-harness';
import {
  REFERENCE_METRIC_IDS,
  REFERENCE_REGISTRIES,
  executeReferenceRun,
  makeReferenceExecutor,
  referenceProvenance,
} from '@mm/scenario';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = resolve(ROOT, 'balance/metric-reachability.json');

/* ------------------------------------------------------------------------- *
 * The shared experiment
 * ------------------------------------------------------------------------- */

/**
 * One cell, so that every arm's single cell is cell 0 and every replicate index
 * pairs with itself.
 *
 * Single-level factors are not a shortcut, they are the requirement
 * `reference-universe.ts` states for `tradition` and which applies to every
 * factor here for the same reason: *"a run's seed is a function of its
 * cellIndex, and each level of a factor takes its own cell. Declaring a factor
 * with three levels in one sweep file therefore compares three levels and three
 * different sets of universes."* One level per arm, one file per level, common
 * random numbers held.
 */
const CONTROL_LEVELS = Object.freeze({
  cohortSize: 12,
  foundingMages: 1,
  foundingNodes: 4,
  foundingSpeciesMask: 0,
});

/**
 * Replicates per arm.
 *
 * Sixteen, which at 240 world ticks is about ninety seconds of paired arms per
 * probe on one thread and comfortably past the point where the *t* quantile has
 * stopped mattering. The number is a **cost** decision and not a power one:
 * under common random numbers on a deterministic simulation most of these deltas
 * have zero variance, so the interval is degenerate and sixteen pairs is
 * sixteen times more evidence than the estimator strictly needs. It is
 * sixteen so that a metric which *is* noisy — anything downstream of a mage
 * dying — still gets an interval a reader can act on.
 */
const REPLICATES = 16;

/**
 * Twenty world years.
 *
 * The horizon gate's cap, chosen for the reason `measures.ts` gives for
 * `referenceNodesGainedFinalQuarter`: a five-year window cannot tell a universe
 * that is still learning from one that has stopped, and a reachability verdict
 * taken inside the founding transient would report every knowledge metric as
 * moving because the grant is still being digested.
 */
const WORLD_TICK_CAP = 240;

/** The date this harness was authored, as an integer. Any fixed number would do. */
const ROOT_SEED = 20260813;

const BASE_SPEC = Object.freeze({
  sweepId: 'metric-reachability-v1',
  kind: 'gate',
  rootSeed: ROOT_SEED,
  factors: Object.freeze(
    Object.entries(CONTROL_LEVELS).map(([id, level]) =>
      Object.freeze({ id, levels: Object.freeze([level]) }),
    ),
  ),
  replicates: REPLICATES,
  agentPool: Object.freeze({
    strategies: Object.freeze(['passive-control']),
    assignment: 'fixed',
    slots: 1,
  }),
  termination: Object.freeze({ worldTickCap: WORLD_TICK_CAP, perRunTimeoutMs: 120_000 }),
  metrics: REFERENCE_METRIC_IDS,
  ablation: Object.freeze({ mode: 'none', primitives: Object.freeze([]) }),
  // Zero: a deterministic universe either completes or has found a defect, and a
  // reachability verdict computed over failed runs is a verdict about failures.
  failureThreshold: 0,
});

/**
 * The probe table: one lever each, and what mechanism that lever neutralises.
 *
 * Each probe is a **single** deviation from the control arm, which is what makes
 * its delta attributable. `levels` overrides one factor; `executor` overrides one
 * executor option; `ablation` names a primitive. Nothing sets more than one.
 */
const PROBES = Object.freeze([
  {
    probeId: 'founding-grant',
    mechanism: 'the god\'s founding knowledge grant',
    lever: 'foundingNodes: 4 -> 0',
    levels: { foundingNodes: 0 },
    note:
      'The one lever on transmission this build has: nothing raises mastery, so a node can only ' +
      'ever be taught if a god granted it at full mastery. Neutralising it should move every ' +
      'knowledge-shaped metric, and a knowledge metric it does not move is a real inert.',
  },
  {
    probeId: 'founding-cohort',
    mechanism: 'the student cohort mages are promoted from',
    lever: 'cohortSize: 12 -> 1',
    levels: { cohortSize: 1 },
    note: 'Scales the founding population and the labour that feeds it.',
  },
  {
    probeId: 'founding-mages',
    mechanism: 'the founding mage corps',
    lever: 'foundingMages: 1 -> 4',
    levels: { foundingMages: 4 },
    note:
      'A registered factor no committed gate has ever varied. Raised rather than lowered because ' +
      'the control already sits at the floor of one.',
  },
  {
    probeId: 'founding-species',
    mechanism: 'the founding species mix',
    lever: 'foundingSpeciesMask: 0 (all six) -> 1 (the first alone)',
    levels: { foundingSpeciesMask: 1 },
    note:
      'One of the two registered factors `self-evolving-search.md` names as never varied by any ' +
      'gate. If this reports lever-did-not-reach, the mask is an instrument that never arrives.',
  },
  {
    probeId: 'tradition',
    mechanism: 'the universe\'s tradition and its four hooks',
    lever: "tradition: default (true-naming) -> 'vancian-memorization'",
    levels: { tradition: 'vancian-memorization' },
    note:
      'The other never-varied factor, and the cheapest unrun experiment on the board: the ' +
      'reference tradition sets instanceMastery 1024 on every instance, so every measurement ' +
      'this project has taken assumes researched knowledge is immediately teachable. ' +
      "**The treatment level is `vancian-memorization` and not `true-naming` because the " +
      "default already IS `true-naming`** — `referenceContent()` resolves tradition id 2 with " +
      'no name given, and the same id with that name. A probe naming it would have compared the ' +
      'default against itself, reported lever-did-not-reach, and been read as "tradition is ' +
      'inert" — the exact false negative this harness exists to prevent, committed by the ' +
      'harness itself.',
  },
  {
    probeId: 'raids',
    mechanism: 'portals opening and raids resolving',
    lever: 'executor raids: true -> false',
    executor: { raids: false },
    note:
      'The A/B switch `ReferenceExecutorOptions` documents: false reproduces the pre-raid build ' +
      'exactly. If nothing moves, raids are unreachable in the configuration the gates run, which ' +
      'is the campaign finding that all three gates resolve zero raids, measured rather than ' +
      'remembered. **This probe cannot use `makeReferenceExecutor`**: that factory forwards only ' +
      '`content` and `censusIntervalTicks` and silently drops `raids`, so ' +
      '`makeReferenceExecutor({ raids: false })` returns an executor reporting ' +
      '`raidEngagement: true`. It is built from `executeReferenceRun` directly instead — see ' +
      '`executorFor`. The drop is a defect in `packages/scenario` and is reported rather than ' +
      'patched here, because this branch is an instrument and may not change simulation ' +
      'behaviour.',
  },
  {
    probeId: 'primitive-mask',
    mechanism: 'the primitive ablation mask itself',
    lever: "ablation.primitives: [] -> ['research-rate']",
    ablation: { mode: 'one-sided', primitives: ['research-rate'] },
    note:
      'The self-test. `RunTask.ablatedPrimitives` has no production consumer, so this probe is ' +
      'expected to report lever-did-not-reach — and a verdict that never fires is a verdict ' +
      'nobody has tested. If this one ever reports moves, somebody wired the mask and this note ' +
      'is the thing to delete.',
  },
]);

/* ------------------------------------------------------------------------- *
 * Execution
 * ------------------------------------------------------------------------- */

/** The spec one arm runs: the control, with at most one thing changed. */
function armSpecFor(probe) {
  const levels = { ...CONTROL_LEVELS, ...(probe?.levels ?? {}) };
  return {
    ...BASE_SPEC,
    factors: Object.entries(levels).map(([id, level]) => ({ id, levels: [level] })),
    ...(probe?.ablation === undefined ? {} : { ablation: probe.ablation }),
  };
}

/**
 * Refuses to dispatch arms that do not share seeds.
 *
 * A control arm whose founders differ from its treatment arm's is not a control,
 * and the failure is silent — the sweep completes, the numbers are plausible, and
 * the delta is sampling noise wearing a mechanism's name.
 *
 * `pairedRunSeedProblems` rather than `ablation.ts`'s `pairedSeedProblems`, and
 * the difference is one rule: that one also requires identical factor levels
 * across arms, which is right for an ablation arm and wrong here, because a
 * reachability probe's lever *is* a factor level. See its doc comment.
 */
function assertPaired(controlSpec, armSpecs) {
  const scheduleOf = (spec, armId) => ({
    armId,
    tasks: buildTasks(spec, expandSweep(spec, REFERENCE_REGISTRIES)),
  });
  const problems = pairedRunSeedProblems([
    scheduleOf(controlSpec, 'control'),
    ...armSpecs.map(({ spec, probeId }) => scheduleOf(spec, probeId)),
  ]);
  if (problems.length > 0) {
    throw new Error(
      `The reachability arms do not share derived run seeds, so every delta they produce would ` +
        `be mostly sampling noise:\n  ${problems.join('\n  ')}`,
    );
  }
}

/**
 * The executor one arm runs.
 *
 * `makeReferenceExecutor` for the default, so that the control arm is the
 * pipeline's own executor and not a hand-rolled lookalike. A probe that names
 * executor options gets `executeReferenceRun` wrapped directly, because
 * `makeReferenceExecutor` forwards `content` and `censusIntervalTicks` and
 * **drops everything else** — including `raids`, the switch its own doc comment
 * calls "the A/B switch". Measured, not assumed:
 * `makeReferenceExecutor({ raids: false })` produces runs declaring
 * `mechanics.raidEngagement: true`.
 */
function executorFor(executorOptions) {
  if (executorOptions === undefined) return makeReferenceExecutor({});
  return (task) => executeReferenceRun(task, executorOptions).outcome;
}

/** Runs one arm inline and returns its records and summary. */
async function runArm(spec, executorOptions) {
  return await runSweep({
    spec,
    registries: REFERENCE_REGISTRIES,
    execution: { mode: 'inline', execute: executorFor(executorOptions) },
    provenance: referenceProvenance(),
  });
}

/** `(cellIndex:replicateIndex)` -> measured value, for one per-run metric. */
function perRunValues(records, metricId) {
  const values = new Map();
  let unavailable = 0;
  for (const record of records) {
    const entry = record.metrics[metricId];
    if (entry === undefined) continue;
    if (entry.status !== 'measured') {
      unavailable += 1;
      continue;
    }
    values.set(`${record.coordinates.cellIndex}:${record.coordinates.replicateIndex}`, {
      runSeed: record.runSeed,
      value: entry.value,
    });
  }
  return { values, unavailable };
}

/**
 * Every metric entry's `(status, reason)` across an arm, in canonical order.
 *
 * A second, weaker signal that the lever arrived, and it exists because
 * {@link leverReached} can only see values that were **measured on both arms**.
 * A lever that flips a metric from `measured` to `unavailable` — or that changes
 * only the reason code, `no-observations` becoming `mechanic-absent` — has
 * plainly reached the simulation, and every one of those changes is invisible to
 * a comparison over measured values. Without this, such a probe would report
 * `lever-did-not-reach` for every metric it named, which is the harness
 * committing the exact failure it was built to catch.
 */
function availabilityFingerprint(result) {
  const parts = [];
  for (const record of [...result.records].sort((a, b) => a.runSeed - b.runSeed)) {
    for (const metricId of Object.keys(record.metrics).sort()) {
      const entry = record.metrics[metricId];
      parts.push(`${record.runSeed}/${metricId}/${entry.status}/${entry.reason ?? ''}`);
    }
  }
  const armMetrics = result.summary.armMetrics ?? {};
  for (const metricId of Object.keys(armMetrics).sort()) {
    parts.push(`arm/${metricId}/${armMetrics[metricId].status}/${armMetrics[metricId].reason ?? ''}`);
  }
  return parts.join('|');
}

/** Pairs one per-run metric across two arms, in canonical run-seed order. */
function pairPerRun(control, treatment, metricId) {
  const left = perRunValues(control.records, metricId);
  const right = perRunValues(treatment.records, metricId);
  const pairs = [];
  for (const [key, controlValue] of left.values) {
    const treatmentValue = right.values.get(key);
    if (treatmentValue === undefined) continue;
    pairs.push({
      runSeed: controlValue.runSeed,
      control: controlValue.value,
      ablated: treatmentValue.value,
    });
  }
  pairs.sort((a, b) => a.runSeed - b.runSeed);
  return { pairs, unavailable: left.unavailable + right.unavailable };
}

/**
 * Pairs one arm-scoped metric across two arms.
 *
 * An arm metric is one number folded over the whole arm, so there is exactly one
 * pair and the interval collapses onto the delta. That is honest rather than
 * over-confident for the same reason `standard-error.ts` gives — the fold is over
 * sixteen runs that shared their seeds with sixteen others, so a difference
 * between the folds is a difference the lever caused — but `pairs: 1` is in the
 * published record so nobody reads it as sixteen independent observations.
 */
function pairPerArm(control, treatment, metricId) {
  const left = control.summary.armMetrics?.[metricId];
  const right = treatment.summary.armMetrics?.[metricId];
  if (left === undefined || right === undefined) return { pairs: [], unavailable: 0 };
  if (left.status !== 'measured' || right.status !== 'measured') {
    return { pairs: [], unavailable: 2 };
  }
  return {
    pairs: [{ runSeed: ROOT_SEED, control: left.value, ablated: right.value }],
    unavailable: 0,
  };
}

/* ------------------------------------------------------------------------- *
 * The report
 * ------------------------------------------------------------------------- */

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function pad(text, width) {
  return String(text).padEnd(width);
}

function formatDelta(estimate) {
  if (estimate === null) return '—';
  const interval = `[${estimate.low.toFixed(3)}, ${estimate.high.toFixed(3)}]`;
  return `${estimate.meanDifference.toFixed(3)} ${interval}`;
}

async function main() {
  const controlSpec = armSpecFor(undefined);
  const armSpecs = PROBES.map((probe) => ({ probeId: probe.probeId, spec: armSpecFor(probe) }));
  assertPaired(controlSpec, armSpecs);

  const started = Date.now();
  process.stdout.write(
    `metric reachability — ${String(PROBES.length + 1)} arms of ${String(REPLICATES)} runs at ` +
      `${String(WORLD_TICK_CAP)} world ticks\n\n`,
  );

  process.stdout.write(`  control ... `);
  const control = await runArm(controlSpec, {});
  process.stdout.write(`${String(control.records.length)} runs\n`);

  const arms = new Map();
  for (const probe of PROBES) {
    process.stdout.write(`  ${pad(probe.probeId, 18)} ... `);
    const spec = armSpecFor(probe);
    const result = await runArm(spec, probe.executor);
    arms.set(probe.probeId, result);
    process.stdout.write(`${String(result.records.length)} runs\n`);
  }
  const elapsedSeconds = (Date.now() - started) / 1000;

  // A metric has a producer when the pipeline can be asked for it at all: the
  // scenario's registry carries it (so a sweep may declare it and a worker will
  // collect it), or the control arm's summary carries an arm-scoped entry for
  // it. Decided from what the pipeline actually produced rather than from a
  // hand-maintained list, so it self-corrects the day a collector is wired.
  const perArmProduced = new Set(Object.keys(control.summary.armMetrics ?? {}));
  const registeredIds = [...new Set([...REFERENCE_METRIC_IDS, ...BALANCE_METRIC_IDS])].sort();
  const hasProducer = (metricId) =>
    REFERENCE_REGISTRIES.metrics.has(metricId) || perArmProduced.has(metricId);

  const perProbe = [];
  for (const probe of PROBES) {
    const treatment = arms.get(probe.probeId);

    // Every observation this probe made, of every metric, so that
    // `lever-did-not-reach` is decided from the probe's whole footprint. One
    // changed number anywhere is enough to say the lever arrived.
    const paired = new Map();
    const everything = [];
    for (const metricId of registeredIds) {
      const result = perArmProduced.has(metricId)
        ? pairPerArm(control, treatment, metricId)
        : pairPerRun(control, treatment, metricId);
      paired.set(metricId, result);
      everything.push(...result.pairs);
    }
    // Reach is the union of the two signals: a measured value that differs
    // anywhere, or an availability status that differs anywhere. The bar is
    // deliberately the weakest possible — the question is not whether the lever
    // mattered but whether it was connected.
    const reached =
      leverReached(everything) ||
      availabilityFingerprint(control) !== availabilityFingerprint(treatment);

    for (const metricId of registeredIds) {
      const { pairs, unavailable } = paired.get(metricId);
      perProbe.push(
        classifyPaired({
          metricId,
          probeId: probe.probeId,
          mechanism: probe.mechanism,
          hasProducer: hasProducer(metricId),
          leverReached: reached,
          pairs,
          unavailableRuns: unavailable,
        }),
      );
    }
  }

  const merged = registeredIds.map((metricId) =>
    mergeReachability(perProbe.filter((result) => result.metricId === metricId)),
  );
  const problems = reachabilityReportProblems({ registeredMetricIds: registeredIds, results: merged });
  const quarantined = quarantineList(merged);

  /* ------------------------------- output ------------------------------- */

  process.stdout.write(`\n${String(registeredIds.length)} registered metrics, `);
  process.stdout.write(`${elapsedSeconds.toFixed(1)}s\n\n`);
  process.stdout.write(
    `${pad('metric', 32)}${pad('verdict', 16)}${pad('reason', 24)}${pad('probe', 18)}delta [95% paired]\n`,
  );
  process.stdout.write(`${'-'.repeat(120)}\n`);
  for (const result of merged) {
    process.stdout.write(
      `${pad(result.metricId, 32)}${pad(result.verdict, 16)}${pad(result.reason, 24)}` +
        `${pad(result.probeId ?? '—', 18)}${formatDelta(result.estimate)}\n`,
    );
  }

  process.stdout.write(`\n## Quarantine list — ${String(quarantined.length)} of `);
  process.stdout.write(`${String(registeredIds.length)} metrics may not be optimised\n\n`);
  for (const metricId of quarantined) {
    const result = merged.find((entry) => entry.metricId === metricId);
    process.stdout.write(`  ${pad(metricId, 32)}${pad(result.verdict, 16)}${result.reason}\n`);
  }

  process.stdout.write('\n## Per-probe detail\n\n');
  for (const probe of PROBES) {
    const rows = perProbe.filter(
      (result) => result.probeId === probe.probeId && result.estimate !== null,
    );
    const movedHere = rows.filter((row) => row.verdict === REACHABILITY_VERDICT.moves);
    process.stdout.write(`  ${probe.probeId} — ${probe.lever}\n`);
    process.stdout.write(
      `    ${String(movedHere.length)} of ${String(rows.length)} observed metrics moved` +
        `${rows.length === 0 ? ' (no observation: the lever changed nothing)' : ''}\n`,
    );
    for (const row of movedHere) {
      process.stdout.write(`      ${pad(row.metricId, 34)}${formatDelta(row.estimate)}\n`);
    }
  }

  const report = {
    schemaVersion: 1,
    generatedBy: 'scripts/check-metric-reachability.mjs',
    // The ref this is a finding about. Not the date alone: a dated measurement
    // with no ref is a claim nobody can re-take.
    gitSha: gitSha(),
    sweepId: BASE_SPEC.sweepId,
    rootSeed: ROOT_SEED,
    replicates: REPLICATES,
    worldTickCap: WORLD_TICK_CAP,
    elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
    probes: PROBES.map((probe) => ({
      probeId: probe.probeId,
      mechanism: probe.mechanism,
      lever: probe.lever,
      note: probe.note,
    })),
    metrics: merged.map((result) => ({
      metricId: result.metricId,
      verdict: result.verdict,
      reason: result.reason,
      probeId: result.probeId,
      mechanism: result.mechanism,
      estimate: result.estimate,
      detail: result.detail,
    })),
    quarantined,
    problems,
  };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`\nwrote ${OUTPUT_PATH}\n`);

  if (problems.length > 0) {
    process.stdout.write(`\nThe report is incomplete and must not be published:\n`);
    for (const problem of problems) process.stdout.write(`  ${problem}\n`);
    process.exitCode = 1;
    return;
  }
  // Exit 0 on a complete report whatever the verdicts are. See the module note:
  // a quarantine list nobody is under pressure to shorten is the only kind that
  // stays honest.
  process.stdout.write('\nreport complete: every registered metric carries a verdict.\n');
}

await main();
