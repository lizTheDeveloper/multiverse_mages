## 1. Shared types and state schema

- [x] 1.1 Define TypeScript types for universe, mage, populace cohort, university, library, grimoire, and knowledge instance per `contracts.md` §1
- [x] 1.2 Define engagement-only types: combatant and raid state, including fixed-point positions
- [x] 1.3 Register component layouts with the `sim-core` entity store, asserting that no world-scale component includes position
- [x] 1.4 Implement `permits(universe, cellId)` with interdiction taking precedence over dispensation
- [x] 1.5 Implement the derived "node exists in universe" index, maintained incrementally and never cached in state
- [x] 1.6 Exclude engagement entities from world snapshot serialization while preserving clock mode and engagement tick
- [x] 1.7 Unit test arbitration across all four cases: both axes permitted, dispensation, interdiction, and neither

## 2. Content package and schemas

- [x] 2.1 Create `packages/content` with zero runtime dependencies beyond a schema validator used at build/test time
- [x] 2.2 Author JSON Schemas for technique, form, cell, node, species, tradition, and primitive
- [x] 2.3 Implement the loader with hard-fail validation and errors naming file path and JSON pointer
- [x] 2.4 Implement deterministic string-to-integer ID interning, stable across processes
- [x] 2.5 Implement graph integrity checks: prerequisite cycles, missing references, inverted tiers, and cells carrying both an interdiction and a dispensation
- [x] 2.6 Implement the validation CLI and wire it into CI
- [x] 2.7 Author the 5 techniques and 14 forms with dense, stable bit assignments
- [x] 2.8 Author the 70 cell definitions with classical labels, flagging exactly 12 as `v1` and including `rego-limen`
- [x] 2.9 Author placeholder node graphs for the 12 v1 cells, magnitudes explicitly marked as untuned
- [x] 2.10 Author the 6 species definitions from `vision.md` §6
- [x] 2.11 Author the 3 v1 traditions with their four hooks each
- [x] 2.12 Unit test that malformed content fails the load rather than being skipped

## 3. Primitive semantics

- [x] 3.1 Encode the primitive registry — unit, scale, stacking rule, cap — as data
- [x] 3.2 Add a CI check asserting the registry matches the table in `contracts.md` §3
- [x] 3.3 Implement shared stacking arithmetic for each rule: additive, additive-into-multiplier, multiplicative-on-remainder, and max
- [x] 3.4 Implement cap clamping with per-primitive clamp counters exposed to the harness
- [x] 3.5 Add a lint rule rejecting inline combination of primitive magnitudes outside the shared implementation
- [x] 3.6 Unit test each stacking rule, including the two-50%-wards case and the max-not-sum case

## 4. Observation and action space

- [x] 4.1 Implement the fixed-shape observation vector, sized from the full 70-cell, 6-species, 7-tier space
- [x] 4.2 Implement the engagement block with zero-fill at world scale
- [x] 4.3 Implement the discrete action enumeration per `contracts.md` §4.2
- [x] 4.4 Implement the legality mask, including masking actions 1–7 and 13 during engagement mode — and, per §4.2, 8–12, 14 and 15 as well
- [x] 4.5 Implement illegal-action handling as no-op plus counter, never an exception
- [x] 4.6 Implement boundary normalization in the agent-api layer, keeping the core integer-only
- [x] 4.7 Unit test shape constancy across differing universes and across both clock modes
- [x] 4.8 Unit test that a masked rules-change action submitted mid-engagement leaves the ruleset unchanged

## 5. Module boundaries and RNG registry

- [x] 5.1 Create the workspace package skeletons named in `contracts.md` §5
- [x] 5.2 Implement the dependency-graph test asserting every rule, including the no-cycle rule between `rules-magic` and `rules-world`
- [x] 5.3 Implement the RNG subsystem stream registry as an append-only enumeration
- [x] 5.4 Implement the registry test rejecting renumbering and duplicate IDs, with an error explaining the balance-baseline consequence
- [x] 5.5 Verify a deliberately introduced forbidden import fails CI, then revert it

## 6. Closeout

- [ ] 6.1 Confirm every scenario across the five capability specs has a corresponding passing test
- [ ] 6.2 Run the full suite, typecheck, lint, purity check, and content validation together
- [ ] 6.3 Update `docs/design/contracts.md` with any deviation discovered during implementation, or confirm none
