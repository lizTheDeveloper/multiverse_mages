/*
 * Multiverse Mages — W63: who *qualifies*, as distinct from who declares.
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
 * ## Why this exists rather than another rate table
 *
 * Every committed record answers *"did this run end `ascended`"*, and that is a
 * conjunction of two different facts: the universe **qualified**, and the policy
 * **declared**. `passive-control`'s stance is `never` — `effectivePreferences`
 * strips action 15 from its list — so it reports 0 of 40 whether it reached an
 * ascension path or not, and the one question this workstream was opened on is
 * exactly which of those two it is.
 *
 * `GodStateRecord.ascensionFirstMetTick` separates them. The god system writes
 * it the first tick `qualifyingPath` leaves `none`, regardless of what any
 * policy submits, so it is a fact about the **universe** and not about the bot.
 * A non-zero value on a strategy that submits nothing is the defect the campaign
 * has been chasing; a zero is its absence, and neither is visible in an
 * ascension rate.
 *
 * ## What it does not do
 *
 * It computes no margin. `exploitMargin` is identically `ascensionRate −
 * probeRate` while the probe loses, so it adds nothing to the per-strategy
 * counts and hides which strategy moved. Counts first, rates second, nothing
 * derived.
 *
 *     node tools/w63/qualification.mjs --in mc-results/w63/before [--label before]
 *
 * Input is a directory of `test1__<strategy>.json` files as written by
 * `tools/w58/test1.mjs`, which is the production episode path with a read-only
 * probe system appended and its own inertness check recorded in every file.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseArgs } from '../w58/harness.mjs';

/** `ASCENSION_PATH` in `packages/state`. */
const PATH_NAME = { 0: 'none', 1: 'apotheosis', 2: 'canon' };

/** `TERMINAL_REASON` in `packages/state`. */
const REASON_NAME = {
  0: 'none',
  1: 'ascensionApotheosis',
  2: 'ascensionCanon',
  3: 'stagnation',
  4: 'truncated',
};

/** `GOD_ACTION.declareAscension`. */
const DECLARE = '15';

function load(dir) {
  const files = readdirSync(dir)
    .filter((name) => name.startsWith('test1__') && name.endsWith('.json'))
    .sort();
  return files.map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarise(file) {
  const runs = file.runs;
  // Qualified is read off the universe, not off the outcome: a strategy whose
  // stance is `never` can qualify in every run and ascend in none.
  const qualified = runs.filter((run) => (run.terminal?.ascensionFirstMetTick ?? 0) !== 0);
  const ascended = runs.filter((run) => run.status === 'ascended');
  const declared = runs.filter((run) => (run.submittedByAction?.[DECLARE] ?? 0) > 0);

  const paths = {};
  for (const run of runs) {
    const key = PATH_NAME[run.terminal?.ascensionPath ?? 0] ?? String(run.terminal?.ascensionPath);
    paths[key] = (paths[key] ?? 0) + 1;
  }
  const reasons = {};
  for (const run of runs) {
    const key = REASON_NAME[run.terminalReason] ?? String(run.terminalReason);
    reasons[key] = (reasons[key] ?? 0) + 1;
  }

  return {
    strategyId: file.strategyId,
    inert: file.probeInertness?.agrees === true,
    runs: runs.length,
    qualified: qualified.length,
    ascended: ascended.length,
    declaredIn: declared.length,
    firstMetMedian: median(qualified.map((run) => run.terminal.ascensionFirstMetTick)),
    firstMetMin: qualified.length === 0 ? null : Math.min(...qualified.map((run) => run.terminal.ascensionFirstMetTick)),
    paths,
    reasons,
    nodesKnown: mean(runs.map((run) => run.terminal?.nodesKnown ?? 0)),
    universities: mean(runs.map((run) => run.terminal?.universities ?? 0)),
    worshipTier: mean(runs.map((run) => run.terminal?.worshipTier ?? 0)),
    goodEraRun: mean(runs.map((run) => run.terminal?.goodEraRun ?? 0)),
    grimoires: mean(runs.map((run) => run.terminal?.grimoires ?? 0)),
    ticks: mean(runs.map((run) => run.ticksRun)),
  };
}

function fixed(value, places = 1) {
  return value === null ? '     -' : value.toFixed(places).padStart(6);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.in ?? 'mc-results/w63';
  const label = args.label ?? dir;

  const rows = load(dir).map(summarise);
  // Qualification first, because it is the question. Ties broken by id so two
  // runs of this tool over the same directory print the same table.
  rows.sort((a, b) => b.qualified / b.runs - a.qualified / a.runs || a.strategyId.localeCompare(b.strategyId));

  const lines = [];
  lines.push(`=== ${label} ===`);
  const notInert = rows.filter((row) => !row.inert);
  lines.push(
    notInert.length === 0
      ? 'probe inertness: every strategy agrees with an unprobed run, so the numbers stand'
      : `PROBE NOT INERT for ${notInert.map((row) => row.strategyId).join(', ')} — these numbers are void`,
  );
  lines.push('');
  lines.push(
    'strategy               qual/n  asc/n  decl/n  firstMet  nodes   unis   tier  eraRun  books   ticks',
  );
  for (const row of rows) {
    lines.push(
      [
        row.strategyId.padEnd(21),
        `${String(row.qualified).padStart(3)}/${String(row.runs).padEnd(3)}`,
        `${String(row.ascended).padStart(3)}/${String(row.runs).padEnd(3)}`,
        `${String(row.declaredIn).padStart(4)}/${String(row.runs).padEnd(3)}`,
        String(row.firstMetMedian ?? '-').padStart(8),
        fixed(row.nodesKnown),
        fixed(row.universities),
        fixed(row.worshipTier),
        fixed(row.goodEraRun),
        fixed(row.grimoires),
        fixed(row.ticks, 0),
      ].join(' '),
    );
  }
  lines.push('');
  for (const row of rows) {
    lines.push(
      `${row.strategyId.padEnd(21)} paths ${JSON.stringify(row.paths)}  terminal ${JSON.stringify(row.reasons)}`,
    );
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
