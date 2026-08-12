# CI and deployment

How a commit in this repository gets checked, and what would have to be true for it to get
deployed. Written down because the arrangement is non-obvious: there are **two** CI systems, on
purpose, and they are not redundant.

## Two gates, different threat models

| | GitHub Actions (`.github/workflows/ci.yml`) | Self-hosted runner (`ci/hetzner-lint`) |
|---|---|---|
| Runs on | GitHub's throwaway VMs | `cto-tycoon-hel1`, alongside Coolify |
| Cost | **Free** — Actions is unmetered for public repos | Hetzner box we already pay for |
| Fork PRs | **Yes** — this is the only gate that sees them | **No, deliberately refused** |
| Holds secrets | No | Yes: Coolify, Neon, GitHub, Matrix tokens |
| Node | 22 (pinned) + 24 (non-blocking early warning) | 22 (pinned, asserted by `ci-check.sh`) |

The split exists because of one fact: **this repository is public.** Anyone can open a pull
request from a fork, and a fork's head contains code the author controls — including `npm`
lifecycle scripts, which run during `npm ci` before any test does.

The self-hosted runner executes `scripts/ci-check.sh` directly out of the checkout, in a process
whose environment holds live deploy credentials for several unrelated services. Running a fork head
there is not "CI" — it is a remote shell on the machine that deploys the fleet. So the receiver
refuses fork PRs (`head.repo.full_name != base.repo.full_name`, failing closed if either is
absent), and GitHub Actions covers them instead.

**Do not "consolidate" these to save effort.** Deleting the Actions workflow would remove the only
check that fork PRs get. Removing the fork guard would make the Hetzner box exploitable by any
GitHub user. Each one exists because the other cannot do its job.

## The self-hosted runner

Lives at `/opt/ci-runner` on `cto-tycoon-hel1` (SSH alias `hetzner`). It is a small Python webhook
receiver, shared with `themultiverse.school` — it is **not** specific to this repo, so changes to
it affect that repo too.

Flow for a push to `main` or a same-repo PR:

1. GitHub posts to the receiver on the runner host, HMAC-signed with `CI_WEBHOOK_SECRET`. The
   endpoint is deliberately not written down here — see "What this file does not record" below.
2. The receiver clones or updates the repo under `/repo/lizTheDeveloper_multiverse_mages`.
3. `detect_ci_script` finds `scripts/ci-check.sh` and runs it, with a **600-second timeout**.
4. It posts a commit status under the context **`ci/hetzner-lint`** — that exact string is what the
   branch-protection ruleset requires, so renaming it silently disarms branch protection.

`scripts/ci-check.sh` must stay equivalent to `npm run verify`. If they drift, a commit can pass
locally and fail on the runner, or worse, the reverse.

## The balance regression gates

There are two, and they are not redundant either.

| | `npm run balance:gate` | `npm run balance:gate:horizon` |
|---|---|---|
| sweep | `balance-gate.sweep.json` | `balance-gate-horizon.sweep.json` |
| horizon | 60 world ticks — five world years | 240 world ticks — twenty world years |
| runs | 200 real universes | 200 real universes |
| wall clock | ~8 s on four idle cores | ~35 s on four idle cores |

Each compares every metric against its own committed baseline under `balance/baselines/`. Both are
build-failing steps in both systems, and both are wired into each of them the same way, on purpose:

- The self-hosted runner gets them through **`npm run verify`**, which both gate scripts are part
  of. Nothing in `ci-check.sh` names either, because the script's whole contract is to stay
  equivalent to `verify`.
- GitHub Actions gets each as **its own named step**, in both jobs, because that workflow lists
  every step by hand and would otherwise never run them.

Adding a check to only one of those is the drift this file warns about, in its most expensive form:
the gate would pass on one system and be absent on the other, and nobody would notice until the two
disagreed about a commit. `packages/scenario/test/unit/horizon-gate.test.ts` reads this workflow and
this script and fails if either gate goes missing from either.

**The second gate is not a slower copy of the first, and the fix for a slow CI run is not to delete
it.** The five-year gate has a measured blind spot: the level of node discovery it reports at year
five is the level the pre-frontier-fix build plateaued at permanently, so a defect that caps
discovery there is invisible to it. The twenty-year gate is what sees that. Lengthening the fast
gate instead would cost about three quarters of its sample size and roughly double every tolerance,
which trades one blind spot for another. `balance/README.md` has the table of measurements, and the
test above fails if the horizon is shortened.

Two things the gate deliberately does *not* do. It never writes a baseline — regeneration is a
separate entrypoint under `packages/mc-harness/bin/`, invoked by a person with a written rationale,
and a test asserts that no CI job and no npm script can reach it. And it does not treat a missing
baseline as "nothing to compare, carry on": a missing or malformed baseline fails the build, because
a gate that passes without one reports green forever. `balance/README.md` is the operator's copy of
all of this.

The script asserts the runner's Node major matches `.nvmrc` and fails loudly if not. That is not
pedantry: `sim-core` is a determinism project, and a green check produced on an unpinned Node major
is a check that means nothing. The runner image was on Node 20 until this was set up; if it drifts
again, fix `/opt/ci-runner/Dockerfile`, do not relax the assertion.

## Deployment: nothing to deploy yet

**There is no deploy pipeline for this repository, and that is correct.** `packages/sim-core` is a
pure library with zero runtime dependencies and no I/O. Per `docs/design/vision.md` §11, a
deployable artifact first appears at **0.15.0** (`pvp-server`, delivering `hetzner-deployment`).

A placeholder Coolify app or a `STAGING_DEPLOY_MAP` entry pointing at nothing would be a booby
trap — the deploy status would go green having deployed nothing. So the path is written down here
instead, to be executed when there is a server to run.

When `pvp-server` lands, deployment requires:

1. **A Coolify application** on `cto-tycoon-hel1`'s Coolify, sourced from this repo, tracking a
   named branch — not "whatever is on a laptop". Note its UUID.
2. **A `STAGING_DEPLOY_MAP` entry** in `/opt/ci-runner/webhook_receiver.py`:

   ```python
   "lizTheDeveloper/multiverse_mages": {
       "branch": "main",
       "coolify_uuid": "<uuid from step 1>",
   },
   ```

   Staging deploys only fire **after** CI passes, which is the property worth preserving.
3. **A decision about the target box.** The games fleet runs on `multiverse-games-hel1` (SSH alias
   `games`), which is where a player-facing server would belong — but Coolify runs on
   `cto-tycoon-hel1` (SSH alias `hetzner`). Coolify can manage a remote server; that has to be set
   up deliberately rather than assumed.
4. **An availability target, stated out loud.** One box with backups is roughly 99%. Anything
   higher is paid for in evenings, and live PvP makes downtime unusually visible.

Deliberately not decided here: production promotion. Staging is automatic; production should not
be, and inventing that flow before there is a production is how it gets invented wrong.

## A second runner, for build capacity

**Status: proposed, not provisioned.** Written so the work is a checklist rather than a design
session. Nothing below is live.

### The problem it solves, measured

The self-hosted runner is **serialized**. With five pull requests open, all five sat on
`ci/hetzner-lint` reporting *"Queued -- another CI run in progress"* while every GitHub Actions check
was already green. Nothing was failing; the queue was the whole delay.

Each run is the full `npm run verify` — typecheck, lint, purity, content, audio, coverage, ~3,900
tests, **and three Monte Carlo balance gates**. One test alone (`reference-long-run`) takes 332s in
isolation.

That last number matters more than it looks, because **the receiver kills a run at 600 seconds**. The
existing box is already inside a factor of two of that ceiling on the test suite alone. A second
runner adds throughput; it does **not** raise the per-run timeout, and if `verify` grows past 600s
every runner starts failing identically. Track the wall time, not just the queue.

### What it should and should not hold

The proposal is a **build-only** box: it holds no Coolify, Neon, Matrix or deploy credentials, and
its GitHub token is scoped to `statuses:write` on this one repository.

That materially reduces the blast radius of a compromise — a shell on the build box is not a shell on
the machine that deploys the fleet. **It does not by itself make fork PRs safe.** A fork head still
executes attacker-controlled `npm` lifecycle scripts during `npm ci`, on a machine that sits on the
same network as everything else. Extending it to fork PRs is a **separate decision** requiring
network isolation, and until that decision is made the new box carries the **same fork guard** as the
existing one (`head.repo.full_name != base.repo.full_name`, failing closed if either is absent).
GitHub Actions remains the only gate that sees fork PRs.

### ARM, and why it is a free test of the core constraint

The candidate hardware is a 32 GB ARM box. Every runner today is x86.

`CLAUDE.md`'s first non-negotiable constraint is that the simulation core is deterministic: no
floats in the rules path, fixed-point integers at 1/1024, precisely so results do not depend on the
machine. **Nothing currently tests that claim across architectures.** Running the golden replay
fixtures on ARM64 is a real test of it: green is genuine evidence for the determinism claim, and red
is a determinism finding rather than a broken server.

Because red is a *possible correct outcome*, land it **non-blocking first**, under its own status
context, and promote it to required only after it has been green across several PRs. The workflow
already has that pattern in "Next Node major (non-blocking)". Making an unproven architecture a
required check on day one would let a legitimate discovery block every merge.

The 32 GB is also expected to remove a class of phantom failure. Under parallel load the suite
currently emits `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` with **zero** named failing
tests — a contention artifact that has already cost several agents time, and which can fail a good
commit on the runner, since `ci-check.sh` mirrors `verify`.

### Provisioning checklist

1. **Node must be exactly 22.** `scripts/ci-check.sh` reads the major from `.nvmrc` and hard-fails
   otherwise with *"Fix the runner image rather than relaxing this check."* Provisioning with
   "latest Node" produces a `FATAL` that looks like a broken box and is the guard working.
2. **Run the identical `scripts/ci-check.sh`.** CLAUDE.md requires that script stay equivalent to
   `npm run verify`. A build box running a faster subset would let a commit pass there and fail
   elsewhere — the exact failure the rule exists to prevent. Two identical runners load-balancing is
   the simple correct answer. Splitting fast checks from the Monte Carlo gates is defensible but
   changes what each status context *means*, so it is a separate decision, not an optimisation to
   slip in during provisioning.
3. **Choose the status context deliberately.** `ci/hetzner-lint` is the exact string the
   branch-protection ruleset requires — renaming it silently disarms branch protection. Either the
   new box reports the *same* context as a second worker in one pool (simplest, doubles throughput,
   no ruleset change), or it reports a new context that must then be added to the ruleset. Decide
   before registering, not after.
4. **The receiver is shared with `themultiverse.school`.** It is not specific to this repo, so
   changes to `/opt/ci-runner` affect that repo too. A second runner must not regress it.
5. **Keep the 600-second timeout in view.** See above.

### First job for the new box

Before it reports any status anybody relies on: run the golden replay fixtures on ARM64 and record
the result here. That answers the determinism question while the box is still unprivileged and
non-blocking, which is the cheapest moment to find out.

## What this file does not record

No IP addresses, ports, webhook endpoints or dashboard URLs. **This repository is public**, and
CLAUDE.md bans private endpoints for the same reason it bans secrets: an endpoint plus a
description of the credentials behind it is a map, even though neither is a credential itself.

Host identity is given as machine names and SSH aliases (`hetzner`, `games`) instead. Those resolve
to nothing without the operator's `~/.ssh/config`, which is where the addresses belong. Operational
detail lives in comments in `/opt/ci-runner` on the box, which is not public.

## Branch protection

`main` requires: a pull request, both CI contexts green, no force-push, no deletion. See
`gh api repos/lizTheDeveloper/multiverse_mages/rulesets`.

Golden fixtures deserve a specific mention. `npm run goldens:regen` is never run to make a test
pass — a fixture diff is a claim that behaviour changed on purpose. CI cannot detect intent, so
that rule is enforced by review, which is why the PR requirement is not optional.
