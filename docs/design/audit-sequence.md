<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The audit sequence: 170 rows, deduplicated, subtracted, and ordered

**Written 2026-08-14 (W198).** This is a plan, not a fix. Nothing under `packages/` was changed, no
baseline was regenerated, no gate or sweep was run, `goldens:regen` was not invoked.

## The refs this document is a statement about

Every claim below is a claim about a named ref. They will move; several moved *while this was being
written*, and one of those movements changed a conclusion (see §2.4).

| ref | SHA | what it is |
|---|---|---|
| `origin/main` | **`59dfc637`** | *"How wide must the opening square be? … (#173)"* — the tree everything is measured against |
| `pr/174` | `3c7cbacd` | `docs/design/audit-magic.md`, 42 rows |
| `pr/175` | `dbfa9d60` | `docs/design/audit-vision.md`, 20 rows |
| `pr/177` | `991a6c6b` | `docs/design/audit-contracts.md`, 31 rows |
| `pr/178` | `5eef210c` | `docs/design/audit-world.md`, 47 rows |
| `pr/180` | `2d322432` | `docs/design/audit-agent-interface.md`, 30 rows |
| `origin/pm/campaign-plan` | `0f5798ee` | the night's record; W180–W212 read |
| `pr/134` | `09365f2a` | affiliation |
| `pr/169` | `e26e19e9` | the effects union |
| `pr/170` | `6dbdd030` | scribing fidelity |
| `pr/171` | `9911cdf5` | the raid seam |
| `pr/172` | `03127030` | the scribing loop |
| `pr/176` | `9c950f97` | an anti-requisite pair inside the twelve |
| `pr/179` | `df0250fb` | generated artifacts built in CI |
| `pr/181` | `a5aeb8f6` | students as entities |
| `w196/mastery-rises` | **`cac97dab`** | **local branch only — not on `origin`** |
| `w197/aptitude-sorts-careers` | `a5aeb8f6` | **local branch only — and byte-identical to `pr/181`** |

**Two of the eleven closers are not on `origin`.** `git ls-remote origin` returns nothing for either
`w196/*` or `w197/*`; both were found only by `git worktree list`, in live workspaces belonging to
other sessions. They were read with `git show <branch>:<path>`, never by working inside their
checkouts. They cannot carry the confidence a pushed PR carries, and one of them moved under this
document mid-session.

---

## 0. The denominator, and a correction to it

**170 rows is not 170 defects, and 91 is not the number of remaining ones.**

The BUILT and SUPERSEDED rows — 31 and 22 as the campaign record totals them, 29 and 22 as corrected
below — are findings about *documents*. SUPERSEDED means the doc's claim of absence is stale: the
capability is live under another name. BUILT means it shipped. Neither is work on the code. The
defect base is **PARTIAL + ABSENT**.

And the published totals are off by two. Counting the status cell of every table row mechanically
across the five files:

| slice | BUILT | PARTIAL | ABSENT | SUPERSEDED | total |
|---|--:|--:|--:|--:|--:|
| magic | 1 | 5 | 30 | 6 | 42 |
| vision | 2 | 5 | 12 | 1 | 20 |
| contracts | **6** | 5 | **17** | 3 | 31 |
| world | 14 | 4 | 21 | 8 | 47 |
| agent/interface | 6 | 7 | 13 | 4 | 30 |
| **total** | **29** | **26** | **93** | **22** | **170** |

`audit-contracts.md`'s own status-count block says *"BUILT 8 · ABSENT 15"*; its table body holds six
BUILT rows and seventeen ABSENT ones. The body is right and the summary is wrong, which moves the
corpus total from 31/91 to **29/93**. (`audit-agent-interface.md`'s counts survive: its Grungeon row
carries two tags and the document says in its own header that it counts that row PARTIAL.)

So the defect base is **26 PARTIAL + 93 ABSENT = 119 rows**, not 117 and not 170.

Two rows leave the base immediately because two audits contradict a third and the two are right —
see §1.2. **117 rows enter the deduplication.**

---

## 1. Deduplicate

Thirteen findings were filed more than once under different names. Merging them removes **18 rows**.

### 1.1 The merges

Each row here is **one defect**. "Audits" names every slice that saw it; "rows" is how many table
rows it occupied.

| # | one defect | rows | audits that saw it |
|---|---|--:|---|
| **D1** | **Nothing raises mastery.** `DEFAULT_INITIAL_MASTERY` 256 against `DEFAULT_TEACH_THRESHOLD` 512, and `setMastery`'s only rules-path caller lowers it | **4** | **contracts** §1.5 · **magic** `metis-from-use-results` §6 (`practice` restoring mastery) · **world** (`publish`/`practice` as an operation) · **agent** §2.1 (`ticksToUnteachable` computed and undeliverable). Corroborated from outside the base by **world**'s BUILT row on `ages-of-magic` §2c |
| **D2** | **Universities are never staffed.** `completeAffiliation` has no production caller, so the §6a capital loop's input is confined to the founding cohort | **4** | **contracts** §1.4 · **vision** §6a · **world** (pinned `completeAffiliation`) · **world** `place-architecture` §4 |
| **D3** | **The §7 balance metrics are defined, version-pinned and gated on nothing.** No committed baseline carries a value or a tolerance for any of the twelve | **2** | **vision** §9 · **contracts** INV-30. INV-30's two-sided ascension band is one of the twelve and its constants are *already pinned* at `metric-constants.md:117–118`; the fix is the same fix. **`invariants.md` Gaps §3 and Gaps §4 were considered for this merge and left out**: a missing release claim lives in `release-plan.md`, a different artifact, and writing one is not the same work as making a gate read a value |
| **D4** | **The three academic rates have no node-driven consumer**, and two of the three `world-step.ts` literals that disable them survive (`fertilityBonuses: []`, `scribe-rate` stacked against `NO_BONUSES`) | **3** | **magic** §7.5 · **world** `ages-of-magic` §2/§2a · **world** `ages-of-magic` §2c. Also **agent** row 5, filed SUPERSEDED because one of the three was fixed |
| **D5** | **`scribingQueueDepth: 0`** is a bare literal, so the populace demands zero scribes forever | **2** | **magic** (`scribing-fidelity` "Also required") · **world** ("students should spawn naturally") |
| **D6** | **`yieldSources` never calls `permits()`** — a forbidden cell keeps paying worship while any instance survives | **2** | **magic** §7.7 · **vision** §4 |
| **D7** | **`changeTradition` is never called; the *consequence* is skipped, not the action** | **2** | **contracts** §4.2 · **vision** §4a. Also **agent** §3. Take **contracts'** narrowing: `traditionPlan` *does* make the move and zero favor; what is skipped is instance resolution against the incoming `store` hook |
| **D8** | **The `contracts.md` §4.3 event record is required and nothing emits it** | **2** | **contracts** · **agent** row 1 |
| **D9** | **`AgentSession` exposes eleven methods and none of the projections the package computes** | **2** | **contracts** §4.3/§4.4 · **agent** row 2 — which had *already* merged §1.4, §1.7 and §1.10 into itself, so do not subtract those again |
| **D10** | **Four actions during engagement, and `runRaid` never yields to the agent** | **2** | **contracts** §4.2 · **agent** §5.1a |
| **D11** | **`knowledgeKind` is authored on 300 nodes and read by no rules path** | **2** | **magic** `metis-authoring` §5 · **vision** §13 |
| **D12** | **Nothing arms a raider**, so §8's stakes never occur | **2** | **magic** (`scribing-fidelity` raid item 5) · **vision** §8 |
| **D13** | **No composition operator: a node names exactly one cell** | **2** | **magic** §6 + `depth-and-skill` §4 · **world** `ages-of-magic` §3b |

**31 rows → 13 defects. 18 rows removed.**

D1 is the one the brief predicted: it surfaced in **four** audits, not three, wearing four
descriptions — a threshold spec written over an empty interval, a missing `practice` goal, a missing
`publish` verb, and an interface countdown with no door out. It is also written accurately in **five
source files on `main`** (`knowledge-census.ts:257`, `god/interventions.ts:594`,
`metrics-telemetry.ts:279`, `species-versatility.ts:45`, `state/components.ts:477`) — verified by
`git grep setMastery 59dfc637 -- packages`, which returns those five comments, the definition at
`subsystem.ts:292`, and exactly one call: `decay.ts:213`.

### 1.2 Where the audits disagree, and which is right

Three conflicts. All three resolve, and two of them remove a row from the base.

- **`applyWard`.** `audit-magic` files it **PARTIAL** ("pinned unreached"). `audit-contracts` and
  `audit-vision` independently found `CastArbiter#applyWardOnce` — the identical
  `floorDiv(damage × (FP_ONE − ward), FP_ONE)` — defined at `rules-raid/src/arbitration.ts:570` and
  **live at `raid.ts:514` and `:995`**. Verified here at `59dfc637`. It is **SUPERSEDED**, not
  integration debt; magic's row inherited the stale `reachability-triage.md` §2 entry, which searched
  `primitives/` for a capability that lives in `rules-raid`. **Row leaves the base.** (Wards still
  never prevent anything — but that is D12's defect, not this one.)
- **`replay`.** Same shape. `audit-vision` files it **PARTIAL**; `replayAndLocate` is imported at
  `scripts/regen-goldens.mjs:107` and called at `:142`, verified here. **SUPERSEDED. Row leaves the
  base.**
- **The balance gates.** `audit-vision` §9 says ABSENT; `audit-world` §5.3 says SUPERSEDED. Both are
  right about different objects: `metrics-registry.ts` **defines** `capitalSnowball` and a banded
  `ascensionRate`, and `invariants.md`'s *"To be defined"* is stale — but **no gate enforces a value
  for any of the twelve**. Kept as D3, an ABSENT defect, with a note that `invariants.md` needs the
  doc edit.

### 1.3 The count nobody had

**119 base rows − 2 reclassified − 18 merged = 99 distinct defects.**

Two side buckets, both real work and neither a code fix:

- **BUILT-but-wrong — 2 rows.** `vision.md` §4 says *"~15"* effect primitives; `primitive.json` holds
  **16** at `59dfc637` and **17** on `pr/170`, which adds `knowledge-corrupt`. And §12 declares audio
  out of scope for v1 while `check:audio` is a step of `npm run verify`. Both are one-line document
  corrections.
- **SUPERSEDED — 22 rows, plus the two reclassified above = 24 document edits.** Five documents were
  found asserting stale claims in the present tense: `vision-audit.md`, `magic-projection.md`,
  `reachability-triage.md`, `invariants.md`, `hard-magic.md`. These are the cheapest items in the
  corpus and the ones with the worst measured cost per item — `CLAUDE.md` records two agents losing a
  full investigation each to a single rotted figure.

---

## 2. Subtract what is already fixed

Eleven in-flight changes. Each was checked by reading the diff at the **exact `file:line` the audit
cited**, in the direction the audit said was missing — not by reading the PR title, and not by
`git grep` on an identifier, which matches prose. Where a probe returned a negative it was run
against a positive control.

### 2.1 What each closes

| PR / branch | closes | how it was verified |
|---|---|---|
| **#134** affiliation | **D2** (universities unstaffed) | `git grep completeAffiliation pr/134 -- packages`: it is **imported** at `world-step.ts:159` and **called** at `:1678`, inside `settleAffiliations`, which `world-step.ts:1561` invokes. On `59dfc637` the same probe returns only the definition, the barrel re-export, and the prose mention at `world-step.ts:1540` — the documented trap. Campaign W212 measures the curve inverting: affiliated mages 6→5→4→3→2→**1** becomes **64 of 69** |
| **#169** effects union | **D4**, and one of its two surviving literals | `academic-effects.ts` exists with `academicRateBonuses` exported at `:289`, called from `world-step.ts:788`; `scribe-rate` now stacks `academic.scribeRate(mage)` at `world-step.ts:1827` where `59dfc637` passes `NO_BONUSES` at `:1666`; **`fertilityBonuses: phase.fertility`** at `:2019` where `59dfc637` has `[]` at `:1849`. Schema `magnitude` takes the signed bound (node.schema.json description, verified) |
| **#170** scribing fidelity | **D11** (`knowledgeKind` gets a rules-path reader), the corruption/mētis-fraction row, the `corrupt` intent, and `hard-magic` missing piece 3 | `packages/rules-magic/src/instances/study.ts` exists in `git ls-tree pr/170`; `knowledgeKind` is read at `catalog.ts:210` and `scribing.ts:221` where `59dfc637` has it only in `node.schema.json` and `types.ts:197`; `Intent.kind` at `raid.ts:190` gains `'corrupt'` and is branched on at `:492`; `knowledge-corrupt` is the 17th entry of `primitive.json`; `GRIMOIRE.durability` is computed from `scribeAffinity` |
| **#171** raid seam | **D10** (four actions during engagement, and the caller) | `ENGAGEMENT_ACTIONS` defined at `mask.ts:180` and exported at `index.ts:126`; `packages/scenario/src/raid-directives.ts` exists; `runRaidWithPolicy` defined at `raid-directives.ts:255` and called from `raids.ts:103`. W198 measures withdrawal **0.0% → 87.0%**, nodes looted 32 → 246 |
| **#172** scribing loop | **D5** (`scribingQueueDepth`) | `world-step.ts:806` reads `scribingQueueDepth: unwrittenNodeCount(state)`; `unwrittenNodeCount` is defined at `:2018`. On `59dfc637` the literal `0` is at `:799`. W199 measures the scribe cohort 24 → 46/54 and the unwritten queue draining 40 → 0 |
| **#176** anti-requisites in v1 | the v1-reachable exclusion pair | `cell.json` on `pr/176` carries **four** cells with `excludes` — `creo-ignem`⊥`creo-umbra` (neither `v1`) plus **`perdo-nomen`⊥`rego-nomen`, both `v1: true`**. On `59dfc637` only the `creo` pair exists. Does **not** close the `refused`-resolution gap: both pairs are `destructive` |
| **#179** generated artifacts | nothing in the base — it is an **unblocker** | `check:generated` is a script and a step of both `verify` and `verify:nosweeps` on `pr/179`; neither exists at `59dfc637`. W211's addendum traces **#172's required-check failure to the `ui/session.json` byte pin, which #179 deletes** |
| **#181** students as entities | `prevalence`, student intake, curriculum graduation | `species.json` on `pr/181` carries `prevalence` per species (102 / 1024 / 51 …); `git grep prevalence 59dfc637 -- packages` returns **nothing**. `rules-world/src/mages/enrolment.ts` is new; `graduateStudents` is called from `world-step.ts:934`, where `59dfc637` gates promotion on `maturityMonths` alone |
| **#173** width sweep *(merged, in `59dfc637`)* | settles the opening-square question — **keep the twelve** | 168 runs across 14 squares. Also **downgrades** a magic row: see §2.3 |
| **`w196/mastery-rises`** *(local only)* | **D1 — nothing raises mastery** | See §2.4. At `cac97dab`: `rules-magic/src/instances/practice.ts:237` calls `setMastery` and **raises** it; an eleventh goal `GOAL.practice = 10` (`goals.ts:113`, in `GOALS_IN_ORDER` at `:139`) reaches it through `world-step.ts:1711` → `gateway.ts:587` |
| **`w197/aptitude-sorts-careers`** *(local only)* | **nothing yet** | `git diff pr/181...w197/aptitude-sorts-careers` is **empty**. The branch is byte-identical to #181's head at `a5aeb8f6`; no work of its own has been committed |

### 2.2 What the closers do *not* close, stated so it is not assumed

Reading the diffs found four residuals that would otherwise be silently marked done:

- **`scribeRateBonuses: []` survives on #169**, at a *different* site from the one it fixes. The
  per-mage scribe rate is wired; `scribingThroughput`'s institutional call still passes a literal
  empty array (`pr/169:world-step.ts:2204`, unchanged from `59dfc637:world-step.ts:2017`). One
  literal of the three, still live.
- **`PRIMITIVE_COVERAGE_EXCLUSIONS` is still `['fertility', 'lifespan']` on #169**
  (`coverage.ts:88`). The `fertility` *wire* now exists; no v1 node authors a `fertility` or
  `lifespan` effect, so the gap is now purely a **content** gap. That is a smaller and different
  problem than the audits describe.
- **`universityProfile`, `dominantCell` and `staffCohortsOf` remain unreached on #134** — verified:
  all three are still listed in `pr/134:scripts/reachability-baseline.json`, whose `findingCount` is
  still 125, and `staffCohortsOf`'s only callers outside `rules-world` are tests. So of
  `place-architecture` §4's three undrawable rows, **#172 closes the scribe count and #134 closes
  neither of the other two.**
- **Combat attempts are still zero on #171**, and the PR pins that rather than hiding it: the
  ablation control moved from by-seed to by-primitive so "six of seven move nothing" becomes an
  assertion that fails when someone closes the gap. **D12 is untouched.**

### 2.3 One ranking the campaign already overturned

`audit-magic`'s **#1 row** — the loot shelf selecting on `entry.record.v1` at
`rival-universe.ts:367–368` instead of on the raiding universe's ruleset — is verified intact at
`59dfc637` (both `:219` and `:368`). Keep the re-key: it is cheap and it is a genuine prerequisite
for #137.

But **do not inherit its severity.** W205's width sweep measured #137's collapse by **ablation** and
attributes roughly four-fifths of it to a single `destructive` anti-requisite, not to the loot
channel. W201's derivation from reading the selector is a second, unquantified cause. A measurement
outranks a derivation.

### 2.4 The branch that moved under this document

`w196/mastery-rises` was read twice, ninety minutes apart.

- At **`9d536263`** its entire diff against `main` was `tools/w196/mastery-crossings.mjs` — an
  *instrument*, 378 lines, and `setMastery` still had exactly one rules-path caller. On that reading
  D1 was open.
- At **`cac97dab`** it carries `f4079f47` *"feat(rules-magic): practice — the one operation that
  raises mastery"* and D1 is closed.

Both readings were correct about their ref. This is `CLAUDE.md`'s rule paying out inside one session,
and it is why every closer above carries a SHA. **An unpushed branch in another session's worktree is
the least stable ref in this document.** If D1's ordering below matters to a decision, re-read
`w196/mastery-rises` before acting on it.

### 2.5 The subtraction

| | rows |
|---|--:|
| distinct defects after dedup (§1.3) | **99** |
| closed by an in-flight change | **−13** |
| **remaining** | **86** |

The thirteen, enumerated so the arithmetic is checkable: **D1** (`w196`), **D2** (#134), **D4**
(#169), **D5** (#172), **D10** (#171), **D11** (#170), the corruption / mētis-fraction row (#170),
the `corrupt` intent (#170), `hard-magic` missing piece 3 (#170), the v1-reachable exclusion pair
(#176), and #181's three — `prevalence`, student intake, curriculum graduation.

**Two of the thirteen are blocked from merging, and one blocks another.** #169 fails the required
`Verify` context on `baseline-invalid` — a `provenance.contentHash` mismatch with no provenance-only
re-seal path in the tree (W211 greps for `provenance-only`, `reseal`, `skipMeasure` and finds
nothing). #172 fails on the `ui/session.json` byte pin, which **#179 deletes**. So the merge order
inside the closers is: **#179 → #172**, and **#169 waits on an owner ruling**, not on code.

---

## 3. Order what remains

Sorted by dependency first, then cheap before structural inside each layer. **Severity is not a sort
key.** The night's evidence is that cheap fixes to inert subsystems produced enormous effects — 6
affiliated mages became 64; scribe demand 0 became 88; withdrawal 0.0% became 87.0% — while the most
interesting structural findings could not be measured at all until something moved.

**cheap** = a literal, a wire, a missing call, a content row, a document line.
**structural** = a model change: a new component, a schema revision, a new subsystem, a new stream.

### Layer 0 — unblocks a closer. Do these first or the thirteen do not land.

| | fix | cost | why first |
|---|---|---|---|
| 0.1 | **Merge #179**, then #172 | cheap | #179 is the only thing that clears #172's required check. It was commissioned as tidy-up and is on the critical path |
| 0.2 | **Rule on the provenance-only re-seal** (W211's three options) | *owner's call, not a fix* | Applied literally, the no-baselines rule makes every content-touching PR that complies unmergeable. It currently stalls #169, #176 and #181 — three of the four largest closers |

### Layer 1 — cheap, unblocked, and each one turns a subsystem on

Nothing in this layer waits on anything else. Every item is a literal, a call, a content row or a
guard.

| | fix | cost | note |
|---|---|---|---|
| 1.1 | **Re-key `shelveForeignBooks` to the raiding universe's ruleset** — `rival-universe.ts:219` and `:368` | cheap | Prerequisite for #137. The masks are written twelve lines below the selector and go unread. Severity downgraded per §2.3 |
| 1.2 | **Add `permits()` to `yieldSources`** (`god/system.ts:649–656`) — **D6** | cheap | `permits` is already imported into that file and used at `:440`. Verified absent at `59dfc637`. Forbidding is priced as denial and refunded as worship |
| 1.3 | **Wire the surviving `scribeRateBonuses: []`** at `scribingThroughput`'s call site | cheap | §2.2. Do it *with* #169 or it will read as done |
| 1.4 | **Move `check:consumption` into the gate**, or give it a counter | cheap | `ci.yml:172` states the exit condition honestly and nothing counts the number. Once #169 lands, the primitive it was red for is green — this is the moment the deliberate exclusion stops being defensible |
| 1.5 | **Price the permit verbs**, or attach a cost to permitting (`magic-projection` §7.1) | cheap (content) | `god-cost.json` prices permit and forbid symmetrically by enforced invariant while `interventions.ts:393–395` exempts permitting from the worship shock *by construction*. Verified intact. This is `magic-projection`'s own "stands without accepting any projection" finding |
| 1.6 | **A `refused` exclusion pair in shipped content** | cheap (content) | #176 authors a second `destructive` pair; half the schema is still unexercised. W202 flags that a `destructive` pair between two cells mages both want may be a teaching treadmill — which is an argument *for* `refused` and an owner ruling (§4.3) |
| 1.7 | **A second portal cell** | cheap (content) | Verified: both `portal` effects sit in `rego-limen`. 0 of 70 1×1 openings and 13 of 910 2×2 openings can raid |
| 1.8 | **A units guard on `lifespan` magnitudes**; **a `landUnits` guard on *Creo Terram*** | cheap (loader) | Both latent. The lifespan one detonates on the day its consumer is wired — 17 nodes four orders of magnitude out, presenting as a balance problem |
| 1.9 | **The cross-cell-origin loader diagnostic** (`vision.md` §4's own recommendation) | cheap (loader) | `diagnostics.ts:36–57` has no code for it. Building it is what settles the standing §4-versus-§13 disagreement *by construction* — §13 is right that nothing has adopted the regularity as a rule |
| 1.10 | **Correct the 24 rotted document rows** (§1.3) | cheap | The lowest cost and the highest measured waste per item in the corpus. `vision-audit.md` §8, `magic-projection.md` §7.5/§7.5a, `reachability-triage.md`'s `applyWard`/`replay`/portal rows, `invariants.md`'s INV-29/30 *"To be defined"*, `hard-magic.md` piece 1, `vision.md`'s "~15 primitives", and `audit-contracts.md`'s own summary block |
| 1.11 | **Apply the remainder-draw idiom at the three sites that lack it** | cheap | The repair is in the tree, argued, at `promotion.ts:148–162` and `carrying-capacity.ts:485–489`. #172 fixes scribe reallocation; `portal.ts:221` (detachments, threshold 100) and `capital.ts:322` (upkeep degradation, threshold 32) do not have it. `portal.ts` is latent only because `standingSoldierTarget` is 0 |
| 1.12 | **Author a magical vellum source in v1** | cheap (content) | `nomen` is the only vellum-yielding form, carries exactly one `resource-yield` effect in 300 nodes, and that node is not in v1 — while library upkeep and scribing both spend vellum. No universe on `main` can produce vellum by magic |

### Layer 2 — blocked on Layer 1 or on a closer, then cheap

| | fix | blocked by | cost |
|---|---|---|---|
| 2.1 | **Give `universityProfile` / `dominantCell` a caller**, and `UNIVERSITY_STAFF` a production writer | **#134** (mages must affiliate before a profile means anything) | cheap |
| 2.2 | **Mark `place-architecture` §4's rows as pending**, as §6 already does for its own gaps | — | cheap (doc) |
| 2.3 | **Re-run the mētis-from-use ruling** | **`w196`** and **#127** (`applyMagic`) | cheap (measurement — but see §4.4) |
| 2.4 | **Measure the teaching economy at a magnitude that binds** — `teach-rate`'s effect size, `knowledgeHalfLife`'s counter-pressure, graduation on curriculum, task 9.9's learning-to-learn | **`w196`** (D1) and **#169** (D4) | cheap to measure. **State this narrowly:** teaching is *partly* measurable today — W208 measured `teach-rate` moving lesson completions **+3.1%**, with 5 of the grid's 19 sources inside the twelve. What is blocked is measuring it at a magnitude that binds, because the pool of teachable knowledge is whatever a god granted. W208's own subject is that promoting a narrow measurement to a broad claim was the night's recurring error, and *"nothing about teaching is measurable"* would be one |
| 2.5 | **Call `changeTradition` from `traditionPlan`** — **D7** | — | cheap, but it is a **behaviour** change: switching to `art-of-memory` must destroy what the incoming `store` hook cannot legally hold |
| 2.6 | **The ruleset as a fifth `computeOccupationDemand` input** | **#172** (the demand side must have more than one live port first) | cheap. Verified: `DemandInputs` holds exactly four fields at `59dfc637` |
| 2.7 | **Fix `REQUIRED_GOD_CONSTANTS` to test readership, not membership** | — | cheap **only if** the eight `legacy-*` constants get a reader; otherwise the guard correctly goes red and stays red, which is a decision (§4.3) |

### Layer 3 — the largest blocked cluster: arm a raider

**D12 gates six other findings**, and `audit-magic` says so itself. `prepare`, `isCastable`,
`preparationCost` and `costSplit` are all pinned unreached; nothing splits a cost across preparation
and cast, and nothing asks whether a spell is castable before it is cast. Until something arms a
raider:

- zero combat attempts occur, so **casualties**, **theft as a stake** and **`applyWardOnce` ever
  firing** are unmeasurable, not false;
- **detection / stealth** ("leave undetected" as a distinct outcome) has nothing to be a distinct
  outcome from;
- **library-level destruction** (`destroyLibrary`, `grimoiresIn`) has no occasion;
- **#170's `corrupt` intent fires zero times in every committed sweep**, by its own test;
- `depth-and-skill` §8 item 4 — the pairwise outcome matrix — *cannot be measured*, which is
  different from being false.

| | fix | cost |
|---|---|---|
| 3.1 | **Arm a raider** — give `prepare`/`isCastable`/`preparationCost`/`costSplit` a caller inside `runRaid` | **structural** |
| 3.2 | then: casualties, theft-as-stake, detection/stealth, library-level destruction | structural |

This is the largest single unblocking in the corpus and the most expensive item in it. It sorts below
Layer 1 because Layer 1 is cheap and unblocks measurements today, not because it matters less.

### Layer 4 — structural, unblocked, and each is a model change

| | fix | cost | note |
|---|---|---|---|
| 4.1 | **The §4.3 event record** — **D8** | structural | Four independent designs already rest on it: `sound-design.md` §6.5's sequenced loss cue, §0.4's density thresholds, §10 items 1–2, `interface-findings.md` §2.3. The contract amendment already landed. Invisible to the ratchet by scope |
| 4.2 | **Widen `AgentSession`** — **D9** | structural (a boundary decision, not a big diff) | Verified: eleven members at `session.ts:217–247`. `AgentView.raw`, `ExplainProjection` and `knowledgeCensus` are all exported and unreachable through the only door a client has. 4.1 and 4.2 are the same boundary and should be decided together |
| 4.3 | **Prestige carry-forward** (`carriedPrestige`, `legacyGrant`) | structural | 12 pinned findings and 8 authored constants that turn nothing. Unblocks 2.7 and `prestigeAdvantage` |
| 4.4 | **Discriminating ascension** | structural | `uniform-random-legal` ascends 10 of 10; every deliberate strategy ascends 0 of 10. The sign is inverted. Blocks every Monte Carlo comparison between strategies and `mm_gym`'s terminal reward |
| 4.5 | **Enforce values on the §7 metrics** — **D3**, and separately **write the two missing release claims** (`invariants.md` Gaps §3, knowledge half-life; Gaps §4, raid-length *pacing* as distinct from INV-20's termination). Three deliverables, two artifacts | structural (process) | Deferred deliberately: the owner has stopped baseline work until wiring is complete, and §11's MINOR-parity rule is currently arranged to pass while certifying nothing. It must be done **before** an even MINOR is taken, and it cannot honestly be done until Layers 1–3 land, because a baseline over an inert subsystem measures a constant |
| 4.6 | **A composition operator** — **D13** | structural (schema + content) | `ages-of-magic`'s second and third ages have no mechanism |
| 4.7 | **A capacity primitive**; **siting universities in territories**; **the bubble**; **the tempo-loss third party** | structural | Each needs a component or a second `SimState`. Correctly sequenced last |

### The dependency graph, in one paragraph

**#179 → #172 → scribing fidelity (#170) is reachable in-world** (W195: #170's reading edge closes
1–3 times per run because `scribingQueueDepth` is zero). **`w196` (mastery) → everything about
teaching**, including `teach-rate`'s magnitude, `knowledgeHalfLife`'s counter-pressure, graduation on
curriculum, and task 9.9 — and **#169 (the academic wire) is the other half of that same gate**:
mastery gives teaching something to propagate, and #169 gives it a rate that content can move.
**#134 → the §6a loop's input → `universityProfile` / `dominantCell` / staff mix → three
`place-architecture` §4 rows → INV-29 has something to measure.** **#181 landed seats that do not
bind** — `unseated` is zero on every tick of a 1,200-tick run — so university-capacity work is
*un-exercised* rather than blocked, and the `prevalence × mageAptitude` double gate is a magnitudes
decision the author owns. **Arming a raider → six findings at once**, and nothing else in the corpus
unblocks that many.

---

## 4. What should not be fixed

**86 remaining is not 86 obligations.** These rows are correctly absent, and collapsing three
different reasons into one is why the ABSENT column reads as a backlog.

### 4.1 Unstarted future work — not defects

- **`sound-design.md` §§10–11, playback.** The clearest case. `git ls-tree --name-only 59dfc637
  packages/` lists thirteen packages and **none is a client**; `electron-client` is proposal-only and
  has no `tasks.md` at all. Building one now is scope creep against a roadmap that puts it after
  0.5.0. And the document is in better shape than its 1,975 lines suggest: §0's constraints are
  enforced by two test files, 56 cues and 198 voice lines ship inside `npm run validate`, and
  `assets/selections.json` carries 217 auditioned takes. Its *genuine* gap is four §10 read-path
  requirements, and **all four resolve to 4.1/4.2 above** — it is not waiting on audio work.
- **`marketing-page.md`** — no page, correctly. Art is scheduled for 0.13.0.
- **`mvee-paradigm-survey.md`** — a decision record, not a spec. The loader is *asserted to refuse*
  `pact`.
- **`art-plan.md`'s asset manifest** — the rule was broken by the first five assets to land, not the
  hundredth. Low urgency, recorded so it is not rediscovered.
- **`content/spell-glosses.md`'s 25 drafts** — self-declared, and exact: 0 of 30 headings match any
  of the 300 `name` values in `node.json`.
- **Ten of the twelve Grungeon suggestions** — the document blocks S6/S9 behind copy-count
  reduction itself.

### 4.2 Deliberate, with the argument already in the tree

Do not "fix" these; the tree explains why each is what it is.

- **`contracts.md` §1.1's terminated-universe hash.** The doc records it *"so a reader does not fix
  it"* — the alternative is a rules layer suppressing a core clock advance, which inverts the §5
  rule-4 dependency.
- **`magic-projection` §7.6's missing `permits()` at looting.** `consequences.ts:185–190` records it
  as intended: a universe may hold what it forbids, dormant.
- **`anti-requisites` open 3 — teaching refusing before the desk.** Left out on purpose so the
  enforcement path at `createInstance` was not measured untested.
- **`standingSoldierTarget: NO_STANDING_ARMY`.** The exemplary zero: a named constant carrying a
  hundred-line argument at `demand.ts:82–107` and citing `ages-of-magic` §2b at
  `world-step.ts:800–805`. Raising it is a *bug* until 1.11's detachment floor is fixed.
- **The reachability ratchet's four excluded packages.** Reasoned, and mostly right — their consumers
  are outside this repo. The one place the reason does not hold is `project()`, whose intended caller
  was `agent-api` itself.

### 4.3 Awaiting an owner ruling — neither a defect nor future work

These are decisions. An agent taking one is the failure mode, not the fix.

- `magic-projection` §7.2 — the INV-23 carve-out for universes permitting *Muto Corpus*.
- §7.3 — whether *Intellego Mentem* reaches a memory palace. **Must be settled before any content
  author writes an *Intellego Mentem* node.**
- §7.4 — whether a portal's **arrival** is host-gated or attacker-gated. The doc's *"most valuable
  open question"*: it decides whether Limen is the most or least interesting switch in the grid.
- `contracts.md` §4.2 — edicts during engagement, and the raid verb set (Vis collides with the
  shipped no-fourth-resource requirement).
- **`refused` versus `destructive`** for #176's `perdo-nomen`⊥`rego-nomen` pair (W202's two red
  tests are the evidence, and the reading wants confirming rather than believing).
- **The `prevalence × mageAptitude` magnitudes** on #181. The mechanism is right and both gates are
  in the design; `mageAptitude` was tuned as the *only* gate, so for four species it now does that
  job twice. Human 512 → 51. **Content, and the author's.**
- **The W211 baseline re-seal** (Layer 0.2). The rule is the owner's and so is its exception.
- **The eight `legacy-*` constants**: give them a reader, or delete them and let 2.7's guard go red
  honestly. Both are defensible; leaving them is not.

### 4.4 Measurement work the owner has explicitly stopped

Recorded, **not actioned**, and the reason is a standing instruction rather than a judgement about
value:

- `depth-and-skill` §8's five instruments — the obliviousness restriction, the coefficient of
  scalability, a containment null model, a pairwise outcome matrix, agent-space search. Item 4 is
  gated on Layer 3 anyway.
- `numeric-integrity.md` Gaps §1–§4 — the snapshot-graph walker, the `?? 0` audit, the cheaper
  sentinel, and the event-loop yield. **Gaps §4 is the exception worth raising:** `npm run verify`
  chains with `&&`, so a load-induced worker timeout means **the three balance gates never run at
  all**, and the device that fixes it already exists in `runLongReference`. That one is cheap and is
  about the gate rather than about a number; it belongs in Layer 1 if the owner wants it.
- Re-running any sweep, gate or baseline, including the mētis-from-use re-ruling at 2.3.

---

## 5. What was re-verified here, and what was taken on trust

The audits are hours old and `main` moved after every one of them was taken. Everything ranked in
Layer 0, Layer 1 or Layer 2 was re-read at **`origin/main@59dfc637`**, with `-- packages` as the
pathspec (`packages/*/src` silently matches nothing here) and a positive control on every negative.

**Re-verified at `59dfc637`:**

| claim | result |
|---|---|
| `DEFAULT_INITIAL_MASTERY` 256, `DEFAULT_TEACH_THRESHOLD` 512, `MASTERY_MAX` 1024 | intact, `constants.ts:50/63/116` |
| `setMastery` has exactly one rules-path caller and it lowers | intact — `decay.ts:213` is the only call; five other hits are the documenting comments and one is the definition |
| `scribingQueueDepth: 0` | intact, `world-step.ts:799` |
| `fertilityBonuses: []` / `scribeRateBonuses: []` | intact, `world-step.ts:1849` / `:2017` |
| the loot-shelf selector on `entry.record.v1` | intact, `rival-universe.ts:219` and `:368` |
| `yieldSources` never calls `permits()` | intact, `god/system.ts:649–656` |
| `DemandInputs` holds exactly four fields | intact |
| `cell.json` carries 2 of 70 cells with `excludes`, neither `v1` | intact |
| both `portal` effects sit in `rego-limen` | intact |
| `AgentSession` exposes exactly eleven members | intact, `session.ts:217–247` |
| `permit-sentiment` → 0 hits (control: `corruption` → hits in three packages) | intact |
| `knowledgeKind` has no rules-path reader (only schema + `types.ts:197`) | intact |
| the §4.3 event-record probe → 0 lines (control: `event` hits 8 files in `agent-api/src`) | intact |
| `completeAffiliation` — definition, barrel re-export, and a prose mention at `world-step.ts:1540` | intact |
| `changeTradition` — the rules function is definition + barrel only; the god dispatches to `traditionPlan` at `interventions.ts:336` | intact, and **contracts' narrowing is the correct one** |
| `applyWardOnce` live at `raid.ts:514`/`:995`; `replayAndLocate` called at `regen-goldens.mjs:142` | **both live — the two PARTIAL rows are wrong** |
| `check:consumption` is in no `verify` script; `check:reachability:ratchet` runs only as its own CI job | intact |
| `EXCLUDED_PACKAGES` = `agent-api`, `mc-harness`, `server`, `gym-bridge` | intact, `check-reachability.mjs:187` |
| the five audits' own status counts | **`audit-contracts.md`'s summary block disagrees with its own table by two rows in each direction** |
| the reachability baseline holds **124** entries | **false on `main`. `findingCount` is 125 at `59dfc637`; 124 is a fact about `pr/170`,** whose `study.ts` gives `STANDARD_STORE` a consumer |

**Taken on the auditor's word** — read, but not re-derived here:

- Every quantitative measurement: the raid figures (0 combat attempts, 61 raids, 80,615
  combatant-ticks), `libraryDependence`'s empirical zero, the 199 metric entries across four
  baselines, `capitalSnowball` at 0.380, the 108-trait inventory, the 217 auditioned takes, the
  93 authored academic effects, the 29 mētis nodes, the 23 Corpus nodes, `researchCost`'s six
  buckets, W205's 168 runs, W212's 64-of-69.
- Every `reachability-baseline.json` category assignment other than the two corrected in §1.2.
- `audit-world`'s `species-separation-spread` and `place-architecture` §1 verifications, which are
  the corpus's two fully-reproducing rows and which no other audit contradicts.
- The three `?? 0` / sentinel / event-loop gaps in `numeric-integrity.md`, all self-disclosed.

**A `vision-audit.md` row not named in `audit-vision.md` has not been cleared — it has not been
checked.** That caveat is the audit's own and it is carried forward unchanged.

---

## 6. On the ratchet, since it will be offered as coverage

`scripts/reachability-baseline.json` pins **125** findings at `59dfc637` and covers roughly a sixth
of this corpus. It cannot be read as coverage, for two verified reasons:

1. **Scope.** `check-reachability.mjs:187` excludes `agent-api`, `mc-harness`, `server` and
   `gym-bridge` by name. Six of `audit-agent-interface`'s thirty rows — including D8 and D9, the two
   structural items in Layer 4 — can never appear in it.
2. **Kind.** It counts unreached *symbols*. It cannot see a hardcoded literal where an input belongs,
   a missing `permits()` inside a function that *is* reached, a live function reading the wrong
   field, unauthored content, a file that does not exist, or an undecided rule. **Six of
   `audit-magic`'s ten worst rows would survive a green ratchet untouched** — and so would Layer 1
   items 1.1, 1.2, 1.3, 1.5, 1.6, 1.7 and 1.12.

It is worth having. It is not a substitute for reading, and a green ratchet is not evidence that any
row above is closed.

## Related

- `docs/design/audit-magic.md`, `audit-vision.md`, `audit-contracts.md`, `audit-world.md`,
  `audit-agent-interface.md` — the five inputs. **This document does not amend them.** Where one is
  wrong (§1.2), the correction is recorded here rather than edited into someone else's open PR.
- `docs/design/campaign-plan.md` W180–W212 — the night's record, and the source for every measured
  figure cited as `[given]`.
- `docs/design/reachability-triage.md` — corrected in §1.2, and already corrected by two of the
  audits.
