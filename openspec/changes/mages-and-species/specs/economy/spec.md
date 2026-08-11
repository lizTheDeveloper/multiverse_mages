## ADDED Requirements

### Requirement: Populace exists only as counted cohorts

Non-mage population SHALL be represented exclusively as cohort entities carrying `speciesId`,
`occupation`, `count`, and `birthTickBucket`, per `docs/design/contracts.md` §1.3. No individual
non-mage entity MAY be created for any reason, and no mechanism MAY draw randomness per person.

#### Scenario: A large population is one cohort

- **WHEN** 40,000 orc laborers of the same birth decade exist
- **THEN** exactly one cohort entity holds them with a `count` of 40,000

#### Scenario: Individual populace creation is rejected

- **WHEN** code attempts to create an individual entity with a non-mage occupation
- **THEN** the conformance test fails and names the file

#### Scenario: Draw count is independent of population size

- **WHEN** a world tick is stepped with a population of 1,000 and again with a population of
  1,000,000, holding cohort count equal
- **THEN** the number of RNG draws on stream 6 is identical

### Requirement: Cohort identity is unique and collisions merge

Cohorts SHALL be uniquely keyed by `(speciesId, occupation, birthTickBucket)`. Any operation
producing two cohorts with the same key MUST merge them into one entity with summed counts in the
same tick. A cohort reaching a `count` of 0 MUST be destroyed.

#### Scenario: Split and rejoin merges

- **WHEN** part of a cohort transitions to another occupation and later transitions back
- **THEN** exactly one cohort entity exists for that key afterwards, with the original total count

#### Scenario: Duplicate keys are impossible

- **WHEN** the cohort store is validated at the end of any tick
- **THEN** no two cohort entities share a `(speciesId, occupation, birthTickBucket)` key

#### Scenario: Cohort entity count is bounded

- **WHEN** the reference scenario runs for 200 world years
- **THEN** the number of live cohort entities never exceeds
  `6 species × 5 occupations × ceil(maxLifespanMonths / 120)`, and the test records the observed
  peak. The bound holds only because cohort mortality retires old birth buckets

#### Scenario: Empty cohorts are reclaimed

- **WHEN** a cohort's count reaches 0
- **THEN** its entity is destroyed and its slot returned to the deterministic free list

### Requirement: Occupations are the five contracted values

Cohort `occupation` SHALL be exactly one of `laborer`, `scribe`, `student`, `soldier`, or `idle`.
`idle` MUST be read as "not economically productive", covering members below `maturityMonths` and
those past productive age, not merely unemployed adults. Newborns MUST enter the youngest bucket of
their species' `idle` cohort.

#### Scenario: Newborns are idle

- **WHEN** births are added for a species in a tick
- **THEN** they are added to that species' `idle` cohort in the youngest birth-decade bucket

#### Scenario: Children cannot labor

- **WHEN** an occupation transition is requested for a cohort whose bucket is below
  `maturityMonths`
- **THEN** the transition is refused, except into `student`

#### Scenario: No sixth occupation

- **WHEN** content or code introduces an occupation outside the five contracted values
- **THEN** the load or the conformance check fails

### Requirement: Occupation reallocation is rate-limited

At most a documented `transferRatePerTick` fraction of a cohort SHALL change occupation in a single
world tick. Reallocation MUST be driven by demand from universities under construction, the scribing
queue, university capacity, and the standing soldier target, and MUST be deterministic in its
allocation order.

#### Scenario: Reallocation is gradual

- **WHEN** demand for laborers rises far above the current laborer count
- **THEN** no more than `transferRatePerTick` of any source cohort transitions in that tick

#### Scenario: The economy does not oscillate

- **WHEN** the reference scenario runs for 200 world years
- **THEN** the occupation mix does not exhibit a sustained two-tick alternation, and the test fails
  if it does

#### Scenario: Allocation order is deterministic

- **WHEN** several cohorts could satisfy the same demand
- **THEN** the allocation order is fixed and reproducible, never dependent on hash iteration order

#### Scenario: Demand beyond supply is recorded

- **WHEN** total demand across occupations exceeds the transferable populace in a tick
- **THEN** the unmet demand per occupation is recorded and is observable

### Requirement: Carrying capacity is derived from territory and is bounded

`K` SHALL be derived from the universe's **territory** — `Σ landUnits × capacityPerLandUnit` over
the `territory.json` records of `docs/design/contracts.md` §2.7 — which no process in a run may
grow. The materials stock and completed university capacity MAY modulate `K`, but only through a
**bounded multiplier** on the territory-derived base: each term SHALL saturate at a documented value
and `K` SHALL NOT be an unbounded function of any quantity the universe produces.

The bound is
`maxCarryingCapacity = floor(Σ landUnits × capacityPerLandUnit × MAX_PROVISIONING / fp(1024))`,
where `MAX_PROVISIONING` is `fp(1024)` plus the sum of the per-term caps. For the shipped
territory it is **109,800**. Every magnitude in it is untuned and no release before 0.5.0 may claim
otherwise.

#### Scenario: A stock that grows without limit does not grow `K` without limit

- **WHEN** the materials stock rises past its documented saturation point and keeps rising
- **THEN** `K` stops rising and equals the base times the saturated multiplier, and never exceeds
  `maxCarryingCapacity`

#### Scenario: The bound names content and nothing else

- **WHEN** the bound is computed
- **THEN** it is a function of the `territory.json` records alone — not of the materials stock, the
  seat count, the population, or the number of ticks elapsed

#### Scenario: Bare land still carries people

- **WHEN** a universe holds territory, an empty materials stock and no completed universities
- **THEN** `K` equals the territory-derived base rather than zero, so the multiplier modulates a
  world rather than constituting one

#### Scenario: No land carries nobody

- **WHEN** a content set declares no territory
- **THEN** `K` is zero whatever the materials stock, the brake stops every birth, and nothing
  synthesizes a capacity to keep the world going

### Requirement: Births are logistically braked by carrying capacity

Births per cohort per world tick SHALL scale by species `fertility`, the capped `fertility`
primitive stacking, and a carrying-capacity brake of
`clamp((K − population) × fp(1024) / K, 0, fp(1024))`. Population MUST NOT be enforced by a hard
rejection ceiling.

#### Scenario: Growth slows as capacity is approached

- **WHEN** total population rises from a quarter of `K` to nine tenths of `K`
- **THEN** the per-cohort birth rate falls monotonically over that range

#### Scenario: Population does not exceed carrying capacity

- **WHEN** the reference scenario runs for 200 world years
- **THEN** total population never exceeds `K` and never exhibits a sawtooth against a fixed ceiling

#### Scenario: The composed loop converges

- **WHEN** `materialsProduced`, `consumeMaterials`, `carryingCapacity`, `fertilityBrake` and
  `expectedBirths` are composed and stepped for 2,400 ticks at laborer shares of 0.15, 0.20, 0.30
  and 0.50 — every one of them above the one-eighth share at which net materials per person turns
  positive
- **THEN** `K` reaches a value and stays there, under `maxCarryingCapacity` at every tick, while the
  materials stock is still growing at the end of the run. The last clause is what stops the
  assertion being satisfiable by an input that settled on its own

#### Scenario: Fertile species grow faster

- **WHEN** an orc cohort (`fertility` `fp(1536)`) and a draconic cohort (`fertility` `fp(96)`) of
  equal count are stepped under identical conditions
- **THEN** the orc cohort's births exceed the draconic cohort's

#### Scenario: Extinction is absorbing and not prevented

- **WHEN** every cohort of a species reaches a count of 0 and no mage of that species survives
- **THEN** no births of that species occur thereafter, and the simulation does not synthesize a
  founding population

### Requirement: Cohort members die at cohort granularity

Populace cohorts SHALL lose members each world tick to the same scale-free hazard table used for
mage mortality, indexed by the normalized age implied by the cohort's `birthTickBucket` and its
species `lifespanMonths`. Expected deaths MUST be computed as an integer part plus exactly one
fractional draw on RNG stream 6 per cohort per tick, and the division MUST use the extended-scale
helper so that a long-lived species' hazard does not round to zero.

#### Scenario: Old cohorts decay to nothing

- **WHEN** a human cohort whose birth bucket is 120 years in the past is stepped repeatedly with no
  transitions in or out
- **THEN** its count falls monotonically and reaches zero, and its entity is destroyed

#### Scenario: Draw count is one per cohort

- **WHEN** a cohort of 250,000 is stepped for one world tick
- **THEN** exactly one value is drawn from RNG stream 6 for that cohort's mortality

#### Scenario: Long-lived cohorts still die

- **WHEN** a draconic cohort at normalized age `fp(1024)` with `lifespanMonths` of 18000 is stepped
- **THEN** its computed per-tick hazard is strictly greater than zero and deaths accumulate over
  time

#### Scenario: Birth buckets are reclaimed

- **WHEN** the reference scenario runs for 200 world years
- **THEN** no live cohort exists whose birth bucket is older than its species `lifespanMonths` plus
  the documented tail allowance, which is what makes the cohort entity bound hold

#### Scenario: Deaths balance births at equilibrium

- **WHEN** the reference scenario reaches its carrying capacity
- **THEN** total births and total deaths per tick are within a documented tolerance of each other,
  and population is stable rather than pinned against a ceiling

### Requirement: Materials are produced by labor and consumed by everything

Materials SHALL be produced per world tick from laborer cohort counts scaled by species
`laborAffinity` and the capped `resource-yield` primitive stacking, and consumed by university
construction, grimoire scribing, library upkeep, and populace subsistence. The materials stock MUST
NOT go negative.

#### Scenario: Orc laborers outproduce draconic laborers

- **WHEN** equal-count orc (`laborAffinity` `fp(1536)`) and draconic (`fp(512)`) laborer cohorts are
  stepped under identical conditions
- **THEN** the orc cohort produces strictly more materials

#### Scenario: Consumption cannot overdraw

- **WHEN** the sum of construction, scribing, upkeep, and subsistence demand exceeds the materials
  stock in a tick
- **THEN** the stock does not go below zero, demands are met in a documented deterministic priority
  order, and the shortfall is recorded

#### Scenario: Scribing consumes materials

- **WHEN** a grimoire is scribed
- **THEN** materials are deducted according to the node's `scribeCost`, and the deduction happens in
  the same tick the instance is created

#### Scenario: Subsistence shortfall has consequences

- **WHEN** populace subsistence demand is unmet for a sustained period
- **THEN** the carrying capacity `K` falls, births fall, and the effect is recorded rather than
  applied silently

### Requirement: The economy has exactly three tracked inputs

The economy SHALL track exactly three inputs — populace, materials, and knowledge-as-capital — and
MUST NOT introduce a fourth resource. Favor and worship are the god's currency and are owned by
`god-agency`; this capability MAY expose the counts worship is computed from but MUST NOT define or
compute worship.

#### Scenario: No fourth resource

- **WHEN** the economy's tracked resources are enumerated
- **THEN** exactly populace, materials, and knowledge-as-capital appear, and `favor` and `worship`
  are read-only universe fields this capability never writes

#### Scenario: Worship inputs are exposed, not computed

- **WHEN** `god-agency` requests the counts it needs
- **THEN** mage counts, university counts, and populace counts are available, and no worship value
  is produced here

#### Scenario: Knowledge is an input, not only an output

- **WHEN** a universe's library depth increases with all other inputs held constant
- **THEN** its research, teaching, and scribing throughput increase, subject to the caps defined in
  the `universities` capability

### Requirement: Populace cohorts carry no position

Populace cohorts MUST NOT have position components, and no economic computation MAY reference a
position, a distance, or a travel time. Assignment of cohorts to universities and construction MUST
be expressed as handle relationships.

#### Scenario: Position on a cohort is rejected

- **WHEN** a position component is attached to a populace cohort
- **THEN** the operation fails in development builds and the conformance test fails in CI

#### Scenario: No distance in the economy path

- **WHEN** the conformance check scans the economy module for distance computation
- **THEN** it finds none, and any occurrence fails CI and names the file

### Requirement: A universe runs unattended for 200 world years

The project SHALL provide a deterministic reference scenario seeded with all six species that runs
200 world years with zero player input. No species population MAY reach zero, total population MUST
stay within its documented bound, and the run MUST complete without a stall in which no knowledge
operation occurs for a sustained period.

**The documented bound is `maxCarryingCapacity` of the scenario's territory** — for the shipped
`territory.json`, 109,800 people. It is stated as a function of the fixed resource so that the
assertion is checkable: a bound derived from the materials stock would rise ahead of the population
it bounds and the requirement would pass without ever being tested.

#### Scenario: No species is lost

- **WHEN** the reference scenario runs for 200 world years from its committed seed
- **THEN** every one of the six species has a non-zero population at every recorded checkpoint

#### Scenario: Population stays bounded

- **WHEN** the same run completes
- **THEN** total population never exceeds `maxCarryingCapacity` of the scenario's territory, and the
  observed peak is recorded in the test output **beside that bound**, so a reader can tell a run
  that pressed against its bound from one that never came near it

#### Scenario: The civilization does not stall

- **WHEN** the same run completes
- **THEN** research, teaching, and scribing each occur in at least one tick of every recorded
  window, and the node count at the end exceeds the founding node count

#### Scenario: The run is reproducible

- **WHEN** the reference scenario is run twice from the same committed seed
- **THEN** both runs produce a byte-identical final snapshot hash
