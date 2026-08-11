# magic-primitives Specification

## Purpose
How authored effects reach the stacking arithmetic: which instances contribute, at which
scale, and the guarantee that an illegal contribution never reaches the stacker at all.

## Requirements
### Requirement: Effects are sourced from usable knowledge instances

A node's declared effects SHALL contribute to a subject only while that subject holds a usable
knowledge instance of the node. An instance is usable when it is held in a mind or a palace, its
node's cell is permitted, and its mastery is at or above the declared activation threshold. Dormant
instances MUST contribute nothing.

#### Scenario: A held node contributes its effects

- **WHEN** a mage holds a mind instance of a `rego-terram` node declaring `build-rate` at mastery
  above the activation threshold, in a universe permitting `rego` and `terram`
- **THEN** that node's `build-rate` magnitude is present in the mage's contributed effect set

#### Scenario: A dormant node contributes nothing

- **WHEN** the same universe issues an interdiction naming `rego-terram`
- **THEN** the mage's contributed effect set is empty, and the instance is unchanged in state

#### Scenario: Below the activation threshold contributes nothing

- **WHEN** a mage holds a mind instance whose mastery is below the activation threshold
- **THEN** that node contributes no effects, and the instance remains present and teachable-status
  unchanged

#### Scenario: Written instances do not contribute directly

- **WHEN** a library holds instances of nodes declaring `research-rate` and no mage holds them in
  mind
- **THEN** no `research-rate` contribution is produced from those instances, and the library's
  influence is expressed solely through the published library-depth function

### Requirement: Effects route by declared scale

Each contributed effect SHALL be routed according to the scale declared for its primitive in the
`primitive-semantics` registry. World-scale effects MUST apply only while `clock.mode` is world,
engagement-scale effects MUST apply only while `clock.mode` is engagement, and effects whose scale is
`both` MUST apply in either mode.

#### Scenario: World-scale effect is inert during engagement

- **WHEN** `clock.mode` is engagement and a combatant holds a node declaring `teach-rate`
- **THEN** no `teach-rate` contribution is produced

#### Scenario: Engagement-scale effect is inert at world scale

- **WHEN** `clock.mode` is world and a mage holds a node declaring `direct-damage`
- **THEN** no `direct-damage` contribution is produced

#### Scenario: Dual-scale effect applies in both modes

- **WHEN** a mage holds a node declaring `concealment` and the simulation is stepped in world mode
  and then in engagement mode
- **THEN** a `concealment` contribution is produced in both modes

### Requirement: Stacking, caps, and rounding are delegated

Combining multiple contributions of the same primitive SHALL be performed by the shared stacking
implementation published by `primitive-semantics`. This capability MUST NOT implement its own
stacking, cap, or rounding arithmetic, and MUST NOT redefine any primitive's unit.

#### Scenario: Two sources of the same primitive are combined once, by the shared code

- **WHEN** a mage holds two distinct nodes each declaring `research-rate`
- **THEN** the effective multiplier is produced by the shared stacking implementation for
  `research-rate`, and no combination arithmetic occurs inside `rules-magic`

#### Scenario: No inline combination

- **WHEN** the lint task scans `packages/rules-magic` for arithmetic combining two primitive
  magnitudes
- **THEN** it exits non-zero and names the file and line

#### Scenario: A cap reached through knowledge is still counted

- **WHEN** enough held nodes stack `build-rate` past its cap
- **THEN** the value is clamped by the shared implementation and the per-primitive clamp counter
  increments

### Requirement: Legality is evaluated once per contribution

Each candidate contribution SHALL have its cell legality evaluated exactly once, through
`permits(universe, cellOf(nodeId))`, at the point the contribution is gathered. No downstream
consumer may re-evaluate legality, and no contribution that failed the check may reach the stacking
stage.

#### Scenario: An illegal contribution never reaches stacking

- **WHEN** a subject holds three nodes and one of them is in an interdicted cell
- **THEN** the stacking implementation receives exactly two contributions

#### Scenario: Legality is not re-checked downstream

- **WHEN** the gathered contribution set is inspected
- **THEN** every entry in it is already legal, and no legality field is carried forward for a
  consumer to re-test

### Requirement: Primitive coverage of the v1 subset

The v1 node content SHALL exercise every effect primitive in the `primitive-semantics` registry
except `lifespan` and `fertility`, which are Corpus- and Animal-bound and enter with the second
content wave. A coverage check MUST run in CI and MUST fail if any other primitive is unexercised or
if either permitted exclusion becomes covered without the exclusion list being updated.

#### Scenario: Coverage check passes on the authored subset

- **WHEN** the coverage check enumerates the primitives declared by all v1 nodes
- **THEN** every registry primitive except `lifespan` and `fertility` appears at least once

#### Scenario: A newly unexercised primitive fails the check

- **WHEN** the last v1 node declaring `knowledge-steal` is removed from content
- **THEN** the coverage check fails and names `knowledge-steal`

#### Scenario: The exclusion list is exact

- **WHEN** a v1 node is authored declaring `lifespan`
- **THEN** the coverage check fails and states that the exclusion list must be updated deliberately

#### Scenario: Portal is exercised by the mandated cell

- **WHEN** the coverage check locates the nodes declaring `portal`
- **THEN** every one of them belongs to `rego-limen`
