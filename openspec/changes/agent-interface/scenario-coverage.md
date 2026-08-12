# Scenario coverage — `agent-interface`

Task 10.5: *"confirm every scenario across the three capability specs has a corresponding passing
test"*.

A confirmation nobody can re-run is an opinion. So this file is a **manifest**, and
`packages/mc-harness/test/unit/scenario-coverage.test.ts` checks it against the specs and against
the filesystem:

- every `#### Scenario:` heading in `specs/agent-api`, `specs/balance-metrics` and `specs/mc-harness`
  appears here exactly once, and nothing appears here that is not in a spec;
- every file named below exists and is a file `vitest` collects.

That makes the manifest fail when a scenario is added and left unmapped, and when a test file is
renamed or deleted out from under a claim. What it deliberately does **not** do is assert that a
named file contains an assertion *about* the scenario — nothing mechanical can, short of writing the
scenario id into every `it`, which turns a design document into a test-naming convention. The
mapping is a reviewed claim; the check keeps it from rotting.

Rows are `Requirement > Scenario | file`. A scenario covered in more than one place names the file
that asserts it most directly.

## `specs/agent-api`

| requirement > scenario | test |
|---|---|
| Normalization descriptor table > Every slot has a descriptor | `packages/agent-api/test/unit/normalization.test.ts` |
| Normalization descriptor table > Saturating value clamps rather than exceeding the range | `packages/agent-api/test/unit/normalization-rules.test.ts` |
| Normalization descriptor table > Normalization does not depend on run history | `packages/agent-api/test/unit/normalization-history.test.ts` |
| Normalization descriptor table > Run-relative denominators are rejected | `packages/agent-api/test/unit/normalization.test.ts` |
| Exported observation dtype and range > Exported values are bounded floats | `packages/agent-api/test/unit/observation-shape.test.ts` |
| Exported observation dtype and range > Fixed-point unity maps to one | `packages/agent-api/test/unit/normalization-rules.test.ts` |
| Exported observation dtype and range > The core is unchanged by export | `packages/agent-api/test/unit/float-boundary.test.ts` |
| Observation layout digest and schema version > Digest is stable across identical builds | `packages/agent-api/test/unit/layout-digest.test.ts` |
| Observation layout digest and schema version > Changing a saturation constant changes the digest | `packages/agent-api/test/unit/layout-digest.test.ts` |
| Observation layout digest and schema version > Digest accompanies every export | `packages/agent-api/test/adversarial/layout-digest-attack.test.ts` |
| Episode session interface > Reset is reproducible | `packages/agent-api/test/unit/session.test.ts` |
| Episode session interface > Mask width matches the action space | `packages/agent-api/test/unit/action-space.test.ts` |
| Episode session interface > Terminal status is reported explicitly | `packages/agent-api/test/adversarial/session-truncation-flag.test.ts` |
| Episode session interface > No reward is exposed | `packages/agent-api/test/unit/outcome-and-reward.test.ts` |
| Illegal action accounting > Rejection is counted and broken down | `packages/agent-api/test/unit/legality-mask.test.ts` |
| Illegal action accounting > Counters survive to episode end | `packages/agent-api/test/adversarial/episode-invariants.test.ts` |
| Illegal action accounting > Counting does not perturb the simulation | `packages/agent-api/test/adversarial/episode-invariants.test.ts` |
| Agents observe only through the exported interface > Bot packages cannot reach the rules packages | `packages/mc-harness/test/unit/package-boundaries.test.ts` |
| Agents observe only through the exported interface > A privileged import fails CI | `packages/mc-harness/test/unit/package-boundaries.test.ts` |
| Agent-side randomness is outside the RNG stream registry > Adding a strategy does not perturb the simulation | `packages/agent-api/test/adversarial/agent-rng-derivation.test.ts` |
| Agent-side randomness is outside the RNG stream registry > Agent randomness is reproducible | `packages/agent-api/test/unit/agent-rng.test.ts` |
| Agent-side randomness is outside the RNG stream registry > Registry streams are not reachable from agents | `packages/agent-api/test/adversarial/agent-rng-derivation.test.ts` |

## `specs/balance-metrics`

| requirement > scenario | test |
|---|---|
| Metric registry completeness > Registry matches the contract | `packages/mc-harness/test/unit/metrics-registry.test.ts` |
| Metric registry completeness > Every run record is complete | `packages/scenario/test/unit/metric-completeness.test.ts` |
| Metric registry completeness > A dead collector is a failure, not a gap | `packages/mc-harness/test/unit/metrics-registry.test.ts` |
| Metrics whose mechanic is absent report an explicit unavailable status > Raid metrics before raids exist | `packages/mc-harness/test/unit/metrics-raid.test.ts` |
| Metrics whose mechanic is absent report an explicit unavailable status > Unavailable values never enter aggregates | `packages/mc-harness/test/unit/metrics-unavailable.test.ts` |
| Metrics whose mechanic is absent report an explicit unavailable status > Absent and empty are distinguishable | `packages/mc-harness/test/unit/metrics-raid.test.ts` |
| Metric definitions are versioned together with their pinned constants > Changing a pinned constant bumps the version | `packages/mc-harness/test/unit/metrics-definition-version.test.ts` |
| Metric definitions are versioned together with their pinned constants > Cross-version comparison is refused | `packages/mc-harness/test/unit/balance-gate.test.ts` |
| Metric definitions are versioned together with their pinned constants > Versions are recorded per metric, not per sweep | `packages/mc-harness/test/unit/balance-gate.test.ts` |
| Knowledge lifetime metrics > A node lost and rediscovered contributes twice | `packages/mc-harness/test/unit/metrics-knowledge.test.ts` |
| Knowledge lifetime metrics > Survivorship is censored, not truncated | `packages/mc-harness/test/unit/metrics-knowledge.test.ts` |
| Knowledge lifetime metrics > Half-life not reached within the run | `packages/mc-harness/test/unit/metrics-knowledge.test.ts` |
| Knowledge lifetime metrics > An empty universe does not divide by zero | `packages/mc-harness/test/unit/metrics-knowledge.test.ts` |
| Species progression metric > All pairs are present regardless of the v1 subset | `packages/mc-harness/test/unit/metrics-species.test.ts` |
| Species progression metric > Censoring is not a measurement | `packages/mc-harness/test/unit/metrics-species.test.ts` |
| Species progression metric > Heavily censored pairs report censoring rather than a median | `packages/mc-harness/test/unit/metrics-species.test.ts` |
| Species progression metric > Grimoire-only knowledge does not count | `packages/mc-harness/test/unit/metrics-species.test.ts` |
| Snowball metrics > Reported per checkpoint, not as a single number | `packages/mc-harness/test/unit/metrics-snowball.test.ts` |
| Snowball metrics > Degenerate populations are defined | `packages/mc-harness/test/unit/metrics-snowball.test.ts` |
| Snowball metrics > Early terminations are excluded and counted | `packages/mc-harness/test/unit/metrics-snowball.test.ts` |
| Snowball metrics > Instantaneous rate, not accumulated total | `packages/mc-harness/test/unit/metrics-snowball.test.ts` |
| Raid length distribution > Bounded by portal stability | `packages/mc-harness/test/unit/metrics-raid.test.ts` |
| Raid length distribution > An unbounded raid is a failure, not an outlier | `packages/mc-harness/test/unit/metrics-raid.test.ts` |
| Raid length distribution > Summary statistics accompany the histogram | `packages/mc-harness/test/unit/metrics-raid.test.ts` |
| Run outcome metrics > Truncated runs are in the denominator | `packages/mc-harness/test/unit/metrics-outcome.test.ts` |
| Run outcome metrics > Target band is reported, not enforced by the collector | `packages/mc-harness/test/unit/metrics-outcome.test.ts` |
| Run outcome metrics > Prestige pairs are mirrored | `packages/mc-harness/test/unit/metrics-outcome.test.ts` |
| Run outcome metrics > Prestige magnitude is not invented here | `packages/mc-harness/test/unit/metrics-outcome.test.ts` |
| Illegal action rate > No-ops are in the denominator | `packages/mc-harness/test/unit/metrics-outcome.test.ts` |
| Illegal action rate > Breakdown identifies the unclear mask entry | `packages/mc-harness/test/unit/metrics-outcome.test.ts` |
| Illegal action rate > Passing is distinguishable from being refused | `packages/mc-harness/test/unit/metrics-outcome.test.ts` |
| Primitive ablation mechanism > Content is untouched | `packages/primitives/test/unit/ablation-paired-run.test.ts` |
| Primitive ablation mechanism > Draw counts are preserved | `packages/primitives/test/unit/ablation-draw-invariance.test.ts` |
| Primitive ablation mechanism > Paired arms share seeds | `packages/mc-harness/test/unit/ablation-scheduling.test.ts` |
| Primitive ablation mechanism > Every stacking class has a defined neutralization | `packages/primitives/test/unit/ablation-conformance.test.ts` |
| Win rate attributed by one-sided mirrored ablation > Fifty per cent means no measured contribution | `packages/mc-harness/test/unit/ablation-scheduling.test.ts` |
| Win rate attributed by one-sided mirrored ablation > Side bias cancels | `packages/mc-harness/test/unit/ablation-scheduling.test.ts` |
| Win rate attributed by one-sided mirrored ablation > Portal is not attributable | `packages/mc-harness/test/unit/ablation-scheduling.test.ts` |
| Win rate attributed by one-sided mirrored ablation > Interaction effects are out of scope | `packages/mc-harness/test/unit/ablation-scheduling.test.ts` |
| Win rate attributed by one-sided mirrored ablation > Sample size is reported with the estimate | `packages/mc-harness/test/unit/ablation-scheduling.test.ts` |
| Committed baseline artifact > Provenance is complete | `packages/mc-harness/test/unit/baseline-format.test.ts` |
| Committed baseline artifact > Diffs are legible | `packages/mc-harness/test/unit/baseline-format.test.ts` |
| Committed baseline artifact > Baselines are per-sweep, not global | `packages/mc-harness/test/unit/balance-ci-wiring.test.ts` |
| Tolerances derived from gate-sweep noise > Tolerance reflects the sweep that gates | `packages/mc-harness/test/unit/standard-error.test.ts` |
| Tolerances derived from gate-sweep noise > Both deltas are reported | `packages/mc-harness/test/unit/balance-gate.test.ts` |
| Tolerances derived from gate-sweep noise > Noise-scaled tolerances differ per metric | `packages/mc-harness/test/unit/standard-error.test.ts` |
| Balance regression gate in CI > A metric beyond tolerance fails the build | `packages/mc-harness/test/unit/balance-gate.test.ts` |
| Balance regression gate in CI > A missing baseline fails, and is never treated as a pass | `packages/mc-harness/test/unit/balance-gate.test.ts` |
| Balance regression gate in CI > Stale provenance fails rather than comparing | `packages/mc-harness/test/unit/balance-gate.test.ts` |
| Balance regression gate in CI > Unavailable metrics do not fail the gate | `packages/mc-harness/test/unit/balance-gate.test.ts` |
| Balance regression gate in CI > A metric becoming available is surfaced | `packages/mc-harness/test/unit/balance-gate.test.ts` |
| Deliberate baseline regeneration > Tests never rewrite baselines | `packages/mc-harness/test/unit/baseline-regeneration.test.ts` |
| Deliberate baseline regeneration > Regeneration without a rationale is refused | `packages/mc-harness/test/unit/baseline-regeneration.test.ts` |
| Deliberate baseline regeneration > The diff carries the movement | `packages/mc-harness/test/unit/baseline-regeneration.test.ts` |
| Deliberate baseline regeneration > CI cannot regenerate | `packages/mc-harness/test/unit/balance-ci-wiring.test.ts` |
| Deliberate baseline regeneration > Widening a tolerance is a reviewed regeneration | `packages/mc-harness/test/unit/baseline-regeneration.test.ts` |
| Deliberate baseline regeneration > A disqualified sweep cannot become a baseline | `packages/mc-harness/test/unit/baseline-regeneration.test.ts` |

## `specs/mc-harness`

| requirement > scenario | test |
|---|---|
| Headless worker pool > Worker count does not change results | `packages/mc-harness/test/unit/pool.test.ts` |
| Headless worker pool > Runs are dispatched without shared mutable state | `packages/mc-harness/test/unit/pool.test.ts` |
| Headless worker pool > Pool drains deterministically | `packages/mc-harness/test/unit/pool.test.ts` |
| Deterministic seed derivation > Seed is recomputable from the record | `packages/mc-harness/test/unit/seed-derivation.test.ts` |
| Deterministic seed derivation > Distinct cells and replicates get distinct seeds | `packages/mc-harness/test/unit/seed-derivation.test.ts` |
| Deterministic seed derivation > Derivation is stable across processes | `packages/mc-harness/test/unit/seed-derivation.test.ts` |
| Sweep specification format > Sweep file is validated before any run starts | `packages/mc-harness/test/unit/sweep-spec.test.ts` |
| Sweep specification format > Factorial expansion is explicit | `packages/mc-harness/test/unit/sweep-spec.test.ts` |
| Sweep specification format > Gate sweeps are distinguishable | `packages/mc-harness/test/unit/sweep-spec.test.ts` |
| Sweep reproducibility > Repeated sweeps agree exactly | `packages/scenario/test/unit/reference-sweep.test.ts` |
| Sweep reproducibility > Timing differences do not change results | `packages/mc-harness/test/unit/reproducibility.test.ts` |
| Sweep reproducibility > A nondeterminism regression is caught | `packages/mc-harness/test/unit/reproducibility.test.ts` |
| Canonical-order aggregation > Completion order does not affect aggregates | `packages/mc-harness/test/unit/canonical-order.test.ts` |
| Canonical-order aggregation > Aggregation from stored records matches live aggregation | `packages/scenario/test/unit/reference-sweep.test.ts` |
| Bounded run termination with truncation recorded > The cap ends a non-terminating run | `packages/mc-harness/test/unit/episode.test.ts` |
| Bounded run termination with truncation recorded > Truncated runs count in rates | `packages/mc-harness/test/unit/metrics-outcome.test.ts` |
| Bounded run termination with truncation recorded > Termination status is always present | `packages/mc-harness/test/unit/episode.test.ts` |
| Result storage with provenance > A record is self-describing | `packages/mc-harness/test/unit/records.test.ts` |
| Result storage with provenance > Provenance mismatch within a sweep is a failure | `packages/mc-harness/test/unit/records.test.ts` |
| Result storage with provenance > Records are never rewritten | `packages/mc-harness/test/unit/storage.test.ts` |
| Failure isolation and single-run reproduction > One crashed worker does not lose the sweep | `packages/mc-harness/test/unit/pool.test.ts` |
| Failure isolation and single-run reproduction > A failed run is reproducible in isolation | `packages/mc-harness/test/unit/reproduce-run.test.ts` |
| Failure isolation and single-run reproduction > Excess failures disqualify a sweep | `packages/mc-harness/test/unit/pool.test.ts` |
| Scripted baseline bot pool > Pool composition is enumerable | `packages/mc-harness/test/unit/strategy-pool.test.ts` |
| Scripted baseline bot pool > Strategies are deterministic | `packages/mc-harness/test/unit/strategy-pool.test.ts` |
| Scripted baseline bot pool > Strategies differ observably | `packages/mc-harness/test/unit/strategy-pool.test.ts` |
| Strategies degrade gracefully against a masked action space > Fully masked world still completes | `packages/mc-harness/test/unit/strategy-pool.test.ts` |
| Strategies degrade gracefully against a masked action space > A blocked preference falls through | `packages/mc-harness/test/unit/strategy-pool.test.ts` |
| Strategies degrade gracefully against a masked action space > Degradation is visible in the metrics | `packages/mc-harness/test/unit/strategy-pool.test.ts` |
| Tournament scheduling over the pool > Pairings share seeds | `packages/mc-harness/test/unit/tournament.test.ts` |
| Tournament scheduling over the pool > Slot assignments are mirrored | `packages/mc-harness/test/unit/tournament.test.ts` |
| Tournament scheduling over the pool > Pool dominance is reported, not hidden | `packages/mc-harness/test/unit/tournament.test.ts` |
| Recorded throughput budget > Throughput is recorded for the reference sweep | `packages/mc-harness/test/unit/records.test.ts` |
| Recorded throughput budget > Performance data does not pollute reproducibility | `packages/scenario/test/unit/reference-sweep.test.ts` |
| Recorded throughput budget > Regression against the recorded figure is detectable | `packages/mc-harness/test/unit/records.test.ts` |
