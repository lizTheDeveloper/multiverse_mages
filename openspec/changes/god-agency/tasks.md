## 1. Contract amendments and content

- [x] 1.1 Amend `docs/design/contracts.md` §1.1 with `favorCap`, per-cell `researchEmphasis`, per-axis hysteresis counters, blessing and upheaval expiry ticks, `prestigeEarned`, and a run-end reason code
- [x] 1.2 Confirm the observation vector's ruleset block against `EDICT_BUDGET_MAX = 8` (already pinned in `contracts.md` §0); assert `edictBudget = 1 + worshipTier` never exceeds it
- [ ] 1.3 Amend `contracts.md` §7 with the `worshipSnowball` threshold and the new `ascensionRateByPath` and `favorWasted` metrics
- [x] 1.4 Record the era-advancement rule in `contracts.md`, noting that ownership may move to the world-rules layer
- [x] 1.4a Amend `contracts.md` §1.1's `edicts` invariant to "a new edict may be issued only while `length < edictBudget`", with existing edicts persisting through a worship-tier fall
- [x] 1.5 Author the intervention cost table as validated content, one entry per action ID in §4.2, with a schema rejecting missing or negative entries
- [x] 1.6 Author the worship, tier-threshold, ascension, stagnation, and prestige constants as validated content, each flagged as an untuned placeholder
- [x] 1.7 Add a content check asserting `PRESTIGE_CAP × (fp(1024) − PRESTIGE_RETENTION) == PRESTIGE_EARN_MAX × fp(1024)`

## 2. Worship

- [x] 2.1 Implement `sat(x, cap, half)` over the shared fixed-point division, rounding toward negative infinity
- [x] 2.2 Implement the three saturated source classes — mages with the blessed bonus, completed universities, populace heads — and their sum as the worship target
- [x] 2.3 Implement the asymmetric first-order lag with separate rise and fall rates
- [x] 2.4 Implement `worshipTier` on geometric thresholds and derive `edictBudget = 1 + worshipTier`, recomputing the cached tier within the tick worship changes
- [x] 2.5 Implement the over-budget report for a universe that falls a tier while holding more edicts than its new budget allows
- [x] 2.6 Implement the upheaval shock, scaled by the fraction of known nodes rendered inert, with the declared floor and window
- [x] 2.7 Implement the tradition upheaval shock and its longer window
- [x] 2.8 Add a conformance check asserting the worship computation reads no knowledge component
- [x] 2.9 Unit test the half-point identity, concavity, the formula ceiling with no post-hoc clamp, and per-class independence
- [x] 2.10 Unit test that rise and fall are asymmetric, that worship converges on a held target, and that a collapsed-then-recovered universe carries no historical advantage

## 3. Favor

- [x] 3.1 Implement per-world-tick regeneration from worship, routed through the shared `worship-yield` stacking channel and its cap
- [x] 3.2 Implement `favorCap` from `worshipTier`, overflow discard, and the `favorWasted` counter
- [x] 3.3 Implement cost lookup from the content table, including the node-tier scaling on founding knowledge
- [x] 3.4 Implement the per-axis hysteresis counters, their decay, and the cost multiplier they produce
- [ ] 3.5 Implement affordability as a mask predicate, and route unaffordable submissions through the existing no-op-plus-counter path
- [x] 3.6 Implement atomic resolution: deduct, apply, and roll back the whole action within the tick if effect application fails
- [x] 3.7 Implement the per-tick favor ledger, derivable from state and actions, and excluded from snapshots
- [x] 3.8 Unit test the regeneration spread between zero worship and the worship ceiling, the non-zero floor, and suspension during engagement
- [x] 3.9 Unit test overflow accounting, that a tier loss does not truncate held favor, and that `worship-yield` never raises the cap
- [x] 3.10 Unit test hysteresis escalation, per-axis isolation, decay to base, and that the ledger balances and replays identically

## 4. Interventions and the legality mask

- [x] 4.1 Implement the intervention dispatch table, asserted in CI to match `contracts.md` §4.2 exactly
- [x] 4.2 Extend the legality mask so every action 1–15 is false during engagement mode
- [x] 4.3 Implement technique and form toggles with symmetric cost, immediate effect, and all legality routed through `permits`
- [x] 4.4 Implement dispensation, interdiction, and revocation against `edictBudget`, masking vacuous edicts
- [x] 4.5 Implement grant founding knowledge: prerequisite-free node only, zero-instance precondition, permitted cell, living target, one instance at `mind:` with full mastery
- [x] 4.5a Add a test asserting that granting the deepest node of a cell is masked, so the Apotheosis path cannot be purchased
- [x] 4.6 Implement blessing as time-limited `research-rate`, `teach-rate`, and `lifespan` contributions through the shared stacking arithmetic, with refresh-not-stack and the tier-based concurrency cap
- [x] 4.7 Implement role assignment, and add a content check that its cost is strictly the lowest non-zero cost
- [x] 4.8 Implement fund and found university, with worship and capacity contributions gated on `buildProgress` reaching `fp(1024)`
- [x] 4.9 Implement research emphasis: per-cell magnitude, linear decay, bounded concurrency, contributing into the shared `research-rate` channel and cap
- [x] 4.10 Implement tradition change: replacement, pool zeroing, upheaval, and delegation of instance migration to `knowledge-model`'s hooks
- [x] 4.11 Implement open portal: permitted portal cell, a living mage holding a `portal` node, valid target, world scale, affordable — then transition the clock to engagement mode
- [x] 4.12 Add a conformance check that no intervention writes a mage field other than `roleId`
- [x] 4.13 Unit test each intervention's preconditions, effect, and mask contribution
- [x] 4.14 Unit test that every action submitted during engagement leaves state unchanged and increments the illegal-action counter

## 5. Ascension and stagnation

- [x] 5.1 Implement era advancement and per-era-boundary recording of `libraryDependence` and node losses
- [x] 5.2 Implement Path A against the deepest node present in each cell's loaded content graph, with the permitted-cell, two-instance, and worship-tier gates
- [x] 5.3 Implement Path B over retained era-boundary evaluations
- [x] 5.4 Implement the minimum-tick floor and action 15's mask predicate, including lapse when the condition stops holding
- [x] 5.5 Implement declaration: set `ascended`, record outcome and tick, freeze the universe, mask everything but the no-op
- [x] 5.6 Implement the three stagnation triggers and the tick cutoff, each terminating the run with its recorded outcome, with the stasis trigger conjunctive on the worship health floor
- [x] 5.6a Add a test asserting that a thriving custodian with a completed graph is not terminated as stagnant before it can reach era 4
- [ ] 5.7 Implement the terminal-score ordering used to decide a pairing before raids exist, marked provisional
- [x] 5.8 Unit test that a content graph whose deepest tier is 5 satisfies Path A, with no literal tier-7 check anywhere in the tree
- [x] 5.9 Unit test single-instance and forbidden-cell disqualification, one-bad-era disqualification, and the pre-tick-600 mask
- [ ] 5.10 Unit test that an ascended universe's snapshot hash is unchanged by further stepping

## 6. Prestige

- [x] 6.1 Implement `prestigeEarned` from terminal outcome plus achievement terms, clamped, with a non-zero floor for every outcome
- [x] 6.2 Implement the carry-over recurrence and assert `prestige` is never written during a run
- [x] 6.3 Implement the saturating conversion of prestige into a legacy budget
- [ ] 6.4 Implement the four stock channels — starting favor, materials, populace, and a seeded lootable and burnable archive — each capped by the head-start fraction of the reference-tick baseline
- [ ] 6.5 Implement loader rejection of any legacy channel that is uncapped or outside the four permitted channels
- [x] 6.6 Add a conformance check that no legacy grant touches favor regeneration, worship constants, `edictBudget`, primitive magnitudes or caps, species traits, or ascension constants
- [x] 6.7 Unit test that a hundred maximal runs converge on `PRESTIGE_CAP` without exceeding it, and that the tenth win adds far less than the third
- [ ] 6.8 Unit test that the seeded archive carries no protective flag and that burning it removes the corresponding advantage

## 7. Balance harness gates

- [ ] 7.1 Implement `worshipSnowball` as the Gini coefficient of favor regeneration at world ticks 120, 600, 1200, and 2400, with the p95-to-median ratio alongside it
- [ ] 7.2 Report per-class saturated worship contributions with the metric so a runaway is attributable without a second sweep
- [ ] 7.3 Implement `ascensionRate`, `ascensionRateByPath`, and the three terminal-outcome counts
- [ ] 7.4 Implement `prestigeAdvantage` as a high-prestige-versus-fresh sweep
- [ ] 7.5 Implement the round-robin scripted-god tournament and its per-strategy win rate against the pool
- [ ] 7.6 Wire the four failing conditions into the sweep: snowball threshold, ascension band, prestige ceiling, and the 65% pool ceiling
- [x] 7.7 Add a conformance check that the simulation clamps none of these metrics
- [ ] 7.8 Record the measured values and the retune history in `docs/design/release-plan.md`'s 0.6.0 entry

## 8. Closeout

- [ ] 8.1 Run the first full sweep, retune per the stated knob orders one knob at a time, and record every retune with the metric that caused it
- [ ] 8.2 Answer vision §13's three `god-agency` open questions in `docs/design/vision.md` — edict budget and scaling, the worship formula, and the prestige carry-over
- [ ] 8.3 Confirm every scenario across the four capability specs has a corresponding passing test
- [x] 8.4 Run the full suite, typecheck, lint, purity check, content validation, and golden replay together
- [x] 8.5 Record any deviation discovered during implementation back into `docs/design/contracts.md`, or confirm none
