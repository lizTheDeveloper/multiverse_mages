/*
 * Multiverse Mages — peer raids across a gap in world time, an ended peer, an empty warband.
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
 * Three cases from the round-2 lobby playtest (main `2464588b`), each of which
 * charged a god for a portal and recorded nothing:
 *
 * 1. **A peer far ahead in world time.** Bubble-mates tick independently, so
 *    one may be at tick 2000 while the other is at 60. A raid between them must
 *    resolve — the raid consumes zero world ticks on both clocks, and nothing
 *    about it compares the two.
 * 2. **A seat whose universe has ended, or was never founded.** Reproduced on
 *    `2464588b`: a peer stepped to stagnation (world tick 2,449) still sat in
 *    the seat the mask offered, the god paid 16 favor and 16 passage, and the
 *    raid system found nobody to open on. The mask now offers only seats that
 *    hold a running universe (`Scenario.openPortalTargets`).
 * 3. **No raider named.** A portal with nobody to send fields no attacker and
 *    resolves on its opening tick at full price. The mask and `coordination`'s
 *    resolver now both refuse it before payment.
 */

import { describe, expect, it } from 'vitest';

import { createSession, GOD_ACTION, type AgentSession } from '@mm/agent-api';
import type { SimState } from '@mm/sim-core';
import { MAGE_ROLE, findUniverse, readUniverse } from '@mm/state';

import { participantOf, referenceContent, referenceScenario, type RaidRecord } from '@mm/scenario';

const content = referenceContent();
const SLOW = 600_000;

interface Pair {
  readonly a: AgentSession;
  readonly b: AgentSession;
  readonly live: { a?: SimState; b?: SimState };
  readonly raids: () => readonly RaidRecord[];
}

function pair(bCap: number): Pair {
  const live: { a?: SimState; b?: SimState } = {};
  const runA = referenceScenario(content, {
    onState: (s) => {
      live.a = s;
    },
    peers: { seats: [1], participant: () => (live.b === undefined ? undefined : participantOf(live.b, content)) },
  });
  const runB = referenceScenario(content, {
    onState: (s) => {
      live.b = s;
    },
    peers: { seats: [1], participant: () => (live.a === undefined ? undefined : participantOf(live.a, content)) },
  });
  const a = createSession({ scenario: runA.scenario, strategyId: 'edge-a' });
  const b = createSession({ scenario: runB.scenario, strategyId: 'edge-b' });
  a.reset(1, { worldTickCap: 4000, options: { foundingPortalMagic: 1 } });
  b.reset(2, { worldTickCap: bCap, options: { foundingPortalMagic: 1 } });
  return { a, b, live, raids: runA.raids };
}

async function stepB(p: Pair, ticks: number): Promise<void> {
  for (let i = 0; i < ticks && p.b.status() === 'running'; i += 1) {
    p.b.submit({ kind: GOD_ACTION.noop });
    if (i % 12 === 11) await new Promise((resolve) => setImmediate(resolve));
  }
}

/** A's god names up to six raiders from tick 13 and otherwise waits, to tick 60. */
function armA(p: Pair, raiders: number): void {
  let named = 0;
  for (let i = 0; i < 60; i += 1) {
    const slot = (p.a.candidates().get(GOD_ACTION.assignRole) ?? []).findIndex((c) => c.params[1] === MAGE_ROLE.raider);
    if (i > 12 && named < raiders && slot >= 0 && p.a.legalActions()[GOD_ACTION.assignRole] === 1) {
      p.a.submit({ kind: GOD_ACTION.assignRole, params: [slot] });
      named += 1;
    } else {
      p.a.submit({ kind: GOD_ACTION.noop });
    }
  }
}

const favorOf = (state: SimState | undefined): number =>
  state === undefined ? -1 : readUniverse(state, findUniverse(state)).favor;

describe('a peer raid across a gap in world time', () => {
  it(
    'resolves against a peer two thousand ticks ahead',
    async () => {
      const p = pair(4000);
      await stepB(p, 2000);
      expect(p.b.status()).toBe('running');
      expect(p.live.b?.clock.worldTick).toBe(2000);
      armA(p, 6);
      expect(p.a.legalActions()[GOD_ACTION.openPortal]).toBe(1);
      p.a.submit({ kind: GOD_ACTION.openPortal, params: [0] });
      const outbound = p.raids().filter((r) => r.outbound);
      expect(outbound).toHaveLength(1);
      expect(outbound[0]?.raidersFielded).toBe(6);
      expect(outbound[0]?.engagementTicks).toBeGreaterThan(0);
    },
    SLOW,
  );

  it('does not offer, and does not charge for, a seat that holds no running universe', () => {
    // The seat's universe is absent — never founded, or ended: `participantOf`
    // answers `undefined` for both, and that answer is what the raid system
    // acts on. On `2464588b` this case was offered, charged, and opened
    // nothing. (A peer stepped to stagnation reproduces it too, but takes
    // ~2,450 ticks; the seat's answer is the same.)
    const p = pair(4000);
    armA(p, 6);
    // Positive control: everything else about A is ready to raid.
    expect(p.a.candidates().get(GOD_ACTION.assignRole)?.length ?? 0).toBeGreaterThan(0);
    expect(p.a.legalActions()[GOD_ACTION.openPortal]).toBe(0);
    const before = favorOf(p.live.a);
    const result = p.a.submit({ kind: GOD_ACTION.openPortal, params: [0] });
    expect(result.admitted).toBe(false);
    expect(p.raids().filter((r) => r.outbound)).toHaveLength(0);
    // Favor only grows on a refused tick; it is never debited for the portal.
    expect(favorOf(p.live.a)).toBeGreaterThanOrEqual(before);
    // The control: the moment the seat holds a running universe, a press is
    // admitted and a raid opens. (Admission re-reads the seat; the cached mask
    // refreshes on A's next tick.)
    p.b.submit({ kind: GOD_ACTION.noop });
    expect(p.a.submit({ kind: GOD_ACTION.openPortal, params: [0] }).admitted).toBe(true);
    expect(p.raids().filter((r) => r.outbound)).toHaveLength(1);
  }, SLOW);
});

describe('a portal with nobody to send', () => {
  it('is masked and refused before payment until a raider is named', () => {
    const p = pair(4000);
    p.b.submit({ kind: GOD_ACTION.noop });
    armA(p, 0);
    expect(p.a.legalActions()[GOD_ACTION.openPortal]).toBe(0);
    const before = favorOf(p.live.a);
    expect(p.a.submit({ kind: GOD_ACTION.openPortal, params: [0] }).admitted).toBe(false);
    expect(favorOf(p.live.a)).toBeGreaterThanOrEqual(before);
    expect(p.raids()).toHaveLength(0);
    // And it opens the moment one raider is named — the control.
    const slot = (p.a.candidates().get(GOD_ACTION.assignRole) ?? []).findIndex((c) => c.params[1] === MAGE_ROLE.raider);
    expect(p.a.submit({ kind: GOD_ACTION.assignRole, params: [slot] }).admitted).toBe(true);
    expect(p.a.legalActions()[GOD_ACTION.openPortal]).toBe(1);
    p.a.submit({ kind: GOD_ACTION.openPortal, params: [0] });
    expect(p.raids().filter((r) => r.outbound)[0]?.raidersFielded).toBe(1);
  }, SLOW);
});
