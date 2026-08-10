## ADDED Requirements

### Requirement: Fixed, append-only goal enumeration

Mage behaviour SHALL be selected from a fixed enumeration of goals with stable integer ids:
`idle`, `research-node`, `rediscover-node`, `seek-teaching`, `teach`, `scribe`, `affiliate`,
`ward-duty`, and `raid-readiness`. Goal ids MUST be append-only; renumbering or reusing an id is
forbidden, because goal ids are reported in balance metrics and committed baselines are keyed on
them.

#### Scenario: Goal ids are stable

- **WHEN** a new goal is added to the enumeration
- **THEN** it receives the next unused id and no existing goal's id changes

#### Scenario: Renumbering is rejected

- **WHEN** an existing goal's id is changed
- **THEN** the goal-registry test fails and its error explains the balance-baseline consequence

#### Scenario: Idle is always available

- **WHEN** a mage has no feasible goal of any other kind
- **THEN** it selects `idle`, and no "no goal selected" state is ever reached

### Requirement: Feasibility is a mask, not a weight

Goals a mage cannot currently pursue SHALL be removed from consideration before scoring, exactly as
illegal actions are masked in `docs/design/contracts.md` §4.2. A masked goal MUST NOT be selectable
at any score. The count of masked goals per mage per evaluation MUST be observable.

#### Scenario: Missing prerequisites mask research

- **WHEN** a mage lacks a prerequisite for every node on its frontier
- **THEN** `research-node` is masked and is not selected regardless of the mage's curiosity

#### Scenario: No teacher masks seeking

- **WHEN** no living mage in the universe holds a node the evaluating mage can learn
- **THEN** `seek-teaching` is masked

#### Scenario: No materials masks scribing

- **WHEN** the universe's materials stock is below the cost of the cheapest available scribing
- **THEN** `scribe` is masked for every mage

#### Scenario: Depth ceiling masks targets above it

- **WHEN** the only unresearched nodes available to a mage are above its species `depthCeiling`
- **THEN** `research-node` and `seek-teaching` are masked for those targets

#### Scenario: Masking is counted

- **WHEN** a mage is evaluated
- **THEN** the number of goals masked as infeasible is recorded for that evaluation and is
  reportable in aggregate

### Requirement: Utility scores are additive fixed-point terms

A goal's score SHALL be computed as
`clamp(base + roleBias + speciesTerm + personalityTerm + ageTerm + opportunityTerm, 0, fp(4096))`,
in fixed-point integers with a single clamp applied last. Multiplicative chains of response curves
MUST NOT be used, and each term MUST be individually attributable for ablation.

#### Scenario: Terms are individually ablatable

- **WHEN** one scoring term is zeroed and a scenario is rerun from the same seed
- **THEN** the change in each mage's selected goal is attributable to that term alone

#### Scenario: No floating point in scoring

- **WHEN** the scoring routine is linted
- **THEN** it contains no floating-point arithmetic and no non-integer numeric literal

#### Scenario: Scores are clamped once

- **WHEN** the summed terms for a goal exceed `fp(4096)`
- **THEN** the score is `fp(4096)` and the clamp is applied after summation, not per term

### Requirement: Species, personality, age, and role shape the score

Scoring SHALL be shaped by all four of species, personality, age band, and assigned role. Species
`curiosity` MUST raise `research-node` and `rediscover-node`; a mage's rolled `curiosity`,
`ambition`, and `caution` MUST each shift at least one goal; and the age band derived from
normalized age MUST shift the balance between producing and preserving knowledge.

#### Scenario: Curious species research more

- **WHEN** a gnome and a dwarf of identical role, age band, and opportunity are evaluated
- **THEN** the gnome's `research-node` score is higher

#### Scenario: Cautious mages preserve

- **WHEN** two mages differ only in rolled `caution`
- **THEN** the more cautious mage scores `scribe` and `ward-duty` higher and `rediscover-node` lower

#### Scenario: Senescent mages turn to teaching and scribing

- **WHEN** a mage crosses from the prime age band into the senescent band
- **THEN** its `research-node` score falls and its `teach` and `scribe` scores rise

#### Scenario: Age bands derive from normalized age

- **WHEN** an elf and an orc are each at normalized age `fp(512)`
- **THEN** both are in the same age band, despite an absolute age difference of centuries

### Requirement: Roles bias but never dictate

An assigned role SHALL contribute a bounded bias term per goal and MUST NOT mask, force, or
exclusively permit any goal. A mage MUST be able to select any feasible goal regardless of role.

#### Scenario: A researcher without research teaches

- **WHEN** a researcher-role mage has `research-node` and `rediscover-node` masked as infeasible
- **THEN** it selects the highest-scoring remaining feasible goal, such as `teach`

#### Scenario: Role bias is bounded

- **WHEN** the role bias table is validated
- **THEN** every entry lies within a documented bounded range and no entry is large enough to
  dominate the sum of all other terms at their extremes

#### Scenario: An unassigned universe does not deadlock

- **WHEN** every mage holds the default researcher role and the god issues no assignments for 200
  world years
- **THEN** teaching and scribing still occur, and the universe's node count does not stall at its
  founding value

### Requirement: Evaluation is staggered and goals are held with hysteresis

A mage SHALL re-evaluate its goal when `(worldTick + mageId) mod evalPeriod == 0`, or immediately
when its current goal completes or becomes infeasible. A challenger goal MUST exceed the incumbent's
score by a hysteresis margin to displace it, and a newly adopted goal MUST be held for a minimum
commitment period unless it completes or becomes infeasible.

#### Scenario: Evaluation load is spread across ticks

- **WHEN** a universe of 3,000 mages is stepped with `evalPeriod` of 3
- **THEN** approximately one third of mages are re-evaluated on each tick, and the phase of each is
  determined by its entity id

#### Scenario: No synchronized goal stampede

- **WHEN** a shared input changes such that one goal becomes globally more attractive
- **THEN** mages switch to it over at least `evalPeriod` ticks rather than all within one tick

#### Scenario: Marginal challenger does not displace

- **WHEN** a challenger goal scores above the incumbent by less than the hysteresis margin
- **THEN** the mage keeps its current goal

#### Scenario: Infeasibility interrupts commitment

- **WHEN** a mage's committed goal becomes infeasible before its minimum commitment elapses
- **THEN** the mage re-evaluates in that same tick

### Requirement: Autonomy is position-free

Goal feasibility, scoring, target selection, and completion MUST NOT reference any position,
distance, travel time, or coordinate. Opportunity terms SHALL be computed from affiliation and the
teaching graph only, and a change of university affiliation MUST take effect as a handle change
with no travel.

#### Scenario: No distance in the autonomy path

- **WHEN** the conformance check scans the autonomy module for position component access or distance
  computation
- **THEN** it finds none and the check passes; any occurrence fails CI and names the file

#### Scenario: Teacher availability is graph-based

- **WHEN** a mage evaluates `seek-teaching`
- **THEN** eligibility depends on whether a living, willing holder of the node exists, not on where
  that holder is

#### Scenario: Affiliation change is instantaneous

- **WHEN** a mage selects `affiliate` and the goal completes
- **THEN** its `universityId` changes in that tick with no intervening travel state

### Requirement: Selection is deterministic and bounded in cost

Goal selection SHALL be deterministic given `(state, rootSeed)`. Ties MUST be broken by a draw on
RNG stream 7 and never by iteration order of a hash structure. Candidate target scanning per goal
per evaluation MUST be bounded by a documented constant.

#### Scenario: Identical runs select identical goals

- **WHEN** the same scenario is run twice from the same root seed
- **THEN** every mage selects the same goal with the same target at every tick

#### Scenario: Ties draw from stream 7

- **WHEN** two goals score identically for one mage
- **THEN** the winner is chosen by a draw on RNG stream 7, and adding a draw in another subsystem
  does not change it

#### Scenario: Candidate scanning is bounded

- **WHEN** a mage in a universe holding several hundred researchable nodes is evaluated
- **THEN** the number of candidate targets examined per goal does not exceed the documented constant

### Requirement: Goal selection is observable in aggregate

The simulation SHALL emit, per world tick, a histogram of selected goals by species and by role, and
a count of goal switches. These outputs MUST be available without enabling a debug mode.

#### Scenario: Histogram is emitted every tick

- **WHEN** a world tick completes
- **THEN** a goal histogram keyed by species and role is available for that tick

#### Scenario: Monoculture is visible

- **WHEN** more than a documented fraction of living mages select the same goal for a sustained
  number of ticks
- **THEN** the condition is detectable from the emitted histogram without re-running the simulation
