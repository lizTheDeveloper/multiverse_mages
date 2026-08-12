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
  ERROR_CODE,
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
    //
    // The match is looked up without a fallback on purpose. An earlier version
    // read `?? before`, and since `matchOf` did not then consult the settled
    // map, it resolved to `expect(before).toEqual(before)` — an assertion that
    // would have passed against a server that rewrote every hash it held.
    const after = host.matchOf(matchId);
    expect(after).toBeDefined();
    expect(after!.hashes()).toEqual(before);
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

describe('a checkpoint is checked against the seat, not against the frame', () => {
  it('refuses a stranger who names someone else\u2019s live match', () => {
    const { host, alice, matchId, log } = startedMatch();
    // A third connection, handshaken but holding no seat.
    const stranger = recordingConnection('s');
    host.connect(stranger);
    host.receive(
      's',
      encodeFrame({ type: 'hello', participant: 'mallory', contract: probeContract() }).trim(),
    );

    host.receive(
      's',
      encodeFrame({
        type: 'checkpoint',
        matchId,
        tick: 0,
        slot: 0,
        hash: 'ffffffffffffffff',
      }).trim(),
    );

    // One frame must not be able to end a match its sender is not in. \u00a74.2 puts
    // this defence at the boundary, and a frame the boundary trusts to name its
    // own subject is not defended.
    expect(stranger.ofType('error')[0]?.code).toBe(ERROR_CODE.noMatch);
    expect(alice.ofType('desync')).toHaveLength(0);
    expect(alice.ofType('match-end')).toHaveLength(0);
    expect(host.matchOf(matchId)?.running).toBe(true);
    expect(log.some((line) => line.startsWith('desync '))).toBe(false);
  });

  it('refuses a participant that names a match other than its own', () => {
    const { host, alice, matchId } = startedMatch();
    host.receive(
      'a',
      encodeFrame({
        type: 'checkpoint',
        matchId: 'match-99',
        tick: 0,
        slot: 0,
        hash: 'ffffffffffffffff',
      }).trim(),
    );
    expect(alice.ofType('error')[0]?.code).toBe(ERROR_CODE.unknownMatch);
    expect(host.matchOf(matchId)?.running).toBe(true);
  });

  it('refuses a participant that vouches for its opponent\u2019s slot', () => {
    const { host, alice, bob, clock, matchId } = startedMatch();
    clock.advance(1_000);
    host.pump();

    // Alice reports a lie about bob's universe. Allowing it would be objective
    // denial by a frame: one participant ending the match on the other's slot.
    host.receive(
      'a',
      encodeFrame({
        type: 'checkpoint',
        matchId,
        tick: 0,
        slot: 1,
        hash: 'ffffffffffffffff',
      }).trim(),
    );

    expect(alice.ofType('error')[0]?.code).toBe(ERROR_CODE.badRequest);
    expect(bob.ofType('desync')).toHaveLength(0);
    expect(host.matchOf(matchId)?.running).toBe(true);
  });
});

describe('a challenge may only be declined by the party it was sent to', () => {
  it('ignores a decline from a connection the challenge was not sent to', () => {
    const host = new MatchHost({
      contract: probeContract(),
      createSession: probeSession,
      clock: manualClock(0),
    });
    const alice = recordingConnection('a');
    const bob = recordingConnection('b');
    const mallory = recordingConnection('m');
    for (const [conn, name] of [
      [alice, 'alice'],
      [bob, 'bob'],
      [mallory, 'mallory'],
    ] as const) {
      host.connect(conn);
      host.receive(
        conn.id,
        encodeFrame({ type: 'hello', participant: name, contract: probeContract() }).trim(),
      );
    }
    host.receive(
      'a',
      encodeFrame({ type: 'challenge', opponent: 'bob', runSeed: 1, stepLimit: 4 }).trim(),
    );
    const challengeId = bob.ofType('challenged')[0]!.challengeId;

    // Ids come from a counter and are guessable, so an unchecked decline is a
    // denial of service made of one frame and an integer.
    host.receive('m', encodeFrame({ type: 'decline', challengeId }).trim());

    // The challenge survives, and bob can still accept it.
    host.receive('b', encodeFrame({ type: 'accept', challengeId }).trim());
    expect(alice.ofType('match-start')).toHaveLength(1);
  });
});
