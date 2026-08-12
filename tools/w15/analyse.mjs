/*
 * Multiverse Mages — W15: the dimensionality of the strategy space.
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
 * Reads the arm files `run-arm.mjs` wrote and answers four questions:
 *
 * 1. the eigenvalue spectrum of the runs × nodes matrix, and how many
 *    components carry 80% and 95% of the variance;
 * 2. pairwise overlap between strategies' held-node sets — Jaccard and cosine —
 *    and, separately, **within** each strategy across seeds, which is the test
 *    of whether a strategy has a niche or merely has noise;
 * 3. the same, with founding species varied instead of strategy;
 * 4. how much of the total variance is between strategies rather than within.
 *
 * ## Why the eigendecomposition is hand-rolled
 *
 * Cyclic Jacobi on the Gram matrix, about forty lines. A linear-algebra package
 * would be an AGPL-compatibility question and a supply-chain surface for a
 * 96 × 96 symmetric problem that Jacobi solves exactly. Floats throughout: this
 * is analysis, not the rules path, and `CLAUDE.md`'s fixed-point rule is about
 * the simulation.
 *
 * ## Rows are runs, never strategy means
 *
 * Averaging first would hide within-strategy variance, which is where the
 * question "is that subset a choice or a coin flip" actually lives. It also
 * inflates the apparent dimensionality by removing the noise floor the
 * components have to clear.
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
 * The runs × nodes matrix.
 *
 * `weight: 'binary'` is the held-set; `weight: 'effort'` is the instance count
 * per node normalized to a unit-sum row, which is the critique's own "fraction
 * of effort invested in each node". Columns are the union of every node any run
 * held, so a node nobody ever holds contributes no dimension it could not fill.
 */
export function buildMatrix(runs, weight) {
  const columns = [...new Set(runs.flatMap((run) => run.terminal.nodeIds))].sort((a, b) => a - b);
  const index = new Map(columns.map((id, i) => [id, i]));
  const rows = runs.map((run) => {
    const row = new Float64Array(columns.length);
    const total = run.terminal.counts.reduce((a, b) => a + b, 0);
    run.terminal.nodeIds.forEach((id, i) => {
      const at = index.get(id);
      row[at] = weight === 'binary' ? 1 : total === 0 ? 0 : run.terminal.counts[i] / total;
    });
    return row;
  });
  return { columns, rows };
}

/**
 * How much of the total variance sits **between** groups rather than within them.
 *
 * The reason rows are runs and never group means: an analysis of means cannot
 * report this number at all, and it is the one that says whether a label
 * explains anything. A high between-share with a low effective dimensionality is
 * "the groups differ, along one axis"; a low between-share means the label is
 * not what is moving the composition.
 */
export function varianceDecomposition(rows, width, labelOf) {
  if (rows.length === 0) return { between: 0, within: 0, total: 0, betweenShare: Number.NaN };
  const grand = new Float64Array(width);
  for (const row of rows) for (let c = 0; c < width; c += 1) grand[c] += row[c] / rows.length;

  const byLabel = new Map();
  rows.forEach((row, i) => {
    const label = labelOf(i);
    byLabel.set(label, [...(byLabel.get(label) ?? []), row]);
  });

  let between = 0;
  for (const group of byLabel.values()) {
    for (let c = 0; c < width; c += 1) {
      let mean = 0;
      for (const row of group) mean += row[c] / group.length;
      between += group.length * (mean - grand[c]) ** 2;
    }
  }
  let total = 0;
  for (const row of rows) for (let c = 0; c < width; c += 1) total += (row[c] - grand[c]) ** 2;

  return {
    between,
    within: total - between,
    total,
    betweenShare: total === 0 ? Number.NaN : between / total,
  };
}

/** Column-mean-centres a matrix in place and returns it. */
function centre(rows, width) {
  if (rows.length === 0) return rows;
  for (let c = 0; c < width; c += 1) {
    let sum = 0;
    for (const row of rows) sum += row[c];
    const mean = sum / rows.length;
    for (const row of rows) row[c] -= mean;
  }
  return rows;
}

/** Symmetric eigenvalues by cyclic Jacobi. Returns them descending. */
export function eigenvaluesSymmetric(matrix) {
  const n = matrix.length;
  const a = matrix.map((row) => Float64Array.from(row));
  for (let sweep = 0; sweep < 100; sweep += 1) {
    let off = 0;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) off += a[p][q] * a[p][q];
    }
    if (off <= 1e-18) break;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k += 1) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k += 1) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
      }
    }
  }
  return Array.from({ length: n }, (_, i) => a[i][i]).sort((x, y) => y - x);
}

/**
 * The spectrum of a runs × nodes matrix, via the runs × runs Gram matrix.
 *
 * The Gram matrix of the centred data has the same non-zero eigenvalues as the
 * covariance, and it is 96 × 96 rather than 51 × 51 or 217 × 217 — small either
 * way, and this way the code does not care how many nodes there are.
 */
export function spectrum(rows, width) {
  if (rows.length === 0) return { eigenvalues: [], total: 0, forEighty: 0, forNinetyFive: 0 };
  const centred = centre(rows.map((row) => Float64Array.from(row)), width);
  const n = centred.length;
  const gram = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      let dot = 0;
      for (let k = 0; k < width; k += 1) dot += centred[i][k] * centred[j][k];
      gram[i][j] = dot;
      gram[j][i] = dot;
    }
  }
  const raw = eigenvaluesSymmetric(gram).map((v) => (Math.abs(v) < 1e-12 ? 0 : v));
  const eigenvalues = raw.map((v) => Math.max(v, 0));
  const total = eigenvalues.reduce((a, b) => a + b, 0);
  const componentsFor = (share) => {
    if (total <= 0) return 0;
    let acc = 0;
    for (let i = 0; i < eigenvalues.length; i += 1) {
      acc += eigenvalues[i];
      if (acc / total >= share) return i + 1;
    }
    return eigenvalues.length;
  };
  return {
    eigenvalues,
    total,
    forEighty: componentsFor(0.8),
    forNinetyFive: componentsFor(0.95),
    /** The participation ratio: a continuous effective dimension, robust to ties. */
    participationRatio:
      total <= 0
        ? 0
        : (total * total) / eigenvalues.reduce((a, b) => a + b * b, 0),
  };
}

/** Jaccard index of two node-id sets. */
export function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const id of left) if (right.has(id)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 1 : shared / union;
}

/** Cosine similarity of two effort vectors given as (ids, counts). */
export function cosine(aIds, aCounts, bIds, bCounts) {
  const map = new Map();
  aIds.forEach((id, i) => map.set(id, [aCounts[i], 0]));
  bIds.forEach((id, i) => {
    const entry = map.get(id) ?? [0, 0];
    entry[1] = bCounts[i];
    map.set(id, entry);
  });
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [x, y] of map.values()) {
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/**
 * Containment: `|A ∩ B| / min(|A|, |B|)`.
 *
 * The measure that separates *different subsets* from *different-sized prefixes
 * of one ordering*. Jaccard cannot: a two-node set inside a fifty-one-node set
 * scores 0.04 and reads as "almost nothing in common", when in fact the small
 * set is entirely contained in the large one and the pair carries **no**
 * compositional information at all — only a size difference. Containment near
 * 1.0 across every pair means the strategies form a chain, and a chain is one
 * axis no matter how many nodes it runs over.
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
 * Prefix fidelity: how well *one fixed ordering of the nodes* predicts every run.
 *
 * Rank the nodes by how many runs hold them, descending. For a run holding `k`
 * nodes, the prediction is "the top `k`". The score is the mean overlap between
 * the prediction and the truth.
 *
 * This is the sharpest single statement the data can make. A score near 1.0 means
 * a run's node **set** is a function of its node **count** — strategies are not
 * choosing different subsets at all, they are stopping at different points along
 * one queue. A strategy space of that shape has exactly one axis, however many
 * nodes it runs over, and no amount of making acquisition harder adds a second.
 */
export function prefixFidelity(runs) {
  const frequency = new Map();
  for (const run of runs) {
    for (const id of run.terminal.nodeIds) frequency.set(id, (frequency.get(id) ?? 0) + 1);
  }
  const ordering = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id]) => id);
  const scores = runs.map((run) => {
    const k = run.terminal.nodeIds.length;
    if (k === 0) return 1;
    const predicted = new Set(ordering.slice(0, k));
    let hit = 0;
    for (const id of run.terminal.nodeIds) if (predicted.has(id)) hit += 1;
    return hit / k;
  });
  return {
    ordering,
    mean: scores.reduce((a, b) => a + b, 0) / (scores.length || 1),
    worst: scores.length === 0 ? Number.NaN : Math.min(...scores),
    exact: scores.filter((s) => s === 1).length,
    of: scores.length,
  };
}

/** Mean pairwise Jaccard between two groups of runs (or within one, when equal). */
export function meanJaccard(left, right) {
  const values = [];
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      if (left === right && j <= i) continue;
      values.push(jaccard(left[i].terminal.nodeIds, right[j].terminal.nodeIds));
    }
  }
  return values.length === 0 ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Mean pairwise cosine over effort vectors, same grouping rule. */
export function meanCosine(left, right) {
  const values = [];
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      if (left === right && j <= i) continue;
      values.push(
        cosine(
          left[i].terminal.nodeIds,
          left[i].terminal.counts,
          right[j].terminal.nodeIds,
          right[j].terminal.counts,
        ),
      );
    }
  }
  return values.length === 0 ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Pairs runs by coordinates so overlap is compared universe-for-universe. */
export function pairedByCoordinates(left, right) {
  const key = (run) => `${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}`;
  const rightBy = new Map(right.map((run) => [key(run), run]));
  const pairs = [];
  for (const run of left) {
    const other = rightBy.get(key(run));
    if (other !== undefined) pairs.push([run, other]);
  }
  return pairs;
}

const fmt = (value, digits = 3) =>
  Number.isFinite(value) ? value.toFixed(digits) : '—';

function main() {
  const dir = process.argv[2] ?? '.w15/arm-a';
  const groupBy = process.argv[3] ?? 'strategyId';
  const arms = loadArms(dir);
  const groups = new Map();
  for (const arm of arms) {
    const label =
      groupBy === 'strategyId'
        ? arm.strategyId
        : `${arm.strategyId}/mask${String(arm.foundingSpeciesMask)}`;
    groups.set(label, [...(groups.get(label) ?? []), ...arm.runs]);
  }
  // `--exclude` exists for one specific comparison and is worth naming: the
  // thesis under test is about **the v1 subset**, and `permissive-breadth` is
  // the one strategy that leaves it by permitting cells outside v1. Including it
  // measures the god's permission edict — a known axis — and excluding it
  // measures what the other seven do *inside* the twelve cells. Both are
  // reported; neither alone is the answer.
  const excludeAt = process.argv.indexOf('--exclude');
  const excluded = new Set(
    excludeAt === -1 ? [] : (process.argv[excludeAt + 1] ?? '').split(',').filter(Boolean),
  );
  for (const label of excluded) groups.delete(label);
  const labels = [...groups.keys()].sort();
  const allRuns = labels.flatMap((label) => groups.get(label));

  const report = {
    dir,
    groupBy,
    runCount: allRuns.length,
    prefixFidelity: prefixFidelity(allRuns),
    groups: {},
    spectra: {},
    overlap: {},
  };

  for (const label of labels) {
    const runs = groups.get(label);
    const nodes = runs.map((run) => run.terminal.nodeIds.length);
    const instances = runs.map((run) => run.terminal.counts.reduce((a, b) => a + b, 0));
    report.groups[label] = {
      runs: runs.length,
      meanNodes: nodes.reduce((a, b) => a + b, 0) / runs.length,
      minNodes: Math.min(...nodes),
      maxNodes: Math.max(...nodes),
      meanInstances: instances.reduce((a, b) => a + b, 0) / runs.length,
      meanTicks: runs.reduce((a, b) => a + b.ticksRun, 0) / runs.length,
      terminalReasons: runs.reduce((acc, run) => {
        acc[run.terminalReason] = (acc[run.terminalReason] ?? 0) + 1;
        return acc;
      }, {}),
      /** Within-group: the same subset each seed, or a different one? */
      withinJaccard: meanJaccard(runs, runs),
      withinCosine: meanCosine(runs, runs),
      /** The union across seeds, against the mean — a strategy that wanders has a bigger union. */
      unionNodes: new Set(runs.flatMap((run) => run.terminal.nodeIds)).size,
      intersectionNodes: runs
        .map((run) => new Set(run.terminal.nodeIds))
        .reduce((acc, set) => new Set([...acc].filter((id) => set.has(id)))).size,
    };
  }

  for (const weight of ['binary', 'effort']) {
    const { columns, rows } = buildMatrix(allRuns, weight);
    report.spectra[weight] = { nodeColumns: columns.length, ...spectrum(rows, columns.length) };
    // Shape only: each row scaled to unit length, which removes "how much a
    // universe knows" and leaves "which nodes, in what proportion". If the
    // spectrum collapses here while the raw one did not, the dimensions the raw
    // spectrum found were breadth wearing a composition's clothes.
    const shaped = rows.map((row) => {
      const norm = Math.sqrt(row.reduce((a, b) => a + b * b, 0));
      return norm === 0 ? row : Float64Array.from(row, (v) => v / norm);
    });
    report.spectra[`${weight}-shape`] = {
      nodeColumns: columns.length,
      ...spectrum(shaped, columns.length),
    };
    const labelOfRow = allRuns.map((run) =>
      labels.find((label) => groups.get(label).includes(run)),
    );
    report.spectra[weight].variance = varianceDecomposition(
      rows,
      columns.length,
      (i) => labelOfRow[i],
    );
  }

  report.overlap.jaccard = {};
  report.overlap.cosine = {};
  report.overlap.containment = {};
  for (const a of labels) {
    report.overlap.jaccard[a] = {};
    report.overlap.cosine[a] = {};
    report.overlap.containment[a] = {};
    for (const b of labels) {
      const left = groups.get(a);
      const right = groups.get(b);
      if (a === b) {
        report.overlap.jaccard[a][b] = meanJaccard(left, left);
        report.overlap.cosine[a][b] = meanCosine(left, left);
        const own = [];
        for (let i = 0; i < left.length; i += 1) {
          for (let j = i + 1; j < left.length; j += 1) {
            own.push(containment(left[i].terminal.nodeIds, left[j].terminal.nodeIds));
          }
        }
        report.overlap.containment[a][b] =
          own.reduce((p, q) => p + q, 0) / (own.length || 1);
        continue;
      }
      // Paired universe-for-universe: common random numbers are the whole point,
      // and an unpaired mean would blend seed differences into the comparison.
      const pairs = pairedByCoordinates(left, right);
      const js = pairs.map(([x, y]) => jaccard(x.terminal.nodeIds, y.terminal.nodeIds));
      const cs = pairs.map(([x, y]) =>
        cosine(x.terminal.nodeIds, x.terminal.counts, y.terminal.nodeIds, y.terminal.counts),
      );
      const ct = pairs.map(([x, y]) => containment(x.terminal.nodeIds, y.terminal.nodeIds));
      report.overlap.jaccard[a][b] = js.reduce((p, q) => p + q, 0) / js.length;
      report.overlap.cosine[a][b] = cs.reduce((p, q) => p + q, 0) / cs.length;
      report.overlap.containment[a][b] = ct.reduce((p, q) => p + q, 0) / ct.length;
    }
  }

  // Fixed-horizon composition, which is the only way to tell "a different
  // destination" from "the same destination reached at a different speed". Runs
  // terminate anywhere between tick 500 and 2400, so a terminal-only comparison
  // conflates duration with choice.
  report.horizons = {};
  for (const tick of [240, 480, 960, 1440]) {
    const atTick = {};
    for (const label of labels) {
      const sampled = groups
        .get(label)
        .map((run) => run.samples.find((sample) => sample.worldTick === tick))
        .filter((sample) => sample !== undefined);
      if (sampled.length === 0) continue;
      const sizes = sampled.map((sample) => sample.nodeIds.length);
      const union = new Set(sampled.flatMap((sample) => sample.nodeIds));
      atTick[label] = {
        runs: sampled.length,
        meanNodes: sizes.reduce((a, b) => a + b, 0) / sizes.length,
        unionNodes: union.size,
      };
    }
    // Cross-group containment at this horizon, on the same universes.
    const pairs = {};
    for (const a of labels) {
      pairs[a] = {};
      for (const b of labels) {
        const left = groups.get(a);
        const right = groups.get(b);
        const values = pairedByCoordinates(left, right)
          .map(([x, y]) => {
            const sx = x.samples.find((s) => s.worldTick === tick);
            const sy = y.samples.find((s) => s.worldTick === tick);
            return sx === undefined || sy === undefined
              ? Number.NaN
              : containment(sx.nodeIds, sy.nodeIds);
          })
          .filter((v) => Number.isFinite(v));
        pairs[a][b] =
          values.length === 0 ? Number.NaN : values.reduce((p, q) => p + q, 0) / values.length;
      }
    }
    report.horizons[tick] = { groups: atTick, containment: pairs };
  }

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
    return;
  }

  const lines = [];
  lines.push(`# ${dir} — ${String(allRuns.length)} runs, grouped by ${groupBy}`);
  lines.push('');
  const pf = report.prefixFidelity;
  lines.push(
    `**prefix fidelity** (one fixed node ordering predicts every run's set from its size): ` +
      `mean **${fmt(pf.mean, 4)}**, worst ${fmt(pf.worst, 3)}, exact on ${String(pf.exact)}/${String(pf.of)} runs`,
  );
  lines.push('');
  lines.push('| group | n | mean nodes | min | max | union | ∩ | mean instances | mean ticks | within J | within cos |');
  lines.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const label of labels) {
    const g = report.groups[label];
    lines.push(
      `| ${label} | ${String(g.runs)} | ${fmt(g.meanNodes, 1)} | ${String(g.minNodes)} | ${String(g.maxNodes)} | ` +
        `${String(g.unionNodes)} | ${String(g.intersectionNodes)} | ${fmt(g.meanInstances, 0)} | ${fmt(g.meanTicks, 0)} | ` +
        `${fmt(g.withinJaccard)} | ${fmt(g.withinCosine)} |`,
    );
  }
  lines.push('');
  for (const weight of ['binary', 'binary-shape', 'effort', 'effort-shape']) {
    const s = report.spectra[weight];
    const share = s.eigenvalues.slice(0, 10).map((v) => (s.total > 0 ? v / s.total : 0));
    lines.push(`## spectrum — ${weight} (${String(s.nodeColumns)} node columns)`);
    lines.push(`top-10 variance share: ${share.map((v) => fmt(v, 4)).join(', ')}`);
    lines.push(
      `components for 80%: **${String(s.forEighty)}**, for 95%: **${String(s.forNinetyFive)}**, ` +
        `participation ratio: **${fmt(s.participationRatio, 2)}**` +
        (s.variance === undefined
          ? ''
          : `, variance between ${groupBy}: **${fmt(s.variance.betweenShare, 3)}**`),
    );
    lines.push('');
  }
  lines.push('## pairwise Jaccard (diagonal = within-group across seeds)');
  lines.push(`| | ${labels.join(' | ')} |`);
  lines.push(`|---|${labels.map(() => '--:').join('|')}|`);
  for (const a of labels) {
    lines.push(`| ${a} | ${labels.map((b) => fmt(report.overlap.jaccard[a][b])).join(' | ')} |`);
  }
  lines.push('');
  lines.push('## pairwise cosine over effort vectors');
  lines.push(`| | ${labels.join(' | ')} |`);
  lines.push(`|---|${labels.map(() => '--:').join('|')}|`);
  for (const a of labels) {
    lines.push(`| ${a} | ${labels.map((b) => fmt(report.overlap.cosine[a][b])).join(' | ')} |`);
  }
  lines.push('');
  lines.push('## pairwise containment |A∩B| / min(|A|,|B|) — 1.0 means nested, not different');
  lines.push(`| | ${labels.join(' | ')} |`);
  lines.push(`|---|${labels.map(() => '--:').join('|')}|`);
  for (const a of labels) {
    lines.push(`| ${a} | ${labels.map((b) => fmt(report.overlap.containment[a][b])).join(' | ')} |`);
  }
  lines.push('');
  lines.push('## composition at fixed horizons — speed against shape');
  lines.push(`| tick | ${labels.map((l) => `${l} n`).join(' | ')} | min pairwise containment |`);
  lines.push(`|---|${labels.map(() => '--:').join('|')}|--:|`);
  for (const [tick, entry] of Object.entries(report.horizons)) {
    const cells = labels.map((l) => (entry.groups[l] ? fmt(entry.groups[l].meanNodes, 1) : '—'));
    const values = labels
      .flatMap((a) => labels.filter((b) => b !== a).map((b) => entry.containment[a][b]))
      .filter((v) => Number.isFinite(v));
    lines.push(
      `| ${tick} | ${cells.join(' | ')} | ${values.length === 0 ? '—' : fmt(Math.min(...values))} |`,
    );
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
