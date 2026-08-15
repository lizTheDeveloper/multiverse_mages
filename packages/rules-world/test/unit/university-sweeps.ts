/*
 * Multiverse Mages — the sweeps that are committed, and what a golden records.
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
 * ## What a golden of a sweep can honestly be
 *
 * Not the runs. A sweep of five thousand universities logged per tick is tens
 * of megabytes, and a fixture nobody can read in a diff is a fixture nobody
 * checks — it gets regenerated the first time it goes red, which is the exact
 * failure `CLAUDE.md` names about `goldens:regen`.
 *
 * So a golden here is a **digest**: per output column, the min, the max, the
 * sum and how many distinct values the sweep produced, plus the ids of the runs
 * at the extremes. That is small enough to read, specific enough that a real
 * behaviour change moves it, and — the property that matters — **the "distinct"
 * count is the one that catches a column going constant.** A column that
 * silently stops varying is how a harness ends up confirming everything, and it
 * is invisible in a min/max pair when the min and max were already equal.
 *
 * The extreme run ids are carried because a moved number is a question — *which
 * university did that?* — and a digest that cannot answer it sends the reader
 * back to re-run the sweep by hand.
 */

import type { AxisName } from './university-axes.js';
import type { LabReport, SweepResult, SweepSpec } from './university-lab.js';

/**
 * The sweeps this repository commits a golden for.
 *
 * **`species-and-staff` is exhaustive**: every one of the 56 species mixes
 * crossed with all six staff sizes and all five role mixes, 1,680 cells, no
 * stride. That is the ask's core question — *"many combinations of professor
 * types, many combinations of professors, all one species, two species, three
 * species, four species"* — taken whole rather than sampled.
 *
 * `life-stages` adds the early/mid/late axis on top of a reduced species set,
 * and `scribe-demand` is the two-point counterfactual that shows the pinned
 * literal. `capital-curve` walks the contribution table's knots with everything
 * else held, which is the one attributable axis on the file.
 */
export const COMMITTED_SWEEPS: readonly SweepSpec[] = [
  {
    name: 'species-and-staff',
    axes: ['speciesMix', 'staffSize', 'roleMix'] as AxisName[],
    ticks: 120,
    capacity: 40,
  },
  {
    name: 'life-stages',
    axes: ['stage', 'staffSize', 'speciesMix'] as AxisName[],
    ticks: 120,
    capacity: 40,
    // 3 × 6 × 56 = 1,008 cells; every third, stratified across the species
    // list. Declared, not silent: `SweepResult.crossSize` carries the
    // denominator so the report can state what fraction it took.
    stride: 3,
  },
  {
    name: 'scribe-demand',
    axes: ['scribeQueue', 'staffSize', 'stage'] as AxisName[],
    ticks: 120,
    capacity: 40,
  },
  {
    name: 'capital-curve',
    axes: ['seededDepth', 'speciesMix'] as AxisName[],
    ticks: 60,
    capacity: 40,
  },
  {
    name: 'ruleset-gate',
    axes: ['ruleset', 'seededDepth', 'staffSize'] as AxisName[],
    ticks: 60,
    capacity: 40,
  },
];

/** One column's shape across a whole sweep. */
export interface ColumnDigest {
  readonly min: number;
  readonly max: number;
  readonly sum: number;
  /** **The number that catches a column going constant.** `1` means it did. */
  readonly distinct: number;
  readonly minAt: string;
  readonly maxAt: string;
}

export interface SweepDigest {
  readonly runs: number;
  readonly crossSize: number;
  readonly stride: number;
  readonly columns: Readonly<Record<string, ColumnDigest>>;
}

/** Numeric columns of both halves, in a fixed order. Objects and arrays are skipped. */
function numericColumns(report: LabReport): readonly (readonly [string, number])[] {
  const out: (readonly [string, number])[] = [];
  for (const [half, source] of [
    ['contains', report.contains],
    ['adds', report.adds],
  ] as const) {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'number') out.push([`${half}.${key}`, value]);
      if (typeof value === 'boolean') out.push([`${half}.${key}`, value ? 1 : 0]);
    }
  }
  // The demand vector, flattened, because it is the closed loop and a digest
  // that skipped it would skip the finding.
  for (const [occupation, count] of Object.entries(report.adds.demand)) {
    out.push([`adds.demand.${occupation}`, count]);
  }
  return out;
}

/**
 * Folds a sweep into something a person can read and a test can compare.
 *
 * Ties on min or max go to the **first** run in sweep order, which is fixed by
 * `scenariosFor`'s index arithmetic — so `minAt` is stable rather than being
 * whichever run the fold happened to reach.
 */
export function sweepDigest(result: SweepResult): SweepDigest {
  const columns: Record<string, ColumnDigest> = {};
  const seen = new Map<string, Set<number>>();

  for (const report of result.runs) {
    for (const [column, value] of numericColumns(report)) {
      const distinct = seen.get(column) ?? new Set<number>();
      distinct.add(value);
      seen.set(column, distinct);

      const existing = columns[column];
      if (existing === undefined) {
        columns[column] = {
          min: value,
          max: value,
          sum: value,
          distinct: 0,
          minAt: report.id,
          maxAt: report.id,
        };
        continue;
      }
      columns[column] = {
        min: Math.min(existing.min, value),
        max: Math.max(existing.max, value),
        sum: existing.sum + value,
        distinct: 0,
        minAt: value < existing.min ? report.id : existing.minAt,
        maxAt: value > existing.max ? report.id : existing.maxAt,
      };
    }
  }

  const withDistinct: Record<string, ColumnDigest> = {};
  for (const column of Object.keys(columns).sort()) {
    withDistinct[column] = {
      ...(columns[column] as ColumnDigest),
      distinct: (seen.get(column) as Set<number>).size,
    };
  }

  return {
    runs: result.runs.length,
    crossSize: result.crossSize,
    stride: result.stride,
    columns: withDistinct,
  };
}

/** Columns that took exactly one value across a whole sweep. */
export function constantColumns(digest: SweepDigest): readonly string[] {
  return Object.entries(digest.columns)
    .filter(([, column]) => column.distinct === 1)
    .map(([name]) => name);
}
