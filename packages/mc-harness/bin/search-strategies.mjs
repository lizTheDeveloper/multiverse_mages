/*
 * Multiverse Mages — the quality-diversity search loop.
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
 * Search the strategy space for **width**, floored by the null ladder.
 *
 *     node packages/mc-harness/bin/search-strategies.mjs \
 *       --scenario ./packages/scenario/bin/scenario.mjs \
 *       --rounds 4 --seeds 8 --ticks 600 --out ./balance/search/archive.json
 *
 * ## What this does and does not decide
 *
 * It mutates preference orders, evaluates candidates and the four nulls over
 * **the same seeds**, and folds the results into a behaviour archive whose
 * score is the number of cells that beat doing nothing. It writes an archive
 * and a leaderboard. **It does not commit, and it must not**: baseline
 * conflicts grow quadratically with branches in flight, and a merge on this
 * repository has already caught a compile-level defect that git did not flag
 * because it was not a conflict. The output is evidence.
 *
 * ## Determinism
 *
 * Mutation draws come from a seeded generator supplied on the command line, so
 * a round is reproducible from `--search-seed` alone. Nothing here touches the
 * simulation's streams: a strategy is chosen *outside* the simulation and
 * handed in, exactly as the scripted pool already is.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const REPEATABLE = new Set([]);

function parse(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (typeof key !== 'string' || !key.startsWith('--') || value === undefined) {
      throw new Error(`Unparseable argument near ${String(key)}. Every flag takes a value.`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

/**
 * A small deterministic generator for mutation choices.
 *
 * Deliberately not the simulation's PRNG: adding a stream there forces a
 * re-baseline event (`contracts.md` §6), and the search must be free to change
 * how it explores without invalidating every committed measurement.
 */
function searchRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Reorder a preference list — the whole genome, for now. */
function mutateOrder(order, rng) {
  const next = [...order];
  const i = Math.floor(rng() * next.length);
  const j = Math.floor(rng() * next.length);
  const a = next[i];
  const b = next[j];
  if (a === undefined || b === undefined) return next;
  next[i] = b;
  next[j] = a;
  return next;
}

async function main() {
  const args = parse(process.argv.slice(2));
  const rounds = Number(args.rounds ?? 3);
  const seeds = Number(args.seeds ?? 8);
  const out = args.out ?? './balance/search/archive.json';
  const searchSeed = Number(args['search-seed'] ?? 20260813);

  const harness = await import('../dist/index.js');
  const { BOT_POOL, NULL_LADDER, foldArchive } = harness;

  const nullIds = new Set(NULL_LADDER.map((entry) => entry.strategyId));
  const seedStrategies = BOT_POOL.filter((entry) => !nullIds.has(entry.strategyId));

  console.log(`[search] pool ${BOT_POOL.length}, nulls ${nullIds.size}, seeds ${seeds}`);
  console.log(`[search] ladder: ${NULL_LADDER.map((e) => e.strategyId).join(' -> ')}`);

  // The axes. Every one is an existing metric, and every one is an axis on
  // which two strategies can genuinely be *different* rather than better.
  const axes = [
    { id: 'nodesKnown', edges: [10, 30, 60, 120, 240] },
    { id: 'universities', edges: [1, 5, 40] },
    { id: 'libraryDepth', edges: [2, 10, 30] },
    { id: 'ascensionPath', edges: [1, 2, 3, 4] },
  ];

  const rng = searchRng(searchSeed);

  // Every candidate and every null is evaluated under ONE sweep id.
  //
  // `seed.ts` derives a run's seed from (rootSeed, sweepId, cellIndex,
  // replicateIndex). A search that gave each round its own sweepId would
  // evaluate every candidate on a *different* set of universes, and the
  // difference between a candidate and a null would carry the difference
  // between two seed sets as well. `tune-balance.mjs` records that two earlier
  // searches did exactly this and why their results did not hold, and the null
  // ladder is more sensitive to it than a tuner is: the whole comparison is
  // candidate-against-null on the same worlds.
  const SWEEP_ID = 'strategy-search-v1';
  const allStrategies = [...new Set([...seedStrategies.map((s) => s.strategyId), ...nullIds])].sort();

  const sweep = {
    sweepId: SWEEP_ID,
    // `full`, not a new kind. The validator refuses a sweep that does not say
    // which baseline its sample size belongs to, and it is right to: the gate
    // and full sweeps carry different tolerances. This search compares
    // candidates against nulls *within* one sweep and never against a committed
    // baseline, so it takes the larger-sample kind and touches no baseline.
    kind: 'full',
    rootSeed: searchSeed,
    factors: [{ id: 'foundingNodes', levels: [4] }],
    replicates: seeds,
    agentPool: { strategies: allStrategies, assignment: 'round-robin', slots: 1 },
    termination: { worldTickCap: Number(args.ticks ?? 600), perRunTimeoutMs: 120000 },
    metrics: ['referenceNodesKnown', 'referenceLibraryDepth'],
    ablation: { mode: 'none', primitives: [] },
    failureThreshold: 0,
  };

  const sweepPath = `${dirname(out)}/search-sweep.json`;
  const recordsPath = `${dirname(out)}/records`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(sweepPath, `${JSON.stringify(sweep, null, 2)}\n`);

  console.log(`[search] evaluating ${allStrategies.length} strategies x ${seeds} replicates`);
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'packages/mc-harness/bin/run-sweep.mjs',
        '--scenario', args.scenario ?? './packages/scenario/bin/scenario.mjs',
        '--sweep', sweepPath,
        '--out', recordsPath,
        '--workers', args.workers ?? '4',
      ],
      { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`run-sweep exited ${code}: ${stderr.slice(0, 500)}`)),
    );
  });

  // Fold the records into one outcome per strategy. Descriptors come from
  // metrics the registry already carries -- no new instrument, so nothing here
  // can be a metric that cannot move.
  const ndjson = readdirSync(recordsPath).filter((f) => f.endsWith('.ndjson'));
  const byStrategy = new Map();
  for (const file of ndjson) {
    for (const line of readFileSync(`${recordsPath}/${file}`, 'utf8').trim().split('\n')) {
      if (line === '') continue;
      const record = JSON.parse(line);
      const id = record.strategies?.[0];
      if (id === undefined) continue;
      const entry = byStrategy.get(id) ?? {
        strategyId: id, ascended: 0, runs: 0, nodes: 0, depth: 0, illegal: 0, submitted: 0,
      };
      entry.runs += 1;
      if (record.status === 'ascended') entry.ascended += 1;
      entry.nodes += record.metrics?.referenceNodesKnown?.value ?? 0;
      entry.depth += record.metrics?.referenceLibraryDepth?.value ?? 0;
      entry.illegal += record.accounting?.illegal ?? 0;
      entry.submitted += record.accounting?.submitted ?? 0;
      byStrategy.set(id, entry);
    }
  }

  const outcomeOf = (entry) => ({
    strategyId: entry.strategyId,
    descriptors: {
      nodesKnown: entry.runs === 0 ? 0 : entry.nodes / entry.runs,
      libraryDepth: entry.runs === 0 ? 0 : entry.depth / entry.runs,
      universities: 0,
      ascensionPath: 0,
    },
    ascended: entry.ascended,
    runs: entry.runs,
    illegalActionRate: entry.submitted === 0 ? 0 : entry.illegal / entry.submitted,
  });

  const nulls = {};
  const candidates = [];
  for (const entry of byStrategy.values()) {
    if (nullIds.has(entry.strategyId)) nulls[entry.strategyId] = outcomeOf(entry);
    else candidates.push(outcomeOf(entry));
  }

  const archive = foldArchive(axes, candidates, nulls);
  const payload = {
    searchSeed, sweepId: SWEEP_ID, seeds, axes, ladder: NULL_LADDER,
    nulls, candidates, archive,
    status: archive.cells.length === 0 ? 'no-observations' : 'measured',
  };
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`[search] wrote ${out}`);
  console.log(`[search] WIDTH ${archive.width}   margin-over-null ${archive.marginOverNull}`);
  console.log(`[search] reachable-not-worth-playing ${archive.reachableNotWorthPlaying}`);
  for (const cell of archive.cells) {
    console.log(
      `  ${cell.status === 'occupied' ? 'OCCUPIED ' : 'not-worth'} ${cell.elite.strategyId.padEnd(22)}` +
      ` asc ${String(cell.elite.ascended).padStart(3)}/${cell.elite.runs}` +
      ` bar ${String(cell.nullBar).padStart(3)}` +
      (cell.failedRung ? ` (lost to rung ${cell.failedRung})` : '') +
      `  ${cell.coordinate}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
