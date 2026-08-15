## 0. Preconditions

- [ ] 0.1 Confirm W1 (`w1/ascension-stance`) has landed: every scripted strategy carries an explicit ascension stance, and a long-horizon sweep at 2400 ticks exists with its own committed baseline. Both claims in this change are unmeasurable without it — the committed 60- and 240-tick gates are structurally blind to the win condition (findings F2)
- [ ] 0.2 Confirm `god-agency`'s ascension and favor tasks are implemented on the branch being built against, since these deltas amend requirements that change still owns and has not archived
- [ ] 0.3 Re-diff both delta specs by hand against the current text of `openspec/changes/god-agency/specs/ascension-and-prestige/spec.md` and `.../favor-economy/spec.md` before implementing. `openspec validate --strict` checks structure, not whether a `MODIFIED` block is a superset of what it replaces, and these blocks restate the whole requirement
- [ ] 0.4 Re-read `docs/design/vision.md` §8a and confirm the two disagreements recorded in `design.md` are still disagreements — if §8a has been amended, this change's rationale must be re-read rather than assumed

## 1. Content: the constants and the price

- [ ] 1.1 Change `ascension-tier-gate` from `4` to `5` in `packages/content/data/god-constant.json`, keeping `tuningStatus: untuned`, and rewrite its gloss so it still names itself the first rate knob while recording that it now stands at `worship-tier-count`'s ceiling
- [ ] 1.2 Add `ascension-canon-breadth` (`96`, unit `count`, `tuningStatus: untuned`) with a gloss stating the measured passive baseline it sits above (51 nodes, flat from tick 840) and that it is a shape knob, not a rate knob
- [ ] 1.3 Add `ascension-loss-fraction` (`51`, unit `fp`, `tuningStatus: untuned`) with a gloss stating that it makes the era loss allowance scale with the canon and that `ascension-loss-max` remains the floor
- [ ] 1.4 Add both ids to `REQUIRED_GOD_CONSTANTS` in `packages/content/src/god.ts` — the list is checked in both directions, so a constant present in data and absent from the list fails the load
- [ ] 1.5 Change `declare-ascension`'s `favorCost` from `0` to `20480` in `packages/content/data/god-cost.json` and replace its gloss, which currently argues for zero, with the argument in `design.md` D3: regeneration makes a price a delay rather than a lockout, and the tier-0 cap bounds the delay
- [ ] 1.6 Add the loader assertion `declare-ascension.favorCost <= favor-cap-base`, failing the load naming both values, in the style of the existing `prestige-cap` identity check
- [ ] 1.7 Write failing tests first for 1.4 and 1.6: an unknown-constant load failure, a missing-constant load failure, and a cost table whose declaration price exceeds `favor-cap-base`
- [ ] 1.8 Update the god-tables content test (`packages/content/test/unit/god-tables.test.ts`) where it asserts action 15 costs zero

## 2. Rules: Path B's era boundary

- [ ] 2.1 Write a failing test asserting that an era boundary evaluated in a universe holding fewer than `ascension-canon-breadth` nodes does not pass and resets `goodEraRun` to zero
- [ ] 2.2 Write a failing test asserting the loss allowance: 51 nodes and 7 losses fails; 174 nodes and 7 losses passes; 174 nodes and 9 losses fails
- [ ] 2.3 Write a failing test asserting the small-canon allowance equals `ascension-loss-max` exactly, so the authored constant keeps its meaning
- [ ] 2.4 Add `ascensionCanonBreadth` and `ascensionLossFraction` to `GodConstants` in `packages/coordination/src/god/constants.ts`
- [ ] 2.5 Extend the era-boundary block of `packages/coordination/src/god/system.ts` (section 6): compute the allowance as `Math.max(constants.ascensionLossMax, floorDiv(known.length * constants.ascensionLossFraction, FP_ONE))` and make `passed` conjoin `known.length >= constants.ascensionCanonBreadth`
- [ ] 2.6 Confirm by reading the diff that no floating-point value entered the rules path and that `npm run check:purity` still passes
- [ ] 2.7 Decide the open question in `design.md`: whether `recordEra` retains `nodesKnown` beside the dependence and loss it already stores, so a failed boundary is self-explanatory in a run record. Implement or record the decision

## 3. Rules: Path A and the declaration

- [ ] 3.1 Confirm no code change is needed for Path A — `apotheosisSatisfied` already reads `constants.ascensionTierGate` — and add a test asserting that a universe at worship tier 4 does not satisfy Path A under the new constant
- [ ] 3.2 Write a failing test asserting `ascensionPlan` costs `declare-ascension`'s favor rather than zero, and that the ledger balances on the declaring tick
- [ ] 3.3 Write a failing test asserting that a qualifying universe holding less than the price has action 15 masked, and that the entry becomes true after regeneration
- [ ] 3.4 Replace `cost: 0` in `ascensionPlan` (`packages/coordination/src/god/interventions.ts`) with `interventionCost(ACTION.declareAscension, deps.god.costs)`, and update the doc comment that currently explains why it is free
- [ ] 3.5 Add a test asserting that a universe stepped for `MC_MAX_TICKS` with an empty action list every tick never leaves `ASCENSION_PATH.none` — the passive-baseline scenario, and the single test that would have caught the original defect

## 4. Harness: the correlation gate

- [ ] 4.1 Add the per-strategy correlation assertion to the long-horizon gate: `passive-control`'s ascension rate below the pool mean, at least two other strategies above it, each separation exceeding the reported standard error from `packages/mc-harness/src/standard-error.ts`
- [ ] 4.2 Make the failure message name which of the three conditions failed and quote the per-strategy rates, so a failing sweep produces a retune rather than an investigation
- [ ] 4.3 Assert the sweep carries enough replicates per strategy for the comparison to mean anything, and fail with a clear message if it does not, rather than reporting a separation smaller than its own standard error
- [ ] 4.4 Leave `packages/mc-harness/src/strategies.ts` untouched — W1 owns that file

## 5. Measurement, and the claims

- [ ] 5.1 Run the long-horizon sweep on this change and record per-strategy `ascensionRate`, `ascensionRateByPath`, and the aggregate
- [ ] 5.2 Check the claim: `passive-control` below the pool mean, at least two deliberate strategies above it, aggregate inside 0.05–0.20. Record the numbers whether or not they pass
- [ ] 5.3 If the aggregate leaves the band, turn the authored rate knobs in their authored order — `ascension-tier-gate` (now at its ceiling, so effectively `ascension-era-count`), then `ascension-dependence-max` — one knob per sweep, and never a shape knob
- [ ] 5.4 If the correlation assertion fails while the band holds, turn `ascension-canon-breadth` or `ascension-loss-fraction`, one per sweep
- [ ] 5.5 Regenerate balance baselines **only** via `packages/mc-harness/bin/regenerate-baseline.mjs`, stating the constants that changed and the measured deltas that justify it
- [ ] 5.6 Run the golden replay fixtures. **Do not run `npm run goldens:regen`.** If any fixture's simulated result moves, stop and escalate: a fixture is a determinism claim, and a moved one is a finding
- [ ] 5.7 Record the measured `contentRevision` change in the commit message, since it is a compatibility break for every universe

## 6. Documentation

- [ ] 6.1 Update `docs/superpowers/specs/2026-08-11-ascension-meta-design.md`'s W2 section with what was actually built and measured, including any place the claim failed
- [ ] 6.2 Re-read `ascension-canon-breadth` against the content set whenever cells are enabled — 96 is a count against a graph with twelve enabled cells, and enabling more moves what it means. Record that dependency wherever content enablement is documented
- [ ] 6.3 If the measurement contradicts either of the two vision §8a readings in `design.md`, say so in the change's closing notes rather than adjusting the reading
