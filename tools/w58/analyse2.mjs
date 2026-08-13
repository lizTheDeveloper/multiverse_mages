/*
 * Multiverse Mages — W58 Test 2 analysis: strategy effect against seed effect.
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
 * ## The decomposition, and why it is two-way
 *
 * Every arm plays the same `(cellIndex, replicateIndex)` grid, so at each
 * horizon each metric is a complete `strategy × seed` table with one observation
 * per cell. That is a two-way layout without replication: the strategy sum of
 * squares and the seed sum of squares are both estimable, the interaction is
 * confounded with the residual, and that is fine — the question is which of the
 * two main effects is larger, not whether they interact.
 *
 *     SS_strategy = R · Σ_s (mean_s − grand)²
 *     SS_seed     = S · Σ_r (mean_r − grand)²
 *     SS_total    = Σ (x − grand)²
 *
 * η² is each over the total. A prior sweep found cross-strategy node-set
 * containment sitting *above* the within-strategy diagonal — the shape of "seed
 * beats strategy" — on node sets only. This runs the same comparison on economic
 * and population state.
 *
 * ## The liveness classification, and why no null is reported without it
 *
 * A separate investigation is testing whether a failed lookup in this codebase
 * becomes `undefined → NaN →` an `i32` column `→ 0`, with `assertRepresentable`
 * unable to fire because `NaN < FP_MIN` and `NaN > FP_MAX` are both false. A
 * silently-zeroed field and a genuinely strategy-insensitive field look the same
 * to any outcome measurement.
 *
 * So every metric is put in exactly one of four buckets, and the bucket is
 * printed beside every number:
 *
 * - `dead`      — constant across every strategy *and* every seed. Not evidence
 *                 of anything until the read path is inspected.
 * - `seed-only` — varies across seeds, not across strategies. The channel is
 *                 demonstrably live, so a strategy null here is a real null.
 * - `strategy`  — varies across strategies. η² says how much.
 * - `degenerate`— fewer than two usable observations at this horizon.
 *
 *     node tools/w58/analyse2.mjs --in mc-results/w58/test2
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseArgs } from './harness.mjs';

/** The scalar quantities the decomposition runs on, grouped as the report reads them. */
const METRIC_GROUPS = Object.freeze({
  ruleset: ['permittedTechniques', 'permittedForms', 'edictBudget', 'traditionId', 'blessings'],
  economy: ['favor', 'worship', 'worshipTier', 'materials', 'favorCap', 'favorWasted'],
  population: ['populace', 'magesAlive', 'magesTotal', 'mageVigorTotal'],
  institutions: ['universities', 'universityCapacity', 'libraries', 'grimoires', 'grimoireNodeCount'],
  knowledge: ['nodesKnown', 'instances', 'masteryTotal', 'everKnownCount'],
  behaviour: ['goalTargetCount', 'effortTargetCount', 'effortProgressTotal'],
  ascension: ['ascensionPath', 'ascensionFirstMetTick', 'stasisTicks', 'lowWorshipTicks', 'peakWorshipTier', 'deepestTier', 'goodEraRun'],
});

const ALL_METRICS = Object.values(METRIC_GROUPS).flat();

/** The two arms that are opposed on the axis the god actually controls. */
const OPPOSED_PAIR = Object.freeze(['permissive-breadth', 'denial-warden']);

function load(dir) {
  const files = readdirSync(dir).filter((name) => name.startsWith('test2__') && name.endsWith('.json'));
  const arms = [];
  for (const name of files) arms.push(JSON.parse(readFileSync(join(dir, name), 'utf8')));
  return arms;
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Two-way sums of squares for one metric at one horizon.
 *
 * `table` is `strategy -> seed -> value`, complete by construction of the caller.
 */
function decompose(table, strategies, seeds) {
  const values = [];
  for (const s of strategies) for (const r of seeds) values.push(table.get(s).get(r));
  const grand = mean(values);
  const ssTotal = values.reduce((sum, value) => sum + (value - grand) ** 2, 0);
  const strategyMeans = strategies.map((s) => mean(seeds.map((r) => table.get(s).get(r))));
  const seedMeans = seeds.map((r) => mean(strategies.map((s) => table.get(s).get(r))));
  const ssStrategy = seeds.length * strategyMeans.reduce((sum, value) => sum + (value - grand) ** 2, 0);
  const ssSeed = strategies.length * seedMeans.reduce((sum, value) => sum + (value - grand) ** 2, 0);
  const ssResid = Math.max(0, ssTotal - ssStrategy - ssSeed);
  // Within-strategy spread across seeds: the liveness evidence.
  const withinSeedVariance = mean(
    strategies.map((s) => {
      const row = seeds.map((r) => table.get(s).get(r));
      const rowMean = mean(row);
      return mean(row.map((value) => (value - rowMean) ** 2));
    }),
  );
  return {
    grand,
    ssTotal,
    ssStrategy,
    ssSeed,
    ssResid,
    etaStrategy: ssTotal === 0 ? 0 : ssStrategy / ssTotal,
    etaSeed: ssTotal === 0 ? 0 : ssSeed / ssTotal,
    withinSeedVariance,
    strategyMeans,
    // A hard `ssStrategy === 0` test never fires on floating-point sums, so
    // every metric with a grain of numerical noise would be classed
    // strategy-sensitive and the roll-call would overclaim. The threshold is
    // stated rather than implied: below it, which arm you played explains less
    // than a twentieth of the spread and the metric is seed-dominated.
    classification:
      ssTotal === 0 ? 'dead' : ssStrategy / ssTotal < SEED_DOMINATED_ETA ? 'seed-only' : 'strategy',
  };
}

/** Below this η² for strategy, the metric is called seed-dominated rather than strategy-sensitive. */
const SEED_DOMINATED_ETA = 0.05;

function jaccard(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  const setB = new Set(b);
  let intersection = 0;
  for (const value of a) if (setB.has(value)) intersection += 1;
  return intersection / (a.length + b.length - intersection);
}

function containment(a, b) {
  if (a.length === 0) return 1;
  const setB = new Set(b);
  let intersection = 0;
  for (const value of a) if (setB.has(value)) intersection += 1;
  return intersection / a.length;
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function padStart(value, width) {
  return String(value).padStart(width);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.in ?? 'mc-results/w58/test2';
  const arms = load(dir);
  const lines = [];
  const emit = (line = '') => lines.push(line);

  emit('# W58 Test 2 — do opposed strategies diverge, and does it persist?');
  emit();
  emit('## Probe inertness (the validity gate)');
  emit();
  for (const arm of arms) {
    const check = arm.probeInertness;
    emit(
      `- ${pad(check.strategyId, 22)} agrees=${String(check.agrees)}  ` +
        `probed=${check.probed.snapshotHash}/${check.probed.status}/${String(check.probed.ticksRun)}  ` +
        `unprobed=${check.unprobed.snapshotHash}/${check.unprobed.status}/${String(check.unprobed.ticksRun)}`,
    );
  }
  const allInert = arms.every((arm) => arm.probeInertness.agrees);
  emit();
  emit(allInert
    ? 'All arms agree: the instrumentation changed no run. Numbers below are valid.'
    : 'AN ARM DISAGREES. Every number below is void.');
  emit();

  const strategies = arms.map((arm) => arm.strategyId).sort();
  const cellIndexes = [...new Set(arms.flatMap((arm) => arm.runs.map((run) => run.cellIndex)))].sort();

  for (const cellIndex of cellIndexes) {
    const label = arms[0].runs.find((run) => run.cellIndex === cellIndex)?.cellLabel ?? String(cellIndex);
    emit(`# Starting position cell ${String(cellIndex)} (${label})`);
    emit();

    // run lookup: strategy -> replicate -> run
    const byStrategy = new Map();
    for (const arm of arms) {
      const map = new Map();
      for (const run of arm.runs) if (run.cellIndex === cellIndex) map.set(run.replicateIndex, run);
      byStrategy.set(arm.strategyId, map);
    }
    const seeds = [...(byStrategy.get(strategies[0])?.keys() ?? [])].sort((a, b) => a - b);

    emit('## Terminal outcomes, which is what the evaluator would see');
    emit();
    emit(`${pad('strategy', 22)} ${padStart('asc', 4)}/${padStart('runs', 4)} ${padStart('meanTicks', 10)} ${padStart('meanNodes', 10)} ${padStart('meanFavor', 11)} ${padStart('meanPopulace', 13)}`);
    for (const s of strategies) {
      const runs = [...byStrategy.get(s).values()];
      const asc = runs.filter((run) => run.status === 'ascended').length;
      emit(
        `${pad(s, 22)} ${padStart(asc, 4)}/${padStart(runs.length, 4)} ` +
          `${padStart(mean(runs.map((run) => run.ticksRun)).toFixed(0), 10)} ` +
          `${padStart(mean(runs.map((run) => run.terminal?.nodesKnown ?? 0)).toFixed(1), 10)} ` +
          `${padStart(mean(runs.map((run) => run.terminal?.favor ?? 0)).toFixed(0), 11)} ` +
          `${padStart(mean(runs.map((run) => run.terminal?.populace ?? 0)).toFixed(0), 13)}`,
      );
    }
    emit();

    emit('## Submitted god-action histograms (mean submissions per run, by action id)');
    emit();
    const actionIds = [...new Set(arms.flatMap((arm) => arm.runs.flatMap((run) => Object.keys(run.submittedByAction ?? {}))))]
      .map(Number)
      .sort((a, b) => a - b);
    emit(`${pad('strategy', 22)} ${actionIds.map((id) => padStart(`a${String(id)}`, 8)).join(' ')}`);
    for (const s of strategies) {
      const runs = [...byStrategy.get(s).values()];
      emit(
        `${pad(s, 22)} ${actionIds
          .map((id) => padStart(mean(runs.map((run) => run.submittedByAction?.[String(id)] ?? 0)).toFixed(1), 8))
          .join(' ')}`,
      );
    }
    emit();

    // Horizons every run of every arm reached.
    const horizonSets = strategies.flatMap((s) =>
      [...byStrategy.get(s).values()].map((run) => new Set(run.samples.map((sample) => sample.worldTick))),
    );
    const horizons = [...horizonSets[0]].filter((tick) => horizonSets.every((set) => set.has(tick))).sort((a, b) => a - b);
    emit(`## Common horizons every run of every arm reached: ${horizons.length === 0 ? 'none' : `${String(horizons[0])}..${String(horizons.at(-1))}`}`);
    emit();
    if (horizons.length === 0) {
      emit('No horizon is shared by every run — arms terminate at different ticks. That is itself');
      emit('a strategy effect, reported above as meanTicks.');
      emit();
      continue;
    }

    const sampleAt = (s, r, tick) =>
      byStrategy.get(s).get(r).samples.find((sample) => sample.worldTick === tick);

    emit('## Strategy effect against seed effect, by horizon');
    emit();
    emit('Each entry is `etaStrategy/etaSeed` — the share of total variance in that metric');
    emit('attributable to which arm you played, against which universe you were dealt.');
    emit();
    const reported = [];
    for (const [group, metrics] of Object.entries(METRIC_GROUPS)) {
      emit(`### ${group}`);
      emit();
      emit(`${pad('metric', 24)} ${pad('class', 10)} ${horizons.map((tick) => padStart(`t${String(tick)}`, 12)).join(' ')}`);
      for (const metric of metrics) {
        const cells = [];
        let lastClass = 'degenerate';
        for (const tick of horizons) {
          const table = new Map();
          let complete = true;
          for (const s of strategies) {
            const row = new Map();
            for (const r of seeds) {
              const sample = sampleAt(s, r, tick);
              const value = sample?.[metric];
              if (typeof value !== 'number' || !Number.isFinite(value)) {
                complete = false;
                break;
              }
              row.set(r, value);
            }
            if (!complete) break;
            table.set(s, row);
          }
          if (!complete) {
            cells.push(padStart('-', 12));
            continue;
          }
          const result = decompose(table, strategies, seeds);
          lastClass = result.classification;
          reported.push({ cellIndex, group, metric, tick, ...result, strategyMeans: undefined });
          cells.push(padStart(`${result.etaStrategy.toFixed(2)}/${result.etaSeed.toFixed(2)}`, 12));
        }
        emit(`${pad(metric, 24)} ${pad(lastClass, 10)} ${cells.join(' ')}`);
      }
      emit();
    }

    emit('## Raw means per arm, at three horizons, for the metrics that matter most');
    emit();
    const spotlights = ['permittedForms', 'nodesKnown', 'favor', 'populace', 'grimoires', 'instances'];
    const spotTicks = horizons.filter((tick) => [60, 300, 600, horizons.at(-1)].includes(tick));
    for (const metric of spotlights) {
      emit(`### ${metric}`);
      emit(`${pad('strategy', 22)} ${spotTicks.map((tick) => padStart(`t${String(tick)}`, 14)).join(' ')}`);
      for (const s of strategies) {
        emit(
          `${pad(s, 22)} ${spotTicks
            .map((tick) => {
              const values = seeds
                .map((r) => sampleAt(s, r, tick)?.[metric])
                .filter((value) => typeof value === 'number');
              return padStart(values.length === 0 ? '-' : mean(values).toFixed(1), 14);
            })
            .join(' ')}`,
        );
      }
      emit();
    }

    emit('## Node sets: cross-strategy same-seed against within-strategy cross-seed');
    emit();
    emit('If the cross-strategy figure sits at or above the within-strategy one, two different');
    emit('strategies on the same universe resemble each other more than one strategy does itself');
    emit('on two universes. That is the shape of "seed beats strategy".');
    emit();
    emit(`${pad('horizon', 10)} ${padStart('crossStrategyJ', 16)} ${padStart('withinStrategyJ', 17)} ${padStart('crossStratContain', 19)} ${padStart('withinStratContain', 20)}`);
    const setStats = [];
    for (const tick of horizons) {
      const crossJ = [];
      const crossC = [];
      for (let i = 0; i < strategies.length; i += 1) {
        for (let j = i + 1; j < strategies.length; j += 1) {
          for (const r of seeds) {
            const a = sampleAt(strategies[i], r, tick)?.nodeIds;
            const b = sampleAt(strategies[j], r, tick)?.nodeIds;
            if (a === undefined || b === undefined) continue;
            crossJ.push(jaccard(a, b));
            crossC.push(containment(a, b));
            crossC.push(containment(b, a));
          }
        }
      }
      const withinJ = [];
      const withinC = [];
      for (const s of strategies) {
        for (let i = 0; i < seeds.length; i += 1) {
          for (let j = i + 1; j < seeds.length; j += 1) {
            const a = sampleAt(s, seeds[i], tick)?.nodeIds;
            const b = sampleAt(s, seeds[j], tick)?.nodeIds;
            if (a === undefined || b === undefined) continue;
            withinJ.push(jaccard(a, b));
            withinC.push(containment(a, b));
            withinC.push(containment(b, a));
          }
        }
      }
      setStats.push({ tick, crossJ: mean(crossJ), withinJ: mean(withinJ), crossC: mean(crossC), withinC: mean(withinC) });
      emit(
        `${pad(`t${String(tick)}`, 10)} ${padStart(mean(crossJ).toFixed(4), 16)} ${padStart(mean(withinJ).toFixed(4), 17)} ` +
          `${padStart(mean(crossC).toFixed(4), 19)} ${padStart(mean(withinC).toFixed(4), 20)}`,
      );
    }
    emit();

    emit('## Are two arms ever bit-identical on the same seed?');
    emit();
    emit('Counts of (seed, horizon) pairs on which a pair of arms agrees on every reported');
    emit('scalar. Identical trajectories under opposed strategies would be the strongest');
    emit('possible form of "the simulation ignores the god".');
    emit();
    for (let i = 0; i < strategies.length; i += 1) {
      for (let j = i + 1; j < strategies.length; j += 1) {
        let identical = 0;
        let compared = 0;
        for (const r of seeds) {
          for (const tick of horizons) {
            const a = sampleAt(strategies[i], r, tick);
            const b = sampleAt(strategies[j], r, tick);
            if (a === undefined || b === undefined) continue;
            compared += 1;
            if (ALL_METRICS.every((metric) => a[metric] === b[metric])) identical += 1;
          }
        }
        emit(`- ${pad(`${strategies[i]} vs ${strategies[j]}`, 46)} identical on ${String(identical)} of ${String(compared)}`);
      }
    }
    emit();

    emit('## Liveness roll-call — which metrics are capable of differing at all');
    emit();
    const byMetric = new Map();
    for (const row of reported) {
      if (row.cellIndex !== cellIndex) continue;
      const current = byMetric.get(row.metric) ?? { dead: 0, seedOnly: 0, strategy: 0, maxEtaStrategy: 0, maxSpread: 0 };
      if (row.classification === 'dead') current.dead += 1;
      else if (row.classification === 'seed-only') current.seedOnly += 1;
      else current.strategy += 1;
      current.maxEtaStrategy = Math.max(current.maxEtaStrategy, row.etaStrategy);
      current.maxSpread = Math.max(current.maxSpread, row.withinSeedVariance);
      byMetric.set(row.metric, current);
    }
    emit(`${pad('metric', 24) } ${padStart('horizons', 9)} ${padStart('dead', 5)} ${padStart('seedOnly', 9)} ${padStart('strategy', 9)} ${padStart('maxEtaStrat', 12)} verdict`);
    for (const metric of ALL_METRICS) {
      const row = byMetric.get(metric);
      if (row === undefined) continue;
      const total = row.dead + row.seedOnly + row.strategy;
      const verdict =
        row.dead === total
          ? 'DEAD everywhere — inspect the read path before reading this as a null'
          : row.strategy === 0
            ? 'live across seeds, flat across strategies — a genuine strategy null'
            : 'strategy-sensitive';
      emit(
        `${pad(metric, 24)} ${padStart(total, 9)} ${padStart(row.dead, 5)} ${padStart(row.seedOnly, 9)} ` +
          `${padStart(row.strategy, 9)} ${padStart(row.maxEtaStrategy.toFixed(3), 12)} ${verdict}`,
      );
    }
    emit();

    // The four-arm common horizon is capped by whichever arm ends first, and on
    // this build that is the probe — which ascends around tick 700–800 and so
    // truncates the persistence question for the pair the question is about.
    // The opposed pair therefore gets its own grid.
    const pair = OPPOSED_PAIR.filter((s) => byStrategy.has(s));
    if (pair.length === 2) {
      emit(`## The opposed pair alone: ${pair[0]} against ${pair[1]}`);
      emit();
      emit('Their own shared horizon grid, because the four-arm intersection is capped by whichever');
      emit('arm terminates first and that truncates exactly the persistence question.');
      emit();
      const pairSets = pair.flatMap((s) =>
        [...byStrategy.get(s).values()].map((run) => new Set(run.samples.map((sample) => sample.worldTick))),
      );
      const pairHorizons = [...pairSets[0]]
        .filter((tick) => pairSets.every((set) => set.has(tick)))
        .sort((a, b) => a - b);
      if (pairHorizons.length === 0) {
        emit('No horizon is shared by every run of the pair.');
        emit();
      } else {
        emit(`Shared horizons: ${String(pairHorizons[0])}..${String(pairHorizons.at(-1))}`);
        emit();
        emit(`${pad('metric', 24)} ${pad('class', 10)} ${pairHorizons.map((tick) => padStart(`t${String(tick)}`, 12)).join(' ')}`);
        for (const metric of ALL_METRICS) {
          const cells = [];
          let lastClass = 'degenerate';
          for (const tick of pairHorizons) {
            const table = new Map();
            let complete = true;
            for (const s of pair) {
              const row = new Map();
              for (const r of seeds) {
                const value = sampleAt(s, r, tick)?.[metric];
                if (typeof value !== 'number' || !Number.isFinite(value)) {
                  complete = false;
                  break;
                }
                row.set(r, value);
              }
              if (!complete) break;
              table.set(s, row);
            }
            if (!complete) {
              cells.push(padStart('-', 12));
              continue;
            }
            const result = decompose(table, pair, seeds);
            lastClass = result.classification;
            cells.push(padStart(`${result.etaStrategy.toFixed(2)}/${result.etaSeed.toFixed(2)}`, 12));
          }
          emit(`${pad(metric, 24)} ${pad(lastClass, 10)} ${cells.join(' ')}`);
        }
        emit();
        emit('### Node sets, the pair alone');
        emit(`${pad('horizon', 10)} ${padStart('crossStrategyJ', 16)} ${padStart('withinStrategyJ', 17)}`);
        for (const tick of pairHorizons) {
          const crossJ = [];
          for (const r of seeds) {
            const a = sampleAt(pair[0], r, tick)?.nodeIds;
            const b = sampleAt(pair[1], r, tick)?.nodeIds;
            if (a !== undefined && b !== undefined) crossJ.push(jaccard(a, b));
          }
          const withinJ = [];
          for (const s of pair) {
            for (let i = 0; i < seeds.length; i += 1) {
              for (let j = i + 1; j < seeds.length; j += 1) {
                const a = sampleAt(s, seeds[i], tick)?.nodeIds;
                const b = sampleAt(s, seeds[j], tick)?.nodeIds;
                if (a !== undefined && b !== undefined) withinJ.push(jaccard(a, b));
              }
            }
          }
          emit(`${pad(`t${String(tick)}`, 10)} ${padStart(mean(crossJ).toFixed(4), 16)} ${padStart(mean(withinJ).toFixed(4), 17)}`);
        }
        emit();
      }
    }
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
