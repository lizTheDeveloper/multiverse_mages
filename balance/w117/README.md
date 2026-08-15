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

`scripts/w117-run.sh` runs the whole thing as **one sequential batch**: it converts W99's committed
records, runs the seven species arms, and writes both analyses. It is deliberately one script,
because editing source between arms is how an arm got contaminated on 08-13, and roughly eighty
worktrees share this machine, so parallel arms manufacture the RPC-timeout noise that then has to
be explained away.

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

### The committed records could not actually be read, and now can

W99 committed its 1,000 records as **one CSV**. `scripts/w99-analyse.mjs` reads *a directory holding
a `.runs.ndjson`* — the harness's own output shape — and cannot read that CSV. So the records that
exist precisely to be re-compared were not readable by the one script that does the comparison, and
the re-measurement would silently have degraded into new-vs-new: *"does draconic differ from human
on the new build"* instead of the question actually asked, **"what did opening the grid do to
draconic"**.

`scripts/w99-csv-to-records.mjs` bridges it. It reads only committed data and runs no simulation,
and it is verified rather than assumed:

- Replaying the converted records through `w99-analyse.mjs` reproduces **every number** in
  `balance/results-w99-species-arms.md` — Table 1 to the last decimal, and the CRN check at 600
  pairs with zero seed-or-strategy mismatches.
- Pointing control and arm at the *same* records gives paired differences of exactly `+0.00 ±0.00`
  on all six metrics; pointing them at human and orc gives real deltas with significance markers.
  A positive and a negative control, so an all-zero movement table would be a finding rather than a
  broken script.

One incidental correction: `w99-analyse.mjs`'s own usage line says `--control <dir>`, but the parser
requires `--control <label>=<dir>` and throws on a bare directory. The runner uses the form that
works.

### Q2 has a contingency, because 2400 ticks may not be enough any more

`balance/sweeps/w117-exhaustion-longcap.sweep.json` is drafted and **is not part of the batch**.
`passive-control` reached 51 nodes and stopped, and 2400 ticks was enough to exhaust 51. With 300
reachable it may well truncate while still climbing, and a truncated run cannot say where a plateau
sits — it can only say the plateau is somewhere past the cap. The contingency is
`passive-control` alone at `worldTickCap` 9600, 40 replicates, under its own `sweepId`
(`w117-exhaustion-v1`) since pairing against W99 is not what Q2 needs.

**Run it only if the standard batch shows `referenceNodesGainedFinalQuarter` still above zero.**
That measure is the plateau detector: a derivative going to zero is what "it stopped" means, and it
exists because a level metric read at a fixed horizon cannot tell a universe still learning from one
that has stopped.

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

## Re-run the gate. Do not trust a claim that it opened.

`./scripts/w117-gate-check.sh [ref]` — defaults to `origin/main`. **Exit 0 open, 42 shut, 1 a
broken probe**, which is deliberately not the same exit as shut.

| probe | change | where | shut | open |
|---|---|---|---|---|
| A | `w115/enable-all-cells` | `packages/content/src/load.ts`, `export const V1_CELL_COUNT` | **12** | **70** |
| B | `w116/complete-affiliation` | a call-shaped `completeAffiliation(` outside `autonomy/affiliation.ts` | **0** call sites | **>= 1** |

Both must hold at once. Twelve cells cover four forms and reach 51 of 300 nodes, and species
affinity barely intersects them, so *"all six species are interchangeable"* is an artifact of the
selection until probe A reads 70. An unaffiliated mage cannot scribe or ward and nothing promoted a
mage into affiliation, so grimoire counts taken before probe B flips are measuring the defect.

**Probe B matches a paren, and that is not tidiness to be cleaned up.** On a shut `main` the only
mention of `completeAffiliation` outside its own module is a **doc comment** at
`packages/coordination/src/world-step.ts:1454`. A bare-name grep counts that comment as a production
caller and declares the gate **open on a build where affiliation is still unwired** — sending the
whole re-measurement straight past the defect it exists to measure.

Both probes carry a **positive control**: a pattern that must match on any ref at all. If a control
misses, the script exits 1 and says the probe is broken, because an empty search result is not
evidence of absence unless the search is known to work. All four states are exercised: probe A reads
70 on `w115` and 12 on `main`, probe B reads 1 on `w116` and 0 on `main`, and only the conjunction
opens.

## To run it, once the gate opens

Confirm the mechanism shipped rather than inferring it from a merge title — grep that
`completeAffiliation` has acquired a production caller, and that the enabled-cell count is seventy.
Then merge `origin/main`, `npm ci` (the lockfile rule after a merge is not optional), `npm run
typecheck` to emit `dist`, and:

    ./scripts/w117-run.sh

**Do not regenerate any baseline, and never `npm run goldens:regen`.** Both changes will have moved
everything; re-recording is the owner's call and several branches are already in that stack. Report
the movement with numbers instead.
