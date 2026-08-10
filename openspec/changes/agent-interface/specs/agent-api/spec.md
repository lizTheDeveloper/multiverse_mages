## ADDED Requirements

### Requirement: Normalization descriptor table

Every slot of the observation vector defined by `docs/design/contracts.md` §4.1 SHALL carry a
descriptor declaring its normalization rule and its saturation constant, and `agent-api` MUST
normalize using that table alone. Permitted rules are `ratio` (integer divided by a declared
constant), `bounded` (`fp` value divided by `fp(1024)`), `log-bucket` (a count mapped through a
declared logarithmic bucket edge list), `flag` (0 or 1), and `identity` (already in range). Every
saturation constant MUST be a compile-time constant; no denominator may be derived from the state
of the run, the sweep, or any prior observation.

#### Scenario: Every slot has a descriptor

- **WHEN** the descriptor table is loaded
- **THEN** it contains exactly one descriptor per observation slot, covering every block listed in
  `contracts.md` §4.1, and the table's length equals the observation vector's length

#### Scenario: Saturating value clamps rather than exceeding the range

- **WHEN** a population cohort count exceeds its declared saturation constant
- **THEN** the exported value is exactly `1.0` and no exported value exceeds `1.0`

#### Scenario: Normalization does not depend on run history

- **WHEN** the same world state is observed in a run that reached it after 10 world ticks and in a
  run that reached it after 500
- **THEN** the two exported vectors are element-wise identical

#### Scenario: Run-relative denominators are rejected

- **WHEN** a descriptor declares a saturation constant that is not a compile-time constant
- **THEN** the descriptor table fails validation at load and names the offending slot

### Requirement: Exported observation dtype and range

The observation exported through `agent-api` SHALL be a `Float64Array` whose every element lies in
`[0, 1]`, with the fixed-point value `fp(1024)` mapping to exactly `1.0` and `0` mapping to exactly
`0.0`. The simulation core MUST continue to emit integers; the division MUST occur only in
`agent-api`.

#### Scenario: Exported values are bounded floats

- **WHEN** an observation is exported from any universe at any tick
- **THEN** every element is a finite double in `[0, 1]`, with no `NaN` and no negative zero

#### Scenario: Fixed-point unity maps to one

- **WHEN** a slot whose rule is `bounded` holds the core value `1024`
- **THEN** the exported element equals `1.0` exactly

#### Scenario: The core is unchanged by export

- **WHEN** the float-ban lint runs over `sim-core` and the rules packages after `agent-api` is added
- **THEN** it passes, and no floating-point value appears below the `agent-api` boundary

### Requirement: Observation layout digest and schema version

`agent-api` SHALL publish an `observationSchemaVersion` integer and a layout digest computed over
the ordered slot descriptor table, including each slot's block, index, rule, and saturation
constant. Any change to block order, slot count, a normalization rule, or a saturation constant MUST
change the digest.

#### Scenario: Digest is stable across identical builds

- **WHEN** the digest is computed in two separate processes from the same build
- **THEN** the two digests are identical

#### Scenario: Changing a saturation constant changes the digest

- **WHEN** one slot's saturation constant is altered without changing the vector's length
- **THEN** the digest differs from the previous build's digest

#### Scenario: Digest accompanies every export

- **WHEN** an agent session is created
- **THEN** the session exposes both `observationSchemaVersion` and the layout digest, and both are
  recordable by a caller alongside results

### Requirement: Episode session interface

`agent-api` SHALL expose a session interface serving scripted bots, the Monte Carlo harness, and
later the RL bridge from one implementation, offering: `reset(runSeed, scenarioConfig)` returning
the initial observation; `observe()` returning the current normalized observation; `legalActions()`
returning the boolean mask over the full action space; `submit(action)` advancing the simulation;
and `status()` reporting whether the episode is running, ascended, stagnated, or truncated. The
session MUST NOT compute, assign, or expose a reward.

#### Scenario: Reset is reproducible

- **WHEN** two sessions are reset with the same `runSeed` and the same `scenarioConfig`
- **THEN** their initial observations are element-wise identical

#### Scenario: Mask width matches the action space

- **WHEN** `legalActions()` is called
- **THEN** the returned mask length equals the action-space size enumerated in `contracts.md` §4.2

#### Scenario: Terminal status is reported explicitly

- **WHEN** an episode ends by reaching the world-tick cap without ascension
- **THEN** `status()` reports `truncated`, and `submit` on the terminated session raises rather than
  silently advancing

#### Scenario: No reward is exposed

- **WHEN** the session interface is inspected
- **THEN** it exposes no reward, return, score, or fitness value of any kind

### Requirement: Illegal action accounting

`agent-api` SHALL count every submitted action and every action rejected by the legality mask, per
episode and broken down by action id. Rejected actions MUST leave the simulation state unchanged, as
required by `core-contracts`, and MUST be retrievable by the caller at episode end.

#### Scenario: Rejection is counted and broken down

- **WHEN** an agent submits three illegal forbid-technique actions and one illegal open-portal
  action during an episode
- **THEN** the episode's rejection count is 4, with 3 attributed to the forbid-technique action id
  and 1 to the open-portal action id

#### Scenario: Counters survive to episode end

- **WHEN** an episode terminates
- **THEN** the submitted-action total and the per-action rejection breakdown are readable from the
  session and are sufficient to compute `illegalActionRate`

#### Scenario: Counting does not perturb the simulation

- **WHEN** an episode is run with accounting enabled and again with it disabled, from the same seed
  and the same action sequence
- **THEN** both produce identical final snapshot hashes

### Requirement: Agents observe only through the exported interface

An agent SHALL obtain all information about a universe through `agent-api`, and MUST NOT read
simulation state, content tables, or RNG state directly. A measurement taken with an agent that
reads privileged state overstates what the observation space supports, so this boundary MUST be
enforced by the dependency-graph test established in `core-contracts`.

#### Scenario: Bot packages cannot reach the rules packages

- **WHEN** the dependency-graph test runs
- **THEN** no package containing agent strategies imports `sim-core`, `content`, `rules-magic`,
  `rules-world`, or `rules-raid`, directly or transitively through anything but `agent-api`

#### Scenario: A privileged import fails CI

- **WHEN** a strategy is modified to import `rules-world` directly
- **THEN** the dependency-graph test fails and names the offending package and import

### Requirement: Agent-side randomness is outside the RNG stream registry

Randomness used by an agent to break ties or to sample a policy SHALL be drawn from an agent-side
generator derived from `(runSeed, agentSlotIndex, strategyId)`, and MUST NOT draw from any subsystem
stream in the `contracts.md` §6 registry. Agent draws MUST NOT advance any simulation stream.

#### Scenario: Adding a strategy does not perturb the simulation

- **WHEN** a run is executed with a passive agent, and again with a random-legal agent whose every
  submitted action is a no-op
- **THEN** the simulation's per-stream draw counts are identical between the two runs

#### Scenario: Agent randomness is reproducible

- **WHEN** the same strategy is run twice at the same `runSeed` and `agentSlotIndex`
- **THEN** it emits an identical action sequence

#### Scenario: Registry streams are not reachable from agents

- **WHEN** the agent-side generator is constructed
- **THEN** it exposes no subsystem stream id and cannot be pointed at one
