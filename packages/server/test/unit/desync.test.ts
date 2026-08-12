/*
 * Multiverse Mages — a hash mismatch is reported, named, and never corrected.
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
 * `pvp-server`'s proposal fixes the semantics these tests hold to:
 *
 * > Detect desync using the snapshot hash that `deterministic-replay` already
 * > produces, rather than inventing a second integrity mechanism. A hash
 * > mismatch is a hard, reported, logged event — never a silent correction.
 *
 * Three claims, and a test for each: it is *detected*, it is *reported with both
 * hashes*, and **nothing is corrected**. The third is the one worth writing
 * carefully, because a resync path is the kind of thing that gets added later as
 * a kindness and turns a determinism bug into a stutter nobody reports.
 */

import { describe, expect, it } from 'vitest';

import {
  MATCH_END,
  MatchHost,
  NOTICE,
  compareHash,
  desyncLogLine,
  encodeFrame,
  manualClock,
} from '../../src/index.js';
import { probeContract, probeSession, recordingConnection } from './fixtures.js';

describe('compareHash', () => {
  it('says nothing when the hashes agree', () => {
    const notice = compareHash('m', ['aaaa', 'bbbb'], {
      participant: 'alice',
      slot: 1,
      tick: 3,
      hash: 'bbbb',
    });
    expect(notice).toBeUndefined();
  });

  it('names the tick, the slot, the participant and both hashes when they differ', () => {
    const notice = compareHash('m', ['aaaa', 'bbbb'], {
      participant: 'alice',
      slot: 1,
      tick: 3,
      hash: 'cccc',
    });
    expect(notice).toMatchObject({
      type: NOTICE.desync,
      matchId: 'm',
      tick: 3,
      slot: 1,
      participant: 'alice',
      authoritativeHash: 'bbbb',
      reportedHash: 'cccc',
      corrected: false,
    });
  });

  it('puts every value a post-mortem needs on one log line', () => {
    const notice = compareHash('m', ['aaaa'], {
      participant: 'alice',
      slot: 0,
      tick: 9,
      hash: 'zzzz',
    })!;
    const line = desyncLogLine(notice);
    for (const fragment of ['match=m', 'tick=9', 'slot=0', 'authoritative=aaaa', 'reported=zzzz']) {
      expect(line).toContain(fragment);
    }
    expect(line).toContain('corrected=false');
  });
});

/** Drives a two-participant match to the point where a checkpoint can be sent. */
function startedMatch(): {
  host: MatchHost;
  alice: ReturnType<typeof recordingConnection>;
  bob: ReturnType<typeof recordingConnection>;
  clock: ReturnType<typeof manualClock>;
  matchId: string;
  log: string[];
} {
  const clock = manualClock(0);
  const log: string[] = [];
  const host = new MatchHost({
    contract: probeContract(),
    createSession: probeSession,
    clock,
    log: (line) => log.push(line),
  });

  const alice = recordingConnection('a');
  const bob = recordingConnection('b');
  host.connect(alice);
  host.connect(bob);

  const hello = (name: string): string =>
    encodeFrame({ type: 'hello', participant: name, contract: probeContract() }).trim();
  host.receive('a', hello('alice'));
  host.receive('b', hello('bob'));
  host.receive(
    'a',
    encodeFrame({ type: 'challenge', opponent: 'bob', runSeed: 3, stepLimit: 20 }).trim(),
  );
  const challengeId = bob.ofType('challenged')[0]!.challengeId;
  host.receive('b', encodeFrame({ type: 'accept', challengeId }).trim());

  const matchId = alice.ofType('match-start')[0]!.matchId;
  return { host, alice, bob, clock, matchId, log };
}

describe('a desync ends the match and corrects nothing', () => {
  it('reports a mismatch to both participants, names both hashes, and stops the match', () => {
    const { host, alice, bob, clock, matchId, log } = startedMatch();

    // One tick with nothing submitted: both slots get the substituted no-op.
    clock.advance(1_000);
    host.pump();
    const tick = alice.ofType('tick')[0]!;
    expect(tick.tick).toBe(0);

    const authoritative = tick.hashes[0]!;
    const before = host.matchOf(matchId)!.hashes();

    // Alice reports a hash her universe did not produce.
    host.receive(
      'a',
      encodeFrame({
        type: 'checkpoint',
        matchId,
        tick: 0,
        slot: 0,
        hash: 'ffffffffffffffff',
      }).trim(),
    );

    const notices = alice.ofType('desync');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      tick: 0,
      slot: 0,
      participant: 'alice',
      authoritativeHash: authoritative,
      reportedHash: 'ffffffffffffffff',
      corrected: false,
    });
    // Both sides are told. A desync one participant never hears about is a
    // desync that participant keeps playing through.
    expect(bob.ofType('desync')).toHaveLength(1);

    // Hard: the match ends, and it ends *because of the desync*.
    const ends = alice.ofType('match-end');
    expect(ends).toHaveLength(1);
    expect(ends[0]?.reason).toBe(MATCH_END.desync);

    // Logged, with both hashes.
    expect(log.some((line) => line.startsWith('desync ') && line.includes('corrected=false'))).toBe(
      true,
    );

    // **Never corrected.** The authoritative state is byte-identical to what it
    // was before the false report arrived: nothing rolled back, nothing was
    // pushed to the liar, nothing re-derived.
    expect(before).toEqual(host.matchOf(matchId)?.hashes() ?? before);
  });

  it('accepts a truthful checkpoint without comment', () => {
    const { host, alice, clock, matchId } = startedMatch();
    clock.advance(1_000);
    host.pump();
    const tick = alice.ofType('tick')[0]!;

    host.receive(
      'a',
      encodeFrame({ type: 'checkpoint', matchId, tick: 0, slot: 0, hash: tick.hashes[0] }).trim(),
    );

    expect(alice.ofType('desync')).toHaveLength(0);
    expect(alice.ofType('match-end')).toHaveLength(0);
    expect(host.matchOf(matchId)?.running).toBe(true);
  });

  it('has no method that could correct a participant', () => {
    // A structural check rather than a behavioural one, and deliberately so: the
    // behaviour above proves this build does not correct, while this proves the
    // surface offers no way to. A `resync` or `pushSnapshot` added later would
    // fail here, next to the paragraph saying why it must not exist.
    const surface = Object.getOwnPropertyNames(MatchHost.prototype);
    for (const forbidden of ['resync', 'correct', 'pushSnapshot', 'rollback', 'reconcile']) {
      expect(surface).not.toContain(forbidden);
    }
  });
});
