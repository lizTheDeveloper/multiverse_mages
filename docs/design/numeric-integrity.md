<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Numeric integrity: the zero that was never meant

*How a value goes wrong in this simulation, which instruments can see it, what each one is
structurally blind to, and what is measured rather than assumed. `invariants.md` INV-37 to INV-39
carry the claims; this document carries the reasoning behind them.*

---

## One mechanism, two symptoms

The complaint that started this work was two complaints: *"NaN contamination"* and *"stuff falls to
zero a lot"*. They are the same defect seen from opposite ends.

    a lookup misses
      -> `undefined` enters arithmetic
      -> `NaN` comes out
      -> it is written to an `i32` component column
      -> the typed array coerces `NaN` to 0
      -> the mechanic contributes nothing, forever

Nothing throws. Nothing is corrupt. The result is a legitimate-looking zero, and it reads as a
balance outcome rather than as a bug. Whoever sees the intermediate value calls it NaN
contamination; whoever sees the stored value calls it a quantity that fell to zero.

There is a second, independent route to the same destination, and it involves no `NaN` at all.
`floorDiv` rounds toward negative infinity, so `mul(x, k)` with a small `x` and a `k` below `FP_ONE`
returns exactly zero. If that product is a per-tick increment, the quantity it drives never moves
again. This is the **Zeno stall**, and the arithmetic is working perfectly when it happens.

## The four times this has already happened

Worth listing, because the pattern in *how each was caught* is the argument for having any mechanism
at all.

| Site | What it did | How it was found |
|---|---|---|
| `planConstructionLabour` | Floored a backlog into a headcount of zero, so a site 2% from done asked for nobody and stopped forever, with stone in the barn and laborers idle. | A probe written to measure something else. |
| `RaidState.stabilityDecayPerTick` | Would have become `0` if derived by division — *"a raid that runs forever, with no error and no symptom"*. | Reasoning, at authoring time. Never shipped. |
| `laggedWorship` | A rising gap of one unit floors to zero; worship would stall one unit short of its target forever. | Noticed while writing the function. |
| `assertRepresentable` | Spent the project's entire history looking exactly like a `NaN` guard while being incapable of catching one — every comparison with `NaN` is false, so a bounds check waves it through. | ~3,900 passing tests did not notice. Found by someone asking. |

Four sites, four different accidents. The last row is the one to sit with: a guard that *looked*
correct, in the most-reviewed file in the repository, wrong for the project's whole history.

## Why the ordinary suite cannot catch this class

Not for want of tests. **A unit test builds its own fixture, so its lookups always hit.** It passes
a species record it just constructed, a bonus array it just filled, a content id it just interned.
Production looks the same values up in an assembled registry where a key may not resolve and a
caller may pass `[]`. Every one of those tests can be correct and green while the assembled system
computes zero.

So the missing artifact was never *more* unit tests. It was tests of a different category: run the
**assembled** universe and watch the boundaries.

## The two instruments, and what each is blind to

Both are off by default, cost one comparison against `undefined` when off, and are observation-only
so INV-5 still holds. Neither is a shipping guard. They are instruments.

**`installValueSentinel`** (`sim-core/src/component.ts`) watches the two doors into component
storage — `set` and `field` — and reports any value that is not an integer. It watches *writes*
rather than stored values, and that is the whole point: by the time a column can be read the
coercion has happened, `NaN` is `0`, and a sweep of state is structurally incapable of finding what
it appears to look for.

> Blind to: a `Fixed` living in a plain JavaScript object rather than a component column.
> `RaidState.portalStability` and `stabilityDecayPerTick` are the current examples. There `NaN`
> *survives* rather than coercing — which means a state-walk validator would work on that surface,
> and does not exist yet.

**`installAnnihilationSentinel`** (`sim-core/src/fixed-point/fixed-point.ts`) reports every `mul` or
`div` that turns two non-zero operands into exactly zero. A single event is not a defect — flooring
small products is what fixed-point arithmetic *does*, constantly and correctly. The discriminating
signal is **persistence**: the same function annihilating on tick after tick while its inputs stay
non-zero. Attribution lives in `scenario/src/annihilation.ts`, not the core, because the core
performs no I/O and cannot capture a stack on a hot path.

> Blind to: a floor reached through `floorDiv` directly, or a quantity driven to zero by a bare
> subtraction. It sees the two scaling helpers and nothing else.

## What is actually measured on this tree

Every number here was produced by running it, not by reading the code.

| Check | Surface | Result |
|---|---|---|
| Value sentinel | Reference universe, 240 ticks | Zero non-integer writes |
| Value sentinel | 10 strategies × 3 seeds × 2 level sets × raids on/off, 60 ticks — 120 arms | Zero non-integer writes |
| Value sentinel | `portal-rush`, 520 ticks, raids resolved | Zero non-integer writes |
| Annihilation sentinel | Reference universe + all 10 strategies, 600 ticks, raids live | **One** site: `worship:laggedWorship`, persistence 0.131 — the site that already handles it |
| Balance baselines | All three committed baselines | No `NaN` fossils; the one `null` is the designed `standardError === 0` sentinel, not a coerced `NaN` |
| `applyDescriptor` | All five normalization rules, `NaN` and `±Infinity` | Floors to `min` under every rule; the historical `log-bucket` disagreement is fixed |
| All three balance gates | `balance-gate`, `-horizon`, `-ascension` | Every metric `delta 0.00000` — the instruments are observation-only, and the baselines say so |

**The rules path is clean.** That is a real result and it should be said plainly rather than buried:
the campaign found no live contamination on `main`. What it found instead was that nothing would
have *told* us if there were.

## What was actually wrong: coverage, not correctness

The value sentinel existed before this work and was exercised by two test files. Its strategy arms
run 60 ticks. Measured: **the entire ten-strategy pool resolves one raid at that horizon**, and that
one is an accident of `archivist`'s seed. `portal-rush` — the strategy whose entire purpose is
opening portals — resolves none at 60, 90, 120, 180 or 240 ticks on the seed those arms use. A scan
of ten seeds at 240 ticks found it raiding on four.

So the NaN check's coverage of `rules-raid` — 4,525 lines across 16 files — was never a property of
a test. It was a property of one seed, and any content change could have removed it in silence.

That is why INV-39 exists, and why every numeric-integrity arm now asserts that it *reached* its
mechanic. **A run that never reaches a mechanic reports zero violations and passes.** An arm without
a coverage assertion is indistinguishable from an arm that checks nothing, and it is the more
dangerous of the two because it reads as reassurance.

## The remaining gaps, scoped

Stated as work, not as worry. None of these is a known defect; each is a surface with no instrument
on it.

1. **Plain-object `Fixed` fields.** The value sentinel cannot see them and `NaN` survives there, so
   a snapshot-graph walker — every numeric leaf is a safe integer inside the `Fixed` domain — is a
   cheap second instrument that would work exactly where the first cannot. Smallest useful scope:
   `RaidState`, `ActiveUpheaval.factor`, `ActiveBlessing`/`ActiveEncouragement` expiry ticks.

2. **The unnamed zero.** 56 `?? 0` defaults sit in the rules path. 14 are the safe accumulator idiom
   (`(map.get(k) ?? 0) + 1`), where absent genuinely means zero. About two dozen default an
   *identifier* — an `EntityHandle`, a `nodeId`, a `cellId`. Those are **correct**: `NULL_ENTITY` is
   `0` and generation 0 is illegal precisely so handle 0 stays reserved. But they are written as a
   bare `0`, so a reader cannot distinguish *"0 because absent, intended"* from *"0 because a lookup
   missed, a bug"* — and neither sentinel can either, because a legal integer written on purpose is
   invisible to both. Writing `?? NULL_ENTITY` costs nothing and makes the intent checkable. Where
   absence is genuinely a bug rather than a state, a `require*` accessor that throws is the right
   shape. This is a per-site judgement call, roughly two dozen of them, and it is the concrete form
   of *"we may need better accessors"*.

3. **The long horizon.** `balance-gate-ascension` runs 2400 ticks across eight strategies. The
   sentinel has never been run there — an attempt for this campaign was still going after 24 minutes
   of real CPU and was stopped, because the `Proxy` the sentinel installs makes every component
   write an order of magnitude more expensive. This belongs at cadence **S** (nightly or
   pre-release), not **C**, and it needs a cheaper sentinel — sampling, or a build flag — rather than
   a longer timeout.

4. **`npm run verify` is stochastically red, and not because of the code.** Vitest exits non-zero on
   an unhandled error even when every test passes, and this suite produces
   `[vitest-worker]: Timeout calling "onTaskUpdate"` — a worker doing unbroken synchronous work
   cannot answer its runner's RPC, and a runner that has not heard from a worker treats it as dead.
   Because `verify` chains with `&&`, that exit code means **the three balance gates never run at
   all**, which is the part of the gate most worth having.

   Measured, on an untouched `origin/main` checkout with no changes from this campaign: `npm test`
   exits **1**, with 4,052 tests passed, 287 files passed, and **2 unhandled errors**. So this is
   not a regression introduced here. It is a pre-existing, stochastic property of the suite — an
   earlier run of the same untouched tree exited 0.

   The cause is concentrated in a few files that step hundreds of world ticks synchronously:
   `loss-shock-recovery.test.ts` at 205s, `reference-long-run.test.ts` at 185s, and
   `reference-time-to-tier.test.ts` at 133s. The same contention intermittently pushes
   `god-loop.test.ts` — 15s alone — past the 30s `testTimeout` under parallel load.

   The fix is the device this repository already uses in `runLongReference` and
   `assembled-run-values.test.ts`: hand the event loop back once a world year. It changes no number.
   It is not applied here because those files belong to other workstreams in flight, and a
   campaign about not claiming more than you check should not quietly rewrite three suites it did
   not measure.

   `vitest.config.ts` already contains the argument for doing it, written about a different
   intermittent failure: *"A conformance suite that goes red for reasons unrelated to the code under
   test is a suite people learn to re-run rather than read."* Every invariant in `invariants.md`
   with cadence **C** depends on someone reading a red gate as information. This is the highest
   priority item on this list, and it is not a numeric-integrity problem at all.
