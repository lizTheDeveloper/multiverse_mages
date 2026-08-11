/*
 * Multiverse Mages — the agent-side generator, outside the §6 stream registry.
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
 * `agent-interface` task 2.4, and the `agent-api` spec requirement *"Agent-side
 * randomness is outside the RNG stream registry"*.
 *
 * `design.md` states the failure being prevented, and it is not a small one:
 *
 * > §6 states plainly that reusing or renumbering a stream ID invalidates every
 * > committed baseline; if bots drew from stream 7 (mage autonomy tie-breaking),
 * > then adding a bot, changing a bot's decision order, or adding a strategy to
 * > the pool would perturb in-simulation rolls and silently invalidate baselines
 * > that have nothing to do with bots.
 *
 * The third scenario — *"Registry streams are not reachable from agents"* — is
 * a claim about the **shape of the type**, so the test for it is a claim about
 * the shape of the type. The behavioural half, that agent draws do not advance a
 * simulation stream, is in `session.test.ts` where there is a simulation to
 * advance.
 */

import { agentRng } from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

const BASE = { runSeed: 0x5eed_0001, agentSlotIndex: 0, strategyId: 'passive' } as const;

/** `count` draws from a fresh generator built from `input`. */
function sequence(input: Parameters<typeof agentRng>[0], count = 24): number[] {
  const rng = agentRng(input);
  return Array.from({ length: count }, () => rng.nextUint32());
}

describe('the agent generator is derived from (runSeed, agentSlotIndex, strategyId)', () => {
  it('emits an identical sequence from identical inputs', () => {
    expect(sequence(BASE)).toEqual(sequence(BASE));
  });

  it('separates two slots, two strategies, and two runs', () => {
    const base = sequence(BASE);
    expect(sequence({ ...BASE, agentSlotIndex: 1 })).not.toEqual(base);
    expect(sequence({ ...BASE, strategyId: 'archivist' })).not.toEqual(base);
    expect(sequence({ ...BASE, runSeed: 0x5eed_0002 })).not.toEqual(base);
  });

  it('separates strategy ids that differ only in one character', () => {
    // A derivation that folded the id by, say, summing its char codes would
    // collide on anagrams, and two strategies drawing the same numbers would
    // look like two strategies agreeing about the game.
    expect(sequence({ ...BASE, strategyId: 'warden-a' })).not.toEqual(
      sequence({ ...BASE, strategyId: 'warden-b' }),
    );
    expect(sequence({ ...BASE, strategyId: 'ab' })).not.toEqual(
      sequence({ ...BASE, strategyId: 'ba' }),
    );
  });

  it('draws unsigned 32-bit integers, and moves', () => {
    const drawn = sequence(BASE, 64);
    for (const value of drawn) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffff_ffff);
    }
    expect(new Set(drawn).size).toBeGreaterThan(60);
  });

  it('bounds a draw without bias toward the low end of the range', () => {
    const rng = agentRng(BASE);
    const counts = new Array<number>(6).fill(0);
    for (let draw = 0; draw < 6000; draw += 1) {
      const value = rng.nextBelow(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      counts[value] = (counts[value] as number) + 1;
    }
    // Not a statistical test — `nextBounded` is `sim-core`'s and is tested
    // there. This only catches a generator wired up so badly that a face never
    // comes up at all.
    for (const count of counts) expect(count).toBeGreaterThan(600);
  });

  it('forks into independent sub-generators from a label', () => {
    const parent = agentRng(BASE);
    const left = parent.fork('tie-break');
    const right = parent.fork('exploration');
    const leftDraws = Array.from({ length: 16 }, () => left.nextUint32());
    const rightDraws = Array.from({ length: 16 }, () => right.nextUint32());
    expect(leftDraws).not.toEqual(rightDraws);

    // A fork is a pure function of (parent inputs, label): forking in a
    // different order must not change what either fork draws, or a strategy
    // that grew a second use of randomness would silently re-roll its first.
    const again = agentRng(BASE);
    const rightFirst = again.fork('exploration');
    const leftSecond = again.fork('tie-break');
    expect(Array.from({ length: 16 }, () => rightFirst.nextUint32())).toEqual(rightDraws);
    expect(Array.from({ length: 16 }, () => leftSecond.nextUint32())).toEqual(leftDraws);
  });

  it('refuses inputs it could not derive reproducibly from', () => {
    expect(() => agentRng({ ...BASE, runSeed: -1 })).toThrow(/runSeed/);
    expect(() => agentRng({ ...BASE, runSeed: 1.5 })).toThrow(/runSeed/);
    expect(() => agentRng({ ...BASE, agentSlotIndex: -1 })).toThrow(/agentSlotIndex/);
    expect(() => agentRng({ ...BASE, strategyId: '' })).toThrow(/strategyId/);
    // Non-ASCII would encode differently under different assumptions, and the
    // derivation has to be reproducible from the published definition.
    expect(() => agentRng({ ...BASE, strategyId: 'wärden' })).toThrow(/ASCII/);
  });
});

describe('the agent generator cannot be pointed at a registry stream', () => {
  it('exposes drawing and forking, and nothing that names a subsystem', () => {
    const rng = agentRng(BASE);
    const names = new Set<string>();
    for (
      let object: object | null = rng;
      object !== null && object !== Object.prototype;
      object = Object.getPrototypeOf(object) as object | null
    ) {
      for (const name of Object.getOwnPropertyNames(object)) names.add(name);
    }
    names.delete('constructor');
    expect([...names].sort()).toEqual(['fork', 'nextBelow', 'nextUint32']);
  });

  it('takes no subsystem id anywhere in its surface', () => {
    // The type says so; this says so at runtime, because the type is erased in
    // the place a mistake would actually be made — a JavaScript bot in the RL
    // bridge calling `rng.stream(7)` and getting `undefined is not a function`
    // only if there is nothing there to call.
    const rng = agentRng(BASE) as unknown as Record<string, unknown>;
    for (const forbidden of ['stream', 'actorStream', 'rootSeed', 'words', 'subsystem']) {
      expect(rng[forbidden]).toBeUndefined();
    }
  });
});
