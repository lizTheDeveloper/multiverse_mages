# The playable demo: `demo/playable-wired`

**This branch is for playing, not for merging.** It combines the playable prototype (#189) with
five wiring PRs that are still sitting in the CI queue. It is red, deliberately — see
[What is red, and why that is fine](#what-is-red-and-why-that-is-fine).

Measured on `demo/playable-wired` at `83bbe8a4`, against `main` at `7855797c`, on 2026-08-15.
Every number below was produced by running the thing; none is quoted from a PR body.

## Start it

    git clone <repo> && cd multiverse_mages
    git checkout demo/playable-wired
    npm ci
    npm run play

Then open <http://localhost:8300/>. It redirects to `/ui/console/`.

`npm run play` typechecks first (`preplay`), which takes about a minute on a cold tree. Flags:
`--port`, `--seed`, `--ticks`, `--warm`. **`npm ci` is not optional** — a worktree without
`node_modules` reports the whole repository broken.

The run opens on **tick 40**, not tick 0. Tick 0 has exactly one legal action and it is the no-op:
the god starts with no favor and §4.2's mask folds affordability into the same bit as legality.
Those forty ticks are real — they are on the spine, in the action log, and the control replays them
like any others. `--warm 0` opts out.

## What to click

Pick a verb in the cast column, pick its parameter, then press **cast** to do it or **control** to
ask what it *would* do. `▶| tick`, `▶▶ 10`, `▶▶ 50` and `▶ play` advance the clock.

**Press `fundUniversity` (11), then advance fifty ticks and watch `library` and `grimoires` in the
resources pane climb.** That is the shortest path to seeing the branch do something `main` does not.

The verb sweep below is the whole action space, cast through `control` at **tick 91, seed
20260813, settled 60 ticks**, on both trees. `main` has no play server, so the `main` column was
taken by copying *this branch's* `scripts/play-server.mjs`, `ui/console/index.html` and
`ui/shared/session.js` onto a clean `main` worktree, uncommitted, and sweeping there — so the two
columns differ in the rules and in nothing else. "Drawn slots" is the number of observation slots the
console actually renders that moved — not whether the action reached the simulation, which is a
weaker question the snapshot hash answers.

| # | verb | admitted | drawn slots on `main` | drawn slots here | blocks reached here |
|---|---|---|---|---|---|
| 0 | noop | yes | 0 | 0 | *the positive control — must be 0* |
| 1 | permitTechnique | yes | 30 | **44** | ruleset, resources, population, mages, knowledge, institutions |
| 2 | forbidTechnique | yes | 0 | 0 | already forbidden at this tick |
| 3 | permitForm | yes | 22 | **28** | ruleset, resources, population, knowledge, institutions |
| 4 | forbidForm | yes | 0 | 0 | — |
| 5 | issueDispensation | yes | 18 | **23** | ruleset, resources, population, mages, knowledge, institutions |
| 6 | issueInterdiction | yes | 0 | 0 | on a cell whose technique is already forbidden |
| 7 | revokeEdict | **no** | — | — | masked: no edict in force |
| 8 | grantFoundingKnowledge | yes | 8 | **12** | resources, population, knowledge, institutions |
| 9 | blessMage | yes | 1 | 1 | resources |
| 10 | assignRole | yes | 0 | 0 | **the honest row — admitted, moves the world, moves no pane** |
| 11 | fundUniversity | yes | 5 | **12** | resources, population, knowledge, institutions |
| 12 | encourageResearch | yes | **0** | **5** | resources, population |
| 13 | changeTradition | **no** | — | — | masked all run |
| 14 | openPortal | yes | 0 | 0 | nothing in `scenario` opens the portal yet |
| 15 | declareAscension | **no** | — | — | the ending is not available |
| 16 | inviteScholar | **no** | — | — | masked at this tick |

Twelve of seventeen verbs are admitted; **seven move something you can see, against six on `main`**.
The interesting column is the last one: on `main` no god action reaches the `mages` or
`institutions` blocks at all. Here three of them do. `encourageResearch` is the cleanest single
row — a verb that moved nothing a player could see, and now moves five slots.

## The control, and why it is worth trusting

Next to `cast` is `control`. It replays the run from its seed three times — with the action, with a
no-op, and **a third time as a null control that must come back identical to the no-op arm**. If it
does not, the receipt says *believe nothing below* instead of reporting a difference.

**`nullControlHeld: true` on all seventeen verbs on this branch**, after six merges of new
subsystems. And the positive control, verbatim:

    {"admitted": true, "hashDiffers": false, "nullControlHeld": true, "slotsDiffering": 0}

That is verb 0. A no-op that moved the hash would mean the control is measuring noise.

## Before and after, at the same tick and seed

Seed `20260813`, no god actions, pure no-op ticks. Both trees ran the full tick count with
`status: running` at the end — checked, because a quantity read off an episode that ended early is
not comparable. Quantities are the ones the console draws by name.

| | tick 40 | | tick 200 | | tick 400 | |
|---|---|---|---|---|---|---|
| **quantity** | main | here | main | here | main | here |
| `library` (libraryDepth) | 2 | **4** | 9 | **24** | 9 | **38** |
| `grimoires` | 38 | **96** | 176 | **367** | 341 | **583** |
| mages living | 19 | 19 | 17 | 17 | 17 | **22** |
| mages taught | 14 | 13 | 14 | 14 | 14 | **16** |
| instance redundancy | 114 | **173** | 418 | **607** | 702 | **944** |
| nodes known | 7 | 7 | 34 | 34 | 43 | **47** |
| species alive | 6 | 6 | 6 | 6 | 5 | **6** |

**The single clearest row: on `main` the library reaches depth 9 by tick 200 and never moves
again.** Here it goes on to 38. And `main`'s mage population only ever falls — 19, 17, 17 — while
here it recovers to 22 by tick 400, because the populace half of #172 lets the cohort grow.

**A species dies on `main` and survives here.** At tick 400 the population pane shows six species
on this branch and five on `main`: species 5 — the only one that ever reaches the deepest tier, 5 —
is extinct on `main` and holds two living mages here, and species 6 appears here with three
untaught. That is the single most legible thing in the pane, and it is a consequence of the cohort
and populace wiring rather than of any god action.

Reproduce with **`node tools/demo/probe.mjs "$PWD" 20260813 400`**, committed on this branch. It
builds the session exactly as the play server does and reports `ticksRun` and `status` alongside
the quantities. Run it twice on one tree first: identical output is the cheap positive control that
a difference between two trees means anything.

## What is still inert

Stated plainly, because a demo that oversells is worse than one that undersells.

- **`assignRole` (10) is admitted, moves the world, and moves no pane.** It has been the honest row
  since #189 and it still is. That is a read-path gap, not a broken control.
- **`openPortal` (14) is admitted and reaches no engagement — measured on this branch, not
  inherited from #189's note about `main`.** All three portal targets were opened in a live run and
  followed for 750 further ticks: the clock's mode slot is never `1` and the 64-slot engagement
  block is never non-zero, across 795 frames. The scanner was positive-controlled against the
  `knowledge`, `mages`, `resources` and `institutions` blocks in the same frames, which it reports
  non-zero on all 795 — so this is *"the answer is no"* and not *"the probe is broken."*

  So **#171's mid-raid work is in this branch's rules and cannot be reached from the console.** The
  raid seam is merged and schema-reconciled at revision 8; it is not playable. **This is the
  biggest gap between what the branch contains and what a player can do**, and the one item on the
  original list that this branch does not deliver.
- **`changeTradition` (13), `declareAscension` (15), `revokeEdict` (7) and `inviteScholar` (16) are
  masked** — three of them all run.
- **#183 `mastery-rises` is in, and invisible under a no-op run.** Measured: at ticks 200 and 400
  the per-species tier histogram — which is exactly what the population pane draws — is
  **byte-identical between the two trees for every species present on both**. Deepest tier reached
  stays 4. It changes the snapshot hash from the first tick, so it is live; it does not move a
  number this console draws at these ticks under no-op play. Do not claim it from this demo.
- **`universities` stays 1 and `capacity` stays 64** on both trees. The institutions block is
  `[universities, capacity, libraryDepth, grimoires]` — **there is no affiliated-mages slot**, so
  #134's headline "affiliated 1 → 64" is not a quantity this console can show. What #134 buys here
  is the library and grimoire columns above, which are large and real.
- **The committed recording `ui/session.json` is still wrong**, and deliberately untouched.
  `scripts/record-session.mjs` submits `{ id: … }` while `admit()` reads `action.kind`, so every
  tick of it was rejected `unknown-action`. The play server submits `{ kind }` and is unaffected.
  Fixing the recorder moves a golden and is a separate change.

## What is red, and why that is fine

The branch is red and should not be made green here.

- Pinned literals in `packages/scenario` tests, content `contentHash` refusals, and the three
  balance baselines all disagree with the wiring, because the wiring legitimately moved the numbers
  they pin. Resolving those is each PR's own job on its own merge.
- **Nothing was regenerated.** No `goldens:regen`, no baseline re-measure, no gate run.

Two things were held green on purpose, because they are the oracles that catch a silent mistake:

- `packages/sim-core/test/unit/rng-registry-append-only.test.ts` — stream ids dense from 1.
  `corruption: 13` from #170 is the only stream this stack adds, and it lands dense with no
  renumber.
- `packages/state/test/unit/world-schema-migration.test.ts` — **#170 and #171 both claimed
  world-schema revision 7.** Reconciled per `contracts.md` §4.4 by order of arrival:
  `knowledge-fidelity` merged first and keeps 7, `mid-raid-change` takes **8**, `addMidRaidChange`
  steps 7 → 8, and `WORLD_SCHEMA_VERSION` is 8. Getting this wrong does not throw — the migration
  test is what catches it, and it passes.

`npm run typecheck` is clean. That is the one gate this branch does hold, because `preplay` runs it
and a type error would stop the demo starting.
