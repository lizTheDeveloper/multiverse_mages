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
   * Seven of the eleven authored affinity entries name a form no permitted cell
   * uses, and two species have no live entry at all. That does not bias them —
   * `affinityTerm` defaults a missing key to `FP_ONE` and subtracts it, so an
   * undeclared species scores exactly zero rather than badly — but it does mean
   * seven authored numbers cannot influence anything in this ruleset.
   */
  it('finds four live entries and seven inert ones', () => {
    const live = sample.species.reduce((sum, entry) => sum + entry.liveAffinityEntries, 0);
    const inert = sample.species.reduce((sum, entry) => sum + entry.inertAffinityEntries, 0);
    expect([live, inert]).toEqual([4, 7]);
  });

  it('leaves human and gnome with no live entry', () => {
    expect(bySpecies('human').liveAffinityEntries).toBe(0);
    expect(bySpecies('gnome').liveAffinityEntries).toBe(0);
  });
});
