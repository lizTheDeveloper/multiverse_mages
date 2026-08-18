#!/usr/bin/env node
/*
 * Multiverse Mages — W247: illegalActionRate, and which verbs are refused.
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
 * §7 puts a 0.01 ceiling on `illegalActionRate`. A pre-existing defect carries
 * it above that in both arms of `material-economy`, and this re-measures it so
 * the change can be reported as not having caused it.
 *
 * Writes to a **named** file. Never a directory glob — `CLAUDE.md` records an
 * aggregator that ate a previous run's records at a different tick count.
 *
 * Usage: node tools/w247/illegal-rate.mjs --out <path> [--ticks 600]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';

import { BOT_POOL_REGISTRY, adaptAgentSession, policiesForRun, runEpisode } from '@mm/mc-harness';
import { createSession } from '@mm/agent-api';
import { actionName, referenceContent, referenceScenario } from '@mm/scenario';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};

const out = flag('out', undefined);
if (out === undefined) {
  console.error('--out <path> is required');
  process.exit(2);
}
const ticks = Number.parseInt(flag('ticks', '600'), 10);
const seed = Number.parseInt(flag('seed', '20260813'), 10);

const content = referenceContent();
const rows = [];
const byAction = {};
let submitted = 0;
let rejected = 0;

for (const definition of BOT_POOL_REGISTRY.definitions) {
  const { scenario } = referenceScenario(content);
  const session = adaptAgentSession(
    createSession({ scenario, agentSlotIndex: 0, strategyId: definition.strategyId }),
  );
  const episode = runEpisode({
    session,
    runSeed: seed,
    scenarioConfig: { worldTickCap: ticks, options: {} },
    policies: policiesForRun({
      registry: BOT_POOL_REGISTRY,
      strategies: [definition.strategyId],
      runSeed: seed,
    }),
    worldTickCap: ticks,
  });
  const accounting = episode.accounting;
  submitted += accounting.submissions;
  rejected += accounting.rejections;
  for (const [action, count] of Object.entries(accounting.byActionId ?? {})) {
    byAction[action] = (byAction[action] ?? 0) + count;
  }
  rows.push({
    strategyId: definition.strategyId,
    submitted: accounting.submissions,
    rejected: accounting.rejections,
    rate: accounting.submissions === 0 ? 0 : accounting.rejections / accounting.submissions,
  });
}

// A third exit for "the probe is broken" rather than folding it into a number.
// `CLAUDE.md`: a checker that answers about the wrong input is worse than none,
// and a NaN printed as a rate is exactly that.
if (!Number.isFinite(submitted) || !Number.isFinite(rejected) || submitted === 0) {
  console.error(
    `probe broken: submissions=${String(submitted)} rejections=${String(rejected)}. ` +
      'A rate cannot be computed from these, and printing one would be a fabricated measurement.',
  );
  process.exit(3);
}
const pooled = rejected / submitted;
const payload = {
  probe: 'w247-illegal-action-rate',
  takenAt: new Date().toISOString(),
  requestedTicks: ticks,
  runSeed: seed,
  pooled: { submitted, rejected, rate: pooled, ceiling: 0.01, overCeiling: pooled > 0.01 },
  rejectedByAction: Object.fromEntries(
    Object.entries(byAction)
      .sort((a, b) => b[1] - a[1])
      .map(([action, count]) => [`${action} ${actionName(Number(action))}`, count]),
  ),
  rows,
};
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`illegalActionRate — seed ${String(seed)}, --ticks ${String(ticks)} -> ${out}`);
console.log(`pooled ${String(rejected)}/${String(submitted)} = ${pooled.toFixed(4)} (ceiling 0.01) ${pooled > 0.01 ? 'OVER' : 'under'}`);
console.log('rejections by action:');
for (const [action, count] of Object.entries(payload.rejectedByAction)) {
  console.log(`  ${action.padEnd(30)} ${String(count)}`);
}
