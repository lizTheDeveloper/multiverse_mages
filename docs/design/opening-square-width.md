# How wide should the opening square be?

**Measured 2026-08-14 against `origin/main` at `1e2651ad`**, in a worktree with its own
`node_modules`. **No production file was changed**, so no `balance/` baseline and no golden fixture
moved: every arm below is an opening square spliced onto the reference content through
`explicitOpeningAxes` — the play verb a god calls — with the shipped default left alone.

> A measurement is a statement about the tree it was taken on. If the ref above is not the one you
> are reading, re-run the instruments before acting on any number here. The commands are in §9.

---

## The answer

**Do not widen the default opening square, and the reason is not the one anybody expected.**

The three mechanisms said to be invisible at twelve cells are not the constraint. Two of those claims
are false on this ref (§1), the third is a founding-position question rather than a grid question
(§3), and the one surviving argument was closed by authoring on a sibling branch the same night (§2).

Chasing the frontier then found something larger. **Widening the opening has two costs, and they are
different things with different shapes:**

1. **Time-to-tier slows smoothly with the number of *reachable nodes*** — 1.00× at 51 nodes,
   1.9× at 76, 4.5× at 101, 12× at 170, 17× at 223. That is dilution: a fixed supply of mage-months
   spread over more content. It is a curve, and the owner can pick a point on it (§6).
2. **Censoring — a species never reaching tier 3 at all — is a step function, and it is caused
   entirely by one authored *destructive* anti-requisite.** Across fourteen squares from 12 to 70
   cells, **every arm without a live exclusion pair censors 1.4–4.2%, and every arm with one censors
   18.1–75.0%.** Removing either half of `creo-ignem ⊥ creo-umbra` from the whole grid takes
   censoring from **75.0% to 13.9%** (§7).

So **PR #137's collapse is mostly an anti-requisite finding, not a dilution finding**, and the
question "how wide can the opening be" has been answered against the wrong variable. That has an
immediate consequence for W191, which is authoring a second `destructive` pair *inside the twelve*
(§8).

The recommendation:

- **Keep the twelve as the default.** Nothing measured here is bought by widening that is not bought
  more cheaply another way, and the god's `permitTechnique` / `permitForm` verbs already widen the
  square in play: `permissive-breadth` ends a 720-tick run holding **101 distinct nodes** on an
  opening that structurally contains 51. The opening is a starting position, not a ceiling.
- **If the owner wants a wider default anyway, `{creo, intellego, perdo, rego} × {limen, mentem,
  nomen, terram}` — 16 cells, 67 reachable nodes — is measurably free**: 0.97× time-to-tier for
  human, 4.2% censoring against the twelve's 2.8%, a mean deepest tier of 3.85 against 3.89, and it
  takes `teach-rate` sources from five to nine. It is the only widening on the whole frontier that
  costs nothing.
- **Before anyone widens past that, decide what a `destructive` exclusion is supposed to do**, because
  at present it is the single largest determinant of whether a universe progresses at all.

---

## 1. Two of the three premises are false, and both are one command away

### 1.1 "`teach-rate`'s multiplier is live only above tier 3; v1's 51 nodes sit below it"

Both halves are false. The v1 rectangle's tier histogram, from `packages/content/data/node.json`:

| tier | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| nodes in the twelve cells | 12 | 13 | 13 | **11** | **2** |

Thirteen of the fifty-one sit at tier 4 or above; `perdo-mentem` and `rego-limen` each run to tier 5.
They are reached, not merely authored: a 720-tick run on the v1 rectangle ends with a mean
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

True on this ref, and closed by authoring on a sibling branch while this ran — see §2. Whether that
is good news is §8.

### 1.3 What is left

The vitality wire (PR #169) moving `referencePopulation@permissive-breadth` and nothing else is a
claim about the wire, not about the opening, and is not re-measured here. The related question —
whether the four arms that were flat under it start moving when the square widens — is §4.

---

## 2. Anti-requisites, and the arithmetic of why width could never have shown them

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
52 cells and 223 reachable nodes** — where 56.9% of species-runs are censored. Widening by *size*
could never have made this mechanism visible at a survivable width. A deliberately chosen 4 × 6 gets
there at 24 cells and 100 nodes: 2.2× less content for the same mechanic, which is the clearest
available demonstration that **an opening is a set, not a number.**

**It is moot as of 2026-08-14.** `w191/anti-requisites-in-v1`, commit `2f461a69` — local at the time
of writing, verified with `git ls-remote` **not** to be on `origin` — authors a second pair inside
the twelve:

```
perdo-nomen ⊥ rego-nomen    resolution: destructive
```

Both cells carry `"v1": true`, so anti-requisites become expressible at width twelve and stop being
an argument for widening at all. §8 measures what that costs.

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
Changing the founding position on a fixed opening moves library depth **6.7×**; widening from 12 to
18 cells moves it 2.7× in one direction and *down* 1.5× in the other — the width effect does not keep
its sign, while the founding-position effect is unambiguous.

Under `LONG_RUN_OPTIONS` the twelve genuinely never get there. A 200-world-year trajectory:

```
v1        seed 3149212699  libDepth 240:12 480:12 720:12 1200:12 1800:15 2400:15  peak 15  first ≥24: never
v1        seed 1508681164  libDepth 240:5  480:7  720:7  1200:7  1800:7  2400:10  peak 10  first ≥24: never
v1        seed 4163116925  libDepth 240:3  480:3  720:3  1200:3  1800:5  2400:16  peak 16  first ≥24: never
std-3x6   seed 3149212699  libDepth 240:16 480:20 720:22 1200:53 1800:74 2400:74  peak 74  first ≥24: tick 782
std-3x6   seed 1508681164  libDepth 240:3  480:30 720:36 1200:43 1800:74 2400:74  peak 74  first ≥24: tick 462
std-3x6   seed 4163116925  libDepth 240:4  480:5  720:6  1200:6  1800:7  2400:18  peak 18  first ≥24: never
```

That is a finding about `LONG_RUN_OPTIONS`, not about the grid: **2.7× the population and one seventh
of the library, on the identical twelve cells.** Somebody should own that; widening does not fix it,
because the mechanism is in the cohort, the upkeep and the scribing loop.

---

## 4. Criterion 4: all four flat arms move at 24 cells — downward

`passive-control`, `narrow-depth`, `archivist` and `worship-maximizer` were byte-identical under
anti-requisites and flat under the vitality wire. Run under the MC harness at 720 ticks, 20 paired
seeds per strategy, control = the v1 rectangle, treatment = the 24-cell exclusion square, **paired by
run seed** (`permissive-breadth` is in the pool as the positive control):

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
| `permissive-breadth` *(positive control)* | `referenceKnowledgeInstances` | 1595.3 | +328.05 | +2.72 |

**The test as posed is passed, and the passing is the damage.** The largest movements are
`passive-control` and `worship-maximizer` losing 21 and 24 distinct nodes off their library shelves
at 6.1 and 10.0 standard errors — the rate multiplier falling from ~1.33 to ~1.16. The treatment
square here is the smallest opening that makes `creo-ignem ⊥ creo-umbra` live, and its resolution is
`destructive`: §7 shows that pair is what censors progression, so the honest reading of these rows is
**held knowledge being deleted**, not merely diluted.

`narrow-depth` is the one arm that gains on everything. It keeps one technique and one form whatever
the opening, so a wider opening changes *which* cell it builds on rather than spreading it thinner.

Note also `permissive-breadth` on the **control** arm: 101.1 distinct nodes known at 720 ticks on an
opening that structurally contains 51. The god's permit verbs already widen the square in play, which
is the strongest single argument for leaving the default small.

---

## 5. Criterion 3: the spread metric cannot see the opening square

`species-occupancy.test.ts` pins `collectSpeciesCellOccupancy` — a Gini over per-species occupied-cell
counts, where **zero is the healthy end** and a rising value is the roster collapsing onto one
species — at **0.0473** for the v1 rectangle at twenty world years from `LONG_RUN_SEED`. The
instrument used here reproduces that exactly, and refuses to run if it does not.

Six seeds per square, same horizon, same collector:

| square | cells | spread, mean of 6 seeds | SE | the pinned seed alone |
|---|---|---|---|---|
| v1, 3×4 | 12 | 0.1168 | ±0.0228 | **0.0473** |
| std 4×4 | 16 | 0.1867 | ±0.0302 | 0.1667 |
| std 3×6 | 18 | 0.1723 | ±0.0299 | 0.0833 |
| std 3×8 | 24 | 0.1783 | ±0.0273 | 0.0776 |
| named 4×6 | 24 | 0.1618 | ±0.0291 | 0.1242 |
| std 4×13 | 52 | 0.1402 | ±0.0258 | 0.0801 |
| std 5×14 | 70 | 0.1472 | ±0.0286 | 0.0758 |

**Every square is within about one standard error of every other**, and the whole grid is
indistinguishable from the twelve. The between-seed spread (sd ≈ 0.06–0.08 on six seeds) is three
times the between-square spread.

The pinned **0.0473 is one seed out of a distribution whose mean is 0.117**. That is worth writing
down beside the pin: the test is not wrong to pin a single seed — it is a regression tripwire, and
`species-occupancy.test.ts` says so — but nobody should read 0.0473 as *the* spread of the v1
rectangle, and the history in that comment (0.0729 → 0.0714 → 0.0645 → 0.0473) is a walk inside one
seed's noise band rather than four measurements of a trend.

**Criterion 3 does not discriminate at this horizon**, and that is a finding about the metric.

---

## 6. The frontier

Twelve seeds per arm, 720 ticks, tier 3, `LONG_RUN_OPTIONS`, no god actions. Censoring is pooled over
six species × twelve runs = 72 species-runs. Slowdown is `human`'s mean arrival relative to the v1
rectangle, computed over uncensored runs only and therefore **optimistic wherever censoring is
non-zero** — the runs that never arrived are exactly the slow ones. Read it beside the censoring
column, never alone.

| arm | cells | reachable nodes | pair live? | censoring | human slowdown | deepest tier (mean) |
|---|---|---|---|---|---|---|
| **v1 (3×4)** | 12 | 51 | no | **2.8%** | 1.00× | 3.89 |
| std 4×4 = named 4×4 | 16 | 67 | no | 4.2% | **0.97×** | 3.85 |
| std 3×6 | 18 | 76 | no | 2.8% | 1.83× | 3.83 |
| named 3×6 | 18 | 75 | no | **1.4%** | 1.87× | **3.94** |
| std 3×8 | 24 | 101 | no | **1.4%** | 4.45× | 3.85 |
| std 4×6 | 24 | 101 | no | 4.2% | 4.46× | 3.68 |
| **named 4×6** (exclusion square) | 24 | 100 | **yes** | **18.1%** | 4.85× | 3.32 |
| named 4×7 | 28 | 118 | **yes** | **59.7%** | 5.84× | 2.53 |
| std 4×8 | 32 | 136 | no | 2.8% | 7.92× | 3.46 |
| std 5×8 | 40 | 170 | no | 4.2% | 13.03× | 3.43 |
| std 3×14 | 42 | 177 | no | 2.8% | 11.82× | 3.38 |
| std 4×13 | 52 | 223 | **yes** | **56.9%** | 17.40× | 1.92 |
| **std 5×14** (PR #137) | 70 | 300 | **yes** | **75.0%** | censored 12/12 | 1.58 |

Two separate curves live in that table and they must not be read as one.

### 6.1 Slowdown is smooth, and it is a function of reachable nodes

Sorted by reachable nodes, human's slowdown is monotone and has nothing to do with the pair:
51 → 1.00×, 67 → 0.97×, 75 → 1.87×, 101 → 4.45×, 118 → 5.84×, 136 → 7.92×, 170 → 13.03×,
177 → 11.82×, 223 → 17.40×. **Cells are the wrong x-axis**: `std 3×14` at 42 cells and `std 5×8` at
40 cells sit within 10% of each other because they hold 177 and 170 nodes, while `std 4×4` at 16
cells costs nothing at all because 67 nodes is barely more than 51.

**The knee is around 75 reachable nodes.** Below it, widening is free. Above it, every extra ~25
nodes costs roughly a further 1.5× on time-to-tier.

### 6.2 Censoring is a step, and the step is the destructive exclusion

Ten arms hold no live exclusion pair. Their censoring runs **1.4% to 4.2%**, with no trend in cells
(12 → 42) or nodes (51 → 177). Four arms hold one. Their censoring runs **18.1% to 75.0%**. There is
no overlap. §7 shows the relation is causal and not a coincidence of which squares happen to be wide.

### 6.3 Reproducing PR #137

`std 5×14` reproduces #137's signature: **human censored in 12 of 12 runs**, gnome 21.4× slower, mean
deepest tier 1.58 against the twelve's 3.89. #137 reported human censored in **51 of 72** runs (71%)
and "roughly 20× slower". This is the same signature and somewhat more severe, at 12 seeds rather
than 72 and under `LONG_RUN_OPTIONS`, which #137 may not have used — so read it as *reproduces the
signature*, not as *reproduces the number*.

### 6.4 Why 16 cells and not 18 or 24, as magic rather than as arithmetic

Three squares are affordable on the numbers: `4×4` at 16 cells (free), `3×6`/`named 3×6` at 18
(1.8×), and `3×8`/`4×6` at 24 (4.5×). The 16-cell one is also the only one that is a *sentence*.

`vision.md` §4 records that all eleven cross-cell prerequisite edges in the v1 subset originate in an
*Intellego* cell: **you must perceive a thing before you can unmake or command it.** The twelve are
therefore three verbs about what you may do to a thing — perceive, unmake, command — crossed with four
things. Adding **`creo`** completes the verb list to *perceive, make, unmake, command*: everything a
universe can do to a thing's **existence**, with *Muto* — transform, the verb about a thing's
**identity** — left as the axis a god must still buy. That is a legible boundary, and "you may bring
things into being and end them, but you may not change what they are" is a rule a player can hold in
their head.

The alternatives are arithmetic rather than design. `standard 3×6` adds *Animal* and *Aquam* because
they sort early; `standard 3×8` adds *Auram* and *Corpus* for the same reason. Neither says anything.
`named 3×6` — adding *Ignem* and *Umbra* without *Creo* — at least names a pair (fire and shadow) and
has the best deepest-tier reading on the whole frontier (3.94), but it half-authors the exclusion: it
permits both forms while withholding the technique that would make them exclude anything, which is
the worst of both readings.

And the 24-cell exclusion square, which is what the brief was pointing at, is the one square where
coherence and measurement disagree: it is the most legible set on the board and it costs 18.1%
censoring. **That disagreement is the finding, not a tie to be broken** — a mechanic whose only
coherent home costs a sixth of all species-runs is a mechanic that needs retuning, not an opening
that needs widening.

---

## 7. What actually breaks progression: two ablations and one refuted hypothesis

### 7.1 The destructive pair, ablated at 24 cells

Four squares over the same four techniques `{creo, intellego, perdo, rego}`, differing only in which
of `ignem` and `umbra` are permitted. Twelve seeds each:

| forms | cells | pair live? | censoring |
|---|---|---|---|
| `ignem limen mentem nomen terram umbra` | 24 | **yes** | **18.1%** |
| minus `umbra` | 20 | no | 4.2% |
| minus `ignem` | 20 | no | 4.2% |
| minus both | 16 | no | 4.2% |

Dropping either half costs four cells and takes censoring from 18.1% to 4.2%. Dropping the *second*
half costs four more cells and changes nothing. **The cells are not the variable; holding both halves
is.** (The 18.1% row also re-runs `named-4x6` on the same seed schedule as §6 and reproduces it
exactly, which is the reproducibility check for the whole frontier.)

### 7.2 The same ablation at the whole grid

| square | cells | reachable nodes | pair live? | censoring |
|---|---|---|---|---|
| 5 × 14 (the whole grid) | 70 | 300 | **yes** | **75.0%** |
| 5 × 13, minus `umbra` | 65 | ~285 | no | **23.6%** |
| 5 × 13, minus `ignem` | 65 | ~283 | no | **13.9%** |

**Removing one form from the whole grid takes censoring from 75.0% to 13.9%.** The pair accounts for
roughly four fifths of #137's collapse. The residue — 14–24% against the twelve's 2.8% — is the real
dilution cost of 285 reachable nodes, and it is exactly what §6.1's curve predicts at that node
count.

### 7.3 The founding-grant hypothesis, refuted

`foundingCandidates` returns candidates ordered by content id and the scenario takes the first
`foundingNodes` of them, so permitting *Creo* — alphabetically first — replaces a founding grant of
four *Intellego* roots with *Creo* roots:

| square | founding six, by technique | *Intellego* count |
|---|---|---|
| v1 | inte inte inte inte perd perd | 4 |
| std 3×6, 3×8, 3×14 | inte × 6 | 6 |
| std 4×4, named 4×4 | creo creo creo creo inte inte | 2 |
| std 4×13, 5×8, 5×14, named 4×6 | creo × 6 | **0** |

`vision.md` §4 says perception gates depth in every *Perdo* and *Rego* cell, so the obvious
hypothesis is that a wide opening founds a universe without the trunk. **It is wrong, and the sign is
backwards.** Forcing the v1 rectangle's own (*Intellego*-heavy) founding grant onto a wide square:

| arm | censoring |
|---|---|
| v1 | 2.8% |
| named 4×6, its own grant | 18.1% |
| **named 4×6 + v1's grant** | **44.4%** |
| std 5×14, its own grant | 75.0% |
| **std 5×14 + v1's grant** | **93.1%** |

A wide square's own grant is *better* than the twelve's, on both. The hypothesis is refuted rather
than unsupported, and it is recorded here so nobody spends a night on it again.

It leaves a real question open, though, and it is worth someone's time: **the founding grant is a
prefix of an alphabetical list.** `foundingCandidates` sorts by content id and the scenario slices
the first *n*. That is not a starting position anybody chose, and the experiment above shows it
matters — 18.1% against 44.4% on the identical square.

---

## 8. What this says about W191

W191's new pair is `perdo-nomen ⊥ rego-nomen`, resolution **`destructive`**, and both cells are
inside the twelve. Everything in §6.2 and §7 says a live destructive pair is the single largest
determinant of whether species reach tier 3, so the obvious worry is that W191 trades an invisible
mechanic for a broken default opening.

**Measured.** `git show w191/anti-requisites-in-v1:packages/content/data/cell.json` over the
worktree's copy — a data-only swap, since `packages/content/data` is read at runtime — confirmed with
the reach script that the v1 rectangle now reports `perdo-nomen ⊥ rego-nomen` live, then the v1 arm
at 12 seeds and 720 ticks, then restored:

| v1 rectangle | censoring | draconic | dwarf | elf | gnome | human | orc | nodesKnown | libDepth | deepest tier |
|---|---|---|---|---|---|---|---|---|---|---|
| `1e2651ad` (no live pair) | 2.8% | 206 (2 cens) | 28 | 56 | 24 | 30 | 36 | 50.2 | 17.0 | 3.89 |
| **W191's content** | **6.9%** | 130 (**5 cens**) | 28 | 56 | 24 | 30 | 36 | 45.2 | 12.7 | 3.78 |

**W191's pair is cheap, and it is nothing like the `creo` pair.** Five of the six species arrive at
*exactly* the same tick — dwarf 28, elf 56, gnome 24, human 30, orc 36, unchanged to the tick. The
entire cost lands on **draconic**, which goes from 2 censored runs to 5, and on five distinct nodes
of knowledge (50.2 → 45.2) and four shelved ones (17.0 → 12.7).

So: **W191 should land.** It makes anti-requisites expressible at the default width, and it costs
2.8% → 6.9% censoring concentrated entirely on the species that was already at the margin. Whoever
reviews it should decide whether pushing draconic from 2/12 to 5/12 censored is acceptable — it is a
real cost on the one species `reference-time-to-tier.test.ts` already records as barely arriving —
but it is two orders of magnitude away from what `creo-ignem ⊥ creo-umbra` does at 24 cells.

That difference is itself worth understanding before more exclusions are authored: two pairs with the
same `destructive` resolution cost 4.1 points of censoring and 15.3 points respectively, and nothing
in the content says which will be which.

---

## 8a. A note on the instrument, since a pooled gate cannot see this

`balance-gate-v1` passes at delta 0.00000 on all nine metrics with a scribing change in the tree, so
"a pooled sweep did not move" is not evidence that a subsystem did not move. That gate runs
`passive-control` alone at a **60-tick** `worldTickCap`, which is a twelfth of the horizon anything
here is measured at and a fortieth of the long run.

This measurement is not exposed to that failure, and the reason is checkable rather than asserted:
**the four arms did move**, at 6.1 to 10.0 standard errors (§4). An instrument that reports a
6-sigma paired difference on four independent strategies is not blind. Had they all come back flat,
the way to tell blindness from a true null would have been the positive control that is already in
the pool — `permissive-breadth`, which PR #169 moved — and it moved here too (+2.0 to +2.7 SE). A
flat result with a flat positive control is a broken instrument; a flat result with a moving positive
control is an answer.

No baseline was regenerated and no `balance:gate*` command was run in the course of this work.
Measurement artefacts live under `tools/w192/` precisely so that nothing here can be mistaken for a
committed balance baseline.

---

## 9. Re-running any of this

`npm ci` in the worktree first, then `npm run typecheck` — the scripts load `dist/`.

```sh
# static: what each candidate square can reach, before any run
node scripts/w192-opening-reach.mjs
node scripts/w192-opening-reach.mjs --json          # for a checker; never parse the table by column

# the positive control. Must reproduce the shipped instrument's calibration set.
node scripts/w192-opening-sweep.mjs --calibrate
node packages/scenario/bin/species-separation.mjs --sets 1 --tier 3   # the shipped one, to compare

# the frontier. --out is required and nothing is globbed.
node scripts/w192-opening-sweep.mjs --list
node scripts/w192-opening-sweep.mjs --arms v1,named-4x6 --seeds 12 --out tools/w192/mine.ndjson
node scripts/w192-analyse.mjs tools/w192/frontier-a.ndjson tools/w192/frontier-b.ndjson \
                              tools/w192/frontier-c.ndjson tools/w192/frontier-d.ndjson

# criterion 3, the task 9.9 spread. Refuses to run unless v1 reproduces the pinned 0.0473.
node scripts/w192-opening-occupancy.mjs --seeds 6 --out tools/w192/occupancy.ndjson

# criterion 4, the strategy pool under an arm's opening square
W192_ARM=named-4x6 node packages/mc-harness/bin/run-sweep.mjs \
  --scenario ./tools/w192/scenario.mjs --sweep ./tools/w192/strategies.sweep.json \
  --out ./tools/w192/strat-named-4x6 --workers 4
node scripts/w192-strategy-compare.mjs \
  control=tools/w192/strat-v1/w192-opening-strategies.0.runs.ndjson \
  wide=tools/w192/strat-named-4x6/w192-opening-strategies.0.runs.ndjson
```

Every one of these refuses rather than defaults: the sweep exits `2` if `explicitOpeningAxes` on the
v1 axes does not rebuild the shipped opening, the occupancy script exits `2` if the v1 arm does not
reproduce `0.0473`, and the analyser exits `3` if the files it is given mix horizons or hold no
records. A third exit for *"the probe is broken"* is deliberate; folding it into *"the answer is no"*
is the failure `CLAUDE.md` records five instances of.

---

## 10. Instrument findings recorded because they cost time

**`reference-time-to-tier.test.ts`'s narrative table is stale, and the shipped instrument disagrees
with it.** `species-separation.mjs` prints the calibration set and says *"If those do not match the
committed docstring, stop: the instrument is wrong."* Running it produces
`gnome [24,25] dwarf [25,34] human [29,31] elf [53,60] orc [25,40] draconic [27,246] (1 censored)`,
against the docstring's line-48 table of `gnome [39,53] dwarf [41,54] orc [42,63] human [44,57]
elf [54,110] draconic [68,245]`. The later before/after tables in the same file carry the current
figures, so the file contradicts itself and the misleading half is the one the harness points a
reader at. This measurement's calibration matched the *shipped instrument* byte for byte, which is
the control that matters; the docstring is a documentation-rot finding and is not repaired here.

**Two broken probes, both caught by a positive control, both of the shape `CLAUDE.md` names.**
A wait loop written as `until [ ! -e /proc/$$ ] || …` exited immediately on macOS, where `/proc` does
not exist, and reported the sweeps finished when 120 of 180 runs were outstanding. And
`pgrep -f "a\|b\|c"` matched nothing, so a second waiter would have returned instantly; run
individually, each pattern matched. Neither threw. Both were found by asking the probe to report the
*positive* case first — the pattern must match a process that is definitely running before its
absence is allowed to mean anything.

**`awk '{print $9}'` on this document's own table reads the wrong column.** The square label
`standard 3x4` is two whitespace-separated fields, so the anti-requisite column is `$10`. The W191
check in §8 parses `--json` instead. This is the fourth instance of that shape in the repository's
notes and it took one command to catch.

**A duplicate arm is a free consistency check and it passed.** `std-4x4` and `named-4x4` are the same
square reached through two different arm definitions, run as separate arms without either knowing
about the other. They agree on every species to the tick.
