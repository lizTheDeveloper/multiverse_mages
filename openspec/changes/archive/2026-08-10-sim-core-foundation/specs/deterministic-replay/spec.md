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

*Restated during implementation, for the same reason as "Caller owns time": inserting a delay
varies an input the replayer does not have. What is checkable is that an observer cannot perturb
the run, and that no time-valued parameter exists to perturb it with.*

- **WHEN** a recording is replayed with a per-tick observer performing arbitrary unrelated work,
  and again with no observer
- **THEN** both replays produce identical final snapshot hashes
- **AND** the replayer's signature accepts no time-valued parameter

### Requirement: Golden replay verification in CI

The repository SHALL contain committed golden fixtures, each consisting of a root seed, an
initial snapshot, an action log, and an expected final snapshot hash. The test suite MUST verify
every fixture, and CI MUST fail if any fixture's expected hash is not reproduced.

#### Scenario: Nondeterminism fails the build

*Restated during implementation. "A change introduces a nondeterministic operation" is not an
executable WHEN — nobody can commit a permanently nondeterministic branch to prove it. It was
verified once as a deliberate drill (task 8.5), and a property verified once by hand is not a
property verified on every CI run. The clauses below are what CI can actually hold.*

- **WHEN** the golden suite replays a fixture against a world whose systems differ from the
  recorded ones from tick `T` onward
- **THEN** the replay reports divergence at exactly tick `T`, and the rendered failure message
  contains the fixture's filename and `T`

#### Scenario: Fixtures are verified on every run

- **WHEN** the test suite runs
- **THEN** every committed golden fixture is executed and its final hash compared

### Requirement: Deliberate golden regeneration

Regenerating golden fixtures SHALL require an explicit, separate command and MUST NOT occur as a
side effect of running tests. Regenerated fixtures MUST produce a reviewable diff.

#### Scenario: Tests never rewrite fixtures

*Restated during implementation. "While a fixture is failing" is unreachable in a green
repository, so the guarantee was only ever checked on the path it is not about. A temporary
fixtures directory makes the failing path reachable on every run.*

- **WHEN** the golden suite runs against a temporary fixtures directory in which one fixture's
  expected hash has been altered
- **THEN** every file in that directory is byte-identical afterward, and the run reports failure

#### Scenario: Explicit regeneration is reviewable

*Restated during implementation. "Appears as a diff in version control" is a claim about git, not
about this code. What this repository can hold is that regeneration writes only when behaviour
actually changed, and says which fixture it rewrote.*

- **WHEN** the regeneration command runs against a fixture whose recorded scenario has changed
- **THEN** that fixture's bytes are rewritten and the command names it as updated
- **AND WHEN** no scenario has changed
- **THEN** no fixture file's bytes change and the command reports that nothing changed
