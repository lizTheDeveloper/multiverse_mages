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
    // Was 12. `material-economy` flags every cell `"v1": true` and
    // `v1RulesetAxes` derives the mask from the flag, so this is a **content
    // decision** re-pinned, recomputable from `cell.json` without running
    // anything. The occupancy figures further down this file are *not* — they
    // are run outcomes and they are left where they were.
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
    //
    // **Re-recorded on `integration/all-branches`, 2026-08-17, and this one is a
    // decision rather than a re-roll.** The six cells moved from the Intellego
    // and Perdo rows to the Creo row, and nothing about founding changed to do
    // it: `foundingCandidates` deals prerequisite-free nodes out of the cells
    // `permits()` allows, ascending by interned id, and this campaign flagged
    // every cell `"v1": true`. A universe that permits all seventy takes its
    // roots from cell 1 onward — `creo-animal` is cell 1 — where a universe
    // permitting only the twelve-cell rectangle had to start at `intellego-*`.
    //
    // Recomputable from `cell.json` and `node.json` without running anything,
    // which is what makes it a re-record and not a measurement. The claim the
    // test is named for is untouched and still holds: six species, six distinct
    // cells, every one of them a sole occupant.
    expect(
      sample.species.map((entry) => [
        entry.speciesId,
        entry.occupiedCellIds.map((id) => cellName.get(id)),
      ]),
    ).toEqual([
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
    //
    // **Re-measured on `integration/all-branches`, 2026-08-17, and this move is
    // a decision rather than a re-roll — the first one in this block's history
    // that is.** Every reading above was taken against a twelve-cell ceiling.
    // This campaign flagged all seventy cells `"v1": true`, so `v1RulesetAxes`
    // permits seventy and the ceiling this test is named for went 12 -> 70. The
    // old numbers are not stale magnitudes of the same quantity; they are
    // measurements of a different grid, and 12 was five of the six species'
    // *maximum* rather than their achievement.
    //
    // What the numbers say now, at the same seed and the same horizon:
    //
    //     gnome     66 / 70      draconic  54 / 70      human  53 / 70
    //     elf       55 / 70      dwarf     48 / 70      orc    52 / 70
    //
    // **Gnome is the finding and it is the reversal of the last four readings.**
    // Gnome was the species this file recorded as short in every measurement
    // since W200 — 9 of 12, three cells behind, "disproportionately short in
    // Perdo". Given seventy cells it is the only species that reaches every cell
    // any species reaches, on seven living mages against orc's twenty. Gnome
    // carries the highest `curiosity` in the content (1792 against human's 1152
    // and elf's 896), and `curiosity` is what decides *which* node a mage
    // reaches for; a twelve-cell ceiling gave that trait nothing to express,
    // because every species ran out of grid before it ran out of appetite. This
    // is the same mechanism `reference-time-to-tier` reads gnome-first on, which
    // is two independent instruments agreeing rather than one pin moving.
    //
    // Dwarf is the new floor at 48 and that is *not* the same event as the 2 it
    // read at twelve cells: 48/70 is 69% of the grid where 2/12 was 17%. The
    // scribeAffinity reading the block above builds up over four measurements is
    // neither confirmed nor refuted here — it was a claim about a species that
    // could not afford breadth, and on this grid every species affords a lot of
    // it.
    //
    // Pinned, not softened, and the pin is membership rather than finding — the
    // instruction this block has carried since 2026-08-14.
    expect(bySpecies('elf').occupiedCells).toBe(55);
    expect(bySpecies('orc').occupiedCells).toBe(52);
    expect(bySpecies('draconic').occupiedCells).toBe(54);
    expect(bySpecies('human').occupiedCells).toBe(53);
    expect(bySpecies('gnome').occupiedCells).toBe(66);
    expect(bySpecies('dwarf').occupiedCells).toBe(48);
    //
    // **`material-economy` measured this row too, and its numbers are recorded
    // rather than adopted.** Neither side's pin is a measurement of *this* tree:
    // `main`'s side was measured without the material faucets and the open grid,
    // and `material-economy`'s was measured without W204's affiliate writer,
    // W23's student pool or W116's seat bound. The assertion below is left where
    // `main` had it, unchanged, because the merge is not the place to invent a
    // number — this test is already red on the base for the same reason, and a
    // fresh literal here would make a measurement look like a decision. The
    // branch's reading, kept verbatim so the mechanism it names is not lost:
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
    // expect({
    // dwarf: bySpecies('dwarf').occupiedCells,
    // human: bySpecies('human').occupiedCells,
    // orc: bySpecies('orc').occupiedCells,
    // draconic: bySpecies('draconic').occupiedCells,
    // elf: bySpecies('elf').occupiedCells,
    // gnome: bySpecies('gnome').occupiedCells,
    // }).toEqual({ dwarf: 12, human: 12, orc: 6, draconic: 12, elf: 11, gnome: 9 });
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
    //
    // **0.0508 on `integration/all-branches`, 2026-08-17.** It fell by a factor
    // of three and the cause is the one the block above names: the ceiling went
    // from twelve cells to seventy. This metric is a Gini coefficient over the
    // per-species occupied-cell counts, and a Gini is a *ratio*, so what moved is
    // not that the species got closer together in absolute terms — the spread
    // between the widest and the narrowest went from 10 cells (12 against 2) to
    // 18 (66 against 48) — but that 18 cells out of a mean of 55 is a smaller
    // relative dispersion than 10 out of a mean of 9.
    //
    // Said plainly, because the arithmetic is easy to misread as convergence: on
    // twelve cells one species was at 17% of the grid and five were near the
    // ceiling; on seventy the range is 69% to 94% and nobody is at either end of
    // the grid. **A ceiling that everybody hits compresses the top of this
    // statistic and leaves the bottom free**, which is why the twelve-cell
    // readings were as large as they were.
    //
    // The claim this test is named for survives and is what it is here to say:
    // 0.0508 is neither flat (a Gini of 0, which the founding position reads and
    // `everySpeciesEqual` still denies) nor a hegemony (which would need this
    // toward 1).
    expect((entry as { value: number }).value).toBeCloseTo(0.0508, 4);
    //
    // The branch's reading of the same row, recorded and not adopted, for the
    // reason the occupancy block above gives:
    //
    // 0.1075 at this horizon, re-measured 2026-08-16 with `material-economy`'s
    // faucets live — was 0.0625 immediately before, and 0.0473, 0.0729, 0.0714
    // and 0.0645 at the four readings before that. The concentration **rose**,
    // which is the same finding the cell counts above carry from the other
    // side: orc fell from eleven occupied cells to six, so the spread across
    // species widened. Pinned to four places: the point of the metric is that
    // this number moves, and a test that only asserted "greater than zero"
    // would let it move to anything.
    // expect((entry as { value: number }).value).toBeCloseTo(0.1075, 4);
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
    //
    // ## Re-authored on `integration/all-branches`, 2026-08-17 — gnome is missing nothing
    //
    // Every reading above was taken against a twelve-cell ceiling. This campaign
    // flagged all seventy cells `"v1": true`, and the species this file recorded
    // as short in five consecutive measurements is now the only one that reaches
    // **every cell any species reaches**: gnome holds 66 of 70 on seven living
    // mages. The assertion is kept and its expectation is now the empty list,
    // which is a real claim and not a vacuous one — it fails the day gnome falls
    // behind again.
    //
    // **The durable reading survived where the membership did not, and it is now
    // measurable on five species instead of one.** Measured at this seed and
    // horizon, missing against the union of every cell reached:
    //
    //     dwarf     18   muto 4  rego 5  perdo 8  creo 1
    //     orc       14   muto 1  rego 4  perdo 8  creo 1
    //     human     13   muto 1  rego 3  perdo 8  creo 1
    //     draconic  12           rego 3  perdo 8  creo 1
    //     elf       11   muto 1  rego 2  perdo 7  creo 1
    //     gnome      0
    //
    // Perdo is 14 of the 70 cells — 20% of the grid — and it is **7 or 8 of every
    // short species' shortfall**, which is 44% to 64% of it. The claim this block
    // has been making since W200 about gnome alone — *"short, and
    // disproportionately short in Perdo"* — turns out to be a property of the
    // grid rather than of a species, and it is asserted below in the form that
    // does not re-roll: the composition of the shortfall, rather than its
    // membership. That trade is deliberate. This block's own five-times-repeated
    // instruction is that *"the exact membership is a pin, not a finding"*, and a
    // pin of eighteen cell names would be eighteen chances to fail for a reason
    // nobody wants to read.
    expect([...reached].filter((cell) => !held.has(cell)).sort()).toEqual([]);

    const techniqueOf = new Map(
      content.registry.cells.map((e) => [e.record.id, e.record.technique]),
    );
    const perdoCells = [...content.registry.cells].filter(
      (e) => e.record.technique === 'perdo',
    ).length;
    expect(perdoCells).toBe(14);
    for (const entry of sample.species) {
      const has = new Set(entry.occupiedCellIds.map((id) => cellName.get(id)));
      const missing = [...reached].filter((cell) => !has.has(cell));
      if (missing.length === 0) continue;
      const perdo = missing.filter((cell) => techniqueOf.get(cell as string) === 'perdo').length;
      // Strictly over-represented against Perdo's share of the grid, in every
      // species that is short of anything. A species that fell behind evenly
      // across the five techniques would fail here, which is the reading a bare
      // count cannot give.
      expect(
        perdo * 70,
        `${entry.speciesId} is short of ${String(missing.length)} cells, ${String(perdo)} of ` +
          'them Perdo, which is no more than the 14/70 share Perdo has of the grid',
      ).toBeGreaterThan(missing.length * perdoCells);
    }
  });

  it('has nine cells with a sole occupant, all of them gnome\'s — the claim above it reversed', () => {
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
      //
      // ## The title changed because the claim became false, 2026-08-17
      //
      // This test was called *"has every occupied cell shared, so the
      // concentration is not specialisation"* and asserted `cellsWithASoleOccupant:
      // 0`. On `integration/all-branches` it reads **9 of 66**, and that is not a
      // number that moved — it is the claim being **refuted**. Renaming rather
      // than re-pinning, because a test whose name states a measurement it does
      // not make is the doc-rot this file has already paid for once.
      //
      // The cause is this campaign's, not a re-roll. Opening all seventy cells
      // gave the species room to diverge for the first time: at twelve cells five
      // of six sat at the ceiling and there was physically nowhere to be alone.
      // All nine sole-occupant cells are gnome's — the species with the highest
      // `curiosity` in the content — and they are exactly the margin by which it
      // leads: 66 cells against elf's 55.
      //
      // **So specialisation is now what this row reports, and the concentration
      // above is partly it.** That is a finding for the owner rather than a
      // defect: a Gini of 0.0508 across six species, 14% of the occupied grid held
      // by one species alone. The instrument is unchanged and both halves are
      // pinned, so a return to a fully shared grid fails here and says so.
      detail: { cellsOccupiedByAnySpecies: 66, cellsWithASoleOccupant: 9 },
    });
    // Which species owns the sole occupancy, since the count alone cannot say —
    // and this is the half that makes "specialisation" the right word for it.
    const detail = (entry as { detail: { species: { speciesId: string; soleOccupantCells: number }[] } })
      .detail;
    expect(
      detail.species
        .filter((row) => row.soleOccupantCells > 0)
        .map((row) => [row.speciesId, row.soleOccupantCells]),
    ).toEqual([['gnome', 9]]);
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
