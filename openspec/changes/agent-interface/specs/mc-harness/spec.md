## ADDED Requirements

### Requirement: Headless worker pool

The harness SHALL execute simulation runs on a pool of Node `worker_threads`, each running the same
simulation core with no I/O, no rendering, and no wall-clock dependency. The worker count MUST be
configurable, and a run's result MUST NOT depend on which worker executed it, on how many workers
were configured, or on the order in which runs were dispatched.

#### Scenario: Worker count does not change results

- **WHEN** the same sweep is executed with 1 worker and again with 8 workers
- **THEN** every per-run result record is identical and the aggregate metrics are identical

#### Scenario: Runs are dispatched without shared mutable state

- **WHEN** two runs execute concurrently on different workers
- **THEN** neither observes the other's entity handles, RNG state, or metric accumulators

#### Scenario: Pool drains deterministically

- **WHEN** a sweep of 500 runs is executed on 8 workers
- **THEN** exactly 500 result records are written, one per derived run seed, with no duplicates and
  no omissions

### Requirement: Deterministic seed derivation

A run's seed SHALL be a pure function of `(rootSeed, sweepId, cellIndex, replicateIndex)`, published
and stable. Nothing about scheduling, worker identity, dispatch order, or wall-clock time may enter
the derivation, and every result record MUST carry all four derivation inputs.

#### Scenario: Seed is recomputable from the record

- **WHEN** a result record is read and its four derivation inputs are fed to the derivation function
- **THEN** the resulting run seed equals the seed recorded in that record

#### Scenario: Distinct cells and replicates get distinct seeds

- **WHEN** a sweep declares 20 parameter cells and 50 replicates
- **THEN** the 1000 derived run seeds are pairwise distinct

#### Scenario: Derivation is stable across processes

- **WHEN** the same derivation inputs are used in two separate processes on two machines
- **THEN** the derived seeds are identical

### Requirement: Sweep specification format

A sweep SHALL be declared in a committed, machine-readable file naming: a stable `sweepId`, a
`rootSeed`, the parameter factors and their levels, the replicate count per cell, the agent pool and
its assignment rule, the run termination configuration, the metric set to collect, any ablation
configuration, and a flag marking the sweep as a gate sweep or a full sweep. The harness MUST reject
a sweep file that omits any of these or that declares an unknown factor, metric, or strategy.

#### Scenario: Sweep file is validated before any run starts

- **WHEN** a sweep file names a metric that is not in the metric registry
- **THEN** the harness exits non-zero before dispatching any run and names the unknown metric

#### Scenario: Factorial expansion is explicit

- **WHEN** a sweep declares 3 factors with 4, 5, and 2 levels and 25 replicates
- **THEN** the harness reports 40 parameter cells and 1000 runs before execution begins

#### Scenario: Gate sweeps are distinguishable

- **WHEN** a sweep file is loaded
- **THEN** the harness can report whether it is the gate sweep or the full sweep without executing it

### Requirement: Sweep reproducibility

The harness SHALL guarantee that two executions of the same sweep specification at the same
`rootSeed`, against the same build, content, and metric definitions, produce byte-identical per-run
result records and identical aggregate metrics. Equality MUST be exact; the reproducibility check
MUST NOT apply a numerical tolerance.

#### Scenario: Repeated sweeps agree exactly

- **WHEN** a sweep is executed twice
- **THEN** the two aggregate metric sets compare equal under exact equality, including every
  floating-point aggregate

#### Scenario: Timing differences do not change results

- **WHEN** one execution runs on an unloaded machine and another on a heavily loaded one
- **THEN** the result records are byte-identical apart from recorded wall-clock timings, which are
  stored in a clearly separated performance section

#### Scenario: A nondeterminism regression is caught

- **WHEN** a change introduces a scheduling-dependent value into a metric collector
- **THEN** the reproducibility test fails and names the metric that differed

### Requirement: Canonical-order aggregation

Aggregation of per-run results into sweep metrics SHALL fold records in canonical order, sorted by
`(cellIndex, replicateIndex)`, never in worker completion order. This ordering MUST be applied to
every floating-point accumulation, because floating-point addition is not associative and completion
order varies between executions.

#### Scenario: Completion order does not affect aggregates

- **WHEN** a sweep is executed with artificially randomized per-run delays so that runs complete in a
  different order than the previous execution
- **THEN** the aggregate metrics are exactly equal to the previous execution's

#### Scenario: Aggregation from stored records matches live aggregation

- **WHEN** the stored per-run records of a completed sweep are re-aggregated offline
- **THEN** the recomputed aggregates equal the aggregates written during execution

### Requirement: Bounded run termination with truncation recorded

Every Monte Carlo run SHALL terminate, and the harness MUST enforce a declared world-tick cap in
addition to the simulation's own terminal conditions. A run's terminal status MUST be recorded as
one of `ascended`, `stagnated`, `truncated`, or `failed`, and truncated runs MUST be retained in the
denominator of every rate metric rather than discarded.

#### Scenario: The cap ends a non-terminating run

- **WHEN** a run reaches the sweep's declared world-tick cap without ascending or stagnating
- **THEN** the run ends, its record's status is `truncated`, and its metrics are collected up to the
  cap

#### Scenario: Truncated runs count in rates

- **WHEN** a sweep of 100 runs produces 12 ascensions, 60 stagnations, and 28 truncations
- **THEN** `ascensionRate` is reported as 0.12, computed over all 100 runs

#### Scenario: Termination status is always present

- **WHEN** any result record is read
- **THEN** it carries exactly one terminal status from the enumerated set

### Requirement: Result storage with provenance

Per-run results SHALL be written to append-only, machine-readable, newline-delimited records, one
per run, each carrying: the four seed derivation inputs, the derived run seed, the parameter cell's
factor levels, the assigned agent strategies, the terminal status, the value or `unavailable` status
of every registered metric, and the provenance keys — build version, content hash, RNG stream
registry hash, observation schema version and layout digest, and every collected metric's
`definitionVersion`. A sweep MUST also write a summary record carrying the sweep configuration hash,
the run counts by terminal status, and the aggregate metrics.

#### Scenario: A record is self-describing

- **WHEN** a single result record is read in isolation, years later
- **THEN** it identifies the build, content, metric definitions, and seed that produced it, without
  reference to any other file

#### Scenario: Provenance mismatch within a sweep is a failure

- **WHEN** two runs in the same sweep report different content hashes
- **THEN** the sweep fails and names the differing runs

#### Scenario: Records are never rewritten

- **WHEN** a sweep is re-executed with the same output directory
- **THEN** it writes to a new output file rather than modifying an existing one, or exits non-zero

### Requirement: Failure isolation and single-run reproduction

A run that throws, hangs beyond a declared per-run timeout, or crashes its worker SHALL be recorded
as `failed` with its seed derivation inputs and an error classification, and MUST NOT abort the
sweep. The harness MUST provide a reproduction entrypoint that re-executes any single recorded run
in-process and single-threaded from its derivation inputs.

#### Scenario: One crashed worker does not lose the sweep

- **WHEN** a worker crashes partway through a sweep of 1000 runs
- **THEN** the affected run is recorded as `failed`, the worker is replaced, and the remaining runs
  complete

#### Scenario: A failed run is reproducible in isolation

- **WHEN** the reproduction entrypoint is given a failed run's derivation inputs
- **THEN** it re-executes that run alone, in the main thread, and reproduces the same failure

#### Scenario: Excess failures disqualify a sweep

- **WHEN** a sweep's failure count exceeds the threshold declared in its sweep file
- **THEN** the sweep is reported as disqualified and is not eligible to produce a baseline

### Requirement: Scripted baseline bot pool

The harness SHALL ship a pool of at least eight scripted strategies, each with a stable
`strategyId`, a version, and a deterministic policy over the observation and legality mask. The pool
MUST span at least: a passive control that only submits no-ops; a uniform-random-legal noise floor;
a permissive-breadth strategy that permits widely and funds broadly; a narrow-depth specialist that
permits a minimal technique and form set and drives one cell as deep as possible; a denial warden
that forbids aggressively and interdicts theft-bearing cells; an archivist that maximizes redundant
knowledge instances and library depth; a portal-rush strategy that prioritizes reaching `rego-limen`
and opening portals early; and a worship maximizer that optimizes favor regeneration. Each strategy
MUST be documented with the hypothesis about the strategy space it exists to probe.

#### Scenario: Pool composition is enumerable

- **WHEN** the strategy registry is listed
- **THEN** it contains at least eight strategies, each with a unique `strategyId`, a version, and a
  documented hypothesis

#### Scenario: Strategies are deterministic

- **WHEN** any strategy is run twice against the same observation sequence and the same agent-side
  seed
- **THEN** it emits an identical action sequence

#### Scenario: Strategies differ observably

- **WHEN** the passive control, the archivist, and the portal-rush strategy each run a 200-world-year
  universe on the same run seed
- **THEN** their final observations differ, and the harness reports which observation blocks differ

### Requirement: Strategies degrade gracefully against a masked action space

Every strategy SHALL run to termination when actions it prefers are masked out, including the case
in which every action other than no-op is permanently masked. A strategy MUST NOT stall, loop
without advancing the clock, or raise when its preferred action is unavailable.

#### Scenario: Fully masked world still completes

- **WHEN** the whole pool runs against a build in which every god action is masked out because the
  capability has not yet landed
- **THEN** every run reaches a terminal status and the sweep completes

#### Scenario: A blocked preference falls through

- **WHEN** the portal-rush strategy observes that opening a portal is masked
- **THEN** it submits its next-preferred legal action rather than repeatedly submitting the illegal
  one

#### Scenario: Degradation is visible in the metrics

- **WHEN** a strategy spends an episode unable to act
- **THEN** its `illegalActionRate` and its no-op share are reported, distinguishing "chose to pass"
  from "was refused"

### Requirement: Tournament scheduling over the pool

The harness SHALL support a tournament mode that schedules matched runs across the strategy pool
under common random numbers, so that every pairing of interest is played on the same set of derived
run seeds. Where a mode produces an asymmetry between two agent slots, each pairing MUST be played
in both slot assignments so that slot bias cancels.

#### Scenario: Pairings share seeds

- **WHEN** strategies A and B, and strategies A and C, are scheduled in the same tournament
- **THEN** all three strategies encounter the same set of derived run seeds

#### Scenario: Slot assignments are mirrored

- **WHEN** a pairing is scheduled in a mode with distinguishable agent slots
- **THEN** the pairing appears twice with the slot assignments swapped, and both results are recorded

#### Scenario: Pool dominance is reported, not hidden

- **WHEN** a tournament completes
- **THEN** the summary reports the pairwise win or outcome matrix over the pool, whether or not any
  strategy dominates

### Requirement: Recorded throughput budget

The harness SHALL measure and record its own throughput — total wall-clock time, runs per second,
and world ticks per second — for every sweep, in a performance section separated from the
reproducible result data. The throughput figure is an output of this change and MUST NOT be asserted
in advance; later claims about sweep cost are made against the recorded figure.

#### Scenario: Throughput is recorded for the reference sweep

- **WHEN** the reference sweep of ten thousand runs completes on eight workers
- **THEN** its wall-clock duration, runs per second, and world ticks per second are written to the
  sweep summary and to the project's recorded figures

#### Scenario: Performance data does not pollute reproducibility

- **WHEN** two executions of the same sweep are compared for reproducibility
- **THEN** the comparison excludes the performance section and still requires exact equality
  everywhere else

#### Scenario: Regression against the recorded figure is detectable

- **WHEN** a sweep runs materially slower than the recorded figure on comparable hardware
- **THEN** the summary reports the recorded figure alongside the measured one so the gap is visible
