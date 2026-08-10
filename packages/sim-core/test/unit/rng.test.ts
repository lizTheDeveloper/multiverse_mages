/*
 * Multiverse Mages — PCG32 generator and bounded-draw unit tests.
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

import {
  RNG_STREAM,
  cloneStream,
  deriveStream,
  nextBounded,
  nextUint32,
  rejectionThreshold,
  streamFromWords,
} from '@mm/sim-core';

const TWO_POW_32 = 4294967296;

describe('nextUint32', () => {
  it('produces unsigned 32-bit integers', () => {
    const rng = deriveStream(1, RNG_STREAM.mageBirth, 0);
    for (let i = 0; i < 10000; i += 1) {
      const value = nextUint32(rng);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(TWO_POW_32);
    }
  });

  it('advances the state, so successive draws differ', () => {
    const rng = deriveStream(7, RNG_STREAM.combat, 3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(nextUint32(rng));
    }
    // A 64-bit LCG cannot repeat a state within 1000 steps; collisions here
    // could only come from the output function, and 1000 draws from 2^32
    // values collide with probability ~1e-4. Anything worse means the state is
    // not advancing.
    expect(seen.size).toBeGreaterThan(995);
  });

  it('leaves the increment untouched while advancing the state', () => {
    const rng = streamFromWords(0x11111111, 0x22222222, 0x33333333, 0x44444445);
    const incHi = rng.words[2];
    const incLo = rng.words[3];
    for (let i = 0; i < 100; i += 1) {
      nextUint32(rng);
    }
    expect(rng.words[2]).toBe(incHi);
    expect(rng.words[3]).toBe(incLo);
  });
});

describe('streamFromWords', () => {
  it('forces the increment odd, which PCG requires for a full period', () => {
    const rng = streamFromWords(0, 0, 0, 108);
    expect(rng.words[3]).toBe(109);
  });

  it('stores exactly four unsigned 32-bit words', () => {
    const rng = streamFromWords(-1, -1, -1, -1);
    expect(rng.words).toBeInstanceOf(Uint32Array);
    expect(rng.words.length).toBe(4);
    expect(rng.words[0]).toBe(0xffffffff);
    expect(rng.words[1]).toBe(0xffffffff);
  });

  it('holds no floating-point values anywhere in its state', () => {
    const rng = deriveStream(0xdeadbeef, RNG_STREAM.research, 11);
    for (let i = 0; i < 100; i += 1) {
      nextUint32(rng);
      for (const word of rng.words) {
        expect(Number.isInteger(word)).toBe(true);
      }
    }
  });
});

describe('cloneStream', () => {
  it('reproduces the source sequence from the cloned position', () => {
    const source = deriveStream(42, RNG_STREAM.teaching, 5);
    nextUint32(source);
    nextUint32(source);

    const copy = cloneStream(source);
    const fromSource = [nextUint32(source), nextUint32(source), nextUint32(source)];
    const fromCopy = [nextUint32(copy), nextUint32(copy), nextUint32(copy)];
    expect(fromCopy).toEqual(fromSource);
  });

  it('does not share state with its source', () => {
    const source = deriveStream(42, RNG_STREAM.teaching, 5);
    const copy = cloneStream(source);
    nextUint32(copy);
    expect(Array.from(source.words)).not.toEqual(Array.from(copy.words));
    expect(source.words).not.toBe(copy.words);
  });
});

describe('rejectionThreshold', () => {
  const bounds = [
    1, 2, 3, 4, 5, 6, 7, 10, 13, 17, 20, 60, 99, 100, 101, 255, 256, 257, 1000, 1023, 1024, 1025,
    65535, 65536, 65537, 1000000, 2147483647, 2147483648, 2147483649, 3221225472, 4294967295,
    4294967296,
  ];

  it('leaves an accepted region that is an exact multiple of the bound', () => {
    // This is the whole proof that `accepted % bound` is unbiased. The accepted
    // values are exactly [threshold, 2^32), whose size is 2^32 - threshold. If
    // that size is an exact multiple of the bound, every residue class in
    // [0, bound) is hit by precisely the same number of 32-bit draws, so no
    // residue is more likely than any other.
    for (const bound of bounds) {
      const threshold = rejectionThreshold(bound);
      expect((TWO_POW_32 - threshold) % bound).toBe(0);
    }
  });

  it('discards fewer than `bound` values, so rejection is rare for small bounds', () => {
    for (const bound of bounds) {
      const threshold = rejectionThreshold(bound);
      expect(threshold).toBeGreaterThanOrEqual(0);
      expect(threshold).toBeLessThan(bound);
    }
  });

  it('is zero exactly when the bound divides 2^32', () => {
    for (const bound of bounds) {
      const divides = TWO_POW_32 % bound === 0;
      expect(rejectionThreshold(bound) === 0).toBe(divides);
    }
  });

  it('documents why naive modulo is biased', () => {
    // For any bound that does not divide 2^32, the naive `draw % bound` maps
    // (2^32 mod bound) extra draws onto the lowest residues, making those
    // outcomes strictly more likely. Every probability in the game would be
    // permanently, invisibly skewed by that amount.
    expect(TWO_POW_32 % 3).toBe(1);
    expect(TWO_POW_32 % 6).toBe(4);
    expect(TWO_POW_32 % 100).toBe(96);
    // 3/4 of the 32-bit range: a full quarter of draws would double-count.
    expect(TWO_POW_32 % 3221225472).toBe(1073741824);
    // And the rejection threshold is exactly the count of those extra draws.
    expect(rejectionThreshold(3)).toBe(1);
    expect(rejectionThreshold(6)).toBe(4);
    expect(rejectionThreshold(100)).toBe(96);
    expect(rejectionThreshold(3221225472)).toBe(1073741824);
  });

  it('rejects bounds outside [1, 2^32]', () => {
    expect(() => rejectionThreshold(0)).toThrow(RangeError);
    expect(() => rejectionThreshold(-1)).toThrow(RangeError);
    expect(() => rejectionThreshold(1.5)).toThrow(RangeError);
    expect(() => rejectionThreshold(TWO_POW_32 + 1)).toThrow(RangeError);
  });
});

describe('nextBounded', () => {
  it('stays inside the requested bound', () => {
    const rng = deriveStream(3, RNG_STREAM.mortality, 1);
    for (let i = 0; i < 20000; i += 1) {
      const value = nextBounded(rng, 6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
  });

  it('returns 0 for a bound of 1 without consuming an unbounded number of draws', () => {
    const rng = deriveStream(3, RNG_STREAM.mortality, 1);
    expect(nextBounded(rng, 1)).toBe(0);
  });

  it('is close to uniform over a small bound', () => {
    const rng = deriveStream(0x1a2b3c4d, RNG_STREAM.combat, 0);
    const counts = new Array<number>(6).fill(0);
    const samples = 60000;
    for (let i = 0; i < samples; i += 1) {
      const face = nextBounded(rng, 6);
      counts[face] = (counts[face] ?? 0) + 1;
    }
    const expected = samples / 6;
    for (const count of counts) {
      expect(Math.abs(count - expected)).toBeLessThan(expected * 0.05);
    }
  });

  it('actually rejects draws below the threshold and redraws', () => {
    // A bound of 3/4 of the 32-bit range rejects a quarter of all draws, which
    // makes the rejection loop observable instead of astronomically rare. The
    // parallel raw stream shows exactly which draws were consumed.
    const bound = 3221225472;
    const threshold = rejectionThreshold(bound);
    const bounded = deriveStream(0xabcdef01, RNG_STREAM.combat, 2);
    const raw = cloneStream(bounded);

    let rejections = 0;
    for (let i = 0; i < 500; i += 1) {
      const value = nextBounded(bounded, bound);

      // Replay the same underlying draws by hand: everything below the
      // threshold must have been discarded, and the first draw at or above it
      // must be the one that produced the returned value.
      let candidate = nextUint32(raw);
      while (candidate < threshold) {
        rejections += 1;
        candidate = nextUint32(raw);
      }
      expect(value).toBe(candidate % bound);
      expect(value).toBeLessThan(bound);
    }

    expect(rejections).toBeGreaterThan(0);
    // The bounded stream consumed precisely the draws the replay consumed —
    // no more, no fewer.
    expect(Array.from(bounded.words)).toEqual(Array.from(raw.words));
  });

  it('consumes one draw per call when no draw falls below the threshold', () => {
    // A bound that divides 2^32 has a zero threshold, so nothing is ever
    // rejected and the loop runs exactly once per call.
    const bounded = deriveStream(9, RNG_STREAM.scribing, 4);
    const raw = cloneStream(bounded);
    for (let i = 0; i < 200; i += 1) {
      expect(nextBounded(bounded, 256)).toBe(nextUint32(raw) % 256);
    }
    expect(Array.from(bounded.words)).toEqual(Array.from(raw.words));
  });

  it('accepts the full 32-bit bound', () => {
    const bounded = deriveStream(9, RNG_STREAM.scribing, 4);
    const raw = cloneStream(bounded);
    expect(nextBounded(bounded, TWO_POW_32)).toBe(nextUint32(raw));
  });

  it('rejects bounds outside [1, 2^32]', () => {
    const rng = deriveStream(1, RNG_STREAM.mortality, 0);
    expect(() => nextBounded(rng, 0)).toThrow(RangeError);
    expect(() => nextBounded(rng, -5)).toThrow(RangeError);
    expect(() => nextBounded(rng, 2.5)).toThrow(RangeError);
    expect(() => nextBounded(rng, TWO_POW_32 + 1)).toThrow(RangeError);
  });
});
