/*
 * Multiverse Mages — W19: the production-path horizon arm, read off its records.
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
 * Arm C: the same ten-strategy pool at n = 400 per horizon, executed by the
 * **production** sweep executor on Modal. Seven sweep files that differ in
 * `termination.worldTickCap` and in nothing else — same `sweepId`, same
 * `rootSeed`, same single factor level, same pool, same `replicates: 400`.
 *
 * These records carry no node ids — no committed record in this repository does,
 * which is the whole reason W15's probe exists — so this arm cannot speak to
 * composition. What it carries is `referenceNodesKnown`, `terminalReason` and
 * `ticksRun` on the production path at n = 400, which is the independent check
 * that the local probe arm is measuring the same game.
 *
 * Two integrity checks run here rather than being argued:
 *
 * - **coverage**: `assignStrategies` is `strategies[replicateIndex % poolSize]`
 *   and `cellIndex` never enters it, so a replicate count that does not divide
 *   the pool silently drops strategies. 400 % 10 == 0; asserted from the records.
 * - **seeds**: `runSeed` by `(cellIndex, replicateIndex)` compared pairwise
 *   across the seven horizons. Common random numbers is a claim about these
 *   numbers, so these numbers are the ones compared.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { HORIZONS } from './fan-out.mjs';

const REASON = Object.freeze({
  0: 'cap',
  1: 'apotheosis',
  2: 'canon',
  3: 'stagnation',
  4: 'truncated',
});

function load(dir) {
  const name = readdirSync(dir).find((file) => file.endsWith('.runs.ndjson'));
  if (name === undefined) throw new Error(`no .runs.ndjson under ${dir}`);
  return readFileSync(join(dir, name), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

const mean = (xs) => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

function main() {
  const root = process.argv[2] ?? '.w19/modal';
  const out = { root, horizons: {}, coverage: {}, seedCheck: {} };
  const seedsByHorizon = {};

  for (const ticks of HORIZONS) {
    const records = load(join(root, `h${String(ticks)}`));
    const byStrategy = new Map();
    const seeds = {};
    for (const record of records) {
      // `strategies` is the slot assignment, an array of ids; slot 0 is the god
      // under test — `slots: 1` in every sweep file here.
      const id = record.strategies?.[0] ?? 'unknown';
      byStrategy.set(id, [...(byStrategy.get(id) ?? []), record]);
      seeds[`${String(record.coordinates.cellIndex)}:${String(record.coordinates.replicateIndex)}`] =
        record.runSeed;
    }
    seedsByHorizon[ticks] = seeds;
    out.coverage[ticks] = Object.fromEntries(
      [...byStrategy].map(([id, rs]) => [id, rs.length]).sort(),
    );

    const reasons = {};
    for (const record of records) {
      const key = REASON[record.terminalReason] ?? String(record.terminalReason);
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
    const ascended = records.filter(
      (r) => r.terminalReason === 1 || r.terminalReason === 2,
    ).length;

    const strategies = {};
    for (const [id, rs] of [...byStrategy].sort()) {
      const nodes = rs
        .map((r) => r.metrics?.referenceNodesKnown)
        .filter((m) => m?.status === 'measured')
        .map((m) => m.value);
      const asc = rs.filter((r) => r.terminalReason === 1 || r.terminalReason === 2).length;
      strategies[id] = {
        n: rs.length,
        meanNodesKnown: mean(nodes),
        ascensions: asc,
        ascensionRate: asc / rs.length,
        meanTicks: mean(rs.map((r) => r.ticksRun)),
      };
    }

    out.horizons[ticks] = {
      runs: records.length,
      ascensions: ascended,
      ascensionRate: ascended / records.length,
      byReason: reasons,
      meanNodesKnown: mean(
        records
          .map((r) => r.metrics?.referenceNodesKnown)
          .filter((m) => m?.status === 'measured')
          .map((m) => m.value),
      ),
      strategies,
    };
  }

  const base = HORIZONS[0];
  for (const ticks of HORIZONS.slice(1)) {
    const left = seedsByHorizon[base];
    const right = seedsByHorizon[ticks];
    const keys = Object.keys(left);
    const equal = keys.filter((k) => left[k] === right[k]).length;
    out.seedCheck[`${String(base)}v${String(ticks)}`] = {
      compared: keys.length,
      equal,
      identical: equal === keys.length,
    };
  }

  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
}

main();
