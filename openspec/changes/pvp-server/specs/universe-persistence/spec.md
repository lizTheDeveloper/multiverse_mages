## ADDED Requirements

### Requirement: The persistence boundary is the run boundary

A universe SHALL be persisted at run boundaries — the end of a run by ascension or by
extinguishment, and the start of the run that follows. Persistence MUST NOT be a per-tick write,
and the durability guarantee a permanent-consequence game requires SHALL be stated in terms of runs
rather than ticks: vision §8 makes casualties permanent and lost knowledge genuinely lost, so a
persisted universe that cannot be reloaded destroys a player's run.

#### Scenario: A run's end is durable before the next run begins

- **WHEN** a run ends by ascension or extinguishment
- **THEN** the universe's carried-forward state is durably written before any successor run is
  created from it

#### Scenario: A mid-run crash loses at most the current run's progress

- **WHEN** the server stops without warning mid-run
- **THEN** the last persisted run boundary is intact and reloadable

### Requirement: Persisted state reuses the snapshot format

Persisted universe state SHALL be `sim-core`'s snapshot bytes together with the seed and action log
that produced them, and MUST NOT be a second serialization. The stored form SHALL carry the
snapshot version and the content revision, and a load whose snapshot version is newer than the
running build's SHALL be refused rather than guessed at.

#### Scenario: A stored universe is byte-identical to what the core produced

- **WHEN** a universe is persisted and reloaded
- **THEN** its snapshot hash equals the hash at the moment it was written

#### Scenario: A future snapshot version is refused

- **WHEN** a stored universe declares a snapshot version newer than the running build supports
- **THEN** the load is refused with both versions named, rather than partially decoded

#### Scenario: An older snapshot version migrates or refuses explicitly

- **WHEN** a stored universe declares an older snapshot version
- **THEN** it is migrated through the registered migration chain, or the load is refused naming the
  missing migration

### Requirement: Cluster membership is part of a persisted universe's identity

A persisted universe SHALL carry a stable `universeId` and the `clusterId` of the group of
multiverses it belongs to. Cluster membership SHALL be the state that `direct-challenge`'s
reachability predicate reads, so that which universes can portal to which is a stored fact rather
than an assumption.

#### Scenario: Identity survives a run boundary

- **WHEN** a universe ends a run and its successor is created
- **THEN** the successor carries forward an identity that names which cluster it is in

#### Scenario: Reachability is answerable from storage alone

- **WHEN** two persisted universes are considered for a match
- **THEN** whether they may meet is decided from their stored cluster membership without consulting
  a live session

### Requirement: Prestige carries forward at a base set by how the run ended

Prestige SHALL carry across a run boundary, at a base determined by the ending: the ascension base
for a universe that ascended (vision §8a), and the stagnated base for a universe that ended
mageless or was extinguished by conquest. Prestige SHALL be read-only during a run
(`contracts.md` §1.1), and the authoritative value SHALL be the server's rather than any value a
participant announces.

#### Scenario: Ascension and extinguishment carry different bases

- **WHEN** two runs end, one by ascension and one by extinguishment
- **THEN** each successor universe is seeded with the base its ending prescribes, and the two
  differ

#### Scenario: A participant cannot raise its own prestige

- **WHEN** a participant announces a prestige value in its handshake
- **THEN** the announced value is advisory only and the server uses its stored value

#### Scenario: Prestige does not compound without bound

- **WHEN** prestige carry-forward is measured across successive runs
- **THEN** it stays within the bound that keeps §7's `prestigeAdvantage` under 60%, which vision §8a
  requires so the meta-game does not decide matches before they begin

### Requirement: Extinguishment by conquest transfers tribute and relocates the loser

A universe whose magic users are wiped out SHALL end its run as extinguished. Its populace,
materials and worship SHALL transfer to the conquering universe, and the extinguished player's
successor universe SHALL be created **in a different cluster**, carrying prestige at the stagnated
base. This is the first operation in the design that writes to a universe other than the one being
stepped, and it SHALL occur only at a run boundary, never during a tick.

#### Scenario: Tribute moves to the conqueror

- **WHEN** a universe is extinguished by conquest
- **THEN** its populace, materials and worship are added to the conqueror's persisted universe, and
  removed from the extinguished one

#### Scenario: The loser respawns elsewhere

- **WHEN** an extinguished player's successor universe is created
- **THEN** its cluster differs from the cluster it was extinguished in, so the conqueror keeps the
  tribute and loses the target

#### Scenario: A cross-universe write happens only at a run boundary

- **WHEN** a transfer on conquest is applied
- **THEN** it is applied at the run boundary, and no tick of either universe observes a partially
  applied transfer

#### Scenario: Extinguishment is an existing terminal state with a new consequence

- **WHEN** a universe becomes mageless
- **THEN** it reaches the terminal state the stagnation rules already recognise, and conquest adds
  the transfer and relocation to that ending rather than introducing a new one

### Requirement: What survives a raid is what came home

State written back from an engagement into a universe SHALL reflect that casualties are permanent
and that knowledge whose last instance died is lost. A mage that does not survive SHALL NOT return
to teach, and knowledge held only by that mage SHALL be lost rather than silently retained.

#### Scenario: A dead mage does not come home

- **WHEN** a raid resolves and a participating mage did not survive
- **THEN** that mage is absent from the universe's persisted state and teaches nothing afterwards

#### Scenario: Knowledge whose last instance died is lost

- **WHEN** the only surviving instance of a node was held by a mage who died in a raid
- **THEN** that node is no longer known to the universe and must be rediscovered

#### Scenario: Engagement entities are not persisted

- **WHEN** a universe is written at a run boundary
- **THEN** its snapshot contains no engagement-only entities, per `contracts.md` §1.6

### Requirement: Loading refuses rather than guessing

A stored universe SHALL be refused if its content revision, snapshot version or schema version
cannot be satisfied by the running build. The server MUST NOT load a universe partially, substitute
defaults for fields it does not understand, or admit a refused universe to a match.

#### Scenario: A universe from another content revision is not admitted

- **WHEN** a stored universe's content revision differs from the running build's
- **THEN** it is refused with both revisions named, and cannot enter a match

#### Scenario: A refusal is diagnosable

- **WHEN** any load is refused
- **THEN** the refusal names the universe, the field that disagreed, and both values
