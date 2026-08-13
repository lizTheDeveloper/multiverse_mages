# `balance/` — the sweeps that are gated, and the numbers they are gated against

Two kinds of file live here, and one command each.

    balance/sweeps/      the experiments, as committed JSON
    balance/baselines/   what each gate sweep measured, and how far it may move

## What the gates actually do

There are **three** wired, and a fourth committed but not yet wired. They are four instruments
rather than one instrument run four times.

| | `npm run balance:gate` | `npm run balance:gate:horizon` | *(unwired)* | `npm run balance:gate:ascension` |
|---|---|---|---|---|
| sweep | `balance-gate.sweep.json` | `balance-gate-horizon.sweep.json` | `balance-gate-agency.sweep.json` | `balance-gate-ascension.sweep.json` |
| horizon | 60 ticks — **five** world years | 240 ticks — **twenty** world years | 240 ticks — **twenty** world years | 2400 ticks — **two hundred** world years |
| pool | `passive-control`, fixed | `passive-control`, fixed | all eight, round-robin | all eight, round-robin |
| runs | 4 cells × 50 = 200 | 4 cells × 50 = 200 | 4 cells × 16 = 64 | 4 cells × 16 = 64 |
| wall clock | 4.3 s on 4 workers | 26.3 s on 4 workers | **8.9 s on 4 workers** | 83.5 s on 4 workers |
| plays a god verb | **no** | **no** | yes | yes |
| answers | *did anything move?* | *did the universe stop?* | *do the god's verbs still do anything?* | *can anyone still win?* |

Wall-clock figures re-measured on 2026-08-12 on four workers of an eight-core machine; the two
200-year sweeps changed size on that date and their old figures no longer describe them.

Each runs its sweep against the reference universe, compares every metric to its own committed
baseline, and exits non-zero if anything is out of place. All three are part of `npm run verify`, so
the self-hosted runner picks them up, and all three are named as their own steps in
`.github/workflows/ci.yml`, because that workflow lists its steps by hand. All three, deliberately —
see `docs/devops/ci-and-deploy.md` for why this repository has two CI systems and why neither can
cover for the other.

### Why five years is not enough, in numbers

The five-year gate is fast and sensitive and it has a blind spot that was measured rather than
suspected. These are means over 200 runs, this build against `512ef00^` — the last commit before
`researchFrontier` stopped being a prefix window over interned node ids, a defect that made roughly
a third of v1 content unreachable:

| horizon | `referenceNodesKnown` pre-fix | post-fix | `referenceNodesGainedFinalQuarter` pre-fix | post-fix |
|---|---|---|---|---|
| 60 ticks (5 y) | 25.30 | 32.93 | 6.57 | 8.63 |
| 120 ticks (10 y) | 31.39 | 43.97 | 1.77 | 5.07 |
| 240 ticks (20 y) | 31.94 | 48.35 | 0.18 | 0.66 |

Read the diagonal. **The broken build's permanent ceiling — 31.94 nodes, reached around world-year
ten and never left — is the healthy build's five-year level, 32.93.** So a five-year gate cannot
tell a universe that is still learning from one that has stopped, for any defect that caps
discovery at or above roughly 33 nodes. At twenty years the same comparison is 48.35 against 31.94,
against a tolerance of 0.238.

The fix is not to lengthen the fast gate. Its value is sensitivity per second — 200 runs give
`referenceNodesKnown` a standard error of 0.096 — and buying the long horizon out of the same
budget would mean about 48 runs, widening every tolerance by roughly 2× so that subtle drift stops
being detectable. That trades one blind spot for another. Hence two gates.
`packages/scenario/test/unit/horizon-gate.test.ts` fails if either turns into the other.

### Why two hundred years is a third instrument and not a longer second one

Both gates above are structurally incapable of observing the thing the game is for. Measured on
2026-08-11: **0 of 400 runs ascended at 240 ticks; 10 of 80 ascended at 2400**, giving
`ascensionRate` 0.125 — inside `contracts.md` §7's declared 0.05–0.20 band. A gate that cannot see
its game's ending cannot regress on it either, and a build in which nobody can win any more would
have passed both of them.

Two things make `balance:gate:ascension` a different instrument rather than the horizon gate with a
bigger number, and both are asserted by `horizon-gate.test.ts`:

- **The horizon.** 2400 ticks, ten times the twenty-year gate. The earliest declaration this build
  produces is around tick 630, which is `ascension-min-tick` (600) plus the time it takes worship
  to accrue past the tier gate.
- **The pool.** All eight strategies, round-robin, one slot — where the other two run
  `passive-control` fixed. A win condition is something a *strategy* reaches, so a gate over the
  passive control alone would be blind to it however long it ran. Round-robin assigns
  `strategies[replicateIndex % 8]`, which is why the replicate count is a multiple of eight: any
  other number gives some strategies an extra run in every cell.

Its sample is small — 64 runs, eight per strategy — and its tolerances are correspondingly wide:
about 3.1 nodes on `referenceNodesKnown` against the horizon gate's 0.476. **This paragraph used to
say the width was "not fixable by adding replicates", and that was half right in a way that cost
the project a great deal.** The diagnosis was correct — the estimator stratified on `cellIndex`, and
within a cell of *this* sweep the replicates are eight different strategies, so most of what it
called noise was real strategy effect — but the conclusion drawn from it was that nothing could be
done. Something could: stratify on the arm as well, and gate each arm separately. See the power
table above for what that was worth (33 nodes of tolerance became 3.1) and for the 80-of-80
counterfactual that the old wording quietly excused.

The two instruments still answer different questions and the wider one is still worth running,
because the failure it catches — the pool stops being able to win, or starts winning at a wholly
different time — is invisible to any tolerance taken over a control that never plays.

**Do not lengthen the two gates above to fold this one in.** Their horizons are argued from
measured sensitivity per second, and 200 runs at 2400 ticks is roughly forty minutes of a four-core
container per push.

### The fourth instrument: two of the three gates never play a god verb

This is not a tolerance problem and no statistic fixes it. `passive-control` declares
`signatureActions: []` and `preferences: () => []`, so the fall-through in `policyFor` submits
`noop` on every tick of every run. **`balance:gate` and `balance:gate:horizon` run it fixed, so
between them their 400 runs contain zero god interventions**, and no change to any of the fifteen
verbs in `coordination/src/god/interventions.ts` can move either gate by construction. For most of
this project's life the only committed instrument that put a strategy in front of the verbs was the
200-year ascension gate — the most expensive one here, and the one whose tolerances were widest.

It need not be. Measured on 2026-08-12: **the eight-strategy pool separates strongly at twenty
years**, the horizon gate's own tick cap.

Read off the committed `balance-gate-agency-v1` baseline's own arm lines, so every figure here is
reproducible from a file in this directory:

| metric, at 240 ticks | `denial-warden` | `narrow-depth` | `passive-control` | `permissive-breadth` | spread over all eight arms |
|---|---|---|---|---|---|
| `referenceNodesKnown` | 5.00 | 7.63 | 41.63 | 75.38 | **15.1x** |
| `referenceLibraryDepth` | 3.25 | 7.63 | 18.13 | 37.75 | **11.6x** |
| `referenceGrimoires` | 59.25 | 342.88 | 344.75 | 339.63 | **5.8x** |
| `referenceNodesGainedFinalQuarter` | **-4.75** | **-3.25** | +7.00 | +17.00 | **sign change** |

The last row is the interesting one: under `denial-warden` and `narrow-depth` the universe is
**losing** distinct nodes faster than it finds them in its final quarter, and under
`permissive-breadth` it is still climbing steeply. Those are god verbs doing something large,
twenty years in, and the twenty-year gate cannot see any of it because it never plays one.

`balance-gate-agency.sweep.json` is the horizon gate's tick cap with the ascension gate's pool — the
**single** declared difference from `balance-gate-horizon-v1` is the pool, so a divergence between
the two is attributable to god agency and to nothing else. It costs **8.9 seconds** on four
workers: a third of the twenty-year gate, and a ninth of the 200-year one.

So the honest answer to *"is the ascension gate the only thing that can ever see this, and does it
cost 892 seconds?"* is **no, on both halves**:

- A gate sensitive to god verbs costs about **nine seconds**, not fifteen minutes. What is expensive
  about the ascension gate is the 2400-tick horizon, and the horizon buys the *win condition* — 0
  of 400 runs ascend at 240 ticks and 46 of 64 at 2400 — not god sensitivity.
- The **892 s** figure comes from `practice-results.md` on `origin/w53/practice`, measured on a
  contended container. The same 32-run sweep takes **71 s** here and the 64-run version **83 s**.
  892 s is a fact about that afternoon's machine, not about the instrument, and it should not be
  used to argue the project cannot afford to check itself.

**The agency gate is committed — sweep and baseline — but not wired.** Wiring it needs one script in
`package.json` and one step per full-suite job in `.github/workflows/ci.yml`, both of which are
frozen to this branch pending PR #42. Until then it runs by hand:

    node packages/mc-harness/bin/balance-gate.mjs \
      --scenario ./packages/scenario/bin/scenario.mjs \
      --sweep    ./balance/sweeps/balance-gate-agency.sweep.json \
      --baseline ./balance/baselines/balance-gate-agency-v1.baseline.json \
      --workers  4

`packages/mc-harness/test/unit/gate-power.test.ts` gates its baseline's power whether or not CI runs
the sweep, so the file cannot rot into a measurement of a build nobody has.

The gate fails on any of these, and reports `baseline-invalid` rather than a delta for the last
four:

| what happened | what the gate says |
|---|---|
| a metric moved further than its tolerance | `regressed`, with both deltas |
| a metric that was unavailable now reports a number | `newly-available` — regenerate |
| a metric that was measured now reports unavailable | `newly-unavailable` |
| the baseline file is missing, or will not parse | `baseline-invalid` |
| a provenance key does not match this build | `baseline-invalid`, naming the key |
| a metric's `definitionVersion` moved | `baseline-invalid`, for that metric only |
| the sweep is disqualified by its failure count | `baseline-invalid` |

**A missing baseline fails.** That is the single most important line in this file. A gate that
passes when its baseline has gone missing reports green forever, and the longer it does the more
confidently everyone believes it — so deleting a baseline is a build failure, not a fresh start.

## Tolerances, and why they are k standard errors

A tolerance is `k` standard errors, with `k` recorded in the baseline (currently 3) and the
standard error estimated at the **gate sweep's** sample size, not the full sweep's. The estimator
is in `packages/mc-harness/src/standard-error.ts`; the short version is that it stratifies on
`cellIndex`, so the deliberate difference between two parameter cells does not inflate what the
gate calls noise.

The sweep is deterministic at a fixed root seed, so nothing here moves by chance. The tolerance is
therefore not protecting against flakiness — it answers *how large a change is worth a human's
attention*, in units of how far two universes of this build differ from each other. Both the raw
delta and the delta in standard errors are always printed, because a large-but-noisy move and a
small-but-significant one are different findings.

Where a metric has never varied at all its standard error is zero, so its tolerance is zero and the
gate demands exact equality of it. That is deliberate and it is not softened. Bit-level change is
what the golden replay fixtures catch; distributional movement beyond noise is what this catches.

## What each gate can actually detect — the power table

**Read this before believing any number in this directory.** A tolerance is only meaningful next to
the size of the thing it is measuring, and until 2026-08-12 nobody had divided one by the other.
The table below is that division, and
`packages/mc-harness/test/unit/gate-power.test.ts` parses it back out of this file and recomputes
every cell from the committed baselines, so it cannot go stale the way the `ctx.actions` note
further down this file did.

Each cell is the **minimum detectable effect (MDE)**: `tolerance ÷ |value|`, the smallest
proportional change in that metric the gate would report as `regressed`. Anything smaller passes.

| metric | 5-year gate | 20-year gate | 20-year agency gate | 200-year gate |
|---|---|---|---|---|
| `referenceGrimoires` | 5.2 % | 6.4 % | 12.4 % | 27.2 % |
| `referenceKnowledgeInstances` | 2.0 % | 2.5 % | 4.7 % | 7.2 % |
| `referenceLibraryDepth` | 12.5 % | 11.6 % | 26.7 % | 12.2 % |
| `referenceLivingMages` | 0.8 % | 1.6 % | 2.5 % | 10.1 % |
| `referenceNodesGained` | 2.3 % | 1.2 % | 2.8 % | 5.7 % |
| `referenceNodesGainedFinalQuarter` | — | 4.3 % | 14.2 % | 14.2 % |
| `referenceNodesKnown` | 2.0 % | 1.1 % | 2.6 % | 5.5 % |
| `referencePeakPopulation` | 0.0 % | 4.1 % | 8.3 % | 5.0 % |
| `referencePopulation` | 1.1 % | 1.8 % | 2.9 % | 20.7 % |
| `referencePopulationChange` | 9.4 % | 5.6 % | 9.1 % | 21.2 % |
| runs | 200 | 200 | 64 | 64 |
| plays a god verb | no | no | **yes** | **yes** |
| wall clock, 4 workers | 4.3 s | 26.3 s | **8.9 s** | 83.5 s |

Three things follow.

**`referencePeakPopulation` on the five-year gate has an MDE of exactly zero.** Its jackknife
standard error is 0, because the peak is 216 in all 200 runs, so the gate demands exact equality.
That is the estimator behaving as designed, and it is the one line in the table gating perfectly.

**The two multi-strategy gates carry 80 further lines each**, one per `(metric, strategy)` — see
below. Those are where their power actually lives; the sweep-level column above is a summary of a
mean taken over eight strategies that do very different things.

**The 200-year gate is still the bluntest instrument here**, and that is now a statement about its
64 runs rather than about its statistics.

### What this table looked like before 2026-08-12, and why

The 200-year gate was, as committed, incapable of detecting almost anything:

| metric | MDE, as committed | MDE, now |
|---|---|---|
| `referenceGrimoires` | **117.7 %** | 27.2 % |
| `referenceNodesGainedFinalQuarter` | **135.7 %** | 14.2 % |
| `referencePopulationChange` | 65.6 % | 21.2 % |
| `referencePopulation` | 64.0 % | 20.7 % |
| `referenceNodesGained` | 58.6 % | 5.7 % |
| `referenceNodesKnown` | 56.1 % | 5.5 % |
| `referenceKnowledgeInstances` | 47.5 % | 7.2 % |
| `referenceLibraryDepth` | 40.9 % | 12.2 % |
| `referenceLivingMages` | 16.7 % | 10.1 % |
| `referencePeakPopulation` | 7.9 % | 5.0 % |

An MDE of 117.7 % means a mechanic that **doubled** grimoire output would have moved the metric by
100 %, which is less than the tolerance, and the gate would have reported `pass`.

The cause was not the sample size. The 32 runs were eight strategies round-robin across four cells,
and **the strategies' outcomes span up to 294×** — measured over exactly those 32 runs, which this
branch re-executed and reproduced value-for-value against the committed baseline:

| metric | narrowest arm | widest arm | spread |
|---|---|---|---|
| `referenceKnowledgeInstances` | `denial-warden` 19.3 | `permissive-breadth` 5652.0 | **294×** |
| `referenceNodesGained` | `denial-warden` 0.75 | `permissive-breadth` 197.3 | **263×** |
| `referenceNodesKnown` | `denial-warden` 3.25 | `permissive-breadth` 199.8 | **62×** |
| `referenceGrimoires` | `narrow-depth` 15.0 | `archivist` 580.3 | **39×** |
| `referenceLibraryDepth` | `denial-warden` 3.25 | `archivist` 48.5 | **15×** |

The standard-error estimator stratified on `cellIndex`, and **strategy is not part of `cellIndex`**.
It arrives through `agentPool`, not through `factors`: `assignStrategies` hands run *r* of a cell
the strategy `strategies[r % 8]`, which is as deliberate and as reproducible as any factor level.
So the estimator saw eight replicates per cell disagreeing enormously and recorded that
disagreement as noise. The tolerance was a function of **between-strategy variance** rather than of
run-to-run variance — and between-strategy variance is the thing a regression gate must hold
constant, not tolerate.

This is the same mistake `standard-error.ts` already rejects, one layer down. Its own docstring
says *"Cell membership is not random. Seeds are"*, which is exactly the argument for stratifying on
the arm as well.

### The consequence, as a counterfactual

For each of the ten metrics and each of the eight strategies, suppose that arm's contribution
collapsed **to zero** — the strategy stops discovering, scribing and growing entirely — and every
other arm is untouched. Recompute the sweep aggregate, compare it to the committed tolerance:

> **80 of 80 (metric, strategy) total collapses were inside tolerance.** The gate reported `pass`
> for every one of them.

A mean over eight arms dilutes any one arm's move eightfold, and the tolerance was already wider
than the arm. That is the concrete form of "a mechanic could double knowledge output and the gate
would pass", and it is worse than that phrasing suggests.

### What was changed, and what was deliberately not

Three things, none of which touches the simulation:

1. **The estimator stratifies on `(cellIndex, arm)`.** Not a new statistic — the existing one,
   applied to the whole design instead of half of it. It shrank the 200-year gate's standard errors
   by between 1.2× and 6.8×, and it changes **nothing** for a single-strategy sweep, which is why
   `balance-gate-v1` and `balance-gate-horizon-v1` keep the numbers they were committed with and
   were not regenerated.
2. **Every multi-strategy gate gates each arm separately**, under ids like
   `referenceGrimoires@archivist`. This is the half that fixes the counterfactual above: a change
   confined to one strategy is now compared against that strategy's own committed value, at that
   strategy's own noise level, instead of being divided by eight first.
3. **The 200-year sweep runs 16 replicates instead of 8.** At 8, round-robin over 8 strategies put
   exactly one run in every `(cell, arm)` stratum, every within-stratum variance was 0, and a
   corrected estimator would have produced a tolerance of **0** on every line — a gate demanding
   bit-equality of 90 numbers, which is a golden fixture wearing a gate's clothes. 16 is the
   smallest multiple of the pool size that gives each arm a spread of its own. All 32 original runs
   are byte-identical in the new 64: same root seed, same sweep id, replicates 0–7 carried over and
   verified record-for-record.

**Tolerances were not tightened by hand, and `toleranceK` is still 3.** Tightening until something
fails trades false negatives for false positives and produces a gate people learn to ignore, which
is worse than a blunt one — a blunt gate at least fails honestly when it fails. Every number above
moved because the *estimator* was corrected, not because a threshold was chosen to make a test go
red.

### The fourteen arm lines that are still blind

Of the 160 arm lines across the two multi-strategy gates, **14 still have a tolerance wider than
their own value.** They are named individually in `gate-power.test.ts`, which fails if the set
changes in either direction.

Every one is an arm whose value sits near zero: `referenceNodesGained@denial-warden` is 0.25 nodes
in two hundred years, so a tolerance of about one node is 424 % of it. That is a fact about the
strategy — `denial-warden` really does suppress discovery to nearly nothing — and not a slack
tolerance. A gate cannot usefully police a *proportional* change in a quantity that is already
almost zero, and more replicates buy only √n against it.

They are listed rather than thresholded so that nobody reads "the gate was fixed" as "the gate sees
everything".

### How to read "power" for a deterministic sweep

The usual statement — *"detects a change of X % with probability P at n runs"* — needs care here,
because the sweep is bit-reproducible at a fixed root seed. Re-running an unchanged build gives a
delta of exactly zero, so the **false-positive rate is 0 at any positive tolerance**. What the
tolerance buys is entirely on the false-negative side.

Two regimes:

- **A change that scales a metric by a constant factor `c`** moves the aggregate by exactly
  `(c−1)·value`, with no sampling error at all. The gate detects it **with probability 1** when
  `|c−1| >` MDE and with **probability 0** below. For this regime the MDE table *is* the power
  table, and P is a step function.
- **A change whose per-run effect is heterogeneous** — mean `δ`, run-to-run spread `τ` — is detected
  with probability `≈ Φ((|δ| − MDE·|value|)/(τ/√n))`. Here `n` matters, and the honest statement is
  that **`τ` has never been measured on this project**: doing so needs two builds differing by one
  known mechanic change, with per-run values recorded on both sides, and no workstream has kept
  those pairs.

So the claim this directory can support is the first, and it is the one to quote:

> **The five-year and twenty-year gates detect any uniform proportional change larger than
> 1–12 % of a metric's value, with probability 1. The twenty-year agency gate detects one larger
> than 2.5–27 % at sweep level and 0.8–196 % per strategy arm, median 12 %. The 200-year gate
> detects one larger than 5–27 % at sweep level and 0–424 % per arm, median 26 %. All four detect a
> uniform change smaller than those figures with probability 0, at any sample size.**

## Regenerating a baseline

One sweep, one baseline, one command. Point `--sweep` and `--baseline` at the pair you mean; the
gate refuses a baseline whose `sweepId` or `configurationHash` belongs to a different experiment,
so crossing them is a build failure rather than a wrong number.

    node packages/mc-harness/bin/regenerate-baseline.mjs \
      --scenario  ./packages/scenario/bin/scenario.mjs \
      --sweep     ./balance/sweeps/balance-gate.sweep.json \
      --baseline  ./balance/baselines/balance-gate-v1.baseline.json \
      --rationale "why these numbers replace the committed ones" \
      --note      "anything a reader must know before believing them" \
      --workers   4

This is CLAUDE.md's rule about `npm run goldens:regen`, applied to the other kind of committed
measurement: **a regenerated baseline is a claim that behaviour changed on purpose.** So:

- `--rationale` is required. Without it the command exits non-zero having run nothing and written
  nothing. The rationale is stored in the file and covered by its hash.
- The new file records `supersedes` — the replaced baseline's `contentHash` — and one
  `supersededDeltas` line per metric, in the units the gate reports. A reviewer reads what moved
  without re-running anything.
- `--tolerance-k` is the only supported way to change a tolerance. Widening one by editing the file
  is the same act as regenerating a baseline without a rationale, so the file carries a
  `contentHash` over its own contents and the gate rejects a baseline whose hash no longer matches.
  The command refuses to regenerate *over* such a file, too, rather than laundering the edit.
- The command refuses a disqualified sweep by name and failure count.

**Nothing automated invokes it.** Not `npm test`, not `npm run verify`, neither CI system.
`packages/mc-harness/test/unit/baseline-regeneration.test.ts` reads the CI configuration and fails
if that ever stops being true.

## The five sweeps

| | `balance-gate` | `balance-gate-horizon` | `balance-gate-agency` | `balance-gate-ascension` | `balance-full` |
|---|---|---|---|---|---|
| `sweepId` | `balance-gate-v1` | `balance-gate-horizon-v1` | `balance-gate-agency-v1` | `balance-gate-ascension-v1` | `balance-full-v1` |
| cells × replicates | 4 × 50 = **200 runs** | 4 × 50 = **200 runs** | 4 × 16 = **64 runs** | 4 × 16 = **64 runs** | 40 × 250 = **10,000 runs** |
| world-tick cap | 60 (five world years) | 240 (twenty world years) | 240 (twenty world years) | 2400 (two hundred world years) | 240 (twenty world years) |
| pool | `passive-control` | `passive-control` | all eight, round-robin | all eight, round-robin | `passive-control` |
| metrics | 9 vital signs | 9 + `referenceNodesGainedFinalQuarter` | 10, × 8 arms = 90 lines | 10, × 8 arms = 90 lines | 9 + `referenceNodesGainedFinalQuarter` |
| wall clock | 4.3 s | 26.3 s | 8.9 s | 83.5 s | **3392 s measured** — see below |
| committed baseline | yes | yes | yes | yes | **no**, and deliberately |
| wired into CI | yes | yes | **not yet** — see above | yes | n/a |

All four gate sweeps are sized to run on every push. That is the whole design constraint: a gate
that takes ten minutes gets deleted, and a gate that never runs is worse than none. Their resulting
standard errors are recorded per metric in each baseline.

The two `passive-control` gate sweeps deliberately share their four cells, their fifty replicates
and their root seed, so that the **only** thing that could explain a divergence between them is the
tick cap. The agency sweep stands in the same relation to `balance-gate-horizon-v1` with the pool as
the single difference, and to `balance-gate-ascension-v1` with the tick cap as the single
difference — three sweeps, two edges, one variable on each. They do not share run seeds — a run seed is derived from `(rootSeed, sweepId, cellIndex,
replicateIndex)` and the sweep ids differ — so they are two samples of the same universe, not one
sample measured twice. The ascension sweep shares their four cells and their root seed and differs
in two declared ways, the tick cap and the pool; both differences are asserted rather than described,
in `horizon-gate.test.ts`.

### The throughput arithmetic, re-measured

The world-loop throughput work landed in `c6cfc82` and made the loop linear in population rather
than superlinear, so every figure this file used to carry is stale. Measured on 2026-08-11, on four
idle cores of a four-core container:

- The fast gate does 200 runs × 60 ticks = 12,000 world ticks in **7.7 s** — about 1,560 world
  ticks per second, against the ~260 recorded before the throughput work.
- The horizon gate does 200 runs × 240 ticks = 48,000 world ticks in **34.8 s** — about 1,380 world
  ticks per second. Four times the ticks for 4.5 times the wall clock: the cost per tick still
  rises with population, but it is close to flat now.
- Run at the end of `npm run verify`, on a container that has just finished the test suite, the
  same 200 runs take **57 s**. That is the number to plan CI around, and it is the reason the
  sweep was not sized to fill a two-minute budget on an idle machine.
- Extrapolating the horizon gate from two smaller probes — 16 runs in 6.87 s, 96 runs in 25.6 s —
  gives 0.234 s per run plus 3.1 s of fixed startup, so a two-minute budget would buy about 500
  runs. 200 was chosen instead, because matching the fast gate's sample size is worth more than the
  extra sensitivity: it keeps the tick cap the single difference between the two gates. The
  remaining budget is the margin for a loaded or slower runner.

### The full sweep, run — task 10.1

**It has now been run, once, and the figures below are measured rather than extrapolated.** On
2026-08-11, on a four-core container:

| | |
|---|---|
| runs | 10,000 — 40 cells × 250 replicates |
| world ticks | 2,400,000 (10,000 × 240) |
| wall clock | **3392 s** — 56 min 32 s |
| throughput | **2.95 runs/s**, **708 world ticks/s** |
| workers | **4** |
| terminal statuses | `truncated` 10,000 |
| failures | **0**, so the sweep is not disqualified |
| metric entries | 100,000 — every one of the ten declared metrics, in every one of the 10,000 records, all `measured` |

Three caveats, because the number is only useful with them:

- **Four workers, not eight.** `release-plan.md`'s 0.5.0 claim says eight, and this container has
  four cores; running eight workers on four cores measures scheduling, not throughput. The figure is
  what four workers did.
- **The container was shared.** Another agent's test suite was running against a sibling worktree
  for part of the sweep, and the run averaged roughly 300% of four cores rather than 400%. So 708
  world ticks per second is a *floor*, not the machine's best.
- 708 ticks/s against the horizon gate's 1,380 is about half, and both directions of that gap are
  explained above: contention, and a full sweep's 40 cells reaching starting positions (16 founding
  nodes, cohorts of 12) that the gate's four cells never visit and that carry more population per
  tick.

**No baseline is committed for the full sweep, and that is deliberate.** It is not a gate: it runs
once per release, not once per push, and a tolerance derived from 10,000 runs would be far tighter
than anything a gate sweep could clear. What the run produced is recorded here and in the two gate
baselines' `notes`.

### Reproducibility, and exactly what was checked — task 10.3

`release-plan.md`'s second 0.5.0 claim is that *"the same sweep configuration and root seed produce
identical aggregate metrics"*. Three checks, and the third is the one the wording asks for least
directly and matters most:

1. **Two executions of the twenty-year gate sweep** — 200 runs, the same 240-tick horizon as the
   full sweep, the same root seed — produced **byte-identical run records**, identical aggregates,
   identical arm metrics, and identical summaries with the performance section excluded. Exact
   equality, no tolerance.
2. **Offline re-aggregation of the 10,000-run sweep** from its stored records alone reproduced the
   live aggregates, the arm metrics, the arm id and the status counts exactly. That is what makes
   the numbers re-derivable by someone who has the results file and not the machine.
3. **Forty of the 10,000 runs — one per parameter cell** — were re-executed alone, single-threaded,
   from their four coordinates, and all forty came back **byte-identical** to the records the
   40-cell, four-worker sweep wrote.

**What was not done: a second execution of the full 10,000-run sweep.** At 56 minutes each that is
two hours of a shared four-core container, and the three checks above cover the same property at
the same tick cap, over the same executor, at both ends of the scale. Stated here rather than
implied, because "reproducible" is the claim everything else in this directory rests on.

The arm-scoped metrics of `contracts.md` §7 were collected over it, which is the first time any of
them has had a real sample:

| §7 arm metric | over 10,000 runs | |
|---|---|---|
| `ascensionRate` | **0** | denominator 10,000, no run ascended — see the degeneracies below |
| `capitalSnowball` | **0.380** | at tick 240; 0.384 at tick 60 |
| `worshipSnowball` | **0.090** | at tick 240, against §7's ≤ 0.35 |
| `prestigeAdvantage` | `no-observations` | the mechanic exists; nothing schedules a mirrored pair yet |
| `winRateByPrimitive` | `mechanic-absent` | it is a raid win rate, and there are no raids |

`capitalSnowball` at 0.380 sits above the 0.35 §7 gives `worshipSnowball` and inherits to *"same,
over library depth"*. **That is a finding, not a balance claim, and specifically a finding about the
degenerate library economy described below** — 2.19 distinct nodes per library against 720
grimoires, because the scribable list is cost-ordered. It has no committed tolerance, on purpose:
gating a number produced by a known-degenerate mechanism would be defending the degeneracy.

## What these numbers are not

They are not a balance claim. `docs/design/release-plan.md` forbids one before 0.5.0, and 0.5.0 is
the release that builds the instrument rather than one that tunes the game.

They are also not `contracts.md` §7's twelve balance metrics. Five of the twelve are now collected
— the three above plus `illegalActionRate` and `libraryDependence`'s machinery — but they are
reported, not gated, and the other seven are honest absences: four need raids, and
`timeToTierBySpecies` and `knowledgeHalfLife` need per-node and per-`(species, tier)` telemetry that
the §4.1 observation does not carry, so no executor in this tree can produce them yet. What is
**gated** is the reference scenario's **vital signs**: population, living mages, distinct nodes
known, instances, grimoires, library depth.

What is gated by the horizon sweep is those nine plus one shape statistic,
`referenceNodesGainedFinalQuarter`: distinct nodes gained over the final quarter of the run. A
plateau is a derivative going to zero, and that is the metric that reads it directly. It is
declared only on the 240-tick sweeps, because the final-quarter window is `ticksRun / 4` widened to
the twelve-tick census grid and is therefore exact only where the tick cap is a multiple of four
census intervals. It is also, measurably, a **lagging** indicator and not a cheaper substitute for
the long horizon: at five years it separates the pre- and post-frontier-fix builds by 10.6 standard
errors where `referenceNodesKnown` separates them by 52.7, because a derivative only falls after
the plateau it describes has set in. Its sharpest reading is around world-year ten.

The universe those vital signs describe is still degenerate, and the ways it is are recorded in each
baseline's own `notes` so that nobody reads the numbers as a description of the finished game: the
population
halves before it grows at five years; library depth reaches 1.70 distinct nodes against 525
grimoires, because the scribable list is cost-ordered and the same cheap nodes are copied over and
over; and several observation channels saturate. Node discovery has left that list — it now reaches
48.35 of the 51 v1 nodes by world-year twenty — and the way it left is recorded below.

Two items have already left that list, and the way they left is the best argument for the gates that
exist. The first baseline recorded `referenceLibraryDepth` at exactly zero — nothing shelved a
grimoire — with a standard error of zero and therefore a tolerance of zero, and a note saying in as
many words that the day something shelved a book this metric would move and the gate would fail.
Grimoire shelving landed a few commits later, `referenceLibraryDepth` went to 1.7 nodes per
universe, the gate failed on it and passed everything else, and the baseline was regenerated with a
rationale naming the change. The movement is in the file, under `supersededDeltas`. A softened
tolerance would have let all of that pass in silence.

The second is the frontier fix. `referenceNodesKnown` moved from 25.195 to 32.650 at five years —
77.8 standard errors, the largest movement either gate has recorded — and the baseline that
supersedes it names the change. The same commit is why the horizon gate exists at all: the fast gate
caught this defect, loudly, but the level it now reports at year five is the level the broken build
would have sat at forever, so the *next* defect of that class would have had somewhere to hide.

A baseline says what the build did on a date. It does not say the build is right.

## What these baselines are keyed to

**This section used to say that no system read `ctx.actions`, so that every scripted strategy
produced the same universe. That stopped being true when `god-agency` landed and the sentence
survived it.** It is corrected here rather than deleted, because a stale limitation is worse than
none: it excuses a real flat result, and this one told a reader not to run the experiment that found
the pool could not win.

What is true now:

- `coordination/src/god/interventions.ts` implements all fifteen verbs; worship accrues, favor
  regenerates and is spent, and a universe can ascend or stagnate. Measured at 2400 ticks, the pool
  spreads from 9 distinct nodes known (`narrow-depth`) to 237 (`permissive-breadth`).
- `balance-gate-v1` and `balance-gate-horizon-v1` are still keyed to the **passive control**, by
  choice: they run `passive-control` fixed, so all 400 of their runs measure the simulation's own
  evolution rather than a strategy's. Substituting a strategy that acts is a different experiment,
  which is what `balance-gate-ascension-v1` is.
- `balance-gate-ascension-v1` is keyed to a build in which ascension eligibility opens by **passive
  accumulation**: Path A gates on world tick ≥ 600 and worship tier ≥ 4, and worship accrues from
  mages, universities and populace whether or not the god acts. So its 46-of-64 ascension rate is a
  statement about a clock, not about play. Making the gate depend on play is W2 of the
  ascension-meta campaign, and when it lands **every number in that file should move**. That is the
  gate working, not a defect. Regenerate with a rationale naming the constants that changed and the
  measured deltas that justify them; do not widen a tolerance.
