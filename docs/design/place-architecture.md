<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Place architecture, derived from the raid mechanics

*Status: design synthesis, nothing approved. This document invents no fiction and proposes no
mechanic. It reads the engagement layer as it is actually implemented and asks one question: **what
would people build, given that this is how attacking them works?** The answers are inputs to two
generators — the world-scale university readout and the raid battlefield — and they are answers a
reader can check against the code.*

**Read against:** `integration/campaign-round-3` (`4db13fb`) for all raid code, `plan-w18`
(`644090e`) for content data. `art-plan.md` §2 for style, which this document does not revisit.

---

## 0. Why derive it rather than draw it

The university readout is a **visual readout, not a mechanism** — a looping generative view of a
place the simulation models as counts and relationships. That freedom is exactly the danger. A
readout that is invented rather than derived will, sooner or later, show a fortress the mechanics do
not reward or a courtyard the mechanics would kill you for building, and a player who learns to read
it will have learned something false.

So the rule this document works to:

> **Every visual feature must name the mechanic it is a response to.** A feature that cannot name
> one is decoration, and decoration is allowed only where it is labelled as such.

The payoff is that the same derivation drives the raid-location generator. If the architecture is
derived from what the engagement code rewards, then buildings generated for a battlefield and
buildings drawn in a readout are the *same buildings*, without anyone maintaining two lists.

---

## 1. The mechanics that shape a building, read off the code

Every number below is authored content (`packages/content/data/raid-constant.json`), and every one
is `tuningStatus: untuned` — so the *shapes* here are stable and the *proportions* are provisional.
Reading fp values as metres (scale 1024):

| Constant | Value | Metres | What it constrains |
|---|--:|--:|---|
| `battlefield-extent` | 204800 | **200 m** | The whole field. Square. |
| `terrain-cell-size` | 10240 | **10 m** | The grid is **20 × 20 = 400 cells**. Nothing finer exists. |
| `cast-range` | 51200 | **50 m** | A quarter of the field. One number for every node. |
| `movement-per-tick` | 4096 | **4 m** | So crossing the field takes ~50 ticks. |
| `theft-range` | 16384 | **16 m** | Mind-reading is close work. |
| `objective-interaction-radius` | 8192 | **8 m** | You must stand *at* the thing. |
| `area-denial-radius` | 12288 | **12 m** | Roughly one terrain cell across. |
| `detachment-range` | 8192 | **8 m** | Soldiers have to close. |
| `deployment-zone-depth` | 40960 | **40 m** | Each side's band, measured from its own edge. |
| `portal-margin` | 8192 | **8 m** | How near the portal you must be to leave. |
| `max-combatants-per-side` | 32 | — | Two dozen-ish people, not an army. |
| `max-objectives-per-raid` | 6 | — | Six things worth crossing for. |

Five structural facts matter more than any of the magnitudes:

**1.1 — Sight is the master variable.** `hasLineOfSight` (`geometry.ts:223`) traces cells between
two points and returns false if any intermediate cell blocks. `chooseIntent` (`raid.ts:497`) will
not cast without `acquireTarget` returning someone, and `acquireTarget` requires range *and* sight.
**A combatant who cannot be seen cannot be shot at.** Every other conclusion in this document
descends from this one.

**1.2 — Impassable implies sight-blocking, but not the reverse.** `generateTerrain`
(`terrain.ts:105`) sets `blocksLineOfSight: impassable || blocking`, with the comment *"a boulder
you can see through is a boulder that is only in the way."* So the world has two kinds of cover:
**solid** (wall, rock — stops bodies and sight) and **visual** (woodland, ruin, smoke — stops sight
only). Architecturally these are different materials and they should look different.

**1.3 — Movement is a distance field, so enclosure is absolute.** `TerrainNavigator`
(`navigation.ts`) does breadth-first flood fill and steps strictly downhill. Its docblock records
what it replaced: two combatants swapping places for 2,400 ticks. The consequence for architecture:
**a maze does not slow an attacker down, it only lengthens the path** — and a genuinely sealed space
is not slow to reach, it is *unreachable*, which ends the raid on portal collapse. There is no
lock-picking and no door-breaking. A wall is either a detour or a full stop.

**1.4 — The attacker is on a clock and the defender is not.** `portal-stability-initial` is
3,072,000 decaying at 1,024/tick, so the *portal* lasts ~2,400–3,600 ticks — but that is the outer
bound, not the clock a raider actually runs on. A raider withdraws once she has been inside for
`withdraw-after-ticks` (56 engagement ticks), and measured raids resolve at a median of ~119.

*Corrected 2026-08-14, on `w182/raid-seam`.* This paragraph previously cited
`withdraw-stability-margin` (409,600 raw, "the last ~400 ticks"), which **could never fire**: it was
a threshold on *remaining* stability against a portal that outlives the raid twentyfold, so the
window opened two to three thousand ticks after every raid had ended. Measured: **0 of 169 raiders
withdrew across 97 raids**, and the stranded-raider rule took every survivor. See
`scripts/w182-withdrawal.mjs`.

The defender's win condition is still *survival*. **Delay is the defender's entire game**, and every
metre an attacker walks is a metre paid for out of a countdown — one that is now short enough to
actually bind.

**1.5 — Objectives are placed randomly in the defender's own band.** `placeInDefenderHalf`
(`objectives.ts:245`) draws a point in the far 40 m strip, retries up to 32 times for passability,
and falls back to the centre. **The defender does not currently choose where the library sits.**
That is the single largest gap between what the code does and what this document describes, and it
is flagged in §6 rather than hidden.

---

## 2. What a defender would actually build

Each subsection names the mechanic first and the architecture second. This is the order that keeps
the readout honest.

### 2.1 The long approach — because delay wins

*From 1.4 (the attacker's clock) and `movement-per-tick` = 4 m.*

The defender wins by lasting. Every wall that adds 40 m of path spends ten of the attacker's ticks
and costs the defender nothing after it is built. So the dominant defensive form is not a thick wall
— it is a **long** one.

**Visual consequence:** approaches are indirect by design. Walled switchback courts, a gatehouse
offset from the road so arrival requires a turn, causeways that run *along* a defended face rather
than at it. A university that has been raided should read as a place where you cannot walk straight
at anything.

This is the architecture of real fortification and it arrives here for the real reason — not because
castles look like that, but because `stability-decay-per-tick` is unconditional.

### 2.2 Sightlines cut *inward*, never outward

*From 1.1 (sight gates casting) and `cast-range` = 50 m.*

This is the point the Grungeon Master episode on countering casters gets to from the other end, and
the code agrees with it: a defender who cannot see out cannot cast out, and 50 m of clear sight is
worth more than any wall.

But the same clear ground serves the attacker, symmetrically — `cast-range` is one number for both
sides. So the resolved form is **asymmetric sight**: the defender wants to see a long way along
*prepared* lines and nowhere else.

**Visual consequence:** killing grounds, not open fields. Long narrow courts with a defended end.
Embrasures and slots rather than windows — a wall pierced exactly where a defender wants a lane and
solid everywhere else. Cleared ground immediately outside the walls (no cover within ~50 m), which
in a readout reads as a **conspicuously bare apron** around a dense interior. The bare apron is the
most legible single tell that a place expects to be attacked.

### 2.3 The library is buried, and the university is not

*From 1.5 (objectives are placed in the defender's band), `objective-interaction-radius` = 8 m, and
the objective value table.*

A library's value is `objective-value-per-instance` (fp 1) per instance plus
  `objective-value-per-tier` (fp 0.25) summed over depth. A university is a flat fp 2, an archmage
  fp
4. **A deep library is worth vastly more than the building around it** — a 200-instance library
  outweighs every other objective on the field combined.

And an attacker must stand within 8 m of it to do anything at all.

**Visual consequence:** the two functions separate. Teaching halls are where the light and the
people are — wide, windowed, on the outside. The library is **inward, low, and hard**: vaulted, few
approaches, ideally beneath. The visible grandeur and the actual value sit in different parts of the
building, and that is not decoration, it is the value table.

The `art-plan.md` §3.3 asset list already anticipates this — *"Library, burned"* is named as the
emotional core of the game. This section says where it sits before it burns.

### 2.4 Fire is the design constraint on materials

*From `settleLibrary`'s durability roll and `grimoire-burn-resist-cap` = 922 (fp 0.90).*

A looted book leaves; a burned one is gone. Durability comes from the scribe's species affinity —
orcish books survive ~40% of attempts, dwarven ~90%, capped so nothing is fireproof.

**Visual consequence:** every knowledge-holding structure is built in incombustible materials and
compartmented against fire. Stone vaults rather than timber floors. Iron doors on the book rooms.
Bays separated by solid cross-walls, so a fire started in one takes one. Water kept close — cisterns
and channels, which on a `river-delta` site is trivial and on `highland-waste` is a built structure
in its own right.

**And this is the axis where species must visibly differ**, because it is the one structural species
axis in the whole game that is measurably live (see `grungeon-master-suggestions.md` S6). A dwarven
library is over-engineered against a threat it will mostly survive; an orcish one is built knowing
the books will not survive, so its architecture invests in *dispersal* — many small caches — rather
than in one strong vault.

### 2.5 Rooms sized against area-denial, and no great halls

*From `area-denial-radius` = 12 m against `terrain-cell-size` = 10 m.*

An area-denial field is about one terrain cell across. A space wider than ~12 m lets a single effect
cover everyone in it.

**Visual consequence:** interiors are **compartmented on a roughly 10 m module** — the same module
as the terrain grid, which is convenient for the generator and not a coincidence, since the grid is
what the simulation can represent. Cloisters, cells, bays, aisles. Where a big volume is wanted, it
is broken by arcades and piers, which are visual cover (1.2) that does not stop movement.

Note the tension with 2.2 and resolve it explicitly: **long sight, small rooms.** A colonnaded
cloister gives both — sight down the arcade, cover behind every pier.

### 2.6 The mage's tower is a mistake, and should look like one

*From 1.1, 1.3 and `cast-range` = 50 m.*

A caster's advantages are range, sight, and mobility. A small enclosed room forfeits all three: no
sight lines, no room to blink, and (1.3) a single approach means the distance field funnels every
attacker to one door. The Grungeon Master's version — *"putting yourself in a small room is the
exact way that you counteract every single one of those things"* — is exactly what this code
implements.

**Visual consequence, and it is a storytelling opportunity rather than a rule:** towers exist, and
they are **old**. They are what mages built before anyone had been raided, and they persist because
buildings outlive their reasons. A universe that has never been raided is all towers and courtyards;
one that has been raided repeatedly has towers with their bases thickened, their doors moved, their
windows filled in, and new low vaulted work sprawling around them.

**That difference is the readout's best single signal**, and it is derived, not invented: raid
history is real state.

### 2.7 The portal is the front door and it is always in the same place

*From `raid.ts:260` — the portal spawns at `{x: extent/2, y: 0}`, the middle of the attacker's edge
— and `portal-margin` = 8 m.*

Attackers arrive at a fixed point relative to the field and must return to within 8 m of it to
leave. That makes the ground near it the most contested ground in the raid, twice.

**Visual consequence:** the defender knows where portals open the way a coastal town knows where
ships land. Expect prepared ground on that face — the bare apron of 2.2 at its widest, standing
positions, and the one place where a defender would accept an open field.

**A caveat this document must not paper over:** a fixed portal point is a property of the current
implementation, not a stated design rule, and `raid-engagement` is 0.9.0 and not started. If portals
later open anywhere, 2.7 weakens to "the defender prepares several faces" and the rest of this
document is unaffected.

### 2.8 Where the people live, and why it is separate

*From `detachment-strength` = 100 people per detachment and §1.3's aggregated populace.*

Soldiers come from populace cohorts in hundreds; scribes and labourers are counts, not entities. The
populace is the bulk of the universe and it is not what a raid is for — the six objectives are
libraries, universities and an archmage.

**Visual consequence:** the settlement is **outside** the defended core and is not itself defended.
Workshops, scriptoria, housing, fields. This is uncomfortable and it is correct: it is what a place
looks like when the valuable thing is knowledge and the people are what produce it. In a raid the
town is walked through, not fought over.

---

## 3. The five site kinds, as architecture

W24 made siting real (`university-site {kindId}`), and it is a *relationship*, never a coordinate —
`assertNoWorldPositions` still passes and no function anywhere takes or returns a distance. The five
kinds are authored in `territory.json`, and on `integration/campaign-round-3` each carries a
`libraryUpkeepMultiplier` that is deliberately **anti-correlated** with its capacity.

| Site | capacity/land | upkeep × | The architecture that follows |
|---|--:|--:|---|
| **River Delta** | 40960 | **2048** | Rich, crowded, and *wet*. Books rot. Raised vaults, cisterns as a defensive asset, water as both moat and enemy. The gloss on round-3 says it: *"the same water that feeds the harvests takes the books back a page at a time."* |
| **Arable Lowland** | 20480 | 1024 | The baseline against which every other kind is measured. Nothing dramatic — the ordinary, legible, walled campus. |
| **Upland Pasture** | 6144 | 896 | Thin population, dry air, good books. Spread out, low, few people to defend it. |
| **Deep Forest** | 3072 | 1280 | Timber everywhere, which is a fire problem (2.4) and free visual cover (1.2). Cleared apron matters most here and is hardest to keep. |
| **Highland Waste** | 512 | **512** | Almost nobody, and the best archive conditions in the game. Cut into rock. The fortress-monastery, and mechanically the *correct* place to put a library. |

Two things to notice, because they are the design working:

- **The best archive site is the worst settlement site,** by authored construction. That is W24's
  anti-correlated pair, and it means a universe must choose between a big civilization and a durable
  one. The architecture makes the choice visible without a number: highland places look austere and
  under-populated because they *are*.
- **The delta's problem and the forest's problem are different problems** — damp against fire — and
  should not resolve to the same silhouette.

---

## 4. What the university readout should show

The brief is a looping generative view. Making it a *readout* rather than an illustration means
every varying feature is bound to state the simulation actually holds. Everything in the left column
below is a real field.

| State | Where to read it | What varies visually |
|---|---|---|
| `buildProgress` | `UniversityRecord` | Three build states — foundation, partial, complete. Already in `art-plan.md` §3.3. |
| Library **depth** | `libraryDepth().cumulativeByTier` | Mass and height of the vault. Shallow reads as one bay; deep as a compartmented range. |
| Library **instance count** | `libraryDepth().instanceCount` | Shelf fill, distinct from depth. Two copies of one node is *upkeep* without *capability* — the readout can show a crowded shallow library, which is exactly the archivist's failure mode. |
| Site kind | `university-site {kindId}` | The §3 table. Ground, material, water, and how much cleared apron is plausible. |
| Dominant cell | `universityProfile()` → `dominantCell` | Form hue on the glazing and banners, per `art-plan.md` §2 (one signature hue per form, never lent). |
| Species mix of staff | populace cohorts | Masonry idiom, and the 2.4 fire strategy: dwarven vault against orcish dispersal. |
| **Raid history** | objective status, past outcomes | 2.6's whole argument. Thickened bases, filled windows, new low work. **The best signal on this list.** |
| Scribe count | cohort by occupation | Scriptorium activity in the loop — the animation, not the building. |
| `libraryDependence` | derived, §7 metric | See below. |

**One readout element that would do real work.** `sound-design.md` §8.2 already makes
`libraryDependence` audible — a mage holding the only instance of a node gets a distinct selection
line, *"quietly horrifying to hear."* The visual counterpart is a **single-copy shelf that reads as
fragile**: one book where there should be a run. It costs one asset variant and it makes the game's
central fear visible in the idle loop.

**And what the readout must not do:** it must not imply capabilities the simulation does not model.
No defenders visibly patrolling a wall (there is no world-scale combat), no visible distances
between institutions (§7a), and no depiction of a university as *placed* relative to another. A
readout is a portrait of one institution, never a map.

---

## 5. The raid-location generator

The point of deriving §2 is that these rules go straight into terrain generation. Today
`generateTerrain` rolls each of 400 cells independently — `impassable` at fp 82 (~8%), `blocking` at
fp 154 (~15%), `rough` at fp 205 (~20%) — which produces **noise, not architecture**. It is honest
placeholder terrain and it is why the battlefield currently has no places in it.

This section is written as constraints and an ordering, not as an algorithm. The constraints are the
part that must survive; the ordering is one way to satisfy them and a reviewer should feel free to
replace it.

### 5.1 Five hard constraints, and one of them is expensive to get wrong

**C1 — Pure function of `(raidSeed, tuning)`.** `terrain.ts` states it: terrain is regenerated,
never persisted, *"so it cannot drift from what was stored."* A structure generator that needed to
remember anything between raids would break the property that makes replay work.

**C2 — Per-cell insertion invariance, and this is the expensive one.** Each cell draws from
`rng.actorStream(RNG_STREAM.terrain, 0, index)` — its **own** stream, keyed on its linear index — so
that adding a fourth property appends a draw and leaves the first three where they were. The
registry (`sim-core/src/rng/streams.ts:47`) reserves stream 11 for *"terrain generation and
combatant deployment"* and stream 10 for *"objective and raid generation"*.

A generator that walks one stream across the grid re-rolls **every cell downstream of the first
change**, and with it every committed raid baseline. The temptation is real, because structures are
naturally described by an algorithm that walks — "trace a wall from here to here" — and walking a
stream is the obvious way to write that. **Do not.** The shape that satisfies C2 is:

> Decide the *layout* from a small number of draws taken on a stream keyed by a layout ordinal, then
> make every cell's contents a **pure function of the layout and the cell's own index**, with any
> remaining randomness drawn on that cell's own stream.

So the wall is not traced. The wall is a predicate: given the layout parameters, `isWall(index)`
answers without reference to any other cell.

**C3 — Every objective must remain reachable from every deployment cell.** §1.3: an enclosed
objective is not slow to reach, it is unreachable, and the raid then runs to portal collapse
producing a metric about nothing. This is the failure `TerrainNavigator` was written to remove and a
structure generator is the most likely way to reintroduce it.

**C4 — 20 × 20 is the whole resolution.** A wall is one cell — 10 m — thick, because nothing thinner
exists. Architecture here is *massing*. Detail belongs to the sprite layer, which is free to draw a
1-cell wall as a gatehouse with a portcullis.

**C5 — Structures may not move the objectives.** `placeInDefenderHalf` already places them, on
stream 10, keyed by ordinal. If the generator relocated objectives to suit its buildings it would
change what raids are about, which is a design decision and not a terrain one. **The buildings go
where the objectives are, not the reverse** — which is also the honest reading of §6's gap: until
the defender can site anything, the architecture is fitted around a random placement.

### 5.2 An ordering that satisfies them

Six phases. Each names the constraint it is respecting and the §2 rule it implements. Phases 2–6 are
each a pure predicate over `(layout, cellIndex)`, per C2.

| # | Phase | Draws | Implements |
|---|---|---|---|
| 0 | **Read the objectives** | none — they already exist | C5 |
| 1 | **Choose a layout** | a few, on a layout-ordinal stream | — |
| 2 | **Vault shells** around library objectives | none | 2.3, 2.4 |
| 3 | **Perimeter** enclosing the objective cluster, with gates | none | 2.1, 2.2 |
| 4 | **Apron** — forced-ordinary ring outside the perimeter | none | 2.2 |
| 5 | **Interior** compartments and colonnades | per-cell | 2.5 |
| 6 | **Everything else** — the existing noise roll | per-cell, unchanged | — |

Phase 1's layout is a small record, and keeping it small is what keeps the generator legible:
perimeter inset, gate count (1–2) and gate positions, whether the vault is surface or sunk, interior
module offset. Every later phase reads it and no later phase draws from it.

Phase 6 matters more than it looks: **cells no structure claims keep their current roll, taken on
their own stream, in the current draw order.** That is what makes this an *addition* to the
generator rather than a replacement, and it is the difference between a diff a reviewer can reason
about and a new map.

### 5.3 The cell vocabulary, and the one addition worth making

`TerrainCell` is `{passable, blocksLineOfSight, moveCost}`, and the current generator produces three
combinations of the first two. Architecture needs a fourth, and it is already representable:

| Kind | passable | blocks | Architecture | From |
|---|---|---|---|---|
| ordinary | ✓ | ✗ | courtyard, apron, field | — |
| rough | ✓ | ✗ (half move) | rubble, marsh, scree | site kind, §3 |
| **solid** | ✗ | ✓ | wall, vault shell, rock | 1.2 |
| **screen** | ✓ | **✓** | colonnade, arcade, ruin, standing timber | 1.2, 2.5 |

**The screen cell is the generator's most valuable output and it needs no schema change** — it is
`impassable: false, blocking: true`, which `generateTerrain` already produces whenever the blocking
roll passes and the impassable one does not. What changes is that it stops being an accident of two
independent rolls and becomes a thing the generator *places*: an arcade is a line of screens, and it
gives 2.5 its resolution of "long sight, small rooms" in one cell type.

### 5.4 How the perimeter stays passable

C3's repair, stated concretely because "add a reachability check" is not an instruction.

The perimeter is a rectangle of solid cells with **1–2 gate cells** left ordinary. Gates are chosen
in phase 1, so gate positions are layout, not cell state. That alone does not guarantee C3: a gate
can open onto a cell the base noise roll made impassable, and a vault approach can be blocked the
same way.

So structure phases have **priority over noise**: a cell claimed as a gate or a vault approach is
forced ordinary in phase 6, overriding whatever the per-cell roll said. This keeps C2 — the roll
still happens on the same stream in the same order, it is simply not used for that cell — and it
means reachability is *structural* rather than checked-and-repaired.

Then one assertion, as a test rather than as runtime logic: **flood-fill from the attacker's
deployment band reaches every objective cell.** If it ever fails, the layout is the bug, and the
fallback is the one the codebase already uses in two places — a bounded number of layout attempts,
then a fixed degenerate layout (no perimeter) that is guaranteed passable. `placeInDefenderHalf`'s
32-attempts-then-centre is the precedent to copy, including its comment about why the search is
bounded.

### 5.5 The derived shapes

Each traceable to §2, and each expressible as a predicate over the layout.

| Feature | Cells | From |
|---|---|---|
| Perimeter wall with **one or two** gates | solid ring, ordinary gaps | 2.1 delay, 2.2 asymmetric sight |
| Cleared apron outside it | forced-ordinary ring | 2.2 — the tell that reads at a glance |
| Compartmented interior on the 10 m module | solid/screen mix | 2.5 area-denial |
| Colonnade or arcade | **screen** | 2.5, and the material distinction from 1.2 |
| Vault shell at a library objective | solid, 1–2 ordinary approaches | 2.3, 2.4 |
| Open prepared ground at the portal face | forced-ordinary | 2.7 |
| Unwalled settlement between portal and walls | scattered screen | 2.8 |

### 5.6 What to test, and the one test that is the whole claim

Three properties, in the order they should be written:

1. **Determinism and invariance.** Same seed and tuning gives the same grid; adding a structure
  phase leaves unclaimed cells byte-identical to the current generator. This is C1 and C2, and it is
  the test that protects the baselines.
2. **Reachability.** Flood-fill from every deployment cell reaches every objective, over a large
  sweep of seeds. This is C3.
3. **The approach is longer.** Mean path length from the attacker's band to the highest-value
  objective is **greater on structured terrain than on noise terrain**, at the same seeds.

The third is the whole claim. §2.1 says the defender's game is delay; if structured terrain does not
lengthen the approach, then the generator has produced prettier noise and implemented nothing. It is
also the property most likely to fail in a way that looks like success — a perimeter with two gates
on opposite faces can *shorten* the mean path by funnelling attackers onto a straight line to the
objective, which is exactly the "ranking, not a decision" failure W24 warns about, arriving in a
different layer.

**And a caution about measuring it.** Path length is a proxy for ticks, not ticks. The honest
version measures **engagement ticks to first objective contact** over a seed sweep, because that is
what `stability-decay-per-tick` actually spends. A path-length test is the cheap approximation and
should say so where it is written.

### 5.7 What this does not need

Recorded so nobody builds them: no pathfinding change (the distance field already handles arbitrary
terrain), no new component, no snapshot change (terrain is never persisted), no new RNG stream (11
is already *"terrain generation"*), and no content schema change unless site kinds are given
per-kind layout weights — which §3 suggests and this section deliberately does not require.

---

## 6. Where this document is ahead of the code

Recorded plainly, because a reader should be able to tell the derived parts from the aspirational
ones.

- **The defender does not choose where anything sits.** `placeInDefenderHalf` places objectives at
  random. Every word of §2.3 about burying the library describes a decision no player and no
  simulation currently makes. This is W24's gap restated inside the raid layer: *"siting is a
  scenario decision, not a play decision."*
- **There are no buildings.** Terrain is per-cell noise; §5 is a proposal, not a description.
- **Fire has one consumer.** `grimoire-burn-resist-cap` is real and live, but nothing burns a
  *building*, so 2.4's compartmentation has no mechanical referent yet.
- **The portal's fixed position is implementation, not spec.** See 2.7.
- **`combatant-base-concealment` is 0.** Concealment is entirely node-granted, so architecture does
  not currently hide anybody — hiding is magic, not walls. If that ever changes, 2.2 gets much more
  interesting and this section is where to look first.

None of these blocks the readout, which is the point: **the readout can be built entirely from state
that already exists** (§4's left column is all real fields), while §5 waits for `raid-engagement` at
0.9.0.

---

## 7. What this buys, in one paragraph

The architecture is a derivation, so it stays true as the mechanics move. If `cast-range` is
retuned, the apron changes width. If area-denial widens, the rooms grow. If the defender ever gains
siting, §2.3 stops being a description of what a place *would* look like and becomes a decision a
player makes — and the readout is already drawing it. That is the difference between art that
illustrates a game and art that reports on one, and it is the same discipline the rest of the
project applies to everything else: **derived, never cached; and every claim carries the thing that
would disprove it.**