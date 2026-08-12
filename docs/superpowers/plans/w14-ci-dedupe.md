# W14 — remove duplicated CI runs without removing coverage

**Branch:** `w14/ci-dedupe`. **Status:** in progress.

## The measured problem

`Verify (pinned Node)` costs **443 s**, of which **94 % is load-bearing**: vitest 189 s, ascension
gate 125 s, horizon gate 87 s, fast gate 14 s. Everything else in the job totals 27 s. **There is
nothing to win by deleting steps**, and every balance gate is pinned by
`packages/scenario/test/unit/horizon-gate.test.ts` anyway.

The waste is that **every PR-branch SHA runs the workflow twice, four jobs in total.**
`concurrency.group` keys on `github.ref`, which is:

| event | `github.ref` |
|---|---|
| `push` to branch `foo` | `refs/heads/foo` |
| `pull_request` for the PR from `foo` | `refs/pull/<n>/merge` |

Two different groups, so neither cancels the other and both run the whole matrix.

Measured on SHA `c02fb481` (`integration/measured-ground`), the two runs and four jobs:

| run | event | job | duration |
|---|---|---|---|
| 31554902836 | `push` | Verify (pinned Node) | 443 s |
| 31554902836 | `push` | Next Node major | 395 s |
| 31554906473 | `pull_request` | Verify (pinned Node) | 443 s |
| 31554906473 | `pull_request` | Next Node major | 374 s |

**1655 s ≈ 27.6 minutes of compute to produce one 7 m 23 s required status.**

Across the last 100 runs: **74 distinct SHAs, 26 of them ran the workflow more than once** — 26
duplicate runs, 26 % of all Actions compute in the window. With eight agents pushing concurrently
these queue behind each other and a seven-minute check becomes a fifteen-minute wait.

## The decision: unify the concurrency key (not narrow `push:`)

Two candidates were on the table.

- **A — unify the key** so the `push` and `pull_request` runs for one branch share a group and the
  later cancels the earlier.
- **B — narrow `push:` to `main` only**, keeping `pull_request` for everything else.

**Chosen: A.** B was rejected on the repository's own run data. In the last-100 window the dominant
pattern is a **push-only branch with no PR yet** — `w1/ascension-stance`, `w2/discriminating-
ascension`, `w3/ascension-routes`, `w4/reward-functions`, `w5/unconfound-measurement`,
`w6/positive-achievement`, `w8/raid-engagement-live`, `w9/octalysis-and-mechanics`,
`pm/campaign-plan` all appear with a `push` run and no `pull_request` run. B deletes CI outright for
every one of those pushes, which is a coverage loss, not a saving. And B buys **nothing extra** on
the SHAs that do have a PR: both options take those from 4 jobs to 2.

`pull_request` is **not** narrowed under either option and is not touched here. Fork PRs generate no
`push` event, so narrowing it would delete all fork coverage — and Actions is the only gate that may
see a fork, because `scripts/ci-check.sh` runs on a host holding live Coolify, Neon, GitHub and
Matrix tokens and refuses fork PRs by design.

## The `cancel-in-progress` bug, and why the fix is right

`cancel-in-progress` is a property of the **incoming** run, but its effect lands on **older runs
already in the group**. A guard written as a per-run predicate — `github.ref != 'refs/heads/main'` —
is therefore unsound the moment the group key stops being `github.ref`: a run whose own ref is not
`refs/heads/main` can land in the same group as a `main` run and arrive carrying `cancel: true`,
killing it. A cancelled `main` run leaves a merge commit with no green on record. Branch protection
is evaluated pre-merge under a different group so it is not bypassed, but `CLAUDE.md`'s release
discipline — an untagged release is not a rollback target — wants the record.

The fix is to make the guard **constant across every run that can land in a given group**, by
deriving the group and the guard from the *same* effective (repo, ref) pair:

- effective repo = `github.event.pull_request.head.repo.full_name || github.repository`
- effective ref = `github.event.pull_request.head.ref || github.ref_name`

Group is `ci-<workflow>-<effective repo>-<effective ref>`; cancellation is enabled unless the
effective pair *is* this repository's `main`. Both halves are load-bearing:

- The **repo** component keeps a fork PR whose head branch happens to be named `main` out of this
  repository's `main` group, so it cannot cancel a `main` run.
- The **guard** makes every run that can reach this repository's `main` group non-cancelling, so
  `main` runs serialise instead of superseding each other.

Check-run races are not a concern: cancellation only ever hits the *older* run in a group, so the
newest check run for a given name always belongs to the surviving run, and both events produce
identically named jobs. A cancelled older `Verify (pinned Node)` cannot mask a newer green one.

## Documentation corrections

`docs/devops/ci-and-deploy.md` is wrong on two measured facts.

1. It says there are **two** balance gates. There are **three** — `balance:gate:ascension`, the
   2400-tick / 200-world-year gate, landed in PR #16 and is the only instrument that can observe
   the win condition.
2. Its cost table (~8 s / ~35 s) understates CI by roughly **2.5×**. Measured on GitHub Actions:
   **14 s fast / 87 s horizon / 125 s ascension**. The ascension gate measured **125 s on Actions
   against 117.5 s on 16 idle local cores**, so the gap is not simply slower hardware. The cause is
   **unmeasured** and is recorded as unmeasured rather than guessed.

`scripts/ci-check.sh` carries the same "both balance gates" error in its echo line and gets the same
correction. The script's contract — stay equivalent to `npm run verify` — is untouched; only a
comment string changes.

## Out of scope, recorded as a proposal

**Supersede logic in the self-hosted runner** is the biggest single remaining win and is
deliberately not attempted here. The receiver at `/opt/ci-runner` runs `scripts/ci-check.sh` with a
600 s timeout and, as far as this repository can see, has no notion of a newer commit obsoleting an
in-flight one: eight agents pushing to eight branches serialise eight ~7-minute runs, and a branch
pushed three times in a minute is checked three times. A supersede rule — before starting work for
`(repo, branch)`, cancel or skip any queued job for the same `(repo, branch)` whose SHA is no longer
the branch tip — would cut the runner's queue by roughly the same fraction the concurrency key cuts
Actions'. It needs production access to `cto-tycoon-hel1` and owner sign-off, and the receiver is
**shared with `themultiverse.school`**, so a change there affects another repository. Proposal only.

Not touched, deliberately: branch protection, the `ci/hetzner-lint` context string, the Actions
workflow's existence, `pull_request` triggers, any balance gate or horizon, and
`npm run goldens:regen`.

## Tasks

- [x] 1.1 Branch `w14/ci-dedupe` from `origin/main`; `npm ci` in the worktree
- [x] 1.2 Read `docs/devops/ci-and-deploy.md`, `.github/workflows/ci.yml`, `scripts/ci-check.sh`,
      `packages/scenario/test/unit/horizon-gate.test.ts`
- [x] 1.3 Measure the duplication from `gh run list` — per-SHA job counts and durations
- [x] 1.4 Read the branch-protection ruleset to confirm which contexts are required
- [x] 1.5 Decide between unify-key and narrow-push, from the repository's own run data
- [ ] 2.1 Rewrite `concurrency.group` on the effective (repo, ref) pair
- [ ] 2.2 Rewrite `cancel-in-progress` so it is constant per group and never cancels `main`
- [ ] 2.3 Leave `on:`, both jobs, and every gate step byte-identical
- [ ] 3.1 Correct "two gates" → three in `docs/devops/ci-and-deploy.md`, with the ascension column
- [ ] 3.2 Correct the cost table to the measured 14 s / 87 s / 125 s and record the Actions-vs-local
      discrepancy as unmeasured
- [ ] 3.3 Correct the "both balance gates" echo line in `scripts/ci-check.sh`
- [ ] 4.1 `npm run verify` green in the worktree, including `horizon-gate.test.ts`
- [ ] 4.2 Push `w14/ci-dedupe` with **no PR**; confirm via `gh run list` that exactly one run with
      two jobs fired, and that no `pull_request` run exists
- [ ] 4.3 Push a second commit immediately; confirm the first run is **cancelled**, proving the
      `cancel-in-progress` expression evaluates truthy on a branch rather than failing silently
- [ ] 4.4 Report before/after job count per SHA
