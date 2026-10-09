/*
 * Multiverse Mages — S15: the raid economy, measured headless in lobby-shaped universes.
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
 * ## The questions (playtest round 4)
 *
 * 1. Where does `passage` come from, and how fast? (A portal costs 16.)
 * 2. Is favor ever a constraint for a god who plays?
 * 3. Where does `insight` come from?
 * 4. What does a food shortage do?
 *
 * Two universes per run, built the way `packages/lobby`'s `UniverseHost` builds
 * one — one species, a 2×2 opening, founders scaled by the species count — and
 * seated in each other's portal seat, so action 14 raids a live peer. Universe
 * A plays `--policy`; B plays the steward at a one-year cadence and never raids.
 *
 * Policies: `idle`; `steward@N` (fund two universities, grant, bless,
 * encourage — every N ticks); `active@N` (the steward, then any permit,
 * dispensation or role); `raider@N` (opens the portal cell if the opening
 * lacks it, names raiders, presses action 14 whenever offered, else steward).
 *
 * Writes exactly the file named by `--out`; one JSON line per run on stdout.
 *
 *     node scripts/s15-economy-probe.mjs --ticks 1200 --seeds 3 \
 *       --openings ir-lm,cr-ht --policies steward@12,active@6,raider@3 \
 *       [--content-dir <copy of packages/content/data>] --out /tmp/x.json
 */

import { writeFileSync } from 'node:fs';
import * as stateModule from '@mm/state';
import process from 'node:process';

import { GOD_ACTION, createSession } from '@mm/agent-api';
import { directorySource, loadContent } from '@mm/content';
import {
  explicitOpeningAxes,
  foundingCandidates,
  referenceContent,
  referenceOptions,
  referenceScenario,
  speciesAliveIn,
  speciesTable,
  participantOf,
} from '@mm/scenario';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const TICKS = Number(arg('ticks', '1200'));
const SEEDS = Number(arg('seeds', '3'));
const ROOT_SEED = Number(arg('seed', '20261009'));
const OUT = arg('out', undefined);
const SPECIES = arg('species', 'human');
const PORTAL_MAGIC = Number(arg('portal-magic', '1'));
const POLICIES = arg('policies', 'idle,steward@12,steward@3,raider@3').split(',');
const FP = 1024;
/**
 * `--content-dir <dir>`: a copy of `packages/content/data` to load instead of
 * the shipped one — how a candidate tuning, or the pre-change arm (cooldown and
 * tended faucets zeroed), is measured without editing the tree.
 */
const CONTENT_DIR = arg('content-dir', undefined);
const LOADED = CONTENT_DIR === undefined ? undefined : loadContent(directorySource(CONTENT_DIR, CONTENT_DIR));

/** Opening codes: `<t1><t2>-<f1><f2>` by first letter; see OPENINGS. */
const OPENINGS = {
  'ir-lm': { techniques: ['intellego', 'rego'], forms: ['limen', 'mentem'] },
  'cr-ht': { techniques: ['creo', 'rego'], forms: ['herbam', 'terram'] },
  'ci-ha': { techniques: ['creo', 'intellego'], forms: ['herbam', 'animal'] },
  'rm-ti': { techniques: ['rego', 'muto'], forms: ['terram', 'ignem'] },
  'rp-lc': { techniques: ['rego', 'perdo'], forms: ['limen', 'corpus'] },
};
const OPENING_IDS = arg('openings', Object.keys(OPENINGS).join(',')).split(',');

if (OUT === undefined) {
  console.error('--out <file> is required');
  process.exit(1);
}

/** A universe exactly as `UniverseHost`'s constructor builds one. */
function lobbyUniverse(opening, seed, peers) {
  const base = referenceContent(LOADED, 'vancian-memorization');
  const axes = explicitOpeningAxes(base.registry, opening.techniques, opening.forms);
  const content = { ...base, axes, foundingNodeIds: foundingCandidates(base.registry, axes) };
  const box = { state: undefined };
  const run = referenceScenario(content, {
    raids: true,
    onState: (s) => {
      box.state = s;
    },
    peers,
  });
  const session = createSession({ scenario: run.scenario, strategyId: 'lobby-universe' });
  const { ids } = speciesTable(base.registry);
  const wanted = base.registry.species.find((e) => e.record.id === SPECIES);
  const perSpecies = referenceOptions({ worldTickCap: 1 });
  session.reset(seed, {
    worldTickCap: TICKS + 1,
    options: {
      foundingSpeciesMask: 1 << ids.indexOf(wanted.contentId),
      foundingMages: perSpecies.foundingMages * ids.length,
      cohortSize: perSpecies.cohortSize * ids.length,
      foundingPortalMagic: PORTAL_MAGIC,
    },
  });
  return { run, session, box, content };
}

/** A god with a plan, acting every `every` ticks; raids too when `raid`. */
function makePolicy(kind, every) {
  let tick = 0;
  return (session, run) => {
    const t = tick;
    tick += 1;
    if (kind === 'idle' || t % every !== 0) return { kind: GOD_ACTION.noop };
    const mask = session.legalActions();
    const legal = (a) => mask[a] === 1;
    const candidates = session.candidates();
    if (kind === 'raider' && legal(GOD_ACTION.openPortal)) return { kind: GOD_ACTION.openPortal, params: [0] };
    // A raiding god opens the portal cell if the opening lacks it: Limen, then
    // Rego. Axis actions take the axis bit directly, not a candidate slot.
    if (kind === 'raider' && run.__box.state !== undefined) {
      const ruleset = stateModule.readRulesetForObservation(run.__box.state, stateModule.findUniverse(run.__box.state));
      if (!(ruleset.permittedForms & (1 << FORM_LIMEN)) && legal(GOD_ACTION.permitForm)) return { kind: GOD_ACTION.permitForm, params: [FORM_LIMEN + 1] };
      if (!(ruleset.permittedTechniques & (1 << TECH_REGO)) && legal(GOD_ACTION.permitTechnique)) return { kind: GOD_ACTION.permitTechnique, params: [TECH_REGO + 1] };
    }
    // Keep raiders named so the portal has somebody to send.
    if (kind === 'raider' && legal(GOD_ACTION.assignRole)) {
      const list = candidates.get(GOD_ACTION.assignRole) ?? [];
      const slot = list.findIndex((c) => c.params[1] === 3);
      if (slot >= 0 && (run.__raiderAssigns ?? 0) < 3) {
        run.__raiderAssigns = (run.__raiderAssigns ?? 0) + 1;
        return { kind: GOD_ACTION.assignRole, params: [slot] };
      }
    }
    const universities = session.playerState().institutions.universityCount;
    const completed = run.lastGodReport()?.ascensionProgress.completedUniversities ?? 0;
    if (legal(GOD_ACTION.fundUniversity)) {
      if (universities < 2) return { kind: GOD_ACTION.fundUniversity, params: [0] };
      if (completed < universities) return { kind: GOD_ACTION.fundUniversity, params: [1] };
    }
    if (legal(GOD_ACTION.grantFoundingKnowledge)) return { kind: GOD_ACTION.grantFoundingKnowledge, params: [0] };
    if (legal(GOD_ACTION.blessMage)) return { kind: GOD_ACTION.blessMage, params: [0] };
    if (legal(GOD_ACTION.encourageResearch)) return { kind: GOD_ACTION.encourageResearch, params: [0] };
    return { kind: GOD_ACTION.noop };
  };
}

/** A god who spends: the steward's list, then encourage, then permit a form, then assign. */
function activePolicy(every) {
  const steward = makePolicy('steward', 1);
  let tick = 0;
  return (session, run) => {
    const t = tick;
    tick += 1;
    if (t % every !== 0) return { kind: GOD_ACTION.noop };
    const choice = steward(session, run);
    if (choice.kind !== GOD_ACTION.noop) return choice;
    const mask = session.legalActions();
    for (const action of [GOD_ACTION.permitForm, GOD_ACTION.issueDispensation, GOD_ACTION.assignRole]) {
      if (mask[action] === 1) return { kind: action, params: [0] };
    }
    return { kind: GOD_ACTION.noop };
  };
}

function parsePolicy(spec) {
  if (spec.startsWith('active@')) return activePolicy(Number(spec.split('@')[1]));
  const [kind, every] = spec.split('@');
  return makePolicy(kind, every === undefined ? 1 : Number(every));
}

const REG = referenceContent(LOADED).registry;
const FORM_LIMEN = REG.forms.find((e) => e.record.id === 'limen').record.bit;
const TECH_REGO = REG.techniques.find((e) => e.record.id === 'rego').record.bit;
const KINDS = ['food', 'stone', 'vellum', 'labor', 'essence', 'insight', 'passage'];

function runPair(openingId, spec, seed) {
  const opening = OPENINGS[openingId];
  const cells = { a: undefined, b: undefined };
  const peersFor = (other) => ({
    seats: [1],
    participant: () => (cells[other]?.box.state === undefined ? undefined : participantOf(cells[other].box.state, cells[other].content)),
    speciesIn: () => (cells[other]?.box.state === undefined ? undefined : speciesAliveIn(cells[other].box.state)),
  });
  cells.a = lobbyUniverse(opening, seed, peersFor('b'));
  cells.a.run.__box = cells.a.box;
  cells.b = lobbyUniverse(OPENINGS['cr-ht'], seed + 7919, peersFor('a'));
  const policyA = parsePolicy(spec);
  const policyB = parsePolicy('steward@12');

  const r = {
    opening: openingId,
    spec,
    seed,
    ticks: 0,
    startPassage: 0,
    produced: Object.fromEntries(KINDS.map((k) => [k, 0])),
    applied: Object.fromEntries(KINDS.map((k) => [k, 0])),
    tended: Object.fromEntries(KINDS.map((k) => [k, 0])),
    keeperTicks: 0,
    maxKeepers: 0,
    portalRechargingTicks: 0,
    godSpend: Object.fromEntries(KINDS.map((k) => [k, 0])),
    favorRegen: 0,
    favorSpent: 0,
    favorWasted: 0,
    favorAtCapTicks: 0,
    ticksActed: 0,
    portalLegalTicks: 0,
    portalBlockedByPassage: 0,
    raids: 0,
    foodShortTicks: 0,
    shortfallShareSum: 0,
    popAtFirstShort: -1,
    popEnd: 0,
    popMax: 0,
    insightZeroTicks: 0,
    blessLegalTicks: 0,
    passageProducerTicks: 0,
    yearly: [],
  };
  const first = cells.a.session.playerState().resources.stocks;
  r.startPassage = first.passage / FP;

  for (let t = 0; t < TICKS; t += 1) {
    if (cells.a.session.status() !== 'running') break;
    const mask = cells.a.session.legalActions();
    if (mask[GOD_ACTION.openPortal] === 1) r.portalLegalTicks += 1;
    if (mask[GOD_ACTION.blessMage] === 1) r.blessLegalTicks += 1;
    const actA = policyA(cells.a.session, cells.a.run);
    const resA = cells.a.session.submit(actA);
    if (resA.admitted && actA.kind === GOD_ACTION.openPortal) r.raids += 1;
    if (cells.b.session.status() === 'running') cells.b.session.submit(policyB(cells.b.session, cells.b.run));
    r.ticks += 1;

    const god = cells.a.run.lastGodReport();
    const flow = cells.a.session.flowLedger();
    const ps = cells.a.session.playerState();
    if (flow !== undefined) {
      for (const k of KINDS) {
        r.produced[k] += (flow.faucet[k] ?? 0) / FP;
        r.applied[k] += (flow.applied[k] ?? 0) / FP;
        r.tended[k] += (flow.tended?.[k] ?? 0) / FP;
        r.godSpend[k] += (flow.godSpend[k] ?? 0) / FP;
      }
      if ((flow.applied.passage ?? 0) + (flow.tended?.passage ?? 0) > 0) r.passageProducerTicks += 1;
      const keepers = flow.producers.thresholdKeepers ?? 0;
      if (keepers > 0) r.keeperTicks += 1;
      r.maxKeepers = Math.max(r.maxKeepers, keepers);
      const share = flow.pressure.subsistenceShortfallShare / FP;
      if (share > 0) {
        r.foodShortTicks += 1;
        r.shortfallShareSum += share;
        if (r.popAtFirstShort < 0) r.popAtFirstShort = ps.population.reduce((a, b) => a + b, 0);
      }
    }
    const st = cells.a.box.state;
    if (st !== undefined && typeof stateModule.portalRechargeRemaining === 'function') {
      if (stateModule.portalRechargeRemaining(st, stateModule.findUniverse(st), st.clock.worldTick) > 0) r.portalRechargingTicks += 1;
    }
    const pop = ps.population.reduce((a, b) => a + b, 0);
    r.popMax = Math.max(r.popMax, pop);
    r.popEnd = pop;
    if (ps.resources.stocks.insight < 2048) r.insightZeroTicks += 1;
    if (mask[GOD_ACTION.openPortal] !== 1 && ps.resources.stocks.passage < 16384) r.portalBlockedByPassage += 1;
    if (god !== undefined) {
      r.favorRegen += god.ledger.regenerated / FP;
      r.favorWasted = god.favorWasted / FP;
      let spent = 0;
      for (const v of Object.values(god.ledger.spentByAction)) spent += v;
      r.favorSpent += spent / FP;
      if (spent > 0) r.ticksActed += 1;
      if (god.favor >= god.favorCap) r.favorAtCapTicks += 1;
    }
    if ((t + 1) % 120 === 0) {
      r.yearly.push({
        year: (t + 1) / 12,
        pop,
        mages: ps.mages.reduce((a, b) => a + b, 0),
        stocks: Object.fromEntries(KINDS.map((k) => [k, Math.round(ps.resources.stocks[k] / FP)])),
        favor: god === undefined ? -1 : Math.round(god.favor / FP),
        cap: god === undefined ? -1 : Math.round(god.favorCap / FP),
        tier: god?.worshipTier,
        raids: r.raids,
      });
    }
  }
  for (const k of KINDS) {
    r.produced[k] = Math.round(r.produced[k]);
    r.applied[k] = Math.round(r.applied[k]);
    r.tended[k] = Math.round(r.tended[k]);
    r.godSpend[k] = Math.round(r.godSpend[k]);
  }
  r.favorRegen = Math.round(r.favorRegen);
  r.favorSpent = Math.round(r.favorSpent);
  r.favorWasted = Math.round(r.favorWasted);
  r.spentShare = r.favorRegen === 0 ? 0 : Math.round((100 * r.favorSpent) / r.favorRegen);
  r.meanShortfall = r.foodShortTicks === 0 ? 0 : Math.round((100 * r.shortfallShareSum) / r.foodShortTicks);
  r.passagePerYear = Math.round((10 * (r.applied.passage + r.tended.passage) * 12) / r.ticks) / 10;
  r.insightPerYear = Math.round((10 * (r.applied.insight + r.tended.insight) * 12) / r.ticks) / 10;
  delete r.shortfallShareSum;
  return r;
}

const results = [];
for (const openingId of OPENING_IDS) {
  for (const spec of POLICIES) {
    for (let s = 0; s < SEEDS; s += 1) {
      const t0 = Date.now();
      const r = runPair(openingId, spec, ROOT_SEED + s);
      r.ms = Date.now() - t0;
      results.push(r);
      console.log(JSON.stringify({ ...r, yearly: undefined }));
    }
  }
}
writeFileSync(OUT, JSON.stringify({ ticks: TICKS, seeds: SEEDS, rootSeed: ROOT_SEED, species: SPECIES, portalMagic: PORTAL_MAGIC, results }, null, 1));
