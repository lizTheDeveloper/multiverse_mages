/*
 * Multiverse Mages — per-subsystem random stream derivation.
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

import type { RngStream } from './pcg32.js';
import { streamFromWords } from './pcg32.js';

/**
 * The permanent subsystem stream registry from `docs/design/contracts.md` §6.
 *
 * **These IDs are permanent and this table is append-only.** An ID is baked
 * into every committed Monte Carlo balance baseline and every golden replay
 * fixture: renumbering one, or reusing a retired one, silently changes what
 * every historical run means. Adding a subsystem takes the next free number
 * and nothing else moves.
 */
export const RNG_STREAM = {
  /** Mage birth and personality rolls. */
  mageBirth: 1,
  /** Mortality. */
  mortality: 2,
  /** Research and discovery. */
  research: 3,
  /** Teaching outcomes. */
  teaching: 4,
  /** Scribing outcomes and grimoire durability. */
  scribing: 5,
  /** Populace cohort dynamics. */
  populace: 6,
  /** Mage autonomy / utility-AI tie-breaking. */
  autonomy: 7,
  /** Combat resolution. */
  combat: 8,
  /** Knowledge theft. */
  knowledgeTheft: 9,
  /** Objective and raid generation. */
  objectives: 10,
} as const;

/** Any ID in the permanent registry. */
export type RngSubsystemId = (typeof RNG_STREAM)[keyof typeof RNG_STREAM];

const UINT32_COUNT = 4294967296;

/** Murmur3's 32-bit finalizer: full avalanche, integer-only, four operations. */
function fmix32(value: number): number {
  let h = value >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/** Odd 32-bit constants, used to keep the three inputs from cancelling. */
const SUBSYSTEM_ODD = 0x9e3779b1;
const TICK_ODD = 0x85ebca6b;

/**
 * Mixes all three inputs into one word. The salt distinguishes the four words
 * of a stream, so a single derivation calls this four times and gets four
 * uncorrelated results rather than four copies of one hash.
 */
function mixWord(salt: number, rootSeed: number, subsystemId: number, tick: number): number {
  let h = fmix32((salt ^ rootSeed) >>> 0);
  h = fmix32((h ^ Math.imul(subsystemId, SUBSYSTEM_ODD)) >>> 0);
  h = fmix32((h ^ Math.imul(tick, TICK_ODD)) >>> 0);
  return h;
}

const SALT_STATE_HI = 0x243f6a88;
const SALT_STATE_LO = 0x85a308d3;
const SALT_INC_HI = 0x13198a2e;
const SALT_INC_LO = 0x03707344;

function assertUint32(value: number, role: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_COUNT) {
    throw new RangeError(
      `${role} must be an integer in [0, 4294967295], received ${String(value)}`,
    );
  }
}

/**
 * Derives a subsystem's random stream for one tick.
 *
 * This is the mechanism the whole balance methodology rests on. Because the
 * stream is a pure function of `(rootSeed, subsystemId, tick)` and nothing
 * else, a later change can add a weather roll to the populace subsystem and
 * every mortality, combat, and research number in the game stays exactly where
 * it was. The alternative — one running generator shared by everything — makes
 * every added `rng()` call a silent re-roll of the entire universe, and
 * invalidates every committed baseline without a test failing anywhere.
 *
 * Streams are re-derived per tick rather than carried forward, so how many
 * draws a subsystem took last tick cannot shift what it draws this tick
 * either.
 *
 * Both the state and the increment are derived, so different subsystems occupy
 * different PCG streams rather than different positions in one stream.
 *
 * @param rootSeed - The universe's seed. Unsigned 32-bit.
 * @param subsystemId - An ID from {@link RNG_STREAM}. Unsigned 32-bit.
 * @param tick - The tick the draw belongs to. Unsigned 32-bit; a world tick is
 * one month, so 2^32 of them is longer than any run will ever be.
 * @throws RangeError if any input is outside the unsigned 32-bit domain.
 */
export function deriveStream(rootSeed: number, subsystemId: number, tick: number): RngStream {
  assertUint32(rootSeed, 'rootSeed');
  assertUint32(subsystemId, 'subsystemId');
  assertUint32(tick, 'tick');

  return streamFromWords(
    mixWord(SALT_STATE_HI, rootSeed, subsystemId, tick),
    mixWord(SALT_STATE_LO, rootSeed, subsystemId, tick),
    mixWord(SALT_INC_HI, rootSeed, subsystemId, tick),
    mixWord(SALT_INC_LO, rootSeed, subsystemId, tick),
  );
}
