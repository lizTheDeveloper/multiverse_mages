# world-persistence Specification

## Purpose
TBD - created by archiving change sim-core-foundation. Update Purpose after archive.
## Requirements
### Requirement: Complete state serialization

The core SHALL serialize the complete simulation state to a binary buffer and restore it
without loss. A restored state MUST be indistinguishable from the original for all subsequent
simulation purposes.

#### Scenario: Round-trip preserves state exactly

- **WHEN** a state is serialized and then deserialized
- **THEN** the restored state's snapshot hash equals the original's

#### Scenario: Restored state simulates identically

- **WHEN** a state is stepped `N` times, and separately serialized, restored, and stepped the
  same `N` times with the same actions and seed
- **THEN** both resulting states have identical snapshot hashes

#### Scenario: Serialization is stable

- **WHEN** the same state is serialized twice
- **THEN** both buffers are byte-identical

### Requirement: Versioned, self-describing snapshot format

Every snapshot SHALL carry a schema version and a component tag table describing its contents.
The deserializer MUST reject a snapshot whose version it cannot handle with a descriptive error
rather than producing a partially populated state.

#### Scenario: Unknown future version rejected

- **WHEN** a snapshot declaring a schema version newer than the deserializer supports is loaded
- **THEN** deserialization fails with an error naming both the snapshot version and the supported
  version, and no state is returned

#### Scenario: Corrupt snapshot rejected

- **WHEN** a snapshot buffer is truncated or its component tag table is inconsistent with its
  payload
- **THEN** deserialization fails with a descriptive error rather than returning a partial state

### Requirement: Snapshot migration

The deserializer SHALL apply registered migrations in sequence to bring an older snapshot to the
current schema version. Migrations MUST be pure functions and MUST be individually testable.

#### Scenario: Older snapshot migrated forward

- **WHEN** a snapshot at schema version `N-1` is loaded by a deserializer at version `N` with a
  registered migration
- **THEN** the migration runs and a valid state at version `N` is returned

#### Scenario: Missing migration is an explicit failure

- **WHEN** a snapshot at an older version is loaded and no migration path to the current version
  is registered
- **THEN** deserialization fails with an error naming the missing migration step

#### Scenario: Migration chain applies in order

- **WHEN** a snapshot two or more versions old is loaded and each intermediate migration is
  registered
- **THEN** migrations are applied in ascending version order and the result matches a snapshot
  authored directly at the current version

### Requirement: Snapshot hashing

The core SHALL provide a deterministic content hash of a serialized snapshot for use in
equality assertions, replay verification, and later multiplayer desync detection.

#### Scenario: Equal states hash equally

- **WHEN** two independently constructed states contain identical content
- **THEN** their snapshot hashes are equal

#### Scenario: Any difference changes the hash

- **WHEN** a single component value in a state is changed
- **THEN** the snapshot hash differs from that of the unchanged state

