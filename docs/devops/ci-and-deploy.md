# CI and deployment

How a commit in this repository gets checked, and what would have to be true for it to get
deployed. Written down because the arrangement is non-obvious: there are **two** CI systems, on
purpose, and they are not redundant.

## Two CI systems, different threat models

(Two *systems*. There are **three** balance gates, and they run inside both — see below.)

| | GitHub Actions (`.github/workflows/ci.yml`) | Self-hosted runner (`ci/hetzner-lint`) |
|---|---|---|
| Runs on | GitHub's throwaway VMs | `multiverse-games-hel1` (SSH alias `games`) |
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

Lives at `/opt/ci-runner` on **`multiverse-games-hel1`** (SSH alias `games`), in a container named
`ci-runner-webhook`. It is a small Python webhook receiver, shared with `themultiverse.school` — it
is **not** specific to this repo, so changes to it affect that repo too.

**Moved from `cto-tycoon-hel1` on 2026-08-13.** The status context is still `ci/hetzner-lint`,
because that exact string is what the branch protection rule requires and renaming it would make
every open PR unmergeable until the rule is edited to match. So the name records where the runner
*was*, and this paragraph is the only thing that says where it *is*.

**There are two receivers, and that is correct.** `cto-tycoon-hel1` runs the same
`webhook_receiver.py` for **`themultiverse.school`**, and it stays there — its log is school builds
and school staging deploys, with no `multiverse_mages` traffic. This repository's webhook goes to
`multiverse-games-hel1`; the school's goes to `cto-tycoon-hel1`. One receiver per repository, on the
box that repository deploys to.

Do not "consolidate" them and do not stop one because the other exists — an earlier draft of this
page called the second one a duplicate and suggested stopping whichever was not receiving this
repo's webhook, which would have taken down the school's CI. Check which repository a receiver is
serving before touching it:

    ssh hetzner 'docker logs --tail 20 ci-runner-webhook'   # expect themultiverse.school
    ssh games   'docker logs --tail 20 ci-runner-webhook'   # expect multiverse_mages

**Serialisation is by design, and reads as a stall.** The receiver holds a per-repository
`threading.Lock`, so a second push while a run is in flight gets a `pending` status reading
*"Queued -- another CI run in progress"* and waits. With `npm run verify` at roughly twelve minutes
a queued check can sit for half an hour and still be healthy. Read the container log before
concluding the runner is down:

    ssh games 'docker logs --tail 40 ci-runner-webhook'

Flow for a push to `main` or a same-repo PR:

1. GitHub posts to the receiver on the runner host, HMAC-signed with `CI_WEBHOOK_SECRET`. The
   endpoint is deliberately not written down here — see "What this file does not record" below.
2. The receiver clones or updates the repo under `/repo/lizTheDeveloper_multiverse_mages`.
3. `detect_ci_script` finds `scripts/ci-check.sh` and runs it, with a **2400-second timeout**
   (`CI_RUN_TIMEOUT_S` in `webhook_receiver.py`).

   **Raised from 600s on 2026-08-13, and the reason is worth keeping.** `npm run verify` grew past
   ten minutes when the economy wire landed — the ascension balance gate alone measures **565–892s**,
   the whole gate is ~12 minutes locally and ~24 on GitHub's runners — so the check began timing out
   on green trees. A red that says nothing about the commit is worse than no check.

   Two things about that ceiling that are easy to get wrong:

   - **This receiver is shared with `themultiverse.school`**, so the ceiling is not per-repo. Raising
     it is safe for both, since it only ever permits a longer run.
   - **Runs here are serialised**, so the cost of a higher ceiling is that a *wedged* run occupies
     the queue for forty minutes instead of ten. The bound exists so a hung process cannot hold it
     forever; it is not there to make CI fast.

   The two tempting alternatives are both worse. Editing `scripts/ci-check.sh` to run less breaks the
   rule that it must stay equivalent to `npm run verify`. Trimming the ascension sweep to fit is
   **tuning the instrument** — 32 runs is already `balance/README.md`'s argued minimum.
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
the runner host and the receiver is **shared with `themultiverse.school`**, so a change there
affects another repository and wants owner sign-off.

## The third Actions job: primitive consumption, non-blocking

`npm run check:consumption` assembles a real universe through `@mm/scenario`'s composition root and
asks, per primitive, whether an authored node effect reaches anything the simulation applies. It is
the missing half of `check:coverage`, which only asks whether content *authors* the primitive.

It runs as its own Actions job — `Primitive consumption (non-blocking)`, `continue-on-error: true`
— and is **not** in `npm run verify`, so `scripts/ci-check.sh` does not run it either and the two
gates stay equivalent.

The reason is that **red is the correct current answer.** When the job was split out, 2 of 14
primitives were reachable from authored nodes, 2 were declared exclusions, and 12 had no
node-driven consumer at all. Holding that inside `verify` meant the pull request carrying the check
could not merge until the separate pull request carrying the fix did — a gate nobody can see is not
a gate. This is the same reasoning, and the same mechanism, as `Next Node major (non-blocking)`.

**The condition for making it blocking again** is written at the flip point in `ci.yml` and repeated
here so it is not only in a workflow comment: *every primitive has a node-driven consumer, or the
remaining ones are declared exclusions.* Declared exclusions are `fertility` and `lifespan`, in
`packages/rules-magic/src/effects/consumption.ts`. Lengthening that list to go green is the exact
failure the check exists to catch; the number in the FAIL line going down is the progress.

## The fourth Actions job: rules-path reachability, non-blocking

`npm run check:reachability` parses every production source in the rules path with the TypeScript
compiler API and asks, per exported value: **does anything that is not a test call this?** It is
the code-shaped counterpart of `check:consumption`, which asks the same question about content.

It exists because of W85. Three university subsystems — `advanceConstruction`, `applyLibraryUpkeep`
and `UNIVERSITY_STAFF` — were built, unit-tested, exported, named in a design document and
discussed at length in the world loop's own comments, and none of them was ever called. Two have
since been wired (`ef3bba9`, `9a3b6b5`); the third has not. The general lesson is what the check
mechanises: *"the symbol exists" and "a test covers it" are both compatible with "the game never
runs it."*

**It parses rather than greps, and that is the whole design.** This repository names symbols in
prose constantly — `world-step.ts` discussed `advanceConstruction` before anything called it, and
`mc-harness/src/strategies.ts` quotes the W85 finding inside a string literal. A grep would have
counted both as callers and reported the flagship defect as reached. Comments, string literals,
import and re-export specifiers, and `typeof` references in type positions are all excluded, each
for a reason written in the script's header. `packages/sim-core/test/unit/reachability-check.test.ts`
holds one controlled case per claim, run as a subprocess against a throwaway root.

Like `consumption`, it runs as its own job — `Rules-path reachability (non-blocking)`,
`continue-on-error: true` — and is **not** in `npm run verify`, so `scripts/ci-check.sh` does not
run it either and the two gates stay equivalent.

**Red is the correct current answer.** When the job was added, the count was 115: one orphaned
package (`@mm/rules-raid`, which nothing depends on), 94 exported values with no production caller,
10 called only by symbols that are themselves unreached, one component declared and never read or
written (`UNIVERSITY_STAFF`), three god constants resolved and never consumed
(`worship-max`, `legacy-archive-max-tier`, `legacy-reference-tick`), and six read only by unreached
code (the `legacy-*` prestige set, behind `legacyGrant`).

**The condition for making it blocking** is at the flip point in `ci.yml` and repeated here: when
the finding count is small enough — under ten is a reasonable reading — that a pull request adding
one symbol ahead of its caller is a conversation rather than a blockage. Reached by wiring or
deleting, never by lengthening `DECLARED_EXCLUSIONS` in the script. Every entry there is a finding
the check will never make again, which is why each carries a written argument rather than a name.

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
on sixteen idle local cores** — a 6 % gap across hardware that differs by much more than 6 %. So
"the hosted runner is just slower" does not account for it, and whatever does account for it is
**unmeasured**. This file is not going to guess at a cause it has not measured; anyone optimising CI
should measure it first. (The runner's core count is not printed in the Actions log either, so even
the comparison's denominator is an assumption — another reason to measure rather than reason.)

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

## Known issue: the queue runs superseded commits (2026-08-13)

**Symptom.** With several branches active, `ci/hetzner-lint` reports `pending — Queued, another CI run
in progress` on every open PR for hours, while the runner works steadily and completes runs. Nothing is
wedged; the queue is simply full of work that no longer matters.

**Cause.** `run_ci` serialises per repository. A push while a run is in flight blocks a thread on
`lock.acquire()` until its turn comes. With several agents pushing to their own branches, most of what
eventually reaches the front of that queue is **a commit its branch has long since moved past**, and a
run on a superseded commit cannot gate anything — no PR points at it. Measured on 2026-08-13:
**43 queued threads against 7 completions.**

**Fix, not yet applied.** Skip a queued run whose commit is no longer the head of its ref. In
`/opt/ci-runner/webhook_receiver.py`, inside `run_ci`, immediately after the lock is held and before
the `Running CI checks...` status is posted:

```python
if is_superseded(repo_full_name, sha, ref):
    print(f"[ci] Superseded {sha[:8]} ({branch}) -- branch has moved on, skipping")
    post_commit_status(repo_full_name, sha, "success",
                       "Superseded -- a newer commit is the branch head")
    return
```

with a helper that reads `GET /repos/{repo}/git/{ref}` and compares `object.sha`.

Three properties that matter, and are easy to get wrong:

- **The check must come *after* the lock, not before.** The branch can move while a thread waits, so
  asking at enqueue time answers the wrong question.
- **It must fail open.** Any error — token, network, rate limit — returns "not superseded" and the CI
  runs. **A missed run is a broken gate; a redundant run is only slow.**
- **Only `refs/heads/*`.** Anything else is never treated as superseded.

Posting `success` rather than leaving `pending` is deliberate: a stale `pending` on a required check
**blocks the merge of a PR whose current head is green**, which is the same trap
`.github/workflows/ci.yml` documents for cancelled Actions runs.

**Applying it needs a person.** Both the file edit and `docker restart ci-runner-webhook` are mutations
to a live host, and agent tooling declines them. Back up first — the existing convention is
`webhook_receiver.py.bak-before-<change>-<date>` — then:

    ssh games
    # edit /opt/ci-runner/webhook_receiver.py
    python3 -c 'import ast; ast.parse(open("/opt/ci-runner/webhook_receiver.py").read())'
    cd /opt/ci-runner && docker compose up -d --build

The script is **baked into the image, not bind-mounted**, so a plain `docker restart` picks up no edit
— it must be rebuilt. There is no systemd unit.

**Meanwhile**, `docker restart ci-runner-webhook` drops the queue outright, which is safe: every
dropped run leaves a `pending` status that a webhook redelivery re-triggers. Redeliver the
`pull_request` event rather than the `push` one — pushes to non-`main` branches are ignored by design.
