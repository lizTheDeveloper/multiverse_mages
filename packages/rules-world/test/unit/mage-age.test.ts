/*
 * Multiverse Mages — age is derived from birthTick, at every point of use.
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

import { TIME_MODE, advanceClock, createClock, currentTick, enterEngagement } from '@mm/sim-core';
import { ageInMonths, normalizedAge } from '@mm/rules-world';

import { mageRow, shippedRegistry } from './mage-fixtures.js';
import { speciesById } from './species-fixtures.js';

const registry = shippedRegistry();
const draconic = speciesById(registry, 'draconic');
const orc = speciesById(registry, 'orc');

describe('age advances with the world clock', () => {
  it('is worldTick minus birthTick', () => {
    expect(ageInMonths(500, 120)).toBe(380);
    expect(ageInMonths(120, 120)).toBe(0);
  });

  it('is 12 greater after the clock advances 12 ticks and nothing else changes', () => {
    const clock = createClock();
    const mage = mageRow({ birthTick: currentTick(clock) });
    const before = ageInMonths(currentTick(clock), mage.birthTick);
    for (let i = 0; i < 12; i += 1) advanceClock(clock);
    expect(ageInMonths(currentTick(clock), mage.birthTick)).toBe(before + 12);
  });

  it('returns a negative age for a mage not yet born, rather than a plausible zero', () => {
    // A caller who has passed the wrong clock should see an impossible number.
    expect(ageInMonths(10, 40)).toBe(-30);
  });
});

describe('age does not advance during an engagement', () => {
  it('is unchanged however many engagement ticks are stepped', () => {
    // contracts.md §0 freezes world time for the two universes in a raid, and a
    // derived age inherits that for free — there is no engagement branch
    // anywhere in the derivation. A stored age would need somebody to remember
    // not to increment it, and nothing would tell them they had forgotten.
    const clock = createClock();
    for (let i = 0; i < 30; i += 1) advanceClock(clock);
    const birthTick = 4;
    const worldTick = clock.worldTick;
    const aged = ageInMonths(worldTick, birthTick);

    enterEngagement(clock);
    expect(clock.mode).toBe(TIME_MODE.engagement);
    for (let i = 0; i < 500; i += 1) advanceClock(clock);

    expect(clock.worldTick).toBe(worldTick);
    expect(ageInMonths(clock.worldTick, birthTick)).toBe(aged);
  });
});

describe('normalized age puts every species on one scale', () => {
  it('is fp(1024) at exactly the nominal lifespan, whatever the lifespan is', () => {
    expect(normalizedAge(draconic.lifespanMonths, draconic.lifespanMonths)).toBe(1024);
    expect(normalizedAge(orc.lifespanMonths, orc.lifespanMonths)).toBe(1024);
  });

  it('is fp(512) at half of it', () => {
    expect(normalizedAge(draconic.lifespanMonths / 2, draconic.lifespanMonths)).toBe(512);
    expect(normalizedAge(orc.lifespanMonths / 2, orc.lifespanMonths)).toBe(512);
  });

  it('falls when a lifespan effect lengthens the life', () => {
    // The mechanism behind "a blessing can save an old mage": the same age
    // against a longer lifespan is a younger normalized age, and therefore a
    // lower hazard on the next evaluation.
    const age = draconic.lifespanMonths;
    expect(normalizedAge(age, draconic.lifespanMonths + 9000)).toBeLessThan(
      normalizedAge(age, draconic.lifespanMonths),
    );
  });

  it('refuses a non-positive lifespan rather than returning a plausible number', () => {
    expect(() => normalizedAge(10, 0)).toThrow(/positive/u);
    expect(() => normalizedAge(10, -5)).toThrow(/positive/u);
  });

  it('rounds toward negative infinity, like every other division in the rules path', () => {
    // 17 months into an 18,000-month life really is normalized age zero.
    expect(normalizedAge(17, 18000)).toBe(0);
    expect(normalizedAge(18, 18000)).toBe(1);
  });
});
