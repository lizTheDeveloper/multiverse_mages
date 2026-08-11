## ADDED Requirements

### Requirement: All content is validated JSON

Techniques, forms, cells, nodes, species, traditions, and primitives SHALL be authored as JSON and
validated against published JSON Schemas. Validation MUST be runnable as a standalone CLI usable
in CI.

#### Scenario: Valid content loads

- **WHEN** the content set is loaded and every file conforms to its schema
- **THEN** the loader returns an interned content registry and reports the counts loaded

#### Scenario: Validation CLI reports every failure

- **WHEN** the validation CLI runs against content containing three distinct violations
- **THEN** it exits non-zero and reports all three, each with its file path and JSON pointer

### Requirement: Invalid content fails hard

The loader MUST reject invalid content by failing, not by skipping the offending record or
emitting a warning.

#### Scenario: Malformed node aborts the load

- **WHEN** content contains a node missing a required field
- **THEN** the loader throws, no partially populated registry is returned, and the error names the
  offending node ID and field

#### Scenario: Unknown reference aborts the load

- **WHEN** a node names a prerequisite ID that does not exist
- **THEN** the loader throws and names both the node and the missing prerequisite

### Requirement: String IDs are interned to integers

Content IDs SHALL be lowercase kebab-case strings in files and interned to integer handles at
load. The mapping MUST be deterministic across runs and stable across processes.

#### Scenario: Interning is deterministic

- **WHEN** the same content set is loaded twice with every content file's records reordered
- **THEN** every string ID maps to the same integer in both

#### Scenario: Runtime uses integers

- **WHEN** state references a node, cell, species, or tradition
- **THEN** it stores the interned integer, not the string

### Requirement: Content graph integrity

The loader SHALL reject prerequisite cycles, and SHALL reject any node whose prerequisite has a
higher tier than the node itself.

#### Scenario: Cycle rejected

- **WHEN** node A lists B as a prerequisite and B lists A
- **THEN** the loader throws and names the cycle

#### Scenario: Inverted tier rejected

- **WHEN** a tier-2 node lists a tier-4 node as a prerequisite
- **THEN** the loader throws and names both nodes with their tiers

### Requirement: Schema spans the full grid, data covers v1 only

The content schema SHALL support all 70 technique×form cells. Shipped content data SHALL define
exactly the v1 subset of 12 cells, each flagged `"v1": true`, and that subset MUST include
`rego-limen`.

#### Scenario: v1 subset is exactly twelve cells

- **WHEN** the content registry is loaded
- **THEN** exactly 12 cells are flagged `v1`, drawn from 3 techniques and 4 forms

#### Scenario: Portals are reachable in v1

- **WHEN** the v1 subset is loaded
- **THEN** `rego-limen` is among the flagged cells

#### Scenario: A non-v1 cell still validates

- **WHEN** a cell outside the v1 subset is added to content
- **THEN** it validates successfully against the schema without being flagged `v1`

### Requirement: Traditions declare exactly four hooks

A tradition SHALL declare the hooks `acquire`, `store`, `cast`, and `cost`, and no others. Each
hook's `kind` MUST be drawn from a closed enumeration implemented in code.

#### Scenario: A fifth hook is rejected

- **WHEN** a tradition declares a hook outside the four named points
- **THEN** validation fails and names the disallowed hook

#### Scenario: An unimplemented hook kind is rejected

- **WHEN** a tradition declares a hook `kind` with no corresponding implementation
- **THEN** validation fails and lists the permitted kinds for that hook
