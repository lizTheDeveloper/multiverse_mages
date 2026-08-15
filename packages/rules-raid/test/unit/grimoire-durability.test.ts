/*
 * Multiverse Mages — a dwarven book outlives an orcish one, measurably.
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
 * `durability` was written once at scribing and read by nothing that ran.
 * `destroyGrimoire` and `destroyLibrary` had no production callers at all. So
 * the whole of vision §6's *"dwarven grimoires resist destruction"* — the one
 * line that makes the species table's `scribeAffinity` spread of 384 to 1792 a
 * playstyle rather than a number — was unreachable, and the raid path that was
 * supposed to reach it also chose the wrong thing with it: the roll decided
 * *looted* against *burned*, which are two spellings of the host losing the
 * book, so a dwarven library and an orcish one lost exactly the same amount.
 *
 * These tests are the mechanism, at the level of the thing it protects: books
 * on a shelf, a raid that reaches them, and how many are still there
 * afterwards. Twelve seeds rather than one, because a survival rate is what is
 * being asserted and a single raid is a single coin.
 */

import { describe, expect, it } from 'vitest';

import { GRIMOIRE, HOLDER_KIND, MAGE_ROLE, collectRecords } from '@mm/state';

import { applyRaidOutcome } from '../../src/consequences.js';
import { deployRaid } from '../../src/portal.js';
import { openPortal, runRaid } from '../../src/raid.js';
import {
  addMage,
  addUniversity,
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

/**
 * A shelf's worth of books, so a survival rate has something to be a rate of.
 *
 * Deliberately longer than `looted-grimoires-per-raid`: the first books off the
 * shelf are carried home whatever they are made of, and a shelf at or under the
 * loot cap would be emptied by the warband before a single fire was lit. Three
 * copies of four titles, because a library holding two copies of one book is an
 * ordinary library and duplicate nodes are what redundancy *is*.
 */
const TITLES: readonly string[] = Object.freeze([
  'rl-open-the-portal',
  'cig-the-uncontained-hour',
  'im-read-the-surface',
  'rt-set-the-stone',
]);
const SHELF: readonly string[] = Object.freeze([...TITLES, ...TITLES, ...TITLES]);

/**
 * `scribeAffinity` is the durability a book is scribed with, plus a roll of at
 * most 255. These are the two ends of the shipped species table.
 */
const ORCISH = 384;
const DWARVEN = 1792;

const SEEDS: readonly number[] = Object.freeze(
  Array.from({ length: 12 }, (_, index) => 0x5eed_0000 + index * 0x9e37),
);

/** One raid against a library shelved at one durability. */
function raidOn(durability: number, seed: number): { survivors: number; looted: number } {
  const attackerWorld = emptyWorld();
  const hostWorld = emptyWorld();
  const attackerKnowledge = knowledgeFor(attackerWorld);
  const hostKnowledge = knowledgeFor(hostWorld);

  const hostSnapshot = ruleset({ traditionId: traditionId('vancian-memorization') });
  const raiderSnapshot = ruleset({});

  addMage(attackerWorld, attackerKnowledge, {
    role: MAGE_ROLE.raider,
    nodes: ['cig-the-uncontained-hour', 'im-read-the-surface'],
  });
  addMage(hostWorld, hostKnowledge, { role: MAGE_ROLE.warden, nodes: ['cig-the-uncontained-hour'] });
  const { library } = addUniversity(hostWorld, hostKnowledge, SHELF, durability);

  const raid = openPortal({
    attacker: participant(attackerWorld, attackerKnowledge, raiderSnapshot, hostSnapshot.traditionId),
    host: participant(hostWorld, hostKnowledge, hostSnapshot, hostSnapshot.traditionId),
    registry,
    grid,
    combat,
    tuning,
    raidSeed: seed,
  });
  deployRaid(raid);
  applyRaidOutcome(raid, runRaid(raid));

  return {
    survivors: collectRecords(hostWorld, GRIMOIRE).filter(
      (entry) => entry.row.holderKind === HOLDER_KIND.library && entry.row.holderId === library,
    ).length,
    // Books that crossed the portal. The raider's world had none before.
    looted: collectRecords(attackerWorld, GRIMOIRE).length,
  };
}

function survivorsOf(durability: number, seed: number): number {
  return raidOn(durability, seed).survivors;
}

function lootedBy(durability: number, seed: number): number {
  return raidOn(durability, seed).looted;
}

function totalSurvivors(durability: number): number {
  return SEEDS.reduce((sum, seed) => sum + survivorsOf(durability, seed), 0);
}

function totalLooted(durability: number): number {
  return SEEDS.reduce((sum, seed) => sum + lootedBy(durability, seed), 0);
}

describe('a raid burns a library, and durability decides how much of it', () => {
  it('destroys books that would otherwise have survived the run forever', () => {
    // The floor of the claim: without this path there is no way at all for a
    // written copy to be destroyed by anything other than the god's own
    // interdiction. An orcish shelf must actually lose books.
    expect(totalSurvivors(ORCISH)).toBeLessThan(SHELF.length * SEEDS.length);
  });

  it('carries books home, so the raider gains what the host lost', () => {
    // §8's other verb. A raid that only burned would make every rival universe
    // a thing to vandalise rather than a thing to take from, and the 249 nodes
    // outside this content set's enabled cells would stay out of reach of
    // every strategy for ever.
    //
    // Summed over the seed set rather than asserted on `SEEDS[0]`, and the
    // change is a real behavioural finding rather than a test being loosened.
    // `withdraw-after-ticks` gives a raider a deadline: she now leaves at tick
    // 56 whether or not she reached the shelf, so **reaching a library is a
    // race she can lose**, and on this two-mage fixture she usually does. It
    // used to be unconditional because she never left at all — she stood on the
    // field until the portal collapsed, and the stranded-raider rule killed her
    // holding the books.
    //
    // The claim being made is that the looting *path* is live and reachable,
    // which is what the 249 unreachable nodes depend on. How often it wins the
    // race is a tuning question, and one this fixture is the wrong instrument
    // for: the scenario-scale measurement is in `scripts/w182-withdrawal.mjs`,
    // where 208 raids across four seeds loot 246 nodes.
    expect(totalLooted(ORCISH)).toBeGreaterThan(0);
  });

  it('leaves a dwarven shelf measurably fuller than an orcish one', () => {
    // §6, given a number. `fp(384)` against `fp(922)` — the burn-resist cap — is
    // roughly a 37% survival rate against roughly 90%, so this is not a close
    // call and does not need a tolerance.
    expect(totalSurvivors(DWARVEN)).toBeGreaterThan(totalSurvivors(ORCISH));
  });

  it('does not make a dwarven book fireproof', () => {
    // The cap is the point: `grimoire-burn-resist-cap` is `fp(922)`, the same
    // ceiling §3 puts on ward. A shelf that never lost a book would make the
    // dwarf's line a immunity rather than a resistance.
    expect(totalSurvivors(DWARVEN)).toBeLessThan(SHELF.length * SEEDS.length);
  });
});
