<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# What to take from the Grungeon Master guide, and what to refuse

*Status: nothing here is approved. Companion to `grungeon-master-guide.md`, which is itself
unapproved — `vision.md` is the vision of record and every item below should be argued against it
before it is argued about on its own terms. Compiled 2026-08-13.*

The guide is a catalogue of second-order consequences. This document sorts it against what the
campaign has actually measured, because the two documents disagree about what the game's problem is
and the campaign has numbers.

## The filter this document applies

`campaign-plan.md` records **five independent confirmations** that the binding constraint is content
exhaustion and the absence of opposing terms:

- W15 — a single fixed node ordering predicts each run's held set from its count alone;
  cross-strategy containment **1.000**.
- W13 — True Naming's 11.3× teaching buys **0.0 ±0.1** extra nodes known.
- W7 — the knowledge-capital loop moves rate, not ceiling.
- W17 — five of seven unrestricted strategies still hold all 51 reachable v1 nodes.
- Integration round 2 — **`permit-then-idle` wins 40/40**, beating the strategy that funds
  universities, blesses mages and encourages research.

And W24's rule, which is the general form of all of it:

> **"Without an opposing term siting is a ranking, not a decision."**

So the question asked of every guide entry here is not *"is this good worldbuilding"* — it is
uniformly good worldbuilding. It is: **does this add an opposing term, and can a sweep tell whether
it worked?** An entry that adds an output without adding a cost is a rate mechanic, and the
campaign's standing rule is *"stop building rate mechanics until the ceiling moves."*

## How each item was verified

Two branches, because `plan-w18` is docs-only and does not contain W7, W8 or W17:

| claim kind | branch | SHA |
|---|---|---|
| content data (`packages/content/data/*.json`) | `plan-w18` | `644090e` |
| code, and anything the campaign measured | `integration/campaign-round-3` | `4db13fb` |

Every item names the branch its `file:line` was read on. Where the two branches disagree the item
says so, because an item that is true on one and false on the other is a different item.

**One measurability caveat, applied throughout.** The v1 subset is `intellego · perdo · rego` ×
`mentem · terram · limen · nomen` — **51 nodes, no Creo, no Herbam, no Aquam, no Ignem**, and
`fertility` and `lifespan` appear in **zero** v1 nodes. Several of the guide's strongest economic
arguments are about Creo × Herbam/Aquam food and labour magic, which cannot be measured against v1
content at all. Those items are tagged **unmeasurable-in-v1** rather than dropped: they are
proposals for the subset widening, and pretending a sweep could falsify them today would make this
document's measurement discipline decorative.

## The list, in one table

Ordered by what the campaign's own evidence says is binding, not by episode number.

| # | what it does | episodes | blocked on |
|---|---|---|---|
| **S1** | founding knowledge becomes a direction, not a destination | 13, 29 | a mastery-growth path (C2) |
| **S2** | teaching gains an institutional boundary | 38 | — |
| **S3** | forbidding Intellego costs you population screening | 33 | — |
| **S4** | a second institutional growth axis: coordinated throughput | 41 | — |
| **S5** | economy effects gain a cost/displacement term | 09, 12, 15, 23, 32, 35, 41 | partly v1 content |
| **S6** | grimoire material modulates the now-live durability axis | 43 | copy counts (S7) |
| **S7** | fixed typed-material costs create hoards | 27 | — |
| **S8** | portal security as a recurring materials drain | 36 | — |
| **S9** | last-instance loss cascades instead of ending a bonus | 09, 15 | copy counts (S7) |
| **S10** | humans-recover-fastest as a balance assertion | 45 | — |
| **S11** | the versatility hegemony, now sharpened by W17 | 30 | — |
| **S12** | role assignment costs low-fertility species more | 46 | — |

| # | refused | episodes | on what ground |
|---|---|---|---|
| **A1** | library depth feeding worship | 14 | `capitalSnowball` already breaches its guard |
| **A2** | per-instance history fields | 04, 13, 46 | derived-never-cached; §1.5 fixes the record |
| **A3** | a parallel mundane-knowledge graph | 16 | adds content to an exhausted set; ungated by the ruleset |
| **A4** | creatures, ecologies, terrain | 11, 21, 47 | §7a — no world-scale geography |
| **A5** | "add a primitive" as the default move | ~12 entries | 16 primitives, 300 nodes untuned |
| **A6** | a fifth knowledge location gated by species | 22 | the four-hook cap; rescuable as a `store` hook |
| **A7** | texture re-read as mechanism | ~10 entries | the guide already says so |

---

# Suggestions

## S1 — Founding knowledge is blueprint-shaped; make it nudge-shaped

**Episodes 13 and 29.** Ep 13: the valuable import across a world boundary is a conceptual nudge,
not a finished technology. Ep 29: specialisation should be *sharp from the founding*, because the
god's choice of founding knowledge is the single most path-dependent decision in a university's
life.

**What the code does** (`integration/campaign-round-3`,
`packages/coordination/src/god/interventions.ts:604`): `grantPlan` creates a complete knowledge
instance at `locationKind: mind` with `mastery: grantMastery` (1024). The god hands over a
destination.

**Why this is the guide's highest-value entry.** Three independent sources converge on it. The two
episodes above, and — separately, from outside the guide — Round 3's two external reviewers, who
proposed the same shape unprompted: *"permission should be necessary but not sufficient… the fix is
not to delay the decision but to make it insufficient."* Integration round 2 then measured the
failure this repairs: `permit-then-idle` permits for 140 of 2,400 ticks, submits an empty preference
list forever, and **wins 40/40**. `grantFoundingKnowledge`, `fundUniversity` and `encourageResearch`
are worth slightly less than nothing.

**The shape.** A grant reduces research cost toward a cell's root nodes for the next N attempts
across the universe, and expires. §7 already calls the intervention *"the only way to introduce a
body of magic nobody in your world knows"* and `encourageResearch` a *research direction* — so this
is implementing the spec's own noun, not inventing a mechanic.

**And the interaction that must be answered first.** `grantPlan`'s docblock records why full mastery
is there: *"a grant at the research default would sit below the teach threshold and could never
leave the founder's head."* That is C2 — `DEFAULT_INITIAL_MASTERY` 256 against
`DEFAULT_TEACH_THRESHOLD` 512, with no path upward. A nudge-shaped grant produces a *researched*
node, born at 256, and W13 measured teaching **dead on schedule** under Vancian and Art of Memory
(0.0 lessons after tick 600). So a nudge without a mastery-growth path re-creates C2 through a
different door, in the two traditions out of three where it bites hardest. **S1 depends on a
mastery-growth mechanism; propose them together or not at all.**

**Falsifying measurement.** `permit-then-idle` stops matching `permissive-breadth`'s profile (231
nodes, apotheosis 6 / canon 6). If the two remain indistinguishable, permission is still sufficient
and the nudge did nothing.

## S2 — Teaching has no institutional boundary, so universities cannot diverge

**Episode 38** offers the traveling educator as a distinct diffusion mechanism, in tension with
institutional concentration.

**What the code does** (`integration/campaign-round-3`, `packages/coordination/src/gateway.ts:497`):
`teachableTo` walks `livingMages()` with **no affiliation test of any kind**, and returns the
**lowest node id** the pair admits — not the most valuable. `livingMages()` (`gateway.ts:950`)
truncates at `MAX_TEACHING_COUNTERPARTIES = 32`, taking the first 32 in component-store order.

So there is a bound, and it is worse than no bound for this purpose: **the teaching pool is the 32
lowest handles in the universe**, which is an arbitrary set with no institutional meaning. Every
mage is a traveling educator by default, and the thing they travel to is a performance constant.

**Why it matters.** Ep 38's tension cannot exist because only one side of it is implemented. More
concretely, this is why W24's siting result had nothing to bite on: W24 produced two universities
with genuinely different capabilities (library depth 22 against 19) and knowledge still could not
diverge, because knowledge is universally available to whoever is inside the arbitrary 32. A
university is not a container for anything.

**The shape.** Scope teaching to co-affiliates, and route cross-institution transfer through the
`affiliate` goal, which already exists (`rules-world/src/autonomy/affiliation.ts`) and already
completes in one tick with no travel state — so no position model is smuggled in.

**Falsifying measurement.** `universityProfile`'s `dominantCell`
(`rules-world/src/universities/profile.ts:120`) differs between two universities on the same seed.
Today it cannot, and vision §13 already records the symptom: **two distinct nodes against 1,263
books.**

## S3 — Forbidding Intellego should cost you the ability to screen your own population

**Episode 33.** Walls do not stop what looks human; the only screening is detection magic, and a
civilisation that forbids it is open regardless of fortification.

**What the code does** (`integration/campaign-round-3`): promotion is gated by species
`mageAptitude` and university `capacity` (`rules-world/src/mages/promotion.ts`,
`universities/capacity.ts`). **The ruleset touches neither.** Permitting or forbidding an axis
changes the spell list and nothing else about the civilisation.

**Why it is worth more than it looks.** This is the cheapest available opposing term on the *forbid*
verb, which is one half of the game's core verb and currently carries only opportunity cost. And it
lands inside v1: `intellego-mentem` is a v1 cell, so the measurement can actually run.

**Falsifying measurement.** A strategy that forbids Intellego separates from one that permits it on
mage count or promotion quality by > 3 SE. If it does not, the term is too small to be a decision.

## S4 — Universities have exactly one growth axis; ep 41 supplies a second

**Episode 41.** Coordinated simple operations produce output no individual could — the assembly
line's power is in the coordination, not the worker.

**What the code does** (`integration/campaign-round-3`, `rules-world/src/universities/capital.ts`):
library depth, via `LIBRARY_CONTRIBUTION`, is the only institutional growth axis.
`scribingThroughput` scales with scribe count × `scribeAffinity` (`universities/scribing.ts`), which
is the seed of the second axis but feeds only scribing.

**Why it matters for D9.** `laborAffinity` spans orc 1536 to draconic 512 and is read by materials
production and — as a self-described placeholder — raid combatant HP
(`rules-raid/src/combatants.ts:44`). A throughput axis gated on organising non-magical workers gives
a second shape of institution: deep-and-thin against shallow-and-wide. **A second axis is a
precondition for a second playstyle**, which is what D9 has failed on every measurement.

**Falsifying measurement.** Two strategies reach comparable achievement by different routes — one
high library depth, one high throughput — rather than one dominating. If throughput merely adds to
the same score, it is a rate mechanic and the standing rule refuses it.

## S5 — Every economy primitive is a pure bonus, and that is the general defect

**Episodes 09, 12, 15, 23, 32, 35, 41** — seven variations on one move: *the thing that raises
output also removes the role that used to produce it.* Ep 09's dependency ratio, ep 15's
caster-absence cascade, ep 23's collapsed guild bottom, ep 35's `replaces_role`, ep 41's
displacement.

**What the content does** (`plan-w18`, `packages/content/schema/node.schema.json`): an effect is
`{primitive, magnitude, target, durationTicks}` and **has no cost field at all**. Across 300
authored nodes: 59 `resource-yield`, 55 `research-rate`, 33 `build-rate` — every one a pure bonus.

**Why this is the entry that generalises.** Displacement is the reusable form of W24's
anti-correlated pair. W24 got its tradeoff by authoring `capacityPerLandUnit` to reward the good
site and `libraryUpkeepMultiplier` to punish it; an optional cost/displacement field on an effect
makes that pattern authorable **once, in data**, instead of as seven separate mechanics. That is
also the answer to the guide's habit of proposing a new primitive per episode (see A5).

**Measurability.** Partial. `build-rate` and `resource-yield` and `research-rate` all appear in v1
nodes, so displacement is measurable there. Eps 12, 15, 32 and 35 argue specifically about Creo ×
Herbam/Aquam food and labour magic — **unmeasurable-in-v1**, since the subset has neither Creo nor
those forms.

**Falsifying measurement.** A resource-yield-maximising strategy stops dominating on population. W24
already produced the shape by accident and flagged it for a ruling: population fell **18.4%** on the
better ground because students do not farm. That is displacement arriving unauthored; S5 is the
proposal to author it.

## S6 — Ep 43's maintenance is already built; the unbuilt half is the material axis

**Episode 43.** Knowledge carriers are physical objects with materials and upkeep.

**Half of this ships** (`integration/campaign-round-3`): `LIBRARY_UPKEEP_PER_INSTANCE`
(`universities/library.ts`) charges upkeep **on instances rather than distinct nodes** —
deliberately, so a second copy is never free — and `applyLibraryUpkeep` (`capital.ts:271`) degrades
instances on shortfall. W7 measured it flipping `narrow-depth` from 12/12 to **0/12** on Enduring
Canon. **Record this so nobody re-proposes it as new.**

**The unbuilt half.** `GrimoireRecord.durability` (`packages/state/src/components.ts:735`, both
branches) is written from `scribeAffinity` at scribing. Until W8 it was read by nothing. Now
`settleLibrary` decides loot survival with it — **orcish ~40%, dwarven ~90%** — which the campaign
records as *"the first time `scribeAffinity` has ever changed an outcome."*

**The shape.** A `material` tag on grimoires, modulating durability. This is the rare guide entry
that multiplies an axis that is **already live** rather than adding a dead one — which is exactly
why it is a suggestion and ep 22's tattoo location (A6) is not.

**Falsifying measurement.** Dwarven and orcish universities diverge on nodes retained after a raid
season. Currently they diverge on survival probability but the campaign measured **`nodesLost` at
0.00 for six of eight strategies**, because 50–80 copies per node means nothing is ever last — so
this item is blocked behind copy-count reduction and should say so.

## S7 — Ep 27's fixed material anchors, aimed at the concentration problem

**Episode 27.** Spells with fixed material costs anchor an economy; the powerful keep those
materials' value stable because they need them too.

**Why it targets a named open problem.** W8 landed raids and looting, and `nodesLost` stayed **0.00
for six of eight strategies**: *"Concentration, not the absence of a mechanism, is the remaining
problem."* Round 3's reviewers agreed unprompted — *"reduce copy counts to 1–3 per node; at 50–80,
burning a library is cosmetic."* Nodes demanding a fixed quantity of typed material create hoards,
and a hoard is concentrated by construction. It also gives raids a second objective layer beyond the
library.

**Scope.** The episode supplies its own warning and it should be honoured: at most a dozen nodes,
concentrated at high tier. *"Use sparingly — so it anchors without strangling."*

**Falsifying measurement.** `libraryDependence` leaves zero and stays there, and `nodesLost` becomes
non-zero for more than two strategies.

## S8 — Ep 36's portal security as a recurring materials drain

**Episode 36.** Every teleportation circle is an invasion vector; securing it costs materials,
labour and maintenance forever.

**What the code does** (`plan-w18`, `packages/content/data/primitive.json`): `portal` is `{stacking:
"presence", cap: none}` — a boolean gate, no upkeep, no counter-cost. Permitting Limen costs nothing
and buys raiding.

**Why now.** This is the "permission is sufficient" defect in its purest form, on the one cell the
whole raid layer depends on, and W16's bubble meta-game makes portal economics load-bearing rather
than flavour.

**Falsifying measurement.** `portal-rush` stops dominating raid-derived node gain without paying for
it. W8 measured its looting at **+4.3 SE on nodes**; integration round 2 measured the same arm at
**+1.0 against 2.09 SE** once W7's upkeep was present. So the term already interacts with an
existing drain, and that interaction is the thing to measure, not the drain alone.

## S9 — Ep 15's cascade and ep 09's dependency ratio, queued behind copy counts

**Episodes 09 and 15.** Losing the practitioner does not remove a bonus — it collapses the structure
that was scaled around the surplus, and the population freed from farming cannot instantly return.

**Why it is queued rather than proposed.** The mechanism is right and it cannot fire. At 50–80
copies per node nothing is ever the last instance, so a last-instance cascade is unreachable code.
**Do S7 first.** Recorded here so that when copy counts fall, the cascade is already specified.

**Measurability.** Ep 15 argues from Creo × Herbam — **unmeasurable-in-v1**. The mechanism
generalises to any `resource-yield` node, and v1 has five.

## S10 — Ep 45's human-adaptation claim, as a balance assertion rather than a mechanic

**Episode 45.** The species that thrives when the old order breaks is the one that spent generations
adapting under others; generalism is a survival strategy for the displaced, not a baseline.

**Why this one is unusual.** It proposes **no code**. It proposes a Monte Carlo assertion: after a
ruleset change, measure which species recovers research output fastest, and if it is not humans the
tuning is wrong. That is a falsifiable claim about existing primitives, which is precisely the form
`release-plan.md` asks every release to state.

**The related data claim** (`plan-w18`, `packages/content/data/species.json`): humans author
`affinities: {}` — no strength, no weakness — while every other species authors two or three. See
S11.

**Falsifying measurement.** The assertion is its own measurement, which is the point.

## S11 — The versatility hegemony is visible in the data, and W17 sharpened it

**Episode 30.** A species that is good enough at everything dominates without being best at
anything, and a harness that only measures depth will not see it.

**The data** (`plan-w18`, `species.json`): human is at or above baseline on curiosity (1152),
fertility (1280), learn rate (1024), retention (1024) and scribe affinity (1024), has the second
shortest maturity, and carries **`affinities: {}`**. W15 then measured gnome and human — sharing
only `depthCeiling: 4` — reaching the **identical 49-node set**.

**Branch-dependent, and it gets worse, not better.** On `plan-w18`, `affinities` is consumed by
nothing outside the loader (`content/src/load.ts:938`, `types.ts:117`) — inert for everyone. On
`integration/campaign-round-3`, W17 wired it into target selection through
`coordination/src/node-facets.ts` and `outlook.ts:110`. So affinities now **shape which nodes a
species reaches for** — and humans are the one species whose target selection has no shape at all.
An empty affinity map is not neutrality; under a value-sensitive acquirer it is the absence of a
preference while everyone else has one.

**Falsifying measurement.** Ep 30's own: cells-covered-competently per species, with a hegemony flag
above a threshold. Depth-only metrics cannot see this and that is the episode's argument.

## S12 — Ep 46's demographic trap: role assignment should cost low-fertility species more

**Episode 46.** The species most inclined to intervene is the species least able to replace its
losses; capability and fertility pull against each other.

**Why it is structural rather than a rate.** It changes *which choices a species can afford*, not
how fast it walks one path — which is the exact distinction Round 3's reviewers named as the blocker
for D9. Draconic fertility is **96** against orc **1536**, a 16× spread that currently expresses
only as slower population growth.

**Measurability.** `fertility` appears in **zero v1 nodes** and `lifespan` in zero, so no v1 ruleset
can move either. The trait itself is live in the populace layer, so the mechanism is measurable even
though no v1 magic can modulate it. Tag: measurable, but only against species mix, not against play.

**Falsifying measurement.** D7 — currently *"rate moves 1.000 → 0.350 → 0.000, winner identity
invariant."* Species mix must change **who wins**, not only how often.

---

# Antisuggestions

Each of these is a specific "possible move" from the guide that this project should refuse, with the
reason it fails rather than a verdict. They are written at the same length as the suggestions on
purpose: an unrecorded refusal gets re-proposed by the next reader, and several of these have
already been proposed twice.

## A1 — Ep 14's prestige loop: do not feed library depth into worship

**The guide proposes** making the prestige-to-worship link explicit — a worship-yield modifier
scaling with library depth — *"so the balance harness has a first-class knob on the compounding."*

**Refused, with a number.** `worshipTarget` (`integration/campaign-round-3`,
`coordination/src/god/worship.ts:125`) computes worship from mages, blessed mages, completed
universities and populace, and its own comment says: ***"Counts and one flag; deliberately no
knowledge."*** That exclusion is load-bearing. Integration round 2 measured **`capitalSnowball` at
0.4571 against the 0.35 guard its sibling is held to**, while `worshipSnowball` sits at **0.1028**.

So one of §6a's two compounding loops is already running hot and the other is not. Ep 14's move
couples them. §6a's warning is exactly this shape: *"two compounding loops that feed each other is
exactly the shape that produces runaway leaders."* The guide reasons from historical precedent that
the loop is real; the simulation reports that a version of it is already out of band.

**What survives.** The other half of ep 14 — a university as an expensive prestige *sink* whose
founding is political — is live and is S-shaped, not A-shaped. W24 built the mechanism (siting
changes outcomes measurably) and recorded that **the player cannot touch it**. That gap is worth
closing; the worship coupling is not.

## A2 — Per-instance history fields: `generation_count`, `host_familiarity`, curation memory

**The guide proposes** three variants of the same thing. Ep 04: a `generation_count` on knowledge
instances that increments on teaching, marking a node `traditional` after three generations. Ep 13:
a `host_familiarity` penalty on instances that crossed a portal, decaying as the university operates
under the host ruleset. Ep 46: on last-holder death, check whether a longer-lived species *ever*
held the node and weight rediscovery upward.

**Refused on the same ground each time.** `KnowledgeInstanceRecord` (`state/src/components.ts:892`,
both branches) is `{nodeId, locationKind, locationId, acquiredTick, mastery}` and `contracts.md`
§1.5 fixes it. More decisively, the codebase has a stated rule that these three violate: **derived,
never cached.** `dormancy.ts`'s docblock argues it at length and gives the concrete failure —
*"state is the thing that gets serialized, so a cached flag would be written into a snapshot beside
the ruleset it was derived from, and any disagreement between the two would be persisted, restored,
and carried forward forever."* `profile.ts` repeats it for university specialisation. Each of these
three fields is a history that only one code path maintains, and the symptom of a missed update is a
silently wrong number in a saved game rather than a crash.

**And ep 46's specifically.** The design already has exactly one ever-known bit — `wasEverKnown`
(`rules-magic/src/instances/subsystem.ts:233`), which drives 3× rediscovery. Ep 46 wants a second,
richer one: *which species* let it lapse. That is a per-node history keyed on species, maintained
forever, to modulate a cost. The existing bit does the work the design asked for.

## A3 — Ep 16's parallel mundane-knowledge graph

**The guide proposes** a `mundane_knowledge` data file parallel to the node graph — falconry,
husbandry, siegecraft — with the same teach/copy/lose operations and the same instance locations,
but requiring no permitted technique or form. The stated goal is to give orcs a cultural depth
ceiling that does not need magical depth.

**Refused for now, and the reason is a campaign rule rather than a design objection.** *"Stop adding
nodes to a set an idle bot already exhausts."* The v1 subset contains 51 nodes and an idle universe
learns all of them; W17 measured five of seven unrestricted strategies still holding all 51. Adding
a second graph adds content to a game whose measured defect is that content is exhausted, and it
would do so **outside the ruleset** — so the god's nineteen switches would not gate it, which
removes the one lever the campaign has measured as effective.

**Why it is worth keeping on the list anyway.** The motivation is real and it is D9's, not flavour:
orc plurality. `mageAptitude` 192 and `laborAffinity` 1536 describe a species the magic system has
almost nothing for. S4's throughput axis is the cheaper attempt at the same goal — it reuses the
populace layer that already exists instead of building a second knowledge model. Try S4 first; if
orcs still have one playstyle, ep 16 is the next proposal and it should be post-v1.

## A4 — Eps 11, 21, 47's creatures, ecologies and terrain

**The guide proposes** summoned creatures with utility functions derived from creator knowledge
depth (ep 11), closed ecologies with explicit waste consumers and raiders as ecological input (ep
21), and persistent magical threats modelled as terrain (ep 47).

**Refused on §7a.** *"The world is abstract. Raids are positional."* World-scale entities carry no
coordinates — `assertNoWorldPositions` enforces it, and W24 preserved it by siting universities as a
*relationship* (`university-site {kindId}`) rather than a coordinate, specifically so no function
anywhere takes or returns a distance. `affiliation.ts` refuses even a travel *duration* on the
grounds that *"a duration is a distance divided by a speed."* Ecologies and terrain are geography;
persistent creatures are entities the world scale does not carry.

**The one salvageable piece, and it is not a mechanic.** Ep 47's grid-territory view — rendering the
70 cells as live, dead and edict-modified so the god sees the shape their ruleset carved — is a good
idea and is **presentation**. `electron-client` is proposal-only and §12 puts the client out of v1
scope. File it there, not here.

## A5 — "Add a primitive" as the guide's default move

**The guide proposes** new primitives roughly a dozen times: `authenticate` (ep 27), `trigger` (ep
35), `yield-multiplier` (ep 15), a labor multiplier (ep 32), `coordination`/`throughput` (ep 41),
`displacement` (ep 41), `systemic_weight` (ep 46), `civilizational weight` (ep 32).

**Refused as a class, not individually.** There are **16 primitives**, and all **300 nodes are
`tuningStatus: "untuned"`** (`plan-w18`, `node.json`). `release-plan.md` makes even MINOR versions
mean "Monte Carlo baselines committed and green"; adding primitives before the existing sixteen are
tuned adds unswept axes to a harness that has not finished sweeping the ones it has. The campaign
already found what a partial sweep costs: `ascension-summit-cells = 13` was chosen by a scan
**missing a quarter of the strategy pool**.

**And most of them do not need to be primitives.** An effect is `{primitive, magnitude, target,
durationTicks}`. Ep 41's displacement, ep 35's `replaces_role`, ep 15's yield multiplier and ep 32's
labor multiplier are all *costs attached to an existing primitive's effect* — which is S5, one
optional field, authorable in data. Ep 27's `authenticate` and ep 35's `trigger` are genuinely new
semantics and are genuinely out of scope: §12 puts player-authored primitives out of v1, and a
trigger primitive is a script engine with a small cap on it, which the episode itself warns about.

**The exception that proves it.** S4 asks for a throughput axis. If it can be expressed by routing
`laborAffinity` into the existing capped accumulator the way `capital.ts` routes the library
contribution — *"there is no second cap, because two caps on the same quantity is how a rate ends up
at 4.0 × 2.0 without anyone deciding it should be 8.0"* — then it is not a new primitive and it is
admissible.

## A6 — Ep 22's tattoo location, and the fifth-location problem

**The guide proposes** a fifth knowledge location, `tattoo:<mageId>` — lootable from corpses,
persistent after death, one node per mage, gated to short-lived species.

**Refused on the four-hook cap, which is the more interesting reason.** §4a permits a tradition to
hook exactly four points, and *store* is the hook that decides where knowledge may live — that is
how the memory palace exists at all. A location gated on **species lifespan** rather than on the
store hook puts a second authority on the same question, and the two would disagree the first time a
short-lived species lived in an Art of Memory universe.

**How to rescue it, if it is wanted.** Express it as a `store` hook variant, not a species gate.
Then it is a tradition — "the Inscribed," say — and it inherits every property the cap exists to
protect: swept as one axis, confined to four extension points, and comparable against the three
traditions that ship. W13 already demonstrated the payoff of the store hook being the real axis: Art
of Memory was the **only arm with an in-band `ascensionRate` (0.1250)**, reached *"by the store
hook, not by any balance constant."*

**One warning attached.** Integration round 2 found that W6's canon predicate wants a written record
and a memory palace holds none, so Art of Memory went from the only in-band tradition to **the only
tradition that cannot ascend at all — 0 of 400**. ***"§4a's palace and §8a's canon are structurally
incompatible as implemented."*** Any new store hook inherits that collision, and it is on the
campaign's list as an author's call.

## A7 — The "contested" library, and other texture the guide already calls texture

**The guide itself marks these "texture, not mechanism"** — ep 01's infrastructure outliving its
purpose, ep 04's invisible labour, ep 11's populace displacement, ep 12's Intellego revealing rather
than creating, ep 15's feudal enchantment structure, ep 36's exclusive portal alliances, ep 38's
both entries, ep 41's haunted factory, ep 42's gregarious dwarves.

**Recorded here anyway, for one reason.** Texture entries are the ones most likely to be re-proposed
as mechanisms by a later reader who skims the heading and not the verdict. Ep 33's contested library
is the clearest case: the heading reads *"Abandoned libraries become hostile raid objectives, not
empty rooms"*, which sounds like a mechanic, and the body correctly concludes *"None — this is
texture."* The existing `library` location plus 3× rediscovery already model the shape.

**The general rule this document would like to state.** The guide's texture entries are its best
writing and its worst source of scope. They belong to `sound-design.md`, the voice-line banks, and
whatever the client eventually renders — not to the rules path. `hard-magic.md` already makes the
observation that matters here: *"the fiction and the data already agree and the rules have not
caught up."* More fiction does not close that gap.

---

## What this document does not settle

Three things below are the author's calls, not an agent's, and they are already on
`campaign-plan.md`'s open list. They are repeated here because the guide bears on each and its
bearing is the reason to decide:

- **Should species differ structurally, not just by rate?** S11, S12 and A6 are three candidate
  structures. The campaign's answer so far is that species differ structurally in **exactly one**
  respect — `scribeAffinity` deciding loot survival — and that respect went live only in W8.
- **Is 55 copies per node a magnitude problem or a structural one?** S6, S7 and S9 all block on it.
  Round 3's external reviewers said 1–3 copies without qualification.
- **Whether `durability` should resist looting as well as burning.** S6 assumes it eventually does;
  the spec says only that dwarven grimoires resist destruction.

And one thing this document asserts on its own: **the guide is a better source of opposing terms
than of mechanisms.** Every suggestion above that survived the filter did so because it takes
something away as well as giving something. Every antisuggestion failed because it gives without
taking, or because it caches a history, or because it adds content to a set that is already
exhausted.