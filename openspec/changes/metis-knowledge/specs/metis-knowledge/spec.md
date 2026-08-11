## ADDED Requirements

### Requirement: Every node declares a knowledge kind

Every node SHALL declare a `knowledgeKind` of either `episteme` or `metis`. The value MUST be
authored content and MUST NOT be derived at runtime from tier, cell, technique, or form, so that a
node's kind is an authoring decision rather than a consequence of where it sits in the grid.

#### Scenario: A node without a knowledge kind fails content validation

- **WHEN** a node record omits `knowledgeKind`
- **THEN** content validation fails naming the file path and the JSON pointer of the offending record

#### Scenario: An unknown knowledge kind fails content validation

- **WHEN** a node record declares a `knowledgeKind` outside the enumeration
- **THEN** content validation fails and the permitted values are named

#### Scenario: Kind is independent of tier

- **WHEN** the shipped content set is loaded
- **THEN** nodes of the same tier within a cell may hold different `knowledgeKind` values, and no
  rule derives one from the other

### Requirement: A mētis instance may exist only in a mind or a palace

A knowledge instance of a `metis` node SHALL exist only at `locationKind` mind or palace. Any
operation that would create or move a `metis` instance to `locationKind` grimoire or library MUST be
refused. This invariant MUST be enforced at the instance store, so that operations added later
inherit it without restating it.

#### Scenario: Creating a grimoire instance of a mētis node is refused

- **WHEN** any operation attempts to create an instance of a `metis` node at `locationKind` grimoire
- **THEN** the operation is refused, no instance is created, and the refusal names the node's
  knowledge kind

#### Scenario: A mind instance of a mētis node is permitted

- **WHEN** teaching creates an instance of a `metis` node at `locationKind` mind
- **THEN** the instance is created and the invariant reports no violation

#### Scenario: The invariant holds for library aggregation

- **WHEN** a university aggregates grimoires into a library
- **THEN** no `metis` instance is among them, because none can exist at `locationKind` grimoire to
  aggregate

### Requirement: Scribing refuses a mētis node for a distinct reason

Scribing a `metis` node MUST be refused with a reason distinguishable from the refusal issued when
the active tradition's `store` kind forbids written storage. A caller MUST be able to tell "this
node cannot be written" from "this universe cannot write."

#### Scenario: Scribing a mētis node is refused by kind

- **WHEN** a scribing operation is invoked for a `metis` node in a universe whose tradition permits
  written storage, with sufficient capacity and materials
- **THEN** the operation is refused, no grimoire and no instance are created, and the refusal names
  the node's knowledge kind rather than the tradition's store kind

#### Scenario: The two refusals are distinguishable

- **WHEN** scribing is refused for a `metis` node and separately refused under a `palace` tradition
- **THEN** the two refusals carry different reason codes

### Requirement: Mētis transmits only by teaching or rediscovery

A `metis` node SHALL reach a mind that does not hold it only through teaching from a living holder,
or through rediscovery. No copying, loaning, gifting, or transfer-as-object path may create a
`metis` instance.

#### Scenario: Teaching transmits a mētis node

- **WHEN** a living teacher holding a `metis` node in mind teaches a student holding its
  prerequisites
- **THEN** a mind instance is created for the student under the ordinary teaching rules

#### Scenario: A dead teacher transmits nothing

- **WHEN** the only holder of a `metis` node is dead
- **THEN** no teaching operation naming that node can succeed, and the node is reachable only by
  rediscovery

### Requirement: Mētis is lost by succession failure

A `metis` node SHALL cease to exist in a universe when its last instance is destroyed, by the
ordinary last-instance rule. Because no grimoire or library instance can exist, the only destroying
event available is the death of a holder. A loss event MUST be emitted that identifies the loss as a
succession failure, distinguishably from a loss caused by destruction of written instances.

#### Scenario: The last holder dies untaught

- **WHEN** the sole holder of a `metis` node dies without having taught it
- **THEN** the node ceases to exist, and a loss event is emitted identifying succession failure

#### Scenario: A taught node survives its teacher

- **WHEN** the holder of a `metis` node has taught it to a living student and then dies
- **THEN** the node continues to exist and no loss event is emitted

#### Scenario: Succession loss is distinguishable from destruction loss

- **WHEN** an `episteme` node is lost to a library fire and a `metis` node is lost to a death
- **THEN** the two loss events carry different cause identifiers

### Requirement: Rediscovering mētis is costlier than rediscovering episteme

Rediscovery of a `metis` node SHALL cost more than rediscovery of an otherwise comparable `episteme`
node, because no text survives to work from. This MUST be expressed through the node's existing
`rediscoveryMultiplier` rather than through a second multiplier or a code path keyed on kind.

#### Scenario: Authored multipliers carry the cost

- **WHEN** the shipped content set is loaded
- **THEN** every `metis` node declares a `rediscoveryMultiplier` no lower than that of `episteme`
  nodes of the same tier in the same cell

#### Scenario: No code path keys on kind for cost

- **WHEN** rediscovery cost is computed
- **THEN** the computation reads `rediscoveryMultiplier` and does not branch on `knowledgeKind`

### Requirement: The harness reports mētis succession risk

The balance metric registry SHALL carry `metisSuccessionRisk`: the fraction of `metis` nodes known
to a universe whose every holder is within the final quantile of their species' lifespan and for
which no student is currently learning the node. The metric MUST report an unavailable status rather
than being absent when the mechanic is not present.

#### Scenario: A universe with a healthy pipeline reports low risk

- **WHEN** every `metis` node has at least one young holder or an active student
- **THEN** `metisSuccessionRisk` reports zero

#### Scenario: Ageing sole holders raise the metric

- **WHEN** a `metis` node's only holder enters the final quantile of their species' lifespan with no
  student learning it
- **THEN** `metisSuccessionRisk` rises, and rises again as further nodes reach that state

#### Scenario: The metric is never absent

- **WHEN** metrics are collected in a build where mētis is not yet implemented
- **THEN** the key is present with an unavailable status and a reason, not missing
