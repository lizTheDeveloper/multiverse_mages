<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# A game about managing skills in a population

**Owner's design, 2026-08-14, recorded before implementation.** Measured references are against `main`
at `9cfe582`.

> *"There are so many mages in the real world. What we're doing is slapping on some of those things —
> about academia and skills. **It's a game about managing skills in a population**, because I'm a
> nerd."*

That sentence is the thesis, and it is worth putting at the top of a design file because the mechanics
below are only interesting if it is true.

## The real-world analogue, and why it is load-bearing

> *"Think about all of the skills required to produce chips: to mine silicon, to run those mines, to
> process them, to produce lithography machines. There's only like one company in the world that
> produces most of the supply chain of the big lithography machines. And then there's coders, and
> network engineers, and the people who make the grid itself."*

The chip supply chain is the model because it has the three properties the game wants and currently
lacks:

1. **Depth without breadth.** A lithography machine is not *more* of anything — it is a long chain of
   distinct skills, most of which are useless alone. A universe that has permitted everything has not
   thereby *made* anything.
2. **Single points of failure that are people, not buildings.** One firm in the world can do the hard
   step. In game terms: a skill held by three living mages, and a raid that kills two.
3. **The supporting cast is most of the cost.** Mines, grid, network, logistics. **Most mages are not
   archmages**, and the pyramid's base is what the peak stands on — which is the same finding the
   population design already reached from the other direction.

## The loop the design is aiming at

> *"You max out favor generation, because favor gives you the ability to turn on and off different
> forms of magic. It's just that if you turn off a form of magic that the economy is using, people
> will worship you less. There are ins and outs, and what we need to know is what those curves need to
> look like."*

    favor  →  permit / forbid magic  →  what the economy can do
      ↑                                          ↓
    worship  ←────────  daily usefulness  ←──────┘

**The tension is the game.** Permitting is how you grow; forbidding is how you steer; and both are
paid for out of a pool that the *economy's dependence on what you permitted* refills. Turning off a
school the populace relies on is not merely a lost option — it is a cut to the income that lets you
turn anything on.

Two pieces of this are already built and measured, and both are waiting on the same thing:

- **PR #63** implements daily-relevance worship — daily-useful magic yields **+48.8%** against
  spectacle's **+23.0%** — and reports itself *measurably inert* at a twelve-cell opening.
- **`GOAL.applyMagic`** (#127) is the verb that makes magic daily-useful, and its measured null has a
  content cause: **five of 59 `resource-yield` effects sit in enabled cells, all five route to stone,
  and stone buys nothing without a god action.**

**Neither is broken. Both are waiting on there being something worth casting at the bottom of the
tree.**

## What is being asked for: an abstract model that emits needs

> *"We really need to figure out at a high level what universities shape like, and what these things
> look like over a long period, using the **abstract concept of the raid given probabilities** and the
> **abstract concept of the economy**. Given different inputs and outputs, we need to be able to drain
> favor, mana — what are the things we need consistent drains on? Model those as just inputs and
> outputs and don't worry about the economy. **We can mock the economy.** Have it **emit needs** —
> what would we need to cut to make costs bite?"*

This is **not** the tick-level simulation and must not become it. It is a macro model:

- **Universities as a shape over time**, not as entities — intake, capacity, depth, output.
- **Raids as a probability**, not an engagement — a hazard rate against a roster, with an expected
  loss. The tick-level raid already exists and is instrumented; this does not need it.
- **The economy mocked** — inputs and outputs at the boundary, no goods, no stocks.
- **Drains as the free variables**: favor, mana, materials, *attention*. The model's job is to find
  where a drain has to bite for a configuration to be a decision rather than an accumulation.

**The output is a need, not a number.** *"For upkeep to matter at all, it must exceed X per standing
institution at population Y"* is the shape of a useful answer. That is a different deliverable from a
balance sweep, and it is much cheaper: it runs in seconds, not in 2400-tick arms.

### Why this is the right instrument now, with evidence

The campaign has spent itself repeatedly on levers that could not express themselves, and each time
the diagnosis arrived only after an expensive sweep:

- **No flat price binds the opening square** — a one-time toll is *arithmetically incapable* of beating
  a 70-favor ceiling over 2400 ticks (W169). **384 runs to learn a fact about arithmetic.**
- **`teachCost` 512 against a teaching pair pushing 2048/tick** — tiers 1–3 complete in one month at
  any multiplier, so `teach-rate` measured +0.2% while research measured +30.4%.
- **`researchCost` identical across all 300 nodes**, ties broken on alphabetical node id.

**A macro model would have caught all three in minutes**, because each is a statement about ranges
rather than about behaviour. That is the case for building it.

## The design goal it serves: a slow first age

> *"How do we make the first, lower-bound meta give you the space to have to figure out, as a player,
> what all your levers actually are — by having the game progress slowly? What does the early game of
> the first age of magic look like?"*

**Slow is the mechanism, not a side effect.** A player who can permit everything by year twenty never
discovers that permitting is a choice. The early game has to be poor enough that each unlock is felt,
and long enough that the consequences of a permit arrive after the decision — which is what makes it a
decision.

This is also the honest reading of the campaign's central failure. `permissive-breadth` dominated
because **breadth had no opposing term**; anti-requisites now supplies one on the content side (W168:
one authored pair takes its lead over passive control from **+33.1 nodes to +2.9**). A drain supplies
one on the resource side. **The first age is where both have to bite, because that is where the player
is still learning what the levers are.**

## Sequencing, from the owner

1. **Land anti-requisites completely.** In flight.
2. **Base the other explorations on that tree** — it changes the strategy space, so measurements taken
   before it are measurements of a different game.
3. **Then see which of the other explorations still matter.** Some may not.

## What is deliberately not decided here

The drain magnitudes, the hazard rate, the intake curve, and which resources drain at all. **The model
exists to propose those**, and proposing them in code before the model runs is how a placeholder
becomes a balance constant nobody remembers inventing.
