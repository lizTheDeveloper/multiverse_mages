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
    // `enabledCells` was 12. Every cell carries `"v1": true` now, and this
    // sample's ruleset is `v1RulesetAxes` — the OR of the enabled cells' axes —
    // so the two coincide. Both asserted anyway: they are separate numbers that
    // happen to be equal, and the whole point of the affinity-liveness block at
    // the bottom of this file is the difference between them.
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
  it('gives all six species 70/70 and 70/70', () => {
    // Was `70/70 and 12/12`. The finding is unchanged and is now stated without
    // the ruleset softening it: entry to every cell is free for every species,
    // and the twelve-cell figure that used to sit beside it was a fact about the
    // ruleset rather than about the species.
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
   * **This is the measurement enabling all seventy cells was made for, and it is
   * the one that moved cleanly.**
   *
   * It read *four live, seven inert*: seven of the eleven authored affinity
   * entries named a form no permitted cell used, and two species — human and
   * gnome — had no live entry at all. That did not *bias* them, because
   * `affinityTerm` defaults a missing key to `FP_ONE` and subtracts it, so an
   * undeclared species scores exactly zero rather than badly. It meant something
   * worse: seven authored numbers could not influence anything, and `w80` had
   * measured species affinity as the term doing most of the ordering work in
   * acquisition. The strongest lever in the system was pointed at almost nothing.
   *
   * The twelve enabled cells covered four forms — `limen`, `mentem`, `nomen`,
   * `terram` — against the eight the six species name between them. So:
   *
   *     species    affinities                        live before   live now
   *     elf        herbam 1536, mentem 1280          mentem only   both
   *     dwarf      terram 1536, ignem 1152           terram only   both
   *     draconic   ignem 1792, vim 1536, nomen 1280  nomen only    all three
   *     orc        terram 1280, corpus 1280          terram only   both
   *     gnome      imaginem, vim                     none          both
   *     human      (none authored)                   none          none
   *
   * Eleven of eleven live, zero inert. Human still has no live entry and that is
   * not a reachability problem: `species.json` authors it no affinities at all,
   * which is `affinityTerm`'s documented "no opinion" case rather than a gap this
   * change could close.
   */
  it('finds every authored entry live and none inert', () => {
    const live = sample.species.reduce((sum, entry) => sum + entry.liveAffinityEntries, 0);
    const inert = sample.species.reduce((sum, entry) => sum + entry.inertAffinityEntries, 0);
    expect([live, inert]).toEqual([11, 0]);
  });

  it('leaves human alone with no live entry, because it authors none', () => {
    // Gnome was the other one, on two entries — `imaginem` and `vim`, two of the
    // ten forms the twelve never covered — and both are live now.
    expect(bySpecies('human').liveAffinityEntries).toBe(0);
    expect(bySpecies('human').inertAffinityEntries).toBe(0);
    expect(bySpecies('gnome').liveAffinityEntries).toBe(2);

    // Draconic is the sharpest case: its authored character is `ignem 1792` and
    // `vim 1536`, and neither could act. Only `nomen 1280`, its weakest, was live.
    expect(bySpecies('draconic').liveAffinityEntries).toBe(3);
  });
});
