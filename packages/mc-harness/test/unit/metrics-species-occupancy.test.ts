/*
 * Multiverse Mages — realised species cell occupancy, and the absences it must
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
  OCCUPANCY_DEFINITION,
  collectSpeciesCellOccupancy,
} from '../../src/metrics-species-health.js';
import { UNAVAILABLE_REASON } from '../../src/metrics.js';
import type { SpeciesCellOccupancy } from '../../src/metrics-telemetry.js';
import { BALANCE_METRIC_REGISTRY } from '../../src/metrics-registry.js';
import { telemetry } from './metrics-fixtures.js';

/**
 * One species' occupancy, with the cell ids defaulted to the *first* `n` cells
 * so that a fixture written in terms of counts stays self-consistent.
 *
 * Defaulting to a shared prefix rather than to disjoint ranges is deliberate:
 * it makes the fixtures below maximally overlapping, so a `soleOccupantCells`
 * assertion has to be set up on purpose and cannot pass by accident.
 */
function occupancy(
  overrides: Partial<SpeciesCellOccupancy> & { speciesId: string },
): SpeciesCellOccupancy {
  const occupiedCells = overrides.occupiedCells ?? 12;
  return {
    occupiedCells,
    occupiedEnabledCells: 12,
    livingMages: 8,
    nodesHeld: 40,
    occupiedCellIds: Array.from({ length: occupiedCells }, (_, index) => index + 1),
    ...overrides,
  };
}

function sample(species: readonly SpeciesCellOccupancy[], enabledCells = 12) {
  return { gridCells: 70, enabledCells, worldTick: 2400, species };
}

describe('speciesCellOccupancy', () => {
  it('reports no-observations, not a zero, when the executor supplied no sample', () => {
    const entry = collectSpeciesCellOccupancy(telemetry());
    expect(entry.status).toBe('unavailable');
    expect(entry).toMatchObject({ reason: UNAVAILABLE_REASON.noObservations });
  });

  it('never reports mechanic-absent — species and the grid have both shipped', () => {
    expect(collectSpeciesCellOccupancy(telemetry())).not.toMatchObject({
      reason: UNAVAILABLE_REASON.mechanicAbsent,
    });
  });

  it('reports no-observations when the sample declares no species', () => {
    const entry = collectSpeciesCellOccupancy(
      telemetry({ speciesCellOccupancy: sample([]) }),
    );
    expect(entry).toMatchObject({ reason: UNAVAILABLE_REASON.noObservations });
  });

  it('measures a zero rather than reporting an absence when nobody holds anything', () => {
    // The trap this module's opening note names. A world in which no mage holds
    // a node is a real and alarming observation; reporting it as "no sample"
    // would make the alarming case indistinguishable from an unwired executor.
    const entry = collectSpeciesCellOccupancy(
      telemetry({
        speciesCellOccupancy: sample([
          occupancy({ speciesId: 'human', occupiedCells: 0, occupiedEnabledCells: 0, nodesHeld: 0 }),
          occupancy({ speciesId: 'orc', occupiedCells: 0, occupiedEnabledCells: 0, nodesHeld: 0 }),
        ]),
      }),
    );
    expect(entry.status).toBe('measured');
    expect(entry).toMatchObject({ value: 0 });
    expect(entry).toMatchObject({ detail: { everySpeciesZero: true, everySpeciesEqual: true } });
  });

  it('reads 0 when every species occupies the same number of cells', () => {
    const entry = collectSpeciesCellOccupancy(
      telemetry({
        speciesCellOccupancy: sample([
          occupancy({ speciesId: 'human' }),
          occupancy({ speciesId: 'orc' }),
          occupancy({ speciesId: 'gnome' }),
        ]),
      }),
    );
    // Zero is the *healthy* end of this scale, which is worth an assertion
    // rather than a comment: a reader who takes 0 for a null result has the
    // direction backwards.
    expect(entry).toMatchObject({ value: 0, detail: { everySpeciesEqual: true } });
  });

  it('rises as occupancy collapses onto one species', () => {
    const even = collectSpeciesCellOccupancy(
      telemetry({
        speciesCellOccupancy: sample([
          occupancy({ speciesId: 'human', occupiedCells: 10 }),
          occupancy({ speciesId: 'orc', occupiedCells: 10 }),
          occupancy({ speciesId: 'gnome', occupiedCells: 10 }),
        ]),
      }),
    );
    const hegemony = collectSpeciesCellOccupancy(
      telemetry({
        speciesCellOccupancy: sample([
          occupancy({ speciesId: 'human', occupiedCells: 30 }),
          occupancy({ speciesId: 'orc', occupiedCells: 0 }),
          occupancy({ speciesId: 'gnome', occupiedCells: 0 }),
        ]),
      }),
    );
    expect(even.status).toBe('measured');
    expect(hegemony.status).toBe('measured');
    expect((hegemony as { value: number }).value).toBeGreaterThan(
      (even as { value: number }).value,
    );
    expect(hegemony).toMatchObject({
      detail: { maxOccupiedSpecies: 'human', minOccupiedCells: 0 },
    });
  });

  it('reads the enabled fraction against the ruleset, not against a hardcoded twelve', () => {
    const entry = collectSpeciesCellOccupancy(
      telemetry({
        speciesCellOccupancy: sample(
          [occupancy({ speciesId: 'human', occupiedCells: 5, occupiedEnabledCells: 5 })],
          10,
        ),
      }),
    );
    expect(entry).toMatchObject({
      detail: {
        enabledCells: 10,
        species: [{ speciesId: 'human', occupiedEnabledFraction: 0.5, occupiedFraction: 5 / 70 }],
      },
    });
  });

  it('carries living mages, so a zero can be read as "none alive"', () => {
    const entry = collectSpeciesCellOccupancy(
      telemetry({
        speciesCellOccupancy: sample([
          occupancy({ speciesId: 'human', occupiedCells: 12, livingMages: 8 }),
          occupancy({ speciesId: 'draconic', occupiedCells: 0, occupiedEnabledCells: 0, livingMages: 0, nodesHeld: 0 }),
        ]),
      }),
    );
    expect(entry).toMatchObject({
      detail: {
        species: [
          { speciesId: 'human', livingMages: 8 },
          { speciesId: 'draconic', livingMages: 0, occupiedCells: 0 },
        ],
      },
    });
  });

  it('separates a roster that specialises from a roster that collapses', () => {
    // Both of these raise concentration and they are different diseases. The
    // scalar cannot tell them apart, which is why the cell ids are carried:
    // three species holding four disjoint cells each is a division of labour,
    // and one species holding twelve while two hold none is a collapse.
    const specialised = collectSpeciesCellOccupancy(
      telemetry({
        speciesCellOccupancy: sample([
          occupancy({ speciesId: 'human', occupiedCells: 4, occupiedCellIds: [1, 2, 3, 4] }),
          occupancy({ speciesId: 'orc', occupiedCells: 4, occupiedCellIds: [5, 6, 7, 8] }),
          occupancy({ speciesId: 'gnome', occupiedCells: 4, occupiedCellIds: [9, 10, 11, 12] }),
        ]),
      }),
    );
    expect(specialised).toMatchObject({
      value: 0,
      detail: { cellsOccupiedByAnySpecies: 12, cellsWithASoleOccupant: 12 },
    });
    expect(specialised).toMatchObject({
      detail: { species: [{ soleOccupantCells: 4 }, { soleOccupantCells: 4 }, { soleOccupantCells: 4 }] },
    });

    const shared = collectSpeciesCellOccupancy(
      telemetry({
        speciesCellOccupancy: sample([
          occupancy({ speciesId: 'human', occupiedCells: 4, occupiedCellIds: [1, 2, 3, 4] }),
          occupancy({ speciesId: 'orc', occupiedCells: 4, occupiedCellIds: [1, 2, 3, 4] }),
          occupancy({ speciesId: 'gnome', occupiedCells: 4, occupiedCellIds: [1, 2, 3, 4] }),
        ]),
      }),
    );
    // Same counts, same Gini, completely different world.
    expect(shared).toMatchObject({
      value: 0,
      detail: { cellsOccupiedByAnySpecies: 4, cellsWithASoleOccupant: 0 },
    });
  });

  it('carries the cell ids ascending, so a record does not depend on entity order', () => {
    const entry = collectSpeciesCellOccupancy(
      telemetry({
        speciesCellOccupancy: sample([
          occupancy({ speciesId: 'human', occupiedCells: 3, occupiedCellIds: [2, 9, 40] }),
        ]),
      }),
    );
    expect(entry).toMatchObject({
      detail: { species: [{ speciesId: 'human', occupiedCellIds: [2, 9, 40] }] },
    });
  });

  it('is registered per-run, with the occupancy rule pinned into the definition', () => {
    const definition = BALANCE_METRIC_REGISTRY.balance('speciesCellOccupancy');
    expect(definition).toBeDefined();
    expect(definition?.pinnedConstants).toMatchObject({
      occupancyRule: OCCUPANCY_DEFINITION,
      livingOnly: true,
      locationKinds: 'mind only; library and grimoire copies are excluded',
    });
    // It states no balance target, and the pinned constants say so in the
    // record rather than only in a doc comment.
    expect(String(definition?.pinnedConstants?.assertsNoTarget)).toContain('untuned');
    expect(definition?.disprovedBy).toContain('speciesGridVersatility');
  });
});
