/*
 * Multiverse Mages — conquest: transfer on victory, respawn into a new bubble.
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
 * Task 7.3 — Transfer on conquest, and respawn into a different bubble.
 *
 * When a raid ends in conquest (attacker wins, defender's universe is destroyed):
 * - The defender's populace, materials and worship transfer to the attacker
 *   (done by the resolver, which applies `applyRaidOutcome`)
 * - The defender's universe ends
 * - The defender respawns in a fresh bubble with prestige carry
 *
 * These tests verify the **host's** conquest handling: the notices it sends, the
 * match it ends, and the respawn universe it assigns. The actual transfer is the
 * resolver's job and is tested in `rules-raid`.
 */

import { GOD_ACTION } from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import {
  MATCH_END,
  MatchHost,
  NOTICE,
  encodeFrame,
  manualClock,
  type MatchPacing,
  type RaidResolver,
} from '../../src/index.js';
import { probeContract, probeSession, recordingConnection } from './fixtures.js';

const TEST_PACING: MatchPacing = {
  engagement: { tickIntervalMs: 5, actionDeadlineMs: 4 },
  world: { tickIntervalMs: 50, actionDeadlineMs: 40 },
};

function conquestResolver(): RaidResolver {
  return {
    resolve() {
      return {
        victorSlot: 0,
        conquest: true,
        engagementTicks: 73,
      };
    },
  };
}

function matchWithConquest(options?: {
  universe?: { universeId: string; bubbleId: string; prestige?: number };
}) {
  const clock = manualClock(0);
  const host = new MatchHost({
    contract: probeContract(),
    createSession: probeSession,
    raidResolver: conquestResolver(),
    clock,
    pacing: TEST_PACING,
  });
  const alice = recordingConnection('a');
  const bob = recordingConnection('b');
  host.connect(alice);
  host.connect(bob);

  const aliceUniverse = { universeId: 'alice-u', bubbleId: 'bubble-0' };
  const bobUniverse = options?.universe ?? {
    universeId: 'bob-u',
    bubbleId: 'bubble-0',
    prestige: 128,
  };

  host.receive(
    'a',
    encodeFrame({
      type: 'hello',
      participant: 'alice',
      contract: probeContract(),
      universe: aliceUniverse,
    }).trim(),
  );
  host.receive(
    'b',
    encodeFrame({
      type: 'hello',
      participant: 'bob',
      contract: probeContract(),
      universe: bobUniverse,
    }).trim(),
  );
  host.receive('a', encodeFrame({ type: 'challenge', opponent: 'bob', runSeed: 11, stepLimit: 100 }).trim());
  host.receive(
    'b',
    encodeFrame({ type: 'accept', challengeId: bob.ofType('challenged')[0]!.challengeId }).trim(),
  );
  const matchId = alice.ofType('match-start')[0]!.matchId;
  return { host, alice, bob, clock, matchId };
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

describe('conquest (task 7.3)', () => {
  it('sends a conquest notice when the raid resolver reports conquest', () => {
    const { host, alice, matchId } = matchWithConquest();

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    const conquests = alice.sent.filter((f) => f.type === NOTICE.conquest);
    expect(conquests).toHaveLength(1);

    const notice = conquests[0] as unknown as {
      type: string;
      matchId: string;
      victorSlot: number;
      defeatedSlot: number;
      defeatedUniverse: { universeId: string; bubbleId: string };
      respawnUniverse: { universeId: string; bubbleId: string; prestige: number };
    };
    expect(notice.victorSlot).toBe(0);
    expect(notice.defeatedSlot).toBe(1);
    expect(notice.defeatedUniverse.universeId).toBe('bob-u');
    expect(notice.defeatedUniverse.bubbleId).toBe('bubble-0');
  });

  it('ends the match with reason "conquest"', () => {
    const { host, alice, matchId } = matchWithConquest();

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    const matchEnds = alice.ofType('match-end');
    expect(matchEnds).toHaveLength(1);
    expect(matchEnds[0]!.reason).toBe(MATCH_END.conquest);
  });

  it('assigns the respawn universe a different bubble than the defeated one', () => {
    const { host, alice, matchId } = matchWithConquest();

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    const conquest = alice.sent.find((f) => f.type === NOTICE.conquest) as unknown as {
      defeatedUniverse: { bubbleId: string };
      respawnUniverse: { universeId: string; bubbleId: string };
    } | undefined;
    expect(conquest).toBeDefined();
    // The respawn bubble is different from the original.
    expect(conquest!.respawnUniverse.bubbleId).not.toBe(conquest!.defeatedUniverse.bubbleId);
    // The universe id is preserved — it is a persistent identity.
    expect(conquest!.respawnUniverse.universeId).toBe('bob-u');
  });

  it('carries prestige into the respawn universe', () => {
    const { host, alice, matchId } = matchWithConquest({
      universe: { universeId: 'bob-u', bubbleId: 'bubble-0', prestige: 256 },
    });

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    const conquest = alice.sent.find((f) => f.type === NOTICE.conquest) as unknown as {
      respawnUniverse: { prestige: number };
    } | undefined;
    expect(conquest).toBeDefined();
    expect(conquest!.respawnUniverse.prestige).toBe(256);
  });

  it('broadcasts both the raid-resolved and conquest notices to both peers', () => {
    const { host, alice, bob, matchId } = matchWithConquest();

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    // Both peers see both notices.
    for (const peer of [alice, bob]) {
      const resolved = peer.sent.filter((f) => f.type === NOTICE.raidResolved);
      const conquests = peer.sent.filter((f) => f.type === NOTICE.conquest);
      const ends = peer.ofType('match-end');
      expect(resolved).toHaveLength(1);
      expect(conquests).toHaveLength(1);
      expect(ends).toHaveLength(1);
    }
  });

  it('removes the match from live matches after conquest', () => {
    const { host, matchId } = matchWithConquest();

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    expect(host.liveMatchIds).not.toContain(matchId);
  });

  it('keeps the match accessible for final checkpoint after conquest', () => {
    const { host, matchId } = matchWithConquest();

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    // The match is settled, not deleted — its final checkpoint can still be
    // compared, which is the release claim's subject.
    expect(host.matchOf(matchId)).toBeDefined();
  });

  it('sends the conquest notice before the match-end notice', () => {
    const { host, alice, matchId } = matchWithConquest();

    submit(host, 'a', matchId, 0, 1, { kind: GOD_ACTION.openPortal, params: [0] });
    submit(host, 'b', matchId, 0, 1, NOOP);
    host.pump();

    const conquestIndex = alice.sent.findIndex((f) => f.type === NOTICE.conquest);
    const endIndex = alice.sent.findIndex((f) => f.type === NOTICE.matchEnd);
    expect(conquestIndex).toBeLessThan(endIndex);
  });
});
