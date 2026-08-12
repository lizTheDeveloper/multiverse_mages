<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The horizon, swept — was every measurement taken after the game was over?

**Build:** `w19/horizon-sweep`, from `integration/campaign-round-2` at `0b54c84` — the tree with all
eight workstreams merged. **Role:** measurer. No constant, rule or magnitude was changed. No golden
fixture and no balance baseline was regenerated.

*(Composition numbers land when the local arms finish. Everything below the production-arm heading
is measured and final.)*

## The question

Every diversity measurement this campaign has taken was at **2400 world ticks**, and the horizon is
the one variable eight workstreams never varied. **Does the strategy space have more than one
dimension before the content is exhausted?**

- **Yes** — dimensionality rises and containment falls at shorter horizons — means the game works
  and the horizon is too long for its content. A configuration finding, and good news.
- **No** — one dimension even where universes hold a fraction of the set — means the flatness is in
  the **content graph itself**, and no mechanic fixes it.

## The premise the brief handed me is false on this tree, and that is the first finding

The brief's framing was that `referenceNodesKnown` is **29.4 at 600 ticks** against a reachable set
of 51, so a 600-tick universe holds *"roughly 60% of the set — not exhausted"*, and a 300-tick one
about a third.

**Measured on this tree, at n = 400 per horizon on the production executor:**

| strategy | 300 | 450 | 600 | 900 | 1200 | 1800 | 2400 |
|---|--:|--:|--:|--:|--:|--:|--:|
| `passive-control` | **48.9** | 50.3 | 50.6 | 50.9 | 51.0 | 51.0 | 51.0 |
| `idle-then-declare` | **48.8** | 50.0 | 50.6 | 51.0 | 51.0 | 51.0 | 51.0 |
| `worship-maximizer` | **48.9** | 50.2 | 50.6 | 51.0 | 51.0 | 51.0 | 51.0 |
| `archivist` | **49.2** | 50.3 | 50.7 | 50.9 | 51.0 | 51.0 | 51.0 |
| `uniform-random-legal` | 54.7 | 58.1 | 59.5 | 60.9 | 62.0 | 62.3 | 62.1 |
| `portal-rush` | 47.2 | 44.4 | 42.2 | 43.6 | 42.8 | 47.9 | 51.7 |
| `narrow-depth` | 6.3 | 6.0 | 5.7 | 5.5 | 5.1 | 4.8 | 4.8 |
| `denial-warden` | 3.9 | 3.6 | 3.5 | 3.4 | 3.2 | 3.0 | 2.9 |
| `permissive-breadth` | 154.9 | 202.3 | 222.1 | 252.7 | 255.9 | 258.2 | 259.4 |
| `permit-then-idle` *(probe)* | 155.8 | 200.5 | 220.3 | 249.8 | 254.1 | 256.1 | 255.9 |

**A universe that the god never touches holds 48.9 of the 51 reachable nodes by tick 300** — 96% of
everything it can ever reach, in an eighth of the horizon every campaign measurement has used. The
29.4-at-600 figure describes a different build; it is not what this tree does.

So the brief's shortest horizon was **already past exhaustion**, and the sweep as specified could
not have seen the space open up even if it does. A second pass at **30, 60, 120, 180 and 240** ticks
was added under the same seeds. That is a change to the experiment, made because the first numbers
falsified its premise, and it is recorded here rather than folded in quietly.

Two smaller readings from the same table, both new:

- **The two deniers shrink.** `denial-warden` goes 3.9 → 2.9 and `narrow-depth` 6.3 → 4.8 as the
  horizon lengthens. Under an edict that forbids most of the grid, nodes decay out from under the
  universe and are not re-derived. Their longest run is their poorest.
- **`portal-rush` dips and recovers** — 47.2 at 300, 42.2 at 600, 51.7 at 2400 — the only
  non-monotone row in the table.

### The second pass, and the two findings in it

The same ten strategies, the same seeds, five shorter caps. n = 400 per horizon, production
executor. Mean `referenceNodesKnown`:

| strategy | 30 | 60 | 120 | 180 | 240 | 300 |
|---|--:|--:|--:|--:|--:|--:|
| `passive-control` | 14.7 | 28.1 | 39.4 | 45.8 | 47.7 | 48.9 |
| `archivist` | 15.9 | 27.5 | 38.6 | 45.2 | 47.8 | 49.2 |
| `worship-maximizer` | 15.2 | 28.9 | 39.9 | 46.1 | 47.8 | 48.9 |
| `idle-then-declare` | 14.6 | 27.3 | 39.5 | 46.0 | 47.5 | 48.8 |
| `portal-rush` | 15.9 | 27.6 | 38.4 | 45.6 | 46.5 | 47.2 |
| `uniform-random-legal` | 15.4 | 27.8 | 38.7 | 46.9 | 51.1 | 54.7 |
| `narrow-depth` | 8.2 | 10.2 | 9.2 | 8.9 | 6.4 | 6.3 |
| `denial-warden` | 13.6 | 13.7 | 13.6 | **12.8** | **4.1** | 3.9 |
| `permissive-breadth` | 14.0 | 28.0 | 58.1 | 91.0 | 123.0 | 154.9 |
| `permit-then-idle` *(probe)* | 13.5 | 29.4 | 59.3 | 92.1 | 126.3 | 155.8 |

**1. The one lever the campaign found live is inert for its first ~120 ticks.** At caps of 30 and
60, `permit-then-idle` (13.5, 29.4) and `permissive-breadth` (14.0, 28.0) are indistinguishable from
`passive-control` (14.7, 28.1) and from every other unrestricted strategy — **all ten sit inside a
two-node band**. Permitting a cell does not produce a node for roughly 120 ticks. So the window in
which universes hold a fraction of the reachable set *and* any strategy differs from any other in
count is, on this evidence, **empty**.

**2. `denial-warden` falls off a cliff between caps 180 and 240** — 12.8 to 4.1, and under common
random numbers these are the same universes, so roughly nine nodes leave in sixty ticks. That is a
discontinuity, not a drift. 240 is exactly one `ERA_TICKS`; that coincidence is recorded as a
hypothesis and was not chased further, because nothing in this measurement turns on it.

## The production arm — n = 400 per horizon, the real executor

Seven sweep files differing in `termination.worldTickCap` and in nothing else, run on Modal through
`run-sweep-distributed.mjs`. 2,800 runs.

### Integrity, checked rather than argued

- **Common random numbers: `runSeed` is identical on all 400 coordinates at every horizon**, checked
  pairwise against the 300-tick arm — 400/400 for 450, 600, 900, 1200, 1800 and 2400. Only the tick
  cap varies.
- **Coverage is exact**: ten strategies at exactly 40 runs each, at every horizon. `replicates` is
  400 and the pool is 10, so `strategies[replicateIndex % poolSize]` deals evenly — the failure mode
  that has already corrupted one shipped constant did not occur here, and is asserted rather than
  assumed.
- **The 2400 arm reproduces the integration round exactly**: `ascensionRate` **0.1950**, the same
  number `integration-round-2-results.md` reports at the same n. The instrument agrees with the
  record it is extending.

### Ascension by horizon, with both gates stated

| horizon | ascension window | canon reachable | ascensions | rate | apotheosis | canon |
|--:|---|---|--:|--:|--:|--:|
| 300 | **empty** | no | 0 | — | 0 | 0 |
| 450 | **empty** | no | 0 | — | 0 | 0 |
| 600 | **empty** | no | 0 | — | 0 | 0 |
| 900 | `[600, 900)` | **no** | **0** | 0.0000 | 0 | 0 |
| 1200 | `[600, 1200)` | yes | 69 | **0.1725** | 0 | 69 |
| 1800 | `[600, 1800)` | yes | 72 | **0.1800** | 1 | 71 |
| 2400 | `[600, 2400)` | yes | 78 | **0.1950** | 6 | 72 |

**Two structural gates, and neither is a finding about play:**

1. `ascension-min-tick` is **600**, and a run capped at `H` executes ticks `0 .. H-1`. The window is
   therefore `[600, H)` — **empty at 300, 450 and at exactly 600**. Reporting a zero at 600 as a
   rate would be reporting arithmetic.
2. Enduring Canon needs `goodEraRun >= ascension-era-count` (**4**), incremented at most once per
   era boundary, and `ERA_TICKS` is **240**. Four consecutive passes cannot land before tick **960**.
   So **horizon 900 admits apotheosis only** — and measures **zero of 400**.

**The first horizon at which any universe wins is 1200, and it wins by canon.** Apotheosis appears
at 1800 (1 run) and 2400 (6 runs); at every shorter horizon it is zero. The 0.05–0.20 band §7 asks
for is met at 1200, 1800 and 2400 — and is *unreachable by construction* below 1200.

### Who wins, at every horizon where winning is possible

| strategy | 1200 | 1800 | 2400 |
|---|--:|--:|--:|
| `permit-then-idle` *(probe)* | **35/40** | **36/40** | **39/40** |
| `permissive-breadth` | 34/40 | 36/40 | 39/40 |
| *every other strategy* | 0/40 | 0/40 | 0/40 |

**A shorter horizon does not make the god's other verbs matter.** `permit-then-idle` — which presses
`permitTechnique` and `permitForm` for 140 ticks and then submits an empty preference list forever —
wins at least as often as `permissive-breadth` at every horizon, and eight of ten strategies win
nothing at any horizon. The integration round's headline survives the horizon sweep intact.

## The decision rule, written down before the composition numbers were read

Counts are not composition, and the question is about composition. The composition arms are still
running as this is written, so the rule that will decide the verdict is fixed here first — that is
the only thing that makes the eventual claim immune to *"you picked the reading that flattered the
noise"*, in either direction.

**Containment below 1.000 at a short horizon is expected and is not the finding.** W15 already
measured min pairwise containment at 0.202 / 0.437 / 0.620 / 1.000 at ticks 240 / 480 / 960 / 1440.
Mid-acquisition scatter produces sub-unity containment on its own, and at 30–240 ticks
within-strategy seed noise is at its maximum: small sets, still moving.

**A second dimension is real at horizon H only if both hold:**

1. **cross-strategy containment is below the within-strategy diagonal** — strategies differ from
   each other by more than each differs from *itself* across seeds; and
2. **`betweenShare` stays high** (W15 measured 0.946 at 2400) among the **eight** v1-bound
   strategies — the strategy label still explains the variance, rather than noise explaining it.

   *(Eight, not the seven this rule first said. The v1 pool is defined by measuring which strategies
   hold nodes outside the fifty-one, and on this arm only `permissive-breadth` and `permit-then-idle`
   do — `uniform-random-legal` holds union 51 with **zero** nodes outside. The correction was made
   and committed at `0edc71e`, before any composition analysis output existed; the timestamps are the
   check on that.)*

If cross ≈ within, the verdict is the negative one and it will be stated plainly: **one dimension at
every horizon where the content is unexhausted; the count spread from tick 120 onward is the
permission axis and nothing else; the flatness is in the content graph.**

The rank cap is stated too: ten strategies bound strategy-level structure at nine components, eight
bound it at seven, no matter what the nodes do.

**One limit of the cross-check, so nobody assumes it covers more than it does.** The prefix
cross-check — *"the 2400 arm's composition sample at tick H equals the H-capped arm's terminal"* —
applies only to the first pass, whose sampling grid is 150. None of 30, 60, 120, 180 or 240 is a
multiple of 150, and the second pass has no 2400-tick run of its own. **The short horizons are
validated by being explicit capped runs, which is the authoritative method in either case.**



---

# The composition measurement — 2,800 runs carrying node identity

W15's probe, reused unchanged: an inert system appended to the world schema, reading
`collectRecords(state, KNOWLEDGE_INSTANCE)`. **Re-validated on this tree** — a probed and an
unprobed run agree on snapshot hash, terminal reason and tick count in **8 of 8** checks across four
strategies and two starting cells.

Ten strategies × two starting cells × 20 replicates = **400 runs per horizon**, seven horizons.
Strategy is passed explicitly rather than dealt by index, so `strategies[replicateIndex % poolSize]`
never runs; coverage is asserted anyway and is **exactly 40 runs × 10 strategies at every horizon**.
`runSeed` is identical on all 400 coordinates at every horizon.

## The prefix property, measured — the seven horizons are one set of universes

| horizon | pairs | exactly equal | **contained** | node gap |
|--:|--:|--:|--:|---|
| 300 | 400 | 374 | **400** | 19×1, 6×2, 1×3 |
| 450 | 400 | 378 | **400** | 22×1 |
| 600 | 400 | 391 | **400** | 9×1 |
| 900 | 400 | 396 | **400** | 4×1 |
| 1200 | 400 | 400 | **400** | — |
| 1800 | 400 | 400 | **400** | — |

Equality was the wrong test. The probe sits at the **end** of the system list, so its sample at tick
`H` is taken after tick `H` has run, while a run capped at `H` stops having run ticks `0 .. H-1` —
the capped terminal is one tick behind. Stated as containment, the property holds in **2,400 of
2,400** paired comparisons, and every gap is the one to three nodes acquired in that extra tick.

So the horizons are not seven experiments. They are **one set of universes read at seven moments**.

## 1. Saturation, first

`|held ∩ V1| == 51`, with the fifty-one derived from content (`v1CellIds()` → 12 cells → 51 nodes,
ids 97–112, 215–231, 274–291).

| horizon | saturated runs | fraction | mean v1 coverage |
|--:|--:|--:|--:|
| 300 | 4/400 | **0.0100** | 35.9 |
| 450 | 86/400 | **0.2150** | 38.2 |
| 600 | 165/400 | **0.4125** | 39.0 |
| 900 | 225/400 | **0.5625** | 40.1 |
| 1200 | 231/400 | **0.5775** | 40.3 |
| 1800 | 234/400 | **0.5850** | 40.4 |
| 2400 | 236/400 | **0.5900** | 40.4 |

**The pool fraction ceilings at 0.59 because four of the ten strategies can never saturate** — the
two deniers shrink their own reachable set by edict, and the two ruleset editors leave v1 and hold
only part of it. Among the six that can, saturation is essentially complete by 900:

| strategy | 300 | 450 | 600 | 900 | 1200 | 2400 |
|---|--:|--:|--:|--:|--:|--:|
| `passive-control` | 1/40 | 16/40 | 29/40 | 38/40 | 39/40 | 40/40 |
| `idle-then-declare` | 1/40 | 16/40 | 29/40 | 38/40 | 39/40 | 40/40 |
| `worship-maximizer` | 0/40 | 15/40 | 31/40 | 40/40 | 40/40 | 40/40 |
| `archivist` | 1/40 | 12/40 | 23/40 | 38/40 | 40/40 | 40/40 |
| `uniform-random-legal` | 0/40 | 17/40 | 32/40 | 37/40 | 36/40 | 38/40 |
| `portal-rush` | 1/40 | 10/40 | 21/40 | 34/40 | 37/40 | 38/40 |

**Horizon 300 is the only one in this pass where the content is genuinely unexhausted** — 1% of runs
hold everything. It is also where the universes already hold **48.5 of 51 on average**. The gap
between "95% of the set" and "all of it" is the whole of the unexhausted window.

## 2. Dimensionality, containment and prefix fidelity

### The full ten-strategy pool

| horizon | 80% | 95% | participation | between-strategy variance | containment mean | containment min | **within-strategy** | prefix fidelity |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 300 | 2 | 21 | **1.94** | 0.869 | 0.862 | 0.537 | 0.964 | **0.8970** |
| 450 | 2 | 16 | **1.75** | 0.902 | 0.902 | 0.670 | 0.965 | **0.9214** |
| 600 | 2 | 20 | **1.77** | 0.894 | 0.913 | 0.673 | 0.963 | **0.9276** |
| 900 | 2 | 20 | **1.77** | 0.886 | 0.934 | 0.673 | 0.964 | **0.9278** |
| 1200 | 2 | 19 | **1.74** | 0.891 | 0.941 | 0.667 | 0.962 | **0.9289** |
| 1800 | 2 | 19 | **1.74** | 0.892 | 0.942 | 0.667 | 0.962 | **0.9292** |
| 2400 | 2 | 19 | **1.74** | 0.892 | 0.942 | 0.667 | 0.962 | **0.9293** |

### The eight strategies that stay inside v1

| horizon | 80% | participation | containment **cross** | containment **within** | cross − within | prefix fidelity |
|--:|--:|--:|--:|--:|--:|--:|
| 300 | **1** | 1.46 | 0.9852 | 0.9649 | **+0.0203** | 0.9244 |
| 450 | **1** | 1.33 | 0.9875 | 0.9676 | **+0.0199** | 0.9293 |
| 600 | **1** | 1.26 | 0.9883 | 0.9696 | **+0.0188** | 0.9323 |
| 900 | **1** | 1.22 | 0.9883 | 0.9696 | **+0.0187** | 0.9325 |
| 1200 | **1** | 1.22 | 0.9881 | 0.9659 | **+0.0222** | 0.9318 |
| 1800 | **1** | 1.21 | 0.9881 | 0.9659 | **+0.0222** | 0.9318 |
| 2400 | **1** | 1.21 | 0.9881 | 0.9659 | **+0.0222** | 0.9318 |

**The pre-registered discriminator fails at every horizon, and it fails in the wrong direction.**
The rule was that a second dimension is real only if cross-strategy containment sits **below** the
within-strategy diagonal. Measured, cross containment is **above** it at every horizon by +0.019 to
+0.022: **two different strategies' node sets overlap each other more than two seeds of the same
strategy do.** The strategy label carries *less* compositional information than the seed.

### The shape-only spectrum settles the "it opens up" reading

Row-normalizing removes magnitude — *"how much a universe knows"* — and leaves composition:

| horizon | 300 | 450 | 600 | 900 | 1200 | 1800 | 2400 |
|---|--:|--:|--:|--:|--:|--:|--:|
| shape participation ratio, full pool | 3.31 | 3.22 | 3.24 | 3.30 | 3.31 | 3.31 | 3.30 |
| shape participation ratio, inside v1 | 2.92 | 2.73 | 2.62 | 2.56 | 2.57 | 2.56 | 2.56 |

**Flat.** Once magnitude is removed the effective dimensionality of composition is
**indistinguishable between horizon 300 and horizon 2400** — 3.31 against 3.30 for the whole pool.
The apparent rise in the raw participation ratio (1.74 → 1.94) is *breadth wearing composition's
clothes*: at a short horizon strategies differ in **how much** they have got through the queue, not
in **which** magic they hold.


## 3. The second pass — 30 to 240 ticks, where the content really is unexhausted

The brief's hypothesis wanted a horizon at which a universe holds *"roughly a third"* of the
reachable set. That horizon exists — it is **30 ticks**, not 300.

| horizon | mean v1 coverage | share of the 51 | saturated runs |
|--:|--:|--:|--:|
| 30 | 15.6 | **31%** | 0/400 |
| 60 | 22.3 | 44% | 0/400 |
| 120 | 29.2 | 57% | 0/400 |
| 180 | 32.7 | 64% | 0/400 |
| 240 | 34.0 | 67% | 0/400 |

**Not one run in 2,000 holds the full set.** This is the window the hypothesis was about.

## 4. The whole sweep, against the rule fixed in advance

Twelve horizons, 4,800 composition runs. The two conditions the verdict was pre-committed to:
**(1)** cross-strategy containment **below** the within-strategy diagonal, and **(2)** `betweenShare`
staying high among the eight v1-bound strategies.

| horizon | v1 coverage | **v1 betweenShare** | **cross** | **within** | **cross − within** | v1 PR | v1 shape PR | prefix fidelity |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 30 | 31% | **0.140** | 0.9664 | 0.8853 | **+0.0811** | 4.00 | 4.52 | 0.8329 |
| 60 | 44% | **0.385** | 0.9759 | 0.9378 | **+0.0381** | 5.28 | 6.43 | 0.9120 |
| 120 | 57% | **0.564** | 0.9765 | 0.9513 | **+0.0252** | 3.34 | 4.56 | 0.9214 |
| 180 | 64% | **0.686** | 0.9807 | 0.9586 | **+0.0221** | 2.32 | 3.50 | 0.9207 |
| 240 | 67% | **0.806** | 0.9820 | 0.9600 | **+0.0221** | 1.61 | 3.19 | 0.9190 |
| 300 | 70% | 0.847 | 0.9852 | 0.9649 | **+0.0203** | 1.46 | 2.92 | 0.9244 |
| 450 | 75% | 0.887 | 0.9875 | 0.9676 | **+0.0199** | 1.33 | 2.73 | 0.9293 |
| 600 | 76% | 0.911 | 0.9883 | 0.9696 | **+0.0188** | 1.26 | 2.62 | 0.9323 |
| 900 | 79% | 0.927 | 0.9883 | 0.9696 | **+0.0187** | 1.22 | 2.56 | 0.9325 |
| 1200 | 79% | 0.928 | 0.9881 | 0.9659 | **+0.0222** | 1.22 | 2.57 | 0.9318 |
| 1800 | 79% | 0.930 | 0.9881 | 0.9659 | **+0.0222** | 1.21 | 2.56 | 0.9318 |
| 2400 | 79% | 0.931 | 0.9881 | 0.9659 | **+0.0222** | 1.21 | 2.56 | 0.9318 |

**Condition 1 fails at all twelve horizons, and it fails in the wrong direction.** Cross-strategy
containment is *above* the within-strategy diagonal everywhere — **two different strategies' node
sets overlap each other more than two seeds of the same strategy do.** And the failure is **worst at
the shortest horizon**: +0.0811 at tick 30 against +0.0222 at 2400. The strategy label carries less
information about which magic a universe holds than the random seed does, and shortening the horizon
makes that more true, not less.

**Condition 2 fails wherever the content is unexhausted.** `betweenShare` inside v1 is **0.140 at
tick 30** — **86% of compositional variance is within-strategy noise** — rising through 0.385 and
0.564 to 0.931 by 2400.

**The two failures are the same fact seen twice.** The participation ratio does rise at short
horizons, 1.21 → 4.00, and taken alone that looks like the good news. It arrives in exact lockstep
with `betweenShare` collapsing, 0.931 → 0.140. **The extra dimensions are the noise floor, not new
axes of play** — which is precisely what the pre-registration named as the thing that must not be
sold as a finding.

Prefix fidelity confirms it independently: **0.9318 at 2400 and 0.9214 at 120**, where universes hold
57% of the set. Only at tick 30 does it fall at all, to **0.8329** — still far above the **0.7** that
W15 pre-registered as the level that would falsify the one-queue model.

## 5. Species — no divergence before exhaustion, with a within-species control

Gnome and human share `depthCeiling: 4`, so they are the pair whose divergence could not be
explained by the ceiling. Reported as the symmetric difference between the two species' unions,
**beside the same statistic computed within one species** by splitting its runs into two halves on
replicate parity — because an across-species difference only means something if it exceeds the
across-seed one.

| horizon | strategy | across gnome↔human | within gnome | within human |
|--:|---|--:|--:|--:|
| 30 | `passive-control` | 9 | 0 | 1 |
| 30 | `archivist` | 6 | 2 | 3 |
| 60 | `passive-control` | 5 | 0 | 0 |
| 120 | `passive-control` | 6 | **6** | 2 |
| 180 | `passive-control` | 2 | 1 | 2 |
| **240** | `passive-control` | **0** | 0 | 0 |
| **240** | `archivist` | **0** | 0 | 0 |
| 300–2400 | both | **0** | 0 | 0 |

**From tick 240 onward the two species' unions are identical — zero nodes unique to either — at
every horizon.** Below that the difference is 1–9 nodes against a within-species figure of 0–6: the
same order of magnitude, and at horizon 120 `passive-control`'s across-species difference (6) is
*exactly equal* to its within-gnome difference (6).

At horizon 300 humans hold a mean of **37.7** nodes against gnomes' **45.2** — a 20% gap in count —
while holding **the same 49-node union**. Species change how fast a universe walks the queue and how
far it gets. They do not change the queue. **Shortening the horizon does not make species diverge;
it only catches humans earlier on the same path.**

The one place the unions differ durably is under `permissive-breadth`, outside v1 — and there the
control disqualifies the reading too: at 2400 the **within-human** symmetric difference is **49**,
as large as the across-species one. That is seed noise, not a niche. The CRN caveat W15 disclosed
still applies: removing a species changes founding entity creation order and therefore every
downstream draw, so two founding mixes at the same coordinates are not the same universe.

---

# The verdict

**No. The strategy space does not open up before the content ceiling. It is one-dimensional at every
horizon measured, including those where a universe holds a third of the reachable set.**

This is the negative outcome the brief named, and it is reported without softening: **the flatness
is in the content graph itself, and no mechanic that changes the pace of acquisition will fix it.**

The evidence, in the order it should be read:

1. **Saturation does not explain the flatness, because the flatness precedes saturation.** At tick 30
   universes hold **31%** of the reachable set and not one run in 2,000 holds all of it — and the
   strategy space is *no more* compositionally structured there than at 2400.
2. **Cross-strategy containment exceeds the within-strategy diagonal at all twelve horizons**, by
   +0.0203 at 300 and by **+0.0811 at 30**. Which magic a universe ends up holding is better
   predicted by its random seed than by the strategy playing it, and shortening the horizon makes
   that worse.
3. **The apparent dimensionality gain at short horizons is the noise floor.** Participation ratio
   rises 1.21 → 4.00 exactly as `betweenShare` collapses 0.931 → 0.140. At tick 30, **86% of
   compositional variance is within-strategy.**
4. **One fixed node ordering still predicts a run's held set from its count alone**: prefix fidelity
   **0.9214 at tick 120**, against 0.9318 at 2400, and never below 0.83.
5. **Species do not diverge before exhaustion.** Gnome and human hold identical unions from tick 240
   up, and below that differ by no more than one species differs from itself across seeds.

**The horizon is not the problem.** It is too long — 2400 ticks is roughly four times what the
content can fill, and every previous campaign measurement was taken with the game long over — but
shortening it buys no variety, because the variety was never there to be caught earlier. W15's
mechanism explains exactly this: `compareTargets` orders candidates by `remainingCost` then
`nodeId`, so **the acquirer is value-blind, and a value-blind acquirer walks one queue at every
horizon.** A shorter horizon stops the walk sooner; it does not change the walk.

## What this rules out, and what it leaves

**Ruled out:** that the campaign's diversity results were an artifact of measuring at the ceiling.
They were measured at the ceiling — that part of the brief's suspicion is correct and now
quantified — but the ceiling was not what produced them. Re-running any earlier measurement at a
shorter horizon will reproduce its finding.

**Also ruled out by the same data:** that a shorter horizon makes the god's other verbs matter.
`permit-then-idle` — which presses two buttons for 140 ticks and then does nothing forever — wins at
**every horizon where winning is possible at all** (39/40, 39/40, 40/40 at 1200/1800/2400 on the
composition arm), and eight of ten strategies win nothing at any horizon.

**Left open, and pointed at by these numbers rather than settled by them:** the only lever that
changes composition is the one that adds content — permitting cells. `permissive-breadth` and
`permit-then-idle` are the sole strategies whose node sets are not nested inside everyone else's,
and the sole strategies that ever win. **A game whose only compositional decision is "how much of
the grid exists" has one decision, not a strategy space.** W17's value-sensitive acquirer is the
change these numbers argue for: until the thing that chooses what to learn can see what a node is
*worth*, ordering by cost will keep producing one queue, and every horizon will keep being a
different stopping point on it.

## Instrument and integrity, in one place

| check | result |
|---|---|
| probe inertness on this tree | **8/8** agree on snapshot hash, terminal reason, tick count |
| common random numbers, production arm | `runSeed` identical **400/400** at every one of 12 horizons |
| common random numbers, composition arm | identical by construction; **400/400** verified pairwise |
| strategy coverage | **exactly 40 runs × 10 strategies** at every horizon, both arms |
| prefix property | contained in **2,400/2,400** paired comparisons |
| 2400 arm vs `integration-round-2-results.md` | `ascensionRate` **0.1950**, reproduced exactly |
| production runs | 4,800 (12 horizons × 400) |
| composition runs | 4,800 (12 × 400) plus 1,728 species runs |
| constants, rules, magnitudes changed | **none** |
| golden fixtures regenerated | **none** |
| balance baselines regenerated | **none** |

Two production-code changes: **none**. Two tool changes, both additive: `--sample` on W15's
`run-arm.mjs` (default identical, verified run-for-run) and `tools/w19/`.

### Two defects in this workstream's own tooling, both mine, both recorded

1. **`fan-out.mjs` calls `main()` at module scope**, and four analysis files imported a constant from
   it — each silently launching a second 2,800-run sweep on load. Caught by the analysis processes
   sitting at 0% CPU while forty-one workers fought over sixteen cores. Constants moved to
   `horizons.mjs`; no data affected, because the duplicate workers write deterministic runs to the
   same paths, and every completed file was validated field by field before being trusted.
2. **A validation script hardcoded the first pass's sampling grid and deleted fifty valid
   short-pass files** whose grid is 30. The pass was regenerated (165 s) and the script now takes the
   grid as a parameter and does not delete unless asked. This is why the short-pass numbers above
   come from a second execution; they are the same runs, since the runs are deterministic and the
   seeds are unchanged.

## Status

Complete.
