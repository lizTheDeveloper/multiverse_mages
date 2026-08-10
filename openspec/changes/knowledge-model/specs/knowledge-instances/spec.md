## ADDED Requirements

### Requirement: Knowledge operations are pure functions over supplied inputs

Every knowledge operation SHALL be a pure function taking the world-side values it needs — learn
rate, retention, scribe affinity, rediscovery affinity, available scribe capacity, and materials —
as explicit parameters, and MUST treat mage, grimoire, and library identifiers as opaque handles.
`rules-magic` MUST NOT import `rules-world`, and MUST NOT read species or populace records directly.

#### Scenario: Rates arrive as parameters

- **WHEN** a research operation is invoked with an explicit learn rate and research-rate multiplier
- **THEN** the operation produces its result from those parameters alone, without looking up a
  species record

#### Scenario: Handles are opaque

- **WHEN** a teaching operation is invoked with teacher and student handles that refer to no
  registered mage record in `rules-world`
- **THEN** the operation still resolves against the knowledge instance index and returns a result,
  because it never dereferences the handles into world entities

#### Scenario: Boundary is enforced

- **WHEN** the dependency-graph test inspects `packages/rules-magic`
- **THEN** it finds no import of `rules-world`, in either direction

### Requirement: Research derives a node from held prerequisites

Research SHALL accumulate progress toward a node whose prerequisites the subject already holds as
usable instances, and MUST refuse to progress when the node's cell is not permitted or a
prerequisite is unheld. Accumulated progress is compared against the node's `researchCost` scaled by
the supplied learn rate and stacked `research-rate` multiplier. Any stochastic outcome in research
MUST draw from RNG stream 3.

#### Scenario: Research completes and creates a mind instance

- **WHEN** a subject holding all prerequisites accumulates research progress reaching the scaled
  `researchCost` for a node in a permitted cell
- **THEN** a knowledge instance is created at `locationKind` mind for that subject, with
  `acquiredTick` set to the current world tick and mastery at the declared initial value

#### Scenario: Research refuses a forbidden cell

- **WHEN** a research operation targets a node whose cell is interdicted
- **THEN** no progress accumulates, no instance is created, and the refusal names the cell

#### Scenario: Research refuses on a missing prerequisite

- **WHEN** a research operation targets a node one of whose prerequisites the subject does not hold
- **THEN** no progress accumulates and the unsatisfied prerequisite is named

#### Scenario: Research draws only from its own stream

- **WHEN** an additional random draw is added to research and the simulation is rerun from the same
  root seed
- **THEN** the sequences drawn by teaching, scribing, and theft are unchanged

### Requirement: Teaching transmits mind to mind with mastery loss

Teaching SHALL create a mind instance for a student from a teacher's mind or palace instance of the
same node, and MUST require that the node's cell is permitted, the student holds every prerequisite,
the teacher's instance is not dormant, and the teacher's mastery is at or above the declared
teaching-eligibility threshold. A teacher below `fp(1024)` mastery MUST produce a student instance
whose mastery is reduced in proportion to the teacher's shortfall; a teacher at `fp(1024)` MUST
produce no reduction. Any stochastic outcome in teaching MUST draw from RNG stream 4.

#### Scenario: A fully masterful teacher transmits without loss

- **WHEN** a teacher at `fp(1024)` mastery teaches a node to a student holding its prerequisites
- **THEN** a student mind instance is created and its mastery carries no transmission reduction

#### Scenario: A partially masterful teacher transmits with loss

- **WHEN** a teacher above the eligibility threshold but below `fp(1024)` teaches the same node
- **THEN** the student's instance is created at a mastery reduced in proportion to the teacher's
  shortfall

#### Scenario: Degradation compounds across a chain

- **WHEN** a below-mastery teacher teaches a student who, without further practice, teaches a third
  mage
- **THEN** the third mage's mastery is lower than the second's, which is lower than the first's

#### Scenario: An ineligible teacher cannot teach

- **WHEN** a teacher's mastery is below the teaching-eligibility threshold
- **THEN** the operation is refused, no student instance is created, and the refusal names the
  threshold

#### Scenario: Teaching refuses on a missing prerequisite

- **WHEN** the student does not hold every prerequisite of the node
- **THEN** the operation is refused and the unsatisfied prerequisite is named

### Requirement: Scribing writes a mind instance into a grimoire

Scribing SHALL create a grimoire holding exactly one node, together with a knowledge instance at
`locationKind` grimoire, consuming supplied scribe capacity and materials. The operation MUST refuse
when the node's cell is not permitted, when the source instance is dormant, when the active
tradition's `store` kind does not permit written storage, or when supplied capacity or materials are
insufficient. The grimoire's `durability` MUST be derived from the supplied scribe affinity. Any
stochastic outcome in scribing, including durability rolls, MUST draw from RNG stream 5.

#### Scenario: Scribing produces a grimoire and an instance

- **WHEN** a scribing operation is supplied sufficient scribe capacity and materials for a node the
  source holds in mind, in a permitted cell
- **THEN** a grimoire is created carrying that node, a knowledge instance is created at
  `locationKind` grimoire referencing it, and the supplied capacity and materials are reported as
  consumed

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

### Requirement: Instance location follows its grimoire's holder

Exactly one knowledge instance SHALL exist per written copy. That instance MUST carry
`locationKind` grimoire with `locationId` set to the grimoire handle while the grimoire is held by a
mage or in transit, and `locationKind` library with `locationId` set to the library handle while the
grimoire is shelved in a library. Shelving and withdrawal MUST rewrite the instance's location
rather than creating or destroying an instance, and the grimoire-to-instance association MUST live in
a subsystem-owned index keyed on the grimoire handle, never in a state field.

#### Scenario: Shelving rewrites location without changing the count

- **WHEN** a grimoire held by a mage is shelved in a library
- **THEN** the instance's `locationKind` becomes library and its `locationId` becomes the library
  handle, and the total instance count for that node is unchanged

#### Scenario: Withdrawal reverses the rewrite

- **WHEN** the same grimoire is withdrawn from the library into a mage's hands
- **THEN** the instance's `locationKind` returns to grimoire with the grimoire handle, and the count
  is again unchanged

#### Scenario: A written copy is never double-counted

- **WHEN** the instance index is queried for a node whose only copy is a shelved grimoire
- **THEN** the reported instance count is exactly one

#### Scenario: Destroying a shelved grimoire destroys its instance

- **WHEN** a grimoire shelved in a library is destroyed
- **THEN** the instance whose `locationId` was that library and which the index associates with that
  grimoire is destroyed, and no other instance is affected

### Requirement: Mastery rises with practice and decays deterministically

Mastery SHALL change only for instances at `locationKind` mind or palace; grimoire and library
instances MUST NOT decay. Decay MUST be a deterministic function of elapsed world ticks, the supplied
retention value, and dormancy, and MUST NOT draw from any RNG stream. A non-dormant instance MUST NOT
decay below a floor derived from the supplied retention. A dormant instance MUST have no floor, and
MUST be destroyed when its mastery reaches zero.

#### Scenario: Written knowledge does not decay

- **WHEN** a library instance is carried forward one hundred world ticks
- **THEN** its mastery is unchanged

#### Scenario: Held knowledge decays to its retention floor and stops

- **WHEN** a non-dormant mind instance is carried forward until its mastery reaches the
  retention-derived floor, and then carried forward one hundred further ticks
- **THEN** its mastery equals the floor at both points and the instance still exists

#### Scenario: Higher retention yields a higher floor

- **WHEN** two otherwise identical mind instances decay under supplied retentions of `fp(1536)` and
  `fp(768)`
- **THEN** the instance under the higher retention settles at a strictly higher floor

#### Scenario: Dormant knowledge decays to nothing and is lost

- **WHEN** a mind instance in an interdicted cell is carried forward long enough for its mastery to
  reach zero
- **THEN** the instance is destroyed, and if it was the last instance the node ceases to exist in
  the universe

#### Scenario: Decay is deterministic

- **WHEN** the same decay computation is performed twice with identical ticks, retention, and
  dormancy
- **THEN** the results are identical, and no RNG stream advanced in either computation

### Requirement: Node existence is derived from the instance index

Whether a node exists in a universe SHALL be `count(instances of nodeId) > 0`, computed from an index
maintained incrementally by the knowledge subsystem. No component array, snapshot field, or cached
flag may record existence. The index MUST expose the per-node instance count so that
`libraryDependence` — nodes surviving on exactly one instance — is computable without a scan.

#### Scenario: Existence follows the last instance

- **WHEN** a node's instance count falls from one to zero
- **THEN** the node is reported as not existing in the universe, and no state field was written to
  record that

#### Scenario: Existence returns when an instance returns

- **WHEN** an instance of a previously non-existent node is created by a founding-knowledge grant
- **THEN** the node is immediately reported as existing

#### Scenario: Single-instance nodes are enumerable

- **WHEN** the index is queried for nodes whose instance count is exactly one
- **THEN** it returns them without iterating every instance in the world

#### Scenario: No cached existence flag

- **WHEN** the conformance check scans world state component definitions for a per-node existence
  or "known" boolean
- **THEN** it finds none

### Requirement: Knowledge loss is observable when the last instance is destroyed

Destroying the last surviving instance of a node SHALL remove that node from the universe and MUST
emit a loss event naming the node, the world tick, and the location kind of the destroyed instance.
A node that has left the universe MUST NOT be teachable or scribable by anyone, and MUST NOT satisfy
any prerequisite.

#### Scenario: The last instance dies with its holder

- **WHEN** the only instance of a node is a mind instance and its holder's instances are destroyed
- **THEN** the node ceases to exist, a loss event is emitted naming the node and the mind location
  kind, and no further teaching of that node succeeds

#### Scenario: The last instance burns in a library

- **WHEN** the only instance of a node is shelved in a library and that library is destroyed
- **THEN** the node ceases to exist and a loss event is emitted naming the library location kind

#### Scenario: Losing one of several instances is not a loss

- **WHEN** a node has three instances and one is destroyed
- **THEN** the node continues to exist and no loss event is emitted

#### Scenario: A lost node cannot be taught

- **WHEN** a teaching operation names a node that no longer exists in the universe
- **THEN** the operation is refused and the refusal states that no instance survives

### Requirement: Rediscovery costs at least three times research

A node that has previously existed in the universe and whose instances have all been destroyed SHALL
be re-derivable only by rediscovery, at a cost of `researchCost` multiplied by the node's
`rediscoveryMultiplier` and then by the supplied `rediscoveryAffinity`. The resulting effective
multiplier MUST be clamped to a floor of `fp(3072)`, so no rediscovery ever completes below three
times the node's `researchCost`. Content validation MUST reject any node declaring a
`rediscoveryMultiplier` below `fp(3072)`. Distinguishing a lost node from a never-known one MUST use
a persisted per-node ever-known record, set on first instance creation and never cleared.

#### Scenario: Rediscovery costs the declared multiplier

- **WHEN** a lost node with `researchCost` `fp(4096)` and `rediscoveryMultiplier` `fp(4096)` is
  rediscovered by a subject whose `rediscoveryAffinity` is `fp(1024)`
- **THEN** the required progress is `fp(4096)` multiplied by `fp(4096)`, and completion below that
  does not create an instance

#### Scenario: Affinity differentiates above the floor

- **WHEN** the same node is rediscovered by subjects with `rediscoveryAffinity` `fp(768)` and
  `fp(1024)`
- **THEN** the subject with the lower affinity requires strictly less progress, and both requirements
  remain at or above three times `researchCost`

#### Scenario: The floor holds against a strong affinity

- **WHEN** a node with `rediscoveryMultiplier` `fp(3072)` is rediscovered by a subject with
  `rediscoveryAffinity` `fp(512)`
- **THEN** the effective multiplier is clamped to `fp(3072)` and the required progress is exactly
  three times `researchCost`

#### Scenario: A never-known node is ordinary research

- **WHEN** a subject researches a node that has never had an instance in this universe
- **THEN** the ordinary `researchCost` applies and no rediscovery multiplier is used

#### Scenario: Content below the floor is rejected

- **WHEN** content declares a node with `rediscoveryMultiplier` `fp(2048)`
- **THEN** the load fails and the error names the node and the `fp(3072)` minimum

#### Scenario: The ever-known record survives a snapshot round trip

- **WHEN** a universe that has lost a node is snapshotted and restored
- **THEN** re-deriving that node still costs rediscovery, not ordinary research

### Requirement: Library depth is published, not applied

The knowledge subsystem SHALL expose `libraryDepth(libraryId)` as a function of the instances stored
there, weighted by node tier, and MUST NOT itself apply that value to university output, research
throughput, or any other world-scale quantity. Dormant instances MUST NOT contribute to depth.

#### Scenario: Depth rises with stored instances

- **WHEN** a second tier-3 instance is shelved in a library
- **THEN** the reported depth is strictly greater than before

#### Scenario: Depth is tier-weighted

- **WHEN** two libraries hold the same instance count, one entirely tier-1 and one entirely tier-5
- **THEN** the tier-5 library reports the greater depth

#### Scenario: Dormant stored knowledge is worth nothing

- **WHEN** every node stored in a library is interdicted
- **THEN** the reported depth is zero and no instance is destroyed

#### Scenario: Depth is not applied here

- **WHEN** the conformance check scans `rules-magic` for use of `libraryDepth` in a throughput or
  output computation
- **THEN** it finds none, and the only use is the published accessor
