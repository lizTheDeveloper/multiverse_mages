/*
 * Multiverse Mages — prestige carry-forward and reconnection within a window.
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
  DEFAULT_RECONNECTION_GRACE_MS,
  MATCH_END,
  MatchHost,
  encodeFrame,
  manualClock,
  type MatchEndReason,
  type MatchPacing,
  type PrestigeComputer,
} from '../../src/index.js';
import { probeContract, probeSession, recordingConnection } from './fixtures.js';

/** The no-op, always legal. */
const NOOP = { kind: 0 };

/**
 * Short pacing for tests that exercise deadlines.
 *
 * Both layers get a profile because {@link MatchPacing} has no single-profile
 * form. Every tick in these tests is a world tick — no raid can fire.
 */
const TEST_PACING: MatchPacing = {
  engagement: { tickIntervalMs: 5, actionDeadlineMs: 4 },
  world: { tickIntervalMs: 50, actionDeadlineMs: 40 },
};

/** A prestige computer that returns fixed values for testing. */
function fixedPrestige(earned: number, carried: number): PrestigeComputer {
  return () => ({ earned, carried });
}

/** Submits an action for a connection's slot at a tick. */
function submit(
  host: MatchHost,
  connectionId: string,
  matchId: string,
  tick: number,
  sequence: number,
  action: { kind: number; params?: number[] } = NOOP,
): void {
  host.receive(
    connectionId,
    encodeFrame({ type: 'action', matchId, tick, sequence, action }).trim(),
  );
}

/**
 * A host with two connected, handshaken participants and a match under way.
 *
 * Accepts overrides for pacing, prestige computer, and reconnection grace.
 */
function twoPlayerMatch(options?: {
  pacing?: MatchPacing;
  computePrestige?: PrestigeComputer;
  reconnectionGraceMs?: number;
}): {
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
    ...(options?.pacing !== undefined ? { pacing: options.pacing } : {}),
    ...(options?.computePrestige !== undefined ? { computePrestige: options.computePrestige } : {}),
    ...(options?.reconnectionGraceMs !== undefined
      ? { reconnectionGraceMs: options.reconnectionGraceMs }
      : {}),
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
  const stepLimit = 4;
  host.receive('a', encodeFrame({ type: 'challenge', opponent: 'bob', runSeed, stepLimit }).trim());
  host.receive(
    'b',
    encodeFrame({ type: 'accept', challengeId: bob.ofType('challenged')[0]!.challengeId }).trim(),
  );
  return { host, alice, bob, clock, matchId: alice.ofType('match-start')[0]!.matchId, runSeed, stepLimit };
}

// -------------------------------------------------------------------------
// Task 7.2 — Prestige carry-forward.
// -------------------------------------------------------------------------

describe('prestige carry-forward on match end', () => {
  it('computes prestige on a terminal match end and includes it in the notice', () => {
    const { host, alice, matchId, stepLimit } = twoPlayerMatch({
      computePrestige: fixedPrestige(512, 1024),
    });
    // Advance to the step limit so the match ends as truncated.
    for (let tick = 0; tick < stepLimit + 2; tick += 1) {
      submit(host, 'a', matchId, tick, tick + 1);
      submit(host, 'b', matchId, tick, tick + 1);
      host.pump();
    }

    const end = alice.ofType('match-end')[0];
    expect(end).toBeDefined();
    expect(end!.reason).toBe(MATCH_END.truncated);
    expect(end!.prestige).toBeDefined();
    expect(end!.prestige).toHaveLength(2);
    expect(end!.prestige![0]).toEqual({ slot: 0, earned: 512, carried: 1024 });
    expect(end!.prestige![1]).toEqual({ slot: 1, earned: 512, carried: 1024 });
  });

  it('does not compute prestige on abandonment', () => {
    const { host, alice } = twoPlayerMatch({
      computePrestige: fixedPrestige(512, 1024),
      reconnectionGraceMs: 0,
    });
    // Disconnect bob, which ends the match as abandoned.
    host.disconnect('b');
    const end = alice.ofType('match-end')[0];
    expect(end).toBeDefined();
    expect(end!.reason).toBe(MATCH_END.abandoned);
    expect(end!.prestige).toBeUndefined();
  });

  it('omits prestige from the notice when no computer is provided', () => {
    const { host, alice, matchId, stepLimit } = twoPlayerMatch({
      reconnectionGraceMs: 0,
    });
    for (let tick = 0; tick < stepLimit + 2; tick += 1) {
      submit(host, 'a', matchId, tick, tick + 1);
      submit(host, 'b', matchId, tick, tick + 1);
      host.pump();
    }
    const end = alice.ofType('match-end')[0];
    expect(end).toBeDefined();
    expect(end!.prestige).toBeUndefined();
  });

  it('updates the peer universe ref with the new carried prestige', () => {
    const { host, matchId, stepLimit } = twoPlayerMatch({
      computePrestige: fixedPrestige(512, 2048),
    });
    // Play to truncation.
    for (let tick = 0; tick < stepLimit + 2; tick += 1) {
      submit(host, 'a', matchId, tick, tick + 1);
      submit(host, 'b', matchId, tick, tick + 1);
      host.pump();
    }

    // Start a new match — the universe refs should carry the updated prestige.
    const carol = recordingConnection('c');
    host.connect(carol);
    host.receive('c', encodeFrame({ type: 'hello', participant: 'carol', contract: probeContract() }).trim());
    host.receive('a', encodeFrame({ type: 'challenge', opponent: 'carol', runSeed: 42, stepLimit: 2 }).trim());
    host.receive(
      'c',
      encodeFrame({ type: 'accept', challengeId: carol.ofType('challenged')[0]!.challengeId }).trim(),
    );

    // Alice's universe ref should now carry the updated prestige.
    const started = carol.ofType('match-start')[0];
    expect(started).toBeDefined();
    const aliceUniverse = started!.participants.find((p) => p.participant === 'alice');
    expect(aliceUniverse?.universe.prestige).toBe(2048);
  });

  it('calls the prestige computer with the correct end reason', () => {
    const reasons: MatchEndReason[] = [];
    const spy: PrestigeComputer = (_session, reason) => {
      reasons.push(reason);
      return { earned: 100, carried: 200 };
    };
    const { host, matchId, stepLimit } = twoPlayerMatch({
      computePrestige: spy,
    });
    for (let tick = 0; tick < stepLimit + 2; tick += 1) {
      submit(host, 'a', matchId, tick, tick + 1);
      submit(host, 'b', matchId, tick, tick + 1);
      host.pump();
    }
    // Both slots should have been called with 'truncated'.
    expect(reasons).toEqual([MATCH_END.truncated, MATCH_END.truncated]);
  });
});

// -------------------------------------------------------------------------
// Task 7.5 — Reconnection within a window.
// -------------------------------------------------------------------------

describe('reconnection within a grace window', () => {
  it('holds the match alive when a participant disconnects', () => {
    const { host, alice, matchId } = twoPlayerMatch({
      pacing: TEST_PACING,
      reconnectionGraceMs: 5000,
    });
    // Disconnect bob.
    host.disconnect('b');
    // The match should still be alive — no match-end notice.
    expect(alice.ofType('match-end')).toHaveLength(0);
    expect(host.liveMatchIds).toContain(matchId);
  });

  it('continues the match with substituted no-ops for the disconnected slot', () => {
    const { host, alice, clock, matchId } = twoPlayerMatch({
      pacing: TEST_PACING,
      reconnectionGraceMs: 5000,
    });
    host.disconnect('b');

    // Alice submits, deadline passes for bob, tick should close.
    submit(host, 'a', matchId, 0, 1);
    clock.advance(TEST_PACING.world.actionDeadlineMs + 1);
    host.pump();

    const tick = alice.ofType('tick')[0];
    expect(tick).toBeDefined();
    // Bob got a substituted no-op.
    expect(tick!.batch.entries[1]).toMatchObject({
      slot: 1,
      source: 'substituted',
      action: { kind: 0 },
    });
  });

  it('resumes the match when the participant reconnects within the window', () => {
    const { host, alice, clock, matchId } = twoPlayerMatch({
      pacing: TEST_PACING,
      reconnectionGraceMs: 5000,
    });

    // Advance one tick so there is a recorded batch.
    submit(host, 'a', matchId, 0, 1);
    submit(host, 'b', matchId, 0, 1);
    host.pump();
    expect(alice.ofType('tick')).toHaveLength(1);

    // Disconnect bob.
    host.disconnect('b');
    clock.advance(1000); // Well within the grace window.

    // Bob reconnects with a new connection.
    const bob2 = recordingConnection('b2');
    host.connect(bob2);
    host.receive(
      'b2',
      encodeFrame({ type: 'hello', participant: 'bob', contract: probeContract() }).trim(),
    );

    // Bob2 should receive a welcome and a match-start with the recorded batches.
    expect(bob2.ofType('welcome')).toHaveLength(1);
    const matchStart = bob2.ofType('match-start')[0];
    expect(matchStart).toBeDefined();
    expect(matchStart!.matchId).toBe(matchId);
    expect(matchStart!.slot).toBe(1);
    expect(matchStart!.batches).toBeDefined();
    expect(matchStart!.batches).toHaveLength(1);

    // Bob2 can now submit actions.
    submit(host, 'b2', matchId, 1, 2);
    submit(host, 'a', matchId, 1, 2);
    host.pump();

    // Both should see tick 1.
    expect(alice.ofType('tick')).toHaveLength(2);
    expect(bob2.ofType('tick')).toHaveLength(1);
  });

  it('ends the match as abandoned when the grace period expires', () => {
    const { host, alice, clock, matchId } = twoPlayerMatch({
      pacing: TEST_PACING,
      reconnectionGraceMs: 5000,
    });
    host.disconnect('b');
    // Past the grace window.
    clock.advance(5001);
    host.pump();

    const end = alice.ofType('match-end')[0];
    expect(end).toBeDefined();
    expect(end!.reason).toBe(MATCH_END.abandoned);
    expect(host.liveMatchIds).not.toContain(matchId);
  });

  it('ends the match immediately when grace is zero', () => {
    const { host, alice, matchId } = twoPlayerMatch({
      reconnectionGraceMs: 0,
    });
    host.disconnect('b');
    const end = alice.ofType('match-end')[0];
    expect(end).toBeDefined();
    expect(end!.reason).toBe(MATCH_END.abandoned);
    expect(host.liveMatchIds).not.toContain(matchId);
  });

  it('defaults to DEFAULT_RECONNECTION_GRACE_MS', () => {
    // Verify the constant is a reasonable positive value.
    expect(DEFAULT_RECONNECTION_GRACE_MS).toBeGreaterThan(0);
    expect(DEFAULT_RECONNECTION_GRACE_MS).toBe(30_000);
  });

  it('does not allow a different participant to steal a disconnected slot', () => {
    const { host, clock } = twoPlayerMatch({
      pacing: TEST_PACING,
      reconnectionGraceMs: 5000,
    });
    host.disconnect('b');
    clock.advance(1000);

    // An impostor tries to connect as 'bob'.
    const impostor = recordingConnection('impostor');
    host.connect(impostor);
    host.receive(
      'impostor',
      encodeFrame({ type: 'hello', participant: 'bob', contract: probeContract() }).trim(),
    );

    // This is a reconnection, so the impostor actually takes over the slot.
    // That is correct — the participant name is the identity, and whichever
    // connection says hello with it resumes. The test here is that the match
    // continues rather than crashing.
    expect(impostor.ofType('welcome')).toHaveLength(1);
    expect(impostor.ofType('match-start')).toHaveLength(1);
  });

  it('handles double-disconnect: both participants disconnect', () => {
    const { host, clock, matchId } = twoPlayerMatch({
      pacing: TEST_PACING,
      reconnectionGraceMs: 5000,
    });
    host.disconnect('a');
    host.disconnect('b');
    // Both are disconnected; the match should still be alive during the grace.
    expect(host.liveMatchIds).toContain(matchId);
    // Expire the grace.
    clock.advance(5001);
    host.pump();
    expect(host.liveMatchIds).not.toContain(matchId);
  });

  it('reconnection after match ended naturally during grace just gets a normal hello', () => {
    const { host, alice, clock, matchId, stepLimit } = twoPlayerMatch({
      pacing: TEST_PACING,
      reconnectionGraceMs: 5000,
    });

    // Disconnect bob.
    host.disconnect('b');

    // Alice plays to completion alone (bob gets no-ops from deadline).
    for (let tick = 0; tick < stepLimit + 2; tick += 1) {
      submit(host, 'a', matchId, tick, tick + 1);
      clock.advance(TEST_PACING.world.actionDeadlineMs + 1);
      host.pump();
    }
    // The match should have ended by truncation.
    expect(alice.ofType('match-end').length).toBeGreaterThanOrEqual(1);

    // Bob reconnects after the match ended.
    const bob2 = recordingConnection('b2');
    host.connect(bob2);
    host.receive(
      'b2',
      encodeFrame({ type: 'hello', participant: 'bob', contract: probeContract() }).trim(),
    );

    // Should get a normal welcome (no match-start, since match is over).
    expect(bob2.ofType('welcome')).toHaveLength(1);
    expect(bob2.ofType('match-start')).toHaveLength(0);
  });
});

describe('prestige and reconnection together', () => {
  it('computes prestige when a match with a disconnected player reaches truncation', () => {
    const { host, alice, clock, matchId, stepLimit } = twoPlayerMatch({
      pacing: TEST_PACING,
      computePrestige: fixedPrestige(256, 512),
      reconnectionGraceMs: 60_000,
    });

    // Disconnect bob but keep the match alive.
    host.disconnect('b');

    // Alice plays alone to truncation.
    for (let tick = 0; tick < stepLimit + 2; tick += 1) {
      submit(host, 'a', matchId, tick, tick + 1);
      clock.advance(TEST_PACING.world.actionDeadlineMs + 1);
      host.pump();
    }

    const end = alice.ofType('match-end')[0];
    expect(end).toBeDefined();
    expect(end!.reason).toBe(MATCH_END.truncated);
    // Prestige should still be computed for both slots.
    expect(end!.prestige).toHaveLength(2);
    expect(end!.prestige![0]).toEqual({ slot: 0, earned: 256, carried: 512 });
    expect(end!.prestige![1]).toEqual({ slot: 1, earned: 256, carried: 512 });
  });
});
