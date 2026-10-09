/*
 * Multiverse Mages — a stolen or witnessed node outlives the raid that brought it.
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
 * Until 2026-10-09 theft and exposure wrote the node into a mind at mastery
 * `0`, and `decayHeldKnowledge` destroys a held instance whose mastery reaches
 * `0` — so every stolen node vanished on the first world tick after the raid
 * (#256: every looted node observed was a captured book). This drives the
 * shipped sixty-seed warband, applies each outcome, runs the attacker's decay
 * sweep for {@link HOLD_TICKS} world ticks, and asserts each delivered theft is
 * still held by its thief.
 */

import { describe, expect, it } from 'vitest';

import { decayHeldKnowledge } from '@mm/rules-magic';
import { LOCATION_KIND } from '@mm/state';

import { grid, ruleset } from './raid-fixture.js';
import { resolveWarband } from './warband.js';

/** Two in-game years of decay after the raid. */
const HOLD_TICKS = 24;

const FIRE = 'cig-the-uncontained-hour';
const MIND_READING = 'im-read-the-surface';

describe('a theft outlives the raid', () => {
  it(`keeps every delivered stolen node held by its thief ${String(HOLD_TICKS)} ticks later`, () => {
    let delivered = 0;
    let survived = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const result = resolveWarband({
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
        hostShelves: ['rl-open-the-portal', FIRE],
        seed,
      });
      const knowledge = result.raid.attacker.knowledge;
      const stolen = new Set<number>();
      for (const movement of result.outcome.knowledgeMovements) {
        if (movement.verb === 'copied' && !movement.forfeited) stolen.add(movement.nodeId);
      }
      if (stolen.size === 0) continue;
      // Every attacker mind instance of each stolen node, right after the raid.
      // Some are older than the theft (the warband may know the node already);
      // those survive either way, so a lost theft shows as a lower count.
      const holdersOf = (node: number): number[] =>
        knowledge
          .instances()
          .map((instance) => knowledge.read(instance))
          .filter((view) => view.nodeId === node && view.locationKind === LOCATION_KIND.mind)
          .map((view) => view.locationId);
      const before = new Map([...stolen].map((node) => [node, holdersOf(node).length]));

      for (let tick = 1; tick <= HOLD_TICKS; tick += 1) {
        decayHeldKnowledge({
          knowledge,
          cells: grid,
          ruleset: ruleset({}),
          elapsedTicks: 1,
          worldTick: result.attackerWorld.clock.worldTick + tick,
          retentionOf: () => 1024,
        });
      }
      for (const [node, count] of before) {
        delivered += count;
        survived += holdersOf(node).length;
      }
    }
    // Positive control: thefts were delivered at all.
    expect(delivered).toBeGreaterThan(0);
    expect(survived).toBe(delivered);
  });
});
