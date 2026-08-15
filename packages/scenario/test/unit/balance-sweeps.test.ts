/*
 * Multiverse Mages — the committed sweeps validate against the universe they
 * claim to sweep.
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
 * Task 8.5.
 *
 * `balance/sweeps/` holds JSON, and JSON has no typechecker. The gate sweep is
 * validated every time the gate runs, which is every push — but the **full**
 * sweep is never executed on this build, so without this file a typo in it would
 * be discovered by whoever finally runs a four-day experiment.
 *
 * The failure that matters is the quiet one, and `sweep-spec.ts` names it: a
 * factor id the scenario does not read still multiplies the cell count, every
 * cell it produces is a duplicate of its neighbour, and the result is a
 * perfectly reproducible measurement of one configuration reported as a
 * measurement of forty. Nothing about the sweep's output would look wrong.
 *
 * This test lives in `packages/scenario` rather than beside the gate because
 * `contracts.md` §5 grants `mc-harness` one edge, to `agent-api`, and the real
 * registries — the bot pool, the reference factors, the reference measures —
 * are on this side of that line.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { SweepSpec } from '@mm/mc-harness';
import { expandSweep, validateSweep } from '@mm/mc-harness';
import {
  BALANCE_RUN_METRIC_IDS,
  CENSUS_INTERVAL_TICKS,
  FINAL_WINDOW_DENOMINATOR,
  REFERENCE_REGISTRIES,
} from '@mm/scenario';
import { describe, expect, it } from 'vitest';

/** From packages/scenario/test/unit/ up to the repository root. */
const repoRoot = new URL('../../../../', import.meta.url);

function readSweep(name: string): SweepSpec {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`balance/sweeps/${name}`, repoRoot)), 'utf8'),
  ) as SweepSpec;
}

const gate = readSweep('balance-gate.sweep.json');
const horizon = readSweep('balance-gate-horizon.sweep.json');
const full = readSweep('balance-full.sweep.json');

const committed: readonly (readonly [string, SweepSpec])[] = [
  ['balance-gate.sweep.json', gate],
  ['balance-gate-horizon.sweep.json', horizon],
  ['balance-full.sweep.json', full],
];

describe('every committed sweep runs against this universe', () => {
  it.each(committed)('%s validates against the reference registries', (_name, spec) => {
    expect(validateSweep(spec, REFERENCE_REGISTRIES)).toEqual([]);
  });

  it.each(committed)('%s expands into the cells its factors describe', (_name, spec) => {
    const plan = expandSweep(spec, REFERENCE_REGISTRIES);
    const cells = spec.factors.reduce((count, factor) => count * factor.levels.length, 1);
    expect(plan.cellCount).toBe(cells);
    expect(plan.runCount).toBe(cells * spec.replicates);
    // Every cell distinct: the symptom a mistyped factor id would not show.
    expect(new Set(plan.cells.map((cell) => JSON.stringify(cell.levels))).size).toBe(cells);
  });
});

describe('the three sweeps are three different instruments', () => {
  it('declares two gate sweeps and one full sweep, all differently identified', () => {
    expect(gate.kind).toBe('gate');
    expect(horizon.kind).toBe('gate');
    expect(full.kind).toBe('full');
    expect(new Set(committed.map(([, spec]) => spec.sweepId)).size).toBe(committed.length);
  });

  it('gives the full sweep the sample size the methodology asks for', () => {
    expect(expandSweep(full, REFERENCE_REGISTRIES).runCount).toBe(10_000);
  });

  it('keeps the gate sweep small enough to run on every push', () => {
    // The constraint is not aesthetic: a gate that takes ten minutes gets
    // deleted, and a deleted gate is the failure this whole change is about.
    expect(expandSweep(gate, REFERENCE_REGISTRIES).runCount).toBeLessThanOrEqual(400);
  });

  it('shares no configuration hash, so no baseline can satisfy another sweep', () => {
    const hashes = committed.map(([, spec]) => expandSweep(spec, REFERENCE_REGISTRIES).configurationHash);
    expect(new Set(hashes).size).toBe(committed.length);
  });

  /**
   * The rule, so that a fourth sweep has one to follow: **every committed sweep
   * collects the nine vital signs, and the sweeps whose tick cap makes
   * `referenceNodesGainedFinalQuarter` exact collect that too.**
   *
   * The exactness condition is arithmetic, not taste. The final-quarter window
   * is `ticksRun / 4` widened to the census grid, and the census is taken every
   * {@link CENSUS_INTERVAL_TICKS} ticks — so the window is exactly a quarter
   * only when the tick cap is a multiple of four census intervals. 240 is
   * (240 / 4 = 60 = five intervals); 60 is not (60 / 4 = 15, which the grid
   * widens to 24, two intervals). Declaring the metric where it is quantized
   * would put a number in a baseline under a name that does not describe it.
   */
  it('collects the nine vital signs everywhere, and the shape statistic where it is exact', () => {
    const shape = 'referenceNodesGainedFinalQuarter';
    const vitals = [...gate.metrics].sort();
    expect(vitals).not.toContain(shape);
    expect(vitals).toHaveLength(9);

    for (const [name, spec] of committed) {
      // The §7 half is a separate rule, below. Filtered out here rather than
      // folded in, because the vital-sign rule is about what makes a *universe*
      // legible and §7's is about what makes a *balance claim* checkable.
      const declared = [...spec.metrics].sort().filter((id) => !BALANCE_RUN_METRIC_IDS.includes(id));
      const exact = spec.termination.worldTickCap % (FINAL_WINDOW_DENOMINATOR * CENSUS_INTERVAL_TICKS) === 0;
      expect(declared.filter((id) => id !== shape), name).toEqual(vitals);
      expect(declared.includes(shape), name).toBe(exact);
    }

    // Not vacuous in either direction: one committed sweep is on each side.
    expect(gate.metrics).not.toContain(shape);
    expect(horizon.metrics).toContain(shape);
  });

  /**
   * The §7 rule, and the asymmetry in it is the whole point.
   *
   * The **full** sweep declares `contracts.md` §7's seven per-run metrics,
   * because it is the methodology run and those seven are what a balance claim
   * is eventually made of. They became declarable at all only when
   * `collectRunMetrics` got a production caller — before that the validator
   * would have rejected every one of these ids, which is why four separate
   * findings (`libraryDependence` pinned at 0 among them) were four symptoms of
   * one uncalled function.
   *
   * The **gate** sweeps deliberately do not. A sweep's declared metric list is
   * inside its `configurationHash`, and a baseline is keyed on that hash — so
   * adding a column to a gated sweep invalidates its committed baseline and
   * forces a regeneration, which is the one thing a change to the measurement
   * apparatus must never quietly require. Gating these seven is a separate
   * decision, taken with a baseline in hand.
   */
  it('declares §7 per-run metrics on the full sweep and on no gated one', () => {
    const declares = (spec: SweepSpec): string[] =>
      [...spec.metrics].filter((id) => BALANCE_RUN_METRIC_IDS.includes(id)).sort();

    expect(declares(full)).toEqual([...BALANCE_RUN_METRIC_IDS].sort());
    expect(declares(gate)).toEqual([]);
    expect(declares(horizon)).toEqual([]);
  });
});
