## MODIFIED Requirements

### Requirement: All content is validated JSON

Techniques, forms, cells, nodes, species, traditions, primitives, and ascension routes SHALL be
authored as JSON and validated against published JSON Schemas. Validation MUST be runnable as a
standalone CLI usable in CI.

#### Scenario: Valid content loads

- **WHEN** the content set is loaded and every file conforms to its schema
- **THEN** the loader returns an interned content registry and reports the counts loaded

#### Scenario: Validation CLI reports every failure

- **WHEN** the validation CLI runs against content containing three distinct violations
- **THEN** it exits non-zero and reports all three, each with its file path and JSON pointer

#### Scenario: Ascension routes are validated content

- **WHEN** the content set is loaded
- **THEN** the ascension routes are validated against a published schema like every other content
  kind, and no route is enumerated in code
