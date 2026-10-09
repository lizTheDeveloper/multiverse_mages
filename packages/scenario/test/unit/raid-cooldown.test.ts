/*
 * Multiverse Mages — the portal's cooldown, as the mask and the raid system see it.
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
 * Playtest round 4: one god raided 46 times in a hundred in-game years. Vision
 * §8 makes a raid's cost **tempo**, and a live raid resolves inside one world
 * tick, so nothing charged it. `raid-cooldown-ticks` charges it as a wait.
 *
 * Held here end to end, through the session a player's clicks reach: a god who
 * presses action 14 on every tick the mask offers it opens raids no closer
 * together than the cooldown, the mask never offers the press while the
 * portal is recharging, and the published portal standing says how long is
 * left. Fails with the cooldown removed (raids open on consecutive offers) and
 * with the mask half removed (the mask offers a press the resolver refuses).
 */

import { describe, expect, it } from 'vitest';

import { GOD_ACTION, createSession, type AgentSession } from '@mm/agent-api';
import type { SimState } from '@mm/sim-core';
import { MAGE_ROLE, findUniverse, portalRechargeRemaining, readUniverse } from '@mm/state';

import { portalStandingOf, referenceContent, referenceScenario } from '@mm/scenario';

const content = referenceContent();
const COOLDOWN = content.deps.god?.content.constants.raidCooldownTicks ?? 0;
const TICKS = 240;
/** Raiders named from tick 12: enough that a warband survives its first raid to field a second. */
const RAIDERS = 4;

function nameARaider(session: AgentSession): { kind: number; params: number[] } {
  const offered = session.candidates().get(GOD_ACTION.assignRole) ?? [];
  const slot = offered.findIndex((c) => c.params[1] === MAGE_ROLE.raider);
  return slot < 0 ? { kind: GOD_ACTION.noop, params: [] } : { kind: GOD_ACTION.assignRole, params: [slot] };
}

describe('a raid costs tempo: the portal recharges for raid-cooldown-ticks', () => {
  it('ships a cooldown', () => {
    expect(COOLDOWN).toBeGreaterThan(0);
  });

  it('opens raids no closer than the cooldown, and the mask agrees with the resolver throughout', async () => {
    const live: { s?: SimState } = {};
    const run = referenceScenario(content, {
      onState: (s) => {
        live.s = s;
      },
    });
    const session = createSession({ scenario: run.scenario, strategyId: 'cooldown-press' });
    session.reset(7001, { worldTickCap: 4000, options: { foundingPortalMagic: 1 } });

    const opened: number[] = [];
    let named = 0;
    let offeredWhileRecharging = 0;
    let rechargingTicks = 0;
    let standingDisagreements = 0;
    let chargedRefusals = 0;
    for (let tick = 0; tick < TICKS; tick += 1) {
      const state = live.s;
      const offered = session.legalActions()[GOD_ACTION.openPortal] === 1;
      if (state !== undefined) {
        const universe = findUniverse(state);
        const remaining = portalRechargeRemaining(state, universe, state.clock.worldTick);
        if (remaining > 0) rechargingTicks += 1;
        if (remaining > 0 && offered) offeredWhileRecharging += 1;
        if ((portalStandingOf(state, content)?.rechargeRemaining ?? -1) !== remaining) standingDisagreements += 1;
      }
      const slot = (session.candidates().get(GOD_ACTION.openPortal) ?? []).findIndex((c) => c.params[0] === 1);
      const naming = tick >= 12 && named < RAIDERS ? nameARaider(session) : undefined;
      if (naming !== undefined && naming.kind !== GOD_ACTION.noop) {
        session.submit(naming);
        named += 1;
      } else if (tick > 16 && offered && slot >= 0 && state !== undefined) {
        const favorBefore = readUniverse(state, findUniverse(state)).favor;
        const before = run.raids().filter((r) => r.outbound).length;
        session.submit({ kind: GOD_ACTION.openPortal, params: [slot] });
        const now = run.raids().filter((r) => r.outbound).length;
        if (now > before) opened.push(tick);
        else if (live.s !== undefined && readUniverse(live.s, findUniverse(live.s)).favor < favorBefore) chargedRefusals += 1;
      } else {
        session.submit({ kind: GOD_ACTION.noop });
      }
      if (tick % 12 === 11) await new Promise((resolve) => setImmediate(resolve));
    }

    // Positive controls: two raids opened, so a gap exists to measure, and the
    // portal really was recharging for a while.
    expect(opened.length).toBeGreaterThanOrEqual(2);
    expect(rechargingTicks).toBeGreaterThan(0);
    // The claims.
    for (let i = 1; i < opened.length; i += 1) {
      expect((opened[i] as number) - (opened[i - 1] as number)).toBeGreaterThanOrEqual(COOLDOWN);
    }
    expect(offeredWhileRecharging).toBe(0);
    expect(chargedRefusals).toBe(0);
    expect(standingDisagreements).toBe(0);
  }, 240_000);
});
