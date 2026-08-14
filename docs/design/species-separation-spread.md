<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The cross-seed spread on a species separation

**Measured 2026-08-14.** **Refs:** `main` at `cc20d54`, and
`w18/academic-primitive-consumers` at `1ae52c3` — PR #140, unmerged, measured at its own head
rather than merged with `main`, because #140's numbers were taken there and merging would have
changed the treatment. **Instrument:** `packages/scenario/src/species-separation.ts`, driven by
`packages/scenario/bin/species-separation.mjs`, at its default design — 12 independent seed sets of
6 seeds, tier 3, 720 world ticks, `LONG_RUN_OPTIONS`. 72 runs per ref per tier. **Nothing under
`balance/` was read, written, or regenerated, and `goldens:regen` was not run.**

Every number here is a statement about those two refs on that date. Re-measure before quoting it.

## The one-paragraph answer

**Task 9.9 is unmet on both refs, and it was unmet by more than anybody had measured.** Four
species-pair relations separate robustly on `main` and the *same four* separate on `w18` — the
branch did not change which pairs are distinguishable, only how fast every species is. Of the five
strict separations `reference-time-to-tier.test.ts` asserts on `main`, **two do not reproduce on a
fresh set of seeds**, and one of those two — `human < orc` — reproduces in exactly **one of sixteen**
seed sets: the one it was measured on. #140's `gnome < dwarf < human < elf` chain survives a re-roll
in **1 of 12** sets on the branch that claimed it and **0 of 12** on `main`.

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

## Every separation `main` asserts, re-rolled

`reference-time-to-tier.test.ts` asserts five strict separations. Twelve sets, tier 3:

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

### REFUTED.

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

**No assertion in `reference-time-to-tier.test.ts` was changed.** Those numbers are correct about
the seeds they were taken at, and rewriting them would be a behaviour claim rather than a
measurement. That `human < orc` is asserted there and reproduces in one seed set of sixteen is
recorded here and in the guard's docstring, and is the owner's call to act on.
