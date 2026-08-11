/*
 * Multiverse Mages — the arm the sweep pipeline assembles, and the five §7
 * metrics that had no way to be measured before it existed.
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

import type { ArmContribution, CheckpointSample, RunRecord } from '@mm/mc-harness';
import {
  BALANCE_METRIC_REGISTRY,
  MECHANICS_AT_0_5_0,
  METRIC_SCOPE,
  NO_MECHANICS,
  SNOWBALL_CHECKPOINT_TICKS,
  buildArmTelemetry,
  collectArmMetrics,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { syntheticRecord } from './fixtures.js';

/** Checkpoints at every pinned tick, with both quantities supplied. */
function checkpoints(libraryNodeCount: number, favorRegenPerTick: number): CheckpointSample[] {
  return SNOWBALL_CHECKPOINT_TICKS.map((worldTick) => ({
    worldTick,
    favorRegenPerTick,
    libraryNodeCount,
    worshipByClass: { mages: 100, universities: 20, populace: 5 },
  }));
}

const CONTRIBUTION = (overrides: Partial<ArmContribution> = {}): ArmContribution => ({
  mechanics: MECHANICS_AT_0_5_0,
  checkpoints: checkpoints(4, 8),
  prestigeCarryForwardMax: 8192,
  ...overrides,
});

/** A described run at `replicateIndex`, with a status and a contribution. */
function describedRun(
  replicateIndex: number,
  overrides: {
    readonly status?: RunRecord['status'];
    readonly contribution?: ArmContribution | undefined;
    readonly ticksRun?: number;
  } = {},
): RunRecord {
  const record = syntheticRecord({
    cellIndex: 0,
    replicateIndex,
    metrics: {},
    ...(overrides.status === undefined ? {} : { status: overrides.status }),
  });
  return {
    ...record,
    ticksRun: overrides.ticksRun ?? 1200,
    ...(overrides.contribution === undefined ? {} : { armContribution: overrides.contribution }),
  };
}

describe('an arm is assembled from what the runs described, or not at all', () => {
  it('reports nothing when no run described an arm', () => {
    // Not an arm of zero runs. `gini([])` is 0 and 0 is the coefficient of a
    // perfectly equal population, so an empty arm would report perfect equality
    // of a quantity nobody measured.
    const telemetry = buildArmTelemetry({
      armId: 'nothing',
      records: [describedRun(0), describedRun(1)],
    });
    expect(telemetry).toBeUndefined();
  });

  it('folds the runs in canonical order, whatever order they arrive in', () => {
    const records = [
      describedRun(2, { contribution: CONTRIBUTION() }),
      describedRun(0, { contribution: CONTRIBUTION() }),
      describedRun(1, { contribution: CONTRIBUTION() }),
    ];
    const telemetry = buildArmTelemetry({ armId: 'arm', records });
    expect(telemetry?.runs.map((run) => run.coordinates.replicateIndex)).toEqual([0, 1, 2]);
  });

  it('includes a failed run in the arm, with no checkpoints of its own', () => {
    // ascensionRate needs it: a failed run is excluded from the denominator and
    // reported separately, and the collector does that from the status alone.
    const telemetry = buildArmTelemetry({
      armId: 'arm',
      records: [
        describedRun(0, { contribution: CONTRIBUTION() }),
        describedRun(1, { status: 'failed' }),
      ],
    });
    expect(telemetry?.runs).toHaveLength(2);
    expect(telemetry?.runs[1]?.checkpoints).toEqual([]);
  });

  it('refuses an arm whose runs disagree about what the build implements', () => {
    expect(() =>
      buildArmTelemetry({
        armId: 'arm',
        records: [
          describedRun(0, { contribution: CONTRIBUTION() }),
          describedRun(1, { contribution: CONTRIBUTION({ mechanics: NO_MECHANICS }) }),
        ],
      }),
    ).toThrow(/disagree about what the build implements/);
  });

  it('refuses an arm whose runs disagree about the prestige carry-forward', () => {
    expect(() =>
      buildArmTelemetry({
        armId: 'arm',
        records: [
          describedRun(0, { contribution: CONTRIBUTION() }),
          describedRun(1, { contribution: CONTRIBUTION({ prestigeCarryForwardMax: null }) }),
        ],
      }),
    ).toThrow(/disagree/);
  });
});

describe('the five per-arm metrics now have somewhere to come from', () => {
  const telemetry = buildArmTelemetry({
    armId: 'arm',
    records: [
      describedRun(0, { contribution: CONTRIBUTION({ checkpoints: checkpoints(1, 2) }) }),
      describedRun(1, { contribution: CONTRIBUTION({ checkpoints: checkpoints(9, 40) }) }),
      describedRun(2, { status: 'ascended', contribution: CONTRIBUTION() }),
    ],
  });

  it('assembles an arm at all', () => {
    expect(telemetry).toBeDefined();
  });

  it('covers exactly the per-arm half of the registry', () => {
    const entries = collectArmMetrics(telemetry as NonNullable<typeof telemetry>);
    const perArm = BALANCE_METRIC_REGISTRY.definitions
      .filter((definition) => definition.scope === METRIC_SCOPE.perArm)
      .map((definition) => definition.id)
      .sort();
    expect(Object.keys(entries).sort()).toEqual(perArm);
  });

  it('measures ascensionRate against a real denominator', () => {
    const entries = collectArmMetrics(telemetry as NonNullable<typeof telemetry>);
    const entry = entries['ascensionRate'];
    expect(entry?.status).toBe('measured');
    expect(entry?.status === 'measured' ? entry.value : -1).toBeCloseTo(1 / 3, 12);
  });

  it('measures both snowball coefficients from the checkpoint samples', () => {
    const entries = collectArmMetrics(telemetry as NonNullable<typeof telemetry>);
    expect(entries['capitalSnowball']?.status).toBe('measured');
    expect(entries['worshipSnowball']?.status).toBe('measured');
  });

  it('reports the per-class worship decomposition beside the coefficient', () => {
    // god-agency task 7.2: a coefficient over threshold says inequality is
    // growing and says nothing about which of the three classes produced it.
    const entries = collectArmMetrics(telemetry as NonNullable<typeof telemetry>);
    const byClass = entries['worshipSnowball']?.detail?.['worshipByClass'];
    expect(Array.isArray(byClass)).toBe(true);
    const first = (byClass as { worldTick: number; mages: number | null }[])[0];
    expect(first?.worldTick).toBe(60);
    expect(first?.mages).toBe(100);
  });

  it('upgrades prestigeAdvantage from mechanic-absent to no-observations', () => {
    // The carry-forward maximum exists now — PRESTIGE_CAP, an analytic limit
    // rather than a chosen number — so the mechanic is present. What is missing
    // is a mirrored pair, and no build can schedule one until something can
    // declare a winner between two universes. Those are different sentences and
    // the reason code is where the difference survives.
    const entry = collectArmMetrics(telemetry as NonNullable<typeof telemetry>)['prestigeAdvantage'];
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'no-observations' });
  });

  it('keeps winRateByPrimitive at mechanic-absent, because raids do not exist', () => {
    const entry = collectArmMetrics(telemetry as NonNullable<typeof telemetry>)['winRateByPrimitive'];
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'mechanic-absent' });
  });
});
