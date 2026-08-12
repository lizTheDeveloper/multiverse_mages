<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W11 — Modal sweep fan-out

**Problem.** Balance measurement is sample-size starved. `ascensionRate`'s §7 band is 0.15 wide;
at 24 runs the 95% interval is 0.400. Defensible sample sizes are hours of laptop wall clock, and
the tuner needs dozens of those. The bottleneck is CPU — ~95% of wall clock is inside the
simulation step — so the fix is horizontal CPU fan-out. No GPU is involved anywhere.

**Deliverable.** Sweeps execute across many Modal containers and produce **byte-identical**
`.runs.ndjson` to the same sweep run locally. Local stays the default and needs no Modal account.

**Explicitly out of scope: RL training infrastructure.** It is blocked upstream — the reward
function rewards idling until eligible and pressing one button, and W6/W7/W8 are fixing the game
first. This workstream builds the measurement fan-out only.

---

## The design, and why it is shaped this way

`runner.ts` already separates *what a run is* from *where it executes*. `buildTasks(spec, plan)`
derives every seed up front from `(rootSeed, sweepId, cellIndex, replicateIndex)` and nothing else;
the pool "decides only which worker runs what"; results come back in a `Map<taskId, PoolResult>`
and are immediately `sortCanonically`'d. So distribution is a third `SweepExecution` mode beside
`workers` and `inline`, and **every** line downstream of dispatch — `recordFor`, `sortCanonically`,
`openSweepOutput`, `aggregateMetrics`, the summary — stays one construction site.

Byte-identity is therefore structural, not a property we test and hope for: the only thing that
changes is which process called the executor.

Partitioning is a pure sharding of the task-id space. `taskId = cellIndex * replicates +
replicateIndex`, and shard membership is a fixed hash-ordered even deal over those ids. Nothing
about a task depends on its shard.

**This paragraph originally said `taskId % shardCount` — a stride — and that turned out to be
wrong for a measurable reason.** It is corrected here rather than deleted, because a plan that hides
what it learned is a plan nobody can check: see §8.1 for the measurement.

- [x] 1.1 Commit this plan.
- [x] 1.2 Read `pool.ts`, `worker-main.ts`, `canonical.ts` non-finite handling. *(done during design)*

## 2. The shard partition — failing test first

- [x] 2.1 `test/unit/shard.test.ts`: a shard partition covers every task id exactly once; shards
      are disjoint; `shardCount = 1` is the identity; out-of-range indices throw.
- [x] 2.2 `src/shard.ts`: `selectShard(tasks, { shardIndex, shardCount })` and
      `assertShardsPartition(...)`. Pure, no I/O.

## 3. The `distributed` execution mode — failing test first

- [x] 3.1 `test/unit/distributed-execution.test.ts`: a sweep run with `mode: 'workers'` and the
      same sweep run with `mode: 'distributed'` over a dispatcher that shards to N local pools
      produce **byte-identical** `.runs.ndjson` and equal `reproducibleSummary`. The performance
      section is excluded, which is `records.ts`'s own rule (task 4.9) and the precedent set by
      `balance/README.md`'s reproducibility checks — not a comparison rule invented here.
- [x] 3.2 `runner.ts`: add `{ mode: 'distributed', dispatch, workerCount }` to `SweepExecution`.
      `dispatch(tasks) => Promise<Map<number, PoolResult>>`. Nothing else in `runSweep` changes.

## 4. Shard worker entry point (remote side)

- [x] 4.1 `bin/run-shard.mjs`: reads a job JSON on stdin (`{ spec, shardIndex, shardCount,
      workerCount }`), expands the sweep, builds **all** tasks, keeps its shard, runs them on a
      local worker pool, writes `{ shardIndex, shardCount, results: [[taskId, PoolResult], ...] }`
      to stdout as `canonicalJson`. Canonical encoding is load-bearing: it throws on `NaN`,
      `Infinity` and `undefined` rather than letting `JSON.stringify` null them, so the wire cannot
      silently produce a different record than the local path would.
- [x] 4.2 The shard never writes results files. Only the head does — `openSweepOutput`'s `wx`
      exclusive create assumes a single writer per execution index.

## 5. The distributed driver (head side)

- [x] 5.1 `bin/run-sweep-distributed.mjs`: same flags as `run-sweep.mjs` plus `--shards` and
      `--backend local|modal`. A separate entry point rather than a flag on `run-sweep.mjs`, so
      "local keeps working with no Modal account" is true by inspection.
- [x] 5.2 `--backend local` spawns `run-shard.mjs` as local child processes. This is the backend
      the test suite uses; it needs no Modal account and proves the sharding itself is neutral.
- [x] 5.3 `--backend modal` spawns the Python bridge as a child process. Modal never enters the
      Node dependency graph.
- [x] 5.4 **Provenance is asserted against the head's scenario module before anything is written.**
      `runSweep` compares records to each other; every shard running the same stale image agrees
      with itself. The head-vs-shard check is what catches a stale image.
- [x] 5.5 **Transport failure aborts; it never fabricates `failed` records.** A worker crash is
      plausibly the run's fault. A container preemption is infra, and writing it as a `failed`
      record would poison baseline-grade data. Retry the shard once, then exit non-zero.

## 6. The Modal app

- [x] 6.1 `tools/modal/sweep_fanout.py`: image from `node:22-bookworm-slim` (`engines` requires
      Node >=22 <23), repo added, `npm ci --omit=dev` for the workspace symlinks — the workspace
      has **zero** third-party runtime dependencies, so that install adds nothing from the network.
- [x] 6.2 Auth comes from the operator's own environment at run time. **No credential, no account
      identifier, no `~/.modal.toml` content appears anywhere in this repository.**
- [x] 6.3 `.starmap` the shard jobs; return each shard's stdout to the head.

## 7. The proof and the numbers

- [x] 7.1 Run a small sweep three ways — local `workers`, distributed/local, distributed/modal —
      and compare `.runs.ndjson` by SHA-256. Report the actual hashes.
- [x] 7.2 Measure throughput per container size on Modal; fetch current Modal pricing at run time.
- [x] 7.3 Cost and wall-clock table for N ∈ {24, 96, 274, 1094} at a few container counts.
- [x] 7.4 `npm run verify` green, verbatim result reported. Exit 0; 261 test files, 3682
      tests, 0 errors; all three balance gates pass with **delta 0.00000 on every metric**.
- [x] 7.5 `docs/` note so the next person can run one without reading the source.

## 8. What measurement changed about the design

- [x] 8.1 The stride partition `taskId % shardCount` **aliased with the round-robin strategy
      assignment**: 384 runs across 48 containers gave every container exactly one of the eight
      strategies, 2160 s of work taking 186 s on 96 cores with one shard at 143 s. Replaced with a
      hash-ordered even deal; same sweep, 138 s, slowest shard 82 s, and the records did not move.
- [x] 8.2 The head dispatched **outside** `runSweep`'s clock at first, so the summary reported
      81,270 runs/s — it was timing the merge. Moved into the dispatch callback.
- [x] 8.3 Fewer, fatter containers win: 24 x 8 beat 96 x 2 at identical total cores (72 s against
      92 s) on a third of the shard time, because the Node boot and content load amortize.
- [x] 8.4 Wall clock is dominated by a 50-90 s container-start floor, so 384 runs cost 72 s and
      1096 runs cost 85 s. Fan-out is worth it above ~2 minutes of local work and roughly free
      after that.

## 9. Reported, not fixed

- [x] 9.1 **`vitest` can emit `Timeout calling "onTaskUpdate"` under load, failing an otherwise
      all-green suite.** Observed once here. It is **not** this branch's: it reproduces with both
      new test files excluded (259 files, 3663 tests, all passing, 1 error) and disappears when
      `packages/scenario/test/unit/reference-long-run.test.ts` runs alone. That file's single test
      blocks a worker for ~146 s, which is longer than vitest's RPC budget for a task update when
      the machine is contended. A clean `npm run verify` on this branch is green, and the base
      commit's suite was also green. Recorded here because a gate that fails for a reason unrelated
      to the code is the kind of thing that gets worked around rather than understood.

## Standing constraints observed

- **Never `npm run goldens:regen`.** A failing golden is a finding to report.
- **No baseline regenerated.** This is an execution path, not a balance change. A moved baseline
  would be a bug in the sharding and is reported as one.
- Nothing added here may leak into `sim-core` or any `rules-*` package; `check:purity` is the gate.
- The simulation reads no clock. The dispatcher may.
