<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Integration round 3 — the results, under a repaired instrument

**Branch:** `integration/campaign-round-3`, from `origin/integration/campaign-round-2` at `0b54c84`.
Seven merges: W18, W22, W19, W24, W21, W25, `origin/main`.

**What makes this round different from round 2 is not a mechanic. It is the scorer.** W18 merged
first, deliberately, so every number below is taken with the repaired instrument — and the first
thing to report is that **a headline figure from round 2 changes sign** without the game changing at
all.

---

## The negative control, first

**`permit-then-idle` wins 38 of 40** in the reference arm — a bot that presses two permit buttons for
140 of 2,400 ticks and then submits an empty preference list forever.

It also holds the pool's **highest node count, 269.9**, while funding no university, blessing no
mage and encouraging no research. It beats `permissive-breadth`, which does all three, on the same
seeds — 38/40 against 36/40.

Round 2 measured 40/40. **This is not an improvement worth reporting as one.** Two runs out of forty
is inside the noise of an entity-allocation change, and this round contains exactly such a change
(W24 re-keys every per-actor stream). The verbs are still worth slightly less than nothing.

---

## D1–D9, each `failed` or `saturated`

Measured at **2,400 ticks, n = 400 per arm**, the **full ten-strategy pool including both adversarial
probes**, `replicates` a multiple of the pool size, **coverage asserted before any aggregate is
printed** — 40 runs per strategy, exactly, in every arm.

| # | criterion | number | verdict |
|---|---|---|---|
| D1 | rate in 0.05–0.20 | **0.1850** (10-pool); 0.1286 (7 deliberate) | **passed, and pool-dependent** |
| D2 | exploit margin ≥ 0.10 | **−0.8214** | **failed** — and carries no information |
| D3 | ≥3 winners, none > 60% | **2 of 10**, top 51.4% | **failed** |
| D4 | correlation > 0 | Pearson **+0.9812**, Spearman **+0.7049**, **2** non-zero | **saturated** — unsupported |
| D5 | halfLife falls; nodes leave | instrument absent | **not measurable** |
| D6 | nobody wins at the passive baseline | no winner ≤ 51.05 | **passed, saturated** |
| D7 | species mix changes the winner | see below | see below |
| D8 | verify green, baselines justified, no goldens | all three clauses | **passed** |
| D9 | >1 playstyle per species | see below | see below |

### D1 — passed, and the band is still a property of the pool

`0.1850` with the probes, `0.1286` without. **The gap is 46% of the band's width, and it is pool
composition rather than ruleset.** Round 2 measured the same effect at 65%. Reporting a single
`ascensionRate` without saying which pool produced it remains meaningless.

### D2 — failed, and this is the round's most important instrument finding

**Round 2 published +0.2167 PASS. The repaired margin reads −0.8214 FAIL.** The game did not get
worse between the two measurements; the old margin could not see what was wrong with it:

- The **old** margin computed the pool mean *including* the probes, making it algebraically
  `ascensionRate − probeRate` — D1 wearing a second name, with `EXPLOIT_MARGIN_MIN` equal to
  `band.min`. Two constraints, one number.
- The **repaired** margin is the **deliberate-strategy mean minus the worst of three probes**
  (`uniform-random-legal`, `idle-then-declare`, `permit-then-idle`), against a floor raised
  0.05 → **0.10**.

**D2 carries no information while the probe is winning.** A margin computed against a probe at
0.9500 measures how far the deliberate strategies are behind an exploit, not whether the game rewards
play. It becomes readable the day the probe rate is 0, and not before. It is reported here because
the brief asks for it, not because it constrains anything.

### D3 — failed

Two strategies of ten win anything at all: `permit-then-idle` 51.4% of wins, `permissive-breadth`
48.6%. Variety 0.3009. Round 2 measured 2 of 10 and a 51.3% top share; this is the same result.

**D3 is failed rather than saturated**, and the distinction matters: the measurement can tell the
difference between one winner and three, and the answer is two.

### D4 — saturated, not passed

Pearson **+0.9812** and Spearman **+0.7049** both look healthy. **Both are statements about two
leveraged points.** W18's support gate refuses the term below three winners, so it contributes **0**
to the score, and the honest report is that the correlation is arithmetic rather than evidence.

This is the defect W18 was written to repair, reproducing exactly on live data. Round 2 reported
"passed, weakly" on Pearson +0.976 / Spearman +0.685 with 2 non-zero — the same shape, scored as a
pass.

The measured node vector also **cannot supply a positive control** for D4 on this content set:
`permit-then-idle` holds the pool's *highest* node count while being the strategy that should never
win. No assignment of wins over this data makes knowledge monotone with winning.

### D5 — not measurable, and the reason is unchanged

`knowledgeHalfLife` is a **per-run** metric, so it must be named in the sweep's `metrics`, and a
sweep may name only the ten `reference*` measures the scenario registers. Underneath that,
`CensusSample` carries `nodesKnown` as an aggregate count with no node-id list, so the Kaplan–Meier
estimator over node cohorts has no input.

**W22 merged the instrument that fixes this** — `knowledgeCensus` is per-node and location-aware —
but it is a diagnostic projection outside the observation vector and is **not wired into the sweep's
metric registry**. That wiring is the next step, and it is small.

### D6 — passed, and saturated

No winner sits at or below `passive-control`'s 50.98 ± 0.02 nodes. But the reason is the content
ceiling, not discrimination: the two winners are at 264.8 and 269.9 because they **permit cells**,
and every one of the seven non-winning deliberate strategies sits at 51.0 or below. **51 is
everything the v1 ruleset can reach.** D6 passes because the distribution is bimodal, not because
the game separates play.

### D8 — passed, all three clauses

- `npm run verify` on the final tree: **285 test files / 4,038 tests, all pass.**
- All three balance gates **PASS at delta `0.00000`** after the single regeneration.
- **No golden fixture was regenerated or changed at any of the seven merges.** Fingerprints checked
  at every step and byte-identical to round 2.

---

## What the campaign's own instruments say about themselves

`capitalSnowball` **breaches its guard again, harder**: 0.4327 in the reference arm against the
**0.35** its sibling `worshipSnowball` is held to, and `worshipSnowball` sits at 0.1208. In the gnome
arm `capitalSnowball` reads **0.9895**. §6a's *"two compounding loops that feed each other… produces
runaway leaders"* warning, one of them running hot and getting hotter. Not tuned away.

---

## D7 and D9 — the species arms

Three arms at **n = 400 each**, varying `foundingSpeciesMask` and nothing else, all at the same
default tradition so the comparison is clean:

| arm | rate | strategies winning anything | top winner |
|---|---|---|---|
| gnome | **0.0650** | 2 of 10 | `permissive-breadth`, 15 wins |
| human | **0.0000** | **0 of 10** | nobody ascends |
| orc | **0.0000** | **0 of 10** | nobody ascends |

### D7 — failed, and saturated

**Distinct top-winner identities across the three arms: one.** The rate moves 0.0650 → 0.0000 →
0.0000; **who wins does not.** This reproduces round 2's result exactly — *"rate moves
1.000→0.350→0.000, winner identity invariant"* — under a different scorer and different mechanics.

It is **failed and saturated at once**, and the two words are doing different work:

- **failed**, because the criterion asks whether the species mix changes which strategy wins, and in
  the one arm where anything wins, the winner is the same strategy that wins everywhere else.
- **saturated**, because **two of the three arms have no winner at all**, so there is no identity in
  them to compare. A criterion about *which* strategy wins cannot be evaluated against an arm where
  none does. Two thirds of this measurement is not a finding about species; it is a finding that a
  single-species universe of humans or orcs does not reach the win condition in 2,400 ticks.

### D9 — failed

| arm | strategies at ≥10% of the arm's wins |
|---|---|
| gnome | 2 — `permissive-breadth`, `permit-then-idle` |
| human | **0** |
| orc | **0** |

Gnome's "two" is one deliberate strategy and **one adversarial probe**. Read honestly, **no species
has more than one viable playstyle, and two of three have none.**

### The orc and human arms are a finding in their own right

Orc universes collapse: every strategy ends between **0.0 and 8.8 nodes known**, and 245 of 400 runs
**stagnate**. Human universes survive — `permissive-breadth` reaches 113.1 nodes — but **nobody
ascends in 400 runs**, and 139 stagnate.

Neither is a balance magnitude problem that a constant fixes. A universe founded from one short-lived,
low-aptitude species does not accumulate enough knowledge to reach any summit, and the ascension
predicates are anchored to a **passive baseline measured on the full species mix**. **The win
condition is calibrated against a universe that these arms are not.**

---

## Every figure from round 2 that does not survive

| figure | round 2 | round 3 | why it moved |
|---|---|---|---|
| **exploit margin** | **+0.2167 PASS** | **−0.8214 FAIL** | **the scorer**, not the game — the old margin was `ascensionRate − probeRate` |
| D4 verdict | "passed, weakly" | **saturated, contributes 0** | support gate at ≥3 winners; 2 non-zero both rounds |
| `ascensionRate` (10-pool) | 0.1950 | 0.1850 | small, and inside entity-re-keying noise |
| `capitalSnowball` | 0.4571 | 0.4327 ref; **0.9358–0.9895** species arms | worse, and much worse per species |
| `permit-then-idle` | 40/40 | **38/40** | two runs; **not an improvement** |

**Anything measured on another branch with the old scorer should be re-read before it is quoted.**
The exploit margin is the clearest case — it changed sign — but the general point is that D2 and D4
were both reporting numbers that could not fail, and every figure derived from them inherits that.

---

## What will need re-measuring when W20 and W23 land

Both are **on the remote and were not merged this round** (see the plan file for why). Everything
above is a measurement of a tree without them, and these are the parts that will not survive:

- **W20 changes the content graph itself** — tracks, anti-requisites, and per-mage exclusion. **Every
  number in this document is conditioned on the 51-node v1 ceiling**, and W20 exists to move it. D3,
  D6, D7 and D9 are all saturated *against that ceiling*; they must be re-measured, and their
  saturation verdicts specifically re-tested, because a criterion that is saturated is not a
  criterion that has failed.
- `contentRevision` will move again, so **all three baselines will need a second single
  regeneration** with its own rationale.
- **W23 was built on top of W22** and its diff already contains `tools/w22/census-report.mjs`; take
  W22's copy at that merge.
- **D5 may become measurable.** W22's census is the missing instrument; wiring it into the sweep's
  metric registry is the small step that turns D5 from *"not measurable"* into a number.

## The one interaction that only the combined tree could show

**W21 × W24 on species separation.** W21 lost orc's separation from elf to its research envelopes,
recorded it as a loss, and pinned it in a form that would reopen *"the day it separates again"*. It
separated on the merge — orc's slowest seed **37 → 29** against an elf floor of 36 — because W24
materializes five `territory-holding` entities on the first world tick and `deriveActorStream` keys
on the entity handle (§6).

**This is a fact about the instrument, not about the game.** Nothing made a species better at magic.
A six-seed interval moved because entity allocation changed, and it happened to move the way task 9.9
wants. The durable lesson is the one this campaign has already adopted: **orc's separation from elf
sits inside the noise of an entity-allocation change**, which is a weaker claim than either branch
made alone, and the combined tree is the only place either could be checked.

## The verdict

**The combined tree is not worse than its parts.** No golden changed, `packages/sim-core` is
byte-identical to round 2, every gate is at delta `0.00000` after one regeneration, and 4,038 tests
pass.

**It is also not better in any way a player would feel.** The negative control still wins the
reference arm, no species has more than one playstyle, two species cannot win at all, and the single
largest change in the whole round is that a scoring term stopped lying.

**That last part is the round's actual product.** Round 3's contribution is not a mechanic — it is
that the campaign can now tell the difference between a game that works and a scorer that says so.
