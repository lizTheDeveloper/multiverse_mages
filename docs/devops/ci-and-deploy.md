# CI and deployment

How a commit in this repository gets checked, and what would have to be true for it to get
deployed. Written down because the arrangement is non-obvious: there are **two** CI systems, on
purpose, and they are not redundant.

## Two CI systems, different threat models

(Two *systems*. There are **three** balance gates, and they run inside both — see below.)

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

## One Actions run per commit, and why the concurrency key looks like that

`Verify (pinned Node)` costs 443 s and **94 % of that is load-bearing** — there is nothing to win by
deleting steps. What there was to win was the second copy of the whole thing.

Until this was fixed, `concurrency.group` keyed on `github.ref`, which names two different things
for the two events one commit fires: `refs/heads/<branch>` for the `push`, `refs/pull/<n>/merge` for
the `pull_request`. Different groups, so neither cancelled the other and both ran the full matrix.
Measured on SHA `c02fb481`: **two runs, four jobs, 1655 s ≈ 27.6 minutes of compute to produce one
443 s required status**, and **26 of the last 100 runs were duplicates**. With several branches in
flight at once those queue behind each other, and a seven-minute check becomes a fifteen-minute
wait by arithmetic.

The key is now built from the branch the code is actually on:

```yaml
group: ci-${{ github.workflow }}-${{ effective repo }}-${{ effective ref }}
cancel-in-progress: ${{ not this repository's main }}
```

where *effective repo* is the PR's head repo or else this one, and *effective ref* is the PR's head
branch or else the pushed branch. Three things about it are load-bearing:

- **The group and the guard are derived from the same pair.** `cancel-in-progress` is a property of
  the *incoming* run, but its effect lands on *older runs already in the group*. A guard that varies
  run by run inside one group — the obvious-looking `github.ref != 'refs/heads/main'` — can
  therefore let a run whose own ref is not `main` cancel a `main` run that is. Deriving both from
  one pair makes the guard constant per group, which is what makes it sound.
- **The repo component is not decoration.** Without it, a fork PR whose head branch happens to be
  named `main` would land in this repository's `main` group and could cancel a real `main` run,
  leaving a merge commit with no green on record. Branch protection is evaluated pre-merge under a
  different group, so nothing is bypassed — but `CLAUDE.md`'s release discipline wants the record,
  and an untagged, unverified release is not a rollback target.
- **`main` runs never cancel each other.** They serialise. Every one of them is a merge commit whose
  green is part of the release record.

Cancellation only ever hits the *older* run in a group, so the newest check run for a given name
always belongs to the survivor: a cancelled `Verify (pinned Node)` can never mask a newer green one,
and the required status check is safe either way.

Two things that are **not** the fix, and would be regressions:

- **Narrowing `pull_request:`.** Fork PRs generate no `push` event, so narrowing it deletes all fork
  coverage — and per the threat model above, Actions is the only gate that may see a fork at all.
- **Narrowing `push:` to `main`.** It was considered and rejected on this repository's own run data:
  most branches here are pushed and checked well before a PR exists, so it would delete CI for those
  pushes while saving nothing on the branches that do have one. `workflow_dispatch` stays available
  for a deliberate re-run.

Still open, and the biggest single remaining win: **the self-hosted runner has no supersede logic.**
It runs `scripts/ci-check.sh` per delivered webhook with a 600 s timeout, so a branch pushed three
times in a minute is checked three times, and concurrent branches serialise. Cancelling or skipping
a queued job whose SHA is no longer its branch tip would cut that queue by roughly what the
concurrency key cut on Actions. It is not done here because it needs production access to
`cto-tycoon-hel1` and the receiver is **shared with `themultiverse.school`**, so a change there
affects another repository and wants owner sign-off.

## The balance regression gates

There are **three**, and none of them is redundant. This section said "two" until the 2400-tick
ascension gate landed in PR #16; if you are reading a count anywhere else in this repository that
disagrees, this table is the one that was checked against the workflow.

| | `npm run balance:gate` | `npm run balance:gate:horizon` | `npm run balance:gate:ascension` |
|---|---|---|---|
| sweep | `balance-gate.sweep.json` | `balance-gate-horizon.sweep.json` | `balance-gate-ascension.sweep.json` |
| horizon | 60 world ticks — five world years | 240 world ticks — twenty world years | 2400 world ticks — two hundred world years |
| runs | 200 real universes | 200 real universes | 32 real universes |
| agents | `passive-control`, fixed | `passive-control`, fixed | all eight strategies, round-robin |
| wall clock | **14 s** | **87 s** | **125 s** |

**The wall-clock column used to read ~8 s / ~35 s and was wrong by roughly 2.5×.** The numbers above
are measured on GitHub Actions from the step timings of run `31554902836`, job `Verify (pinned
Node)`, SHA `c02fb481` — the same place CI's own cost comes from, rather than a laptop. For scale,
the whole job is 443 s and the three gates are 226 s of it; `npm test` is another 189 s, and
everything that is not a gate or the test suite totals 27 s. There is no cheap fat in this job.

One discrepancy worth not explaining away: the ascension gate takes **125 s on Actions and 117.5 s
on sixteen idle local cores**. Sixteen cores against Actions' four should be a much larger gap than
6 %, so whatever dominates that gate is not parallel CPU — but **what it actually is has not been
measured**, and this file is not going to guess. Anyone optimising CI should measure that before
assuming the runner is simply slow.

Each gate compares every metric against its own committed baseline under `balance/baselines/`. All
three are build-failing steps in both systems, and all three are wired into each of them the same
way, on purpose:

- The self-hosted runner gets them through **`npm run verify`**, which all three gate scripts are
  part of. Nothing in `ci-check.sh` names any of them, because the script's whole contract is to
  stay equivalent to `verify`.
- GitHub Actions gets each as **its own named step**, in both jobs, because that workflow lists
  every step by hand and would otherwise never run them.

Adding a check to only one of those is the drift this file warns about, in its most expensive form:
the gate would pass on one system and be absent on the other, and nobody would notice until the two
disagreed about a commit. `packages/scenario/test/unit/horizon-gate.test.ts` reads this workflow and
this script and fails if any of the three gates goes missing from either.

**The second gate is not a slower copy of the first, and the fix for a slow CI run is not to delete
it.** The five-year gate has a measured blind spot: the level of node discovery it reports at year
five is the level the pre-frontier-fix build plateaued at permanently, so a defect that caps
discovery there is invisible to it. The twenty-year gate is what sees that. Lengthening the fast
gate instead would cost about three quarters of its sample size and roughly double every tolerance,
which trades one blind spot for another. `balance/README.md` has the table of measurements, and the
test above fails if the horizon is shortened.

**The third gate is not the second one with a bigger number, either.** Measured on 2026-08-11:
**0 of 400 runs ascended at 240 ticks, and 10 of 80 at 2400.** Both gates above are therefore
structurally incapable of observing the win condition, so a build in which nobody could ever win
would pass them indefinitely. The ascension gate differs from the horizon gate in exactly two
declared ways — 2400 ticks instead of 240, and the whole eight-strategy pool round-robin instead of
the passive control, because a summit is something a *strategy* reaches — and
`horizon-gate.test.ts` asserts both differences rather than describing them. It also asserts
`fast < horizon < ascension`, so merging any two of the three fails the build. It is deliberately
small: 32 runs, tolerances about a hundred times wider than the horizon gate's, which
`balance/README.md` argues is the right trade.

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
