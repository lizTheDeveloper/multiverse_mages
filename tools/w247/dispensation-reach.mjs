#!/usr/bin/env node
/*
 * Multiverse Mages — W247: is `issue-dispensation` reachable without an endowment?
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
 * `issue-dispensation` (action 5) is priced in `essence`, and `essence` is
 * yielded by Vim alone. This reports, per strategy, the ticks the **mask**
 * permitted the verb and the ticks the rules **applied** it, so that the two
 * arms — founded holding an `essence` endowment, and founded holding none — can
 * be compared on one instrument.
 *
 * The endowed arm is the **positive control**. A probe that reads zero in the
 * un-endowed arm says nothing unless the same probe reads non-zero somewhere,
 * and this campaign has shipped a metric that could only ever read zero.
 *
 * `--out` is required and is never a directory glob, for the reason recorded in
 * `CLAUDE.md`: an aggregator that folds a directory eats a previous run's
 * records at a different `--ticks`.
 *
 * Usage: node tools/w247/dispensation-reach.mjs --out <path> [--ticks 1200]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { GOD_ACTION } from '@mm/agent-api';
import { AUDIT_RUN_SEED, auditPool, referenceContent } from '@mm/scenario';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const out = flag('out', undefined);
if (out === undefined) {
  console.error('--out <path> is required: this probe never writes to a directory it globs later');
  process.exit(2);
}
const ticks = Number.parseInt(flag('ticks', '1200'), 10);
const seed = Number.parseInt(flag('seed', String(AUDIT_RUN_SEED)), 10);
const label = flag('label', 'unlabelled');

const content = referenceContent();
const audits = auditPool({ content, worldTickCap: ticks, runSeed: seed });

if (audits.length === 0) {
  console.error('PROBE BROKEN: the strategy pool audited zero runs, so no verb can be read. This ' +
    'is not a statement that issue-dispensation is unreachable.');
  process.exit(3);
}

const rows = audits.map((audit) => {
  const verb = audit.verbs.find((entry) => entry.action === GOD_ACTION.issueDispensation);
  return {
    strategyId: audit.strategyId,
    ticks: audit.ticks,
    // `undefined` means the verb never appeared in this run's audit rows at all,
    // which is a different fact from "appeared and was never legal". Kept
    // distinct rather than folded to 0: `undefined === 0` is false, and this
    // campaign has already had a RED test pass on exactly that confusion.
    listed: verb !== undefined,
    ticksLegal: verb?.ticksLegal ?? null,
    timesSubmitted: verb?.timesSubmitted ?? null,
    timesApplied: verb?.timesApplied ?? null,
    verdict: verb?.verdict ?? null,
  };
});

const payload = {
  probe: 'w247-dispensation-reach',
  arm: label,
  takenAt: new Date().toISOString(),
  requestedTicks: ticks,
  runSeed: seed,
  action: GOD_ACTION.issueDispensation,
  rows,
  poolTicksLegal: rows.reduce((sum, row) => sum + (row.ticksLegal ?? 0), 0),
  poolTimesApplied: rows.reduce((sum, row) => sum + (row.timesApplied ?? 0), 0),
};
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`issue-dispensation (action ${String(GOD_ACTION.issueDispensation)}) — arm "${label}", seed ${String(seed)}, --ticks ${String(ticks)} -> ${out}`);
console.log('strategy                     legal/ticks   submitted   applied  verdict');
for (const row of rows) {
  if (!row.listed) {
    console.log(`${row.strategyId.padEnd(28)} ${'(not audited)'.padStart(11)}`);
    continue;
  }
  console.log(
    `${row.strategyId.padEnd(28)} ${String(row.ticksLegal).padStart(5)}/${String(row.ticks).padStart(5)} ` +
      `${String(row.timesSubmitted).padStart(11)} ${String(row.timesApplied).padStart(9)}  ${row.verdict}`,
  );
}
console.log(`POOL legal ${String(payload.poolTicksLegal)}, applied ${String(payload.poolTimesApplied)}`);
