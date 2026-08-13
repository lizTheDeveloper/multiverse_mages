/*
 * Multiverse Mages — W58 Test 1 analysis: raw rates, and what the margin computes.
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
 * Counts first, rates second, derived scores last and clearly labelled as
 * reconstructions of somebody else's definition.
 *
 * The pairing is the part that the committed sweep cannot produce: because every
 * arm plays the same `(cellIndex, replicateIndex)` grid, "the probe ascended in
 * world W and `archivist` did not" is a statement about **one world**, not about
 * two samples of a distribution. The discordant-pair counts are therefore a sign
 * test, and they are reported instead of a t-statistic because the outcome is
 * binary.
 *
 *     node tools/w58/analyse1.mjs --in mc-results/w58/test1
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { CELLS, POOL, PROBE, parseArgs } from './harness.mjs';

const REASON_NAME = {
  0: 'none',
  1: 'ascensionApotheosis',
  2: 'ascensionCanon',
  3: 'stagnation',
  4: 'truncated',
};

function load(dir) {
  const files = readdirSync(dir).filter((name) => name.startsWith('test1__') && name.endsWith('.json'));
  const byStrategy = new Map();
  const inertness = [];
  for (const name of files) {
    const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    byStrategy.set(parsed.strategyId, parsed.runs);
    inertness.push(parsed.probeInertness);
  }
  return { byStrategy, inertness };
}

function summarise(runs) {
  const ascended = runs.filter((run) => run.status === 'ascended').length;
  const reasons = {};
  for (const run of runs) {
    const key = REASON_NAME[run.terminalReason] ?? String(run.terminalReason);
    reasons[key] = (reasons[key] ?? 0) + 1;
  }
  const statuses = {};
  for (const run of runs) statuses[run.status] = (statuses[run.status] ?? 0) + 1;
  const mean = (pick) => (runs.length === 0 ? 0 : runs.reduce((sum, run) => sum + pick(run), 0) / runs.length);
  return {
    runs: runs.length,
    ascended,
    rate: runs.length === 0 ? 0 : ascended / runs.length,
    statuses,
    reasons,
    meanTicks: mean((run) => run.ticksRun),
    meanNodesKnown: mean((run) => run.terminal?.nodesKnown ?? 0),
    meanInstances: mean((run) => run.terminal?.instances ?? 0),
    meanGrimoires: mean((run) => run.terminal?.grimoires ?? 0),
    meanPopulace: mean((run) => run.terminal?.populace ?? 0),
    meanMagesAlive: mean((run) => run.terminal?.magesAlive ?? 0),
    meanSubmissions: mean((run) => run.submissions ?? 0),
    meanRejections: mean((run) => run.rejections ?? 0),
  };
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function padStart(value, width) {
  return String(value).padStart(width);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.in ?? 'mc-results/w58/test1';
  const { byStrategy, inertness } = load(dir);

  const order = POOL.filter((id) => byStrategy.has(id));
  const lines = [];
  const emit = (line = '') => lines.push(line);

  emit('# W58 Test 1 — does a random bot beat the strategy pool?');
  emit();
  emit('## Probe inertness (the validity gate)');
  emit();
  for (const check of inertness) {
    emit(
      `- ${pad(check.strategyId, 22)} agrees=${String(check.agrees)}  ` +
        `probed=${check.probed.snapshotHash}/${check.probed.status}/${String(check.probed.ticksRun)}  ` +
        `unprobed=${check.unprobed.snapshotHash}/${check.unprobed.status}/${String(check.unprobed.ticksRun)}`,
    );
  }
  const allInert = inertness.every((check) => check.agrees);
  emit();
  emit(allInert
    ? 'All arms agree: the instrumentation changed no run. Numbers below are valid.'
    : 'AN ARM DISAGREES. Every number below is void.');
  emit();

  emit('## Standalone ascension rate, per strategy, pooled over all four starting positions');
  emit();
  emit(`${pad('strategy', 22)} ${padStart('runs', 5)} ${padStart('asc', 4)} ${padStart('rate', 7)} ` +
    `${padStart('apoth', 6)} ${padStart('canon', 6)} ${padStart('stag', 5)} ${padStart('trunc', 6)} ` +
    `${padStart('ticks', 7)} ${padStart('nodes', 7)} ${padStart('instances', 10)}`);
  const overall = new Map();
  for (const id of order) {
    const summary = summarise(byStrategy.get(id));
    overall.set(id, summary);
    emit(
      `${pad(id, 22)} ${padStart(summary.runs, 5)} ${padStart(summary.ascended, 4)} ` +
        `${padStart(summary.rate.toFixed(4), 7)} ${padStart(summary.reasons.ascensionApotheosis ?? 0, 6)} ` +
        `${padStart(summary.reasons.ascensionCanon ?? 0, 6)} ${padStart(summary.statuses.stagnated ?? 0, 5)} ` +
        `${padStart(summary.statuses.truncated ?? 0, 6)} ${padStart(summary.meanTicks.toFixed(0), 7)} ` +
        `${padStart(summary.meanNodesKnown.toFixed(1), 7)} ${padStart(summary.meanInstances.toFixed(0), 10)}`,
    );
  }
  emit();

  emit('## The same rates, per starting position');
  emit();
  emit(`${pad('strategy', 22)} ${CELLS.map((cell) => padStart(`cell${String(cell.cellIndex)}`, 14)).join(' ')}`);
  emit(`${pad('', 22)} ${CELLS.map((cell) => padStart(cell.label, 14)).join(' ')}`);
  const perCell = {};
  for (const id of order) {
    const runs = byStrategy.get(id);
    const cells = CELLS.map((cell) => summarise(runs.filter((run) => run.cellIndex === cell.cellIndex)));
    perCell[id] = cells;
    emit(
      `${pad(id, 22)} ${cells
        .map((summary) => padStart(`${String(summary.ascended)}/${String(summary.runs)} ${summary.rate.toFixed(3)}`, 14))
        .join(' ')}`,
    );
  }
  emit();

  emit('## Paired against the probe, world by world');
  emit();
  emit('Each row is one strategy against `uniform-random-legal` on the identical set of');
  emit('starting universes. `probeOnly` counts worlds the probe ascended in and the strategy');
  emit('did not; `stratOnly` the reverse. Under the null they are equal.');
  emit();
  const probeRuns = byStrategy.get(PROBE) ?? [];
  const probeByWorld = new Map(probeRuns.map((run) => [`${String(run.cellIndex)}:${String(run.replicateIndex)}`, run]));
  emit(`${pad('strategy', 22)} ${padStart('both', 6)} ${padStart('probeOnly', 10)} ${padStart('stratOnly', 10)} ${padStart('neither', 8)}`);
  const paired = {};
  for (const id of order) {
    if (id === PROBE) continue;
    let both = 0;
    let probeOnly = 0;
    let stratOnly = 0;
    let neither = 0;
    for (const run of byStrategy.get(id)) {
      const key = `${String(run.cellIndex)}:${String(run.replicateIndex)}`;
      const other = probeByWorld.get(key);
      if (other === undefined) continue;
      const s = run.status === 'ascended';
      const p = other.status === 'ascended';
      if (s && p) both += 1;
      else if (p) probeOnly += 1;
      else if (s) stratOnly += 1;
      else neither += 1;
    }
    paired[id] = { both, probeOnly, stratOnly, neither };
    emit(`${pad(id, 22)} ${padStart(both, 6)} ${padStart(probeOnly, 10)} ${padStart(stratOnly, 10)} ${padStart(neither, 8)}`);
  }
  emit();

  emit('## What the shipped margin computes, reconstructed on these numbers');
  emit();
  const rates = order.map((id) => overall.get(id).rate);
  const totalRuns = order.reduce((sum, id) => sum + overall.get(id).runs, 0);
  const totalWins = order.reduce((sum, id) => sum + overall.get(id).ascended, 0);
  const ascensionRate = totalRuns === 0 ? 0 : totalWins / totalRuns;
  const poolMean = rates.reduce((sum, value) => sum + value, 0) / rates.length;
  const probeRate = overall.get(PROBE)?.rate ?? 0;
  const withoutProbe = order.filter((id) => id !== PROBE).map((id) => overall.get(id).rate);
  const meanExcludingProbe = withoutProbe.reduce((sum, value) => sum + value, 0) / withoutProbe.length;
  emit(`ascensionRate (run-weighted, whole pool) = ${ascensionRate.toFixed(4)}`);
  emit(`poolMean (unweighted mean of per-strategy rates, PROBE INCLUDED, as tuner.ts computes) = ${poolMean.toFixed(4)}`);
  emit(`probeRate = ${probeRate.toFixed(4)}`);
  emit(`exploitMargin = poolMean - probeRate = ${(poolMean - probeRate).toFixed(4)}`);
  emit(`ascensionRate - probeRate = ${(ascensionRate - probeRate).toFixed(4)}   <- identical when runs per strategy are equal`);
  emit(`mean of the seven non-probe rates = ${meanExcludingProbe.toFixed(4)}`);
  emit(`honest margin (non-probe mean - probeRate) = ${(meanExcludingProbe - probeRate).toFixed(4)}`);
  emit();

  emit('## Terminal knowledge, to see whether winning tracks knowing');
  emit();
  emit(`${pad('strategy', 22)} ${padStart('rate', 7)} ${padStart('nodesKnown', 11)} ${padStart('grimoires', 10)} ${padStart('populace', 9)} ${padStart('mages', 6)} ${padStart('submits', 8)} ${padStart('rejects', 8)}`);
  for (const id of order) {
    const summary = overall.get(id);
    emit(
      `${pad(id, 22)} ${padStart(summary.rate.toFixed(4), 7)} ${padStart(summary.meanNodesKnown.toFixed(1), 11)} ` +
        `${padStart(summary.meanGrimoires.toFixed(0), 10)} ${padStart(summary.meanPopulace.toFixed(0), 9)} ` +
        `${padStart(summary.meanMagesAlive.toFixed(1), 6)} ${padStart(summary.meanSubmissions.toFixed(0), 8)} ` +
        `${padStart(summary.meanRejections.toFixed(0), 8)}`,
    );
  }
  emit();

  const report = lines.join('\n');
  process.stdout.write(`${report}\n`);
  return { report, overall: Object.fromEntries(overall), perCell, paired };
}

main();
