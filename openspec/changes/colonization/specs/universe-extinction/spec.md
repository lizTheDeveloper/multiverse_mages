## ADDED Requirements

### Requirement: Extinction is the existing mageless ending with an attribution added

The engine SHALL NOT introduce a new terminal condition. A universe is extinguished when the existing
mageless stagnation condition fires — `magelessTicks` reaching `stagnation-mageless-ticks` — and the
only thing this capability adds is whether a conqueror is attributed to it. A universe that reaches
that condition with no attributed conqueror MUST end exactly as it does today, as `stagnation`.

#### Scenario: An unattributed mageless universe still stagnates

- **WHEN** a universe reaches `stagnation-mageless-ticks` consecutive mageless world ticks and no
  conqueror is attributed
- **THEN** its terminal reason is `stagnation`, no colony is created, and its prestige is computed
  exactly as it is today

#### Scenario: The mageless counter still resets on any living mage

- **WHEN** a single mage exists in a universe that has accumulated mageless ticks
- **THEN** the mageless counter returns to zero, and extinction requires a fresh run of
  `stagnation-mageless-ticks` consecutive mageless ticks

#### Scenario: No new raid objective is introduced

- **WHEN** the conformance check enumerates raid objective kinds
- **THEN** it finds exactly the kinds `raid-engagement` defines, and none added by this change

### Requirement: A per-attacker kill ledger records who killed a universe's mages

The engine SHALL accumulate, in the defender's world state, a count of mage casualties attributable to
each attacking universe, written by the raid consequence path at the same moment a mage is marked not
alive. The ledger MUST survive between raids, because the mage whose death empties a universe is
frequently one who died of old age rather than in combat.

#### Scenario: A casualty increments the attacker's entry

- **WHEN** a raid consequence marks an attacker-killed mage not alive
- **THEN** the defender's ledger entry for that attacking universe increases by exactly one

#### Scenario: Deaths from mortality are attributed to nobody

- **WHEN** a mage dies of age, or of any cause outside a raid
- **THEN** no ledger entry changes

#### Scenario: The ledger persists across raids

- **WHEN** a universe is raided by the same attacker twice with world ticks in between
- **THEN** the ledger entry for that attacker reflects the sum of both raids

### Requirement: Conquest is claimed, not inferred

A conqueror SHALL be attributed only by an explicit claim action taken within a bounded window after
the mageless condition fires, at a favor cost, and only by a universe holding a non-zero entry in the
extinguished universe's kill ledger. An unclaimed window MUST expire into ordinary stagnation. The
claim window length and favor cost are authored content constants carrying `tuningStatus: "untuned"`.

#### Scenario: A claim outside the window fails

- **WHEN** a god submits a claim after the claim window has expired
- **THEN** the action is a no-op with an illegal-action counter increment, never an exception, and the
  extinguished universe remains a stagnation

#### Scenario: A claim by a universe that killed nothing fails

- **WHEN** a god submits a claim against a universe whose kill ledger holds no entry for them
- **THEN** the action is a no-op with an illegal-action counter increment

#### Scenario: Competing claims resolve to the largest ledger entry

- **WHEN** two universes both claim the same extinguished universe within the window
- **THEN** the claim of the universe holding the larger kill-ledger entry succeeds and the other is a
  no-op, and ties resolve deterministically by universe identity rather than by submission order

### Requirement: A conquered run has its own terminal reason and its own price

The engine SHALL record a terminal reason distinct from `stagnation` for a claimed extinction, and the
prestige computation MUST branch on it explicitly rather than falling through to the cutoff case. A
new terminal reason added without an explicit branch would pay `prestige-base-cutoff`, which is
greater than what a stagnated run pays, and that is the defect this requirement exists to prevent.
**What a conquered run is worth is an open question for the author; this requirement fixes only that
it is decided rather than defaulted.**

#### Scenario: A conquered run does not silently take the cutoff price

- **WHEN** a run ends with the conquered terminal reason
- **THEN** its earned prestige comes from a constant authored for that ending, and a conformance check
  fails if the prestige computation reaches the cutoff branch for it

#### Scenario: The terminal reason is additive

- **WHEN** a snapshot written before this change is loaded
- **THEN** every existing terminal reason retains its numeric code and its meaning

### Requirement: A terminated universe is frozen, including as a colony source

Once extinguished, a universe SHALL take no further world ticks and its state MUST NOT be read by any
per-tick computation in the conqueror's universe. Everything the conqueror receives is derived once,
at the moment of the successful claim.

#### Scenario: No per-tick read of a conquered universe

- **WHEN** the conformance check scans the world loop for reads of a terminated universe's state
- **THEN** it finds none, and fails naming the file if one exists

#### Scenario: A conquered universe's clock does not advance

- **WHEN** an extinguished, claimed universe is stepped
- **THEN** no component row changes and its snapshot hash is unchanged
