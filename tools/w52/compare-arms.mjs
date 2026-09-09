/*
 * Multiverse Mages — W52: the three numbers, arm against arm.
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
 * Reads two or more arm directories written by `emphasis-arm.mjs` and reports
 * the three figures the workstream owes, plus the attribution data without
 * which a null is only half a null.
 *
 * 1. **Cross-strategy containment**, `|A∩B| / min(|A|,|B|)`, paired universe for
 *    universe — at terminal *and* at the era horizons. W15's own `containment`
 *    and `pairedByCoordinates` are imported rather than reimplemented, so the
 *    figures are the record's figures.
 * 2. **`betweenShare`** — how much of the compositional variance the strategy
 *    label explains — reported with and without the two ruleset-editing
 *    strategies, because a strategy that changes what is *reachable* is a
 *    second lever and the record has always separated it.
 * 3. **Win rate**, `terminalReason ∈ {ascensionApotheosis, ascensionCanon}`.
 *
 * And two things the task called for by name:
 *
 * - **Reorder against reweight.** If encouraged nodes arrive earlier and the
 *   terminal union is identical, the result is "speed, not shape" moved one
 *   level up. So the terminal union per strategy is printed beside the horizon
 *   containment, and the arms are diffed set-theoretically.
 * - **Which cells were encouraged.** A containment that does not move because
 *   every bot named the same cells is a finding about the bot pool, not about
 *   the term.
 *
 *     node tools/w52/compare-arms.mjs .w52/arm-a .w52/arm-b .w52/arm-c
 */

import { containment, jaccard, loadArms, pairedByCoordinates } from '../w15/analyse.mjs';
import { buildMatrix, prefixFidelity, spectrum, varianceDecomposition } from '../w15/analyse.mjs';

/** `contracts.md` §1.1: 1 is Apotheosis, 2 is the Enduring Canon. */
const WINNING_REASONS = new Set([1, 2]);

/** The two strategies that win by editing the ruleset rather than by playing it. */
const RULESET_EDITORS = new Set(['permissive-breadth', 'permit-then-idle']);

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function runsOf(dir) {
  return loadArms(dir).flatMap((arm) => arm.runs);
}

function grouped(runs) {
  const groups = new Map();
  for (const run of runs) {
    const list = groups.get(run.strategyId) ?? [];
    list.push(run);
    groups.set(run.strategyId, list);
  }
  return groups;
}

/**
 * Mean cross-strategy containment over every ordered pair of *distinct*
 * strategies, paired universe for universe.
 *
 * The diagonal is excluded: a strategy compared with itself across seeds is the
 * within-strategy figure, which is a different question and the one the record
 * prints on the diagonal.
 */
function crossContainment(groups, labels, sampleAt) {
  const values = [];
  for (const a of labels) {
    for (const b of labels) {
      if (a === b) continue;
      for (const [left, right] of pairedByCoordinates(groups.get(a), groups.get(b))) {
        const x = sampleAt === undefined ? left.terminal : sampleFor(left, sampleAt);
        const y = sampleAt === undefined ? right.terminal : sampleFor(right, sampleAt);
        if (x === undefined || y === undefined) continue;
        const value = containment(x.nodeIds, y.nodeIds);
        if (Number.isFinite(value)) values.push(value);
      }
    }
  }
  return {
    n: values.length,
    mean: values.reduce((p, q) => p + q, 0) / values.length,
    min: values.length === 0 ? Number.NaN : Math.min(...values),
    belowOne: values.filter((value) => value < 0.9995).length,
  };
}

function sampleFor(run, tick) {
  return run.samples.find((sample) => sample.worldTick === tick);
}

/** `betweenShare` over the binary held-set matrix, optionally excluding groups. */
function betweenShare(runs, exclude) {
  const kept = runs.filter((run) => !exclude.has(run.strategyId));
  const { columns, rows } = buildMatrix(kept, 'binary');
  const report = spectrum(rows, columns.length);
  const variance = varianceDecomposition(rows, columns.length, (index) => kept[index].strategyId);
  return {
    n: kept.length,
    columns: columns.length,
    betweenShare: variance.betweenShare,
    forEighty: report.forEighty,
    participation: report.participationRatio,
  };
}

function armReport(dir) {
  const runs = runsOf(dir);
  const groups = grouped(runs);
  const labels = [...groups.keys()].sort();
  const v1Labels = labels.filter((label) => !RULESET_EDITORS.has(label));

  const wins = new Map();
  const encouraged = new Map();
  for (const [label, list] of groups) {
    wins.set(label, {
      won: list.filter((run) => WINNING_REASONS.has(run.terminalReason)).length,
      of: list.length,
    });
    const cells = new Set();
    for (const run of list) for (const cellId of Object.keys(run.encouragedTicks)) cells.add(cellId);
    encouraged.set(label, cells);
  }

  return {
    dir,
    runs,
    groups,
    labels,
    v1Labels,
    wins,
    encouraged,
    prefixFidelity: prefixFidelity(runs),
    terminalContainmentAll: crossContainment(groups, labels),
    terminalContainmentV1: crossContainment(groups, v1Labels),
    horizons: Object.fromEntries(
      [240, 480, 960, 1440].map((tick) => [
        tick,
        {
          all: crossContainment(groups, labels, tick),
          v1: crossContainment(groups, v1Labels, tick),
        },
      ]),
    ),
    between: betweenShare(runs, new Set()),
    betweenV1: betweenShare(runs, RULESET_EDITORS),
    unions: Object.fromEntries(
      [...groups.entries()].map(([label, list]) => [
        label,
        [...new Set(list.flatMap((run) => run.terminal.nodeIds))].sort((a, b) => a - b),
      ]),
    ),
  };
}

function main() {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) throw new Error('usage: compare-arms.mjs <arm-dir> [arm-dir...]');
  const arms = dirs.map(armReport);
  const out = [];

  out.push('## 1. Cross-strategy containment — |A∩B| / min(|A|,|B|), paired universe for universe');
  out.push('');
  out.push('| arm | scope | terminal mean | terminal min | pairs below 1.0 | t=240 | t=480 | t=960 |');
  out.push('|---|---|--:|--:|--:|--:|--:|--:|');
  for (const arm of arms) {
    for (const scope of ['v1', 'all']) {
      const terminal = scope === 'v1' ? arm.terminalContainmentV1 : arm.terminalContainmentAll;
      out.push(
        `| ${arm.dir} | ${scope === 'v1' ? 'v1-bound only' : 'whole pool'} | ` +
          `**${fmt(terminal.mean)}** | ${fmt(terminal.min)} | ` +
          `${String(terminal.belowOne)}/${String(terminal.n)} | ` +
          `${fmt(arm.horizons[240][scope].mean)} | ${fmt(arm.horizons[480][scope].mean)} | ` +
          `${fmt(arm.horizons[960][scope].mean)} |`,
      );
    }
  }

  out.push('');
  out.push('## 2. betweenShare, and the spectrum it sits in');
  out.push('');
  out.push('| arm | scope | runs | node columns | betweenShare | components for 80% | participation |');
  out.push('|---|---|--:|--:|--:|--:|--:|');
  for (const arm of arms) {
    for (const [scope, report] of [
      ['v1-bound only', arm.betweenV1],
      ['whole pool', arm.between],
    ]) {
      out.push(
        `| ${arm.dir} | ${scope} | ${String(report.n)} | ${String(report.columns)} | ` +
          `**${fmt(report.betweenShare)}** | ${String(report.forEighty)} | ${fmt(report.participation, 2)} |`,
      );
    }
  }

  out.push('');
  out.push('## 3. Win rate — terminalReason in {apotheosis, canon}');
  out.push('');
  const labels = arms[0].labels;
  out.push(`| strategy | ${arms.map((arm) => arm.dir).join(' | ')} |`);
  out.push(`|---|${arms.map(() => '--:').join('|')}|`);
  for (const label of labels) {
    const cells = arms.map((arm) => {
      const win = arm.wins.get(label);
      return win === undefined ? '—' : `${String(win.won)}/${String(win.of)}`;
    });
    out.push(`| \`${label}\` | ${cells.join(' | ')} |`);
  }

  out.push('');
  out.push('## Prefix fidelity — is a run’s set still a function of its size?');
  out.push('');
  out.push('| arm | mean | exact |');
  out.push('|---|--:|--:|');
  for (const arm of arms) {
    out.push(
      `| ${arm.dir} | **${fmt(arm.prefixFidelity.mean, 4)}** | ` +
        `${String(arm.prefixFidelity.exact)}/${String(arm.prefixFidelity.of)} |`,
    );
  }

  out.push('');
  out.push('## Reorder or reweight — terminal unions, arm against arm');
  out.push('');
  out.push(
    `| strategy | ${arms.map((arm) => `∪ ${arm.dir}`).join(' | ')} | ` +
      `${arms.slice(1).map((arm) => `J ${arm.dir} vs ${arms[0].dir}`).join(' | ')} |`,
  );
  out.push(`|---|${arms.map(() => '--:').join('|')}|${arms.slice(1).map(() => '--:').join('|')}|`);
  for (const label of labels) {
    const sizes = arms.map((arm) => String((arm.unions[label] ?? []).length));
    const js = arms
      .slice(1)
      .map((arm) => fmt(jaccard(arms[0].unions[label] ?? [], arm.unions[label] ?? [])));
    out.push(`| \`${label}\` | ${sizes.join(' | ')} | ${js.join(' | ')} |`);
  }

  out.push('');
  out.push('## Reorder or reweight — paired per-run overlap, arm against arm, at each horizon');
  out.push('');
  out.push(
    'One run against **the run at the same coordinates in the other arm**. A Jaccard below 1.0 at ' +
      'a horizon with 1.000 at terminal is *reordering that the content ceiling then erases*; ' +
      '1.000 everywhere is reweighting, or nothing at all.',
  );
  out.push('');
  for (const other of arms.slice(1)) {
    out.push('');
    out.push(`### ${arms[0].dir} vs ${other.dir}`);
    out.push('');
    out.push('| strategy | t=240 | t=480 | t=960 | terminal | terminal Δnodes |');
    out.push('|---|--:|--:|--:|--:|--:|');
    for (const label of labels) {
      const pairs = pairedByCoordinates(arms[0].groups.get(label), other.groups.get(label));
      const atTick = (tick) => {
        const values = pairs
          .map(([left, right]) => {
            const x = tick === undefined ? left.terminal : sampleFor(left, tick);
            const y = tick === undefined ? right.terminal : sampleFor(right, tick);
            return x === undefined || y === undefined ? Number.NaN : jaccard(x.nodeIds, y.nodeIds);
          })
          .filter((value) => Number.isFinite(value));
        return values.length === 0
          ? Number.NaN
          : values.reduce((p, q) => p + q, 0) / values.length;
      };
      const delta =
        pairs.reduce(
          (sum, [left, right]) => sum + right.terminal.nodeIds.length - left.terminal.nodeIds.length,
          0,
        ) / (pairs.length || 1);
      out.push(
        `| \`${label}\` | ${fmt(atTick(240))} | ${fmt(atTick(480))} | ${fmt(atTick(960))} | ` +
          `${fmt(atTick(undefined))} | ${delta >= 0 ? '+' : ''}${fmt(delta, 1)} |`,
      );
    }
  }

  out.push('');
  out.push('## Attribution — which cells each strategy ever encouraged');
  out.push('');
  out.push(`| strategy | ${arms.map((arm) => arm.dir).join(' | ')} |`);
  out.push(`|---|${arms.map(() => '--:').join('|')}|`);
  for (const label of labels) {
    const cells = arms.map((arm) => {
      const set = arm.encouraged.get(label);
      return set === undefined || set.size === 0
        ? '—'
        : `${String(set.size)}: ${[...set].map(Number).sort((a, b) => a - b).join(',')}`;
    });
    out.push(`| \`${label}\` | ${cells.join(' | ')} |`);
  }

  process.stdout.write(`${out.join('\n')}\n`);
}

main();
