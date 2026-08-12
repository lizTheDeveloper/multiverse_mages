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
