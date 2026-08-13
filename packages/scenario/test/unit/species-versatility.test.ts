/*
 * Multiverse Mages — what the shipped content actually says about how much of
 * the grid each species can staff.
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
 * These are the numbers, taken against real loaded content rather than a
 * fixture. They are asserted rather than printed because the whole value of the
 * measurement is that a content edit which moves one has to be reviewed as
 * moving it.
 */

import { describe, expect, it } from 'vitest';

import { collectSpeciesGridVersatility } from '@mm/mc-harness';
import { MECHANICS_AT_0_5_0 } from '@mm/mc-harness';

import { v1RulesetAxes } from '../../src/content-set.js';
import { referenceContent } from '../../src/reference-universe.js';
import { speciesVersatility, teachableWindowTicks } from '../../src/species-versatility.js';

const content = referenceContent();
const registry = content.registry;
const ruleset = { ...v1RulesetAxes(registry), edicts: [] };
const sample = speciesVersatility(registry, ruleset);

function bySpecies(id: string) {
  const found = sample.species.find((entry) => entry.speciesId === id);
  if (found === undefined) throw new Error(`no species ${id}`);
  return found;
}

describe('the grid the measurement is taken against', () => {
  it('is the full seventy, of which the v1 ruleset permits twelve', () => {
    expect(sample.gridCells).toBe(70);
    expect(sample.enabledCells).toBe(12);
  });

  it('covers every species content declares', () => {
    expect(sample.species.map((entry) => entry.speciesId).sort()).toEqual([
      'draconic',
      'dwarf',
      'elf',
      'gnome',
      'human',
      'orc',
    ]);
  });
});

describe('breadth: every species can staff the whole grid', () => {
  /**
   * The headline finding, and it is a negative one.
   *
   * Every cell of the seventy has a tier-1 node with no prerequisites, and
   * every species has a `depthCeiling` of at least 3, so *entry* to a cell is
   * free for everybody. Versatility hegemony is therefore not a property that
   * distinguishes the shipped species — it is universal, which is a different
   * and more serious problem than one species having it.
   */
  it('gives all six species 70/70 and 12/12', () => {
    for (const entry of sample.species) {
      expect([entry.speciesId, entry.staffableCells, entry.staffableEnabledCells]).toEqual([
        entry.speciesId,
        70,
        12,
      ]);
    }
  });

  it('flags all six as hegemons at the 80% threshold, which is the finding', () => {
    const entry = collectSpeciesGridVersatility({
      coordinates: { rootSeed: 1, sweepId: 'versatility', cellIndex: 0, replicateIndex: 0 },
      status: 'stagnated',
      ticksRun: 0,
      mechanics: MECHANICS_AT_0_5_0,
      census: [],
      speciesIds: sample.species.map((s) => s.speciesId),
      tierFirstReached: [],
      checkpoints: [],
      raids: undefined,
      accounting: { submissions: 0, rejections: 0, byActionId: {} },
      speciesVersatility: sample,
    });
    expect(entry).toMatchObject({ status: 'measured', value: 1 });
    const detail = (entry as { detail: Record<string, unknown> }).detail;
    expect(detail['hegemonCount']).toBe(6);
  });
});

describe('depth: the contrast vector, which does separate them', () => {
  /**
   * This is the validation the capability author asked for: *"if your
   * versatility metric does not rank draconic and elf near the top on the full
   * grid — they have the deepest ceilings and the most authored affinities —
   * either the metric is wrong or a genuinely surprising thing is true"*.
   *
   * On breadth they do not rank at all, because nothing does. On the depth
   * vector carried beside it they are exactly at the top, which is what says
   * the derivation is reading the content correctly and the tie above is real.
   */
  it('ranks elf and draconic at the top and orc at the bottom', () => {
    // **These six numbers moved when `w20/compositional-content` landed, and
    // the ranking they were written to check survived the move.** Before it,
    // the file read 70 / 70 / 69 / 55 / 55 / 2 against a 300-node grid whose
    // cells ran out before most ceilings did. W20 authors 57 more nodes into
    // the twelve v1 cells and deepens the ladders it kept, so a cell is now
    // harder to exhaust and every figure below the top comes down.
    expect(bySpecies('draconic').exhaustibleCells).toBe(70);
    expect(bySpecies('elf').exhaustibleCells).toBe(64);
    expect(bySpecies('dwarf').exhaustibleCells).toBe(57);
    expect(bySpecies('human').exhaustibleCells).toBe(45);
    expect(bySpecies('gnome').exhaustibleCells).toBe(45);
    expect(bySpecies('orc').exhaustibleCells).toBe(1);
  });

  it('shows the ceiling has become a real constraint at 5, not only at 3', () => {
    // **This assertion has been inverted by a content change, and that is the
    // finding rather than a maintenance chore.**
    //
    // It used to read *"the ceiling is inert above 5 and sharp at 3"*, and
    // asserted that draconic (ceiling 7) could exhaust exactly **1** cell more
    // than dwarf (ceiling 5) — a gap of one across two whole ceiling steps,
    // which is what "a ceiling nothing hits is not a constraint" meant. The
    // shipped grid was too shallow for the difference between a 5 and a 7 to
    // be worth anything, so orc's 3 was the only ceiling that bound.
    //
    // On W20's content the same gap is **13**. Deeper ladders in the twelve v1
    // cells mean a tier-6 and tier-7 mage now reaches cells a tier-5 mage
    // cannot finish, so the authored ceilings above 5 have started paying.
    // That is `depthCeiling` becoming a species trait that discriminates,
    // which is what it was authored to be — recorded here rather than
    // smoothed, because it is a claim a reviewer should be able to disagree
    // with by reading these two numbers.
    expect(bySpecies('draconic').exhaustibleCells - bySpecies('dwarf').exhaustibleCells).toBe(13);
    // orc's 3 still binds hardest by a wide margin, which is unchanged.
    expect(bySpecies('orc').exhaustibleCells).toBe(1);
  });
});

describe('the teachable window, which is where the separation actually lives', () => {
  /**
   * Nothing in the rules path raises mastery — `setMastery`'s only non-test
   * caller is the decay pass, and it lowers. So a species is not limited by what
   * it can learn; it is limited by how long it can still teach what it was
   * granted before the instance falls back below the threshold.
   */
  it('runs from 32 ticks to 102 across the six', () => {
    expect(bySpecies('gnome').teachableWindowTicks).toBe(32);
    expect(bySpecies('orc').teachableWindowTicks).toBe(56);
    expect(bySpecies('human').teachableWindowTicks).toBe(64);
    expect(bySpecies('elf').teachableWindowTicks).toBe(85);
    expect(bySpecies('dwarf').teachableWindowTicks).toBe(102);
    expect(bySpecies('draconic').teachableWindowTicks).toBe(102);
  });

  it('is strictly positive for every species, so none is unable to teach at all', () => {
    for (const entry of sample.species) {
      expect(entry.teachableWindowTicks).toBeGreaterThan(0);
    }
  });

  it('is a pure function of retention', () => {
    expect(teachableWindowTicks(1024)).toBe(64);
    expect(teachableWindowTicks(512)).toBe(32);
  });
});

describe('affinity liveness against the permitted cells', () => {
  /**
   * **The measurement this block was written to report has been fixed by the
   * content change that this merge brings, and the numbers are inverted.**
   *
   * It used to read: *"seven of the eleven authored affinity entries name a
   * form no permitted cell uses, and two species have no live entry at all"* —
   * so four authored numbers were doing all the work and seven could not
   * influence anything in this ruleset. The two species with nothing live were
   * **human and gnome**, which is to say the two species the harness most
   * wanted to tell apart were, in the v1 ruleset, mechanically identical on
   * this axis by accident of which forms their affinities named.
   *
   * `w20/compositional-content` re-authors `species.json` from 11 affinity
   * entries to 26 — human goes from 0 authored entries to 4, gnome from 2 to
   * 5 — and aims them at forms the twelve permitted cells actually use. The
   * live count goes 4 -> 19 while the inert count stays at 7.
   *
   * This is the mechanism behind that branch's headline claim that human and
   * gnome are the first pair of species with genuinely distinct playstyles. It
   * is worth being exact about what is and is not shown here: the branch's own
   * separation figures (a Jaccard of 0.57 on held repertoires, 1.7x reach)
   * are simulated results measured elsewhere, whereas what this file proves is
   * only the precondition — that the authored numbers are now *reachable*.
   * `exhaustibleCells` above still gives human and gnome the identical 45, so
   * the affinity vector is where the whole of the difference between them
   * lives, and it did not exist before this content.
   */
  it('finds nineteen live entries and seven inert ones', () => {
    const live = sample.species.reduce((sum, entry) => sum + entry.liveAffinityEntries, 0);
    const inert = sample.species.reduce((sum, entry) => sum + entry.inertAffinityEntries, 0);
    expect([live, inert]).toEqual([19, 7]);
  });

  it('gives human and gnome live entries, where they had none', () => {
    // The whole point of the re-authoring: the two species that were
    // indistinguishable on this axis now both carry affinities that a
    // permitted cell can actually read.
    expect(bySpecies('human').liveAffinityEntries).toBe(4);
    expect(bySpecies('gnome').liveAffinityEntries).toBe(3);
    // Human's four are all live — it is the only species with nothing inert.
    expect(bySpecies('human').inertAffinityEntries).toBe(0);
    expect(bySpecies('gnome').inertAffinityEntries).toBe(2);
  });
});
