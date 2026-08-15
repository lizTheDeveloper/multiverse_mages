# Vision audit — the unmet promises of `vision.md`

*Workstream **W194**. Audited ref: **`0940061`** (`origin/main`, 2026-08-14, "Ratchet the
reachability check, and triage its 125 findings (#167)"). Branch `w194/audit-vision`. **Audit
only** — nothing under `packages/` was changed, no baseline and no golden fixture was regenerated,
`goldens:regen` was not run.*

`vision.md`'s own header sets the standard this document enforces: *"anything described here that
never ships is an unmet promise."* This is that list.

## How to read a row, and how it was judged

Four states, and they are not the five `vision-audit.md` used. **Do not map
`implemented-unreached` onto any of them** — most of what that status covered at `6e5ecee` has
since become either `PARTIAL` (a caller appeared but the mechanic still does not bite) or
`SUPERSEDED` (the capability is live under another name), and reading it forward as a synonym for
"missing" is exactly how this file's predecessor misled people.

| state | meaning |
|---|---|
| **BUILT** | the promise is implemented *and* it changes an observable number in a normal run. |
| **PARTIAL** | some of it executes; the part the vision sentence is actually about does not. |
| **ABSENT** | nothing in the tree does this. |
| **SUPERSEDED (by what)** | the named artifact is dead, but the capability is live elsewhere. The row names where. |

**Evidence is a `file:line` at `0940061`, or a named probe with its control.** Two probes were run,
both pure JSON traversals over `git show origin/main:…` needing no `node_modules` (load average was
295 for this session, so nothing was executed that did not have to be):

- **P1 — the cross-cell edge census.** `packages/content/data/{cell,node}.json` at `0940061`, built
  node → cell → technique, counting prerequisite edges whose prerequisite sits in a different cell.
  *Control:* the probe must reproduce the three figures `vision.md` §4 and §13 already publish. It
  does, exactly — 11 v1 cross-cell edges all originating in *Intellego* (9 same-form, 2
  *Intellego*→*Intellego*); 36 across all seventy cells, 29 from *Intellego*, 5 from *Perdo*, 2
  from *Rego*; and forbidding *Intellego* leaves **18 of 51** v1 nodes reachable against 34 for
  *Perdo* and 33 for *Rego*. A probe that reproduces four independently published numbers is not
  answering about the wrong input.
- **P2 — the committed-baseline metric enumeration.** Every `metricId` in all four files under
  `balance/baselines/`. *Control:* it returns **199 metric entries, 90 of them distinct** (the 90-id set repeats across
  the `agency` and `ascension` baselines), rather than an empty set — so the extractor is reading
  the right key and a null result would be visible as a null result. A first pass that returned
  all-`None` was discarded rather than reported. **P2a**, added after review because an absence
  claim needs execution: `git grep` for all seven threshold-bearing §7 metric ids across
  `packages/mc-harness/test packages/scenario/test scripts balance`, whose control is that the same
  pathspec returns thousands of `expect` hits. Result below.

Where the brief supplied a measurement taken elsewhere tonight it is cited as **[given]** and was
not re-derived; those rows carry the constant's `file:line` so the mechanism is checkable even
though the number is not re-measured here.

---

## The unmet promises

| vision § | what it promises | status | evidence | blast radius |
|---|---|---|---|---|
| **§9** | *"**Balance regression gates.** Committed baselines; a change that moves a primitive's measured contribution beyond tolerance fails CI"* | **ABSENT** | P2: all **199 metric entries (90 distinct)** across the four committed baselines are `reference*` scenario vital signs; the set of non-`reference*` ids is **empty**. P2a: no test and no script asserts a §7 threshold either — every hit is prose in `balance/README.md`, a recorded measurement in `balance/results-integration-r2.txt`, or a `metricDefinitionVersions` block. **Those blocks are the sharp detail:** each baseline pins a *definition version* for all twelve §7 metrics (e.g. `balance/baselines/balance-gate-v1.baseline.json:26`), so the gate refuses on **provenance drift** while carrying no value and no tolerance for any of them. **Zero of `contracts.md` §7's twelve metrics is gated on a value.** Five of those twelve carry declared thresholds in `docs/design/contracts.md:1341–1347` — `worshipSnowball ≤ 0.35`, `ascensionRate` 5–20%, `prestigeAdvantage < 60%`, `inboundRaidTempoLoss`, p95:p50 ≤ 3:1 — and none is enforced. `package.json:44` runs three gates; the fourth (`balance:gate:ascension`, the only one that even measures ascension) is in `verify:full` only, at `:45`. | Total. §11's MINOR-parity rule makes an even MINOR mean *"Monte Carlo baselines committed and green"* — the baselines that are green do not measure the twelve metrics the parity rule exists to certify. Every balance claim from 0.5.0 onward rests on this. |
| **§8a** | *"**Prestige carries forward.** Ascending closes a universe and opens a new one, seeded with legacy drawn from what the last one achieved."* | **ABSENT** | `carriedPrestige` and `legacyGrant` are pinned `unreached`, `legacyBudget` `reachedOnlyByUnreached`, in `scripts/reachability-baseline.json` at this ref; `packages/coordination/src/god/ascension.ts:399,420,512`. Eight authored god constants (`legacyArchiveMaxTier`, `legacyArchiveNodes`, `legacyBaselineFavor`, `legacyBaselineMaterials`, `legacyBaselinePopulace`, `legacyHeadstartFraction`, `legacyReferenceTick`, `prestigeRetention`) are pinned `constantsBehindDeadCode` in `packages/coordination/src/god/constants.ts` — knobs that look like tuning and turn nothing. `docs/design/reachability-triage.md` §2 calls this *"the largest single dead mechanism"*. | The entire cross-run meta-game, which §8a offers as the *resolution* to the persistent-world/Monte-Carlo tension. `prestigeAdvantage` can never report anything but `no-observations`, and §8b's *"the quantity to hold down is the cost of re-entry"* has no quantity. |
| **§8a** | *"The ascension condition must be reachable but not routine. If a majority of Monte Carlo runs ascend, it is not a summit"* — and ascension is a **summit**, i.e. a measure of play | **ABSENT** (as a measure of play) | `openspec/changes/discriminating-ascension/proposal.md` measures it at **0/38 tasks**: *"`uniform-random-legal` ascends 10 of 10 runs at 2400 ticks while every deliberate strategy ascends 0 of 10"*; Path A opens passively at world tick 709, Path B at 1080; *"an active civilization **fails** Path B"* — 174 nodes held, `goodEraRun` 0. Its verdict: Path B *"rewards inertia and punishes scale — the sign is inverted, not merely weak."* Nothing in the change is built. | Every Monte Carlo comparison between strategies, and `mm_gym`'s terminal reward: a sparse-terminal RL policy is maximised by idling. `vision.md` §9's *"machine play"* premise inverts. |
| **§4** | *"the rule is violable by accident and nothing tests it… **A loader assertion over cross-cell edges is the obvious guard; recorded here as a recommendation, not built.**"* | **ABSENT** (verbatim, still) | `packages/content/src/diagnostics.ts:36–57` enumerates every diagnostic code the loader can emit. There is `prerequisite-cycle`, `inverted-tier`, `v1-unreachable-prerequisite`, `intellego-exclusion` — **and no code for a cross-cell prerequisite's origin**. `git grep "cross-cell" -- packages` at this ref returns four hits, all prose or test-fixture comments, none a check. P1 shows the regularity holds *today* at 11/11 and 29/36 — and nothing keeps it holding. | §4's central structural claim about the grid, and §4b's *"Intellego cannot be a member of a mutually exclusive pair"*, which is derived from it. The **adjacent** §4b guard **is** built (`load.ts:597` `PERCEPTION_TRUNK_TECHNIQUE`, `intellego-exclusion` at `:670`) — do not let it launder this one. They are different promises. |
| **§4b** | *"**The deepest magic is cast by more than one mage.** Rituals requiring several casters… Nothing in any spec today mentions rituals or co-casting — this section is where that decision now lives"* | **ABSENT** | `git grep -ni "ritual\|coCast\|co-cast\|coCaster" origin/main -- packages openspec` returns **zero** hits. Positive control: the same pathspec form returns hits for every other term in this table. The vision's own sentence has not aged: no spec mentions it, and now no code does either. | §4b's stated reason the deepest magic is collective. One of the three constraints §4b names as *"why the deepest magic has to be collective"*, and the only one with no artifact at all. |
| **§8** | *"**Stakes:** casualties are permanent… Attacker wins by destroying or looting a target"*; *"**Theft** is cell-gated"* | **PARTIAL** | Raids now fire: `REFERENCE_MECHANICS.raidEngagement = true` (`packages/scenario/src/executor.ts:119–123`), `packages/scenario/src/raids.ts` is the caller, `packages/scenario/package.json:31` lists `@mm/rules-raid`. But **zero combat attempts ever occur, on either path, and no raider comes home** — withdrawal opens 2,418–3,518 ticks into raids that end by tick 149 **[given]**. The arrival mechanism is `inbound-raid-chance-per-world-tick = 4` fp under `inbound-raid-cooldown-world-ticks = 60` (`packages/content/data/raid-constant.json:297–307`); the measured arrival rate of 0.167/yr and the flat 0–55% raid axis are **[given]** and are not re-derived from those two constants here. | §8's *stakes* — the half that makes losing hurt. A portal opens, an engagement terminates, and nothing that §8 says a raid is *for* happens inside it. This is the single largest gap between "a caller exists" and "the promise is kept". |
| **§4** | *"A cell is available only if **both** its technique and its form are permitted"* — applied to `worship-yield` | **ABSENT** (contradicted) | `yieldSources` (`packages/coordination/src/god/system.ts:649–656`) tests **only** `knowledge.instanceCount(nodeId) > 0`. No `permits()` call, no location filter, no dormancy check — though `permits` is imported into the same file and used at `:440`. A forbidden cell still pays worship for as long as any instance survives anywhere, including an inert copy on a shelf. Unchanged from `6e5ecee`. | The one primitive that is both reachable and driven by authored node content is the one that bypasses the legality gate §3 calls *"the single load-bearing mechanic"*. Forbidding is priced as a denial play and refunded as worship. |
| **§7a** | *"Siting a university **in** a territory is therefore a relationship, not a coordinate… (A workstream is siting universities in territories; **no branch for it exists as of this amendment**)"* | **ABSENT** | Territory is consumed only as a **universe-wide aggregate**: `TerritoryExtent` summed by `territoryExtent` and read by `carrying-capacity.ts` for `K` (`packages/coordination/src/world-step.ts:257–268,955`). `git grep "territoryId\|siteId" -- packages/state packages/rules-world packages/coordination` returns nothing. No university row carries a place. | §7a's own worked example of where the "no map" boundary runs. `contracts.md` §2.7's anticipated *"a raid that takes ground"* has no ground to take. |
| **§13** | *"How much of the grid is **mētis** — knowledge that cannot be written down at all?"* | **ABSENT** (as a mechanic) | Authored: **29 of 300 nodes** carry `knowledgeKind: "metis"` (`packages/content/data/node.json`, tallied at this ref); the type is real at `packages/content/src/types.ts:183`. Consumers: `git grep "knowledgeKind\|'metis'" -- packages/rules-magic packages/rules-world packages/coordination packages/scenario` (excluding tests) returns **zero**. `openspec/changes/metis-knowledge` is **1/51**. A mētis node is scribed exactly like an *episteme* one. | 29 authored nodes carry a property that changes nothing, which is worse than none: content authors have made 29 decisions the simulation discards. §13's *"decay pressure on a demographic clock"* does not exist. |
| **§4a** | *"changing it is possible in world time only, at enormous cost, and it throws the civilization into upheaval"* — the tradition is *"an identity decision, not a build option"* | **ABSENT** (contradicted) | `changeTradition` (`packages/rules-magic/src/traditions/change.ts:149`), which implements the totality a switch requires, still has **no caller** — `traditionPlan` (`packages/coordination/src/god/interventions.ts:912`) is the only path to action 13 and does not call it. `docs/design/reachability-triage.md` §2 states the sharper version: *"`agent-api` publishes a change-tradition action and `mc-harness`'s strategies name it, while the rules function that would execute it has no caller. The action space advertises a move the rules never make."* | §4a in its entirety **as a decision**. Two of the three shipped traditions (Vancian, Art of Memory) are unreachable by construction, so §4a's *"three traditions, chosen because each stresses the knowledge model in a different direction"* stresses it in one direction. |
| **§8** | *"**Uninvolved universes keep advancing**… therefore raiding costs tempo, for both sides"* | **ABSENT** | `packages/scenario/src/raids.ts:52–58` states it as a finding rather than hiding it: *"a raid costs this universe no world ticks, so `inboundRaidTempoLoss` measures zero here… a simulation instance holding one universe has no uninvolved third party for the loss to be relative to."* No orchestrator holds two `SimState`s across a world tick. | §8's *"the intended shape"* — the third party who profits from every war. The griefing guard §8 names as the thing that *"must be measured, not assumed away"* is structurally unmeasurable at this build, and `packages/server` is where it would have to move. |
| **§6a / §6** | *"a university becomes known for Rego Terram because that is what its library holds"* — specialization actually emerging | **PARTIAL** | The capital loop **closed**: `libraryCapital` (`packages/coordination/src/capital.ts`) is called at `world-step.ts:724`, joining the two halves `contracts.md` §5 rule 3 forbids either package from joining. But `universityProfile` and `dominantCell` are still pinned `unreached` (`packages/rules-world/src/universities/profile.ts`), and nothing *derives* what a university is good at. The reference universe still holds **one** university, so §13's own caveat stands verbatim: *"what is shown is a library that specializes, not two that specialize differently."* | §13's stated blocker for the raid design — *"a raider learns nothing from a shelf that matches her own"*. The measurement §13 asks for still cannot be taken. |
| **§8b** | *"A universe… lives in a **bubble**: a bounded neighbourhood of universes that may portal to one another"* — *"the piece that **is** urgent"* | **PARTIAL** | A bubble exists only in the multiplayer layer: `DEFAULT_BUBBLE_ID = 'bubble-0'` (`packages/server/src/host.ts:105`) and a `challengeEligibility` bubble comparison. In the simulation, `portalTargets` comes from a **single stand-in** — `reference-universe.ts:1007` passes `portalTargetIds(constants)` sourced from `packages/scenario/src/rival-universe.ts`, whose own constant gloss says *"INVENTED with the rest of the rival stand-in"* (`raid-constant.json`, `rival-foreign-book-count`). `openspec/changes/colonization` is **0/43**. | §8b's answer to *"who, exactly, can raid me?"* remains a stand-in. Promotion, tier ladder and the re-entry price all sit on it. |
| **§10** | *"a pure… simulation core **consumed identically** by the Monte Carlo harness, the Electron client, and the authoritative multiplayer server"* | **PARTIAL** | A second consumer now exists — `packages/server` (`pvp-server` at **33/41**) — which is a real change since the last audit. But the two consumers are **not** identical where it matters: `packages/server/src/index.ts:39` states *"Nothing supplies `portalTargets`, so `openPortal` is permanently masked"*, while `packages/scenario/src/reference-universe.ts:1007` does supply them. No `electron-client` package exists (`openspec/changes/electron-client` has **no `tasks.md` at all**). | The divergence is declared rather than accidental, which is the good version — but "consumed identically" is now falsifiable and false in one action bit, and the third consumer is still absent. |
| **§11** | *"Roadmap rows use the real change and capability identifiers so that `openspec list` and this table stay in agreement — **that agreement is how 'did the vision get built?' is answerable**"* | **ABSENT** (the agreement, not the table) | Task counts at `0940061`, tallied from each `openspec/changes/*/tasks.md`: `mages-and-species` 100/107 ✓, `agent-interface` 91/91 ✓, `god-agency` 59/75 ✓, `gym-bridge` 76/76 ✓, `metis-knowledge` 1/51 ✓ — but **`pvp-server` is 33/41 with `packages/server` on the tree**, against a cell reading *"proposal only — no tasks, no package on `main`"*; and **`raid-engagement`'s cell says *"raids fire on the campaign branches, not yet on `main`"*** against `REFERENCE_MECHANICS.raidEngagement = true` (`executor.ts:119–123`). Two further changes exist with **no roadmap row at all**: `colonization` (0/43) and `discriminating-ascension` (0/38). | The table exists to make "did the vision get built?" answerable, and it is currently wrong in the same present tense, and in the same direction, as the failure §11's own note says it exists to prevent — *"anyone reading the old column would still have materially underestimated how far the project has gone."* `discriminating-ascension` is the sharper half: an unlisted change that owns the fix to the third-worst promise above. |
| **§10 / Constraint 4** | *"Determinism is enforced by golden-replay tests"* | **PARTIAL** | `replay` (`packages/sim-core/src/replay/replayer.ts`) is pinned `unreached` in `scripts/reachability-baseline.json`. `docs/design/reachability-triage.md` §2 gives the control: *"the only call-shaped occurrence of `replay(` in the tree is its own definition. Golden fixtures are recorded by `scripts/regen-goldens.mjs`, which mentions replay in prose and does not call it."* Fixtures are compared; nothing outside a test re-runs one through the replayer. | `CLAUDE.md`'s constraint 4 — *"a regenerated fixture is a claim that behaviour changed on purpose"* — holds for the hash comparison. The *replayer*, the artifact the sentence names, is not what enforces it. |
| **§4b** | *"Extension therefore returns **logarithmically**, so that buying more life never makes a species' own lifespan irrelevant"* | **SUPERSEDED** (by a ceiling, as §4b itself half-admits) | There is no logarithm in the rules path — by design: `packages/coordination/src/god/worship.ts:82–84` states the reason, *"no square root, no logarithm… a logarithm has no absolute ceiling."* What ships is the cap `{"kind": "fraction-of-species-base", "value": 512}` on `lifespan` (`packages/content/data/primitive.json:77`), applied by `packages/primitives/src/caps.ts:102`. §4b already calls this *"the same instinct written as a ceiling rather than as a curve"* — so the row is a naming defect, not a hole. | Small, but §4b asserts a *shape* the code deliberately refuses. A reader tuning life-extension will look for a curve. |
| **§7** | *"**Which subdivision of the bar does each god intervention belong to?**… W21 declined to charge an off-grid surcharge it could not derive"* | **ABSENT**, and openly so | `git grep "offGrid\|off-grid\|subdivision" -- packages` returns hits **only** in the audio content layer (`packages/content/src/audio-types.ts:41`, `audio-cue.json`). No intervention pays a timing surcharge. The eight-tick constitutional-churn surcharge §7 also describes *is* built and is a different thing. | Contained. §7 is honest that this is open; recorded so the row is not rediscovered. |
| **§4** | *"Nodes are expressed as compositions of **~15** tunable effect primitives"* | **BUILT**, number wrong | `packages/content/data/primitive.json` holds **16**, enumerated at this ref. Carried forward from `vision-audit.md` D4 and still not fixed. | Documentation only. Listed because it is the cheapest possible correction and has now survived two audits. |
| **§12** | *"Deliberately out of scope for v1: …art pipeline, audio"* | **BUILT anyway** (scope creep, unchanged) | `check:audio` is a step of `npm run verify` (`package.json:21,43,44`). `packages/content/data/audio/`, `packages/content/schema/audio/`, five `audio*.ts` sources, `tools/audition/`. | Not a gap — the inverse. Recorded because §12 is the one section where "unmet" means the promise was to *not* build it, and the promise is broken. |

**Counts: ABSENT 12 · PARTIAL 5 · SUPERSEDED 1 · BUILT-but-wrong 2. Total 20.**

---

## The three worst unmet promises

### 1. §9's balance gates gate nothing the vision is about

This is first because it is the promise whose failure hides the others. §9 calls balance
methodology *"a first-class feature, not tooling"*, and the sentence that carries it is *"a change
that moves a primitive's measured contribution beyond tolerance fails CI and must be accepted
deliberately."*

Probe P2 enumerated every `metricId` in all four committed baselines: **199 entries, 90 distinct,
and the set of non-`reference*` ids is empty.** All of them are `reference*` scenario vital signs — grimoires, living mages, nodes known, population — and
`packages/scenario/src/measures.ts` says outright that these are deliberately prefixed so they
cannot collide with `contracts.md` §7's names. **Zero of §7's twelve metrics is gated on a value**, and P2a confirms by execution that nothing
outside `balance/baselines/` gates one either: no test and no script asserts a §7 threshold, against
a pathspec that returns thousands of `expect` hits. What the baselines *do* carry is a
`metricDefinitionVersions` block pinning a definition version for all twelve, so the gate refuses on
provenance drift and never on a number. Five of
them carry numeric thresholds written into `contracts.md:1341–1347`, including the two the vision
names as the runaway guards (`worshipSnowball ≤ 0.35`, `capitalSnowball`) and the one §8 calls
*"the griefing guard"* (`inboundRaidTempoLoss`). `balance/README.md:587–592` records
`capitalSnowball` at **0.380** — above the 0.35 its sibling is held to, and its own note says the
bound *"inherits"* — sitting in a README rather than in a gate.

What makes this the worst row rather than merely the largest is §11's parity rule. *"MINOR parity
encodes balance validation from 0.5.0 onward — odd means in flight, even means the Monte Carlo
baselines are committed and green."* The whole value of that scheme, in the vision's own words, is
that *"an even version is a claim someone could check."* An even MINOR taken today would certify
green baselines that do not measure a single one of the quantities §7 exists to bound. The parity
rule is not merely unenforced; it is currently arranged to pass while saying nothing.

### 2. §8a's prestige carry-forward — an entire cross-run feature behind no call site

§8a offers prestige as the *resolution* to a tension it names explicitly: *"'Persistent world' and
'Monte Carlo needs a terminal condition' pull against each other; ascension gives every run a clean,
bounded end… while prestige preserves the long-term ownership the persistent-world fantasy is
actually about."*

Nothing composes a next universe from a prior one. `carriedPrestige` and `legacyGrant` are pinned
`unreached` in the committed reachability baseline at this ref, and **eight authored god constants
exist solely to feed them** — `legacyArchiveNodes`, `legacyBaselineFavor`, `prestigeRetention` and
five more, all pinned `constantsBehindDeadCode`. That is the detail that raises this above ordinary
integration debt: a content author looking at `god-constant.json` sees eight tuning knobs, turns
one, and nothing anywhere moves. `reachability-triage.md` §2 names it *"the largest single dead
mechanism"* and *"the clearest case for the check's one-hop transitivity."*

It compounds with row 1 and row 3. `prestigeAdvantage` is one of the twelve ungated §7 metrics, and
it is the only one that reports `no-observations` rather than `mechanic-absent` — an honest answer
that there are no mirrored pairs to compare, and there never will be until a driver exists. And
§8b's *"the quantity to hold down is the cost of re-entry, not the number of doors someone may knock
on"* is a design argument about a number that is never computed.

### 3. §8's raids fire and nothing happens inside them

The previous audit's §8 rested on one fact — *"`packages/rules-raid` is an orphan package… No raid
has ever fired"* — and that fact is **gone**. `REFERENCE_MECHANICS.raidEngagement` is `true`
(`executor.ts:119–123`), `packages/scenario/src/raids.ts` is the caller, and `scenario`'s
`package.json` lists `@mm/rules-raid`. Portals open, from god action 14 and from an inbound arrival
process, and the engine runs to termination.

The promise still unmet is everything §8 says a raid is *for*. **Zero combat attempts occur on
either path, and no raider comes home** — withdrawal opens 2,418–3,518 ticks into raids that end by
tick 149 **[given]**. §8's *"casualties are permanent"*, *"Attacker wins by destroying or looting a
target"*, and *"Theft is cell-gated"* describe events that do not occur. The griefing surface §8
demands be bounded is bounded to near-nothing by construction: `inbound-raid-cooldown-world-ticks`
is 60 against a per-tick chance of fp 4 (`raid-constant.json:297–307`), and the raid axis measures
flat 0–55% **[given]**.

This is the row most likely to be misread in *both* directions, which is why it is here. A reader
checking whether raids are wired will find that they are and stop. A reader carrying
`vision-audit.md` forward will report an orphan package that is no longer orphaned. The truth is
neither: the caller landed, and the stakes did not.

---

## Every row of `vision-audit.md` found to have rotted

`vision-audit.md` was taken at `6e5ecee` (2026-08-11). It already carries a staleness banner and
three inline retractions. **The banner is not sufficient**, because the rows below are not struck
through, read as present-tense findings, and are the ones a reader is most likely to act on. Every
row here was re-verified against `0940061`.

**The whole of §8 has rotted at its root.** `vision-audit.md:424–428` states the section's founding
fact — *"`packages/rules-raid` is an orphan package. Neither `packages/coordination/package.json`
nor `packages/scenario/package.json` lists `@mm/rules-raid`… zero lines reachable from
`makeReferenceExecutor()`. No raid has ever fired."* At `0940061`, `packages/scenario/package.json:31`
lists `@mm/rules-raid`; five `scenario` sources import from it; `raidEngagement` is `true`. **All
twelve rows of that section's table, plus its §3 rows, its `implemented-unreached` verdicts under
§4a's cast/cost hooks, §5's theft and destruction rows, and gap #1 of the ranked list, are stated
against a tree that no longer exists.** The stated conclusions are mostly still true — nothing
*fights* — but every one of them is true for a different reason now, and the reason is the finding.

**`vision-audit.md:398` — action 14 (open portal) "never legal… `portalCandidates` returns
`input.portalTargets ?? []` and nothing supplies it."** Rotted. `packages/scenario/src/reference-universe.ts:1007`
passes `portalTargets: portalTargetIds(constants)`. `packages/mc-harness/src/strategies.ts:1444–1445`
carries the correction in-tree and is the cheaper place to have found it.

**`vision-audit.md:275` and gap #4 — "`gatherEffects` … has no non-test caller. A node authored
with `research-rate` does not speed research."** Rotted. `packages/coordination/src/universe-effects.ts:123,330`
imports and calls it. `gatherEffects` does **not** appear in `scripts/reachability-baseline.json`'s
125 pinned findings, which is the independent confirmation. The audit's ranked gap #4 — *"only one
of sixteen effect primitives actually reads its authored magnitude"* — no longer describes the tree.

**`vision-audit.md:369–371` and gap #3 — the knowledge-capital loop "does not compound"; `capital.ts`'s
four functions "have zero non-test callers".** Rotted. `packages/coordination/src/capital.ts` exists
precisely to join the two halves, and `world-step.ts:724` calls `libraryCapital` (imported at
`:183`).
That file's own header records what was measured before it and is worth reading as the
counter-example: the fix was to add the coordinating layer, not to wire a symbol.

**`vision-audit.md:338` — species "technique/form affinities" are `stubbed`; "no file under
`rules-magic/src`, `rules-world/src` or `coordination/src` reads it."** Rotted.
`packages/coordination/src/outlook.ts:67–71,123` resolves a species' `affinities` onto interned ids
and `world-step.ts:900` passes `affinitiesOf` through; `packages/rules-world/src/autonomy/outlook.ts:70–74`
consumes it. §6's seventh tuned trait is real now.

**`vision-audit.md:355` — soldiers `implemented-unreached`, "in a normal run there are no soldiers
at all".** Known rotten and confirmed: `packages/scenario/src/raids.ts` is the caller and runs an
inbound arrival process. **All three of that row's cited line numbers have rotted** — which is the
cheapest available rot signal and would have caught it without reading a line of logic.

**`vision-audit.md:535` — §10 "**No `electron-client` package. No `pvp-server` package.** Both are
`openspec list` rows with no tasks."** Half rotted, and the half that rotted is load-bearing.
`packages/server` exists at this ref and `openspec/changes/pvp-server` is **33/41**. The
`electron-client` half holds — and holds harder than stated: that change has no `tasks.md` at all,
not merely an empty one.

**`vision-audit.md:451,491` and gap #6 — `ascensionRate` "= 0.75… recorded in the committed
baseline".** Rotted as evidence, not as conclusion. P2 shows `ascensionRate` appears in **no**
committed baseline at `0940061`; the file it was read from now carries a different metric set and a
`notes` field about construction and stone. The conclusion is now supported by better evidence —
`openspec/changes/discriminating-ascension/proposal.md`'s 10-of-10 versus 0-of-10 — and citing the
old baseline would be citing a file that no longer says it.

**`vision-audit.md:348,353` — already retracted in-place on 2026-08-13 (orc build-rate;
`advanceConstruction` uncalled), and correctly.** Re-confirmed here: `world-step.ts:1302` calls
`advanceConstruction`. Noted because the audit's ranked gap **#2** — *"Laborers build nothing"* — was
**not** retracted alongside its own table rows and still reads as live at `:679`. The committed
`balance/baselines/balance-gate-ascension-v1.baseline.json` `notes` field says this more precisely
than either: *"stated carefully because the sloppy version has misled several readers:
`advanceConstruction` and `applyLibraryUpkeep` both have production callers in `world-step.ts` and
run every tick, so construction is NOT inert."*

**`vision-audit.md:584–585` (§13 rows) — "library depth 2 distinct nodes against 1,308 books".**
This is the figure `CLAUDE.md` records as having cost two agents an investigation each. It is
retracted at `:351` and **not** retracted at `:585` or at gap **#9** (`:792–796`), where it still
appears in the present tense as *"Measured: 2 distinct nodes across 1,308 books. There is nothing
distinctive to burn."* `vision.md` §13 gives the current figure: **15 books over a library depth
reaching 36 distinct nodes**. A retraction that fixes one of three occurrences is how a corrected
document goes on misleading people.

### One row of `reachability-triage.md` also rotted, and it is the same shape

Not in scope, recorded because it was found while verifying: `reachability-triage.md` §2 files
`applyWard` as integration debt on the grounds that *"`damage × (1 − preventedFraction)` is the
**only** implementation of ward prevention in the tree — verified by reading `primitives/src/stacking.ts`
and `ablation.ts`."* It is not. `packages/rules-raid/src/arbitration.ts:570` defines
`applyWardOnce`, called at `raid.ts:514,995`. Checked as a body rather than as a substring, because
the distinction decides the row: `applyWardOnce` **reimplements** the multiply —
`floorDiv(rawDamage * (FP_ONE - ward), FP_ONE)` — and does **not** delegate to `primitives`'
`applyWard`. So the pin is correct and the triage row's *reason* is wrong. The triage row was verified by reading the two files
that contain the symbol rather than the package that would contain the capability — which is exactly
the §3 trap that document is otherwise the best account of. **`applyWard` is SUPERSEDED by
`CastArbiter#applyWardOnce`, not integration debt.** (Wards still never prevent anything, because no
combat attempt ever occurs — but that is §8's row above, and a different reason.)

---

## §4 versus §13 on the perception trunk: the numbers resolve, the disagreement does not

`vision.md`'s header flags this itself: §4 and §13 *"both speak about the perception trunk and do
not agree about how settled it is; that disagreement is left standing for the author."*

**Every number both sections state reproduces exactly at `0940061`.** Probe P1:

| claim | stated in | measured at `0940061` |
|---|---|---:|
| v1 cross-cell prerequisite edges, all originating in an *Intellego* cell | §4, §13 | **11 of 11** ✓ |
| …of which same-form | §4 | **9** ✓ |
| …*Intellego* → *Intellego* | §4 | **2** ✓ |
| cross-cell edges across all seventy cells | §4 | **36** ✓ |
| …originating in *Intellego* / *Perdo* / *Rego* | §4 | **29 / 5 / 2** ✓ |
| v1 nodes reachable with *Intellego* forbidden | §4, §13 | **18 of 51** ✓ |
| …with *Perdo* forbidden / *Rego* forbidden | §13 | **34 / 33** ✓ |
| `rl-open-the-portal` requires `il-read-the-binding` | §4 | ✓ (`node.json`, prereqs `rl-step-across`, `rl-seal-the-way`, `il-read-the-binding`, tier 4) |

So the factual layer is not rotted, which is worth saying plainly given how much else in this corpus
is: §4's measurements are the most reliable numbers in the document.

**The disagreement is not about the numbers and cannot be settled against the code.** Read what each
section actually claims:

- **§4 claims a rule.** *"One sentence encodes them: you must perceive a thing before you can unmake
  or command it… Five independent content branches converged on the same wiring, which is what
  makes it deliberate."*
- **§13 claims the status is undecided.** *"That asymmetry is either the most interesting thing
  about the v1 subset or an accident of authoring, and the balance harness cannot tell which until
  someone decides."*

Those are not contradictory statements about the tree. They are contradictory statements about
whether an observed regularity has been *adopted* as a rule — and **no artifact in the tree encodes
it as one.** That is the decisive evidence, and it is the ABSENT row above:
`packages/content/src/diagnostics.ts:36–57` has no cross-cell-origin diagnostic. The loader will
accept, silently, a new *Perdo* or *Rego* node at any tier with no perception prerequisite. §4 even
predicts this: *"the rule is violable by accident and nothing tests it."*

**Verdict: neither §4 nor §13 is wrong, and the code cannot break the tie.** §4 is right that the
content obeys the rule — measurably, at 11/11 in v1 and 29/36 across the grid. §13 is right that
nothing has decided the rule is a rule. The tie will be broken by building the guard §4 already
recommends and did not build, at which point §13's question is answered by construction and §4's
paragraph becomes a description of an enforced invariant instead of an observed coincidence. Until
then the honest statement is the one §13 makes, and §4's *"which is what makes it deliberate"* is
the sentence that overreaches — five branches converging is evidence of a shared instinct, not of a
decision anybody took.

A second, smaller disagreement rides along and **is** resolvable: §4's *"Whether the *Muto* and
*Creo* columns should acquire the same trunk is a live authoring decision and is not settled here"*
matches §13's phrasing of the same question exactly, and P1 confirms the shape both describe — the
seven non-*Intellego* cross-cell edges are 5 from *Perdo* and 2 from *Rego*, and **none** from
*Muto* or *Creo*. The two columns in question contribute no cross-cell edges at all, in either
direction as origins. That is a fact neither section states and it narrows the question: it is not
"should they keep their existing wiring or adopt the trunk", it is "should they be wired at all".

---

## What this audit did not do

- It ran nothing under `packages/`. Load average was 295 for the duration of this session, so both
  probes were pure JSON traversals over `git show origin/main:…`. No `npm ci`, no `npm run verify`,
  no sweep, no baseline, no `goldens:regen`.
- It did not re-derive the measurements marked **[given]** — the raid figures, `teach-rate`'s
  inertness, `completeAffiliation`, student intake, the reading edge, `prevalence`. Those were
  verified elsewhere tonight and are cited with the mechanism's `file:line` so the mechanism is
  checkable even where the number is not re-measured here.
- It re-verified `vision-audit.md` **selectively**, not exhaustively: rows the brief flagged, rows
  in sections where the tree was already proven to have moved (§4, §6, §8, §10, §11), and rows whose
  cited line numbers were cheap to spot-check. Mismatched line numbers were used as the filter, not
  as the finding. **A `vision-audit.md` row not named above has not been cleared** — it has not been
  checked.
- Every figure here is a statement about `0940061`. Re-derive before acting.
