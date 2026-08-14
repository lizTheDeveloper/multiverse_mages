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
 *       --seeds 8 --ticks 600 --out ./balance/search/archive.json
 *
 * ## What this does and does not decide
 *
 * It evaluates the scripted pool and the four nulls over **the same seeds**,
 * and folds the results into a behaviour archive whose score is the number of
 * cells that beat doing nothing. It writes an archive and a leaderboard. **It
 * does not commit, and it must not**: baseline conflicts grow quadratically
 * with branches in flight, and a merge on this repository has already caught a
 * compile-level defect that git did not flag because it was not a conflict.
 * The output is evidence.
 *
 * ## What it does not do yet: mutate
 *
 * This is the *evaluation half* of a quality-diversity loop. The archive, the
 * axes, the null ladder and the shape verdict are live; the generator that
 * proposes new preference orders and re-seeds from the archive's elites is
 * not. So the width reported here is the width of the **authored** pool, which
 * is a floor on the meta's width and not a measurement of it. There is no
 * `--rounds` flag, and there is deliberately no dead one: an option that is
 * parsed and ignored reads as a loop that ran.
 *
 * `--search-seed` is live and is the *sweep's* root seed, not a mutation seed.
 * When mutation lands its draws must come from a separate generator, not from
 * the simulation's streams — adding a stream there forces a re-baseline event
 * (`contracts.md` §6), and the search must be free to change how it explores
 * without invalidating every committed measurement.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

async function main() {
  const args = parse(process.argv.slice(2));
  const seeds = Number(args.seeds ?? 8);
  const out = args.out ?? './balance/search/archive.json';
  // The sweep's root seed. `seed.ts` derives every run's seed from it, so this
  // one number fixes the whole evaluation: same flag, same forty-eight worlds.
  const searchSeed = Number(args['search-seed'] ?? 20260813);

  // A tick cap below `ascension-min-tick` measures content, not play.
  //
  // Every cell would report `asc 0/N`, the archive would come back `dead`, and
  // the verdict would read as a finding about the strategies when it is a
  // finding about the flag. This campaign has already published two wrong
  // conclusions from probes that ended before the win condition opened, so the
  // floor is read out of the content that defines it rather than written here
  // as a number that can rot away from it.
  const ascensionMinTick = Number(
    JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../content/data/god-constant.json'),
        'utf8',
      ),
    )
      .find((entry) => entry.id === 'ascension-min-tick').value,
  );
  if (Number(args.ticks ?? 0) < ascensionMinTick) {
    throw new Error(
      `--ticks ${String(args.ticks)} is below ascension-min-tick ${ascensionMinTick}: no run could ` +
        'ascend, so every cell would read `not-worth-playing` for a reason that is not about the ' +
        'strategy. Raise --ticks, or change the constant and say why.',
    );
  }

  const harness = await import('../dist/index.js');
  const { BOT_POOL, NULL_LADDER, foldArchive } = harness;

  const nullIds = new Set(NULL_LADDER.map((entry) => entry.strategyId));
  const seedStrategies = BOT_POOL.filter((entry) => !nullIds.has(entry.strategyId));

  process.stdout.write(`${`[search] pool ${BOT_POOL.length}, nulls ${nullIds.size}, seeds ${seeds}`}\n`);
  process.stdout.write(`${`[search] ladder: ${NULL_LADDER.map((e) => e.strategyId).join(' -> ')}`}\n`);

  // The axes. Every one is an existing metric, and every one is an axis on
  // which two strategies can genuinely be *different* rather than better.
  const axes = [
    { id: 'nodesKnown', edges: [10, 30, 60, 120, 240] },
    { id: 'libraryDepth', edges: [2, 10, 30] },
    // How the run ended, not how well. `terminalReason` distinguishes the
    // routes §1.1 numbers, so two strategies that both ascend by different
    // paths are two ways to play rather than one.
    { id: 'terminalReason', edges: [1, 2, 3, 4] },
    // What the god actually spent favor on, as a share of its spending.
    // A strategy is what it *does*, and this is the only descriptor that reads
    // the verbs rather than their consequences -- two strategies reaching the
    // same nodes by funding versus by permitting are not one way to play.
    { id: 'spendConcentration', edges: [256, 512, 768] },
  ];

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
    // `seeds` runs *per strategy*, not per sweep.
    //
    // Round-robin assignment deals replicates out across the pool, so
    // `replicates: seeds` gives each of twelve strategies fewer than one run
    // and the ladder compares a candidate's single sample against a null's
    // single sample. The first run of this search reported `asc 1/1` against
    // `bar 0` and called it width 1, which is a coin landing heads once.
    replicates: seeds * allStrategies.length,
    agentPool: { strategies: allStrategies, assignment: 'round-robin', slots: 1 },
    termination: { worldTickCap: Number(args.ticks ?? 600), perRunTimeoutMs: 120000 },
    metrics: [
      'referenceNodesKnown',
      'referenceLibraryDepth',
      'referenceGrimoires',
      // Raid metrics are NOT declared here, and the reason is worth recording.
      //
      // Raids resolve by default -- `executor.ts` reads `options.raids ?? true`
      // -- and the sweep registry now accepts `raidLengthDistribution` and
      // `raidInitiationCost`, because REFERENCE_REGISTRIES was extended to
      // carry the eighteen §7 metrics rather than only the ten vital signs.
      //
      // Declaring them still fails every run: "The reference scenario defines
      // no metric raidInitiationCost." The chain is registry -> executor
      // measures -> run record, and only the first link is fixed. The record
      // carries no raid field at all, so a raid cannot reach a descriptor.
      //
      // Restore these two lines the moment the executor defines them.
    ],
    ablation: { mode: 'none', primitives: [] },
    failureThreshold: 0,
  };

  const sweepPath = `${dirname(out)}/search-sweep.json`;
  const recordsPath = `${dirname(out)}/records`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(sweepPath, `${JSON.stringify(sweep, null, 2)}\n`);

  process.stdout.write(`${`[search] evaluating ${allStrategies.length} strategies x ${seeds} replicates`}\n`);
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
        terminal: 0, concentration: 0,
      };
      entry.runs += 1;
      if (record.status === 'ascended') entry.ascended += 1;
      entry.nodes += record.metrics?.referenceNodesKnown?.value ?? 0;
      entry.depth += record.metrics?.referenceLibraryDepth?.value ?? 0;
      entry.illegal += record.accounting?.rejections ?? 0;
      entry.submitted += record.accounting?.submissions ?? 0;
      entry.terminal += record.terminalReason ?? 0;
      // Herfindahl over favor spent by action id, in fp: 1024 means every coin
      // went to one verb, and near zero means it was spread evenly.
      const spend = Object.values(record.godSpendByAction ?? {});
      const total = spend.reduce((sum, value) => sum + value, 0);
      entry.concentration +=
        total <= 0 ? 0 : Math.round(1024 * spend.reduce((sum, v) => sum + (v / total) ** 2, 0));
      byStrategy.set(id, entry);
    }
  }

  const outcomeOf = (entry) => ({
    strategyId: entry.strategyId,
    descriptors: {
      nodesKnown: entry.runs === 0 ? 0 : entry.nodes / entry.runs,
      libraryDepth: entry.runs === 0 ? 0 : entry.depth / entry.runs,
      terminalReason: entry.runs === 0 ? 0 : entry.terminal / entry.runs,
      spendConcentration: entry.runs === 0 ? 0 : entry.concentration / entry.runs,
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

  process.stdout.write(`[search] wrote ${out}\n`);
  process.stdout.write(
    `[search] SHAPE ${archive.shape.toUpperCase()}   width ${archive.width}` +
    `   not-worth-playing ${archive.reachableNotWorthPlaying}` +
    `   margin-over-null ${archive.marginOverNull}\n`,
  );
  // Target is WIDE. `flat` means everything works, which is not balance -- it
  // is an absence of consequence, and it is the state this project started in.
  if (archive.shape === 'flat') {
    process.stdout.write('[search] WARNING: flat -- no wrong answers, so no right ones\n');
  }
  if (archive.shape === 'dead') {
    // `dead` is ambiguous, and the ambiguity is the whole trap. It means either
    // "no strategy beats doing nothing" or "the run ended before anyone could
    // win". The `--ticks` guard above rules out the second only at the hard
    // floor; ascension has been *observed* at 2,400 ticks (elf, 20/100) and not
    // at 600, so a cap between the two can still produce a `dead` archive that
    // is a fact about the horizon. Print the cap beside the verdict so the two
    // readings cannot be confused by anyone who did not run the command.
    process.stdout.write(
      `[search] WARNING: dead -- no cell beat the null ladder at --ticks ${String(args.ticks)}. ` +
        `Zero runs ascended. ascension-min-tick is ${ascensionMinTick} and ascension has been ` +
        'observed at 2400; below that, `dead` is a fact about the horizon and not about the ' +
        'strategies.\n',
    );
  }
  for (const cell of archive.cells) {
    process.stdout.write(
      `  ${cell.status === 'occupied' ? 'OCCUPIED ' : 'not-worth'} ${cell.elite.strategyId.padEnd(22)}` +
      ` asc ${String(cell.elite.ascended).padStart(3)}/${cell.elite.runs}` +
      ` bar ${String(cell.nullBar).padStart(3)}` +
      (cell.failedRung ? ` (lost to rung ${cell.failedRung})` : '') +
      `  ${cell.coordinate}\n`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.stack ?? error)}\n`);
    process.exitCode = 1;
  });
}
