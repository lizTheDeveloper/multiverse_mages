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
