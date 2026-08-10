## 1. Package skeleton and boundary

- [x] 1.1 Create `packages/rules-magic` depending only on `sim-core` and `content`, with the AGPL header and `"license": "AGPL-3.0-or-later"`
- [x] 1.2 Extend the dependency-graph test to assert `rules-magic` imports neither `rules-world` nor `agent-api`
- [x] 1.3 Define the operation input types — learn rate, retention, scribe affinity, rediscovery affinity, scribe capacity, materials — as caller-supplied parameters, with mage, grimoire, and library identifiers typed as opaque handles
- [x] 1.4 Add the lint rule rejecting inline combination of primitive magnitudes inside `rules-magic`
- [x] 1.5 Add the conformance check rejecting direct reads of `permittedTechniques`, `permittedForms`, `edicts`, and `classicalLabels` in the rules path

## 2. v1 content: the 12-cell subset

- [ ] 2.1 Replace the placeholder `"v1": true` flags from `core-contracts` with the chosen twelve: `intellego`, `perdo`, `rego` × `limen`, `mentem`, `nomen`, `terram`
- [ ] 2.2 Add loader validation asserting exactly twelve v1 cells forming a 3 × 4 rectangle and including `rego-limen`, with errors naming the offending cells
- [ ] 2.3 Add loader validation rejecting any node whose cell is not flagged `v1`
- [ ] 2.4 Author the node graph for `rego-limen`, covering `portal`, `blink`, and `ward`
- [ ] 2.5 Author the node graphs for `intellego-mentem` and `rego-nomen`, covering `knowledge-steal` from both canonical cells, plus `research-rate`, `scribe-rate`, `summon`, and `concealment`
- [ ] 2.6 Author the node graphs for `rego-terram` and `intellego-terram`, covering `build-rate` and `resource-yield`
- [ ] 2.7 Author the node graphs for `rego-mentem` and `intellego-nomen`, covering `teach-rate` and `worship-yield`
- [ ] 2.8 Author the node graphs for `perdo-mentem`, `perdo-nomen`, `perdo-terram`, and `perdo-limen`, covering `direct-damage` and `area-denial` and supplying the magical causes of instance destruction
- [ ] 2.9 Author the node graph for `intellego-limen`, covering threshold detection
- [ ] 2.10 Mark every authored magnitude as untuned, and add the test asserting no v1 content claims to be tuned
- [ ] 2.11 Set every node's `rediscoveryMultiplier` at or above `fp(3072)`, most of them above it so species affinity has room to differentiate

## 3. Grid mechanics

- [x] 3.1 Implement cell addressing over the full 5 × 14 space, resolvable by `(techniqueId, formId)` and by cell id, with non-v1 cells resolving as empty
- [x] 3.2 Implement availability strictly as a call to `permits(universe, cellId)`, with no caching
- [x] 3.3 Implement prerequisite satisfaction against the loaded node graph, allowing cross-cell prerequisites and never inferring satisfaction from tier
- [x] 3.4 Implement dormancy as a derived predicate over `permits(universe, cellOf(nodeId))`, stored nowhere
- [ ] 3.5 Enforce that dormant instances cannot be cast, taught, scribed, prepared, or used as prerequisites, and contribute no effects
- [x] 3.6 Unit test the four arbitration cases against a v1 cell: both axes permitted, dispensation, interdiction, and neither
- [x] 3.7 Unit test that re-permitting an interdicted cell restores surviving instances with no migration step

## 4. Knowledge instances and the lifecycle

- [ ] 4.1 Implement the instance index: per-node instance counts, the single-instance enumeration backing `libraryDependence`, and incremental maintenance
- [ ] 4.2 Implement the persisted per-node ever-known record, set on first instance creation, never cleared, and included in world snapshots
- [ ] 4.3 Implement research against scaled `researchCost`, drawing from RNG stream 3, refusing on a forbidden cell or an unsatisfied prerequisite
- [ ] 4.4 Implement teaching mind → mind, drawing from RNG stream 4, with the eligibility threshold and proportional transmission loss below `fp(1024)` mastery
- [ ] 4.5 Implement scribing mind → grimoire, drawing from RNG stream 5, consuming supplied scribe capacity and materials and deriving `durability` from scribe affinity
- [ ] 4.6 Implement instance location for written copies, including the `(2, grimoireId)` ↔ `(3, libraryId)` rewrite on shelving and withdrawal, and the subsystem-owned grimoire-to-instance index
- [ ] 4.7 Implement deterministic mastery decay for mind and palace instances only, with a retention-derived floor and no RNG draw
- [ ] 4.8 Implement floorless decay for dormant instances, destroying them at zero mastery
- [ ] 4.9 Implement instance destruction and the loss event naming node, world tick, and location kind
- [ ] 4.10 Implement rediscovery: declared multiplier, species affinity, then the `fp(3072)` floor clamp
- [ ] 4.11 Add loader validation rejecting any node with `rediscoveryMultiplier` below `fp(3072)`
- [ ] 4.12 Implement `libraryDepth(libraryId)` as a tier-weighted count over stored instances, excluding dormant ones, exposed as an accessor and applied nowhere in `rules-magic`
- [ ] 4.13 Unit test the snapshot round trip preserving the ever-known record so a lost node still costs rediscovery after restore
- [ ] 4.14 Unit test that adding a draw to one knowledge operation leaves the other streams' sequences unchanged

## 5. Effect application pipeline

- [x] 5.1 Implement effect gathering from usable mind and palace instances, with the mastery activation threshold
- [x] 5.2 Implement single-point legality evaluation, so illegal contributions never reach stacking and carry no legality field forward
- [x] 5.3 Implement scale routing against the `primitive-semantics` registry, including the `both` case
- [x] 5.4 Delegate all stacking, cap, and rounding arithmetic to the shared implementation, with no local combination
- [x] 5.5 Implement the primitive-coverage check over v1 content, with `lifespan` and `fertility` as the only declared exclusions
- [x] 5.6 Wire the coverage check into CI, failing both on a newly unexercised primitive and on an exclusion becoming covered
- [x] 5.7 Unit test that written instances produce no direct effect contributions, and that a library's influence appears only through `libraryDepth`

## 6. Traditions

- [ ] 6.1 Implement the closed hook-kind enumeration: `acquire` — `standard`, `true-name`; `store` — `standard`, `palace`; `cast` — `standard`, `prepared`; `cost` — `standard`, `prepaid`
- [ ] 6.2 Add the CI check asserting the enumeration matches `docs/design/contracts.md` §2.5
- [ ] 6.3 Add loader validation rejecting a missing hook, a fifth hook key, an unknown kind, and a kind valid only for a different hook
- [ ] 6.4 Implement the four `standard` hook kinds as the baseline every tradition falls back to
- [ ] 6.5 Implement `cast: prepared` — bounded preparation slots drawn from usable instances, expended on cast, re-prepared in world time
- [ ] 6.6 Implement `cost: prepaid` — zero cost at release
- [ ] 6.7 Implement `acquire: true-name` — raised research cost, lowered teaching cost, instances created at `fp(1024)`, stolen instances arriving at `fp(1024)`, and no effect on decay, storage, casting, or cost
- [ ] 6.8 Implement `store: palace` — palace instances bounded by `slotsPerMage`, scribing unavailable, instances unlootable and untransferable, destroyed on holder death
- [ ] 6.9 Implement palace-derived library depth under `store: palace`, scaled by the hook's depth coefficient parameter
- [ ] 6.10 Author the three v1 tradition records: Vancian memorization, True Naming, the Art of Memory
- [ ] 6.11 Implement `hookFor(hook, homeTraditionId, hostTraditionId)` as a pure function — `acquire` and `store` from home, `cast` and `cost` from host
- [ ] 6.12 Implement `preparedSpells` population at portal entry by the raider's home `cast` kind, with expenditure and payment following the host
- [ ] 6.13 Implement the total tradition-change operation, resolving every instance the incoming `store` kind cannot hold, reporting each resolution, and emitting loss events for any node it empties
- [ ] 6.14 Add the conformance check rejecting reads of `traditionId` outside the four hook dispatch points and `hookFor`
- [ ] 6.15 Unit test that each pair of v1 traditions is distinguishable on at least one seeded scenario, and that all three agree on a scenario outside their differing hooks

## 7. Closeout

- [ ] 7.1 Confirm every scenario across `magic-grid`, `magic-primitives`, `knowledge-instances`, and `magic-traditions` has a corresponding passing test
- [ ] 7.2 Add the 0.3.0 release-claim tests: a node ceases to exist when its last instance is destroyed, and rediscovery never completes below three times `researchCost`
- [ ] 7.3 Add the 0.3.0 release-claim test that each v1 tradition changes measurable behaviour through its declared hook and through no other path
- [ ] 7.4 Run the full suite, typecheck, lint, purity check, content validation, coverage check, and dependency-graph test together
- [ ] 7.5 Record the ambiguities this change resolved against `docs/design/contracts.md` — the `rediscoveryAffinity` direction and the 3× floor, library-instance location, whose tradition populates `preparedSpells`, teaching loss below `fp(1024)`, whether legality gates acquisition, the persisted ever-known record, and the absence of any caster resource for the `cost` hook to deduct from — and update that document or confirm the resolutions stand
- [ ] 7.6 Confirm no release note or spec in this change makes a balance claim, per the measurement pivot in `docs/design/release-plan.md`
