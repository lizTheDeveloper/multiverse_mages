## ADDED Requirements

### Requirement: Package dependency graph

The workspace SHALL follow the package dependency graph in `docs/design/contracts.md` §5. A test
MUST assert the graph in CI.

#### Scenario: Core depends on nothing

- **WHEN** the dependency-graph test runs
- **THEN** `sim-core` is asserted to have no workspace dependencies and no runtime dependencies

#### Scenario: Forbidden edge fails CI

- **WHEN** a rules package adds an import from `agent-api`
- **THEN** the dependency-graph test fails and names the offending edge

#### Scenario: Nothing depends on the client or server

- **WHEN** the dependency-graph test runs
- **THEN** no package is permitted to depend on `client-electron` or `server`

### Requirement: Rules packages do not import each other cyclically

`rules-magic` and `rules-world` MUST NOT import one another. Interactions that span both SHALL be
placed in a coordinating layer.

#### Scenario: Direct cycle rejected

- **WHEN** `rules-world` imports `rules-magic`, or the reverse
- **THEN** the dependency-graph test fails and names the edge

#### Scenario: Coordinating layer permitted

- **WHEN** a cross-cutting interaction is implemented in a package that depends on both
- **THEN** the dependency-graph test passes

### Requirement: RNG stream registry is append-only

Subsystem stream IDs SHALL be a permanent, append-only enumeration. Reusing or renumbering an
existing ID MUST fail CI.

#### Scenario: Renumbering rejected

- **WHEN** an existing subsystem's stream ID is changed
- **THEN** the registry test fails, naming the subsystem and both IDs, and explains that committed
  balance baselines would be invalidated

#### Scenario: Appending is allowed

- **WHEN** a new subsystem is added with the next unused ID
- **THEN** the registry test passes

#### Scenario: Duplicate ID rejected

- **WHEN** two subsystems declare the same stream ID
- **THEN** the registry test fails and names both
