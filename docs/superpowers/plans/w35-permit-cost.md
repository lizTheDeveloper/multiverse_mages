<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W35 — the economy's first drain

**Branch:** `w35/permit-cost` (named before the direction changed; the branch name is now a
misnomer and the work is drains, not prices). **Status:** built and measured.

The campaign's negative control, `permit-then-idle`, wins 40/40 and beats every bot that funds,
blesses and grants. This workstream was originally briefed to make the ruleset switches expensive.
It measured that first, found the price ceiling, and then — on a direction change from the author,
*"try not to cut stuff, instead add drains"* — built a drain instead. **No god cost was changed.**

---

## Part 0 — why a price could not have worked, measured before the direction changed

Every figure is `Fp` at scale 1/1024, so a raw `8192` is **8 favor**.

**The pool cap bounds every price in the game.** `interventions.ts:265` refuses a plan whose
`cost` exceeds the *opening pool*, and the pool is capped each tick at
`favor-cap-base + tier x favor-cap-per-tier` = `20480 + tier x 10240`, with the worship tier ladder
topping out at 5:

| worship tier | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| pool cap (favor) | 20 | 30 | 40 | 50 | 60 | 70 |

**No god action can cost more than 70 favor and remain buyable at all.** The shipped data already
knows this: `change-tradition` is priced at 64 favor and its gloss says it "exceeds the favor cap at
every worship tier below the highest" — exactly the tier-4 cap of 60 and the tier-5 cap of 70.

So Codex's target of a permit portfolio at 15–30% of early-run favor — a 24-to-48-fold increase on
the current 8 favor — is **arithmetically unreachable**. 24x is 192 favor, nearly three times the
largest pool any universe can ever hold. The most a technique permit can be raised is 8.75x, and at
that price it is a tier-5 purchase nobody makes.

A second correction, to a figure the campaign plan carries. The reference universe does **not**
start empty: `content-set.ts`'s `v1RulesetAxes` derives the starting mask from the twelve `v1: true`
cells, a 3-technique x 4-form rectangle, so **all seven v1 switches are already on at tick 0**. The
"all-permits opening" a bot actually buys is the remainder — 2 techniques and 10 forms, **12
switches, 56 favor**.

### The instrument, and what it found

A per-tick instrument was built over `referenceScenario`'s `lastGodReport`, sampling worship, tier,
pool, cap, ledger and discard for a full 2,400-tick run. For `permit-then-idle`:

- **56 favor**, spent between world tick **4 and tick 43**, opens all seventy cells. The entire
  ruleset decision of the run is over inside its first 1.8%.
- **8,187 favor discarded** by the cap over the run (raw 8,383,491) — independently reproducing the
  9.1–12.4M figure this workstream was handed.
- The pool is **at its cap from tick ~80 to termination at tick 1,810**. For **96% of the run**,
  every unit of regeneration is discarded on the tick it is earned.

That last line is the finding. **A price levied against a pool that is full every tick costs tempo
and nothing else.** The god pays in ticks-to-refill, never in foregone alternatives, because there
is no second thing it wanted. Raising a price cannot manufacture an opportunity cost where no
alternative exists. Worship tier 2 arrives at tick 40 for every strategy measured — including
`denial-warden`, which later stagnates — so even a price set exactly at the tier-2 cap is a
forty-tick delay on a 2,400-tick run.

**A cap is not a drain.** Truncation at a ceiling removes the resource *and* the signal: nothing
downstream can respond to the surplus and nothing can be traded against it. That is the whole
distinction the direction change turns on.

---

## Part 1 — what was built

### Content: four constants, all `untuned`, in `god-constant.json`

| constant | value | what it is |
|---|---|---|
| `stewardship-per-axis` | 192 | favor per tick per permitted axis beyond the free allowance — **static friction** |
| `stewardship-free-axes` | 7 | axes governed free: the v1 rectangle, so the shipped position never opens in debt |
| `stewardship-per-known-node` | 8 | favor per tick per known node — **dynamic friction**, the term that grows |
| `stewardship-reserve` | 4096 | the floor the drain may never take the pool below |

Two terms, because Cook's source/sink power matching says a growing source needs a growing sink.
Worship grows with populace without practical bound; a fixed sink falls behind it forever. The
breadth term prices the constitution, the doctrine term prices what the constitution bought.

### Code: `packages/coordination/src/god/stewardship.ts`, plus three edits

- `favor.ts` gains `stewardshipUpkeep()` and `applyStewardship()`, both pure, no draw, fixed point.
- `system.ts` applies the drain at step 5b, immediately after regeneration and before anything
  reads the pool.
- `FavorLedgerEntry` gains `drained` and `lapsed`, and `ledgerBalances()` now checks
  `closing == opening + regenerated - discarded - drained - spends`. **`lapsed` is deliberately
  absent from that identity** — it is upkeep that never happened, not favor that moved, and putting
  it in the equation would be the arithmetic form of banking it as debt.
- `load.ts` gains `checkGodEconomy()`, the one identity spanning both god tables.

**No new state, no new component, no schema bump, no new entity per tick, no RNG stream.** The
drain reads the two ruleset bitmasks and the known-node count, all already in state.

### The part that makes it a decision rather than a tax bill

An external review named the failure mode precisely, and it is worth quoting because the design is
built against it:

> "They can make the economy feel constrained without creating decisions or restoring agency. You
> may turn 'favor is meaningless' into 'favor is a tax bill,' while the optimal policy remains
> 'permit everything, idle, and pay upkeep.'"

A uniform upkeep on its own does exactly that. So the drain has a **competitor, and the competitor
is the ruleset itself**: when the pool cannot meet the upkeep, **one axis lapses**, and the axis
that lapses is the one the civilization uses least, measured in nodes it actually knows.

Every permitted axis is therefore bidding against every other for the same favor, and the loser is
switched off. The tradeoff that produces is legible without reading any code — *keeping this family
legal is what starved that one* — and which family survives depends on what the mages studied,
which depends on the founding species and on where the god pointed them. That is what makes the
right ruleset a decision rather than a solved constant.

Three rules the lapse obeys:

1. **It lapses, it does not bill.** Unmet upkeep is reported and forgotten. A debt stock would
   absorb every unit of inflow before anything downstream could pull from it — W26's measured
   failure, a library at zero for 1,400 ticks. A drain that cannot be paid destroys capability; it
   does not create an obligation.
2. **It never takes the shipped constitution.** No axis lapses while the permitted count is at or
   below `stewardship-free-axes`. That is the **weak static engine** on the ruleset side, paired
   with the one that already exists on the income side: `favor-regen-base`, whose own gloss says a
   zero floor makes a bad start unrecoverable.
3. **One axis per tick, and lapsing lowers the upkeep**, so the loop is self-limiting and converges
   on the broadest constitution the universe's worship can actually carry.

The `stewardship-reserve` is the second half of the deadlock remedy, and the content loader asserts
it: **the reserve must be at least what forbidding a form costs.** Below that, the drain could hold
a universe at a favor level from which it can never afford to narrow the ruleset that is draining
it — a state the drain created rather than a decision anyone made.

---

## Part 3 — the prediction, written before the post-change sweep

Pre-registered, as the campaign requires, and it does not contradict the plan's standing
prediction. Qwen's constraint — *"you've built a more expensive door to the same empty room"* — was
about **price**. A drain is a different mechanism and the prediction is correspondingly different,
but it is not optimistic.

1. **`permit-then-idle`'s node count collapses.** Its whole advantage is breadth it opened once and
   kept for free. Predicted: its mean `referenceNodesKnown` falls from ~253 toward the
   passive baseline of ~51, because it cannot pay to hold nineteen axes on a tier-2 income.
2. **`permissive-breadth` falls with it, but less**, because it keeps spending and re-permitting.
3. **The exploit margin does not become positive.** Predicted post-change `exploitMargin` still
   **≤ 0**. `uniform-random-legal` ascends at 1.000 pre-change and the drain does not touch the
   thing that makes ascension easy; it touches breadth. Seven of that probe's fifteen verbs are
   inert (W32), so it is a lower bound on exploitability regardless.
4. **`favorWasted` falls sharply** — the drain converts discard into outflow. This is the one
   prediction that is nearly certain and it is also the weakest kind of result, because it measures
   the mechanism rather than the game.
5. **`narrow-depth` and `denial-warden` are barely touched.** Both run near the free allowance, so
   the breadth term is near zero for them. If they *do* move, the free allowance is set wrong.

**The measurement that decides whether this succeeded, and it is not any of the above:** does
varying the god's ruleset policy change the outcome *ranking*? `permissive-breadth` and
`narrow-depth` are the two arms — generalist and specialist, comparable favor spent. Pre-change
they are 40/40 at 254.7 nodes against 12/40 at 8.3 nodes: breadth strictly dominates. If after the
drain the gap narrows or inverts, the ruleset has become a decision. **If both arms move by the
same amount and the ranking is unchanged, this is a cost and not a decision, and that is a
full-value negative result to report plainly.**

---

## Part 2 — judgement: was the overflow the problem?

**Partly, and the useful correction is that `favorWasted` was never the disease.** At the shipped
cap, discard is the cap *working* — every unit of it is a unit the ceiling refused. What the
overflow actually measures is that the **menu is short**, and a short menu is not fixed by a price.

Neither of the two candidate directions this workstream was handed was taken, and both refusals are
deliberate:

- **Routing the discard into cost escalation** re-opens a decision that is already recorded.
  `favor.ts`'s own header rejects escalating intervention costs as a surplus absorber, because cost
  escalation punishes the *action* and so also punishes the small god who finally saved for one
  grant. A pool cap punishes only the surplus.
- **Diminishing worship above the passive cap** attacks the source. The source is not the defect;
  the absence of any outflow is. Weakening worship would also weaken the one signal the god's play
  currently moves.

The drain built here supersedes both: it consumes the surplus rather than punishing its production,
and it does it through a mechanism something else competes for.

**Residual risk, stated plainly.** The drain's late-game equilibrium in the instrumented run settles
at 0.4 favor/tick against 1.8–5.6 favor/tick of income, because a universe pushed back to seven axes
and 51 nodes is cheap to govern. The pool re-pins at its cap after roughly tick 180. That is the
*correct* shape — a narrow constitution should be cheap — but it means the drain binds hardest in
the opening and relaxes later, and a universe that grows its knowledge without growing its ruleset
still ends the run with more favor than it can use. **The remaining overflow is W29's problem, not a
tuning problem: it is the absence of anything worth buying.**

---

## W30's asymmetry claim — verified, and it holds

The claim: the *favor* price of permitting and forbidding is symmetric by enforced invariant, while
the *total* price is asymmetric by construction against denial. Both halves check out.

1. **The worship shock.** `interventions.ts` computes
   `stranded = permitting ? { inert: 0, known: 0 } : strandedByAxis(...)` and only calls
   `applyShock` when `!permitting`. Permitting an axis pays no worship shock; forbidding one pays a
   shock scaled by how much of the civilization it strands, down to a halving.
2. **The mastery loss.** `decay.ts` sets `dormant = !permits(ruleset, cellOf(nodeId))`, and
   `masteryFloor(retention, dormant)` returns **0** when dormant. A dormant instance therefore
   decays floorlessly and is destroyed at zero. This is uniquely a consequence of the *forbid*
   transition, because research, teaching and scribing are all gated on `permits()`
   (`research.ts:307`, `teaching.ts:154`, `scribing.ts:158`) — there is no knowledge in a
   never-permitted cell for dormancy to destroy.

So pillar 1's symmetry is enforced on the cheap axis, in a content loader, and violated on the
expensive one, in two rules files. **It is real.**

**Where it belongs: its own change, not this one.** Fixing it means either charging permitting a
comparable irreversible cost or removing one from forbidding, and both are rules-path changes to
vision pillar 1's meaning rather than magnitudes. This workstream would have had to move it in the
pricing direction and cannot: `checkGodCosts`'s `symmetric()` constrains the *table*, and the
asymmetry is not in the table.

**One thing this change does do to it, and it should be recorded:** the lapse is a *third*
unpriced path from permitted to not-permitted, and it carries the forbid side's consequences —
a lapsed axis goes dormant and its knowledge begins decaying floorlessly — without the god having
chosen it. That makes the asymmetry slightly worse and it is the strongest argument for the
follow-up change.
