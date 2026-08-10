## ADDED Requirements

### Requirement: Six species defined as validated content

The project SHALL define exactly six species — `human`, `elf`, `dwarf`, `draconic`, `gnome`, and
`orc` — as JSON content conforming to the `species.json` schema in `docs/design/contracts.md` §2.4.
No species trait value MAY appear as a literal in code. A species record missing any required field,
or naming a form or cell that does not exist in its `affinities` map, MUST fail the content load.

#### Scenario: All six species load

- **WHEN** the content package is loaded
- **THEN** exactly six species records are interned, and their ids are `human`, `elf`, `dwarf`,
  `draconic`, `gnome`, and `orc`

#### Scenario: Species trait literal in code is rejected

- **WHEN** a source file in `packages/rules-world/src` contains a numeric literal keyed to a named
  species
- **THEN** the conformance check fails and names the file

#### Scenario: Unknown affinity key rejected

- **WHEN** a species record declares an affinity for a form or cell id absent from the loaded
  content
- **THEN** the load fails and names the file path, JSON pointer, and unknown key

### Requirement: Species schema additions

The species schema SHALL carry three fields beyond those listed in `docs/design/contracts.md` §2.4:
`maturityMonths` (`int32`), `mageAptitude` (`fp`), and `laborAffinity` (`fp`). `docs/design/contracts.md`
§2.4 MUST be amended in this change to include them. `maturityMonths` MUST be greater than zero and
less than `lifespanMonths` for every species.

#### Scenario: Contract document and schema agree

- **WHEN** the CI contract-conformance check compares the loaded species schema against the field
  list in `docs/design/contracts.md` §2.4
- **THEN** the field sets match exactly, including the three additions

#### Scenario: Maturity beyond lifespan rejected

- **WHEN** a species record declares `maturityMonths` greater than or equal to `lifespanMonths`
- **THEN** the load fails and names the species

#### Scenario: No martial trait is introduced

- **WHEN** the species schema is inspected for a soldier-effectiveness or martial field
- **THEN** none exists, because soldier effectiveness is owned by `raid-engagement`

### Requirement: Trait direction is uniform and higher is better

Every `fp` species trait SHALL be defined so that a higher value is more advantageous to that
species along that axis. `rediscoveryAffinity` MUST therefore be applied as a divisor:
`effectiveRediscoveryMultiplier = nodeRediscoveryMultiplier × fp(1024) / rediscoveryAffinity`.

#### Scenario: High rediscovery affinity lowers cost

- **WHEN** a gnome with `rediscoveryAffinity` of `fp(1792)` and an orc with `fp(512)` each
  rediscover the same node
- **THEN** the gnome's effective rediscovery multiplier is strictly lower than the orc's

#### Scenario: Direction is asserted, not assumed

- **WHEN** the trait registry is checked in CI
- **THEN** every `fp` trait declares its direction as higher-is-better and the check fails if any
  application site applies one in the opposite sense

### Requirement: Effective rediscovery multiplier has a floor

The effective rediscovery multiplier, after species affinity is applied, MUST NOT fall below
`fp(3072)`. This preserves the 0.3.0 release claim in `docs/design/release-plan.md` that
rediscovery costs at least three times the original research cost.

#### Scenario: Affinity cannot break the floor

- **WHEN** a gnome with `rediscoveryAffinity` of `fp(1792)` rediscovers a node whose base
  `rediscoveryMultiplier` is `fp(3072)`
- **THEN** the effective multiplier is `fp(3072)`, not `fp(1755)`

#### Scenario: Affinity operates above the floor

- **WHEN** the same gnome rediscovers a node whose base `rediscoveryMultiplier` is `fp(6144)`
- **THEN** the effective multiplier is `fp(3510)`, strictly between the floor and the base

### Requirement: Species magnitudes are marked as untuned

Every numeric magnitude in species content SHALL be marked in the content files as an untuned
placeholder awaiting the balance harness. No release note, spec, or test at 0.4.0 MAY assert that
any species magnitude is balanced.

#### Scenario: Placeholder marking is present

- **WHEN** a species content file is loaded
- **THEN** it carries a machine-readable tuning-status marker of `untuned`, and the loader records
  it

#### Scenario: Balance assertion at 0.4.0 rejected

- **WHEN** a test asserts a target win rate, fairness property, or balance band over species traits
- **THEN** the pre-0.5.0 claim check fails, because no balance measurement exists before
  `agent-interface`

### Requirement: Species differentiate measurably

Species SHALL produce measurably different outcomes on identical seeds. Under the reference
scenario, the world ticks taken by each species to first reach a given node tier MUST differ
between at least four distinct species by more than the run-to-run variation observed across seeds.

#### Scenario: Time-to-tier differs by species

- **WHEN** the reference scenario is run to 200 world years across a fixed set of seeds
- **THEN** the recorded time to first reach tier 3 differs between at least four species by more
  than the observed cross-seed spread

#### Scenario: Depth ceiling is a hard limit

- **WHEN** an orc mage with `depthCeiling` 3 holds every prerequisite for a tier-4 node
- **THEN** the node is not a feasible research or teaching target for that mage, at any rate

#### Scenario: Scribe affinity reaches grimoire durability

- **WHEN** a dwarf with `scribeAffinity` `fp(1792)` and a human with `fp(1024)` each scribe the same
  node
- **THEN** the resulting grimoires' `durability` values differ in the dwarf's favour
