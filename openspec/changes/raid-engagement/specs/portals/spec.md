## ADDED Requirements

### Requirement: Portal opening is gated by the attacker's ruleset and knowledge

Opening a portal SHALL require all of the following in the attacking universe: `permits()` returning
true for `rego-limen` against that universe's own ruleset, at least one living mage holding a
knowledge instance of a node whose effects include the `portal` primitive, and sufficient favor for
the open-portal action. The host universe's ruleset MUST NOT be consulted when deciding whether a
portal may open. Failing any gate MUST leave the action masked, so that submitting it yields a no-op
and an illegal-action counter increment rather than an exception or a partial raid.

#### Scenario: All gates satisfied

- **WHEN** the attacking universe permits `rego-limen`, has a living mage holding a node carrying the
  `portal` primitive, and holds sufficient favor
- **THEN** the open-portal action is unmasked, and submitting it creates a raid and enters engagement
  mode

#### Scenario: Attacker forbids the portal cell

- **WHEN** the attacking universe forbids `rego-limen`, whether by axis or by interdiction
- **THEN** the open-portal action is masked, no raid is created, and the universe's world state is
  unchanged

#### Scenario: Portal knowledge has been lost

- **WHEN** the last knowledge instance of every node carrying the `portal` primitive is destroyed in
  the attacking universe
- **THEN** the open-portal action becomes masked for that universe until such a node is rediscovered
  or re-taught

#### Scenario: Host forbidding the portal cell does not confer immunity

- **WHEN** the host universe forbids `rego-limen` and the attacking universe permits it and satisfies
  every other gate
- **THEN** the portal opens and the raid proceeds normally

### Requirement: A raid pairs two persisted universe snapshots

Opening a portal SHALL pair exactly two persisted universe snapshots — the attacker's and the host's
— and MUST record the host as the defender in `RaidState`. The resulting raid MUST be a reproducible
function of the attacker snapshot, the host snapshot, and the raid seed alone; no wall-clock value,
no ambient state, and no input outside that triple may influence its outcome.

#### Scenario: Same inputs produce the same raid

- **WHEN** the same attacker snapshot, host snapshot, and raid seed are resolved twice in separate
  processes
- **THEN** both raids produce byte-identical outcome records and identical resolution ticks

#### Scenario: The host is always the defender

- **WHEN** a raid is created from an open-portal action
- **THEN** `hostUniverseId` names the universe that was targeted, and combatants derived from that
  universe carry `side = 1`

#### Scenario: A differing seed produces a differing raid

- **WHEN** two raids are resolved from identical snapshots and different raid seeds
- **THEN** their terrain, deployment, and objective placement differ, and both remain individually
  reproducible

### Requirement: The ruleset in force is captured as an immutable snapshot at portal open

At portal open the engine SHALL capture, for each participating universe, an immutable ruleset
snapshot carrying that universe's `permittedTechniques`, `permittedForms`, `edicts`, and
`traditionId`. All legality and tradition decisions during the raid MUST read these snapshots and
MUST NOT dereference a live universe entity. The snapshots MUST NOT be mutable for the raid's
duration.

#### Scenario: Arbitration reads the snapshot, not live state

- **WHEN** any code path evaluates casting legality during engagement mode
- **THEN** the conformance check confirms it passed a ruleset snapshot to `permits()`, and fails
  naming the file if a live universe entity was passed instead

#### Scenario: A mutation attempt on a captured snapshot fails

- **WHEN** code attempts to modify a captured ruleset snapshot during a raid
- **THEN** the operation fails in development builds and the conformance test fails in CI

#### Scenario: Both participants' rulesets are captured

- **WHEN** a raid begins
- **THEN** `RaidState` carries a ruleset snapshot for the host and one for the attacker, and the
  attacker's tradition identity is readable from the attacker snapshot

### Requirement: Entering a raid pauses world time for both participants

Entering engagement mode SHALL suspend world-tick advancement for both participating universes and
advance only the engagement tick. On resolution, both universes' world clocks MUST resume at exactly
the world tick they held when the portal opened; a raid SHALL consume zero world ticks.

#### Scenario: World tick frozen during engagement

- **WHEN** a raid is in progress and the simulation is stepped repeatedly
- **THEN** the engagement tick advances on every step and both participants' world ticks are
  unchanged

#### Scenario: World time resumes without loss

- **WHEN** a raid resolves after any number of engagement ticks
- **THEN** both universes resume at the world tick recorded at portal open, and no world-time process
  — ageing, research, teaching, construction, or births — has advanced

#### Scenario: World-time cost is favor, not ticks

- **WHEN** a raid resolves
- **THEN** the only world-scale resource consumed by the act of raiding is the favor charged for the
  open-portal action

### Requirement: The ruleset is frozen for the duration of a raid

Actions that alter a ruleset MUST be masked for the whole duration of a raid, per
`contracts.md` §4.2 — permitting or forbidding a technique or form, issuing or revoking an edict, and
changing tradition are all unavailable while `clock.mode == engagement`. Independently of that mask,
arbitration MUST continue to read the ruleset snapshots captured at portal open, so that a bypassed
mask cannot change what functions inside the raid.

#### Scenario: A rules-change action mid-raid is a no-op

- **WHEN** an agent submits a permit-technique action during engagement mode
- **THEN** the action is rejected by the mask, the illegal-action counter increments, no exception is
  raised, and the universe's ruleset is unchanged

#### Scenario: A live ruleset change cannot reach an in-progress raid

- **WHEN** a universe's live ruleset is altered by any means while a raid referencing it is in
  progress
- **THEN** every legality decision in that raid continues to resolve against the snapshot captured at
  portal open

### Requirement: Nested raids are forbidden

The open-portal action MUST be masked while `clock.mode == engagement`. A universe SHALL participate
in at most one raid at a time, and a raid MUST NOT be created from within a raid.

#### Scenario: Opening a portal during a raid is rejected

- **WHEN** an agent submits the open-portal action while a raid is in progress
- **THEN** the action is masked, no second raid is created, and the in-progress raid is unaffected

#### Scenario: Engagement state holds exactly one raid

- **WHEN** engagement mode is active
- **THEN** exactly one `RaidState` exists, and creating a second fails the conformance test

### Requirement: Raid resolution exits engagement mode and discards engagement state

On resolution the engine SHALL apply the raid outcome to both universes' world states, discard every
engagement-only entity, and return the clock to world mode. Combatants, terrain, the spatial index,
objectives, and the ruleset snapshots MUST NOT survive resolution or appear in any world snapshot.

#### Scenario: Engagement entities do not survive resolution

- **WHEN** a raid resolves
- **THEN** no combatant, objective, terrain grid, or spatial index entity remains in state, and the
  clock reports world mode

#### Scenario: A world snapshot taken mid-raid excludes engagement state

- **WHEN** a world snapshot is taken while a raid is in progress
- **THEN** the snapshot records the clock mode and engagement tick but contains no combatant,
  objective, or terrain records

#### Scenario: A universe that never raids is unaffected by this capability

- **WHEN** a universe is simulated for the full length of a run without opening or receiving a portal
- **THEN** its final snapshot hash is identical to the hash produced before this capability existed
