/*
 * Multiverse Mages — the partial detachment a fragmented cohort could never field.
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
 * `deploySide` fielded `floor(count / detachmentStrength)` detachments per
 * cohort, and `detachment-strength` is an authored **100**. Cohorts are keyed on
 * species × occupation × birth decade (`contracts.md` §1.3), so a soldiery of a
 * few thousand is scattered across dozens of cohorts well under a hundred — and
 * every one of them fielded nothing, for every seed, forever.
 *
 * The fix is the idiom `promotion.ts` argues for and `carrying-capacity.ts`
 * reuses: floor the count, then take **one** draw against the fixed-point
 * remainder. This file is organised around the four ways that could be got
 * wrong rather than around the code:
 *
 * - **The negative control still holds.** A cohort at exactly a whole multiple
 *   fields exactly that many, on every seed. If the draw leaked into the whole
 *   part this is where it shows.
 * - **The positive control fires.** A sixty-person cohort fields a detachment on
 *   some seeds and not others — the observation the old code could not produce,
 *   and the one that separates "the fix works" from "the harness never asked".
 * - **The expectation is right, not merely non-zero.** Sixty over a hundred
 *   seeds lands near sixty per cent; a draw compared against the wrong bound
 *   would still be non-constant and would miss here.
 * - **The cohort is never billed for people it does not have.** The partial
 *   detachment records `remaining`, not the authored hundred. `consequences.ts`
 *   clamps a cohort at zero and calls over-lending *"a bug in derivation"*;
 *   this is the derivation.
 */

import { describe, expect, it } from 'vitest';

import { COMBATANT_SOURCE_KIND, MAGE_ROLE, RAID_SIDE } from '@mm/state';
import { deployRaid, openPortal } from '@mm/rules-raid';

import {
  addMage,
  addSoldiers,
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

/** Detachments the attacker deploys from one soldier cohort of `soldiers`. */
function detachments(soldiers: number, seed: number): { count: number; strengths: number[] } {
  const attackerWorld = emptyWorld();
  const hostWorld = emptyWorld();
  const attackerKnowledge = knowledgeFor(attackerWorld);
  const hostKnowledge = knowledgeFor(hostWorld);
  const snapshot = ruleset({ traditionId: traditionId('art-of-memory') });

  addMage(attackerWorld, attackerKnowledge, { role: MAGE_ROLE.raider, nodes: ['pm-the-empty-room'] });
  addMage(hostWorld, hostKnowledge, { role: MAGE_ROLE.warden, nodes: ['cf-the-fated-hand'] });
  addUniversity(hostWorld, hostKnowledge, ['rl-open-the-portal']);
  addSoldiers(attackerWorld, soldiers);

  const raid = openPortal({
    attacker: participant(attackerWorld, attackerKnowledge, snapshot, snapshot.traditionId),
    host: participant(hostWorld, hostKnowledge, snapshot, snapshot.traditionId),
    registry,
    grid,
    combat,
    tuning,
    raidSeed: seed,
  });
  deployRaid(raid);

  const strengths = raid.rosters[RAID_SIDE.attacker].briefs
    .filter((brief) => brief.sourceKind === COMBATANT_SOURCE_KIND.soldierDetachment)
    .map((brief) => brief.detachmentStrength);
  return { count: strengths.length, strengths };
}

/** The same hundred seeds every run — this is a measurement, not a sample. */
const SEEDS = Array.from({ length: 100 }, (_, index) => (index + 1) * 7919);

describe('a cohort below detachment strength', () => {
  it('is the authored 100, so the whole regime under test is real', () => {
    expect(tuning.detachmentStrength).toBe(100);
  });

  it('fields exactly the whole part when there is no remainder, on every seed', () => {
    for (const seed of SEEDS) {
      expect(detachments(200, seed).count, `seed ${String(seed)}`).toBe(2);
    }
  });

  it('never fields a detachment standing for nobody', () => {
    // The `remaining > 0` guard, exercised where it actually bites: at an exact
    // multiple the remainder is zero, the draw is still taken — it must be, or
    // the draw count would depend on the data — and `nextBounded(stream, 100)`
    // can return 0, which is not less than 0. Without the guard a `0 < 0`
    // slip would field a detachment of strength zero: a full-strength
    // combatant on the field that costs its cohort nobody when it dies.
    for (const seed of SEEDS) {
      for (const strength of detachments(100, seed).strengths) {
        expect(strength, `seed ${String(seed)}`).toBe(100);
      }
    }
    // And a cohort of nobody is filtered before deployment ever sees it, by
    // `eligibleCohorts`. Asserted here so the two reasons are not confused.
    for (const seed of SEEDS.slice(0, 20)) expect(detachments(0, seed).count).toBe(0);
  });

  it('fields a detachment on some seeds and not others — the old code fielded none', () => {
    const fielded = SEEDS.map((seed) => detachments(60, seed).count);
    expect(fielded.some((each) => each === 1)).toBe(true);
    expect(fielded.some((each) => each === 0)).toBe(true);
    expect(Math.max(...fielded)).toBe(1);
  });

  it('fields it at the remainder rate, not merely sometimes', () => {
    const fielded = SEEDS.filter((seed) => detachments(60, seed).count === 1).length;
    // 60% of 100 draws. A draw compared against the wrong bound is non-constant
    // too, so the interval is what makes this an assertion about the rate.
    expect(fielded).toBeGreaterThan(45);
    expect(fielded).toBeLessThan(75);
  });

  it('is monotone in the cohort: more people, more detachments fielded', () => {
    const rate = (soldiers: number): number =>
      SEEDS.filter((seed) => detachments(soldiers, seed).count > 0).length;
    expect(rate(10)).toBeLessThan(rate(50));
    expect(rate(50)).toBeLessThan(rate(90));
  });

  it('bills the cohort for the people it lent, never for a full hundred', () => {
    for (const seed of SEEDS) {
      const { strengths } = detachments(160, seed);
      // One whole detachment always, and a sixty-person remainder sometimes.
      expect(strengths[0]).toBe(100);
      if (strengths.length === 2) expect(strengths[1]).toBe(60);
      expect(strengths.reduce((sum, each) => sum + each, 0)).toBeLessThanOrEqual(160);
    }
  });
});
