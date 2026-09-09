/*
 * Multiverse Mages — W63: the before-arm against the after-arm, world by world.
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
 * ## Why paired, and why that is available here for free
 *
 * `deriveRunSeed` is a pure function of `(rootSeed, sweepId, cellIndex,
 * replicateIndex)`. It does not read the strategy and it does not read any god
 * constant. So the before-arm and the after-arm at the same coordinates get the
 * same run seed and therefore **the same starting universe**, and "the universe
 * qualified before the change and did not after it" is a statement about one
 * world rather than about two samples of a distribution.
 *
 * That makes the discordant-pair counts a sign test, and they are reported
 * instead of a difference of rates because the outcome is binary and the
 * denominator is the same forty worlds on both sides.
 *
 * ## What a discordant pair means in each direction
 *
 * - **before-only**: the conjunct closed a qualification that used to happen.
 *   This is the change doing its job, and the count is its effect size.
 * - **after-only**: the conjunct *opened* one. This should be empty for every
 *   strategy — adding a conjunct can only remove qualifications — and a non-zero
 *   count here is evidence of a bug in the wiring rather than of a strong
 *   result, so it is reported loudly rather than folded into a net.
 *
 *     node tools/w63/paired.mjs --before mc-results/w63/before --after mc-results/w63/after
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseArgs } from '../w58/harness.mjs';

function load(dir) {
  const byStrategy = new Map();
  for (const name of readdirSync(dir).filter((file) => file.startsWith('test1__') && file.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    byStrategy.set(parsed.strategyId, parsed);
  }
  return byStrategy;
}

/** Qualification is read off the universe, never off the run's status. */
function qualified(run) {
  return (run.terminal?.ascensionFirstMetTick ?? 0) !== 0;
}

function key(run) {
  return `${String(run.cellIndex)}:${String(run.replicateIndex)}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const before = load(args.before ?? 'mc-results/w63/before');
  const after = load(args.after ?? 'mc-results/w63/after');

  const strategies = [...new Set([...before.keys(), ...after.keys()])].sort();
  const lines = [];
  lines.push('=== paired: same worlds, one constant apart ===');
  lines.push('');
  lines.push('strategy               n   qual(before)  qual(after)   before-only  after-only   ascended b/a');

  const anomalies = [];
  for (const strategyId of strategies) {
    const b = before.get(strategyId);
    const a = after.get(strategyId);
    if (b === undefined || a === undefined) {
      anomalies.push(`${strategyId}: present in only one arm, so no pairing is possible`);
      continue;
    }
    if (b.probeInertness?.agrees !== true || a.probeInertness?.agrees !== true) {
      anomalies.push(`${strategyId}: probe not inert in at least one arm — its numbers are void`);
    }
    const beforeByKey = new Map(b.runs.map((run) => [key(run), run]));
    let paired = 0;
    let qb = 0;
    let qa = 0;
    let beforeOnly = 0;
    let afterOnly = 0;
    let ascB = 0;
    let ascA = 0;
    let seedMismatch = 0;
    for (const runA of a.runs) {
      const runB = beforeByKey.get(key(runA));
      if (runB === undefined) continue;
      // The pairing is only meaningful if the two runs really are the same
      // world. Asserted rather than assumed, because a change to deriveRunSeed
      // would silently turn this table into an unpaired comparison.
      if (runB.runSeed !== runA.runSeed) seedMismatch += 1;
      paired += 1;
      const inB = qualified(runB);
      const inA = qualified(runA);
      if (inB) qb += 1;
      if (inA) qa += 1;
      if (inB && !inA) beforeOnly += 1;
      if (!inB && inA) afterOnly += 1;
      if (runB.status === 'ascended') ascB += 1;
      if (runA.status === 'ascended') ascA += 1;
    }
    if (seedMismatch > 0) {
      anomalies.push(`${strategyId}: ${String(seedMismatch)} pairs have different run seeds — NOT paired`);
    }
    if (afterOnly > 0) {
      anomalies.push(
        `${strategyId}: ${String(afterOnly)} world(s) qualify AFTER but not BEFORE. Adding a ` +
          'conjunct cannot do that; suspect the wiring, not the result.',
      );
    }
    lines.push(
      [
        strategyId.padEnd(21),
        String(paired).padStart(3),
        `${String(qb).padStart(8)}/${String(paired).padEnd(3)}`,
        `${String(qa).padStart(8)}/${String(paired).padEnd(3)}`,
        String(beforeOnly).padStart(12),
        String(afterOnly).padStart(11),
        `${String(ascB).padStart(9)}/${String(ascA)}`,
      ].join(' '),
    );
  }

  lines.push('');
  if (anomalies.length === 0) {
    lines.push('no anomalies: every strategy paired on identical run seeds, probes inert, no after-only qualification');
  } else {
    lines.push('ANOMALIES');
    for (const note of anomalies) lines.push(`  - ${note}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
