# How wide should the opening square be?

**Measured 2026-08-14 against `origin/main` at `1e2651ad`**, in a worktree with its own
`node_modules`. **No production file was changed**, so no `balance/` baseline and no golden fixture
moved: every arm below is an opening square spliced onto the reference content through
`explicitOpeningAxes` — the play verb a god calls — with the shipped default left alone.

> A measurement is a statement about the tree it was taken on. If the ref above is not the one you
> are reading, re-run the instruments before acting on any number here. The commands are in §8.

---

## The answer

**Do not widen the default opening square. The width was never the binding constraint.**

Three mechanisms were said to be invisible at twelve cells. Two of those claims are false on this ref
(§1), the third turns out to be a founding-position question rather than a grid question (§3), and
the one remaining argument for widening was closed by authoring rather than by width on a sibling
branch the same night (§2).

Then, chasing the frontier, the measurement found the thing that actually breaks progression, and it
is not dilution: **a wider opening displaces the founding grant off the *Intellego* trunk.**
`foundingCandidates` returns candidates ordered by content id and the scenario takes the first
`foundingNodes` of them, so permitting *Creo* — alphabetically first — silently replaces a founding
grant of four *Intellego* roots with a grant of *Creo* roots. `vision.md` §4 says perception gates
depth in every *Perdo* and *Rego* cell. A universe founded without it is founded without the trunk.
§7 isolates that with a controlled arm.

So the recommendation has two parts:

1. **Keep the twelve.** Nothing measured here is bought by widening that is not bought more cheaply
   another way, and the god's `permitTechnique` / `permitForm` verbs already widen the square in
   play: `permissive-breadth` ends a 720-tick run holding **101 distinct nodes** on an opening that
   structurally contains 51. The opening is a starting position, not a ceiling.
2. **Fix the founding grant before anyone widens anything.** A prefix of an alphabetical list is not
   a starting position; it is an accident of the alphabet, and it is the largest single effect this
   measurement found.

If the owner wants a wider opening regardless, §5 names the two candidates with their prices, and §6
is the frontier so the trade is visible rather than asserted.

---

## 1. Two of the three premises are false, and both are one command away

### 1.1 "`teach-rate`'s multiplier is live only above tier 3; v1's 51 nodes sit below it"

Both halves are false. The v1 rectangle's tier histogram, read from
`packages/content/data/node.json`:

| tier | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| nodes in the twelve cells | 12 | 13 | 13 | **11** | **2** |

Thirteen of the fifty-one sit at tier 4 or above; `perdo-mentem` and `rego-limen` each run to tier 5.
And they are reached, not merely authored: a 720-tick run on the v1 rectangle ends with a mean
deepest-tier-held of **3.89** across six species and a **maximum of 5**.

`teach-rate` also has sources inside the twelve. Nineteen nodes across the seventy cells carry the
primitive; **five are in v1 cells**:

| node | cell | tier | magnitude (`fp`) |
|---|---|---|---|
| `rm-hold-the-attention` | `rego-mentem` | 1 | 128 |
| `im-follow-the-thought` | `intellego-mentem` | 2 | 192 |
| `rm-the-patient-lesson` | `rego-mentem` | 2 | 256 |
| `im-open-the-locked-room` | `intellego-mentem` | 4 | 128 |
| `rm-the-shared-mind` | `rego-mentem` | 4 | 448 |

### 1.2 "anti-requisites cannot be expressed inside the twelve"

True on this ref, and closed by authoring on a sibling branch while this ran. §2.

### 1.3 What is left

The vitality wire (PR #169) moving `referencePopulation@permissive-breadth` and nothing else is a
claim about the wire, not about the opening, and is not re-measured here. The related question —
whether the four arms that were flat under it start moving when the square widens — is §4.

---

## 2. Anti-requisites: closed by authoring, and the arithmetic of why width could not have done it

On `1e2651ad` there is exactly **one** authored anti-requisite pair, authored on *cells* rather than
on nodes (`ExclusionRecord`, `packages/content/src/types.ts`):

```
creo-ignem ⊥ creo-umbra    resolution: destructive
```

Both halves need `creo`, `ignem` and `umbra`. `standardOpeningOrder` — the sequence a size-only
widening walks, being the v1 rectangle's own axes ascending, then every remaining axis ascending — is:

```
techniques: intellego perdo rego creo muto
forms:      limen mentem nomen terram animal aquam auram corpus fatum herbam ignem imaginem umbra vim
```

`creo` is 4th, `ignem` 11th, `umbra` 13th. **The first nested prefix holding the pair is 4 × 13 =
52 cells and 223 reachable nodes** — where 56.9% of species-runs are censored (§6). Widening by
*size* could never have made this mechanism visible at a survivable width. A deliberately chosen
4 × 6 gets there at 24 cells and 100 nodes: 2.2× less content for the same mechanic, which is the
clearest available demonstration that **an opening is a set, not a number.**

**It is moot as of 2026-08-14.** `w191/anti-requisites-in-v1`, commit `2f461a69` — local at the time
of writing, verified with `git ls-remote` **not** to be on `origin` — authors a second pair inside
the twelve:

```
perdo-nomen ⊥ rego-nomen    resolution: destructive
```

Both cells carry `"v1": true`. **This document's recommendation is conditional on that landing.** If
W191 is abandoned, the 24-cell set in §5 becomes the answer, at the price §6 records for it.

---

## 3. The "1.25×" is a library knot, and the founding position moves it 6.7×

There is no tier gate on `teach-rate`. The number is the **fp-256 knot of `LIBRARY_CONTRIBUTION`**
(`packages/rules-world/src/universities/capital.ts`):

```
knots: (0,0) (8,128) (32,320) (96,576) (256,768) (640,896)
```

On the 8 → 32 segment the contribution is `128 + (n−8)·8`, reaching **256 fp — a 1.25× multiplier on
`research-rate`, `teach-rate` and `scribe-rate` alike — at exactly 24 relevant distinct nodes
shelved.** "Relevant" is gated by the learner's `depthCeiling`, which `vision.md` §12 already records
as close to inert in v1.

So criterion 2 is a question about library depth. Here is the same instrument
(`runLongReference`), the same four seeds, 720 ticks, varying **only** the founding options:

| opening | founding options | libDepth | multiplier | population |
|---|---|---|---|---|
| **v1, 12 cells** | scenario defaults (cohort 4, foundingNodes 1) | **49.0** | ~1.386 | 469 |
| **v1, 12 cells** | `LONG_RUN_OPTIONS` (cohort 12, foundingNodes 6) | **7.3** | ~1.109 | 1258 |
| std 3×6, 18 cells | scenario defaults | 32.5 | ~1.316 | 443 |
| std 3×6, 18 cells | `LONG_RUN_OPTIONS` | 19.8 | ~1.216 | 1215 |

**The twelve cells reach the knot twice over under the scenario's own default founding position.**
Changing the founding position on a fixed opening moves library depth by **6.7×**; widening the
opening from 12 to 18 cells moves it by 2.7× in one direction and *down* by 1.5× in the other — the
width effect does not even keep its sign, while the founding-position effect is unambiguous.

Under `LONG_RUN_OPTIONS` the twelve genuinely never get there. A 200-world-year trajectory:

```
v1        seed 3149212699  libDepth 240:12 480:12 720:12 1200:12 1800:15 2400:15  peak 15  first ≥24: never
v1        seed 1508681164  libDepth 240:5  480:7  720:7  1200:7  1800:7  2400:10  peak 10  first ≥24: never
v1        seed 4163116925  libDepth 240:3  480:3  720:3  1200:3  1800:5  2400:16  peak 16  first ≥24: never
std-3x6   seed 3149212699  libDepth 240:16 480:20 720:22 1200:53 1800:74 2400:74  peak 74  first ≥24: tick 782
std-3x6   seed 1508681164  libDepth 240:3  480:30 720:36 1200:43 1800:74 2400:74  peak 74  first ≥24: tick 462
std-3x6   seed 4163116925  libDepth 240:4  480:5  720:6  1200:6  1800:7  2400:18  peak 18  first ≥24: never
```

That is a finding about `LONG_RUN_OPTIONS`, not about the grid: **2.7× the population and one
seventh of the library, on the identical twelve cells.** Somebody should own that; widening the grid
does not fix it, because the mechanism is in the cohort, the upkeep and the scribing loop.

---

## 4. Criterion 4: all four flat arms move at 24 cells — and what moves them is the damage

`passive-control`, `narrow-depth`, `archivist` and `worship-maximizer` were byte-identical under
anti-requisites and flat under the vitality wire. Run under the MC harness at 720 ticks, 20 paired
seeds per strategy, control = v1 rectangle, treatment = the 24-cell exclusion square,
**paired by run seed** (`permissive-breadth` is in the pool as the positive control):

| strategy | metric | control | Δ | SE |
|---|---|---|---|---|
| `passive-control` | `referenceLibraryDepth` | 36.4 | **−21.35** | **−6.10** |
| | `referenceGrimoires` | 214.5 | +163.30 | +4.28 |
| `narrow-depth` | `referenceNodesKnown` | 5.6 | +4.10 | **+8.95** |
| | `referenceLibraryDepth` | 5.5 | +4.00 | **+8.41** |
| | `referencePopulation` | 372.2 | +108.95 | +2.99 |
| `archivist` | `referenceNodesKnown` | 50.1 | +24.20 | **+5.43** |
| `worship-maximizer` | `referenceLibraryDepth` | 39.5 | **−23.60** | **−10.02** |
| | `referenceGrimoires` | 244.5 | +139.00 | +3.52 |
| `permissive-breadth` *(control)* | `referenceKnowledgeInstances` | 1595.3 | +328.05 | +2.72 |

**The test as posed is passed, and the passing is the damage.** The largest movements are
`passive-control` and `worship-maximizer` losing 21 and 24 distinct nodes off their library shelves
at 6.1 and 10.0 standard errors — the rate multiplier falling from ~1.33 to ~1.16. That is not a
mechanic becoming visible; it is the scribing effort of a fixed number of mage-months spread across
twice as many distinct nodes. A wider grid does make the arms move. It moves them down.

The one honest exception is `narrow-depth`, which gains on everything — it keeps one technique and
one form whatever the opening, so a wider opening changes *which* cell it builds on rather than
diluting it.

Note also `permissive-breadth` on the **control** arm: 101.1 distinct nodes known at 720 ticks, on an
opening that structurally contains 51. The god's permit verbs already widen the square in play. That
is the strongest single argument for leaving the default small.

---

## 5. If you widen anyway

Two candidates, both stated with their price.

### `{creo, intellego, perdo, rego} × {limen, mentem, nomen, terram}` — 16 cells, 67 nodes

The cheapest coherent widening. It keeps the v1 rectangle whole and adds exactly one axis, *Creo*,
the making verb. `vision.md` §4 wires v1 so that every cross-cell edge originates in an *Intellego*
cell — *you must perceive a thing before you can unmake or command it* — and adding *Creo* completes
that sentence: perceive, make, unmake, command, with *Muto* (transform) left as the axis a god still
has to buy. Four verbs about a thing's existence and none about its identity is a legible opening.

It raises `teach-rate` sources from five to nine. It **cannot** express `creo-ignem ⊥ creo-umbra`.
And it carries the founding-grant hazard of §7 in full, because *Creo* sorts first.

### `{creo, intellego, perdo, rego} × {ignem, limen, mentem, nomen, terram, umbra}` — 24 cells, 100 nodes

The exclusion square: the smallest opening that contains the whole v1 rectangle *and* the authored
anti-requisite pair. Fire and shadow are a coherent pair to add — *"a light thrown by nothing and a
shadow cast by nothing are one claim about what throws a thing, pointed opposite ways"* — and it
costs 1 stranded node (a node in the square whose prerequisite is outside it).

**Its price is 18.1% censoring**, against 2.8% for the twelve and **1.4%** for `standard 3×8`, which
is the same size and holds one *more* reachable node. Thirteen times the censoring for an equal-sized
square is not a rounding difference, and §7 says where it comes from.

### The set matters more than the size, and here is the pair that proves it

| arm | cells | reachable nodes | censoring |
|---|---|---|---|
| `standard 3×8` | 24 | 101 | **1.4%** |
| `named 4×6` (exclusion square) | 24 | 100 | **18.1%** |

Same size. Same content volume to within one node. Thirteenfold difference in whether a species ever
reaches tier 3. **"Twelve cells chosen well" beats "twenty-four chosen badly" is not the interesting
version of this claim — the interesting version is that two twenty-four-cell squares differ from each
other by more than either differs from the twelve.**

---

## 6. The frontier

Twelve seeds per arm, 720 ticks, tier 3, `LONG_RUN_OPTIONS`, no god actions. Censoring is pooled over
six species × twelve runs = 72 species-runs. The slowdown column is `human`, computed over uncensored
runs only and therefore **optimistic wherever censoring is non-zero** — the runs that never arrived
are exactly the slow ones, so read it beside the censoring column and never alone.

*(table)*

### The x-axis is reachable nodes, not cells

*(text)*

### Reproducing #137

*(text)*

---

## 7. The founding grant is a prefix of an alphabetical list

*(the controlled arm)*

---

## 8. Re-running any of this

*(commands)*

---

## 9. Instrument findings recorded because they cost time

*(text)*
