## 0. Preconditions

- [ ] 0.1 Confirm W1 has landed: every scripted strategy in `packages/mc-harness/src/strategies.ts` carries an explicit ascension stance, and the long-horizon (2400-tick) sweep gate exists with a committed baseline. Until then "which route did it take" measures preference-list ordering rather than play
- [ ] 0.2 Confirm W2 has landed and is green: ascension gates on something the god's play moves, and `passive-control`'s ascension rate is below the pool mean. **Task groups 5 and 6 must not begin before this** — five routes on an instrument that cannot tell strategies apart is five ways of pressing the same button
- [ ] 0.3 Hand-diff this change's requirements against `openspec/changes/god-agency/specs/ascension-and-prestige/spec.md` as it stands at implementation time. That capability is **not archived** (`god-agency` is 59/75), so its text can still move under this change; `openspec validate --strict` checks structure and cannot catch that drift. Record the diff result before writing any code
- [ ] 0.4 Re-read `docs/design/vision.md` §8a and confirm the three constraints still bind as written: prestige does not compound without bound, the condition is reachable but not routine, and defeat is not the opposite of ascension
- [ ] 0.5 Confirm no other workstream has claimed terminal reasons `5`, `6`, or `7` in the interim

## 1. The terminal-reason vocabulary, extended append-only

- [ ] 1.1 Write a failing test asserting `TERMINAL_REASON` values `1` through `4` hold their existing meanings, so that any future renumbering fails a named test rather than a fixture diff
- [ ] 1.2 Add `ascensionCompendium = 5`, `ascensionDevotion = 6`, `ascensionWarded = 7` to `packages/state/src/enums.ts`, with a note that the enumeration is serialized on the gym wire and in episode records and is therefore permanent
- [ ] 1.3 Add a single exported predicate — "is this terminal reason an ascension" — in `@mm/state`, and write a failing test asserting no other module branches on the ascension reasons by listing them inline
- [ ] 1.4 Replace every inline listing of the two ascension reasons in TypeScript with that predicate, including `packages/agent-api/src/session.ts` and `packages/coordination/src/god/ascension.ts`'s prestige base
- [ ] 1.5 Confirm `EpisodeStatus` still has exactly four members. Widening it is deliberately **not** done: `'ascended'` remains the right coarse answer, and the route is carried by the terminal reason

## 2. Qualification as a set

- [ ] 2.1 Write a failing test asserting a universe satisfying both apotheosis and enduring canon on one tick has both bits set in the qualified mask
- [ ] 2.2 Write a failing test asserting a qualification lapses: the bit clears on the tick its condition stops holding
- [ ] 2.3 Write a failing test asserting no route is skipped because another qualified — evaluate a content set whose routes are authored in both orders and assert the mask is identical
- [ ] 2.4 Add `ascensionQualified` to `GodStateRecord` and its component spec, sized to hold the pinned slot count
- [ ] 2.5 Replace `qualifyingPath` with a function returning the mask, deleting the first-match-wins ordering. Keep `ascension-min-tick` gating qualification rather than declaration, and keep `ascensionFirstMetTick` as the first tick *any* route qualified
- [ ] 2.6 Narrow `ascensionPath` to mean the *declared* route, `0` while the run is live, preserving the stored values `1` and `2`
- [ ] 2.7 Write a failing test asserting a snapshot written before this change restores with the same declared-route meaning

## 3. Declaration as a parameterized action

- [ ] 3.1 Write a failing test asserting a universe qualifying for two routes and declaring the second terminates with the second route's terminal reason
- [ ] 3.2 Write a failing test asserting a declaration naming an unqualified route is illegal, changes no state, and increments the illegal-action counter
- [ ] 3.3 Write a failing test asserting an unparameterized declaration resolves to the earliest qualifying route in authored order
- [ ] 3.4 Add `declareAscension` to `PARAMETERIZED_ACTIONS` and pin `CANDIDATE_SLOTS[declareAscension] = 8`, with the comment §4.4 requires: raising it is a contract change, not a tuning knob
- [ ] 3.5 Build the candidate list from the qualified mask in authored order, and confirm `mask[declareAscension]` stays a single entry meaning "some route qualifies"
- [ ] 3.6 Rewrite `ascensionPlan` in `packages/coordination/src/god/interventions.ts` to read the parameter, write the declared route, and set the terminal reason from the route record
- [ ] 3.7 Record the observation-shape change: the candidate block grows by the pinned slot count and the god block gains the qualified mask. Amend `docs/design/contracts.md` §4.1, §4.2, and §4.4, and state in the commit message that this is a breaking observation change taken deliberately before 0.12.0 rather than after it
- [ ] 3.8 Confirm the golden replay fixtures still reproduce byte-identically for any fixture that never declares ascension, and that any fixture that does is a **recorded compatibility break**, not a regeneration. `npm run goldens:regen` is not to be run

## 4. The metric and the plumbing beneath it

- [ ] 4.1 Write a failing test asserting a completed run record carries its terminal reason, not merely its coarse status
- [ ] 4.2 Thread the terminal reason from `agent-api`'s session through `mc-harness`'s run record without widening `TerminalStatus`
- [ ] 4.3 Write a failing test asserting `ascensionRateByPath` is present in every sweep output, reporting unavailable with a reason when it cannot be computed
- [ ] 4.4 Write a failing test asserting the per-route rates sum to the aggregate `ascensionRate` over the same denominator
- [ ] 4.5 Write a failing test asserting shares are unavailable rather than `NaN` when no run ascended
- [ ] 4.6 Implement `ascensionRateByPath` in `packages/mc-harness/src/metrics-registry.ts` and `metrics-collectors.ts`, keyed by route content id, with `thresholdOwner: 'god-agency'` and its pinned constants recorded
- [ ] 4.7 Add the constants this pins to `docs/design/metric-constants.md`, since that note is checked against the registry in both directions
- [ ] 4.8 Add the metric's definition row to `docs/design/contracts.md` §7, and mark `god-agency`'s ">90% of ascensions on one path" scenario superseded by the 60% assertion in task 6.6
- [ ] 4.9 Confirm the CI metric-registry equality check passes with the new key

**Task groups 1–4 are not blocked on W2** and should land first: they are what makes W2's own claim measurable by path.

## 5. Route content, its schema, and the closed condition vocabulary

*Blocked on task 0.2.*

- [ ] 5.1 Write `packages/content/schema/ascension-route.schema.json` with explicit `required` and `additionalProperties: false`, matching the `contentId` and enum idioms already in that directory
- [ ] 5.2 Write failing tests for each content-validation failure the spec names: missing `conditionKind`, an unimplemented kind, a missing named constant, a duplicate `terminalReason`, a `terminalReason` of `3` or `4`, more routes than pinned slots, budgets summing outside the band, and one budget above 60% of the sum
- [ ] 5.3 Author `packages/content/data/ascension-route.json` with `apotheosis` and `enduring-canon` first and second, referencing the existing `ascension-*` god-constant ids **by name** so that W2's tuned values flow through unrestated
- [ ] 5.4 Wire the file into `CONTENT_FILES` and the loader, and record that `contentRevision` moves — a compatibility break, deliberately taken
- [ ] 5.5 Implement `deepest-node-held` and `era-run` as condition kinds by moving the existing predicates behind the vocabulary, changing no behaviour, and confirm every pre-existing ascension test passes unchanged
- [ ] 5.6 Confirm the loader asserts apotheosis first and enduring canon second, so an unparameterized declaration reproduces the pre-change behaviour exactly

## 6. The three new routes

*Blocked on task 0.2. Each route lands as its own reviewable commit: a route that has to be reverted should be revertible alone.*

- [ ] 6.1 Implement `breadth-held`: at least *N* permitted cells each holding at least *D* known nodes with at least two live instances, sustained for *T* ticks. Write the failing tests first, including the wide-but-fragile case that must **not** qualify
- [ ] 6.2 Implement `worship-recovered`: return to tier ≥ *T* within *R* ticks of a shock at or below factor *S*, on *K* non-overlapping occasions. Write the failing test asserting a universe that holds maximum worship and is never shocked does **not** qualify — that case is the whole reason this kind is not "hold the highest tier"
- [ ] 6.3 Implement `constrained-thriving`: at most *K* permitted cells **and** worship, living mages, and populace all at or above their floors, across *E* consecutive era boundaries. Write the failing test asserting a narrow but dying universe does not qualify, and that its run resets
- [ ] 6.4 Append the new routes' threshold constants to `packages/content/data/god-constant.json` as **new ids only**, each `tuningStatus: "untuned"` with a gloss stating what it prices. Modify no existing constant — W2 owns those
- [ ] 6.5 Author the three route records with rate budgets, and confirm the loader's band and concentration assertions pass
- [ ] 6.6 Implement the dominant-route assertion (share > 0.60 fails, naming the route) and the dead-route assertion (zero ascensions where `n × rateBudget ≥ 8` fails; below that, unavailable with the required run count)
- [ ] 6.7 Write the failing test asserting the loader refuses a content set in which the constraint route's maximum permitted-cell count is not strictly below the breadth route's minimum
- [ ] 6.8 Write the failing test asserting a passive run's qualified mask is empty at every tick, for all five routes

## 7. Payout parity, defended by tests rather than by comment

- [ ] 7.1 Write a failing test asserting two runs with identical achievement terms ascending by different routes earn identical prestige
- [ ] 7.2 Write a failing test asserting the declaration cost is equal across routes and that affordability masks no route in preference to another
- [ ] 7.3 Write a conformance test asserting `prestigeEarned` reads no route identity at all, so a later per-route bonus fails a named test rather than passing review
- [ ] 7.4 Confirm the carried-prestige recurrence still converges to `prestigeCap` under a streak mixing all five routes

## 8. The Python bridge

- [ ] 8.1 Write a failing Python test asserting an episode terminating on a new route's reason scores the ascension reward under `sparse_terminal`
- [ ] 8.2 Add an exported `ASCENSION_TERMINAL_REASONS` frozenset to `packages/gym-bridge/python/mm_gym/rewards.py` and read it in `sparse_terminal`
- [ ] 8.3 Write a failing contract test asserting the Python set equals the TypeScript enumeration's ascension members, failing by naming any member present in one and not the other
- [ ] 8.4 Confirm no other Python or TypeScript consumer still lists the ascension reasons inline

## 9. The tournament cross-tabulation

- [ ] 9.1 Write a failing test asserting each strategy's tournament record carries per-route ascension counts summing to its total
- [ ] 9.2 Write a failing test asserting an even split across two routes is reported as a split and no tie is broken
- [ ] 9.3 Implement the cross-tab in `packages/mc-harness/src/tournament.ts`
- [ ] 9.4 Write a failing test asserting the cross-tab does **not** appear in the metric registry — it is a property of a scripted pool, not of the game

## 10. Measuring the claim

- [ ] 10.1 Run the long-horizon sweep at 2400 ticks over the eight-strategy round-robin with `n ≥ 400`, and record `ascensionRateByPath` and the cross-tab verbatim
- [ ] 10.2 State whether at least three strategies had distinct modal routes and whether any route exceeded a 60% share. **Record the numbers whether or not they support the claim**
- [ ] 10.3 If a route is dead, retune that route's own constants first and re-sweep, one knob per sweep, recording each retune with the measurement that caused it. Do not retune a different route to make a dead one look alive
- [ ] 10.4 If the aggregate `ascensionRate` left 5–20%, record which routes contributed and whether the rate budgets were wrong or the conditions were
- [ ] 10.5 Regenerate the balance baseline only via `packages/mc-harness/bin/regenerate-baseline.mjs`, stating every constant that changed and the measured delta that justified it
- [ ] 10.6 Amend `docs/design/vision.md` §8a with the route-per-playstyle statement and the payout-parity rule, and add the roadmap row to §11
- [ ] 10.7 Record the result in `docs/design/release-plan.md` as a claim with the measurement that would disprove it, per that document's rule that "improved variety" is not a claim
