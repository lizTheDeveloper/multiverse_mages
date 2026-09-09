/*
 * Multiverse Mages — the first metric in this registry that reads a stock.
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
 * `metrics-registry.ts` declared eighteen metrics and **not one read a material
 * stock**: seven kinds, a claimant order, a ceiling that spills, and nothing
 * that could say what any of it did. So the ladder's own falsifier —
 * *"universes convert only along grade 0 -> 1 and never reach the far edges"* —
 * was unaskable, and a metric was a prerequisite of the mechanic rather than a
 * follow-up to it.
 *
 * The distinction every assertion below is built around: **`undefined` is not
 * zero.** A build with no ladder must report `mechanic-absent`, and a run that
 * had a ladder and never left grade 0 must report `0`. Collapsing them is how
 * this project once shipped a metric that could only ever read zero and read it
 * for months.
 */

import { describe, expect, it } from 'vitest';

import type { MaterialGradeSample } from '@mm/mc-harness';
import { BALANCE_METRIC_REGISTRY, collectMaterialGradeProfile } from '@mm/mc-harness';

import { telemetry } from './metrics-fixtures.js';

function grades(...levels: readonly (readonly [number, number])[]): MaterialGradeSample[] {
  return levels.map(([stoneWorked, stoneFine], index) => ({
    worldTick: index * 60,
    stoneWorked,
    stoneFine,
  }));
}

describe('materialGradeProfile separates "no ladder" from "a ladder nobody climbed"', () => {
  it('POSITIVE CONTROL: reports a fraction above zero for a run that reached the top grade', () => {
    // Asserted first. Until this metric has reported a nonzero on a run known
    // to refine, "the ladder does nothing" and "this metric is wired to
    // nothing" are the same output — which is what its own `disprovedBy` says.
    const entry = collectMaterialGradeProfile(
      telemetry({ materialGrades: grades([256, 0], [512, 64], [768, 128], [1024, 192]) }),
    );

    expect(entry.status).toBe('measured');
    if (entry.status !== 'measured') return;
    expect(entry.value).toBeCloseTo(3 / 4);
    expect(entry.detail?.['fractionHoldingWorked']).toBe(1);
    expect(entry.detail?.['peakFine']).toBe(192);
  });

  it('reports zero — a measurement — for a run that refined but never left grade 1', () => {
    const entry = collectMaterialGradeProfile(
      telemetry({ materialGrades: grades([256, 0], [512, 0], [768, 0]) }),
    );

    expect(entry.status).toBe('measured');
    if (entry.status !== 'measured') return;
    expect(entry.value).toBe(0);
    // And the second series is what stops that zero being read as "nothing
    // happened": this universe refined all run and simply never reached iron.
    expect(entry.detail?.['fractionHoldingWorked']).toBe(1);
    expect(entry.detail?.['peakWorked']).toBe(768);
  });

  it('reports zero for a run whose universe refined nothing at all', () => {
    const entry = collectMaterialGradeProfile(
      telemetry({ materialGrades: grades([0, 0], [0, 0]) }),
    );

    expect(entry.status).toBe('measured');
    if (entry.status !== 'measured') return;
    expect(entry.value).toBe(0);
    expect(entry.detail?.['fractionHoldingWorked']).toBe(0);
  });

  it('reports mechanic-absent, NOT zero, for a build with no ladder', () => {
    // The assertion this whole file exists for. A `0` here would make an
    // unmeasured build indistinguishable from the measured run above it, and
    // every sweep that folded the two would report a mean nobody could
    // interpret.
    const entry = collectMaterialGradeProfile(telemetry({}));

    expect(entry.status).toBe('unavailable');
    if (entry.status !== 'unavailable') return;
    expect(entry.reason).toBe('mechanic-absent');
  });

  it('reports no-observations, also not zero, for a ladder that was never sampled', () => {
    const entry = collectMaterialGradeProfile(telemetry({ materialGrades: [] }));

    expect(entry.status).toBe('unavailable');
    if (entry.status !== 'unavailable') return;
    expect(entry.reason).toBe('no-observations');
  });

  it('is registered, per-run, with a collector and a falsifier', () => {
    const definition = BALANCE_METRIC_REGISTRY.definitions.find(
      (entry) => entry.id === 'materialGradeProfile',
    );

    expect(definition).toBeDefined();
    expect(definition?.scope).toBe('per-run');
    expect(definition?.collectRun).toBeDefined();
    expect((definition?.disprovedBy ?? '').length).toBeGreaterThan(0);
    // Pinned so that widening the ladder past grade 2, or past `stone`, is a
    // `definitionVersion` decision rather than a silent change of meaning.
    expect(definition?.pinnedConstants?.['topGrade']).toBe(2);
    expect(definition?.pinnedConstants?.['mechanicAbsentIsNotZero']).toBe(true);
  });
});
