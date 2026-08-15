## ADDED Requirements

### Requirement: Mages are enrolled from student cohorts, never spawned

A mage SHALL come into existence only by **enrolment** of a member of a `student` populace cohort
that has reached its species `maturityMonths`, into a seat at a completed university that has
something to teach. She arrives in the `student` **role**, and becomes a standing mage by
graduation — see *Graduation is curriculum completion* below.

**Amended by W193 (`docs/design/magical-prevalence.md`), and the amendment moves *when* the crossing
happens rather than how.**

The number enrolled from a cohort MUST be `floor(count × eligibleFraction / fp(1024))`, plus one
additional mage if a single draw on RNG stream 1 falls below the fixed-point remainder, and bounded
above by the free seats and by the species' per-tick class capacity. Exactly one draw MUST be made
per cohort per enrolment event; no per-person draw is permitted.

`eligibleFraction` is `prevalence × mageAptitude / fp(1024)`. **The two are stages of one pipeline
and not two spellings of one idea**: `prevalence` is who is born able to do magic at all, a
per-species content field, optional and meaningful in its absence; `mageAptitude` is who among them
is strong enough to be found, which is *"some number of those people never get discovered because
their skills are very weak"*. Both are applied at enrolment. **Nothing applies a fraction at
graduation.**

The scenarios below use `mageAptitude` alone, and are read as `eligibleFraction` — the arithmetic is
unchanged and only its input moved.

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

#### Scenario: Unenrolled students leave the student occupation

- **WHEN** a student cohort is processed for enrolment
- **THEN** every member not enrolled transitions to another occupation, and no member
  remains in the `student` occupation past maturity

#### Scenario: The gap between who could be a mage and who was seated is reported

- **WHEN** a tick's enrolment phase completes
- **THEN** the loop reports both the members the species gate rejected and the members who cleared
  it and found no free seat, as two numbers rather than one — the first is a fact about the
  species and the second is a building the god did not fund, and a sum of them has no lever

### Requirement: Graduation is curriculum completion, not age

**Added by W193.** A mage in the `student` role SHALL become a standing mage when the university she
is enrolled at can teach her nothing further: no non-student mage affiliated there holds a node she
could receive, and no instance on its library's shelf is one she could receive. Graduation MUST NOT
be gated on elapsed time, on age, or on `maturityMonths`.

A student who holds no knowledge at all MUST NOT graduate, whatever her university's state. This is
the floor against *"a university with nothing to teach graduates its students instantly, which would
make a bare founding a mage factory"*.

#### Scenario: A deeper university holds its students longer

- **WHEN** two identical universes differ only in what their faculty and libraries hold
- **THEN** the one with more to teach graduates its students later

#### Scenario: A rate that makes learning faster moves the graduation date

- **WHEN** `teach-rate` is raised in a universe whose students are learning from faculty
- **THEN** the time from enrolment to graduation falls, which was impossible while promotion was
  gated on age since birth

#### Scenario: A student who can be taught nothing and knows nothing is reported, not graduated

- **WHEN** a student's university loses everything it held while she was enrolled and she holds
  nothing herself
- **THEN** she remains a student and the loop reports her as stalled, rather than graduating a mage
  who knows nothing

### Requirement: A student is a mage entity, not a headcount

**Added by W193.** A student SHALL be a `MAGE` entity in the `student` role, never a count inside a
populace cohort. Everything that takes a mage handle therefore applies to her: she holds knowledge
instances, is taught, reads what her tradition permits her to read, and is affiliated to a
university.

The `student` role MUST NOT be assignable by the god's assign-role action, and a student MUST NOT be
eligible to teach.

#### Scenario: A student holds knowledge in her own mind

- **WHEN** a student learns anything at all
- **THEN** a knowledge instance exists whose location is `mind` and whose location id is her handle

#### Scenario: The god cannot enrol or un-enrol anybody

- **WHEN** the god's assign-role action names the `student` role
- **THEN** it is refused, and the role is absent from the action's candidate enumeration

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
affiliated university; if `universityId` is 0 they MUST be set to the `in transit` holder kind
enumerated in `docs/design/contracts.md` §1.5, since that enumeration admits only mage, library, and
in transit. The mage's `alive` flag MUST be set false and its role and university slots released.

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

#### Scenario: An unaffiliated mage's grimoires enter transit

- **WHEN** a mage with `universityId` of 0 dies holding a grimoire
- **THEN** the grimoire's `holderKind` becomes `in transit`, and no holder kind outside the
  `contracts.md` §1.5 enumeration is introduced

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
