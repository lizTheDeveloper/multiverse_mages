## ADDED Requirements

### Requirement: Raid consequences are applied to world state as one atomic delta

At resolution the engine SHALL compute a complete raid outcome record and apply it to both
participants' world states in a single atomic step. A raid MUST NOT leave either world state partially
updated. Application order MUST be: casualties, stranded raiders, knowledge instance destruction and
transfer, theft insertion, then existence recomputation.

#### Scenario: Interrupted application leaves no partial state

- **WHEN** applying a raid outcome fails partway through
- **THEN** neither universe's world state reflects any part of the outcome

#### Scenario: The outcome record is complete before application

- **WHEN** a raid resolves
- **THEN** the outcome record names every casualty, every destroyed instance, every transferred
  grimoire, and every stolen node before any world state is written

#### Scenario: Both universes are updated

- **WHEN** a raid produces losses on both sides
- **THEN** the attacker's universe and the host's universe are both updated in the same atomic step

### Requirement: Casualties are permanent

A combatant reduced to zero hit points whose `sourceKind` is mage SHALL set `alive = false` on its
source mage in its own universe. A soldier detachment reduced to zero SHALL decrement its source
populace cohort's count by the detachment's strength. Summons MUST write back nothing. No mechanism in
this change may restore a mage killed in a raid.

#### Scenario: A dead raider is dead at home

- **WHEN** an attacking mage combatant is reduced to zero hit points
- **THEN** the source mage in the attacker's universe is marked not alive, and the raid outcome record
  names it

#### Scenario: Detachment losses reduce a cohort

- **WHEN** a soldier detachment backed by a counted portion of a cohort is destroyed
- **THEN** that cohort's count decreases by exactly the detachment's strength and never below zero

#### Scenario: Summons leave no trace

- **WHEN** every summoned combatant in a raid is destroyed
- **THEN** no world-state entity in either universe changes on account of them

#### Scenario: There is no resurrection path

- **WHEN** the conformance check scans raid consequences for any write setting a mage's `alive` flag
  to true
- **THEN** it finds none and fails naming the file if one exists

### Requirement: Raiders stranded at portal collapse are lost

Attacker combatants stranded at portal collapse SHALL be lost permanently. This applies to any
attacker combatant that has not returned through the portal position when portal stability reaches
zero, and it takes with it everything that combatant carried, including knowledge stolen during the
raid. This rule is a tunable placeholder.

#### Scenario: A stranded raider dies

- **WHEN** an attacking mage combatant is still on the battlefield when the portal collapses
- **THEN** its source mage is marked not alive and no knowledge it stole is inserted into the
  attacker's universe

#### Scenario: A withdrawn raider survives

- **WHEN** an attacking mage combatant reaches the portal position and withdraws before collapse
- **THEN** its source mage remains alive, and anything it stole is inserted into the attacker's
  universe

#### Scenario: Withdrawal is a combatant decision, not a god action

- **WHEN** the action mask is inspected during engagement mode
- **THEN** no action exists by which the god may order a withdrawal, and withdrawal is scored by the
  combatant's own utility goals

### Requirement: Destroyed knowledge instances are destroyed permanently

Burning a library SHALL destroy every knowledge instance located at that library. Burning a grimoire
SHALL destroy its instance. A mage's death SHALL destroy the instances located in that mage's mind and
memory palace through the normal knowledge-model path. Instance destruction MUST be irreversible
within this change; recovery is only possible through rediscovery, which `knowledge-model` owns.

#### Scenario: A burned library loses its contents

- **WHEN** a library objective is destroyed in a raid
- **THEN** every knowledge instance located at that library is removed from the host universe on
  write-back

#### Scenario: A dead mage's mind is emptied

- **WHEN** a mage combatant is killed
- **THEN** the instances located in that mage's mind are destroyed

#### Scenario: A memory palace dies with its holder and cannot be burned

- **WHEN** an Art of Memory mage is killed in a raid, and separately when a library in that universe
  is burned
- **THEN** the palace instances are destroyed by the death and are untouched by the burning, because
  the home `store` hook declares them unburnable

#### Scenario: Dwarven grimoires resist destruction

- **WHEN** grimoires of differing durability are subjected to the same burning attempt
- **THEN** the higher-durability grimoire survives more often, and durability enters the roll on RNG
  stream 5

### Requirement: A node is lost when its last instance is destroyed

When the last knowledge instance of a node in a universe is destroyed, that node SHALL cease to exist
in that universe. Existence MUST be recomputed from the instance index after the outcome is applied
and MUST NOT be cached in state. Nodes lost in a raid MUST be recorded in the outcome record for
balance metrics.

#### Scenario: The last instance burns

- **WHEN** a library holds the only surviving instance of a node and is burned
- **THEN** that node no longer exists in the host universe, and relearning it requires rediscovery at
  the rediscovery multiplier

#### Scenario: A redundant instance survives the loss

- **WHEN** a burned library held one of two instances of a node
- **THEN** the node still exists in the universe and no loss is recorded for it

#### Scenario: Existence is never cached

- **WHEN** the conformance check scans for a stored field asserting that a node exists in a universe
- **THEN** it finds none and fails naming the file if one exists

#### Scenario: Knowledge loss stays within its band

- **WHEN** a Monte Carlo sweep including raids is run
- **THEN** `libraryDependence` is reported per run and stays within its committed band

### Requirement: Knowledge theft is cell-gated and resolved on its own stream

The `knowledge-steal` primitive SHALL be carried only by nodes in cells concentrated on
`intellego-mentem` and `rego-nomen`. A theft attempt MUST be legal only if `permits` returns true for
the stealing node's cell against the **host** ruleset snapshot. Attempts MUST resolve on RNG stream 9,
and `knowledge-steal` magnitudes MUST stack by maximum rather than by sum, per `contracts.md` §3.

#### Scenario: A host that forbids mind-reading cannot be mind-read

- **WHEN** a raider holding an `intellego-mentem` theft node raids a universe that forbids `mentem`
- **THEN** no theft attempt is possible, no draw is made on stream 9, and `forbiddenCastsBlocked`
  records nothing because the node was never a candidate

#### Scenario: The attacker's own prohibition does not protect the host

- **WHEN** a raider whose home universe forbids `rego-nomen` holds a `rego-nomen` theft node and raids
  a host that permits it
- **THEN** the theft attempt proceeds under the host's ruleset

#### Scenario: Two steal sources take the maximum

- **WHEN** a thief benefits from two `knowledge-steal` sources of differing magnitude
- **THEN** the attempt probability equals the larger magnitude, not their sum

#### Scenario: A defender may steal too

- **WHEN** a defending mage holds a theft node whose cell her universe permits and an attacker is
  within range and line of sight
- **THEN** she may attempt theft against the attacker on the same terms

### Requirement: Reading a mind copies, looting a grimoire moves, burning destroys

Theft from a mind SHALL create a copy, leaving the target's instance intact. Looting a grimoire SHALL
transfer that grimoire and its instance from the host universe to the raider. Burning SHALL destroy
without transfer. The three verbs MUST produce distinct outcomes in the outcome record.

#### Scenario: Mind theft leaves the victim's knowledge intact

- **WHEN** a raider successfully steals a node from a living mage's mind
- **THEN** the victim retains her instance and the raider gains a new one

#### Scenario: Looting removes the grimoire from the host

- **WHEN** a raider loots a grimoire from a library
- **THEN** the grimoire and its instance leave the host universe and enter the attacker's, and the
  host's instance count for that node decreases

#### Scenario: Burning gives nothing to the attacker

- **WHEN** a raider burns a library rather than looting it
- **THEN** the host loses those instances and the attacker gains none

#### Scenario: A memory palace cannot be looted

- **WHEN** a raider attempts to loot instances held in a defender's memory palace
- **THEN** the attempt is impossible, because the defender's home `store` hook declares palace
  instances unlootable

### Requirement: Stolen knowledge is retained only by a raider who returns alive

A stolen knowledge instance SHALL be created in the thief's universe only if the thief survives the
raid and has withdrawn through the portal. Insertion MUST occur before existence is recomputed, so
that a node whose last host instance was destroyed in the same raid survives in the thief's universe.
The inserted instance MUST have zero mastery and an `acquiredTick` equal to the world tick at which
the raid resumes.

#### Scenario: Theft outruns loss

- **WHEN** a raider steals the only instance of a node from a mage's mind and that mage is killed
  later in the same raid
- **THEN** the node ceases to exist in the host universe and exists in the raider's universe

#### Scenario: A killed thief loses what she took

- **WHEN** a raider steals a node and is then killed before withdrawing
- **THEN** no instance is created in her universe and the outcome record notes the theft as forfeited

#### Scenario: Stolen knowledge starts unmastered

- **WHEN** a stolen instance is inserted into the thief's universe
- **THEN** its mastery is zero, so it cannot be taught onward without further study

#### Scenario: Stolen knowledge may be inert at home

- **WHEN** a raider returns with a node whose cell her own universe forbids
- **THEN** the instance exists in her universe, counts toward that node's existence, and is uncastable
  there until the cell is permitted

### Requirement: The outcome record supplies the balance harness

Each raid SHALL emit an outcome record naming the victor, the resolution tick, per-side casualties,
objectives by final status, nodes lost per universe, nodes stolen, and the counts of blocked forbidden
casts and cap clamps. The record MUST be sufficient to compute `raidLengthDistribution`,
`libraryDependence`, and the raid contribution to `winRateByPrimitive` without re-simulating.

#### Scenario: Every raid emits a record

- **WHEN** a Monte Carlo sweep of raids completes
- **THEN** every raid has an outcome record and no metric is missing from any record

#### Scenario: Primitive attribution is derivable

- **WHEN** an ablation run disables one combat primitive across a sweep
- **THEN** the change in attacker win rate is computable from outcome records alone

#### Scenario: The arbitration invariant is reported

- **WHEN** a sweep completes
- **THEN** the aggregate `forbiddenCastsBlocked` count is reported explicitly, and a non-zero value
  fails the balance gate
