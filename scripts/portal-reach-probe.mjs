#!/usr/bin/env node
/*
 * Multiverse Mages — how long until a god who wants to raid can?
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
 * Time to the first world tick on which action 14 is legal *and* `rules-raid`'s
 * gate would open the portal, with **no founding portal magic**, so the way through has to
 * be discovered. One universe per seed, headless (the stand-in seats give
 * action 14 a target), under two god policies:
 *
 * - `idle` — no-ops.
 * - `seek-portal` — what a player who wants a raid does through the action
 *   space: permit `rego` and `limen` if the opening lacks them (actions 1 and
 *   3), grant the tier-1 roots of the portal's prerequisite closure (action 8),
 *   encourage research in the closure's cells (action 12), and from the tick a
 *   living mage holds a portal node name her a raider so she drills it.
 *
 * Openings: the v1 rectangle (what `packages/lobby` builds), and the standard
 * 2 × 2 (`creo`, `intellego` × `animal`, `aquam`), which holds no cell of the
 * closure until the god permits one.
 *
 * Reports the first possible raid per seed, the median, and how many seeds
 * never got there within the horizon. Deterministic. Exit `1` if the seeded
 * control — the same universe with `foundingPortalMagic: 1` — does not open on
 * within thirty ticks (favor is the only wait), because then "never" would be a
 * broken probe.
 *
 *   node scripts/portal-reach-probe.mjs [--seeds 7000,7002,...] [--ticks 600]
 */

import { parseArgs } from 'node:util';

import { GOD_ACTION, createSession } from '@mm/agent-api';
import { MagicGrid } from '@mm/rules-magic';
import { heldInstancesOf, portalGate } from '@mm/rules-raid';
import { MAGE, MAGE_ROLE, collectRecords, findUniverse, readRulesetForObservation, permits } from '@mm/state';
import { participantOf, referenceContent, referenceScenario } from '@mm/scenario';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '7000,7002,7004,7006,7008,7010' },
    ticks: { type: 'string', default: '600' },
  },
});
const seeds = values.seeds.split(',').map(Number);
const ticks = Number(values.ticks);
const content = referenceContent();
const registry = content.registry;

const PORTAL = registry.nodes.find((e) => e.record.effects.some((x) => x.primitive === 'portal') && e.record.tier === 4);
if (PORTAL === undefined) throw new Error('no tier-4 portal node in content');
/** The prerequisite closure of the shallowest portal node, by content id. */
const closure = new Map();
const byId = new Map(registry.nodes.map((e) => [e.record.id, e]));
const walk = (entry) => {
  if (closure.has(entry.contentId)) return;
  closure.set(entry.contentId, entry);
  for (const p of entry.record.prerequisites) walk(byId.get(p));
};
walk(PORTAL);
const cellIdOf = new Map(registry.cells.map((e) => [e.record.id, e.contentId]));
const closureCells = [...new Set([...closure.values()].map((e) => cellIdOf.get(e.record.cell)))];
const roots = [...closure.values()].filter((e) => e.record.prerequisites.length === 0).map((e) => e.contentId);
const techniqueId = (id) => registry.techniques.find((e) => e.record.id === id)?.contentId;
const formId = (id) => registry.forms.find((e) => e.record.id === id)?.contentId;
const NEEDED_TECHNIQUES = [...new Set([...closure.values()].map((e) => e.record.cell.split('-')[0]))];
const NEEDED_FORMS = [...new Set([...closure.values()].map((e) => e.record.cell.split('-')[1]))];

const grid = MagicGrid.from(registry);
/** The raid system's own gate, affordability aside — the authority on whether a portal can open. */
function gateOpen(state) {
  const p = participantOf(state, content);
  if (p === undefined) return false;
  return portalGate({
    attackerWorld: state, attackerRuleset: p.ruleset, registry, grid,
    favor: Number.MAX_SAFE_INTEGER, favorCost: 0, alreadyEngaged: false, heldOf: (m) => heldInstancesOf(p, m),
  }).open;
}

function portalHolder(state) {
  const p = participantOf(state, content);
  if (p === undefined) return 0;
  for (const e of collectRecords(state, MAGE)) {
    if (e.row.alive !== 1) continue;
    for (const h of heldInstancesOf(p, e.handle)) {
      if (registry.node(h.nodeId)?.effects.some((x) => x.primitive === 'portal') === true) return e.handle;
    }
  }
  return 0;
}

function play(seed, policy, opening, portalMagic = 0) {
  const live = {};
  const run = referenceScenario(content, { onState: (s) => { live.s = s; } });
  const session = createSession({ scenario: run.scenario, strategyId: `portal-reach-${policy}` });
  const options = { foundingPortalMagic: portalMagic, ...(opening === '2x2' ? { openingTechniqueCount: 2, openingFormCount: 2 } : {}) };
  session.reset(seed, { worldTickCap: 4000, options });
  let named = false;
  for (let t = 0; t < ticks; t += 1) {
    // Possible means both: the mask offers it and the raid system's gate would
    // open it. On a build where the mask is optimistic the gate is the one that
    // matters; on this one they agree.
    if (session.legalActions()[GOD_ACTION.openPortal] === 1 && live.s !== undefined && gateOpen(live.s)) return t;
    let action = { kind: GOD_ACTION.noop, params: [] };
    if (policy === 'seek-portal' && live.s !== undefined) {
      const state = live.s;
      const ruleset = readRulesetForObservation(state, findUniverse(state));
      const legal = session.legalActions();
      const holder = portalHolder(state);
      const unpermittedTechnique = NEEDED_TECHNIQUES.find((t2) => !closureCells.some((c) => permits(ruleset, c) && registry.cell(c)?.technique === t2));
      const unpermittedForm = NEEDED_FORMS.find((f) => !closureCells.some((c) => permits(ruleset, c) && registry.cell(c)?.form === f));
      const grant = (session.candidates().get(GOD_ACTION.grantFoundingKnowledge) ?? []).findIndex((c) => roots.includes(c.params[1]));
      const encourage = (session.candidates().get(GOD_ACTION.encourageResearch) ?? []).findIndex((c) => closureCells.includes(c.params[0]));
      if (holder !== 0 && !named && legal[GOD_ACTION.assignRole] === 1) {
        const slot = (session.candidates().get(GOD_ACTION.assignRole) ?? []).findIndex((c) => c.params[0] === holder && c.params[1] === MAGE_ROLE.raider);
        if (slot >= 0) { action = { kind: GOD_ACTION.assignRole, params: [slot] }; named = true; }
      }
      if (action.kind === GOD_ACTION.noop && unpermittedTechnique !== undefined && legal[GOD_ACTION.permitTechnique] === 1) {
        action = { kind: GOD_ACTION.permitTechnique, params: [techniqueId(unpermittedTechnique)] };
      } else if (action.kind === GOD_ACTION.noop && unpermittedForm !== undefined && legal[GOD_ACTION.permitForm] === 1) {
        action = { kind: GOD_ACTION.permitForm, params: [formId(unpermittedForm)] };
      } else if (action.kind === GOD_ACTION.noop && grant >= 0 && legal[GOD_ACTION.grantFoundingKnowledge] === 1) {
        action = { kind: GOD_ACTION.grantFoundingKnowledge, params: [grant] };
      } else if (action.kind === GOD_ACTION.noop && encourage >= 0 && legal[GOD_ACTION.encourageResearch] === 1) {
        action = { kind: GOD_ACTION.encourageResearch, params: [encourage] };
      }
    }
    session.submit(action);
  }
  return -1;
}

const control = play(seeds[0], 'idle', 'v1', 1);
if (control < 0 || control > 30) {
  console.error(`BROKEN PROBE: with founding portal magic the gate should open within thirty ticks (favor is the only wait); first legal tick ${control}.`);
  process.exit(1);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => (a < 0 ? Infinity : a) - (b < 0 ? Infinity : b));
  const m = s[(s.length - 1) >> 1];
  return m < 0 ? 'never' : String(m);
};
console.log(`closure: ${[...closure.values()].map((e) => `${e.record.id}(t${e.record.tier})`).join(', ')}`);
console.log('| opening | policy | first possible raid, world tick, per seed | median | never (of seeds) |');
console.log('|---|---|---|---|---|');
for (const opening of ['v1', '2x2']) {
  for (const policy of ['idle', 'seek-portal']) {
    const firsts = seeds.map((seed) => play(seed, policy, opening));
    console.log(`| ${opening} | ${policy} | ${firsts.map((f) => (f < 0 ? '—' : String(f))).join(', ')} | ${median(firsts)} | ${firsts.filter((f) => f < 0).length}/${seeds.length} |`);
  }
}
console.log(`control (foundingPortalMagic 1): first legal tick ${control}`);
