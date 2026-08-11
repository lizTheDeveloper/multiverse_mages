## MODIFIED Requirements

### Requirement: The Art of Memory hooks store only

The Art of Memory tradition SHALL declare `store` of kind `palace`, with `acquire`, `cast`, and
`cost` of kind `standard`. Under `palace`, every node in the universe MUST be treated as
`knowledgeKind` `metis` regardless of its authored kind, so that the tradition is a statement about
all knowledge in that universe rather than a storage location with unusual properties. Knowledge
instances MUST be created at `locationKind` palace bounded by the declared `slotsPerMage`, scribing
MUST be unavailable so that no grimoire or library instance can be created, palace instances MUST
NOT be lootable or transferable as objects, and every palace instance MUST be destroyed when its
holder dies. A university's effective library depth under `palace` MUST be computed from the palaces
of its affiliated living mages, scaled by the declared depth coefficient.

#### Scenario: Palace slots are bounded

- **WHEN** a mage with `slotsPerMage` of twelve acquires a thirteenth node
- **THEN** the acquisition is refused and the slot count is named

#### Scenario: Scribing is unavailable

- **WHEN** any scribing operation is invoked in an Art of Memory universe
- **THEN** it is refused and no grimoire or library instance is created

#### Scenario: A palace dies with its holder

- **WHEN** the holder of a palace instance dies and that instance was the node's last
- **THEN** the instance is destroyed, the node ceases to exist, and a loss event is emitted naming
  the palace location kind

#### Scenario: Palaces supply library depth

- **WHEN** a university in an Art of Memory universe has three affiliated living mages holding
  palace instances, and one of them dies
- **THEN** the reported library depth for that university falls, without any instance being
  transferred or written

#### Scenario: The depth coefficient is a parameter

- **WHEN** the `palace` hook's depth coefficient is set to zero in content
- **THEN** Art of Memory universities report zero library depth, and no code changed

#### Scenario: An authored episteme node is mētis under the Art of Memory

- **WHEN** a node authored as `knowledgeKind` `episteme` is known in an Art of Memory universe
- **THEN** it is treated as `metis` for every operation, and its loss on the death of its last
  holder is reported as succession failure

#### Scenario: The override is universe-scoped, not content-scoped

- **WHEN** the same content set is loaded under a tradition other than the Art of Memory
- **THEN** the node's authored `knowledgeKind` applies unchanged, and the content file is not
  rewritten
