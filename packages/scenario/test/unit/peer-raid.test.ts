/*
 * Multiverse Mages — a portal seat can hold a live universe instead of a stand-in.
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
 * Two universes in one process, A and B, each the other's only portal seat. A's
 * god names six raiders (action 10) and opens a portal (action 14) on B.
 *
 * The claim is that the raid **lands in B**, and it is checked against a twin
 * of B that differs from it in nothing but having been raided: the same seed,
 * the same peer seam with an empty seat, the same state tap. Without the twin a
 * difference could be the seam itself; without the no-raid arm the twin could
 * be differing for some other reason. Both arms are here.
 *
 * The absent-seam case — every committed baseline and golden — is covered by
 * the golden replay suite, which builds no peers.
 */

import { describe, expect, it } from 'vitest';

import { createSession, GOD_ACTION, type AgentSession } from '@mm/agent-api';
import type { SimState } from '@mm/sim-core';
import { MAGE_ROLE } from '@mm/state';

import { participantOf, referenceContent, referenceScenario, type RaidRecord } from '@mm/scenario';

const content = referenceContent();
const CONFIG = { worldTickCap: 4000, options: { foundingPortalMagic: 1 } } as const;

interface Pair {
  readonly a: AgentSession;
  readonly b: AgentSession;
  readonly twin: AgentSession;
  readonly aRaids: () => readonly RaidRecord[];
  readonly toldB: RaidRecord[];
}

function pair(): Pair {
  const live: { a?: SimState; b?: SimState } = {};
  const toldB: RaidRecord[] = [];
  const runA = referenceScenario(content, {
    onState: (s) => { live.a = s; },
    peers: {
      seats: [1],
      participant: () => (live.b === undefined ? undefined : participantOf(live.b, content)),
      onOutbound: (_seat, record) => toldB.push(record),
    },
  });
  const runB = referenceScenario(content, {
    onState: (s) => { live.b = s; },
    peers: { seats: [1], participant: () => (live.a === undefined ? undefined : participantOf(live.a, content)) },
  });
  const runTwin = referenceScenario(content, {
    onState: () => undefined,
    peers: { seats: [1], participant: () => undefined },
  });
  const a = createSession({ scenario: runA.scenario, strategyId: 'a' });
  const b = createSession({ scenario: runB.scenario, strategyId: 'b' });
  const twin = createSession({ scenario: runTwin.scenario, strategyId: 'twin' });
  a.reset(1, CONFIG);
  b.reset(2, CONFIG);
  twin.reset(2, CONFIG);
  return { a, b, twin, aRaids: runA.raids, toldB };
}

/** One tick everywhere: A does `action`, B and its twin do nothing. */
function tick(p: Pair, action: { kind: number; params?: number[] }): void {
  p.a.submit({ kind: action.kind, params: action.params ?? [] });
  p.b.submit({ kind: GOD_ACTION.noop });
  p.twin.submit({ kind: GOD_ACTION.noop });
}

/** Drives A to a portal it can open, with six named raiders. */
function arm(p: Pair): void {
  for (let i = 0; i < 12; i += 1) tick(p, { kind: GOD_ACTION.noop });
  let named = 0;
  for (let i = 0; i < 40 && named < 6; i += 1) {
    const slot = (p.a.candidates().get(GOD_ACTION.assignRole) ?? []).findIndex(
      (c) => c.params[1] === MAGE_ROLE.raider,
    );
    if (slot >= 0 && p.a.legalActions()[GOD_ACTION.assignRole] === 1) {
      tick(p, { kind: GOD_ACTION.assignRole, params: [slot] });
      named += 1;
    } else {
      tick(p, { kind: GOD_ACTION.noop });
    }
  }
  expect(named).toBe(6);
  for (let i = 0; i < 400 && p.a.legalActions()[GOD_ACTION.openPortal] !== 1; i += 1) {
    tick(p, { kind: GOD_ACTION.noop });
  }
  expect(p.a.legalActions()[GOD_ACTION.openPortal]).toBe(1);
}

describe('a portal seat holding a live universe', () => {
  it('raids the peer, and the peer is changed by it', () => {
    const p = pair();
    arm(p);
    tick(p, { kind: GOD_ACTION.openPortal, params: [0] });

    const outbound = p.aRaids().filter((r) => r.outbound);
    expect(outbound).toHaveLength(1);
    expect(outbound[0]?.raidersFielded).toBe(6);
    expect(outbound[0]?.engagementTicks).toBeGreaterThan(0);
    expect(p.toldB).toHaveLength(1);

    tick(p, { kind: GOD_ACTION.noop });
    expect(p.b.snapshotHash()).not.toBe(p.twin.snapshotHash());
  });

  it('leaves the peer exactly equal to its twin when no portal opens (control)', () => {
    const p = pair();
    arm(p);
    tick(p, { kind: GOD_ACTION.noop });
    tick(p, { kind: GOD_ACTION.noop });
    expect(p.aRaids().filter((r) => r.outbound)).toHaveLength(0);
    expect(p.b.snapshotHash()).toBe(p.twin.snapshotHash());
  });

  it('rolls no stand-in arrival once peers are present', () => {
    // Seed 32 is raided by a stand-in rival at world tick 5 in the headless
    // build — found by search, and asserted here so the peered arm below is
    // compared against a run that really would have been raided.
    const raidedBy = (options: Parameters<typeof referenceScenario>[1]): number => {
      const run = referenceScenario(content, options);
      const s = createSession({ scenario: run.scenario, strategyId: 'arrival' });
      s.reset(32, CONFIG);
      for (let i = 0; i < 20; i += 1) s.submit({ kind: GOD_ACTION.noop });
      return run.raids().length;
    };
    expect(raidedBy({})).toBeGreaterThan(0);
    expect(raidedBy({ peers: { seats: [1], participant: () => undefined } })).toBe(0);
  });
});
