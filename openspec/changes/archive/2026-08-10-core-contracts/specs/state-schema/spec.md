## ADDED Requirements

### Requirement: World state type definitions

The project SHALL publish a single set of TypeScript type definitions for world state matching
`docs/design/contracts.md` §1. Every rules package MUST consume these types rather than declaring
its own.

#### Scenario: Types are shared, not duplicated

*Restated during implementation. "Describing an entity already defined" had no operational
meaning, so nothing could implement it. This is the operational form.*

- **WHEN** a package other than `@mm/state` exports a type whose name matches a state record, or
  whose declared field set is a superset of one `@mm/state` exports
- **THEN** the conformance check fails, naming the file and the duplicated type

#### Scenario: State round-trips through a snapshot

- **WHEN** a state populated with every defined component type is serialized and restored
- **THEN** the restored state is byte-identical by snapshot hash

### Requirement: World-scale entities carry no coordinates

Entities that exist at world scale MUST NOT have position components. Only engagement-scale
entities are positioned.

#### Scenario: Position on a world entity is rejected

*Restated during implementation. "Development builds" describes a build mode this repository does
not have, and the failure is unconditional rather than mode-dependent — so the original THEN could
not be checked as written.*

- **WHEN** a world schema declares an `x` or `y` field on any world-scale component
- **THEN** the conformance check fails and names the component
- **AND WHEN** code writes a coordinate onto a mage, university, cohort, or library
- **THEN** the write throws, because the layout gives those components no such field to write

#### Scenario: Engagement entities are positioned

- **WHEN** a combatant is created during engagement mode
- **THEN** it carries fixed-point `x` and `y` coordinates in metres

### Requirement: Populace is aggregated, mages are individual

Non-mage population SHALL be represented as counted cohorts keyed by species, occupation, and
birth-tick bucket. Mages SHALL be individual entities. No capability may represent non-mage
population as individual entities.

#### Scenario: Cohort holds a count, not entities

- **WHEN** a population of 10,000 laborers is created
- **THEN** exactly one cohort entity exists with a count of 10,000

#### Scenario: Individual populace is rejected

*Restated during implementation. `contracts.md` §1.3 states a documentation gate — "no capability
may promote populace to individual entities without changing this document first" — not a runtime
guard, and the entity store is deliberately permissive about which components a handle carries.
Asserting a guard that was never specified would have been inventing a requirement; asserting the
layouts cannot express the confusion is what the contract actually buys.*

- **WHEN** the mage and populace-cohort layouts are compared
- **THEN** they share no field, so a cohort has no individual's attributes and a mage has no count
- **AND** promoting populace to individual entities requires editing `contracts.md` §1.3 first

### Requirement: Single ruleset arbitration function

The project SHALL implement exactly one `permits(universe, cellId)` function. Interdiction MUST
take precedence over dispensation. Content declaring both an interdiction and a dispensation for
the same cell MUST be rejected at load.

#### Scenario: Both axes permitted

- **WHEN** a cell's technique and form are both permitted and no edict names the cell
- **THEN** `permits` returns true

#### Scenario: Dispensation overrides a forbidden axis

- **WHEN** a cell's technique is forbidden but a dispensation names the cell
- **THEN** `permits` returns true

#### Scenario: Interdiction beats dispensation

- **WHEN** a cell is named by both an interdiction and a dispensation
- **THEN** content validation rejects the state as invalid before evaluation

#### Scenario: No consumer reimplements arbitration

- **WHEN** any package evaluates technique or form bitmasks directly instead of calling `permits`
- **THEN** the conformance check fails and names the file

### Requirement: Engagement state is excluded from world snapshots

Engagement-only entities MUST NOT appear in world snapshots. A snapshot taken during engagement
mode SHALL record the clock mode and engagement tick, but not combatants or raid objectives.

#### Scenario: Combatants absent from world snapshot

- **WHEN** a world snapshot is taken during engagement mode
- **THEN** the snapshot contains no combatant or objective records, and its size is comparable to
  a snapshot of the same world taken at world scale
