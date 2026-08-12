<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Running a sweep on many machines

`balance/README.md` says what the sweeps measure. This says how to run one somewhere other than a
laptop, and what it costs.

**Local is still the default and always will be.** `packages/mc-harness/bin/run-sweep.mjs` is
unchanged, needs no account anywhere, and is what `npm run verify` and both CI systems use. What
follows is a second entry point, opt-in, for the case the balance work actually has: sample sizes
that a laptop cannot afford.

## Why this exists, in numbers

`contracts.md` §7's band for `ascensionRate` is 0.05–0.20 — 0.15 wide. Measured on the author's
machine, the eight-strategy 2400-tick sweep runs 96 runs in 134 seconds on twelve workers, and:

| runs | SE at p=0.125 | SE at p=0.5 | 95% CI width at p=0.5 | wall clock, 12 local workers |
|---|---|---|---|---|
| 24 | 0.0675 | 0.1021 | 0.400 | 33 s |
| 96 | 0.0338 | 0.0510 | 0.200 | 134 s (measured) |
| 274 | 0.0203 | 0.0302 | 0.118 | ~6 min |
| 1096 | 0.0101 | 0.0151 | 0.059 | ~25 min |

At 24 runs the interval is nearly three times the band it is supposed to sit inside. The tuner
evaluates one such sweep per trial and needs dozens of trials, so a defensible search is hours.

The bottleneck is CPU — about 95% of wall clock is inside the simulation step — and the simulation
is dependency-free deterministic TypeScript. **So the answer is horizontal CPU, and no part of this
wants a GPU.** Nothing here is RL training infrastructure; that is blocked on the game having a
reward worth training against.

## The one property that makes it trustworthy

A sweep executed on Modal produces **byte-identical** `.runs.ndjson` to the same sweep executed
locally. Not the same numbers to a tolerance — the same file.

That is structural rather than lucky. `seed.ts` derives a run's seed from `(rootSeed, sweepId,
cellIndex, replicateIndex)` and from nothing else, so partitioning is a pure sharding of that
coordinate space: a container is handed a *subset of task ids*, rebuilds the tasks with the same
`buildTasks` a local sweep calls, and cannot express an opinion about what its runs are. Everything
after dispatch — `recordFor`, `sortCanonically`, `openSweepOutput`, `aggregateMetrics`, the summary
— is the same code the local path runs, because distribution is a third `SweepExecution` mode
beside `workers` and `inline` rather than a second pipeline.

Measured, on the 2400-tick eight-strategy sweep at 96 runs — this ARM laptop on twelve worker
threads, against twenty-four x86 Linux containers:

    .runs.ndjson         490c029445b1e6c7ebd0bd60a64b5be0ef6a683b1657c579a767ba88c163b2b5   both
    summary minus perf   ceb8f95020578b0ebce3a41bab77d1263bb3da5e005184817e9f9f1de75ac4d8   both

The performance section differs, and `records.ts` says in as many words that it is excluded from
every reproducibility comparison. That exclusion is the repository's own rule, not one invented
here.

The 384-run version of the same sweep was run under **five** different topologies — 24, 48 and 96
containers, at two and eight cores each, under two different partition functions — and produced one
hash, `9f486f37aedda672204653fa2cc841a183d02f85fb9f5b0a59506d0fcf063b87`, every time.

## Running one

    node packages/mc-harness/bin/run-sweep-distributed.mjs \
      --scenario          ./packages/scenario/bin/scenario.mjs \
      --sweep             ./balance/sweeps/balance-gate-ascension.sweep.json \
      --out               ./balance/results \
      --shards            64 \
      --workers-per-shard 8 \
      --backend           modal \
      --modal-cpu         8

`--backend local` runs the same shards as child processes on this machine. It needs no account
anywhere and it is what the test suite exercises, which is how the partition stays checkable inside
`npm run verify`.

Prerequisites for `--backend modal`:

- `npm run typecheck` first. The containers run the `packages/*/dist` from this checkout rather than
  rebuilding, so that they execute the same bytes the head does. A stale `dist/` reproduces
  perfectly and is still wrong, which is why the head asserts every record's provenance against its
  own scenario module before it writes anything.
- The `modal` Python client, and your own Modal credentials. **Nothing about authentication is in
  this repository.** The client reads your `~/.modal.toml` or `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET`
  at run time, exactly as the `modal` CLI does. If you have none, `modal token new`.

`modal` is Apache-2.0 — AGPL-compatible, per `CLAUDE.md`. It is **tool-side**: imported by
`tools/modal/sweep_fanout.py` and by nothing else, absent from every `package.json`, and not a
runtime dependency of anything the simulation loads. `check:purity` is unaffected and the core
keeps its zero runtime dependencies.

## What it costs

Measured 2026-08-11, on the 2400-tick eight-strategy sweep. Modal's published CPU price on that
date is **$0.0000131 per core-second** ($0.047 per core-hour); memory at $0.00000222/GiB/s is
noise at this scale and is folded into the figures below as an overestimate.

"Billed" is an upper bound: wall clock × containers × cores, which charges for the image pull and
the Node boot as well as the simulation. "Shard time" is the simulation alone, summed across
containers, and is what the work would cost with no startup at all.

| where | runs | containers × cores | wall clock | shard time | billed ≤ | cost ≤ |
|---|---|---|---|---|---|---|
| this laptop | 96 | 12 workers | **134 s** | — | — | — |
| Modal | 96 | 24 × 2 | **70 s** | 622 s | 3,345 core-s | **$0.04** |
| Modal | 384 | 24 × 2 | 139 s | 1,949 s | 6,653 core-s | $0.09 |
| Modal | 384 | 48 × 2 | 138 s | 2,254 s | 13,227 core-s | $0.17 |
| Modal | 384 | 96 × 2 | 92 s | 2,393 s | 17,587 core-s | $0.23 |
| Modal | 384 | 24 × 8 | **72 s** | 909 s | 13,843 core-s | $0.18 |
| Modal | 1096 | 64 × 8 | **85 s** | 2,463 s | 43,346 core-s | **$0.57** |

Three things a reader should take from that table, because two of them are counter-intuitive.

**The cost per run is nearly constant and small.** Every configuration lands within a factor of two
of **18 core-seconds per run**, which agrees with the laptop's 16.7 — the containers are slightly
slower per core and pay a Node boot the laptop pays once. So the *marginal* price of a run is about
$0.00024, and the whole 1096-run sweep costs less than a cup of coffee. Sample size is no longer
the expensive thing.

**More containers is not more speed.** 24 × 2 and 48 × 2 both took 138 s on the same work: doubling
the cores bought nothing, because 50–90 s of every fan-out is containers starting, and starting
twice as many takes longer. Wall clock is dominated by a fixed startup, not by N.

**Fewer, fatter containers win.** 24 × 8 beat 96 × 2 — 72 s against 92 s — at identical total cores,
and used *a third* of the shard time (909 s against 2,393 s), because each container pays the Node
boot and content load once and then amortizes it across eight workers. **Prefer 8-core containers.**

The practical consequence: **fan-out is worth it above about two minutes of local work and roughly
free thereafter.** 384 runs cost 72 s and 1096 runs cost 85 s. The largest sweep this makes
defensible is bounded by patience with the startup, not by the runs — a 1096-run sweep, which is
25 minutes locally and gives `ascensionRate` a 95% interval of 0.059 against a band of 0.15, is 85
seconds and $0.57.

## How the work is divided, and the mistake that was measured

Shards are chosen by task id — `taskId = cellIndex * replicates + replicateIndex` — by ordering the
ids under `fnv1a32` of their decimal text and dealing that order round-robin. The deal keeps shards
within one task of each other; the hash keeps the order transverse to periodic structure in the id.

The obvious partition, `taskId % shardCount`, was tried first and is worse than it looks.
`assignStrategies` gives run `strategies[replicateIndex % poolSize]`, so when `shardCount` is a
multiple of the pool size and `replicates` is a multiple of `shardCount`, **every task in a shard
shares its strategy**. Measured on 384 runs across 48 containers: each container drew exactly one of
the eight strategies, shard times ran from seconds to 143, and 2,160 s of work took 186 s of wall
clock on 96 cores. A strategy that ascends at tick 700 costs a third of one that runs to the cap, so
the partition had quietly sorted the runs by cost. The same sweep after the fix: 138 s, slowest
shard 82 s. The records did not move — which is the point, because the head sorts canonically before
anything is folded.

## What it refuses to do

- **A shard that does not come back is an error, not a page of `failed` records.** `runner.ts` is
  right to record a dead *worker* as a failed run — the run was dispatched and something about it
  went wrong. A preempted *container* is infrastructure, says nothing about any universe, and
  recording it as an outcome would put transport noise into baseline-grade data invisibly, because
  the record count would still add up. Modal retries a shard once; after that the head exits
  non-zero having written nothing.
- **A fleet running a different build is refused.** `runSweep` compares records to each other, which
  a hundred containers unanimously running a stale image pass. The head therefore checks every
  record's provenance against its own scenario module, before `openSweepOutput` is reached.
- **Non-finite numbers do not cross the wire as `null`.** Shard answers are encoded with
  `canonicalJson`, which throws on `NaN`, `±Infinity` and `bigint`, rather than `JSON.stringify`,
  which renders the first two as `null` — and a `null` read back is indistinguishable from a metric
  that was never measured.
- **Nothing here regenerates a baseline or a golden fixture.** This is an execution path. If a
  baseline appears to move, that is a bug in the sharding and it should be reported as one.
