/*
 * Multiverse Mages — W19: fold the seven per-horizon analyses into one table.
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
 * Reads the arm directories `fan-out.mjs` wrote — one per horizon — and reports,
 * per horizon:
 *
 * 1. **saturation**, the share of runs holding all fifty-one v1 nodes, because
 *    it is the variable that should explain every other number here;
 * 2. the eigenvalue spectrum, components for 80% and 95%, participation ratio,
 *    **and the between-strategy variance share beside the within-strategy
 *    diagonal** — the second is what stops mid-acquisition scatter from being
 *    reported as a second dimension;
 * 3. mean and minimum cross-strategy containment;
 * 4. prefix fidelity;
 * 5. per-strategy node counts and their spread;
 * 6. ascension by path, with the two structural gates stated rather than
 *    reported as zeroes.
 *
 * It also runs the two integrity checks the brief requires: **per-strategy
 * coverage**, and **seed equality across horizons**, compared pairwise on the
 * recorded `runSeed` rather than argued from `deriveRunSeed`'s signature.
 *
 * Everything numeric here is analysis, outside the rules path, so floats are
 * fine — `CLAUDE.md`'s fixed-point rule is about the simulation.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { HORIZONS } from './fan-out.mjs';

/** `ascension-min-tick`. Below it no universe can ascend by either path. */
export const ASCENSION_MIN_TICK = 600;

/**
 * The earliest tick at which Enduring Canon can be satisfied.
 *
 * `canonSatisfied` is `goodEraRun >= ascension-era-count` (4); `goodEraRun`
 * increments at most once per era boundary and `ERA_TICKS` is 240. Four
 * consecutive passes therefore cannot land before tick 960 — so a zero canon
 * count at 300, 450, 600 or 900 is arithmetic, not gameplay.
 */
export const CANON_MIN_TICK = 960;

/** `TERMINAL_REASON`, from `@mm/state`. */
const REASON = Object.freeze({
  0: 'cap',
  1: 'apotheosis',
  2: 'canon',
  3: 'stagnation',
  4: 'truncated',
});

/** The fifty-one v1 node ids, derived from content by `v1-nodes.mjs`. */
export function v1NodeIds() {
  const raw = execFileSync(process.execPath, ['tools/w19/v1-nodes.mjs'], { encoding: 'utf8' });
  return new Set(JSON.parse(raw));
}

function loadHorizon(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

const mean = (xs) => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

function main() {
  const root = process.argv[2] ?? '.w19/arm-a';
  const v1 = v1NodeIds();
  const out = { root, v1Size: v1.size, horizons: {}, coverage: {}, seedCheck: {} };

  /** `runSeed` by `cell:replicate`, per horizon, for the pairwise seed check. */
  const seedsByHorizon = {};

  for (const ticks of HORIZONS) {
    const dir = join(root, `h${String(ticks)}`);
    const arms = loadHorizon(dir);
    const runs = arms.flatMap((arm) => arm.runs);

    // --- integrity: per-strategy coverage --------------------------------------
    const perStrategy = new Map();
    for (const run of runs) {
      perStrategy.set(run.strategyId, [...(perStrategy.get(run.strategyId) ?? []), run]);
    }
    out.coverage[ticks] = Object.fromEntries(
      [...perStrategy].map(([id, rs]) => [id, rs.length]).sort(),
    );

    // --- integrity: seeds ------------------------------------------------------
    const seeds = {};
    for (const run of runs) {
      seeds[`${run.strategyId}:${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}`] =
        run.runSeed;
    }
    seedsByHorizon[ticks] = seeds;

    // --- 1. saturation ---------------------------------------------------------
    const v1CoverageOf = (run) => run.terminal.nodeIds.filter((id) => v1.has(id)).length;
    const saturated = runs.filter((run) => v1CoverageOf(run) === v1.size).length;

    // --- ascension -------------------------------------------------------------
    const reasons = {};
    for (const run of runs) {
      const key = REASON[run.terminalReason] ?? String(run.terminalReason);
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
    const ascended = (reasons.apotheosis ?? 0) + (reasons.canon ?? 0);

    // --- per strategy ----------------------------------------------------------
    const strategies = {};
    for (const [id, rs] of [...perStrategy].sort()) {
      const counts = rs.map((run) => run.terminal.nodeIds.length);
      const v1cov = rs.map(v1CoverageOf);
      const asc = rs.filter((run) => run.terminalReason === 1 || run.terminalReason === 2).length;
      strategies[id] = {
        n: rs.length,
        meanNodes: mean(counts),
        seNodes:
          rs.length < 2
            ? 0
            : Math.sqrt(
                counts.reduce((a, b) => a + (b - mean(counts)) ** 2, 0) /
                  (counts.length - 1) /
                  counts.length,
              ),
        meanV1Coverage: mean(v1cov),
        saturatedRuns: v1cov.filter((v) => v === v1.size).length,
        ascensions: asc,
        ascensionRate: asc / rs.length,
        meanTicks: mean(rs.map((run) => run.ticksRun)),
      };
    }
    const means = Object.values(strategies).map((s) => s.meanNodes);

    // --- 2/3/4: the spectrum, containment and prefix fidelity, from W15's tool --
    const analysis = JSON.parse(
      execFileSync(process.execPath, ['tools/w15/analyse.mjs', dir, 'strategyId', '--json'], {
        encoding: 'utf8',
        maxBuffer: 1 << 28,
      }),
    );
    const labels = Object.keys(analysis.overlap.containment).sort();
    const cross = [];
    const withinDiagonal = [];
    for (const a of labels) {
      for (const b of labels) {
        const value = analysis.overlap.containment[a][b];
        if (!Number.isFinite(value)) continue;
        if (a === b) withinDiagonal.push(value);
        else cross.push(value);
      }
    }
    const withinJ = labels.map((l) => analysis.groups[l].withinJaccard).filter(Number.isFinite);
    const crossJ = [];
    for (const a of labels) {
      for (const b of labels) {
        if (a === b) continue;
        const value = analysis.overlap.jaccard[a][b];
        if (Number.isFinite(value)) crossJ.push(value);
      }
    }

    out.horizons[ticks] = {
      runs: runs.length,
      saturation: { runs: saturated, fraction: saturated / runs.length },
      ascension: {
        gatedByMinTick: ticks < ASCENSION_MIN_TICK,
        canonReachable: ticks >= CANON_MIN_TICK,
        ascensions: ascended,
        rate: ascended / runs.length,
        byReason: reasons,
      },
      dimensionality: {
        binary: pick(analysis.spectra.binary),
        binaryShape: pick(analysis.spectra['binary-shape']),
        effort: pick(analysis.spectra.effort),
        effortShape: pick(analysis.spectra['effort-shape']),
      },
      containment: {
        crossMean: mean(cross),
        crossMin: cross.length === 0 ? Number.NaN : Math.min(...cross),
        withinMean: mean(withinDiagonal),
      },
      jaccard: { crossMean: mean(crossJ), withinMean: mean(withinJ) },
      prefixFidelity: analysis.prefixFidelity,
      strategies,
      spread: {
        minMeanNodes: Math.min(...means),
        maxMeanNodes: Math.max(...means),
        range: Math.max(...means) - Math.min(...means),
      },
    };
  }

  // --- integrity: seeds identical across horizons, compared pairwise ------------
  const base = HORIZONS[0];
  for (const ticks of HORIZONS.slice(1)) {
    const left = seedsByHorizon[base];
    const right = seedsByHorizon[ticks];
    const keys = Object.keys(left);
    const shared = keys.filter((k) => right[k] !== undefined);
    const equal = shared.filter((k) => left[k] === right[k]).length;
    out.seedCheck[`${String(base)}v${String(ticks)}`] = {
      compared: shared.length,
      equal,
      identical: equal === shared.length && shared.length === keys.length,
    };
  }

  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
}

function pick(spectrum) {
  const share = spectrum.eigenvalues
    .slice(0, 5)
    .map((v) => (spectrum.total > 0 ? v / spectrum.total : 0));
  return {
    nodeColumns: spectrum.nodeColumns,
    topShare: share,
    forEighty: spectrum.forEighty,
    forNinetyFive: spectrum.forNinetyFive,
    participationRatio: spectrum.participationRatio,
    betweenShare: spectrum.variance?.betweenShare,
  };
}

main();
