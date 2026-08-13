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

**`installAnnihilationSentinel`** (`sim-core/src/fixed-point/divide.ts`) reports every division that
turns a non-zero numerator into exactly zero. It sits on `floorDiv` — the only `/` in the simulation
core, which `mul`, `div` and `toInt` all route through — so it sees every floor, not a sample of
them. A single event is not a defect — flooring
small products is what fixed-point arithmetic *does*, constantly and correctly. The discriminating
signal is **persistence**: the same function annihilating on tick after tick while its inputs stay
non-zero. Attribution lives in `scenario/src/annihilation.ts`, not the core, because the core
performs no I/O and cannot capture a stack on a hot path.

> Blind to: a quantity driven to zero by a bare subtraction, and a quantity that is never divided
> at all.
>
> It was blind to much more than that until an adversarial reviewer said so. See below.

## What is actually measured on this tree

Every number here was produced by running it, not by reading the code.

| Check | Surface | Result |
|---|---|---|
| Value sentinel | Reference universe, 240 ticks | Zero non-integer writes |
| Value sentinel | 10 strategies × 3 seeds × 2 level sets × raids on/off, 60 ticks — 120 arms | Zero non-integer writes |
| Value sentinel | `portal-rush`, 520 ticks, raids resolved | Zero non-integer writes |
| Annihilation sentinel on `mul`/`div` | Reference universe + all 10 strategies, 600 ticks, raids live | One site: `worship:laggedWorship` — and this number was wrong, see below |
| Annihilation sentinel on `floorDiv` | Reference universe, 240 ticks | **Ten** sites, all explainable, none previously written down |
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

## What the breakers found

Two independent reviewers on different models were pointed at this work with one instruction: *do not
agree with it.* Both drew blood, and both hit the same theme — not a contaminated value anywhere, but
**an instrument claiming more than it checked.** That is worth more than a clean bill of health,
because it is the failure mode this whole document argues against, committed by the document.

**The recorder stopped watching at the first `await`.** `AnnihilationRecorder.record` was
`try { return body(); } finally { restore() }`. With an async body that is silently useless: `body()`
returns its promise at the first `await`, `finally` runs *then*, and the sentinel is uninstalled
before any awaited work happens. Measured, an async body around one `mul(1, 1)`:

    async body -> sites: []
    sync  body -> sites: ["repro-async:<anonymous>"]

Every long arm in this repository yields to the vitest runner once a world year, which makes it
async. So the shape most likely to be used was the shape that recorded nothing. The registry test
survived only because its body happens to be synchronous.

**The registry was blind to eighty call sites.** The sentinel wrapped `mul` and `div`. The rules path
calls `floorDiv` *directly* — 44 times in `rules-world`, 28 in `rules-raid`, 8 in `coordination` — and
the test asserted completeness over a surface it did not cover. `materialsProduced` floors each
material kind's share through a bare `floorDiv`; so does the cohort transfer budget. The document
admitted the blind spot; **the test did not**, and the test is what runs.

Moving the check to `floorDiv` took the registry from one entry to ten:

| Site | Verdict |
|---|---|
| `carrying-capacity:cohortBirths`, `mortality:cohortDeathsThisTick`, `promotion:promoteStudentCohort` | **Banked.** The floor is real and the remainder is spent as a probability — `whole + (draw < remainder ? 1 : 0)`. A cohort whose expected births are 0.3 has one birth on 30% of ticks. Nothing is lost, so none can stall. |
| `grid:techniqueBitOf`, `clock:eraOf`, `buckets:birthBucketOf`, `buckets:normalizedCohortAge`, `age:normalizedAge` | **The floor is the meaning.** Index and bucket arithmetic, where a zero quotient names the first bucket. |
| `reallocation:collectSources` | **Floored, discarded, declared.** `TRANSFER_RATE_PER_TICK` is `FP_ONE / 16`, and the module's own note says *"cohorts smaller than 1 / TRANSFER_RATE_PER_TICK never transfer at all."* Sixteen is the threshold. If that stops being the intent, this is the line that says so. |
| `worship:laggedWorship` | **Handled at the site.** Moves one unit when the step floors away. |

So the result of widening the instrument tenfold is that **no live stall was found** — and ten places
where a quantity can round to nothing are now named, reviewed, and standing in a test, where before
exactly one of them was.

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

4. **`npm run verify` goes red under machine load, and not because of the code.** Vitest exits
   non-zero on an unhandled error even when every test passes, and this suite produces
   `[vitest-worker]: Timeout calling "onTaskUpdate"` — a worker doing unbroken synchronous work
   cannot answer its runner's RPC, and a runner that has not heard from a worker treats it as dead.
   Because `verify` chains with `&&`, that exit code means **the three balance gates never run at
   all**, which is the part of the gate most worth having.

   What this looked like, and the correction, because the first reading was wrong. Four consecutive
   runs went red — including one on an untouched `origin/main` checkout, which is what ruled out this
   campaign as the cause. The obvious next hypothesis was worker oversubscription, and capping
   `--maxWorkers=6` passed twice. But then the **default** configuration also passed **three times in
   a row** on an idle machine. The variable was not the worker count. It was that the earlier runs
   had a 2,400-tick balance gate and two agents running beside them.

   So: no config change is warranted, and the honest statement is narrower than "the suite is
   flaky". It is **load-sensitive**, the load in every observed failure was self-inflicted by running
   heavy jobs concurrently, and CI on a dedicated runner is a different machine. The files that
   cannot answer their runner are real and worth fixing anyway — `god-loop.test.ts` takes 15s alone
   and 31s under load against a 30s `testTimeout`, and `raid-engagement.test.ts`'s `playOnce` steps
   520 ticks synchronously.

   The fix, when someone takes it, is the device this repository already uses in `runLongReference`
   and `assembled-run-values.test.ts`: hand the event loop back once a world year. It changes no
   number. It is not applied here because those files belong to workstreams in flight, and a campaign
   about not claiming more than you check should not quietly rewrite three suites it did not measure.

   `vitest.config.ts` already contains the argument, written about a different intermittent failure:
   *"A conformance suite that goes red for reasons unrelated to the code under test is a suite people
   learn to re-run rather than read."*
