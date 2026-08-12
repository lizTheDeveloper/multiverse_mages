<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The hard magic system, and why the species do not yet matter

**Status:** design synthesis. Everything here is extrapolated from `vision.md`, the authored content
data, and the voice-line banks. No new fiction is invented; the point is that the fiction and the
data already agree and the *rules* have not caught up.

## The problem, stated once

The game has **powers** — seventy grid cells, three hundred nodes, six species, three traditions —
and almost no **limitations that bite**. Sanderson's second law is the relevant one: a hard magic
system is interesting in proportion to its *limits*, not its abilities. Measured, this build has
one axis of play (how much magic you permit) and a win condition reachable by doing nothing.

Every trait that should create a limit is authored and inert.

## The traits are already there

`packages/content/data/species.json`, all `tuningStatus: "untuned"`:

| species | lifespan (months) | curiosity | retention | scribeAffinity | rediscovery | depth ceiling |
|---|---|---|---|---|---|---|
| orc | 720 | 384 | 896 | 384 | 512 | 3 |
| human | 960 | 1152 | 1024 | 1024 | 1024 | 4 |
| dwarf | 3000 | 512 | **1536** | **1792** | 768 | 5 |
| gnome | 4200 | **1792** | 512 | 896 | **1792** | 4 |
| elf | 8400 | 896 | 1280 | 1024 | 896 | 6 |
| draconic | **18000** | 256 | 1536 | 640 | 640 | **7** |

A twenty-five-fold spread in lifespan, and it currently changes nothing about what a universe knows.

## The barks already describe the mechanics

The voice banks are, read carefully, a specification. Each says what its species *does*:

- **dwarf** — *"Cross-referenced twice. The second one is for after the first one burns."* Redundancy
  against loss. *"It's in the index."*
- **gnome** — *"Do we know fire? We should know fire. Do we know fire?"* Poor retention, cheap
  rediscovery. The trait table agrees: retention 512, rediscovery 1792.
- **elf** — *"I have been mid-thought since a spring. Not this one."* Long, slow, single-threaded.
- **draconic** — *"I know it already."* Ancient, few, already deep.
- **human** — *"Three papers in progress. Two are the same paper. Just noticed that."* Volume,
  breadth, duplicated effort.
- **scribe** — *"Vellum's expensive. Nobody tells them that."* and *"This one's dwarven. It'll
  outlive us both."* Materials constrain scribing; **grimoire durability varies by species**.
- **laborer** — *"Materials are low."* / *"Another university? Where?"* Materials constrain building.
- **soldier** — *"The mages go through the portal. Someone's got to be on this side."*

## The loop that closes it

Knowledge has a **location** (§5): a mind, a grimoire, a library, or a memory palace. Specific mages
know specific spells — knowledge is individuated, not a global pool. That single fact, combined with
mortality and raids, is the whole hard magic system:

    research  ->  a specific mind holds a node
              ->  publish / scribe  ->  a grimoire holds it (costs materials)
              ->  shelve            ->  a library holds it (raid objective, burnable)
              ->  teach             ->  another mind holds it (needs a LIVING teacher)
              ->  raid              ->  the mind that holds it is at risk
              ->  return alive      ->  it teaches what it learned
              ->  die               ->  every node held ONLY there leaves the universe

**"But only if they make it home to teach."** That is the sentence the design turns on.

### Why this produces strategic variety rather than one best line

Each species is forced into a different answer to the same question — *where do you keep what you
know?* — and each answer is strong against a different threat:

- **Short-lived, fertile, curious (human, orc):** knowledge dies constantly to mortality, so it must
  be written down or taught away fast. That makes them **library-dependent**, which is exactly what a
  raid burns. Fast, broad, fragile.
- **Long-lived, few (elf, draconic):** knowledge is safe in minds for centuries, so libraries matter
  less and a burned library costs little. But few mages means each death is catastrophic, and low
  fertility means the loss is slow to replace. Resilient to fire, brittle to assassination.
- **Dwarf:** retention 1536 and scribe affinity 1792, and dwarven grimoires resist destruction. The
  archivist's actual mechanical niche — insurance, paid for in materials and slow research.
- **Gnome:** retention 512 and rediscovery 1792. Loses knowledge constantly and gets it back cheaply.
  The only species that can afford *not* to insure.

That is not a strength ordering. It is a set of trades against **different** threats, which is the
shape a game needs if "several viable playstyles" is to mean anything. It also gives the raid layer
something to arbitrate: burning a library hurts a human universe far more than a draconic one.

### What it costs the god

Every one of these routes spends a different resource, which is what makes them choices rather than
flavours: **materials** for grimoires and buildings (a universe can be knowledge-rich and unable to
write any of it down — §6a says so explicitly), **time** for teaching and research, **favor** for the
god's own interventions, and **risk** for sending a mage through a portal.

## What is actually missing — measured, and not what it first looked like

The mechanics above mostly **exist**. `subsystem.ts` has a mortality path that destroys everything a
dying mage held; `teaching.ts` exists; `scribing.ts` consumes materials and can refuse for
`insufficient-materials`. An earlier draft of this document said they were absent. They are not.

What the numbers say instead, from a 2400-tick run:

| | `passive-control` | `archivist` |
|---|---|---|
| nodes known | 51.0 | **51.0** |
| grimoires | 1156 | **4096** |
| library depth | 1.00 | 1.00 |
| knowledge instances | 2922 | 2738 |
| living mages | 71.5 | 68.3 |

The archivist's play *works*: it produces three and a half times the grimoires. And it buys
**nothing**, because those are redundant copies of the same fifty-one nodes.

Two facts explain the whole flat result:

1. **Nothing is ever the last copy.** Around 2900 instances spread over 51 nodes is roughly
   **fifty-five copies per node**. The loss channel is real and can never reach a last copy, so
   redundancy is free *and* worthless, `libraryDependence` sits near zero, and the dwarf's second
   cross-reference protects against a fire that cannot happen. Insurance has no value where there is
   no risk.
2. **The binding constraint on knowledge is the ruleset, not the economy.** Passive and archivist
   both plateau at 51 nodes; `permissive-breadth`, which does nothing but permit more cells, reaches
   217. What the god permits decides what can be known; everything else only makes copies.

So the missing pieces, in dependency order:

1. **Library depth must feed research rate** — §6a's compounding loop, *"the consequential one"*,
   genuinely unimplemented and being built separately. This is what makes a university worth funding
   for a reason other than worship.
2. **The loss channel must be able to reach a last copy.** Whether by fewer copies, faster decay, or
   raids that burn, `libraryDependence` has to be able to leave zero — otherwise the archivist, the
   dwarf's retention and the gnome's rediscovery are all insurance against nothing.
3. **Grimoire durability by species**, so *"it's dwarven, it'll outlive us both"* is mechanical
   rather than flavour — worth doing only after (2), for the same reason.

Item 1 is what makes universities matter. Item 2 is what makes the species table load-bearing. The
order is forced: durability and retention are meaningless until destruction is possible.

## The claim this design makes, and how it would be disproved

With mortality, teaching and scribing costs in place, the eight scripted strategies should stop
converging on the passive knowledge baseline of 51 nodes, and species composition should change
which strategy wins.

*Disproved by:* a 2400-tick sweep in which the per-strategy spread in nodes known is no wider than
it is today, or in which varying the founding species mix does not change the ranking of strategies.
If that happens, the loop is implemented but not load-bearing, and the magnitudes — not the
mechanics — are what is wrong.

## The honest caveat

Nothing above is measured yet. It is a reading of the vision, the content data and the voice banks
taken together, and it makes a prediction precisely so that it can be wrong.
