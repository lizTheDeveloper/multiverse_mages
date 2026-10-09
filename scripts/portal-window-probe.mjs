#!/usr/bin/env node
/*
 * Multiverse Mages — when can a god open a portal, and for how long?
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
 * Steps one universe per seed with `foundingPortalMagic: 1` and reports, for
 * each tick, two things that ought to agree: whether the mask offers action 14,
 * and whether `rules-raid`'s `portalGate` would actually open a portal. Then it
 * reports the window — first and last open tick — and *why* it closed: the
 * holder died, or her portal node decayed below the usable threshold.
 *
 * Two god policies: `idle` (no-ops), and `keep-the-door` (names the portal
 * holder a raider at tick 12 — her `raid-readiness` months then drill her raid
 * kit, portal node included).
 *
 * Deterministic. Exit `0` ran; `1` broken probe — if no seed ever opens the
 * gate, the probe cannot see a window and its "never" means nothing.
 *
 *   node scripts/portal-window-probe.mjs [--seeds 7000,7002,7004,7006] [--ticks 400]
 */

import { parseArgs } from 'node:util';

import { GOD_ACTION, createSession } from '@mm/agent-api';
import { MagicGrid } from '@mm/rules-magic';
import { CASTABLE_MASTERY, heldInstancesOf, portalGate } from '@mm/rules-raid';
import { MAGE, MAGE_ROLE, collectRecords } from '@mm/state';
import { participantOf, referenceContent, referenceScenario } from '@mm/scenario';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '7000,7002,7004,7006,7008,7010' },
    ticks: { type: 'string', default: '400' },
  },
});
const seeds = values.seeds.split(',').map(Number);
const ticks = Number(values.ticks);
const content = referenceContent();
const grid = MagicGrid.from(content.registry);

function portalHolders(state) {
  const p = participantOf(state, content);
  const out = [];
  if (p === undefined) return out;
  for (const e of collectRecords(state, MAGE)) {
    for (const h of heldInstancesOf(p, e.handle)) {
      const node = content.registry.node(h.nodeId);
      if (node?.effects.some((x) => x.primitive === 'portal') !== true) continue;
      out.push({ mage: e.handle, alive: e.row.alive === 1, mastery: h.mastery, role: e.row.roleId });
    }
  }
  return out;
}

let anyOpen = false;
console.log('| policy | seed | gate open first–last | open ticks | mask-open-gate-shut ticks | why it closed |');
console.log('|---|---|---|---|---|---|');
for (const policy of ['idle', 'keep-the-door']) {
  for (const seed of seeds) {
    const live = {};
    const run = referenceScenario(content, { onState: (s) => { live.s = s; }, peers: { seats: [1], participant: () => undefined } });
    const session = createSession({ scenario: run.scenario, strategyId: `portal-window-${policy}` });
    session.reset(seed, { worldTickCap: 4000, options: { foundingPortalMagic: 1 } });
    let first = -1;
    let last = -1;
    let open = 0;
    let disagree = 0;
    let named = false;
    for (let t = 0; t < ticks; t += 1) {
      let action = { kind: GOD_ACTION.noop, params: [] };
      if (live.s !== undefined) {
        const p = participantOf(live.s, content);
        if (p !== undefined) {
          const gate = portalGate({
            attackerWorld: live.s, attackerRuleset: p.ruleset, registry: content.registry, grid,
            favor: 1 << 30, favorCost: 0, alreadyEngaged: false, heldOf: (m) => heldInstancesOf(p, m),
          });
          if (gate.open) { open += 1; if (first < 0) first = t; last = t; anyOpen = true; }
          if (!gate.open && session.legalActions()[GOD_ACTION.openPortal] === 1) disagree += 1;
        }
        if (policy === 'keep-the-door' && !named && t >= 12 && session.legalActions()[GOD_ACTION.assignRole] === 1) {
          const holder = portalHolders(live.s).find((h) => h.alive)?.mage;
          const slot = (session.candidates().get(GOD_ACTION.assignRole) ?? []).findIndex(
            (c) => c.params[0] === holder && c.params[1] === MAGE_ROLE.raider,
          );
          if (slot >= 0) { action = { kind: GOD_ACTION.assignRole, params: [slot] }; named = true; }
        }
      }
      session.submit(action);
    }
    const holders = live.s === undefined ? [] : portalHolders(live.s);
    const why =
      last === ticks - 1 ? 'still open' :
      holders.length === 0 ? 'no instance left' :
      holders.every((h) => !h.alive) ? 'holder died' :
      `decayed (best living mastery ${Math.max(...holders.filter((h) => h.alive).map((h) => h.mastery))} < ${CASTABLE_MASTERY})`;
    console.log(`| ${policy} | ${seed} | ${first}–${last} | ${open} | ${disagree} | ${why} |`);
  }
}
if (!anyOpen) {
  console.error('BROKEN PROBE: the gate never opened on any seed, so a closed window is unreadable.');
  process.exit(1);
}
