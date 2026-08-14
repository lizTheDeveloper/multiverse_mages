<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Pricing the opening square: W158, and why no flat price binds it

**Build:** `w-god-price` off `origin/main` (`5fbdd40`), reference-universe-v1, scenario build
`0.3.0`. Measured 2026-08-14.
**Instrument:** `tools/w158/run-arm.mjs` and `tools/w158/analyse.mjs`, over the shared W15
composition probe. Eight prices × two openings × four strategies × two starting cells, paired
within seed, 2400 world ticks. A twelve-strategy pilot at the shipped price selected the four.
**Factor:** `axisPriceScale` — `packages/scenario/src/axis-price.ts`, declared in
`REFERENCE_FACTOR_IDS`.

Every number below is read off run records. Nothing under `balance/` was regenerated.

---

## The result in five lines

1. **There is no flat price at which the opening square binds.** Between the shipped price, where
   the square is free to erase, and the price at which the god can no longer permit anything at
   all, there is no window in which permitting is *expensive*. The reason is arithmetic and it is
   given in full below.
2. **The binding constraint is the favor pool cap, not the god's income.** The cap tops out at
   **70 favor**; the whole grid costs **96**. So a price rise does not slow a god down — it moves a
   verb across a cliff from "affordable" to "structurally impossible", exactly the way
   `change-tradition` is impossible below the highest worship tier.
3. **The cliff arrives for techniques long before forms, and that breaks the grid asymmetrically.**
   A technique is priced at twice a form against a *common* cap, so the first thing a price rise
   does is delete the technique verb while leaving the form verb intact. The god ends holding a
   one-technique strip, which is not a smaller square.
4. **The differentiation half of the question cannot be asked of the shipped instrument.**
   `species-separation.mjs` runs `runLongReference`, which submits **no god actions, ever**
   (`long-run.ts`, task 9.1's *"zero player input"*). Its output is byte-identical at 1×, 8× and
   16×. No god-action factor can move it.
5. **This strengthens the "add drains, do not cut" direction rather than competing with it.** The
   campaign plan already reached that conclusion from Machinations' vocabulary and Cook's power
   matching. This adds a harder reason: a one-time toll cannot be made to bind against a pool
   ceiling smaller than the thing being bought, at *any* price, because the ceiling clips the
   purchase before the price does.

---

## How the verbs are priced today

`packages/content/data/god-cost.json`, read through `Fp` at 1/1024 — the units trap the campaign
plan already corrected once:

| action | id | raw `Fp` | favor |
|---|--:|--:|--:|
| `permit-technique` | 1 | 8192 | **8** |
| `forbid-technique` | 2 | 8192 | **8** |
| `permit-form` | 3 | 4096 | **4** |
| `forbid-form` | 4 | 4096 | **4** |

All four are `"tuningStatus": "untuned"`.

**The price is flat.** `interventionCost(actionId, costs, options)` in
`packages/coordination/src/god/favor.ts` is `base × hysteresis / fp(1024) × tier`, where `tier` is
1 for everything but a founding grant. So:

- **Nothing makes the second permit cost more than the first** in the sense that matters. The one
  escalator is `hysteresisMultiplier(changeCount)` = `fp(1024) + count × hysteresisStep`, and the
  count it reads is **per axis bit** (`AXIS_CHANGE_COUNTER`, decremented every
  `hysteresis-decay-ticks` = 60). It prices *flipping the same technique twice*, which is the
  portal-raid line it was built to close. Permitting fourteen *different* forms costs base fourteen
  times over.
- **Permit and forbid are equal by enforced invariant.** `packages/content/src/god.ts`'s
  `symmetric(1, 2, …)` and `symmetric(3, 4, …)` refuse a registry where they differ, on vision
  pillar 1's argument. Any repricing must move all four together, and `axis-price.ts` does.
- The technique:form ratio of 2:1 encodes fourteen cells against five.

The price is read in two places and must not drift: `resolveGodCosts` fills `deps.god.costs` for
the resolver, and `contentCatalogue` fills the mask's `ActionCostTable` for
`agent-api`'s affordability filter. Both read `registry.godCost(actionId)`, which is why the factor
is applied to the registry and nowhere else.

## The factor

`axisPriceScale`, an `fp` multiplier on actions 1–4. `1024` is the shipped price; `0` and `1024`
return the registry by identity, so a sweep that does not name the factor is byte-identical to one
written before it existed — `axis-price.test.ts` pins that against the snapshot hash. It is declared
in `REFERENCE_FACTOR_IDS` beside `openingTechniqueCount` and `foundingNodes`, and the executor's
content memo is keyed on **(tradition, price)** so a worker serving two price arms cannot serve the
second one the first one's content.

## Why the ladder is not geometric

The favor pool is capped at `favor-cap-base + favor-cap-per-tier × worshipTier` = `20480 + 10240 ×
tier` `fp`. `worshipTierOf` returns 0–5 against `worship-tier-count` = 5 and geometric thresholds
`512 × 2^t`, so:

| worship tier | reached at worship `fp` | favor cap |
|--:|--:|--:|
| 0 | — | **20** |
| 1 | 512 | 30 |
| 2 | 1024 | 40 |
| 3 | 2048 | 50 |
| 4 | 4096 | 60 |
| 5 | 8192 (of a 9216 maximum) | **70** |

Regeneration is `favor-regen-base + worship × favor-per-worship / 1024` = **1 to 5.5 favor per
tick**. Over the 140 rounds `permit-then-idle` spends permitting, that is 140–770 favor against a
96-favor grid. **Income has never been the constraint. The cap is.**

Which means a scalar on the base price does not traverse a smooth axis. It traverses this:

| scale | technique | form | technique affordable at | form affordable at |
|--:|--:|--:|---|---|
| 1× | 8 | 4 | tier 0 | tier 0 |
| 2× | 16 | 8 | tier 0 | tier 0 |
| 4× | 32 | 16 | **tier 2** | tier 0 |
| 5× | 40 | 20 | tier 2 | tier 0 |
| 6× | 48 | 24 | **tier 3** | tier 0 |
| 7× | 56 | 28 | **tier 4** | tier 0 |
| 8× | 64 | 32 | **tier 5** — worship ≥ 8192 of 9216 | tier 2 |
| 9× | 72 | 36 | **never** | tier 2 |
| 16× | 128 | 64 | **never** | tier 5 |

So if a window exists in which the price *binds* without *deleting* the verb, it is between 4× and
8× and it is narrow. A ladder of 1, 2, 4, 8, 16 would step over it. The sweep runs
**1×, 2×, 4×, 5×, 6×, 7×, 8×, 16×**, with 16× kept as the arm that must show the verb gone — because
"binding" and "deleted" are different findings and only one of them is useful.

---

## The sweep

All 384 intended runs completed. Four strategies, eight prices, two openings, two starting
cells, three replicates, common random numbers throughout — every arm walks the identical coordinate grid, and the two openings are paired
*within* (price, strategy, cell, replicate) so the seed cancels out of the difference.

**n is 6 per cell.** The standard errors below are of the paired difference and are **descriptive**.
Six paired observations do not support a confidence interval anybody should lean on, and the
argument here does not rest on one — it rests on the axis masks, which are near-deterministic per
arm.

### Distinct nodes reached: wide 3×4 minus narrow 1×2, paired within seed

| strategy | 1× | 2× | 4× | 5× | 6× | 7× | 8× | 16× |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| `permissive-breadth` | −2.0 | +5.3 | −6.0 | −4.0 | −1.2 | −5.7 | +9.2 | +75.7 |
| | ±3.0 | ±3.9 | ±3.5 | ±5.9 | ±4.0 | ±3.5 | ±31.7 | ±2.4 |
| `permit-then-idle` | +0.5 | +9.5 | +44.2 | +111.2 | +124.7 | +98.0 | +97.0 | +32.5 |
| | ±3.2 | ±4.7 | ±15.6 | ±10.7 | ±13.1 | ±4.4 | ±4.3 | ±1.6 |
| `allocate-concentrate` | −8.7 | +2.5 | +45.8 | +110.5 | +117.2 | +90.0 | +90.5 | +32.5 |
| | ±6.2 | ±8.4 | ±15.7 | ±8.4 | ±15.3 | ±4.3 | ±6.0 | ±1.6 |
| `passive-control` | +32.5 | +32.5 | +32.5 | +32.5 | +32.5 | +32.5 | +32.5 | +32.5 |
| | ±1.6 | ±1.6 | ±1.6 | ±1.6 | ±1.6 | ±1.6 | ±1.6 | ±1.6 |

The control price reproduces #156: `permit-then-idle` reaches **200.7 nodes from a 1×2 opening
against 201.2 from a 3×4** — a gap of **+0.5 ± 3.2** on a content set six times larger. The square is
erased.

**`passive-control` is byte-identical across all eight prices**, to the last decimal of every column.
It submits no action, so it is charged nothing, and it is the negative control that says the factor
touches nothing but the god's spending.

### What the god actually bought: open techniques × forms at termination

The opening is 1×2 narrow and 3×4 wide. **5×14 is the whole grid.**

| strategy | price | narrow | wide |
|---|--:|---|---|
| `permissive-breadth` | 1× – 7× | **5.0×14.0** | **5.0×14.0** |
| | 8× | 3.0×14.0 | 3.0×14.0 |
| | 16× | 1.0×14.0 | 3.0×14.0 |
| `permit-then-idle` | 1× – 2× | 5.0×14.0 | 5.0×14.0 |
| | 4× | 3.5×13.7 | 5.0×14.0 |
| | 5× | 1.7×13.3 | 4.3×13.8 |
| | 6× | **1.0**×12.3 | 3.7×13.3 |
| | 7× | **1.0**×10.8 | 3.0×12.8 |
| | 8× | **1.0**×10.0 | 3.0×12.2 |
| | 16× | **1.0×2.0** | **3.0×4.0** |
| `passive-control` | every price | 1.0×2.0 | 3.0×4.0 |

`allocate-concentrate` matches `permit-then-idle` to within a tenth at every price.

### The rejection counter is not the affordability instrument, and this run proves it

649,882 submissions, **3,143 rejections, every one of them `permissive-breadth`'s** —
`allocate-concentrate`, `permit-then-idle` and `passive-control` recorded zero across all 384 runs,
including the arms where the god could not afford a permit at any point in the run.

That is the expected shape and it is why the axis masks were recorded. The pool's fall-through walks
a preference list and submits the first entry **the mask admits**, so an unaffordable permit is a
*substitution* — the bot silently plays something else — and never a rejection. `permissive-breadth`'s
1–4 % is slot exhaustion against a short candidate list, it does not rise with the price, and it is
the documented behaviour `strategies.ts` calls *"the rejection reason a well-behaved strategy can
still produce"*.

**Anyone reaching for `illegalActionRate` to detect an unaffordable action will measure nothing.**

---

## What this says, and it is not "the price binds at X"

### 1. No price up to 7× moves `permissive-breadth` at all

It ends holding the **entire 5 × 14 grid** at 1×, 2×, 4×, 5×, 6× and 7×, from a two-cell opening and
from a twelve-cell one alike, and its paired gap stays inside ±6 nodes the whole way — the same band
it occupies at the shipped price.

The reason is the one the pool cap makes unavoidable. **A one-time toll cannot bind a god who keeps
spending**, because the horizon is 2400 ticks and income is 1–5.5 favor per tick: between 2,400 and
13,000 favor against a grid that costs 96 at the shipped price and 672 at 7×. `permissive-breadth`
permits for the whole run, so it simply waits and buys.

### 2. The prices that appear to bind are outlasting a bot's schedule, not pricing a decision

`permit-then-idle` and `allocate-concentrate` both permit for exactly **140 of 2400 rounds** and then
stop. Their gaps open dramatically from 4× — +44, +111, +125 — and that is the number the brief asked
for. But it is not the square binding. Read the axis column beside it:

**At 6×, 7× and 8× the narrow arm ends with `openTechniques` frozen at 1.0 — the value it was founded
with — while `openForms` climbs to 10–12.** The god did not choose a narrower ruleset. It bought
every form it could reach and was locked out of the technique axis entirely. A 1×12 strip is not a
smaller square; it is a different shape, and the strategy that produced it had no say in which.

Each technique is offered 28 times over those 140 rounds (`technique(round) = 1 + round % 5`), so
this is not a missed window. It is a wall.

### 3. The wall is the pool cap, and it arrives for techniques at half the price it arrives for forms

This is the structural finding, and it is the one a single number cannot fix.

A technique is priced at **twice** a form, against a **common** pool ceiling. So as the scale rises,
the technique verb crosses the affordability cliff at exactly half the scale the form verb does:

| scale | technique | needs cap | form | needs cap | consequence |
|--:|--:|---|--:|---|---|
| 2× | 16 | tier 0 | 8 | tier 0 | both free |
| 4× | 32 | **tier 2** | 16 | tier 0 | techniques wait on worship |
| 6× | 48 | **tier 3** | 24 | tier 0 | technique axis stalls |
| 8× | 64 | **tier 5** (worship ≥ 8192 of 9216) | 32 | tier 2 | technique axis effectively gone |
| 16× | 128 | **never** | 64 | tier 5 | 1×14 and 3×14 — a strip |

At 16× `permissive-breadth` still opens **all fourteen forms** and cannot buy a single technique: its
narrow arm ends at **1.0×14.0**. That is the shape of the failure, drawn.

**There is therefore no scalar at which both verbs are expensive-but-purchasable.** Between "both
free" and "techniques impossible" the band is roughly 2×–5×, and inside it the god's ruleset is
decided by which axis crossed the cliff rather than by any decision the god made. Raising the price
does not ration breadth; it rations one axis of the grid before the other.

### 4. The verdict, stated plainly

**No price in this range makes the opening square bind, and the range is not the problem.** A flat
one-time toll is the wrong instrument, for two reasons that compound:

- against a **2400-tick horizon** it is always eventually payable, so a persistent god ignores it
  (`permissive-breadth`, unmoved through 7×);
- against a **70-favor ceiling** it goes from payable to impossible over a factor of two, so there is
  no expensive middle — and the factor of two between a technique and a form guarantees the two
  verbs land on opposite sides of it.

The prices that produce a gap produce it by **deleting a verb from strategies with a time-boxed
permit phase**, which measures the bot's schedule and not the ruleset decision.

---

## The differentiation half of the question cannot be asked of the shipped instrument

`packages/scenario/bin/species-separation.mjs` reduces to `measureSeedSet` → `runLongReference`,
whose docstring is explicit: ***"No actions are submitted, ever."*** Task 9.1 asks for a scenario
with zero player input and `long-run.ts` honours it. A god that never acts is never charged, so **no
god-action factor can move this instrument**, and the price is not a special case.

Measured rather than argued: `measureSeedSet` over the first three `LEGACY_SEED_SET` seeds at tier 3
returns **byte-identical** per-species arrivals and censoring counts at `axisPriceScale` 1024, 8192
and 16384 — `1024 === 8192: true`, `1024 === 16384: true`.

Two consequences worth recording:

- **The censoring check the brief asked for is not applicable here.** Censoring is invariant with the
  price for the same reason the arrivals are.
- **`species-separation.mjs` cannot vary the opening square either.** `LONG_RUN_OPTIONS` hardcodes
  `openingTechniqueCount: 0` and `measureSeedSet` never passes `options` to `runLongReference`. Any
  earlier separation figure quoted *at a 1×2 opening* — the 65-of-72 draconic censoring from #156,
  for instance — came from a path this binary does not have. Whoever needs that comparison next has
  to plumb `options` through `SeedSetInput` first; it is two lines and it is not done here, because
  doing it silently would produce numbers that look like this tool's and are not.

---

## What moved, and what did not

**Nothing under `balance/` was regenerated and nothing under `balance/` moved.** The default path is
identity by construction — `withAxisPriceScale` returns its argument for `0` and for `1024`, and
`axis-price.test.ts` pins the tick-zero snapshot hash across both — so no committed sweep, baseline,
or golden fixture has a reason to change, and `git status` is clean of them.

`ui/session.json`'s `snapshotHash` is unmoved for the same reason and was not re-recorded.

`npm run verify` is green on this branch, including the three balance gates.

## What was not measured

- **A price above 16× or below 1×.** Above 16× nothing can change: both verbs are already past the
  cap at every tier. Below 1× the loader's *"assign-role is strictly the cheapest intervention"*
  invariant bites at about 1/16×, and `withAxisPriceScale` refuses rather than running it.
- **`denial-warden` and `uniform-random-legal` across the price ladder.** The pilot (12 strategies,
  one replicate, shipped price) shows both hold their opening square exactly, and
  `uniform-random-legal` *cannot* permit at all: it submits actions 1–7 bare and `CANDIDATE_SLOTS`
  covers only 8–14, so its permit submissions are refused before any price is consulted. They were
  dropped from the ladder to buy replicates.
- **Interaction with the grant budget.** `permit-then-idle` and `allocate-concentrate` differ in
  every verb but permitting and behaved identically here, which is weak evidence there is no
  interaction, but it is not a test of one.
- **Any price on a *recurring* footing.** This sweep varies a one-time toll only. The finding above
  is precisely an argument for measuring the recurring form next.
