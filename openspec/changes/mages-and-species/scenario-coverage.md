# Scenario coverage — `mages-and-species`

Task 10.1: *"confirm every scenario across the five capability specs has a corresponding passing
test"*.

A confirmation nobody can re-run is an opinion. So this file is a **manifest**, and a
`scenario-coverage.test.ts` checks it against the specs and against the filesystem:

- every `#### Scenario:` heading in `specs/economy`, `specs/mage-autonomy`, `specs/mage-lifecycle`,
  `specs/species-traits` and `specs/universities` appears here exactly once, and nothing appears
  here that is not in a spec;
- every file named below exists and is a file `vitest` collects.

That makes the manifest fail when a scenario is added and left unmapped, and when a test file is
renamed or deleted out from under a claim. What it deliberately does **not** do is assert that a
named file contains an assertion *about* the scenario — nothing mechanical can, short of writing the
scenario id into every `it`, which turns a design document into a test-naming convention. The
mapping is a reviewed claim; the check keeps it from rotting.

Rows are `Requirement > Scenario | file`. A scenario covered in more than one place names the file
that asserts it most directly.

## `specs/economy`

| requirement > scenario | test |
|---|---|
| Populace exists only as counted cohorts > A large population is one cohort | `packages/rules-world/test/unit/populace-cohort-store.test.ts` |
| Populace exists only as counted cohorts > Individual populace creation is rejected | `packages/rules-world/test/unit/populace-cohort-store.test.ts` |
| Populace exists only as counted cohorts > Draw count is independent of population size | `packages/rules-world/test/unit/populace-mortality.test.ts` |
| Cohort identity is unique and collisions merge > Split and rejoin merges | `packages/rules-world/test/unit/populace-cohort-store.test.ts` |
| Cohort identity is unique and collisions merge > Duplicate keys are impossible | `packages/rules-world/test/unit/populace-cohort-store.test.ts` |
| Cohort identity is unique and collisions merge > Cohort entity count is bounded | `packages/rules-world/test/unit/populace-long-run.test.ts` |
| Cohort identity is unique and collisions merge > Empty cohorts are reclaimed | `packages/rules-world/test/unit/populace-cohort-store.test.ts` |
| Occupations are the five contracted values > Newborns are idle | `packages/rules-world/test/unit/populace-occupations.test.ts` |
| Occupations are the five contracted values > Children cannot labor | `packages/rules-world/test/unit/populace-occupations.test.ts` |
| Occupations are the five contracted values > No sixth occupation | `packages/rules-world/test/unit/populace-occupations.test.ts` |
| Occupation reallocation is rate-limited > Reallocation is gradual | `packages/rules-world/test/unit/populace-occupations.test.ts` |
| Occupation reallocation is rate-limited > The economy does not oscillate | `packages/rules-world/test/unit/populace-long-run.test.ts` |
| Occupation reallocation is rate-limited > Allocation order is deterministic | `packages/rules-world/test/unit/populace-occupations.test.ts` |
| Occupation reallocation is rate-limited > Demand beyond supply is recorded | `packages/rules-world/test/unit/populace-occupations.test.ts` |
| Carrying capacity is derived from territory and is bounded > A stock that grows without limit does not grow `K` without limit | `packages/rules-world/test/unit/economy-population.test.ts` |
| Carrying capacity is derived from territory and is bounded > The bound names content and nothing else | `packages/rules-world/test/unit/territory-holdings.test.ts` |
| Carrying capacity is derived from territory and is bounded > Bare land still carries people | `packages/rules-world/test/unit/economy-population.test.ts` |
| Carrying capacity is derived from territory and is bounded > No land carries nobody | `packages/rules-world/test/unit/economy-population.test.ts` |
| Births are logistically braked by carrying capacity > Growth slows as capacity is approached | `packages/rules-world/test/unit/economy-population.test.ts` |
| Births are logistically braked by carrying capacity > Population does not exceed carrying capacity | `packages/rules-world/test/unit/economy-population.test.ts` |
| Births are logistically braked by carrying capacity > The composed loop converges | `packages/rules-world/test/unit/economy-population.test.ts` |
| Births are logistically braked by carrying capacity > Fertile species grow faster | `packages/rules-world/test/unit/economy-population.test.ts` |
| Births are logistically braked by carrying capacity > Extinction is absorbing and not prevented | `packages/rules-world/test/unit/economy-population.test.ts` |
| Cohort members die at cohort granularity > Old cohorts decay to nothing | `packages/rules-world/test/unit/populace-mortality.test.ts` |
| Cohort members die at cohort granularity > Draw count is one per cohort | `packages/rules-world/test/unit/populace-mortality.test.ts` |
| Cohort members die at cohort granularity > Long-lived cohorts still die | `packages/rules-world/test/unit/populace-mortality.test.ts` |
| Cohort members die at cohort granularity > Birth buckets are reclaimed | `packages/rules-world/test/unit/populace-long-run.test.ts` |
| Cohort members die at cohort granularity > Deaths balance births at equilibrium | `packages/scenario/test/unit/reference-long-run.test.ts` |
| Materials are produced by labor and consumed by everything > A shortage of one kind does not starve another kind's claimant | `packages/rules-world/test/unit/economy-materials.test.ts` |
| Materials are produced by labor and consumed by everything > Two rulesets produce two economies | `packages/rules-world/test/unit/economy-kinds.test.ts` |
| Materials are produced by labor and consumed by everything > Orc laborers outproduce draconic laborers | `packages/rules-world/test/unit/production-aptitude.test.ts` |
| Materials are produced by labor and consumed by everything > Consumption cannot overdraw | `packages/rules-world/test/unit/economy-materials.test.ts` |
| Materials are produced by labor and consumed by everything > Scribing consumes materials | `packages/rules-magic/test/unit/scribing.test.ts` |
| Materials are produced by labor and consumed by everything > Subsistence shortfall has consequences | `packages/rules-world/test/unit/economy-population.test.ts` |
| The economy has exactly three tracked inputs, plus Vis > No fifth resource | `packages/rules-world/test/unit/economy-three-inputs.test.ts` |
| The economy has exactly three tracked inputs, plus Vis > Vis is raid-scoped until this capability gives it a store | `packages/rules-raid/test/unit/verbs.test.ts` |
| The economy has exactly three tracked inputs, plus Vis > Worship inputs are exposed, not computed | `packages/rules-world/test/unit/economy-three-inputs.test.ts` |
| The economy has exactly three tracked inputs, plus Vis > Knowledge is an input, not only an output | `packages/coordination/test/unit/knowledge-capital.test.ts` |
| Populace cohorts carry no position > Position on a cohort is rejected | `packages/rules-world/test/unit/economy-three-inputs.test.ts` |
| Populace cohorts carry no position > No distance in the economy path | `packages/rules-world/test/unit/economy-three-inputs.test.ts` |
| A universe runs unattended for 200 world years > No species is lost | `packages/scenario/test/unit/reference-long-run.test.ts` |
| A universe runs unattended for 200 world years > Population stays bounded | `packages/scenario/test/unit/reference-long-run.test.ts` |
| A universe runs unattended for 200 world years > The civilization does not stall | `packages/scenario/test/unit/reference-long-run.test.ts` |
| A universe runs unattended for 200 world years > The run is reproducible | `packages/scenario/test/unit/reference-long-run.test.ts` |

## `specs/mage-autonomy`

| requirement > scenario | test |
|---|---|
| Fixed, append-only goal enumeration > Goal ids are stable | `packages/rules-world/test/unit/autonomy-goal-registry.test.ts` |
| Fixed, append-only goal enumeration > Renumbering is rejected | `packages/rules-world/test/unit/autonomy-goal-registry.test.ts` |
| Fixed, append-only goal enumeration > Idle is always available | `packages/rules-world/test/unit/autonomy-feasibility.test.ts` |
| Practice restores mastery and competes for the month > A stale scholar recovers the standing to supervise | `packages/rules-magic/test/unit/practice.test.ts` |
| Practice restores mastery and competes for the month > Practice costs the month it spends | `packages/coordination/test/unit/practice-rate-channel.test.ts` |
| Practice restores mastery and competes for the month > An interdicted cell cannot be practised | `packages/rules-magic/test/unit/practice.test.ts` |
| Practice restores mastery and competes for the month > Candidate ordering favours the stalest node | `packages/rules-magic/test/unit/practice.test.ts` |
| Practice restores mastery and competes for the month > Practice is offered for lost standing, not for any imperfection | `packages/rules-magic/test/unit/practice.test.ts` |
| Feasibility is a mask, not a weight > Missing prerequisites mask research | `packages/rules-world/test/unit/autonomy-feasibility.test.ts` |
| Feasibility is a mask, not a weight > No teacher masks seeking | `packages/rules-world/test/unit/autonomy-feasibility.test.ts` |
| Feasibility is a mask, not a weight > No materials masks scribing | `packages/rules-world/test/unit/autonomy-feasibility.test.ts` |
| Feasibility is a mask, not a weight > Depth ceiling masks targets above it | `packages/rules-world/test/unit/autonomy-candidates.test.ts` |
| Feasibility is a mask, not a weight > Masking is counted | `packages/rules-world/test/unit/autonomy-feasibility.test.ts` |
| Utility scores are additive fixed-point terms > Terms are individually ablatable | `packages/rules-world/test/unit/autonomy-ablation.test.ts` |
| Utility scores are additive fixed-point terms > No floating point in scoring | `packages/rules-world/test/unit/autonomy-scoring.test.ts` |
| Utility scores are additive fixed-point terms > Scores are clamped once | `packages/rules-world/test/unit/autonomy-scoring.test.ts` |
| Species, personality, age, and role shape the score > Curious species research more | `packages/rules-world/test/unit/autonomy-scoring.test.ts` |
| Species, personality, age, and role shape the score > Cautious mages preserve | `packages/rules-world/test/unit/autonomy-role-and-age.test.ts` |
| Species, personality, age, and role shape the score > Senescent mages turn to teaching and scribing | `packages/rules-world/test/unit/autonomy-role-and-age.test.ts` |
| Species, personality, age, and role shape the score > Age bands derive from normalized age | `packages/rules-world/test/unit/autonomy-role-and-age.test.ts` |
| Roles bias but never dictate > A researcher without research teaches | `packages/rules-world/test/unit/autonomy-role-and-age.test.ts` |
| Roles bias but never dictate > Role bias is bounded | `packages/rules-world/test/unit/autonomy-role-and-age.test.ts` |
| Roles bias but never dictate > An unassigned universe does not deadlock | `packages/scenario/test/unit/reference-long-run.test.ts` |
| Evaluation is staggered and goals are held with hysteresis > Evaluation load is spread across ticks | `packages/rules-world/test/unit/autonomy-schedule.test.ts` |
| Evaluation is staggered and goals are held with hysteresis > No synchronized goal stampede | `packages/rules-world/test/unit/autonomy-stampede.test.ts` |
| Evaluation is staggered and goals are held with hysteresis > Marginal challenger does not displace | `packages/rules-world/test/unit/autonomy-schedule.test.ts` |
| Evaluation is staggered and goals are held with hysteresis > Infeasibility interrupts commitment | `packages/rules-world/test/unit/autonomy-schedule.test.ts` |
| Autonomy is position-free > No distance in the autonomy path | `packages/rules-world/test/unit/autonomy-no-position.test.ts` |
| Autonomy is position-free > Teacher availability is graph-based | `packages/rules-world/test/unit/autonomy-target-appeal.test.ts` |
| Autonomy is position-free > Affiliation change is instantaneous | `packages/rules-world/test/unit/autonomy-commitment-persistence.test.ts` |
| Selection is deterministic and bounded in cost > Identical runs select identical goals | `packages/rules-world/test/unit/autonomy-selection.test.ts` |
| Selection is deterministic and bounded in cost > Ties draw from stream 7 | `packages/rules-world/test/unit/autonomy-selection.test.ts` |
| Selection is deterministic and bounded in cost > Candidate scanning is bounded | `packages/rules-world/test/unit/autonomy-candidates.test.ts` |
| Goal selection is observable in aggregate > Histogram is emitted every tick | `packages/rules-world/test/unit/autonomy-histogram.test.ts` |
| Goal selection is observable in aggregate > Monoculture is visible | `packages/rules-world/test/unit/autonomy-histogram.test.ts` |

## `specs/mage-lifecycle`

| requirement > scenario | test |
|---|---|
| Mages are enrolled from student cohorts, never spawned > Integer part promotes deterministically | `packages/rules-world/test/unit/mage-promotion.test.ts` |
| Mages are enrolled from student cohorts, never spawned > Remainder resolved by exactly one draw | `packages/rules-world/test/unit/mage-promotion.test.ts` |
| Mages are enrolled from student cohorts, never spawned > Per-person draws are rejected | `packages/rules-world/test/unit/mage-promotion.test.ts` |
| Mages are enrolled from student cohorts, never spawned > Unenrolled students leave the student occupation | `packages/coordination/test/unit/student-enrolment.test.ts` |
| Mages are enrolled from student cohorts, never spawned > The gap between who could be a mage and who was seated is reported | `packages/coordination/test/unit/student-enrolment.test.ts` |
| Graduation is curriculum completion, not age > A deeper university holds its students longer | `packages/coordination/test/unit/student-enrolment.test.ts` |
| Graduation is curriculum completion, not age > A rate that makes learning faster moves the graduation date | `packages/coordination/test/unit/student-enrolment.test.ts` |
| Graduation is curriculum completion, not age > A student who can be taught nothing and knows nothing is reported, not graduated | `packages/coordination/test/unit/student-enrolment.test.ts` |
| A student is a mage entity, not a headcount > A student holds knowledge in her own mind | `packages/scenario/test/unit/students-hold-knowledge.test.ts` |
| A student is a mage entity, not a headcount > The god cannot enrol or un-enrol anybody | `packages/rules-world/test/unit/mage-roles.test.ts` |
| Personality is rolled at birth from species means > Curiosity tracks the species mean | `packages/rules-world/test/unit/mage-personality.test.ts` |
| Personality is rolled at birth from species means > Ambition and caution are species-neutral | `packages/rules-world/test/unit/mage-personality.test.ts` |
| Personality is rolled at birth from species means > Personality is immutable | `packages/rules-world/test/unit/mage-personality.test.ts` |
| Personality is rolled at birth from species means > Personality roll is reproducible | `packages/rules-world/test/unit/mage-personality.test.ts` |
| Age is derived and never stored > No age field exists | `packages/rules-world/test/unit/no-stored-age.test.ts` |
| Age is derived and never stored > Age advances with the world clock | `packages/rules-world/test/unit/mage-age.test.ts` |
| Age is derived and never stored > Age does not advance during engagement | `packages/rules-world/test/unit/mage-age.test.ts` |
| Mortality is a per-tick hazard roll > Hazard rises with normalized age | `packages/rules-world/test/unit/mage-mortality.test.ts` |
| Mortality is a per-tick hazard roll > The same table serves every lifespan | `packages/rules-world/test/unit/mage-mortality.test.ts` |
| Mortality is a per-tick hazard roll > No death date is stored | `packages/rules-world/test/unit/no-stored-age.test.ts` |
| Hazard division uses extended precision > Long-lived species retain a non-zero hazard | `packages/rules-world/test/unit/mage-mortality.test.ts` |
| Hazard division uses extended precision > Dragons are not silently immortal | `packages/rules-world/test/unit/mage-mortality.test.ts` |
| Hazard division uses extended precision > Rounding remains uniform | `packages/rules-world/test/unit/lifespan-rate.test.ts` |
| Lifespan variance and lifespan effects are derived, not stored > Variance is stable across recomputation | `packages/rules-world/test/unit/mage-lifespan.test.ts` |
| Lifespan variance and lifespan effects are derived, not stored > Slot reuse does not alias variance | `packages/rules-world/test/unit/mage-lifespan.test.ts` |
| Lifespan variance and lifespan effects are derived, not stored > A lifespan blessing can save an old mage | `packages/rules-world/test/unit/mage-lifespan.test.ts` |
| Lifespan variance and lifespan effects are derived, not stored > Lifespan bonus is capped | `packages/rules-world/test/unit/mage-lifespan.test.ts` |
| Death destroys the knowledge a mage carried > Mind instances die with the mage | `packages/rules-world/test/unit/mage-death.test.ts` |
| Death destroys the knowledge a mage carried > Memory palace is unrecoverable | `packages/rules-world/test/unit/mage-death.test.ts` |
| Death destroys the knowledge a mage carried > Grimoires survive their author | `packages/rules-world/test/unit/mage-death.test.ts` |
| Death destroys the knowledge a mage carried > An unaffiliated mage's grimoires enter transit | `packages/rules-world/test/unit/mage-death.test.ts` |
| Death destroys the knowledge a mage carried > Last instance leaving the universe is signalled | `packages/rules-world/test/unit/mage-death.test.ts` |
| Death destroys the knowledge a mage carried > Dead mages are excluded from work | `packages/rules-world/test/unit/mage-death.test.ts` |
| Standing role is assigned only by the god > Role persists across affiliation change | `packages/rules-world/test/unit/mage-roles.test.ts` |
| Standing role is assigned only by the god > Autonomy does not extend to roles | `packages/rules-world/test/unit/mage-roles.test.ts` |
| Standing role is assigned only by the god > Newly promoted mages have a default role | `packages/rules-world/test/unit/mage-roles.test.ts` |

## `specs/species-traits`

| requirement > scenario | test |
|---|---|
| Six species defined as validated content > All six species load | `packages/rules-world/test/unit/species-traits.test.ts` |
| Six species defined as validated content > Species trait literal in code is rejected | `packages/rules-world/test/unit/no-species-literals.test.ts` |
| Six species defined as validated content > Unknown affinity key rejected | `packages/rules-world/test/unit/species-traits.test.ts` |
| Species schema additions > Contract document and schema agree | `packages/rules-world/test/unit/species-contract-conformance.test.ts` |
| Species schema additions > Maturity beyond lifespan rejected | `packages/rules-world/test/unit/species-traits.test.ts` |
| Species schema additions > No martial trait is introduced | `packages/rules-world/test/unit/species-traits.test.ts` |
| Trait direction is uniform and higher is better > High rediscovery affinity lowers cost | `packages/rules-magic/test/adversarial/rediscovery-affinity-direction.test.ts` |
| Trait direction is uniform and higher is better > Direction is asserted, not assumed | `packages/rules-world/test/unit/species-traits.test.ts` |
| Effective rediscovery multiplier has a floor > Affinity cannot break the floor | `packages/rules-magic/test/adversarial/rediscovery-boundaries.test.ts` |
| Effective rediscovery multiplier has a floor > Affinity operates above the floor | `packages/rules-magic/test/adversarial/rediscovery-boundaries.test.ts` |
| Species magnitudes are marked as untuned > Placeholder marking is present | `packages/rules-world/test/unit/species-traits.test.ts` |
| Species magnitudes are marked as untuned > Balance assertion at 0.4.0 rejected | `packages/rules-world/test/unit/pre-0-5-0-claim-check.test.ts` |
| Species differentiate measurably > No two species are indistinguishable | `packages/scenario/test/unit/reference-time-to-tier.test.ts` |
| Species differentiate measurably > Depth ceiling is a hard limit | `packages/rules-world/test/unit/autonomy-candidates.test.ts` |
| Species differentiate measurably > Scribe affinity reaches grimoire durability | `packages/rules-magic/test/unit/scribing-fidelity.test.ts` |

## `specs/universities`

| requirement > scenario | test |
|---|---|
| Universities are built before they function > Incomplete university admits nobody | `packages/rules-world/test/unit/universities-construction.test.ts` |
| Universities are built before they function > Construction consumes materials | `packages/rules-world/test/unit/universities-construction.test.ts` |
| Universities are built before they function > Construction stalls without materials | `packages/rules-world/test/unit/universities-construction.test.ts` |
| Universities are built before they function > Completion unlocks capacity | `packages/rules-world/test/unit/universities-construction.test.ts` |
| Capacity gates concurrent students > Admission is refused at capacity | `packages/coordination/test/unit/student-admissions.test.ts` |
| Capacity gates concurrent students > Capacity frees on graduation | `packages/rules-world/test/unit/universities-capacity-and-scribing.test.ts` |
| Capacity gates concurrent students > Total capacity is reported | `packages/rules-world/test/unit/universities-no-specialization.test.ts` |
| Staff cohorts drive scribing throughput > No scribes, no scribing | `packages/rules-world/test/unit/universities-capacity-and-scribing.test.ts` |
| Staff cohorts drive scribing throughput > Dwarven scribes outproduce human scribes | `packages/rules-world/test/unit/universities-capacity-and-scribing.test.ts` |
| Staff cohorts drive scribing throughput > Staff cohorts remain aggregated | `packages/coordination/test/unit/university-staffing.test.ts` |
| Universities have no declared specialization > No specialization field exists | `packages/rules-world/test/unit/universities-no-specialization.test.ts` |
| Universities have no declared specialization > Profile follows the library | `packages/rules-world/test/unit/universities-library.test.ts` |
| Universities have no declared specialization > Burning the library erases the identity | `packages/rules-world/test/unit/universities-library.test.ts` |
| Universities have no declared specialization > The institutions observation block is not resized | `packages/rules-world/test/unit/universities-no-specialization.test.ts` |
| Library depth contributes bounded knowledge capital > Contribution enters shared stacking | `packages/rules-world/test/unit/universities-capital.test.ts` |
| Library depth contributes bounded knowledge capital > No bespoke library multiplier | `packages/rules-world/test/unit/universities-capital-routing.test.ts` |
| Library depth contributes bounded knowledge capital > Contribution saturates | `packages/rules-world/test/unit/universities-capital.test.ts` |
| Library depth contributes bounded knowledge capital > Clamping is counted | `packages/rules-world/test/unit/universities-capital.test.ts` |
| Library returns are concave > Marginal return never increases | `packages/rules-world/test/unit/universities-capital.test.ts` |
| Library returns are concave > A convex tuning edit fails CI | `packages/rules-world/test/unit/universities-capital.test.ts` |
| Library returns are concave > Doubling depth does not double output | `packages/rules-world/test/unit/universities-capital.test.ts` |
| Library relevance is gated by species depth ceiling > Deep nodes do not help shallow species | `packages/rules-world/test/unit/universities-library.test.ts` |
| Library relevance is gated by species depth ceiling > The same library helps species differently | `packages/rules-world/test/unit/universities-capital.test.ts` |
| Library relevance is gated by species depth ceiling > Relevance lookup is fixed-size | `packages/rules-world/test/unit/universities-library.test.ts` |
| Libraries impose upkeep proportional to depth > Upkeep grows linearly with holdings | `packages/rules-world/test/unit/universities-library.test.ts` |
| Libraries impose upkeep proportional to depth > Upkeep is unaffordable | `packages/coordination/test/unit/library-degradation.test.ts` |
| Libraries impose upkeep proportional to depth > Hoarding has a cost | `packages/coordination/test/unit/knowledge-capital.test.ts` |
| Knowledge capital state is emitted for later measurement > Per-tick capital telemetry exists | `packages/coordination/test/unit/knowledge-capital.test.ts` |
| Knowledge capital state is emitted for later measurement > The metric is computable without retrofit | `packages/coordination/test/unit/knowledge-capital.test.ts` |
| Knowledge capital state is emitted for later measurement > Capital growth flattens over the reference run | `packages/scenario/test/unit/reference-long-run.test.ts` |
| Universities and libraries carry no position > Position on a university is rejected | `packages/rules-world/test/unit/university-isolation.test.ts` |
| Universities and libraries carry no position > Affiliation is a handle | `packages/rules-world/test/unit/university-isolation.test.ts` |
