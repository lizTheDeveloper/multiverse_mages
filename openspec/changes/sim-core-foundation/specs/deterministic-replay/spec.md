## ADDED Requirements

### Requirement: Action log recording

The core SHALL support recording every action submitted to `step`, tagged with the tick at which
it was applied, into an action log. Recording MUST NOT alter simulation behaviour.

#### Scenario: Recording does not change results

- **WHEN** a run is executed with recording enabled and again with recording disabled, from the
  same seed and actions
- **THEN** both runs produce identical final snapshot hashes

#### Scenario: Log captures tick association

- **WHEN** actions are submitted across several ticks
- **THEN** the log preserves each action's tick and their order within that tick

### Requirement: Replay reproduces a run exactly

Replaying a recorded `(rootSeed, initialSnapshot, actionLog)` SHALL produce the same final state
as the original run.

#### Scenario: Replay matches original

- **WHEN** a recorded run is replayed from its root seed, initial snapshot, and action log
- **THEN** the final snapshot hash equals that of the original run

#### Scenario: Divergence is located, not merely detected

- **WHEN** a replay produces a state whose hash differs from the recording at some tick
- **THEN** the replayer reports the earliest tick at which the hashes diverged

#### Scenario: Replay is independent of speed

- **WHEN** a run is replayed as fast as possible and again with delays inserted between steps
- **THEN** both replays produce identical final snapshot hashes

### Requirement: Golden replay verification in CI

The repository SHALL contain committed golden fixtures, each consisting of a root seed, an
initial snapshot, an action log, and an expected final snapshot hash. The test suite MUST verify
every fixture, and CI MUST fail if any fixture's expected hash is not reproduced.

#### Scenario: Nondeterminism fails the build

- **WHEN** a change introduces a nondeterministic operation in the rules path
- **THEN** at least one golden fixture fails and the failure names the fixture and the diverging
  tick

#### Scenario: Fixtures are verified on every run

- **WHEN** the test suite runs
- **THEN** every committed golden fixture is executed and its final hash compared

### Requirement: Deliberate golden regeneration

Regenerating golden fixtures SHALL require an explicit, separate command and MUST NOT occur as a
side effect of running tests. Regenerated fixtures MUST produce a reviewable diff.

#### Scenario: Tests never rewrite fixtures

- **WHEN** the test suite is run while a fixture is failing
- **THEN** the fixture files on disk are unchanged and the suite exits non-zero

#### Scenario: Explicit regeneration is reviewable

- **WHEN** the regeneration command is run after an intentional behaviour change
- **THEN** the fixture files are updated in place and the change appears as a diff in version
  control
