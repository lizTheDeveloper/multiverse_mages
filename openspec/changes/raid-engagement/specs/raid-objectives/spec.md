## ADDED Requirements

### Requirement: Objectives are generated from the defender's world state

A raid SHALL generate its objectives from the host universe's world state at portal open, using RNG
stream 10. Objective kinds MUST be library, university, and archmage. Each objective MUST carry a
kind, a handle to the world entity it represents, a position on the battlefield, a fixed-point value,
and a status. The number of objectives MUST NOT exceed `maxObjectivesPerRaid`.

#### Scenario: Objectives name real world entities

- **WHEN** a raid is generated against a universe holding universities, libraries, and mages
- **THEN** every objective's target handle resolves to a live entity in that universe, and no
  objective is invented without a world-state referent

#### Scenario: Objective value reflects what is at stake

- **WHEN** two libraries differ in the number and tier of the knowledge instances they hold
- **THEN** the deeper library carries the higher objective value, by a formula marked untuned

#### Scenario: An archmage objective is designated deterministically

- **WHEN** an archmage objective is generated
- **THEN** it names the defender's highest-tier living mage, breaking ties on ascending handle, by a
  placeholder rule marked untuned

#### Scenario: A universe with nothing to take still yields a raid

- **WHEN** a universe holds no university and no mage above the first node tier
- **THEN** the raid generates the objectives that do exist, up to zero, and still terminates by portal
  collapse with a defender victory

### Requirement: Objectives are captured, looted, burned, or held, and these differ

Each objective SHALL carry a status that distinguishes held, captured, looted, and destroyed. Looting
an objective MUST transfer or copy knowledge without destroying the objective; destroying it MUST
remove the underlying world entity's contents. The two MUST NOT be conflated, because they produce
different write-back consequences.

#### Scenario: A looted library still stands

- **WHEN** a library objective is looted
- **THEN** its status records looting, the grimoires taken are removed from it, and the university
  that holds it remains standing

#### Scenario: A burned library is destroyed

- **WHEN** a library objective is burned
- **THEN** its status records destruction and every knowledge instance located at that library is
  destroyed on write-back

#### Scenario: An unreached objective is held

- **WHEN** the portal collapses with no attacker having reached an objective
- **THEN** every objective's status is held, and the defender's world state loses nothing to that
  objective

### Requirement: Portal stability decrements unconditionally on every engagement tick

The engine SHALL decrement `portalStability` by `stabilityDecayPerTick` exactly once per engagement
tick, in a phase reached by no conditional. Exactly one function may write `portalStability`. No node,
effect primitive, tradition hook, objective, or agent action may increase portal stability or reduce
the decay rate.

#### Scenario: Stability strictly decreases every tick

- **WHEN** any raid is stepped for any number of engagement ticks
- **THEN** `portalStability` is strictly lower after each tick than before it

#### Scenario: Exactly one writer

- **WHEN** the conformance check scans for assignments to `portalStability`
- **THEN** it finds exactly one, in the stability decrement phase, and fails naming any other

#### Scenario: No effect can extend a portal

- **WHEN** the content loader inspects every node's effects, every tradition hook, and every objective
  definition
- **THEN** none declares an increase to portal stability or a reduction of its decay, and content that
  does is a hard load failure

### Requirement: The decay rate is an authored integer validated at load

`stabilityDecayPerTick` SHALL be an authored positive raw integer of at least 1 and MUST NOT be
derived by fixed-point division from a desired raid length. The loader MUST reject a decay below 1
raw and MUST reject content whose resulting tick bound exceeds `MAX_ENGAGEMENT_TICKS`.

#### Scenario: A zero decay is a hard load failure

- **WHEN** content declares `stabilityDecayPerTick` of 0
- **THEN** the load fails, names the file and JSON pointer, and explains that a zero decay is a
  non-terminating raid

#### Scenario: A division-derived decay is rejected

- **WHEN** the conformance check finds `stabilityDecayPerTick` computed by fixed-point division rather
  than read from content
- **THEN** the check fails and names the file, because division rounding toward negative infinity can
  yield zero

#### Scenario: An over-long raid is rejected at load

- **WHEN** content declares an initial stability and decay whose quotient rounded up exceeds
  `MAX_ENGAGEMENT_TICKS`
- **THEN** the load fails and reports both the computed bound and the ceiling

### Requirement: Every raid terminates within a bound computable at portal open

A raid SHALL resolve on the first tick at which any of the following holds: portal stability has
reached zero or below, every objective has been captured or destroyed, or one side has no living
combatant remaining. The maximum engagement tick count MUST equal the ceiling of initial stability
divided by the decay rate, and MUST NOT exceed `MAX_ENGAGEMENT_TICKS`. Reaching
`MAX_ENGAGEMENT_TICKS` MUST resolve the raid immediately and MUST additionally raise an invariant
violation, because reaching it proves the decrement guarantee has been broken.

#### Scenario: No raid exceeds its bound across a Monte Carlo sweep

- **WHEN** 10,000 Monte Carlo raids are resolved
- **THEN** every raid's engagement tick count is at most the ceiling of its initial stability divided
  by its decay rate, and `raidLengthDistribution` reports an empty tail beyond that bound

#### Scenario: The bound is known before the first tick

- **WHEN** a raid is created
- **THEN** its maximum tick count is computable from `RaidState` alone, before any tick is stepped

#### Scenario: A stalemate still ends

- **WHEN** both sides are placed out of each other's range and neither moves for the whole raid
- **THEN** the raid resolves exactly when portal stability reaches zero, with a defender victory

#### Scenario: Reaching the hard ceiling is a loud failure

- **WHEN** the decrement is deliberately disabled by a fault-injection test and the raid reaches
  `MAX_ENGAGEMENT_TICKS`
- **THEN** the raid resolves immediately and an invariant violation is raised that fails the test suite

### Requirement: Victory is a total function of the final raid state

At resolution the engine SHALL determine exactly one victor. The attacker MUST win when the total
value of objectives captured, looted, or destroyed reaches the victory threshold; the defender MUST
win otherwise. No raid may resolve as a draw, as undetermined, or with both sides recorded as
victorious.

#### Scenario: Attacker reaches the threshold

- **WHEN** the attacker destroys and loots objectives whose combined value reaches the victory
  threshold before the portal collapses
- **THEN** the raid resolves immediately with an attacker victory

#### Scenario: Defender holds until collapse

- **WHEN** portal stability reaches zero with the attacker below the victory threshold
- **THEN** the raid resolves with a defender victory, even if the attacker took objectives worth less
  than the threshold

#### Scenario: Attacker force eliminated

- **WHEN** the last living attacker combatant is removed before the threshold is reached
- **THEN** the raid resolves immediately with a defender victory

#### Scenario: Exactly one victor is always recorded

- **WHEN** any raid resolves, by any termination condition
- **THEN** the outcome record names exactly one victor, and a property test over randomly generated
  raids finds no draw and no undetermined result

### Requirement: The engagement observation block summarises a raid within its fixed 64 slots

The engagement observation block defined in `contracts.md` §4.1 SHALL be filled with summarised
values and MUST NOT be widened. Allocation MUST be: own-side summary 12 slots, enemy-side summary 12
slots, six objectives at 5 slots each, portal and clock 6 slots, and 4 reserved slots. Enemy-side
summaries MUST exclude combatants successfully evading detection through `concealment`. The block MUST
be zero-filled at world scale.

#### Scenario: Shape is constant across raid sizes

- **WHEN** observations are emitted from a raid with two combatants per side and from a raid at the
  per-side cap
- **THEN** both engagement blocks are exactly 64 slots and identically laid out

#### Scenario: Concealed enemies are not observable

- **WHEN** an enemy combatant is successfully concealed at the moment an observation is emitted
- **THEN** it does not contribute to the enemy-side summary

#### Scenario: Zero-filled at world scale

- **WHEN** an observation is emitted while the clock is in world mode
- **THEN** all 64 engagement slots are zero

#### Scenario: More combatants do not require more slots

- **WHEN** the per-side combatant cap is raised in configuration
- **THEN** the engagement block remains 64 slots, because it summarises rather than enumerating
