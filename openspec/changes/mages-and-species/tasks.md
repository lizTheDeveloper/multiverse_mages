## 1. Contract amendment and package skeleton

- [x] 1.1 Amend `docs/design/contracts.md` §2.4 to add `maturityMonths`, `mageAptitude`, and `laborAffinity`, and note that soldier effectiveness is deliberately absent and owned by `raid-engagement`
- [x] 1.2 Amend `docs/design/contracts.md` §2.4 to state the direction of `rediscoveryAffinity` as higher-is-better, applied as a divisor
- [x] 1.3 Record the `fp(3072)` floor on the effective rediscovery multiplier in `docs/design/contracts.md`, citing the 0.3.0 release claim it protects
- [x] 1.4 Update the `species.json` JSON Schema in `packages/content` to match the amended contract
- [x] 1.5 Create `packages/rules-world` with dependencies on `sim-core` and `content` only, and no dependency on `rules-magic`
- [x] 1.6 Extend the dependency-graph test to assert `rules-world` does not import `rules-magic`, and verify it fails on a deliberately added import before reverting
- [x] 1.7 Define the narrow coordinating-layer interface through which `rules-world` reaches knowledge instances, research, teaching, and scribing

## 2. Species content and traits

- [x] 2.1 Author the six species content files with the placeholder magnitudes from `design.md`, reproducing the `contracts.md` §2.4 dwarf example verbatim
- [x] 2.2 Add the machine-readable `untuned` tuning-status marker to every species file and record it at load
- [x] 2.3 Implement the trait registry declaring each `fp` trait's direction as higher-is-better
- [x] 2.4 Implement `effectiveRediscoveryMultiplier` as a divisor with the `fp(3072)` floor and a clamp counter
- [x] 2.5 Implement content validation for `maturityMonths` greater than zero and less than `lifespanMonths`, and for unknown `affinities` keys
- [x] 2.6 Add the CI check comparing the loaded species field set against `docs/design/contracts.md` §2.4
- [x] 2.7 Add the conformance check rejecting species-keyed numeric literals in `packages/rules-world/src`
- [x] 2.8 Add the pre-0.5.0 claim check that fails any test asserting a balance property over species magnitudes
- [x] 2.9 Unit test that all six species load, that a missing field fails the load, and that trait direction is applied consistently at every call site

## 3. Populace cohorts and occupations

- [x] 3.1 Implement the cohort store keyed on `(speciesId, occupation, birthTickBucket)` with decade bucketing
- [x] 3.2 Implement the merge-on-collision invariant and end-of-tick validation that no two cohorts share a key
- [x] 3.3 Implement cohort destruction and free-list return at a count of zero
- [x] 3.4 Implement the five occupations with `idle` covering pre-maturity and post-productive members, and newborn insertion into the youngest `idle` bucket
- [x] 3.5 Implement demand computation from construction sites, the scribing queue, university capacity, and the standing soldier target
- [x] 3.6 Implement rate-limited occupation reallocation with a deterministic allocation order and unmet-demand counters
- [x] 3.7 Assert the cohort entity count bound `6 × 5 × ceil(maxLifespanMonths / 120)` in a long-run test, recording the observed peak
- [x] 3.8 Implement cohort mortality from the shared scale-free hazard table, indexed by the normalized age implied by `birthTickBucket`, using the extended-scale division helper
- [x] 3.9 Implement expected-deaths arithmetic as an integer part plus exactly one stream 6 fractional draw per cohort per tick
- [x] 3.10 Test that a cohort past its species lifespan decays monotonically to zero and its entity is destroyed
- [x] 3.11 Test that no live cohort's birth bucket is older than its species `lifespanMonths` plus the documented tail allowance across the 200-year run
- [x] 3.12 Unit test that RNG draw count on stream 6 is independent of population size at fixed cohort count

## 4. Mage lifecycle

- [x] 4.1 Implement student-cohort promotion using integer arithmetic plus exactly one stream 1 remainder draw per cohort
- [x] 4.2 Assert in test that promoting a cohort of 10,000 makes exactly one RNG draw
- [x] 4.3 Implement the personality roll from means `(species.curiosity, fp(1024), fp(1024))` with bounded symmetric deviation and clamping to `[0, fp(2048)]`
- [x] 4.4 Implement derived age and add the conformance check rejecting any stored age, age band, death tick, or effective lifespan
- [x] 4.5 Implement the extended-scale division helper for per-tick rates derived from a lifespan, and require its use wherever such a rate is computed
- [x] 4.6 Author the scale-free mortality hazard table `H(normalizedAge)` as data, marked untuned
- [x] 4.7 Implement the per-tick mortality roll on stream 2 using the extended-scale helper
- [x] 4.8 Implement per-mage lifespan variance derived from `(rootSeed, mageId, generation, birthTick)`, with no stored field
- [x] 4.9 Implement `lifespan` primitive application recomputed at each hazard evaluation, clamped to 50% of species base with a clamp counter
- [x] 4.10 Test that a draconic hazard is strictly non-zero and that at least one draconic dies in the 200-year reference run
- [x] 4.11 Implement death consequences: destroy `mind` and `palace` instances, transfer grimoires to the affiliated library or unaffiliated holding, clear `alive`, release role and university slots
- [x] 4.12 Implement notification to the coordinating layer when a node's instance count reaches zero, writing no cached existence flag to state
- [x] 4.13 Implement mid-goal death handling: abandon the goal, dissolve any teaching pair, contribute no mage-months
- [x] 4.14 Implement default role assignment at promotion and role persistence across affiliation and goal changes

## 5. Mage autonomy

- [x] 5.1 Implement the append-only goal registry with stable ids and the test that rejects renumbering, with an error explaining the baseline consequence
- [x] 5.2 Implement feasibility masking for every goal, with `idle` always feasible, and a per-evaluation masked-goal counter
- [x] 5.3 Implement bounded candidate-target scanning with a documented constant, sourced from the mage's research frontier within its `depthCeiling`
- [x] 5.4 Implement additive fixed-point scoring with a single trailing clamp at `fp(4096)`
- [x] 5.5 Author the role bias table as data, bounded so no entry dominates the sum of all other terms at their extremes
- [x] 5.6 Implement the species, personality, and age-band scoring terms, including the senescent shift toward `teach` and `scribe`
- [x] 5.7 Implement age bands derived from normalized age so species with different lifespans share band boundaries
- [x] 5.8 Implement staggered re-evaluation on `(worldTick + mageId) mod evalPeriod`, plus immediate re-evaluation on completion or infeasibility
- [x] 5.9 Implement commitment minimum and hysteresis margin for goal displacement
- [x] 5.10 Implement deterministic tie-breaking on RNG stream 7
- [x] 5.11 Add the conformance check that the autonomy module accesses no position component and computes no distance
- [x] 5.12 Implement instantaneous affiliation change on `affiliate` completion
- [x] 5.13 Implement the per-tick goal histogram by species and role, plus the goal-switch counter, available without a debug mode
- [x] 5.14 Test term ablation: zeroing one scoring term changes selections attributably, on a fixed seed
- [x] 5.15 Test that no synchronized goal stampede occurs when a shared input changes

## 6. Universities

- [x] 6.1 Implement university creation with `buildProgress` 0 and effective capacity 0
- [x] 6.2 Implement construction from laborer cohort-months scaled by `laborAffinity` and capped `build-rate` stacking, consuming materials
- [x] 6.3 Implement construction stall when materials are insufficient, without driving materials negative
- [x] 6.4 Implement capacity unlock at `buildProgress` of `fp(1024)`
- [x] 6.5 Implement capacity-gated student admission with refusal and an unmet-demand counter
- [x] 6.6 Implement scribing throughput from staff cohorts, `scribeAffinity`, and capped `scribe-rate` stacking, including the zero-staff case
- [x] 6.7 Implement the library as a container of `locationKind` 3 instances, with grimoire aggregation
- [x] 6.8 Implement the derived university profile from library contents and resident mage knowledge, computed on demand and never cached in state
- [x] 6.9 Add the conformance check rejecting any specialization, focus, or preferred-cell field on a university
- [x] 6.10 Verify the `institutions` observation block still occupies exactly four slots

## 7. Knowledge as capital, and its brakes

- [x] 7.1 Author the library contribution table as data, marked untuned
- [x] 7.2 Implement the property test asserting strictly non-increasing marginal return per segment and a documented saturation value
- [x] 7.3 Implement the per-university per-tier relevance prefix-sum array, recomputed on library change
- [x] 7.4 Implement relevance gating by learner species `depthCeiling`
- [x] 7.5 Route the library contribution into the shared `(1 + Σ)` accumulator for `research-rate`, `teach-rate`, and `scribe-rate` with the `fp(4096)` cap
- [x] 7.6 Add the conformance check rejecting any library multiplier applied outside the shared stacking implementation
- [x] 7.7 Implement library upkeep proportional to instance count, with deterministic degradation on shortfall and no negative materials
- [x] 7.8 Implement per-tick emission of relevant depth by tier, effective contribution, and clamp count, per university
- [x] 7.9 Verify `capitalSnowball` as defined in `contracts.md` §7 is computable from the emitted outputs with no added instrumentation
- [x] 7.10 Test that doubling relevant depth from 96 to 192 increases contribution by strictly less than double
- [x] 7.11 Test that a library beyond the saturation point contributes no more than at saturation

## 8. Materials and the three-input economy

- [x] 8.1 Implement materials production from laborer cohorts, `laborAffinity`, and capped `resource-yield` stacking
- [x] 8.2 Implement materials consumption by construction, scribing, library upkeep, and populace subsistence, in a documented deterministic priority order
- [x] 8.3 Implement the non-negative materials invariant with recorded shortfalls
- [x] 8.4 Implement carrying capacity `K` from the universe's territory (`contracts.md` §2.7), modulated by materials stock and completed university capacity through a bounded multiplier that saturates
- [x] 8.4a Author `territory.json` and its schema as the eighth content file, every magnitude marked `untuned`
- [x] 8.4b Test the composed loop — `materialsProduced` → `consumeMaterials` → `carryingCapacity` → `fertilityBrake` → `expectedBirths` — over 2,400 ticks at laborer shares 0.15/0.20/0.30/0.50, asserting `K` converges under its stated bound while the materials stock is still diverging
- [x] 8.5 Implement the logistic fertility brake and the subsistence-shortfall effect on `K`
- [x] 8.6 Implement births into the youngest `idle` bucket, with extinction as an absorbing state and no synthesized founding population
- [ ] 8.7 Test that births and deaths per tick balance within a documented tolerance once the reference scenario reaches carrying capacity
- [x] 8.8 Add the check asserting exactly three tracked economic inputs and that this package never writes `favor` or `worship`
- [x] 8.9 Expose mage, university, and populace counts for `god-agency` to consume, computing no worship value
- [x] 8.10 Add the conformance check that no populace cohort carries a position and the economy path computes no distance

## 9. Reference scenario and release claims

- [ ] 9.1 Author the committed reference scenario seeded with all six species and zero player input
- [ ] 9.2 Implement the 200-world-year deterministic long-run test
- [ ] 9.3 Assert no species population reaches zero at any recorded checkpoint
- [ ] 9.4 Assert total population stays within `maxCarryingCapacity` of the scenario's territory — 109,800 for the shipped `territory.json` — and record the observed peak beside that bound
- [ ] 9.5 Assert research, teaching, and scribing each occur within every recorded window, and the final node count exceeds the founding count
- [ ] 9.6 Assert the run produces a byte-identical final snapshot hash across two executions
- [ ] 9.7 Assert the occupation mix shows no sustained two-tick alternation
- [ ] 9.8 Assert the rolling growth rate of total effective capital contribution is non-increasing after the documented establishment phase
- [ ] 9.9 Implement the time-to-tier measurement and assert at least four species differ by more than the observed cross-seed spread
- [ ] 9.10 Record the resulting mature-universe mage population and enter it against vision §13's open question

## 10. Closeout

- [ ] 10.1 Confirm every scenario across the five capability specs has a corresponding passing test
- [ ] 10.2 Run the full suite, typecheck, lint, purity check, content validation, and the dependency-graph test together
- [ ] 10.3 Confirm no world-scale entity introduced by this change carries a position component
- [ ] 10.4 Confirm no mechanism introduced by this change draws randomness per person
- [ ] 10.5 Update `docs/design/vision.md` §13 to mark the university-specialization question resolved as generic capacity with emergent specialization
- [ ] 10.6 Write the 0.4.0 release notes naming the `contracts.md` §2.4 amendment as a contract break, and asserting only the mechanical claims permitted before 0.5.0
- [ ] 10.7 Record any deviation discovered during implementation in `docs/design/contracts.md`, or confirm none
