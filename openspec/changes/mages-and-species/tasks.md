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
  - Re-checked, and it holds. It did not when the box was first ticked —
    `capitalRateMultiplier` had no caller outside its unit tests and `gateway.ts` passed
    `NEUTRAL_RATE` — but `w7/knowledge-capital` joined the halves: `world-step.ts` now calls
    `libraryRateMultiplier(primitive, bonuses, shelves, ceiling, rateClamps)` in the work phase,
    and `reference-long-run.test.ts` 9.8 reads a capital curve rather than a constant.
- [x] 7.6 Add the conformance check rejecting any library multiplier applied outside the shared stacking implementation
- [x] 7.7 Implement library upkeep proportional to instance count, with deterministic degradation on shortfall and no negative materials
- [x] 7.8 Implement per-tick emission of relevant depth by tier, effective contribution, and clamp count, per university
- [x] 7.9 Verify `capitalSnowball` as defined in `contracts.md` §7 is computable from the emitted outputs with no added instrumentation
- [x] 7.10 Test that doubling relevant depth from 96 to 192 increases contribution by strictly less than double
- [x] 7.11 Test that a library beyond the saturation point contributes no more than at saturation

## 8. Materials and the three-input economy

- [ ] 8.1 Implement materials production from laborer cohorts, `laborAffinity`, and capped `resource-yield` stacking
  - **Two of three.** Production from laborer cohorts and `laborAffinity` are live in
    `packages/coordination/src/world-step.ts`'s `produceMaterials`, and
    `resourceYieldMultiplier` in `packages/rules-world/src/economy/materials.ts` does stack and cap
    through the shared `stackMagnitudes`. Nothing feeds it: `world-step.ts` passes
    `resourceYieldBonuses: []` unconditionally, so the multiplier is `(1 + 0)` on every tick of
    every run and the cap can never bind. `npm run check:consumption` reports the same thing from
    the other end — `resource-yield` has no node-driven consumer, so no mage's knowledge moves it.
    The bonuses arrive with `w29/city-and-supply-chain` (PR #42), which routes them through
    `universe-effects.ts`; re-check the box against that branch, not this one.
- [ ] 8.2 Implement materials consumption by construction, scribing, library upkeep, and populace subsistence, in a documented deterministic priority order
  - **Three of the four claimants, and the order is real.** `CONSUMPTION_ORDER` in
    `packages/rules-world/src/economy/materials.ts` is authored, documented and tested. Subsistence
    and library upkeep are charged through it (`world-step.ts` passes `libraryUpkeep: upkeepOwed`
    since `w7/knowledge-capital`); scribing is charged at the desk in the work phase and passed as
    `0` here deliberately, so that it is not paid twice — that is documented at the call site and
    reported as `materialsScribed`. **Construction is not charged at all.** `world-step.ts` passes
    `construction: 0`, and `advanceConstruction` in
    `packages/rules-world/src/universities/construction.ts` — the function that computes
    `materialsSpent` — has no caller outside its own unit tests. Universities are attached complete
    by `coordination/src/god/interventions.ts` and `scenario/src/reference-universe.ts` rather than
    built, so no universe in any committed sweep has ever paid for one.
- [x] 8.3 Implement the non-negative materials invariant with recorded shortfalls
- [x] 8.4 Implement carrying capacity `K` from the universe's territory (`contracts.md` §2.7), modulated by materials stock and completed university capacity through a bounded multiplier that saturates
- [x] 8.4a Author `territory.json` and its schema as the eighth content file, every magnitude marked `untuned`
- [x] 8.4b Test the composed loop — `materialsProduced` → `consumeMaterials` → `carryingCapacity` → `fertilityBrake` → `expectedBirths` — over 2,400 ticks at laborer shares 0.15/0.20/0.30/0.50, asserting `K` converges under its stated bound while the materials stock is still diverging
- [x] 8.5 Implement the logistic fertility brake and the subsistence-shortfall effect on `K`
- [x] 8.6 Implement births into the youngest `idle` bucket, with extinction as an absorbing state and no synthesized founding population
- [ ] 8.7 Test that births and deaths per tick balance within a documented tolerance once the reference scenario reaches carrying capacity
  - **Unmet, and measured rather than guessed.** The reference scenario does not reach carrying
    capacity inside the 200-year horizon task 9.2 fixes: at world year 200 the population is 18,713
    against a `K` of 29,831 (63%) and births still exceed deaths by 11%. Extended to 500 years it
    does settle — `b/d` 0.999 at year 500, `P/K` 0.868 — at roughly world year 475, which is more
    than twice the committed horizon. What landed instead is the half that was held out:
    `economy-population.test.ts` now runs the composed loop **with mortality**, in the world tick's
    order, over 6,000 ticks against a fixed `K`, and settles at 3,935 of 4,000 with a 1.29%
    birth-to-death imbalance over the final quarter against a documented tolerance of 5%. The
    reference run's *approach* to balance is asserted in `reference-long-run.test.ts` (the ratio
    falls 4.83 → 1.09 and is non-increasing over the second half). Neither is "the reference
    scenario at carrying capacity", so the box stays open.
- [x] 8.8 Add the check asserting exactly three tracked economic inputs and that this package never writes `favor` or `worship`
- [x] 8.9 Expose mage, university, and populace counts for `god-agency` to consume, computing no worship value
- [x] 8.10 Add the conformance check that no populace cohort carries a position and the economy path computes no distance

## 9. Reference scenario and release claims

- [x] 9.1 Author the committed reference scenario seeded with all six species and zero player input
- [x] 9.2 Implement the 200-world-year deterministic long-run test
- [x] 9.3 Assert no species population reaches zero at any recorded checkpoint
  - Asserted at **every tick**, not only at checkpoints. Floor over the run: 26 / 27 / 27 / 27 / 28
    / 32 against 36 founded per species.
- [x] 9.4 Assert total population stays within `maxCarryingCapacity` of the scenario's territory — 109,800 for the shipped `territory.json` — and record the observed peak beside that bound
  - Observed peak 18,722 against the bound of 109,800, printed beside it. The bound is **not
    tight**, so the tighter statement is asserted too: the population never exceeds `K` at any
    tick, and `K` now falls (57,205 → 29,831) because the subsistence shortfall finally reaches
    `carryingCapacity` — the gap closes from a factor of 264 to a factor of 1.6, which is what
    stops this being the vacuous pass it used to be.
- [ ] 9.5 Assert research, teaching, and scribing each occur within every recorded window, and the final node count exceeds the founding count
  - **Half of it holds and half does not.** Research completes in all ten 20-year windows and the
    node count goes 6 → 51, and both are asserted. **Teaching stops after world year twenty**
    (nothing a mage researches clears the `fp(512)` teach threshold, so only founding grants are
    ever teachable and they are taught out) and **scribing stops after world year sixty** (books
    cost materials and the stock is empty from about year seventy). Per-window totals are printed.
    The current behaviour is asserted as a tripwire so that fixing either one fails the suite and
    brings somebody back to this box.
- [x] 9.6 Assert the run produces a byte-identical final snapshot hash across two executions
  - Two independent full 2,400-tick executions, not a replay and not a prefix; `c69e009ec85fd2a8`
    for the committed seed. A different seed produces a different hash, which is the control.
- [x] 9.7 Assert the occupation mix shows no sustained two-tick alternation
  - Longest alternating streak over 2,400 ticks: **2 ticks**, against a documented threshold of one
    world year.
- [ ] 9.8 Assert the rolling growth rate of total effective capital contribution is non-increasing after the documented establishment phase
  - **True and vacuous, so not asserted.** Total effective capital contribution is `fp(32)` from
    world year one to world year two hundred, because library depth reaches two distinct nodes and
    stops: the scribable list is ordered by cost, so every scribe copies the same cheap node — 1,263
    books, two nodes. A derivative that is zero for 199 years is not a diminishing return, and
    asserting non-increase over it would repeat exactly the vacuous pass task 9.4 used to be. The
    series is measured and printed, and the books-to-depth ratio is asserted so the finding cannot
    quietly stop being true.
- [ ] 9.9 Implement the time-to-tier measurement and assert at least four species differ by more than the observed cross-seed spread
  - **Measurement implemented; assertion is three species, not four.** Over eight seeds of a
    sixty-year run, time to a tier-2 mage: dwarf `[17,17]`, gnome `[16,17]`, human `[17,17]` — one
    band, indistinguishable; elf `[20,49]`, strictly above it in every seed; draconic `[63,548]`,
    strictly above elf. Orc is censored in seven seeds of eight and in the eighth arrives at tick
    316, inside draconic's interval, so it cannot be counted as a fourth. Tier 3 (the tier
    `species-traits` names) is measured and printed too and separates *fewer* species. The test
    names every indistinguishable pair, which is the half of the `species-traits` scenario this
    build can honour, and asserts that the list is non-empty so the day content separates them the
    suite fails and somebody returns to this box.
- [x] 9.10 Record the resulting mature-universe mage population and enter it against vision §13's open question
  - 88 living mages against a populace of 18,713 at world year 200 (peak 91). Entered in
    `vision.md` §13 with the finding that what bounds it is **student seats** — the founding
    academy's 64, filled to exactly 64 from world year thirty — and not anything about magic or
    mortality.

## 10. Closeout

- [ ] 10.1 Confirm every scenario across the five capability specs has a corresponding passing test
  - **Audited at requirement level: 42 requirements across the five specs, every one of which has a
    test file behind it.** At scenario level the answer is "all but three", and the three are the
    same three findings recorded above: `economy` / *The civilization does not stall* (teaching and
    scribing stop), `universities` / *Capital growth flattens over the reference run* (it is flat
    from year one, so there is no curve), and `species-traits` / *No two species are
    indistinguishable* (three pairs are). Each is measured and printed rather than asserted. The
    box is left open because its text is a universal and the universal is false.
- [x] 10.2 Run the full suite, typecheck, lint, purity check, content validation, and the dependency-graph test together
- [x] 10.3 Confirm no world-scale entity introduced by this change carries a position component
  - Confirmed mechanically rather than by reading: `assertNoWorldPositions` runs over the whole of
    `WORLD_COMPONENTS` — which includes every component this change added, `populace-cohort`,
    `university`, `library`, `goal-commitment` and `effort-progress` — and `state-schema.test.ts`
    mutation-checks it by injecting a positioned component and requiring the check to fire. The two
    source-level scanners over `rules-world/src/autonomy` and `rules-world/src/economy` remain the
    second line.
- [x] 10.4 Confirm no mechanism introduced by this change draws randomness per person
  - Three draw sites touch the populace and each is asserted to be O(cohorts): cohort mortality
    (one draw per cohort visited, unconditional, and the draw count is independent of population
    size), promotion (a cohort of 10,000 makes exactly one draw), and births (a cohort of 250,000
    makes exactly one draw, keyed on the cohort handle). The cohort entity count itself is bounded
    and asserted over a long run, so the number of draw sites cannot grow with the population.
    Mage mortality is per mage by design — §1.2 models a mage as an individual entity — and is not
    per-person randomness over the populace, which is what §1.3 forbids.
- [x] 10.5 Update `docs/design/vision.md` §13 to mark the university-specialization question resolved as generic capacity with emergent specialization
  - Resolved, with the caveat recorded beside it: the decision holds and the mechanism that would
    *demonstrate* it does not exist yet, because every library in the reference run holds the same
    two books.
- [x] 10.6 Write the 0.4.0 release notes naming the `contracts.md` §2.4 amendment as a contract break, and asserting only the mechanical claims permitted before 0.5.0
  - In `release-plan.md` under 0.4.0. §2.4 is named as the contract break, with the four other
    breaks recorded in `contracts.md` cross-referenced. Three claims, each with its disproof
    condition and whether the measurement is collected — and **the species-differentiation claim is
    recorded as disproved by its own disproof condition**, with the table. No balance claim.
  - The version bump and the tag are deliberately **not** taken on this branch: it already carries
    `agent-interface` and `god-agency` work, so a `v0.4.0` tag here would not point at a 0.4.0
    tree.
- [x] 10.7 Record any deviation discovered during implementation in `docs/design/contracts.md`, or confirm none
  - One new one, in §2.7: `carryingCapacity` now receives a `subsistenceShortfallShare`, computed
    inside the births phase because consumption is phase 9 and births are phase 8. The parameter
    existed from task 8.5 and no caller ever passed one, so `K` was the well-fed `K` for the length
    of any run. The five deviations recorded earlier — `state`, `primitives`, `coordination` and
    `scenario` against §5, and `goal-commitment` and `effort-progress` against §1.2 — stand
    unchanged.
