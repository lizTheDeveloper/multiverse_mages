#!/usr/bin/env node
/*
 * Multiverse Mages — W247: which of the seven material kinds has a faucet.
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
 * Sums `producedByKind` and `appliedByKind` over a reference run, per kind, and
 * writes them to a file **named on the command line**. Never a directory glob:
 * `CLAUDE.md` records an aggregator that folded every `.ndjson` under a
 * directory and ate a previous run's records at a different `--ticks`.
 *
 * The two series are separate on purpose. `producedByKind` is phase 1 — the land
 * worked by laborers — and `appliedByKind` is phase 5a — a mage spending her
 * month casting. A kind with a faucet in neither has no source at all, and a
 * kind whose only source is the applied channel is only as reliable as a mage
 * choosing `GOAL.applyMagic`.
 *
 * **The insight and passage rows are the positive control.** The v1 opening
 * square holds `mentem` (insight) and `limen` (passage), so both must read
 * non-zero on the applied side before any conclusion may be drawn from a zero
 * elsewhere: a zero on an instrument that cannot read a live channel says
 * nothing about the channel it was pointed at.
 *
 * Usage: node tools/w247/material-faucets.mjs --out <path> [--ticks 600] [--seed N]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { AUDIT_RUN_SEED, referenceContent, referenceScenario } from '@mm/scenario';
import { createSession } from '@mm/agent-api';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const out = flag('out', undefined);
if (out === undefined) {
  console.error('--out <path> is required: this probe never writes to a directory it globs later');
  process.exit(2);
}
const ticks = Number.parseInt(flag('ticks', '600'), 10);
const seed = Number.parseInt(flag('seed', String(AUDIT_RUN_SEED)), 10);

const content = referenceContent();
const { scenario, lastReport } = referenceScenario(content);
const session = createSession({ scenario, agentSlotIndex: 0, strategyId: 'w247-faucets' });
session.reset(seed, { worldTickCap: ticks, options: {} });

const produced = {};
const applied = {};
/**
 * The world tick each kind first gained anything, or `null` if it never did.
 *
 * A total is a statement about a horizon and hides *when*. `insight` reads zero
 * over 600 ticks and non-zero over 1,200 on the same seed, so a run reported
 * only as a sum would say "dry" and "flowing" about the same faucet depending on
 * where it was cut off. The first-flow tick is the number that does not.
 */
const firstFlow = {};
let reports = 0;
for (let tick = 0; tick < ticks; tick += 1) {
  session.submit({ kind: 0, params: [] });
  const report = lastReport();
  if (report === undefined) continue;
  reports += 1;
  for (const kind of Object.keys(report.producedByKind)) {
    const gained = report.producedByKind[kind] + report.appliedByKind[kind];
    produced[kind] = (produced[kind] ?? 0) + report.producedByKind[kind];
    applied[kind] = (applied[kind] ?? 0) + report.appliedByKind[kind];
    if (gained > 0 && firstFlow[kind] === undefined) firstFlow[kind] = tick;
  }
}

// A third exit for a broken probe, rather than folding it into "the answer is
// no". A run that produced no world reports at all cannot say anything about a
// faucet, and reporting `labor: 0` from it would be a confident nonsense.
if (reports === 0) {
  console.error(
    `PROBE BROKEN: ${String(ticks)} submissions produced zero world reports, so no kind can be ` +
      'read. This is not a statement that any faucet is dry.',
  );
  process.exit(3);
}

const kinds = Object.keys(produced);
const payload = {
  probe: 'w247-material-faucets',
  takenAt: new Date().toISOString(),
  requestedTicks: ticks,
  worldReports: reports,
  runSeed: seed,
  producedByKind: produced,
  appliedByKind: applied,
  firstFlowTickByKind: Object.fromEntries(kinds.map((kind) => [kind, firstFlow[kind] ?? null])),
  faucetDry: kinds.filter((kind) => (produced[kind] ?? 0) + (applied[kind] ?? 0) === 0),
};
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`material faucets — seed ${String(seed)}, --ticks ${String(ticks)}, ${String(reports)} reports -> ${out}`);
console.log('kind       land (phase 1)   applied (phase 5a)          total   first flow');
for (const kind of kinds) {
  const land = produced[kind] ?? 0;
  const cast = applied[kind] ?? 0;
  const first = firstFlow[kind] === undefined ? 'never' : `t${String(firstFlow[kind])}`;
  console.log(
    `${kind.padEnd(10)} ${String(land).padStart(14)} ${String(cast).padStart(20)} ${String(land + cast).padStart(14)} ${first.padStart(12)}`,
  );
}
console.log(`dry: ${payload.faucetDry.length === 0 ? '(none)' : payload.faucetDry.join(', ')}`);
