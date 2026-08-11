## MODIFIED Requirements

### Requirement: Scribing writes a mind instance into a grimoire

Scribing SHALL create a grimoire holding exactly one node, together with the one knowledge instance
that is its contents — placed at the location that grimoire's holder implies, per "Instance location
follows its grimoire's holder" below — consuming supplied scribe capacity and materials. The
operation MUST refuse when the node's cell is not permitted, when the source instance is dormant,
when the node's `knowledgeKind` is `metis`, when the active tradition's `store` kind does not permit
written storage, or when supplied capacity or materials are insufficient. A refusal caused by
`knowledgeKind` MUST be distinguishable from a refusal caused by the tradition's `store` kind. The
grimoire's `durability` MUST be derived from the supplied scribe affinity. Any stochastic outcome in
scribing, including durability rolls, MUST draw from RNG stream 5.

#### Scenario: Scribing produces a grimoire and an instance

- **WHEN** a scribing operation is supplied sufficient scribe capacity and materials for a node the
  source holds in mind, in a permitted cell
- **THEN** a grimoire is created carrying that node, a knowledge instance is created at
  `locationKind` grimoire referencing it, and the supplied capacity and materials are reported as
  consumed

#### Scenario: A book scribed onto a shelf is shelved

- **WHEN** a scribing operation names a library as the new grimoire's holder
- **THEN** the instance is created at `locationKind` library with `locationId` set to that library,
  so the book counts toward that library's depth, is enumerable among its grimoires, and is
  destroyed with it

#### Scenario: Insufficient materials refuse the operation

- **WHEN** the supplied materials are below the node's `scribeCost` requirement
- **THEN** no grimoire and no instance are created, and the shortfall is reported

#### Scenario: Scribe affinity raises durability

- **WHEN** two scribing operations for the same node are supplied scribe affinities of `fp(1792)`
  and `fp(1024)` at the same seed
- **THEN** the grimoire produced under the higher affinity has strictly greater `durability`

#### Scenario: A palace-store tradition cannot scribe

- **WHEN** the universe's tradition declares a `store` kind of `palace` and a scribing operation is
  invoked
- **THEN** the operation is refused and the refusal names the active `store` kind

#### Scenario: A mētis node cannot be scribed

- **WHEN** a scribing operation is invoked for a node whose `knowledgeKind` is `metis`, in a
  universe whose tradition permits written storage, with sufficient capacity and materials
- **THEN** the operation is refused, no grimoire and no instance are created, and the refusal names
  the node's knowledge kind rather than the tradition's store kind

## ADDED Requirements

### Requirement: The instance store rejects illegal locations for mētis

The instance store SHALL reject the creation or relocation of any instance of a `metis` node to
`locationKind` grimoire or library, regardless of which operation requested it. This MUST be an
invariant of the store rather than a check inside each operation, so that operations added later
cannot bypass it by omission. It MUST hold in particular for the holder-implied placement described
by "Instance location follows its grimoire's holder": a mētis node has no grimoire, so no holder can
imply a location for it.

#### Scenario: A direct store write is rejected

- **WHEN** any caller attempts to place an instance of a `metis` node at `locationKind` library
- **THEN** the store rejects it, no instance exists at that location, and the rejection names the
  node's knowledge kind

#### Scenario: The invariant is checkable over the whole index

- **WHEN** the instance index is audited
- **THEN** no instance of any `metis` node is found at `locationKind` grimoire or library

### Requirement: Loss identifies succession failure distinctly

A loss event for a node whose `knowledgeKind` is `metis` SHALL identify its cause as succession
failure — the death of the last holder — distinguishably from a loss caused by the destruction of
written instances. The event MUST carry enough information for a caller to report which mage's death
ended the node.

#### Scenario: Death of the last holder emits a succession loss

- **WHEN** the last living holder of a `metis` node dies
- **THEN** a loss event is emitted identifying succession failure and naming the mage whose death
  caused it

#### Scenario: Written loss is unchanged

- **WHEN** the last grimoire instance of an `episteme` node is destroyed
- **THEN** the loss event's cause is destruction, not succession
