/*
 * Multiverse Mages — a raid on the stand-in rival can bring a book home.
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
 * Until 2026-10-09 the stand-in rival's library held only "foreign" books —
 * nodes in cells the raider's ruleset forbids — and the reference universe
 * forbids none, so every headless raid's library objective was empty: 0 books
 * home in 21 outbound stand-in raids (#256) and 0 in #251's survey, against
 * about two a raid from a live peer. Once ascension required looted knowledge
 * (vision §8a) that closed headless ascension. The stand-in now shelves its
 * founders' curriculum, as a live universe's library holds its own.
 */

import { describe, expect, it } from 'vitest';

import { defineWorldSimulation } from '@mm/coordination';
import { GRIMOIRE, HOLDER_KIND, collectRecords } from '@mm/state';

import { playPeerPair, referenceContent } from '@mm/scenario';
import { buildRival, readRivalConstants } from '../../src/rival-universe.js';

const content = referenceContent();
const { schema } = defineWorldSimulation(content.deps);
const SLOW = 600_000;

describe('the stand-in rival', () => {
  it('shelves books even when the raider forbids nothing', () => {
    // The reference universe's opening: every technique and form permitted, so
    // nothing is foreign and `shelveForeignBooks` shelves nothing.
    const local = {
      permittedTechniques: (1 << content.registry.techniques.length) - 1,
      permittedForms: (1 << content.registry.forms.length) - 1,
      edicts: [],
    };
    const rival = buildRival({
      runSeed: 7000,
      targetId: 1,
      content,
      schema,
      hostTraditionId: content.traditionId,
      localRuleset: local,
      constants: readRivalConstants(content.registry),
    });
    const shelved = collectRecords(rival.participant.world, GRIMOIRE).filter(
      ({ row }) => row.holderKind === HOLDER_KIND.library,
    );
    expect(shelved.length).toBeGreaterThan(0);
  });

  it(
    'yields books to raiders at a live-peer rate',
    async () => {
      let raids = 0;
      let books = 0;
      for (let i = 0; i < 4; i += 1) {
        const result = await playPeerPair(
          content,
          { mode: 'standin', prep: 120, attacker: 'fresh', defender: 'standin' },
          7000 + 2 * i,
          7001 + 2 * i,
        );
        raids += result.raids.length;
        books += result.raids.reduce((n, r) => n + r.grimoiresCarried, 0);
      }
      // Positive control: there were raids to loot in.
      expect(raids).toBeGreaterThan(0);
      // Measured 8 books in 5 raids on seeds 7000–7011 (a live peer: 12 in 6).
      // At least one book per two raids is the floor this pins.
      expect(books * 2).toBeGreaterThanOrEqual(raids);
    },
    SLOW,
  );
});
