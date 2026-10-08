/*
 * Multiverse Mages — action 14's mask never offers a portal the raid system refuses.
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
 * The defect: the mask (and `coordination`'s resolver, which charges the
 * favor) asked only whether a living mage *held* a portal node, at any mastery;
 * `rules-raid`'s `portalGate` asks whether she holds it *usably* — at or above
 * the activation threshold. An unpractised founding portal node decays below
 * that threshold around world tick 102 on the reference universe, and from then
 * on the mask offered action 14, the god paid for it, and the raid system
 * refused it. Measured on `95738881` with `scripts/portal-window-probe.mjs`:
 * 297 of 400 ticks with the mask open and the gate shut, on every seed. Also
 * reported from a lobby universe over HTTP at world tick 75.
 *
 * The fix chosen is the first of the two available — make the mask, and the
 * resolver that charges, ask the gate's question — rather than refunding a
 * refused press. The gate is the authority on a world fact; a mask more
 * optimistic than it is the defect class `candidates.ts` already documents for
 * actions 14 and 16, and a refund would leave the button lit for a press that
 * can never work.
 */

import { describe, expect, it } from 'vitest';

import { GOD_ACTION, createSession } from '@mm/agent-api';
import { MagicGrid } from '@mm/rules-magic';
import { heldInstancesOf, portalGate } from '@mm/rules-raid';
import type { SimState } from '@mm/sim-core';
import { findUniverse, readUniverse } from '@mm/state';

import { participantOf, referenceContent, referenceScenario } from '@mm/scenario';

const content = referenceContent();
const grid = MagicGrid.from(content.registry);
const TICKS = 220;

/** The raid system's own gate, asked of a world, with affordability set aside. */
function gateOpen(state: SimState): boolean {
  const p = participantOf(state, content);
  if (p === undefined) return false;
  return portalGate({
    attackerWorld: state,
    attackerRuleset: p.ruleset,
    registry: content.registry,
    grid,
    favor: Number.MAX_SAFE_INTEGER,
    favorCost: 0,
    alreadyEngaged: false,
    heldOf: (mage) => heldInstancesOf(p, mage),
  }).open;
}

describe('action 14 and the raid system agree on whether a portal can open', () => {
  it('never offers action 14 while the gate is shut, across a portal node decaying', async () => {
    const live: { s?: SimState } = {};
    const run = referenceScenario(content, {
      onState: (s) => {
        live.s = s;
      },
    });
    const session = createSession({ scenario: run.scenario, strategyId: 'portal-mask' });
    session.reset(7000, { worldTickCap: 4000, options: { foundingPortalMagic: 1 } });

    let maskOpen = 0;
    let gateOpenTicks = 0;
    let disagreements = 0;
    let gateClosedAfterOpen = false;
    for (let tick = 0; tick < TICKS; tick += 1) {
      if (live.s !== undefined) {
        const legal = session.legalActions()[GOD_ACTION.openPortal] === 1;
        const open = gateOpen(live.s);
        if (legal) maskOpen += 1;
        if (open) gateOpenTicks += 1;
        if (!open && gateOpenTicks > 0) gateClosedAfterOpen = true;
        if (legal && !open) disagreements += 1;
      }
      session.submit({ kind: GOD_ACTION.noop });
      if (tick % 12 === 11) await new Promise((resolve) => setImmediate(resolve));
    }

    // Positive controls: the window opened, the mask offered it, and the
    // portal node really did decay shut inside the horizon — otherwise a zero
    // below would be a run that never reached the case.
    expect(gateOpenTicks).toBeGreaterThan(0);
    expect(maskOpen).toBeGreaterThan(0);
    expect(gateClosedAfterOpen).toBe(true);
    // The claim. Measured on `95738881`: 117 of these 220 ticks disagreed.
    expect(disagreements).toBe(0);
  }, 240_000);

  it('opens a raid, and charges, exactly when the mask offered the press', async () => {
    const live: { s?: SimState } = {};
    const run = referenceScenario(content, {
      onState: (s) => {
        live.s = s;
      },
    });
    const session = createSession({ scenario: run.scenario, strategyId: 'portal-press' });
    session.reset(7000, { worldTickCap: 4000, options: { foundingPortalMagic: 1 } });
    // Press on every tick the mask allows, from past the decay onward. On main
    // the presses were admitted and charged, and opened nothing.
    let presses = 0;
    let chargedRefusals = 0;
    for (let tick = 0; tick < TICKS; tick += 1) {
      const slot = (session.candidates().get(GOD_ACTION.openPortal) ?? []).findIndex((c) => c.params[0] === 1);
      if (tick >= 120 && slot >= 0 && session.legalActions()[GOD_ACTION.openPortal] === 1 && live.s !== undefined) {
        const universe = findUniverse(live.s);
        const favorBefore = readUniverse(live.s, universe).favor;
        const raidsBefore = run.raids().filter((r) => r.outbound).length;
        session.submit({ kind: GOD_ACTION.openPortal, params: [slot] });
        presses += 1;
        const opened = run.raids().filter((r) => r.outbound).length > raidsBefore;
        const favorAfter = readUniverse(live.s, findUniverse(live.s)).favor;
        if (!opened && favorAfter < favorBefore) chargedRefusals += 1;
      } else {
        session.submit({ kind: GOD_ACTION.noop });
      }
      if (tick % 12 === 11) await new Promise((resolve) => setImmediate(resolve));
    }
    // Measured on `95738881`: two presses charged and opened nothing.
    expect(chargedRefusals).toBe(0);
    // Not vacuous by construction: either the mask offered presses and every
    // one opened a raid, or it offered none because the gate was shut.
    expect(presses === 0 || run.raids().some((r) => r.outbound)).toBe(true);
  }, 240_000);
});
