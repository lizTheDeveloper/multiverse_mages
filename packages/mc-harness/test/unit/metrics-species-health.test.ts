/*
 * Multiverse Mages — the three species measurements, and the absences they must
 * keep distinct from zero.
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

import {
  VERSATILITY_HEGEMONY_FRACTION,
  collectLossShockRecovery,
  collectRoleAssignmentDemographicCost,
  collectSpeciesGridVersatility,
} from '../../src/metrics-species-health.js';
import { UNAVAILABLE_REASON } from '../../src/metrics.js';
import type { RosterSample, SpeciesGridReach } from '../../src/metrics-telemetry.js';
import { MECHANICS_AT_0_5_0 } from '../../src/metrics-telemetry.js';
import { telemetry } from './metrics-fixtures.js';

function reach(overrides: Partial<SpeciesGridReach> & { speciesId: string }): SpeciesGridReach {
  return {
    depthCeiling: 4,
    staffableCells: 70,
    staffableEnabledCells: 12,
    exhaustibleCells: 55,
    exhaustibleEnabledCells: 10,
    teachableWindowTicks: 64,
    inertAffinityEntries: 0,
    liveAffinityEntries: 0,
    ...overrides,
  };
}

function roster(worldTick: number, mages: readonly number[], nodes: readonly number[]): RosterSample {
  return {
    worldTick,
    livingMagesBySpecies: mages,
    populationBySpecies: mages.map((count) => count * 100),
    nodesHeldBySpecies: nodes,
  };
}

describe('speciesGridVersatility', () => {
  it('reports no-observations, not a zero, when the executor supplied no sample', () => {
    const entry = collectSpeciesGridVersatility(telemetry());
    expect(entry.status).toBe('unavailable');
    expect(entry).toMatchObject({ reason: UNAVAILABLE_REASON.noObservations });
  });

  it('never reports mechanic-absent — species traits and the grid have both shipped', () => {
    const entry = collectSpeciesGridVersatility(telemetry());
    expect(entry).not.toMatchObject({ reason: UNAVAILABLE_REASON.mechanicAbsent });
  });

  it('scores the highest per-species coverage, not the mean', () => {
    const entry = collectSpeciesGridVersatility(
      telemetry({
        speciesVersatility: {
          gridCells: 70,
          enabledCells: 12,
          species: [
            reach({ speciesId: 'orc', staffableCells: 7 }),
            reach({ speciesId: 'draconic', staffableCells: 63 }),
          ],
        },
      }),
    );
    // A mean would be 0.5 and would report the pair as unremarkable. The
    // failure mode is the one species that can do everything.
    expect(entry).toMatchObject({ status: 'measured', value: 0.9 });
  });

  it('flags a hegemon at the pinned fraction even when its depth reach is the worst', () => {
    const entry = collectSpeciesGridVersatility(
      telemetry({
        speciesVersatility: {
          gridCells: 70,
          enabledCells: 12,
          species: [
            // Orc's real shape: the whole grid staffable, almost none of it exhaustible.
            reach({ speciesId: 'orc', depthCeiling: 3, staffableCells: 70, exhaustibleCells: 2 }),
          ],
        },
      }),
    );
    expect(entry.status).toBe('measured');
    const detail = (entry as { detail: Record<string, unknown> }).detail;
    expect(detail['hegemons']).toEqual(['orc']);
    expect(detail['hegemonyFraction']).toBe(VERSATILITY_HEGEMONY_FRACTION);
  });

  it('carries the depth vector alongside, so breadth and depth can be read against each other', () => {
    const entry = collectSpeciesGridVersatility(
      telemetry({
        speciesVersatility: {
          gridCells: 70,
          enabledCells: 12,
          species: [reach({ speciesId: 'orc', staffableCells: 70, exhaustibleCells: 2 })],
        },
      }),
    );
    const species = (entry as unknown as { detail: { species: Record<string, unknown>[] } }).detail.species;
    expect(species[0]).toMatchObject({ staffableFraction: 1, exhaustibleFraction: 2 / 70 });
  });
});

describe('lossShockRecovery', () => {
  const speciesIds = ['human', 'draconic'];

  it('reports no-observations on an unshocked run rather than an instant recovery', () => {
    const entry = collectLossShockRecovery(telemetry({ speciesIds }));
    expect(entry.status).toBe('unavailable');
    expect(entry).toMatchObject({ reason: UNAVAILABLE_REASON.noObservations });
    // The trap this exists to avoid: 0 would read as "recovered immediately".
    expect(entry).not.toMatchObject({ status: 'measured', value: 0 });
  });

  it('measures the slowest recovering species, not the average', () => {
    const entry = collectLossShockRecovery(
      telemetry({
        speciesIds,
        ticksRun: 400,
        lossShock: {
          shockTick: 100,
          shockFractionFp: 512,
          preShockBySpecies: [10, 10],
          postShockBySpecies: [5, 5],
          preShockNodesBySpecies: [8, 8],
          samples: [
            roster(100, [5, 5], [4, 4]),
            roster(150, [10, 6], [8, 5]),
            roster(300, [10, 10], [8, 6]),
          ],
        },
      }),
    );
    // human back at 100 + 50; draconic not until 100 + 200. The maximum is the
    // one that says whether a loss compounds across an era.
    expect(entry).toMatchObject({ status: 'measured', value: 200 });
  });

  it('right-censors a species that never returned, and names it', () => {
    const entry = collectLossShockRecovery(
      telemetry({
        speciesIds,
        ticksRun: 300,
        lossShock: {
          shockTick: 100,
          shockFractionFp: 512,
          preShockBySpecies: [0, 10],
          postShockBySpecies: [0, 5],
          preShockNodesBySpecies: [0, 8],
          samples: [roster(100, [0, 5], [0, 4]), roster(300, [0, 6], [0, 5])],
        },
      }),
    );
    expect(entry).toMatchObject({ status: 'unavailable', reason: UNAVAILABLE_REASON.censored });
    expect((entry as { detail: Record<string, unknown> }).detail['censoredSpecies']).toEqual([
      'draconic',
    ]);
  });

  it('reports knowledge that did not come back with the dead, beside the headcount', () => {
    const entry = collectLossShockRecovery(
      telemetry({
        speciesIds,
        ticksRun: 400,
        lossShock: {
          shockTick: 100,
          shockFractionFp: 512,
          preShockBySpecies: [10, 10],
          postShockBySpecies: [5, 5],
          preShockNodesBySpecies: [8, 8],
          samples: [roster(100, [5, 5], [4, 4]), roster(200, [10, 10], [8, 3])],
        },
      }),
    );
    const species = (entry as unknown as { detail: { species: Record<string, unknown>[] } }).detail.species;
    // Both rosters returned; draconic's knowledge did not. A headcount series
    // alone would have reported a full recovery.
    expect(species[0]).toMatchObject({ nodesNotRecovered: 0 });
    expect(species[1]).toMatchObject({ nodesNotRecovered: 5 });
  });
});

describe('roleAssignmentDemographicCost', () => {
  const speciesIds = ['human', 'draconic'];
  const withRaids = { ...MECHANICS_AT_0_5_0, raidEngagement: true };

  it('reports mechanic-absent when the build has no raids — the price is undefined, not zero', () => {
    const entry = collectRoleAssignmentDemographicCost(telemetry({ speciesIds }));
    expect(entry).toMatchObject({
      status: 'unavailable',
      reason: UNAVAILABLE_REASON.mechanicAbsent,
    });
  });

  it('reports no-observations when raids exist but nothing was assigned', () => {
    const entry = collectRoleAssignmentDemographicCost(
      telemetry({
        speciesIds,
        mechanics: withRaids,
        roleDemography: {
          assignmentsByRoleId: {},
          roleAttributedDeathsBySpecies: [0, 0],
          finalShareFpBySpecies: [512, 512],
          controlFinalShareFpBySpecies: [512, 512],
          samples: [],
        },
      }),
    );
    expect(entry).toMatchObject({
      status: 'unavailable',
      reason: UNAVAILABLE_REASON.noObservations,
    });
  });

  it('measures zero only when roles were assigned and the share did not move', () => {
    const entry = collectRoleAssignmentDemographicCost(
      telemetry({
        speciesIds,
        mechanics: withRaids,
        roleDemography: {
          assignmentsByRoleId: { '3': 4 },
          roleAttributedDeathsBySpecies: [0, 0],
          finalShareFpBySpecies: [512, 512],
          controlFinalShareFpBySpecies: [512, 512],
          samples: [],
        },
      }),
    );
    // This is the finding "assignRole is free", and it is a measurement — which
    // is exactly why it must not share a representation with the two absences.
    expect(entry).toMatchObject({ status: 'measured', value: 0 });
  });

  it('measures the largest fall against the paired control', () => {
    const entry = collectRoleAssignmentDemographicCost(
      telemetry({
        speciesIds,
        mechanics: withRaids,
        roleDemography: {
          assignmentsByRoleId: { '3': 12 },
          roleAttributedDeathsBySpecies: [1, 9],
          finalShareFpBySpecies: [700, 324],
          controlFinalShareFpBySpecies: [512, 512],
          samples: [],
        },
      }),
    );
    expect(entry).toMatchObject({ status: 'measured', value: 188 });
  });
});
