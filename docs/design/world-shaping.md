<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# World-shaping: the verbs that change the world rather than the rules

*Proposal, 2026-08-13, from the owner:* **Create Biome · Spawn Mountain · Create Ocean · Alter Species
· Shapeshift.**

## The gap this names

**The god has sixteen actions and not one of them touches the world.** Permit, forbid, grant, bless,
found, fund, encourage, open a portal, declare ascension — **every verb is about magic, knowledge or
institutions.** The land, the peoples and their bodies are fixed at tick zero and never move again.

**These five are a different category: world-shaping rather than rule-setting**, and the game has none
of it.

## And they are far cheaper here than the names suggest

**Because there is no geometry.** `components.ts` §0: *"Only engagement entities have positions.
World-scale entities have no coordinates."* A territory is not terrain — it is
**`landUnits` and `capacityPerLandUnit`**, five of them, in a validated data file.

So:

| verb | what it actually is |
|---|---|
| **Create Biome** | a new territory record — the owner's phrasing, *"changing parameters on the generator"*, is literally what `territory.json` is |
| **Spawn Mountain** | a territory's parameters change: less capacity, more stone |
| **Create Ocean** | the same edit pointed the other way — capacity, food, and what forms are at home there |
| **Alter Species** | a `species.json` row changes **during a run** |
| **Shapeshift** | the same, scoped to one mage rather than a people |

**Four of the five are parameter edits to data the simulation already reads every tick.** No terrain
generation, no pathfinding, no voxels. **This is the payoff for the world being abstract**, and it is
the second time today that constraint has made an ambitious idea cheap.

## Why this fixes something the design actually needs

**W24 measured a real tradeoff between a river-delta and a highland-waste academy** — 818 population
and library depth 22 against 1,002 and 19, histories separating at tick 157 — and then found the player
**cannot exercise it even in principle**, because siting is a scenario decision rather than a play
decision.

**World-shaping is what makes siting a play decision.** Not *"choose where to build"* — **"make
somewhere worth building."** A god who spawns a mountain has authored the site their next university
will exploit, and the economy's three material kinds (`food`, `stone`, `vellum`) already denominate
what that changes.

## `Alter Species` is the radical one, and it deserves its own argument

**Changing a species mid-run is a much bigger idea than the other four**, and it lands directly on an
open problem.

Every species is `"tuningStatus": "untuned"`, and the campaign has repeatedly treated those numbers as
*designer* knobs. **This makes them god knobs.** Draconic fertility 96 against orc's 1,536 stops being
a balance figure and becomes **a thing the player can spend on.**

**It is also a second answer to "dragons have to make friends"** — and the two should not both be free:

- **Make friends**: cheap, social, uses the alliance mechanic, keeps the dragons dragons.
- **Alter the species**: expensive, permanent, and *changes what your people are.*

**A god who fixes draconic infertility by decree has solved the problem and lost something**, and the
game should say so. That is a genuinely interesting choice and it is exactly the kind this project has
been unable to produce.

**And it fits the fiction better than it has any right to.** A god of magic who reaches into a people
and changes what they are is doing the most god-like thing available — and *"they were never the same
after"* is a sentence a strategy game should be able to earn.

## Shapeshift, and why it is the smallest and possibly the best

**One mage, changed.** Not a people. It is `Alter Species` at the scope where the design has been
trying to get to all along — the sorcerer, the prodigy, **the individual who is different from her
people.**

It needs the same per-mage machinery that per-mage traditions need, which makes it a natural companion
rather than a separate cost.

## What this must not become

**A god who can reshape land, peoples and bodies is a god with no constraints**, and the whole design
rests on the god being *unable* to command directly. **The verbs must be expensive in the currency
that is already contested** — worship, which now buys tempo, width and suppression, and would buy
world-shaping as a fourth claim.

**Four claims on one pool is either a rich decision or an incoherent one**, and which it is should be
measured rather than assumed.

## Open, and none of it guessable

1. **Is world-shaping permanent?** A mountain that stays is a decision; one that decays is a spell.
   **Permanent is more interesting and much harder to balance.**
2. **Does altering a species affect the living, the unborn, or both?** *"Your children will be
   different"* and *"you are different now"* are completely different mechanics and different fictions.
3. **Can it be undone — and can an enemy do it to you?** A cult that alters your people is a horror
   the forbidden-magic spec would welcome.
4. **What does it cost?** Swept, with both ends as controls: free, so every god reshapes everything;
   and unaffordable, so the verbs are decoration.

---

## The cosmological scale: the sun ages, and the ages are why

*Owner, 2026-08-13:* **"Change The Age Of The Sun, Lengthen The Day — these things should happen as
ages wear on."**

**This is the layer above world-shaping, and it changes what an *age* is.**

Until now an age was a counter: age 1, age 6, more peoples, more Old Gods. **Under this, the world you
inherit is physically older.** The sun has aged. The days are longer. **Age six is not the same world
with more history — it is a different world, and it is running down.**

### It makes "before the sun swallows the earth" literal

That phrase was used to explain why draconic slowness is fatal — *"in order to ascend before the sun
swallows the earth they need to make friends."* **It was a metaphor for the run horizon. It should be
the mechanism.**

- **The sun ages across generations**, not within a run.
- **Each age is shorter, or harsher, or both** — a later world has less time and less margin.
- **And there is a last age.** The sun does eventually swallow the earth, and **no further ages
  happen.**

**That is a terminus the design did not have.** The run loop as written could cycle forever; this gives
the whole thing an end, and therefore a shape.

### Why this is the right escalation, and why it is not just difficulty

**It escalates the *world*, not the enemy.** The Old Gods accumulate because of what you failed to do;
the sun ages regardless. **One is authored by the player and one is not**, and a meta-progression needs
both — otherwise a perfect player faces a static universe forever.

**And it composes with the two accumulations already recorded**, giving three forces with different
authors:

| force | author | direction |
|---|---|---|
| **peoples** | you, by raising them | friendlier |
| **Old Gods** | you, by failing to finish them | more dangerous |
| **the sun** | nobody | less time |

**Three forces, two of them yours.** The third is what makes the first two matter — a world with
infinite time does not care how many allies you have.

### Mechanically it is a clock the simulation already has

`ERA_TICKS` is 240 and `sim-core` runs a **dual-scale clock**. The pieces for "an age is shorter than
the one before it" exist; what is missing is that **the age's parameters are currently constants rather
than a function of which age it is.**

**`Lengthen The Day` is the fine-grained version of the same idea** and it is the more interesting one
mechanically, because day length is *work per tick* — how much a mage gets done, how much a labourer
produces. **A longer day is not merely flavour: it changes every rate in the economy at once**, which
is a single lever with enormous reach and therefore one to be very careful with.

### The tension worth building on

**A god can shape the world; a god cannot stop the sun.**

**That is the right division and it should be enforced.** The world-shaping verbs above — mountains,
oceans, biomes, even altering a people — are all *within* an age. The cosmological scale is the thing a
god of magic **is not** in charge of, and the game is better for having a limit its most powerful verb
cannot reach.

**It also gives the last-ditch tactics their true stakes.** *A Portal To The Undying Lands* is not an
escape from a bad run — **it is an escape from a dying world**, and in a late age it may be the only
ending available to anyone.

### Open

1. **Does the sun age per generation, or per generation *survived*?** If a fast clean ascension ages it
   less, the player is racing the cosmos rather than the clock — **which is much more interesting**, and
   makes the peak-timing constraint cosmological rather than merely local.
2. **How many ages are there?** A known number is a campaign; an unknown one is dread. **Both are
   defensible and they are different games.**
3. **Does day length change within a run or only between?** Within is a live pressure a player watches;
   between is a starting condition they inherit. **Between is much easier to balance.**
4. **And what happens in the last age?** If the final world is unwinnable, it is a cutscene. **It should
   be the hardest one that can still be won** — which is a sweep, not a decision.
