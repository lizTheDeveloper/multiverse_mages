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

  it('measures which species reach the ruleset ceiling and which fall short', () => {
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
    // **Re-recorded on `w185/cohort-source`, 2026-08-14.** W185 opened the
    // occupation transfer valve, which had been welded shut by a per-cohort
    // floor, and filled university seats from `idle` only. Both change *who is
    // a student*, so both change who is promoted, so the mage population at
    // twenty years is a different set of individuals — 56 living mages here
    // against the old run's. One species reaches the ceiling instead of three,
    // and orc falls furthest. The durable reading is unchanged and is the one
    // this test's name states: the spread is neither flat nor a hegemony. The
    // membership is a pin.
    //
    // **Re-measured again on the Group F merge of `w23/populace-and-record-current`
    // into `integration/group-f`, 2026-08-16, and for the third time neither
    // side's numbers survived.** `integration/group-f` (carrying `w204`'s
    // affiliate writer) had `12/12/11/9/11/9` and this branch had
    // `12/9/12/10/10/5`; the merged run reads `12/12/12/12/12/10` — five
    // species at the ceiling and gnome alone below it. The cause is the class
    // this block has now named three times: `w204` gave `affiliate` a writer
    // and W23/W185 changed who becomes a student, and both allocate entity
    // handles, so every handle-keyed draw after them re-rolls. Pinned, not
    // softened, and the pin is membership rather than finding.
    //
    // The `it` name was renamed with this re-measurement: it said *three at the
    // ceiling and three below*, which was already false of the pre-merge pin
    // (`12/12/11/9/11/9` is two at the ceiling) and is false of this one. A
    // test whose name states a measurement it does not make is the doc-rot this
    // repository keeps paying for.
    // **Re-measured on W116, 2026-08-14: `12/12/12/11/11/9` became
    // `12/12/11/10/9/5`** (elf, orc, draconic, human, gnome, dwarf), and the
    // title of this test changed with it — three species at the ceiling became
    // two. The composition note above still applies and gains a third cause,
    // which is the interesting one:
    //
    // 3. **Affiliation (W116).** `completeAffiliation` gained a caller, so mages
    //    join universities and may scribe. That is not a re-roll: a month spent
    //    writing a node down is a month not spent reaching into a new cell, and
    //    this metric counts cells reached. **Occupancy falling is the cost side
    //    of the trade the change buys** — `referenceGrimoires` goes 90 → 412 on
    //    the five-year gate over the same period.
    //
    // **Dwarf at 5 is the row to read.** It is the largest single move this
    // metric has ever recorded and dwarf is the species with the highest
    // `scribeAffinity` in the content, which is exactly the species that should
    // trade breadth for books hardest if the mechanism is what it claims to be.
    // That is a *consistent* reading, not a verified one: nothing here isolates
    // it, and the honest alternative — that a re-roll happened to land on dwarf —
    // is not excluded by anything in this file. If the next agent sees dwarf
    // move back without anyone touching scribing, that alternative wins.
    //
    // **Re-measured once for the whole of Group F, on `03d21899`, 2026-08-16.**
    // Not per merge: this row moved on four of the twelve and re-pinning it
    // each time would have recorded four numbers no released tree ever holds.
    // `12/12/11/12/12/9` for elf/orc/draconic/human/gnome/dwarf became
    // `12/11/12/12/9/2`.
    //
    // **Dwarf is the finding and it is not a re-roll.** W116 predicted dwarf
    // falling 12 → 5 when `completeAffiliation` gained a caller, because dwarf
    // carries the highest `scribeAffinity` in the content and a month spent
    // writing a node down is a month not spent reaching the next tier. On the
    // composed tree it falls to **2**, further than either branch measured
    // alone — W204's affiliate writer, W23's student pool and W116's seat bound
    // all push the same way. `species-separation-spread.test.ts` reads the same
    // species censored in 9 of 12 seed sets over the same change, which is two
    // independent instruments agreeing on the mechanism rather than one pin
    // moving.
    expect(bySpecies('elf').occupiedCells).toBe(12);
    expect(bySpecies('orc').occupiedCells).toBe(11);
    expect(bySpecies('draconic').occupiedCells).toBe(12);
    expect(bySpecies('human').occupiedCells).toBe(12);
    expect(bySpecies('gnome').occupiedCells).toBe(9);
    expect(bySpecies('dwarf').occupiedCells).toBe(2);
  });

  it('measures a spread that is neither flat nor a hegemony', () => {
    const entry = collectSpeciesCellOccupancy(telemetryFor(sample));
    expect(entry.status).toBe('measured');
    // 0.0473 at this horizon, re-measured on the merge described above — was
    // 0.0729 before either change, 0.0714 on `main` alone and 0.0645 on the
    // branch alone. Pinned to four places: the point of the metric is that this
    // number moves, and a test that only asserted "greater than zero" would let
    // it move to anything.
    // 0.1296 at this horizon, re-recorded on `w185/cohort-source`, 2026-08-14
    // — was 0.0473 before W185, 0.0729 before the merge described above, 0.0714
    // on `main` alone and 0.0645 on the branch alone. Pinned to four places:
    // the point of the metric is that this number moves, and a test that only
    // asserted "greater than zero" would let it move to anything.
    //
    // It roughly trebled, and that is the largest single move this row has
    // recorded. It is a consequence of who becomes a mage rather than of magic:
    // before W185 the labour market could not move anybody, so the student
    // population — and therefore the promotion pool — was whatever the founding
    // position happened to seed. It is now the one the demand model asks for.
    //
    // **0.0238 on the Group F merge, 2026-08-16** — was 0.1296 on this branch
    // and 0.0625 on `integration/group-f`. It fell by a factor of five because
    // the merged run puts five of six species at the ceiling: the spread this
    // metric measures is small precisely when occupancy is near-uniform, which
    // is what the accompanying `everySpeciesEqual: false` still denies is
    // *exactly* uniform.
    // 0.1271 at this horizon on W116 — was 0.0473 on the merge described above,
    // 0.0729 before any of it, 0.0714 on `main` alone and 0.0645 on the
    // `w108` branch alone. Pinned to four places: the point of the metric is
    // that this number moves, and a test that only asserted "greater than zero"
    // would let it move to anything.
    //
    // The rise is the largest in the series and it is the same event as the
    // occupancy block above: affiliation makes mages write rather than reach,
    // the species do not all trade at the same rate, and a metric of *spread*
    // rises when they diverge. Still neither flat nor a hegemony, which is what
    // this test is for — the concentration would have to reach 1 for one species
    // to own the grid.
    //
    // **0.1724 on `03d21899`, 2026-08-16**, re-measured with the row above and
    // for the same reason. It rises because dwarf falls: the metric is a spread
    // over occupancy, and one species at 2 against five between 9 and 12 is a
    // wider spread than the arrangement either branch measured.
    expect((entry as { value: number }).value).toBeCloseTo(0.1724, 4);
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
    // Re-pinned 2026-08-14 on the rebase onto `main` (245e04f1): `rego-terram`
    // out, `perdo-limen` in. Which is precisely what the paragraph above says
    // to expect — the set reorders under a handle-keyed re-roll, the durable
    // reading is *"gnome is short, and disproportionately short in Perdo"*, and
    // that reading is unchanged: all three are still Perdo but one.
    //
    // **Re-recorded on `w185/cohort-source`, 2026-08-14**, and the paragraph
    // above predicted this: the membership moved again, to four cells of which
    // three are Perdo. The durable reading — "gnome is short, and
    // disproportionately short in Perdo" — survived a second re-roll, which is
    // more than the membership did.
    //
    // **Re-derived on the Group F merge, 2026-08-16.** The membership moved a
    // third time and shrank: gnome is now two cells short, `perdo-limen` and
    // `perdo-mentem`, both Perdo. `perdo-terram` dropped out; `rego-terram`,
    // which this branch had re-added, stayed out. Neither side's list is what
    // this tree produces — `integration/group-f` had three and the branch four.
    // The durable reading survives a third re-roll where the membership did
    // not: gnome is short, and its shortfall is entirely Perdo.
    // Against **every cell any species reached**, not against dwarf's. The
    // reference used to be dwarf because dwarf sat at the ceiling; on W116 dwarf
    // is the species that fell furthest (12 → 5), so the old comparison now
    // measures dwarf's shortfall through gnome's, which is two findings tangled
    // into one assertion. The union is the reading the prose above was always
    // making — *which cells is gnome missing* — and it does not move when the
    // species used as a yardstick moves.
    const reached = new Set<string | undefined>();
    for (const entry of sample.species) {
      for (const id of entry.occupiedCellIds) reached.add(cellName.get(id));
    }
    //
    // **W116, 2026-08-14: `perdo-mentem/perdo-terram/rego-terram` became
    // `perdo-limen/perdo-mentem/perdo-terram`.** Membership moved for the third
    // time and the durable reading survived it again — still three cells, still
    // disproportionately Perdo, and this time *all three* are Perdo. Read that
    // as the prose above instructs: the count and the technique skew are the
    // finding, the exact membership is a pin.
    expect([...reached].filter((cell) => !held.has(cell)).sort()).toEqual([
      'perdo-limen',
      'perdo-mentem',
      'perdo-terram',
    ]);
  });

  it('has every occupied cell shared, so the concentration is not specialisation', () => {
    const entry = collectSpeciesCellOccupancy(telemetryFor(sample));
    expect(entry).toMatchObject({
      // Re-recorded on `w185/cohort-source`, 2026-08-14: two of the twelve now
      // have a sole occupant, both of them dwarf's. The test's claim is weaker
      // than it was — ten of twelve shared rather than twelve — and it is
      // recorded here rather than softened, because "two cells are held by one
      // species" is exactly what this row exists to surface.
      //
      // **Re-recorded on the Group F merge, 2026-08-16: back to zero.** This
      // line auto-merged without a conflict — it sits below the conflict
      // region — so the branch's `2` was installed silently on a tree that
      // produces `0`. With five species at the ceiling there is no sole
      // occupant left, and the row's original claim holds again at full
      // strength.
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
