<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The macro model: what shape a university system has to be

**Built 2026-08-14 against `main` at `672f93c`** (anti-requisites, PR #161, merged). Every measured
figure below was produced by `tools/w189/cli.mjs` on that ref. Re-run it before quoting it — a
measurement is a statement about the tree it was taken on.

    node tools/w189/cli.mjs reference   # the needs, intended vs as main runs it
    node tools/w189/cli.mjs sweep       # raid probability x economic rate
    node tools/w189/cli.mjs breadth     # vision 4b's per-mage cap x raid pressure
    node tools/w189/cli.mjs toggles     # which unwired subsystem changes the answer
    node tools/w189/cli.mjs species     # the same universe, six ways
    node tools/w189/cli.mjs params      # every number and where it came from
    node tools/w189/cli.mjs selftest    # positive controls; 42 = broken probe

## What this is

`skills-in-a-population.md` records the ask: *"figure out at a high level what universities shape
like … using the abstract concept of the raid given probabilities and the abstract concept of the
economy … have it emit needs."*

This is that model. It steps in **world years**, uses floating point, and imports nothing from
`@mm/*` — it reads `packages/content/data/*.json` directly and is not on the deterministic rules
path. It runs a 200-year universe in about a millisecond, which is what makes it sweepable.

**It emits needs, not numbers.** A need is a shortfall against a stated objective with its cause
attached, in a unit a god can buy: scribes, professors, universities, vellum.

### The two objectives, stated

A shortfall is undefined without them, so they live in one place (`needs.mjs`):

- **Retention** — no held node may exceed a **5%** chance of being lost over **50 years**, where a
  holder's hazard is mortality plus raid casualty and a book's is decay plus burning. This is a
  *fragility* measure: it asks what becomes of each node **if nothing new is taught**, which is the
  right question about a single point of failure and the wrong one about a thriving discipline.
- **Discovery** — net new *retained* nodes per year ≥ 0. A universe discovering three and losing
  four is not growing slowly, it is dying slowly, and a node count hides that for decades.

### The one closure that makes it small

**A mage of depth `d` holds every held node of tier ≤ `d`.** That is the owner's graduation rule —
*"students until they learn everything that the university they enrolled in can teach them"* — read
as a steady state rather than an event. It collapses per-node bookkeeping into per-cohort
bookkeeping, and the pyramid falls out rather than being asserted: the holders of a tier-`t` node
are exactly the mages at depth ≥ `t`, so deep nodes are automatically thin.

Two terms thin it further, and they multiply: vision §4b's **per-mage breadth cap**, and
**anti-requisites** where the portfolio spans an authored exclusion pair.

## What it deliberately does not model

- **`rules-raid`.** A raid is a hazard rate with an expected cost. No engagement, no terrain, no HP.
- **`material-stock`.** Materials are rates. No stocks, no shortage semantics, no claimant ordering.
- **Favor, worship, and the god's action space.** The god enters only as the parameters he moves.
- **Individual mages.** Cohorts in 20 age bins, mean-field within a bin.
- **The prerequisite DAG.** Tier is the only depth coordinate; which tier-3 node you hold is not
  tracked. This is the largest deliberate simplification and it is why the model can say "the
  portfolio needs 40 more instances" but never "you are missing *Rego Terram* specifically."
- **Space, territory regions, and multiple universes.** One universe, one land.

## Parameters and their provenance

Every parameter carries a tag, printed by `params`. The tags follow `tuningStatus`'s distinction
because the failure this model exists to avoid is a placeholder becoming a balance constant nobody
remembers inventing.

| tag | meaning | count |
|---|---|---|
| `content` | read at run time out of `packages/content/data`. Not a choice. | 15 |
| `authored` | the owner said this number, in a design doc, in words | 2 |
| `measured` | taken from an instrumented run or from code, ref named | 3 |
| `derived` | arithmetic over the above, no new freedom | 1 |
| `invented` | **mine** — a modelling choice with no external authority | 11 |

32 parameters in total.

The eleven `invented` parameters are the forks the author owns. The three that most move the
answer, named so they can be overturned deliberately:

1. **`raidMageCasualtyFraction` = 0.15.** There is **no casualty-rate constant in `rules-raid`** —
   deaths are HP attrition plus the stranded-raider wipe. This one number stands in for an entire
   engagement, and it is the single most consequential invented value here.
2. **`yearsInSchoolPerTier` = 4.** Sets how many seats a latent pool demands, and therefore the
   university need directly.
3. **`extinctionRiskTarget` = 5% / `retentionHorizonYears` = 50.** These *define* fragility. A
   different pair moves every "one funeral from lost" count on this page.

**Two prevalences are deliberately absent.** `magical-prevalence.md` leaves dwarf and gnome blank
rather than guessing, and so does this model: `speciesBlock` **throws** on them. A sweep over
dwarves fails loudly instead of quietly reporting a number that came from me. The reference
universe is human, which is fully authored, so no headline figure below rests on a guess.

## The needs it emits for the reference universe

Human, 200 world years, the shipped twelve-cell rectangle, 4.5%/yr raid probability, economy 1.0×.

    This universe is short 39.7 universities to sustain its current rate of discovery
    against a 4.5% annual raid probability (3.7%/yr after the 5-year cooldown);
    it sustains discovery at 0.00 nodes a year, and the binding constraint is universities.

| need | required | available | short |
|---|---:|---:|---:|
| **universities** | **40.7** | **1.00** | **39.7** |
| scribes | 114 | 128 | — |
| professors | 0.68 | 35.8 | — |
| vellum | 43,585 fp/yr | 602,874 fp/yr | — |

Access is **13.1%**: the schools reach one latent mage in eight. That is the whole of the reference
universe's problem, and it is the gap `magical-prevalence.md` says the university exists to close.

**Nothing is fragile. Not one node, ever.** Every held node has ~235 holders, because every mage
reaches the human depth ceiling and therefore holds everything the ruleset permits.

Two structural facts the needs cannot close:

- **2 of the 51 v1 nodes are tier 5 and the human depth ceiling is 4.** A human universe cannot
  hold them at any number of universities. Reported as *unreachable*, never folded into a shortfall.
- **Anti-requisites cannot bite domestically.** The only authored exclusion pair —
  `creo-ignem` ⇄ `creo-umbra` — sits **outside the twelve enabled cells**. Inside the shipped
  rectangle no mage ever has to choose, so breadth is still free where the game is actually played.

## The sweep: raid probability × economic rate

**The raid axis is flat. Completely flat.** Every cell in every row is identical from 0% to 55%
annual raid probability:

| raid ↓ / econ → | 0.50× | 0.75× | 1.00× | 1.50× | 2.50× |
|---|---:|---:|---:|---:|---:|
| 0.0% | 28.4 | 35.6 | **40.7** | 47.5 | 54.8 |
| 4.5% | 28.4 | 35.6 | **40.7** | 47.5 | 54.8 |
| 20.0% | 28.4 | 35.6 | **40.7** | 47.5 | 54.8 |
| 55.0% | 28.4 | 35.6 | **40.7** | 47.5 | 54.8 |

*(universities required; the universe has 1. Fragile nodes are 0.00 in all thirty cells.)*

Three content facts cause it, and each is checkable:

1. **The cooldown is a hard ceiling on raid pressure.** `inbound-raid-cooldown-world-ticks` = 60
   forbids any raid for five years after one, so arrivals are a **renewal** process, not a Bernoulli
   one: the long-run rate is `1/(cooldown + 1/p)`, which tends to **0.167/yr** as `p → 1`. Vision §8
   asked for the griefing surface to be *bounded rather than merely improbable*. It is bounded —
   and the bound also makes the raid economically inert.
2. **A raid consumes zero world time by construction.** It runs 2400–3600 *engagement* ticks and
   0 *world* ticks, and §8's tempo cost is defined against uninvolved universes while `contracts.md`
   §1.1 puts one universe in an instance. W8 measured `inboundRaidTempoLoss` at 0.0 for that reason.
3. **Casualties are noise against the roster.** At the ceiling rate, ~0.15 mage-deaths a year
   against ~239 living mages.

**The economic axis is the only live one, and it makes the need worse.** A 5× richer world needs
**twice** the universities (28 → 55), because carrying capacity scales, population scales, the
latent pool scales, and seats do not. Wealth buys more people who *should* be mages and no more
places to teach them.

### So what shape must a university system be?

**Bigger by a factor of forty, and that is the entire answer at present.** Not more redundant —
nothing is at risk. Not more specialised — nothing forces specialisation. The model was built to
ask whether raid pressure or economic pressure demands a *different shape*, and the honest answer
on `672f93c` is that neither does: both demand the same shape, more of it.

That is a finding about the current constants, not about the design. The design has the missing
term already written down.

## The missing term: vision §4b

§4b says an individual mage **cannot** learn all the magic — schools exclude each other, depth
requires a long life, and the deepest magic is cast collectively. Nothing enforces any of that
inside the twelve enabled cells. Sweeping the cap the design implies, against raid pressure:

**Held nodes above the risk target — "one funeral from lost":**

| per-mage cap ↓ / raid → | 5% | 20% | 45% | 90% |
|---|---:|---:|---:|---:|
| none | 0 | 0 | 0 | 0 |
| 100 | 0 | 0 | 0 | 0 |
| 25 | 0 | 0 | 0 | 0 |
| 12 | 0 | 0 | 0 | **284** |
| 6 | 0 | **78** | **284** | **284** |
| 3 | 0 | **284** | **284** | **284** |

**Fragility needs both terms and has neither.** It requires a per-mage cap of **≤ 12 nodes** *and*
raid pressure of **≥ 20%/yr**. Today the cap is unbounded and the effective raid rate is 3.7%/yr.
**At the shipped raid rate, no breadth cap whatsoever makes knowledge losable** — the whole left
column is zero.

This is the quantitative form of the campaign's central failure. `permissive-breadth` dominated
because breadth had no opposing term; anti-requisites supplies one *in principle*, and this table
says how much of one is needed before a god has a retention problem to solve at all.

## Which unwired subsystem most changes the answer

`toggles` flips one subsystem at a time from the design's intent to what `main` does today.

| flipped to broken | held | scribes needed | fragile | binding need |
|---|---:|---:|---:|---|
| *(baseline, all intended)* | 49.0 | 114 | 0 | universities: 39.7 |
| **`scribingQueue` → 0** | 49.0 | **0.00** | 0 | universities: 39.7 |
| `scribeCohortRefills` → drain-only | 49.0 | 12.2 | 0 | universities: 39.7 |
| `affiliationCompletes` → never | 49.0 | 114 | 0 | universities: 39.7 |
| `teachRateBites` → inert | 49.0 | 114 | 0 | universities: 39.7 |
| `standingArmy` → 0 *(correct)* | 49.0 | 114 | 0 | universities: 39.7 |

**`scribingQueue` is the answer, and it is the only one that changes anything at all.** It takes
the written record from a universe that sustains ~903 books to one that holds **zero**, because
`world-step.ts` passes `scribingQueueDepth: 0` and `demand.ts` multiplies by it — so the whole
universe rests on living memory. `scribeCohortRefills` is a distant second (it caps the scribe pool
at the drained floor of 14). The other three move **nothing**.

**Fix `scribingQueueDepth` first.** It is the only unwired subsystem that changes the shape of the
answer, and it is the one that gives the raid something to destroy — a universe with no books
cannot have its library burned, which is a second reason the raid axis reads flat.

### A correction to the record, while we are here

**`teach-rate` is not inert. It is inert for tiers 1–3 only.** The completion gate is a bare
`progress < required` with no partial-month carry: a solo teacher pushes 1024/tick, which already
clears tier 1 (512) and exactly clears tier 2 (1024); a pair pushes 2048 and clears tier 3. Tier 4
costs 4096, tier 5 8192, tier 6 16384 — **above tier 3 the multiplier is live.** `teach-rate` is a
deep-teaching knob wearing a general one's clothes, and every measurement of it was taken on a
universe that had not got past tier 3. The measured +0.1–0.2% is correct and the conclusion drawn
from it is not.

## Other findings worth acting on

- **Library upkeep is the only drain that scales with success.** `LIBRARY_UPKEEP_PER_INSTANCE` = 2
  fp vellum **per instance per tick**, forever. It is charged before scribing, so a deep library can
  starve the scribes who would deepen it — precisely the "converter engine needs a dynamic friction"
  remedy `economy-flow-models.md` §6.3 asks for, already shipped and currently unnoticed because
  nothing writes books.
- **Scribing has two cost ladders and they differ.** Desk time is `1024 × tier` (**linear**); vellum
  is `node.scribeCost` = `512 × 2^tier` (**geometric**). Conflating them puts the vellum answer out
  by an order of magnitude at tier 5.
- **~13% of any population must farm before anything else happens.** One laborer produces
  `16 × 482/1024` = 7.53 fp food and subsistence is 1 fp per person per tick.
- **The economy axis raises the university need rather than relieving it** (28 → 55 across 0.5–2.5×).
  If economic growth is meant to *ease* the education problem, something must couple wealth to
  seats, and today nothing does.

## The forks I took, which are the author's to overturn

Stated rather than buried, per the brief:

1. **Fragility is measured without replenishment.** A node's extinction probability assumes nothing
   new is taught. This is the right question about a single point of failure and it overstates risk
   for a healthy discipline. The alternative — a birth-death process with teaching as births — is
   more faithful and much harder to read.
2. **The per-mage breadth cap is a scalar, not a graph.** Vision §4b's exclusions are structural;
   here they are "one mage holds at most `K` nodes". This gets the *magnitude* of the redundancy
   effect right and says nothing about *which* nodes cluster.
3. **Tier stands in for the prerequisite DAG.** See "what it does not model".
4. **The economic rate is one scalar** over inflow and carrying capacity together. Splitting food
   from vellum would let the model say "you are vellum-poor and food-rich", which it currently cannot.
5. **Orc prevalence = 0.02** quantifies "few orcs". The only invented prevalence used anywhere.

## Positive controls

`selftest` runs eight, and two exist specifically because an earlier draft of this model reported
confidently and wrongly:

- **The fragility check runs under a breadth cap**, because the uncapped version compares 0 against
  0 at every raid rate and proves nothing. A companion check asserts the cap is what does the work.
- **A Monte Carlo control on the raid arrival rate.** An earlier draft applied the renewal rate
  inside the model and the raw Bernoulli `p` inside the needs layer; the two disagreed by 5× at high
  `p`, and the needs layer reported every node 75% likely to be lost while the model it was reading
  had lost none. `effectiveRaidRate` is now one exported function used by both.
- `selftest` exits **42** — not 1 — when the reference universe is degenerate, so "the probe is
  broken" cannot be folded into "the answer is no".

The v1 rectangle's shape (12 cells / 51 nodes) and the cost ladder (all 300 nodes) are asserted at
load. If content moves, the model fails loudly rather than describing a grid that no longer exists.

## What to do next, in order

1. **Wire `scribingQueueDepth`.** The only unwired subsystem that changes the answer, and the one
   that gives raids something to destroy.
2. **Decide the per-mage breadth cap** (vision §4b) and author exclusion pairs *inside* the enabled
   cells. Until then breadth is free where the game is played, and no node can ever be at risk.
3. **Revisit the raid cooldown** if raids are meant to be an economic force. At 60 world ticks the
   arrival rate cannot exceed 0.167/yr however the god plays, and the whole raid axis is inert.
4. **Author tier-5+ content reachable by humans, or accept the ceiling.** Two v1 nodes are
   permanently out of a human universe's reach.
