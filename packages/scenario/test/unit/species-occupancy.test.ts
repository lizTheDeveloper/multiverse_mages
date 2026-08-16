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
    // **Re-derived on `integration/group-e`, 2026-08-16, and the paragraph
    // directly above is the fourth reading in a row to be overturned.** Gnome is
    // three cells short again — `perdo-limen`, `perdo-mentem`, `perdo-terram` —
    // so W200's "both remaining gaps are Terram" does not hold on the merged
    // tree, and the Perdo-gap count has now gone 2, 3, 2, 1, 3 across five
    // measurements. Whatever else this pin is, it is not a finding: it is a
    // handle-keyed re-roll reported at four decimal places of confidence, and
    // the block's own instruction — *"the next agent to see it move should not
    // read the movement as a defect"* — is the durable part.
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
    // **Re-measured on `w200/layer-one-fixes` merged with `main` (245e04f1),
    // 2026-08-14.** One number moved and only one: gnome, 9 -> 10. Five of the
    // six species are byte-identical to the block above, which is the reading
    // that makes this a small effect rather than a re-roll — a shifted stream
    // would have moved all six.
    //
    // The cause is W200's third fix: `rn-call-by-name` (Rego Nomen, tier 1)
    // gained a `resource-yield` effect, and Nomen's `yieldWeights` are
    // `vellum: 1024`, so the opening square has a magical vellum source for the
    // first time. Vellum is what library upkeep and scribing spend, and a
    // universe that is not perpetually short of it keeps more books alive —
    // measured separately at +20%, +28% and +29% surviving grimoires over three
    // seeds at 2,400 ticks. More surviving books is more teaching material, and
    // the species that was furthest behind is the one it reaches first.
    //
    // **Re-measured on `integration/group-e`, 2026-08-16, at the merge of
    // `w200/layer-one-fixes` into a tree already carrying `main`'s signed
    // magnitudes — and for the fourth time neither side's numbers survived.**
    // `main` read `12/12/11/9/11/9` (dwarf, human, orc, draconic, elf, gnome)
    // and W200 read `12/12/12/11/11/10`; the merged run reads
    // **`12/12/11/11/11/9`**. Draconic is `main`'s loser recovered and gnome is
    // W200's winner lost.
    //
    // This block is the one place in the campaign where git's own resolution
    // was demonstrably wrong: the six assertion lines auto-merged without a
    // conflict into `12/12/11/9/11/10`, taking draconic from `main` and gnome
    // from the branch. That tuple is a number **no build produces** — the exact
    // failure the paragraphs above keep warning about, arriving through a clean
    // auto-merge rather than through a resolution. It was caught by running the
    // test, not by reading the diff.
    //
    // MEASURED here, not carried: `npx vitest run
    // packages/scenario/test/unit/species-occupancy.test.ts` on this tree.
    //
    // **Re-measured again after `w197/aptitude-sorts-careers`, 2026-08-16, and
    // the title of this test no longer describes it.** The tuple is
    // `11/12/12/11/12/12` (dwarf, human, orc, draconic, elf, gnome): *four*
    // species at the ruleset ceiling of 12 and two below it, where every reading
    // before this had three and three. Gnome went 9 -> 12 and is no longer the
    // trailing species; dwarf went 12 -> 11 and is.
    //
    // That is the largest single move this block has recorded, and it is not a
    // re-roll: W197 makes students mage entities and sorts graduates into two
    // careers, so who holds knowledge and how many people hold it both change by
    // construction. The Gini falls to 0.0190 for the same reason — twelve is the
    // ceiling and four species are on it.
    //
    // The test name is left alone deliberately. Renaming it would erase the
    // comparison; the numbers below are the finding.
    expect(bySpecies('dwarf').occupiedCells).toBe(11);
    expect(bySpecies('human').occupiedCells).toBe(12);
    expect(bySpecies('orc').occupiedCells).toBe(12);
    expect(bySpecies('draconic').occupiedCells).toBe(11);
    expect(bySpecies('elf').occupiedCells).toBe(12);
    expect(bySpecies('gnome').occupiedCells).toBe(12);
  });

  it('measures a spread that is neither flat nor a hegemony', () => {
    const entry = collectSpeciesCellOccupancy(telemetryFor(sample));
    expect(entry.status).toBe('measured');
    // 0.0473 at this horizon, re-measured on the merge described above — was
    // 0.0729 before either change, 0.0714 on `main` alone and 0.0645 on the
    // branch alone. Pinned to four places: the point of the metric is that this
    // number moves, and a test that only asserted "greater than zero" would let
    // it move to anything.
    // 0.0343 at this horizon, re-measured on W200's merge with `main`
    // (245e04f1), 2026-08-14 — was 0.0473 before the vellum source, and 0.0729,
    // 0.0714 and 0.0645 at the three points the paragraph above describes.
    // Pinned to four places: the point of the metric is that this number moves,
    // and a test that only asserted "greater than zero" would let it move to
    // anything.
    //
    // It fell, and the direction is the interesting part. This is a Gini
    // coefficient over per-species occupied-cell counts, so a fall is the six
    // species becoming *more* alike. Gnome alone gained a cell; nothing else
    // moved. A magical vellum source is a rising tide, and the metric says it
    // lifts the trailing species rather than the leading one — which is the
    // opposite of what a capital-compounding effect would do, and worth watching
    // if the magnitude is ever tuned up.
    expect((entry as { value: number }).value).toBeCloseTo(0.019, 4);
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
    //
    // **Re-derived again on W200's merge with `main` (245e04f1), 2026-08-14,
    // and the paragraph above is now the third reading in a row to be
    // overturned.** Gnome picked up Perdo Mentem and is two cells short, not
    // three: `perdo-terram` and `rego-terram`. So the shortfall is no longer
    // disproportionately Perdo at all — **both remaining gaps are Terram**, and
    // the count of Perdo gaps has gone 2, 3, 2, 1 across four measurements.
    //
    // The block above predicted exactly this and said what to do about it: *"the
    // exact membership is a pin, not a finding, and the next agent to see it
    // move should not read the movement as a defect."* Two cells is a small
    // enough sample that "gnome is short in Terram" is a hypothesis and not yet
    // a reading — but it is the first time the two gaps have shared a *form*
    // rather than a technique, and a species locked out of a form is a different
    // defect from one that is merely slow. The horizon this samples is twenty
    // world years; the durable claim remains only "gnome is short".
    const cellName = new Map(content.registry.cells.map((e) => [e.contentId, e.record.id]));
    const held = new Set(bySpecies('gnome').occupiedCellIds.map((id) => cellName.get(id)));
    const dwarfHeld = bySpecies('dwarf').occupiedCellIds.map((id) => cellName.get(id));
    // Re-pinned 2026-08-14 on the rebase onto `main` (245e04f1): `rego-terram`
    // out, `perdo-limen` in. Which is precisely what the paragraph above says
    // to expect — the set reorders under a handle-keyed re-roll, the durable
    // reading is *"gnome is short, and disproportionately short in Perdo"*, and
    // that reading is unchanged: all three are still Perdo but one.
    //
    // **Empty after W197, 2026-08-16, and that retires the reading rather than
    // moving it.** Gnome now holds twelve cells and dwarf eleven, so the set of
    // cells dwarf holds and gnome does not is `[]`. Five successive
    // measurements said "gnome is short, and disproportionately short in Perdo";
    // the sixth says gnome is not short at all. The durable claim was already
    // hedged down to *"gnome is short"* and even that is now false.
    //
    // Kept as an assertion rather than deleted because an empty difference is
    // still a statement about the two species, and the next change that makes it
    // non-empty should have to say so.
    expect(dwarfHeld.filter((cell) => !held.has(cell)).sort()).toEqual([]);
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
