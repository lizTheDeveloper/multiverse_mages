<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# A self-evolving strategy space

*Status: proposal, 2026-08-13. Nothing here is approved. `vision.md` is the vision of record and
`campaign-plan.md` holds the measurements this is reasoning from — read W91, W92 and W81 before
arguing with any of it.*

## What is being asked for

An autonomous loop that explores the design space with **different hypotheses in parallel**, and
promotes what works — so the strategy space widens without someone hand-authoring each strategy and
hand-dispatching each experiment.

## What already exists, and what it is missing

| piece | state |
|---|---|
| `tune-balance.mjs` — coordinate descent over god constants, scoring band × variety × does-winning-measure-play | **built, hand-run, not in CI** |
| `scoreBalance` / `varietyOf` — a variety term | built |
| `REFERENCE_FACTOR_IDS` — five swept factors | built; **two never varied by any gate** |
| the design-language claim register — pre-registered `procedure` / `refutedBy` / `verdict` | built, 11 claims |
| `run-sweep-distributed.mjs` — 1,096 runs in 85 s | built |
| the bot pool | **eight hand-written strategies; nothing generates or mutates one** |
| promotion | **nothing. A winner is a number in a log** |

**The loop is three connections away from existing.** What follows is those three, plus the one guard
without which the whole thing produces confident noise.

---

## The guard, first, because it is the lesson of the entire campaign

**An autonomous optimiser pointed at a metric that cannot move will run forever and report progress.**

This is not hypothetical. The campaign found **ten** instances of an instrument not touching the thing
it names: ten of fifteen metrics with no production caller; tolerances at ±118% of mean where 80 of 80
collapse-to-zero events passed; all three gates resolving **zero raids**; an ablation mask that never
reached the god subsystem; `@mm/rules-raid` with no dependents at all. Every one of those was green.

So **stage 0 is not optional and nothing runs before it**:

> **Before a metric may be optimised, it must be shown to move.** Ablate the mechanism it names, run
> the paired arms, and require a delta outside the noise. A metric that cannot be made to move is
> **quarantined**, not optimised — and the quarantine list is published, because a silently-skipped
> metric is how this failure returns.

This is the existing `winRateByPrimitive` ablation generalised from primitives to metrics, and it is
cheap: one paired sweep per metric, reusable across every later hypothesis.

**The second guard follows from W91.** A cost surface is shared by every universe, so it can only
reweight terms that already differ between them — pricing all 300 nodes moved containment *the wrong
way* at 10 fp against appeal bounds of 256–512. Therefore:

> **Only factors that differ between universes may enter the search as divergence levers.** Shared
> constants are tuning, not exploration. The search must know which of its axes is which, and say so.

---

## The third guard: **playing must beat not playing**

This is the requirement the campaign kept rediscovering as a defect rather than stating as a rule, and
it belongs above every other objective. **Not as a statistical control — as the game's design
condition.** If doing nothing scores as well as playing, there is no game, whatever the archive says.

It is not one null. It is a **ladder of four**, and each rung answers a different question. All four
already exist in the pool:

| rung | strategy | the question it answers |
|---|---|---|
| 1 | `passive-control` — submits nothing, ever | **Does acting beat not acting?** |
| 2 | `permit-then-idle` — sets the ruleset, then nothing for the rest of the run | **Is the ruleset the whole game?** |
| 3 | `uniform-random-legal` — draws a legal action at random | **Does skill exist, or only tempo?** |
| 4 | `idle-then-declare` — does nothing but presses the win button | **Is the win condition a button?** |

**Every one of these has beaten a designed strategy at some point in this campaign**, and each time it
was found by accident:

- `permit-then-idle` won **40/40** by permitting the grid for 140 of 2400 ticks and submitting nothing
  for the remaining 2260 — beating `permissive-breadth`, which also funds, blesses and encourages.
- `passive-control` reaches **51 nodes doing nothing at all**; `archivist` builds **~1,300
  universities** and reaches the same 51.
- `uniform-random-legal` once ascended **80/80** against designed strategies at 0/80, because it drew
  the button they never pressed.

**So the floor is not a formality. It is the thing that has actually been failing.**

### How it enters the loop

**An elite must beat the null ladder on its own cell's descriptor before that cell counts as
occupied.** Concretely:

- The **four nulls run in every round**, against the same content and the same seeds as the candidates.
  They are **never** a stored constant — as content and mechanics change, doing-nothing's score changes
  with them, and a fixed baseline number would rot exactly the way this project's stale documents did.
- Comparison is **paired, under common random numbers, on the same seeds.** Not aggregate against
  aggregate. The campaign's "seed beats strategy" result was an artifact of round-robin assignment
  giving strategies disjoint replicate indexes, so no two ever played the same universe; held fixed,
  strategy dominance was **η² = 1.00 from tick 60**.
- **A cell reached only by strategies that lose to the ladder is recorded as
  `reachable-not-worth-playing` rather than counted as width.** The information is kept — reachability
  is a fact about the action space — but it does not inflate the score. This is the one place the
  earlier "keep a strategy that wins badly in an empty cell" rule is overridden, and it should be.
- **Report which rung killed it.** Losing to rung 1 and losing to rung 3 are different diagnoses: the
  first says the verbs do nothing, the second says they do something a coin could do.

### And the same rule applies to the design space, not only the strategy space

A content or constant change is promoted only if it **widens the gap between playing and not playing**.
A change that raises every strategy's score equally, nulls included, has changed the scale and not the
game — and `favor-cap-base`'s own gloss already says the equivalent about worship: the cap *"converts a
worship lead from power into tempo — a high-worship god cannot do more things, only sooner."*

**The single most useful number this loop can publish is the margin between the best elite and the best
null.** If that margin is not growing, nothing else in the archive matters.

---

## Connection 1 — hypotheses generated from the registries, not hand-written

A hypothesis is a **cell in the cross-product of the factor registry and the metric registry**, and
both registries already exist and are already checked in both directions by tests.

    for factor in REFERENCE_FACTOR_IDS × levels:
      for metric in BALANCE_METRIC_REGISTRY (minus quarantined):
        claim: "varying <factor> moves <metric>"
        refutedBy: "the arms scoring inside each other's intervals"

**Emit each as a claim in the design-language register with its `refutedBy` written before the run** —
that discipline already exists and has already proved its worth: an agent's four pre-registered claims
were verified byte-identical to the pre-registration commit, and pre-registration is worth nothing if
the claims can move afterwards.

**Two factors have never been varied by any gate — `foundingSpeciesMask` and `tradition`** — and both
are prime suspects. Tradition is not flavour: the reference tradition sets `instanceMastery: 1024` on
every instance, so *every* measurement this project has ever taken assumes researched knowledge is
immediately teachable. **Start there.** It is the cheapest unrun experiment on the board and two
independent workstreams arrived at it.

---

## Connection 2 — the strategy space evolves, and the fitness is *not* winning

This is the part that does not exist at all, and the part that most needs the right objective.

**A strategy is a preference list over sixteen verbs, plus a stance and some parameters.** That is a
small, structured genome — reorderable, mutable, crossover-able. Generating and mutating one is easy.

**Scoring one is where this goes wrong if it is done the obvious way.** `varietyOf` today is the
entropy of *who wins*. Maximising it produces strategies that win equally often — and the campaign's
actual target was never that. It was **width**: how many genuinely different ways there are to play.
A pool of eight strategies that all walk the same queue at different speeds has entropy near 1 and
width 1.

So the objective is **quality-diversity, not fitness**. MAP-Elites over a behaviour space, with:

- **behaviour descriptors** — the axes on which two strategies can be *different*: distinct nodes
  known, cells occupied, universities completed, library depth, ascension path taken, raids initiated.
  Every one of these is an existing metric.
- **fitness within a cell** — did it ascend, and how robustly.
- **the score of the pool** — **the number of occupied cells**, not the best fitness in it.

**A new strategy earns its place by being different, not by being better.** One that wins the same way
as an incumbent adds nothing and is discarded; one that wins *badly* in an empty cell is kept, because
it proves the cell is reachable.

That is a direct assault on the campaign's finding that every universe looks the same, and it measures
the thing the campaign actually wanted: **Dilworth width > 1**, replacing the unsourceable
rock-paper-scissors target it started with.

**Guard the scoring function**, because this is Goodhart-shaped: a mutant rewarded for novelty will
find degenerate cells — submit illegal actions, stall, exploit a masked verb. Require an elite to
**ascend at least once** before its cell counts, and keep the illegal-action rate as a disqualifier.
`illegalActionRate` already exists and already moves (0.58 under `portal-rush`, honest 0 under
`passive-control`).

---

## Connection 3 — promotion, which must not be an auto-merge

**Do not let the loop merge to `main`.** Two reasons, both measured:

1. **Baseline conflicts grow quadratically.** Every branch re-recording the three baselines conflicts
   with every other one that does; the queue reached fourteen `DIRTY` at once today with five
   branches in flight. A loop opening PRs continuously would never converge.
2. **A merge caught a compile-level defect neither branch had alone** today — a widened interface
   supplied only in test fixtures against a production builder added elsewhere. **Git did not flag
   it**, because it was not a conflict. An auto-merger that resolves conflicts and pushes would have
   shipped it.

Instead:

- The loop writes to a **candidate content set and a candidate pool**, versioned, never to `main`.
- It publishes a **leaderboard by occupied cells**, with each cell's exemplar and the claim that
  produced it.
- **Promotion is one batched PR per round**, carrying the winning vector, the pre-registered claims
  with their verdicts, and *one* baseline re-record for the whole round. Batching is what makes the
  quadratic conflict problem linear.
- A human — or a standing rule — decides what lands. **The loop's output is evidence, not a commit.**

---

## What to build, in order, and what each costs

| # | step | cost | unblocks |
|---|---|---|---|
| 1 | **Metric reachability harness** — ablate each metric, publish the quarantine list | small; reuses the ablation | everything |
| 2 | **Vary `tradition` and `foundingSpeciesMask`** in the gates | small; both are registered factors | the two unrun experiments |
| 3 | **Behaviour-descriptor extraction** from existing run records | small; the metrics exist | MAP-Elites |
| 4 | **Strategy genome + mutation** over the preference list | medium | the pool evolving at all |
| 5 | **MAP-Elites loop** over the archive, scoring occupied cells | medium | width as an objective |
| 6 | **Batched promotion PRs** with pre-registered claims | small | landing anything |

**Steps 1 and 2 are worth doing whether or not the rest is ever built.** Step 1 retires the campaign's
modal defect; step 2 answers the cheapest unrun question on the board.

## The honest risks

- **The archive fills with degenerate cells.** Mitigated by the ascend-at-least-once floor and the
  illegal-action disqualifier, and it should be *reported* — an archive that is 80% degenerate is a
  finding about the action space, not a failed run.
- **Compute.** The ascension gate alone takes ~30 minutes; MAP-Elites wants thousands of evaluations.
  `run-sweep-distributed.mjs` does 1,096 runs in 85 s for $0.57, and this is exactly what it is for —
  but it introduces a network dependency, which is why it must stay **out of the merge gate** and
  inside the exploration loop only.
- **The loop optimises the simulation's bugs.** It will, and that is useful: a strategy that wins by
  exploiting a masked verb is a bug report with a reproduction. **Log the exploit; do not patch the
  scorer to hide it.**
- **Determinism.** Every mutation and every draw must come from a declared stream, or the archive is
  not reproducible and none of its claims survive a re-run. Note that appending an RNG stream forces a
  re-baseline event — `contracts.md` §6 records this — so the loop's streams should be allocated once,
  up front, rather than per experiment.

---

## The general rule: every number that should be figured out is a search space

*Owner, 2026-08-13. The widest statement of what the search is for, recorded separately because it
covers decisions nobody currently thinks of as search.*

**If a number has to be figured out, do not figure it out. Search it.**

This project has already been wrong in both directions:

- **A guessed scalar sitting in a flat region of its own curve is indistinguishable from a mechanic
  that does nothing.** Much of the campaign's null-result history is that shape.
- **And a scalar defended by argument is worse than one defended by a curve**, because the argument
  survives the evidence. `researchCost` being a pure function of tier read as a deliberate ladder for
  as long as nobody measured what it bought.

> **Whenever a design decision reduces to a number nobody can defend from first principles, the
> deliverable is the curve, not the value.** Sweep it with **both degenerate ends as controls** — the
> value at which the mechanic does nothing, and the value at which it dominates — and let the
> measurement pick. **A flat curve is a real finding**: the mechanic is theatre and the number was
> never the constraint.

### What this covers that is not currently called search

| decision | the space | state |
|---|---|---|
| worship → grid width threshold | when the second cell unlocks | open |
| how random "a random student" is | lottery ↔ pure aptitude weighting | open |
| concentration-buys-depth | flat ↔ spreading never correct | open |
| displacement cap | `fp(512)` ↔ break-even | **argued, held, never swept** |
| opening square size | 1×1 ↔ full grid | swept, **3×3 ruled** |
| founding grant budget | 0 ↔ unlimited | swept, **curve flat — mechanic inert** |
| species at founding | 1 ↔ 6 | swept, **one ruled** |
| foundational equivalence class | cell ↔ technique ↔ form | **cell, ruled by the owner** |
| every `tuningStatus: "untuned"` constant | six species, seventy `dailyRelevance` values, 73 god constants | **hundreds, untouched** |

**The last row is the point.** Hundreds of untuned constants, each one a number somebody will
eventually be tempted to argue about — against a tuner that **already exists**. `tune-balance.mjs`
does coordinate descent over god constants scoring band × variety, and it has been hand-run and never
wired to anything.

### Two guards, both learned expensively

**A number cannot be searched if the metric it moves cannot move.** That is stage 0 and it is not
optional: **16 of 28 registered metrics are quarantined**, and an optimiser pointed at any of them
runs forever reporting progress.

**And a shared constant cannot be a source of divergence.** Pricing all 300 nodes moved containment
*the wrong way* — 10 fp against appeal bounds of 256–512 — because a cost surface is shared by every
universe and can only reweight terms that already differ between them. **Search a shared constant for
tuning; search a per-universe factor for variety.** They are different searches and conflating them
wastes both.
