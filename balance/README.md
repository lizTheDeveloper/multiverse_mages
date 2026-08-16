# `balance/` — the sweeps that are gated, and the numbers they are gated against

Two kinds of file live here, and one command each.

    balance/sweeps/      the experiments, as committed JSON
    balance/baselines/   what each gate sweep measured, and how far it may move

One further artifact, which is neither:

    balance/metric-reachability.json   which metrics can be made to move at all

## Before a metric may be gated or optimised — `npm run check:metric-reachability`

A gate compares a metric against a baseline. It cannot tell you whether the metric is capable of
moving in the first place, and **an instrument that cannot move reads as green forever**. The
campaign found ten of those; every one was passing.

So `scripts/check-metric-reachability.mjs` asks, per registered metric: ablate the mechanism it
names, run paired arms under common random numbers, and report one of three verdicts —

- **`moves`** — the paired 95% interval excludes zero. Safe to gate, safe to optimise.
- **`inert`** — the experiment ran, the lever demonstrably reached the simulation, and the metric
  did not respond. A finding *about the metric*.
- **`not-measurable`** — the experiment could not be run: no producer, no observation, no pair, or a
  lever that never reached the simulation. **Not** a claim that the mechanism does nothing.

`inert ∪ not-measurable` is the **quarantine list**, and it is published rather than applied
silently, because a silently-skipped metric is how this failure returns.

**It is deliberately not in `npm run verify`.** It costs minutes, and — the load-bearing reason — a
quarantine list must not be a build failure. The cheapest way to clear a build failure is to stop
measuring, and this list is only worth anything while nobody is under pressure to shorten it. It
exits non-zero on exactly one condition: a registered metric with *no* verdict, which is the
silently-skipped metric the guard forbids.

The report is stamped with the git SHA it was taken on. It will rot the day somebody wires a
collector or consumes the ablation mask — re-run it rather than reading it.

## What the gates actually do

There are **four** of them, and they are four instruments rather than one instrument run four times.

| | `npm run balance:gate` | `npm run balance:gate:horizon` | `npm run balance:gate:agency` | `npm run balance:gate:ascension` |
|---|---|---|---|---|
| sweep | `balance-gate.sweep.json` | `balance-gate-horizon.sweep.json` | `balance-gate-agency.sweep.json` | `balance-gate-ascension.sweep.json` |
| horizon | 60 ticks — **five** world years | 240 ticks — **twenty** world years | 240 ticks — **twenty** world years | 2400 ticks — **two hundred** world years |
| pool | `passive-control`, fixed | `passive-control`, fixed | all eight, round-robin | all eight, round-robin |
| runs | 4 cells × 50 = 200 | 4 cells × 50 = 200 | 4 cells × 16 = 64 | 4 cells × 16 = 64 |
| wall clock | 4 s | 27 s | **10 s** | **830–1154 s** |
| plays a god verb | **no** | **no** | yes | yes |
| in `npm run verify` | yes | yes | yes | **no** — own Actions job, required at release |
| answers | *did anything move?* | *did the universe stop?* | *do the god's verbs still do anything?* | *can anyone still win?* |

Wall clock measured 2026-08-12 on four workers of an eight-core machine, against the merged tree.
**The 200-year gate is now the whole cost of `verify`**, and that is new: the same sweep cost 83 s a
day earlier, on a build with a quarter of the population and a seventh of the mages. See *"the
200-year gate has become expensive"* below — it is a decision waiting to be made, and it is not
this document's to make.

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
the two is attributable to god agency and to nothing else. It costs **10 seconds** on four
workers: a third of the twenty-year gate, and **one eighty-third** of the 200-year one.

So the answer to *"is the ascension gate the only thing that can ever see a god verb, and does that
sensitivity cost 892 seconds?"* is **no to the first half, and the second half needs restating**:

- **God sensitivity costs about ten seconds.** It does not need the long horizon at all. What the
  2400-tick horizon uniquely buys is the *win condition* — 0 of 400 runs ascend at 240 ticks, 46 of
  64 at 2400 — and that is a different question from whether the verbs do anything.
- **The 892 s figure was misleading when it was quoted and is roughly right now, for a different
  reason.** It comes from `practice-results.md` on `origin/w53/practice`, measured on a contended
  container: on that build the same 32-run sweep took **71 s** here, so 892 s described the machine
  rather than the instrument. But on the merged tree the sweep genuinely costs **830 s** for 64
  runs, because the simulation got heavier — not because the measurement was bad. Both statements
  are true and they are about different things, which is exactly why a wall-clock figure needs its
  build and its machine attached or it will be re-quoted forever as a property of the sweep.

It is wired like the other three: `npm run balance:gate:agency`, part of `npm run verify`, named by
hand as a step in both full-suite GitHub Actions jobs, and reached by the self-hosted runner through
`verify`. `balance-ci-wiring.test.ts` asserts all four of those for all four gates, and
`horizon-gate.test.ts` asserts that its horizon matches the twenty-year gate's and its pool matches
the two-hundred-year gate's — so "the agency gate is just the horizon gate" has to argue with a
failing test.

### The 200-year gate has become expensive, and has moved off the merge path

Measured on the merged tree: **830 s** for its 64 runs on an otherwise-quiet eight-core machine,
and **1154 s** for the same 64 runs an hour later while three sibling worktrees were running their
own suites. Against 83 s for the same sweep a day earlier. The sweep did not change; the simulation
got heavier — mean population went from 5,400 to 15,764 and living mages from 70 to 468.

Those two figures, 830 and 1154, are the same instrument on the same build forty minutes apart, and
they are worth putting beside the 892 s above: **a wall-clock number without its machine and its
neighbours attached is not reproducible**, and this file has now been misled by that once. The CI
figure to plan around is the *contended* one, because a runner that is busy is the normal case.

Halving back to 32 runs would cost about 415 s and give back every blind spot this section is about,
so that is not the lever.

**Decided 2026-08-13: it is off the blocking path, and still runs on every commit.**

The forcing event was concrete rather than theoretical. Seven pull requests — #37, #61, #63, #64,
#65, #66, #67 — were queued on the self-hosted runner at once, every one reporting
`ci/hetzner-lint pending: "Queued -- another CI run in progress"`. That runner **serialises**, and
against a 2400 s timeout a twenty-minute `verify` is not merely slow; it is a queue hazard for every
unrelated pull request. The fix was itself in the queue, behind the problem it solved.

So:

| | runs it |
|---|---|
| `npm run verify` | five-year, twenty-year, agency. **~40 s of gates.** Both CI systems. |
| `npm run verify:full` | the above **plus** the two-hundred-year gate. Nothing automated calls it. |
| **Balance gate, two hundred world years** | its own parallel GitHub Actions job, **every commit**, **not required to merge**. Measured 35m09s there on 2026-08-13. |
| `docs/design/release-plan.md` | makes it **required at release**. |

Three things this is *not*, because each is a way the arrangement could decay:

- **It is not "run it less often".** It runs on every commit and on `main`, exactly as before.
  Actions is free and unmetered for this public repository, so per-commit coverage costs nothing but
  wall clock nobody waits on. Held to release time only, a regression would surface weeks after the
  commit that caused it with a bisect range to match.
- **It is not softened.** The job carries no `continue-on-error`, unlike the two jobs in that
  workflow that are *expected* red. This one is expected green, so a failure has to look like one.
  It is off the blocking path because of its runtime, not because its result is soft.
- **It is not a weakening of the merge gate's coverage of god agency.** That was the whole point of
  the agency gate: god-verb sensitivity now costs 10 s and stays on every push. What the long
  horizon uniquely buys is the **win condition**, and *"Monte Carlo baselines committed and green"*
  is a release-time claim — that is what `release-plan.md`'s MINOR parity means.

**Why not fan it out into `verify` instead?** `run-sweep-distributed.mjs` is genuinely reproducible
— byte-identical output across five topologies — and 1096 runs in 85 s for $0.57 is real. It is the
right tool for the large-N release-time sweeps that give `ascensionRate` an interval narrower than
its own band. It is the **wrong** tool for a merge gate, for a reason that is structural rather than
a matter of taste: it needs Modal credentials, and `docs/devops/ci-and-deploy.md` makes GitHub
Actions *the only CI system that may safely see a fork pull request*, precisely because it holds
none. A credentialed gate either fails on every fork PR or stops being credential-free, and the
second is a security regression. That it would also turn a third-party outage into a red build is
true, and is the smaller of the two objections.

`scripts/ci-check.sh` stays equivalent to `npm run verify` — a standing `CLAUDE.md` constraint that
this decision does not bend. It runs the fast one.

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
The table below is that division, and `packages/mc-harness/test/unit/gate-power.test.ts` parses it
back out of this file and recomputes every cell from the committed baselines, so it cannot go stale
the way the `ctx.actions` note further down this file did.

Each cell is the **minimum detectable effect (MDE)**: `tolerance ÷ |value|`, the smallest
proportional change in that metric the gate would report as `regressed`. Anything smaller passes.

| metric | 5-year gate | 20-year gate | 20-year agency gate | 200-year gate |
|---|---|---|---|---|
| `referenceGrimoires` | 5.5 % | 6.5 % | 12.4 % | 16.2 % |
| `referenceKnowledgeInstances` | 2.4 % | 2.4 % | 5.6 % | 7.2 % |
| `referenceLibraryDepth` | 16.0 % | 14.2 % | 22.4 % | 17.5 % |
| `referenceLivingMages` | 0.8 % | 1.6 % | 3.3 % | 6.1 % |
| `referenceNodesGained` | 3.0 % | 1.4 % | 8.5 % | 2.8 % |
| `referenceNodesGainedFinalQuarter` | — | 3.8 % | 25.7 % | 26.4 % |
| `referenceNodesKnown` | 2.5 % | 1.3 % | 7.9 % | 2.7 % |
| `referencePeakPopulation` | 0.0 % | 16.6 % | 8.2 % | 1.4 % |
| `referencePopulation` | 1.0 % | 1.9 % | 3.3 % | 8.1 % |
| `referencePopulationChange` | 8.6 % | 5.8 % | 10.0 % | 8.2 % |
| runs | 200 | 200 | 64 | 64 |
| plays a god verb | no | no | **yes** | **yes** |
| wall clock, 4 workers | 4 s | 27 s | **10 s** | **830–1154 s** |

Both multi-strategy gates carry **80 further lines each**, one per `(metric, strategy)`. That is
where their power actually lives; the column above is a summary of a mean taken over eight
strategies that do very different things, and both figures below count **measured, nonzero** arm
lines only — a line at zero has no proportional effect to be minimum-detectable about, which is the
same reason the table above prints an em dash rather than `Infinity`. Agency arm lines: median MDE
14.0 %, **77 of 80** below 100 %. Ascension arm lines: median 13.8 %, 67 of 77 below 100 % (the
denominator moved from 80 to 77 when the convention was written down here, not when any file
changed).

The agency gate's two blind lines closed at `w107`, and it is worth being precise about why. They
were `referenceNodesGained@denial-warden` and `referenceNodesKnown@denial-warden`, both means so
close to zero that a tolerance of three standard errors exceeded them; `apply-magic` moved that mean
from 4.75 to 5.75 nodes. Nothing about the instrument got better — the arm stopped sitting on zero.

**And they reopened at `w108`, by the same argument running backwards.** Re-recording
`balance-gate-agency-v1` for `w108/university-fidelity` moved `denial-warden`'s
`referenceNodesKnown` 5.75 → 4.125 and its `referenceNodesGained` 3.25 → 1.625, which is a pure
re-roll of handle-keyed draws — the branch allocates `UNIVERSITY_STAFF` link rows and
`contracts.md` §6 splits the RNG per entity handle — and the arm went back to sitting close enough
to zero that three standard errors exceed it. MDE is now 114 % and 289 % on those two lines. **The
instrument did not change; the arm moved under it, twice, in opposite directions.** That is the
argument for keeping the list rather than a threshold: a line this close to zero will cross 100 %
in either direction on a re-roll, and the crossing has to arrive with a rationale each time.

**And a third opened at `anti-requisites` (PR #161) — this one a mechanic, not a re-roll.**
The shipped exclusion pair (`creo-ignem` ⊥ `creo-umbra`, `destructive`) cut
`permissive-breadth`'s final-quarter node gain to a fraction of what it was, and an arm whose mean
has fallen onto zero is one whose three-standard-error tolerance exceeds it. It is listed alongside
the two `denial-warden` lines in `gate-power.test.ts`'s `BLIND_ARM_LINES` so that a fourth cannot
join them in silence. Note the contrast with the pair above, which is the whole reason the list
carries reasons rather than counts: **the `denial-warden` crossings are the arm moving under a
re-roll, and this one is content the god actually shipped.**

`referencePeakPopulation` on the five-year gate has an MDE of exactly zero — its jackknife standard
error is 0, because the peak is 216 in all 200 runs, so the gate demands exact equality. That is the
estimator behaving as designed and it is the one line gating perfectly.

### What this looked like before 2026-08-12, and why

The 200-year gate was incapable of detecting almost anything. Both columns below are the **same
build** — the merged tree — so the difference is the statistic and nothing else:

| metric | MDE before | MDE now |
|---|---|---|
| `referenceNodesGainedFinalQuarter` | **131.5 %** | 8.9 % |
| `referenceLivingMages` | **115.2 %** | 5.4 % |
| `referenceLibraryDepth` | 58.5 % | 18.0 % |
| `referenceNodesGained` | 57.3 % | 1.9 % |
| `referenceNodesKnown` | 54.9 % | 1.8 % |
| `referenceGrimoires` | 47.0 % | 17.7 % |
| `referenceKnowledgeInstances` | 44.6 % | 6.5 % |
| `referencePopulationChange` | 27.7 % | 7.8 % |
| `referencePopulation` | 27.5 % | 7.7 % |
| `referencePeakPopulation` | 19.5 % | 4.2 % |

An MDE above 100 % means a mechanic that **doubled** the metric would move it by less than the
tolerance, and the gate would report `pass`. Two lines were over that mark. On the build this
project was running a day earlier the worst two were `referenceGrimoires` at **117.7 %** and
`referenceNodesGainedFinalQuarter` at **135.7 %** — the defect is a property of the statistic, not
of any one build, and it followed the build wherever it went.

The cause was not the sample size. The 32 runs were eight strategies round-robin across four cells,
and **the strategies' outcomes span up to 294×**:

| metric | narrowest arm | widest arm | spread |
|---|---|---|---|
| `referenceKnowledgeInstances` | `denial-warden` 19.3 | `permissive-breadth` 5652.0 | **294×** |
| `referenceNodesGained` | `denial-warden` 0.75 | `permissive-breadth` 197.3 | **263×** |
| `referenceNodesKnown` | `denial-warden` 3.25 | `permissive-breadth` 199.8 | **62×** |
| `referenceGrimoires` | `narrow-depth` 15.0 | `archivist` 580.3 | **39×** |

The standard-error estimator stratified on `cellIndex`, and **strategy is not part of `cellIndex`**.
It arrives through `agentPool`, not through `factors`: `assignStrategies` hands run *r* of a cell
the strategy `strategies[r % 8]`, which is as deliberate and as reproducible as any factor level. So
the estimator saw eight replicates per cell disagreeing enormously and recorded that disagreement as
noise. The tolerance was a function of **between-strategy variance** rather than of run-to-run
variance — and between-strategy variance is the thing a regression gate must hold constant, not
tolerate.

**The pooling was never a decision; it was a blind spot.** `standard-error.ts` had, the whole time, a
docstring arguing exactly why it should not happen — *"Cell membership is not random. Seeds are"* —
sitting above code that stratified on half the design. A correct comment above code that does not
follow it is the most instructive shape of defect this project keeps producing.

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
   applied to the whole design instead of half of it. It changes **nothing** for a single-strategy
   sweep, which is why `balance-gate-v1` and `balance-gate-horizon-v1` keep the numbers they were
   committed with and were not regenerated.
2. **Every multi-strategy gate gates each arm separately**, under ids like
   `referenceGrimoires@archivist`. This is the half that fixes the counterfactual above: a change
   confined to one strategy is now compared against that strategy's own committed value, at that
   strategy's own noise level, instead of being divided by eight first.
3. **Both multi-strategy sweeps run 16 replicates rather than 8.** At 8, round-robin over 8
   strategies put exactly one run in every `(cell, arm)` stratum, every within-stratum variance was
   0, and a corrected estimator would have produced a tolerance of **0** on every line — a gate
   demanding bit-equality of 90 numbers, which is a golden fixture wearing a gate's clothes. 16 is
   the smallest multiple of the pool size that gives each arm a spread of its own.

**Tolerances were not tightened by hand, and `toleranceK` is still 3.** Tightening until something
fails trades false negatives for false positives and produces a gate people learn to ignore, which
is worse than a blunt one — a blunt gate at least fails honestly when it fails. Every number above
moved because the *estimator* was corrected.

### The nine arm lines that are still blind

Of the 160 arm lines across the two multi-strategy gates, **9 still have a tolerance wider than
their own value.** They are named individually in `gate-power.test.ts`, which fails if the set
changes in either direction.

Seven of the nine are `denial-warden`, whose whole purpose is to suppress discovery to nearly
nothing: an arm that gains a fraction of a node has no meaningful *proportional* tolerance, because
the denominator is almost zero. That is a fact about the strategy, not a slack tolerance, and more
replicates buy only √n against it. They are listed rather than thresholded so that nobody reads
"the gate was fixed" as "the gate sees everything".

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
> 0.8–12.4 % of a metric's value, with probability 1. The twenty-year agency gate detects one larger
> than 2.7–22.5 % at sweep level and 0.8–217 % per strategy arm, median 13.4 %. The 200-year gate
> detects one larger than 1.8–18.0 % at sweep level and 0–300 % per arm, median 14.1 %. All four
> detect a uniform change smaller than those figures with probability 0, at any sample size.**

## Running a sweep on more cores than you have

Every wall-clock figure in this file is a laptop or a four-core container, and the sample sizes it
can afford are the reason `ascensionRate`'s 95% interval at 24 runs is nearly three times the §7
band it is meant to sit inside. `packages/mc-harness/bin/run-sweep-distributed.mjs` fans a sweep out
across many containers and writes **the same `.runs.ndjson` and `.summary.json`** — byte-identical
to the local run, verified across five topologies — so `balance-gate.mjs`, `regenerate-baseline.mjs`
and `tune-balance.mjs` read its output unchanged.

Measured: the 2400-tick eight-strategy sweep at 1096 runs is 25 minutes locally and **85 seconds
and $0.57** on 64 eight-core containers. `docs/devops/sweep-fanout.md` has the cost table, the
byte-identity hashes, and what the thing refuses to do. **`bin/run-sweep.mjs` remains the default
and needs no account anywhere.**
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

## Re-sealing a baseline, when the content moved and the behaviour did not

A baseline carries two different claims — *what this build measured*, and *which build that was* —
and until 2026-08-14 they could only be changed together. That was a real problem, because the gate
refuses `baseline-invalid` on a `provenance` mismatch **before it reads a single metric**. Author a
node's gloss, and every gate reports a failure while every metric underneath it reads its committed
value to the digit. The branch is unmergeable, and the only expressible remedy was to re-record
numbers that had not moved — which costs a merge conflict to every other open branch and banks
whatever else has drifted since.

    node packages/mc-harness/bin/reseal-baseline.mjs \
      --scenario  ./packages/scenario/bin/scenario.mjs \
      --sweep     ./balance/sweeps/balance-gate.sweep.json \
      --baseline  ./balance/baselines/balance-gate-v1.baseline.json \
      --sealed-on 2026-08-14 \
      --workers   4

It rewrites `provenance`, appends one note, recomputes `contentHash`, and **passes every metric line
through byte for byte** — asserted on the encoded file text before the write, not on two in-memory
arrays. `--dry-run true` verifies and reports without touching the file. `--note` is repeatable and
appends; nothing here ever replaces `notes`, because a file that lost four caveats is
indistinguishable from one that never had them.

**It runs the gate sweep anyway, and no flag skips it.** *"Re-seal without re-measuring"* is a
statement about what gets **written**, not about what gets **checked**. A content hash is opaque to
behaviour, so the only sound way to know a re-seal is the right tool is to measure and throw the
measurement away. The verification costs exactly what the gate costs — 4 s, 27 s and 10 s for the
three gates inside the required check, ~1000 s for the two-hundred-year one — and not one of its
numbers is written.

If any gated metric has left its tolerance, become available, stopped being available, or moved its
`definitionVersion`, the command **refuses and names it**, and a sweep that is disqualified, differently
seeded or differently configured is refused too. Re-sealing over a real movement would hide a
regression behind a fresh seal, which is worse than the blocked merge it was reaching for. There is
no `--force` and no `--skip-verify`, and `baseline-reseal.test.ts` fails if one appears.

**A re-seal is not a way to make a red gate green.** If the gate is red on a *number*, this command
will refuse, and the answer is a regeneration with a rationale — or finding out why the number moved.
The two are different claims and the file says which one it is carrying.

The design constraint it is built against is the one `reachability:pin` violates: *a tool that writes
a whole baseline needs an instrument that attributes rows, or its convenience path silently launders
someone else's debt.* The instrument here is the drift report. Every gated metric's observed
movement is printed on **every** run, including the passing ones and the zero ones, and the largest
is written into the note where it stays in the file. The command banks no number, and the author sees
exactly what they are sealing over.

**Nothing automated invokes this one either** — not even an npm script, which is a step stricter than
the regeneration command needs, because a re-seal is cheaper to run and produces a smaller diff, so a
reachable one would be the easier mistake to make.

## The five sweeps

| | `balance-gate` | `balance-gate-horizon` | `balance-gate-agency` | `balance-gate-ascension` | `balance-full` |
|---|---|---|---|---|---|
| `sweepId` | `balance-gate-v1` | `balance-gate-horizon-v1` | `balance-gate-agency-v1` | `balance-gate-ascension-v1` | `balance-full-v1` |
| cells × replicates | 4 × 50 = **200 runs** | 4 × 50 = **200 runs** | 4 × 16 = **64 runs** | 4 × 16 = **64 runs** | 40 × 250 = **10,000 runs** |
| world-tick cap | 60 (five world years) | 240 (twenty world years) | 240 (twenty world years) | 2400 (two hundred world years) | 240 (twenty world years) |
| pool | `passive-control` | `passive-control` | all eight, round-robin | all eight, round-robin | `passive-control` |
| metrics | 9 vital signs | 9 + `referenceNodesGainedFinalQuarter` | 10, × 8 arms = 90 lines | 10, × 8 arms = 90 lines | 9 + `referenceNodesGainedFinalQuarter` |
| wall clock | 4 s | 27 s | 10 s | **830–1154 s** | **3392 s measured** — see below |
| committed baseline | yes | yes | yes | yes | **no**, and deliberately |
| where it runs | `verify` | `verify` | `verify` | own Actions job, `verify:full` | by hand |

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
