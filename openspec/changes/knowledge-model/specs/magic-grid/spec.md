## ADDED Requirements

### Requirement: The v1 cell subset

Content SHALL flag exactly twelve cells with `"v1": true`, and those twelve MUST be the full
rectangle of techniques `intellego`, `perdo`, `rego` crossed with forms `limen`, `mentem`, `nomen`,
`terram`. The subset MUST include `rego-limen`, and the loader MUST reject content that violates
either condition.

Nodes MAY be authored in cells outside the subset. The grid holds seventy cells and this release
enables twelve; the remaining fifty-eight are written but inert, which is how a later release turns
a cell on without authoring it under time pressure. What the loader MUST reject instead is a
*playable* node made permanently unreachable — one in a v1 cell whose prerequisite lies in a cell
this release does not enable. Nothing else in the pipeline would notice that node can never be
acquired.

#### Scenario: The subset is exactly the declared rectangle

- **WHEN** the content loader completes and the set of cells flagged `v1` is collected
- **THEN** it contains exactly `intellego-limen`, `intellego-mentem`, `intellego-nomen`,
  `intellego-terram`, `perdo-limen`, `perdo-mentem`, `perdo-nomen`, `perdo-terram`, `rego-limen`,
  `rego-mentem`, `rego-nomen`, and `rego-terram`

#### Scenario: A thirteenth v1 cell is rejected

- **WHEN** content flags a thirteenth cell with `"v1": true`
- **THEN** the load fails and the error names the offending cell id and the expected count of twelve

#### Scenario: The subset is not a rectangle

- **WHEN** content flags twelve cells that do not form a 3-technique × 4-form rectangle
- **THEN** the load fails and the error names the techniques and forms that are unevenly covered

#### Scenario: A node outside the subset is accepted and inert

- **WHEN** content authors a node whose `cell` is not flagged `v1`, and nothing playable requires it
- **THEN** the load succeeds, and the node is addressable but unreachable in play

#### Scenario: A playable node gated behind disabled content is rejected

- **WHEN** content authors a node in a v1 cell whose prerequisite lies in a cell not flagged `v1`
- **THEN** the load fails and the error names the node id, the prerequisite id, and the cell that
  is not enabled

### Requirement: Cell availability is decided by the arbitration function alone

Every determination of whether a cell is available in a universe SHALL be made by calling
`permits(universe, cellId)` from `state-schema`. This capability MUST NOT evaluate technique
bitmasks, form bitmasks, or edict lists directly, and MUST NOT cache the result of `permits` in
world state.

#### Scenario: Availability tracks a permitted technique and form

- **WHEN** a universe permits `rego` and `limen` with no edict naming `rego-limen`
- **THEN** `rego-limen` is available, and the determination was made through `permits`

#### Scenario: Availability tracks a dispensation

- **WHEN** a universe forbids `perdo` but holds a dispensation edict naming `perdo-mentem`
- **THEN** `perdo-mentem` is available and the other three `perdo` cells are not

#### Scenario: Availability tracks an interdiction

- **WHEN** a universe permits both `perdo` and `mentem` but holds an interdiction edict naming
  `perdo-mentem`
- **THEN** `perdo-mentem` is unavailable while `perdo-nomen`, `perdo-terram`, and `perdo-limen`
  remain available

#### Scenario: No inline bitmask evaluation

- **WHEN** the conformance check scans `packages/rules-magic` for direct reads of
  `permittedTechniques`, `permittedForms`, or `edicts`
- **THEN** it finds zero occurrences outside the call to `permits`

### Requirement: Node prerequisite satisfaction

A node's prerequisites SHALL be considered satisfied for a subject only when the subject holds a
usable knowledge instance of every prerequisite node. Prerequisites MUST be evaluated against the
node graph loaded from content, MUST be allowed to cross cells, and MUST NOT be inferred from tier
alone.

#### Scenario: All prerequisites held

- **WHEN** a node declares prerequisites `A` and `B` and the subject holds usable instances of both
- **THEN** the node's prerequisites are satisfied

#### Scenario: One prerequisite missing

- **WHEN** a node declares prerequisites `A` and `B` and the subject holds only `A`
- **THEN** the node's prerequisites are not satisfied, and the unsatisfied prerequisite is named in
  the result

#### Scenario: Cross-cell prerequisite

- **WHEN** a node in `rego-limen` declares a prerequisite in `intellego-limen` and the subject holds
  a usable instance of it
- **THEN** the prerequisite is satisfied, and no additional same-cell requirement is imposed

#### Scenario: Tier does not imply satisfaction

- **WHEN** a subject holds a tier-4 node in a cell and a tier-2 node in that cell declares
  prerequisites the subject does not hold
- **THEN** the tier-2 node's prerequisites remain unsatisfied

### Requirement: Dormancy in a forbidden cell

A knowledge instance whose node's cell is not permitted SHALL be dormant. Dormancy MUST be derived
on demand as the negation of `permits(universe, cellOf(nodeId))` and MUST NOT be stored in state. A
dormant instance MUST NOT be cast, taught, scribed, prepared, or counted as a satisfied
prerequisite, and MUST NOT contribute any primitive effect. A dormant instance SHALL still count
toward its node's existence in the universe.

#### Scenario: Forbidding a cell renders its instances dormant

- **WHEN** a universe that permits `perdo` and `mentem` holds instances of a `perdo-mentem` node and
  then issues an interdiction naming that cell
- **THEN** those instances remain in state, are reported as dormant, and the node still exists in the
  universe

#### Scenario: Dormant knowledge cannot be transmitted

- **WHEN** a teaching operation names a node whose cell is not permitted
- **THEN** the operation is refused, no instance is created, and the refusal reason is dormancy

#### Scenario: Dormant knowledge does not satisfy a prerequisite

- **WHEN** a subject holds a dormant instance of node `A` and attempts to research a node declaring
  `A` as a prerequisite
- **THEN** the prerequisites are not satisfied

#### Scenario: Re-permitting restores surviving instances

- **WHEN** the interdiction on a cell is revoked and instances of its nodes still survive
- **THEN** those instances are no longer dormant and are usable again with no migration step

### Requirement: Classical labels are display-only

A cell's `classicalLabels` SHALL have no mechanical effect. No rule in this capability may read them,
and no legality, prerequisite, cost, or effect computation may depend on them.

#### Scenario: Labels do not affect legality

- **WHEN** two cells with identical techniques, forms, and edict status differ only in their
  `classicalLabels`
- **THEN** `permits` returns the same result for both

#### Scenario: Labels are absent from the rules path

- **WHEN** the conformance check scans the rules path for reads of `classicalLabels`
- **THEN** it finds zero occurrences

### Requirement: Grid addressing covers all seventy cells

The grid SHALL address all 5 techniques × 14 forms = 70 cells, independently of which cells carry
v1 content. Cell lookup by `(techniqueId, formId)` and by cell id MUST both resolve for every one of
the 70, and MUST be total — no technique/form pair may be unaddressable.

#### Scenario: Every pair resolves

- **WHEN** every `(techniqueId, formId)` pair in the 5 × 14 space is looked up
- **THEN** all 70 resolve to a distinct cell, and no pair is unresolvable

#### Scenario: A non-v1 cell is addressable but empty

- **WHEN** `creo-ignem` is looked up in a v1 build
- **THEN** the cell resolves, reports zero nodes, and reports that it is not in the v1 subset

#### Scenario: Cell identity is stable across loads

- **WHEN** content is loaded twice in separate processes and cell ids are interned
- **THEN** every cell receives the same integer id in both loads
