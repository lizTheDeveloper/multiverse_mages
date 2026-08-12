/*
 * Multiverse Mages — raidLengthDistribution and the two tempo metrics.
 * Task 6.9, plus the raid metrics §7 names that no task group 6 line covers.
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

import { describe, expect, it } from 'vitest';

import type { RaidObservation } from '@mm/mc-harness';
import {
  RAID_LENGTH_BIN_WIDTH_TICKS,
  collectInboundRaidTempoLoss,
  collectRaidInitiationCost,
  collectRaidLengthDistribution,
  collectWinRateByPrimitive,
  raidLengthHistogram,
} from '@mm/mc-harness';

import { ALL_MECHANICS, arm, telemetry } from './metrics-fixtures.js';

function raid(overrides: Partial<RaidObservation> = {}): RaidObservation {
  return {
    raidId: 1,
    raidSeed: 4242,
    engagementTicks: 15,
    initialPortalStabilityTicks: 100,
    defenderFrozenWorldTicks: 3,
    attackerTempoCostWorldTicks: 7,
    ...overrides,
  };
}

describe('the histogram (task 6.9)', () => {
  it('bins at a pinned width of 10 engagement ticks', () => {
    expect(RAID_LENGTH_BIN_WIDTH_TICKS).toBe(10);
    const histogram = raidLengthHistogram([
      raid({ raidId: 1, engagementTicks: 0 }),
      raid({ raidId: 2, engagementTicks: 9 }),
      raid({ raidId: 3, engagementTicks: 10 }),
      raid({ raidId: 4, engagementTicks: 19 }),
      raid({ raidId: 5, engagementTicks: 20 }),
    ]);
    expect(histogram.bins[0]).toBe(2);
    expect(histogram.bins[1]).toBe(2);
    expect(histogram.bins[2]).toBe(1);
  });

  it('spans zero to the maximum initial portal stability', () => {
    const histogram = raidLengthHistogram([
      raid({ engagementTicks: 5, initialPortalStabilityTicks: 45 }),
    ]);
    // 46 tick values, 10 to a bin → 5 bins.
    expect(histogram.bins).toHaveLength(5);
  });

  it('reports p50, p95 and the maximum alongside the bins', () => {
    const histogram = raidLengthHistogram(
      [4, 8, 12, 16, 20].map((engagementTicks, index) =>
        raid({ raidId: index, engagementTicks }),
      ),
    );
    expect(histogram.p50).toBe(12);
    expect(histogram.p95).toBe(20);
    expect(histogram.maximum).toBe(20);
    expect(histogram.raidCount).toBe(5);
  });

  it('keeps the overflow bin empty when every raid respects its bound', () => {
    const histogram = raidLengthHistogram([
      raid({ engagementTicks: 100, initialPortalStabilityTicks: 100 }),
    ]);
    expect(histogram.overflow).toBe(0);
  });

  it('fails the run when a raid outlives its own portal stability, naming raid and seed', () => {
    // §1.6 makes raid termination a proof — no primitive may modify
    // portalStability and decay is an authored integer ≥ 1. A raid past the
    // bound is a violated guarantee, not a long tail, so it must not simply
    // land in a wider histogram.
    expect(() =>
      raidLengthHistogram([
        raid({ raidId: 77, raidSeed: 123456, engagementTicks: 101, initialPortalStabilityTicks: 100 }),
      ]),
    ).toThrow(/raid 77 \(seed 123456\)/);
    expect(() =>
      raidLengthHistogram([raid({ engagementTicks: 101, initialPortalStabilityTicks: 100 })]),
    ).toThrow(/overflow bin is non-empty/);
  });
});

describe('raidLengthDistribution is mechanic-absent at 0.5.0', () => {
  it('reports mechanic-absent, not a distribution over nothing', () => {
    const entry = collectRaidLengthDistribution(telemetry());
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'mechanic-absent' });
    expect(entry.detail?.['owner']).toBe('raid-engagement');
  });

  it('distinguishes "raids do not exist" from "this run had none"', () => {
    // The capability spec's "Absent and empty are distinguishable" scenario, and
    // the reason `raids` is `undefined` rather than `[]` on this build.
    const noMechanic = collectRaidLengthDistribution(telemetry({ raids: undefined }));
    const noRaids = collectRaidLengthDistribution(
      telemetry({ mechanics: ALL_MECHANICS, raids: [] }),
    );
    expect(noMechanic).toMatchObject({ reason: 'mechanic-absent' });
    expect(noRaids).toMatchObject({ reason: 'no-observations' });
  });

  it('measures once raids exist', () => {
    const entry = collectRaidLengthDistribution(
      telemetry({
        mechanics: ALL_MECHANICS,
        raids: [4, 8, 12].map((engagementTicks, index) => raid({ raidId: index, engagementTicks })),
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBe(8);
    expect(entry.detail?.['overflow']).toBe(0);
    expect(entry.detail?.['binWidthTicks']).toBe(10);
  });
});

describe('the two tempo metrics §7 names', () => {
  it('reports inboundRaidTempoLoss as mechanic-absent at 0.5.0', () => {
    expect(collectInboundRaidTempoLoss(telemetry())).toMatchObject({
      status: 'unavailable',
      reason: 'mechanic-absent',
    });
  });

  it('measures frozen defender time as a fraction of the run once raids exist', () => {
    const entry = collectInboundRaidTempoLoss(
      telemetry({
        mechanics: ALL_MECHANICS,
        ticksRun: 100,
        raids: [raid({ defenderFrozenWorldTicks: 6 }), raid({ raidId: 2, defenderFrozenWorldTicks: 4 })],
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBeCloseTo(0.1, 12);
  });

  it('reports raidInitiationCost per raid, not per run', () => {
    const entry = collectRaidInitiationCost(
      telemetry({
        mechanics: ALL_MECHANICS,
        raids: [
          raid({ attackerTempoCostWorldTicks: 10 }),
          raid({ raidId: 2, attackerTempoCostWorldTicks: 20 }),
        ],
      }),
    );
    if (entry.status !== 'measured') throw new Error('expected a measurement');
    expect(entry.value).toBe(15);
  });

  it('reports no-observations when raids exist and none were initiated', () => {
    expect(
      collectRaidInitiationCost(telemetry({ mechanics: ALL_MECHANICS, raids: [] })),
    ).toMatchObject({ reason: 'no-observations' });
  });
});

describe('winRateByPrimitive, registered here and scheduled by task group 7', () => {
  it('reports mechanic-absent because it is a raid win rate and there are no raids', () => {
    const entry = collectWinRateByPrimitive(arm());
    expect(entry).toMatchObject({ status: 'unavailable', reason: 'mechanic-absent' });
    expect(String(entry.detail?.['reasonDetail'])).toContain('no raids');
  });

  it('reports no-observations once raids exist but no ablation arm was scheduled', () => {
    // The honest intermediate state: the mechanic is there, this arm is the
    // control half of a comparison that has no other half. The collector must
    // not fabricate an attribution out of one arm.
    expect(collectWinRateByPrimitive(arm({ mechanics: ALL_MECHANICS }))).toMatchObject({
      status: 'unavailable',
      reason: 'no-observations',
    });
  });
});
