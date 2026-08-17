/*
 * Multiverse Mages — the half of the `cost` hook nobody was charging.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the LICENSE
 * file at the repository root, or <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * `castCost` was live in `arbitration.resolveCast`. `costSplit` — the function
 * whose whole purpose is that the two halves sum to the base price under every
 * kind — had no caller anywhere, on `main` or on any of 153 branches. So a
 * `prepaid` tradition was not a tradition that charges early; it was a tradition
 * that **charges nothing**: `resolveCast` returned `castCost(prepaid, …) === 0`
 * and `firstCastableNode` skips the affordability test outright when
 * `paidAtPreparation`. Vancian memorisation — the reference universe's own
 * tradition — cast for free and without limit.
 *
 * Two arms below, differing only in the host's `cost` kind, because a single-arm
 * assertion that a combatant's vigor is below her maximum cannot tell a charge
 * from a fixture.
 */

import { describe, expect, it } from 'vitest';

import type { Raid } from '@mm/rules-raid';
import { deployRaid, openPortal } from '@mm/rules-raid';
import { COMBATANT, COMBATANT_SOURCE_KIND, componentOf } from '@mm/state';

import {
  addMage,
  combat,
  emptyWorld,
  grid,
  knowledgeFor,
  participant,
  registry,
  ruleset,
  traditionId,
  tuning,
} from './raid-fixture.js';

/** Four damage nodes, so a `prepared` cast kind's four slots are all filled. */
const NODES = [
  'cig-the-uncontained-hour',
  'pm-blunt-the-edge',
  'pt-open-the-ground',
  'rl-step-across',
] as const;

const MAX_VIGOR = 64 * 1024;

function raidUnder(hostTradition: string): Raid {
  const attackerWorld = emptyWorld();
  const hostWorld = emptyWorld();
  const attackerKnowledge = knowledgeFor(attackerWorld);
  const hostKnowledge = knowledgeFor(hostWorld);

  const hostSnapshot = ruleset({ traditionId: traditionId(hostTradition) });
  const raiderSnapshot = ruleset({});
  addMage(attackerWorld, attackerKnowledge, { role: 1, nodes: NODES, vigor: MAX_VIGOR });
  addMage(hostWorld, hostKnowledge, { role: 2, nodes: [NODES[0]], vigor: MAX_VIGOR });

  const raid = openPortal({
    attacker: participant(
      attackerWorld,
      attackerKnowledge,
      raiderSnapshot,
      hostSnapshot.traditionId,
    ),
    host: participant(hostWorld, hostKnowledge, hostSnapshot, hostSnapshot.traditionId),
    registry,
    grid,
    combat,
    tuning,
    raidSeed: 0x1234_5678,
  });
  deployRaid(raid);
  return raid;
}

/** Every spawned mage's vigor and readied list, ascending by handle. */
function mages(raid: Raid): { vigor: number; prepared: number }[] {
  const store = componentOf(raid.engagement.entities, COMBATANT);
  const rows: { vigor: number; prepared: number }[] = [];
  for (const side of raid.rosters) {
    for (const brief of side.briefs) {
      if (brief.sourceKind !== COMBATANT_SOURCE_KIND.mage) continue;
      rows.push({
        vigor: store.get(brief.handle, 'vigor'),
        prepared: brief.preparedSpells.length,
      });
    }
  }
  return rows.sort((a, b) => a.vigor - b.vigor || a.prepared - b.prepared);
}

describe('a tradition that charges at preparation charges at preparation', () => {
  it('takes vigor off a raider who readied under a prepaid host, and none under a standard one', () => {
    // Vancian: `cast: prepared` with four slots, `cost: prepaid`. Every readied
    // spell is paid for the moment it is readied, so a mage who prepares four
    // and casts none has still spent the day.
    const prepaid = mages(raidUnder('vancian-memorization'));
    // True Naming: `cast: standard`, `cost: standard`. Nothing is readied in
    // advance and nothing is charged in advance.
    const atRelease = mages(raidUnder('true-naming'));

    expect(prepaid.length).toBeGreaterThan(0);
    expect(atRelease.length).toBe(prepaid.length);

    // The control arm, and it is the assertion that makes the other one mean
    // something: under a `standard` cost hook every combatant arrives at full
    // vigor, so a fixture that simply spawned tired mages would fail here.
    for (const mage of atRelease) expect(mage.vigor).toBe(MAX_VIGOR);

    // At least one raider readied something and paid for it.
    expect(prepaid.some((mage) => mage.prepared > 0 && mage.vigor < MAX_VIGOR)).toBe(true);
    // And nobody was charged for a list she does not hold.
    for (const mage of prepaid) {
      if (mage.prepared === 0) expect(mage.vigor).toBe(MAX_VIGOR);
    }
  });

  it('caps the readied list at the host cast hook’s slots', () => {
    // `prepare` refuses the fifth, which is the whole character of the kind and
    // the reason the list is built one node at a time rather than sliced.
    const prepaid = mages(raidUnder('vancian-memorization'));
    for (const mage of prepaid) expect(mage.prepared).toBeLessThanOrEqual(4);

    // Under a `standard` host cast kind there is no bound, because there is no
    // preparation: the list is everything she reaches.
    const standard = mages(raidUnder('true-naming'));
    expect(standard.some((mage) => mage.prepared > 0)).toBe(true);
  });
});
