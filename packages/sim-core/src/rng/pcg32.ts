/*
 * Multiverse Mages — PCG32 generator over Uint32Array state.
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
 * PCG XSH-RR 64/32 — a 64-bit linear congruential counter whose output is a
 * permuted 32-bit function of the *previous* counter value.
 *
 * Two properties are why it is here rather than a simpler xorshift:
 *
 * - The increment selects a **stream**. Any odd 64-bit increment gives a
 *   distinct full-period sequence over the same state space, which is exactly
 *   the "one stream per subsystem" requirement, at zero cost.
 * - The state is a pure counter. Nothing about a draw depends on how many
 *   draws happened before it in some other part of the program.
 *
 * The 64-bit arithmetic is done in four 32-bit words held in a `Uint32Array`,
 * with `Math.imul` and 16-bit partial products, so there is no `BigInt` (slow,
 * allocating) and no floating point (the ban, and the whole point). Every
 * intermediate value stays inside the exact-integer range of a double, so the
 * result is bit-identical on every engine.
 */

/** Index of the high word of the 64-bit counter. */
const STATE_HI = 0;
/** Index of the low word of the 64-bit counter. */
const STATE_LO = 1;
/** Index of the high word of the 64-bit increment (the stream selector). */
const INC_HI = 2;
/** Index of the low word of the 64-bit increment. Always odd. */
const INC_LO = 3;

/** The PCG multiplier, 6364136223846793005, split into 32-bit halves. */
const MULT_HI = 0x5851f42d;
const MULT_LO = 0x4c957f2d;

/** 2^32. Not a bit-width constant — it is the size of the draw space. */
const UINT32_COUNT = 4294967296;
const UINT32_MAX = 4294967295;

/**
 * A cursor into one subsystem's random stream.
 *
 * `words` is `[stateHi, stateLo, incHi, incLo]`. Drawing advances the state
 * words in place; the increment words never change. The array is exposed rather
 * than hidden because a stream is part of simulation state and will be
 * serialized verbatim by the snapshot format — four words, no object graph.
 */
export interface RngStream {
  readonly words: Uint32Array;
}

/**
 * Builds a stream from explicit 64-bit state and increment words.
 *
 * The increment is forced odd, which PCG requires: an even increment costs the
 * generator its full period and can collapse it entirely.
 */
export function streamFromWords(
  stateHi: number,
  stateLo: number,
  incHi: number,
  incLo: number,
): RngStream {
  const words = new Uint32Array(4);
  words[STATE_HI] = stateHi >>> 0;
  words[STATE_LO] = stateLo >>> 0;
  words[INC_HI] = incHi >>> 0;
  words[INC_LO] = (incLo | 1) >>> 0;
  return { words };
}

/** Copies a stream, including its position. The copy draws independently. */
export function cloneStream(rng: RngStream): RngStream {
  return { words: Uint32Array.from(rng.words) };
}

/**
 * Draws the next unsigned 32-bit value and advances the stream.
 *
 * `?? 0` on the word reads satisfies `noUncheckedIndexedAccess`; the fallback
 * is unreachable because every stream is constructed with four words.
 */
export function nextUint32(rng: RngStream): number {
  const words = rng.words;
  const oldHi = words[STATE_HI] ?? 0;
  const oldLo = words[STATE_LO] ?? 0;

  // ---- Advance: state = state * MULT + inc, modulo 2^64. ----
  // The low-word product is built from 16-bit halves so that no partial product
  // exceeds 2^32 and nothing is rounded.
  const aLow = oldLo & 0xffff;
  const aHigh = oldLo >>> 16;
  const bLow = MULT_LO & 0xffff;
  const bHigh = MULT_LO >>> 16;

  const lowLow = aLow * bLow;
  const lowHigh = aLow * bHigh;
  const highLow = aHigh * bLow;
  const highHigh = aHigh * bHigh;

  const middle = (lowLow >>> 16) + (lowHigh & 0xffff) + (highLow & 0xffff);
  const productLo = (((middle & 0xffff) << 16) | (lowLow & 0xffff)) >>> 0;
  const productHiBase = (highHigh + (lowHigh >>> 16) + (highLow >>> 16) + (middle >>> 16)) >>> 0;

  // The two cross terms carry weight 2^32, so they land wholly in the high
  // word; their own overflow past 2^64 is discarded, which is the modulus.
  const productHi = (productHiBase + Math.imul(oldHi, MULT_LO) + Math.imul(oldLo, MULT_HI)) >>> 0;

  const sumLo = productLo + (words[INC_LO] ?? 0);
  words[STATE_LO] = sumLo >>> 0;
  words[STATE_HI] = (productHi + (words[INC_HI] ?? 0) + (sumLo > UINT32_MAX ? 1 : 0)) >>> 0;

  // ---- Output: XSH-RR over the previous state. ----
  // Xor the state with itself shifted right 18, take bits 27..58 of that, then
  // rotate right by the state's top 5 bits. The data-dependent rotation is what
  // makes the low bits of an LCG — which are notoriously weak — irrelevant.
  const shiftedLo = ((oldHi << 14) | (oldLo >>> 18)) >>> 0;
  const xorHi = (oldHi ^ (oldHi >>> 18)) >>> 0;
  const xorLo = (oldLo ^ shiftedLo) >>> 0;
  const xorshifted = ((xorHi << 5) | (xorLo >>> 27)) >>> 0;
  const rotation = oldHi >>> 27;
  return ((xorshifted >>> rotation) | (xorshifted << (-rotation & 31))) >>> 0;
}

function assertBound(bound: number): void {
  if (!Number.isInteger(bound) || bound < 1 || bound > UINT32_COUNT) {
    throw new RangeError(
      `Random bound must be an integer in [1, 4294967296], received ${String(bound)}`,
    );
  }
}

/**
 * The smallest 32-bit draw that may be used for `bound`. Draws below it are
 * rejected and redrawn.
 *
 * `2^32 mod bound` values have to go somewhere. Keeping them would mean the
 * residues `0 .. (2^32 mod bound) - 1` are produced by one more 32-bit draw
 * than every other residue — the classic modulo bias. Discarding exactly that
 * many draws from the bottom of the range leaves an accepted region whose size
 * is an exact multiple of `bound`, so every outcome is backed by precisely the
 * same number of draws and `draw % bound` is exactly uniform.
 *
 * The bias this removes is small (for a d6, about one part in 700 million) and
 * that is precisely the danger: it is far too small to see in a playtest, it
 * never announces itself, and it would sit under every probability in the game
 * and inside every committed balance baseline forever.
 */
export function rejectionThreshold(bound: number): number {
  assertBound(bound);
  return UINT32_COUNT % bound;
}

/**
 * Draws a uniformly distributed integer in `[0, bound)`.
 *
 * Termination: at most `bound - 1` of the 2^32 draws are rejected, so the
 * rejection probability is below `bound / 2^32` and never reaches 1/2 for any
 * legal bound. The loop is unbounded in principle and finishes immediately in
 * practice.
 *
 * @throws RangeError unless `bound` is an integer in `[1, 2^32]`.
 */
export function nextBounded(rng: RngStream, bound: number): number {
  assertBound(bound);
  const threshold = UINT32_COUNT % bound;
  for (;;) {
    const draw = nextUint32(rng);
    if (draw >= threshold) {
      return draw % bound;
    }
  }
}
