#!/usr/bin/env node
/*
 * Multiverse Mages — W27: does the god's allocation decision have any shape?
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Applies the decision rule pre-registered in
 * `docs/superpowers/plans/w27-decision-space.md` at commit eca4275, which was
 * committed and pushed before any endpoint number was read.
 *
 * The analysis is **paired by seed**. Three arms share one `sweepId` and one
 * `rootSeed` and differ only in the strategy, and a run seed derives from
 * `(rootSeed, sweepId, cellIndex, replicateIndex)` and not from the strategy —
 * so run *i* of every arm carries the identical seed by construction. Common
 * random numbers pay for themselves only if the analysis takes the per-seed
 * delta rather than the difference of two independent means, and that is what
 * this does.
 *
 * Floats are used freely: this is analysis, outside the rules path.
 *
 * Usage:  node scripts/w27-analyse.mjs <results-root>
 * where <results-root> holds one directory per arm: concentrate/ spread/ idle/
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The pre-registered rule, transcribed. Changing anything here after the fact
// is the failure this file exists to make visible.
// ---------------------------------------------------------------------------

/**
 * Spend parity gate G1: applied favor **per tick run** must agree within this
 * fraction of the larger.
 *
 * A rate and not a total, by the amendment recorded in the plan while the sweeps
 * were in flight. Both arms declare `whenEligible`, so `ticksRun` ends at first
 * ascension — an outcome. A shaped result moves ascension timing, which moves
 * the number of allocation rounds, which moves total spend: the original
 * total-based gate would have failed hardest exactly when the finding was real.
 */
const SPEND_PARITY_TOLERANCE = 0.05;

/**
 * Primary endpoints, with their materiality floor and equivalence margin.
 *
 * `absolute` floors are in the endpoint's own unit; `relative` floors are a
 * fraction of the pooled mean, resolved at run time. The two numbers are equal
 * for every endpoint by pre-registration — the floor is what makes a detected
 * difference matter, the margin is what makes an undetected one an equivalence
 * claim, and setting them equal is what makes "shaped", "flat" and
 * "inconclusive" exhaustive and mutually exclusive.
 */
const ENDPOINTS = [
  { id: 'nodesKnown@600', label: 'nodes known @ tick 600', kind: 'absolute', floor: 1.0 },
  { id: 'nodesKnown', label: 'nodes known, terminal', kind: 'absolute', floor: 1.0 },
  { id: 'knowledgeInstances', label: 'knowledge instances, terminal', kind: 'relative', floor: 0.05 },
  { id: 'libraryDepth', label: 'library depth, terminal', kind: 'relative', floor: 0.05 },
  { id: 'livingMages', label: 'living mages, terminal', kind: 'relative', floor: 0.05 },
  { id: 'ascensionRate', label: 'ascension rate', kind: 'absolute', floor: 0.05 },
];

/** §4.2 action ids, for the spend table. */
const ACTION_NAME = {
  1: 'permit-technique',
  2: 'forbid-technique',
  3: 'permit-form',
  4: 'forbid-form',
  5: 'issue-dispensation',
  6: 'issue-interdiction',
  7: 'revoke-edict',
  8: 'grant-founding-knowledge',
  9: 'bless-mage',
  10: 'assign-role',
  11: 'fund-university',
  12: 'encourage-research',
  13: 'change-tradition',
  14: 'open-portal',
};

/** Unit favor cost per action, from `packages/content/data/god-cost.json`. */
const ACTION_COST = { 1: 8192, 3: 4096, 8: 12288, 9: 2048, 11: 3072, 12: 1024 };
/** `found-university-cost`, from `god-constant.json`. Action 11 slot 0 only. */
const FOUND_UNIVERSITY_COST = 10240;

/** The bots' shared schedule, transcribed from `strategies.ts`. */
const PERMIT_ROUNDS = 140;
const FOUNDING_UNTIL = 246;

/** Which verb the shared schedule spends on at a given round. */
function scheduledVerb(round) {
  if (round < PERMIT_ROUNDS) return null;
  switch (round % 12) {
    case 0:
      return 8;
    case 3:
    case 9:
      return 9;
    case 6:
      return 11;
    default:
      return 12;
  }
}

/** How many times the schedule *asked* for each verb over a run of `ticks`. */
function scheduledAttempts(ticks) {
  const attempts = { 8: 0, 9: 0, 11: 0, 12: 0 };
  let foundings = 0;
  for (let round = PERMIT_ROUNDS; round < ticks; round += 1) {
    const verb = scheduledVerb(round);
    if (verb === null) continue;
    attempts[verb] += 1;
    if (verb === 11 && round < FOUNDING_UNTIL) foundings += 1;
  }
  return { attempts, foundings };
}

// ---------------------------------------------------------------------------
// Statistics. Paired, because the arms share seeds.
// ---------------------------------------------------------------------------

function mean(xs) {
  return xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sampleStdDev(xs) {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/**
 * A paired 95% confidence interval on the mean of `deltas`.
 *
 * The normal quantile rather than Student's t: at n = 400 the difference in the
 * critical value is under half a percent, and quoting 1.96 makes the interval
 * something a reader can recompute by hand from the two numbers beside it.
 */
function pairedInterval(deltas) {
  const n = deltas.length;
  const m = mean(deltas);
  const se = sampleStdDev(deltas) / Math.sqrt(n);
  return { n, mean: m, se, low: m - 1.96 * se, high: m + 1.96 * se };
}

/**
 * A 95% interval on a paired difference of proportions (McNemar-style).
 *
 * Ascension is a per-run 0/1 outcome, so its per-seed delta is in {-1, 0, +1}
 * and the ordinary paired interval on those deltas is exactly right. Kept as its
 * own function only so the call site says which quantity it is treating as a
 * proportion.
 */
const pairedProportionInterval = pairedInterval;

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return Number.NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? Number.NaN : num / Math.sqrt(dx * dy);
}

function rank(xs) {
  const order = xs.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const shared = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = shared;
    i = j + 1;
  }
  return ranks;
}

function spearman(xs, ys) {
  return pearson(rank(xs), rank(ys));
}

// ---------------------------------------------------------------------------
// Loading.
// ---------------------------------------------------------------------------

function loadArm(root, arm) {
  const dir = join(root, arm);
  const files = readdirSync(dir).filter((name) => name.endsWith('.runs.ndjson'));
  if (files.length !== 1) {
    throw new Error(
      `Arm ${arm} has ${String(files.length)} results files in ${dir}. Exactly one execution per ` +
        'arm, or the pairing is between an unknown pair of runs.',
    );
  }
  return readFileSync(join(dir, files[0]), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function metricOf(run, id) {
  const entry = run.metrics?.[id];
  return entry?.status === 'measured' ? entry.value : undefined;
}

function traceAt(run, tick) {
  return (run.censusTrace ?? []).find((point) => point.worldTick === tick);
}

/** The six pre-registered endpoints, for one run. `undefined` where unavailable. */
function endpointsOf(run) {
  const at600 = traceAt(run, 600);
  return {
    'nodesKnown@600': at600?.nodesKnown,
    nodesKnown: metricOf(run, 'referenceNodesKnown'),
    knowledgeInstances: metricOf(run, 'referenceKnowledgeInstances'),
    libraryDepth: metricOf(run, 'referenceLibraryDepth'),
    livingMages: metricOf(run, 'referenceLivingMages'),
    // The rate's denominator excludes `failed`, matching `collectAscensionRate`
    // and `integration-r2-analyse.mjs`. A failed run contributes no 0 and no 1.
    ascensionRate: run.status === 'failed' ? undefined : run.status === 'ascended' ? 1 : 0,
  };
}

function totalSpend(run) {
  return Object.values(run.godSpendByAction ?? {}).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

const out = [];
const say = (line = '') => out.push(line);

function fixed(value, places = 3) {
  return Number.isFinite(value) ? value.toFixed(places) : 'n/a';
}

function main() {
  const root = process.argv[2];
  if (root === undefined) {
    console.error('usage: node scripts/w27-analyse.mjs <results-root> [report.md]');
    process.exit(2);
  }

  const arms = { concentrate: loadArm(root, 'concentrate'), spread: loadArm(root, 'spread'), idle: loadArm(root, 'idle') };

  say('# W27 — the god\'s allocation decision space');
  say();
  say('Decision rule pre-registered at `docs/superpowers/plans/w27-decision-space.md`, commit');
  say('`eca4275`, committed and pushed before any endpoint number was read.');
  say();

  // -------------------------------------------------------------------------
  // Validity gates. Checked first; failing one invalidates the comparison
  // rather than making it a divergence.
  // -------------------------------------------------------------------------
  say('## Validity gates');
  say();
  const gates = [];

  // G4 — coverage. `assignment: "fixed"` makes the pool size 1, so the check is
  // that every run in an arm carries that arm's strategy and the counts match.
  const coverage = {};
  for (const [arm, runs] of Object.entries(arms)) {
    const byStrategy = new Map();
    for (const run of runs) {
      const id = run.strategies?.[0] ?? '(none)';
      byStrategy.set(id, (byStrategy.get(id) ?? 0) + 1);
    }
    coverage[arm] = byStrategy;
  }
  say('| arm | runs | strategies observed |');
  say('|---|---|---|');
  for (const [arm, runs] of Object.entries(arms)) {
    const listed = [...coverage[arm]].map(([id, n]) => `${id} × ${String(n)}`).join(', ');
    say(`| ${arm} | ${String(runs.length)} | ${listed} |`);
  }
  const counts = Object.values(arms).map((runs) => runs.length);
  const singleStrategy = Object.values(coverage).every((byStrategy) => byStrategy.size === 1);
  const equalCounts = new Set(counts).size === 1;
  gates.push({
    id: 'G4',
    name: 'coverage',
    pass: singleStrategy && equalCounts && counts[0] >= 400,
    detail: `${String(counts[0])} runs per arm, one strategy per arm: ${String(singleStrategy)}`,
  });
  say();

  // G3 — common random numbers, verified pairwise rather than assumed.
  const order = (runs) =>
    [...runs].sort(
      (a, b) =>
        a.coordinates.cellIndex - b.coordinates.cellIndex ||
        a.coordinates.replicateIndex - b.coordinates.replicateIndex,
    );
  const sorted = Object.fromEntries(Object.entries(arms).map(([arm, runs]) => [arm, order(runs)]));
  let mismatches = 0;
  let compared = 0;
  const armNames = Object.keys(sorted);
  for (let a = 0; a < armNames.length; a += 1) {
    for (let b = a + 1; b < armNames.length; b += 1) {
      const left = sorted[armNames[a]];
      const right = sorted[armNames[b]];
      for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
        compared += 1;
        if (left[i].runSeed !== right[i].runSeed) mismatches += 1;
      }
    }
  }
  say(`**G3 — common random numbers.** ${String(mismatches)} seed mismatches across ` +
      `${String(compared)} pairwise coordinates.`);
  gates.push({ id: 'G3', name: 'CRN', pass: mismatches === 0, detail: `${String(mismatches)}/${String(compared)} mismatched` });
  say();

  // G1 — spend parity, measured and never assumed.
  say('**G1 — favor actually spent, by action.** Applied spend only: `coordination` folds a cost');
  say('into its tally after the deduction succeeds, so a masked, unaffordable or refused action');
  say('contributes nothing here.');
  say();
  const spendRows = new Map();
  const armTotals = {};
  for (const [arm, runs] of Object.entries(arms)) {
    const perAction = new Map();
    for (const run of runs) {
      for (const [actionId, amount] of Object.entries(run.godSpendByAction ?? {})) {
        perAction.set(actionId, (perAction.get(actionId) ?? 0) + amount);
      }
    }
    for (const [actionId, total] of perAction) {
      if (!spendRows.has(actionId)) spendRows.set(actionId, {});
      spendRows.get(actionId)[arm] = total / runs.length;
    }
    armTotals[arm] = mean(runs.map(totalSpend));
  }
  say('| action | concentrate | spread | idle |');
  say('|---|---|---|---|');
  for (const actionId of [...spendRows.keys()].sort((a, b) => Number(a) - Number(b))) {
    const row = spendRows.get(actionId);
    const name = ACTION_NAME[Number(actionId)] ?? `action ${actionId}`;
    say(
      `| ${name} (${actionId}) | ${fixed(row.concentrate ?? 0, 0)} | ` +
        `${fixed(row.spread ?? 0, 0)} | ${fixed(row.idle ?? 0, 0)} |`,
    );
  }
  say(
    `| **total** | **${fixed(armTotals.concentrate, 0)}** | **${fixed(armTotals.spread, 0)}** | ` +
      `**${fixed(armTotals.idle, 0)}** |`,
  );
  say();
  say('Mean favor per run.');
  say();

  // The gate is the rate, per the amendment. The total gap is decomposed rather
  // than ruled on, because a shaped result moves ticksRun and a total-based gate
  // would then fail hardest exactly when the finding is real.
  const rateOf = (arm) => mean(arms[arm].map((run) => totalSpend(run) / Math.max(1, run.ticksRun)));
  const rc = rateOf('concentrate');
  const rs = rateOf('spread');
  const rateGap = Math.abs(rc - rs) / Math.max(rc, rs);
  const totalGap =
    Math.abs(armTotals.concentrate - armTotals.spread) /
    Math.max(armTotals.concentrate, armTotals.spread);
  const ticksC = mean(arms.concentrate.map((run) => run.ticksRun));
  const ticksS = mean(arms.spread.map((run) => run.ticksRun));
  say(`Applied favor **per tick run**: concentrate ${fixed(rc, 1)}, spread ${fixed(rs, 1)} — a gap of ` +
      `**${(rateGap * 100).toFixed(2)}%** against a ${String(SPEND_PARITY_TOLERANCE * 100)}% tolerance.`);
  say();
  say(`Raw totals differ by ${(totalGap * 100).toFixed(2)}%, on mean horizons of ` +
      `${fixed(ticksC, 1)} and ${fixed(ticksS, 1)} ticks. Decomposition of that gap:`);
  say();
  const horizonPortion = Math.abs(ticksC - ticksS) * Math.min(rc, rs);
  const rejections = {};
  for (const arm of ['concentrate', 'spread']) {
    rejections[arm] = {};
    for (const run of arms[arm]) {
      for (const [actionId, count] of Object.entries(run.accounting?.byActionId ?? {})) {
        rejections[arm][actionId] = (rejections[arm][actionId] ?? 0) + count;
      }
    }
  }
  const totalRejections = (arm) => Object.values(rejections[arm]).reduce((a, b) => a + b, 0);
  say(`1. **Horizon** — the ticksRun difference at the lower spend rate: ` +
      `${fixed(horizonPortion, 0)} favor. An outcome, not a validity failure.`);
  say(`2. **Design artifact** — gate rejections (an invalid slot index, which is the spreading arm's ` +
      `specific risk): concentrate ${String(totalRejections('concentrate'))}, spread ` +
      `${String(totalRejections('spread'))} across all runs. ` +
      `${JSON.stringify(rejections.spread)} by action id for spread. **This is what invalidates.**`);
  say(`3. **Residual** — affordability divergence on rounds where both arms named a valid slot. ` +
      `Reported as a finding: it would mean allocation moved the economy.`);
  say();
  gates.push({
    id: 'G1',
    name: 'spend parity (rate)',
    pass: rateGap <= SPEND_PARITY_TOLERANCE && totalRejections('spread') === 0 && totalRejections('concentrate') === 0,
    detail: `${(rateGap * 100).toFixed(2)}% rate gap; ${String(totalRejections('spread'))} spread rejections`,
  });
  say();

  // Applied against scheduled — the mechanism G1 exists to catch.
  say('**Applied against scheduled.** The schedule is deterministic in the round number, so what');
  say('each arm *asked* for is computable exactly; what it *bought* is the spend above. The gap');
  say('between them decomposes into two, and the gate rejections reported above are what separate');
  say('them: a **submission the gate refused** — an invalid or out-of-range slot index, the');
  say('spreading arm\'s specific risk — lands in `accounting.byActionId`, while the remainder is a');
  say('**preference the mask never admitted**, which at these prices means the god could not afford');
  say('it. A refusal inside the resolver is the one case neither counter sees: it increments');
  say('`state.illegalActionCount`, which the session does not read.');
  say();
  say('| arm | verb | scheduled | applied | applied share |');
  say('|---|---|---|---|---|');
  for (const [arm, runs] of Object.entries(arms)) {
    if (arm === 'idle') continue;
    const scheduled = { 8: 0, 9: 0, 11: 0, 12: 0 };
    let foundings = 0;
    for (const run of runs) {
      const s = scheduledAttempts(run.ticksRun);
      for (const verb of Object.keys(scheduled)) scheduled[verb] += s.attempts[verb];
      foundings += s.foundings;
    }
    for (const verb of [8, 9, 11, 12]) {
      const spent = runs.reduce((a, run) => a + (run.godSpendByAction?.[String(verb)] ?? 0), 0);
      let applied;
      if (verb === 11) {
        // Two prices on one action id: founding, then advancing. Founding count
        // is fixed by the shared schedule, so the remainder is advances.
        applied = foundings + Math.max(0, spent - foundings * FOUND_UNIVERSITY_COST) / ACTION_COST[11];
      } else {
        applied = spent / ACTION_COST[verb];
      }
      const share = scheduled[verb] === 0 ? Number.NaN : applied / scheduled[verb];
      say(
        `| ${arm} | ${ACTION_NAME[verb]} | ${fixed(scheduled[verb] / runs.length, 1)} | ` +
          `${fixed(applied / runs.length, 1)} | ${fixed(share, 3)} |`,
      );
    }
  }
  say();
  say('Per run. A share below 1.00 is an action the god wanted and did not get. A **fractional**');
  say('fund-university count is the founding-refusal signature, not a rounding artifact: the applied');
  say('count is derived by charging the shared schedule\'s foundings at 10240 and the remainder at');
  say('3072, so a refused founding leaves a residue that is not a whole multiple of the advance cost.');
  say();
  say('Two known-unknowns to check here before attributing any fund gap to allocation.');
  say('`fundUniversityCandidates` ranks *every* university by build progress, completed ones');
  say('included — so if advancing a complete university is a resolver no-op, the spreading arm\'s');
  say('rotation buys less than the concentrating arm\'s slot 1 for a reason that is the candidate');
  say('list\'s and not the strategy\'s. And gate rejections above are the only signal that separates');
  say('an invalid slot from an unaffordable one.');
  say();

  // G2 — identical rulesets, read off the shared permit prefix.
  const permitSpend = (arm) =>
    mean(arms[arm].map((run) =>
      (run.godSpendByAction?.['1'] ?? 0) + (run.godSpendByAction?.['3'] ?? 0)));
  const pc = permitSpend('concentrate');
  const ps = permitSpend('spread');
  const pi = permitSpend('idle');
  say(`**G2 — identical rulesets.** Mean favor on permit actions: concentrate ${fixed(pc, 0)}, ` +
      `spread ${fixed(ps, 0)}, idle ${fixed(pi, 0)}.`);
  gates.push({
    id: 'G2',
    name: 'identical rulesets',
    pass: Math.abs(pc - ps) < 1e-9,
    detail: `permit spend ${fixed(pc, 0)} vs ${fixed(ps, 0)}`,
  });
  say();

  say('| gate | verdict | detail |');
  say('|---|---|---|');
  for (const gate of gates) {
    say(`| ${gate.id} ${gate.name} | ${gate.pass ? '**pass**' : '**FAIL**'} | ${gate.detail} |`);
  }
  const validityHeld = gates.every((gate) => gate.pass);
  say();

  // -------------------------------------------------------------------------
  // Per-arm table.
  // -------------------------------------------------------------------------
  say('## Per-arm table');
  say();
  say('| quantity | concentrate | spread | idle |');
  say('|---|---|---|---|');
  const armValues = {};
  for (const arm of armNames) {
    armValues[arm] = {};
    for (const endpoint of ENDPOINTS) {
      armValues[arm][endpoint.id] = arms[arm]
        .map((run) => endpointsOf(run)[endpoint.id])
        .filter((value) => value !== undefined);
    }
  }
  for (const endpoint of ENDPOINTS) {
    const cells = armNames.map((arm) => {
      const xs = armValues[arm][endpoint.id];
      const se = sampleStdDev(xs) / Math.sqrt(xs.length);
      return `${fixed(mean(xs), 3)} ±${fixed(se, 3)}`;
    });
    say(`| ${endpoint.label} | ${cells.join(' | ')} |`);
  }
  // Route split and grimoires, secondary.
  const routeRow = armNames.map((arm) => {
    const apotheosis = arms[arm].filter((run) => run.terminalReason === 1).length;
    const canon = arms[arm].filter((run) => run.terminalReason === 2).length;
    return `${String(apotheosis)} / ${String(canon)}`;
  });
  say(`| ascension route (apotheosis / canon) | ${routeRow.join(' | ')} |`);
  const ticksRow = armNames.map((arm) => fixed(mean(arms[arm].map((run) => run.ticksRun)), 1));
  say(`| ticks run | ${ticksRow.join(' | ')} |`);
  const grimRow = armNames.map((arm) =>
    fixed(mean(arms[arm].map((run) => metricOf(run, 'referenceGrimoires')).filter((v) => v !== undefined)), 1));
  say(`| grimoires, terminal | ${grimRow.join(' | ')} |`);
  say();

  // -------------------------------------------------------------------------
  // The pre-registered rule, applied to paired deltas.
  // -------------------------------------------------------------------------
  say('## The pre-registered rule, applied');
  say();
  say('Paired by seed: concentrate − spread, per run, on the identical seed. Common random');
  say('numbers pay only if the analysis takes the per-seed delta, not the difference of means.');
  say();
  say('| endpoint | n pairs | Δ (A−B) | 95% CI | floor δ | CI excludes 0 | \\|Δ\\| ≥ floor | verdict |');
  say('|---|---|---|---|---|---|---|---|');

  const verdicts = [];
  for (const endpoint of ENDPOINTS) {
    const deltas = [];
    for (let i = 0; i < sorted.concentrate.length; i += 1) {
      const a = endpointsOf(sorted.concentrate[i])[endpoint.id];
      const b = endpointsOf(sorted.spread[i])[endpoint.id];
      if (a === undefined || b === undefined) continue;
      deltas.push(a - b);
    }
    const stat =
      endpoint.id === 'ascensionRate' ? pairedProportionInterval(deltas) : pairedInterval(deltas);
    const pooled = mean([
      ...armValues.concentrate[endpoint.id],
      ...armValues.spread[endpoint.id],
    ]);
    const floor = endpoint.kind === 'absolute' ? endpoint.floor : endpoint.floor * Math.abs(pooled);
    const excludesZero = stat.low > 0 || stat.high < 0;
    const material = Math.abs(stat.mean) >= floor;
    // Equivalence: the whole interval inside ±floor.
    const equivalent = stat.low > -floor && stat.high < floor;
    const verdict = excludesZero && material ? 'SHAPED' : equivalent ? 'flat' : 'inconclusive';
    verdicts.push({ endpoint, stat, floor, verdict });
    say(
      `| ${endpoint.label} | ${String(stat.n)} | ${fixed(stat.mean, 4)} | [${fixed(stat.low, 4)}, ${fixed(stat.high, 4)}] | ` +
        `${fixed(floor, 4)} | ${excludesZero ? 'yes' : 'no'} | ${material ? 'yes' : 'no'} | ` +
        `**${verdict}** |`,
    );
  }
  say();
  say(`Arms hold ${String(sorted.concentrate.length)} runs each. **Per-endpoint n differs**: a pair`);
  say('is dropped when either side has no value for that endpoint — a failed run, or a run that');
  say('ended before tick 600 and so has no checkpoint reading. The n column is that count.');
  say();

  const anyShaped = verdicts.some((v) => v.verdict === 'SHAPED');
  const allFlat = verdicts.every((v) => v.verdict === 'flat');
  const overall = !validityHeld
    ? 'INVALID — a validity gate failed; this is not a divergence and not a flatness claim'
    : anyShaped
      ? 'SHAPED — at least one endpoint diverges materially'
      : allFlat
        ? 'FLAT — every endpoint is equivalent within its pre-registered margin'
        : 'INCONCLUSIVE — no endpoint diverges materially and not every one is bounded';

  // -------------------------------------------------------------------------
  // Active against idle: the paired comparison that separates explanation 3
  // from explanation 4.
  // -------------------------------------------------------------------------
  say('## Active against idle, paired on the same seeds');
  say();
  say('Explanation 3 (real effects subsumed by the ceiling) predicts the active arms ahead early');
  say('and level at the end. Explanation 4 (verbs have negative side effects) predicts them');
  say('*below* idle at the end. The tick-600 column against the terminal column is what separates');
  say('them, which is why the checkpoint is a primary endpoint and not a convenience.');
  say();
  say('| arm − idle | nodes @144 | nodes @300 | nodes @600 | nodes terminal | ascension rate |');
  say('|---|---|---|---|---|---|');
  for (const arm of ['concentrate', 'spread']) {
    const cells = [];
    for (const tick of [144, 300, 600]) {
      const deltas = [];
      for (let i = 0; i < sorted[arm].length; i += 1) {
        const a = traceAt(sorted[arm][i], tick)?.nodesKnown;
        const b = traceAt(sorted.idle[i], tick)?.nodesKnown;
        if (a === undefined || b === undefined) continue;
        deltas.push(a - b);
      }
      const stat = pairedInterval(deltas);
      cells.push(`${fixed(stat.mean, 2)} ±${fixed(1.96 * stat.se, 2)}`);
    }
    for (const id of ['nodesKnown', 'ascensionRate']) {
      const deltas = [];
      for (let i = 0; i < sorted[arm].length; i += 1) {
        const a = endpointsOf(sorted[arm][i])[id];
        const b = endpointsOf(sorted.idle[i])[id];
        if (a === undefined || b === undefined) continue;
        deltas.push(a - b);
      }
      const stat = pairedInterval(deltas);
      cells.push(`${fixed(stat.mean, 3)} ±${fixed(1.96 * stat.se, 3)}`);
    }
    say(`| ${arm} | ${cells.join(' | ')} |`);
  }
  say();
  say('Mean paired delta ±95% half-width.');
  say();

  // Node trajectory, all three arms.
  say('### Node trajectory');
  say();
  say('| tick | concentrate | spread | idle |');
  say('|---|---|---|---|');
  for (const tick of [144, 300, 600, 900, 1200, 1800, 2400]) {
    const cells = armNames.map((arm) => {
      const xs = arms[arm].map((run) => traceAt(run, tick)?.nodesKnown).filter((v) => v !== undefined);
      return xs.length === 0 ? '—' : `${fixed(mean(xs), 1)} (n=${String(xs.length)})`;
    });
    say(`| ${String(tick)} | ${cells.join(' | ')} |`);
  }
  say();
  say('**`n` falls with tick because a run that ascended has no later reading, and that makes rows');
  say('past tick 600 a comparison between different survivor populations** — each column conditions');
  say('on not having ascended yet, and if the arms ascend at different rates they are conditioning');
  say('differently. Read the trajectory as a shape, not as a test. The two primary endpoints — tick');
  say('600, which every run reaches, and the terminal reading, which every run has — do not have');
  say('this problem, which is the reason they are the primary ones.');
  say();

  // -------------------------------------------------------------------------
  // Correlation, with the support gate applied by hand.
  // -------------------------------------------------------------------------
  say('## Correlation, and why it is not reported as a number');
  say();
  const armRates = armNames.map((arm) => mean(armValues[arm].ascensionRate));
  const armNodes = armNames.map((arm) => mean(armValues[arm].nodesKnown));
  const winners = armNames.filter((arm, i) => armRates[i] > 0).length;
  const p = pearson(armRates, armNodes);
  const s = spearman(armRates, armNodes);
  say(`Arms with a non-zero ascension rate: **${String(winners)}** of ${String(armNames.length)}.`);
  say(`Pearson ${fixed(p, 3)}, Spearman ${fixed(s, 3)}.`);
  say();
  say('The repaired scorer on `w18/instrument-repair` contributes a correlation term only at **≥ 3**');
  say('winners and contributes the *weaker* of the two coefficients. That gate is applied here by');
  say('hand rather than by running the tuner, because this experiment does not tune: three arms give');
  say('a correlation at most three points wide, and a coefficient over three points is a number, not');
  say('a relationship. Reported for completeness and **not used in any verdict**.');
  say();

  // -------------------------------------------------------------------------
  say('## Verdict');
  say();
  say(`**${overall}**`);
  say();

  const text = out.join('\n') + '\n';
  // Written before it is printed: a deliverable that exists only in a pipe is a
  // deliverable that a truncated stdout loses.
  const target = process.argv[3] ?? join(root, 'w27-report.md');
  writeFileSync(target, text);
  console.log(text);
  console.log(`(written to ${target})`);
  return validityHeld ? 0 : 1;
}

process.exit(main());
