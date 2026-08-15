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
  /** Terrain generation and combatant deployment. */
  terrain: 11,
  /**
   * The opening square: which techniques and forms a universe is founded
   * holding (`campaign-plan.md`, "The 2×2 opening").
   *
   * Drawn exactly once per universe, at founding, and never again. It has its
   * own id rather than borrowing `mageBirth`'s — which is the other tick-zero
   * draw — because the two are taken from the same tick and a shared cursor
   * would make *how many axes a square has* shift every founding personality
   * behind it. A 1×1 arm and a 3×3 arm would then differ in their founders as
   * well as in their grid, and the square's effect could not be separated from
   * the mages'.
   */
  openingSquare: 12,
  /**
   * The partial-detachment draw at portal open: whether a soldier cohort with
   * fewer people left than `detachment-strength` fields one more detachment.
   *
   * Its own id rather than `terrain`'s — which is the other deployment-time
   * draw — because the two are taken at the same moment from the same source.
   * Sharing `terrain`'s cursor would make *how many detachments a side fields*
   * shift every deployment position behind it, so a change in the populace
   * would move the battlefield, and no committed raid baseline could be read as
   * a statement about either.
   *
   * **13 is deliberately skipped.** `w190/scribing-fidelity` (PR #170) claims it
   * for `corruption` and is open but unmerged at the time of writing; taking it
   * here would give one number two meanings depending on merge order, which is
   * exactly what this table's append-only rule exists to prevent.
   */
  detachment: 14,
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

/**
 * Salts distinguishing the four words of a per-tick stream. These are the first
 * four 32-bit words of the fractional part of pi — nothing-up-my-sleeve numbers,
 * the same sequence Blowfish uses for its P-array. Their only requirements are
 * that they differ from each other and that nobody chose them to make a
 * particular seed behave a particular way.
 */
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

// ---------------------------------------------------------------------------
// Per-actor streams.
//
// Deliberately a separate derivation rather than an optional fourth argument to
// the mixer above. `deriveStream`'s output is frozen in a known-answer vector
// and, through it, in every committed balance baseline and golden replay
// fixture; a shared code path is one refactor away from someone "simplifying"
// the actor case into it and moving every historical number. The four salts
// below are the *next* four words of pi's fractional part, continuing the
// sequence the per-tick salts start, so no actor stream is merely a relabelled
// position in some subsystem's own tick stream.
// ---------------------------------------------------------------------------

const ACTOR_SALT_STATE_HI = 0xa4093822;
const ACTOR_SALT_STATE_LO = 0x299f31d0;
const ACTOR_SALT_INC_HI = 0x082efa98;
const ACTOR_SALT_INC_LO = 0xec4e6c89;

/**
 * Odd, so multiplication by it is invertible modulo 2^32 and therefore injective
 * on actor keys — no two distinct actors can be folded onto the same word here.
 */
const ACTOR_ODD = 0xc2b2ae35;

/**
 * Mixes all four inputs into one word: the per-tick mix, plus one more
 * finalizer round folding in the actor key. The extra round matters — entity
 * handles are allocated densely, so neighbouring actors differ in their low
 * bits only, and a mixer that merely xor'd the key in would leave adjacent
 * combatants correlated.
 */
function mixActorWord(
  salt: number,
  rootSeed: number,
  subsystemId: number,
  tick: number,
  actorKey: number,
): number {
  let h = fmix32((salt ^ rootSeed) >>> 0);
  h = fmix32((h ^ Math.imul(subsystemId, SUBSYSTEM_ODD)) >>> 0);
  h = fmix32((h ^ Math.imul(tick, TICK_ODD)) >>> 0);
  h = fmix32((h ^ Math.imul(actorKey, ACTOR_ODD)) >>> 0);
  return h;
}

/**
 * Derives one actor's random stream within a subsystem, for one tick.
 *
 * `docs/design/contracts.md` §6 keys every draw on
 * `(rootSeed, stream, tick, actorKey, drawOrdinal)` and calls the resulting
 * property **insertion invariance**: adding a combatant, or adding a draw,
 * disturbs nobody else's rolls. {@link deriveStream} delivers only half of
 * that. It isolates subsystems from each other, but every actor inside a
 * subsystem shares one cursor, so an actor's draws are positioned by nothing
 * more than where it sits in the iteration. Insert a summoned combatant at the
 * front of the roster and every combatant behind it rolls differently — as does
 * merely sorting the roster by initiative instead of by handle.
 *
 * That defect does not announce itself. The run stays deterministic, stays
 * reproducible from its seed, and passes every test that re-runs the same
 * scenario unchanged. It surfaces only as an ablation run diverging from its
 * control for reasons unrelated to the ablated primitive — that is, as noise in
 * precisely the measurement the balance methodology exists to produce, with no
 * indication that the noise is an artefact rather than an effect.
 *
 * **`actorKey` must be a stable identity — an entity handle — never an array
 * index, a roster position, a loop counter, or an index into a live-slot list.**
 * A positional key reproduces the exact bug this function removes, while
 * looking like the fix: keys shift when anything is inserted or removed ahead
 * of them, so the actor that inherits position 3 also inherits position 3's
 * rolls. Entity handles carry a generation counter, so a slot reused by a new
 * entity yields a different key and therefore different rolls, which is also
 * correct — the dead mage's luck does not transfer to whoever takes its slot.
 *
 * Like {@link deriveStream}, this is re-derived per tick and never carried
 * forward, so how many draws an actor took last tick cannot shift this tick's.
 *
 * @param rootSeed - The universe's seed. Unsigned 32-bit.
 * @param subsystemId - An ID from {@link RNG_STREAM}. Unsigned 32-bit.
 * @param tick - The tick the draw belongs to. Unsigned 32-bit.
 * @param actorKey - The actor's stable identity. Unsigned 32-bit. Zero is
 * accepted: handle `0` is reserved by the entity store, not by the generator.
 * @throws RangeError if any input is outside the unsigned 32-bit domain.
 */
export function deriveActorStream(
  rootSeed: number,
  subsystemId: number,
  tick: number,
  actorKey: number,
): RngStream {
  assertUint32(rootSeed, 'rootSeed');
  assertUint32(subsystemId, 'subsystemId');
  assertUint32(tick, 'tick');
  assertUint32(actorKey, 'actorKey');

  return streamFromWords(
    mixActorWord(ACTOR_SALT_STATE_HI, rootSeed, subsystemId, tick, actorKey),
    mixActorWord(ACTOR_SALT_STATE_LO, rootSeed, subsystemId, tick, actorKey),
    mixActorWord(ACTOR_SALT_INC_HI, rootSeed, subsystemId, tick, actorKey),
    mixActorWord(ACTOR_SALT_INC_LO, rootSeed, subsystemId, tick, actorKey),
  );
}

/**
 * The unsigned 32-bit check, shared with `source.ts` so both surfaces reject
 * the same inputs with the same wording.
 *
 * @internal Not part of the package's public surface.
 */
export { assertUint32 as assertRngUint32 };
