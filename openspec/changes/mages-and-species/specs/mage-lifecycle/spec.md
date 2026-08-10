## ADDED Requirements

### Requirement: Mages are promoted from student cohorts, never spawned

A mage SHALL come into existence only by promotion of a member of a `student` populace cohort that
has reached its species `maturityMonths`. The number promoted from a cohort MUST be
`floor(count × mageAptitude / fp(1024))`, plus one additional mage if a single draw on RNG stream 1
falls below the fixed-point remainder. Exactly one draw MUST be made per cohort per promotion event;
no per-person draw is permitted.

#### Scenario: Integer part promotes deterministically

- **WHEN** a student cohort of 1,000 humans with `mageAptitude` `fp(512)` reaches maturity
- **THEN** at least 500 mages are created and the cohort's count is reduced by the number promoted

#### Scenario: Remainder resolved by exactly one draw

- **WHEN** a student cohort of 3 dragons with `mageAptitude` `fp(896)` reaches maturity
- **THEN** exactly one value is drawn from RNG stream 1 for that cohort, and either 2 or 3 mages
  are created

#### Scenario: Per-person draws are rejected

- **WHEN** the promotion routine is instrumented over a cohort of 10,000
- **THEN** the number of RNG draws attributed to that promotion is 1, not 10,000

#### Scenario: Unpromoted students leave the student occupation

- **WHEN** a student cohort is processed for promotion
- **THEN** every member not promoted to mage transitions to another occupation, and no member
  remains in the `student` occupation past maturity

### Requirement: Personality is rolled at birth from species means

Each mage SHALL receive `curiosity`, `ambition`, and `caution` at promotion, drawn on RNG stream 1
from the means `(species.curiosity, fp(1024), fp(1024))` with a bounded symmetric deviation, and
clamped to `[0, fp(2048)]`. Personality MUST NOT change after promotion.

#### Scenario: Curiosity tracks the species mean

- **WHEN** a large number of gnomes (`curiosity` `fp(1792)`) and dwarves (`curiosity` `fp(512)`)
  are promoted on the same seed
- **THEN** the gnome cohort's mean rolled curiosity is higher than the dwarf cohort's

#### Scenario: Ambition and caution are species-neutral

- **WHEN** mages of all six species are promoted on the same seed
- **THEN** the expected mean of rolled `ambition` and `caution` is `fp(1024)` for every species

#### Scenario: Personality is immutable

- **WHEN** a mage ages, changes role, changes university, and learns nodes
- **THEN** its `curiosity`, `ambition`, and `caution` values are unchanged from promotion

#### Scenario: Personality roll is reproducible

- **WHEN** the same scenario is run twice from the same root seed
- **THEN** every mage receives identical personality values in identical order

### Requirement: Age is derived and never stored

A mage's age SHALL be computed as `worldTick − birthTick` at every point of use. No component MAY
store an age, an age band, a death tick, or an effective lifespan.

#### Scenario: No age field exists

- **WHEN** the mage component layout is inspected
- **THEN** it contains `birthTick` and no age, age-band, death-tick, or effective-lifespan field

#### Scenario: Age advances with the world clock

- **WHEN** the world clock advances 12 ticks and no other change occurs
- **THEN** every living mage's derived age is 12 greater

#### Scenario: Age does not advance during engagement

- **WHEN** the clock is in engagement mode and the simulation is stepped repeatedly
- **THEN** every living mage's derived age is unchanged

### Requirement: Mortality is a per-tick hazard roll

Each living mage SHALL draw once per world tick on RNG stream 2 against a hazard computed as
`H(normalizedAge) / effectiveLifespanMonths`, where `H` is a shared scale-free piecewise-linear
table and `normalizedAge = age × fp(1024) / effectiveLifespanMonths`. A death date MUST NOT be
scheduled in advance.

#### Scenario: Hazard rises with normalized age

- **WHEN** two mages of the same species are evaluated at normalized ages `fp(256)` and `fp(1024)`
- **THEN** the older mage's per-tick hazard is strictly greater

#### Scenario: The same table serves every lifespan

- **WHEN** a human and a draconic are each evaluated at normalized age `fp(1024)`
- **THEN** both use the same `H` value, and their per-tick hazards differ only by their differing
  `effectiveLifespanMonths`

#### Scenario: No death date is stored

- **WHEN** a mage is promoted
- **THEN** no draw is made on RNG stream 2 at promotion, and no scheduled death is recorded

### Requirement: Hazard division uses extended precision

The hazard division SHALL be performed at an extended fixed-point scale, with the numerator
pre-shifted before division and the draw taken over the same extended range. A per-tick hazard for
any species with any lifespan MUST NOT round to zero while `H` is non-zero.

#### Scenario: Long-lived species retain a non-zero hazard

- **WHEN** a draconic with `effectiveLifespanMonths` of 18000 is evaluated at normalized age
  `fp(1024)` where `H` is `fp(12288)`
- **THEN** the computed per-tick hazard is strictly greater than zero

#### Scenario: Dragons are not silently immortal

- **WHEN** the reference scenario runs for 200 world years with a founding draconic population
- **THEN** at least one draconic death is recorded, and the test fails if zero are

#### Scenario: Rounding remains uniform

- **WHEN** the extended-scale division is applied to a value that does not divide evenly
- **THEN** it rounds toward negative infinity through the shared fixed-point helper, like every
  other division in the rules path

### Requirement: Lifespan variance and lifespan effects are derived, not stored

Per-mage lifespan variance SHALL be derived deterministically from
`(rootSeed, mageId, generation, birthTick)` and bounded by the species `lifespanVarianceMonths`.
Active `lifespan` primitive effects MUST be recomputed at each hazard evaluation and clamped to at
most 50% of the species base, per `docs/design/contracts.md` §3.

#### Scenario: Variance is stable across recomputation

- **WHEN** a mage's effective lifespan is computed at two different world ticks with no lifespan
  effects active
- **THEN** the same value is produced both times

#### Scenario: Slot reuse does not alias variance

- **WHEN** a mage dies, its entity slot is reused by a newly promoted mage, and both mages' lifespan
  variances are computed
- **THEN** the two values are derived independently, because the generation counter differs

#### Scenario: A lifespan blessing can save an old mage

- **WHEN** a `lifespan` effect is applied to a mage already past its nominal lifespan
- **THEN** its normalized age falls, and its per-tick hazard on the next evaluation is strictly
  lower than before

#### Scenario: Lifespan bonus is capped

- **WHEN** `lifespan` effects totalling more than 50% of a species base apply to one mage
- **THEN** the effective bonus is clamped to 50% of the species base and the clamp is counted

### Requirement: Death destroys the knowledge a mage carried

A mage's death SHALL destroy every knowledge instance held at `mind:<mageId>` and every instance
held at `palace:<mageId>`. Grimoires held by the mage MUST transfer to the library of its
affiliated university, or to unaffiliated holding if `universityId` is 0. The mage's `alive` flag
MUST be set false and its role and university slots released.

#### Scenario: Mind instances die with the mage

- **WHEN** a mage holding three `mind` instances dies
- **THEN** all three instances are destroyed in the same tick

#### Scenario: Memory palace is unrecoverable

- **WHEN** a mage in an Art of Memory universe dies holding `palace` instances
- **THEN** those instances are destroyed and no copy survives at any other location

#### Scenario: Grimoires survive their author

- **WHEN** an affiliated mage holding two grimoires dies
- **THEN** both grimoires are held by that university's library afterwards and their `durability`
  is unchanged

#### Scenario: Last instance leaving the universe is signalled

- **WHEN** a dying mage holds the only surviving instance of a node
- **THEN** the coordinating layer is notified that the node's instance count reached zero, and no
  cached "node exists" flag is written to state

#### Scenario: Dead mages are excluded from work

- **WHEN** a mage dies mid-goal
- **THEN** its goal is abandoned, it contributes no mage-months in that tick or after, and any
  teaching pair it was part of is dissolved

### Requirement: Standing role is assigned only by the god

A mage's `roleId` SHALL be one of researcher, warden, professor, or raider, and MAY be changed only
by the god's assign-role action. A mage MUST NOT change its own role, and a role MUST persist across
university changes and goal changes.

#### Scenario: Role persists across affiliation change

- **WHEN** a mage assigned the professor role transfers to a different university
- **THEN** its `roleId` is still professor

#### Scenario: Autonomy does not extend to roles

- **WHEN** the utility-AI evaluates goals for a mage whose role poorly matches its personality
- **THEN** the mage's `roleId` is unchanged, and only its chosen goal differs

#### Scenario: Newly promoted mages have a default role

- **WHEN** a mage is promoted with no god intervention
- **THEN** it receives the researcher role, and the god may reassign it later
