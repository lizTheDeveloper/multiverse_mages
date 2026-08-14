<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W117 — the post-unlock re-measurement, prepared and **not run**

This directory holds the preparation for re-measuring the three questions in
`docs/design/overnight-plan-2026-08-14.md` once the grid is open and affiliation is wired. **It
holds no run records, because the gate never opened.** A directory of numbers taken before the
gate would be a directory of numbers describing a world that is about to stop existing, which is
the specific error the plan exists to prevent.

## The gate, as observed

Two branches had to land on `main` first. Neither did.

| branch | expected | observed |
|---|---|---|
| `w115/enable-all-cells` | landed on `main` | **9 commits, local worktree only.** Never pushed, no PR, so no CI and nothing for the merge watcher to land. |
| `w116/complete-affiliation` | landed on `main` | **0 commits.** The branch exists and points at a stale `main` (`e2a15cf`, 23 behind); its worktree is clean. No work was ever started. |

The overnight plan describes both as "already in flight". That is half true and worth correcting:
`w115` is genuinely in flight and merely unpushed; `w116` was never begun. The watcher lands PRs as
their checks go green and neither branch has a PR, so no amount of waiting would have landed them.

`completeAffiliation` on `main` still has **no production caller** — the only references are
`packages/rules-world/src/autonomy/index.ts` re-exporting it, its own definition in
`autonomy/affiliation.ts`, three call sites in `autonomy-selection.test.ts`, and a comment in
`coordination/src/world-step.ts`. The defect the plan describes is intact.

## What is prepared

`scripts/w117-run.sh` runs all seven species arms as **one sequential batch** and then the
analysis, in a single command. It is deliberately one script: editing source between arms is how an
arm got contaminated on 08-13, and roughly eighty worktrees share this machine, so parallel arms
manufacture the RPC-timeout noise that then has to be explained away.

`balance/sweeps/w117-species-*.sweep.json` are the `integration-r2-species-*` specs with one field
changed: `replicates` drops from 400 to **100**.

**Why the specs are otherwise byte-identical, and why that is the load-bearing decision.** A run
seed is `f(rootSeed, sweepId, cellIndex, replicateIndex)`. Keeping `sweepId`
(`integration-r2-species-v1`) and `rootSeed` (`20260811`) means run *r* of a W117 arm is *the same
universe* as run *r* of the W99 arm committed in `balance/w99/`. That turns the re-measurement into
a **seed-paired before/after** — the same comparison `scripts/w99-analyse.mjs` already knows how to
make — instead of a fresh sweep whose difference from W99 is confounded with seed noise. It is the
whole reason W99's 1,000 records were committed.

100 rather than 400 because W99's committed records hold `replicateIndex` 0..99, and
`deriveRunSeed` **excludes the replicate count by design** (`packages/mc-harness/src/seed.ts`:
folding it in "would mean that adding a 51st replicate re-seeded the first fifty"). So 100
replicates reproduces W99's seeds exactly; 400 would have reproduced them and then added 300 more.

## Two things the prepared batch cannot answer, found while preparing

**1. Question 3 has no instrument.** Affiliated-fraction is not measurable on this build. The
scenario census (`packages/scenario/src/census.ts`) decodes every one of its numbers out of §4.1's
normalized observation vector, and that vector has **no affiliation channel** — `institutions`
carries exactly four descriptors (`universityCount`, `universityCapacity`, `libraryDepth`,
`grimoireCount`) and no other block counts mages by affiliation. A `referenceAffiliatedMages`
measure therefore needs a **new observation channel**, which is a §4.1 contract change with a
layout-digest change, and it belongs to `w116` rather than to the sweep that consumes it.
Grimoires-per-living-mage needs nothing new: it is `referenceGrimoires / referenceLivingMages`,
both already columns.

**2. The alliance re-run cannot happen on `main` at all.** `GOD_ACTION` in
`packages/agent-api/src/actions.ts` holds sixteen verbs, and none of them is an alliance or an
invitation. The verb lives on `w109/alliances` (PR #126, open, unmerged). Re-running the alliance
arms would mean a three-way merge of `w109` on top of both gate branches, which is not one clean
batch and is not what was asked for.

## To run it, once the gate opens

Confirm the mechanism shipped rather than inferring it from a merge title — grep that
`completeAffiliation` has acquired a production caller, and that the enabled-cell count is seventy.
Then merge `origin/main`, `npm ci` (the lockfile rule after a merge is not optional), `npm run
typecheck` to emit `dist`, and:

    ./scripts/w117-run.sh

**Do not regenerate any baseline, and never `npm run goldens:regen`.** Both changes will have moved
everything; re-recording is the owner's call and several branches are already in that stack. Report
the movement with numbers instead.
