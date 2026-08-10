## Why

Through 0.5.0 a universe runs on its own and can be measured, but nobody is playing it. The god
has no verbs: `contracts.md` §4.2 enumerates fifteen actions and defines the shape of none of
them, `contracts.md` §8 explicitly defers the worship and favor-regeneration formulas here, and
`vision.md` §13 leaves the edict budget, the worship formula, and the prestige carry-over open
with this change named as their owner. Until those exist there is nothing for a scripted bot pool
to differentiate on, and the 0.6.0 release claim — *no scripted god strategy exceeds a 65% win
rate against the pool* — has nothing to measure.

This is also the first release that can make a balance claim at all, and the two claims it makes
are about this change's central risk. Vision §7 (worship) and §6a (knowledge as capital) describe
two compounding loops that feed each other, which is the canonical shape of a runaway leader.
Specifying the loop without specifying its damping would ship the risk and call it a feature.

## What Changes

- Define **worship** as a *derived, lagged, saturating measurement* of the civilization rather
  than an accumulated stock, with per-source-class saturation, a hard ceiling, and a first-order
  lag so worship trails the world it measures.
- Define **favor** regeneration as a function of worship, a **capped favor pool** whose overflow
  is discarded and counted, and the `worship-yield` primitive's role as the one licensed
  multiplier on regeneration.
- Define **worship tiers** on geometric thresholds and fix `edictBudget = 1 + worshipTier`, which
  in turn fixes `edictBudgetMax = 6` — a constant `contracts.md` §4.1 uses to size the observation
  vector but never gives a value.
- Specify the **damping** on the worship loop: saturation, lag, the pool cap, geometric tier
  thresholds, and a deliberate decoupling — worship reads institutional *breadth* and mage
  headcount, never library *depth*, so the §6a knowledge loop does not feed the §7 worship loop
  directly.
- Fix a **threshold for `worshipSnowball`** (`contracts.md` §7 names the metric but no number) and
  state the retune procedure when the harness exceeds it.
- Specify **every intervention** in the §4.2 action space: its preconditions, its effect, its cost,
  and its legality mask contribution — permit/forbid technique and form, issue and revoke edicts,
  grant founding knowledge, bless, assign role, fund or found a university, encourage research,
  change tradition, open a portal, declare ascension.
- Specify **cost hysteresis**: repeated changes to the same ruleset axis within a decay window
  escalate in cost, closing the degenerate "permit before the raid, forbid after" line.
- Specify **upheaval**: forbidding a permitted axis strands knowledge as inert rather than
  destroying it and applies a worship shock; changing tradition applies a far larger one.
- Specify that **every god-agency intervention is world-time only** and masked during engagement,
  extending `contracts.md` §4.2's explicit masking of actions 1–7 and 13 to the rest of the set.
- Specify **ascension** as a *declared* terminal condition (action 15) behind two disjoint
  qualifying paths, a minimum run length, and a frozen post-ascension universe.
- Specify **stagnation** as a distinct, testable non-ascension ending, so that every Monte Carlo
  run terminates with a scored outcome and `ascensionRate` has a defined denominator.
- Specify **prestige** carry-over: earned at run end from bounded achievement, accumulated through
  a geometrically convergent recurrence with a hard cap, and spent exclusively on *stocks* —
  starting favor, materials, populace, and a small seeded archive — never on *rates*.
- State the retune procedures that keep `ascensionRate` in its 5–20% band and `prestigeAdvantage`
  under 60%, naming the single knob each turns and the order knobs are turned in.

Every numeric constant introduced here is an **untuned placeholder awaiting the balance harness**,
marked as such at the point of use. The specs fix structure, units, and monotonic direction; the
harness fixes values.

## Capabilities

### New Capabilities

- `favor-economy`: the favor pool, its regeneration from worship, its cap and overflow, the cost
  of every intervention as data, affordability as a mask condition rather than a failure, cost
  hysteresis on repeated ruleset changes, and the per-tick favor ledger.
- `worship-loop`: worship as a derived, saturating, lagged measurement; worship tiers and the
  edict budget they grant; the decoupling of the worship loop from the knowledge-as-capital loop;
  upheaval shocks; and the `worshipSnowball` threshold with its retune procedure.
- `interventions`: the preconditions, effects, costs, and mask contributions of every action in
  `contracts.md` §4.2, the world-time-only rule for all of them, and the constraint that
  interventions compose existing effect primitives rather than introducing new ones.
- `ascension-and-prestige`: the two ascension paths, declaration and terminal semantics,
  stagnation as the alternative ending, run-end scoring, prestige earning and accumulation, the
  stocks-not-rates carry-over model, and the two balance gates that tune both.

### Modified Capabilities

None. `state-schema`, `content-schemas`, `primitive-semantics`, and `observation-action-space`
from `core-contracts` are consumed unchanged; the state fields this change needs that
`contracts.md` §1.1 does not yet carry are listed under Impact as required amendments rather than
as spec-level modifications made unilaterally here.

## Impact

- **New:** `packages/rules-world` gains the favor, worship, intervention-dispatch, ascension, and
  prestige subsystems; `packages/content` gains an intervention-cost table and an ascension-
  condition table as validated data; `packages/agent-api` gains the mask predicates for actions
  1–15; `packages/mc-harness` gains `worshipSnowball`'s threshold check, `ascensionRate`,
  `ascensionRateByPath`, `prestigeAdvantage`, and terminal-outcome scoring.
- **Depends on:** `core-contracts` for the state schema, the primitive registry and its shared
  stacking arithmetic, and the action enumeration; `knowledge-model` for knowledge instances and
  tradition hooks; `mages-and-species` for mages, universities, and populace; `agent-interface`
  for the harness that makes both balance claims measurable.
- **Required amendments to `docs/design/contracts.md`** — this change's specs assume state that
  §1.1 does not currently declare, and every one of them is an incompatibility waiting to happen
  if left implicit. They are proposed here and must be written into the contract before or with
  implementation:
  - `favorCap` and the per-tick `favorRegen`, both derived from `worshipTier` and worship.
  - `edictBudgetMax = 6`, referenced by §4.1's observation sizing and never valued.
  - A per-cell `researchEmphasis` array, without which action 12 has nowhere to persist.
  - Hysteresis counters for recent ruleset changes, per technique and per form axis.
  - Expiry ticks for active blessings and for the upheaval worship shock.
  - `prestigeEarned` and a run-end reason code, since §1.1's `prestige` is read-only during a run
    and therefore cannot record what the run achieved.
  - An era-advancement rule. §1.1 declares `era` as `uint16` and nothing in vision or contracts
    says when it increments, yet the second ascension path is defined over eras.
- **Downstream:** `raid-engagement` consumes the portal-opening precondition and the frozen-policy
  rule; `pvp-server` consumes `prestigeAdvantage` as its own release claim at 0.10.0;
  `electron-client` presents favor, worship tier, and the legality mask without recomputing any
  of them.
- **Risk accepted:** the numbers here are guesses with a stated direction. The mitigation is that
  each balance gate names exactly one knob and the order in which knobs are turned, so a failing
  sweep produces a retune rather than a redesign.
