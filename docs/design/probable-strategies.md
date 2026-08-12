<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The probable strategies, as measured

**Build:** `w1/ascension-stance` (`4ea0fcf`), reference-universe-v1, content revision `2512ea02…`.
**Instrument:** 96 runs, eight strategies round-robin, 12 runs each, 2400 world ticks (200 years).

Everything here is measured. Where a claim is inferred rather than read off a record, it says so.

## Read this caveat first

Two confounds are live in the numbers below, both found while producing them:

1. **The axis off-by-one.** The pool's `technique(round)` and `form(round)` return `0..count-1`,
   while `coordination`'s `axisPlan` accepts `1..count`. So one `permitTechnique` in five and one
   `permitForm` in fourteen is *silently* refused, and **the fifth technique and fourteenth form
   have never been permitted by any strategy in any measurement ever taken**. `illegalActionRate`
   cannot see it: the mask says legal and the gate passes those parameters through. Nothing below
   that reads "a god that permits an axis" is safe to read that way yet.
2. **`terminalReason` is not in the run record.** Route attribution below is inferred from tick
   clustering — `ERA_TICKS` is 240, so `goodEraRun >= 4` completes at tick 960 — not read directly.

Both are being fixed. Neither changes the shape of what follows, and saying so is a prediction that
can be checked rather than a reassurance.

## What the god can actually change

Three axes exist. Two more are advertised and do nothing.

| Axis | Evidence | Live? |
|---|---|---|
| **How much magic is permitted** | 217.3 nodes known (`permissive-breadth`) against 51.0 (passive) against 7.7 (`narrow-depth`) | **yes, strongly** |
| **When you declare** | wins cluster at ticks 707 / 962 / 1201 / 1202 | **yes** |
| **How much risk of ruin you accept** | `narrow-depth` stagnates 5/12, `denial-warden` 3/12, everyone else 0/12 | **yes** |
| Worship and the favor economy | `worship-maximizer` ends at 51.0 nodes — the passive baseline | no |
| Portals and raids | `openPortal` has no candidates in a single-universe run; permanently masked | no |

Population is a fourth non-axis: no strategy separates on living mages, population, peak population
or population change. Four of the ten reference metrics are blind to every strategy.

## The five probable strategies

These are the plays a human would find, in the order they would find them.

### 1. Wait and declare — *the one that must stop working*

Do nothing. Around tick 600 the worship tier crosses `ascension-tier-gate`; around tick 960 four
era boundaries have passed with zero node losses and zero library dependence. Declare. Win.

Measured: `uniform-random-legal` — which plays no strategy at all and presses buttons uniformly —
ascends **12/12** at a median tick of **707**, ending with **50.4** nodes known. `portal-rush` and
`worship-maximizer` do the same thing more slowly, both **12/12** at tick **962** with **50.9** and
**51.0** nodes. All three finish at the knowledge level a universe reaches when the god never acts.

This is the dominant strategy today and it is a defect, not a playstyle. It exists because Path B's
sign is inverted: a passive universe loses no nodes and has no single-copy nodes, so **doing nothing
is perfect custodianship**. The endurance route rewards the absence of play.

### 2. Open the floodgates — *the only strategy that currently plays the game*

Permit every technique and form; fund universities; push research. Measured: **217.3** nodes known,
four times the passive baseline, ascending **12/12** at tick **962**.

It is the only strategy whose win is accompanied by evidence it did anything. If the game had one
honest strategy today, this is it — and a single honest strategy is the problem, not the solution.

### 3. Lock it down — *a real risk profile, and the surprise*

Forbid aggressively, interdict, drive one narrow cell. Measured: `narrow-depth` **7.7** nodes,
`denial-warden` **10.5** — a fifth of the passive baseline. They ascend **7/12** and **9/12**, and
they **stagnate 5/12 and 3/12**. Nobody else stagnates at all.

This is the most interesting result in the set, and it contradicts the earlier finding that these
two were near-duplicates. They are not: `denial-warden`'s median win is tick **1922** against
`narrow-depth`'s **1202**, and their ruin rates differ. A player choosing this line is trading a
lower win rate and a much later summit against a smaller, more controllable universe. **That is a
genuine strategic trade and it already exists in the build.**

### 4. Build the archive — *advertised, not yet real*

Fund universities, grant founding knowledge, bless the mages nearest death. Its written hypothesis
is that redundancy defeats the loss channel. Measured: **50.9** nodes — the passive baseline. It
ascends 12/12 at tick **1201**, which is its declared stance firing at round 1200, not an
achievement.

The metrics that would separate it — `knowledgeHalfLife`, `libraryDependence` — exist in the §7
registry and **are not collected by any sweep**, because only the ten `reference*` measures are
registered in the scenario. The archivist may be working. Nothing can currently see it.

### 5. Court the faithful — *advertised, not real*

Spend on what raises worship, hold favor otherwise. Measured: **51.0** nodes, the passive baseline,
winning at tick 962 like everyone else. Worship accrues from mages, universities and populace
whether or not the god acts, so the strategy's central resource arrives on its own.

## What variety would look like, and how far away it is

Four numbers say it:

| | measured | wanted |
|---|---|---|
| `ascensionRate` | **0.792** | 0.05–0.20 (§7) |
| strategies winning at the passive knowledge baseline | **5 of 7 winners** | 0 |
| share of wins taken by the top strategy | 16% *(evenly spread, for the wrong reason)* | < 60% |
| correlation between winning and knowing magic | **≈ 0** | strongly positive |

The third row is the trap worth naming: win share is *already* well spread, and it means nothing,
because almost everyone wins. Spread across strategies is necessary for variety and nowhere near
sufficient. A ruleset where everybody ascends is perfectly varied and is not a game. That is why the
tuner's score gates on the band first and only then optimises spread — and why it also scores
whether winners know more magic than losers, which is the thing an aggregate cannot see.

## The falsifiable statement this document makes

After the win condition is made discriminating, the measured pool should show: `ascensionRate`
inside 0.05–0.20; no strategy winning at the passive knowledge baseline; at least three strategies
with materially different win rates, ruin rates or summit timings; and a positive correlation
between ascension rate and nodes known.

*Disproved by* any of those failing on the 2400-tick eight-strategy sweep at `n >= 96`.
