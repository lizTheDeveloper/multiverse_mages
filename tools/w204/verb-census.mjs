#!/usr/bin/env node
/*
 * Multiverse Mages — W204: how often every god verb fires, pooled over the pool.
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
 * `auditStrategy` answers *"did this strategy's preference order reach this
 * verb"* for one strategy. This pools all twelve, so the question becomes the
 * one the hunt asks: **is there any strategy in the shipped pool that makes this
 * verb resolve at all?**
 *
 * The union matters. A verb absent from one strategy's audit is unremarkable;
 * a verb that no strategy in the pool ever gets the rules to apply is a wire
 * that never binds, and no per-strategy view can see it.
 *
 * Usage: node tools/w204/verb-census.mjs [--ticks 600] [--seeds 1]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { BOT_POOL } from '@mm/mc-harness';
import { ACTION_SPACE_SIZE } from '@mm/agent-api';
import { AUDIT_RUN_SEED, actionName, auditStrategy, referenceContent } from '@mm/scenario';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const TICKS = Number.parseInt(flag('ticks', '600'), 10);
const SEEDS = Number.parseInt(flag('seeds', '1'), 10);
const JSON_OUT = flag('json', undefined);

const content = referenceContent();
const totals = new Map();
for (let action = 0; action < ACTION_SPACE_SIZE; action += 1) {
  totals.set(action, { action, name: actionName(action), legal: 0, listed: 0, submitted: 0, applied: 0, byStrategy: {} });
}

for (let index = 0; index < SEEDS; index += 1) {
  const runSeed = AUDIT_RUN_SEED + index;
  for (const definition of BOT_POOL) {
    const audit = auditStrategy(definition, { content, runSeed, worldTickCap: TICKS });
    for (const verb of audit.verbs) {
      const row = totals.get(verb.action);
      row.legal += verb.ticksLegal;
      row.listed += verb.timesListed;
      row.submitted += verb.timesSubmitted;
      row.applied += verb.timesApplied;
      row.byStrategy[definition.strategyId] = {
        legal: verb.ticksLegal,
        listed: verb.timesListed,
        submitted: verb.timesSubmitted,
        applied: verb.timesApplied,
        verdict: verb.verdict,
      };
    }
  }
}

console.log(
  `W204 verb census — ${String(BOT_POOL.length)} strategies x ${String(SEEDS)} seed(s) x ` +
    `${String(TICKS)} ticks. Pooled over the whole shipped bot pool.\n`,
);
console.log(`${'id'.padStart(3)}  ${'verb'.padEnd(26)}${'legal'.padStart(9)}${'listed'.padStart(9)}${'submitted'.padStart(11)}${'applied'.padStart(9)}  note`);
console.log('-'.repeat(96));
const rows = [...totals.values()];
for (const row of rows) {
  const note =
    row.legal === 0
      ? 'never legal in any run — the mask, not the pool'
      : row.submitted === 0
        ? 'legal and never submitted by anybody'
        : row.applied === 0
          ? 'SUBMITTED AND NEVER APPLIED — mask and rules disagree'
          : '';
  console.log(
    `${String(row.action).padStart(3)}  ${row.name.padEnd(26)}${String(row.legal).padStart(9)}${String(row.listed).padStart(9)}` +
      `${String(row.submitted).padStart(11)}${String(row.applied).padStart(9)}  ${note}`,
  );
}

if (JSON_OUT !== undefined) {
  writeFileSync(JSON_OUT, `${JSON.stringify({ ticks: TICKS, seeds: SEEDS, rows }, undefined, 2)}\n`);
  console.log(`\nwrote ${JSON_OUT}`);
}
