## ADDED Requirements

### Requirement: The node schema carries a knowledge kind

`node.json` SHALL require a `knowledgeKind` property on every record, constrained to the enumeration
`episteme` and `metis`. The property MUST be required rather than optional, so that a node's kind is
never inherited from a default that a reader has to know about.

#### Scenario: The schema rejects a missing knowledge kind

- **WHEN** a node record omits `knowledgeKind`
- **THEN** validation fails naming the file path and JSON pointer, and no registry is returned

#### Scenario: The schema rejects an unknown value

- **WHEN** a node record declares `knowledgeKind` of `techne`
- **THEN** validation fails and the permitted values are named

#### Scenario: The shipped content set validates

- **WHEN** the shipped `node.json` is validated after every record has been given a kind
- **THEN** validation reports no diagnostics

### Requirement: Adding the field moves contentRevision once, deliberately

Introducing `knowledgeKind` SHALL change `contentRevision`, and that change MUST be made in a commit
that alters no behaviour — every existing node taking `episteme` — so that the compatibility break
is separable from the design judgements that follow it.

#### Scenario: The field-introduction commit changes only the revision

- **WHEN** `knowledgeKind` is added with `episteme` on every existing node
- **THEN** `contentRevision` changes, and no golden replay fixture's simulated result changes

#### Scenario: Authoring mētis nodes is a separate commit

- **WHEN** nodes are subsequently reclassified as `metis`
- **THEN** that diff contains only content values, so a reviewer reads design judgements without
  mechanical noise
