## ADDED Requirements

### Requirement: Fixed-shape observation

The observation emitted for any universe at any tick SHALL have a constant shape, sized from the
full content space (70 cells, 6 species, 7 tiers) rather than from the v1 subset. Variable-length
data MUST be bucketed or summarized, never emitted raw.

#### Scenario: Shape is constant across universes

- **WHEN** observations are taken from two universes with different rulesets, populations, and
  knowledge
- **THEN** both observations have identical length and block layout

#### Scenario: Shape is constant across scales

- **WHEN** an observation is taken at world scale and again during engagement
- **THEN** both have identical length; the engagement block is zero-filled at world scale

#### Scenario: v1 content yields a sparse vector

- **WHEN** an observation is taken from a universe using only the 12 v1 cells
- **THEN** the knowledge block still spans all 70 cells, with unused cells zero-filled

### Requirement: Discrete, masked action space

Actions SHALL be discrete and enumerated per `docs/design/contracts.md` §4.2. Every observation
MUST carry a boolean legality mask over the full action space.

#### Scenario: Mask accompanies every observation

- **WHEN** an observation is requested
- **THEN** it includes a mask whose length equals the action-space size

#### Scenario: Illegal action is a no-op

- **WHEN** an agent submits an action whose mask entry is false
- **THEN** the simulation state is unchanged, no exception is raised, and an illegal-action counter
  increments

#### Scenario: Illegal action rate is reported

- **WHEN** a Monte Carlo run completes
- **THEN** `illegalActionRate` is reported among its metrics

### Requirement: Rules changes are masked during engagement

The legality mask MUST exclude every action that alters the ruleset or the tradition whenever the
clock is in engagement mode. This covers permitting or forbidding a technique or form, issuing or
revoking an edict, and changing tradition.

#### Scenario: Ruleset actions unavailable mid-raid

- **WHEN** an observation is taken while the clock is in engagement mode
- **THEN** the mask entries for actions 1 through 7 and action 13 are all false

#### Scenario: Ruleset actions available at world scale

- **WHEN** an observation is taken at world scale with sufficient favor
- **THEN** those mask entries reflect ordinary affordability and validity rather than being
  unconditionally false

#### Scenario: Submitting a masked rules change mid-raid does nothing

- **WHEN** an agent submits a forbid-technique action during engagement
- **THEN** the ruleset is unchanged and the illegal-action counter increments

### Requirement: Normalization occurs at the boundary

The simulation core SHALL emit integer observations. Normalization to a bounded range MUST occur
in the agent-api layer, which is the only place floating-point is permitted on the export path.

#### Scenario: Core emits integers

- **WHEN** an observation is taken directly from the core
- **THEN** every value is an integer

#### Scenario: Boundary normalizes

- **WHEN** an observation is requested through the agent API in normalized form
- **THEN** every value lies within the documented bounded range

#### Scenario: Core remains float-free

- **WHEN** the float-ban lint runs over the core after observation support is added
- **THEN** it passes
