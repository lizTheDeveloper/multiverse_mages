/*
 * Multiverse Mages — W19: is a short horizon a prefix of a long one?
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
 * The horizons are run with their own explicit tick caps, and those are the
 * numbers reported. This file checks the claim that would have let them be
 * derived from one long run instead — because if it holds, the seven horizons
 * are provably the *same seven universes* read at seven moments rather than
 * seven separate experiments, and if it fails, that is itself worth knowing.
 *
 * `referenceOptions` reads `cohortSize`, `foundingMages`, `foundingNodes` and
 * `foundingSpeciesMask`, and **not** `worldTickCap`, so a capped run should be a
 * strict prefix of a longer one at the same coordinates. Checked, not assumed:
 *
 * - a run that reached its cap: its terminal node set must equal the 2400-tick
 *   run's composition sample at that tick;
 * - a run that ended early: it must have ended at the same tick, for the same
 *   reason, holding the same nodes as the 2400-tick run did.
 *
 * Failures are printed individually. A single one voids the derivation, not the
 * measurement.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { HORIZONS } from './fan-out.mjs';

function load(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')).runs);
}

const keyOf = (run) =>
  `${run.strategyId}:${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}`;

const sameSet = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

function main() {
  const root = process.argv[2] ?? '.w19/arm-a';
  const long = new Map(load(join(root, 'h2400')).map((run) => [keyOf(run), run]));
  const report = {};

  for (const ticks of HORIZONS) {
    if (ticks === 2400) continue;
    let compared = 0;
    let agree = 0;
    const failures = [];
    for (const short of load(join(root, `h${String(ticks)}`))) {
      const reference = long.get(keyOf(short));
      if (reference === undefined) continue;
      compared += 1;

      const endedEarly = short.ticksRun < ticks;
      const expected = endedEarly
        ? reference.terminal.nodeIds
        : (reference.samples.find((s) => s.worldTick === ticks)?.nodeIds ?? null);

      const ok =
        expected !== null &&
        sameSet(short.terminal.nodeIds, expected) &&
        (!endedEarly ||
          (short.ticksRun === reference.ticksRun &&
            short.terminalReason === reference.terminalReason));
      if (ok) agree += 1;
      else if (failures.length < 5) {
        failures.push({
          key: keyOf(short),
          endedEarly,
          shortTicks: short.ticksRun,
          longTicks: reference.ticksRun,
          shortNodes: short.terminal.nodeIds.length,
          expectedNodes: expected === null ? null : expected.length,
        });
      }
    }
    report[ticks] = { compared, agree, allAgree: compared > 0 && agree === compared, failures };
  }

  process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
}

main();
