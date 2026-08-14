<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The cross-seed spread on a species separation

**Measured 2026-08-14.** **Refs, all three measured at their own head and none merged with each
other:**

| ref | commit | what it is |
| --- | --- | --- |
| `main` | `cc20d54` | the control |
| `w18/academic-primitive-consumers` | `1ae52c3` | PR #140 — node-driven academic rates |
| `w115/enable-all-cells` | `d6c32d0` | PR #137 — all seventy grid cells enabled |

The two branches were measured **unmerged**, because their own published numbers were taken there
and merging would have changed the treatment. **Instrument:**
`packages/scenario/src/species-separation.ts`, driven by
`packages/scenario/bin/species-separation.mjs`, at its default design — 12 independent seed sets of
6 seeds, tier 3, 720 world ticks, `LONG_RUN_OPTIONS`. 72 runs per ref per tier. **Nothing under
`balance/` was read, written, or regenerated, and `goldens:regen` was not run.**

Every number here is a statement about those refs on that date. Re-measure before quoting it.

## The negative result, stated directly

**Task 9.9 — *"at least four species differ by more than the observed cross-seed spread"* — is
UNMET, on all three refs. Neither #140 nor #137 moved it. Measured properly it is further from met
than the repository believed, not closer.**

That sentence is the finding. Everything below is the evidence, and the tables should not be read as
implying it — it is stated here because a reader who takes only one thing from this document should
take that one.

The four supporting facts, each measured rather than argued:

1. **What actually separates on `main` is three species in a chain, not four.** Four pair relations
   survive twelve independent re-rolls of the seeds: `gnome < human`, `gnome < elf`, `dwarf < elf`,
   `human < elf`. As a graph that is `gnome → human → elf` with `dwarf → elf` alongside. 9.9 wants
   four *species* ordered; this is three, plus a fourth ordered against only one of them.
2. **#140 changed how fast every species is and did not change which pairs are distinguishable.**
   The same four relations, before and after. Its published `gnome < dwarf < human < elf` chain
   survives a re-roll in **1 of 12** sets on its own branch and **0 of 12** on `main`.
3. **#137 does not improve differentiation either, and at this horizon it destroys the
   measurement.** Every species becomes roughly twenty times slower to tier 3, and human is censored
   in **51 of 72 runs**. See the section on it: the honest reading is that 720 ticks is no longer a
   valid horizon for that ruleset, not that #137 separated or failed to separate anything.
4. **Four of the eight interval claims `reference-time-to-tier.test.ts` asserted were true only of
   its own six seeds**, including one — `human < orc` — that held in **one seed set out of sixteen**.
   They have been retired. The four that survive twelve re-rolls were left untouched.

**Draconic is not a species this horizon can say anything about.** It is censored in 17 of 72 runs
on `main`, its `max` endpoint travels **425 ticks** between seed sets, and its between-set standard
deviation is 75 ticks against a mean of 209. Any interval printed for draconic is partly a statement
about where the run was stopped. Someone will otherwise trip over this: it is the widest column in
every table below and it looks like a finding.

## How separation is measured today, and on how many seeds

`packages/scenario/test/unit/reference-time-to-tier.test.ts` runs the reference universe over **one
fixed list of six seeds** — `0x00090001` through `0x00090006` — and reduces each species to the
interval `[min, max]` of its arrival tick. A separation is claimed when two intervals do not
overlap: `expect(human.high).toBeLessThan(orc.low)`.

**Six seeds, one set, and no spread.** Two properties of that statistic matter and neither is
recorded anywhere it was used:

1. **A range has no standard error.** `[min, max]` is not a mean, so nothing in the reported number
   says how far it would move.
2. **A range is not stable in *n*.** It can only grow as seeds are added, so non-overlap gets
   strictly harder with more seeds and strictly easier with fewer. Two honest measurements taken at
   different seed counts are not comparable, and every published claim happens to be at n = 6.

A strict ordering asks only that point estimates not cross. It is therefore the statistic most
likely to look clean by accident, which is what happened twice.

## What the instrument does

For **K independent seed sets of N = 6 seeds**, holding N at the six every published claim used —
raising it would refute six-seed claims for the wrong reason. A "set" is a re-roll of the seeds,
and a re-roll in `mc-harness`'s vocabulary is *the same sweep at a different root seed*, so each set
is one `rootSeed` fed to `deriveRunSeed` and differs in nothing else. `deriveRunSeed`'s base is
`mix32(rootSeed, …)`, a full avalanche, so distinct root seeds give uncorrelated sets; the root
seeds themselves descend from one constant, so the whole design reproduces exactly. No seed scheme
was invented for this.

Three numbers come out, answering three different questions:

| number | question |
| --- | --- |
| **reproduction rate** | in how many of K sets does the claimed strict non-overlap hold, judged exactly as the published claim judges it? |
| **paired standard errors** | both species come out of the *same* run, so difference inside a set first, then average across sets: `mean(d) / (sd(d)/√K)` |
| **endpoint travel** | how far a species' six-seed `[min, max]` endpoints move across sets, in ticks — the scale a published gap must be read against |

Pairing is load-bearing. Most of the between-set variation is a property of the seed set and is
shared by every species in it; differencing inside a set removes it, and treating the two species as
independent samples reports a spread several times too wide.

**Calibration comes first, and it passed.** On both refs the instrument was pointed at the legacy
six seeds before anything else. It reproduced the committed docstring on `main` exactly — gnome
`[24, 25]`, dwarf `[25, 30]`, human `[30, 31]`, orc `[32, 51]`, elf `[53, 60]`, draconic `[25, 301]`
— and #140's published table on `w18` exactly: gnome `[20, 20]`, dwarf `[22, 23]`, human `[24, 26]`,
orc `[24, 41]`, elf `[37, 42]`, draconic `[22, 419]`. Neither claim is a measurement error. What was
missing was never an assertion; it was a spread.

## The cross-seed spread on `main` today

Tier 3, 720 ticks, 12 sets, `main` at `cc20d54`:

| species | grand mean | between-set sd | SE | `min` endpoint travels | `max` endpoint travels | censored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| gnome | 24.3 | 0.2 | 0.0 | 1 | 0 | 0 |
| dwarf | 27.7 | 1.2 | 0.3 | 3 | 10 | 0 |
| human | 29.9 | 0.3 | 0.1 | 1 | 5 | 0 |
| orc | 34.2 | 2.7 | 0.8 | 6 | 14 | 0 |
| elf | 54.8 | 1.2 | 0.3 | 7 | 3 | 0 |
| draconic | 209.0 | 75.4 | 21.8 | 114 | 425 | 17 of 72 |

**How large does a separation have to be before it means anything?** Read the travel columns. Among
the four ordinary species that arrive quickly, a six-seed interval endpoint moves by **up to 14
ticks** between one set of seeds and another — orc's `max` — and by 3 to 10 ticks routinely. A
claimed gap of one or two ticks between point estimates is inside that. Draconic is in a different
regime entirely and is discussed below.

The paired standard error is much tighter than the endpoint travel, because it is a statement about
a *mean* rather than about an extremum. Both are reported and they are not interchangeable: a
published claim of the form "these intervals do not overlap" must be judged against the endpoints,
and only a claim about mean arrival may be judged against the SE.

## Every seed-dependent claim `main` asserted, re-rolled — and four were retired

**The first pass of this audit counted only `a.high < b.low` claims and reported "three of six".
That was itself an incomplete audit, and it missed `draconic.low < human.low`.** Every interval
claim in the file was then re-measured with `claimRate`, which takes an arbitrary predicate rather
than one comparator shape. Eight distinct claims, twelve sets, tier 3 — **four do not reproduce**:

| claim | held in | kept? |
| --- | ---: | --- |
| `gnome.high < elf.low` | **12/12** | kept |
| `dwarf.high < elf.low` | **12/12** | kept |
| `gnome.high < human.low` | **12/12** | kept |
| `draconic.high > elf.high` | **12/12** | kept |
| `orc.high < elf.low` | 11/12 | **retired** |
| `overlaps(gnome, dwarf) === true` | 7/12 | **retired** |
| `draconic.low < human.low` | 5/12 | **retired** |
| `human.high < orc.low` | **0/12** | **retired** |

All four were removed from `reference-time-to-tier.test.ts` on 2026-08-14, and none of the four that
reproduce was weakened. **A green test asserting something false is worse than a red one**, and
`human.high < orc.low` was the sharpest instance: #127's *"9.9 is one species closer than it has
ever been"*, retracted by its own author after a re-roll, and still green here because this file
runs on the one seed set it was true of.

`orc.high < elf.low` is retired despite holding in 11 of 12 sets, and that is not a demotion of the
effect: orc really is faster than elf, by 26.7 standard errors. It is a statement about the *file* —
one seed set cannot express "11 of 12", so the rate lives in
`species-separation-spread.test.ts` and the assertion does not live here at all.

`overlaps(gnome, dwarf) === true` is the one that looks harmless, and it is the reason the audit had
to cover the whole file: **a claim that two species are indistinguishable is exactly as
seed-dependent as a claim that they can be told apart.**

`draconic.low < human.low` is the one the narrower audit missed, and it is really the draconic
censoring problem wearing an assertion. Draconic's `min` endpoint travels 114 ticks between seed
sets. Nothing about where draconic *starts* is measurable at 720 ticks.

The exact source text of all four is pinned in the guard test, so re-adding one fails there — naming
the rate that retired it — rather than passing here on a lucky seed list.

### The paired gaps behind the five strict separations

Twelve sets, tier 3:

| separation | asserted as | strict in | paired gap | verdict |
| --- | --- | ---: | ---: | --- |
| gnome < human | `gnome.high < human.low` | **12/12** | 5.6 ± 0.1 ticks = 70.5 SE | **established** |
| gnome < elf | `fastTrio.high < elf.low` | **12/12** | 30.5 ± 0.3 ticks = 90.4 SE | **established** |
| dwarf < elf | `fastTrio.high < elf.low` | **12/12** | 27.1 ± 0.4 ticks = 62.2 SE | **established** |
| orc < elf | `orc.high < elf.low` | 11/12 | 20.6 ± 0.8 ticks = 26.7 SE | inconclusive |
| human < orc | `human.high < orc.low` | **0/12** | 4.3 ± 0.8 ticks = 5.4 SE | **refuted** |

`human < orc` is #127's *"9.9 is one species closer than it has ever been"*. That finding was
reported as retracted after a re-roll — and **the assertion is still on `main`.** It is not merely
weak: across twelve fresh sets, orc's fastest arrival lands between 24 and 30 while human's slowest
lands between 30 and 35, and they overlap every time.

The obvious alternative explanation was checked rather than assumed: perhaps the committed seed list
is not an unlucky draw but an unrepresentative *corner* of the seed space, since it is six small
consecutive integers while a derived set is six avalanched 32-bit values. Four consecutive-integer
sets were cut the same way — `0x00090001`, `0x00090007`, `0x0009000d`, `0x00090013`, six each — and
they behave like the derived ones, with orc's `min` at 32, 30, 27 and 26. **`human < orc` holds in
one of sixteen seed sets, and it is the set it was measured on.**

`orc < elf` failing one set in twelve is a different and milder thing. It fails where elf's own
interval happens to reach down to 45; orc is genuinely faster than elf on average by 26.7 SE. It is
recorded as inconclusive rather than established because the published claim is about intervals, and
that claim does not always hold.

## Verdict on #140's four-species ordering

> *"gnome, dwarf, human and elf now form a strict chain — four species separated by more than the
> cross-seed spread, which is what task 9.9 asks for."* — PR #140

### It survives a re-roll in 1 of 12 seed sets.

That rate is the measurement. **REFUTED** is a label put on top of it by a rule stated below, and a
reader who prefers a different rule can apply it to the same number.

Measured on `w18/academic-primitive-consumers` at `1ae52c3` — the branch that made the claim — 12
sets, tier 3, 720 ticks:

| link | strict in | paired gap | verdict |
| --- | ---: | ---: | --- |
| gnome < dwarf | 4/12 | 2.3 ± 0.3 ticks = 8.5 SE | inconclusive |
| dwarf < human | 3/12 | 2.4 ± 0.3 ticks = 8.6 SE | inconclusive |
| human < elf | **12/12** | 14.7 ± 0.2 ticks = 79.3 SE | **established** |
| **whole chain** | **1/12** | — | **refuted** |

The chain is a conjunction — *"these four separate"* — and it survives a re-roll **once in twelve**.
On `main` the same chain holds **0 of 12**. Neither of the two new links reproduces: at 2.3 and 2.4
ticks they are smaller than dwarf's own endpoint travel of 10 ticks.

**Refuted, not merely inconclusive**, and the distinction is deliberate. No single link is
individually refutable — each separates in three or four sets — but the claim made was about the
four together, and a claim that survives a re-roll less than one time in four has been answered by
the re-roll. The rule is written down in `CHAIN_REFUTED_FRACTION` so nobody has to re-derive it.

**That threshold was chosen after the measurement, and saying so is part of the finding.** The other
two — `ESTABLISHED_STANDARD_ERRORS = 3` and `MIN_SETS_FOR_REFUTATION = 4` — were fixed before any
number came back. The chain rule was not: the need for a chain-level rule at all only became visible
once #140's chain turned out to fail as a whole without any link failing alone. Picking a line after
seeing the data is the exact move this document exists to police, so it is argued on principle — a
conjunction is what was claimed — and the threshold-free number, 1 of 12, is what every statement of
the verdict leads with.

**A verdict is a function of K; a reproduction rate is not.** `dwarf < human` is 0/4 at the guard
test's four sets, which the rule calls *refuted*, and 3/12 at the bin's twelve, which it calls
*inconclusive*. Both are honest and the instrument is not contradicting itself: the rate is the
measurement, and the label depends on how many sets you took. Quote rates, not labels.

**What #140 is not.** It is not a measurement error: its published table reproduces to the tick.
Every species did get faster, the mechanism it wired is real and separately evidenced, and
`human < elf` — the one link that reproduces — was already established on `main` at 12/12 and 64.7
SE. What does not follow is the sentence about task 9.9.

### Task 9.9 on both refs

The relations that separate robustly (12/12 sets, ≥ 3 SE) are the **same four before and after**:

```text
main   cc20d54    gnome < human,  gnome < elf,  dwarf < elf,  human < elf
w18    1ae52c3    gnome < human,  gnome < elf,  dwarf < elf,  human < elf
```

As a graph that is `gnome → human → elf` with `dwarf → elf` hanging off it: **three species in a
chain, not four**, plus a fourth species ordered against only one of them. Task 9.9 wants four
species separated by more than the cross-seed spread. Neither ref delivers it. The branch made every
species faster and left the separable structure exactly where it was.

`w18` also loses one relation `main` had: `orc < elf` goes from 11/12 to **0/12** (paired gap 6.6 ±
1.4 ticks), because orc speeds up more than elf does and the two intervals close. That is reported,
not judged — it is a consequence of a change whose purpose was elsewhere.

## #137, all seventy cells: it does not separate species, and it breaks the horizon

`w115/enable-all-cells` at `d6c32d0`, same instrument, same design — 12 sets, tier 3, 720 ticks.

**The headline is not a separation result. It is that 720 ticks is no longer a valid horizon for
this ruleset, so most numbers taken there are statements about censoring.**

| species | grand mean | on `main` | censored, of 72 runs |
| --- | ---: | ---: | ---: |
| gnome | 526.6 | 24.3 | 0 |
| dwarf | 527.2 | 27.7 | 0 |
| draconic | 576.6 | 209.0 | 20 |
| orc | 582.5 | 34.2 | 11 |
| elf | 667.0 | 54.8 | 24 |
| human | 674.6 | 29.9 | **51** |

Every species is roughly **twenty times slower** to tier 3 — unsurprising with 70 cells enabled
instead of 12 — and the horizon does not move with it. **Human reaches tier 3 inside 720 ticks in 21
of 72 runs.** In two whole seed sets it never does, so those sets drop out of every comparison that
reads it, and in the ten that remain human's observed arrivals are a survivorship sample: the runs
where it happened to arrive in time. Its mean is therefore biased *downward*, and the true gap
between human and the fast species is larger than the table shows.

With that caveat stated, what the measurement can and cannot support:

- **It does not support any claim that #137 improves species differentiation.** Of `main`'s four
  robust relations, two survive here (`gnome < human` and `dwarf < human`, both 10/10 over the ten
  evaluable sets), `gnome < elf` and `dwarf < elf` fall to **8/12**, and `human < elf` **reverses** —
  elf now arrives *before* human on average, at −1.2 SE. Directionally that is fewer robust
  relations, not more, which is consistent with #137's own report of the occupancy Gini falling.
- **It does not support the opposite claim either, at this horizon.** The two relations that survive
  are exactly the two that read the most heavily censored species, so they are the two least
  trustworthy numbers in the table. Reporting "#137 has two robust separations" would be reporting
  an artefact of where the run was stopped.
- **`gnome < dwarf` is refuted outright at 0/12** with a paired gap of 0.7 ± 0.5 ticks. Those two
  species are indistinguishable under this ruleset, and that one is not a censoring artefact —
  neither species is censored in any run.

**What this costs to answer properly:** a horizon long enough to uncensor human under 70 cells, so
of the order of 2,400 ticks — roughly ten seconds a run rather than three, or about 20 minutes for
12 sets. That was not spent. The finding recorded here is the one that does not need it: **#137 did
not move task 9.9, and any species-differentiation number taken on it at 720 ticks needs re-taking
at a longer horizon before it means anything.**

## Tier 2, briefly

Tier 2 is measured because `reference-time-to-tier.test.ts` takes one of its assertions there and
prints both tiers so a reader can check the tier was not chosen to flatter the result. It does not
flatter it. Twelve sets, tier 2, the chain is **refuted on both refs at 0/12**, and `dwarf < human`
is individually refuted on both (0/12, gaps of 0.4 and 0.6 ticks). Tier 2 separates *fewer* species
than tier 3, which is what the sibling file already says.

## Draconic is censored, and the censoring is the finding

Draconic reached tier 3 inside 720 ticks in 55 of 72 runs on `main` and 51 of 72 on `w18`, and its
between-set sd is 75 ticks against a grand mean of 209. Its `max` endpoint travels **425 ticks**
between seed sets. No claim about draconic is worth making at this horizon: it is not a slow band,
it is a species whose arrival distribution is wide enough to straddle the horizon, and every
interval reported for it is partly a statement about where the run was stopped. Censoring counts are
printed per cell by the instrument for this reason.

## What this did not measure, and what it would cost

- **Only the reference universe, no player and no strategy arm.** Every run is `LONG_RUN_OPTIONS`
  with an empty action list. Whether species separate *under play* is a different question and needs
  the strategy arms; at 12 sets × 6 seeds × 8 strategies that is roughly 40 minutes per ref.
- **Only tiers 2 and 3.** Tiers 4 and up would censor most species at this horizon.
- **Only two refs.** No attempt was made to attribute `w18`'s changes to individual mechanisms; the
  branch was measured as a whole against `main`, and the two refs differ by five commits of `main`
  as well as by the branch, since `w18` was measured unmerged at its own head.
- **Draconic at a longer horizon.** Uncensoring it would need roughly 2,400 ticks, about ten seconds
  a run rather than three, so 12 sets is 20 minutes per ref rather than 4.

## The instrument

```sh
npm run typecheck                                    # the bin loads dist/
node packages/scenario/bin/species-separation.mjs --sets 12 --tier 3
node packages/scenario/bin/species-separation.mjs --chain gnome,dwarf,human,elf
node packages/scenario/bin/species-separation.mjs --pair human,orc --sets 20
```

It prints the calibration set first, then the **full per-set matrix** — K rows of six-seed intervals
— then the spread, then a verdict per pair. The matrix is printed rather than summarised on purpose:
a reader who watches an ordering wobble from set to set has understood the finding, and a reader
handed a standard error has been asked to trust one.

`packages/scenario/test/unit/species-separation-spread.test.ts` is the guard, at four sets — the
fewest at which "it never separated" may refute anything — and about 150 seconds. It pins a
**verdict** per claimed separation rather than an interval, because a pinned interval breaks
whenever anything moves and trains a reader to re-record it, while a pinned verdict breaks only when
the answer to the question the project cares about changes. It also counts the strict separations
the sibling file asserts, so that a new one cannot be added without a row saying how many re-rolls
it survives.

**Four assertions in `reference-time-to-tier.test.ts` were retired on 2026-08-14** — the four in the
audit table above that do not survive a re-roll — and **the four that do were left exactly as they
were.** Nothing was tuned to make anything pass: no species magnitude, no cost, no content file and
no `balance/` baseline was touched, and `goldens:regen` was not run. The deletions are deletions of
claims that were not true of anything except their own seeds.

The file's module docstring now says why its own statistic could not have caught that — `[min, max]`
non-overlap has no standard error and is not stable in `n`, so it gets strictly easier the fewer
seeds you take — and points at the guard for the rate of every claim, live and retired.
