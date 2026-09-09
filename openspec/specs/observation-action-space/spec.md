# observation-action-space Specification

## Purpose
TBD - created by archiving change core-contracts. Update Purpose after archive.
## Requirements
### Requirement: Fixed-shape observation

The observation emitted for any universe at any tick SHALL have a constant shape, sized from the
full content space (70 cells, 6 species, 8 mage slots — the seven tiers plus the untaught) rather
than from the v1 subset. Variable-length
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
- **THEN** every action except no-op is masked

*Widened during implementation. This scenario named actions 1-7 and 13, but `contracts.md` §4.2 is
explicit that the rule covers 8-12, 14 and 15 equally — blessing a defender mid-raid or declaring
ascension to escape a losing one violates frozen policy exactly as squarely as forbidding a
technique does, and it says in terms that silence in an earlier draft was not permission. The
implemented mask closes all sixteen non-noop actions, so a later-added action is masked by
default rather than by someone remembering to add it here. Action 16 (`invite scholar`) is the
first action to arrive after that sentence was written, and it was indeed masked in engagement
without an edit — `legalityMask` returns early on `inEngagement`, which is the mechanism the
sentence is describing.*

#### Scenario: Ruleset actions available at world scale

- **WHEN** an observation is taken at world scale with sufficient favor
- **THEN** those mask entries reflect ordinary affordability and validity rather than being
  unconditionally false

#### Scenario: Submitting a masked rules change mid-raid does nothing

- **WHEN** an agent submits a forbid-technique action during engagement
- **THEN** the ruleset is unchanged and the illegal-action counter increments

### Requirement: A god may invite a scholar of a species the universe lacks

The action space MUST carry an `invite scholar` action, parameterized by species id, which spends
favor to create a living mage of that species affiliated to one of the universe's universities.
It MUST be legal only when the universe holds portal magic — a living mage holding a node that
carries the `portal` primitive, in a cell the ruleset permits — and only for a species that no
living mage in the universe already belongs to.

`ages-of-magic.md` §2f makes alliances *"the way that you get visiting mages"* while `contracts.md`
§1.1 puts one universe in a simulation instance, so there is no second realm to negotiate with.
The immigrant is the smallest construction that makes the fiction mechanically true: what arrives
is an ordinary mage row, not a modifier.

#### Scenario: A universe without portal magic cannot invite

- **WHEN** no living mage holds a node carrying the `portal` primitive in a permitted cell
- **THEN** the invite action is masked, and submitting it changes nothing and increments the
  illegal-action counter

#### Scenario: A species already present cannot be invited

- **WHEN** a living mage of the named species already exists in the universe
- **THEN** that species is absent from the action's candidate list

#### Scenario: An invited scholar is a real mage of her own species

- **WHEN** an invitation resolves
- **THEN** a living mage of the invited species exists, affiliated to a university, and her
  personality is drawn around **her own** species' curiosity rather than the host's

#### Scenario: The invitation costs no RNG stream

- **WHEN** the arriving scholar's personality is rolled
- **THEN** the draw is taken on the existing mage-birth stream keyed on her own entity handle, so
  no other actor's draws move and no committed balance baseline is invalidated

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

