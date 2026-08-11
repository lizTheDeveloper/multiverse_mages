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
import { REFERENCE_REGISTRIES } from '@mm/scenario';
import { describe, expect, it } from 'vitest';

/** From packages/scenario/test/unit/ up to the repository root. */
const repoRoot = new URL('../../../../', import.meta.url);

function readSweep(name: string): SweepSpec {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`balance/sweeps/${name}`, repoRoot)), 'utf8'),
  ) as SweepSpec;
}

const gate = readSweep('balance-gate.sweep.json');
const full = readSweep('balance-full.sweep.json');

describe('every committed sweep runs against this universe', () => {
  it.each([
    ['balance-gate.sweep.json', gate],
    ['balance-full.sweep.json', full],
  ])('%s validates against the reference registries', (_name, spec) => {
    expect(validateSweep(spec, REFERENCE_REGISTRIES)).toEqual([]);
  });

  it.each([
    ['balance-gate.sweep.json', gate],
    ['balance-full.sweep.json', full],
  ])('%s expands into the cells its factors describe', (_name, spec) => {
    const plan = expandSweep(spec, REFERENCE_REGISTRIES);
    const cells = spec.factors.reduce((count, factor) => count * factor.levels.length, 1);
    expect(plan.cellCount).toBe(cells);
    expect(plan.runCount).toBe(cells * spec.replicates);
    // Every cell distinct: the symptom a mistyped factor id would not show.
    expect(new Set(plan.cells.map((cell) => JSON.stringify(cell.levels))).size).toBe(cells);
  });
});

describe('the two sweeps are two different instruments', () => {
  it('declares one gate sweep and one full sweep', () => {
    expect(gate.kind).toBe('gate');
    expect(full.kind).toBe('full');
    expect(gate.sweepId).not.toBe(full.sweepId);
  });

  it('gives the full sweep the sample size the methodology asks for', () => {
    expect(expandSweep(full, REFERENCE_REGISTRIES).runCount).toBe(10_000);
  });

  it('keeps the gate sweep small enough to run on every push', () => {
    // The constraint is not aesthetic: a gate that takes ten minutes gets
    // deleted, and a deleted gate is the failure this whole change is about.
    expect(expandSweep(gate, REFERENCE_REGISTRIES).runCount).toBeLessThanOrEqual(400);
  });

  it('shares no configuration hash, so neither baseline can satisfy the other', () => {
    const gatePlan = expandSweep(gate, REFERENCE_REGISTRIES);
    const fullPlan = expandSweep(full, REFERENCE_REGISTRIES);
    expect(gatePlan.configurationHash).not.toBe(fullPlan.configurationHash);
  });

  it('collects the same metrics, so the two are comparable experiments', () => {
    expect([...gate.metrics].sort()).toEqual([...full.metrics].sort());
  });
});
