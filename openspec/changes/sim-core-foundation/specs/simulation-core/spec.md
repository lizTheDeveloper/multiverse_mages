## ADDED Requirements

### Requirement: Pure step contract

The simulation core SHALL expose a single advancement function of the form
`step(state, actions, rng) -> state`. The function MUST NOT read wall-clock time, perform I/O,
or mutate the state value passed to it. Given identical inputs it MUST produce an identical
output state.

#### Scenario: Identical inputs produce identical output

- **WHEN** `step` is called twice with structurally identical `state`, `actions`, and an RNG at
  the same seed and position
- **THEN** both calls return states whose snapshot hashes are byte-identical

#### Scenario: Input state is not mutated

- **WHEN** `step` is called with a state value and the caller retains a reference to it
- **THEN** the retained state's snapshot hash after the call equals its hash before the call

#### Scenario: Caller owns time

- **WHEN** the same `state` and `actions` are stepped by a caller running as fast as possible and
  by a caller running on a one-second schedule
- **THEN** both produce identical resulting states

### Requirement: Core purity is mechanically enforced

The `@mm/sim-core` package SHALL declare zero runtime dependencies and MUST NOT import Node
built-in modules. Use of `Math.random`, `Date.now`, `new Date()`, `performance.now()`, and
`Intl` within the core's source MUST fail linting.

#### Scenario: Forbidden global rejected

- **WHEN** a source file under `packages/sim-core/src` calls `Math.random()`
- **THEN** the lint task exits non-zero and names the offending file and line

#### Scenario: Runtime dependency rejected

- **WHEN** a runtime dependency is added to `packages/sim-core/package.json`
- **THEN** the dependency-purity check fails CI

### Requirement: Fixed-point arithmetic in the rules path

All rules-path arithmetic SHALL use fixed-point integers at a scale of 1/1024. The core SHALL
provide `mul`, `div`, `lerp`, and conversion helpers. Division MUST round toward negative
infinity through a single shared helper so that rounding behaviour is uniform. Floating-point
arithmetic MUST NOT appear in the rules path.

#### Scenario: Rounding is uniform and directional

- **WHEN** `div` is applied to a negative numerator that does not divide evenly
- **THEN** the result rounds toward negative infinity, matching the behaviour for the positive
  equivalent under the same helper

#### Scenario: Float literal in rules path rejected

- **WHEN** a source file in the rules path introduces a non-integer numeric literal or a `Math.*`
  floating-point operation
- **THEN** the lint task exits non-zero

#### Scenario: Fixed-point round-trip

- **WHEN** an integer value is converted to fixed-point and back without intervening arithmetic
- **THEN** the original integer is recovered exactly

### Requirement: Deterministic entity store

The core SHALL provide an entity store using stable integer identifiers indexed into parallel
typed arrays, with a generation counter per slot. Iteration over entities MUST occur in index
order. Freed slots MUST be reused from a deterministic free list. A handle referring to a freed
slot MUST be detectable as stale rather than resolving to the slot's new occupant.

#### Scenario: Iteration order is index order

- **WHEN** entities are created, some are destroyed, and new entities are created in freed slots
- **THEN** iteration visits entities in ascending slot index order, independent of creation order

#### Scenario: Stale handle detected

- **WHEN** an entity is destroyed and its slot is reused by a new entity, and the caller resolves
  the original handle
- **THEN** the store reports the handle as stale and does not return the new occupant

#### Scenario: Allocation order is reproducible

- **WHEN** two runs perform an identical sequence of creations and destructions
- **THEN** both runs assign identical identifiers and generations at every step

### Requirement: Splittable seeded randomness

The core SHALL provide a counter-based splittable pseudorandom number generator whose state is
represented without floating-point values. Each subsystem SHALL draw from a stream derived
deterministically from `(rootSeed, subsystemId, tick)`. Adding a new draw in one subsystem MUST
NOT alter the values drawn by any other subsystem.

#### Scenario: Streams are independent

- **WHEN** an additional random draw is introduced into one subsystem and the simulation is rerun
  from the same root seed
- **THEN** the sequence of values drawn by every other subsystem is unchanged

#### Scenario: Stream derivation is reproducible

- **WHEN** a stream is derived twice from the same `(rootSeed, subsystemId, tick)`
- **THEN** both derivations yield identical sequences

#### Scenario: Root seed determines everything

- **WHEN** two runs use the same root seed and the same action log
- **THEN** every random value drawn in both runs is identical

### Requirement: Dual-scale world clock

The core SHALL maintain a clock with a world scale where one tick represents one month, an
engagement scale representing fast combat ticks, and an explicit current mode. While the clock
is in engagement mode, world-scale advancement MUST be suspended. Mode transitions MUST be
driven by actions, never by elapsed wall-clock time.

#### Scenario: World time pauses during engagement

- **WHEN** the clock enters engagement mode and the simulation is stepped repeatedly
- **THEN** the engagement tick advances and the world tick remains unchanged

#### Scenario: World time resumes after engagement

- **WHEN** the clock leaves engagement mode and the simulation is stepped
- **THEN** the world tick resumes advancing from the value it held when engagement began

#### Scenario: Mode is part of state

- **WHEN** a state in engagement mode is snapshotted and restored
- **THEN** the restored state is in engagement mode at the same engagement tick

### Requirement: Population benchmark harness

The package SHALL include a benchmark harness that measures sustained steps per second against
a configurable synthetic entity population and reports the result in a machine-readable form.

#### Scenario: Benchmark reports throughput

- **WHEN** the benchmark is run against a stated entity count
- **THEN** it emits sustained steps per second and entity-updates per second in machine-readable
  output

#### Scenario: Benchmark is deterministic

- **WHEN** the benchmark is run twice with the same configuration and seed
- **THEN** the simulated results are identical, and only the timing measurements differ
