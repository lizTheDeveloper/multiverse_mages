/*
 * Multiverse Mages — stream derivation and stream-independence tests.
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

import type { RngStream } from '@mm/sim-core';
import { RNG_STREAM, deriveStream, nextBounded, nextUint32 } from '@mm/sim-core';

function take(rng: RngStream, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    values.push(nextUint32(rng));
  }
  return values;
}

/** Every value one run of the toy simulation drew, grouped by subsystem. */
interface DrawLog {
  readonly birth: number[];
  readonly mortality: number[];
  readonly combat: number[];
}

/**
 * A toy simulation that draws from three subsystem streams over several world
 * ticks. `extraMortalityDraws` stands in for a future change adding a new
 * random decision inside the mortality subsystem — the exact thing that must
 * not disturb anybody else's numbers.
 */
function runSimulation(rootSeed: number, ticks: number, extraMortalityDraws: number): DrawLog {
  const log: DrawLog = { birth: [], mortality: [], combat: [] };

  for (let tick = 0; tick < ticks; tick += 1) {
    const birth = deriveStream(rootSeed, RNG_STREAM.mageBirth, tick);
    log.birth.push(nextBounded(birth, 100), nextBounded(birth, 100));

    const mortality = deriveStream(rootSeed, RNG_STREAM.mortality, tick);
    log.mortality.push(nextBounded(mortality, 1000));
    for (let extra = 0; extra < extraMortalityDraws; extra += 1) {
      log.mortality.push(nextBounded(mortality, 1000));
    }

    const combat = deriveStream(rootSeed, RNG_STREAM.combat, tick);
    log.combat.push(nextUint32(combat), nextBounded(combat, 20));
  }

  return log;
}

/**
 * The same toy simulation written the way it would be if every subsystem
 * shared one stream — which is what stream splitting exists to prevent. This is
 * the control: the independence test is only meaningful if the arrangement it
 * rules out would genuinely have failed.
 */
function runSharedStreamSimulation(
  rootSeed: number,
  ticks: number,
  extraMortalityDraws: number,
): DrawLog {
  const log: DrawLog = { birth: [], mortality: [], combat: [] };
  const shared = deriveStream(rootSeed, RNG_STREAM.mageBirth, 0);

  for (let tick = 0; tick < ticks; tick += 1) {
    log.birth.push(nextBounded(shared, 100), nextBounded(shared, 100));
    log.mortality.push(nextBounded(shared, 1000));
    for (let extra = 0; extra < extraMortalityDraws; extra += 1) {
      log.mortality.push(nextBounded(shared, 1000));
    }
    log.combat.push(nextUint32(shared), nextBounded(shared, 20));
  }

  return log;
}

describe('stream derivation is reproducible', () => {
  it('yields identical sequences for identical (rootSeed, subsystemId, tick)', () => {
    const first = deriveStream(0x5eed1234, RNG_STREAM.research, 97);
    const second = deriveStream(0x5eed1234, RNG_STREAM.research, 97);
    expect(Array.from(first.words)).toEqual(Array.from(second.words));
    expect(take(first, 64)).toEqual(take(second, 64));
  });

  it('yields different sequences for different subsystems at the same tick', () => {
    const a = take(deriveStream(11, RNG_STREAM.mortality, 4), 32);
    const b = take(deriveStream(11, RNG_STREAM.combat, 4), 32);
    expect(a).not.toEqual(b);
    expect(a.filter((value, index) => value === b[index])).toEqual([]);
  });

  it('yields different sequences for the same subsystem at different ticks', () => {
    const a = take(deriveStream(11, RNG_STREAM.mortality, 4), 32);
    const b = take(deriveStream(11, RNG_STREAM.mortality, 5), 32);
    expect(a.filter((value, index) => value === b[index])).toEqual([]);
  });

  it('yields different sequences for adjacent root seeds', () => {
    // Nearby seeds must not produce correlated streams; a weak mixer would show
    // up here as shared prefixes.
    const a = take(deriveStream(1000, RNG_STREAM.teaching, 0), 32);
    const b = take(deriveStream(1001, RNG_STREAM.teaching, 0), 32);
    expect(a.filter((value, index) => value === b[index])).toEqual([]);
  });

  it('rejects inputs outside the unsigned 32-bit domain', () => {
    expect(() => deriveStream(-1, RNG_STREAM.mortality, 0)).toThrow(RangeError);
    expect(() => deriveStream(0, -1, 0)).toThrow(RangeError);
    expect(() => deriveStream(0, RNG_STREAM.mortality, -1)).toThrow(RangeError);
    expect(() => deriveStream(1.5, RNG_STREAM.mortality, 0)).toThrow(RangeError);
    expect(() => deriveStream(4294967296, RNG_STREAM.mortality, 0)).toThrow(RangeError);
    expect(() => deriveStream(0, RNG_STREAM.mortality, 4294967296)).toThrow(RangeError);
  });
});

describe('the root seed determines everything', () => {
  it('reproduces every drawn value across two runs at the same seed', () => {
    expect(runSimulation(0xc0ffee, 12, 0)).toEqual(runSimulation(0xc0ffee, 12, 0));
  });

  it('produces different values at a different seed', () => {
    const a = runSimulation(0xc0ffee, 12, 0);
    const b = runSimulation(0xc0ffef, 12, 0);
    expect(a.birth).not.toEqual(b.birth);
    expect(a.mortality).not.toEqual(b.mortality);
    expect(a.combat).not.toEqual(b.combat);
  });
});

describe('streams are independent', () => {
  const rootSeed = 0x13579bdf;
  const ticks = 12;
  const baseline = runSimulation(rootSeed, ticks, 0);
  const withExtraDraws = runSimulation(rootSeed, ticks, 3);

  it('leaves every other subsystem untouched when a subsystem adds draws', () => {
    expect(withExtraDraws.birth).toEqual(baseline.birth);
    expect(withExtraDraws.combat).toEqual(baseline.combat);
  });

  it('keeps the changed subsystem’s original draw at each tick', () => {
    // The added draws come after the original one within a tick, and the tick's
    // stream is re-derived, so the original value at every tick survives.
    for (let tick = 0; tick < ticks; tick += 1) {
      expect(withExtraDraws.mortality[tick * 4]).toBe(baseline.mortality[tick]);
    }
  });

  it('really did change the run, so the test above is not vacuous', () => {
    expect(withExtraDraws.mortality.length).toBe(baseline.mortality.length * 4);
    expect(withExtraDraws.mortality).not.toEqual(baseline.mortality);
  });

  it('would have shifted every other subsystem had the streams been shared', () => {
    const sharedBaseline = runSharedStreamSimulation(rootSeed, ticks, 0);
    const sharedWithExtra = runSharedStreamSimulation(rootSeed, ticks, 3);
    expect(sharedWithExtra.birth).not.toEqual(sharedBaseline.birth);
    expect(sharedWithExtra.combat).not.toEqual(sharedBaseline.combat);
  });

  it('is unaffected by how many draws a subsystem took in an earlier tick', () => {
    // Draining one tick's stream must not bleed into the next tick, because the
    // next tick's stream is derived from the tick number rather than continued.
    const drained = deriveStream(rootSeed, RNG_STREAM.mortality, 0);
    for (let i = 0; i < 10000; i += 1) {
      nextUint32(drained);
    }
    const nextTick = take(deriveStream(rootSeed, RNG_STREAM.mortality, 1), 8);
    const nextTickAgain = take(deriveStream(rootSeed, RNG_STREAM.mortality, 1), 8);
    expect(nextTick).toEqual(nextTickAgain);
  });
});

describe('the subsystem stream registry', () => {
  it('matches the permanent IDs in docs/design/contracts.md §6', () => {
    expect(RNG_STREAM).toEqual({
      mageBirth: 1,
      mortality: 2,
      research: 3,
      teaching: 4,
      scribing: 5,
      populace: 6,
      autonomy: 7,
      combat: 8,
      knowledgeTheft: 9,
      objectives: 10,
      terrain: 11,
      openingSquare: 12,
      // 15 rather than 13: three branches appended at once and the ids follow
      // merge order (#170 → 13, #186 → 14, this → 15). See `streams.ts`.
      career: 15,
    });
  });

  it('assigns every subsystem a distinct ID', () => {
    const ids = Object.values(RNG_STREAM);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
