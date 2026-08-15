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
 * ## `--opening TxF`
 *
 * The opening square every run in the archive is founded on, e.g. `--opening
 * 2x3`. Absent is the v1 rectangle — today's universe — so an invocation
 * written before this flag existed evaluates exactly what it always did.
 *
 * **It is part of `runId`**, and that is not cosmetic: the records directory is
 * named for the whole experiment and the run refuses to add to one that already
 * holds records. Two squares at one `--search-seed`, `--seeds` and `--ticks`
 * would otherwise resolve to the same directory, and the second arm would stop
 * rather than answer — or worse, on a tool that folded instead of refusing,
 * silently mix two squares into one archive.
 *
 * `--search-seed` is live and is the *sweep's* root seed, not a mutation seed.
 * When mutation lands its draws must come from a separate generator, not from
 * the simulation's streams — adding a stream there forces a re-baseline event
 * (`contracts.md` §6), and the search must be free to change how it explores
 * without invalidating every committed measurement.
 */

import { execFileSync, spawn } from 'node:child_process';
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

  // The opening square, as factor levels. **One level each**, deliberately: a
  // factor with two levels takes two cells, and `seed.ts` derives a run's seed
  // from its cell index, so a two-level square factor would compare two squares
  // *and* two sets of universes. One arm per invocation at a fixed
  // `--search-seed` holds the universes common across arms.
  const openingFactors = (() => {
    if (args.opening === undefined) return [];
    const match = /^(\d+)x(\d+)$/.exec(String(args.opening).trim());
    if (match === null) {
      throw new Error(`--opening must look like 2x3, received ${String(args.opening)}`);
    }
    return [
      { id: 'openingTechniqueCount', levels: [Number(match[1])] },
      { id: 'openingFormCount', levels: [Number(match[2])] },
    ];
  })();

  const harness = await import('../dist/index.js');
  const { BOT_POOL, MAX_ELITE_ILLEGAL_RATE, NULL_LADDER, foldArchive } = harness;

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
    factors: [{ id: 'foundingNodes', levels: [4] }, ...openingFactors],
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

  // The records directory is per-invocation, and the run refuses to reuse one.
  //
  // It used to be a flat `records/` beside the archive, and the fold reads
  // **every** `.ndjson` in it. Two runs into the same output directory
  // therefore folded the earlier run's records into the later one's archive,
  // silently and with no warning — a `--seeds 8` run reported `runs=12` per
  // strategy because it had eaten the `--seeds 4` run that preceded it, at a
  // different `--ticks`. Every descriptor and every ascension rate in that
  // archive was a mixture of two horizons.
  //
  // Nothing failed. The archive was well-formed, the numbers were plausible,
  // and the only symptom was a denominator that did not match the flag. So the
  // directory is named for the whole experiment and the run stops rather than
  // adding to a directory that already holds records.
  const runId =
    `${SWEEP_ID}-seed${searchSeed}-n${seeds}-t${String(args.ticks)}` +
    `-o${args.opening === undefined ? 'v1' : String(args.opening)}`;
  const recordsPath = `${dirname(out)}/records/${runId}`;
  mkdirSync(recordsPath, { recursive: true });
  const stale = readdirSync(recordsPath).filter((file) => file.endsWith('.ndjson'));
  if (stale.length > 0) {
    throw new Error(
      `${recordsPath} already holds ${String(stale.length)} record file(s) from an earlier run ` +
        'with these exact parameters. Folding them in would mix two runs into one archive. ' +
        'Remove the directory to re-run, or change --out.',
    );
  }
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

    // Kill the sweep when this process is killed.
    //
    // Without this, `kill` on the search leaves `run-sweep.mjs` running with
    // its own worker pool. Observed: a sweep kept four workers busy for
    // eighteen minutes after its parent died, writing into a records directory
    // nothing would ever read, on a machine already at eighteen times
    // oversubscription. Nothing reported it — the search was gone, so there was
    // nobody left to notice.
    //
    // `tune-balance.mjs` has the same shape for restoring a constants file.
    const onSignal = (signal) => {
      child.kill(signal);
      process.exit(130);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      return code === 0
        ? resolve()
        : reject(new Error(`run-sweep exited ${code}: ${stderr.slice(0, 500)}`));
    });
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
    searchSeed, sweepId: SWEEP_ID, runId, ticks: Number(args.ticks), seeds, axes, ladder: NULL_LADDER,
    provenance: measuredRef(),
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
    // floor, and caps well above the floor have still produced archives where
    // nothing ascended. So print the cap and the ascension count beside the
    // verdict, and let the reader compare them.
    //
    // Deliberately no reference horizon here. The obvious thing to write is
    // "ascension has been observed at N ticks", and that is a measurement of a
    // build — it rots the moment the grid or the goals change, and it would rot
    // inside the one file that reads `ascension-min-tick` out of content
    // precisely so a number could not drift from its source.
    process.stdout.write(
      `[search] WARNING: dead -- no cell beat the null ladder at --ticks ${String(args.ticks)}, ` +
        `and zero runs ascended (ascension-min-tick is ${ascensionMinTick}). A horizon too short ` +
        'for the win condition produces this verdict for a reason that is not about the ' +
        'strategies; re-run longer before reading it as one.\n',
    );
  }
  // A cell can fail to be occupied for two unrelated reasons, and printing them
  // the same way is the failure this repo has documented five times: folding
  // "the probe is broken" into "the answer is no". `clearsLadder` already
  // separates them -- an elite over `MAX_ELITE_ILLEGAL_RATE` is refused -- and
  // then reuses `failedRung` to say so, which prints as `(lost to rung N)`. That
  // sentence means *this strategy is weaker than doing nothing*. Exclusion means
  // *this strategy was never allowed to play*, and reading the first for the
  // second retires a real defect as a balance result.
  //
  // The label says EXCLUDED and not MASK-BUG deliberately, even though
  // `MAX_ELITE_ILLEGAL_RATE`'s own comment says "above this it is a mask bug".
  // What is *measured* here is a rejection rate; which component is wrong is a
  // second question this report cannot answer, and there are at least two live
  // readings. `strategies.ts`'s `noise-floor-submits-axis-actions-bare` records
  // that a missing-parameter refusal lands on the core's `illegalActionCount`
  // and **not** on the session counters `illegalActionRate` is collected from,
  // which would make a session-counted rejection a genuine mask disagreement.
  // But `session.ts` warns that an unresolvable slot index is "recorded as an
  // ordinary illegal action, hiding the bug", which would make it target-level
  // and the mask innocent. Naming the culprit in the output would be the same
  // misreport this block exists to fix, one layer over.
  //
  // Recomputed here from `elite.illegalActionRate` rather than plumbed through a
  // new status, so this is display-only and cannot move a baseline. The archive
  // JSON already carries the rate, so an analyser can make the same distinction.
  const excluded = [];
  for (const cell of archive.cells) {
    const masked = cell.status !== 'occupied' && cell.elite.illegalActionRate > MAX_ELITE_ILLEGAL_RATE;
    if (masked) excluded.push(cell.elite);
    process.stdout.write(
      `  ${cell.status === 'occupied' ? 'OCCUPIED ' : masked ? 'EXCLUDED ' : 'not-worth'} ` +
      `${cell.elite.strategyId.padEnd(22)}` +
      ` asc ${String(cell.elite.ascended).padStart(3)}/${cell.elite.runs}` +
      ` bar ${String(cell.nullBar).padStart(3)}` +
      (masked
        ? ` (illegal ${(cell.elite.illegalActionRate * 100).toFixed(1)}% > ${String(MAX_ELITE_ILLEGAL_RATE * 100)}% -- excluded, not beaten)`
        : cell.failedRung
          ? ` (lost to rung ${cell.failedRung})`
          : '') +
      `  ${cell.coordinate}\n`,
    );
  }
  // Loud, and last, because it is a defect report rather than a result. A strategy
  // that cannot submit a legal action is not evidence about balance in either
  // direction, and a sweep containing one has a smaller effective pool than its
  // own header claims.
  for (const elite of excluded) {
    process.stdout.write(
      `[search] WARNING: excluded -- ${elite.strategyId} was rejected on ` +
        `${(elite.illegalActionRate * 100).toFixed(1)}% of its submissions, over the ` +
        `${String(MAX_ELITE_ILLEGAL_RATE * 100)}% ceiling, so it could not hold a cell. It is absent ` +
        'from the archive for a reason that is not about its play, and this sweep measured a ' +
        'smaller pool than its header claims. Whether the mask, the slot resolution or the ' +
        "strategy's own preferences are at fault is not decided here -- diagnose before reading " +
        "this sweep's width.\n",
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.stack ?? error)}\n`);
    process.exitCode = 1;
  });
}

/**
 * The ref this archive is a measurement **of**.
 *
 * `scripts/build-design-dashboard.mjs` argues at length against exactly this —
 * no clock, no `git rev-parse` — and that argument is right *there* and wrong
 * *here*, for one reason. The dashboard payload is a **pure function of the
 * repository contents**, byte-checked by `check:generated`; stamping it would
 * make CI's dashboard differ from yours, and the tree is already its own
 * provenance. A search archive is not a function of the tree. It is a
 * measurement of how the simulation **behaved**, and the same command run on
 * two commits produces two different archives that are both correct. Without
 * the ref there is no way to say which world a result describes.
 *
 * That is not hypothetical. `smoke-600.json` reported `shape: dead` —
 * "nothing beats doing nothing" — with no commit, branch or date in it. It was
 * read a day later as evidence about the *wired* game when it had been measured
 * on the unwired one, which inverts the causal claim it was being used to
 * support. See `docs/design/campaign-plan.md` W232.
 *
 * Everything here is best-effort and never throws: a tarball, a shallow CI
 * checkout, or no `git` at all yields `unknown` rather than failing a sweep that
 * has already done the expensive part. `dirty` is the load-bearing field — a
 * measurement taken on uncommitted edits is not reproducible from the ref alone,
 * and silently reporting the base commit for a dirty tree would be a worse lie
 * than reporting nothing.
 */
/**
 * `status --porcelain` rather than `diff --quiet` because the question is
 * whether this archive is reproducible from `commit` alone, and an untracked
 * content file changes the answer exactly as much as a modified one — `diff`
 * does not see untracked files at all. Errors report `unknown`, never `false`:
 * "I could not tell" and "the tree is clean" must not collapse into each other,
 * which is the checker-that-answers-about-the-wrong-input shape CLAUDE.md names.
 */
function isDirty() {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch {
    return 'unknown';
  }
}

function measuredRef() {
  const git = (cmd) => {
    try {
      return execFileSync('git', cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  const commit = git(['rev-parse', 'HEAD']);
  if (!commit) return { commit: 'unknown', branch: 'unknown', dirty: 'unknown' };
  return {
    commit,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown',
    dirty: isDirty(),
  };
}
