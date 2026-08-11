## 1. Agent API package

- [x] 1.1 Scaffold `packages/agent-api` per `contracts.md` §5, depending on `sim-core` and the `rules-*` packages only
- [x] 1.2 Author the normalization descriptor table with one descriptor per observation slot, covering every block in `contracts.md` §4.1
- [x] 1.3 Implement the five normalization rules — `ratio`, `bounded`, `log-bucket`, `flag`, `identity` — with clamping at the declared saturation constant
- [x] 1.4 Implement descriptor-table validation rejecting any saturation constant that is not a compile-time constant, and any slot lacking a descriptor
- [x] 1.5 Implement export as `Float64Array` in `[0, 1]` with `fp(1024)` mapping to exactly `1.0`, keeping all division inside `agent-api`
- [x] 1.6 Implement `observationSchemaVersion` and the layout digest over block, index, rule, and saturation constant
- [x] 1.7 Unit test that identical world states observed after different histories export element-wise identical vectors
- [x] 1.8 Unit test that altering one saturation constant changes the layout digest without changing vector length
- [x] 1.9 Verify the float-ban lint still passes over `sim-core` and the rules packages after `agent-api` lands

## 2. Agent session interface

- [x] 2.1 Implement `reset(runSeed, scenarioConfig)`, `observe()`, `legalActions()`, `submit(action)`, and `status()`
- [x] 2.2 Implement terminal statuses `running`, `ascended`, `stagnated`, `truncated`, with `submit` on a terminated session raising
- [x] 2.3 Implement illegal-action accounting: total submissions, rejections, and a per-action-id breakdown readable at episode end
- [x] 2.4 Implement the agent-side RNG derived from `(runSeed, agentSlotIndex, strategyId)`, structurally unable to reference a `contracts.md` §6 stream id
- [x] 2.5 Confirm the session exposes no reward, return, score, or fitness value
- [x] 2.6 Unit test that two sessions reset with the same seed and scenario config produce identical initial observations
- [x] 2.7 Unit test that enabling accounting does not change the final snapshot hash
- [x] 2.8 Unit test that per-stream simulation draw counts are unchanged between a passive agent and a random-legal agent submitting only no-ops

## 3. Monte Carlo harness core

- [ ] 3.1 Scaffold `packages/mc-harness` depending on `agent-api` only, and confirm the `core-contracts` dependency-graph test covers it
- [ ] 3.2 Implement the `worker_threads` pool with a configurable worker count and no shared mutable state between runs
- [ ] 3.3 Implement seed derivation as a pure function of `(rootSeed, sweepId, cellIndex, replicateIndex)`, published and stable
- [ ] 3.4 Implement the sweep specification format and its validator, rejecting unknown factors, metrics, and strategies before dispatch
- [ ] 3.5 Implement factorial expansion reporting cell count and run count before execution begins
- [ ] 3.6 Implement the world-tick cap and terminal-status recording for `ascended`, `stagnated`, `truncated`, and `failed`
- [ ] 3.7 Implement per-run timeout, worker replacement, and failure classification so one crash cannot abort a sweep
- [ ] 3.8 Implement the sweep disqualification threshold on failure count
- [ ] 3.9 Unit test that 1-worker and 8-worker executions produce identical records and aggregates

## 4. Results, aggregation, and reproduction

- [ ] 4.1 Implement newline-delimited per-run result records carrying derivation inputs, factor levels, assigned strategies, terminal status, and every registered metric entry
- [ ] 4.2 Implement the provenance block: build version, content hash, RNG registry hash, observation schema version, layout digest, and per-metric `definitionVersion`
- [ ] 4.3 Implement the sweep summary record with configuration hash, counts by terminal status, and aggregate metrics
- [ ] 4.4 Implement canonical-order aggregation sorted by `(cellIndex, replicateIndex)` for every floating-point fold
- [ ] 4.5 Implement offline re-aggregation from stored records and test that it equals the aggregates written during execution
- [ ] 4.6 Implement the single-run reproduction CLI, executing one recorded run in-process and single-threaded
- [ ] 4.7 Implement append-only output semantics: a re-executed sweep writes a new file or exits non-zero
- [ ] 4.8 Test exact reproducibility across two executions, including under randomized per-run delays that change completion order
- [ ] 4.9 Implement the performance section — wall clock, runs per second, world ticks per second — excluded from the reproducibility comparison

## 5. Scripted bot pool and tournament

- [ ] 5.1 Implement the strategy registry with stable `strategyId`, version, and documented probe hypothesis per strategy
- [ ] 5.2 Implement the passive control and the uniform-random-legal noise floor
- [ ] 5.3 Implement the permissive-breadth and narrow-depth specialist strategies
- [ ] 5.4 Implement the denial warden and the archivist strategies
- [ ] 5.5 Implement the portal-rush and worship-maximizer strategies
- [ ] 5.6 Implement fall-through behaviour so a strategy whose preferred action is masked submits its next-preferred legal action
- [ ] 5.7 Implement tournament scheduling under common random numbers with mirrored slot assignments
- [ ] 5.8 Implement the pairwise outcome matrix in the tournament summary, reported whether or not a strategy dominates
- [ ] 5.9 Test that the whole pool runs to termination against a build where every god action is masked out
- [ ] 5.10 Test that each strategy is deterministic at a fixed agent-side seed and that three strategies diverge observably on the same run seed

## 6. Metric registry and definitions

- [ ] 6.1 Implement the metric registry with identifier, definition, collector, scope, aggregation rule, unit, and `definitionVersion`
- [ ] 6.2 Implement the conformance check asserting the registry's identifier set equals `contracts.md` §7
- [ ] 6.3 Implement the `unavailable` status with reason codes `mechanic-absent`, `no-observations`, `censored`, and `per-arm-scope`, and the rule that unavailable values never fold into aggregates
- [ ] 6.4 Implement the knowledge census at 12-world-tick intervals from tick 0
- [ ] 6.5 Implement `knowledgeHalfLife` as a pooled Kaplan–Meier estimate with right-censoring, and the censored-status path when survival never reaches 0.5
- [ ] 6.6 Implement `libraryDependence` as the mean over census samples, with maximum and final sample, excluding empty-universe samples
- [ ] 6.7 Implement `timeToTierBySpecies` over all 42 pairs with right-censoring and the heavily-censored aggregate rule
- [ ] 6.8 Implement the shared Gini estimator and both snowball metrics at checkpoints 60, 120, 240, 480, and 1200, with exclusion counts
- [ ] 6.9 Implement `raidLengthDistribution` with 10-tick bins, an overflow bin that must stay empty, and p50/p95/max
- [ ] 6.10 Implement `ascensionRate` with truncated runs in the denominator and failed runs excluded and reported separately
- [ ] 6.11 Implement `prestigeAdvantage` as a mirrored-pair collector reporting `mechanic-absent` until `god-agency` defines the carry-forward maximum
- [ ] 6.12 Implement `illegalActionRate` from the `agent-api` counters, with per-action-id and per-strategy breakdowns
- [ ] 6.13 Implement the `definitionVersion` conformance check that fails when a pinned constant changes without a version bump

## 7. Ablation

- [ ] 7.1 Implement the ablation mask inside the shared primitive stacking implementation, leaving content untouched
- [ ] 7.2 Implement neutralization per stacking class: additive, additive-into-multiplier, multiplicative-on-remainder, `max`, and presence-gate
- [ ] 7.3 Implement draw-count invariance so a neutralized primitive still consumes and discards its draws
- [ ] 7.4 Implement paired-seed scheduling: one shared control arm and one ablation arm per primitive, on identical derived seeds
- [ ] 7.5 Implement mirrored slot assignment for the one-sided ablation used by `winRateByPrimitive`
- [ ] 7.6 Implement the Wilson score interval and the `no-detected-effect` status when the interval contains 0.5
- [ ] 7.7 Implement `not-attributable` for the `portal` primitive with its stated reason
- [ ] 7.8 Implement rejection of pairwise ablation requests with an explanation
- [ ] 7.9 Implement the ablation conformance check asserting every primitive in `contracts.md` §3 has a neutralization rule matching its stacking class
- [ ] 7.10 Test that a control run and its paired ablation run consume identical RNG draw sequences up to genuine divergence, and record identical content hashes

## 8. Baselines and the regression gate

- [ ] 8.1 Define the baseline file format with canonical key order and one metric per line
- [ ] 8.2 Implement the provenance block and its completeness check, rejecting malformed baselines
- [ ] 8.3 Implement per-metric point estimate, standard error at the gate sweep's sample size, sample size, and tolerance
- [ ] 8.4 Implement the *k*-standard-error tolerance rule with *k* recorded in the baseline
- [ ] 8.5 Author the gate sweep and the full sweep specifications under `balance/sweeps/`
- [ ] 8.6 Implement the gate comparison reporting metric, baseline value, current value, raw delta, and delta in standard errors
- [ ] 8.7 Implement `baseline-invalid` failures for a missing baseline, a provenance mismatch, and a `definitionVersion` mismatch
- [ ] 8.8 Implement the pass-through for metrics `unavailable` in both baseline and current run, and the newly-available report path
- [ ] 8.9 Wire the gate sweep into CI as a build-failing job
- [ ] 8.10 Test that deleting a baseline fails the gate rather than passing it

## 9. Baseline regeneration

- [ ] 9.1 Implement the regeneration command as a separate entrypoint, unreachable from the test script
- [ ] 9.2 Implement the mandatory rationale, refusing to write when it is absent
- [ ] 9.3 Implement `supersedes` recording the prior baseline's content hash and the per-metric delta from it
- [ ] 9.4 Implement tolerance changes through the same command, and reject baselines whose tolerances were hand-edited outside it
- [ ] 9.5 Implement refusal to regenerate from a disqualified sweep, naming the failure count
- [ ] 9.6 Add the CI check asserting the regeneration entrypoint is unreachable from any CI job
- [ ] 9.7 Test that running the suite while the gate fails leaves baseline files byte-identical on disk

## 10. Closeout

- [ ] 10.1 Run the reference sweep of ten thousand runs on eight workers and record wall clock, runs per second, and world ticks per second
- [ ] 10.2 Generate the initial committed baselines from the tagged build with the rationale "initial baseline, 0.5.0"
- [ ] 10.3 Verify the reproducibility claim: two executions of the same sweep at the same root seed produce identical aggregate metrics
- [ ] 10.4 Verify every registered metric is present in every run record of the reference sweep, as a value or an explicit `unavailable` status
- [ ] 10.5 Confirm every scenario across the three capability specs has a corresponding passing test
- [ ] 10.6 Record in `docs/design/contracts.md` §7, or in a note referenced from it, the constants this change pinned — census interval, Gini checkpoints, histogram bin width, censoring rules — and the ambiguities they resolve
