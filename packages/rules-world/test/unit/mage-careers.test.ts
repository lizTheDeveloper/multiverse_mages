/*
 * Multiverse Mages — aptitude sorts careers, and never sorts anyone out of
 * existence.
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

import { FP_ONE, RNG_STREAM } from '@mm/sim-core';
import { MAGE_ROLE } from '@mm/state';
import {
  ACADEMIC_CAREER_ROLE,
  ACADEMIC_CHANCE_CEILING,
  ACADEMIC_CHANCE_FLOOR,
  ACADEMIC_CHANCE_MIDPOINT,
  ACADEMIC_SCHOOLING_NUDGE,
  POPULACE_CAREER_ROLE,
  SCHOOLING_FULL_MARKS,
  academicChance,
  schoolingNudge,
  sortGraduateCareer,
} from '@mm/rules-world';

import { handleOf, recordingRng, shippedRegistry, stepRng } from './mage-fixtures.js';

const registry = shippedRegistry();
const species = registry.species.map((entry) => entry.record);
const NEUTRAL_SCHOOLING = SCHOOLING_FULL_MARKS / 2;

function speciesNamed(id: string): (typeof species)[number] {
  const found = species.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`the shipped content has no species ${id}`);
  return found;
}

describe('the career band never reaches certainty at either end', () => {
  it('leaves every shipped species strictly between always and never', () => {
    // The property the owner asked for, in one line: *"an uncertainty feel to
    // some of the mage careers as you get better"*. A bare `draw < aptitude`
    // would satisfy every other assertion in this file and fail this one for a
    // species at aptitude 1024.
    for (const record of species) {
      for (const held of [0, NEUTRAL_SCHOOLING, SCHOOLING_FULL_MARKS, 500]) {
        const chance = academicChance(record.mageAptitude, held);
        expect(chance).toBeGreaterThan(0);
        expect(chance).toBeLessThan(FP_ONE);
      }
    }
  });

  it('never binds its own clamp on the shipped content, which is the intended state', () => {
    // The clamp exists so that a *later* term — a golem bonus, an edict, a
    // tradition hook — cannot reach certainty by accident. If it is binding
    // today, the band itself has drifted and this test is the notice.
    for (const record of species) {
      for (const held of [0, SCHOOLING_FULL_MARKS * 4]) {
        const chance = academicChance(record.mageAptitude, held);
        expect(chance).toBeGreaterThan(ACADEMIC_CHANCE_FLOOR);
        expect(chance).toBeLessThan(ACADEMIC_CHANCE_CEILING);
      }
    }
  });

  it('gives the baseline species exactly the other half', () => {
    // *"The point of the mage aptitude was to create something for the other
    // half of people to do."* Human `mageAptitude` is 512, the fixed-point half,
    // and the species the author names the baseline of everything else. At
    // neutral schooling it maps to exactly half — arithmetically, not
    // approximately.
    const human = speciesNamed('human');
    expect(human.mageAptitude).toBe(FP_ONE / 2);
    expect(academicChance(human.mageAptitude, NEUTRAL_SCHOOLING)).toBe(ACADEMIC_CHANCE_MIDPOINT);
  });

  it('is monotone in aptitude, so a better species is never worse off', () => {
    let previous = 0;
    for (let aptitude = 1; aptitude <= FP_ONE; aptitude += 1) {
      const chance = academicChance(aptitude, NEUTRAL_SCHOOLING);
      expect(chance).toBeGreaterThanOrEqual(previous);
      previous = chance;
    }
    // And strictly better at the ends, or the trait would not be doing anything.
    expect(academicChance(FP_ONE, NEUTRAL_SCHOOLING)).toBeGreaterThan(
      academicChance(1, NEUTRAL_SCHOOLING),
    );
  });

  it('orders the shipped species the way their aptitudes do', () => {
    const ranked = [...species].sort((a, b) => a.mageAptitude - b.mageAptitude);
    const chances = ranked.map((record) => academicChance(record.mageAptitude, NEUTRAL_SCHOOLING));
    for (let index = 1; index < chances.length; index += 1) {
      expect(chances[index]).toBeGreaterThanOrEqual(chances[index - 1] as number);
    }
    // Orc is the least academic species and draconic the most, which is the
    // whole of what `mageAptitude` now says about a species.
    expect(ranked[0]?.id).toBe('orc');
    expect(ranked[ranked.length - 1]?.id).toBe('draconic');
  });

  it('rejects an aptitude outside the fixed-point fraction rather than clamping it', () => {
    // A content mistake must surface as a content mistake. The clamp would
    // otherwise turn `mageAptitude: 4096` into a plausible number.
    expect(() => academicChance(0, 0)).toThrow(/fixed-point fraction/u);
    expect(() => academicChance(FP_ONE + 1, 0)).toThrow(/fixed-point fraction/u);
    expect(() => academicChance(-1, 0)).toThrow(/fixed-point fraction/u);
  });
});

describe('schooling moves a career, symmetrically', () => {
  it('is neutral at half marks and equal-and-opposite at the ends', () => {
    // Symmetric, so adding the term does not silently raise the academic share
    // of every species by an amount nobody chose.
    expect(schoolingNudge(NEUTRAL_SCHOOLING)).toBe(0);
    expect(schoolingNudge(0)).toBe(-ACADEMIC_SCHOOLING_NUDGE);
    expect(schoolingNudge(SCHOOLING_FULL_MARKS)).toBe(ACADEMIC_SCHOOLING_NUDGE);
  });

  it('saturates rather than running away on a very deep graduate', () => {
    expect(schoolingNudge(SCHOOLING_FULL_MARKS * 100)).toBe(ACADEMIC_SCHOOLING_NUDGE);
  });

  it('separates two graduates of one species by what they were taught', () => {
    // *"University depth becomes the thing that matters, not just capacity."*
    // A god who funds a deeper school gets more academics out of it, and this is
    // the only place that is true.
    const human = speciesNamed('human');
    const shallow = academicChance(human.mageAptitude, 1);
    const deep = academicChance(human.mageAptitude, SCHOOLING_FULL_MARKS);
    expect(deep).toBeGreaterThan(shallow);
    expect(deep - shallow).toBe(ACADEMIC_SCHOOLING_NUDGE - schoolingNudge(1));
  });

  it('refuses a negative or fractional held count', () => {
    expect(() => schoolingNudge(-1)).toThrow(/non-negative integer/u);
    expect(() => schoolingNudge(1.5)).toThrow(/non-negative integer/u);
  });
});

describe('the sort itself', () => {
  it('takes exactly one draw, on the career stream, keyed on the mage', () => {
    // `contracts.md` §6, and `promotion.ts`'s own argument in miniature: a
    // graduating class of a hundred costs a hundred draws and not a hundred
    // squared, and a field the test can read is a claim the implementation has
    // to keep making.
    const rng = recordingRng(4242, 12);
    const mage = handleOf(7, 1);
    const outcome = sortGraduateCareer(rng, mage, 512, 12);
    expect(outcome.draws).toBe(1);
    expect(rng.drawsOn(RNG_STREAM.career)).toBe(1);
    expect(rng.drawsTaken()).toBe(1);
    expect(rng.issued).toEqual([{ subsystemId: RNG_STREAM.career, actorKey: mage }]);
  });

  it('draws on its own stream and not on mage birth', () => {
    // **The stream-splitting contract.** Borrowing `mageBirth` would mean that
    // adding a graduate re-rolled the personality of every mage enrolled in the
    // same tick, which is insertion variance arriving through the stream
    // registry instead of through an actor key.
    const rng = recordingRng(99, 3);
    sortGraduateCareer(rng, handleOf(2, 1), 768, 6);
    expect(rng.drawsOn(RNG_STREAM.mageBirth)).toBe(0);
    expect(RNG_STREAM.career).not.toBe(RNG_STREAM.mageBirth);
  });

  it('gives each graduate her own draw, so one more graduate re-rolls nobody', () => {
    const first = handleOf(11, 1);
    const second = handleOf(12, 1);
    const alone = sortGraduateCareer(stepRng(7, 5), second, 512, 12);
    // Sorting `first` beforehand must not change what `second` gets.
    sortGraduateCareer(stepRng(7, 5), first, 512, 12);
    const after = sortGraduateCareer(stepRng(7, 5), second, 512, 12);
    expect(after.draw).toBe(alone.draw);
    expect(after.role).toBe(alone.role);
  });

  it('returns one of exactly two roles, and neither is student', () => {
    const outcome = sortGraduateCareer(stepRng(5, 1), handleOf(3, 1), 512, 12);
    expect([ACADEMIC_CAREER_ROLE, POPULACE_CAREER_ROLE]).toContain(outcome.role);
    expect(outcome.role).not.toBe(MAGE_ROLE.student);
    expect(ACADEMIC_CAREER_ROLE).toBe(MAGE_ROLE.researcher);
    expect(POPULACE_CAREER_ROLE).toBe(MAGE_ROLE.populace);
  });

  it('realises its own chance, so the reported arithmetic is the arithmetic used', () => {
    // The expected value of a Bernoulli indicator is its `p`, so the measured
    // academic share over many handles must land on `chance / FP_ONE`. Asserted
    // against the *reported* chance rather than a recomputed one: a sort whose
    // `chance` field disagreed with the number it drew against would be
    // invisible to every other test here.
    for (const record of species) {
      let academic = 0;
      const trials = 4000;
      let chance = 0;
      for (let index = 1; index <= trials; index += 1) {
        const outcome = sortGraduateCareer(
          stepRng(1000 + index, 1),
          handleOf(index, 1),
          record.mageAptitude,
          NEUTRAL_SCHOOLING,
        );
        chance = outcome.chance;
        if (outcome.academic) academic += 1;
      }
      const expected = (chance / FP_ONE) * trials;
      // Three standard deviations of a fair binomial at this size is about 95
      // graduates; 200 is loose enough that a passing run is not luck and tight
      // enough that a factor-of-two error in the chance cannot pass.
      expect(Math.abs(academic - expected)).toBeLessThan(200);
    }
  });

  it('sends a real share of the best species into the populace anyway', () => {
    // The uncertainty, measured rather than asserted from the formula: at
    // draconic's aptitude of 896 — the highest the shipped content has — the
    // populace is still a common outcome. *"A high-aptitude mage is not
    // guaranteed the academic track."*
    const draconic = speciesNamed('draconic');
    let populace = 0;
    const trials = 2000;
    for (let index = 1; index <= trials; index += 1) {
      const outcome = sortGraduateCareer(
        stepRng(50000 + index, 2),
        handleOf(index, 1),
        draconic.mageAptitude,
        NEUTRAL_SCHOOLING,
      );
      if (!outcome.academic) populace += 1;
    }
    expect(populace / trials).toBeGreaterThan(0.2);
  });
});
