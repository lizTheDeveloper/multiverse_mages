## 1. Repository and toolchain

- [x] 1.1 Create npm workspaces monorepo root with `packages/*` and pinned Node 22 via `.nvmrc` and `engines`
- [x] 1.2 Add strict TypeScript config (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) shared by workspaces
- [x] 1.3 Scaffold `packages/sim-core` with zero runtime dependencies and no Node built-in imports
- [x] 1.4 Add Vitest and a `test` script that runs unit tests and the golden suite together
- [x] 1.5 Add ESLint with `no-restricted-globals` / `no-restricted-syntax` banning `Math.random`, `Date.now`, `new Date()`, `performance.now()`, and `Intl` inside `packages/sim-core/src`
- [x] 1.6 Add a dependency-purity check that fails if `packages/sim-core/package.json` gains any runtime dependency
- [x] 1.7 Add a lint rule rejecting non-integer numeric literals and floating-point `Math.*` calls in the rules path
- [x] 1.8 Add CI workflow running typecheck, lint, purity check, and tests on pinned Node 22, plus a non-blocking job on the next Node major

## 2. Fixed-point arithmetic

- [x] 2.1 Implement the fixed-point module at scale 1/1024 with `fromInt`, `toInt`, `mul`, `div`, `lerp`
- [x] 2.2 Implement `div` rounding toward negative infinity through a single shared helper used by all division
- [x] 2.3 Unit test round-trip conversion, negative-value rounding symmetry, and overflow boundaries
- [x] 2.4 Property-test `mul` and `div` associativity and monotonicity within the documented precision bound

## 3. Splittable PRNG

- [x] 3.1 Implement a counter-based PCG-family generator over `Uint32Array` state with no floating-point values
- [x] 3.2 Implement stream derivation from `(rootSeed, subsystemId, tick)`
- [x] 3.3 Implement bounded-integer draw with rejection sampling so no modulo bias is introduced
- [x] 3.4 Unit test that streams are independent — adding draws in one subsystem leaves other subsystems' sequences unchanged
- [x] 3.5 Unit test that identical derivation inputs produce identical sequences, and commit a known-answer vector

## 4. Entity store

- [x] 4.1 Implement struct-of-arrays storage with stable integer IDs and per-slot generation counters
- [x] 4.2 Implement a deterministic free list for slot reuse
- [x] 4.3 Implement handle resolution that reports stale handles rather than returning a slot's new occupant
- [x] 4.4 Implement index-order iteration and a component registration mechanism generic over future game content
- [x] 4.5 Unit test that identical create/destroy sequences yield identical IDs and generations across runs
- [x] 4.6 Unit test that iteration order is index order regardless of creation order

## 5. Clock and step contract

- [ ] 5.1 Implement the dual-scale clock with world ticks (one month), engagement ticks, and an explicit mode
- [ ] 5.2 Implement action-driven mode transitions, with no wall-clock input anywhere in the path
- [ ] 5.3 Implement `step(state, actions, rng) -> state`, returning a new state and never mutating its input
- [ ] 5.4 Unit test that world time is suspended in engagement mode and resumes at the correct world tick afterward
- [ ] 5.5 Unit test that the input state's snapshot hash is unchanged after `step` returns

## 6. Snapshots and persistence

- [ ] 6.1 Implement binary serialization of complete state with a schema version header and component tag table
- [ ] 6.2 Implement deserialization that rejects unknown-future versions and malformed buffers with descriptive errors
- [ ] 6.3 Implement the deterministic snapshot content hash
- [ ] 6.4 Implement the migration registry and sequential forward migration by version
- [ ] 6.5 Unit test round-trip equality, byte-stability of repeated serialization, and that a restored state simulates identically
- [ ] 6.6 Unit test migration ordering across two or more versions, and the explicit failure when a migration is missing

## 7. Recording and replay

- [ ] 7.1 Implement the action log recorder, preserving tick association and within-tick order
- [ ] 7.2 Implement the replayer over `(rootSeed, initialSnapshot, actionLog)`
- [ ] 7.3 Implement divergence reporting that identifies the earliest diverging tick, not merely that a divergence occurred
- [ ] 7.4 Unit test that enabling recording does not change results, and that replay speed does not affect the outcome

## 8. Golden replay harness

- [ ] 8.1 Define the golden fixture format: root seed, initial snapshot, action log, expected final hash
- [ ] 8.2 Implement the test that executes every committed fixture and compares final hashes
- [ ] 8.3 Implement an explicit, separate regeneration command that tests never invoke
- [ ] 8.4 Commit at least three fixtures covering world-time-only advancement, an engagement-mode transition, and heavy entity churn
- [ ] 8.5 Verify that a deliberately introduced nondeterministic operation fails a fixture and reports the diverging tick, then revert it

## 9. Benchmark and closeout

- [ ] 9.1 Implement the benchmark harness over a configurable synthetic entity population
- [ ] 9.2 Emit machine-readable steps-per-second and entity-updates-per-second output
- [ ] 9.3 Verify the benchmark's simulated results are identical across runs at the same seed, with only timing differing
- [ ] 9.4 Record measured throughput in `docs/design/vision.md` §13, answering the mage-population open question
- [ ] 9.5 Confirm every scenario in the three capability specs has a corresponding passing test
