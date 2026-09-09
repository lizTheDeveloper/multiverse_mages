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
  it('is the full seventy, all of which the v1 ruleset now permits', () => {
    // Was `enabledCells: 12`. `material-economy` flags every cell `"v1": true`
    // in `cell.json`, and `v1RulesetAxes` derives the mask from the flag rather
    // than from a literal — which is exactly why that function was written as a
    // derivation. Re-pinned because this restates a **content decision**: the
    // number is `cell.json`'s and is recomputable from it, not a run outcome.
    expect(sample.gridCells).toBe(70);
    expect(sample.enabledCells).toBe(70);
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
  it('gives all six species 70/70 twice over', () => {
    // The second pair was `12` while twelve cells were enabled. Every cell is
    // enabled now, so the enabled figure and the grid figure coincide — and the
    // finding **strengthens**: it was "every species can staff every cell the
    // god opened" over a twelfth of the grid, and it is now the same statement
    // over all of it.
    for (const entry of sample.species) {
      expect([entry.speciesId, entry.staffableCells, entry.staffableEnabledCells]).toEqual([
        entry.speciesId,
        70,
        70,
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
    expect(bySpecies('elf').exhaustibleCells).toBe(70);
    expect(bySpecies('draconic').exhaustibleCells).toBe(70);
    expect(bySpecies('dwarf').exhaustibleCells).toBe(69);
    expect(bySpecies('human').exhaustibleCells).toBe(55);
    expect(bySpecies('gnome').exhaustibleCells).toBe(55);
    expect(bySpecies('orc').exhaustibleCells).toBe(2);
  });

  it('shows the ceiling is inert above 5 and sharp at 3', () => {
    // dwarf (5), elf (6) and draconic (7) are within one cell of each other. A
    // ceiling nothing hits is not a constraint; orc's is the only one that is.
    expect(bySpecies('draconic').exhaustibleCells - bySpecies('dwarf').exhaustibleCells).toBe(1);
  });
});

describe('the teachable window, which is where the separation actually lives', () => {
  /**
   * Written when nothing in the rules path raised mastery — `setMastery`'s only
   * non-test caller was the decay pass, and it lowers — so a species was not
   * limited by what it could learn but by how long it could still teach what it
   * was granted.
   *
   * `rules-magic`'s `practice` (`w196/mastery-rises`) added the climb, so this
   * window is now the *decay* half of the separation rather than all of it. The
   * numbers below are unchanged and still assert what they always did: how long
   * a fully-mastered instance stays transmissible in each species' hands.
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
   * **All thirteen authored affinity entries are live, and none is inert.** This
   * read `[4, 7]` while twelve cells were enabled: seven of the eleven then
   * authored named a form no permitted cell used, and human and gnome had no
   * live entry at all. It did not bias them — `affinityTerm` defaults a missing
   * key to `FP_ONE` and subtracts it, so an undeclared species scores exactly
   * zero rather than badly — but seven authored numbers could not influence
   * anything.
   *
   * `material-economy` flags every cell `"v1": true`, so every form is in a
   * permitted cell and every authored entry now bites. Re-pinned as a
   * **content decision**: the numbers are a function of `cell.json` and
   * `species.json` and are recomputable from them without running anything.
   *
   * Eleven became **thirteen** on `w/exp-yields`, 2026-08-16: human gained
   * `animal: 1152` and `herbam: 1280`. Two reasons, and both are deliberate.
   * The economic one is that `species.affinities` now also derives a species'
   * **land aptitude** (`rules-world`'s `aptitude.ts`), and a human with no
   * authored entry derives exactly neutral — so the author's *"humans are a
   * little bit better at agrarian stuff"* had no expression at all. The
   * research one is the side the entries always had: humans now also *study*
   * beasts and plants a little more readily, which is the same sentence read
   * the other way and is accepted rather than hidden.
   *
   * This is the shape the campaign is looking for — authored content that the
   * ruleset made unreachable, becoming reachable.
   */
  it('finds all thirteen entries live and none inert', () => {
    const live = sample.species.reduce((sum, entry) => sum + entry.liveAffinityEntries, 0);
    const inert = sample.species.reduce((sum, entry) => sum + entry.inertAffinityEntries, 0);
    expect([live, inert]).toEqual([13, 0]);
  });

  it('gives human the two agrarian entries it did not have, and gnome its two', () => {
    // Human's zero used to be one of two different zeroes and the reason this
    // assertion carried an inert count beside a live one: gnome had **two
    // authored entries and neither was live**, while human declared none at all.
    // Human now declares two and both are live, so the inert count is still
    // zero — and it is still asserted, because "no entries" and "no live
    // entries" must never collapse into one reading again.
    expect(bySpecies('human').liveAffinityEntries).toBe(2);
    expect(bySpecies('human').inertAffinityEntries).toBe(0);
    expect(bySpecies('gnome').liveAffinityEntries).toBe(2);
  });
});
