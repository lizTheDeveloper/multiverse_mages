/*
 * Multiverse Mages — W20: whether two mages in one universe hold incomparable sets.
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
 * Reads the arm files `run-mage-arm.mjs` wrote and answers the question
 * `compositional-content.md` §6 lists first: **do two mages in one universe
 * hold incomparable knowledge sets?**
 *
 * For every unordered pair of living mages with non-empty held-node sets, in
 * every run, a pair is classified exactly one of:
 *
 * - **incomparable** — neither `A ⊆ B` nor `B ⊆ A`. This is the shape the
 *   dragon claim needs to exist at all.
 * - **equal** — `A = B`, the degenerate case of nested. Reported apart from
 *   strict nesting because "identical sets" and "one is a strict prefix of the
 *   other" are different failures with different fixes, and folding them
 *   together is exactly how the campaign's containment 1.000 hid which one it
 *   was.
 * - **nested (strict)** — one is a proper subset of the other and they are not
 *   equal. Implicit: `1 - incomparableFraction - equalFraction`.
 *
 * `containment = |A∩B| / min(|A|,|B|)` is carried alongside the classification
 * because it is the same quantity `w15/analyse.mjs` reports for
 * cross-strategy sets, and the two numbers are meant to sit side by side: that
 * table asked whether eight *strategies* converge on one queue, this one asks
 * whether two *mages inside one strategy's run* do.
 *
 * ## Runs are the unit of aggregation
 *
 * A strategy's headline numbers are the mean, across its runs, of each run's
 * own fraction — never a pool of every pair from every run mixed together.
 * Pooling would let a single run with many living mages (and therefore many
 * pairs) dominate the strategy's number; the run is the independent trial,
 * the same choice `w15/analyse.mjs` makes by keeping rows as runs rather than
 * strategy means.
 *
 * A run that ends with fewer than two living mages holding anything — a
 * plausible outcome at `cohortSize: 4` after 480 ticks — contributes no pairs.
 * Its per-run fraction is `NaN` and it is filtered out of the strategy mean
 * rather than propagating NaN into it; the run still counts toward
 * `runsConsidered` vs. `runsWithPairs` so the report can say how much of the
 * mean is resting on how little.
 *
 * ## Usage
 *
 *     node tools/w20/analyse-mages.mjs .w20/arm-a
 *     node tools/w20/analyse-mages.mjs .w20/arm-a --json
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Loads every arm file under a directory, in filename order. */
export function loadArms(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

/**
 * Containment: `|A ∩ B| / min(|A|, |B|)`.
 *
 * Identical definition to `w15/analyse.mjs`'s `containment`, restated rather
 * than imported so this file reads standalone the way `w15/analyse.mjs` does;
 * see that file's doc comment for why containment and not Jaccard.
 */
export function containment(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const id of left) if (right.has(id)) shared += 1;
  const smaller = Math.min(left.size, right.size);
  return smaller === 0 ? Number.NaN : shared / smaller;
}

/**
 * Classifies one pair of held-node sets.
 *
 * `equal` is checked before `nested`, and `nested` covers both directions —
 * the direction itself is not reported because the claim under test is
 * symmetric (*"neither is a subset of the other"*), not "which one contains
 * which".
 */
export function classifyPair(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  const leftInRight = [...left].every((id) => right.has(id));
  const rightInLeft = [...right].every((id) => left.has(id));
  if (leftInRight && rightInLeft) return 'equal';
  if (leftInRight || rightInLeft) return 'nested';
  return 'incomparable';
}

/** Mean of the finite values in an array; `NaN` if none are finite. */
function meanFinite(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length === 0 ? Number.NaN : finite.reduce((a, b) => a + b, 0) / finite.length;
}

/**
 * `Math.min`/`Math.max` over the finite values only.
 *
 * A run with zero living mages reports `minNodes`/`maxNodes` as `NaN`
 * (`nodeCountStats` on an empty list), and `Math.min`/`Math.max` propagate a
 * single `NaN` into the whole aggregate — one dead-universe run would then
 * poison the strategy's min/max while every mean survives via
 * {@link meanFinite}. Filtering first keeps the two aggregation rules
 * consistent.
 */
function extremeFinite(values, which) {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length === 0 ? Number.NaN : which(...finite);
}

/**
 * Every unordered pair among mages with a non-empty held set.
 *
 * An empty set is excluded per the task: it is a subset of every set,
 * including another empty one, and counting it would manufacture "nested"
 * and "equal" pairs out of two mages who have simply learned nothing yet.
 */
function pairsOf(mages) {
  const withKnowledge = mages.filter((m) => m.nodeIds.length > 0);
  const pairs = [];
  for (let i = 0; i < withKnowledge.length; i += 1) {
    for (let j = i + 1; j < withKnowledge.length; j += 1) {
      pairs.push([withKnowledge[i], withKnowledge[j]]);
    }
  }
  return pairs;
}

/** Fractions and mean containment over a list of already-formed pairs. Empty list is all `NaN`. */
function summarisePairs(pairs) {
  if (pairs.length === 0) {
    return {
      pairs: 0,
      incomparableFraction: Number.NaN,
      equalFraction: Number.NaN,
      nestedStrictFraction: Number.NaN,
      meanContainment: Number.NaN,
    };
  }
  let incomparable = 0;
  let equal = 0;
  const containments = [];
  for (const [a, b] of pairs) {
    const kind = classifyPair(a.nodeIds, b.nodeIds);
    if (kind === 'incomparable') incomparable += 1;
    else if (kind === 'equal') equal += 1;
    containments.push(containment(a.nodeIds, b.nodeIds));
  }
  return {
    pairs: pairs.length,
    incomparableFraction: incomparable / pairs.length,
    equalFraction: equal / pairs.length,
    nestedStrictFraction: (pairs.length - incomparable - equal) / pairs.length,
    meanContainment: meanFinite(containments),
  };
}

/** Mean/min/max/count over a list of mages' node counts. `0` mages reports all `NaN` except count. */
function nodeCountStats(mages) {
  const counts = mages.map((m) => m.nodeIds.length);
  return {
    count: mages.length,
    meanNodes: counts.length === 0 ? Number.NaN : counts.reduce((a, b) => a + b, 0) / counts.length,
    minNodes: counts.length === 0 ? Number.NaN : Math.min(...counts),
    maxNodes: counts.length === 0 ? Number.NaN : Math.max(...counts),
  };
}

/**
 * The measurement taken off one list of living mages — the shape shared by a
 * run's terminal state and a single era sample, so a horizon and a terminal
 * reading are directly comparable numbers rather than two different shapes
 * that happen to look similar.
 */
function mageSetMeasurement(mages) {
  const pairs = pairsOf(mages);
  const summary = summarisePairs(pairs);
  const nodeStats = nodeCountStats(mages);
  const unionNodes = new Set(mages.flatMap((m) => m.nodeIds)).size;
  const largestMageNodes = mages.length === 0 ? 0 : Math.max(...mages.map((m) => m.nodeIds.length));
  return {
    livingMageCount: mages.length,
    ...nodeStats,
    unionNodes,
    largestMageNodes,
    unionMinusLargest: unionNodes - largestMageNodes,
    ...summary,
  };
}

/**
 * One run's terminal measurement: the primary numbers, plus the species
 * breakdown.
 *
 * The species breakdown restricts pairs to **within-species** — the dragon
 * claim is about one long-lived species reaching further down fewer schools,
 * which is a statement about mages of the *same* species compared to each
 * other, not about a gnome compared to a dragon.
 */
export function runMeasurement(run) {
  const mages = run.terminal.mages;

  const bySpeciesInput = new Map();
  for (const mage of mages) {
    const list = bySpeciesInput.get(mage.speciesName) ?? [];
    list.push(mage);
    bySpeciesInput.set(mage.speciesName, list);
  }
  const bySpecies = {};
  for (const [speciesName, speciesMages] of bySpeciesInput) {
    bySpecies[speciesName] = {
      ...nodeCountStats(speciesMages),
      ...summarisePairs(pairsOf(speciesMages)),
    };
  }

  return {
    strategyId: run.strategyId,
    coordinates: run.coordinates,
    ticksRun: run.ticksRun,
    terminalReason: run.terminalReason,
    ...mageSetMeasurement(mages),
    bySpecies,
  };
}

/**
 * Fixed-horizon composition — the same era grid `w15/composition.mjs` samples
 * on (`ERA_TICKS = 240`), read here off `run.samples` rather than
 * `run.terminal`.
 *
 * This is the only way to tell "a different destination" from "the same
 * destination reached at a different speed", exactly as `w15/analyse.mjs`'s
 * own horizons section argues: runs terminate anywhere between tick 500 and
 * 2400, so a terminal-only comparison conflates duration with choice. A
 * strategy whose mages *start* incomparable and only converge by the terminal
 * tick is a different finding from one that starts identical and never
 * diverges.
 */
export const HORIZON_TICKS = Object.freeze([240, 480, 960, 1440]);

function horizonsForStrategy(runs) {
  const horizons = {};
  for (const tick of HORIZON_TICKS) {
    const atTick = runs
      .map((run) => run.samples.find((sample) => sample.worldTick === tick))
      .filter((sample) => sample !== undefined)
      .map((sample) => mageSetMeasurement(sample.mages));
    if (atTick.length === 0) continue;
    const withPairs = atTick.filter((m) => m.pairs > 0);
    horizons[tick] = {
      runs: atTick.length,
      runsWithPairs: withPairs.length,
      meanLivingMages: meanFinite(atTick.map((m) => m.livingMageCount)),
      meanNodesPerMage: meanFinite(atTick.map((m) => m.meanNodes)),
      incomparablePairFraction: meanFinite(withPairs.map((m) => m.incomparableFraction)),
      meanContainment: meanFinite(withPairs.map((m) => m.meanContainment)),
    };
  }
  return horizons;
}

/** Aggregates a strategy's per-run measurements into one report, runs as the unit. */
function aggregateStrategy(strategyId, measurements) {
  const withPairs = measurements.filter((m) => m.pairs > 0);
  const speciesNames = new Set(measurements.flatMap((m) => Object.keys(m.bySpecies)));
  const bySpecies = {};
  for (const name of speciesNames) {
    const rows = measurements
      .map((m) => m.bySpecies[name])
      .filter((row) => row !== undefined);
    const rowsWithPairs = rows.filter((row) => row.pairs > 0);
    bySpecies[name] = {
      runsPresent: rows.length,
      runsWithPairs: rowsWithPairs.length,
      meanNodes: meanFinite(rows.map((r) => r.meanNodes)),
      incomparableFraction: meanFinite(rowsWithPairs.map((r) => r.incomparableFraction)),
      equalFraction: meanFinite(rowsWithPairs.map((r) => r.equalFraction)),
      meanContainment: meanFinite(rowsWithPairs.map((r) => r.meanContainment)),
    };
  }
  return {
    strategyId,
    runsConsidered: measurements.length,
    runsWithPairs: withPairs.length,
    meanLivingMages: meanFinite(measurements.map((m) => m.livingMageCount)),
    meanNodesPerMage: meanFinite(measurements.map((m) => m.meanNodes)),
    minNodesPerMage: extremeFinite(measurements.map((m) => m.minNodes), Math.min),
    maxNodesPerMage: extremeFinite(measurements.map((m) => m.maxNodes), Math.max),
    meanUnionNodes: meanFinite(measurements.map((m) => m.unionNodes)),
    meanLargestMageNodes: meanFinite(measurements.map((m) => m.largestMageNodes)),
    meanUnionMinusLargest: meanFinite(measurements.map((m) => m.unionMinusLargest)),
    incomparablePairFraction: meanFinite(withPairs.map((m) => m.incomparableFraction)),
    equalPairFraction: meanFinite(withPairs.map((m) => m.equalFraction)),
    nestedStrictPairFraction: meanFinite(withPairs.map((m) => m.nestedStrictFraction)),
    meanContainment: meanFinite(withPairs.map((m) => m.meanContainment)),
    bySpecies,
  };
}

const fmt = (value, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : '—');

function main() {
  const dir = process.argv[2] ?? '.w20/arm-a';
  const arms = loadArms(dir);

  const strategyIds = [...new Set(arms.map((arm) => arm.strategyId))].sort();
  const measurementsByStrategy = new Map();
  const runsByStrategy = new Map();
  for (const strategyId of strategyIds) {
    const runs = arms.filter((arm) => arm.strategyId === strategyId).flatMap((arm) => arm.runs);
    runsByStrategy.set(strategyId, runs);
    measurementsByStrategy.set(strategyId, runs.map(runMeasurement));
  }

  const report = {
    dir,
    strategies: {},
  };
  for (const strategyId of strategyIds) {
    report.strategies[strategyId] = {
      ...aggregateStrategy(strategyId, measurementsByStrategy.get(strategyId)),
      horizons: horizonsForStrategy(runsByStrategy.get(strategyId)),
    };
  }

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
    return;
  }

  const lines = [];
  const totalRuns = [...measurementsByStrategy.values()].reduce((a, b) => a + b.length, 0);
  lines.push(`# ${dir} — per-mage composition, ${String(totalRuns)} runs`);
  lines.push('');
  lines.push(
    '**claim 0**: two mages in one universe hold incomparable sets — neither a subset of the ' +
      'other, by construction.',
  );
  lines.push('');
  lines.push(
    '| strategy | runs | w/ pairs | mean living mages | mean nodes/mage | min | max | mean union | mean largest | union − largest | incomparable | equal | nested (strict) | mean containment |',
  );
  lines.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const strategyId of strategyIds) {
    const s = report.strategies[strategyId];
    lines.push(
      `| ${strategyId} | ${String(s.runsConsidered)} | ${String(s.runsWithPairs)} | ` +
        `${fmt(s.meanLivingMages, 1)} | ${fmt(s.meanNodesPerMage, 1)} | ${fmt(s.minNodesPerMage, 0)} | ` +
        `${fmt(s.maxNodesPerMage, 0)} | ${fmt(s.meanUnionNodes, 1)} | ${fmt(s.meanLargestMageNodes, 1)} | ` +
        `${fmt(s.meanUnionMinusLargest, 1)} | ${fmt(s.incomparablePairFraction, 4)} | ` +
        `${fmt(s.equalPairFraction, 4)} | ${fmt(s.nestedStrictPairFraction, 4)} | ${fmt(s.meanContainment, 3)} |`,
    );
  }
  lines.push('');
  lines.push('## by species — mean nodes/mage and within-species incomparability');
  for (const strategyId of strategyIds) {
    const s = report.strategies[strategyId];
    const names = Object.keys(s.bySpecies).sort();
    if (names.length === 0) continue;
    lines.push(`### ${strategyId}`);
    lines.push('| species | runs present | runs w/ pairs | mean nodes/mage | incomparable | equal | mean containment |');
    lines.push('|---|--:|--:|--:|--:|--:|--:|');
    for (const name of names) {
      const row = s.bySpecies[name];
      lines.push(
        `| ${name} | ${String(row.runsPresent)} | ${String(row.runsWithPairs)} | ` +
          `${fmt(row.meanNodes, 1)} | ${fmt(row.incomparableFraction, 4)} | ${fmt(row.equalFraction, 4)} | ` +
          `${fmt(row.meanContainment, 3)} |`,
      );
    }
    lines.push('');
  }
  lines.push('## composition at fixed horizons — speed against shape');
  lines.push(
    '| tick | ' +
      strategyIds.map((l) => `${l} living`).join(' | ') +
      ' | ' +
      strategyIds.map((l) => `${l} incomparable`).join(' | ') +
      ' |',
  );
  lines.push(`|---|${strategyIds.map(() => '--:').join('|')}|${strategyIds.map(() => '--:').join('|')}|`);
  for (const tick of HORIZON_TICKS) {
    const living = strategyIds.map((l) => {
      const h = report.strategies[l].horizons[tick];
      return h === undefined ? '—' : fmt(h.meanLivingMages, 1);
    });
    const incomparable = strategyIds.map((l) => {
      const h = report.strategies[l].horizons[tick];
      return h === undefined ? '—' : fmt(h.incomparablePairFraction, 4);
    });
    lines.push(`| ${tick} | ${living.join(' | ')} | ${incomparable.join(' | ')} |`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
