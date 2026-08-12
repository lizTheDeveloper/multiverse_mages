/*
 * Multiverse Mages — the handshake: what is refused, and what is merely reported.
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
  ALL_VERBS,
  ConnectionBudget,
  DEFAULT_BUBBLE_ID,
  ERROR_CODE,
  INELIGIBILITY,
  challengeEligibility,
  rosterContains,
  MatchHost,
  encodeFrame,
  isFatal,
  manualClock,
} from '../../src/index.js';
import { PROBE_CONTENT_REVISION, probeContract, probeSession, recordingConnection } from './fixtures.js';

function host(): { host: MatchHost; conn: ReturnType<typeof recordingConnection> } {
  const built = new MatchHost({
    contract: probeContract(),
    createSession: probeSession,
    clock: manualClock(0),
  });
  const conn = recordingConnection('c');
  built.connect(conn);
  return { host: built, conn };
}

describe('nothing is answered before hello', () => {
  it('refuses a match verb from a connection that has not introduced itself', () => {
    const { host: h, conn } = host();
    h.receive('c', encodeFrame({ type: 'action', matchId: 'm', tick: 0, sequence: 1, action: { kind: 0 } }).trim());
    expect(conn.ofType('error')[0]?.code).toBe(ERROR_CODE.handshakeRequired);
  });

  it('welcomes a client whose contract agrees', () => {
    const { host: h, conn } = host();
    h.receive('c', encodeFrame({ type: 'hello', participant: 'alice', contract: probeContract() }).trim());
    const welcome = conn.ofType('welcome')[0];
    expect(welcome?.participant).toBe('alice');
    expect(welcome?.advisory).toEqual([]);
  });
});

describe('§0: a content-revision mismatch is refusal, and it names both revisions', () => {
  it('refuses, names both, and closes the connection', () => {
    const { host: h, conn } = host();
    const theirs = 'ffffffffffffffffffffffffffffffff';
    h.receive(
      'c',
      encodeFrame({
        type: 'hello',
        participant: 'alice',
        contract: probeContract({ contentRevision: theirs }),
      }).trim(),
    );

    const error = conn.ofType('error')[0];
    expect(error?.code).toBe(ERROR_CODE.contentRevisionMismatch);
    expect(error?.fatal).toBe(true);
    // §0: "mismatch is refusal with both revisions named." A refusal a player
    // cannot diagnose is one that gets worked around rather than fixed.
    expect(error?.revisions).toEqual({ server: PROBE_CONTENT_REVISION, client: theirs });
    expect(conn.closed()).toBe(true);
    expect(conn.ofType('welcome')).toHaveLength(0);
  });

  it('has no negotiation path — there is no partial-compatibility answer to give', () => {
    // §0: "There is no partial-compatibility rule and no negotiation." The
    // refusal is the only outcome, so the only thing to assert is that no other
    // frame is ever produced by a mismatched hello.
    const { host: h, conn } = host();
    h.receive(
      'c',
      encodeFrame({
        type: 'hello',
        participant: 'alice',
        contract: probeContract({ contentRevision: '0'.repeat(32) }),
      }).trim(),
    );
    expect(conn.sent.map((f) => f.type)).toEqual(['error']);
  });

  it('is fatal, alongside the other two conditions that must never see a tick', () => {
    expect(isFatal(ERROR_CODE.contentRevisionMismatch)).toBe(true);
    expect(isFatal(ERROR_CODE.contractMismatch)).toBe(true);
    expect(isFatal(ERROR_CODE.rateLimited)).toBe(true);
    expect(isFatal(ERROR_CODE.badRequest)).toBe(false);
  });
});

describe('§4.1: a structural contract mismatch is fatal, an advisory one is not', () => {
  it('refuses a client whose observation layout digest disagrees, naming every field', () => {
    const { host: h, conn } = host();
    h.receive(
      'c',
      encodeFrame({
        type: 'hello',
        participant: 'alice',
        contract: probeContract({ observationLayoutDigest: 'deadbeef', buildVersion: 'other' }),
      }).trim(),
    );
    const error = conn.ofType('error')[0];
    expect(error?.code).toBe(ERROR_CODE.contractMismatch);
    expect(error?.fatal).toBe(true);
    // Every disagreement in one refusal, so a client is not made to discover
    // them one reconnect at a time.
    const fields = (error?.disagreements ?? []).map((d) => d.field);
    expect(fields).toContain('observationLayoutDigest');
    expect(fields).toContain('buildVersion');
    expect(conn.ofType('welcome')).toHaveLength(0);
  });

  it('admits a client whose build version differs, and says so', () => {
    const { host: h, conn } = host();
    h.receive(
      'c',
      encodeFrame({
        type: 'hello',
        participant: 'alice',
        contract: probeContract({ buildVersion: 'a-different-build' }),
      }).trim(),
    );
    const welcome = conn.ofType('welcome')[0];
    expect(welcome).toBeDefined();
    // Reported, not refused: this one moves on every balance tune, and a check
    // people disable is worse than no check.
    expect(welcome?.advisory.map((d) => d.field)).toEqual(['buildVersion']);
    expect(conn.closed()).toBe(false);
  });
});

describe('§4.2: the boundary defends the core, which does not defend itself', () => {
  it('drops a connection that floods frames', () => {
    const clock = manualClock(0);
    const budget = new ConnectionBudget(clock, {
      maxFramesPerWindow: 3,
      windowMs: 1_000,
      maxSubmissionsPerTick: 2,
    });
    expect(budget.chargeFrame()).toBeUndefined();
    expect(budget.chargeFrame()).toBeUndefined();
    expect(budget.chargeFrame()).toBeUndefined();
    expect(budget.chargeFrame()).toBe('frame-rate');

    // The window resets on the clock, not on a frame count.
    clock.advance(1_001);
    expect(budget.chargeFrame()).toBeUndefined();
  });

  it('bounds submissions per tick, and does not let a quiet participant bank them', () => {
    const budget = new ConnectionBudget(manualClock(0), {
      maxFramesPerWindow: 1_000,
      windowMs: 1_000,
      maxSubmissionsPerTick: 2,
    });
    expect(budget.chargeSubmission(0)).toBeUndefined();
    expect(budget.chargeSubmission(0)).toBeUndefined();
    expect(budget.chargeSubmission(0)).toBe('submission-budget');
    // A new tick is a new budget, not an accumulated one.
    expect(budget.chargeSubmission(1)).toBeUndefined();
    expect(budget.chargeSubmission(1)).toBeUndefined();
    expect(budget.chargeSubmission(1)).toBe('submission-budget');
  });

  it('ends the connection of a peer that exceeds its frame budget', () => {
    const h = new MatchHost({
      contract: probeContract(),
      createSession: probeSession,
      clock: manualClock(0),
      policy: { maxFramesPerWindow: 2, windowMs: 1_000, maxSubmissionsPerTick: 1 },
    });
    const conn = recordingConnection('c');
    h.connect(conn);
    for (let i = 0; i < 5; i += 1) {
      h.receive('c', encodeFrame({ type: 'hello', participant: `n${i}`, contract: probeContract() }).trim());
    }
    const errors = conn.ofType('error');
    expect(errors.some((e) => e.code === ERROR_CODE.rateLimited)).toBe(true);
    expect(conn.closed()).toBe(true);
  });
});

describe('vision §12: direct challenge only', () => {
  it('challenges a named opponent and starts on acceptance', () => {
    const h = new MatchHost({
      contract: probeContract(),
      createSession: probeSession,
      clock: manualClock(0),
    });
    const alice = recordingConnection('a');
    const bob = recordingConnection('b');
    h.connect(alice);
    h.connect(bob);
    h.receive('a', encodeFrame({ type: 'hello', participant: 'alice', contract: probeContract() }).trim());
    h.receive('b', encodeFrame({ type: 'hello', participant: 'bob', contract: probeContract() }).trim());

    h.receive('a', encodeFrame({ type: 'challenge', opponent: 'bob', runSeed: 5, stepLimit: 3 }).trim());
    const challenged = bob.ofType('challenged')[0];
    expect(challenged?.from).toBe('alice');
    // Only the named opponent is told. There is no queue to broadcast into.
    expect(alice.ofType('challenged')).toHaveLength(0);

    h.receive('b', encodeFrame({ type: 'accept', challengeId: challenged!.challengeId }).trim());
    expect(alice.ofType('match-start')).toHaveLength(1);
    expect(bob.ofType('match-start')).toHaveLength(1);
  });

  it('refuses a challenge to a name nobody is using', () => {
    const { host: h, conn } = host();
    h.receive('c', encodeFrame({ type: 'hello', participant: 'alice', contract: probeContract() }).trim());
    h.receive('c', encodeFrame({ type: 'challenge', opponent: 'nobody', runSeed: 1, stepLimit: 1 }).trim());
    expect(conn.ofType('error')[0]?.code).toBe(ERROR_CODE.badRequest);
  });

  it('offers no verb for a queue, a ladder or a ranking', () => {
    // Vision §12 puts matchmaking beyond direct challenge out of scope for v1.
    // Asserted on the vocabulary rather than on behaviour, because the way this
    // scope creeps is a verb added "just to list open games".
    const verbs = new Set<string>(ALL_VERBS);
    for (const absent of ['queue', 'matchmake', 'ladder', 'rank', 'list']) {
      expect(verbs.has(absent)).toBe(false);
    }
  });
});

describe('a universe belongs to a group of multiverses', () => {
  const inCluster = (universeId: string, bubbleId: string) => ({ universeId, bubbleId });

  it('allows a challenge between two universes in one bubble', () => {
    expect(
      challengeEligibility(inCluster('u1', 'c1'), inCluster('u2', 'c1')),
    ).toBeUndefined();
  });

  it('refuses a challenge across bubbles', () => {
    // The rule this exists for: a universe extinguished by conquest respawns in
    // a *different* bubble, carrying its prestige. The conqueror keeps the
    // tribute and loses the target, and that anti-farming property is only
    // expressible if reachability is a predicate rather than an assumption.
    expect(challengeEligibility(inCluster('u1', 'c1'), inCluster('u2', 'c2'))).toBe(
      INELIGIBILITY.bubble,
    );
  });

  it('refuses a universe challenging itself', () => {
    expect(challengeEligibility(inCluster('u1', 'c1'), inCluster('u1', 'c1'))).toBe(
      INELIGIBILITY.self,
    );
  });

  it('refuses on differing content revisions when it is given them', () => {
    expect(
      challengeEligibility(inCluster('u1', 'c1'), inCluster('u2', 'c1'), {
        challenger: 'a'.repeat(32),
        opponent: 'b'.repeat(32),
      }),
    ).toBe(INELIGIBILITY.contentRevision);
  });

  it('places a participant that announces no universe in the default bubble', () => {
    const h = new MatchHost({
      contract: probeContract(),
      createSession: probeSession,
      clock: manualClock(0),
    });
    const alice = recordingConnection('a');
    const bob = recordingConnection('b');
    h.connect(alice);
    h.connect(bob);
    h.receive('a', encodeFrame({ type: 'hello', participant: 'alice', contract: probeContract() }).trim());
    h.receive('b', encodeFrame({ type: 'hello', participant: 'bob', contract: probeContract() }).trim());
    h.receive('a', encodeFrame({ type: 'challenge', opponent: 'bob', runSeed: 1, stepLimit: 2 }).trim());
    h.receive(
      'b',
      encodeFrame({ type: 'accept', challengeId: bob.ofType('challenged')[0]!.challengeId }).trim(),
    );

    // Nothing has issued a universe id, so both are placed in one bubble and
    // are mutually reachable — which is what makes v1 work at all.
    const started = alice.ofType('match-start')[0]!;
    expect(started.participants.map((p) => p.universe.bubbleId)).toEqual([
      DEFAULT_BUBBLE_ID,
      DEFAULT_BUBBLE_ID,
    ]);
    // The identity travels even when it was defaulted, so a match record can
    // name which universes played rather than only which connections did.
    expect(started.participants[0]?.universe.universeId).toContain('alice');
  });

  it('refuses a challenge to a universe in another bubble, and says which predicate refused', () => {
    const h = new MatchHost({
      contract: probeContract(),
      createSession: probeSession,
      clock: manualClock(0),
    });
    const alice = recordingConnection('a');
    const bob = recordingConnection('b');
    h.connect(alice);
    h.connect(bob);
    h.receive(
      'a',
      encodeFrame({
        type: 'hello',
        participant: 'alice',
        contract: probeContract(),
        universe: { universeId: 'u-alice', bubbleId: 'north' },
      }).trim(),
    );
    h.receive(
      'b',
      encodeFrame({
        type: 'hello',
        participant: 'bob',
        contract: probeContract(),
        universe: { universeId: 'u-bob', bubbleId: 'south' },
      }).trim(),
    );
    h.receive('a', encodeFrame({ type: 'challenge', opponent: 'bob', runSeed: 1, stepLimit: 2 }).trim());

    const error = alice.ofType('error')[0];
    expect(error?.code).toBe(ERROR_CODE.ineligible);
    expect(error?.ineligibility).toBe(INELIGIBILITY.bubble);
    // Not fatal: challenging an unreachable universe is an ordinary mistake and
    // the participant may challenge someone else.
    expect(error?.fatal).toBe(false);
    expect(alice.closed()).toBe(false);
    // And no match was established, nor was bob even told.
    expect(alice.ofType('match-start')).toHaveLength(0);
    expect(bob.ofType('challenged')).toHaveLength(0);
  });
});

describe('a bubble roster is an adjacency set, not a coordinate', () => {
  const ref = (universeId: string, bubbleId: string) => ({ universeId, bubbleId });

  it('decides membership from the roster when one is loaded', () => {
    const roster = { bubbleId: 'north', members: ['u-a', 'u-b'] };
    expect(
      challengeEligibility(ref('u-a', 'north'), ref('u-b', 'north'), undefined, roster),
    ).toBeUndefined();
  });

  it('refuses a universe whose label matches but which the roster does not list', () => {
    // The case a shared label cannot express, and the reason the roster is the
    // authoritative form: a universe can claim a bubble it is not in.
    const roster = { bubbleId: 'north', members: ['u-a', 'u-b'] };
    expect(
      challengeEligibility(ref('u-a', 'north'), ref('u-impostor', 'north'), undefined, roster),
    ).toBe(INELIGIBILITY.bubble);
  });

  it('ignores a roster belonging to a different bubble', () => {
    // A roster for somebody else's bubble answers a question nobody asked.
    const roster = { bubbleId: 'south', members: ['u-a', 'u-b'] };
    expect(
      challengeEligibility(ref('u-a', 'north'), ref('u-b', 'north'), undefined, roster),
    ).toBe(INELIGIBILITY.bubble);
  });

  it('falls back to the label when no roster has been loaded', () => {
    // Which is what v1 does: no persistence layer exists to have written one.
    expect(challengeEligibility(ref('u-a', 'north'), ref('u-b', 'north'))).toBeUndefined();
    expect(challengeEligibility(ref('u-a', 'north'), ref('u-b', 'south'))).toBe(
      INELIGIBILITY.bubble,
    );
  });

  it('answers membership without any notion of distance', () => {
    // Vision §7a: at world scale there is no map. The roster carries ids and
    // nothing else, so there is no position to mistake for a coordinate.
    const roster = { bubbleId: 'north', members: ['u-a', 'u-b', 'u-c'] };
    expect(rosterContains(roster, 'u-c')).toBe(true);
    expect(rosterContains(roster, 'u-z')).toBe(false);
    expect(Object.keys(roster)).toEqual(['bubbleId', 'members']);
  });
});
