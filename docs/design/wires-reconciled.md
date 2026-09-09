<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Reconciling the wiring campaign against W204's ablation

**Measured 2026-08-15 on `campaign/integrated` @ `e28563f4`, rebased onto `main` `457c8866`, on the
eval box after `npm ci` and `tsc --build` at that SHA.** Companion to
`docs/design/wires-that-never-bind.md` (#191), whose instrument this uses.

## Why this document exists

#191 and the wiring campaign ran in parallel and never saw each other. #191 measured `main`; the
campaign was on a branch. The obvious question — *do they contradict each other* — has a clean
answer, and asking it produced a finding the campaign's own gate could not have produced.

**First, the timing.** `packages/coordination/src/academic-effects.ts` does not exist on `main` at
any point up to #191. So #191 measured **unwired code**, and its inert rows are a diagnosis of the
condition the campaign set out to fix, not a refutation of the fix. The two agree about the world.

## The claim that made this worth checking

#191's opening is aimed squarely at how this campaign declared victory:

> **`check:consumption`** asks whether a primitive's authored node effects reach a consumer. Its own
> source now says it cannot distinguish a live wire from one whose magnitude never binds.

The campaign's exit condition was `check:consumption` **PASSED, 16/16, zero exclusions**. By #191's
argument that proves reachability and not effect. So the campaign was re-tested by ablation — #191's
method, not its own.

## What the ablation says

Every authored magnitude of one primitive scaled ×100, reference long run, 2,400 ticks, one seed.
`×1` is the control. **On `main` at #191, all five of these were byte-identical at ×100.**

| primitive | research | lessons | books | population | verdict |
|---|--:|--:|--:|--:|---|
| *control* | 4571 | 1867 | 1034 | 18731 | — |
| `research-rate` ×100 | 4541 | 1779 | 915 | 18390 | **moves** |
| `teach-rate` ×100 | 4564 | **1288** | 1080 | 18996 | **moves** — lessons −31% |
| `scribe-rate` ×100 | 4407 | 1414 | 1023 | 18873 | **moves** |
| `lifespan` ×100 | 4571 | 1867 | 1034 | 18731 | **byte-identical** |
| `fertility` ×100 | 4571 | 1867 | 1034 | 18731 | **byte-identical** |

### The three academic rates are genuinely live

They were byte-identical at ×100 on `main` and they move here. That is the campaign's central claim
tested by the instrument built to catch exactly the failure it might have been — and it holds.
`teach-rate` moving lessons by 31% is the strongest single result: #191 records that primitive as
*"not reproduced — and the measurement here is stronger. Byte-identical at zero and at ×100."* It is
no longer byte-identical.

### `lifespan` and `fertility` are wired and inert, and the reason is content

They are consumed — `check:consumption` names `coordination/knowledge-vitality.vitalityBonuses` for
both — and they move nothing. That is precisely the defect class #191 exists to name, arriving in
work done *by* this campaign, and it would not have been caught by any gate the campaign used.

The cause is **content-scoped, not structural**, and the distinction is #191's:

| primitive | authored nodes | inside the v1 rectangle |
|---|--:|--:|
| `research-rate` | 55 | **7** |
| `teach-rate` | 20 | **6** |
| `scribe-rate` | 19 | **4** |
| `lifespan` | 17 | **0** |
| `fertility` | 5 | **0** |

The three that move are exactly the three with nodes inside the opening square. The two that do not
have **zero**. So the wire is correct and the reference universe has nothing to send down it — the
same shape as #191's own fertility row (*"0 of them inside the opening square"*), and the same shape
as the depth-lift whose human arms were byte-identical because a human universe founds no library.
**The denominator is zero.**

This is a real limit and not a technicality: the campaign shipped two wires whose only evidence of
working is that a gate stopped complaining. They are exercised by unit tests and by nothing else.

## What follows

1. **`check:consumption` is necessary and not sufficient, and the campaign's exit condition should
   have said so.** It proves a node effect reaches a consumer. It cannot prove the consumer moves.
   Every claim this campaign made on the strength of that check inherits the gap; the three academic
   rates survive re-testing and the two vitality wires do not.
2. **An ablation belongs in the gate, not in a tool nobody runs.** `tools/w204/` answers the
   question; nothing schedules it. The cheapest useful version is an amplification arm on the
   primitives a change touches, run once per release rather than per commit.
3. **`lifespan` and `fertility` need a v1 carrier before they can be claimed to work.** Either the
   opening square widens to a cell that authors them, or a v1 node is authored to carry one. Until
   then the honest status is *wired, untested by any run*.
4. **The amplification probe used here had the defect it hunts, twice.** It restored the content
   file only on success, so a throw left the file amplified and the next run compounded on it —
   192 became 1.9×10¹⁴ across four retries, and the symptom was a schema error rather than a wrong
   number. It also forced magnitudes positive, which the `technique-sign` rule caught by refusing
   `pn-the-nameless`. Both are recorded because the second one is a rule this campaign added
   catching a mistake this campaign made, on its first real edit.
