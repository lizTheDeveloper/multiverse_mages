## ADDED Requirements

### Requirement: Universities are built before they function

A university SHALL be created with `buildProgress` of 0 and an effective capacity of 0. Construction
progress MUST advance in proportion to assigned laborer cohort-months, the species `laborAffinity`
of those cohorts, and the capped `build-rate` primitive stacking, and MUST consume materials. A
university MUST NOT admit students, host staff, or contribute library capital until `buildProgress`
reaches `fp(1024)`.

#### Scenario: Incomplete university admits nobody

- **WHEN** a university has `buildProgress` of `fp(512)`
- **THEN** its effective capacity is 0 and no student cohort may be assigned to it

#### Scenario: Construction consumes materials

- **WHEN** laborer cohort-months are applied to a university under construction
- **THEN** materials are deducted in the same tick, and progress advances by the deducted amount
  scaled by `laborAffinity` and the `build-rate` multiplier

#### Scenario: Construction stalls without materials

- **WHEN** the materials stock is insufficient to fund a tick of construction
- **THEN** `buildProgress` is unchanged that tick and no materials go negative

#### Scenario: Completion unlocks capacity

- **WHEN** `buildProgress` reaches `fp(1024)`
- **THEN** the university's effective capacity becomes its designed `capacity` and students may be
  admitted from that tick

### Requirement: Capacity gates concurrent students

A completed university's `capacity` SHALL bound the number of student-occupation populace members
it may host concurrently. Admission beyond capacity MUST be refused rather than silently truncated,
and the refused demand MUST be observable.

#### Scenario: Admission is refused at capacity

- **WHEN** a university at full capacity receives an admission request
- **THEN** the request is refused, the hosted count is unchanged, and an unmet-demand counter
  increments

#### Scenario: Capacity frees on graduation

- **WHEN** students reach maturity and leave the `student` occupation
- **THEN** the university's hosted count falls and equivalent capacity becomes available in the same
  tick

#### Scenario: Total capacity is reported

- **WHEN** the institutions observation block is populated
- **THEN** it reports university count, total capacity, library depth, and grimoire count, in
  exactly the four slots fixed by `docs/design/contracts.md` §4.1

### Requirement: Staff cohorts drive scribing throughput

A university's `staffCohorts` SHALL determine its scribing throughput, computed from scribe-cohort
count, the species `scribeAffinity` of those cohorts, and the capped `scribe-rate` primitive
stacking. A university with no scribe staff MUST have zero scribing throughput.

#### Scenario: No scribes, no scribing

- **WHEN** a completed university holds no scribe cohort
- **THEN** its scribing throughput is zero and `scribe` is masked for mages affiliated only with it

#### Scenario: Dwarven scribes outproduce human scribes

- **WHEN** two otherwise identical universities are staffed with equal-count dwarf and human scribe
  cohorts
- **THEN** the dwarf-staffed university's scribing throughput is higher

#### Scenario: Staff cohorts remain aggregated

- **WHEN** a university is staffed with 4,000 scribes
- **THEN** `staffCohorts` holds cohort handles, and no individual staff entity is created

### Requirement: Universities have no declared specialization

A university SHALL NOT carry a specialization, focus, or preferred-cell field. Any characterization
of what a university is good at MUST be derived on demand from the distribution of nodes in its
library and the nodes known by its resident mages, and MUST NOT be cached in state.

#### Scenario: No specialization field exists

- **WHEN** the university component layout is inspected
- **THEN** it contains `libraryId`, `capacity`, `staffCohorts`, and `buildProgress`, and no
  specialization field

#### Scenario: Profile follows the library

- **WHEN** a university's library gains ten `rego-terram` nodes
- **THEN** its derived profile shifts toward `rego-terram` with no field written to state

#### Scenario: Burning the library erases the identity

- **WHEN** a university's library is destroyed
- **THEN** its derived profile is empty, and no residual specialization survives the loss

#### Scenario: The institutions observation block is not resized

- **WHEN** the observation vector is emitted
- **THEN** the `institutions` block occupies exactly four slots and carries no per-cell
  specialization data

### Requirement: Library depth contributes bounded knowledge capital

A university's library SHALL contribute to `research-rate`, `teach-rate`, and `scribe-rate` through
the same `(1 + Σ)` accumulator and the same `fp(4096)` cap as node-sourced effects, per
`docs/design/contracts.md` §3. The contribution MUST be looked up from a piecewise-linear table over
relevant distinct nodes held, and MUST NOT be applied as a separate multiplier outside the shared
stacking arithmetic.

#### Scenario: Contribution enters shared stacking

- **WHEN** a mage researches in a university with a deep library and also benefits from a
  node-sourced `research-rate` effect
- **THEN** both contributions are summed into one `(1 + Σ)` accumulator and clamped once at
  `fp(4096)`

#### Scenario: No bespoke library multiplier

- **WHEN** the conformance check scans for a library multiplier applied outside the shared stacking
  implementation
- **THEN** it finds none, and any occurrence fails CI and names the file

#### Scenario: Contribution saturates

- **WHEN** a library grows from 640 to 6,400 relevant distinct nodes
- **THEN** its contribution is unchanged at the table's saturation value

#### Scenario: Clamping is counted

- **WHEN** the combined rate multiplier is clamped at `fp(4096)` in a run
- **THEN** the per-primitive clamp counter increments and is reported in that run's metrics

### Requirement: Library returns are concave

The library contribution table SHALL have strictly non-increasing marginal return per additional
node across every segment, and MUST saturate at a documented value. This property MUST be asserted
as a test over the table data, not assumed by convention.

#### Scenario: Marginal return never increases

- **WHEN** the contribution table is validated
- **THEN** every segment's marginal return per node is less than or equal to the preceding
  segment's, and the validation fails otherwise

#### Scenario: A convex tuning edit fails CI

- **WHEN** a tuning change makes one segment's marginal return exceed the preceding segment's
- **THEN** the table property test fails and names the offending segment

#### Scenario: Doubling depth does not double output

- **WHEN** a library's relevant node count doubles from 96 to 192
- **THEN** its contribution increases by strictly less than double

### Requirement: Library relevance is gated by species depth ceiling

A node SHALL count toward the library contribution for a given learner only if its `tier` is at or
below that learner's species `depthCeiling`. Relevant counts MUST be maintained as a fixed-size
per-tier prefix-sum array per university, recomputed on library change.

#### Scenario: Deep nodes do not help shallow species

- **WHEN** an orc with `depthCeiling` 3 studies at a library whose nodes are all tier 6 and 7
- **THEN** the library contributes nothing to that orc's rates

#### Scenario: The same library helps species differently

- **WHEN** a draconic with `depthCeiling` 7 and an orc with `depthCeiling` 3 study at the same
  library
- **THEN** the draconic's contribution is strictly greater

#### Scenario: Relevance lookup is fixed-size

- **WHEN** relevance is computed for a learner
- **THEN** it reads a seven-entry per-tier prefix-sum array, not a scan over library contents

### Requirement: Libraries impose upkeep proportional to depth

A library SHALL consume materials per world tick in proportion to the number of instances it holds.
When materials are insufficient to meet total library upkeep, the shortfall MUST degrade libraries
deterministically rather than driving materials negative.

#### Scenario: Upkeep grows linearly with holdings

- **WHEN** a library's instance count doubles
- **THEN** its per-tick materials upkeep doubles

#### Scenario: Upkeep is unaffordable

- **WHEN** total library upkeep exceeds available materials in a tick
- **THEN** materials do not go negative, the shortfall is recorded, and library degradation is
  applied in a documented deterministic order

#### Scenario: Hoarding has a cost

- **WHEN** two universes hold equal populations and materials income but one holds four times the
  library instances
- **THEN** the larger-library universe has strictly less materials available for construction and
  scribing each tick

### Requirement: Knowledge capital state is emitted for later measurement

The simulation SHALL emit, per world tick and per university, the relevant library depth by tier,
the effective capital contribution after table lookup and clamping, and the clamp count. These
outputs MUST be sufficient to compute `capitalSnowball` as defined in `docs/design/contracts.md` §7
without changing the simulation.

#### Scenario: Per-tick capital telemetry exists

- **WHEN** a world tick completes
- **THEN** each university's relevant depth by tier, effective contribution, and clamp count are
  available for that tick

#### Scenario: The metric is computable without retrofit

- **WHEN** `capitalSnowball` is computed at 0.5.0 from a recorded run
- **THEN** it is derivable entirely from the emitted outputs, with no additional instrumentation
  added to the simulation

#### Scenario: Capital growth flattens over the reference run

- **WHEN** the reference scenario runs for 200 world years with zero player input
- **THEN** the rolling growth rate of total effective capital contribution is non-increasing after
  the documented establishment phase

### Requirement: Universities and libraries carry no position

Universities, libraries, and their staff cohorts MUST NOT have position components. Affiliation and
admission MUST be expressed as handle relationships, never as proximity.

#### Scenario: Position on a university is rejected

- **WHEN** a position component is attached to a university, library, or staff cohort
- **THEN** the operation fails in development builds and the conformance test fails in CI

#### Scenario: Affiliation is a handle

- **WHEN** a mage affiliates with a university
- **THEN** its `universityId` is set to that university's handle and no distance is computed
