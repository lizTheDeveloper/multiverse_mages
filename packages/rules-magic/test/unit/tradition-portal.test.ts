/*
 * Multiverse Mages — preparations readied at home, spent abroad.
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

import { FP_ONE, fromInt, mul } from '@mm/sim-core';
import type { LocationKindValue } from '@mm/state';
import { LOCATION_KIND } from '@mm/state';

import type { CarriedNode } from '../../src/traditions/index.js';
import {
  populatePreparedSpells,
  portalHookSet,
  releaseAbroad,
  resolvePortalHooks,
} from '../../src/traditions/index.js';

import { ART_OF_MEMORY, TRADITIONS, TRUE_NAMING, VANCIAN } from './tradition-fixtures.js';

const RELEASE_COST = mul(fromInt(3), FP_ONE);

function hooksFor(home: number, host: number) {
  return resolvePortalHooks(portalHookSet(home, host, TRADITIONS));
}

/** Twenty known nodes, of which four were memorised before the portal opened. */
function twentyKnown(
  preparedCount: number,
  locationKind: LocationKindValue = LOCATION_KIND.mind,
): CarriedNode[] {
  return Array.from({ length: 20 }, (_, index) => ({
    nodeId: index + 1,
    locationKind,
    usable: true,
    preparedAtHome: index < preparedCount,
  }));
}

describe('a Vancian raider in an Art of Memory universe', () => {
  const hooks = hooksFor(VANCIAN, ART_OF_MEMORY);

  it('arrives carrying exactly her four preparations, not the twenty nodes she knows', () => {
    const entry = populatePreparedSpells(hooks, twentyKnown(4));
    expect(entry.preparedSpells).toEqual([1, 2, 3, 4]);
  });

  it('pays the host’s price to release one, not her own tradition’s zero', () => {
    const entry = populatePreparedSpells(hooks, twentyKnown(4));
    const release = releaseAbroad(hooks, entry.preparedSpells, 2, RELEASE_COST);

    expect(release.cast).toBe(true);
    expect(release.cost).toBe(RELEASE_COST);
    // At home the same release would have been free: the price was paid at
    // memorisation, and `prepaid` is what her own cost hook declares.
    const atHome = hooksFor(VANCIAN, VANCIAN);
    expect(releaseAbroad(atHome, entry.preparedSpells, 2, RELEASE_COST).cost).toBe(0);
  });

  it('does not have the preparation consumed, because the host does not work that way', () => {
    // The host's `standard` cast kind spends no preparation. Her list is a
    // record of what she readied, and under this sky it simply does not deplete.
    const entry = populatePreparedSpells(hooks, twentyKnown(4));
    expect(entry.spentFromPreparations).toBe(false);
    expect(releaseAbroad(hooks, entry.preparedSpells, 2, RELEASE_COST).preparedSpells).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('cannot smuggle a fifth preparation through the door', () => {
    const entry = populatePreparedSpells(hooks, twentyKnown(9));
    expect(entry.preparedSpells).toHaveLength(4);
  });

  it('leaves behind what she only had written down', () => {
    // §1.6: the list is drawn "on what her home store hook makes available".
    const inBooks = twentyKnown(4, LOCATION_KIND.grimoire);
    expect(populatePreparedSpells(hooks, inBooks).preparedSpells).toEqual([1, 2, 3, 4]);
    const shelved = twentyKnown(4, LOCATION_KIND.palace);
    // A standard-store raider has no palace, so nothing readied from one counts.
    expect(populatePreparedSpells(hooks, shelved).preparedSpells).toEqual([]);
  });
});

describe('the reverse trip', () => {
  const hooks = hooksFor(ART_OF_MEMORY, VANCIAN);

  it('gives a standard-cast raider an empty prepared list, because she readied nothing', () => {
    // Her home tradition has no notion of a readied spell, so there is nothing
    // to carry. What a Vancian *host* lets an unprepared caster do is
    // `raid-engagement`'s question, recorded as an open ambiguity rather than
    // answered here.
    const entry = populatePreparedSpells(hooks, twentyKnown(0, LOCATION_KIND.palace));
    expect(entry.preparedSpells).toEqual([]);
    expect(entry.spentFromPreparations).toBe(true);
  });

  it('refuses her a cast under the host’s prepared kind, and says the knowledge is still hers', () => {
    const release = releaseAbroad(hooks, [], 3, RELEASE_COST);
    expect(release.cast).toBe(false);
    expect(release.refusal).toMatch(/not prepared/);
  });

  it('charges nothing for a refused cast', () => {
    // A cost deducted for a cast that did not happen shows up months later as
    // an unexplained vigor drain in a Monte Carlo run.
    expect(releaseAbroad(hooks, [], 3, RELEASE_COST).cost).toBe(0);
  });

  it('waives the release price when the host is the one that prepaid', () => {
    const release = releaseAbroad(hooks, [3], 3, RELEASE_COST);
    expect(release.cast).toBe(true);
    expect(release.cost).toBe(0);
    expect(release.preparedSpells).toEqual([]);
  });
});

describe('a raider whose home and host share a tradition', () => {
  it('is governed by one tradition on both clocks', () => {
    const hooks = hooksFor(VANCIAN, VANCIAN);
    const entry = populatePreparedSpells(hooks, twentyKnown(4));
    expect(entry.preparedSpells).toEqual([1, 2, 3, 4]);
    expect(entry.spentFromPreparations).toBe(true);

    const release = releaseAbroad(hooks, entry.preparedSpells, 1, RELEASE_COST);
    expect(release.preparedSpells).toEqual([2, 3, 4]);
    expect(release.cost).toBe(0);
  });

  it('holds for a tradition that hooks neither cast nor cost', () => {
    const hooks = hooksFor(TRUE_NAMING, TRUE_NAMING);
    expect(populatePreparedSpells(hooks, twentyKnown(4)).preparedSpells).toEqual([]);
    expect(releaseAbroad(hooks, [], 1, RELEASE_COST).cost).toBe(RELEASE_COST);
  });
});
