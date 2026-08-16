#!/usr/bin/env node
/*
 * Multiverse Mages — W247: how often action 11 is legal, per strategy.
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
 * The measurement that removed `fund-university`'s `labor` price, re-taken so it
 * can be compared against itself either side of the reserve floor.
 *
 * `reference-universe.ts` records it as *"action 11 came back legal on 8 ticks
 * of 585"*, which is `StrategyAudit.founding.ticksLegal` over `audit.ticks` for
 * one strategy. That figure alone cannot say whether a fix worked, because the
 * denominator moves with the run: a run that terminates early has fewer ticks
 * and a strategy that never lists the verb has none. So this prints the whole
 * pool with both numbers and the fraction, and writes them to a file **named on
 * the command line**.
 *
 * `--out` is required and is never a directory glob. `CLAUDE.md` records an
 * aggregator that folded every `.ndjson` under a directory and so ate a previous
 * run's records at a different `--ticks`: the archive was well formed, every
 * number plausible, and the only symptom was a denominator that did not match
 * the flag. A named file cannot do that.
 *
 * Usage: node tools/w247/action11-legality.mjs --out <path> [--ticks 600]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { GOD_ACTION } from '@mm/agent-api';
import { AUDIT_RUN_SEED, auditFounding, referenceContent } from '@mm/scenario';

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
const audits = auditFounding({ content, worldTickCap: ticks, runSeed: seed });

const rows = audits.map((audit) => {
  const legal = audit.founding.ticksLegal;
  return {
    strategyId: audit.strategyId,
    ticks: audit.ticks,
    ticksLegalAction11: legal,
    fractionLegal: audit.ticks === 0 ? 0 : legal / audit.ticks,
    ticksAffordableFavor: audit.founding.ticksAffordable,
    submittedFound: audit.founding.submittedFound,
    submittedFund: audit.founding.submittedFund,
    founded: audit.founding.founded,
    completed: audit.founding.completed,
    timesApplied: audit.verbs.find((verb) => verb.action === GOD_ACTION.fundUniversity)?.timesApplied ?? 0,
  };
});

const payload = {
  probe: 'w247-action11-legality',
  takenAt: new Date().toISOString(),
  requestedTicks: ticks,
  runSeed: seed,
  rows,
};
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

const pad = (value, width) => String(value).padStart(width);
console.log(`action 11 legality — seed ${String(seed)}, --ticks ${String(ticks)} -> ${out}`);
console.log('strategy                      legal/ticks      fraction  found  applied');
for (const row of rows) {
  console.log(
    `${row.strategyId.padEnd(28)} ${pad(row.ticksLegalAction11, 5)}/${pad(row.ticks, 4)}  ` +
      `${pad((row.fractionLegal * 100).toFixed(2), 10)}%  ${pad(row.founded, 5)}  ${pad(row.timesApplied, 7)}`,
  );
}
