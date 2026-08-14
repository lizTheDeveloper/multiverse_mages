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

### No — the sun is reachable too, and that is the actual principle

*I wrote here that a god can shape the world and cannot stop the sun, and called it the right division.
The owner rejects it, and the rejection is a much stronger design law:*

> **"They should be magically doable. Anything the game can do, magic can do."**

**There is no engine-only layer.** Every state change the simulation is capable of performing is, in
principle, achievable by magic. **The sun's age is a variable, so some sufficiently deep magic can
change it.** Day length likewise. Territories, species, bodies, the shape of space — **if the code can
do it, a node can cause it.**

**That is a closure property, and it is the best design constraint in this document**, because:

- **It forbids the cheap move.** *"And this part is just the engine"* is how a game accumulates
  arbitrary walls, and the answer to *"why can't I do that?"* becomes *"because we didn't implement
  it"* rather than something in the fiction.
- **It gives the deep grid a purpose.** Tier 5 has fifteen nodes and **tier 6 has exactly one.** If the
  top of the grid is where cosmological magic lives, then depth means something specific — **the
  deepest cells are where the world's own parameters become editable**, and the ceiling stops being an
  abstract number.
- **And it makes `depthCeiling` a real species trait.** Draconic reaches 7 and orc reaches 3. Under
  this, that is not "dragons learn more" — it is **"only dragons can reach the magic that touches the
  sun."** Which is a much better reason for the trait to exist, and it gives the hardest species the
  most cosmological ceiling, which is the right shape.

### It is also checkable, which makes it an invariant rather than a slogan

`scripts/check-primitive-consumption.mjs` asks: *for each primitive, is there a path from an authored
node effect to something the simulation applies?* **This principle is the same question asked from the
other end:**

> **For every state mutation the engine performs, is there some authored node that could cause it?**

**That is a real check and this project already has the machinery to write it.** Anything the
simulation changes that no node can reach is either **a gap in the content** or **a place where the
engine is doing something the fiction cannot explain** — and both are worth knowing about.

It would have caught things this campaign found by hand: `fertility` and `lifespan` have **zero nodes
in the enabled cells**, so population is a thing the engine changes and magic cannot. **Under this
principle that is a defect, not a content-placement note.**

### What survives of the tension

The interesting limit is not *what* a god can reach but *what it costs and how deep it lies.* **The
sun should be reachable and nearly unreachable** — the deepest cell of the deepest technique, requiring
a species that can get there, in a world with enough magic left to power it.

**A god who can age the sun has earned a very great deal**, and in a late age, when magic is receding,
**it may be exactly the thing that is no longer possible.** That is a far better constraint than a
declared boundary: not *"you may not"*, but *"there is not enough magic left in the world for that
any more."*

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

---

## Body-shaping, and the ElfQuest reading of the whole arc

*Owner:* **"The elves in ElfQuest had spaceships. And could shape their bodies."**

**Both halves are load-bearing, and together they describe this design better than anything written
above.**

### The spaceship half: the deepest magic is indistinguishable from technology

ElfQuest's elves arrive in a ship, and their descendants know Recognition and shaping and that the
elders remembered more. **The ship is not a genre violation — it is the reveal that the fantasy was
always downstream of something else**, seen from the far end of a long decline.

**That is exactly the arc this design has been building without naming it**: magic recedes, knowledge
is lost, later peoples inherit fragments they can use but cannot explain. **The Wolfriders do not know
what a ship is.**

**So the game should not be shy at the top of the grid.** Tier 6 holds one node. If the deepest magic
is where the world's own parameters become editable, **it should read as technology** — the Box of
Ascendance can be a machine, and the Undying Lands can be somewhere you *go*.

**And it is the theme exactly.** *"Help humanity understand how hard it is to produce complex
technology"* — **ElfQuest is that story told backwards**, and both directions are the same story.

### The body-shaping half: what you do when you cannot fix the world

**This is the sharper of the two.** ElfQuest's elves shape flesh — their own and others' — and they do
it because they are strangers in a world that was not made for them.

**That is the desperate inverse of every world-shaping verb above.** Spawn Mountain, Create Ocean,
Create Biome: *change the world to suit your people.* **Body-shaping is: you cannot change the world,
so change your people to endure it.**

Which lands precisely on the arc:

    the sun ages · magic recedes · the world thins
        → you cannot stop it
        → you can still change what your people are

**So `Alter Species` is not only a power move — it is a survival move**, and it belongs in the same
family as the last-ditch ascension tactics: **the thing you reach for when the ordinary paths are
closing.** A people reshaped to survive a hotter sun is a very different ending from a people who
ascended, and both are better than dying.

**It also gives the two verbs a natural difficulty ordering.** Reshaping the world is what a strong god
does; reshaping a people is what a *desperate* one does — and a player who is doing the second has told
you something about their run without saying it.

### And body-shaping is inherently dual-use, which is where the dark magic lives

**ElfQuest is clear-eyed about this**: the same power heals and horrifies, and the difference is
entirely in who is doing it and to whom. Winnowill and a healer are the same magic.

**That is the best available home for the forbidden axis.** The forbidden-magic spec needed *"something
dark and twisted"* to be a thing a mage *does* rather than a flavour, and it noted that the game
currently has no way for a mage to do anything to the world at all.

**Body-shaping is a thing a mage does to a person**, and it is dark or not depending entirely on
consent and purpose — which means **the same node is a blessing or an atrocity by context**, not by
authoring. That is a far more interesting mechanic than a `forbidden: true` flag, and it is the first
proposal here where the *fiction* supplies the moral distinction the *data* cannot.

**Open, and it is the one I would most want measured:** whether a mage-scoped body-shaping magic and a
species-scoped one are the same mechanic at two scales — **`Shapeshift` and `Alter Species` as one
tier-progression rather than two verbs** — which would be tidy, and would mean the deepest form of a
healer's art is the power to change what a people is.

### And they landed on a world that already had a god

*Owner, completing the reading:* **"They landed on a world shortly after their own god maybe started to
wane — and on the world of man, who had their own god of magic."**

**This is the structural insight, and it changes the run loop.**

Every framing so far has had **one god per world**: a god is born, sets what magic can exist, ascends
or fades, and a new god follows. **ElfQuest's actual shape is two** — arrivals with a waning god,
landing in a world that already had one of its own.

### Which means a world can hold more than one god of magic

    a people's god begins to wane
        → the people go looking, or are sent, or flee
        → they arrive somewhere that already has a god
    → two gods of magic, one world, two systems of what magic can be

**That is the alliance mechanic seen properly.** Portalling to another people does not just import
academics — **it imports their god's ruleset.** The visitors' magic works because *their* god permitted
it, and yours did not.

**And it is what §3's Portal Rule has been describing all along**: a raid is arbitrated by the *host*
universe's ruleset, and `mvee`'s `foreignMagicPolicy` enumerates the four answers —
`compatible` · `hostile` · `incompatible` · `absorbs`. **Those are not four raid outcomes. They are
four answers to *what happens when another god's magic arrives in your world*.**

### It also explains the inheritance properly

The survivors who *"teach you Old Magic from the Last Age"* are not carrying orphaned knowledge. **They
are carrying their god's magic**, from a god who waned — which is why what survives is the practical
cells: **those are the ones that kept being useful after their god stopped being able to grant
anything new.**

**A waning god's people keep fire and bread.** Not because fire is simple, but because it is what they
still needed when the miracles stopped.

### And it makes later ages genuinely crowded

Under this, age six is not one god with five generations of history behind them. **It is a world with
several gods in it** — most waning, one new, each with a people who remember what their god's magic
could do.

**That is the multiverse premise arriving inside a single world**, and it is a much better answer to
"what makes later ages different" than a difficulty modifier. **The later world is not harder. It is
more crowded, more argued-over, and full of magic that obeys rules you did not write.**

**It is also where PvP finally has a reason to exist.** `contracts.md` §1.1 puts one universe per
simulation instance, and that constraint has blocked raids, alliances and the whole multiverse premise
all campaign. **Two gods in one world is a much smaller change than two simulated universes** — the
peoples share a world, the territories, the sun. **What differs is only whose ruleset their magic
answers to.**

**That may be the cheapest available route to the game's core promise**, and it should be costed
before anyone builds a second universe.
