/*
 * Multiverse Mages — a match between two in-process participants, and the
 * replay that proves the record is the match.
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
  ENTRY_SOURCE,
  MATCH_END,
  Match,
  MatchHost,
  encodeFrame,
  manualClock,
  screen,
  TICK_MODE,
  type CanonicalBatch,
  type MatchPacing,
} from '../../src/index.js';
import { legalKinds, probeContract, probeSession, recordingConnection } from './fixtures.js';

/**
 * A legal, admissible action in the probe universe.
 *
 * Read off the mask rather than written down — see {@link legalKinds}. `params`
 * is supplied because the gate resolves parameters before the core sees an
 * action, and an action rejected by the gate never reaches `ctx.actions`, so a
 * test using one would compare two universes that both did nothing.
 */
function legalAction(): { kind: number; params: number[] } {
  const probe = probeSession(0);
  probe.reset(11, { worldTickCap: 6 });
  const kinds = legalKinds(probe);
  expect(kinds.length).toBeGreaterThan(0);
  return { kind: kinds[0] as number, params: [0] };
}

/** A host with two connected, handshaken participants and a match under way. */
function twoPlayerMatch(pacing?: MatchPacing): {
  host: MatchHost;
  alice: ReturnType<typeof recordingConnection>;
  bob: ReturnType<typeof recordingConnection>;
  clock: ReturnType<typeof manualClock>;
  matchId: string;
  runSeed: number;
  stepLimit: number;
} {
  const clock = manualClock(0);
  const host = new MatchHost({
    contract: probeContract(),
    createSession: probeSession,
    clock,
    ...(pacing === undefined ? {} : { pacing }),
  });
  const alice = recordingConnection('a');
  const bob = recordingConnection('b');
  host.connect(alice);
  host.connect(bob);
  for (const [id, name] of [
    ['a', 'alice'],
    ['b', 'bob'],
  ] as const) {
    host.receive(id, encodeFrame({ type: 'hello', participant: name, contract: probeContract() }).trim());
  }
  const runSeed = 11;
  const stepLimit = 6;
  host.receive('a', encodeFrame({ type: 'challenge', opponent: 'bob', runSeed, stepLimit }).trim());
  host.receive(
    'b',
    encodeFrame({ type: 'accept', challengeId: bob.ofType('challenged')[0]!.challengeId }).trim(),
  );
  return { host, alice, bob, clock, matchId: alice.ofType('match-start')[0]!.matchId, runSeed, stepLimit };
}

/** Submits an action for a connection's slot at a tick. */
function submit(
  host: MatchHost,
  connectionId: string,
  matchId: string,
  tick: number,
  sequence: number,
  action: { kind: number; params?: number[] },
): void {
  host.receive(
    connectionId,
    encodeFrame({ type: 'action', matchId, tick, sequence, action }).trim(),
  );
}

/** The no-op, which is legal in every mode and always admitted. */
const NOOP = { kind: 0 };

/**
 * Deadlines short enough that a test can step over them by hand.
 *
 * Both layers get a profile because {@link MatchPacing} has no single-profile
 * form — which is the point of splitting it. The world profile is the one these
 * tests exercise: no raid can fire in this tree, so every tick is a management
 * tick, and a test that quietly assumed otherwise would be asserting something
 * about a code path nothing reaches.
 */
const TEST_PACING: MatchPacing = {
  engagement: { tickIntervalMs: 5, actionDeadlineMs: 4 },
  world: { tickIntervalMs: 50, actionDeadlineMs: 40 },
};

describe('two in-process participants play one authoritative match', () => {
  it('tells both of them the same thing about every tick', () => {
    const { host, alice, bob, matchId } = twoPlayerMatch();

    for (let tick = 0; tick < 4; tick += 1) {
      submit(host, 'a', matchId, tick, tick + 1, NOOP);
      submit(host, 'b', matchId, tick, tick + 1, NOOP);
      host.pump();
    }

    const aliceTicks = alice.ofType('tick');
    const bobTicks = bob.ofType('tick');
    expect(aliceTicks.length).toBeGreaterThanOrEqual(4);
    // Not "both received four frames" — both received the *same* four frames.
    // A server that broadcast a different batch or a different hash vector to
    // each side would satisfy a count and fail this.
    expect(aliceTicks).toEqual(bobTicks);
  });

  it('publishes an initial hash each participant can check its own build against', () => {
    const { alice, bob } = twoPlayerMatch();
    const started = alice.ofType('match-start')[0]!;
    expect(started.initialHashes).toHaveLength(2);
    expect(bob.ofType('match-start')[0]?.initialHashes).toEqual(started.initialHashes);
    for (const hash of started.initialHashes) expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("routes each slot's action to that slot's universe", () => {
    const { host, alice, matchId } = twoPlayerMatch();

    // The two universes start identical — same scenario, same seed — so any
    // later difference in their hashes can only have come from the actions.
    const started = alice.ofType('match-start')[0]!;
    expect(started.initialHashes[0]).toBe(started.initialHashes[1]);

    const moving = legalAction();
    submit(host, 'a', matchId, 0, 1, moving);
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    const tick = alice.ofType('tick')[0]!;
    expect(tick.batch.entries[0]?.action.kind).toBe(moving.kind);
    expect(tick.batch.entries[1]?.action.kind).toBe(0);
    // Different actions, therefore different universes. If the server had
    // applied one slot's action to both, these would still be equal.
    expect(tick.hashes[0]).not.toBe(tick.hashes[1]);
  });

  it('ends on the caller-imposed step limit, and calls it truncated rather than terminal', () => {
    const { host, alice, matchId, stepLimit } = twoPlayerMatch();
    for (let tick = 0; tick < stepLimit + 2; tick += 1) {
      submit(host, 'a', matchId, tick, tick + 1, NOOP);
      submit(host, 'b', matchId, tick, tick + 1, NOOP);
      host.pump();
    }
    const end = alice.ofType('match-end')[0];
    // §4.3 keeps terminal and truncated distinct; a step limit is the caller's.
    expect(end?.reason).toBe(MATCH_END.truncated);
  });
});

describe('the record is the match', () => {
  it('replays the recorded batches to the same hashes, in a fresh process-worth of state', () => {
    const { host, alice, matchId } = twoPlayerMatch();
    const moving = legalAction();

    for (let tick = 0; tick < 5; tick += 1) {
      submit(host, 'a', matchId, tick, tick + 1, tick % 2 === 0 ? moving : NOOP);
      submit(host, 'b', matchId, tick, tick + 1, tick % 2 === 0 ? NOOP : moving);
      host.pump();
    }

    const live = alice.ofType('tick');
    const batches: CanonicalBatch[] = live.map((frame) => frame.batch);
    const finalHashes = live[live.length - 1]!.hashes;

    // A second match, built the same way and fed only the record. This is the
    // 1,000-match harness in miniature: if a batch log did not determine the
    // final hash, the release plan's zero-desync claim could not be measured.
    const replay = new Match({
      matchId: 'replay',
      slots: [0, 1].map((slot) => ({ slot, participant: `p${slot}`, session: probeSession(slot) })),
      stepLimit: 100,
    });
    for (const slot of replay.slots) slot.session.reset(11, { worldTickCap: 6 });

    let replayed: readonly string[] = [];
    for (const batch of batches) replayed = replay.apply(batch).hashes;

    expect(replayed).toEqual(finalHashes);
  });

  it('reaches the same hashes whatever the wall clock did in between', () => {
    const moving = legalAction();
    const run = (advances: readonly number[]): readonly string[] => {
      const { host, alice, clock, matchId } = twoPlayerMatch();
      for (const [tick, gap] of advances.entries()) {
        submit(host, 'a', matchId, tick, tick + 1, moving);
        submit(host, 'b', matchId, tick, tick + 1, NOOP);
        clock.advance(gap);
        host.pump();
      }
      const ticks = alice.ofType('tick');
      return ticks[ticks.length - 1]!.hashes;
    };

    // Same submissions, wildly different pacing. The clock decides when a tick
    // closes and never what is in it, so these must agree exactly.
    expect(run([0, 0, 0, 0])).toEqual(run([1, 5_000, 3, 900_000]));
  });
});

describe('a participant that does not answer in time', () => {
  it('gets a substituted no-op once the deadline passes, and the match continues', () => {
    const { host, alice, bob, clock, matchId } = twoPlayerMatch(TEST_PACING);

    // Only alice answers.
    submit(host, 'a', matchId, 0, 1, legalAction());
    host.pump();
    // Before the deadline nothing closes: bob might still answer.
    expect(alice.ofType('tick')).toHaveLength(0);

    clock.advance(41);
    host.pump();

    const tick = alice.ofType('tick')[0]!;
    expect(tick.batch.entries[0]).toMatchObject({ slot: 0, source: ENTRY_SOURCE.submitted });
    expect(tick.batch.entries[1]).toMatchObject({
      slot: 1,
      source: ENTRY_SOURCE.substituted,
      action: { kind: 0 },
    });
    // Bob was told, in the same words as alice. A participant whose action was
    // replaced must be able to see that it was.
    expect(bob.ofType('tick')[0]).toEqual(tick);
  });

  it('closes a tick as soon as everyone has answered, without waiting out the deadline', () => {
    const { host, alice, matchId } = twoPlayerMatch(TEST_PACING);
    submit(host, 'a', matchId, 0, 1, NOOP);
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();
    // The clock has not moved at all.
    expect(alice.ofType('tick')).toHaveLength(1);
  });
});

describe('the boundary screens actions before the core sees them', () => {
  it('refuses a masked action rather than passing it to the session', () => {
    const session = probeSession(0);
    session.reset(1, { worldTickCap: 10 });
    const mask = session.legalActions();

    const illegal = [...mask.keys()].find((id) => mask[id] === 0);
    expect(illegal).toBeDefined();
    expect(screen(session, { kind: illegal as number })).toBeDefined();

    const legal = [...mask.keys()].find((id) => mask[id] === 1);
    expect(screen(session, { kind: legal as number })).toBeUndefined();
  });

  it('refuses an action id that is not in the action space at all', () => {
    const session = probeSession(0);
    session.reset(1, { worldTickCap: 10 });
    expect(screen(session, { kind: 999 })).toBe('malformed-action');
    expect(screen(session, { kind: -1 })).toBe('malformed-action');
    expect(screen(session, { kind: 1, params: [1.5] })).toBe('malformed-action');
  });
});

describe('the two layers are paced separately', () => {
  it('reports which layer each slot is in, per slot rather than per match', () => {
    const { host, alice, matchId } = twoPlayerMatch();
    submit(host, 'a', matchId, 0, 1, NOOP);
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    const tick = alice.ofType('tick')[0]!;
    // One entry per slot. §0 makes clocks per-universe — a raid freezes world
    // time for its two participants only — so a single match-wide mode would be
    // a claim §0 forbids, even while every slot happens to agree.
    expect(tick.modes).toHaveLength(2);
    // No raid can fire in this tree: nothing supplies portalTargets, so
    // openPortal is permanently masked. Every tick is a management tick, and
    // this test says so rather than leaving a reader to assume it.
    expect(tick.modes).toEqual([TICK_MODE.world, TICK_MODE.world]);
  });

  it('gives a management tick the world deadline, not the raid one', () => {
    const { host, alice, clock, matchId } = twoPlayerMatch(TEST_PACING);
    submit(host, 'a', matchId, 0, 1, NOOP);

    // Past the engagement deadline. If the two profiles were one, or if the
    // world layer had inherited the raid's, bob would already have been given a
    // substituted no-op for a decision he is entitled to take his time over.
    clock.advance(TEST_PACING.engagement.actionDeadlineMs + 1);
    host.pump();
    expect(alice.ofType('tick')).toHaveLength(0);

    // Past the world deadline, it closes.
    clock.advance(TEST_PACING.world.actionDeadlineMs);
    host.pump();
    expect(alice.ofType('tick')).toHaveLength(1);
  });
});
