/*
 * Multiverse Mages — S4: five playtest findings, measured headless.
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
 * ## The questions
 *
 * A playtest of the UI (`scripts/play-server.mjs`, origin/main 95738881) over
 * about 580 in-game years reported five things a player could see:
 *
 * 1. food at zero for 150+ years while the population grew;
 * 2. favor pinned at its cap the whole game;
 * 3. "grant founding knowledge" never had a candidate;
 * 4. "declare ascension" never lit;
 * 5. the portal node was never discovered, so action 14 never lit.
 *
 * This probe drives the **same scenario the play server builds** —
 * `referenceScenario(content, { raids: true })` behind `createSession` — under
 * the harness's own bot strategies, and records per run the quantities each
 * finding is about. It answers about the runs it started and nothing else: the
 * output is one file named by `--out`, written once, never a directory glob.
 *
 * ## The cadenced arm
 *
 * A UI player does not act every month. `<id>@every<N>` runs the named strategy
 * on every Nth tick and submits a no-op on the rest, which is what "act, then
 * press advance a few years" is, measured.
 *
 * Usage:
 *
 *     node scripts/s4-playability-probe.mjs --ticks 2400 --seeds 3 \
 *       --strategies passive-control,permissive-breadth,permissive-breadth@every12 \
 *       --out /tmp/s4.json
 */

import { writeFileSync } from 'node:fs';
import process from 'node:process';

import { GOD_ACTION, agentRng, createSession, unaffordableReason } from '@mm/agent-api';
import { BOT_POOL_REGISTRY, policyFor } from '@mm/mc-harness';
import { referenceContent, referenceScenario } from '@mm/scenario';
import { findUniverse, readGodState } from '@mm/state';
import { directorySource, loadContent } from '@mm/content';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const TICKS = Number(arg('ticks', '2400'));
const SEEDS = Number(arg('seeds', '3'));
const ROOT_SEED = Number(arg('seed', '20260813'));
const OUT = arg('out', undefined);
const STRATEGIES = arg(
  'strategies',
  'passive-control,permissive-breadth,permissive-breadth@every12,worship-maximizer,portal-rush',
).split(',');
const FP = 1024;
/** Extra `ScenarioConfig.options`, e.g. `openingTechniqueCount=2,openingFormCount=2`. */
const OPTIONS = Object.fromEntries(
  (arg('options', '') || '')
    .split(',')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const [key, value] = pair.split('=');
      return [key, Number(value)];
    }),
);

if (OUT === undefined) {
  console.error('--out <file> is required: the probe writes exactly the file it is told to.');
  process.exit(1);
}

/**
 * `--content-dir <dir>` loads a copy of `packages/content/data` instead of the
 * shipped one, so a candidate tuning can be measured beside the shipped value
 * without editing the tree two concurrent runs read.
 */
const CONTENT_DIR = arg('content-dir', undefined);
const content =
  CONTENT_DIR === undefined
    ? referenceContent()
    : referenceContent(loadContent(directorySource(CONTENT_DIR, CONTENT_DIR)));

/** The cells `rl-open-the-portal` and its cross-cell prerequisite live in. */
const PORTAL_CELLS = content.registry.cells
  .filter(({ record }) => record.id === 'rego-limen' || record.id === 'intellego-limen')
  .map(({ contentId }) => contentId);

const slotOf = (candidates, action, predicate) =>
  (candidates.get(action) ?? []).findIndex((candidate) => predicate(candidate.params));

/**
 * A god who plays the way the playtest did, as far as a script can: keep two
 * universities standing, point research at the portal, bless a scholar with
 * what is left. Not a pool strategy and not a claim about good play — a
 * stand-in for "a person with a plan", so that "favor is never a constraint"
 * is measured against a god who is trying to spend it.
 */
function stewardPolicy(session, run) {
  return (_obs, mask, _slot, candidates) => {
    const legal = (action) => mask[action] === 1;
    const universities = session.playerState().institutions.universityCount;
    const completed = run.lastGodReport()?.ascensionProgress.completedUniversities ?? 0;
    if (legal(GOD_ACTION.openPortal)) return { action: GOD_ACTION.openPortal, parameter: 0 };
    if (legal(GOD_ACTION.fundUniversity)) {
      // Slot 0 founds. Slots 1+ are standing sites, least complete first, so
      // slot 1 is the one worth funding exactly when something is unfinished —
      // the mask offers it, and the resolver charges nothing, for a site that
      // is already complete.
      if (universities < 2) return { action: GOD_ACTION.fundUniversity, parameter: 0 };
      if (completed < universities) return { action: GOD_ACTION.fundUniversity, parameter: 1 };
    }
    if (legal(GOD_ACTION.encourageResearch)) {
      const slot = slotOf(candidates, GOD_ACTION.encourageResearch, (p) => PORTAL_CELLS.includes(p[0]));
      if (slot >= 0) return { action: GOD_ACTION.encourageResearch, parameter: slot };
    }
    if (legal(GOD_ACTION.grantFoundingKnowledge)) {
      return { action: GOD_ACTION.grantFoundingKnowledge, parameter: 0 };
    }
    if (legal(GOD_ACTION.blessMage)) return { action: GOD_ACTION.blessMage, parameter: 0 };
    return { action: GOD_ACTION.noop };
  };
}

function makePolicy(spec, runSeed, session, run) {
  const [strategyId, cadence] = spec.split('@every');
  const every = cadence === undefined ? 1 : Number(cadence);
  let inner;
  if (strategyId === 'steward') inner = stewardPolicy(session, run);
  else {
    const definition = BOT_POOL_REGISTRY.get(strategyId);
    if (definition === undefined) throw new Error(`no strategy ${strategyId}`);
    inner = policyFor(definition, {
      runSeed,
      agentSlotIndex: 0,
      rng: agentRng({ runSeed, agentSlotIndex: 0, strategyId }),
    });
  }
  let tick = 0;
  return (obs, mask, slot, candidates) => {
    const act = tick % every === 0;
    tick += 1;
    return act ? inner(obs, mask, slot, candidates) : { action: GOD_ACTION.noop };
  };
}

function runOne(spec, runSeed) {
  let latest;
  const run = referenceScenario(content, { raids: true, onState: (state) => (latest = state) });
  const session = createSession({ scenario: run.scenario, strategyId: spec });
  session.reset(runSeed, { worldTickCap: TICKS, options: OPTIONS });
  const policy = makePolicy(spec, runSeed, session, run);

  const r = {
    spec,
    runSeed,
    ticks: 0,
    status: 'running',
    foodZeroTicks: 0,
    longestFoodZero: 0,
    foodZeroRun: 0,
    favorAtCapTicks: 0,
    favorWasted: 0,
    favorSpent: 0,
    favorRegenerated: 0,
    actionsAdmitted: 0,
    grantCandidateTicks: 0,
    grantLegalTicks: 0,
    firstGrantCandidateTick: -1,
    portalLegalTicks: 0,
    firstPortalLegalTick: -1,
    ascensionLegalTicks: 0,
    firstAscensionLegalTick: -1,
    maxMasteredCells: 0,
    maxNodesKnown: 0,
    maxCellsKnown: 0,
    maxUniversities: 0,
    maxWorshipTier: 0,
    maxGoodEraRun: 0,
    minDependence: 1024,
    ticksAtTier4: 0,
    ticksTwoUniversities: 0,
    yearly: [],
    /** Per action id: ticks it was legal, or closed by favor, by materials, or by a rule. */
    gate: {},
  };

  while (session.status() === 'running' && r.ticks < TICKS) {
    const mask = session.legalActions();
    const candidates = session.candidates();
    const grantList = candidates.get(GOD_ACTION.grantFoundingKnowledge) ?? [];
    if (grantList.length > 0) {
      r.grantCandidateTicks += 1;
      if (r.firstGrantCandidateTick < 0) r.firstGrantCandidateTick = r.ticks;
    }
    if (mask[GOD_ACTION.grantFoundingKnowledge] === 1) r.grantLegalTicks += 1;
    if (latest !== undefined) {
      for (let action = 1; action < mask.length; action += 1) {
        const row = (r.gate[action] ??= { legal: 0, favor: 0, materials: 0, rule: 0 });
        if (mask[action] === 1) row.legal += 1;
        else {
          const why = unaffordableReason(action, {
            state: latest,
            candidates,
            catalogue: run.scenario.catalogue,
          });
          row[why ?? 'rule'] += 1;
        }
      }
    }
    if (mask[GOD_ACTION.openPortal] === 1) {
      r.portalLegalTicks += 1;
      if (r.firstPortalLegalTick < 0) r.firstPortalLegalTick = r.ticks;
    }
    if (mask[GOD_ACTION.declareAscension] === 1) {
      r.ascensionLegalTicks += 1;
      if (r.firstAscensionLegalTick < 0) r.firstAscensionLegalTick = r.ticks;
    }

    let chosen = policy(session.observe(), mask, 0, candidates);
    // Measure eligibility, do not end the run on it: a declared ascension would
    // truncate every later quantity this probe exists to read.
    if (chosen.action === GOD_ACTION.declareAscension) chosen = { action: GOD_ACTION.noop };
    const result = session.submit({
      kind: chosen.action,
      params: chosen.parameter === undefined ? [] : [chosen.parameter],
    });
    if (result.admitted && chosen.action !== GOD_ACTION.noop) r.actionsAdmitted += 1;
    r.ticks += 1;

    const god = run.lastGodReport();
    const ps = session.playerState();
    const food = ps.resources.stocks.food;
    if (food <= 0) {
      r.foodZeroTicks += 1;
      r.foodZeroRun += 1;
      r.longestFoodZero = Math.max(r.longestFoodZero, r.foodZeroRun);
    } else r.foodZeroRun = 0;
    if (god !== undefined) {
      if (god.favor >= god.favorCap) r.favorAtCapTicks += 1;
      // Cumulative on the god record, so the last report's value is the run's.
      r.favorWasted = god.favorWasted;
      r.favorRegenerated += god.ledger.regenerated;
      r.maxMasteredCells = Math.max(r.maxMasteredCells, god.ascensionProgress.masteredCells);
      r.maxNodesKnown = Math.max(r.maxNodesKnown, god.ascensionProgress.nodesKnown);
      r.maxCellsKnown = Math.max(r.maxCellsKnown, god.ascensionProgress.cellsKnown);
      r.maxUniversities = Math.max(r.maxUniversities, god.ascensionProgress.completedUniversities);
      r.maxWorshipTier = Math.max(r.maxWorshipTier, god.worshipTier);
      r.maxGoodEraRun = Math.max(r.maxGoodEraRun, god.ascensionProgress.goodEraRun);
      r.minDependence = Math.min(r.minDependence, god.ascensionProgress.dependence);
      if (god.worshipTier >= 4) r.ticksAtTier4 += 1;
      if (god.ascensionProgress.completedUniversities >= 2) r.ticksTwoUniversities += 1;
      for (const v of Object.values(god.ledger.spentByAction)) r.favorSpent += v;
    }
    if (r.ticks % 120 === 0 && god !== undefined) {
      r.yearly.push({
        tick: r.ticks,
        pop: ps.population.reduce((a, b) => a + b, 0),
        mages: ps.mages.reduce((a, b) => a + b, 0),
        food: Math.round(food / FP),
        favor: Math.round(god.favor / FP),
        favorCap: Math.round(god.favorCap / FP),
        tier: god.worshipTier,
        mastered: god.ascensionProgress.masteredCells,
        nodes: god.ascensionProgress.nodesKnown,
        cells: god.ascensionProgress.cellsKnown,
        unis: god.ascensionProgress.completedUniversities,
        worship: god.worship,
        goodEraRun: god.ascensionProgress.goodEraRun,
        dependence: god.ascensionProgress.dependence,
        eraLost: god.ascensionProgress.eraNodesLost,
        portalCells: PORTAL_CELLS.map((id) => ps.knowledge[id - 1]?.deepestTier ?? 0),
      });
    }
  }
  r.status = session.status();
  // Which stagnation clock was running when it ended, read off the god record
  // through the scenario's own state tap.
  if (latest !== undefined) {
    const god = readGodState(latest, findUniverse(latest));
    if (god !== undefined) {
      r.stagnation = {
        magelessTicks: god.magelessTicks,
        lowWorshipTicks: god.lowWorshipTicks,
        stasisTicks: god.stasisTicks,
        terminalTick: god.terminalTick,
      };
    }
  }
  delete r.foodZeroRun;
  r.favorWasted = Math.round(r.favorWasted / FP);
  r.favorSpent = Math.round(r.favorSpent / FP);
  r.favorRegenerated = Math.round(r.favorRegenerated / FP);
  return r;
}

const results = [];
for (const spec of STRATEGIES) {
  for (let s = 0; s < SEEDS; s += 1) {
    const t0 = process.hrtime.bigint();
    const r = runOne(spec, ROOT_SEED + s);
    r.ms = Number((process.hrtime.bigint() - t0) / 1000000n);
    results.push(r);
    // The yearly series and the per-action gate tally go to `--out` only.
    console.log(JSON.stringify({ ...r, yearly: undefined, gate: undefined }));
  }
}
writeFileSync(
  OUT,
  JSON.stringify({ ticks: TICKS, seeds: SEEDS, options: OPTIONS, rootSeed: ROOT_SEED, strategies: STRATEGIES, results }, null, 1),
);
