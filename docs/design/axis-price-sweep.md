<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Pricing the opening square: W158, and why no flat price binds it

**Build:** `w-god-price` off `origin/main` (`5fbdd40`), reference-universe-v1, scenario build
`0.3.0`. Measured 2026-08-14.
**Instrument:** `tools/w158/run-arm.mjs` and `tools/w158/analyse.mjs`, over the shared W15
composition probe. Eight prices × two openings × six strategies × two starting cells, paired within
seed, 2400 world ticks.
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

Both are `"tuningStatus": "untuned"`.

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

