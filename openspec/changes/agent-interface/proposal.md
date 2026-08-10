## Why

Releases 0.1.0 through 0.4.0 can only make mechanical claims — determinism, correctness,
enforcement — because nothing yet *measures* the game. `docs/design/release-plan.md` names 0.5.0
"the measurement pivot" for exactly that reason: until a Monte Carlo harness exists, every
statement about whether Multiverse Mages is balanced is unverifiable, and an unverifiable claim is
worse than none because it feels like rigour.

This change builds the machinery that makes balance claims falsifiable: one agent-facing interface
over the observation/action space fixed by `core-contracts`, a pool of scripted bots that can play
the game without a human, a `worker_threads` harness that runs thousands of headless universes
reproducibly, precise definitions for every metric in `docs/design/contracts.md` §7, and committed
baselines with a CI gate that fails when a metric moves beyond tolerance.

## What Changes

- Add `packages/agent-api` as the single agent-facing wrapper over the observation vector, the
  discrete action space, and the legality mask defined by `core-contracts`. This change does not
  redefine that space; it exports it.
- Add a **normalization descriptor table**: every slot of the observation vector declares its
  normalization rule and its fixed saturation constant, so the exported vector's meaning is stable
  across runs, universes, and releases. This is the one place floating-point is permitted on the
  export path, per `contracts.md` §4.1.
- Publish an **observation layout digest** and an `observationSchemaVersion`, so a baseline can
  refuse to be compared against a build whose observation shape changed.
- Add an episode-level agent session API — reset, observe, legal actions, submit, terminal status —
  serving scripted bots, the Monte Carlo harness, and later the RL bridge from one implementation.
- Add `packages/mc-harness`: a Node `worker_threads` pool that runs the core headlessly, a sweep
  specification format with factorial parameter grids and replicates, deterministic seed derivation,
  append-only per-run result storage, and canonical-order aggregation.
- Add the scripted baseline **bot pool** — at least eight strategies spanning permissive breadth,
  narrow depth, denial, archival redundancy, portal rush, worship maximization, uniform-random-legal
  noise floor, and a passive control arm — diverse enough that a tournament between them is
  informative rather than a formality.
- Add `packages/mc-harness`' **metric registry**: every metric named in `contracts.md` §7 gets an
  identifier, a normative definition, a collector, a scope (per-run or per-arm), an aggregation rule,
  and a `definitionVersion`. Every run record carries an entry for every registered metric — a
  measurement, or an explicit `unavailable` status with a reason code. A missing key is a failure.
- Add the **ablation mechanism** backing `winRateByPrimitive`: primitives are neutralized by a mask
  applied in the primitive-stacking layer rather than by editing content, ablation and control arms
  share run seeds, and a neutralized primitive still consumes its RNG draws so paired runs stay
  comparable.
- Add **committed balance baselines** under `balance/baselines/`, each carrying its provenance keys,
  per-metric point estimates, standard errors, and tolerances.
- Add the **balance regression gate** to CI: a fixed, seeded gate sweep whose metrics are compared
  against the committed baseline, failing the build when a metric moves beyond tolerance, when a
  baseline is missing, or when the baseline's provenance no longer matches the build.
- Add an explicit, separately-invoked **baseline regeneration command** that requires a written
  rationale, records what moved and by how much inside the regenerated file, and is unreachable from
  the test suite.

No game rules are introduced. This change measures the game; it does not define it.

## Capabilities

### New Capabilities

- `agent-api`: the agent-facing wrapper over the contracts' observation/action space — the
  normalization descriptor table and its fixed saturation constants, the observation layout digest
  and schema version, the episode session interface, legality-mask export, and illegal-action
  accounting.
- `mc-harness`: the Monte Carlo runner — the `worker_threads` pool, the sweep specification format,
  deterministic seed derivation and reproducibility, the scripted bot pool and its tournament
  scheduling, run termination and truncation accounting, result storage, failure isolation,
  single-run reproduction, and the recorded throughput budget.
- `balance-metrics`: the metric registry and the precise definition of every metric in
  `contracts.md` §7, the ablation methodology backing `winRateByPrimitive`, committed baselines with
  their provenance and tolerances, the CI regression gate, and the deliberate baseline-regeneration
  mechanism.

### Modified Capabilities

None. `observation-action-space` from `core-contracts` is *built on*, not changed: this change adds
the export boundary, the harness, and the measurement layer above it, and restates none of its
requirements.

## Impact

- **New:** `packages/agent-api/`, `packages/mc-harness/`, `packages/mc-harness/bots/`,
  `balance/sweeps/*.sweep.json`, `balance/baselines/*.baseline.json`, a sweep CLI, a single-run
  reproduction CLI, a baseline regeneration CLI, and a CI job running the gate sweep.
- **Depends on:** `sim-core-foundation` (step contract, PRNG, snapshots), `core-contracts`
  (observation/action space, primitive registry, RNG stream registry, module boundaries),
  `knowledge-model` and `mages-and-species` for a universe worth measuring.
- **Downstream:** `god-agency` and `raid-engagement` are the first changes able to make balance
  claims, and they make them through this harness. `gym-bridge` wraps `agent-api` unchanged;
  building a second observation path for RL is the divergence this change exists to prevent.
- **Contract pin:** the exported observation dtype is fixed here as float in `[0, 1]`, with
  `fp(1024)` mapping to `1.0`. `contracts.md` §4.1 permits floats at this boundary but does not name
  the exported range; this change names it, and every trained agent thereafter depends on it.
- **Risk accepted:** `winRateByPrimitive`, `raidLengthDistribution`, and `prestigeAdvantage` describe
  mechanics that do not exist until 0.6.0–0.7.0. Their collectors and the ablation machinery ship
  here and report `unavailable` with a reason code until the mechanic lands, rather than reporting a
  fabricated number.
- **Risk accepted:** committed baselines produced against untuned placeholder content will move
  substantially during 0.6.0 and 0.7.0. That is the intended behaviour — the gate makes each of
  those movements explicit and reviewed rather than invisible.
