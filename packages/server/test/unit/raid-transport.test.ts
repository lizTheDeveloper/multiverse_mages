/*
 * Multiverse Mages — carrying a raid across the wire: the five-step lifecycle.
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
 * Task 7.4 — Engagement transport: carrying a raid across the wire.
 *
 * A raid is `(attacker snapshot, defender snapshot, raid seed) -> outcome`. The
 * server needs to:
 * 1. Serialize both universe snapshots when a portal opens
 * 2. Send them to wherever the raid resolves (same process for now)
 * 3. Run the raid deterministically
 * 4. Send the outcome back
 * 5. Apply consequences to both universes
 *
 * These tests verify the host's coordination of that lifecycle through an
 * injected {@link RaidResolver}, without importing `@mm/rules-raid` — the
 * server's §5 boundary is respected here exactly as it is in production.
 */

import { GOD_ACTION } from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import {
  MatchHost,
  NOTICE,
  encodeFrame,
  manualClock,
  type MatchPacing,
  type RaidResolution,
  type RaidResolver,
} from '../../src/index.js';
import { probeContract, probeSession, recordingConnection } from './fixtures.js';

/** Deadlines short enough for manual stepping. */
const TEST_PACING: MatchPacing = {
  engagement: { tickIntervalMs: 5, actionDeadlineMs: 4 },
  world: { tickIntervalMs: 50, actionDeadlineMs: 40 },
};

/** A resolver that records its calls and returns a canned result. */
function mockResolver(result: RaidResolution): {
  resolver: RaidResolver;
  calls: { attacker: unknown; defender: unknown; raidSeed: number }[];
} {
  const calls: { attacker: unknown; defender: unknown; raidSeed: number }[] = [];
  return {
    resolver: {
      resolve(attacker, defender, raidSeed) {
        calls.push({ attacker, defender, raidSeed });
        return result;
      },
    },
    calls,
  };
}

/** Sets up a two-player match with the given resolver. */
function matchWithResolver(result: RaidResolution) {
  const { resolver, calls } = mockResolver(result);
  const clock = manualClock(0);
  const host = new MatchHost({
    contract: probeContract(),
    createSession: probeSession,
    raidResolver: resolver,
    clock,
    pacing: TEST_PACING,
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
  const stepLimit = 100;
  host.receive('a', encodeFrame({ type: 'challenge', opponent: 'bob', runSeed, stepLimit }).trim());
  host.receive(
    'b',
    encodeFrame({ type: 'accept', challengeId: bob.ofType('challenged')[0]!.challengeId }).trim(),
  );
  const matchId = alice.ofType('match-start')[0]!.matchId;
  return { host, alice, bob, clock, matchId, calls };
}

/** Submits an action for a connection. */
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

const NOOP = { kind: 0 };

describe('raid transport (task 7.4)', () => {
  it('invokes the resolver when action 14 (open portal) is submitted', () => {
    const { host, matchId, calls } = matchWithResolver({
      victorSlot: 0,
      conquest: false,
      engagementTicks: 42,
    });

    // Tick 0: both submit no-ops. No raid.
    submit(host, 'a', matchId, 0, 1, NOOP);
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();
    expect(calls).toHaveLength(0);

    // Tick 1: alice submits open-portal. The resolver should be called.
    submit(host, 'a', matchId, 1, 2, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 1, 2, NOOP);
    host.pump();
    expect(calls).toHaveLength(1);
  });

  it('does not invoke the resolver when no resolver is configured', () => {
    // A host without a resolver — the pre-existing behavior.
    const clock = manualClock(0);
    const host = new MatchHost({
      contract: probeContract(),
      createSession: probeSession,
      clock,
      pacing: TEST_PACING,
    });
    const alice = recordingConnection('a');
    const bob = recordingConnection('b');
    host.connect(alice);
    host.connect(bob);
    host.receive('a', encodeFrame({ type: 'hello', participant: 'alice', contract: probeContract() }).trim());
    host.receive('b', encodeFrame({ type: 'hello', participant: 'bob', contract: probeContract() }).trim());
    host.receive('a', encodeFrame({ type: 'challenge', opponent: 'bob', runSeed: 11, stepLimit: 100 }).trim());
    host.receive(
      'b',
      encodeFrame({ type: 'accept', challengeId: bob.ofType('challenged')[0]!.challengeId }).trim(),
    );
    const matchId = alice.ofType('match-start')[0]!.matchId;

    // Submit open-portal. Without a resolver, nothing extra happens.
    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);

    // Should not throw.
    expect(() => host.pump()).not.toThrow();
  });

  it('broadcasts a raid-resolved notice to both participants', () => {
    const { host, alice, bob, matchId } = matchWithResolver({
      victorSlot: 0,
      conquest: false,
      engagementTicks: 65,
    });

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    const aliceResolved = alice.ofType('raid-resolved' as 'tick');
    const bobResolved = bob.ofType('raid-resolved' as 'tick');
    expect(aliceResolved).toHaveLength(1);
    expect(bobResolved).toHaveLength(1);

    const notice = aliceResolved[0] as unknown as {
      type: string;
      matchId: string;
      attackerSlot: number;
      defenderSlot: number;
      victorSlot: number;
      engagementTicks: number;
      conquest: boolean;
    };
    expect(notice.type).toBe(NOTICE.raidResolved);
    expect(notice.matchId).toBe(matchId);
    expect(notice.attackerSlot).toBe(0);
    expect(notice.defenderSlot).toBe(1);
    expect(notice.victorSlot).toBe(0);
    expect(notice.engagementTicks).toBe(65);
    expect(notice.conquest).toBe(false);
  });

  it('passes the correct sessions and a deterministic raid seed to the resolver', () => {
    const { host, matchId, calls } = matchWithResolver({
      victorSlot: 1,
      conquest: false,
      engagementTicks: 10,
    });

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    // The resolver received two distinct sessions.
    expect(call.attacker).not.toBe(call.defender);
    // The raid seed is deterministic: tick * 7 + 1.
    expect(call.raidSeed).toBe(0 * 7 + 1);
  });

  it('updates hashes after the raid resolves', () => {
    const { host, alice, matchId } = matchWithResolver({
      victorSlot: 0,
      conquest: false,
      engagementTicks: 30,
    });

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    // The raid-resolved notice carries hashes.
    const resolved = alice.sent.find((f) => f.type === NOTICE.raidResolved) as unknown as {
      hashesAfterRaid: readonly string[];
    } | undefined;
    expect(resolved).toBeDefined();
    expect(resolved!.hashesAfterRaid).toHaveLength(2);
    for (const hash of resolved!.hashesAfterRaid) {
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    }
  });

  it('does not end the match when the raid is not a conquest', () => {
    const { host, alice, matchId } = matchWithResolver({
      victorSlot: 1,
      conquest: false,
      engagementTicks: 50,
    });

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    // No match-end notice.
    const matchEnds = alice.ofType('match-end');
    expect(matchEnds).toHaveLength(0);

    // The match is still running — can submit the next tick.
    expect(host.liveMatchIds).toContain(matchId);
  });
});
