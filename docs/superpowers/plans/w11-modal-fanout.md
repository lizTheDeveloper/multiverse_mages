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
replicateIndex`, and shard membership is `taskId % shardCount === shardIndex` — stride rather than
block, so cells of unequal cost spread evenly. Nothing about a task depends on its shard.

- [ ] 1.1 Commit this plan.
- [ ] 1.2 Read `pool.ts`, `worker-main.ts`, `canonical.ts` non-finite handling. *(done during design)*

## 2. The shard partition — failing test first

- [ ] 2.1 `test/unit/shard.test.ts`: a shard partition covers every task id exactly once; shards
      are disjoint; `shardCount = 1` is the identity; out-of-range indices throw.
- [ ] 2.2 `src/shard.ts`: `selectShard(tasks, { shardIndex, shardCount })` and
      `assertShardsPartition(...)`. Pure, no I/O.

## 3. The `distributed` execution mode — failing test first

- [ ] 3.1 `test/unit/distributed-execution.test.ts`: a sweep run with `mode: 'workers'` and the
      same sweep run with `mode: 'distributed'` over a dispatcher that shards to N local pools
      produce **byte-identical** `.runs.ndjson` and equal `reproducibleSummary`. The performance
      section is excluded, which is `records.ts`'s own rule (task 4.9) and the precedent set by
      `balance/README.md`'s reproducibility checks — not a comparison rule invented here.
- [ ] 3.2 `runner.ts`: add `{ mode: 'distributed', dispatch, workerCount }` to `SweepExecution`.
      `dispatch(tasks) => Promise<Map<number, PoolResult>>`. Nothing else in `runSweep` changes.

## 4. Shard worker entry point (remote side)

- [ ] 4.1 `bin/run-shard.mjs`: reads a job JSON on stdin (`{ spec, shardIndex, shardCount,
      workerCount }`), expands the sweep, builds **all** tasks, keeps its shard, runs them on a
      local worker pool, writes `{ shardIndex, shardCount, results: [[taskId, PoolResult], ...] }`
      to stdout as `canonicalJson`. Canonical encoding is load-bearing: it throws on `NaN`,
      `Infinity` and `undefined` rather than letting `JSON.stringify` null them, so the wire cannot
      silently produce a different record than the local path would.
- [ ] 4.2 The shard never writes results files. Only the head does — `openSweepOutput`'s `wx`
      exclusive create assumes a single writer per execution index.

## 5. The distributed driver (head side)

- [ ] 5.1 `bin/run-sweep-distributed.mjs`: same flags as `run-sweep.mjs` plus `--shards` and
      `--backend local|modal`. A separate entry point rather than a flag on `run-sweep.mjs`, so
      "local keeps working with no Modal account" is true by inspection.
- [ ] 5.2 `--backend local` spawns `run-shard.mjs` as local child processes. This is the backend
      the test suite uses; it needs no Modal account and proves the sharding itself is neutral.
- [ ] 5.3 `--backend modal` spawns the Python bridge as a child process. Modal never enters the
      Node dependency graph.
- [ ] 5.4 **Provenance is asserted against the head's scenario module before anything is written.**
      `runSweep` compares records to each other; every shard running the same stale image agrees
      with itself. The head-vs-shard check is what catches a stale image.
- [ ] 5.5 **Transport failure aborts; it never fabricates `failed` records.** A worker crash is
      plausibly the run's fault. A container preemption is infra, and writing it as a `failed`
      record would poison baseline-grade data. Retry the shard once, then exit non-zero.

## 6. The Modal app

- [ ] 6.1 `tools/modal/sweep_fanout.py`: image from `node:22-bookworm-slim` (`engines` requires
      Node >=22 <23), repo added, `npm ci --omit=dev` for the workspace symlinks — the workspace
      has **zero** third-party runtime dependencies, so that install adds nothing from the network.
- [ ] 6.2 Auth comes from the operator's own environment at run time. **No credential, no account
      identifier, no `~/.modal.toml` content appears anywhere in this repository.**
- [ ] 6.3 `.starmap` the shard jobs; return each shard's stdout to the head.

## 7. The proof and the numbers

- [ ] 7.1 Run a small sweep three ways — local `workers`, distributed/local, distributed/modal —
      and compare `.runs.ndjson` by SHA-256. Report the actual hashes.
- [ ] 7.2 Measure throughput per container size on Modal; fetch current Modal pricing at run time.
- [ ] 7.3 Cost and wall-clock table for N ∈ {24, 96, 274, 1094} at a few container counts.
- [ ] 7.4 `npm run verify` green, verbatim result reported.
- [ ] 7.5 `docs/` note so the next person can run one without reading the source.

## Standing constraints observed

- **Never `npm run goldens:regen`.** A failing golden is a finding to report.
- **No baseline regenerated.** This is an execution path, not a balance change. A moved baseline
  would be a bug in the sharding and is reported as one.
- Nothing added here may leak into `sim-core` or any `rules-*` package; `check:purity` is the gate.
- The simulation reads no clock. The dispatcher may.
