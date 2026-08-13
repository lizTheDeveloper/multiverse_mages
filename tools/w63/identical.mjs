/*
 * Multiverse Mages — W63: which universes the conjunct changed, by snapshot hash.
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
 * ## The question a rate table cannot answer
 *
 * "The ascension gate's numbers moved" is compatible with two very different
 * stories: the conjunct perturbed every universe a little, or it changed a few
 * universes completely and left the rest untouched. Those have opposite
 * implications for whether a balance delta is attributable, and a mean cannot
 * tell them apart.
 *
 * `snapshotHash` can. It is a digest over the whole simulation state, so two
 * runs agreeing on it agree on **every component of every entity** — not merely
 * on the metrics somebody chose to aggregate. Because the two arms differ by one
 * authored constant and nothing else, and `deriveRunSeed` reads neither the
 * strategy nor any constant, a matching hash at the same coordinates is proof
 * that the conjunct did not touch that universe at any point in 2400 ticks.
 *
 * That is a much stronger statement than "the metrics agree", and it is the one
 * a balance rationale should rest on: a delta confined to the runs that changed
 * is attributable, and a delta smeared across runs that did not is a bug.
 *
 *     node tools/w63/identical.mjs --before mc-results/w63/before --after mc-results/w63/after
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseArgs } from '../w58/harness.mjs';

function load(dir) {
  const out = new Map();
  for (const name of readdirSync(dir).filter((f) => f.startsWith('test1__') && f.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    out.set(parsed.strategyId, parsed);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const before = load(args.before ?? 'mc-results/w63/before');
  const after = load(args.after ?? 'mc-results/w63/after');

  const lines = [];
  lines.push('=== which universes the conjunct changed, by snapshot hash ===');
  lines.push('');
  lines.push('A matching hash means the two arms produced the same world at every tick, not merely');
  lines.push('the same metrics. Differing hashes are listed with what changed.');
  lines.push('');
  lines.push('strategy               paired  identical  differing   asc before/after');

  let totalPaired = 0;
  let totalSame = 0;
  for (const strategyId of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const b = before.get(strategyId);
    const a = after.get(strategyId);
    if (b === undefined || a === undefined) continue;
    const byKey = new Map(b.runs.map((r) => [`${String(r.cellIndex)}:${String(r.replicateIndex)}`, r]));
    let paired = 0;
    let same = 0;
    let ascB = 0;
    let ascA = 0;
    for (const runA of a.runs) {
      const runB = byKey.get(`${String(runA.cellIndex)}:${String(runA.replicateIndex)}`);
      if (runB === undefined) continue;
      paired += 1;
      if (runB.snapshotHash === runA.snapshotHash) same += 1;
      if (runB.status === 'ascended') ascB += 1;
      if (runA.status === 'ascended') ascA += 1;
    }
    totalPaired += paired;
    totalSame += same;
    lines.push(
      [
        strategyId.padEnd(21),
        String(paired).padStart(6),
        String(same).padStart(10),
        String(paired - same).padStart(10),
        `${String(ascB).padStart(10)}/${String(ascA)}`,
      ].join(' '),
    );
  }

  lines.push('');
  lines.push(
    `TOTAL: ${String(totalSame)} of ${String(totalPaired)} paired runs are bit-identical across the two arms.`,
  );
  lines.push(
    'The complement is the set of universes the conjunct actually touched, and any balance delta',
    'must be attributable to it alone. A delta appearing in a run whose hash matched would be a bug.',
  );
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
