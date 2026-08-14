/*
 * Multiverse Mages — W158: the axis-price sweep.
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
 * ## The question
 *
 * W82 (PR #72) found the opening square works and costs nothing: *"going from
 * 1×1 to the whole grid costs 84 favor, once"*. PR #156 then swept the square
 * from 1×2 to 3×4 and found that **four of twelve strategies erase it** —
 * `permit-then-idle` reaches 196 nodes from a two-cell opening against 199 from
 * a twelve-cell one, 1.5% less from a content set seven times smaller.
 *
 * `permit-technique` and `permit-form` are both still `"tuningStatus":
 * "untuned"`. So the obvious next move is to raise the price. The repository's
 * rule is not to pick one: *"every situation where a number should be figured
 * out is a search space."* This tool is the search.
 *
 * ## The design, and the one comparison it exists to make
 *
 * Three factors crossed, on common random numbers throughout:
 *
 * | factor | levels |
 * |---|---|
 * | **price** | `axisPriceScale` in `fp` — `1024` is shipped, `16384` is 16× |
 * | **opening** | `1×2` (narrow) against `3×4` (wide) — #156's discriminating pair |
 * | **strategy** | the pool, or whichever subset `--strategies` names |
 *
 * The number that answers the question is **`wide − narrow` distinct nodes, per
 * price, per strategy**. At the shipped price it is ≈3 for `permit-then-idle`,
 * which is what "the square does not bind" means. A price binds if and only if
 * that gap opens.
 *
 * ## Why the axis masks are recorded and not just the node count
 *
 * Because node count cannot tell the two failure modes apart. A god who never
 * once affords a permit and a god who buys the grid slowly can both finish
 * having reached fewer nodes. `terminal.openAxes` is a popcount of the ruleset
 * masks `permits()` itself reads, so it says which of those happened — and it is
 * the reading that distinguishes *"the price binds"* from *"the price deleted
 * the verb"*. Those are not the same finding and only one of them is useful.
 *
 * `accounting.rejections` is recorded too and is expected to stay near zero: the
 * pool's fall-through submits only what the mask admits, so an unaffordable
 * action shows up as a **substitution**, not a rejection. Recording it makes that
 * checkable rather than assumed.
 *
 * ## Reading the output
 *
 * Every shard writes one NDJSON file plus a manifest naming exactly the files
 * this invocation produced. `analyse.mjs` reads the **manifest**, never a glob:
 * `CLAUDE.md` records five separate instances of an aggregator that found some
 * other run's output and reported it confidently.
 *
 *     node tools/w158/run-arm.mjs --replicates 3 --shards 5 --shard 0 --out .w158
 *     node tools/w158/analyse.mjs --out .w158
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { POOL, content as shippedReferenceContent, runOne } from '../w15/composition.mjs';
import { referenceContent } from '../../packages/scenario/dist/index.js';

/** The sweep id every arm shares. Part of the seed; holding it constant is the point. */
export const SWEEP_ID = 'w158-axis-price-v1';

/** The root seed, matching W15's and W70's so the universes are the familiar ones. */
export const ROOT_SEED = 20260811;

/**
 * The price ladder, in `fp`. `1024` is the shipped price and is the control.
 *
 * **Not a geometric ladder, and the reason is arithmetic done before the sweep
 * was written.** The favor pool is capped at `favor-cap-base` +
 * `favor-cap-per-tier` × tier = 20480 + 10240 × tier, so the ceiling is 71680
 * `fp` — **70 favor** — at the highest of the five worship tiers. A technique
 * permit is 8 favor shipped, so:
 *
 * - at 8× it is 64 favor, affordable **only** at worship tier 5;
 * - at 9× it is 72 favor, which **exceeds the cap at every tier** and makes the
 *   verb structurally unavailable exactly the way `change-tradition` is.
 *
 * So if a window exists in which the price binds without deleting the verb, it
 * is between 4× and 8× and it is narrow. A ladder of 1, 2, 4, 8, 16 would step
 * straight over it and report "no window" without having looked. 16× is kept as
 * the far end: it is the arm that must show the verb *gone*, and it is what makes
 * the difference between binding and deletion visible rather than argued.
 */
export const PRICES = Object.freeze([1024, 2048, 4096, 5120, 6144, 7168, 8192, 16384]);

/**
 * The two openings, and why these two.
 *
 * #156's discriminating pair. `1×2` is two cells and `3×4` is twelve — the size
 * of the v1 rectangle — so the wide arm is today's *size* drawn from the seed
 * rather than authored, which is W70's `seeded-3x4` and the arm that makes the
 * comparison about size rather than about who chose the square.
 */
export const OPENINGS = Object.freeze([
  { id: 'narrow-1x2', options: { openingTechniqueCount: 1, openingFormCount: 2 } },
  { id: 'wide-3x4', options: { openingTechniqueCount: 3, openingFormCount: 4 } },
]);

/**
 * The two starting positions. Identical to W15's and W70's, so within-strategy
 * variance here carries the same seed-and-position noise their diagonals do.
 */
export const CELLS = Object.freeze([
  { cellIndex: 0, options: { cohortSize: 4, foundingNodes: 1 } },
  { cellIndex: 3, options: { cohortSize: 12, foundingNodes: 4 } },
]);

/**
 * Every run this sweep intends, in a fixed order so shards partition cleanly.
 *
 * **Replicate-major**, for W70's reason: an interrupted sweep still holds every
 * price at every opening for as many replicates as it finished, which is a
 * smaller version of this experiment rather than a different one.
 */
export function plan({ replicates, prices, strategies }) {
  const jobs = [];
  for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex += 1) {
    for (const price of prices) {
      for (const opening of OPENINGS) {
        for (const strategyId of strategies) {
          for (const cell of CELLS) {
            jobs.push({ price, opening, strategyId, cell, replicateIndex });
          }
        }
      }
    }
  }
  return jobs;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (typeof key !== 'string' || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

/**
 * Content per price, resolved once per process.
 *
 * Three hundred nodes, a seventy-cell grid and a territory per price rather than
 * per run. The shipped price takes {@link shippedReferenceContent} so that the
 * control arm is resolved by the identical call every earlier tool in this
 * directory makes — a control that went down a different code path would not be
 * one.
 */
function contentForPrice(cache, price) {
  const held = cache.get(price);
  if (held !== undefined) return held;
  const resolved = price === 1024 ? shippedReferenceContent() : referenceContent(undefined, undefined, price);
  const charged = resolved.deps.god.content.costs.byAction[1];
  const expected = price === 1024 ? 8192 : Math.floor((8192 * price) / 1024);
  if (charged !== expected) {
    throw new Error(
      `axisPriceScale ${String(price)} resolved to a permit-technique cost of ${String(charged)}, ` +
        `not the ${String(expected)} it asks for. The factor did not reach the rules path and no ` +
        'number from this run would mean what its record says.',
    );
  }
  cache.set(price, resolved);
  return resolved;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const replicates = Number(args.replicates ?? 3);
  const worldTickCap = Number(args.ticks ?? 2400);
  const shard = Number(args.shard ?? 0);
  const shards = Number(args.shards ?? 1);
  const out = args.out ?? '.w158';
  const prices =
    args.prices === undefined ? PRICES : args.prices.split(',').map((token) => Number(token));
  const strategies = args.strategies === undefined ? POOL : args.strategies.split(',');

  mkdirSync(out, { recursive: true });
  const cache = new Map();

  const jobs = plan({ replicates, prices, strategies }).filter(
    (_job, index) => index % shards === shard,
  );

  const lines = [];
  for (const job of jobs) {
    const resolved = contentForPrice(cache, job.price);
    const started = Date.now();
    const run = runOne({
      content: resolved,
      strategyId: job.strategyId,
      coordinates: {
        sweepId: SWEEP_ID,
        rootSeed: ROOT_SEED,
        cellIndex: job.cell.cellIndex,
        replicateIndex: job.replicateIndex,
      },
      options: { ...job.cell.options, ...job.opening.options },
      worldTickCap,
    });
    lines.push(
      JSON.stringify({
        sweepId: SWEEP_ID,
        price: job.price,
        opening: job.opening.id,
        strategyId: job.strategyId,
        cellIndex: job.cell.cellIndex,
        replicateIndex: job.replicateIndex,
        worldTickCap,
        permitTechniqueCost: resolved.deps.god.content.costs.byAction[1],
        permitFormCost: resolved.deps.god.content.costs.byAction[3],
        status: run.status,
        terminalReason: run.terminalReason,
        ticksRun: run.ticksRun,
        snapshotHash: run.snapshotHash,
        distinctNodes: run.terminal.nodeIds.length,
        instances: run.terminal.counts.reduce((sum, count) => sum + count, 0),
        openTechniques: run.terminal.openAxes.techniques,
        openForms: run.terminal.openAxes.forms,
        submissions: run.accounting.submissions,
        rejections: run.accounting.rejections,
        elapsedMs: Date.now() - started,
      }),
    );
    process.stderr.write(
      `${job.strategyId} price=${String(job.price)} ${job.opening.id} cell=${String(job.cell.cellIndex)} ` +
        `r=${String(job.replicateIndex)} nodes=${String(run.terminal.nodeIds.length)} ` +
        `axes=${String(run.terminal.openAxes.techniques)}x${String(run.terminal.openAxes.forms)}\n`,
    );
  }

  const file = `shard-${String(shard)}-of-${String(shards)}.ndjson`;
  writeFileSync(join(out, file), `${lines.join('\n')}\n`, 'utf8');
  writeFileSync(
    join(out, `${file}.manifest.json`),
    `${JSON.stringify(
      {
        sweepId: SWEEP_ID,
        rootSeed: ROOT_SEED,
        file,
        shard,
        shards,
        replicates,
        worldTickCap,
        prices,
        strategies,
        openings: OPENINGS.map((opening) => opening.id),
        cells: CELLS.map((cell) => cell.cellIndex),
        runs: lines.length,
      },
      undefined,
      2,
    )}\n`,
    'utf8',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
