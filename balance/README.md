# `balance/` — the sweeps that are gated, and the numbers they are gated against

Two kinds of file live here, and one command each.

    balance/sweeps/      the experiments, as committed JSON
    balance/baselines/   what the gate sweep measured, and how far it may move

## What the gate actually does

`npm run balance:gate` runs `balance/sweeps/balance-gate.sweep.json` against the reference
universe, compares every metric to `balance/baselines/balance-gate-v1.baseline.json`, and exits
non-zero if anything is out of place. It is part of `npm run verify`, so the self-hosted runner
picks it up, and it is named as its own step in `.github/workflows/ci.yml`, because that workflow
lists its steps by hand. Both, deliberately — see `docs/devops/ci-and-deploy.md` for why this
repository has two CI systems and why neither can cover for the other.

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

## Regenerating a baseline

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

## The two sweeps

| | `balance-gate.sweep.json` | `balance-full.sweep.json` |
|---|---|---|
| `sweepId` | `balance-gate-v1` | `balance-full-v1` |
| cells × replicates | 4 × 50 = **200 runs** | 40 × 250 = **10,000 runs** |
| world-tick cap | 60 (five world years) | 240 (twenty world years) |
| wall clock | ~45 s on 4 idle cores | see below |
| committed baseline | yes | **no** |

The gate sweep is sized to run on every push. That is the whole design constraint: a gate that
takes ten minutes gets deleted, and a gate that never runs is worse than none. Its resulting
standard errors are recorded per metric in the baseline; at 200 runs they range from 0 (for the
metrics that never vary) to about 2.4 for `referenceKnowledgeInstances`.

**The full sweep has never been run, and no baseline is committed for it.** Task 10.1 of
`agent-interface` owns running it, and it cannot be run on this build. The arithmetic:

- The gate sweep does 200 runs × 60 ticks = 12,000 world ticks at about 260 world ticks per second
  on 4 workers — roughly 45 seconds when the machine is otherwise idle, and about 80 when it is
  not. Both figures were measured on 2026-08-11 on a four-core container; neither is a promise
  about anyone else's hardware.
- The full sweep is 10,000 runs × 240 ticks = 2,400,000 world ticks — 200 times as much work if
  the cost per tick were constant.
- It is not constant. The world loop is superlinear in mage count, and a 240-tick universe carries
  far more mages than a 60-tick one: a single 240-tick run at roughly 1,200 mages has been measured
  at about 280 seconds. Ten thousand of those on eight workers is on the order of **four days**.

So the file is committed as the declared experiment, and the number that has to change before it
can be executed is the world loop's cost per tick, not this file. Committing a baseline for a sweep
nobody has run would be committing numbers nobody produced.

## What these numbers are not

They are not a balance claim. `docs/design/release-plan.md` forbids one before 0.5.0 and this build
is 0.3.0. They are not `contracts.md` §7's twelve balance metrics either: six of those describe
mechanics that have not shipped — raids, god actions, worship, prestige — and the rest need
per-node and per-`(species, tier)` telemetry that the §4.1 observation does not carry, so no
executor in this tree can produce them yet. What is gated instead is the reference scenario's
**vital signs**: population, living mages, distinct nodes known, instances, grimoires, library
depth.

The universe those vital signs describe is still degenerate, and the ways it is are recorded in the
baseline's own `notes` so that nobody reads the numbers as a description of the finished game: node
discovery plateaus well short of the 51 v1 nodes; every scripted strategy produces the same universe
because no system reads a god action; the population halves before it grows; and several observation
channels saturate.

One item has already left that list, and the way it left is the best argument for the gate that
exists. The first baseline recorded `referenceLibraryDepth` at exactly zero — nothing shelved a
grimoire — with a standard error of zero and therefore a tolerance of zero, and a note saying in as
many words that the day something shelved a book this metric would move and the gate would fail.
Grimoire shelving landed a few commits later, `referenceLibraryDepth` went to 1.7 nodes per
universe, the gate failed on it and passed everything else, and the baseline was regenerated with a
rationale naming the change. The movement is in the file, under `supersededDeltas`. A softened
tolerance would have let all of that pass in silence.

A baseline says what the build did on a date. It does not say the build is right.
