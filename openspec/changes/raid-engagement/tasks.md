## 1. Contract amendments and package skeleton

- [ ] 1.1 Raise the five proposed `contracts.md` §1.6 `RaidState` amendments — `attackerUniverseId`, host and attacker ruleset snapshots, `raidSeed` and `engagementStartTick`, `stabilityDecayPerTick`, and an objective `statusKind` — for acceptance by `core-contracts` before implementation begins
- [ ] 1.2 Confirm the RNG stream split with `core-contracts`: stream 7 for combatant goal-selection tie-breaks, stream 8 for hit, evasion, and damage rolls, stream 9 for theft, stream 10 for terrain, deployment, and objective generation
- [ ] 1.3 Create `packages/rules-raid` with dependencies exactly `sim-core`, `content`, `rules-magic`, `rules-world`, and no dependency on `agent-api`
- [ ] 1.4 Extend the dependency-graph test to assert `rules-raid`'s allowed edges and that nothing else depends on it except `agent-api`
- [ ] 1.5 Define engagement-only types for combatant, raid state, ruleset snapshot, terrain grid, spatial index, objective, and raid outcome record

## 2. Ruleset snapshots and portal opening

- [ ] 2.1 Implement the immutable ruleset snapshot value carrying permitted techniques, permitted forms, edicts, and tradition id, with mutation failing in development builds
- [ ] 2.2 Implement the open-portal gate: attacker `permits(rego-limen)`, a living attacker mage holding a node carrying the `portal` primitive, and sufficient favor
- [ ] 2.3 Wire the open-portal gate into the action legality mask so a failed gate yields a no-op and a counter increment, never an exception
- [ ] 2.4 Implement raid creation pairing two persisted snapshots, recording the host as defender and capturing both ruleset snapshots
- [ ] 2.5 Implement the clock transition into engagement mode, suspending world-tick advancement for both participants
- [ ] 2.6 Mask the open-portal action during engagement mode and assert at most one `RaidState` exists
- [ ] 2.7 Assert that rules-changing actions 1–7 and 13 are masked during engagement, and that arbitration reads the snapshot regardless of the mask
- [ ] 2.8 Test that a host forbidding `rego-limen` does not prevent being raided
- [ ] 2.9 Test that world ticks are unchanged across a full raid and that both universes resume at the tick recorded at portal open

## 3. Host-ruleset arbitration

- [ ] 3.1 Implement the per-combatant legal-node mask as held nodes intersected with cells the host ruleset snapshot permits, computed once at portal open
- [ ] 3.2 Implement `resolveCast` as the single entry point for applying node effects during engagement, opening with the `permits` assertion
- [ ] 3.3 Implement `forbiddenCastsBlocked` as a raid-scoped invariant counter surfaced in the outcome record
- [ ] 3.4 Add a conformance check that no file in `rules-raid` evaluates technique or form bitmasks outside `permits`, and that no path applies node effects outside `resolveCast`
- [ ] 3.5 Add a conformance check that every legality call passes a ruleset snapshot rather than a live universe entity
- [ ] 3.6 Implement the fault-injection harness that disables the selection mask, and test that the assertion fires, counts, and applies no effect
- [ ] 3.7 Test the symmetric arbitration cases: host forbids and home permits, host permits and home forbids, defender bound by her own interdiction, host dispensation arming both sides, and both universes permitting the same cell
- [ ] 3.8 Test that forbidding a cell neither destroys instances nor blocks acquiring, teaching, scribing, or stealing, and that permitting it later makes held knowledge castable with no relearning cost

## 4. Tradition hooks across the portal

- [ ] 4.1 Resolve `acquire` and `store` against each combatant's home tradition for the whole raid, on both sides
- [ ] 4.2 Resolve `cast` and `cost` against the host tradition for every combatant, on both sides
- [ ] 4.3 Populate `preparedSpells` by applying the host `cast` hook to the candidate pool produced by the home `store` hook, filtered by the legal-node mask
- [ ] 4.4 Test the Vancian-raider-in-Art-of-Memory and Art-of-Memory-raider-in-Vancian pairs, asserting both directions of the split are observable
- [ ] 4.5 Test that the same attacker snapshot raiding two hosts of differing tradition produces measurably different casting behaviour from the same seed

## 5. Engagement space

- [ ] 5.1 Implement combatant derivation from world state for both sides, deterministic and capped at `maxCombatantsPerSide`
- [ ] 5.2 Implement soldier detachment derivation from populace cohorts without promoting cohorts to individuals
- [ ] 5.3 Implement placeholder `maxHp` and initial `concealment` formulas from species traits and highest known node tier, marked untuned
- [ ] 5.4 Implement terrain generation from RNG stream 10 keyed by the raid seed, with passability, line-of-sight blocking, and movement cost, never persisted
- [ ] 5.5 Implement deployment placement inside side-specific zones, clamped to the battlefield and to passable terrain
- [ ] 5.6 Implement the uniform-grid spatial index with cell size at least the maximum interaction radius and deterministic query ordering
- [ ] 5.7 Implement squared-distance range tests and add a lint rule rejecting square roots and floating-point distance in `rules-raid`
- [ ] 5.8 Implement integer supercover line-of-sight tracing and test its symmetry
- [ ] 5.9 Implement movement with terrain cost, and `blink` displacement stacking by maximum, both clamped to bounds and to passable terrain
- [ ] 5.10 Assert that no world-scale entity acquires a position component at any point in the raid lifecycle

## 6. Combat resolution

- [ ] 6.1 Implement the fixed tick phase order: intent, movement, area denial, casts, theft, objectives, stability decrement, cleanup
- [ ] 6.2 Implement intent scoring against tick-start state using the `mage-autonomy` scorer with a raid-specific goal set, tie-breaking on stream 7
- [ ] 6.3 Implement deferred death removal in the cleanup phase, walking cast resolution in ascending stable combatant key order, and test that a combatant reduced to zero still resolves its declared intent
- [ ] 6.4 Implement combat RNG substream derivation keyed by `(rootSeed, streamId, engagementTick, combatantKey, drawOrdinal)` with `combatantKey` as side and spawn ordinal
- [ ] 6.5 Test insertion invariance: adding a combatant, and adding a draw, leave every other combatant's draws unchanged
- [ ] 6.6 Implement targeting as lowest hit points above zero within range and line of sight, tie-broken on stable combatant key, marked untuned
- [ ] 6.7 Implement concealment as the sole evasion roll, multiplicative on the remainder, capped, resolved before damage, with cost still expended on evasion
- [ ] 6.8 Implement `direct-damage` summation across sources followed by a single ward application, multiplicative on the remainder and capped, using the shared rounding helper
- [ ] 6.9 Implement `area-denial` as per-tick damage within radius, passing through ward and bypassing concealment
- [ ] 6.10 Implement `summon` with a per-side cap where an over-cap summon is a no-op rather than a queued request
- [ ] 6.11 Test the equivalence of many small hits and one large hit against a warded target
- [ ] 6.12 Test cap clamping for ward and concealment, asserting the clamp counters increment
- [ ] 6.13 Test within-tick order independence by re-resolving a tick with a permuted cast-resolution walk

## 7. Objectives and termination

- [ ] 7.1 Implement objective generation from the host's world state on stream 10, capped at `maxObjectivesPerRaid`, with library, university, and archmage kinds
- [ ] 7.2 Implement the placeholder objective value formula and the placeholder archmage designation rule, both marked untuned
- [ ] 7.3 Implement objective status as held, captured, looted, or destroyed, with looting and destruction producing distinct write-back consequences
- [ ] 7.4 Implement the portal stability decrement as a single unconditional write in its own phase
- [ ] 7.5 Add a conformance check asserting exactly one assignment site for `portalStability`
- [ ] 7.6 Add a content validation rule rejecting any node, tradition hook, or objective declaring an increase to stability or a reduction of decay
- [ ] 7.7 Implement load-time validation that `stabilityDecayPerTick` is an authored raw integer of at least 1, and add a conformance check rejecting a division-derived decay
- [ ] 7.8 Implement load-time validation that the computed tick bound does not exceed `MAX_ENGAGEMENT_TICKS`
- [ ] 7.9 Implement the termination predicate: stability at or below zero, all objectives resolved, or one side eliminated
- [ ] 7.10 Implement the hard ceiling as an immediate resolution plus a raised invariant violation, and test it under fault injection with the decrement disabled
- [ ] 7.11 Implement victory determination as a total function and property-test that no raid resolves as a draw or as undetermined
- [ ] 7.12 Property-test that `portalStability` strictly decreases every tick across randomly generated raids
- [ ] 7.13 Test the stalemate case, where two out-of-range sides resolve exactly at portal collapse with a defender victory

## 8. Consequences and knowledge theft

- [ ] 8.1 Implement the raid outcome record covering victor, resolution tick, casualties, objective statuses, nodes lost, nodes stolen, blocked forbidden casts, and cap clamps
- [ ] 8.2 Implement atomic write-back in the ordered sequence: casualties, stranded raiders, instance destruction and transfer, theft insertion, existence recomputation
- [ ] 8.3 Test that a failure partway through application leaves neither world state modified
- [ ] 8.4 Implement permanent mage casualties and cohort decrements, with summons writing back nothing
- [ ] 8.5 Add a conformance check that nothing in `rules-raid` sets a mage's `alive` flag to true
- [ ] 8.6 Implement the stranded-raider rule and mark it in code as the tunable most likely to need softening, naming the survival-roll relaxation
- [ ] 8.7 Implement library burning, grimoire burning with durability rolls on stream 5, and grimoire looting as a transfer
- [ ] 8.8 Test that memory palace instances are unburnable and unlootable and are destroyed only by their holder's death
- [ ] 8.9 Implement node loss on last-instance destruction with existence recomputed from the index and never cached
- [ ] 8.10 Implement `knowledge-steal` attempts gated by `permits` against the host snapshot, resolved on stream 9, stacking by maximum
- [ ] 8.11 Implement the three distinct verbs — mind theft copies, grimoire looting moves, burning destroys — with distinct outcome-record entries
- [ ] 8.12 Implement theft retention conditional on the thief surviving and withdrawing, inserting instances at zero mastery before existence recomputation
- [ ] 8.13 Test theft-outruns-loss: a stolen node whose last host instance is destroyed in the same raid survives abroad and is lost at home
- [ ] 8.14 Test that a raider returning with a node her own universe forbids gains a real but inert instance

## 9. Observation, metrics, and balance gates

- [ ] 9.1 Fill the 64-slot engagement observation block at the declared allocation of 12, 12, 30, 6, and 4 slots
- [ ] 9.2 Implement concealment masking of the enemy-side summary
- [ ] 9.3 Test shape constancy across raid sizes and zero-fill at world scale
- [ ] 9.4 Emit `raidLengthDistribution` and assert its tail is empty beyond the computed bound
- [ ] 9.5 Emit the raid contribution to `libraryDependence` and wire its band into the balance gate
- [ ] 9.6 Emit per-primitive attribution data sufficient for `winRateByPrimitive` ablation without re-simulation
- [ ] 9.7 Add the balance gate that fails on a non-zero aggregate `forbiddenCastsBlocked`
- [ ] 9.8 Record the answer to `core-contracts`' open question by confirming the 64-slot block needs no growth at the declared caps

## 10. Determinism and closeout

- [ ] 10.1 Record a golden raid replay fixture covering terrain generation, deployment, combat, theft, and resolution
- [ ] 10.2 Test cross-process reproduction of the same raid from identical snapshots and seed
- [ ] 10.3 Test that a universe simulated without ever raiding produces a snapshot hash identical to the pre-change baseline
- [ ] 10.4 Run the 10,000-raid Monte Carlo sweep and assert zero forbidden casts resolved and zero raids exceeding portal stability
- [ ] 10.5 Confirm every scenario across the five capability specs has a corresponding passing test
- [ ] 10.6 Run the full suite, typecheck, lint, purity check, and content validation together
- [ ] 10.7 Record any deviation discovered during implementation as a proposed `contracts.md` amendment, or confirm none
