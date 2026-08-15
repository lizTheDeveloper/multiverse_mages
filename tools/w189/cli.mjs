#!/usr/bin/env node
/*
 * Multiverse Mages — macro model CLI.
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
 * Usage:
 *   node tools/w189/cli.mjs reference          # the reference universe's needs
 *   node tools/w189/cli.mjs sweep              # raid probability x economic rate
 *   node tools/w189/cli.mjs toggles            # broken vs intended, per subsystem
 *   node tools/w189/cli.mjs species            # the same question per species
 *   node tools/w189/cli.mjs breadth            # sweep vision 4b's per-mage cap
 *   node tools/w189/cli.mjs params             # every parameter and its provenance
 *   node tools/w189/cli.mjs selftest           # positive controls; exits 42 if a probe is broken
 *
 * Flags: --seed=N --horizon=N --species=id --raid=p --econ=r --broken --intended
 */

import {
  loadContent,
  speciesBlock,
  assertV1Shape,
  exclusionPairs,
  defaultParams,
  provenanceTable,
  TOGGLES,
  ATTEND_AT_FULL_ACCESS,
} from './params.mjs';
import { buildPortfolio, runModel, mulberry32 } from './macro.mjs';
import { emitNeeds, booksRequired, fmt } from './needs.mjs';

/* ------------------------------------------------------------------- setup */

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('--')) ?? 'reference';
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : Number(hit.split('=')[1]);
};
const has = (name) => argv.includes(`--${name}`);
const flagStr = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.split('=')[1];
};

const content = loadContent();
const { cells: v1cells, nodes: v1nodes } = assertV1Shape(content.cells, content.nodes);
const exclusions = exclusionPairs(content.cells);

/** Toggle sets. `broken` is what `main` does today; `intended` is the design. */
const toggleSet = (which) => ({
  scribingQueue: TOGGLES.scribingQueue[which],
  scribeCohortRefills: TOGGLES.scribeCohortRefills[which],
  affiliationCompletes: TOGGLES.affiliationCompletes[which],
  teachRateBites: TOGGLES.teachRateBites[which],
  standingArmy: TOGGLES.standingArmy[which],
});

/**
 * Which grid the universe is allowed to reach.
 *
 * `v1` is the shipped twelve-cell rectangle: 51 nodes, tiers 1-5, and the
 * authored exclusion pair (creo-ignem / creo-umbra) sits OUTSIDE it, so
 * anti-requisites cannot bite domestically at all — the only route to the other
 * 249 nodes is a looted foreign book.
 *
 * `full` is all seventy cells: 300 nodes, tiers 1-6, exclusion pair live. This
 * is the game the roadmap is heading toward, and it is the only setting in
 * which the university system has to have a *shape* rather than a size — under
 * v1 every mage reaches the ceiling and the pyramid is flat.
 */
function nodesFor(grid) {
  return grid === 'full' ? content.nodes : v1nodes;
}

function buildWorld(speciesId, toggles, grid) {
  const species = speciesBlock(content.species, speciesId);
  species.attendAtFullAccess = ATTEND_AT_FULL_ACCESS.value;
  const portfolio = buildPortfolio(nodesFor(grid), species, exclusions);
  return { species, portfolio, toggles, grid };
}

function run(opts = {}) {
  const speciesId = opts.speciesId ?? flagStr('species', 'human');
  const toggles = opts.toggles ?? toggleSet(has('broken') ? 'broken' : 'intended');
  const grid = opts.grid ?? flagStr('grid', 'v1');
  const world = buildWorld(speciesId, toggles, grid);
  const params = defaultParams({
    seed: flag('seed', 20260814),
    horizonYears: opts.horizon ?? flag('horizon', 200),
    speciesId,
    attendAtFullAccess: world.species.attendAtFullAccess,
    raidProbPerYear: opts.raid ?? flag('raid', 0.045),
    economicRate: opts.econ ?? flag('econ', 1.0),
    universities0: opts.universities ?? flag('universities', 1),
    ...(opts.overrides ?? {}),
  });
  /* `attendAtFullAccess` is read off the params block by the model. */
  params.attendAtFullAccess = { value: world.species.attendAtFullAccess, provenance: 'authored' };
  const result = runModel(params, world);
  return { result, needs: emitNeeds(result), world, params };
}

/* ---------------------------------------------------------------- printing */

const bar = (s) => `\n${'='.repeat(78)}\n${s}\n${'='.repeat(78)}`;

function printNeeds(n, label) {
  console.log(bar(label));
  console.log(`\nOBJECTIVE`);
  console.log(`  retention : ${n.objective.retention}`);
  console.log(`  discovery : ${n.objective.discovery}`);
  console.log(`\nPORTFOLIO`);
  console.log(
    `  ${fmt(n.portfolio.held)} of ${n.portfolio.reachable} reachable nodes held ` +
      `(${n.portfolio.permitted} permitted by the ruleset; ${n.unreachable.count} unreachable: ${n.unreachable.reason})`,
  );
  console.log(`\nFRAGILITY CENSUS  (extinction probability over the retention horizon)`);
  console.log(`  tier  held/poss  holders/node  books/node   P(lost)   books needed`);
  for (const c of n.census) {
    console.log(
      `   ${String(c.tier).padStart(2)}   ${fmt(c.held).padStart(4)}/${String(c.ofPossible).padEnd(4)} ` +
        `${fmt(c.holdersPerNode).padStart(11)}  ${fmt(c.booksPerNode).padStart(10)}  ` +
        `${(c.extinctionProbability * 100).toFixed(1).padStart(7)}%  ${fmt(c.booksRequiredPerNode).padStart(12)}`,
    );
  }
  console.log(`\n  ${fmt(n.fragileNodes)} held nodes sit above the risk target — one funeral from lost.`);
  if (n.unsavableNodes > 0) {
    console.log(`  ${fmt(n.unsavableNodes)} of them cannot be saved by books at all at this raid rate.`);
  }
  console.log(`\nNEEDS`);
  for (const need of n.needs) {
    const mark = need.shortfall > 0.5 ? 'SHORT' : '  ok ';
    console.log(
      `  [${mark}] ${need.name.padEnd(13)} need ${fmt(need.required).padStart(8)} ` +
        `have ${fmt(need.available).padStart(8)}  short ${fmt(need.shortfall).padStart(8)} ${need.unit}`,
    );
    if (need.shortfall > 0.5) console.log(`           cause: ${need.cause}`);
  }
  console.log(`\n>> ${n.sentence}\n`);
}

/* --------------------------------------------------------------- commands */

function cmdReference() {
  const intended = run({ toggles: toggleSet('intended') });
  printNeeds(intended.needs, 'REFERENCE UNIVERSE — human, 200 world years, intended subsystems');
  const broken = run({ toggles: toggleSet('broken') });
  printNeeds(broken.needs, 'REFERENCE UNIVERSE — the same universe as `main` actually runs it');
}

function cmdSweep() {
  const raids = [0, 0.045, 0.1, 0.2, 0.35, 0.55];
  const econs = [0.5, 0.75, 1.0, 1.5, 2.5];
  for (const which of ['intended', 'broken']) {
    console.log(bar(`SWEEP — raid probability x economic rate (${which} subsystems)`));
    console.log(`\nBinding need in each cell, with its shortfall.\n`);
    console.log(`  raid\\econ ` + econs.map((e) => `${e.toFixed(2)}x`.padStart(16)).join(''));
    for (const r of raids) {
      const cells = econs.map((e) => {
        const { needs } = run({ raid: r, econ: e, toggles: toggleSet(which) });
        return needs.binding ? `${needs.binding.name}:${fmt(needs.binding.shortfall)}` : 'none';
      });
      console.log(`  ${(r * 100).toFixed(1).padStart(5)}%  ` + cells.map((c) => c.padStart(16)).join(''));
    }
    console.log(`\n  Universities required, same grid:`);
    console.log(`  raid\\econ ` + econs.map((e) => `${e.toFixed(2)}x`.padStart(16)).join(''));
    for (const r of raids) {
      const cells = econs.map((e) => {
        const { needs } = run({ raid: r, econ: e, toggles: toggleSet(which) });
        const u = needs.needs.find((n) => n.name === 'universities');
        return `${fmt(u.required)} (have ${fmt(u.available)})`;
      });
      console.log(`  ${(r * 100).toFixed(1).padStart(5)}%  ` + cells.map((c) => c.padStart(16)).join(''));
    }
    console.log(`\n  Fragile nodes (above the risk target), same grid:`);
    console.log(`  raid\\econ ` + econs.map((e) => `${e.toFixed(2)}x`.padStart(16)).join(''));
    for (const r of raids) {
      const cells = econs.map((e) => {
        const { needs } = run({ raid: r, econ: e, toggles: toggleSet(which) });
        return `${fmt(needs.fragileNodes)}${needs.unsavableNodes > 0 ? ` (${fmt(needs.unsavableNodes)} unsavable)` : ''}`;
      });
      console.log(`  ${(r * 100).toFixed(1).padStart(5)}%  ` + cells.map((c) => c.padStart(16)).join(''));
    }
    console.log('');
  }
}

function cmdToggles() {
  console.log(bar('TOGGLES — how much each unwired subsystem changes the answer'));
  console.log(`\nBaseline is all-intended. Each row flips ONE subsystem to what \`main\` does today.`);
  console.log(`Reported on the FULL grid by default: tiers 5-6 exist there, and two of these`);
  console.log(`toggles only touch deep teaching, so a v1 run cannot tell them apart.\n`);
  const grid = flagStr('grid', 'full');
  const base = run({ grid, toggles: toggleSet('intended') });
  const report = (label, out, gloss) => {
    const needs = out.needs;
    const yrs = out.result.yearsToFullPortfolio;
    console.log(
      `  ${label.padEnd(26)} held=${fmt(needs.portfolio.held).padStart(6)}/${needs.portfolio.reachable}` +
        `  full in=${(yrs === null ? 'never' : `${yrs}y`).padStart(6)}` +
        `  books=${fmt(needs.needs.find((n) => n.name === 'scribes').required).padStart(7)} scribes` +
        `  fragile=${fmt(needs.fragileNodes)}`,
    );
    if (gloss) console.log(`    ${gloss}`);
  };
  report('BASELINE (all intended)', base, '');
  for (const key of Object.keys(TOGGLES)) {
    const t = toggleSet('intended');
    t[key] = TOGGLES[key].broken;
    report(`broken: ${key}`, run({ grid, toggles: t }), TOGGLES[key].gloss);
  }
  console.log(`\n  And all five broken at once — the game as it runs on main today:`);
  report('ALL BROKEN', run({ grid, toggles: toggleSet('broken') }), '');
  console.log('');
}

function cmdSpecies() {
  console.log(bar('SPECIES — the same universe, six ways'));
  console.log(`\n  Dwarf and gnome prevalence is deliberately unauthored; they are skipped rather than guessed.\n`);
  console.log(`  species    life   cap  depth   held  fragile   binding need`);
  for (const s of content.species) {
    let out;
    try {
      out = run({ speciesId: s.id, toggles: toggleSet('intended') });
    } catch (err) {
      console.log(`  ${s.id.padEnd(10)} ${'—'.padStart(5)}  ${String(err.message).slice(0, 60)}`);
      continue;
    }
    const n = out.needs;
    const w = out.world.species;
    console.log(
      `  ${s.id.padEnd(10)} ${String(w.lifespanYears).padStart(4)}y ${w.classCapacity.toFixed(0).padStart(5)} ` +
        `${String(w.depthCeiling).padStart(6)} ${fmt(n.portfolio.held).padStart(6)} ${fmt(n.fragileNodes).padStart(8)}   ` +
        `${n.binding ? `${n.binding.name}: ${fmt(n.binding.shortfall)}` : 'none'}`,
    );
  }
  console.log('');
}

/**
 * The sweep the whole model exists for: how few nodes must one mage be limited
 * to before the university system has to have a SHAPE rather than a size?
 */
function cmdBreadth() {
  console.log(bar('BREADTH x RAID — the two terms that have to meet'));
  console.log(`\n  Vision 4b: "An individual mage cannot learn all the magic." Nothing enforces that`);
  console.log(`  inside the twelve enabled cells today, so this sweeps the cap the design implies`);
  console.log(`  against raid pressure. Full grid, human, intended subsystems.`);
  console.log(`\n  Cells are HELD NODES ABOVE THE RISK TARGET — "one funeral from lost".\n`);
  const caps = [0, 100, 50, 25, 12, 6, 3];
  const raids = [0.045, 0.2, 0.45, 0.9];
  console.log(`   cap\\raid ` + raids.map((r) => `${(r * 100).toFixed(0)}%`.padStart(12)).join(''));
  for (const cap of caps) {
    const cells = raids.map((r) => {
      const { needs } = run({ grid: 'full', raid: r, overrides: { breadthCapNodes: cap }, toggles: toggleSet('intended') });
      return fmt(needs.fragileNodes);
    });
    console.log(`  ${(cap === 0 ? 'none' : String(cap)).padStart(6)}  ` + cells.map((c) => c.padStart(12)).join(''));
  }
  console.log(`\n  Holders per node at the deepest held tier, same grid:\n`);
  console.log(`   cap\\raid ` + raids.map((r) => `${(r * 100).toFixed(0)}%`.padStart(12)).join(''));
  for (const cap of caps) {
    const cells = raids.map((r) => {
      const { needs } = run({ grid: 'full', raid: r, overrides: { breadthCapNodes: cap }, toggles: toggleSet('intended') });
      const c = needs.census[needs.census.length - 1];
      return fmt(c ? c.holdersPerNode : 0);
    });
    console.log(`  ${(cap === 0 ? 'none' : String(cap)).padStart(6)}  ` + cells.map((c) => c.padStart(12)).join(''));
  }
  console.log('');
}

function cmdParams() {
  console.log(bar('PARAMETERS — every number, and where it came from'));
  const rows = provenanceTable(defaultParams());
  const order = { content: 0, authored: 1, measured: 2, derived: 3, invented: 4 };
  rows.sort((a, b) => (order[a.provenance] ?? 9) - (order[b.provenance] ?? 9));
  let last = '';
  for (const r of rows) {
    if (r.provenance !== last) {
      console.log(`\n  --- ${r.provenance.toUpperCase()} ---`);
      last = r.provenance;
    }
    console.log(`  ${r.name.padEnd(38)} ${String(r.value).padStart(10)}`);
    if (r.note) console.log(`      ${r.note}`);
  }
  const invented = rows.filter((r) => r.provenance === 'invented').length;
  console.log(`\n  ${invented} of ${rows.length} parameters are invented. Each is a fork the author owns.\n`);
}

/* --------------------------------------------------------------- selftest */

/**
 * Positive controls. `CLAUDE.md`: when a check reports the negative case,
 * confirm the check works before believing it — so every probe here has an
 * input it MUST accept, and a broken probe exits 42 rather than folding into
 * "the answer is no".
 */
function cmdSelftest() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass, detail });

  /* 1. Content shape — a positive control on the whole content read. */
  ok('v1 rectangle is 12 cells / 51 nodes', v1cells.length === 12 && v1nodes.length === 51,
    `${v1cells.length} cells, ${v1nodes.length} nodes`);

  /* 2. The cost ladder really is geometric — the model hardcodes the formula. */
  const ladderOk = content.nodes.every((n) => n.researchCost === 1024 * 2 ** n.tier
    && n.teachCost === 256 * 2 ** n.tier && n.scribeCost === 512 * 2 ** n.tier);
  ok('cost ladder matches researchCost=1024*2^tier', ladderOk, 'checked all 300 nodes');

  /* 3. booksRequired must FALL as holders rise (positive control on direction). */
  const b1 = booksRequired(1, 1 / 80, 0.01, 50, 0.05);
  const b5 = booksRequired(5, 1 / 80, 0.01, 50, 0.05);
  ok('more holders require fewer books', b5 <= b1, `h=1 needs ${b1}, h=5 needs ${b5}`);

  /* 4. A raid rate of zero must be no worse than a high one. Run it under a
   *    BREADTH CAP, because without one every mage holds every node, every node
   *    has ~230 holders, and fragility is identically zero at every raid rate —
   *    the uncapped version of this check compares 0 against 0 and proves
   *    nothing. The cap is what makes the probe able to see anything at all. */
  const capped = { grid: 'full', overrides: { breadthCapNodes: 6 }, toggles: toggleSet('intended') };
  const calm = run({ ...capped, raid: 0 }).needs;
  const storm = run({ ...capped, raid: 0.9 }).needs;
  ok('more raids never reduce fragility (breadth-capped, non-vacuous)',
    storm.fragileNodes >= calm.fragileNodes && (storm.fragileNodes > 0 || calm.fragileNodes > 0),
    `calm ${fmt(calm.fragileNodes)}, storm ${fmt(storm.fragileNodes)}`);

  /* 4b. And the cap itself must be the thing doing the work: uncapped, the same
   *     universe at the same raid rate must be strictly less fragile. */
  const uncapped = run({ grid: 'full', raid: 0.9, toggles: toggleSet('intended') }).needs;
  ok('the breadth cap is what creates fragility', uncapped.fragileNodes < storm.fragileNodes,
    `uncapped ${fmt(uncapped.fragileNodes)} vs capped-at-6 ${fmt(storm.fragileNodes)}`);

  /* 5. THE key positive control on the scribe axis: under intended subsystems
   *    the scribe requirement must land in a plausible band, and under broken
   *    it must be driven by a structurally-zero queue. If the intended case
   *    also produced zero the whole toggle comparison would be vacuous. */
  const intendedScribes = run({ toggles: toggleSet('intended') }).needs.needs.find((n) => n.name === 'scribes');
  const brokenRun = run({ toggles: toggleSet('broken') }).needs;
  const brokenBooks = brokenRun.census.reduce((s, c) => s + c.booksPerNode, 0);
  ok('intended scribing writes books; broken writes none', intendedScribes.required > 0 && brokenBooks < 1e-9,
    `intended requires ${fmt(intendedScribes.required)} scribes; broken holds ${fmt(brokenBooks)} books/node`);

  /* 6. Monte Carlo control on the closed-form raid expectation: sampling
   *    Bernoulli arrivals at rate p under the cooldown must reproduce the
   *    expected raid count the closed form accumulates. */
  const rng = mulberry32(20260814);
  const p = 0.2;
  const cooldown = 5;
  let arrivals = 0;
  const YEARS = 200;
  const TRIALS = 400;
  for (let t = 0; t < TRIALS; t += 1) {
    let since = cooldown;
    for (let y = 0; y < YEARS; y += 1) {
      since += 1;
      if (since >= cooldown && rng() < p) { arrivals += 1; since = 0; }
    }
  }
  const mcMean = arrivals / TRIALS;
  const closed = run({ raid: p, toggles: toggleSet('intended') }).result.cumulativeRaids;
  const rel = Math.abs(mcMean - closed) / Math.max(1, mcMean);
  ok('closed-form raid count matches Monte Carlo', rel < 0.25,
    `MC ${mcMean.toFixed(1)} vs closed form ${closed.toFixed(1)} over ${YEARS}y (rel ${(rel * 100).toFixed(1)}%)`);

  /* 6b. EVERY toggle must move at least one reported output.
   *
   *     This control exists because the first draft of this model declared five
   *     toggles and only WIRED two of them. `teachRateBites` had no multiplier
   *     to apply and `affiliationCompletes` was never read, so the comparison
   *     table dutifully reported "changes nothing" for both — a no-op wearing a
   *     null result's clothes, which is the most expensive kind of wrong answer
   *     this repository knows about. A toggle that cannot move anything is a
   *     broken probe, not a finding.
   *
   *     `standingArmy` is exempt and only because BOTH its values are authored
   *     zero: ages-of-magic 2b says there is no standing army on purpose. */
  const fingerprint = (o) =>
    `${o.needs.portfolio.held.toFixed(3)}|${o.needs.fragileNodes.toFixed(3)}|` +
    `${o.needs.needs.map((x) => x.required.toFixed(3)).join(',')}|${String(o.result.yearsToFullPortfolio)}`;
  for (const key of Object.keys(TOGGLES)) {
    if (key === 'standingArmy') continue;
    /* teach-rate only touches tiers >= 4 and only binds when professors are
     * scarce, so it is exercised against a universe whose teaching corps is
     * capped — otherwise a live knob would read as a dead one. */
    const scarce = key === 'teachRateBites';
    const baseT = toggleSet('intended');
    if (scarce) baseT.affiliationCompletes = false;
    const flipped = { ...baseT, [key]: TOGGLES[key].broken };
    const a = fingerprint(run({ grid: 'full', toggles: baseT }));
    const b = fingerprint(run({ grid: 'full', toggles: flipped }));
    ok(`toggle "${key}" moves the answer`, a !== b,
      scarce ? 'exercised under professor scarcity' : 'intended vs broken differ');
  }

  /* 7. Determinism: the same seed must give the same answer. */
  const a = JSON.stringify(run({ toggles: toggleSet('intended') }).needs.census);
  const b = JSON.stringify(run({ toggles: toggleSet('intended') }).needs.census);
  ok('model is deterministic', a === b, 'two runs, identical census');

  /* 8. Probe health: the model must actually produce a non-degenerate universe
   *    in the intended case. A model that holds zero nodes would pass several
   *    checks above vacuously. */
  const ref = run({ toggles: toggleSet('intended') }).needs;
  const healthy = ref.portfolio.held > 5 && ref.census.length > 1;
  if (!healthy) {
    console.log('PROBE BROKEN: the intended reference universe holds ' +
      `${fmt(ref.portfolio.held)} nodes across ${ref.census.length} tiers. ` +
      'Every other check below is vacuous. Exit 42.');
    process.exit(42);
  }

  console.log(bar('SELFTEST'));
  let failed = 0;
  for (const c of checks) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`);
    console.log(`         ${c.detail}`);
    if (!c.pass) failed += 1;
  }
  console.log(`\n  ${checks.length - failed}/${checks.length} passed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

/* ------------------------------------------------------------------- main */

const commands = {
  reference: cmdReference,
  sweep: cmdSweep,
  toggles: cmdToggles,
  species: cmdSpecies,
  breadth: cmdBreadth,
  params: cmdParams,
  selftest: cmdSelftest,
};

const fn = commands[cmd];
if (!fn) {
  console.error(`unknown command "${cmd}". One of: ${Object.keys(commands).join(', ')}`);
  process.exit(2);
}
fn();
