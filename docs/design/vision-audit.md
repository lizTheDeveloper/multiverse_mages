# Vision audit — what of `vision.md` is actually wired

> ## ⚠️ Staleness warning, added 2026-08-13
>
> **This document has generated at least two confidently-wrong findings by being read as current.**
> Every row is a measurement of the tree it was taken on, and several of its `[executed]` rows describe
> code that has since changed — in one case citing line numbers (`candidates.ts:82`,
> `feasibility.ts:79`) that no longer match the files.
>
> Three rows are retracted inline below. They are struck through rather than deleted, because the
> retraction is the useful part: each was true when measured, and each was repeated downstream as
> though it were true now.
>
> **Two docs on `main` contradicted each other.** `packages/scenario/test/unit/reference-long-run.test.ts`
> carries the same 1,308-books figure under the header *"This bullet list is a historical record, not
> the current measurement"*, naming `w7` as the fix — and `vision.md` marks it fixed in the past tense.
> This file asserted it in the present tense and tagged it `[executed]`, and this file is the one people
> read.
>
> **Before acting on any row here, re-verify against a ref** — `git show origin/main:<path>` — and check
> the cited line numbers still point at what the row claims. A finding about code is a finding about a
> ref.


*Workstream W12. Audited commit **`6e5ecee`** (`origin/main`, 2026-08-11). Branch
`w12/vision-audit`. Audit only: nothing under `packages/` was changed, no baseline and no golden
fixture was regenerated.*

> **Stale about the vision's text, not about the code — noted 2026-08-12 (W48).** This audit is a
> measurement of `vision.md` **as it read at `6e5ecee`**, and `vision.md` was amended the next day
> by W25's spec refresh and by the raid-engagement design, both landed in the same PR as this note.
> Four places therefore audit sentences that no longer exist:
>
> - **§11 — the finding was applied.** The Status column now carries task counts rather than
>   *"not started"*, so the three `contradicted` verdicts below describe a superseded table. The
>   counts here (`102/107` for `mages-and-species`, and the rest) were correct at `6e5ecee`; two of
>   `mages-and-species`'s boxes were deliberately unchecked afterwards and it now reads 100/107.
> - **§13 — partially closed.** W25 struck one open question — *"Which 3 techniques × 4 forms make
>   the v1 subset?"*, answered in 0.3.0 and then outgrown — and added six new ones.
> - **§3 — the row auditing *"Rules changes are a world-time action. Nothing … can be altered once
>   a raid has begun"* audits a rule that has been repealed.** See `raid-engagement.md`. Its
>   *evidence* is still accurate; the claim it is evidence about is gone.
> - **§12 — the row on grid cells beyond the v1 subset** audits a line that has since been struck
>   as in-scope.
>
> ~~**Nothing here about reachability has been superseded.** `REFERENCE_MECHANICS.raidEngagement` is
> still `false` on `main` and nothing opens a portal, so every `implemented-unreached` verdict below
> still holds against the tree.~~
>
> **That paragraph is itself superseded — retracted 2026-08-15, re-verified at `08ca5368`.**
> `REFERENCE_MECHANICS.raidEngagement` is `true` (`packages/scenario/src/executor.ts:121`),
> `packages/scenario/src/raids.ts:423` calls `openPortal`, `packages/scenario/src/reference-universe.ts:1007`
> supplies `portalTargets`, and `packages/scenario/package.json` lists `@mm/rules-raid`. The
> reachability verdicts below therefore do **not** hold wholesale, and **§8 has rotted at its root**.
> Findings are still not rewritten; rotted rows are marked in place.
>
> **The current statement of what of `vision.md` is wired is `docs/design/audit-vision.md`** (audited
> at `0940061`, 2026-08-14), with `docs/design/audit-sequence.md` for what has since been closed. Its
> caveat is carried here verbatim: **a row of this document not named in `audit-vision.md` has not
> been cleared — it has not been checked.** The 2026-08-15 pass marked the rows those two documents
> name and nothing else.

`CLAUDE.md` states the standard this document exists to enforce: *"Work that isn't traceable to a
section there is scope creep; sections that never ship are unmet promises."* This is the list of
unmet promises, with evidence for each, arranged so it can be ticked off.

---

## How a row was judged

### The reachability oracle

Every `wired` / `implemented-unreached` verdict is made against one definition, fixed before any
row was written:

> A claim is **reachable in a normal run** if it fires on a path starting at
> `makeReferenceExecutor()` (`packages/scenario/src/executor.ts` → `reference-universe.ts` →
> `coordination`'s `worldSystem` and `godSystems`), under **at least one** of the eight scripted
> strategies in `packages/mc-harness/src/strategies.ts` — `passive-control`,
> `uniform-random-legal`, `permissive-breadth`, `narrow-depth`, `denial-warden`, `archivist`,
> `portal-rush`, `worship-maximizer`.

Reachable only from a test file is **not** reachable. Reachable only behind a permanently cleared
mask bit is **not** reachable.

### Status vocabulary

| status | meaning |
|---|---|
| **wired** | implemented and reachable. The row says what observably changes. |
| **implemented-unreached** | the code exists and nothing in a normal run calls it. |
| **stubbed** | types, constants or data exist; no behaviour. |
| **absent** | nothing. |
| **contradicted** | the code does something the vision says it should not. |

### Proof marks

`[executed]` — proved by running the simulation and observing the effect.
`[read]` — proved by reading source and call sites.
`[baseline]` — proved by reading a *committed measurement* (a file under `balance/baselines/`),
which is a measurement someone else ran and committed, not one taken here.

---

## Summary count

| status | rows |
|---|---:|
| **wired** | 93 |
| **implemented-unreached** | 46 |
| **stubbed** | 6 |
| **absent** | 5 |
| **contradicted** | 8 |
| **total** | **158** |

Every row in every section table below carries exactly one of these five statuses and nothing
else; the counts are a mechanical tally of them.

Read the shape rather than the totals. The `wired` column is dominated by §5's knowledge
operations, §7's god verbs and §6's demographic layer — the parts that make a universe *run*. The
`implemented-unreached` column is dominated by §3, §8, half of §4a and the whole of §6a's capital
loop — the parts that make it a *multiverse* and the parts that make it *compound*. The game
today simulates a civilization in detail, and simulates neither a war nor a snowball.

A `wired` row is not praise and an `implemented-unreached` row is not blame. Almost every
unreached mechanism here is complete, tested and carefully argued; what it lacks is a caller.
The eight `contradicted` rows are the ones worth arguing about.

---

## The three execution proofs

Every `[executed]` row below traces to one of these. Scripts were run from a scratchpad, imported
the worktree's built `dist/`, and wrote nothing into the repository.

### Proof 1 — the 200-year reference long run, zero player input

`runLongReference({})` — `LONG_RUN_SEED` `0x00090001`, `LONG_RUN_OPTIONS` (`cohortSize: 12`,
`foundingMages: 1`, `foundingNodes: 6`), 2,400 world ticks. Final snapshot hash `3a00865d721b377c`.

| quantity | founding | tick 2400 |
|---|---:|---:|
| population | 216 | 18,417 |
| living mages | 6 | 72 |
| distinct nodes known | 6 | 51 |
| library depth (distinct nodes shelved) | 0 | **2** |
| grimoires | 0 | 1,308 |
| capital contribution (`fp`) | 0 | **32** (`0.03`) |
| materials remaining (`fp`) | 1,024,000 | **0** |
| subsistence shortfall share (`fp`, max 1024) | 0 | **986** |
| carrying capacity | — | 29,663 |
| mages by species (human, elf, dwarf, draconic, gnome, orc) | 1,1,1,1,1,1 | 10, 44, 6, 12, **0**, **0** |
| deepest tier by species | 0×6 | 5, 5, 5, 4, **0**, **0** |
| populace by occupation (laborer, scribe, student, soldier, idle) | — | 83, 17, 64, **0**, 18,253 |

Flow totals over the whole run: `researchCompleted` 3,578 · `lessonsTaught` **3,142** ·
`grimoiresScribed` 1,308 · `mageDeaths` 151 · `magesPromoted` 217 · `births` 49,153 ·
`populaceDeaths` 30,735 · `nodesLost` **2** · `goalSwitches` 10,253 · `effortsInFlight` 280,269.

### Proof 2 — all eight scripted strategies, 2,400 ticks each

Each strategy driven through `createSession` + `adaptAgentSession` + its own `policiesForRun`
policy, recording every mask bit that was ever set, every action submitted, and every intervention
the god system actually applied.

| strategy | ticks | ended | actions it got *applied* | god at the end |
|---|---:|---|---|---|
| `passive-control` | 2400 | still running | none | worship 4502, tier 4, favor at cap, **8,145,509 fp favor wasted** |
| `uniform-random-legal` | 806 | ascended | bless 25, assignRole 65, fund 33, encourage 27 (150 applied / **494 refused**) | tier 4 |
| `permissive-breadth` | 962 | ascended | permitTechnique 2, permitForm 10, encourage 3 (15 applied / **942 refused**) | tier 3 |
| `narrow-depth` | 525 | **stagnated** | forbidTechnique 2, forbidForm 3, encourage 3 (8 / 516) | tier 2 |
| `denial-warden` | 508 | **stagnated** | forbidTechnique 3, interdiction 3, revokeEdict 3 (9 / 493) | tier 2 |
| `archivist` | 1201 | ascended | bless 151, assignRole 19, **fundUniversity 283** (453 / 747) | tier 3, favor 10,550 — the only bot that spends |
| `portal-rush` | 962 | ascended | encourage 45 (45 / 916) | tier 3 |
| `worship-maximizer` | 1219 | ascended | bless 124 (124 / 856) | tier 4 |

**Never legal for any strategy at any tick.** The eight runs total **8,583 ticks** (only
`passive-control` reached the 2,400 cap; the other seven terminated between 508 and 1,219), so
that is the number of tick-observations behind the following three statements:

- **14 `openPortal`** — no strategy, ever. This is the finding the whole §8 column rests on.
- **13 `changeTradition`** — no strategy, ever. Priced at 65,536 `fp` against a tier-4 `favorCap`
  of 61,440; worship tier 5 is never reached.
- **7 `revokeEdict`** — legal only for `denial-warden` (from tick 22), because it is the only bot
  that issues edicts to revoke.

`declareAscension` first becomes legal at tick 961 for most bots (803 for `uniform-random-legal`,
1218 for `worship-maximizer`).

### Proof 3 — the knowledge-instance census at tick 2400

Direct read of the `knowledge-instance` component after the same 2,400-tick zero-input run.

| fact | value |
|---|---|
| founding grants | 6 instances, nodes `99, 104, 107, 112, 215, 219` |
| total instances | 4,092 |
| by location kind | **mind 2,784 · library 1,308 · grimoire 0 · palace 0** |
| distinct nodes with any instance | 51 |
| mean instances per node | **80.2** |
| nodes with exactly one instance | **0** |
| mastery at `fp(1024)` | **0** |
| mastery in `[512, 1023]` (teachable) | 52 |
| mastery below 512 | 4,040 |
| distinct nodes currently teachable | 10 — and **none of them is a founding grant** |
| universities | **one**, `capacity: 64`, `buildProgress: 1024` — the founding academy, and nothing else |

---

## Two of the brief's calibration examples do not survive execution

This audit was briefed with four verified examples setting the bar. Two hold exactly. Two do not,
and correcting them is more useful than repeating them.

**Teaching is wired, not contradicted.** The grep-level facts are right —
`DEFAULT_INITIAL_MASTERY` is 256 (`packages/rules-magic/src/instances/constants.ts:50`),
`DEFAULT_TEACH_THRESHOLD` is 512 (`:63`), and `setMastery`'s only rules-path caller
(`packages/rules-magic/src/instances/decay.ts:213`) lowers. The conclusion is not. The reference
universe's tradition is **True Naming**, selected by `scribingTraditionId`
(`packages/scenario/src/content-set.ts:191`) because it is the first shipped tradition whose
`store` hook admits written copies; its `acquire` hook sets `instanceMastery: 1024`
(`packages/content/data/tradition.json:21`). Every researched instance is therefore *born* at
`MASTERY_MAX` and is teachable immediately, and `transmittedMastery`
(`packages/rules-magic/src/instances/teaching.ts:125`) is lossless at the top. Measured: **3,142
lessons taught** in 2,400 ticks. The 256-vs-512 problem is real but confined to the `standard`
acquire hook, which only Vancian and Art of Memory use — and neither of those traditions is ever
active in a normal run. It is a latent defect in unreached code, not a live contradiction.

**Nothing is ever the last copy — but loss still fires, twice.** Mean 80.2 instances per node and
zero single-instance nodes at tick 2400, so the redundancy premise holds. But `nodesLost` totals
**2** over the run: loss fires early, while the universe is sparse, through ordinary mage death and
dormant decay. §5's *Loss* operation is therefore **wired**; what is unreached is the
*destruction* path — burning and looting — which is a different claim and is dealt with separately
below.

The other two examples hold on this commit and are re-verified: `advanceConstruction` has no
caller outside `packages/rules-world/test/`, and `portalTargets` is supplied by nothing.

---

## §1–§2 — The Fantasy, and the Design Pillars

| vision claim | § | status | evidence |
|---|---|---|---|
| "You never cast a spell and you never command a mage" | 1 | wired | Every `Plan.apply()` in `packages/coordination/src/god/interventions.ts` was inspected; the only mage field any intervention writes is `roleId` (`:698`) and a blessing's expiry (`:659`). No intervention writes a goal, a target or a position. [read] |
| "watch a civilization … discover it, teach it, write it down, forget it" | 1 | wired | Proof 1: 3,578 research completions, 3,142 lessons, 1,308 books, 2 nodes lost, in one unattended run. [executed] |
| "carry it through a portal into someone else's sky" | 1 | implemented-unreached | No portal ever opens. See §8. [executed] |
| "They have careers … and lifespans, and they die" | 1 | wired | 151 mage deaths and 217 promotions in the reference run; `killMage` routes every death (`packages/rules-world/src/mages/death.ts:193`). [executed] |
| "sometimes taking the only copy of something irreplaceable with them" | 1 | wired but vanishingly rare | 2 losses / 2,400 ticks; 0 nodes at single-instance redundancy by the end. The fantasy exists mechanically and is statistically almost never felt. [executed] |
| "you bless, you fund, you forbid, you grant founding knowledge" | 1 | wired | All four applied in Proof 2 (`bless` 151 by `archivist`, `fund` 283, `forbid` by `narrow-depth`/`denial-warden`, `grant` legal from tick 11–256). [executed] |
| P1 "Rules-setting is the core verb" | 2 | wired, but weak as a *verb* | Axis and edict actions are legal and applied — yet across 2,400 ticks the most any bot got applied was `permitForm` ×10 and `interdiction` ×3, against 400–900 refusals each. The verb exists; the god almost never lands it. [executed] |
| P2 "Knowledge is physical. It occupies minds and books and buildings" | 2 | wired (3 of 4 locations) | Proof 3: 2,784 mind, 1,308 library, 0 grimoire-in-hand, 0 palace. [executed] |
| P2 "It can be taught, copied … and lost" | 2 | wired | 3,142 lessons, 1,308 copies, 2 losses in the reference run. [executed] |
| P2 "It can be … stolen" | 2 | implemented-unreached | Theft lives entirely in `packages/rules-raid/src/arbitration.ts:358` and never runs. [read] |
| P3 "You are a god, not a general" | 2 | wired | As row 1. [read] |
| P4 "The numbers come first … balanced by machine play before it is made pretty" | 2 | wired | `npm run verify` runs three balance gates (`package.json:33`); no client package exists. [read] |

---

## §3 — The Portal Rule

| vision claim | § | status | evidence |
|---|---|---|---|
| "The host universe's ruleset governs all magic cast inside it, for both attacker and defender" | 3 | implemented-unreached | `CastArbiter#permitsNode` (`packages/rules-raid/src/arbitration.ts:421`) gates `resolveCast` (`:257`), `legalNodeMask` (`:235`), `passiveDefences` (`:315`) and `attemptTheft` (`:359`) through one host `RulesetSnapshot`. The implementation is careful and double-enforced. It has never executed: `REFERENCE_MECHANICS.raidEngagement = false` (`packages/scenario/src/executor.ts:95`). [read] |
| "a spell functions in a universe if and only if that universe permits its technique and its form, after edicts are applied" | 3 | wired *at world scale* | `permits()` (`packages/state/src/permits.ts:101`) is called every tick from `research.ts:307`, `teaching.ts:154`, `scribing.ts:158`, `decay.ts:202`, `library-depth.ts:78`. Forbidding an axis makes `research()` return `{reason:'forbidden-cell'}` and halts progress for every mage on that cell. [read] |
| "If both universes permit *Creo Ignem*, both sides throw fire in either realm" | 3 | implemented-unreached | There is one universe. [executed] |
| "Permitting something arms your defense *and* arms anyone who invades you" | 3 | implemented-unreached | The invader half has never run. [read] |
| "Prohibiting something is a real strategic option, not a penalty — it is a denial play" | 3 | wired, and it loses | `narrow-depth` and `denial-warden` are the two forbid-first bots and are the **only two of eight that stagnate** (ticks 525 and 508). Denial is a real option and currently a losing one. [executed] |
| "Rules changes are a world-time action. Nothing … can be altered once a raid has begun" | 3 | implemented-unreached | `packages/agent-api/src/mask.ts:18` masks every action but no-op during engagement. Engagement mode is never entered: the only caller of `requestEngagement` is `portalPlan`, behind the permanently cleared action-14 bit. The rule is correctly enforced against a state that provably never occurs. [executed] |

---

## §4 — Magic: The Grid

| vision claim | § | status | evidence |
|---|---|---|---|
| "Five techniques … Fourteen forms … 5 × 14 = 70 grid cells" | 4 | wired | `packages/content/data/cell.json` holds exactly 70 cells; `MagicGrid.from()` (`packages/rules-magic/src/grid.ts:201`) builds the full 70-cell addressing. [read] |
| "Each cell is a body of magic containing a graph of nodes — individual techniques gated by prerequisites" | 4 | wired | 300 authored nodes; prerequisite gating enforced by `unsatisfiedPrerequisite` (`teaching.ts:165`, `research.ts`). Deepest tier reached in the reference run: 5. [executed] |
| "Classical schools are regions of the grid … survives as vocabulary and as UI grouping" | 4 | stubbed | `classicalLabels` is in the schema (`packages/content/src/types.ts:70`) and populated on 41 of 70 cells, and `grid.ts:79` deliberately excludes it from `GridContent`. There is no client package to group anything. [read] |
| "Nineteen primary switches … each independently permitted or forbidden" | 4 | wired | Actions 1–4 via `axisPlan` (`packages/coordination/src/god/interventions.ts:363`); applied in Proof 2 by four different bots. [executed] |
| "A cell is available only if **both** its technique and its form are permitted" | 4 | wired | `permits()` does the AND with edict precedence (`packages/state/src/permits.ts:101`). [read] |
| "A **dispensation** permits one cell whose technique or form is otherwise forbidden" | 4 | wired | `edictPlan` (`interventions.ts:505`); `permissive-breadth` submits it 914 times. **Applied: 0** — every one refused as a vacuous edict on an already-permitted cell. Reachable in principle, never landed by the shipped pool. [executed] |
| "An **interdiction** forbids one cell whose axes are both permitted" | 4 | wired | `denial-warden` submits 490, **3 applied**; the applied ones flip `permits()` false and the next tick's `research()`/`teach()` refuse on that cell. [executed] |
| "The edict budget is small and grows with worship tier" | 4 | wired | `edictBudgetFor(tier) = min(1 + tier, EDICT_BUDGET_MAX)` (`packages/coordination/src/god/worship.ts:321`), `EDICT_BUDGET_MAX = 8` (`packages/state/src/enums.ts:54`). Observed budget rising 3 → 5 as tier rose 2 → 4. [executed] |
| "Nodes are expressed as compositions of ~15 tunable **effect primitives**" | 4 | wired (as content) | 16 primitives in `packages/content/data/primitive.json`; all 16 are referenced by at least one of the 300 nodes. [read] |
| `worship-yield` magnitude is consumed | 4 | wired | `yieldSources()` (`packages/coordination/src/god/system.ts:613`) → `favorRegeneration()` (`favor.ts:80`), every tick. The only primitive that is both reachable and driven by authored node content. [read] |
| `worship-yield` respects "a cell is available only if both its technique and its form are permitted" | 4 | **contradicted** | `yieldSources()` (`system.ts:613`) tests only `instanceCount(nodeId) > 0` — no `permits()` call and no location filter. A forbidden cell still pays worship for as long as any instance survives anywhere, including an inert copy on a shelf. `packages/rules-magic/src/dormancy.ts`'s own documented rule is that a dormant instance "MUST NOT contribute any primitive effect". [read] |
| `research-rate`, `teach-rate`, `lifespan` magnitudes are consumed | 4 | implemented-unreached *from nodes* | The multipliers are real and reachable (`packages/coordination/src/god/effects.ts:101–147` → `world-step.ts:812`), but their only inputs are god-blessing constants and research emphasis. `gatherEffects` (`packages/rules-magic/src/effects/gather.ts:96`) — the one function that turns a node's authored `effects[]` into a contribution — has **no non-test caller**. A node authored with `research-rate` does not speed research. [read] |
| `resource-yield`, `fertility`, `scribe-rate` magnitudes are consumed | 4 | implemented-unreached | `world-step.ts` hardcodes `resourceYieldBonuses: []` (`:637`), `fertilityBonuses: []` (`:957`), `scribeRateBonuses: []` (`:1098`) every tick. The stacking arithmetic runs; its input list is always empty. [read] |
| `direct-damage`, `ward`, `area-denial`, `blink`, `summon`, `knowledge-steal`, `portal`, `concealment` | 4 | implemented-unreached | All eight live only in `packages/rules-raid/src/arbitration.ts` (`COMBAT_PRIMITIVES`, `:71–87`) or `portal.ts:154`. `concealment` has no world-scale consumer at all. [read] |
| "*Rego Terram* letting universities go up faster is not a special case in code — it is a node weighted toward `build-rate`" | 4 | **contradicted** | `advanceConstruction` (`packages/rules-world/src/universities/construction.ts:219`), which is the function that takes `buildRateBonuses`, has no caller outside tests. Construction advances only through `fundPlan` (`interventions.ts:744`) adding a flat `fundProgress` constant per god payment — no labour, no materials, no `build-rate`. The mechanism the vision names as *not* being a special case is in fact the only thing that is not implemented. [read] |
| "v1 ships a playable subset of the grid — 3 techniques × 4 forms" | 4 | wired | Exactly 12 cells carry `"v1": true` — techniques {intellego, perdo, rego} × forms {mentem, terram, limen, nomen}, including `rego-limen`. [read] |

---

## §4a — Traditions

| vision claim | § | status | evidence |
|---|---|---|---|
| "A universe has exactly one tradition, chosen by the god" | 4a | wired at genesis, unreached in play | `UNIVERSE.traditionId` is set once (`packages/scenario/src/reference-universe.ts:233`). The god's verb for it — action 13 — was **never legal for any strategy in 2,400 ticks** (Proof 2). [executed] |
| "changing it is possible in world time only, at enormous cost" | 4a | implemented-unreached | `traditionPlan` (`packages/coordination/src/god/interventions.ts:852`) charges 65,536 `fp` against a tier-4 `favorCap` of 61,440. Tier 5 is never reached; the action's mask bit is never set. [executed] |
| "it throws the civilization into upheaval" | 4a | implemented-unreached, and thin if it fired | The only effect of `applyShock` is a temporary worship multiplier via `shockedTarget` (`packages/coordination/src/god/system.ts:350`). [read] |
| a tradition switch must be **total** — no instance stranded at a location the new `store` cannot hold | 4a | **contradicted** | `changeTradition` (`packages/rules-magic/src/traditions/change.ts:149`) implements totality and documents why it must. `traditionPlan` — the only path to action 13 — never calls it; `interventions.ts` imports only *types* from `@mm/rules-magic` (`:65`). [read] |
| the switch changes how the civilization *lives* | 4a | **contradicted** | `WorldStepDeps.store` and `.acquire` are resolved once from the genesis tradition (`packages/scenario/src/content-set.ts:264`) and closed over by `defineWorldSimulation` (`world-step.ts:342`) for the whole run. A successful `changeTradition` would flip a stored id and change nothing any mage does. [read] |
| Hook 1 **Acquire** — "how knowledge enters a mind" | 4a | wired | `deps.acquire` consumed by `research()` (`research.ts:230,300`) and `teachCost` (`gateway.ts:537`) every tick. [read] |
| Hook 2 **Store** — "where knowledge can live" | 4a | wired | `deps.store` consumed by `personalLocationKind`/`admitToStore` (`research.ts:296`) and scribing (`gateway.ts:710`). [read] |
| Hook 3 **Cast** — "how a held spell is expended" | 4a | implemented-unreached | `packages/rules-magic/src/traditions/cast.ts` is consumed only by `rules-raid/src/arbitration.ts:255`. [read] |
| Hook 4 **Cost** — "what casting takes out of the caster" | 4a | implemented-unreached | Same: `cost.ts` consumed only by `arbitration.ts:272`. [read] |
| "v1 ships three traditions" | 4a | wired as content, one of three ever active | All three validate in `tradition.json`. Only **True Naming**'s hooks are ever consulted: `scribingTraditionId` (`content-set.ts:191`) picks the first tradition whose store admits written copies, skipping Art of Memory. Vancian is never selected. [read] |
| Vancian — "casting expends the preparation until it is re-memorized" | 4a | implemented-unreached | `prepare`/`expendOnCast` (`cast.ts:99–197`) called only from `rules-raid` and `traditions/portal.ts`, both unreached. [read] |
| True Naming — "the knowledge instance *is* a name" | 4a | wired (pricing half only) | `trueNameAcquire` (`acquire.ts:132`) applies `researchCostMultiplier` 2048, `teachCostMultiplier` 512, `instanceMastery` 1024, and those numbers govern the whole reference run. [read] |
| True Naming — "vicious synergy with knowledge-theft and with the Nomen form" | 4a | implemented-unreached | `AcquirePolicy.stolenMastery` is documented as consumed by nothing (`acquire.ts:187`); theft is `rules-raid`'s. [read] |
| Art of Memory — "Unburnable, unstealable by looting, un-loanable, and it dies with the mage" | 4a | implemented-unreached | `palaceStore` (`store.ts:161`) implements all four properties correctly. Zero palace instances exist at tick 2400 (Proof 3), and no reachable path can create one. [executed] |
| "Across a portal, the hooks split by clock: acquire and store stay home; cast and cost are host-governed" | 4a | implemented-unreached | `hookFor`/`portalHookSet` (`traditions/hook-for.ts:109`) and `resolvePortalHooks` (`traditions/portal.ts`) are complete and called only from `rules-raid/src/raid.ts`. [read] |

---

## §5 — Knowledge Has a Location

| vision claim | § | status | evidence |
|---|---|---|---|
| `mind:<mageId>` — "fast to use, dies with the mage" | 5 | wired | 2,784 mind instances at tick 2400; destroyed on death via `destroyInstancesHeldBy` (`subsystem.ts:459`) ← `gateway.ts:761` ← `killMage` ← `world-step.ts:682`. [executed] |
| `grimoire:<itemId>` — "portable, lootable, burnable" | 5 | wired as *created*, unreached as *portable/lootable/burnable* | 1,308 books written. **Zero instances carry `locationKind: grimoire`** — a finished book is shelved immediately (`gateway.ts:700`), so every written instance is `library`. Nothing ever loots or burns one. [executed] |
| `library:<universityId>` — "a single high-value raid objective" | 5 | wired as a shelf, implemented-unreached as an objective | 1,308 library instances; `OBJECTIVE_KIND.library` exists (`rules-raid/src/objectives.ts:64`) and never resolves. [executed] |
| `palace:<mageId>` — "Only exists in an Art of Memory universe" | 5 | implemented-unreached | Zero palace instances; doubly unreachable, since even a successful tradition change would not re-resolve `deps.store`. [executed] |
| "A node **exists in your universe** while at least one instance does" | 5 | wired | `#existence` index in `subsystem.ts:349,380`; read by `knowledge.exists` and `isRediscovery` every tick. [read] |
| **Research** — "a mage derives a new node from prerequisites they hold. Slow." | 5 | wired | 3,578 completions in 2,400 ticks — roughly 1.5 per tick across ~80 mages, i.e. slow per mage. Nodes known 6 → 51. [executed] |
| **Teaching** — "mind → mind. Fast. Requires a living teacher and a student with prerequisites." | 5 | wired *because the reference tradition is True Naming* | 3,142 lessons. `teach()` (`teaching.ts:145`) ← `contributeTeaching` (`gateway.ts:618`) ← `GOAL.teach`/`GOAL.seekTeaching` (`world-step.ts:816`). **Caveat that is a latent defect:** under the `standard` acquire hook a self-researched instance is born at 256 and can never reach the 512 teach threshold, because the only rules-path `setMastery` (`decay.ts:213`) lowers. Vancian and Art of Memory both use `standard`. Teaching would be dead under either. [executed] |
| **Scribing** — "mind → grimoire. Slow; requires literate non-magical scribes and materials." | 5 | wired | 1,308 books; `scribe()` reached via `GOAL.scribe`; materials deducted at the desk (`world-step.ts`). 17 scribes alive at tick 2400. [executed] |
| **Scribing** — "Some species are far better at it" | 5 | wired | `scribeAffinity` from `species.json` feeds `scribingThroughput` (`packages/rules-world/src/universities/scribing.ts:84`). [read] |
| **Loss** — "the last instance is destroyed. The node leaves the universe." | 5 | wired but rare | `destroyInstance` emits a `KnowledgeLossEvent` only at `instanceCount == 0` (`subsystem.ts:378`). **2 losses in 2,400 ticks**, both via ordinary death/decay while the universe was still sparse. By tick 2400, 0 of 51 nodes have a single instance and the mean is 80.2, so loss is structurally out of reach for a mature universe. [executed] |
| **Loss** by *destruction* — burning a library, looting a grimoire | 5 | implemented-unreached | `destroyGrimoire`/`destroyLibrary` (`packages/rules-magic/src/instances/location.ts:111,126`) appear only in tests. Worse: `rules-raid`'s own `settleLibrary` (`consequences.ts:181`) does not call them — it destroys instances directly. So wiring raids would leave these two helpers orphaned anyway. [read] |
| **Rediscovery** — "at a cost far above learning it from a teacher" | 5 | wired | `effectiveRediscoveryMultiplier` with `REDISCOVERY_FLOOR = 3072` (3×) in `packages/primitives/src/rediscovery.ts:104`; reached via `GOAL.rediscoverNode`, gated on `wasEverKnown && !exists`, which the 2 losses make attainable. [read] |
| **Rediscovery** — "Gnomes are unusually good at this" | 5 | wired in content, **unobservable in practice** | `rediscoveryAffinity` 1792 for gnome vs 1024 human, 512 orc (`species.json:86`). But gnomes are **extinct by tick 2400** in the reference run (0 mages, deepest tier 0), so the bonus is never exercised by the species it belongs to. [executed] |
| **Theft** — "the `knowledge-steal` primitive, concentrated in *Intellego Mentem* and *Rego Nomen*" | 5 | implemented-unreached | `attemptTheft`/`theftMagnitudes` (`arbitration.ts:358`) complete, cell-gated through the same `permits()` choke point, never executed. [read] |
| "This is what makes losing hurt in a way that losing units never does" | 5 | implemented-unreached as *felt* | Two losses in two centuries, neither adversarial. The emotional claim rests on the destruction path, which is the unreached half. [executed] |

---

## §6 — Species

| vision claim | § | status | evidence |
|---|---|---|---|
| "Six playable species plus the non-magical populace" | 6 | wired | Six species in `packages/content/data/species.json`, all six seeded by the reference scenario. [executed] |
| tuned on **lifespan** | 6 | wired | `effectiveLifespan` (`world-step.ts:1000`) reads it in the mortality phase; 151 mage deaths in the reference run. [executed] |
| tuned on **curiosity** ("rate of self-directed research") | 6 | wired | `packages/rules-world/src/autonomy/terms.ts:223,227` ← `stepMageAutonomy` (`world-step.ts:501`). [read] |
| tuned on **depth ceiling** | 6 | wired | `world-step.ts:981` → `gateway.ts:465,992`, gating node tier. Observed ceiling reached: tier 5. [executed] |
| tuned on **learn rate** | 6 | wired | `gateway.ts:421,572` → `research.ts:232`, `mul(learnRate, researchRate)`. [read] |
| tuned on **retention** | 6 | wired | `world-step.ts:1021` → `decay.ts:74–91,205`, mastery decay each tick. [read] |
| tuned on **fertility** | 6 | wired | `world-step.ts:955` → `carrying-capacity.ts:439`; 49,153 births in the reference run. [executed] |
| tuned on **technique/form affinities** | 6 | ~~**stubbed**~~ **SUPERSEDED** | ~~`affinities` is authored per species and validated at load (`packages/content/src/load.ts:938`), and no file under `rules-magic/src`, `rules-world/src` or `coordination/src` reads it. Nothing multiplies research or casting by a species' affinity for a form.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** `packages/coordination/src/outlook.ts:67–71,123` resolves a species' `affinities` onto interned ids, `world-step.ts:900` passes `affinitiesOf` through, and `packages/rules-world/src/autonomy/outlook.ts:70–74` consumes it as target appeal. §6's seventh tuned trait is real. [read] |
| Human — "High curiosity, high fertility, broad average aptitude" | 6 | wired, one word inaccurate | curiosity 1152, fertility 1280, empty `affinities`. `mageAptitude` 512 is second-lowest of six, against a mean near 576 — "average" reads as typical and is not. [read] |
| Elf — "high depth ceiling, slow to learn. Deep specialists." | 6 | wired | depthCeiling 6, learnRate 640. 44 of 72 surviving mages at tick 2400 are elves — the long lifespan dominates the roster. [executed] |
| Dwarf — "exceptional retention and scribing" | 6 | wired | retention 1536, scribeAffinity 1792 (highest), the latter feeding `scribingThroughput` (`universities/scribing.ts:96`). [read] |
| Dwarf — "dwarven grimoires resist destruction" | 6 | implemented-unreached | The durability *is* computed and stored: `scribe()` (`rules-magic/src/instances/scribing.ts:186`) writes `durability = mul(SCRIBE_DURABILITY_BASE, scribeAffinity) + roll` onto the grimoire. Its only consumer is `grimoireBurnResistCap` in `rules-raid/src/consequences.ts:190`, which never runs. A real number nothing ever reads. [read] |
| Draconic — "highest depth ceiling, very slow learning, very low fertility" | 6 | wired | depthCeiling 7, learnRate 384, fertility 96 — lowest of six on two of three. [read] |
| Gnome — "Highest curiosity … poor retention" | 6 | wired | curiosity 1792, retention 512. [read] |
| Gnome — "**discovery** and *rediscovery* bonuses" | 6 | half stubbed | `rediscoveryAffinity` 1792 is wired (`world-step.ts:980` → `gateway.ts:420,579` → `research.ts:221`, applied as a divisor). There is **no separate discovery-bonus field**; the vision names two bonuses and the content carries one. [read] |
| Gnome — the rediscovery bonus in practice | 6 | wired, and never exercised by gnomes | The divisor is applied on a reachable path, so the row is `wired` — but there are **zero living gnome mages at tick 2400**, deepest tier 0. The species that owns the mechanic is extinct before it can use it. [executed] |
| Orc — "Low magical aptitude … high fertility" | 6 | wired | mageAptitude 192 (lowest) → `mages/promotion.ts:97`; fertility 1536 (highest). Zero living orc mages at tick 2400. [executed] |
| Orc — "high build-rate" | 6 | implemented-unreached | `laborAffinity` 1536 splits in two. The materials half is wired (`world-step.ts:633` → `economy/materials.ts:93`). ~~The construction half is not: `advanceConstruction` … has no non-test caller, and `world-step.ts:585` hardcodes `construction: 0`.~~ **STALE, retracted 2026-08-13**: both were wired on `main` on 2026-08-11/12; `world-step.ts` now passes `construction: construction.stoneOwed`. [retracted] |
| Orc — "martial capability" | 6 | absent, by recorded decision | `contracts.md:478` states it outright: *"a `martialAffinity` field is the obvious way to encode it. It is not here because soldier effectiveness is only observable inside a raid."* A documented deviation, not an oversight — but §6's table still reads as a present-tense claim. [read] |
| "Universities are generic capacity; specialization is emergent" — no declared field | 6 | wired | `packages/rules-world/test/unit/universities-no-specialization.test.ts` is a source scan for banned field names, run under `npm run verify`; `agent-api/src/layout.ts:595` confirms exactly four institution slots. [read] |
| specialization actually emerging | 6 | implemented-unreached; **the "nothing to derive" half is STALE — see the correction below** | `universityProfile`/`dominantCell` (`universities/profile.ts`) still has no non-test caller, and that half stands. ~~And there is nothing to derive: every scribe copies the same cheapest node, 2 distinct nodes across 1,308 books.~~ **Retracted 2026-08-13.** `w7/knowledge-capital` (`1acf8e5`, *"the novelty tie-break and the utility score, kept apart"*) replaced selection with `chooseTarget` → `compareAppeal`, a six-term utility argmax, and added `compareNovelty` (`autonomy/candidates.ts`) partitioning novel-before-held off a `libraryHolds` flag. `cheapest()` in `feasibility.ts` is the **affordability gate** — it implements `mage-autonomy/spec.md:44` verbatim — and never picks what is written. Re-measured live over 200 world years on five seeds: **mean 34.6 distinct nodes per library** (46/39/48/6/34), not 2. [executed, then retracted] |
| **scribes** "copy grimoires" | 6 | wired, and unable to regrow | 1,308 books written by 17 scribes. But the labour market's demand for scribes is hardcoded — `scribingQueueDepth: 0` (`world-step.ts:474`) — so the scribe cohort can only shrink from its seed, never be replenished by need. [executed] |
| **laborers** "build universities" | 6 | **STALE — retracted 2026-08-13** | ~~`advanceConstruction` has no caller outside `packages/rules-world/test/`.~~ It is called at `packages/coordination/src/world-step.ts:1148` via `advanceUniversities`, and has been since `9a3b6b5` (2026-08-12). The observation it supported may still hold — one university, 64 seats — but its cause is that `foundUniversity` is a **god action the reference run never takes**, not a missing function. [retracted] |
| **students** "become the next generation of mages" | 6 | wired | `promoteMaturedStudents` (`world-step.ts:877`) gates on `maturityMonths` and promotes `floor(count × mageAptitude / fp(1024))`; 217 promotions in the reference run, and the student cohort sits at exactly the academy's 64 seats. [executed] |
| **soldiers** "fight in raids without magic" | 6 | ~~implemented-unreached~~ **SUPERSEDED as to reachability** | ~~`rules-raid/src/combatants.ts:89` handles soldier cohorts as combatants. In a normal run there are no soldiers at all: `standingSoldierTarget: 0` (`world-step.ts:476`) and `soldier` is excluded from `SEEDED_OCCUPATIONS` (`reference-universe.ts:133`).~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** `packages/scenario/src/raids.ts` is the caller and runs an inbound arrival process. **All three of that row's cited line numbers had rotted** — which is the cheapest available rot signal and would have caught this without reading a line of logic. The headcount claim is a measurement at `6e5ecee` and is not restated here. [executed] |
| "A universe of pure archmages does not function" | 6 | absent | No population-mix cap, ratio or penalty exists. Worse, mages are invisible to the economy entirely: `subsistenceDemand(cohorts.totalCount())` (`world-step.ts:434,553`) sums only `POPULACE_COHORT`, so a mage eats nothing. The only friction is rate-limiting (aptitude and 64 seats), never a ratio penalty. [read] |

---

## §6a — The Economy

| vision claim | § | status | evidence |
|---|---|---|---|
| **Populace** — "Produced by fertility, consumed by everything" | 6a | wired | Fertility → `carrying-capacity.ts:439`, gated by a logistic brake against `K`. `K` is genuinely responsive: subsistence shortfall cuts it by up to 50% (`MAX_SUBSISTENCE_PENALTY = 512`), and funded seats raise it by up to 50%. [read] |
| populace responds to god play | 6a | wired, through two channels only | Not inert, contrary to a common reading: `K` moves with subsistence pressure and with `fundUniversity`'s seat bonus. What *is* severed is direct fertility manipulation — `deliverBirths` hardcodes `fertilityBonuses: []` (`world-step.ts:957`), so no node and no god verb can raise the birth rate. [read] |
| **Materials** — "Buildings consume it" | 6a | ~~implemented-unreached~~ **SUPERSEDED** | ~~Of the four claimants in `CONSUMPTION_ORDER` (`economy/materials.ts:111`), the one reachable `consumeMaterials` call hardcodes `construction: 0` and `libraryUpkeep: 0` (`world-step.ts:580–585`). `applyLibraryUpkeep` (`universities/capital.ts:271`) has no non-test caller. Two of four claimants never claim.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** `world-step.ts:1011` passes `construction: construction.stoneOwed`, and `applyLibraryUpkeep` is called at `world-step.ts:1737` over `capital.libraries`. All four cited line numbers had rotted. [read] |
| **Materials** — "so does every grimoire" | 6a | wired, and it binds | Scribing is paid at the desk against `materials.available()` (`gateway.ts:701`) and genuinely refuses on insufficient stock. This is the one materials claimant with teeth — and by tick 2400 the stock is **0** with a subsistence shortfall share of **986/1024**. The reference universe ends starving. [executed] |
| "*Rego Terram* and its neighbours move this number" | 6a | ~~stubbed~~ **SUPERSEDED** | ~~`materialsProduced` accepts `resourceYieldBonuses` and its one reachable caller passes `[]` (`world-step.ts:637`). No collector gathers node effects into that array.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** `world-step.ts:1114` passes `resourceYieldBonuses: economy.resourceYield`, gathered by `packages/coordination/src/universe-effects.ts` — which is the collector this row says does not exist. [read] |
| **Knowledge as capital** — "a university's output scales with the depth of its library" | 6a | ~~implemented-unreached~~ **SUPERSEDED** | ~~All four have zero non-test callers. `libraryContribution` is called once outside tests, at `scenario/src/long-run.ts:266`, purely to *report* the number.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** `packages/coordination/src/capital.ts` exists precisely to join the two halves `contracts.md` §5 rule 3 forbids either package from joining; `libraryCapital` is imported at `world-step.ts:183` and called at `:724`, `contributionFor` runs through `libraryRateMultiplier` (`rules-world/src/universities/capital.ts:184`), and `applyLibraryUpkeep` at `world-step.ts:1737`. [read] |
| "A deep library trains better mages, who research faster, who deepen the library" — the loop closes | 6a | ~~implemented-unreached~~ **SUPERSEDED** | ~~The other half does not: … No library-depth term enters any rate.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** a library-depth term does enter the rate: `world-step.ts:1580` reads `capital.depthFor(row.universityId)` and passes it, with the species `depthCeiling`, through `libraryRateMultiplier` → `capitalRateMultiplier` for `research-rate`, `teach-rate` and `scribe-rate` alike. The **measurement** in this cell is a statement about `6e5ecee` and is not restated; `vision.md` §13 gives the current series (`0 → 336` fp). [executed] |
| "That is a compounding loop, and it is the second one in the design after worship" | 6a | ~~implemented-unreached~~ **SUPERSEDED** | ~~the capital loop does not close … only one of the two exists in a normal run.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** both loops now run — see the row above. Whether the pair produces a runaway is a *balance* question and remains unmeasured: `capitalSnowball` is defined at `packages/mc-harness/src/metrics-registry.ts:271` and no committed baseline carries a value or a tolerance for it (`audit-vision.md` probe P2, reproduced here: 199 metric entries, 90 distinct, none outside the `reference*` prefix). [read] |
| "the balance harness must watch it specifically" | 6a | wired as a metric, ungated | `capitalSnowball` is registered and measured, and gated by no committed baseline. See §9. [read] |
| "burning a rival's library is not just a loss of stored spells, it is an attack on their rate of future production" | 6a | implemented-unreached, doubly | `settleLibrary` (`rules-raid/src/consequences.ts:181`) implements per-book durability rolls and never fires. And even if it did, the second clause is void in principle: there is no rate of future production for depth to attack. [read] |

---

## §7 — The God's Agency

Each of §4.2's sixteen actions, judged by three questions: is it implemented, is its mask bit ever
set, and does any shipped strategy get it *applied*?

| vision claim / action | § | status | evidence |
|---|---|---|---|
| 0 no-op | 7 | wired | Legal every tick. [executed] |
| 1 "permit a technique" | 7 | wired | `axisPlan` (`interventions.ts:363`); legal from tick 8; `permissive-breadth` got 2 applied. [executed] |
| 2 "forbid a technique" | 7 | wired | 2 applied by `narrow-depth`, 3 by `denial-warden`. [executed] |
| 3 "permit a form" | 7 | wired | 10 applied by `permissive-breadth`. [executed] |
| 4 "forbid a form" | 7 | wired | 3 applied by `narrow-depth`. [executed] |
| 5 "spend an edict as a dispensation" | 7 | wired, never landed | Legal from tick 6; `permissive-breadth` submits 914 and lands **0** (all vacuous). [executed] |
| 6 "spend an edict as an interdiction" | 7 | wired | 3 applied by `denial-warden` out of 490 submissions. [executed] |
| 7 revoke edict | 7 | wired | Legal only once an edict exists; 3 applied by `denial-warden`. [executed] |
| 8 "grant founding knowledge (the only way to introduce a body of magic nobody in your world knows)" | 7 | wired | `grantPlan` (`interventions.ts:589`) requires zero prerequisites and zero existing instances. Legal from tick 11. [executed] |
| 9 "bless a mage" | 7 | wired | `blessPlan` (`:639`) grants `blessResearchRate`/`blessTeachRate`/`blessLifespanMonths`; 151 applied by `archivist`, 124 by `worship-maximizer`. [executed] |
| 10 "assign a standing role" | 7 | wired | `rolePlan` (`:682`) writes only `MAGE.roleId`; cheapest action (256 `fp`), legal from tick 1; 65 applied. [executed] |
| 11 "fund a university" | 7 | wired, and it is the *only* way one is ever built | `fundPlan` (`:718`): slot 0 founds at `buildProgress: 0`, otherwise adds a flat `fundProgress`. `archivist` applied 283. [executed] |
| 12 "encourage a research direction" | 7 | wired | `encouragePlan` (`:776`), magnitude derived from remaining ticks; 45 applied by `portal-rush`. [executed] |
| 13 "rarely and ruinously — change the universe's tradition" | 7 | implemented-unreached | Never legal in any of the 8,583 tick-observations of Proof 2. [executed] |
| 14 open portal | 7 | ~~implemented-unreached~~ **SUPERSEDED** | ~~Never legal. `portalCandidates` returns `input.portalTargets ?? []` and nothing supplies it.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** `packages/scenario/src/reference-universe.ts:1007` passes `portalTargets: portalTargetIds(constants)`, and `packages/mc-harness/src/strategies.ts:1444–1445` carried the correction in-tree. `packages/server/src/index.ts:39` still declares the opposite for the multiplayer consumer — *"Nothing supplies `portalTargets`, so `openPortal` is permanently masked"* — so the two consumers differ here by declaration. [executed] |
| 15 declare ascension | 7 | wired | Legal from ~tick 961; taken by five of eight bots. [executed] |
| "Everything the player does costs **favor**, drawn from a regenerating pool whose regeneration scales with **worship**" | 7 | wired | `favorRegeneration` = base + worship × `favor-per-worship` (`favor.ts:80`); deducted atomically before apply (`interventions.ts:263`), ledger asserted every tick. [read] |
| "worship — the number and devotion of mages, universities, and populace revering you" | 7 | wired | `worshipTarget` (`worship.ts:126`) reads mages, blessed mages, completed universities and populace, each saturating independently. Observed split at tick 2400: mages 2283, universities 279, populace 1936. [executed] |
| "Growing your world grows your power, which means snowballing is a live risk" | 7 | wired, and currently *unbinding* | Favor sits at cap for six of eight bots; `passive-control` wastes **8,145,509 `fp`** of regeneration. The pool is not a constraint on a god who does nothing, and it is barely one on a god who acts. [executed] |
| "mages act on utility-scored goals shaped by species, age, personality, and their assigned standing role" | 7 | wired | `termsFor` (`packages/rules-world/src/autonomy/terms.ts:219`) computes all four terms every tick. 10,253 goal switches in the reference run. [executed] |
| role **researcher** | 7 | wired | `roleBiasFor` (`role-bias.ts:107`) biases research/rediscover up. Default role. [read] |
| role **professor** | 7 | wired | `role-bias.ts:119`: teach +384, seek-teaching +192. [read] |
| role **warden** | 7 | wired but inert | `role-bias.ts:113` biases ward-duty +384 — but `outlook.wardPressure` is hardcoded `0` (`packages/coordination/src/outlook.ts:115`), so the opportunity term never varies. [read] |
| role **raider** | 7 | wired but inert | `role-bias.ts:125` biases raid-readiness +384; `outlook.raidPressure` hardcoded `0` (`outlook.ts:116`). The role prepares for an event that cannot occur. [read] |
| "You never issue direct orders — including in raids" | 7 | wired | No intervention writes a mage's goal, target or position. [read] |

---

## §7a — Space and Scale

| vision claim | § | status | evidence |
|---|---|---|---|
| "At **world scale** there is no map … World-scale entities carry no coordinates at all" | 7a | wired | `assertNoWorldPositions` (`packages/state/src/components.ts:945`) throws at load if any world component declares an `x`/`y` field. Test-enforced. [read] |
| "At **raid scale** there is a real battlefield: positioned combatants, terrain, range, line of sight, and objectives that occupy locations" | 7a | implemented-unreached | `geometry.ts`, `spatial.ts`, `terrain.ts`, `navigation.ts`, `movement.ts` total 975 lines and never execute. [read] |
| "only engagement-mode state needs spatial indexing … the entity store's component model must not assume every entity is placed" | 7a | wired | `ENGAGEMENT_COMPONENTS` are the only components carrying `x`/`y` (`components.ts:951`). This is the one §7a claim that is both true and load-bearing today. [read] |

---

## §8 — Raids

> ### ⚠ Superseded at the root — 2026-08-15, re-verified at `08ca5368`
>
> **This section's founding fact is false, and it is the fact the whole section was built on.**
> `packages/scenario/package.json` lists `@mm/rules-raid`, `packages/scenario/src/raids.ts:423`
> calls `openPortal`, and `REFERENCE_MECHANICS.raidEngagement` is `true`
> (`packages/scenario/src/executor.ts:121`). Raids fire — from god action 14 and from an inbound
> arrival process — and the engine runs to termination.
>
> **Every row of the table below, and this section's contribution to §3, to §4a's cast/cost-hook
> verdicts, to §5's theft and destruction rows, and to ranked gap #1, is stated against a tree that
> no longer exists.** Most of the *conclusions* still hold — nothing yet fights and no raider comes
> home — but each holds for a different reason now, and the reason is the finding. Do not carry an
> `implemented-unreached` verdict out of this section.
>
> Current statement: `docs/design/audit-vision.md`'s §8 row and its ranked gap 3, *"§8's raids fire
> and nothing happens inside them"* — zero combat attempts on either path, withdrawal opening
> 2,418–3,518 ticks into raids that end by tick 149.

~~The whole section rests on one fact, so it is stated once: **`packages/rules-raid` is an orphan
package.** Neither `packages/coordination/package.json` nor `packages/scenario/package.json` lists
`@mm/rules-raid`, and every `from '@mm/rules-raid'` import in the tree is inside
`packages/rules-raid/test/`. 4,525 lines of source and 1,837 lines of test, zero lines reachable
from `makeReferenceExecutor()`. No raid has ever fired.~~

| vision claim | § | status | evidence |
|---|---|---|---|
| "Two clocks … Entering a raid **pauses world time for the two participating universes**" | 8 | implemented-unreached | `enterEngagement`/`leaveEngagement` (`packages/sim-core/src/clock.ts:106`) are correct and called from `step.ts:225` on `CORE_ACTION.enterEngagement`, which nothing requests. [read] |
| "**Uninvolved universes keep advancing**" | 8 | absent | No orchestrator anywhere holds or ticks more than one `SimState`. `contracts.md` §1.1 resolves the architecture (one universe per instance, snapshot exchange at portal open); the orchestrator that would realise it does not exist. [read] |
| "**Therefore raiding costs tempo, for both sides**" | 8 | implemented-unreached | `defenderFrozenWorldTicks` (`packages/mc-harness/src/metrics-telemetry.ts:179`) is summed by a real collector whose input is always `undefined`. [read] |
| "the balance harness must report tempo lost to inbound raids as a first-class metric" | 8 | implemented-unreached | `inboundRaidTempoLoss` registered (`metrics-registry.ts:322`), collector at `metrics-collectors.ts:763`, guard returns `mechanic-absent` every time. [read] |
| "**Entry** requires *Rego Limen* — the portal cell — and favor" | 8 | implemented-unreached | `rego-limen` is a v1 cell; `portalPlan` (`interventions.ts:898`) checks `permits()`, requires a living mage holding a portal-primitive node, and is priced. The mask bit is never set. [executed] |
| "**Arbitration:** host ruleset governs. Casting and cost follow the host's tradition; what a raider knows and how she carries it follow her own" | 8 | implemented-unreached | `packages/rules-raid/src/arbitration.ts` (476 lines) with a frozen `RulesetSnapshot` per §1.1 and a `forbiddenCastsBlocked` counter. Correct on reading; never run. [read] |
| "**Termination:** objective-based, with a portal stability timer that guarantees the raid ends" | 8 | implemented-unreached | `MAX_ENGAGEMENT_TICKS = 8192` and four `RAID_END_REASON`s (`termination.ts:75–90`), with a single-writer stability proof. [read] |
| "Attacker wins by destroying or looting a target — a library, a university, an archmage" | 8 | implemented-unreached | `OBJECTIVE_KIND` = library/university/archmage (`objectives.ts:64`); `settleLibrary` (`consequences.ts:181`) implements loot-vs-burn on a `grimoireBurnResistCap` roll. [read] |
| "Defender wins by holding until the portal collapses" | 8 | implemented-unreached | `RAID_END_REASON.portalCollapsed` (`termination.ts:79`). [read] |
| "**Stakes:** casualties are permanent" | 8 | implemented-unreached | `applyRaidOutcome` (`consequences.ts:86`) routes casualties through the ordinary world death path and strands raiders with a collapsed portal. [read] |
| "Theft is cell-gated, not universal — it lives in *Intellego Mentem* and *Rego Nomen*" | 8 | implemented-unreached | Both cells exist in content; the gate is the same `permits()` choke point. [read] |

---

## §8a — Ascension and Prestige

| vision claim | § | status | evidence |
|---|---|---|---|
| "**Ascension** is the terminal condition: a summit reached — the deepest node of a cell, or a civilization that has held its knowledge intact across enough eras" | 8a | wired, both paths | `qualifyingPath` (`packages/coordination/src/god/ascension.ts:121`) checks apotheosis then canon. Both fire: `balance/baselines/balance-gate-ascension-v1.baseline.json` records 12 apotheosis and 12 canon of 32 runs. [baseline] Five of eight bots ascended in Proof 2. [executed] |
| "The ascension condition must be reachable but not routine … Target band: 5–20%" | 8a | **contradicted** (conclusion stands; **evidence superseded**) | ~~The committed baseline records `ascensionRate` = **0.75**~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** `ascensionRate` appears in **no** committed baseline. Probe reproduced here over all four files under `balance/baselines/`: 199 metric entries, 90 distinct, and the set of ids outside the `reference*` prefix is empty. The conclusion is now carried by better evidence — `openspec/changes/discriminating-ascension/proposal.md`'s *"`uniform-random-legal` ascends 10 of 10 runs at 2400 ticks while every deliberate strategy ascends 0 of 10"* — and citing the old baseline would cite a file that no longer says it. [baseline] |
| ascension is a *summit*, i.e. a measure of play | 8a | **contradicted** | `POOL_BUILD_LIMITS['ascension-is-passive']` (`packages/mc-harness/src/strategies.ts:1066`) states it: path A gates on `worldTick ≥ 600` and `worshipTier ≥ 4`, and worship accrues from headcount whether or not the god acts, so *"the path opens by passive accumulation around tick 700 … at the same 51 nodes known that `passive-control` reaches doing nothing."* Confirmed: eligibility opened at tick 961 for `passive-control`, which had taken zero actions. Ascension currently measures the clock. [executed] |
| "**Prestige carries forward.** Ascending closes a universe and opens a new one, seeded with legacy drawn from what the last one achieved." | 8a | implemented-unreached | `legacyGrant`, `carriedPrestige` and `legacyBudget` (`ascension.ts:268–341`) are complete, tested, and have **zero non-test callers**. Nothing composes a next universe from a prior one. `reference-universe.ts:282` always seeds `prestige: 0`. This is an entire cross-run feature behind no call site. [read] |
| "Prestige must not compound without bound across runs" | 8a | stubbed | The `PRESTIGE_CAP` clamp and the loader-checked identity `cap × (1 − retention) == earn-max` are real; nothing ever exercises them. [read] |
| "Defeat is not the opposite of ascension … it stagnates, and stagnation is its own ending" | 8a | wired | `stepStagnation` (`ascension.ts:193`) with three independent triggers writes `TERMINAL_REASON.stagnation`. Observed for `narrow-depth` (tick 525) and `denial-warden` (tick 508). [executed] |
**Not a vision claim, recorded because a reader of §8a will meet it:** a terminated universe's
clock still advances. `frozenWhenTerminal` stops every component write, and `step` advances the
clock unconditionally because that is `sim-core`'s contract, so a finished run's snapshot hash
moves by exactly the clock. `packages/coordination/src/god/system.ts:36–51` records this as a
deliberate deviation from the ascension spec's scenario rather than papering over it, and
`agent-api`'s session refuses to `submit` to a terminated episode. [read]

---

## §9 — Balance Methodology

| vision claim | § | status | evidence |
|---|---|---|---|
| "**Monte Carlo sweeps.** Thousands of headless runs over parameterized universes, played by scripted agents." | 9 | wired | `balance/sweeps/balance-full.sweep.json` is 40 arms × 250 replicates = 10,000 runs. The three gate sweeps in `verify` are 200, 200 and 32 runs. [read] |
| "**The agent interface is the MC interface.**" | 9 | wired | `mc-harness` reaches the simulation only through `@mm/agent-api`; `executor.ts:288` uses `createSession` + `adaptAgentSession`. [read] |
| "**Balance regression gates.** … a change that moves a primitive's measured contribution beyond tolerance fails CI" | 9 | **contradicted** | All three balance gates *are* in `npm run verify` (`package.json:33`) — but every committed baseline gates only the ten `reference*` vital-sign metrics. **Zero of `contracts.md` §7's twelve metrics are gated by anything**, and `winRateByPrimitive` — the primitive-contribution metric this sentence is about — is `mechanic-absent`. No primitive's contribution is gated by CI. [read] |
| "**Humans last.**" | 9 | wired by omission | No client package exists. [read] |
| `illegalActionRate` — "fraction of agent actions rejected by the mask; a spec-clarity smell" | 9 | **contradicted** | Actions refused *inside* `coordination`'s dispatch land on the core's `illegalActionCount` and not on the session counters the metric reads. Measured on `uniform-random-legal`: **494 interventions refused, 76 session rejections reported**. The smell detector is deaf to the largest source of the smell. [executed] |

### The twelve `contracts.md` §7 metrics

All twelve are registered — a live conformance test (`packages/mc-harness/test/unit/metrics-registry.test.ts`)
parses §7's table out of the markdown and asserts bidirectional equality against
`BALANCE_METRIC_REGISTRY.ids`, with mutation tests proving it catches drift in both directions.
That check is real and works. What is missing is the other half: nothing gates the values.

| metric | registered | value in a normal run | gated in a committed baseline | threshold enforced |
|---|---|---|---|---|
| `winRateByPrimitive` | ✔ | `unavailable: mechanic-absent` | ✘ | ✘ |
| `timeToTierBySpecies` | ✔ | measured | ✘ | ✘ |
| `knowledgeHalfLife` | ✔ | measured | ✘ | ✘ |
| `libraryDependence` | ✔ | measured | ✘ | ✘ |
| `worshipSnowball` | ✔ | measured | ✘ | ✘ — §7 declares ≤ 0.35 and p95:p50 ≤ 3:1 |
| `capitalSnowball` | ✔ | measured | ✘ | ✘ |
| `raidLengthDistribution` | ✔ | `unavailable: mechanic-absent` | ✘ | ✘ |
| `ascensionRate` | ✔ | ~~measured — **0.75**~~ **not in any committed baseline at `08ca5368`** (see §8a) | ✘ | ✘ — §7 declares 5–20%; `metrics-registry.ts:318` pins the band as *"reported not enforced"* |
| `prestigeAdvantage` | ✔ | `unavailable: **no-observations**` | ✘ | ✘ — §7 declares < 60% |
| `illegalActionRate` | ✔ | measured | ✘ | ✘ |
| `inboundRaidTempoLoss` | ✔ | `unavailable: mechanic-absent` | ✘ | ✘ — §7 names a threshold and no number exists |
| `raidInitiationCost` | ✔ | `unavailable: mechanic-absent` | ✘ | ✘ |

**Exactly four report `mechanic-absent`**, all four gated on `raidEngagement`, hardcoded `false` in
`packages/scenario/src/executor.ts:95`. `prestigeAdvantage` reports `no-observations`, which is a
*different and better* answer — the mechanic exists, there are no mirrored pairs to compare. That
three-state honesty (`mechanic-absent` / `no-observations` / `censored`) is one of the codebase's
real virtues and should not be flattened.

**The `reference*` set is not a rival registry.** `packages/scenario/src/measures.ts:14` says so
explicitly: the ten `reference*` ids are scenario vital signs, deliberately prefixed so they cannot
collide with §7's names. The gap is not "only ten of twelve exist" — it is that the ten that are
gated are not the twelve that matter.

### The strategy pool

Proof 2 measured differentiation directly. Five of eight ascend (at ticks 806, 962, 962, 1201,
1219), two stagnate (508, 525), and `passive-control` runs past 2,400 without terminating. The
applied-action profiles differ substantially. So the pool is *not* eight copies of the same bot —
but `POOL_BUILD_LIMITS` (`strategies.ts:1056`) names three reasons the differences are smaller
than they look, and all three are first-party and measured:

- `ascension-is-passive` — winners "declare within a few dozen ticks of each other regardless of
  what they did beforehand."
- `noise-floor-submits-axis-actions-bare` — `uniform-random-legal` submits actions 1–7 with no
  parameter; all are refused *inside* `coordination`'s dispatch, landing on the core's
  `illegalActionCount` and **not** on the session counters `illegalActionRate` reads. So the noise
  floor reports a near-zero illegal rate while seven of its fifteen verbs do nothing. Confirmed:
  494 interventions refused against 150 applied. [executed]
- `starting-position-is-broke` — zero starting favor makes every bot a passive control until
  regeneration reaches its cheapest verb.

---

## §10 — Technical Shape

| vision claim | § | status | evidence |
|---|---|---|---|
| "TypeScript monorepo" | 10 | wired | `packages/*` workspace. [read] |
| "A pure, dependency-free simulation core — no I/O, no floats in the rules path, seeded PRNG only" | 10 | wired | `scripts/check-purity.mjs` enforces zero third-party runtime deps and the AGPL header across eight packages, and runs in `verify`. [read] |
| "consumed identically by the Monte Carlo harness …" | 10 | wired | `mc-harness` reaches the core only through `@mm/agent-api`. [read] |
| "… the Electron client, and the authoritative multiplayer server" | 10 | absent → **half superseded** | ~~**No `electron-client` package. No `pvp-server` package.** Both are `openspec list` rows with no tasks.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** `packages/server` exists and `openspec/changes/pvp-server` is **33/41**, so a second consumer does exist — and *"consumed identically"* is now falsifiable and false in one action bit: `packages/server/src/index.ts:39` masks `openPortal` permanently while `scenario` supplies `portalTargets`. The `electron-client` half holds, and holds harder than stated: that change has no `tasks.md` at all. [read] |
| "Determinism is enforced by golden-replay tests" | 10 | wired | Golden fixtures and `goldens:regen` exist; deterministic hash reproduced across runs of Proof 1 (`3a00865d721b377c`). [executed] |
| "Written so the hot loop could be ported to Rust" | 10 | stubbed | An aspiration with no artifact. [read] |
| "Python RL bridge over JSON-over-stdio, staged for later" | 10 | wired (interface only) | `packages/gym-bridge/python/mm_gym/*` plus the TS side; no training loop, no torch. Matches §12's "the interface ships; the training does not". [read] |
| "hosted on **Hetzner Cloud**, provisioned via the `hcloud` CLI" | 10 | absent from this repo | Mentioned only in `docs/` and in two OpenSpec proposals. No deployment code. [read] |

---

## §11 — Roadmap

The Status column is the single largest internal inconsistency in the vision document. `openspec
list` on the audited commit:

| §11 row | Status column says | `openspec list` + code | verdict |
|---|---|---|---|
| 0.3.0 `knowledge-model` | released | archived | consistent |
| 0.4.0 `mages-and-species` | in progress | 102/107 | consistent |
| 0.5.0 `agent-interface` | **not started** | **91/91 — Complete**; `packages/mc-harness/src` has 34 files | **contradicted** |
| 0.7.0 `god-agency` | **not started** | **59/75**; `packages/coordination/src/god/` runs every tick | **contradicted** |
| 0.9.0 `raid-engagement` | **not started** | **67/92**; `packages/rules-raid` is 4,525 lines | **contradicted** |
| 0.11.0 `gym-bridge` | in progress | **76/76 — Complete** | understated |
| 0.13.0 `electron-client` | proposal only | no tasks, no package | consistent |
| 0.15.0 `pvp-server` | proposal only | no tasks, no package | consistent |
| `metis-knowledge` | proposal only | 1/51 | consistent |

Anyone reading §11 today would materially underestimate how far the project has gone. The table's
own stated purpose — *"that agreement is how 'did the vision get built?' is answerable"* — is not
currently being served. Root `package.json` is `0.3.0`, which agrees with `CLAUDE.md`; the version
is not the problem, the Status column is.

---

## §12 — Deliberately Out of Scope, audited in reverse

| out-of-scope item | present in the tree anyway? |
|---|---|
| "Grid cells beyond the v1 subset (3 techniques × 4 forms)" | **Yes, as content.** All 70 cells and 300 nodes are authored; 12 cells carry `"v1": true` and 51 node references sit inside them. Whether pre-authoring is scope creep or schema exercise is a judgement, not a fact; the facts are recorded here. |
| "traditions beyond the three named in §4a" | No — exactly three in `tradition.json`. |
| "Animated RTS presentation, art pipeline, audio" | **Yes, substantially**: `packages/content/src/audio*.ts` (five files), `packages/content/data/audio/audio-cue.json`, `packages/content/schema/audio/`, `scripts/generate-audio.mjs`, `tools/audition/`, `docs/design/art-plan.md`, `docs/design/sound-design.md`. `npm run check:audio` is a step of `npm run verify`. |
| "Reinforcement learning *training*" | No — interface only, no training loop, no ML dependency. |
| "Ranked ladder, matchmaking beyond direct challenge, economy, monetization" | No. |
| "Player-authored techniques, forms, or primitives" | No. |

---

## §13 — Open Questions

| question | vision says | audit finds |
|---|---|---|
| "How many mages does a mature universe hold?" | answered — 88 mages / 18,713 populace | **Re-measured here: 72 mages / 18,417 populace at tick 2400.** Same shape, slightly lower; the doc's figure is not reproduced exactly on this commit and should be restated with its seed and options. The diagnosis holds: the roster is capped by the founding academy's 64 student seats, and no second university is ever founded. [executed] |
| "Do universities declare a specialization?" | resolved: no, generic capacity | Holds. `packages/rules-world/src/universities/profile.ts:23` carries a conformance check rejecting any specialization field. ~~The doc's own caveat — "resolved" is not "demonstrated" — is confirmed sharply: **library depth 2 distinct nodes against 1,308 books**, because `chooseTarget` orders candidates cheapest-first and every scribe copies the same cheapest thing.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** **this is the figure `CLAUDE.md` records as having cost two agents an investigation each.** It was retracted at the §6 "specialization actually emerging" row on 2026-08-13 and at neither of its other two occurrences; both are now marked. `vision.md` §13 gives the current figure — **15 books over a library depth reaching 36 distinct nodes**, with effective capital contribution a curve `0 → 336` fp. The caveat that survives is the narrower one: the reference universe holds **one** university, so what is shown is a library that specializes, not two that specialize differently. [executed] |
| pacing (world year in real seconds; raid length) | open | still open |
| prestige carry-forward | open, deferred to `god-agency` | still open — and now blocked behind an entire unreached subsystem |
| which 3×4 make v1 | deferred to `knowledge-model` | answered: intellego/perdo/rego × mentem/terram/limen/nomen, `rego-limen` included |
| edict budget size and scaling | open | partly answered in code: `min(1 + tier, 8)` |
| worship formula | open | answered in code (`worship.ts`), untuned |
| how much of the grid is mētis | open | still open; `metis-knowledge` is 1/51 |

---

## Where the code contradicts the vision

Eight table rows across seven findings, gathered here because they are the most valuable output of
this audit. A lagging feature is ordinary; a contradiction is a decision nobody made on purpose.

1. **`worship-yield` bypasses the legality gate.** `yieldSources()`
   (`packages/coordination/src/god/system.ts:613`) checks only `instanceCount(nodeId) > 0` — no
   `permits()`, no location filter. So a universe that *forbids* a cell still collects that cell's
   worship-yield for as long as any instance survives anywhere, including a copy sitting inert on a
   shelf. §4 says a cell is available only if both axes are permitted, and `dormancy.ts`'s own
   documented rule is that a dormant instance "MUST NOT contribute any primitive effect".
2. **Construction has no `build-rate`, no labour and no materials.** §4's worked example — "*Rego
   Terram* letting universities go up faster is not a special case in code" — describes a path that
   does not exist. `advanceConstruction` is uncalled; `buildProgress` moves only when the god pays.
   83 laborers were alive at tick 2400 and built nothing.
3. **`changeTradition` is not total.** `packages/rules-magic/src/traditions/change.ts:149`
   implements and documents the totality requirement; the only reachable path to action 13
   (`interventions.ts:852`) never calls it.
4. **A tradition change would change nothing anyway.** `deps.store` and `deps.acquire` are closed
   over the genesis tradition for the whole run. §4a calls the tradition "an identity decision";
   the reachable code makes it a label.
5. **Ascension is a clock, not a summit.** Measured 0.75 against §7's declared 5–20% band, and
   `passive-control` — which submits nothing but no-ops — becomes eligible at tick 961.
6. **The balance gate does not gate what §9 says it gates.** Three gates run in `verify`; none of
   them covers any of `contracts.md` §7's twelve metrics, and `winRateByPrimitive` is
   `mechanic-absent`.
7. **`illegalActionRate` under-reports.** Actions refused inside `coordination`'s dispatch land on
   the core's `illegalActionCount`, not on the session counters the metric reads. Measured:
   `uniform-random-legal` had 494 interventions refused and reported 76 session rejections.

## Where the vision contradicts itself, or the code's own comments

1. **§11's Status column.** Three of eight active changes are marked "not started" while being
   79%–100% complete. Detailed above.
2. **§8's "Uninvolved universes keep advancing" vs `contracts.md` §1.1's "one simulation instance
   holds one universe".** Not a true contradiction on inspection — §1.1 resolves it as a fleet of
   separate instances exchanging ruleset snapshots — but the vision never says so, and a reader
   arrives at §8 expecting a container the contracts forbid. §8 should cite §1.1.
3. **§6 gives orcs "martial capability" as a tuned trait; `contracts.md` §2.4 deliberately refuses
   to encode it.** `contracts.md:478` names the field it is not adding and gives the reason —
   soldier effectiveness is only observable inside a raid. This is a recorded, defensible
   deviation, but §6's table still reads as a present-tense description of a tuned species, and a
   reader has no way to know one of the seven listed traits does not exist.
4. **§4's "~15 tunable effect primitives" vs the shipped 16.** Trivial, and worth fixing so the
   number stops being approximate.
5. **§6's "A universe of pure archmages does not function" against a simulation in which mages eat
   nothing.** `subsistenceDemand` sums only `POPULACE_COHORT` (`world-step.ts:434`), so mages
   impose no economic cost at all. The sentence is not merely unimplemented — the current economy
   makes it structurally false.
6. **Stale first-party comments.** `executor.ts:88` and `metrics-collectors.ts:720` call
   `rules-raid` "a skeleton"; it is 4,525 lines of complete logic that is merely unlinked.
   `WORSHIP_MAXIMIZER`'s docstring (`strategies.ts:778`) says favor and worship "exist in the state
   schema but nothing in this build moves" — written hours before `god-agency`'s wiring landed.
   Both mislead a reader about *why* something does not work, which is worse than silence.
7. **`gatherEffects` and `dormancy.ts` describe themselves as the single legality point for effects
   and for dormancy, and neither has a non-test caller.** Every real consumer calls `permits()`
   directly. The documented interface is not the used one.

---

## The ten highest-impact gaps, ranked

Impact means: *how much of the game's stated fantasy is unavailable because of this.* Each row
gives the smallest change that would wire it and who should own it. Where a gap needs a design
decision, the decision is **named, not made**.

### 1. ~~No raid has ever fired — `rules-raid` is an orphan package~~

> **⚠ Superseded 2026-08-15, re-verified at `08ca5368` — the headline is false.** `scenario` depends
> on `@mm/rules-raid`, `raids.ts:423` calls `openPortal`, `reference-universe.ts:1007` supplies
> `portalTargets`, and `REFERENCE_MECHANICS.raidEngagement` is `true`. Both halves of the "smallest
> change" below have been taken: the package is linked and a portal target exists (a synthetic rival
> stand-in, `packages/scenario/src/rival-universe.ts`). **What is still unmet is everything §8 says a
> raid is *for*** — zero combat attempts occur on either path and no raider comes home. Current
> statement: `docs/design/audit-vision.md` ranked gap 3.

*Costs:* the whole of §3 and §8; §4a's `cast` and `cost` hooks; §5's theft and the destruction
path; §7's `raider` and `warden` roles; §7a's entire raid-scale half; four of §7's twelve metrics.
This one gap is responsible for roughly a third of every `implemented-unreached` row above.

*Smallest change:* two independent steps, neither sufficient alone. (a) Add `@mm/rules-raid` to
`coordination`'s dependencies and call its entry points from the god tick — mechanical. (b) Supply
`CandidateInput.portalTargets` — **this requires a design decision that is not this audit's to
make**: `contracts.md` §1.1 puts exactly one universe in a simulation instance, so a single-instance
Monte Carlo run has no second universe to point a portal at. The decision to name is *what a portal
target is in a solo run* — a paired-instance orchestrator exchanging snapshots per §1.1, a synthetic
target universe seeded by the scenario, or deferral to the multiplayer server. Until someone
chooses, (a) alone changes nothing.

*Owner:* **W8** (raids + destruction path) for (a). The decision in (b) belongs to whoever owns
`contracts.md` §1.1 — arguably W10 (server contracts), and it should be settled before W8 finishes.

### 2. ~~Laborers build nothing; a university exists only if the god pays for it brick by brick~~

> **⚠ Superseded 2026-08-15, re-verified at `08ca5368`.** This gap was **not** retracted alongside
> its own §6 table rows on 2026-08-13 and has read as live ever since. `advanceConstruction` is
> imported at `world-step.ts:148` and called at `:1302` with `buildRateBonuses: input.buildRateBonuses`
> fed from `economy.buildRate` (`:986`), which is node-authored `build-rate` gathered by
> `universe-effects.ts`; `world-step.ts:1011` charges `construction: construction.stoneOwed` against
> the stone stock. Labour, materials and `build-rate` are all involved. The committed
> `balance-gate-ascension-v1.baseline.json` `notes` field states it carefully because the sloppy
> version has misled several readers: *"`advanceConstruction` and `applyLibraryUpkeep` both have
> production callers in `world-step.ts` and run every tick, so construction is NOT inert."*

*Costs:* §6's "laborers build universities"; §6a's materials → buildings loop; §4's `build-rate`
worked example; and, downstream, the mage population itself — the zero-input reference run ends
with 72 mages because 64 student seats is the cap and no second university is ever founded. 83
laborers were alive at tick 2400 having built nothing in 200 years.

*Scope note, because it is easy to overstate:* a university **can** be built today — three of the
eight strategies fund one, `archivist` landing 283 payments — and completed seats do raise carrying
capacity through `seatsBonus`. So "seats stay at 64" is a fact about a god who does nothing, not a
universal one. What is universal is that **no laborer, no material and no `build-rate` is ever
involved**: `fundPlan` moves `buildProgress` by a flat constant paid in favor.

*Smallest change:* call `advanceConstruction` (`packages/rules-world/src/universities/construction.ts:219`)
from the world tick's work phase for every university with `buildProgress < fp(1024)`, feeding it
the laborer cohort and the materials stock it already takes as parameters. The function, its
material charging and its `buildRateBonuses` input all already exist.

*Owner:* **none of W6–W11.** This belongs to `mages-and-species` (0.4.0), the change that owns
`universities` and `economy`. It is the highest-impact gap that currently has no assigned
workstream.

### 3. ~~The knowledge-capital loop does not compound~~

> **⚠ Superseded 2026-08-15, re-verified at `08ca5368`.** The loop closed, and the fix was not the
> one proposed below: rather than multiplying `MAGE_MONTHS_PER_TICK`, `packages/coordination/src/capital.ts`
> was added as the coordinating layer that joins the two halves `contracts.md` §5 rule 3 forbids
> either package from joining. `libraryCapital` is called at `world-step.ts:724`; `world-step.ts:1580`
> reads `capital.depthFor(...)` and routes it through `libraryRateMultiplier`. Whether it *runs away*
> is a separate, still-unanswered question — `capitalSnowball` is defined and gated on nothing.

*Costs:* §6a's second compounding loop, which the vision calls "the consequential one". A deep
library does not train better mages, so nothing feeds back. Measured: capital contribution 32 `fp`
(0.03) at tick 2400, against a library of 2 distinct nodes.

*Smallest change:* multiply `MAGE_MONTHS_PER_TICK` (`packages/coordination/src/world-step.ts`) by a
library-depth term for an affiliated mage. The doc comment on that constant states the absence is
deliberate — *"a placeholder factor here would be a balance number nobody authored sitting in the
middle of the one loop every later measurement runs through"* — so the blocking decision is **what
the multiplier's shape and cap are**, which is a balance decision, not a wiring one. `capital.ts`'s
`libraryContribution` already exists to supply the term.

*Owner:* **W7** (knowledge-capital loop + teaching).

### 4. ~~Only one of sixteen effect primitives actually reads its authored magnitude~~

> **⚠ Superseded 2026-08-15, re-verified at `08ca5368` — but only partly, and the residue is the
> useful part.** `gatherEffects` **is** called: imported at `packages/coordination/src/universe-effects.ts:123`,
> called at `:330`. It does not appear among the 125 pinned findings of
> `scripts/reachability-baseline.json`, which is the independent confirmation. **Three of sixteen
> primitives are node-driven now, not one:** `resource-yield` and `build-rate` through
> `ECONOMIC_PRIMITIVES` (`universe-effects.ts:183`) into `world-step.ts:1114` and `:986`, plus
> `worship-yield`, which still bypasses `permits()` (contradiction 1 stands). Still hardcoded empty
> at this ref: `fertilityBonuses: []` (`world-step.ts:1849`) and `scribeRateBonuses: []` (`:2017`).
> The eight raid-locked primitives are still raid-locked. **The instruction below is now the wrong
> one** — the gatherer is wired; what is missing is the two remaining bonus lists.

*Costs:* §4's "Balance still runs on primitives" and the entire content-drives-behaviour promise.
`gatherEffects` (`packages/rules-magic/src/effects/gather.ts:96`) — documented as the single
legality point for turning a node's `effects[]` into a contribution — has no non-test caller. Eight
primitives are raid-locked; three (`resource-yield`, `fertility`, `scribe-rate`) have their bonus
lists hardcoded empty in `world-step.ts`; three (`research-rate`, `teach-rate`, `lifespan`) are
reachable but driven only by god-blessing constants. Only `worship-yield` is both reachable and
node-driven — and it is the one that bypasses `permits()` (contradiction 1).

*Smallest change:* call `gatherEffects` once per tick per consuming subsystem and pass its result
into the three hardcoded-empty bonus lists. No new arithmetic; the stacking, caps and clamp
counters all work already.

*Owner:* **none of W6–W11 cleanly.** It sits on the `coordination` ↔ `rules-magic` seam and touches
`world-step.ts`, which W7 is already in. Suggest folding into W7 with an explicit hand-off note.

### 5. Prestige never carries forward — the meta-game does not exist

*Costs:* the whole second half of §8a. "Ascending closes a universe and opens a new one, seeded
with legacy" is the resolution the vision offers to its own persistent-world tension, and no code
composes a next universe from a prior one's result.

*Smallest change:* a run driver that reads `prestigeEarned` from a terminated episode and passes it
through `carriedPrestige` → `legacyGrant` into the next `buildReferenceState`. All three functions
exist, are tested, and have zero callers. The **decision to name** is where that driver lives —
inside `mc-harness` (so sweeps can measure `prestigeAdvantage`) or above it — since a cross-episode
driver is not obviously part of a per-run executor.

*Owner:* **W6** (ascension predicates), as the natural continuation.

### 6. Ascension measures the clock, not play

*Costs:* §8a's "reachable but not routine" and, transitively, every Monte Carlo comparison between
strategies — if all winners declare within a few dozen ticks of each other, a sweep cannot
attribute a win to a strategy. ~~Measured 0.75 against a declared 5–20% band.~~ **SUPERSEDED 2026-08-15, re-verified at `08ca5368`:** the
0.75 came from a committed baseline that no longer carries `ascensionRate` at all (see §8a). The
conclusion stands on `openspec/changes/discriminating-ascension`, which is **0/38** and carries no
roadmap row.

*Smallest change:* none that is purely mechanical. The gate is `worldTick ≥ 600 ∧ worshipTier ≥ 4`,
and worship accrues from headcount whether or not the god acts. Making it depend on play is a
**design decision** — which quantity a summit should measure — and this audit does not propose one.
What can be done mechanically today is to *enforce* the band: make `ascensionRate` a gated metric
so the 0.75 fails CI rather than sitting in a baseline note.

*Owner:* **W6**, which is already in the ascension predicates.

### 7. A tradition is a label

*Costs:* §4a in its entirety as a *decision*. The god's one identity choice is never legal (Proof
2), and if it were, it would flip a stored id, apply a temporary worship penalty, and leave every
mage acquiring and storing knowledge under the genesis tradition forever. Vancian's preparation cap
and Art of Memory's palace are unreachable by construction.

*Smallest change:* two, both small. (a) Re-resolve `deps.store` and `deps.acquire` from the
universe's current `traditionId` per tick instead of closing over the genesis one. (b) Have
`traditionPlan` call `changeTradition` (`packages/rules-magic/src/traditions/change.ts:149`), which
already implements the totality the switch requires. Pricing action 13 so it is ever affordable is a
separate **balance decision** — 65,536 `fp` against a 61,440 `fp` tier-4 cap is currently
unreachable by arithmetic, and whether that is intentional ("tier 5 only") should be stated.

*Owner:* **none of W6–W11.** Belongs to `knowledge-model`/`god-agency` jointly. Flag it.

### 8. The balance gate gates none of `contracts.md` §7

*Costs:* §9's central promise. Three gates run in `verify` and all three cover only the ten
`reference*` vital signs. Five §7 metrics carry declared thresholds (`worshipSnowball` ≤ 0.35,
`ascensionRate` 5–20%, `prestigeAdvantage` < 60%, `inboundRaidTempoLoss`, and the p95:p50 ratio) and
none is enforced anywhere.

*Smallest change:* add the eight §7 metrics that currently *measure* to a committed baseline with
their declared tolerances. The registry, the collectors, the baseline format and the gate command
all exist; this is a baseline file plus a `--baseline` argument. The four `mechanic-absent` metrics
stay honest as they are.

*Owner:* **none of W6–W11.** It is `agent-interface`'s (0.5.0), which `openspec list` reports
complete — so it needs a follow-up change rather than an in-flight workstream.

### 9. Scribing copies the cheapest thing, so no library ever differentiates

*Costs:* §6's "specialization is emergent" and §6a's "burning a rival's library is an attack on
their rate of future production". ~~Measured: **2 distinct nodes across 1,308 books**. There is
nothing distinctive to burn.~~

> **⚠ Superseded 2026-08-15, re-verified at `08ca5368` — the third and last occurrence of the
> figure `CLAUDE.md` names as having cost two agents an investigation each.** Retracted at the §6
> "specialization actually emerging" row on 2026-08-13; the §13 row and this gap were left asserting
> it in the present tense for four days. `vision.md` §13 gives the current figure: **15 books over a
> library depth reaching 36 distinct nodes**, after `compareTargets` was made to order scribing
> candidates novel-first and library upkeep was charged per instance while capital pays per distinct
> node. The surviving gap is narrower and is stated in `vision.md` itself: the reference universe
> holds one university, so **several** libraries that differ from each other is still not
> demonstrated.

*Smallest change:* `chooseTarget`/`compareTargets` (`packages/rules-world/src/autonomy/select.ts:107`)
orders candidates cheapest-first, node id second, for every knowledge goal. Adding any
library-aware term — "prefer a node this shelf does not hold" — would break the degeneracy. **The
tie-break rule is a design decision**; the audit names it rather than choosing it.

*Owner:* **W7**, alongside the capital loop, since the two are the same feedback path.

### 10. Two species go extinct and one primitive of the economy is inert

*Costs:* §6's species table as a *tuned* object. Gnomes and orcs both reach **zero living mages and
tier 0** by tick 2400, so gnomish rediscovery — a named vision mechanic — is never exercised by
gnomes, and orcish build-rate has nothing to build (gap 2). Meanwhile materials end at **0** with a
subsistence shortfall share of **986/1024**: the reference universe spends its last decades
starving, and nothing in the observation or the metric set flags it.

*Smallest change:* the extinction and the starvation are two findings, not one fix. The mechanical
piece is a metric: the shortfall share is already computed and reported in `WorldStepReport`, and
promoting it to a collected metric would make the condition visible. Why gnomes and orcs die out is
a **balance question** requiring a sweep, not a code change.

*Owner:* metric — the `agent-interface` follow-up above. Balance — **none of W6–W11**; it needs the
species tuning pass that `mages-and-species` owns.

---

---

## The tick-off list

Copy this into whatever tracks work. Tick a box only when the claim it names is `wired` under the
oracle at the top of this document — not when a function exists.

**Gaps**

> **⚠ Three boxes were ticked by the tree and not by anyone here — 2026-08-15, re-verified at
> `08ca5368`.** They are marked `[x]` below with the call site that closes them. **G1 is deliberately
> *not* ticked** — half of it is closed and the tick-off rule at the top of this list is that a box is
> ticked when the claim it names is wired, not when a function exists. Every unmarked box other than
> G1 was **not** re-checked in that pass and is not evidence of anything.

- [ ] G1 — `@mm/rules-raid` linked into a normal run, and one raid fires end to end · **the linkage half is closed** (`scenario/package.json`; `raids.ts:423` calls `openPortal`); **the claim is not** — zero combat attempts on either path and no raider comes home, so nothing goes end to end. See `audit-vision.md` ranked gap 3
- [x] G2 — `advanceConstruction` called from the world tick; laborers and materials build universities · `world-step.ts:1302`, with `construction: construction.stoneOwed` at `:1011`
- [x] G3 — library depth multiplies a research/teach/scribe rate; the capital loop closes · `capital.ts` → `world-step.ts:724`, `:1580`
- [x] G4 — `gatherEffects` called; a node's authored primitive magnitude moves a number · `universe-effects.ts:330`; `resource-yield` and `build-rate` only — `fertilityBonuses` and `scribeRateBonuses` are still `[]`
- [ ] G5 — prestige carried from a terminated run into the next universe · **W6**, blocked on a "where does the driver live" decision
- [ ] G6 — `ascensionRate` gated in CI against §7's 5–20% band · **W6**
- [ ] G7 — `deps.store`/`deps.acquire` re-resolved from the live `traditionId`, and `traditionPlan` calls `changeTradition` · **unowned**
- [ ] G8 — the eight measurable §7 metrics committed to a baseline with their declared tolerances · **unowned** (`agent-interface` follow-up)
- [ ] G9 — scribe target selection has a library-aware term; a library differentiates · **W7**, blocked on a tie-break decision
- [ ] G10 — subsistence shortfall promoted to a collected metric; species survival re-tuned · **unowned**

**Contradictions to resolve**

- [ ] C1 — `worship-yield` gated by `permits()` like every other primitive
- [ ] C2 — §4's `build-rate` example either implemented or removed from the vision
- [ ] C3 — `traditionPlan` calls `changeTradition` (totality) — same fix as G7
- [ ] C4 — a tradition change changes how mages acquire and store — same fix as G7
- [ ] C5 — ascension eligibility depends on something the god's play moves
- [ ] C6 — §9's balance-gate sentence made true, or narrowed to what CI actually gates
- [ ] C7 — dispatch-level refusals counted by `illegalActionRate`

**Documentation corrections**

- [ ] D1 — §11's Status column brought back into agreement with `openspec list`
- [ ] D2 — §8 cites `contracts.md` §1.1 for what "uninvolved universes keep advancing" means
- [ ] D3 — §6 marks orc martial capability as deferred per `contracts.md` §2.4
- [ ] D4 — §4's "~15 primitives" corrected to 16
- [ ] D5 — §13's mage-population figure restated with its seed and options (this audit measures 72/18,417, not 88/18,713)
- [ ] D6 — stale "skeleton" comments in `executor.ts` and `metrics-collectors.ts` replaced with "unlinked"
- [ ] D7 — `WORSHIP_MAXIMIZER`'s docstring updated; favor and worship do move now

---

## What this audit did not do

- It did not run `npm run verify` end to end, and did not regenerate any golden fixture or balance
  baseline.
- It read `balance/baselines/balance-gate-ascension-v1.baseline.json` as evidence; that is a
  committed measurement taken by someone else, marked `[baseline]` rather than `[executed]`.
- Proofs 1–3 were taken at a single seed (`0x00090001`). Every number attributed to them is a
  measurement of one run, not a distribution. The qualitative facts they establish — an action is
  never legal, a location kind is never created, a function is never called — do not depend on the
  seed. The quantitative ones do.
