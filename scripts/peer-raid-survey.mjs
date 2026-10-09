#!/usr/bin/env node
/*
 * Multiverse Mages — what a raid between two live players actually does.
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
 * Plays seeded pairs of live peer universes (`referenceScenario`'s `peers`
 * seam) under a handful of god policies, lets the attacker open one portal on
 * the defender, and reports what the raid did to both. The instrument is
 * `playPeerPair` in `packages/scenario/src/peer-raid-survey.ts`; this is the
 * command line around it. Build first (`npx tsc --build`).
 *
 * Deterministic: seeds are `--seed0 + 2i` and `--seed0 + 2i + 1`, nothing reads
 * the wall clock, and `--date` is a flag so the output is a function of the
 * flags alone.
 *
 * **Positive controls, always on** (see `controls()` below): stand-in rivals
 * must be seen taking nodes, and a lethal degenerate pair must be seen killing.
 * If either reads zero the instrument is blind and the script exits `1` rather
 * than printing a table of zeros. `--standin` additionally plays every
 * attacker policy against the headless stand-in rivals instead of a peer.
 *
 * Exit codes, after `trust-your-instruments`: `0` the survey ran and its
 * control read positive; `1` the probe is broken. Missing a band is not an exit
 * code here; the band test owns that.
 *
 *   node scripts/peer-raid-survey.mjs [--pairs 12] [--seed0 7000]
 *       [--prep 0,120] [--portal-magic 1] [--set id=value,id=value]
 *       [--attackers fresh,armed,all-in] [--defenders idle,wardens]
 *       [--out path.json] [--date YYYY-MM-DD]
 *
 * `--set` overrides `raid-constant.json` entries for a what-if, through the
 * content loader and its validation, so an override the loader would refuse is
 * refused here too. It never writes the data file.
 */

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { loadContent, shippedContentSource } from '@mm/content';
import { GOD_ACTION, createSession } from '@mm/agent-api';
import {
  PEER_ATTACKER_POLICIES,
  explicitOpeningAxes,
  foundingCandidates,
  playPeerPair,
  referenceScenario,
  PEER_DEFENDER_POLICIES,
  referenceContent,
  summarisePeerRaids,
  surveyPeerArm,
} from '@mm/scenario';

const { values } = parseArgs({
  options: {
    pairs: { type: 'string', default: '12' },
    seed0: { type: 'string', default: '7000' },
    prep: { type: 'string', default: '0,120' },
    'portal-magic': { type: 'string', default: '1' },
    set: { type: 'string', default: '' },
    'scale-primitive': { type: 'string', default: '' },
    out: { type: 'string' },
    date: { type: 'string', default: 'undated' },
    attackers: { type: 'string', default: PEER_ATTACKER_POLICIES.join(',') },
    defenders: { type: 'string', default: PEER_DEFENDER_POLICIES.join(',') },
    'no-control': { type: 'boolean', default: false },
    raids: { type: 'string', default: '1' },
    'defender-mages': { type: 'string' },
    standin: { type: 'boolean', default: false },
    // `techniques:forms`, e.g. `rego,intellego:limen,mentem` — the defender is
    // founded on that opening square, so a host ruleset can forbid the raiders'
    // kit (§3). Peer arms only; a stand-in builds its own ruleset.
    'host-square': { type: 'string', default: '' },
  },
});

const overrides = new Map(
  values.set
    .split(',')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const [id, value] = pair.split('=');
      return [id, Number(value)];
    }),
);

const primitiveScales = new Map(
  values['scale-primitive']
    .split(',')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const [id, value] = pair.split('=');
      return [id, Number(value)];
    }),
);

function loadWith(overrides, primitiveScales) {
  const base = shippedContentSource();
  if (overrides.size === 0 && primitiveScales.size === 0) return referenceContent();
  const seen = new Set();
  const source = {
    origin: `${base.origin}+overrides`,
    read(fileName) {
      const text = base.read(fileName);
      if (fileName === 'node.json' && text !== undefined && primitiveScales.size > 0) {
        const nodes = JSON.parse(text);
        for (const node of nodes) {
          for (const effect of node.effects) {
            const k = primitiveScales.get(effect.primitive);
            if (k !== undefined && (effect.mode === undefined || effect.mode === 'create' || effect.mode === 'remove')) effect.magnitude *= k;
          }
        }
        return JSON.stringify(nodes);
      }
      if (fileName !== 'raid-constant.json' || text === undefined) return text;
      const rows = JSON.parse(text);
      for (const row of rows) {
        if (overrides.has(row.id)) {
          row.value = overrides.get(row.id);
          seen.add(row.id);
        }
      }
      return JSON.stringify(rows);
    },
  };
  const registry = loadContent(source);
  for (const id of overrides.keys()) {
    if (!seen.has(id)) {
      console.error(`BROKEN PROBE: --set names ${id}, which raid-constant.json does not hold.`);
      process.exit(1);
    }
  }
  return referenceContent(registry);
}

const content = loadWith(overrides, primitiveScales);
let defenderContent = content;
if (values['host-square'] !== '') {
  const [techniques, forms] = values['host-square'].split(':').map((list) => list.split(','));
  if (techniques === undefined || forms === undefined || techniques.length === 0 || forms.length === 0) {
    console.error(`BROKEN PROBE: --host-square ${values['host-square']} is not techniques:forms.`);
    process.exit(1);
  }
  const axes = explicitOpeningAxes(content.registry, techniques, forms);
  defenderContent = { ...content, axes, foundingNodeIds: foundingCandidates(content.registry, axes) };
}
const pairs = Number(values.pairs);
const seed0 = Number(values.seed0);
const preps = values.prep.split(',').map(Number);
const portalMagics = values['portal-magic'].split(',').map(Number);
const attackers = values.attackers.split(',');
const defenders = values.defenders.split(',');

const arms = [];
const raidsPerPair = Number(values.raids);
for (const portalMagic of portalMagics) {
  for (const prep of preps) {
    for (const attacker of attackers) {
      for (const defender of defenders) arms.push({
          mode: 'peer', prep, attacker, defender, portalMagic, raids: raidsPerPair,
          ...(values['defender-mages'] === undefined ? {} : { defenderFoundingMages: Number(values['defender-mages']) }),
        });
      if (values.standin) arms.push({ mode: 'standin', prep, attacker, defender: 'standin', portalMagic, raids: raidsPerPair });
    }
  }
}

const results = [];
for (const arm of arms) {
  const pairResults = await surveyPeerArm(content, arm, { pairs, seed0, ...(arm.mode === 'peer' ? { defenderContent } : {}) });
  const records = pairResults.flatMap((pair) => pair.raids);
  const refused = pairResults.reduce((n, pair) => n + pair.portalRefusals, 0);
  const favorLost = pairResults.reduce((n, pair) => n + pair.favorLostToRefusals, 0);
  results.push({ arm, records, refused, favorLost, summary: summarisePeerRaids(records) });
}

/**
 * The two positive controls, run on the same content as the survey.
 *
 * 1. **Loss is visible to the record.** Seed 3, headless, no god: the stand-in
 *    rivals' raiders, armed at the old eight nodes each, arrive and take nodes.
 *    Measured on `95738881`: one arrival at world tick 131 took five. If no
 *    arrival in 200 ticks takes or destroys anything, `RaidRecord`'s knowledge
 *    columns are blind here.
 * 2. **Casualties are visible to the survey.** One live pair under the lethal
 *    degenerate end — casting nearly free, a mage one bolt deep. If that pair
 *    reports no attack and no casualty, the survey's combat columns cannot read
 *    a positive, and every zero they print is unreadable.
 */
async function controls() {
  // The stand-in at its old, heavy arming — eight nodes a raider — because that
  // is the configuration known to loot. The shipped arming is a tuning choice
  // (two since 2026-10-08) and a control must not depend on one.
  const heavy = loadWith(new Map([['rival-raider-node-count', 8]]), new Map());
  const run = referenceScenario(heavy, {});
  const s = createSession({ scenario: run.scenario, strategyId: 'control-standin' });
  s.reset(3, { worldTickCap: 4000, options: { foundingPortalMagic: 1 } });
  for (let i = 0; i < 200; i += 1) s.submit({ kind: GOD_ACTION.noop });
  const standinTaken = run.raids().reduce((n, r) => n + r.nodesTakenByAttacker + r.nodesLostLocally, 0);

  const lethal = loadWith(
    new Map([
      ['cast-vigor-base', 1],
      ['cast-vigor-per-tier', 1],
      ['combatant-base-max-hp', 128],
      ['combatant-hp-per-tier', 1],
    ]),
    new Map(),
  );
  const pair = await playPeerPair(lethal, { mode: 'peer', prep: 0, attacker: 'fresh', defender: 'idle' }, seed0, seed0 + 1);
  const lethalCasualties = pair.raids.reduce((n, r) => n + r.casualtiesAttacker + r.casualtiesDefender, 0);
  const lethalAttacks = pair.raids.reduce((n, r) => n + r.attackAttempts, 0);
  return { standinTaken, lethalCasualties, lethalAttacks };
}

const control = values['no-control'] ? undefined : await controls();

if (values.out !== undefined) {
  const report = {
    date: values.date,
    pairs,
    seed0,
    overrides: Object.fromEntries(overrides),
    control,
    results,
  };
  writeFileSync(values.out, `${JSON.stringify(report, null, 1)}\n`);
}

const cols = [
  'raids/pairs', 'atk win', 'reasons', 'ticks med', 'fielded', 'withdrawn', 'stranded',
  'cas A', 'cas D', 'raids w/ cas', 'atk wins that took', 'new nodes', 'read from minds', 'books home', 'lib inst lost',
  'host nodes lost', 'attacks', 'host wiped', 'held to collapse', 'host ended', 'open tick med', 'refused presses', 'favor lost to refusals', 'kit/raider', 'kit forbidden by host',
];
const overrideText =
  overrides.size + primitiveScales.size === 0
    ? 'shipped constants'
    : [...[...overrides].map(([k, v]) => `${k}=${v}`), ...[...primitiveScales].map(([k, v]) => `${k}×${v}`)].join(', ');
console.log(
  `peer raid survey — ${values.date}; ${pairs} pairs from seed ${seed0}; ${raidsPerPair} raid(s) per pair; ` +
    `defender founding mages ${values['defender-mages'] ?? 'reference'}; host square ${values['host-square'] || 'reference'}; ${overrideText}`,
);
console.log(`| mode | portal magic | prep | attacker | defender | ${cols.join(' | ')} |`);
console.log(`|${'---|'.repeat(cols.length + 5)}`);
for (const { arm, summary: s, refused, favorLost } of results) {
  console.log(
    `| ${arm.mode} | ${arm.portalMagic} | ${arm.prep} | ${arm.attacker} | ${arm.defender} | ${s.raids}/${pairs} | ${s.attackerWinPct}% | ${s.reasons} | ` +
      `${s.medianTicks} | ${s.fielded} | ${s.withdrawn} | ${s.stranded} | ${s.casualtiesAttacker} | ${s.casualtiesDefender} | ` +
      `${s.anyCasualtyPct}% | ${s.attackerWinsThatTookPct}% | ${s.nodesNew} | ${s.instancesReadFromMinds} | ${s.grimoiresCarried} | ${s.libraryInstancesLost} | ` +
      `${s.hostNodesLost} | ${s.casts} | ${s.extinguished} | ${s.heldToCollapse} | ${s.hostsEnded} | ${s.medianReadyTick} | ${refused} | ${favorLost} | ${(s.kitPerRaiderX100 / 100).toFixed(2)} | ${s.raiderNodesForbiddenByHost} |`,
  );
}
if (control !== undefined) {
  console.log(
    `controls: stand-in arrivals on seed 3 took/destroyed ${control.standinTaken} node(s); ` +
      `lethal degenerate pair: ${control.lethalAttacks} attack(s), ${control.lethalCasualties} casualt(ies)`,
  );
  if (control.standinTaken === 0 || control.lethalCasualties === 0 || control.lethalAttacks === 0) {
    console.error('BROKEN PROBE: a positive control read zero, so a zero in a live arm is unreadable.');
    process.exit(1);
  }
}
process.exit(0);
