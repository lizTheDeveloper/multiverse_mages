# `balance/` — the sweeps that are gated, and the numbers they are gated against

Two kinds of file live here, and one command each.

    balance/sweeps/      the experiments, as committed JSON
    balance/baselines/   what each gate sweep measured, and how far it may move

## What the gates actually do

There are **three** of them, and they are three instruments rather than one instrument run three
times.

| | `npm run balance:gate` | `npm run balance:gate:horizon` | `npm run balance:gate:ascension` |
|---|---|---|---|
| sweep | `balance-gate.sweep.json` | `balance-gate-horizon.sweep.json` | `balance-gate-ascension.sweep.json` |
| horizon | 60 ticks — **five** world years | 240 ticks — **twenty** world years | 2400 ticks — **two hundred** world years |
| pool | `passive-control`, fixed | `passive-control`, fixed | all eight, round-robin |
| runs | 4 cells × 50 = 200 | 4 cells × 50 = 200 | 4 cells × 8 = 32 |
| wall clock | ~8 s idle, ~7 s in `verify` | ~35 s idle, ~57 s in `verify` | ~46 s on 4 workers |
| answers | *did anything move?* | *did the universe stop?* | *can anyone still win?* |

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

Its sample is small — 32 runs, four per strategy — and its tolerances are correspondingly wide,
about 33 nodes on `referenceNodesKnown` against the horizon gate's 0.238. That is not sloppiness and
it is not fixable by adding replicates: the standard-error estimator stratifies on `cellIndex`, and
within a cell of *this* sweep the eight replicates are eight different strategies, so most of what
it calls noise is real strategy effect. The two instruments therefore answer different questions and
the wide one is still worth running, because the failure it catches — the pool stops being able to
win, or starts winning at a wholly different time — is invisible to a tolerance of 0.238 taken over
a control that never plays.

**Do not lengthen the two gates above to fold this one in.** Their horizons are argued from
measured sensitivity per second, and 200 runs at 2400 ticks is roughly forty minutes of a four-core
container per push.

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

## The four sweeps

| | `balance-gate.sweep.json` | `balance-gate-horizon.sweep.json` | `balance-gate-ascension.sweep.json` | `balance-full.sweep.json` |
|---|---|---|---|---|
| `sweepId` | `balance-gate-v1` | `balance-gate-horizon-v1` | `balance-gate-ascension-v1` | `balance-full-v1` |
| cells × replicates | 4 × 50 = **200 runs** | 4 × 50 = **200 runs** | 4 × 8 = **32 runs** | 40 × 250 = **10,000 runs** |
| world-tick cap | 60 (five world years) | 240 (twenty world years) | 2400 (two hundred world years) | 240 (twenty world years) |
| pool | `passive-control` | `passive-control` | all eight, round-robin | `passive-control` |
| metrics | 9 vital signs | 9 + `referenceNodesGainedFinalQuarter` | 9 + `referenceNodesGainedFinalQuarter` | 9 + `referenceNodesGainedFinalQuarter` |
| wall clock | ~8 s idle, ~7 s in `verify` | ~35 s idle, ~57 s in `verify` | ~46 s on 4 workers | **3392 s measured** — see below |
| committed baseline | yes | yes | yes | **no**, and deliberately |

All three gate sweeps are sized to run on every push. That is the whole design constraint: a gate
that takes ten minutes gets deleted, and a gate that never runs is worse than none. Their resulting
standard errors are recorded per metric in each baseline.

The two `passive-control` gate sweeps deliberately share their four cells, their fifty replicates
and their root seed, so that the **only** thing that could explain a divergence between them is the
tick cap. They do not share run seeds — a run seed is derived from `(rootSeed, sweepId, cellIndex,
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
  mages, universities and populace whether or not the god acts. So its 27-of-32 ascension rate is a
  statement about a clock, not about play. Making the gate depend on play is W2 of the
  ascension-meta campaign, and when it lands **every number in that file should move**. That is the
  gate working, not a defect. Regenerate with a rationale naming the constants that changed and the
  measured deltas that justify them; do not widen a tolerance.
