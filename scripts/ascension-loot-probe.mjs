#!/usr/bin/env node
/*
 * Multiverse Mages — how often does a universe ascend, with and without the loot conjunct?
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
 * Vision §8a, 2026-10-08: ascension without raids should not be possible, so
 * both paths require `ascension-looted-nodes` distinct looted nodes held. This
 * runs the bot pool headless — stand-in raids on, the shipped scenario — under
 * the shipped constant and under `ascension-looted-nodes = 0` (the predicate as
 * it was), with **identical seeds**, and reports per strategy:
 *
 * - `asc` — runs that ended in ascension (both paths), and the tick of the first;
 * - `qual` — runs in which a path was ever open (a strategy may decline it);
 * - `qual+loot` — runs in which a path was open on a tick the universe also held
 *   the shipped threshold of looted nodes — what the shipped rule would admit;
 * - `raids` — outbound raids this universe launched, and runs with any;
 * - `loot` — the run's peak `lootedNodesHeld`, and how many runs ever held any,
 *   split by route (theft rows / captured-book rows seen at peak).
 *
 * The control arm doubles as the probe's positive control: if no arm ascends at
 * `0` either, the comparison measures nothing, and the probe says so.
 *
 *     node scripts/ascension-loot-probe.mjs [--seeds 1,2,3] [--ticks 2400] \
 *       [--strategies portal-rush,permissive-breadth] [--k 1]
 *
 * Deterministic. One JSON line per run on stdout, then a summary table on stderr.
 */

import { parseArgs } from 'node:util';

import { GOD_ACTION, createSession } from '@mm/agent-api';
import { BOT_POOL_REGISTRY, policyFor } from '@mm/mc-harness';
import { agentRng } from '@mm/agent-api';
import { KNOWLEDGE_PROVENANCE, LOOT_ROUTE, MAGE_ROLE, TERMINAL_REASON, componentOf } from '@mm/state';
import { participantOf, referenceContent, referenceScenario, shippedContent } from '@mm/scenario';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '1,2,3,4,5,6,7,8' },
    ticks: { type: 'string', default: '2400' },
    strategies: { type: 'string', default: '' },
    k: { type: 'string', default: '' },
    arms: { type: 'string', default: 'shipped,off' },
    'portal-magic': { type: 'string', default: '' },
    // Play against a live peer universe (seat 1) instead of the headless
    // stand-in. The peer plays this strategy too, on seed + 1000.
    peer: { type: 'string', default: '' },
  },
});

const seeds = values.seeds.split(',').map(Number);
const ticks = Number(values.ticks);
const strategies = values.strategies === '' ? [...BOT_POOL_REGISTRY.ids] : values.strategies.split(',');

function withLooted(value) {
  const shipped = shippedContent();
  if (value === undefined) return shipped;
  return {
    ...shipped,
    godConstants: shipped.godConstants.map((entry) =>
      entry.record.id === 'ascension-looted-nodes' ? { ...entry, record: { ...entry.record, value } } : entry,
    ),
    godConstant: (id) => (id === 'ascension-looted-nodes' ? value : shipped.godConstant(id)),
  };
}

const arms = values.arms.split(',').map((arm) => {
  if (arm === 'off') return { arm, registry: withLooted(0) };
  if (arm === 'shipped') return { arm, registry: withLooted(values.k === '' ? undefined : Number(values.k)) };
  throw new Error(`unknown arm ${arm}`);
});

/**
 * `raid-then-<strategy>`: a player who raids until she holds the shipped loot
 * threshold, then plays `<strategy>`. While short of loot she names raiders (up
 * to six) and opens the portal whenever the mask allows — the peer survey's
 * attacker, with no preparation window — and otherwise defers to `<strategy>`.
 * Not a pool strategy: it exists to answer whether the rule is *reachable* by
 * a god who raids on purpose, which no pool bot does.
 */
function raidThen(inner, getLoot) {
  let named = 0;
  return (observation, mask, slot, candidates) => {
    if (getLoot() < SHIPPED_K) {
      if (mask[GOD_ACTION.openPortal] === 1 && (candidates.get(GOD_ACTION.openPortal) ?? []).length > 0) {
        return { action: GOD_ACTION.openPortal, parameter: 0 };
      }
      if (named < 6 && mask[GOD_ACTION.assignRole] === 1) {
        const at = (candidates.get(GOD_ACTION.assignRole) ?? []).findIndex((c) => c.params[1] === MAGE_ROLE.raider);
        if (at >= 0) {
          named += 1;
          return { action: GOD_ACTION.assignRole, parameter: at };
        }
      }
    }
    return inner(observation, mask, slot, candidates);
  };
}

function play(registry, strategyId, seed) {
  const composite = strategyId.startsWith('raid-then-');
  const innerId = composite ? strategyId.slice('raid-then-'.length) : strategyId;
  const definition = BOT_POOL_REGISTRY.get(innerId);
  if (definition === undefined) throw new Error(`no strategy ${innerId}`);
  let routes = { theft: 0, book: 0 };
  let tapped = { theft: 0, book: 0 };
  const content = referenceContent(registry);
  const live = {};
  const peerId = values.peer;
  const peered = peerId !== '';
  const { scenario, lastGodReport, raids } = referenceScenario(content, {
    raids: true,
    ...(peered
      ? { peers: { seats: [1], participant: () => (live.b === undefined ? undefined : participantOf(live.b, content)) } }
      : {}),
    onState: (state) => {
      live.a = state;
      const store = componentOf(state, KNOWLEDGE_PROVENANCE);
      let theft = 0;
      let book = 0;
      store.forEach((_row, handle) => {
        if (store.get(handle, 'route') === LOOT_ROUTE.theft) theft += 1;
        else if (store.get(handle, 'route') === LOOT_ROUTE.capturedBook) book += 1;
      });
      tapped = { theft, book };
    },
  });
  const session = createSession({ scenario, strategyId });
  session.reset(seed, {
    worldTickCap: ticks,
    ...(values['portal-magic'] === '' ? {} : { options: { foundingPortalMagic: Number(values['portal-magic']) } }),
  });
  let peerSession;
  let peerPolicy;
  if (peered) {
    const runB = referenceScenario(content, {
      raids: true,
      onState: (state) => {
        live.b = state;
      },
      peers: { seats: [1], participant: () => (live.a === undefined ? undefined : participantOf(live.a, content)) },
    });
    peerSession = createSession({ scenario: runB.scenario, strategyId: peerId });
    peerSession.reset(seed + 1000, { worldTickCap: ticks });
    const peerDef = BOT_POOL_REGISTRY.get(peerId);
    if (peerDef === undefined) throw new Error(`no strategy ${peerId}`);
    peerPolicy = policyFor(peerDef, { runSeed: seed + 1000, agentSlotIndex: 0, rng: agentRng({ runSeed: seed + 1000, agentSlotIndex: 0, strategyId: peerId }) });
  }
  const inner = policyFor(definition, { runSeed: seed, agentSlotIndex: 0, rng: agentRng({ runSeed: seed, agentSlotIndex: 0, strategyId: innerId }) });
  let lootNow = 0;
  const policy = composite ? raidThen(inner, () => lootNow) : inner;
  let peakLoot = 0;
  let everLoot = false;
  let firstQual = 0;
  // The first tick a path was open *and* the shipped loot conjunct held. On
  // the \`off\` arm this is exactly the tick the shipped rule would first have
  // qualified, up to the off arm's own termination: the loot conjunct changes
  // nothing about the dynamics until somebody declares.
  let firstQualWithLoot = 0;
  let terminal = TERMINAL_REASON.none;
  let tick = 0;
  let status = 'running';
  for (; tick < ticks; tick += 1) {
    const choice = policy(session.observe(), session.legalActions(), 0, session.candidates());
    if (peerSession !== undefined && peerSession.status() === 'running') {
      const p = peerPolicy(peerSession.observe(), peerSession.legalActions(), 0, peerSession.candidates());
      peerSession.submit(p.parameter === undefined ? { kind: p.action } : { kind: p.action, params: [p.parameter] });
    }
    const result = session.submit(choice.parameter === undefined ? { kind: choice.action } : { kind: choice.action, params: [choice.parameter] });
    const report = lastGodReport();
    if (report !== undefined) {
      const held = report.ascensionProgress.lootedNodesHeld;
      lootNow = held;
      if (held > peakLoot) {
        peakLoot = held;
        routes = { ...tapped };
      }
      if (held > 0) everLoot = true;
      if (firstQual === 0 && report.ascensionPath !== 0) firstQual = report.worldTick;
      if (firstQualWithLoot === 0 && report.ascensionPath !== 0 && held >= SHIPPED_K) firstQualWithLoot = report.worldTick;
      terminal = report.terminalReason;
    }
    status = result.status;
    if (status !== 'running') break;
  }
  const raidLog = raids();
  const outbound = raidLog.filter((r) => r.outbound);
  return {
    strategyId,
    seed,
    ticksRun: tick + 1,
    terminal,
    // The session's status, not the god report's terminal reason: a declaration
    // ends the episode on the tick it lands, after the report was written.
    status,
    ascended: status === 'ascended',
    firstQual,
    firstQualWithLoot,
    outboundRaids: outbound.length,
    nodesGainedLocally: outbound.reduce((s, r) => s + r.nodesGainedLocally, 0),
    peakLoot,
    everLoot,
    routesAtPeak: routes,
  };
}

const SHIPPED_K = shippedContent().godConstant('ascension-looted-nodes');
const summary = new Map();
for (const { arm, registry } of arms) {
  for (const strategyId of strategies) {
    for (const seed of seeds) {
      const row = { arm, ...play(registry, strategyId, seed) };
      process.stdout.write(`${JSON.stringify(row)}\n`);
      const key = `${arm}\t${strategyId}`;
      const s = summary.get(key) ?? { n: 0, asc: 0, qual: 0, qualLoot: 0, raided: 0, looted: 0, ticks: [] };
      if (row.firstQualWithLoot > 0) s.qualLoot += 1;
      s.n += 1;
      if (row.ascended) { s.asc += 1; s.ticks.push(row.ticksRun); }
      if (row.firstQual > 0) s.qual += 1;
      if (row.outboundRaids > 0) s.raided += 1;
      if (row.everLoot) s.looted += 1;
      summary.set(key, s);
    }
  }
}
process.stderr.write('arm\tstrategy\tn\tascended\tqualified\tqualified-with-loot\traided\tlooted\tascension ticks\n');
for (const [key, s] of summary) {
  process.stderr.write(`${key}\t${s.n}\t${s.asc}\t${s.qual}\t${s.qualLoot}\t${s.raided}\t${s.looted}\t${s.ticks.join(',')}\n`);
}
