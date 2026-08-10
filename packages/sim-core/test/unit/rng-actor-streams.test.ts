/*
 * Multiverse Mages — per-actor stream derivation and insertion-invariance tests.
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
 * `docs/design/contracts.md` §6 keys every draw on
 * `(rootSeed, stream, tick, actorKey, drawOrdinal)` and claims **insertion
 * invariance**: adding a combatant, or adding a draw, disturbs nobody else's
 * rolls. Per-tick streams alone deliver only half of that — they isolate
 * subsystems from each other, but every actor inside a subsystem still shares
 * one cursor, so an actor's draws are positioned by where it happens to sit in
 * the iteration. Insert one combatant and every later combatant's rolls shift.
 *
 * That failure is invisible: the run is still deterministic, still reproducible
 * from its seed, and still passes every test that only re-runs the same
 * scenario. It shows up as an ablation run diverging from its control for
 * reasons unrelated to the ablated primitive — i.e. as noise in exactly the
 * measurement the balance methodology exists to produce.
 *
 * So the tests here are mostly *differential*: each one runs a scenario twice
 * with something inserted between the runs, and asserts the untouched actors
 * are bit-identical. Several carry a shared-stream control that proves the
 * arrangement being ruled out would genuinely have failed — without it, an
 * assertion like "the other actor is unchanged" could pass vacuously.
 */

import { describe, expect, it } from 'vitest';

import type { RngStream } from '@mm/sim-core';
import {
  RNG_STREAM,
  deriveActorStream,
  deriveStream,
  nextBounded,
  nextUint32,
  rngFromRootSeed,
} from '@mm/sim-core';

function take(rng: RngStream, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    values.push(nextUint32(rng));
  }
  return values;
}

function words(rng: RngStream): number[] {
  return Array.from(rng.words);
}

/** How many positions two equal-length sequences agree in. Zero is the goal. */
function overlap(a: readonly number[], b: readonly number[]): number {
  return a.filter((value, index) => value === b[index]).length;
}

// ---------------------------------------------------------------------------
// A toy engagement, used for the insertion-invariance tests.
// ---------------------------------------------------------------------------

/**
 * A combatant, identified by a stable key. In the real simulation this is an
 * entity handle: it survives the combatant being reordered, and it is never
 * reissued to a different combatant while the original is alive.
 */
interface Combatant {
  readonly key: number;
  /** Extra rolls this combatant makes, standing in for a new random decision. */
  readonly extraDraws: number;
}

/** Every value each combatant drew, keyed by its stable key. */
type DrawLog = ReadonlyMap<number, readonly number[]>;

/**
 * Resolves one round of combat, giving each combatant its own actor stream.
 * Combatants are visited in array order, which is precisely what must not
 * matter.
 */
function resolveRound(rootSeed: number, tick: number, combatants: readonly Combatant[]): DrawLog {
  const log = new Map<number, number[]>();
  for (const combatant of combatants) {
    const rng = deriveActorStream(rootSeed, RNG_STREAM.combat, tick, combatant.key);
    const rolls = [nextBounded(rng, 20), nextBounded(rng, 100)];
    for (let extra = 0; extra < combatant.extraDraws; extra += 1) {
      rolls.push(nextBounded(rng, 6));
    }
    log.set(combatant.key, rolls);
  }
  return log;
}

/**
 * The same round written the way it works with per-tick streams only — one
 * cursor for the whole subsystem, shared by every combatant. This is the
 * control: it is the arrangement the actor streams replace, and the tests are
 * only meaningful if it genuinely misbehaves.
 */
function resolveRoundSharedStream(
  rootSeed: number,
  tick: number,
  combatants: readonly Combatant[],
): DrawLog {
  const log = new Map<number, number[]>();
  const shared = deriveStream(rootSeed, RNG_STREAM.combat, tick);
  for (const combatant of combatants) {
    const rolls = [nextBounded(shared, 20), nextBounded(shared, 100)];
    for (let extra = 0; extra < combatant.extraDraws; extra += 1) {
      rolls.push(nextBounded(shared, 6));
    }
    log.set(combatant.key, rolls);
  }
  return log;
}

/** Combatant keys as an entity store would hand them out: stable, not dense. */
const ALICE = 0x0001_0001;
const BOB = 0x0002_0001;
const CARA = 0x0003_0001;
/** A combatant summoned mid-engagement, so allocated after the others. */
const DELVE = 0x0004_0001;

const ROSTER: readonly Combatant[] = [
  { key: ALICE, extraDraws: 0 },
  { key: BOB, extraDraws: 0 },
  { key: CARA, extraDraws: 0 },
];

describe('actor stream derivation is reproducible', () => {
  it('yields identical words and sequences for identical inputs', () => {
    const first = deriveActorStream(0x5eed1234, RNG_STREAM.combat, 97, 0x0000_2a01);
    const second = deriveActorStream(0x5eed1234, RNG_STREAM.combat, 97, 0x0000_2a01);
    expect(words(first)).toEqual(words(second));
    expect(take(first, 64)).toEqual(take(second, 64));
  });

  it('yields different sequences for different actor keys', () => {
    const a = take(deriveActorStream(11, RNG_STREAM.combat, 4, 1), 32);
    const b = take(deriveActorStream(11, RNG_STREAM.combat, 4, 2), 32);
    expect(overlap(a, b)).toBe(0);
  });

  it('yields different sequences for adjacent actor keys across many pairs', () => {
    // Entity handles are allocated densely, so neighbouring keys are the common
    // case rather than an edge case. A mixer that only avalanched the high bits
    // would leave adjacent combatants correlated, which is the same defect as a
    // shared stream wearing a disguise.
    for (let key = 1; key <= 64; key += 1) {
      const a = take(deriveActorStream(0xc0ffee, RNG_STREAM.autonomy, 3, key), 8);
      const b = take(deriveActorStream(0xc0ffee, RNG_STREAM.autonomy, 3, key + 1), 8);
      expect(overlap(a, b)).toBe(0);
    }
  });

  it('yields different sequences for the same actor in different subsystems', () => {
    const a = take(deriveActorStream(11, RNG_STREAM.combat, 4, ALICE), 32);
    const b = take(deriveActorStream(11, RNG_STREAM.autonomy, 4, ALICE), 32);
    expect(overlap(a, b)).toBe(0);
  });

  it('yields different sequences for the same actor at different ticks', () => {
    const a = take(deriveActorStream(11, RNG_STREAM.combat, 4, ALICE), 32);
    const b = take(deriveActorStream(11, RNG_STREAM.combat, 5, ALICE), 32);
    expect(overlap(a, b)).toBe(0);
  });

  it('yields different sequences for adjacent root seeds', () => {
    const a = take(deriveActorStream(1000, RNG_STREAM.combat, 0, ALICE), 32);
    const b = take(deriveActorStream(1001, RNG_STREAM.combat, 0, ALICE), 32);
    expect(overlap(a, b)).toBe(0);
  });

  it('accepts actor key 0, which is reserved only at the entity-store level', () => {
    // NULL_ENTITY is 0 and is never allocated, so key 0 should not arrive here
    // in practice. Rejecting it would still be a constraint the contract does
    // not state, and the derivation has no reason to care.
    const a = take(deriveActorStream(7, RNG_STREAM.combat, 1, 0), 8);
    const b = take(deriveActorStream(7, RNG_STREAM.combat, 1, 1), 8);
    expect(overlap(a, b)).toBe(0);
  });

  it('rejects inputs outside the unsigned 32-bit domain', () => {
    expect(() => deriveActorStream(-1, RNG_STREAM.combat, 0, 1)).toThrow(RangeError);
    expect(() => deriveActorStream(0, -1, 0, 1)).toThrow(RangeError);
    expect(() => deriveActorStream(0, RNG_STREAM.combat, -1, 1)).toThrow(RangeError);
    expect(() => deriveActorStream(0, RNG_STREAM.combat, 0, -1)).toThrow(RangeError);
    expect(() => deriveActorStream(1.5, RNG_STREAM.combat, 0, 1)).toThrow(RangeError);
    expect(() => deriveActorStream(0, RNG_STREAM.combat, 0, 1.5)).toThrow(RangeError);
    expect(() => deriveActorStream(4294967296, RNG_STREAM.combat, 0, 1)).toThrow(RangeError);
    expect(() => deriveActorStream(0, RNG_STREAM.combat, 4294967296, 1)).toThrow(RangeError);
    expect(() => deriveActorStream(0, RNG_STREAM.combat, 0, 4294967296)).toThrow(RangeError);
    expect(() => deriveActorStream(0, RNG_STREAM.combat, 0, Number.NaN)).toThrow(RangeError);
  });

  it('names the offending parameter in the error message', () => {
    expect(() => deriveActorStream(0, RNG_STREAM.combat, 0, -1)).toThrow(/actorKey/);
  });
});

describe('actor streams are separate from per-tick streams', () => {
  it('is a different stream from deriveStream for the same seed, subsystem and tick', () => {
    // Not a new position in the subsystem's stream, and not a coincidence of
    // one actor key: the actor derivation is structurally separate, so no actor
    // can ever land on the subsystem's own tick stream and quietly consume it.
    const perTick = deriveStream(0x5eed1234, RNG_STREAM.combat, 7);
    const perTickDraws = take(deriveStream(0x5eed1234, RNG_STREAM.combat, 7), 16);
    for (let key = 0; key < 256; key += 1) {
      const perActor = deriveActorStream(0x5eed1234, RNG_STREAM.combat, 7, key);
      expect(words(perActor)).not.toEqual(words(perTick));
      expect(overlap(take(perActor, 16), perTickDraws)).toBe(0);
    }
  });

  it('leaves deriveStream untouched no matter how many actor streams are drawn', () => {
    const before = take(deriveStream(0x13579bdf, RNG_STREAM.combat, 2), 8);
    for (let key = 1; key <= 100; key += 1) {
      const rng = deriveActorStream(0x13579bdf, RNG_STREAM.combat, 2, key);
      for (let i = 0; i < 50; i += 1) {
        nextUint32(rng);
      }
    }
    expect(take(deriveStream(0x13579bdf, RNG_STREAM.combat, 2), 8)).toEqual(before);
  });
});

describe('actor streams give insertion invariance', () => {
  const rootSeed = 0x13579bdf;
  const tick = 42;

  it('reproduces every roll across two runs of the same roster', () => {
    expect(resolveRound(rootSeed, tick, ROSTER)).toEqual(resolveRound(rootSeed, tick, ROSTER));
  });

  it('leaves every other combatant untouched when one takes extra draws', () => {
    const baseline = resolveRound(rootSeed, tick, ROSTER);
    const withExtra = resolveRound(rootSeed, tick, [
      { key: ALICE, extraDraws: 0 },
      { key: BOB, extraDraws: 5 },
      { key: CARA, extraDraws: 0 },
    ]);

    expect(withExtra.get(ALICE)).toEqual(baseline.get(ALICE));
    expect(withExtra.get(CARA)).toEqual(baseline.get(CARA));
  });

  it('keeps the changed combatant’s original rolls, appending the new ones', () => {
    const baseline = resolveRound(rootSeed, tick, ROSTER);
    const withExtra = resolveRound(rootSeed, tick, [
      { key: ALICE, extraDraws: 0 },
      { key: BOB, extraDraws: 5 },
      { key: CARA, extraDraws: 0 },
    ]);

    expect(withExtra.get(BOB)?.slice(0, 2)).toEqual(baseline.get(BOB));
    expect(withExtra.get(BOB)).toHaveLength(7);
  });

  it('would have shifted the other combatants had the stream been shared', () => {
    // The control. Without it, the two assertions above could pass simply
    // because nothing in the scenario ever moved.
    const baseline = resolveRoundSharedStream(rootSeed, tick, ROSTER);
    const withExtra = resolveRoundSharedStream(rootSeed, tick, [
      { key: ALICE, extraDraws: 0 },
      { key: BOB, extraDraws: 5 },
      { key: CARA, extraDraws: 0 },
    ]);

    expect(withExtra.get(ALICE)).toEqual(baseline.get(ALICE));
    expect(withExtra.get(CARA)).not.toEqual(baseline.get(CARA));
  });

  it('leaves every existing combatant untouched when a new one is inserted', () => {
    const baseline = resolveRound(rootSeed, tick, ROSTER);
    const withSummon = resolveRound(rootSeed, tick, [
      { key: ALICE, extraDraws: 0 },
      { key: DELVE, extraDraws: 0 },
      { key: BOB, extraDraws: 0 },
      { key: CARA, extraDraws: 0 },
    ]);

    expect(withSummon.get(ALICE)).toEqual(baseline.get(ALICE));
    expect(withSummon.get(BOB)).toEqual(baseline.get(BOB));
    expect(withSummon.get(CARA)).toEqual(baseline.get(CARA));
    expect(withSummon.get(DELVE)).toBeDefined();
  });

  it('would have shifted every later combatant had the stream been shared', () => {
    const baseline = resolveRoundSharedStream(rootSeed, tick, ROSTER);
    const withSummon = resolveRoundSharedStream(rootSeed, tick, [
      { key: ALICE, extraDraws: 0 },
      { key: DELVE, extraDraws: 0 },
      { key: BOB, extraDraws: 0 },
      { key: CARA, extraDraws: 0 },
    ]);

    expect(withSummon.get(ALICE)).toEqual(baseline.get(ALICE));
    expect(withSummon.get(BOB)).not.toEqual(baseline.get(BOB));
    expect(withSummon.get(CARA)).not.toEqual(baseline.get(CARA));
  });

  it('is unaffected by the order combatants are visited in', () => {
    // The point of keying on identity rather than position: a roster sorted by
    // initiative and the same roster sorted by handle must roll the same.
    const forwards = resolveRound(rootSeed, tick, ROSTER);
    const backwards = resolveRound(rootSeed, tick, [...ROSTER].reverse());
    expect(backwards).toEqual(forwards);
  });

  it('would have depended on visit order had the stream been shared', () => {
    const forwards = resolveRoundSharedStream(rootSeed, tick, ROSTER);
    const backwards = resolveRoundSharedStream(rootSeed, tick, [...ROSTER].reverse());
    expect(backwards).not.toEqual(forwards);
  });

  it('leaves a combatant’s rolls untouched when another one is removed', () => {
    // Death mid-engagement is a removal, and it must not re-roll the survivors.
    const baseline = resolveRound(rootSeed, tick, ROSTER);
    const afterDeath = resolveRound(rootSeed, tick, [
      { key: ALICE, extraDraws: 0 },
      { key: CARA, extraDraws: 0 },
    ]);
    expect(afterDeath.get(ALICE)).toEqual(baseline.get(ALICE));
    expect(afterDeath.get(CARA)).toEqual(baseline.get(CARA));
  });
});

describe('the terrain stream is registered', () => {
  it('assigns terrain the ID contracts.md §6 reserves for it', () => {
    expect(RNG_STREAM.terrain).toBe(11);
  });

  it('draws terrain independently of combat at the same tick', () => {
    const terrain = take(deriveStream(0xc0ffee, RNG_STREAM.terrain, 0), 32);
    const combat = take(deriveStream(0xc0ffee, RNG_STREAM.combat, 0), 32);
    expect(overlap(terrain, combat)).toBe(0);
  });
});

describe('RngSource is the object step() receives', () => {
  it('exposes the root seed it was built from', () => {
    expect(rngFromRootSeed(0x5eed1234).rootSeed).toBe(0x5eed1234);
  });

  it('delegates stream() to deriveStream exactly', () => {
    const rng = rngFromRootSeed(0x5eed1234);
    expect(words(rng.stream(RNG_STREAM.mageBirth, 7))).toEqual(
      words(deriveStream(0x5eed1234, RNG_STREAM.mageBirth, 7)),
    );
    expect(take(rng.stream(RNG_STREAM.mageBirth, 7), 16)).toEqual(
      take(deriveStream(0x5eed1234, RNG_STREAM.mageBirth, 7), 16),
    );
  });

  it('delegates actorStream() to deriveActorStream exactly', () => {
    const rng = rngFromRootSeed(0x5eed1234);
    expect(words(rng.actorStream(RNG_STREAM.combat, 7, ALICE))).toEqual(
      words(deriveActorStream(0x5eed1234, RNG_STREAM.combat, 7, ALICE)),
    );
    expect(take(rng.actorStream(RNG_STREAM.combat, 7, ALICE), 16)).toEqual(
      take(deriveActorStream(0x5eed1234, RNG_STREAM.combat, 7, ALICE), 16),
    );
  });

  it('hands out a fresh cursor on every call, never a shared one', () => {
    // If two callers received the same object, the second one's draws would
    // depend on how many the first took — the shared-cursor defect, reintroduced
    // one level up from the derivation that was fixed to prevent it.
    const rng = rngFromRootSeed(0x5eed1234);
    const first = rng.stream(RNG_STREAM.combat, 3);
    take(first, 10);
    expect(take(rng.stream(RNG_STREAM.combat, 3), 4)).toEqual(
      take(deriveStream(0x5eed1234, RNG_STREAM.combat, 3), 4),
    );

    const firstActor = rng.actorStream(RNG_STREAM.combat, 3, ALICE);
    take(firstActor, 10);
    expect(take(rng.actorStream(RNG_STREAM.combat, 3, ALICE), 4)).toEqual(
      take(deriveActorStream(0x5eed1234, RNG_STREAM.combat, 3, ALICE), 4),
    );
  });

  it('rejects a root seed outside the unsigned 32-bit domain, naming it', () => {
    expect(() => rngFromRootSeed(-1)).toThrow(RangeError);
    expect(() => rngFromRootSeed(1.5)).toThrow(RangeError);
    expect(() => rngFromRootSeed(4294967296)).toThrow(RangeError);
    expect(() => rngFromRootSeed(Number.NaN)).toThrow(RangeError);
    expect(() => rngFromRootSeed(-1)).toThrow(/rootSeed/);
  });

  it('rejects bad subsystem, tick and actor arguments at the call site', () => {
    const rng = rngFromRootSeed(1);
    expect(() => rng.stream(-1, 0)).toThrow(RangeError);
    expect(() => rng.stream(RNG_STREAM.combat, -1)).toThrow(RangeError);
    expect(() => rng.actorStream(RNG_STREAM.combat, 0, -1)).toThrow(RangeError);
  });

  it('accepts the extremes of the seed domain', () => {
    expect(rngFromRootSeed(0).rootSeed).toBe(0);
    expect(rngFromRootSeed(4294967295).rootSeed).toBe(4294967295);
  });
});

/**
 * Frozen state words for
 * `deriveActorStream(0x5eed1234, RNG_STREAM.combat, 7, 0x00020001)`, as
 * `[stateHi, stateLo, incHi, incLo]`. Pins the actor mixer's output directly,
 * before any draw happens.
 *
 * Do not regenerate without understanding what it invalidates.
 */
const ACTOR_STATE_WORDS: readonly string[] = [
  '0x61e0ccc9',
  '0x4f7faf64',
  '0x3cf5284e',
  '0x9c6a93b9',
];

/**
 * Frozen sequence for that same derivation.
 *
 * Do not regenerate without understanding what it invalidates.
 */
const ACTOR_VECTOR: readonly string[] = [
  '0x62f3c1a9',
  '0xeeb38ba2',
  '0xbd89b1b1',
  '0xa394b1af',
  '0xd02ab1a1',
  '0x8f8d0487',
  '0xc7004802',
  '0x5f85b781',
];

/**
 * Frozen bounded draws for that same derivation, at a bound of 100 — which does
 * not divide 2^32, so these also depend on the rejection rule.
 *
 * Do not regenerate without understanding what it invalidates.
 */
const ACTOR_BOUNDED_VECTOR: readonly number[] = [
  93, 98, 45, 23, 13, 23, 18, 85, 89, 16, 86, 80, 98, 92, 67, 24,
];

/**
 * Frozen state words and sequence for `deriveStream(0x5eed1234,
 * RNG_STREAM.terrain, 0)` — the newly registered stream 11. Pinned on the day
 * it was added, so that the first terrain baseline committed against it has
 * something to fail against if the ID or the mixer ever moves.
 *
 * Do not regenerate without understanding what it invalidates.
 */
const TERRAIN_STATE_WORDS: readonly string[] = [
  '0xa081e0ff',
  '0xbc514c32',
  '0x9bf595ec',
  '0x23780845',
];

const TERRAIN_VECTOR: readonly string[] = [
  '0x91bf8103',
  '0x9cb9a7f6',
  '0x15400e6c',
  '0xbde5467f',
  '0x7ab6017b',
  '0x0252dfcb',
  '0x144d4657',
  '0x06c1865e',
];

function hex(value: number): string {
  return `0x${value.toString(16).padStart(8, '0')}`;
}

/**
 * The tripwire, layered the same way `rng-known-answer.test.ts` layers its
 * vectors. Every committed Monte Carlo baseline and every golden replay fixture
 * that involves a per-actor draw is a claim about these exact numbers. A
 * "harmless" change — a different salt, folding the actor round into the
 * per-tick mixer, reordering the fmix32 calls — would invalidate all of them
 * without any behavioural test noticing, because every property asserted above
 * would still hold of the new sequence. It fails here instead, in the change
 * that caused it.
 */
describe('actor stream known-answer vectors', () => {
  it('reproduces the frozen initial state words', () => {
    const rng = deriveActorStream(0x5eed1234, RNG_STREAM.combat, 7, 0x0002_0001);
    expect(Array.from(rng.words).map(hex)).toEqual(ACTOR_STATE_WORDS);
  });

  it('reproduces the frozen sequence', () => {
    const rng = deriveActorStream(0x5eed1234, RNG_STREAM.combat, 7, 0x0002_0001);
    expect(take(rng, 8).map(hex)).toEqual(ACTOR_VECTOR);
  });

  it('reproduces the frozen bounded draws', () => {
    const rng = deriveActorStream(0x5eed1234, RNG_STREAM.combat, 7, 0x0002_0001);
    const rolls: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      rolls.push(nextBounded(rng, 100));
    }
    expect(rolls).toEqual(ACTOR_BOUNDED_VECTOR);
  });

  it('reproduces the frozen terrain stream', () => {
    expect(Array.from(deriveStream(0x5eed1234, RNG_STREAM.terrain, 0).words).map(hex)).toEqual(
      TERRAIN_STATE_WORDS,
    );
    expect(take(deriveStream(0x5eed1234, RNG_STREAM.terrain, 0), 8).map(hex)).toEqual(
      TERRAIN_VECTOR,
    );
  });
});
