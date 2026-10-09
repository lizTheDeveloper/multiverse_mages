/*
 * Multiverse Mages — what a raid carries home is marked as having come through a portal.
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
 * `knowledge-provenance` is the one input to either ascension path that only a
 * raid produces (vision §8a, 2026-10-08). That claim is only as good as the two
 * places that write it, so this file pins both — a captured book and a theft —
 * and pins the negative from both sides: nothing the raider already held, and
 * nothing the *host* gained by watching, is marked.
 */

import { describe, expect, it } from 'vitest';

import type { SimState } from '@mm/sim-core';
import { KNOWLEDGE_INSTANCE, KNOWLEDGE_PROVENANCE, LOCATION_KIND, LOOT_ROUTE, componentOf } from '@mm/state';

import { nodeId, resolveWarband } from './warband.js';
import type { WarbandResult } from './warband.js';

const FIRE = 'cig-the-uncontained-hour';
const MIND_READING = 'im-read-the-surface';
const SHELVED = 'rl-open-the-portal';

function raid(seed: number): WarbandResult {
  return resolveWarband({
    attackers: [
      { name: 'Brannoc', nodes: [FIRE, MIND_READING] },
      { name: 'Sela', nodes: [MIND_READING] },
      { name: 'Odo', nodes: [FIRE] },
    ],
    defenders: [
      { name: 'Warden', nodes: [FIRE] },
      { name: 'Keeper', nodes: [FIRE] },
      { name: 'Archivist', nodes: [FIRE] },
    ],
    hostShelves: [SHELVED, FIRE, 'rt-set-the-stone', 'il-sense-the-seam'],
    seed,
  });
}

/** Every provenance row in a world, as `[instance, route, nodeId, locationKind]`. */
function marked(world: SimState): (readonly [number, number, number, number])[] {
  const provenance = componentOf(world, KNOWLEDGE_PROVENANCE);
  const instances = componentOf(world, KNOWLEDGE_INSTANCE);
  const out: (readonly [number, number, number, number])[] = [];
  provenance.forEach((_row, handle) => {
    out.push([
      handle,
      provenance.get(handle, 'route'),
      instances.get(handle, 'nodeId'),
      instances.get(handle, 'locationKind'),
    ] as const);
  });
  return out;
}

describe('a captured book comes home marked as plunder', () => {
  it('marks the carried book, and only on the raider side', () => {
    const result = raid(1);
    expect(result.applied.nodesGainedByRaider).toContain(nodeId(SHELVED));

    const books = marked(result.attackerWorld).filter(([, route]) => route === LOOT_ROUTE.capturedBook);
    expect(books.map(([, , node]) => node)).toContain(nodeId(SHELVED));
    for (const [, , , kind] of books) expect(kind).toBe(LOCATION_KIND.grimoire);

    // The host lost the book and gained nothing marked: exposure — what a
    // defender learns by watching — is not loot, and a universe that was only
    // ever raided has not raided.
    expect(marked(result.hostWorld)).toEqual([]);
  });

  it('marks nothing the raider universe held before the portal opened', () => {
    const result = raid(1);
    const provenance = componentOf(result.attackerWorld, KNOWLEDGE_PROVENANCE);
    const instances = componentOf(result.attackerWorld, KNOWLEDGE_INSTANCE);
    // Every mage went through with what she had learned at home, at non-zero
    // mastery; a theft lands at mastery 0. So a mind-held instance with
    // mastery is home-grown, and must carry no row.
    let homeGrown = 0;
    instances.forEach((_row, handle) => {
      const kind = instances.get(handle, 'locationKind');
      if (kind !== LOCATION_KIND.mind || instances.get(handle, 'mastery') === 0) return;
      homeGrown += 1;
      expect(provenance.has(handle)).toBe(false);
    });
    expect(homeGrown).toBeGreaterThan(0);
  });
});

describe('a theft comes home marked as plunder', () => {
  it('marks a node stolen into a mind with the theft route, on some seed', () => {
    let theft: (readonly [number, number, number, number])[] | undefined;
    for (let seed = 1; seed <= 40 && theft === undefined; seed += 1) {
      const rows = marked(raid(seed).attackerWorld).filter(([, route]) => route === LOOT_ROUTE.theft);
      if (rows.length > 0) theft = rows;
    }
    expect(theft, 'no raid in forty seeds stole a node into a mind').toBeDefined();
    for (const [, , , kind] of theft ?? []) {
      expect(kind === LOCATION_KIND.mind || kind === LOCATION_KIND.palace).toBe(true);
    }
  });
});
