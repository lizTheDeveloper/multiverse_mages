/*
 * Multiverse Mages — personality is rolled once, from species means, and never
 * changes.
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
import {
  PERSONALITY_CEILING,
  PERSONALITY_DEVIATION,
  PERSONALITY_FLOOR,
  PERSONALITY_TUNING_STATUS,
  assignRole,
  changeAffiliation,
  createMage,
  personalityMeans,
  rollPersonality,
} from '@mm/rules-world';
import { MAGE_ROLE } from '@mm/state';

import { handleOf, recordingRng, stepRng } from './mage-fixtures.js';
import { shippedRegistry } from './mage-fixtures.js';
import { speciesById } from './species-fixtures.js';

const registry = shippedRegistry();
const gnome = speciesById(registry, 'gnome');
const dwarf = speciesById(registry, 'dwarf');

/** Rolls a population of one species and returns the three axes as arrays. */
function rollMany(
  species: (typeof registry)['species'][number]['record'],
  population: number,
  seed: number,
): { curiosity: number[]; ambition: number[]; caution: number[] } {
  const rng = stepRng(seed, 0);
  const curiosity: number[] = [];
  const ambition: number[] = [];
  const caution: number[] = [];
  for (let slot = 1; slot <= population; slot += 1) {
    const rolled = rollPersonality(rng, handleOf(slot, 1), species);
    curiosity.push(rolled.curiosity);
    ambition.push(rolled.ambition);
    caution.push(rolled.caution);
  }
  return { curiosity, ambition, caution };
}

const meanOf = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

describe('the means come from the species, asymmetrically and on purpose', () => {
  it('centres curiosity on the species trait and the other two on fp(1024)', () => {
    for (const entry of registry.species) {
      const means = personalityMeans(entry.record);
      expect(means.curiosity).toBe(entry.record.curiosity);
      expect(means.ambition).toBe(FP_ONE);
      expect(means.caution).toBe(FP_ONE);
    }
  });

  it('lets a species override a mean through the optional personality block', () => {
    // contracts.md §2.4 carries the block; a field the rules path ignored would
    // be worse than no field.
    const overridden = { ...dwarf, personality: { curiosity: 111, ambition: 222, caution: 333 } };
    expect(personalityMeans(overridden)).toEqual({ curiosity: 111, ambition: 222, caution: 333 });
  });

  it('declares the deviation untuned', () => {
    expect(PERSONALITY_TUNING_STATUS).toBe('untuned');
  });
});

describe('curiosity tracks the species mean', () => {
  it('gives the more curious species the higher rolled mean on one seed', () => {
    const curious = rollMany(gnome, 512, 20260810);
    const incurious = rollMany(dwarf, 512, 20260810);
    expect(gnome.curiosity).toBeGreaterThan(dwarf.curiosity);
    expect(meanOf(curious.curiosity)).toBeGreaterThan(meanOf(incurious.curiosity));
  });

  it('keeps every rolled value inside the deviation of its mean', () => {
    for (const entry of registry.species) {
      const rolled = rollMany(entry.record, 128, 7);
      for (const value of rolled.curiosity) {
        expect(Math.abs(value - entry.record.curiosity)).toBeLessThanOrEqual(PERSONALITY_DEVIATION);
      }
    }
  });
});

describe('ambition and caution are species-neutral', () => {
  it('rolls both around fp(1024) for every species, exactly', () => {
    // Mechanical rather than statistical: the declared mean *is* fp(1024), and
    // the deviation is symmetric, so the expectation is fp(1024) with no
    // sampling argument required.
    for (const entry of registry.species) {
      expect(personalityMeans(entry.record).ambition).toBe(FP_ONE);
      expect(personalityMeans(entry.record).caution).toBe(FP_ONE);
    }
  });

  it('lands near fp(1024) empirically too, for every species', () => {
    for (const entry of registry.species) {
      const rolled = rollMany(entry.record, 1024, 4242);
      expect(Math.abs(meanOf(rolled.ambition) - FP_ONE)).toBeLessThan(24);
      expect(Math.abs(meanOf(rolled.caution) - FP_ONE)).toBeLessThan(24);
    }
  });

  it('cannot clamp any shipped species, which is why the symmetry survives', () => {
    // Clamping is one-sided, so a deviation wide enough to reach the ceiling
    // would pull the realised mean back toward the centre for extreme species
    // only — the "expected mean is the declared mean" property would then hold
    // for four species and silently fail for two.
    for (const entry of registry.species) {
      expect(entry.record.curiosity - PERSONALITY_DEVIATION).toBeGreaterThanOrEqual(
        PERSONALITY_FLOOR,
      );
      expect(entry.record.curiosity + PERSONALITY_DEVIATION).toBeLessThanOrEqual(
        PERSONALITY_CEILING,
      );
    }
  });
});

describe('the three axes are drawn independently', () => {
  it('does not give one mage three identical values', () => {
    // The defect a fresh `actorStream` per axis produces: every call returns a
    // cursor at position zero, so all three axes read the same draw. Perfectly
    // deterministic, perfectly reproducible, and wrong.
    const rolled = rollMany(dwarf, 256, 5150);
    let collisions = 0;
    for (let i = 0; i < rolled.ambition.length; i += 1) {
      if (rolled.ambition[i] === rolled.caution[i]) collisions += 1;
    }
    // Two independent draws over 513 outcomes collide about once in 513, so a
    // handful across 256 mages is expected and 256 of them is the bug.
    expect(collisions).toBeLessThan(8);
  });

  it('takes its draws on stream 1, keyed on the mage handle', () => {
    const rng = recordingRng(11, 0);
    const mage = handleOf(3, 2);
    rollPersonality(rng, mage, dwarf);
    expect(rng.issued).toEqual([{ subsystemId: RNG_STREAM.mageBirth, actorKey: mage }]);
    expect(rng.drawsOn(RNG_STREAM.mageBirth)).toBeGreaterThanOrEqual(3);
  });
});

describe('personality is reproducible and immutable', () => {
  it('gives every mage identical values in identical order across two runs', () => {
    expect(rollMany(gnome, 64, 909)).toEqual(rollMany(gnome, 64, 909));
  });

  it('is unchanged by ageing, role changes, affiliation changes and death', () => {
    const mage = handleOf(11, 1);
    const record = createMage(stepRng(606, 0), mage, dwarf, 3, 100);
    const born = { curiosity: record.curiosity, ambition: record.ambition, caution: record.caution };

    // Ageing is derived, so no write exists to make; the other three are the
    // writes that do exist, and none of them touches personality.
    assignRole(record, MAGE_ROLE.professor);
    changeAffiliation(record, 4242);
    record.alive = 0;

    expect({
      curiosity: record.curiosity,
      ambition: record.ambition,
      caution: record.caution,
    }).toEqual(born);
  });

  it('gives a reused entity slot a different personality', () => {
    // The generation counter is what makes slot reuse safe. Without it, the
    // mage who inherits a dead mage's slot inherits her rolls too.
    const rng = stepRng(2024, 0);
    const first = rollPersonality(rng, handleOf(9, 1), gnome);
    const second = rollPersonality(rng, handleOf(9, 2), gnome);
    expect(second).not.toEqual(first);
  });
});
