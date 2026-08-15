<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The deep-magic set — 37 nodes for the late game and the prestige ladder

**Status: authored content, unapproved as design. Recorded 2026-08-14 on branch
`content/deep-magic` at `9b29e75`, measured against `c69690e`.** `vision.md` is the vision of
record. Nothing here amends it; §§ referenced below are arguments *against* it, in the sense
`grungeon-master-suggestions.md` uses.

## The filter this set was authored under

`grungeon-master-suggestions.md` applies one test to every proposal, and it is the campaign's, not
this document's:

> **Does this add an opposing term, and can a sweep tell whether it worked?**

with W24's general form: *"without an opposing term siting is a ranking, not a decision"*, and the
standing rule *"stop building rate mechanics until the ceiling moves."*

Most of the shipped tier-5 nodes are stacks of `research-rate` / `concealment` / `ward` with weird
prose on them — which is the rate mechanic the campaign says to stop building. So *weird* here means
**mechanically** weird: the node costs, excludes, ends, or forecloses something. Where a node's
opposing term is not yet expressible in the sixteen primitives, that is stated rather than papered
over — see [Machinery this set assumes and does not have](#machinery-this-set-assumes-and-does-not-have).

## What the deep grid looked like before

Max node tier per cell on `c69690e`:

```
            creo  inte  muto  perd  rego
animal         4     4     4     4     4
aquam          4     4     4     4     4
auram          4     4     4     4     4
herbam         4     4     4     4     4
ignem          4     4     4     4     4
imaginem       4     4     4     4     4
terram         4     3     4     4     4
corpus         5     4     5     4     5
mentem         4     4     4     5     4
vim            5     4     5     3     5
umbra          4     5     4     4     4
fatum          6     5     5     5     5
limen          4     4     4     4     5
nomen          4     4     5     4     4
```

**Thirty-five of seventy cells — every mundane form — had no summit at all.** All sixteen tier-5+
nodes lived in corpus / mentem / vim / umbra / fatum / limen / nomen. The deep grid asserted *the
late game is metaphysics*, and the unwritten weirdness was mundane magic taken to civilizational
depth.

## The eight groups

Thirty-seven nodes: 1 at tier 4, 21 at tier 5, 12 at tier 6, 3 at tier 7. Costs follow the shipped
curve exactly. Tier 7 extends it by the same doubling the lower rungs use
(`131072 / 32768 / 65536`); `rediscoveryMultiplier` holds at `8192`, as it already does between
tiers 5 and 6.

### A. Deep mundane magic — summits for cells that had none

| node | cell | the opposing term |
|---|---|---|
| The Kept Fire | rego-ignem | A permanent tax on the faculty, and an effect that can be **extinguished forever**. The node stays known; rediscovery does not apply. |
| The Universe as It Is Told | muto-imaginem | Curriculum throughput bought with fragility. Attacks `ages-of-magic` §2's college thesis rather than feeding it. |
| The Ledger Fire | perdo-herbam | Unmakes vellum — books — from outside the Mentem/Nomen theft cells, and **cannot tell whose**. A raid weapon with no aim. |
| The Draught of Common Knowledge | intellego-aquam | **Correlated loss.** Redundancy becomes fake: one Perdo Aquam raid takes the whole layer. Authored `metis`. |
| The Ash of the Art | perdo-vim | The scorched-earth defender wins a **smaller universe** every time. |
| The Long Survey | intellego-terram | The reading is **symmetric and permanent** — your archives become findable by anyone reading the same stone. |

### B. The three §4b mechanics, delivered as content

`vision.md` §4b decides three things that exist nowhere in code — `prerequisites` is the only
relation the content graph carries. Each is an **anti-requisite**, which is an opposing term by
construction.

- **The Name You Gave Up** (perdo-nomen) — unmakes your own true name. Untargetable, and **removed
  from the teaching graph**: cannot be taught, cannot be healed.
- **The Light With No Source** (creo-ignem) / **The Shadow With No Body** (creo-umbra) — §4b's
  *"light magic excludes dark magic"*, symmetric, with the reason running both ways: a scholar
  cannot hold both accounts of what throws a thing. A civilization can.
- **The Twelve-Handed Working** (creo-vim, tier 7) — uncastable by fewer than twelve, and not by
  twelve of one school. The first effect where **losing one mage is categorical** rather than a
  slowdown, which makes assassination a real raid objective.

### C. Third-age compounds

`ages-of-magic` §1 wants authored triples and there were none.

- **The Archivist That Is Not a Person** (creo-corpus) — saves your library and **freezes your
  frontier**. A direct opposing term against the `archivist` strategy, which F3 measured as
  indistinguishable from passive control.
- **The Weather That Is Argued With** (creo-auram) — **banked variance**: not removing risk,
  accumulating it where you can see it.
- **The Long Now** (muto-corpus) — the archmage who becomes a resource rather than a person.

### D. Summoning, deepened — the material axis

The shipped ladder topped out at magnitude 2048 with honest animals, corpses and bound things. This
walks outward by **what the summoned thing is made of**: breeding lineage → cast shade → being
looked at → burning itself → quarried stone → raw vis → a fate that has not happened → a true name
belonging to nothing here.

Each carries its own refusal. The shade servant stops at dusk; the servant made of seeing cannot be
sent anywhere nobody is; the thing that is only burning stops when the fuel does; the thing that
breeds true **cannot be unmade** four generations on.

### E. Strange materials

The substance economy above `food` / `stone` / `vellum`: the ore that was never mined, the page that
does not take fire, the substance of the word, and the material of what nearly happened — which is
abundant in a country that has had a hard century and **cannot be bought by a prosperous one**.

### F. Non-euclidean building

Space as a material. The hall larger than its walls, the corridor that is shorter inside, the
building with no outside — *"nothing that is in it is in your universe, which is discovered, always
late, to include the scholars"* — and the plan that holds the whole building, which gates the rest.

### G. Portal distance as unlikeness

Distance across the multiverse measured in **dissimilarity**: your own kind is near, kindred kinds
further, the genuinely strange at the far end. Four rungs, ending at The Far and Unlike (tier 7),
which is explicitly a list of destinations reachable only by a universe that has **already ascended
once** — the §8a/§8b ladder given a content spine.

### H. Hive minds

`rm-the-shared-mind` already existed at rego-mentem tier 4. This walks it outward: The Standing
Consensus (a university that stops needing a library and stops being able to disagree with itself),
The One Attention (`metis`; cannot be taught, cannot be raided for knowledge, ends all at once),
The Broken Consensus (perdo-mentem, the counter that exists because the hive exists), and The Mind
That Holds a Civilization (tier 7) — *"the last version of the oldest mistake, which is keeping the
only copy somewhere that can die."*

## What this measurably did

`npm run verify` is **red on 16 tests across 10 files**, out of 4,325. Every one is characterised
below and **none is a defect in the rules path**. Two are findings; the rest are count pins that
this content moved on purpose.

Measured on this worktree with `node_modules` installed (`npm ci` run — an uninstalled worktree
reports the whole repository broken, and this is not that).

### Finding 1 — `depthCeiling` stops being inert, which `vision.md` §13 asked for

§13 records, as an open item:

> **`depthCeiling` is close to inert in v1.** No v1 cell is authored past tier 5, so species with
> ceilings of 5, 6 and 7 — dwarf, elf and draconic — all reach 51 of 51. This is a content
> shortfall rather than a tuning one.

It is now a content *surplus*. `species-versatility.test.ts` measures:

| quantity | `c69690e` | this set |
|---|--:|--:|
| dwarf `exhaustibleCells` (ceiling 5) | 69 | **67** |
| draconic − dwarf, i.e. the ceiling's bite above 5 | 1 | **13** |

The trait separates thirteen cells' worth where it separated one. **The shortfall §13 names is
closed**, and the failing assertion is the tripwire that says so. `species-occupancy` moves for the
same reason (9 → 12 species at the ruleset ceiling).

### Finding 2 — reference-long-run 9.8's books-to-depth bound has fired

The bound is `grimoires < 4 × libraryDepth`, and its own comment calls it an empirical tripwire
widened *"to fit the new measurement with headroom, not doubled reflexively"*.

| | books | distinct nodes | ratio |
|---|--:|--:|--:|
| `c69690e` baseline | 140 | 46 | 3.04 |
| this set | 168 | 42 | **4.00** |

Exactly at the bound, so `expected 168 to be less than 168`.

**The cause was isolated by experiment, not inferred.** Removing only the twelve nodes authored into
**v1 cells** — and nothing else — returns the run to **140 books / 46 distinct nodes, identical to
baseline**. The other twenty-five nodes are provably inert here, because the reference universe only
plays the v1 subset.

So the mechanism is scope, not balance: this set grows the released v1 subset from **51 reachable
nodes to 63**. More v1 nodes means scribes spread across more targets, more duplicates accumulate
before upkeep's per-instance cost catches them, and depth falls slightly while book count rises.

One rival hypothesis was tested and **refuted**: raising `MAX_CANDIDATE_TARGETS` from 16 to 64 made
depth *worse* (42 → 38, books 164), so the bounded candidate window is not the cause. That change
was reverted and is not in the branch.

**The bound is deliberately not widened in this commit.** It is a tripwire that has fired, which is
information about how the economy scales with content, and adjusting the number to match is exactly
the "checked box that is false" the test's own module note warns against. Whether 4.0 is acceptable
is a balance decision, and it is the author's.

### The other 13 failures — count pins this content moved on purpose

| test | pin | now |
|---|---|---|
| `shipped-content`, `validation-cli` | 300 nodes | 337 |
| `interning` | interned integers, `contentRevision` digest | both shift; ids are position-dependent |
| `primitive-consumption` | grid scan count | 337 |
| `castable-nodes` | 48 concealment carriers | 59 |
| `frontier-scan-window` (×4) | 51 v1 nodes, 4 v1 tier-1 roots | 63, 5 |
| `species-versatility`, `species-occupancy` (×4) | see Finding 1 | — |
| `reference-recovery` | fertility recovery rate | moved with the v1 subset |

Each is a deliberate claim about the shipped content set, and each should be **re-pinned as a
reviewed diff** rather than regenerated silently. `npm run goldens:regen` was **not** run and must
not be — golden replay fixtures are determinism claims, categorically different from these.

## Machinery this set assumes and does not have

Authored as content because content is where this project puts things; **honest about which nodes
are currently prose over an approximated effect.** Five capabilities are assumed:

1. **Anti-requisites.** §4b's mutual exclusion, checked per mage. The content graph carries
   `prerequisites` and nothing else. Affects B1, B2 (Light/Shadow), and the school-diversity half
   of B3.
2. **Co-casting / ritual caster counts.** §4b's *"the deepest magic is cast by more than one
   mage"*. Nothing in any spec mentions it. Affects B3.
3. **A permanently-extinguishable effect,** and a store location kind for a thing that holds but
   cannot be taught from (`construct:<id>`). Affects A1 and C1.
4. **Correlated loss** — instances that die together rather than independently. Affects A4.
5. **Portal targets keyed by species/tradition distance.** §8b's bubble supplies `portalTargets`;
   the ladder in group G is a content spine for a mechanic `openspec/changes/colonization` has not
   scheduled. Affects all of G.

Until those exist, the nodes in question carry the nearest expressible effect and their **real**
mechanic lives in the gloss. That is a known gap, stated here so nobody reads the effect arrays as
the design.

## What is deliberately not claimed

- **That any of this is balanced.** Every node is `tuningStatus: "untuned"`, like all 300 before it.
- **That the ceiling moved.** The campaign's binding constraint is content exhaustion; this set adds
  content, which is necessary and not sufficient. Whether the *strategy space* gained an axis is a
  sweep result nobody has taken, and the honest measurement is a tournament at 2400 ticks against
  the pool, not the node count.
- **That the v1 subset should grow.** Twelve of these nodes landed in v1 cells and moved twelve
  tests. That may be exactly right — §13 wanted `depthCeiling` to bite — or it may belong behind the
  subset widening. **It is a release-scope decision and it is the author's**, which is why the
  measurement is above and the number is unchanged.

## The balance gates, which say more than the unit tests do

**Added 2026-08-14, same branch and same refs.** `npm run verify` never reaches these — it fails at
`npm run test` first — so they were run individually. All three fail, and the finding is not the
failure.

Every one reports `baseline-invalid` first:

> `provenance.contentHash` is `8a7688bf…` and the baseline was recorded at `162f80bf…`. The gate
> compares two runs of one build; across two builds a delta is not a regression, it is a category
> error.

The gate is right to say so, and the deltas below are read as **measurements**, not as regressions.
A content change necessarily invalidates a content-hashed baseline; re-recording is a deliberate act
under `packages/mc-harness/bin/regenerate-baseline.mjs` and is not done here.

### The short and horizon gates: the v1 subset got *harder*, not bigger

> **Framing corrected 2026-08-14, by the author's ruling.** This section originally reported the
> result below as a finding *against* the set — "content dilutes rather than accumulates" — on the
> campaign's standing reading that the binding constraint is content exhaustion. **That sign is
> wrong.** The author's design intent is the opposite: *"I wanted that more spells compete for the
> same finite research throughput. That's what I want, is for you to only be able to learn some of
> the deep magic, and for it to feel like you're maybe going to discover deep magic that no other
> player has found."*
>
> Scarcity of throughput against an abundant spell list **is the mechanic**. It is what makes
> acquisition a choice instead of a queue you walk to the end of. The numbers below are unchanged
> and were measured correctly; what changes is that a drop in `nodesKnown` against a larger
> catalogue is the intended shape, not a regression.
>
> **The caveat that survives the correction, and it is load-bearing.** Scarcity gives a universe a
> *stopping point*. It does not give two universes *different paths*. W15 measured cross-strategy
> containment at **1.000** — a single fixed node ordering predicts each run's held set from its
> count alone, on 65 of 84 runs — because `compareTargets` orders candidates by `remainingCost` then
> `nodeId` and the acquirer is **value-blind**. So more content today makes the shared queue longer
> without making it branch, and "magic no other player has found" is not reachable by authoring
> alone. It needs W15's fix, whose falsifiable test is already written: prefix fidelity below 0.7,
> dimensionality above 1, containment below 1.000, and gnome ≠ human.

| metric | gate | baseline | current | SE |
|---|---|--:|--:|--:|
| `referenceNodesKnown` | short (240t) | 17.06 | **14.95** | −19.2 |
| `referenceNodesKnown` | horizon (2400t) | 41.85 | **39.34** | −15.5 |
| `referenceKnowledgeInstances` | horizon | 1003.9 | **938.2** | −7.7 |

The v1 subset grew 51 → 63 reachable nodes and the reference universe **learns fewer of them**.
That is the opposite of the naive expectation and it is the single most useful number here: twelve
new v1 nodes are *competing for the same finite research and scribing throughput*, so the added
content dilutes rather than accumulates. Node count went up; knowledge went down.

This is exactly the shape `campaign-plan.md` keeps finding — the binding constraint is throughput
against an exhaustible list — and it is direct evidence that **adding content alone does not move
the ceiling**. The dilution is a real opposing term that nobody authored deliberately.

### The agency gate: the strategy space moved, and only at the top

`referenceNodesKnown` per strategy, 2400 ticks:

| strategy | baseline | current | verdict |
|---|--:|--:|---|
| `permissive-breadth` | 75.25 | **80.13** | up, +4.2 SE |
| `archivist` | 44.88 | 43.13 | flat |
| `portal-rush` | 46.13 | 44.13 | flat |
| `passive-control` | 42.13 | 40.38 | flat |
| `worship-maximizer` | 41.50 | 39.88 | flat |
| `uniform-random-legal` | 44.63 | 44.75 | flat |
| `denial-warden` | 4.75 | 4.38 | flat |
| `narrow-depth` | 7.63 | 7.63 | unmoved |

**The only strategy that gained is the one that permits the most magic.** Everything else is flat or
slightly down. F3's finding — *"the strategy space is one axis: permit more vs permit less"* — is
not contradicted by this content; it is **reinforced**, with the permissive end pulled further out.

The more interesting number is `referenceNodesGainedFinalQuarter`, up across the board
(`permissive-breadth` 17.1 → 23.0, +5.9 SE; `worship-maximizer` 5.9 → 7.9; `archivist` 5.9 → 7.3).
**The frontier is still open at the end of the run where it used to be closing.** That is precisely
the *unexhausted frontier* `ages-of-magic` §1 asks for, and it is the one thing measured here that
looks like the ceiling rather than the rate.

### What this means for the set

It sharpens the "what is deliberately not claimed" section rather than softening it.

- **Claimed and now measured:** the frontier stays open longer, at every strategy. That is a real
  result and the sweep found it.
- **Measured, and intended:** more nodes means *less* knowledge per run. Short and horizon gates both
  say the reference universe learns less — twelve v1 nodes cost 2.1 and 2.5 mean nodes known. Under
  the author's ruling above this is the mechanic working: a finite research throughput against a
  larger catalogue is what forces a universe to learn *some* of the deep magic rather than all of
  it. What it does **not** yet do is make two universes learn *different* some.
- **Unmoved:** the strategy space is still one axis. Seven of eight strategies did not separate.
  The nodes carrying the genuinely new opposing terms — anti-requisites, co-casting, correlated
  loss, permanent extinction — are exactly the ones whose machinery does not exist yet, so the sweep
  cannot see them. **This is the strongest argument in this document for building that machinery
  before authoring more content.**

## `depthCeiling` is a hard wall, and it locks humans out of the deep grid

**Added 2026-08-14, measured on this branch.** The author's constraint, stated directly: *"elves and
dragons and dwarves need to **get something** for long-term-ism"* and *"humans can of course play
long term ism."* Both must hold at once. As authored, this set satisfies the first and **breaks the
second**.

How many of the 37 new nodes each species can learn at all:

| species | `depthCeiling` | lifespan | reachable of 37 |
|---|--:|--:|--:|
| draconic | 7 | 1,500 y | **37** |
| elf | 6 | 700 y | **34** |
| dwarf | 5 | 250 y | **22** |
| human | 4 | 80 y | **1** |
| gnome | 4 | 350 y | **1** |
| orc | 3 | 60 y | **0** |

`depthCeiling` is not a rate. `packages/rules-world/src/autonomy/candidates.ts` gates an over-deep
node out of a mage's candidate list entirely — the `species-traits` spec's phrase is *"not a feasible
research or teaching target for that mage, **at any rate**."* A human cannot reach these nodes
slowly. She cannot reach them.

**So this set makes deep magic a racial permission rather than a strategy**, which is backwards from
the design intent, and it damages the divergence goal directly: if depth is species-gated, two human
universes discover the same shallow prefix and two draconic universes the same deep one, and
"magic no other player has found" collapses into a species lookup.

**The design already disagrees with the code.** `ages-of-magic.md` §2 is explicit that a fully
developed college is how the short-lived reach the deepest magic — *"throughput through the known"*,
compressing a novice's passage so she arrives at the frontier with working years left. A hard
per-mage ceiling makes that impossible in principle, whatever the college does.

**The shape this suggests, which is a proposal and not a ruling.** `depthCeiling` becomes the tier a
mage reaches *unaided*, and institutions lift it — library depth, a teacher who holds the
prerequisites, a co-casting group. Long life then buys **solitude** rather than a bigger number: a
dragon needs no institution and is robust; a human civilization needs one and is fragile, because
breaking the teaching chain loses the knowledge outright. Same summit, two roads, and the difference
between them is a real strategic axis rather than a stat comparison. It would also make
`The Twelve-Handed Working` and the collective-ritual nodes load-bearing instead of decorative:
they are the human road written down.

**Not built here, and it must be measured rather than asserted.** Before any such rule is claimed to
work, run it: can a human civilization actually reach tier 6 through teaching, and what does it cost
in mage-years? A road that exists on paper and not in a sweep is the failure mode this repository
documents most often.
