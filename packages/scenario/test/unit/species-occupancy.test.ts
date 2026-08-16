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
  it('is the full seventy, of which the v1 ruleset permits twelve', () => {
    const sample = runTo(0);
    expect(sample.gridCells).toBe(70);
    expect(sample.enabledCells).toBe(12);
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
      ['draconic', ['intellego-limen']],
      ['dwarf', ['intellego-mentem']],
      ['elf', ['intellego-nomen']],
      ['gnome', ['intellego-terram']],
      ['human', ['perdo-limen']],
      ['orc', ['perdo-mentem']],
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
    // and no species can ever *occupy* more than the twelve the v1 ruleset
    // permits. Reading realised occupancy against seventy without this in view
    // makes six capable species look like six incapable ones.
    for (const entry of sample.species) {
      expect(entry.occupiedCells).toBeLessThanOrEqual(sample.enabledCells);
      expect(entry.occupiedEnabledCells).toBe(entry.occupiedCells);
    }
  });

  it('has three species at the ruleset ceiling and three below it', () => {
    // **Re-measured on the merge of `main` (5a1ce6c) into
    // `w108/university-fidelity`, 2026-08-14.** Not inherited from either side:
    // both sides of that merge re-recorded this block for different reasons and
    // *neither side's numbers survived the combination*. `main` had
    // `12/12/11/10/10/8` (dwarf, human, orc, draconic, elf, gnome) and the
    // branch had `12/9/12/10/10/9`; the merged run reads none of those. Taking
    // either hunk verbatim would have pinned a number no build produces.
    //
    // Two causes compose here, and neither is a balance decision:
    //
    // 1. **`apply-magic` (#127).** `speciesTerm` reads `laborAffinity` for that
    //    goal, so species with high labor affinity spend months casting that
    //    they used to spend reaching into another cell. That is the trade the
    //    goal is supposed to create.
    // 2. **The staffing rule this branch wires.** `UNIVERSITY_STAFF` link rows
    //    are entities, and `contracts.md` §6 splits the RNG per entity handle,
    //    so creating them shifts every handle allocated afterwards and re-rolls
    //    every handle-keyed draw in the run. The branch verified this rather
    //    than assuming it: a control build that creates the link rows and keeps
    //    the old global-pool scribing reproduces the branch run byte for byte,
    //    and the reference universe has exactly **one** university, where
    //    owning every scribe cohort and sharing the universe's pool are
    //    arithmetically the same thing — 142 books over 36 ticks on both.
    //
    // The composition is not the sum of the parts, and that is the honest
    // reading of it: orc fell to 11 on `main` under `apply-magic` and is back
    // at 12 here, while draconic and elf each gained a cell they held at 10 on
    // both sides. A re-roll moves things in both directions. What the staffing
    // rule actually *changes* needs more than one university to see, and is
    // measured in `coordination/test/unit/university-staffing.test.ts` — not
    // here.
    // **Re-measured 2026-08-14 on the rebase of `campaign/integrated` onto
    // `main` (245e04f1), and neither side's numbers survived — again.** This
    // block's own history says a re-roll moves things in both directions, and
    // it did: `12/12/12/11/11/9` became `12/12/11/9/11/9`. Orc lost one and
    // draconic lost two.
    //
    // The cause is the same class the comment above names and is not a balance
    // decision. `contracts.md` §6 splits the RNG per entity handle, so any
    // change that allocates a handle earlier re-rolls every handle-keyed draw
    // after it. This tree adds entity-allocating work on both sides of that
    // line: the campaign's knowledge-vitality wire, and `main`'s own merges.
    // Taking either hunk verbatim would pin a number no build produces, which
    // is exactly what the conflict resolution had to avoid.
    //
    // **Re-measured 2026-08-16 on `w247/material-engine-build`'s
    // `material-economy` work, and it moved again — this time for a reason
    // rather than for a re-roll.** `12/12/11/9/11/9` became the six values
    // below. Two of the shipped opening square's four forms — Mentem and Limen
    // — carry a `resource-yield` node for the first time, so `GOAL.applyMagic`
    // is a live choice inside the opening rectangle and mages spend months
    // casting that they used to spend researching. Applied magic took 1,261
    // mage-months over 240 ticks against a control's 1,016.
    //
    // A month at the field is a month not at the bench, so a species that takes
    // to the new verb loses occupancy — *how many distinct cells it has anybody
    // in* — and one that does not gains it, because the frontier it is racing
    // for is less crowded. Orc falls five and draconic gains three, which is the
    // trade the change exists to create rather than a regression. The values are
    // pinned so the next person who moves them has to say why too.
    //
    // Asserted as one object rather than six statements, because the failure a
    // reader needs is *which* species moved and by how much, and six separate
    // `toBe`s report the first one and stop.
    expect({
      dwarf: bySpecies('dwarf').occupiedCells,
      human: bySpecies('human').occupiedCells,
      orc: bySpecies('orc').occupiedCells,
      draconic: bySpecies('draconic').occupiedCells,
      elf: bySpecies('elf').occupiedCells,
      gnome: bySpecies('gnome').occupiedCells,
    }).toEqual({ dwarf: 12, human: 12, orc: 6, draconic: 12, elf: 11, gnome: 9 });
  });

  it('measures a spread that is neither flat nor a hegemony', () => {
    const entry = collectSpeciesCellOccupancy(telemetryFor(sample));
    expect(entry.status).toBe('measured');
    // 0.1075 at this horizon, re-measured 2026-08-16 with `material-economy`'s
    // faucets live — was 0.0625 immediately before, and 0.0473, 0.0729, 0.0714
    // and 0.0645 at the four readings before that. The concentration **rose**,
    // which is the same finding the cell counts above carry from the other
    // side: orc fell from eleven occupied cells to six, so the spread across
    // species widened. Pinned to four places: the point of the metric is that
    // this number moves, and a test that only asserted "greater than zero"
    // would let it move to anything.
    expect((entry as { value: number }).value).toBeCloseTo(0.1075, 4);
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
    // **The reading a count cannot give.** Gnome is three cells short at this
    // horizon and the three have a shape: two of the three are Perdo. A count of
    // 9 says "behind"; this says "mostly behind in Perdo", which is the
    // difference between a species that is slow and a species that is locked out
    // of a technique.
    //
    // **Re-derived on the merge described above, 2026-08-14, and the branch's
    // claim about it did not survive.** The branch recorded
    // `perdo-limen/mentem/terram` and argued the shape had got *cleaner* —
    // `rego-terram` having dropped out — and called that "the strongest evidence
    // yet that it is about Perdo and not about the seed". The merged run reads
    // `perdo-mentem`, `perdo-terram`, `rego-terram`: gnome picked up Perdo Limen
    // and lost Rego Terram again. So the shortfall is three cells of which two
    // are Perdo, on both `main`'s numbers and these, but *which* three is not
    // stable across a re-roll.
    //
    // That is worth stating rather than quietly re-pinning, because it is
    // evidence against the branch's own argument: a set that reorders under a
    // pure re-roll of handle-keyed draws is partly a seed artifact. The durable
    // reading is "gnome is short, and disproportionately short in Perdo"; the
    // exact membership is a pin, not a finding, and the next agent to see it
    // move should not read the movement as a defect.
    const cellName = new Map(content.registry.cells.map((e) => [e.contentId, e.record.id]));
    const held = new Set(bySpecies('gnome').occupiedCellIds.map((id) => cellName.get(id)));
    const dwarfHeld = bySpecies('dwarf').occupiedCellIds.map((id) => cellName.get(id));
    // Re-pinned 2026-08-14 on the rebase onto `main` (245e04f1): `rego-terram`
    // out, `perdo-limen` in. Which is precisely what the paragraph above says
    // to expect — the set reorders under a handle-keyed re-roll, the durable
    // reading is *"gnome is short, and disproportionately short in Perdo"*, and
    // that reading is unchanged: all three are still Perdo but one.
    expect(dwarfHeld.filter((cell) => !held.has(cell)).sort()).toEqual([
      'perdo-limen',
      'perdo-mentem',
      'perdo-terram',
    ]);
  });

  it('has every occupied cell shared, so the concentration is not specialisation', () => {
    const entry = collectSpeciesCellOccupancy(telemetryFor(sample));
    expect(entry).toMatchObject({
      detail: { cellsOccupiedByAnySpecies: 12, cellsWithASoleOccupant: 0 },
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
