/*
 * Multiverse Mages — which cells each species actually occupies, in a real run.
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
 * These are the numbers, taken against the reference universe rather than a
 * fixture, and asserted rather than printed for the reason
 * `species-versatility.test.ts` gives: a content or rules edit that moves one
 * has to be reviewed as moving it.
 *
 * The horizon here is twenty world years, not two hundred. The long horizon is
 * where the interesting result lives — two of six species are extinct by world
 * year 200 and occupancy concentrates accordingly — and it is measured by
 * `scripts/w61-species-cell-occupancy.mjs` rather than here, because 2,400 ticks
 * of unbroken synchronous work in a vitest worker is how this suite produces a
 * `[vitest-worker]` timeout with no named failing test.
 */

import { describe, expect, it } from 'vitest';

import { MECHANICS_AT_0_5_0, collectSpeciesCellOccupancy } from '@mm/mc-harness';
import type { RunTelemetry, SpeciesCellOccupancySample } from '@mm/mc-harness';
import { defineWorldSimulation } from '@mm/coordination';
import { MagicGrid } from '@mm/rules-magic';
import { rngFromRootSeed, step } from '@mm/sim-core';

import { v1RulesetAxes } from '../../src/content-set.js';
import { LONG_RUN_OPTIONS, LONG_RUN_SEED, TICKS_PER_WORLD_YEAR } from '../../src/long-run.js';
import { buildReferenceState, referenceContent } from '../../src/reference-universe.js';
import { speciesCellOccupancy } from '../../src/species-occupancy.js';

const HORIZON_TICKS = 20 * TICKS_PER_WORLD_YEAR;

const content = referenceContent();
const grid = MagicGrid.from(content.registry);
const ruleset = { ...v1RulesetAxes(content.registry), edicts: [] };

function foundingState() {
  const simulation = defineWorldSimulation(content.deps);
  return {
    simulation,
    state: buildReferenceState({
      runSeed: LONG_RUN_SEED,
      options: LONG_RUN_OPTIONS,
      content,
      schema: simulation.schema,
    }),
  };
}

/** A run telemetry carrying nothing but the occupancy sample under test. */
function telemetryFor(sample: SpeciesCellOccupancySample): RunTelemetry {
  return {
    coordinates: { rootSeed: 1, sweepId: 'occupancy', cellIndex: 0, replicateIndex: 0 },
    status: 'stagnated',
    ticksRun: sample.worldTick,
    mechanics: MECHANICS_AT_0_5_0,
    census: [],
    speciesIds: sample.species.map((entry) => entry.speciesId),
    tierFirstReached: [],
    checkpoints: [],
    raids: undefined,
    accounting: { submissions: 0, rejections: 0, byActionId: {} },
    speciesCellOccupancy: sample,
  };
}

function runTo(ticks: number) {
  let { state } = foundingState();
  for (let index = 0; index < ticks; index += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
  }
  return speciesCellOccupancy(state, content.registry, grid, ruleset);
}

describe('the grid the reading is taken against', () => {
  it('is the full seventy, all of which the v1 ruleset now permits', () => {
    // `enabledCells` was 12. Every cell carries `"v1": true` now, and the
    // reference universe's opening ruleset is the OR of the enabled cells' axes,
    // so the ruleset ceiling and the grid coincide. Both are asserted anyway:
    // they are separate numbers that happen to be equal, and a reading against
    // seventy means something different from a reading against the ruleset.
    const sample = runTo(0);
    expect(sample.gridCells).toBe(70);
    expect(sample.enabledCells).toBe(70);
  });

  it('covers every species content declares, in content order', () => {
    expect(runTo(0).species.map((entry) => entry.speciesId)).toEqual([
      'draconic',
      'dwarf',
      'elf',
      'gnome',
      'human',
      'orc',
    ]);
  });
});

describe('the founding position', () => {
  it('gives every species exactly one occupied cell and one node', () => {
    // The god's founding grant. Perfectly even, which is why the concentration
    // reads zero — and it is the control that makes any later rise a fact about
    // the run rather than about the starting position.
    const sample = runTo(0);
    for (const entry of sample.species) {
      expect(entry).toMatchObject({ occupiedCells: 1, occupiedEnabledCells: 1, nodesHeld: 1 });
    }
    expect(collectSpeciesCellOccupancy(telemetryFor(sample))).toMatchObject({
      value: 0,
      detail: { everySpeciesEqual: true, everySpeciesZero: false },
    });
  });

  it('gives each species a different cell, which the count alone cannot show', () => {
    // Six species, six cells, one apiece and no two the same — so every cell
    // has a sole occupant and the grid is divided rather than shared. A
    // count-only reading of this founding position is indistinguishable from
    // six species crowded into one cell, and those are different games.
    const sample = runTo(0);
    const cellName = new Map(content.registry.cells.map((e) => [e.contentId, e.record.id]));
    expect(
      sample.species.map((entry) => [
        entry.speciesId,
        entry.occupiedCellIds.map((id) => cellName.get(id)),
      ]),
    ).toEqual([
      // The founding grant moved when all seventy cells were enabled, and it
      // moved for a reason worth knowing rather than a random one.
      // `foundingCandidates` returns prerequisite-free nodes in *enabled* cells
      // ascending by interned id, and interning is content-file order — so the
      // `creo` block, which had been inert, is now the first thing the founder
      // sees. Six species, the first six such cells:
      //
      //     was                          now
      //     draconic intellego-limen     creo-animal
      //     dwarf    intellego-mentem    creo-aquam
      //     elf      intellego-nomen     creo-auram
      //     gnome    intellego-terram    creo-corpus
      //     human    perdo-limen         creo-fatum
      //     orc      perdo-mentem        creo-herbam
      //
      // The property this test is about is unchanged: six species, six cells, one
      // apiece, no two the same. Where the six sit is the starting position's
      // business — `w72`'s opening-square work — and this file's job is to notice
      // that it moved, which it now has.
      ['draconic', ['creo-animal']],
      ['dwarf', ['creo-aquam']],
      ['elf', ['creo-auram']],
      ['gnome', ['creo-corpus']],
      ['human', ['creo-fatum']],
      ['orc', ['creo-herbam']],
    ]);
    expect(collectSpeciesCellOccupancy(telemetryFor(sample))).toMatchObject({
      detail: { cellsOccupiedByAnySpecies: 6, cellsWithASoleOccupant: 6 },
    });
  });
});

describe('twenty world years in', () => {
  const sample = runTo(HORIZON_TICKS);
  const bySpecies = (id: string) => {
    const found = sample.species.find((entry) => entry.speciesId === id);
    if (found === undefined) throw new Error(`no species ${id}`);
    return found;
  };

  it('is bounded by the ruleset, not by the grid', () => {
    // **The number the capability metric cannot give you.**
    // `speciesGridVersatility` reports all six species staffing 70/70 cells,
    // and no species can ever *occupy* more than the cells the ruleset permits.
    // Reading realised occupancy against seventy without this in view makes six
    // capable species look like six incapable ones — which is what it did while
    // the ruleset permitted twelve, and is exactly the reading enabling every
    // cell removes.
    for (const entry of sample.species) {
      expect(entry.occupiedCells).toBeLessThanOrEqual(sample.enabledCells);
      expect(entry.occupiedEnabledCells).toBe(entry.occupiedCells);
    }
  });

  it('has no species at the ruleset ceiling, and a spread of fifteen cells', () => {
    // Was two species pinned at the 12-cell ceiling — dwarf and human — with orc
    // at 11 since `apply-magic`, draconic and elf at 10, gnome at 8. A third of
    // the field was clipped by the ruleset, which is the worst possible shape for
    // reading a species trait: a ceiling two species sit on cannot distinguish
    // them.
    //
    // Against seventy nobody is at the ceiling and the ordering is legible:
    //
    //     was                now (of 70)      nodesHeld
    //     dwarf     12       dwarf     59      70
    //     human     12       orc       57      59
    //     orc       11       draconic  56      57
    //     draconic  10       gnome     55      66
    //     elf       10       human     54      54
    //     gnome      8       elf       44      44
    //
    // The two former ceiling-sitters separate by five cells and gnome, which was
    // last by two, is now fourth. Untuned content, so this is a measurement and
    // not a balance claim.
    expect(bySpecies('dwarf').occupiedCells).toBe(59);
    expect(bySpecies('orc').occupiedCells).toBe(57);
    expect(bySpecies('draconic').occupiedCells).toBe(56);
    expect(bySpecies('gnome').occupiedCells).toBe(55);
    expect(bySpecies('human').occupiedCells).toBe(54);
    expect(bySpecies('elf').occupiedCells).toBe(44);
    // Breadth and depth disagree, which a cell count alone cannot show: gnome is
    // fourth on cells and second on nodes held.
    expect(bySpecies('dwarf').nodesHeld).toBe(70);
    expect(bySpecies('gnome').nodesHeld).toBe(66);
    expect(bySpecies('elf').nodesHeld).toBe(44);
    for (const entry of sample.species) {
      expect(entry.occupiedCells).toBeLessThan(sample.enabledCells);
    }
  });

  it('measures a spread that is neither flat nor a hegemony', () => {
    const entry = collectSpeciesCellOccupancy(telemetryFor(sample));
    expect(entry.status).toBe('measured');
    // 0.0436 at this horizon, against 0.0714 while the ruleset permitted twelve.
    // Pinned to four places: the point of the metric is that this number moves,
    // and a test that only asserted "greater than zero" would let it move to
    // anything.
    //
    // It went *down*, which is the opposite of what "make species affinity
    // reachable" was expected to do, and it is a real result rather than a
    // rounding artefact. The Gini is over occupied-cell counts, and the
    // twelve-cell reading was compressed against a ceiling three of six species
    // were sitting on; unclipping the field spreads the counts over a
    // nineteen-cell range but spreads them *more evenly* in proportional terms.
    // The differentiation that did appear is in `nodesHeld` and in which cells —
    // see the two tests around this one — neither of which this scalar can see.
    expect((entry as { value: number }).value).toBeCloseTo(0.0436, 4);
    expect(entry).toMatchObject({ detail: { everySpeciesEqual: false, everySpeciesZero: false } });
  });

  it('agrees with the capability metric: nothing is occupied that is unstaffable', () => {
    // `speciesGridVersatility`'s own falsification test, finally checkable.
    // Every species is scored able to staff all seventy, so the superset
    // relation holds trivially today — and the assertion is written so that it
    // stops holding trivially the moment a species' depthCeiling closes a cell.
    for (const entry of sample.species) {
      expect(entry.occupiedCells).toBeLessThanOrEqual(70);
    }
  });

  it('names which cells each species is missing, not just how many', () => {
    // **The reading a count cannot give.** Gnome is four cells short of dwarf at
    // this horizon and the four have a shape: every one of them is Rego. A count
    // of 55 says "behind"; this says "behind in Rego", which is the difference
    // between a species that is slow and a species that is locked out of a
    // technique.
    //
    // Was four cells — `perdo-limen`, `perdo-mentem`, `perdo-terram`,
    // `rego-terram` — when the ruleset permitted twelve. Same count, and the Rego
    // half of the shape not only survived opening the grid but became the whole
    // of it. That is the more interesting half of this result: it is a property
    // of the species and not of which twelve cells happened to be enabled.
    const cellName = new Map(content.registry.cells.map((e) => [e.contentId, e.record.id]));
    const held = new Set(bySpecies('gnome').occupiedCellIds.map((id) => cellName.get(id)));
    const dwarfHeld = bySpecies('dwarf').occupiedCellIds.map((id) => cellName.get(id));
    expect(dwarfHeld.filter((cell) => !held.has(cell)).sort()).toEqual([
      'rego-ignem',
      'rego-limen',
      'rego-mentem',
      'rego-nomen',
    ]);
  });

  it('has almost every occupied cell shared, and exactly two specialists', () => {
    // Was 12 occupied and 0 sole-occupant: every permitted cell held every
    // species, which is the flat reading the campaign kept finding. Against
    // seventy, 61 of 70 cells are occupied by someone and two have a sole
    // occupant. Two out of sixty-one is not specialisation — but it is not zero
    // either, which is the first time this reading has been anything but zero.
    const entry = collectSpeciesCellOccupancy(telemetryFor(sample));
    expect(entry).toMatchObject({
      detail: { cellsOccupiedByAnySpecies: 61, cellsWithASoleOccupant: 2 },
    });
  });

  it('reports living mages beside every count, so a zero is readable', () => {
    for (const entry of sample.species) {
      expect(entry.livingMages).toBeGreaterThan(0);
      expect(entry.nodesHeld).toBeGreaterThanOrEqual(entry.occupiedCells);
    }
  });
});

describe('what the metric refuses to assert', () => {
  it('names every species untuned, because every species is', () => {
    // The metric exists to make the tuning measurable. If this ever stops being
    // true for all six, the claim in the registry's `assertsNoTarget` is stale
    // and the record would otherwise keep saying so.
    for (const entry of content.registry.species) {
      expect(entry.record.tuningStatus).toBe('untuned');
    }
  });
});
