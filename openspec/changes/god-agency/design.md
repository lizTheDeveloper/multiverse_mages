## Context

`docs/design/vision.md` §7 describes the player's whole relationship to the game — "pressure, not
control" — as a favor pool, a worship loop, and a list of interventions. `docs/design/contracts.md`
enumerates the interventions as a discrete action space (§4.2) and then explicitly hands the
worship and favor-regeneration formulas to this change (§8). Three of vision §13's open questions
name `god-agency` as their owner: the edict budget's size and scaling, the worship formula, and how
much prestige may carry between runs.

Two constraints make this harder than "add a resource".

**The runaway problem.** Vision §7 (worship → favor → interventions → a larger civilization → more
worship) and §6a (library depth → better mages → faster research → deeper library) are two
compounding loops, and §6a says outright that two loops feeding each other is the shape that
produces runaway leaders. `contracts.md` §3 already caps every multiplicative rate primitive for
this reason. Those caps bound the *rates*; they do nothing about the *topology*. The damping in
this change is structural — it changes what feeds what — before it is numeric.

**The meta-game problem.** Vision §8a states that prestige compounding across runs is "a live-PvP
death sentence", and `contracts.md` §7 turns that into a number: `prestigeAdvantage` must stay
under 60%. A carry-over model that only satisfies the number by being tuned down until it does is
not a design; it is a thermostat. What is wanted is a model whose *shape* makes the number
achievable, with one scalar left over for the harness to turn.

`docs/design/release-plan.md` makes 0.6.0 the first release permitted a balance claim, and both of
its claims land here: the bot-pool win-rate ceiling and `worshipSnowball` staying below a
threshold that `contracts.md` §7 names but never values. Everything below is written so those two
claims can be run rather than asserted.

**Every numeric constant in this document is an untuned placeholder awaiting the balance harness.**
Fixed-point values are written `fp(x)` at scale 1024 per `contracts.md` §0. What the specs fix is
structure, units, monotonic direction, and the retune procedure. The harness fixes values.

## Goals / Non-Goals

**Goals:**

- One favor economy: a single currency, a single regeneration path, a single cost table, and
  affordability expressed through the legality mask rather than through failures.
- A worship formula that is bounded above by construction, concave in civilization size, lagged
  behind the world it measures, and deliberately weakly coupled to the knowledge loop.
- A complete specification of all fifteen actions in `contracts.md` §4.2 — precondition, effect,
  cost, and mask contribution for each — with no action left as "the obvious thing".
- Ascension as a declared, gated, terminal condition, and stagnation as a defined alternative
  ending, so that every Monte Carlo run terminates with a scored outcome.
- A prestige carry-over whose unbounded-streak limit is finite by arithmetic rather than by clamp,
  and which grants only depreciating stocks.
- A stated threshold and a stated retune procedure for each of `worshipSnowball`, `ascensionRate`,
  and `prestigeAdvantage`.

**Non-Goals:**

- Raid execution. This change specifies *opening* a portal — its legality, its cost, its
  precondition. Everything after the portal opens belongs to `raid-engagement`.
- Knowledge and research mechanics. Granting founding knowledge creates one knowledge instance;
  what a mage then does with it is `knowledge-model` and `mages-and-species`.
- Mage utility-AI internals. The god assigns a standing role and nothing else; how the role
  reshapes goal scoring is `rules-world`.
- Client presentation of favor, worship, or the mask.
- Tuned values. Direction and shape are specified; magnitudes are placeholders.

## Decisions

### Worship is a measurement of the civilization, not a stock the god accumulates

`worship` is recomputed every world tick from current state — living mages, completed
universities, populace — and the stored value only lags toward that computed target. It is never
added to and never spent.

This is the single most consequential anti-snowball decision, and it is structural rather than
numeric. An accumulating worship stock rewards *history*: a god who was large in era 2 stays
powerful in era 5 even after losing everything, and every additional tick of dominance is banked
permanently. A measured worship rewards only *current* standing, so a drawdown is felt in full and
past dominance buys nothing.

*Alternative considered:* worship as an accumulating resource, incremented per tick by devoted
followers, the way most idle and 4X games handle it. Rejected — it makes the integral of your
civilization's size your power, which is precisely the runaway integral vision §7 warns about, and
it makes losses costless once a lead exists.

### Worship saturates per source class, with a hard ceiling

Each source class contributes through a hyperbolic saturation `sat(x, cap, half) = cap·x / (x +
half)`, floor-divided per `contracts.md` §3's rounding rule, and the three saturated contributions
are summed:

| Class | Raw input (placeholder) | `cap` | `half` |
|---|---|---|---|
| Mages | `fp(1024)` per living mage, `+fp(512)` while blessed | `fp(4096)` | `fp(51200)` (≈50 mages) |
| Universities | `fp(2048)` per completed university | `fp(3072)` | `fp(20480)` (≈10 universities) |
| Populace | `fp(16)` per head | `fp(2048)` | `fp(16384)` (≈1024 heads) |

`WORSHIP_MAX = fp(9216)` follows from the caps and is a property of the formula, not a clamp
applied afterwards. The formula is integer-only, monotonic, and needs no square root or logarithm.

Per-class rather than global saturation matters for tuning: it lets the harness answer "is the
university path over-rewarded?" by moving one pair of numbers, and it means a god who maxes one
class still has real headroom in the others — which keeps the mid-game decision live.

*Alternative considered:* a global concave transform (integer square root or a log table) over a
summed raw worship. Rejected on two grounds: a logarithm has no absolute ceiling, so
`WORSHIP_MAX` would have to be reintroduced as an arbitrary clamp; and a single global transform
makes every class's contribution inseparable in the metrics, so a snowball detected by the harness
could not be attributed to a source.

### Worship lags its target, and falls faster than it rises

`worship' = worship + (worshipTarget − worship) · LAG / fp(1024)`, with `LAG_RISE = fp(51)`
(≈5% per world tick) and `LAG_FALL = fp(154)` (≈15%). Devotion is slow to earn and quick to lose.

The lag serves two purposes. Mechanically, it stops worship from spiking the moment a university
completes, which would make favor regeneration a step function and the loop twitchy. Structurally,
the asymmetry is damping: a leader who loses a university or a cohort of mages takes the full hit
in about five ticks and spends about twenty earning it back. Setbacks bite; recoveries are slow.

*Alternative considered:* instantaneous recomputation with no lag. Rejected — it removes the
asymmetry lever entirely and makes worship, and therefore favor regeneration, discontinuous at
every birth and death.

### Worship reads institutional breadth and headcount; it never reads library depth

This is the decoupling that answers vision §6a directly. The §6a loop compounds on library depth.
The §7 loop compounds on worship. **They are joined only where a deeper library eventually produces
more mages**, and mage headcount is the most heavily saturated input in the worship formula.

Worship therefore does not read: library depth, node tiers known, research rate, or any measure of
knowledge as capital. A universe with a thousand-node library and forty mages worships exactly as
much as a universe with a forty-node library and forty mages.

Two loops that share no direct edge are two loops, not one loop with a gain of `g₁·g₂`. The
indirect path that remains runs through populace and mage counts, both of which are bounded by
fertility and materials — resources that grow roughly linearly, not exponentially — and both of
which are saturated before they reach worship.

*Alternative considered:* worship scaling with the magnificence of the civilization, library depth
included, which is the more evocative reading of "the number and devotion of mages, universities,
and populace revering you". Rejected — it welds the two compounding loops into one with a
multiplied gain, which is exactly the failure §6a predicts. The flavour is preserved instead by
letting *nodes* carry the `worship-yield` primitive: knowledge can buy favor, but only through a
channel `contracts.md` §3 already caps at 2×.

### The favor pool is capped, and overflow is discarded and counted

`favorCap = fp(20480) + worshipTier · fp(10240)`. Regeneration above the cap is lost, and the lost
amount is accumulated into a `favorWasted` counter exposed to the harness.

An uncapped pool converts a temporary worship lead into a permanent, bankable one — the god idles
for fifty ticks and then buys the entire ruleset at once. The cap makes surplus worship worthless
beyond a point, which converts the top of the worship curve from *power* into *tempo*: a
high-worship god cannot do more things than a mid-worship god, only sooner. `favorWasted` is the
direct signal that a strategy has outgrown its spending, and it is a useful early indicator of
snowball long before the Gini coefficient moves.

Regeneration itself is `fp(1024) + worship · fp(512) / fp(1024)`, giving a bare universe `fp(1024)`
per tick and a maximally worshipped one `fp(5632)` — a 5.5× spread, or 11× with `worship-yield` at
its `contracts.md` §3 cap. The god of a dead universe still receives a trickle, deliberately: a
zero floor makes a bad start unrecoverable and produces long, uninformative Monte Carlo runs.

*Alternative considered:* an uncapped pool with escalating intervention costs to absorb the
surplus. Rejected — cost escalation punishes the *action*, so it also punishes the small god who
finally saves enough for one grant, while the pool cap punishes only the surplus.

### `worship-yield` multiplies regeneration and never the cap

The `worship-yield` primitive is the one licensed multiplier on favor regeneration, stacking
additively into `(1 + Σ)` and capped at `fp(2048)` by `contracts.md` §3, through the shared
stacking arithmetic — this change adds no second channel. It does not raise `favorCap`.

The consequence is deliberate: investing knowledge into `worship-yield` fills the pool faster, and
a god who over-invests simply wastes more, visibly, in `favorWasted`. The primitive gives the
knowledge loop a real route into the favor economy without giving it an unbounded one.

### Intervention costs are content data, and permitting costs exactly what forbidding costs

The cost table ships as validated content alongside nodes and species, so retuning a cost is a
content change the harness can sweep rather than a code change.

Permit and forbid cost the same on both axes. Vision pillar 1 rests on the permit/forbid decision
being *symmetric* — "prohibiting something is a real strategic option, not a penalty". Any price
asymmetry converts that into a default with an exception, and the denial play stops being a peer
strategy.

Placeholder costs, all `fp`, all untuned:

| Action | Cost | Note |
|---|---|---|
| permit / forbid technique | `8192` | × hysteresis multiplier |
| permit / forbid form | `4096` | × hysteresis multiplier |
| issue dispensation / interdiction | `6144` | requires a free edict slot |
| revoke edict | `2048` | frees the slot |
| grant founding knowledge | `12288` × node tier | the only route for an unknown body of magic |
| bless mage | `2048` | |
| assign role | `256` | the routine verb; cheap on purpose |
| fund university | `3072` | found new: `10240` |
| encourage research | `1024` | per cell |
| change tradition | `65536` | and zeroes the remaining pool |
| open portal | `16384` | |
| declare ascension | `0` | free, but gated |

Two properties of that table are load-bearing rather than incidental. Assigning a role is nearly
free, because it is the verb the god performs constantly and a priced one would make the action
space mostly unaffordable no-ops, inflating `illegalActionRate` into noise. Changing tradition at
`fp(65536)` exceeds `favorCap` at every worship tier below 5 — so the ruinous action is not merely
expensive, it is *structurally unavailable* to a young universe, which matches vision §4a's "at
enormous cost, and it throws the civilization into upheaval" without needing a separate gate.

*Alternative considered:* cheaper forbidding, on the argument that removing magic should be easier
than creating it. Rejected — see symmetry above.

### Repeated changes to the same axis escalate in price rather than locking out

Each of the 19 axes carries a recent-change counter, incremented when the axis is toggled and
decremented once every 60 world ticks. Cost multiplier is `fp(1024) + counter · fp(1024)`: the
second flip inside five years costs double, the third triple.

This closes the degenerate line the portal rule invites — permit a technique, raid with it, forbid
it before the counter-raid — without a hard cooldown.

*Alternative considered:* a fixed lockout window during which the axis cannot be toggled. Rejected
for a reinforcement-learning reason. A lockout is a discontinuity in the legality mask that an
agent must learn to model as a hidden timer; an escalating price is a smooth gradient the agent
sees directly in the affordability mask, and it leaves the option available to a god who genuinely
needs it and will pay.

### Upheaval is proportional to how much the civilization actually relied on what changed

Forbidding a previously permitted axis renders every knowledge instance in the affected cells
**inert, not destroyed** — the knowledge survives, and permitting the axis again restores it. The
worship shock is scaled by the fraction of the universe's known nodes that just went inert, so
forbidding an axis nobody uses is nearly free in worship and forbidding the axis the civilization
was built on approximately halves worship for two years.

Changing tradition multiplies the worship target by `fp(256)` for 120 world ticks and zeroes the
remaining favor pool. A decade of ruin is the mechanical form of "throws the civilization into
upheaval".

Inert-not-destroyed matters: destruction would make a forbid decision irreversible in a way the
portal rule never intended, and it would hand `knowledge-model`'s loss machinery a second,
god-triggered entry point with very different semantics.

### All fifteen actions are world-time only

`contracts.md` §4.2 masks actions 1–7 and 13 during engagement and is silent on 8–12, 14, and 15.
This change masks the entire god-agency action set during engagement, leaving only the no-op.

Contracts is silent rather than permissive here, so this extends the mask without contradicting it,
and the silence is reported rather than quietly resolved. The reasoning: vision §3's frozen-policy
rule exists so that a raid in progress cannot be won by intervention, and blessing the defending
archmage mid-raid, funding a university mid-raid, or declaring ascension to escape a losing raid
all violate that intent as squarely as forbidding a technique does. If `raid-engagement` later
needs engagement-scoped divine actions, it should add them as new action IDs with their own
semantics rather than reinterpreting these.

### Interventions compose existing effect primitives and introduce none

Blessing a mage and encouraging research both express themselves as time-limited contributions
through primitives that already exist in `contracts.md` §3, combined by the shared stacking
arithmetic and subject to its caps. A blessing contributes to `research-rate`, `teach-rate`, and
`lifespan`; encouragement contributes to `research-rate` for one cell. Encouragement shares the
same `(1 + Σ)` channel and the same `fp(4096)` cap as every other `research-rate` source.

The primitive set is closed, and it is closed because balance is asserted over it. A `divine-favor`
primitive invented here would be a category of effect the harness's ablation runs do not measure,
which is the exact hole vision §4a's four-hook cap exists to prevent on the tradition side.

*Alternative considered:* a dedicated blessing primitive, which would make blessings easier to
tune independently. Rejected — independent tuning is precisely what makes an effect invisible to
`winRateByPrimitive`.

### Ascension is declared, not automatic

The condition being met makes action 15 legal; it does not end the run. The god must declare.

A summit that triggers itself is not a decision, and vision §8a frames ascension as "ends the run
gloriously" — a choice about when to stop. Declaration also gives the harness a clean signal to
measure: the gap between condition-met and declaration is itself informative, and an agent that
never declares reveals that the terminal reward is mispriced against continued play.

*Alternative considered:* automatic termination on condition. Rejected — it removes the decision
and makes it impossible to distinguish "could not ascend" from "chose not to".

### Founding knowledge seeds roots only, or the summit becomes purchasable

Granting founding knowledge is restricted to nodes that declare no prerequisites — the roots of a
cell's graph. Without that restriction the grant would be a direct purchase of any node in the
game, and the cheapest route to Path A would be to save favor to the pool cap, grant the deepest
node of a cell outright, scribe a second copy, and declare. That would turn a condition built as a
conjunction of four unlikely facts into a favor-accumulation race, and take the ascension band's
whole plausibility argument with it.

The restriction is also the more faithful reading of vision §7 — founding knowledge exists "so that
a body of magic can exist in your world for the first time", which is a *beginning*, not a summit.

*Alternative considered:* allowing any node but pricing deep grants steeply. Rejected — a price is
a delay, and a hundred world years of saving is not a design constraint, it is a loading screen.

### Two disjoint ascension paths, and depth is defined relative to content

**Path A — Apotheosis of Mastery.** A living mage holds a node that is the deepest node present in
its cell's content graph, that cell is permitted, at least two instances of the node survive, and
the universe is at worship tier ≥ 4.

**Path B — Enduring Canon.** The universe has reached era 4, and at every era boundary since era 1
`libraryDependence` was at or below 25% and no more than two nodes left the universe during that
era.

Neither path may be declared before world tick 600 (50 world years).

*Depth is content-relative, not literally tier 7.* Per-species depth ceilings mean tier 7 may be
reachable by one species or none, and the v1 placeholder node graphs may not contain a tier-7 node
at all — a literal condition could be unreachable in v1 content and would need rewriting every time
the content changed. "The deepest node present in the cell" survives retuning.

The two paths are deliberately different in kind. Path A rewards a spike: one long-lived,
well-taught mage in a permitted deep cell, secured against loss by redundancy, in a worshipped
universe. Path B rewards custodianship: four eras of not losing things, which cuts directly against
`knowledgeHalfLife` and is the ending available to a civilization that never produced a prodigy.
A single condition would make one species archetype the only route to the meta-game.

**Why this might land in the 5–20% band.** Path A is a conjunction of four independently unlikely
facts — a species with the depth ceiling to reach the deepest tier, a mage who lives long enough
to climb the whole prerequisite chain, the cell still permitted at the moment of declaration, and
two surviving instances of a node that by construction only one mage has ever held. Path B is a
conjunction across time — four eras, roughly eighty world years, of holding
`libraryDependence` under a threshold that `contracts.md` §7 flags as a metric precisely because
most civilizations fail it. Each path plausibly lands in the high single digits; a disjunction of
two such paths plausibly lands in the low-to-mid teens.

That is a plausibility argument, not a prediction, and it is the reason the retune procedure below
is part of the specification rather than an afterthought.

### Stagnation is a defined terminal state, so `ascensionRate` has a denominator

Vision §8a says a ruined universe "stagnates, and stagnation is its own ending" — which is prose,
not a condition. A run terminates as `stagnated` when any of: no living mage for 60 consecutive
world ticks; worship below `fp(128)` for 240 consecutive world ticks; or no node newly entering the
universe by any route for 480 consecutive world ticks *while worship is also below a health floor*.
A run that reaches tick 2400 without terminating ends as `cutoff`.

The third trigger is conjunctive for a specific reason. A perfect custodian — zero losses, every
learnable node already learned — acquires no new nodes either, because zero losses means nothing to
rediscover. A bare stasis trigger would therefore terminate as *ruin* the exact civilization Path B
exists to reward, and would do it at tick 480 when Path B qualifies at tick 960. Stagnation must
mean decline, not completion, and only worship distinguishes the two.

Without a stagnation definition at all, `ascensionRate` is a fraction over an undefined denominator,
and Monte Carlo runs that are already decided burn wall-clock proving it.

### Prestige buys stocks; it never buys rates

Legacy is granted exclusively as: starting favor, starting materials, starting populace, and a
seeded archive of at most three knowledge instances at tier ≤ 3, placed in a library where they are
lootable and burnable like any other. Prestige MUST NOT modify favor regeneration, any worship
constant, the edict budget, any primitive magnitude or cap, any species trait, or the ascension
condition.

The distinction is the whole model. In a game with two compounding loops, a rate bonus is fed
through both loops for the entire run and its advantage *grows* with run length — which is exactly
the meta-game deciding matches before they start. A stock is spent, consumed, aged out, or looted;
its advantage *decays* with run length. Placing the seeded archive in a lootable library is the
sharpest version of this: the head start is not merely perishable, it is a target.

*Alternative considered:* a small permanent rate bonus, e.g. +2% research rate per prestige tier,
which is what most roguelite meta-progressions do and what players find most legible. Rejected on
the compounding argument, and because a +2% rate compounded through the §6a loop over 200 world
years is not small.

### Prestige accumulates through a convergent recurrence, and the cap is its limit

`prestige' = min(fp(8192), prestige · fp(768) / fp(1024) + prestigeEarned)`, with `prestigeEarned`
bounded at `fp(2048)` per run.

Retention of 75% with a per-run earning ceiling of `fp(2048)` gives a geometric series whose limit
is `2048 / (1 − 0.75) = fp(8192)`. **`PRESTIGE_CAP` is that limit, not an arbitrary clamp** — an
infinite streak of perfect runs approaches it asymptotically and never exceeds it, and the tenth
consecutive ascension adds a few percent over the fifth. The clamp is retained only as a defence
against a content bug that raises the earning ceiling.

Conversion into a legacy budget is concave on top of that: `legacy = sat(prestige, fp(1024),
fp(2048))`, so half the maximum prestige already buys 83% of the *attainable* head start — the
budget reaches `fp(819)` at the prestige cap and `fp(682)` at half of it — and the back half of the
prestige range is nearly worthless. Two damping stages in series, convergent accumulation followed
by saturating conversion, is what makes the ceiling a property rather than a tuning accident.

Each stock channel's grant is then `channelMax × legacy / fp(1024)`, where `channelMax` is
`LEGACY_HEADSTART_FRACTION` (placeholder `fp(256)`, 25%) of the median unaided universe's value for
that channel at world tick 120. A maximally prestiged universe therefore starts at roughly 20% of
where an ordinary universe stands after ten world years — and that single fraction is the only
knob `prestigeAdvantage` turns.

Stagnation and cutoff endings earn reduced but nonzero prestige. A zero floor would make losing
streaks spiral, which is the same failure as runaway leaders wearing the opposite sign.

### The balance caps are the test, not the mechanism

Nothing in the implementation clamps `prestigeAdvantage` to 59%, and nothing clamps
`worshipSnowball`. Both are measured outputs of the harness, and both have a named single knob and
a named retune order:

| Metric | Threshold | First knob | Then |
|---|---|---|---|
| `worshipSnowball` | Gini ≤ 0.35 at ticks 120 / 600 / 1200 / 2400, and p95:p50 favor regen ≤ 3:1 | lower each saturation `cap` | raise each `half`; then lower favor-per-worship; then lower `favorCap` per tier |
| `ascensionRate` | 5–20% of terminated runs | Path A's worship-tier gate | Path B's era count; then Path B's dependence threshold — one at a time |
| `prestigeAdvantage` | < 60%, target band 52–58% | the single legacy head-start fraction | nothing else; if the fraction reaches zero and the metric still fails, the model is wrong and gets redesigned |

A metric clamped in code is a metric that can never fail, and a claim that can never fail is what
`release-plan.md` exists to prevent. The harness also reports `ascensionRateByPath`: if either path
accounts for more than 90% of ascensions the aggregate rate can sit inside the band while one path
is dead, and the aggregate alone would hide it.

### Terminal-outcome scoring defines "win" for the 0.6.0 claim, before raids exist

`release-plan.md`'s 0.6.0 claim is that no scripted god strategy exceeds a 65% win rate against the
pool — but universes cannot fight until 0.7.0. A pairing is therefore two strategies running
universes from an identical seed and identical initial conditions, and the winner is decided
lexicographically: ascended beats not-ascended; earlier ascension beats later; among non-ascended,
higher `prestigeEarned` wins; exact ties score half each.

Stating this now is what makes the release's headline claim runnable at 0.6.0 rather than
retroactively. It is explicitly provisional: once `raid-engagement` lands, head-to-head raid
outcomes become the definition of a win, and this scoring survives only as a solitaire metric.

## Risks / Trade-offs

- **The worship formula's shape may be right and its constants badly wrong** → Every constant is
  content data, the harness sweeps them, and each balance gate names one knob and a retune order.
  Shape errors are expensive; constant errors are a sweep.
- **Decoupling worship from library depth costs some fantasy** → Accepted. A god whose scholars
  have written the deepest library in the multiverse is not thereby more worshipped, which reads
  slightly wrong. Mitigated by the `worship-yield` primitive, which lets specific *nodes* convert
  knowledge into favor through an already-capped channel, so the fantasy is available as a
  deliberate investment rather than as an automatic multiplier.
- **The ascension band may be unreachable with the v1 12-cell subset** → Path A is content-relative
  and therefore always satisfiable in principle; Path B depends on no content at all. If the v1
  subset makes Path A trivial because its deepest tier is 3, `ascensionRateByPath` shows it
  immediately.
- **Era advancement is defined here but probably does not belong here** → A placeholder of one era
  per 240 world ticks is specified so that Path B references a field something actually advances.
  Flagged in the proposal as a required contracts amendment whose true owner is likely the
  world-rules layer; if it moves, Path B consumes it unchanged.
- **Cost hysteresis could be gamed by rotating across axes** → A god with 19 axes can flip a
  different one each time and never pay escalation. Accepted for now, because rotating axes is
  itself a costly, high-upheaval strategy; the harness will show it as an outlier strategy in the
  bot pool if it is dominant.
- **The favor pool cap may make late-game play inert** → The cap grows with tier, so it moves; and
  `favorWasted` is instrumented precisely so "the late game is a god with nothing to buy" shows up
  as a number rather than as a vibe.
- **Prestige may end up doing nothing at all** → The failure mode symmetric to runaway is a
  meta-game with no draw. The target band of 52–58% is stated for exactly this reason: a
  `prestigeAdvantage` of 50% means the carry-over is decorative, and that is a tuning failure too,
  just a quieter one.
- **Masking every intervention during engagement may prove too strict** → It is the conservative
  reading of a silence in `contracts.md` §4.2, and the reversible direction: unmasking an action
  later is additive, while retracting a permission after agents have trained against it is not.

## Migration Plan

Additive. No prior change ships a favor pool, a worship value, or an intervention, so nothing
changes behaviour — `contracts.md` §1.1 already declares `favor`, `worship`, `worshipTier`,
`edicts`, `edictBudget`, `prestige`, and `ascended`, and until this change they are inert fields.

Landing order within the change: worship and favor first (they gate every cost), then the
intervention dispatch and mask, then ascension and prestige, then the three balance gates in the
harness. The gates land last deliberately — they are assertions about the rest, and asserting
before the thing exists produces a green suite that means nothing.

The state fields this change requires that `contracts.md` §1.1 does not declare are listed in the
proposal's Impact section as required contract amendments. They must be written into
`contracts.md` before or alongside implementation; a spec that assumes unlisted state is the exact
incompatibility that document exists to prevent.

Rollback is reverting the branch. The one irreversible artifact is a committed balance baseline
taken against these formulas — reverting the code invalidates it, which the RNG-stream registry
rules in `core-contracts` already treat as a first-class consequence.

## Open Questions

- **Who owns era advancement?** Defined here as a placeholder because Path B needs it. It plausibly
  belongs to `mages-and-species` or to a world-rules layer, and may deserve to be event-driven
  (an era turns when a generation passes) rather than fixed-interval.
- **Should the worship formula weight mages by role?** A professor visibly serving the god might
  reasonably be worth more devotion than a raider. Left flat for v1 because it adds four tunable
  constants to a formula that already has six, and the harness cannot yet say whether the
  distinction pays for itself.
- **Does an inert cell's knowledge decay while inert?** Specified here as fully preserved. If
  `knowledge-model`'s mastery decay applies to inert instances, forbidding an axis becomes a slow
  form of destruction, which is a different decision than the one specified.
- **Should legacy populace arrive as adults or as students?** Adults are a larger immediate head
  start; students are a slower and more decay-friendly one. Deferred to the first
  `prestigeAdvantage` sweep, which can answer it empirically.
- **Is 60% the right ceiling for `prestigeAdvantage` at all?** `contracts.md` §7 fixes it and this
  change honours it. Worth revisiting at 0.10.0 when real PvP data exists, since 60% against a
  *fresh* universe may be tolerable or intolerable depending on how matchmaking pairs prestige.
