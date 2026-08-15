<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Audit: unwired systems and unaddressed fixes in the contract corpus

**Audited 2026-08-14 against `origin/main` at `cf5a73a7`** (`Merge pull request #103 from
lizTheDeveloper/populace-recast`).

**Corpus:** `contracts.md`, `invariants.md`, `numeric-integrity.md`, `metric-constants.md`,
`hard-magic.md`.

**This is an inventory, not a fix.** Nothing was changed, no baseline regenerated, no gate or sweep
run.

## Read this before citing a row

- **Two refs were in play.** The corpus was first read at `0940061`; `origin/main` fast-forwarded to
  `cf5a73a7` mid-audit (the PR numbers are not merge-ordered — #103 merged after #167, which reads
  like a rollback and is not). `0940061` is an ancestor of `cf5a73a7`. **None of the five corpus
  files, and none of the source files probed below, differ between the two** — the intervening
  commits touch audio and character content, `tools/`, and one server test. Every row was
  re-verified at `cf5a73a7`.
- **The shared checkout was on `plan-w18`, not `main`**, throughout. `contracts.md` is 1,370 lines on
  `main` and 1,352 lines in that checkout; a grep run in the working tree would have described a
  different document. Everything below was read through `git show cf5a73a7:<path>` and
  `git grep <pat> cf5a73a7`.
- **Every "no caller" row has a positive control.** The call-site probe was validated against
  `permits()` (many real call sites) and against `libraryDepths` and `'alive'` before any negative
  was believed. Comment lines are stripped, because a mention is not a call — `world-step.ts:1540`
  names `completeAffiliation` in prose while nothing calls it, which is the precise failure the brief
  warned about.
- **Cross-referenced against `scripts/reachability-baseline.json`** (125 entries, pinned at this
  ref), not against the prose of `reachability-triage.md`, which was measured at `e2b89d8`. **Two of
  that document's §2 rows are wrong** and are corrected here (rows 24 and 25).

## Status counts

| Status | Count |
|---|---:|
| **BUILT** (specified and live; two of them never bind) | 8 |
| **PARTIAL** (built, reachable, and the specified consequence is not applied) | 5 |
| **ABSENT** (no implementation; 13 of 15 disclosed honestly in the doc itself) | 15 |
| **SUPERSEDED** (symbol unreached, capability live under another name) | 3 |
| **Total rows** | **31** |

**13 of the 31 correspond to entries already pinned** in `scripts/reachability-baseline.json`; those
rows cite the entry rather than reporting it as new.

---

## The inventory

Most severe first.

| doc § | what it specifies | status | evidence | blast radius |
|---|---|---|---|---|
| `contracts.md` §1.5 | `mastery` thresholds: `fp(1024)` is full, below `TEACH_THRESHOLD` a mage may not teach, between them teaching transmits "at proportionally reduced mastery", with a strict floor-at-one-unit reduction rule | **PARTIAL** | `rules-magic/src/instances/constants.ts:50` `DEFAULT_INITIAL_MASTERY = 256`, `:63` `DEFAULT_TEACH_THRESHOLD = 512`, `:116` `MASTERY_MAX = 1024`. The **only** production writer of mastery is `instances/decay.ts:213`, inside `decayHeldKnowledge`, and it lowers (`decayedMastery`). Probe control: the same probe finds `subsystem.ts:292`, the setter definition. `metric-constants.md:58` states the same thing outright | Research creates instances permanently below the teach threshold, so **no researched node is ever teachable**. The whole `[512, 1024]` interval is reachable only by god action 8 at `grant-mastery`, and those slide down from the first decay tick. `teachCost`, `teach-rate` and the strict-reduction arithmetic are all specified over an interval nothing occupies |
| `contracts.md` §2.9 | "the loader fails a set that declares one nothing reads, because an unread constant is a tuning knob that does nothing and the sweep that turned it would report the null result as a finding about the game" | **PARTIAL** | The guard is `content/src/god.ts:280–287`, checked against `REQUIRED_GOD_CONSTANTS` at `:61` — a **hardcoded frozen array**. It tests membership of a hand-maintained list, not that anything reads the value. Eight constants sit on that list with no live reader and are pinned in the baseline as `constantsBehindDeadCode` / `unconsumedConstants`: `legacyArchiveMaxTier`, `legacyArchiveNodes`, `legacyBaselineFavor`, `legacyBaselineMaterials`, `legacyBaselinePopulace`, `legacyHeadstartFraction`, `legacyReferenceTick`, `prestigeRetention` (all `coordination/src/god/constants.ts`). Their only reader is `legacyGrant` (`god/ascension.ts:512`), whose sole non-definition occurrence is the barrel re-export `god/index.ts:109`. `god/constants.ts:147` admits it in code: *"Provenance, not an input. No formula reads it"* | Exactly the failure §2.9 names, live. Eight authored knobs look turnable to a content author and turn nothing; a sweep varying `legacy-*` would report a null result as a finding about the game. The guard reports on the wrong input and cannot go red |
| `contracts.md` §1.4 / vision §6a; `invariants.md` INV-29 | Library depth feeds research rate — the knowledge-as-capital compounding loop | **PARTIAL** | The loop **is** built: `world-step.ts:724` calls `libraryCapital`, `:1580` reads `capital.depthFor(row.universityId)`, `:1592` applies `libraryRateMultiplier`, and `rules-world/src/universities/capital.ts:250` `emitCapital` emits `research-rate`/`teach-rate`/`scribe-rate`. It is keyed on the mage's `universityId`. The **only** production write of a non-zero `universityId` is `scenario/src/reference-universe.ts:695`, the founding cohort. `world-step.ts:1807` creates run-born mages with no university; `:1431` zeroes it on death. The only path that could affiliate one is `changeAffiliation` (`rules-world/src/mages/roles.ts:95`), reached only by `completeAffiliation` (`autonomy/affiliation.ts:58`) — **both pinned in the baseline**, the latter `unreached`. `world-step.ts:1540` mentions it in a comment only | The compounding loop binds **only for the founding cohort and decays to nothing as it dies**. Every mage born during a run is unaffiliated forever, so over a 200-year reference run §6a's loop is asymptotically off. INV-29 has nothing to measure past the first lifespan, and `hard-magic.md`'s flat 51-node plateau across strategies is explained by it. Universities are founded (`god/interventions.ts:781`) and never staffed |
| `contracts.md` §4.2 action 13; `invariants.md` INV-18 | Changing tradition is a god action; a tradition changes behaviour through its `store` hook | **PARTIAL** | The live path is `coordination/src/god/interventions.ts:900–925` (`traditionPlan`): it sets `traditionId`, zeroes `favor`, applies the shock. Its own comment at `:894` says *"Existing instances are not touched here."* `rules-magic/src/traditions/change.ts:149` `changeTradition` — which resolves every instance against the incoming `store` kind and destroys what it cannot hold — has **zero** production call sites (probe finds only the definition and the barrel `traditions/index.ts:55`). Pinned in the baseline with `RESOLUTION` | The knowledge price of a tradition change is never paid. Switching to `art-of-memory` (palace store, `lootable:false`) leaves grimoires and libraries the incoming hook cannot legally hold, so action 13 is strictly cheaper than designed and the universe ends in a state its own `store` policy forbids. INV-18's store-hook behaviour is unreachable through the action space. **Correction to `reachability-triage.md` §2:** the action does *not* "advertise a move the rules never make" — the move is made; the *consequence* is skipped |
| `invariants.md` §7 INV-33, INV-34, INV-36 | Mechanism: "Scheduled drift check", cadence **D** | **ABSENT** | `.github/workflows/` contains exactly one file, `ci.yml` (positive control: it exists and is non-trivial). Its `on:` block at `ci.yml:10–14` is `push` / `pull_request` / `workflow_dispatch` — **no `schedule:`, no cron**. `git ls-tree cf5a73a7 scripts` matches nothing for `drift`, `vision-audit` or `roadmap` | **INV-36 is self-falsifying**: its own disproof condition is "a claim whose named mechanism does not exist, with no marker saying so", and it is one. INV-33/34 are the only guards against `vision.md` §11 ↔ `openspec list` drift and against untraceable changes — the exact drift `CLAUDE.md` records as having cost two agents a full investigation each |
| `invariants.md` lines 7–10 | "**Nothing here is enforced yet.** No code exists. Every claim below is a commitment... machinery that must be *built*, not machinery that is running" | **PARTIAL** (stale, present tense) | False at this ref for most of §1–§3. INV-15's mechanism is `content/test/unit/primitive-contract.test.ts`; INV-1/INV-7's golden machinery runs via `scripts/regen-goldens.mjs:142`; §7's registry↔document check is `mc-harness/test/unit/metrics-registry.test.ts:44`, which reads `docs/design/contracts.md` directly | Errs toward **understating** coverage, so it is not itself dangerous — but it is the only blanket marker that could satisfy INV-36's "explicitly marked as not yet collected" escape hatch. Its falsity is what makes the row above bite |
| `contracts.md` §4.3 (amendment) | "An **event record** accompanies each observation": a class from a closed enumeration, the entity/content it concerns, and whether the event *ended* that thing. "emitted alongside the observation rather than on request" | **ABSENT** (disclosed) | `agent-api/src/outcome.ts:70` `OutcomeRecord` carries exactly `terminal`, `truncated`, `terminalReason`, `era`, `metricDeltas`. Probe for `EventRecord` / `EventClass` / `events:` across `agent-api/src` returns nothing | Three named consumers are unbuildable: `sound-design.md` §0.4's per-class density rule, §6.5's death→loss cue (needs the causal link and the last-copy *flow*), and §10's arrangement. `agent-interface` is task-complete (91/91) and did not deliver this |
| `contracts.md` §4.3, §4.4 | "**`AgentSession` exposes none of it**" — not `knowledgeCensus`, not `AgentView.raw`, not the `ExplainProjection` | **ABSENT** (disclosed, and accurate) | `agent-api/src/session.ts:217–247` exposes `reset`, `observe`, `legalActions`, `candidates`, `submit`, `status`, `outcome`, `accounting`, `illegalActionCount`, `rng`, `snapshotHash` — eleven members, matching the doc exactly. `knowledge-census.ts:438` and `explain.ts:64` are barrel-exported only (`index.ts:227`, `:202`) | Vessel and node identity are computed and unreachable through the only door a client has. §4.4's explain channel exists as a type with no production consumer, so vision §7's autonomy reads as randomness in any client |
| `contracts.md` §4.2 | Four actions unmasked during engagement (permit/forbid technique and form), with the inverse locking | **ABSENT** (disclosed, and *measured* not to bind) | The doc names it: `agent-api/src/mask.ts` returns `[1,0,0,…]` from a single early return in engagement mode. The doc's own instrumented measurement shows the engagement branch is evaluated **zero** times across four strategies — raids resolve inside one world step | Zero, today, and the doc says so. The real prerequisite is `runRaid` yielding to the agent between ticks. Listed so it is not re-derived a third time |
| `contracts.md` §4.2 | Edicts (5–7) during engagement: "They stay masked until someone rules" | **ABSENT** (deliberate open question) | Stated as unresolved in the document | None until raids yield to the agent. A recorded silence, not a defect |
| `contracts.md` §4.2 | The raid verb set — "not in this table", no action ids, and Vis collides with the shipped no-fourth-resource requirement | **ABSENT** (disclosed) | Stated as unresolved | `raid-engagement` §3's whole verb layer is unspecified; whoever writes it must first decide whether it extends §4 or forms a second space |
| `invariants.md` INV-29 | Mechanism: "**To be defined** — see Gaps". A joint runaway guard over the worship and knowledge-capital loops | **ABSENT** (disclosed) | Gaps §1. No metric in `mc-harness/src/metrics-registry.ts` measures the two loops jointly; `capitalSnowball` measures library depth alone | Vision §6a's "the balance harness must watch it specifically" is unmet. Compounded by the affiliation row above — the loop it would watch is currently off for all but the founding cohort |
| `invariants.md` INV-30 | Mechanism: "**To be defined** — see Gaps". A two-sided ascension band | **ABSENT** (disclosed) | Gaps §2. The *constants* exist — `metric-constants.md:117–118` pins `targetBandMin` 0.05 / `targetBandMax` 0.2 — but no release claim and no gate reads them | A two-sided band is the easy one to forget, because most balance metrics fail in one direction only |
| `invariants.md` Gaps §3 | Knowledge half-life needs a release claim | **ABSENT** (disclosed) | The metric is defined and pinned (`metric-constants.md:89–94`); no claim exists in `release-plan.md` | The number that says whether pillar 2 is true *in play* is collected and never asserted against |
| `invariants.md` Gaps §4 | Raid length distribution needs a *pacing* claim, not just INV-20's termination claim | **ABSENT** (disclosed) | `raidLengthDistribution` is pinned (`metric-constants.md:111–114`); no distribution claim | Every raid could terminate at the stability timer, satisfying INV-20, with the game unplayable |
| `numeric-integrity.md` Gaps §1 | A snapshot-graph walker for plain-object `Fixed` fields, where the value sentinel is structurally blind and `NaN` **survives** | **ABSENT** (disclosed) | The doc names the surface: `RaidState.portalStability`, `stabilityDecayPerTick`, `ActiveUpheaval.factor`, blessing/encouragement expiry ticks. Line 75: "does not exist yet" | The one surface where `NaN` propagates rather than coercing to 0 has no instrument. INV-37 is scoped to component storage and does not cover it |
| `numeric-integrity.md` Gaps §2 | ~56 `?? 0` defaults in the rules path; `?? NULL_ENTITY` and `require*` accessors proposed | **ABSENT** (disclosed) | Stated as ~two dozen per-site judgement calls | A legal integer written on purpose is invisible to both sentinels, so "0 because absent, intended" and "0 because a lookup missed" are indistinguishable to a reader and to both instruments |
| `numeric-integrity.md` Gaps §3 | A cheaper sentinel (sampling or build flag) so the long horizon can be watched at cadence **S** | **ABSENT** (disclosed) | The `Proxy` makes every component write an order of magnitude dearer; an attempt was stopped after 24 minutes | `balance-gate-ascension`'s 2400 ticks × 8 strategies have never been sentinel-checked. INV-37's coverage stops well short of the longest arm |
| `numeric-integrity.md` Gaps §4 | Hand the event loop back once a world year in the three suites that cannot answer their runner | **ABSENT** (disclosed, with the fix named) | Named files: `god-loop.test.ts`, `raid-engagement.test.ts`'s `playOnce`. The device already exists in `runLongReference` and `assembled-run-values.test.ts` | `npm run verify` chains with `&&`, so a load-induced worker timeout means **the three balance gates never run at all** — the part of the gate most worth having |
| `hard-magic.md` missing piece 2 | "The loss channel must be able to reach a last copy" so `libraryDependence` can leave zero | **ABSENT** (disclosed, measured) | ~2,900 instances over 51 nodes ≈ 55 copies per node at 2400 ticks | Insurance against nothing: the archivist strategy, dwarf `retention` and gnome `rediscoveryAffinity` all price a risk that cannot occur. `libraryDependence` is structurally pinned near zero |
| `hard-magic.md` missing piece 3 | Grimoire durability by species, so "it's dwarven, it'll outlive us both" is mechanical | **ABSENT** (disclosed, correctly ordered after piece 2) | The trait exists (`species.json` `scribeAffinity`); §1.5's `durability` field exists | Deliberately deferred — meaningless until destruction is possible |
| `contracts.md` §2.2 / vision §4b | Anti-requisites: `excludes` checked against a **mage's** held set; loader rejects one-sided edges, self-exclusion, and any `intellego` cell | **BUILT — never binds** | Loader: `content/src/load.ts:629` (self), `:656` (unknown cell), `:680–687` (missing mirror); diagnostic kinds `asymmetric-exclusion`, `self-exclusion`, `intellego-exclusion` at `diagnostics.ts:50–52`. Runtime: `rules-magic/src/instances/subsystem.ts:729` `#conflictingHoldings`, held locations only. **But** only 2 of 70 cells author `excludes` — `creo-ignem` and `creo-umbra` — and **neither carries `v1`** | The machinery is real and correct and the magnitude never binds in the shipped rectangle: the v1 twelve are `intellego`/`perdo`/`rego` × `mentem`/`terram`/`limen`/`nomen`, and `permits()` refuses both excluding cells unless a god permits `creo` **and** `ignem`/`umbra`. §4b is untested by any default run |
| `contracts.md` §1.1 | A terminated universe's "snapshot hash is unchanged" under a further step | **ABSENT** (disclosed, deliberate) | The doc states it plainly: component rows freeze, `step` advances the clock unconditionally, so the hash moves by exactly the clock forever. `agent-api`'s session is the layer that stops advancing | Bounded and argued: the alternative is a rules layer suppressing a core clock advance (the §5 rule-4 inversion) or a second `step`. Recorded so a reader does not "fix" it |
| `contracts.md` §3 `ward` / `direct-damage` | "summed per target per tick, then **one** ward factor applied to the sum"; `ward` multiplicative on the remainder, cap `fp(922)` | **SUPERSEDED** by `CastArbiter.applyWardOnce` | `primitives/src/stacking.ts:221` `applyWard` is unreached (**pinned in the baseline**) — but `rules-raid/src/arbitration.ts:570` `applyWardOnce` is the identical arithmetic (`floorDiv(rawDamage * (FP_ONE − ward), FP_ONE)`) and is **live** at `rules-raid/src/raid.ts:514` and `:995`. `observeWardApplication` (`:591`) is the clamp-free twin, live at `raid.ts:523`/`:538` | **None — and `reachability-triage.md` §2 is wrong here.** It claims `applyWard` is "the **only** implementation of ward prevention in the tree", verified by reading `primitives/` alone. Wiring it would duplicate a live path. Consequently `metric-constants.md:158`'s `saveAttribution` ward channel *can* move, contrary to what that triage row implies |
| `invariants.md` INV-1 / INV-7; §6 | Golden fixtures replayed; regeneration only by explicit command | **SUPERSEDED** by `replayAndLocate` | `sim-core/src/replay/replayer.ts` `replay` is unreached (**pinned in the baseline**) — but `replayAndLocate` (`:106`) is called by `scripts/regen-goldens.mjs:142` and by the golden harness at `sim-core/test/golden/harness.ts:135` | **None — and `reachability-triage.md` §2 is wrong here too.** It claims `regen-goldens.mjs` "mentions replay in prose and does not call it". It imports it at `:107` and calls it at `:142`. INV-1's named mechanism does run |
| `hard-magic.md` missing piece 1 | "Library depth must feed research rate — §6a's compounding loop... **genuinely unimplemented** and being built separately" | **SUPERSEDED** (doc is stale) | Built at this ref: `world-step.ts:724`, `:1580`, `:1592`; `rules-world/src/universities/capital.ts:250` | The prose is stale in the *safe* direction, but it points a reader at work already done. The live defect is one row up: the loop is built and its input (`universityId`) is never set for a run-born mage |
| `contracts.md` §1.6 / §2.10 | "No effect primitive may modify `portalStability`... Content declaring any stability increase or decay reduction is a **hard load failure**" | **BUILT** (by closure, not by a named check) | `content/src/load.ts:951–964`: an effect naming a primitive absent from `primitive.json` is an `unknown-reference` diagnostic, and the comment at `:962` states this is "what forbids a primitive that would modify portalStability (contracts.md §1.6)". §3 declares no stability primitive, and `content/test/unit/primitive-contract.test.ts` pins the set against the document. Decay ≥ 1 and the tick bound are enforced at `content/src/raid.ts:152–160` and `:236–254` | None. Worth knowing the guard is the *closed primitive set*, so it holds only as long as the registry↔§3 check does |
| `contracts.md` §1.1 | "The mask closes when the budget is spent, through `agent-api`'s candidate list rather than through a second copy of the rule" | **BUILT** | `agent-api/src/candidates.ts:226` `if (!canGrantFoundingKnowledge(state, universe)) return [];`, with the affordability half at `mask.ts:222–231`. The capability is live under a name the §1.1 prose does not use | None |
| `contracts.md` §2.7 | `carryingCapacity` takes a `subsistenceShortfallShare`, computed inside the births phase | **BUILT** | `coordination/src/world-step.ts:944` computes it and passes it at `:962` and `:1049`; consumed at `rules-world/src/economy/carrying-capacity.ts:331`. The doc's account of *why* it is computed in phase 8 matches the code | None. §2.7's narrative is accurate at this ref |
| `contracts.md` §2.8, §2.11 | god-cost: one record per action 0–15, permit cost == forbid cost, assign-role strictly cheapest non-zero. autonomy-weight: `target-bound-role` strictly below the other five bounds summed; no role-appeal row above it; ceiling ≥ the six bounds summed | **BUILT** | `content/src/god.ts:170` (duplicate action id), `:194–209` (`symmetric(1,2,…)`, `symmetric(3,4,…)`), `:211–215` (assign-role cheapest). `content/src/autonomy.ts:244`, `:269–272` (role bound below the sum), `:292–301` (ceiling) | None. Both sets of "not tuning hygiene, a design pillar" checks are real |
| `contracts.md` §2.4, §2.5, §7 | Species field list CI-enforced against the doc example; the hook-kind table compared character-for-character with `hooks.ts`; the metric registry's keys equal §7's list | **BUILT** | `content/test/unit/schema-doc-agreement.test.ts`; `content/test/unit/tradition-hooks.test.ts` against `content/src/hooks.ts`; `mc-harness/test/unit/metrics-registry.test.ts:44` reads `docs/design/contracts.md` directly. `metric-constants.md` is likewise bidirectionally checked by `mc-harness/test/unit/pinned-constants-doc.test.ts` | None. These are the corpus's strongest rows — documents that cannot go stale without the suite going red |

---

## The three worst

### 1. Nothing raises mastery, so no researched node is ever teachable

`contracts.md` §1.5 spends four paragraphs specifying the mastery scale: `fp(1024)` is full, teaching
below `TEACH_THRESHOLD` is forbidden, teaching between them "transmits at proportionally reduced
mastery", and the reduction is *strictly* floored at one unit so that degradation keeps compounding
down a chain. It is careful, it is correct, and it is written over an interval the simulation cannot
enter.

`DEFAULT_INITIAL_MASTERY` is `256` (`rules-magic/src/instances/constants.ts:50`) and
`DEFAULT_TEACH_THRESHOLD` is `512` (`:63`). The only production writer of the mastery column is
`instances/decay.ts:213`, and it lowers. So an instance created by research begins at half the teach
threshold and descends from there. The only way into `[512, 1024]` is god action 8 at
`grant-mastery`, and those instances start sliding on the next decay tick.

This is not a dead symbol — it is a live mechanism whose magnitude can never bind. Teaching is
implemented, tested and reachable, and it can only ever propagate knowledge a god personally handed
out. `knowledgeHalfLife` measures a decay with no counter-pressure; `speciesGridVersatility`'s
"qualified researcher" is pinned (`metric-constants.md:58`) as a *teachable window* precisely because
whoever pinned it hit this wall and documented it. **The most-read document in the project describes
the teaching economy in the present tense; a metric definition three files away records that it does
not exist.** That is the two-documents-disagreeing failure `CLAUDE.md` names, with the misleading one
being the one people read.

### 2. The §6a compounding loop is built, wired, and switches itself off as the founders die

Vision §6a calls knowledge-as-capital "the consequential one" of the two compounding loops, and
`invariants.md` INV-29 exists to stop it running away. The loop is genuinely implemented at this ref:
`world-step.ts:724` reads every library's shelves once per tick, `:1580` fetches
`capital.depthFor(row.universityId)`, and `:1592` stacks it through `libraryRateMultiplier` under
§3's `fp(4096)` cap. `hard-magic.md` still calls this "genuinely unimplemented", which is stale.

The live defect is the input. `universityId` is written non-zero in exactly one production place —
`scenario/src/reference-universe.ts:695`, the founding cohort. Mages born during the run are created
at `world-step.ts:1807` with no university and can never acquire one: the only function that
affiliates a mage is `changeAffiliation` (`rules-world/src/mages/roles.ts:95`), whose only caller is
`completeAffiliation` (`autonomy/affiliation.ts:58`), which has no production caller at all. Both are
pinned in the reachability baseline. `world-step.ts:1540` refers to `completeAffiliation` in a
comment, which is exactly how this class of gap survives a grep.

So the compounding loop is on for one generation and asymptotically off thereafter. Universities are
founded by `god/interventions.ts:781`, charged upkeep every tick against vellum
(`world-step.ts:748`), and staffed by nobody. This is the best available explanation for
`hard-magic.md`'s central measured result — `passive-control` and `archivist` both plateauing at
exactly 51.0 nodes known — and it means INV-29 currently has almost nothing to measure, while a
reader of §6a would believe the guard is the thing that needs building.

### 3. The guard against unread tuning constants reports on the wrong input

`contracts.md` §2.9 states that the loader "equally fails a set that declares one nothing reads,
because an unread constant is a tuning knob that does nothing and the sweep that turned it would
report the null result as a finding about the game."

The check is `content/src/god.ts:280–287`, and it compares the shipped ids against
`REQUIRED_GOD_CONSTANTS` — a hardcoded frozen array at `:61`. It answers "is this id on the list?",
never "does anything read this value?" Membership in a hand-maintained list cannot detect a reader
going away, which is exactly what happened: eight constants sit on that list today with no live
reader, all eight pinned in `scripts/reachability-baseline.json` as `constantsBehindDeadCode` or
`unconsumedConstants`. Their only reader is `legacyGrant` (`coordination/src/god/ascension.ts:512`),
whose sole non-definition occurrence in the tree is a barrel re-export at `god/index.ts:109`. The
code says so itself at `god/constants.ts:147`: *"Provenance, not an input. No formula reads it."*

This is the shape `CLAUDE.md` devotes a whole section to — a checker that answers confidently about
the wrong input. It is worse than the two above in one specific way: **it cannot go red.** The
mastery gap and the affiliation gap would each be caught by a sufficiently determined measurement.
This one is a guard whose stated purpose is to catch precisely the condition that currently holds,
and it passes. Anyone reading §2.9 would conclude the eight `legacy-*` knobs are load-bearing, and a
sweep arm that varied them would publish a null result about the game.

---

## Corrections to `reachability-triage.md`

That document is measured at `e2b89d8` and its own §5 warns that reading the symbol instead of the
capability got fourteen rows wrong on the first pass. Two rows in its §2 are still wrong at
`cf5a73a7`, both in the same direction — a live capability reported as a disabled subsystem:

- **`applyWard`.** §2 states it is "the **only** implementation of ward prevention in the tree —
  verified by reading `primitives/src/stacking.ts` and `ablation.ts`". `rules-raid/src/arbitration.ts:570`
  `applyWardOnce` is the same arithmetic and is live at `raid.ts:514` and `:995`. The verification
  searched two files in `primitives` for a capability that lives in `rules-raid`.
- **`replay`.** §2 states "`scripts/regen-goldens.mjs` ... mentions replay in prose and does not call
  it". It imports `replayAndLocate` at `:107` and calls it at `:142`; the golden harness calls it at
  `test/golden/harness.ts:135`.

Both are `SUPERSEDED`, not integration debt. Neither should be wired; each is a decision about which
of two implementations is canonical. The triage's §2 count of 46 load-bearing findings should read
**43**, and its §3 superseded count **16**.

A third row needs narrowing rather than correcting: **`changeTradition`** is described as an action
space that "advertises a move the rules never make". The move *is* made — `traditionPlan` writes
`traditionId`, zeroes favor and applies the shock. What is skipped is the instance resolution, which
is a `PARTIAL`, and a more serious one than a dead verb.

## Related

- `docs/design/reachability-triage.md` — the 125 findings and their categories; corrected above
- `scripts/reachability-baseline.json` — the pinned list, and the authoritative artifact at this ref
- `npm run check:reachability:ratchet` — exit 0 held, 42 drifted, 1 broken probe
