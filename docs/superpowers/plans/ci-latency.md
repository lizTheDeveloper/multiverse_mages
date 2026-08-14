# CI latency — diagnosis and plan

Written against the symptom on PR #16: `ci/hetzner-lint` sat in
`Queued -- another CI run in progress` for a long stretch, and the GitHub Actions
`Verify (pinned Node)` job took 7m23s.

Everything below is measured, not estimated. Nothing here changes production CI —
this is a proposal, and the runner-side item has to be executed by hand on the box.

## 1. Where the time goes

Authoritative source: the exact 7m23s job. Actions run `31554902836`,
`Verify (pinned Node)`, SHA `c02fb481` on `integration/measured-ground`,
started `01:50:21Z`, completed `01:57:44Z` — **443 s**.

| Step | Seconds | Share |
|---|---:|---:|
| Set up job + checkout + `setup-node` | 4 | 0.9% |
| Install (`npm ci`) | 3 | 0.7% |
| Typecheck (`tsc --build`) | 11 | 2.5% |
| Lint (`eslint .`) | 8 | 1.8% |
| Dependency-purity check | <1 | ~0% |
| Content validation | <1 | ~0% |
| Audio content validation | <1 | ~0% |
| Primitive coverage | <1 | ~0% |
| **Test (`vitest run`, 259 test files)** | **189** | **42.7%** |
| Balance gate — five world years (60 ticks) | 14 | 3.2% |
| **Balance gate — twenty world years (240 ticks)** | **87** | **19.6%** |
| **Balance gate — two hundred world years (2400 ticks)** | **125** | **28.2%** |
| Post steps | 2 | 0.5% |

Two facts fall out of this:

- **`vitest` and the three balance gates are 94% of the job** (415 s of 443 s).
  Everything else — install, typecheck, lint, purity, content, audio, coverage —
  is 27 s combined. There is nothing to win outside those four steps.
- **The gates cost more on a 4-vCPU CI runner than the "four idle cores" figures
  in `docs/devops/ci-and-deploy.md` suggest.** Measured on Actions: 14 s / 87 s /
  125 s, against the ~8 s / ~35 s / ~47 s reference. `ci-and-deploy.md`'s table is
  a lab number; CI is roughly 2.5× that. The ascension gate is the worst offender
  — it is quoted at ~47 s and measures **125 s on Actions and 117.5 s on 16 idle
  cores**, so the quoted figure is not merely a slower-hardware effect. That table
  is worth correcting in the doc, and it does not currently list the third gate at
  all (it still describes "two, and they are not redundant either").

Local cross-check, 16-core Apple Silicon, same tree (`ci-latency-probe` worktree
off `origin/integration/measured-ground`):

| Step | Seconds |
|---|---:|
| `npm ci` | 1 |
| typecheck (cold, no `.tsbuildinfo`) | 6.6 |
| typecheck (warm) | 0.3 |
| lint | 4.9 |
| purity / content / audio / coverage | 0.19 / 0.23 / 0.20 / 0.23 |
| `vitest run` | 101 |
| balance gate (5y) | 6.8 |
| balance gate horizon (20y) | 44 |
| balance gate ascension (200y) | 117.5 |
| **total** | **282 (4m42s)** |

Same shape overall — except for one step. `vitest` went 189 s → 101 s and the
horizon gate 87 s → 44 s, but the ascension gate went **125 s → 117.5 s**: a 6%
gain from 4× the cores. **I have not measured why.** Both gates run `--workers 4`,
so worker count alone does not explain it; the ascension sweep differs in being
round-robin over 8 strategies at a 2400-tick cap, so a single long-tail replicate
dominating one worker is a plausible but unverified explanation. Recorded as an
observation, not a mechanism.

The practical consequence stands either way: **the ascension gate is roughly a
two-minute floor regardless of machine**, so it is the step least likely to be
helped by a faster or bigger box.

### The one genuinely redundant piece of work inside `verify`

`prebalance:gate`, `prebalance:gate:horizon` and `prebalance:gate:ascension` are
each `npm run typecheck`. `verify` already ran `typecheck` first, so the build
runs **four times** per `verify`. Measured cost of the three extra warm rebuilds:
**~0.9 s total** (0.3 s each). It is real redundancy and it is noise. Not worth a
change on latency grounds; noted so nobody re-discovers it and thinks it matters.

`vitest` runs each suite exactly once — one root `vitest.config.ts`, one project,
three non-overlapping include globs (`unit`, `golden`, `adversarial`). No suite is
executed twice.

## 2. The self-hosted runner serializes, with concurrency 1

Measured from the commit statuses on the five `integration/measured-ground`
commits, via `gh api .../commits/<sha>/statuses`:

| SHA | Queued at | Running at | Success at | Queued for | Ran for |
|---|---|---|---|---:|---:|
| `abcda16b` | — | 01:36:12 | 01:43:38 | 0 | 7m26s |
| `516ac980` | 01:39:04 | 01:43:38 | 01:50:59 | 4m34s | 7m21s |
| `e90a70c2` | 01:44:22 | 01:51:00 | 01:58:17 | 6m38s | 7m17s |
| `a8bac5f5` | 01:45:42 | 01:58:18 | 02:05:40 | 12m36s | 7m22s |
| `c02fb481` | 01:50:04 | 02:05:41 | 02:13:01 | **15m37s** | 7m20s |

**Every run starts within one second of the previous run finishing.** That is not
contention, it is a lock: the receiver at `/opt/ci-runner` runs one job at a time.

So the queueing decomposes cleanly:

- **Job duration is genuine.** ~7m20s per run, consistent to ±9 s across five
  runs, and it agrees with the Actions job (7m23s) almost exactly. The runner is
  not slow; `verify` takes seven minutes.
- **The queue is a backlog of superseded commits.** Five commits pushed between
  01:30 and 01:50 occupied the runner from 01:36:12 to 02:13:01 — **36m49s**
  wall. Branch protection only needs a status on the **PR head SHA**
  (`c02fb481`). The other four runs — **29m20s, 80% of the runner’s occupancy** —
  produced statuses that nothing consumes.
- **The runner does not cancel superseded work; Actions does.** Actions cancelled
  the superseded runs for exactly these SHAs (`conclusion: cancelled` on
  `a8bac5f5`, `e90a70c2`, `516ac980`). The Hetzner receiver ran all five to
  completion. That asymmetry is the whole 15m37s wait on `c02fb481`.

Two things I did **not** verify, and am reporting as unverified because verifying
them means going inside the runner process, which holds live Coolify, Neon,
GitHub and Matrix tokens:

- `docs/devops/ci-and-deploy.md` says the receiver is **shared with
  `themultiverse.school`** and is not repo-specific. If the one-at-a-time lock is
  global rather than per-repo, a busy hour in that repo lengthens this queue too,
  and any change here affects that repo. **Sourced from the doc, not measured.**
- The repo webhook subscribes to both `push` and `pull_request`
  (`gh api .../hooks` → `events: [pull_request, push]`), but only **one** queued
  status appears per SHA. So the receiver is already deduplicating, or only acts
  on one event. Either way it is **not** double-queueing. No change needed there.

## 3. How many runs a push triggers

Every same-repo branch with an open PR gets its work done **twice** on Actions,
and the duplicate cannot be cancelled by the existing concurrency group.

`concurrency.group` is `ci-${{ github.workflow }}-${{ github.ref }}`. For one
push to a PR branch, `github.ref` takes two different values:

- `refs/heads/integration/measured-ground` (the `push` event)
- `refs/pull/16/merge` (the `pull_request` synchronize event)

Different `ref` → different group → **neither cancels the other**. Measured on
SHA `c02fb481`, which ran four full jobs:

| Run | Event | Job | Duration |
|---|---|---|---:|
| `31554902836` | `push` | Verify (pinned Node) | 7m23s |
| `31554902836` | `push` | Next Node major (non-blocking) | 6m35s |
| `31554906473` | `pull_request` | Verify (pinned Node) | 7m23s |
| `31554906473` | `pull_request` | Next Node major (non-blocking) | 6m14s |

**27.5 minutes of Actions compute for one commit**, of which the required check
is a single 7m23s job. Across the last 99 CI runs, **26 SHAs ran twice** — every
SHA on a branch with an open PR. `push: 74` / `pull_request: 25`.

The branch-protection ruleset (`gh api .../rulesets/20666431`) requires exactly
two contexts on `~DEFAULT_BRANCH`: **`Verify (pinned Node)`** and
**`ci/hetzner-lint`**. `Next Node major (non-blocking)` is *not* required, so its
scheduling can change without touching branch protection.

## 4. Ranked fixes

### R1 — Stop the runner working on superseded commits (biggest win, runner-side)

**What.** In `/opt/ci-runner`, before dequeuing a job, drop it if a later commit
has already been queued for the same `(repo, branch)`.

**Do not post `success` on the skipped SHA.** A green `ci/hetzner-lint` on a
commit whose `verify` never ran is precisely the failure mode the rest of this
repo's tooling is built to prevent — `ci-and-deploy.md` on a missing baseline
("a gate that passes without one reports green forever") and on the Node
assertion ("a green check that means nothing") are the same rule. Either leave
the superseded SHA `pending` — nothing reads it, which is the entire premise of
this fix — or post a non-success state carrying `superseded by <sha>`. The
status must never claim the commit was checked.

**Evidence.** 29m20s of 36m49s runner occupancy in the observed window was
superseded work. This is the direct cause of the 15m37s wait.

**Why it is safe.** `main` is protected with a PR requirement, so an intermediate
commit on a feature branch is never itself merged — GitHub evaluates required
checks against the PR head SHA. Skipping a superseded SHA cannot leave a
mergeable commit unchecked.

**Risk: medium, and it is not a code risk.** Two things to get right:

1. **Never supersede on `main`.** A push to `main` is a merge commit that is the
   permanent record of a release; its `ci/hetzner-lint` status must be real.
   Guard the skip to non-`main` refs explicitly.
2. **The receiver is shared with `themultiverse.school`.** Any edit affects that
   repo. Key the supersede logic on `(repo, branch)`, not branch alone.

**Do not execute this unilaterally.** It is a change to a production process that
holds live credentials. Report the diff, get sign-off, apply it on the box.

### R2 — Stop Actions running every PR-branch commit twice

**What.** In `.github/workflows/ci.yml`, narrow the `push` trigger so a same-repo
branch is not covered by both events:

```yaml
on:
  push:
    branches: ['main']
  pull_request:
  workflow_dispatch:
```

**Evidence.** 26 of the last 99 runs were exact duplicates; ~13.5 min of the
27.5 min per commit is the duplicate.

**Why `pull_request` is the one to keep, not `push`.** A fork PR produces **no**
`push` event in this repository. `pull_request` is the only event that sees fork
heads, and per `ci-and-deploy.md` Actions is the *only* gate that safely sees
them. Dropping `pull_request` instead would silently remove all fork coverage.
This must not be inverted.

**Risk: low, with one real tradeoff.** A branch with no open PR loses pre-PR
Actions feedback — you find out at PR-open time instead of at push time. Given
six agents pushing WIP branches, that is arguably an improvement, but it is a
behaviour change and the owner should choose it. Note this does **not** affect
`ci/hetzner-lint`: the receiver takes raw repo webhooks, not the Actions
workflow, so R1 and R2 are independent.

**Alternative if pre-PR feedback is wanted:** keep `push: ['**']` and unify the
concurrency key on the underlying branch instead of the ref, e.g.
`github.event.pull_request.head.ref || github.ref_name`, so the push run and the
PR run land in one group and the older is cancelled. Same saving, keeps pre-PR
coverage, slightly more subtle to reason about.

### R3 — Make `cancel-in-progress` conditional on not being `main`

**What.**

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

**Evidence / why.** The task asked specifically whether the concurrency group can
cancel a run whose status `main` depends on. As written today it can: two merges
landing on `main` within seven minutes cancel the first `main` run, leaving that
merge commit with no green `Verify (pinned Node)` on record. Branch protection is
not *bypassed* by this — protection is evaluated on the PR head before the merge,
and that run is under `refs/pull/N/merge`, a different group. But an untagged,
unverified merge commit on `main` is exactly the thing
`docs/design/release-plan.md` needs to be able to point at.

**Risk: very low.** Strictly adds runs; changes nothing about coverage.

### R4 — Reduce what `next-node` runs, or when

**What.** `Next Node major (non-blocking)` runs the entire suite — 259 test files
and all three balance gates — on every branch push, for 6m14s–6m35s. It is not a
required check. Options, in increasing boldness: run it only on `push` to `main`;
or run it on a `schedule:` (nightly); or keep it on PRs but skip the balance
gates in that job only.

**Evidence.** It is ~45% of Actions compute per commit and gates nothing.

**Risk: medium, and it needs owner sign-off — this is a coverage timing change,
not a cleanup.** The job exists to catch cross-version determinism drift before
Node 24 is pinned. Moving it to nightly means drift is caught within a day
instead of within a push; that is a *latency* tradeoff on an early warning, which
is defensible, but it is the owner's call, not mine. The third option (dropping
gates from `next-node` only) is the one I'd argue **against**: determinism drift
across Node majors is precisely the kind of thing a balance gate detects, so
that variant removes the coverage that justifies the job.

### R5 — Raise runner concurrency (only after R1)

**What.** Let `/opt/ci-runner` run 2 jobs concurrently.

**Risk: medium-high, and I'd do R1 first and re-measure.** The gates run
`--workers 4` and `vitest` parallelises across cores; two concurrent `verify`
runs on the same box will contend and lengthen *both*, and the receiver has a
**600-second timeout** per `ci-and-deploy.md` — a 7m20s job that stretches to
over 10m under contention starts failing for a reason unrelated to the commit.
Requires knowing the host's real core count and what else it is running
(Coolify). **I did not SSH to the box, so I have no headroom measurement.** R1
removes 80% of the load without this risk; take R1 first.

### Not worth doing

- **Caching `node_modules`.** `npm ci` is **3 s** on Actions and 1 s locally.
  `actions/setup-node`'s `cache: npm` is already in place and already effective.
  There is nothing here.
- **The `prebalance:*` typecheck ×3.** ~0.9 s. Noise.
- **Speeding up typecheck/lint/purity/content/audio/coverage.** 27 s combined,
  6% of the job.

## 5. Rejected, because the docs forbid them

Each of these is the obvious move, and each is a regression:

- **Deleting `.github/workflows/ci.yml` to "move CI onto the box we pay for."**
  `ci-and-deploy.md` §"Two gates": Actions is the **only** gate that sees fork
  PRs. Deleting it means fork PRs get no CI at all.
- **Relaxing the fork guard so fork PRs run on the Hetzner runner.** The runner
  executes checked-out code in a process holding live Coolify, Neon, GitHub and
  Matrix tokens. Running a fork head there is a remote shell on the box that
  deploys the fleet, not CI. The guard must keep failing closed.
- **Dropping a balance gate from CI** — including "just from the runner, `verify`
  still has it," and including "just from `next-node`." `ci-and-deploy.md` is
  explicit that a gate present on one system and absent on the other is the most
  expensive form of drift, and
  `packages/scenario/test/unit/horizon-gate.test.ts` reads both `ci.yml` and
  `ci-check.sh` and fails if any of the three gates goes missing from either.
- **Shortening the twenty-year horizon, or folding the 2400-tick ascension gate
  into the horizon gate.** The horizon gate exists because the five-year gate has
  a measured blind spot at year five; the ascension gate exists because the
  ascension rate at 240 ticks is 0/80. Lengthening the fast gate instead costs
  ~¾ of its sample size and roughly doubles every tolerance. `horizon-gate.test.ts`
  asserts `fast < horizon < ascension` and pins each `worldTickCap`.
- **Removing any step from `scripts/ci-check.sh` to shorten the runner job.** The
  script's entire contract is to stay equivalent to `npm run verify`. Divergence
  means a commit can pass locally and fail on the runner, or the reverse.
- **Relaxing the Node-major assertion in `ci-check.sh`** to skip the version
  check. `sim-core` is a determinism project; a green check on an unpinned Node
  major means nothing. The doc says fix `/opt/ci-runner/Dockerfile` instead.
- **Changing branch protection** — dropping a required context, allowing
  force-push, or renaming `ci/hetzner-lint`. Renaming the context silently
  disarms the ruleset, which requires that exact string.
- **`npm run goldens:regen`.** Never run to make anything pass or faster. Not run
  here.

## 6. The honest summary

Nothing is broken. `verify` genuinely takes seven minutes and twenty seconds, and
94% of that is the test suite and the three balance gates — all of which are
load-bearing and none of which may be removed. The self-hosted runner is
correctly sized for one job at a time; it just has no notion of a superseded
commit, so five commits pushed in twenty minutes cost it thirty-seven minutes of
serial work to produce one status anybody needed. Six agents pushing concurrently
turns a seven-minute check into a fifteen-minute wait by arithmetic, not by
defect.

R1 and R2 remove ~80% and ~50% of the wasted work on their respective systems
without weakening a single check. R3 is a one-line correctness fix. Beyond that,
the remaining cost is the price of the gates, and the gates are the point.
