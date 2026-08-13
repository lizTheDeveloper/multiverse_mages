/*
 * Multiverse Mages — W60: does daily relevance change what a god is paid?
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
 * ## The three questions, and the arm that answers each
 *
 * 1. **Does the relevance term move anything?** A content **ablation**:
 *    identical seeds, identical ruleset, `cell.json`'s authored
 *    `dailyRelevance` against a neutral registry in which every cell is
 *    `fp(1024)`. A neutral registry reproduces the pre-change rule exactly —
 *    `mul(m, fp(1024)) === m` — so the "off" side needs no code flag and is not
 *    an approximation of the old behaviour but literally it.
 *
 * 2. **Does worship yield differ between two rulesets that permit equal
 *    *amounts* of magic but different *kinds*?** Equal numbers of **seeded
 *    dispensations** over the shipped v1 rectangle.
 *
 *    The first design here moved the v1 rectangle itself, and the loader was
 *    right to refuse it: `v1-unreachable-prerequisite` requires every
 *    prerequisite of a v1 node to be inside the v1 subset, and the shipped
 *    prerequisite graph is authored around `{intellego, perdo, rego} × {limen,
 *    mentem, nomen, terram}` specifically. So the ruleset is varied the way a
 *    god varies it — by edict (`contracts.md` §1.1, dispensation) — and the
 *    dispensed cells are seeded into the starting position rather than played,
 *    because a *starting position* is exactly what a scenario is allowed to
 *    invent and a bot that had to earn them would confound the ruleset with the
 *    favor it spent getting there.
 *
 *    Every `worship-yield` chain outside v1 is self-contained inside its own
 *    cell — checked, node by node — so one dispensation makes a whole chain
 *    reachable and the arms differ in kind rather than in reachability.
 *
 *    Run under **both** relevance regimes, so the comparison is a difference in
 *    differences. That matters, because the arms do not hold the same
 *    `worship-yield` content — the `daily` triple covers seven carrying nodes,
 *    the `spectacle` triple two — and a raw gap between them would be mostly
 *    that asymmetry. The neutral regime measures the asymmetry; the authored
 *    regime measures the asymmetry plus relevance; the difference is relevance.
 *    The `creo-fatum` / `creo-vim` pair is the tight control for the same
 *    question: one dispensation each, two carrying nodes each, same technique.
 *
 * 3. **What did the missing `permits()` check cost?** Read directly, by the
 *    probe, as `yieldForbidden`: the summed `worship-yield` magnitude held by
 *    nodes that had an instance in a cell the ruleset forbade. That is precisely
 *    the quantity the unfixed rule paid out and the fixed rule does not, and it
 *    is computed outside the rule, so one run prices it.
 *
 * ## Why `passive-control` is not the headline arm
 *
 * The snowball is worship → favor → permits → worship. Passive control seeds
 * zero favor and never spends, so its pool pins to the cap and the loop it is
 * supposed to dampen never runs. It is kept as the **exactness** arm — with no
 * spending, `favorRegenerated` is reconstructed exactly — and the strategies
 * that act carry the snowball reading.
 *
 * ## Usage
 *
 *     node tools/w60/relevance-arms.mjs --replicates 3 --ticks 2400 --out .w60
 *     node tools/w60/relevance-arms.mjs --from .w60/arms.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTENT_FILES, loadContent, memorySource } from '../../packages/content/dist/index.js';
import { referenceContent } from '../../packages/scenario/dist/index.js';

import { FP_ONE, lateWardenPolicy, probeIsInert, runOne } from './favor-probe.mjs';

/** Where the shipped content files live, relative to this file. */
const DATA_DIR = new URL('../../packages/content/data/', import.meta.url);

/** The sweep id every arm shares. Part of the seed; holding it constant is the point. */
const SWEEP_ID = 'w60-daily-relevance-v1';

/** The root seed, matching W15/W46 so these universes are the familiar ones. */
const ROOT_SEED = 20260811;

/**
 * The two starting positions, and their cell indexes in the committed ascension
 * sweep's canonical expansion. Copied from `tools/w15/run-arm.mjs` rather than
 * imported, because that file calls `main()` at module scope.
 */
const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

/**
 * The five rulesets under test, as cells dispensed over the shipped v1
 * rectangle at tick zero.
 *
 * - `v1` — nothing dispensed. The reference universe every committed baseline
 *   was taken on, and the arm that says what the mechanic does to *them*.
 * - `daily` / `spectacle` — three dispensations each. Equal amounts of extra
 *   magic; opposite kinds. Both triples were chosen so that every `worship-yield`
 *   chain they open is self-contained.
 * - `creo-fatum` / `creo-vim` — one dispensation each, and the tight control:
 *   same technique, two carrying nodes apiece, at comparable tiers (2 and 6
 *   against 3 and 5). What is left between them is what the cells are *about*.
 */
const RULESETS = Object.freeze({
  v1: [],
  daily: ['creo-fatum', 'muto-fatum', 'rego-fatum'],
  spectacle: ['creo-vim', 'creo-ignem', 'perdo-terram'],
  'creo-fatum': ['creo-fatum'],
  'creo-vim': ['creo-vim'],
});

/**
 * The round from which the late warden starts interdicting: world year 100,
 * twice `ascension-min-tick`, and the same figure `archivist` uses for "long
 * enough that the thing being argued about exists". By then the dispensed
 * `creo-fatum` chain is established in every arm that got one.
 */
const LATE_WARDEN_NOT_BEFORE = 1200;

/** The shipped content documents, as a mutable object keyed by file name. */
function shippedDocuments() {
  const documents = {};
  for (const fileName of CONTENT_FILES) {
    documents[fileName] = JSON.parse(readFileSync(new URL(fileName, DATA_DIR), 'utf8'));
  }
  return documents;
}

/**
 * A registry under a chosen relevance regime. The v1 rectangle is the shipped
 * one in every arm; only the relevance authoring moves.
 *
 * The `neutral` regime writes `fp(1024)` into every cell, which is the identity
 * of the multiply — so the neutral side is not an approximation of the
 * pre-change rule, it is that rule. If the shipped `cell.json` has no
 * `dailyRelevance` at all — the state of the tree before this change — the
 * write is a no-op, and {@link main} says the two regimes coincided rather than
 * quietly presenting one arm twice.
 */
function registryOf(relevance) {
  const documents = shippedDocuments();
  if (relevance === 'neutral') {
    for (const cell of documents['cell.json']) {
      if (cell.dailyRelevance !== undefined) cell.dailyRelevance = FP_ONE;
    }
  }
  const files = {};
  for (const fileName of CONTENT_FILES) files[fileName] = JSON.stringify(documents[fileName]);
  return loadContent(memorySource(files, `w60-${relevance}`));
}

/** Interned cell ids for a named ruleset, refusing an id the registry lacks. */
function dispensedCellIds(registry, rulesetId) {
  const wanted = RULESETS[rulesetId];
  if (wanted === undefined) throw new Error(`no ruleset "${rulesetId}"`);
  const byName = new Map(registry.cells.map((entry) => [entry.record.id, entry.contentId]));
  return wanted.map((id) => {
    const contentId = byName.get(id);
    if (contentId === undefined) throw new Error(`no cell "${id}" in the registry`);
    return contentId;
  });
}

/** Whether the shipped content carries the field at all. */
function contentHasRelevance() {
  return shippedDocuments()['cell.json'].every((cell) => cell.dailyRelevance !== undefined);
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Per-tick means, so arms that terminated at different ticks stay comparable. */
function perTick(run) {
  const { totals } = run;
  const ticks = Math.max(totals.ticks, 1);
  return {
    favorRegenerated: totals.favorRegenerated / ticks,
    worship: totals.worship / ticks,
    favor: totals.favor / ticks,
    favorCap: totals.favorCap / ticks,
    worshipTier: totals.worshipTier / ticks,
    yieldPermitted: totals.yieldPermitted / ticks,
    yieldForbidden: totals.yieldForbidden / ticks,
    yieldRelevanceWeighted: totals.yieldRelevanceWeighted / ticks,
  };
}

/** A run's key within an arm, so two arms can be paired run-for-run. */
function runKey(run) {
  return `${String(run.coordinates.cellIndex)}:${String(run.coordinates.replicateIndex)}:${run.strategyId}`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.from !== undefined) {
    const loaded = JSON.parse(readFileSync(args.from, 'utf8'));
    report(loaded);
    return;
  }

  const replicates = Number(args.replicates ?? 3);
  const worldTickCap = Number(args.ticks ?? 2400);
  const out = args.out ?? '.w60';
  const strategies = (args.strategies ?? 'passive-control,worship-maximizer,permissive-breadth')
    .split(',')
    .filter(Boolean);
  const rulesets = (args.rulesets ?? 'v1,daily,spectacle,creo-fatum,creo-vim')
    .split(',')
    .filter(Boolean);
  // Both regimes by default. `--regimes authored` exists for the runs taken at
  // commits where `cell.json` has no `dailyRelevance` at all: there the two
  // registries are byte-identical and running both would double the wall clock
  // to produce one arm twice.
  const regimes = (args.regimes ?? 'authored,neutral').split(',').filter(Boolean);

  const fieldPresent = contentHasRelevance();
  mkdirSync(out, { recursive: true });

  const contents = {};
  for (const regime of regimes) contents[regime] = referenceContent(registryOf(regime));

  // The inertness check first, because a probe that moves the universe voids
  // every number below it.
  const inert = probeIsInert(
    contents[regimes[0]],
    'passive-control',
    { rootSeed: ROOT_SEED, sweepId: SWEEP_ID, cellIndex: 0, replicateIndex: 0 },
    240,
    CELLS[0].options,
    [],
  );
  process.stderr.write(`w60 probe inert: ${String(inert.agrees)}\n`);

  const arms = [];
  for (const rulesetId of rulesets) {
    for (const regime of regimes) {
      const dispensations = dispensedCellIds(contents[regime].registry, rulesetId);
      for (const strategyId of strategies) {
        const runs = [];
        const started = Date.now();
        for (const cell of CELLS) {
          for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
            const run = runOne({
              content: contents[regime],
              strategyId,
              coordinates: {
                rootSeed: ROOT_SEED,
                sweepId: SWEEP_ID,
                cellIndex: cell.cellIndex,
                replicateIndex,
              },
              options: cell.options,
              worldTickCap,
              dispensations,
            });
            runs.push(run);
            process.stderr.write(
              `w60 ${rulesetId}/${regime} ${strategyId} cell=${String(cell.cellIndex)} ` +
                `rep=${String(replicateIndex)} ticks=${String(run.ticksRun)} ` +
                `regen/tick=${perTick(run).favorRegenerated.toFixed(1)} ` +
                `forbidden/tick=${perTick(run).yieldForbidden.toFixed(1)}\n`,
            );
          }
        }
        arms.push({
          rulesetId,
          regime,
          strategyId,
          dispensations,
          replicates,
          worldTickCap,
          elapsedMs: Date.now() - started,
          runs,
        });
      }
    }
  }

  // The late warden: `creo-fatum` dispensed at tick zero, then interdicted from
  // world year 100 onward. Nothing in the bot pool produces this sequence, and
  // it is the only sequence in which the missing `permits()` check was ever
  // observable, so it is written rather than hoped for.
  const wardenRuns = [];
  const wardenCell = dispensedCellIds(contents[regimes[0]].registry, 'creo-fatum')[0];
  for (const regime of regimes) {
    for (const cell of CELLS) {
      for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
        const run = runOne({
          content: contents[regime],
          strategyId: 'late-warden',
          coordinates: {
            rootSeed: ROOT_SEED,
            sweepId: SWEEP_ID,
            cellIndex: cell.cellIndex,
            replicateIndex,
          },
          options: cell.options,
          worldTickCap,
          dispensations: [wardenCell],
          policy: lateWardenPolicy(wardenCell, LATE_WARDEN_NOT_BEFORE),
        });
        wardenRuns.push({ ...run, regime });
        process.stderr.write(
          `w60 late-warden/${regime} cell=${String(cell.cellIndex)} ` +
            `rep=${String(replicateIndex)} ticks=${String(run.ticksRun)} ` +
            `regen/tick=${perTick(run).favorRegenerated.toFixed(1)} ` +
            `forbidden/tick=${perTick(run).yieldForbidden.toFixed(1)}\n`,
        );
      }
    }
  }

  const payload = {
    fieldPresent,
    inert,
    rootSeed: ROOT_SEED,
    sweepId: SWEEP_ID,
    arms,
    wardenRuns,
    lateWardenNotBefore: LATE_WARDEN_NOT_BEFORE,
  };
  writeFileSync(join(out, 'arms.json'), `${JSON.stringify(payload)}\n`, 'utf8');
  report(payload);
}

/** Percentage change, with a zero base reported as `n/a` rather than infinity. */
function pct(from, to) {
  if (from === 0) return to === 0 ? '0.0%' : 'n/a (base 0)';
  return `${(((to - from) / from) * 100).toFixed(1)}%`;
}

function report(payload) {
  const { arms, fieldPresent, inert, wardenRuns = [], lateWardenNotBefore = 0 } = payload;
  const lines = [];
  const push = (text) => lines.push(text);

  push('# W60 — daily relevance, paired arms');
  push('');
  push(`Probe inert: **${String(inert.agrees)}**${inert.agrees ? '' : ' — NUMBERS BELOW ARE VOID'}`);
  push(
    `Shipped content carries \`dailyRelevance\`: **${String(fieldPresent)}**` +
      (fieldPresent ? '' : ' — the two regimes are the same registry, so every paired delta must be 0'),
  );
  push('');

  const byArm = new Map();
  for (const arm of arms) byArm.set(`${arm.rulesetId}/${arm.regime}/${arm.strategyId}`, arm);

  push('## Arm summary (per-tick means over the runs of the arm)');
  push('');
  push('| ruleset | regime | strategy | ticks | regen/tick | worship | tier | yield permitted | yield forbidden |');
  push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const arm of arms) {
    const stats = arm.runs.map(perTick);
    push(
      `| ${arm.rulesetId} | ${arm.regime} | ${arm.strategyId} | ` +
        `${mean(arm.runs.map((r) => r.ticksRun)).toFixed(0)} | ` +
        `${mean(stats.map((s) => s.favorRegenerated)).toFixed(1)} | ` +
        `${mean(stats.map((s) => s.worship)).toFixed(1)} | ` +
        `${mean(stats.map((s) => s.worshipTier)).toFixed(2)} | ` +
        `${mean(stats.map((s) => s.yieldPermitted)).toFixed(1)} | ` +
        `${mean(stats.map((s) => s.yieldForbidden)).toFixed(1)} |`,
    );
  }
  push('');

  push('## Q1a — the ablation, paired run for run (authored vs neutral)');
  push('');
  push('| ruleset | strategy | Δ regen/tick | Δ worship | Δ ticks | runs agreeing on sign |');
  push('| --- | --- | ---: | ---: | ---: | ---: |');
  const ablation = new Map();
  for (const arm of arms) {
    if (arm.regime !== 'authored') continue;
    const off = byArm.get(`${arm.rulesetId}/neutral/${arm.strategyId}`);
    if (off === undefined) continue;
    const offByKey = new Map(off.runs.map((run) => [runKey(run), run]));
    const deltas = [];
    for (const run of arm.runs) {
      const other = offByKey.get(runKey(run));
      if (other === undefined) continue;
      const a = perTick(run);
      const b = perTick(other);
      deltas.push({
        regen: a.favorRegenerated - b.favorRegenerated,
        regenBase: b.favorRegenerated,
        worship: a.worship - b.worship,
        ticks: run.ticksRun - other.ticksRun,
      });
    }
    const negative = deltas.filter((d) => d.regen < 0).length;
    const zero = deltas.filter((d) => d.regen === 0).length;
    ablation.set(`${arm.rulesetId}/${arm.strategyId}`, deltas);
    push(
      `| ${arm.rulesetId} | ${arm.strategyId} | ` +
        `${mean(deltas.map((d) => d.regen)).toFixed(2)} ` +
        `(${pct(mean(deltas.map((d) => d.regenBase)), mean(deltas.map((d) => d.regenBase + d.regen)))}) | ` +
        `${mean(deltas.map((d) => d.worship)).toFixed(2)} | ` +
        `${mean(deltas.map((d) => d.ticks)).toFixed(1)} | ` +
        `${String(negative)}−/${String(zero)}0 of ${String(deltas.length)} |`,
    );
  }
  push('');

  push('## Q1b — kind, at equal amount, and the difference in differences');
  push('');
  const PAIRS = [
    ['daily', 'spectacle'],
    ['creo-fatum', 'creo-vim'],
  ];
  push('| pair | strategy | regime | daily-side | spectacle-side | gap | gap % |');
  push('| --- | --- | --- | ---: | ---: | ---: | ---: |');
  const gaps = new Map();
  for (const [high, low] of PAIRS) {
    for (const strategyId of new Set(arms.map((arm) => arm.strategyId))) {
      for (const regime of ['neutral', 'authored']) {
        const highArm = byArm.get(`${high}/${regime}/${strategyId}`);
        const lowArm = byArm.get(`${low}/${regime}/${strategyId}`);
        if (highArm === undefined || lowArm === undefined) continue;
        const d = mean(highArm.runs.map((r) => perTick(r).favorRegenerated));
        const s = mean(lowArm.runs.map((r) => perTick(r).favorRegenerated));
        gaps.set(`${high}|${low}/${strategyId}/${regime}`, d - s);
        push(
          `| ${high} vs ${low} | ${strategyId} | ${regime} | ${d.toFixed(1)} | ${s.toFixed(1)} | ` +
            `${(d - s).toFixed(1)} | ${pct(s, d)} |`,
        );
      }
    }
  }
  push('');
  push('| pair | strategy | gap (neutral) | gap (authored) | difference in differences |');
  push('| --- | --- | ---: | ---: | ---: |');
  for (const [high, low] of PAIRS) {
    for (const strategyId of new Set(arms.map((arm) => arm.strategyId))) {
      const neutral = gaps.get(`${high}|${low}/${strategyId}/neutral`);
      const authored = gaps.get(`${high}|${low}/${strategyId}/authored`);
      if (neutral === undefined || authored === undefined) continue;
      push(
        `| ${high} vs ${low} | ${strategyId} | ${neutral.toFixed(1)} | ${authored.toFixed(1)} | ` +
          `${(authored - neutral).toFixed(1)} |`,
      );
    }
  }
  push('');

  push('## Q3 — what the missing `permits()` check was paying for');
  push('');
  push('| ruleset | regime | strategy | forbidden yield/tick | ticks paying it | share of ticks |');
  push('| --- | --- | --- | ---: | ---: | ---: |');
  for (const arm of arms) {
    const forbidden = mean(arm.runs.map((r) => perTick(r).yieldForbidden));
    const ticksPaying = mean(arm.runs.map((r) => r.totals.ticksWithForbiddenYield));
    const ticks = mean(arm.runs.map((r) => r.totals.ticks));
    if (forbidden === 0 && ticksPaying === 0) continue;
    push(
      `| ${arm.rulesetId} | ${arm.regime} | ${arm.strategyId} | ${forbidden.toFixed(2)} | ` +
        `${ticksPaying.toFixed(0)} | ${((ticksPaying / Math.max(ticks, 1)) * 100).toFixed(1)}% |`,
    );
  }
  push('');

  if (wardenRuns.length > 0) {
    push(
      `## Q3b — the late warden: \`creo-fatum\` dispensed at tick 0, interdicted from round ` +
        `${String(lateWardenNotBefore)}`,
    );
    push('');
    push('| regime | ticks | regen/tick | forbidden yield/tick | ticks paying it | share of ticks |');
    push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const regime of new Set(wardenRuns.map((run) => run.regime))) {
      const runs = wardenRuns.filter((run) => run.regime === regime);
      const ticks = mean(runs.map((r) => r.totals.ticks));
      push(
        `| ${regime} | ${mean(runs.map((r) => r.ticksRun)).toFixed(0)} | ` +
          `${mean(runs.map((r) => perTick(r).favorRegenerated)).toFixed(1)} | ` +
          `${mean(runs.map((r) => perTick(r).yieldForbidden)).toFixed(1)} | ` +
          `${mean(runs.map((r) => r.totals.ticksWithForbiddenYield)).toFixed(0)} | ` +
          `${((mean(runs.map((r) => r.totals.ticksWithForbiddenYield)) / Math.max(ticks, 1)) * 100).toFixed(1)}% |`,
      );
    }
    push('');
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
