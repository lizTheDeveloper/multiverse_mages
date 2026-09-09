<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W194 — the world-side design corpus, audited against the code

**Measured 2026-08-14 against `origin/main` at `cf5a73a7`.** Every file:line below was re-confirmed
at that commit. `origin/main` advanced from `0940061` to `cf5a73a7` while this audit was running;
the two are identical across `packages/coordination`, `packages/rules-*`, `packages/scenario`,
`packages/primitives`, `packages/state`, `openspec/`, and every `packages/content/data` file this
audit reads, so every probe holds at both. What `cf5a73a7` adds is voice/character content, the
character forge, and `tools/w189` — which flips one row in this table from ABSENT to BUILT.

**This is an inventory, not a fix.** Nothing was changed, no baseline was taken, `goldens:regen` was
not run. Re-derive before acting: a measurement is a statement about the tree it was taken on.

**Corpus:** `ages-of-magic.md`, `economy-flow-models.md`, `place-architecture.md`,
`species-separation-spread.md`, `magical-prevalence.md`, `skills-in-a-population.md`,
`content/spell-glosses.md`.

**Four states.** **BUILT** — specified and wired. **PARTIAL** — wired but a magnitude, an input or a
consumer is missing, so it cannot express itself. **ABSENT** — no implementation. **SUPERSEDED** —
the doc's claim or proposed fix is out of date because the capability is live under another name, or
the defect it names has been repaired.

**Counts: 14 BUILT · 4 PARTIAL · 21 ABSENT · 8 SUPERSEDED (47 rows).** Two rows cover findings
**already pinned** in `scripts/reachability-baseline.json` / `reachability-triage.md` — the nine-finding
`completeAffiliation` / university-staffing cluster and eight further `unreached` symbols — and they are
cited rather than reported as new. A third row (`place-architecture` §4) is new *as a document defect*
while resting on pinned symbols, and says so.

**The BUILT count is not a health score.** Six of the fourteen are BUILT in the sense that *the
document's diagnosis is confirmed* — the mechanism it describes really is missing or dark. Read the
status column with the "what it specifies" column, never alone.

---

## The table

| doc § | what it specifies | status | evidence | blast radius |
| --- | --- | --- | --- | --- |
| `ages-of-magic` §2, §2a, §2c, §2e; `magical-prevalence` "Where the room is" | A college's job is **throughput through the known** — research, teaching and scribing rates that what the academics discover can move | **PARTIAL** | `npm run check:consumption` → `FAIL: primitive(s) with no node-driven consumer: research-rate, scribe-rate, teach-rate`. Its own positive control in the same output: 11 primitives **do** have node-driven consumers. 55 + 19 + 19 = **93 authored effects** across the three. Registered as non-node at `packages/scenario/src/content-set.ts:667-681` (god blessing constants only) | The entire college thesis. Every §2 mechanism is a rate primitive no node can move |
| — | …and the check that says so is **excluded from the gate** | **ABSENT** | `package.json:23` defines `check:consumption`; `package.json:43-44` (`verify`, `verify:nosweeps`) omit it. `.github/workflows/ci.yml:172` — *"`check:consumption` is deliberately NOT here. It is expected to be red"* | A known-red checker outside CI drifts silently; nothing reports when the count changes |
| `ages-of-magic` §2c; `magical-prevalence` "the scriptorium" | Scribing is the mechanism by which a second age outlives its founders | **ABSENT** | `packages/coordination/src/world-step.ts:1666` — `rate(deps.primitives.scribeRate, NO_BONUSES)`; `NO_BONUSES` is `Object.freeze([])` at `:1703`. `content-set.ts:689` states it: *"`scribe-rate` … stacks to the identity every tick and nothing, node or god, can move it"* | 19 authored `scribe-rate` effects (4 in v1 cells) are inert. Library growth has no magical lever |
| `magical-prevalence` "Students should spawn naturally. From the population" | The populace demands scribes in proportion to work owed | **ABSENT** | `world-step.ts:799` — literal `scribingQueueDepth: 0`; `populace/demand.ts:160` multiplies it by `SCRIBES_PER_QUEUED_GRIMOIRE`. **Zero scribes demanded in every shipped build.** Fixed on the unmerged `w23/populace-and-record` | Scribe occupation is unreachable; `place-architecture` §4's "Scriptorium activity" row reads an always-empty cohort |
| `ages-of-magic` §2b (*"the stationed set … there is no separate military"*) | Soldiers are not a separate population | **BUILT** (as a deliberate zero) | `world-step.ts:806` — `standingSoldierTarget: NO_STANDING_ARMY`, with `ages-of-magic` §2b quoted in the comment at `:800-805`. `demand.ts:108` `NO_STANDING_ARMY = 0`, with a three-part argument at `:82-107` | Cited, not omitted. The one corpus section the world step names as its authority |
| `place-architecture` §4 | *"Everything in the left column below is a real field"* / *"the readout can be built entirely from state that already exists"* | **PARTIAL — present-tense claim false for 3 of 9 rows** | `universityProfile` and `dominantCell`: sole occurrences are `rules-world/src/universities/profile.ts` (definition) and `universities/index.ts` (re-export) — **pinned `unreached`** in `reachability-baseline.json`. "Species mix of staff": `UNIVERSITY_STAFF`'s only writer is `universities/staff.ts:176`, inside the **unreached** `staffCohortsOf`; `world-step.ts:557` — *"`UNIVERSITY_STAFF` shipped in `WORLD_COMPONENTS` with no writer"*. "Scribe count": scribe demand is 0 (above). `libraryDepth`, `buildProgress`, `libraryDependence`, raid history **are** real | A readout built to this table would draw three features from empty state and report them as measurements |
| `place-architecture` §3 | Each site kind carries a `libraryUpkeepMultiplier` **anti-correlated with its capacity** — *"the best archive site is the worst settlement site, by authored construction"* | **ABSENT on `main`** | `packages/content/data/territory.json` fields are exactly `capacityPerLandUnit, gloss, id, landUnits, name, tuningStatus, yieldPerLandUnit`. `git grep libraryUpkeepMultiplier -- packages` → no match. **Positive control:** the same dump returns the doc's capacity column exactly — 40960 / 20480 / 6144 / 3072 / 512 | §3's whole "the design working" argument, and the §3 column of the §4 readout table, describe `integration/campaign-round-3`, which the doc names as its ref |
| `magical-prevalence` "The pipeline" | `prevalence` — *"a new per-species content field"* | **ABSENT** | `species.json` carries 16 fields: `affinities, curiosity, depthCeiling, fertility, id, laborAffinity, learnRate, lifespanMonths, lifespanVarianceMonths, mageAptitude, maturityMonths, name, rediscoveryAffinity, retention, scribeAffinity, tuningStatus`. **Positive control:** `git grep mageAptitude -- packages` → 6 hits in `species.json`; `git grep prevalence -- packages` → 0 | The "should be vs are" gap the doc calls *the game* has no term. Task 9.9's untried lever |
| `magical-prevalence` "Students are mages" | Student intake is a function of **population** | **ABSENT — intake is capacity** | `populace/demand.ts:161` — `[OCCUPATION.student]: inputs.universityCapacity`. Demand is exogenous to population, which is `economy-flow-models` §3.2's boundary-adequacy failure, still live | Universities cannot activate latent talent; they set the ceiling *and* the intake |
| `magical-prevalence` "Graduation" | A student graduates when the university has nothing left to teach | **ABSENT — promotion is age-gated** | `world-step.ts:1779` — `if (phase.worldTick - key.birthTickBucket < species.maturityMonths) return;`. Curriculum is never read | §2d's *"a curriculum is what the faculty can still teach"* has no consumer. University depth cannot matter to graduation |
| `economy-flow-models` §3.6 | *"1 of 16 effect primitives both reachable and node-driven"* — *"15 primitives have no activator path from any node"* | **SUPERSEDED — now 11 of 16** | `npm run check:consumption` lists 11 node-driven: `area-denial, blink, build-rate, concealment, direct-damage, knowledge-steal, portal, resource-yield, summon, ward, worship-yield`. W29 wired the economy pair; `content-set.ts:617-628` records that the seven combat primitives had been live and unmeasured. Residual: 3 academic (above) + 2 declared exclusions | The stated figure is stale in the *favourable* direction. The remaining gap is narrower and worse-placed than "15 of 16" suggests |
| `economy-flow-models` §2 (Attrition) | *"this is raids, and it is the pattern the measured build is missing entirely (**no raids ever fire**)"* | **SUPERSEDED — raids fire** | `packages/scenario/src/raids.ts:423` calls `openPortal`; inbound arrival process at `:277-282`; `packages/scenario/src/executor.ts:120` declares `raidEngagement: true` and `:397` *"Whether portals open and raids resolve. **Defaults to `true`**"* | **`reachability-triage.md` §2 carries the same stale claim** (*"nothing in `scenario` opens a portal"*). Two cross-reference sources agree with each other and with neither the code |
| `economy-flow-models` §3.1 | *"unmet upkeep should **lapse into decay**, never bank as debt"* (proposed fix; the doc hedges *"I have not read the economy code"*) | **SUPERSEDED — already shipped** | `rules-world/src/universities/capital.ts:305-322`: `shortfall` is not stored; `degradedInstances = floorDiv(shortfall, DEGRADATION_PER_SHORTFALL)`, comment *"It is **not banked**"*. There is no debt stock and no `shortage` semantics | The §3.1 recommendation and the Machinations `shortage` mapping are moot. The library-starvation measurement it explains has another cause — see the vellum row |
| `economy-flow-models` §3.3 | The favor discard *"feeds back into nothing"* — route it | **ABSENT (the feedback); the ledger is BUILT** | Written at `coordination/src/god/system.ts:481`; conserved at `god/favor.ts:216` (`closing == opening + regenerated − discarded − Σ spends`). **No rules-path reader:** every other occurrence is state plumbing (`state/src/components.ts:333,353`) or observation (`agent-api/src/layout.ts:232`, `entitlement.ts:225`) | Source/sink mismatch is measured, recorded, conserved — and inert. The diagnostic exists; the loop does not |
| `economy-flow-models` §3.4 | The oscillation check is period-2 only; replace with autocorrelation over the 12-tick census grid | **ABSENT** | Only detector: `scenario/src/long-run.ts:516` `longestOccupationAlternation`; its **only** caller is `test/unit/reference-long-run.test.ts:353`. `git grep -rin autocorrel -- packages` → **0 hits**. **Positive control:** `git grep -rin oscill -- packages` → 40 hits | A 1,400-tick starvation cycle is invisible. The claim is also not a registered metric — it rests on one reference test |
| `economy-flow-models` §5.3 | Classify each run equilibrium / oscillation / collapse | **ABSENT** | `git grep -rin behaviourMode` / `behaviorMode` → 0; `'equilibrium'` as a literal → 0 in `packages`. None of the 18 ids in `mc-harness/src/metrics-registry.ts` is a mode. Near-miss, not it: `TERMINAL_STATUS` (`mc-harness/src/index.ts:245-249`) is ascended/stagnated/truncated/failed — an outcome taxonomy | Every metric is numerical; an oscillating run and a settled run report the same median |
| `economy-flow-models` §5.2 | Promote unmet-demand-per-claimant from "recorded and observable" to a **reported sweep metric** | **PARTIAL — 1 of 3** | Computed: `populace/reallocation.ts:206,246,249` → `step.ts:87` → `world-step.ts:792`. **Not stored:** dropped at the coordination boundary; `WorldStepReport` (`world-step.ts:1030-1060`) has no field and is *"Reporting only; never an input to any rule"* (`:390`). **Not a metric:** `git grep unmetDemand -- packages/mc-harness` → 0. **Positive control:** the same pattern over `packages` returns 12 hits, all in `rules-world/src/populace` | The economy spec's clause (`specs/economy/spec.md:102`) is satisfied in letter inside one package and invisible to every sweep |
| `economy-flow-models` §5.2 | A per-tick faucet/sink **conservation ledger** for `materials` and knowledge instances | **ABSENT** | **Positive control:** `git grep "export function .*Balances(" -- packages` returns exactly one production definition — `god/favor.ts:213 ledgerBalances`. No materials or knowledge analogue. What exists instead is non-negativity, not conservation: `rules-world/src/economy/materials.ts:301 assertMaterialsNonNegative`; `git grep instancesCreated` / `instancesLost` → 0 | The favor ledger is the only place a closing balance is asserted. The doc's own point, unaddressed |
| `economy-flow-models` §5.3 | INV-29 and INV-30 mechanisms are *"To be defined"* | **SUPERSEDED — live under another name; `invariants.md` is stale** | `docs/design/invariants.md:153-154` still reads **"To be defined"** for both. But `mc-harness/src/metrics-registry.ts:271` defines `capitalSnowball` and `:318` defines `ascensionRate` with an explicit band (`targetBandMin: 0.05`, `targetBandMax: 0.2`, reported not enforced) — precisely the two mechanisms | A registry entry exists for both; the invariants doc people read says there is none. Classic `vision-audit.md` shape |
| `economy-flow-models` §5.5 | Extend the "Disproved by" falsifier column from invariants to the **metrics** registry | **SUPERSEDED — already done** | `mc-harness/src/metrics-registry.ts:123` — `readonly disprovedBy: string` on `BalanceMetricDefinition`, populated per entry (e.g. `:298-300`, `:333-336`) | The proposed fix shipped |
| `economy-flow-models` §4.1 | **Spec collision:** differentiating `materials` into fourteen stocks fails a shipped requirement | **BUILT (the collision is real)** | `openspec/changes/mages-and-species/specs/economy/spec.md:303` *"Requirement: The economy has exactly three tracked inputs"*; scenario at `:324` *"No fourth resource"*. Note the unresolved W29 annotation at `:309-322` | The flag is accurate. Any materials differentiation is a spec change |
| `magical-prevalence` "The cheapest real win" | `lifespan` (17 effects) and `fertility` (5) *"carry 22 authored effects with no node-driven consumer at all"* and **zero presence in the enabled twelve** | **BUILT (the finding is exactly right)** | `check:consumption`: *"Declared exclusions: fertility, lifespan"*, both `0 node(s)`, consumed only by `carrying-capacity (species.fertility)` and `god/effects.lifespanEffectsFor (blessing constants)`. Counted from `node.json` × `cell.json` `v1`: lifespan 17 authored / 0 in v1; fertility 5 / 0 | Confirmed at `cf5a73a7`. The two purest civil primitives are the two the registry excludes by design |
| `magical-prevalence` "Not all mages should be equal" | Low-tier, endlessly repeatable magic worth casting — *"five of 59 `resource-yield` effects are in enabled cells and **all five route to stone**"* | **BUILT (confirmed) — and worse** | The five: `it-taste-the-soil`, `it-survey-the-strata`, `it-find-the-deep-seam` (`intellego-terram`), `rt-quarry-without-hands`, `rt-the-vaulted-hall` (`rego-terram`). `form.json`: `terram` = `{food:0, stone:1024, vellum:0}` — 100% stone | Confirmed. See the next row for the half nobody has stated |
| **(new)** `magical-prevalence` / `economy-flow-models` §3.1 | — | **ABSENT** | `form.json`: **`nomen` is the only form that yields vellum** (`{food:0, stone:0, vellum:1024}`) and is a v1 form. Across all 300 nodes, `nomen` carries **exactly one** `resource-yield` effect, and it is **not** in a v1 cell. Meanwhile library upkeep *and* scribing both spend vellum (`economy/materials.ts:43-49`; `world-step.ts:748-761`) | **No universe on `main` can produce vellum by magic.** The library-starvation §3.1 diagnoses as `shortage` semantics is a content gap: the sink is magical, the faucet is not |
| `magical-prevalence` "there is **no primitive at all** for institutional capacity" | A capacity primitive golems and larger classes would move | **ABSENT** | `primitive.json` declares exactly 16: `direct-damage, ward, area-denial, blink, summon, build-rate, resource-yield, research-rate, teach-rate, scribe-rate, lifespan, fertility, worship-yield, concealment, knowledge-steal, portal` | Correct as stated; a registry gap, not a content gap |
| `skills-in-a-population` "Why this is the right instrument now" | *"`researchCost` **identical across all 300 nodes**, ties broken on alphabetical node id"* | **PARTIAL — literally false, substantively close** | `researchCost` has **6 distinct values**, not one: 2048×70, 4096×71, 8192×78, 16384×65, 32768×15, 65536×1. But all three cost fields share that identical 70/71/78/65/15/1 distribution, with `teachCost = researchCost / 4` and `scribeCost = researchCost / 2` on **every** row, and the six buckets are consecutive powers of two — so the three fields are a **pure function of node tier** and carry no independent authored information. The doc's *conclusion* (nothing distinguishes two nodes of the same tier, so ties break on node id) survives; its *statement* does not | One of three present-tense evidence bullets for the macro model. Quote the mechanism, not the sentence |
| `skills-in-a-population` "an abstract model that emits needs" | A macro model: universities as a shape over time, raids as a probability, the economy mocked, drains as free variables | **BUILT** | `tools/w189/{cli,macro,needs,params}.mjs` and `docs/design/macro-university-model.md`, landed at `63f44ced` (#168) — **after `0940061`**. Has a `selftest` subcommand with positive controls and a third exit (`42 = broken probe`). Not in `package.json` (no npm script) | The doc's central ask. ABSENT at the ref this audit started on; BUILT at the ref it names |
| `skills-in-a-population` "Sequencing" 1 | *"Land anti-requisites completely. **In flight.**"* | **BUILT** | Merged at `672f93c` (#161). Content: `cell.json` `excludes` on the `creo-ignem` / `creo-umbra` pair, mirrored and validated (`content/src/load.ts:629-687`). Rules path: `rules-magic/src/grid.ts:124-127`, `instances/catalog.ts:90-108`, `instances/subsystem.ts:153`, reaching acquisition via `scenario/src/content-set.ts:641-643` | Step 2 of the owner's sequencing — *"base the other explorations on that tree"* — is now unblocked |
| `ages-of-magic` §2c | *"Publish or perish … we shipped the perish half."* `decay.ts` says of itself: *"Nothing in this subsystem restores mastery; practice does, and practice is an operation somebody has to perform"* | **BUILT — the diagnosis is exactly right** | Quoted text confirmed at `rules-magic/src/instances/decay.ts:114-115`. **The only write to an existing instance's mastery in the tree** is `instances/subsystem.ts:293 setMastery`, whose only non-test caller is `decay.ts:213`, writing `decayedMastery(...)` — monotonically non-increasing by construction (`decay.ts:96,117-118`). Every other mastery write **creates** an instance: `research.ts:300` (256, below the 512 threshold), `teaching.ts:186-188` (lossy, new row, teacher untouched), `scribing.ts:209` (0), `god/interventions.ts:636-642` (1024, action 8), `consequences.ts:142` (0, stolen). The one raising write is test-only (`rng-invariance-with-decay.test.ts:131`) | **Per-instance mastery is monotonically non-increasing, with no restoration path.** §2c's *"the counterweight was never built"* is literally true |
| — | `publish` or `practice` as an operation | **ABSENT** | **Positive control:** `autonomy/goals.ts:57-86` enumerates ten goals — `idle, researchNode, rediscoverNode, seekTeaching, teach, scribe, affiliate, wardDuty, raidReadiness, applyMagic` — and `god/interventions.ts:105-122` enumerates god actions 0–15. Neither contains `publish` or `practice`; the probe finds all ten and all sixteen. Every `git grep` hit for either word is prose or a node gloss | §2c ordering ruling — *"build `publish` before building paced teaching"* — is still the first thing to build |
| `magical-prevalence` "Students are mages" | The role taxonomy: student mage, battle mage, populace mage, portal-goer, defender; *"`DEFENDING_ROLES` is all four — every living mage defends"* | **BUILT (the doc's reading of today is exact); the taxonomy is ABSENT** | `state/src/enums.ts:57-61` — `MAGE_ROLE = { researcher: 0, warden: 1, professor: 2, raider: 3 }`. `rules-raid/src/combatants.ts:305-310` — `DEFENDING_ROLES` contains all four; `RAIDING_ROLES` (`:303`) is raider-only. Of the proposed names, three exist as **other kinds of thing** and one does not exist at all: `student` is `OCCUPATION.student = 2` (`enums.ts:70`), `populace` is a cohort/speaker kind, `defender` is `RAID_SIDE.defender` (`enums.ts:180`); **`portal-goer` has zero matches in `packages`** — the other three are that probe's positive control | The doc's warning holds: reconciling the two lists means re-using `OCCUPATION` and `RAID_SIDE` names for roles, or renaming |
| `ages-of-magic` §3a | `species.json`'s `affinities` map is *"read by nothing but the key validator"* (per W41) | **SUPERSEDED — false at `cf5a73a7`** | Live in the autonomy tick, end to end: `scenario/src/content-set.ts:728-732` supplies `affinitiesOf` → `world-step.ts:900` → `coordination/src/outlook.ts:123` → `rules-world/src/autonomy/target-appeal.ts:320-322` (`affinityTerm` feeds the appeal score) → `select.ts:152` → `select.ts:319 selectGoal` → `autonomy/tick.ts:61`. The validator (`content/src/load.ts:1087-1097`) is now one reader of three | The §3a argument that a taboo would be *"the same shape as `affinities`, which is read by nothing"* loses its precedent — `affinities` is wired, so a taboo has a working pattern to copy |
| `economy-flow-models` §5.5 | *"`libraryDependence` sitting at 0 … a metric that is **structurally incapable** of moving"* | **SUPERSEDED — overstated; it is empirically zero, not structurally** | Computed at `god/ascension.ts:268-271` as `floorDiv(singleInstanceNodes * FP_ONE, knownNodes)`; the input is mechanically capable of being nonzero — `state/src/node-index.ts:92-98` pushes every node with `count === 1` and nothing clamps it. It is also **read by the rules**, not merely reported: `god/system.ts:415-424` feeds it to `eraBoundaryPassed`, and `ascension.ts:258-265` gates an era on `dependence <= ascensionDependenceMax` (`god-constant.json:279`, 25%). The registry states the honest version: `metrics-registry.ts:238-240` disprovedBy — *"The fraction sitting at exactly 0 across every census of a run that demonstrably holds single-instance nodes. **It has done exactly this, which is why the sentence is here.**"* One deliberate cause: `gateway.ts:878` sheds duplicates first so the upkeep brake does not move it | The Goodhart framing survives; the mechanism named for it does not. A metric that *can* move and doesn't is a different bug from one that cannot, and needs a different fix |
| `content/spell-glosses.md` | 25 glosses; *"nothing here is in `node.json` yet"* | **ABSENT — self-declared and exact** | Parsed all `**The X** (Technique Form)` headings and set-compared against the 300 `name` values in `node.json`: **0 exact, 0 case-insensitive, 0 substring either direction**, and the count holds for all 30 including the five rejected drafts. **Positive control:** `grep -c "Alter One Letter" packages/content/data/node.json` → **1** (a real node at `:4294`); `grep -c "The Peer Review"` → **0**. `w20/compositional-content` is unmerged | Drafts, correctly labelled. The doc's own status line is accurate |
| `ages-of-magic` §0 | `scribingTraditionId` walks traditions in interned (lexicographic) order, Art of Memory is skipped, **True Naming wins and Vancian is never reached** — so every campaign number is a True Naming number by accident | **BUILT (the mechanism is exactly as described)** | `scenario/src/content-set.ts:505-512` returns the **first** tradition whose store hook has `scribingAvailable`. `tradition.json` file order is `vancian-memorization, true-naming, art-of-memory`; the function's own docstring at `:495-503` states the interned first is Art of Memory, whose store is `palace`. So: art-of-memory skipped → **true-naming returned, vancian-memorization unreachable by this path**. `long-run.ts:390` and `reference-universe.ts:504` take that default | Every default long-run and reference measurement in the corpus is single-tradition. The doc's diagnosis is correct and still live |
| `ages-of-magic` §0 open Q3 | *"an axis nobody can select is an axis nobody can measure"* | **SUPERSEDED — selection exists** | `content-set.ts:530 traditionIdNamed` refuses an unknown name rather than defaulting (`:518-529`), and is called from `reference-universe.ts:505` when a tradition is named | The *default* is single-tradition; the *axis* is selectable. A sweep arm can name Vancian today |
| `ages-of-magic` §3a | Necromancy is Corpus, **all 23 nodes authored**, and *"none of these 23 nodes is reachable today"* | **BUILT (confirmed)** | `node.json` × `cell.json`: 23 nodes on `*-corpus` cells, **0** in a `v1` cell. The v1 rectangle is exactly `{intellego, perdo, rego} × {limen, mentem, nomen, terram}` = 12 of 70 cells | Confirmed at `cf5a73a7`. The third road is authored and dark |
| `ages-of-magic` §3a | Taboo is per species; species `affinities` is *"read by nothing but the key validator"* (per W41) | **ABSENT (taboo); see evidence for `affinities`** | Taboo: no content field, no rules path. `affinities` is resolved per species in `scenario/src/content-set.ts:657-659` (`SpeciesAffinities` cache) | Taboo is the doc's own open design; recorded, not costed |
| `ages-of-magic` §2e, §2f, §2g | Paced teaching (class length by species); alliances / study abroad; familiarity per species pair capped at 1.15 | **ABSENT** | Doc-declared as design, not description. `w109/alliances` exists and is **not merged** into `cf5a73a7`. The 1.15 cap the doc itself flags as unrepresentable (fp 1177 = 1.149414 / fp 1178 = 1.150391) is not authored anywhere | Three of the doc's own proposals. Listed so the count is honest; no probe budget spent |
| `ages-of-magic` §3b | A compound is held by the **university** — *"a pattern of overlapping partial knowledge across the faculty"* | **ABSENT** | Compounds do not exist: a node names exactly one `cell` (`node.json` field list). No multi-cell spell type | §1's whole three-age progression, and §4's claim that compounds retire three measured problems |
| `place-architecture` §1 | The twelve raid constants and their metre readings | **BUILT — every value exact** | `raid-constant.json`: `battlefield-extent` 204800, `terrain-cell-size` 10240, `cast-range` 51200, `movement-per-tick` 4096, `theft-range` 16384, `objective-interaction-radius` 8192, `area-denial-radius` 12288, `detachment-range` 8192, `deployment-zone-depth` 40960, `portal-margin` 8192, `max-combatants-per-side` 32, `max-objectives-per-raid` 6. Also `portal-stability-initial` 3072000, `stability-decay-per-tick` 1024, `withdraw-stability-margin` 409600. All `tuningStatus: untuned` | The §1 derivation base is sound. §2's architecture follows from real numbers |
| `place-architecture` §6 | `combatant-base-concealment` is 0; `grimoire-burn-resist-cap` is real and live | **BUILT (confirmed)** | `raid-constant.json`: `combatant-base-concealment` = **0**, `grimoire-burn-resist-cap` = **922**. `concealment` and `ward` both have node-driven consumers per `check:consumption` | Self-declared and accurate |
| `place-architecture` §6 | *"The defender does not choose where anything sits"*; *"There are no buildings"*; *"Fire has one consumer"*; portal position is implementation | **ABSENT — self-declared** | The section's own text is the evidence. §5's generator is a proposal | The doc separates its derived parts from its aspirational ones. No correction needed |
| `species-separation-spread` | The instrument, its three thresholds, and the four assertions retired on 2026-08-14 | **BUILT — fully verified** | `scenario/src/species-separation.ts`, `bin/species-separation.mjs`, `test/unit/species-separation-spread.test.ts` all present. `ESTABLISHED_STANDARD_ERRORS = 3` (`:157`), `MIN_SETS_FOR_REFUTATION = 4` (`:177`), `CHAIN_REFUTED_FRACTION = 0.25` (`:207`), all used at `:689,:695,:749-750`. In `reference-time-to-tier.test.ts` the four kept claims are live (`:340` covers both elf pairs via `beforeElf`, `:341`, `:349`) and the four retired ones survive only as prose (`:253-256`) | The one corpus document whose every checkable claim reproduces. **Structural control:** `orc` is never bound to an `interval(...)` (`:326`), so neither retired orc claim is expressible in that file |
| `species-separation-spread` | Task 9.9 — four species separated by more than the cross-seed spread — is **UNMET** | **BUILT (unmet, and still unmet)** | `w18/academic-primitive-consumers` and `w115/enable-all-cells` are both **unmerged** into `cf5a73a7`, so neither ref's changes are on `main` and the document's `main` column is the live one | The verdict stands. Neither candidate lever has landed |
| **pinned** — `completeAffiliation` | Universities are founded and never staffed | **ABSENT — already pinned** | `reachability-triage.md` §2 "University staffing", 9 findings. Re-confirmed at this ref: `scripts/w117-gate-check.sh` → `affiliationCallSites = 0`, **GATE SHUT**, at `cf5a73a7`. The script fetches and resolves `origin/main` itself (`:66,:71`) and has a third exit for a broken probe | Cited, not re-reported. Being fixed on the unmerged `w116/affiliation-capacity` |
| **pinned** — `applyWard`, `changeTradition`, `hooksOfTradition`, `legacyGrant`, `prepare`/`isCastable`, `replay`, `destroyLibrary`, `loadWorldSnapshot` | — | **ABSENT — already pinned** | `reachability-baseline.json` (125 findings) and `reachability-triage.md` §2. All confirmed still `unreached` at `cf5a73a7` | Cited, not re-reported |

---

## Per-cohort thresholds: one pattern, a known repair, applied inconsistently

The brief asked for more instances of the trap that made cohort reallocation move zero scribes. There
are **three**, and — more usefully — the codebase already contains the repair and applies it in two
other places, which turns three bugs into one inconsistency.

**The shape:** an integer floor or a threshold applied to a **per-entity count**, where the entities
are finely keyed and individually small, with **no remainder banked**. Every such quantity is zero
forever for every entity below the threshold.

| site | the arithmetic | threshold | keyed by |
| --- | --- | --- | --- |
| `rules-world/src/populace/reallocation.ts:286` | `floorDiv(store.countOf(handle) * TRANSFER_RATE_PER_TICK, FP_ONE)` | `1 / (1/16)` = **16** | species × occupation × birth decade |
| `rules-raid/src/portal.ts:221` | `while (remaining >= tuning.detachmentStrength && …)` | **100** | the same cohort key |
| **`rules-world/src/universities/capital.ts:322`** — *new* | `floorDiv(shortfall, DEGRADATION_PER_SHORTFALL)` | **32** (fp) | per library |

The first two are documented in place. `reallocation.ts:78-85`: *"cohorts smaller than
`1 / TRANSFER_RATE_PER_TICK` never transfer at all … No remainder is banked."* `populace/demand.ts:98-104`
spells the detachment case out: *"a universe-wide target … fragments into cohorts well under 100 and
fields **zero** detachments while charging full subsistence."*

The third is new here. Unpaid library upkeep degrades an instance only once the shortfall clears 32
fp, and the residue is discarded each tick — `capital.ts:317-321`: *"a library that is one unit short
every tick forever is a library whose universe has a materials problem the economy layer will
report."* Given the vellum row above, that is the standing condition rather than the exception, so
**a library can be perpetually short and never degrade.**

**And the repair is already in the tree, twice.** `mages/promotion.ts:148-162` and
`economy/carrying-capacity.ts:485-489` both compute `integerPart` (or `whole`) plus **one RNG draw
against the remainder**, taken unconditionally so the draw count never depends on the data. Promotion
by `mageAptitude` — every species' aptitude is below `fp(1024)`, so a naive floor would zero every
cohort under `1024/aptitude` — is therefore **correctly handled**, and I record that negative
deliberately: it was the most likely fourth instance and it is not one.

So the finding is not "three floors are wrong." It is that the project has a determinism-safe
remainder idiom, uses it for births and promotions, and does not use it for transfers, detachments or
degradation.

---

## The three worst

### 1. The college has no rate it can move, and the checker that says so is outside CI

`ages-of-magic` is the progression spine, and its argument is one sentence: a college's job is
**throughput through the known** (§2), which is the only road to a third age (§2a), paced by species
(§2e), maintained against publish-or-perish (§2c). Every one of those mechanisms is a *rate*. The
three rate primitives are `research-rate`, `teach-rate` and `scribe-rate`.

Run the repository's own probe:

    npm run check:consumption
    FAIL: primitive(s) with no node-driven consumer: research-rate, scribe-rate, teach-rate

That is **93 authored effects** — 55, 19 and 19 — on the three primitives the corpus's central
document is about, and knowledge cannot move any of them. The check prints its own positive control
in the same output: eleven other primitives *do* have node-driven consumers, so the probe works and
the negative is real. The three are not unread — they are read from the **god's** blessing constants
(`content-set.ts:667-681`), which is why they can look wired. `scribe-rate` is not even that:
`world-step.ts:1666` passes `NO_BONUSES`, a frozen empty array, so it stacks to the identity every
tick and *"nothing, node or god, can move it"* (`content-set.ts:689`).

This is the "wired is not working" case in its purest form, and it explains a measurement the corpus
already carries: `skills-in-a-population` records `teach-rate` moving **+0.2%** against research's
+30.4% and reads it as a cost-threshold problem. It is not. Teaching moves 0.2% because the only
thing that can move it is a god blessing, and no amount of research changes it.

**The part that makes this the worst row is institutional.** `check:consumption` is defined at
`package.json:23` and appears in none of `verify`, `verify:nosweeps`, or `verify:full`.
`.github/workflows/ci.yml:172` states the reason: *"`check:consumption` is deliberately NOT here. It
is expected to be red."* That is a defensible decision for a known gap and an indefensible one for a
gap nobody is counting: with the check outside the gate, nothing reports when the number moves in
either direction, and the failure is the only record that 93 authored effects behave as comments.

### 2. `world-step.ts` disables three subsystems with three literals

Within eleven hundred lines of one file, three inputs are hardcoded to nothing:

| line | literal | what it disables |
| --- | --- | --- |
| `world-step.ts:799` | `scribingQueueDepth: 0` | the populace demands **zero scribes**, always |
| `world-step.ts:806` | `standingSoldierTarget: NO_STANDING_ARMY` | the populace demands **zero soldiers**, always |
| `world-step.ts:1666` | `rate(deps.primitives.scribeRate, NO_BONUSES)` | `scribe-rate` stacks to the **identity**, always |

Each is a plausible number with a real consumer behind it, so nothing throws and every downstream
metric reports a coherent universe. `computeOccupationDemand` validates its inputs
(`demand.ts:154-157`), multiplies zero by `SCRIBES_PER_QUEUED_GRIMOIRE`, and returns a demand of zero
scribes that the reallocator then correctly fails to fill.

The three are not equivalent, and the difference is the point. `NO_STANDING_ARMY` is **exemplary**: it
is a named constant carrying a hundred-line argument (`demand.ts:82-107`) for why the number cannot
be invented yet, and `world-step.ts:800-805` cites `ages-of-magic` §2b as its authority. That is a
zero somebody chose. `scribingQueueDepth: 0` is a bare literal at a call site with no name and no
comment — `unwrittenNodeCount(state)` on the unmerged `w23/populace-and-record` measures the real
value at 40–88. `NO_BONUSES` sits between: undocumented at the call site, but explained in another
package (`content-set.ts:689`), which is the worst place for it, because the explanation is invisible
to anyone reading the world step.

The blast radius compounds. Because scribe demand is zero, no cohort ever becomes a scribe; because
no cohort is a scribe, `place-architecture` §4's "Scriptorium activity" readout row and
`magical-prevalence`'s scribing pipeline both read empty state; and because `scribe-rate` is the
identity, even a scribe would not scribe faster for anything anyone discovered.

### 3. `place-architecture` §4 says its readout can be built from state that exists, and three of its nine rows cannot

§4 is the most actionable page in the corpus — a table binding each visual feature to a field, under
the rule that *"every varying feature is bound to state the simulation actually holds."* It closes:
*"the readout can be built entirely from state that already exists (§4's left column is all real
fields)."*

Six of the nine are real and well-chosen: `buildProgress`, `libraryDepth().cumulativeByTier`,
`libraryDepth().instanceCount`, `university-site {kindId}`, `libraryDependence`, and raid history —
the last of which is *more* real than the corpus believes, since raids fire on `main`
(`raids.ts:423`, `executor.ts:120`).

Three cannot be drawn:

- **"Dominant cell — `universityProfile()` → `dominantCell`."** Both symbols occur exactly twice in
  the tree: their definition in `rules-world/src/universities/profile.ts` and their re-export in
  `universities/index.ts`. Both are pinned `unreached` in `reachability-baseline.json`.
- **"Species mix of staff — populace cohorts."** The link is `UNIVERSITY_STAFF`, whose only writer in
  the tree is `universities/staff.ts:176`, inside the unreached `staffCohortsOf`. `world-step.ts:557`
  says it outright: *"`UNIVERSITY_STAFF` shipped in `WORLD_COMPONENTS` with no writer."*
- **"Scribe count — cohort by occupation."** Zero, by finding 2.

None of this is new debt — it is `reachability-triage.md` §2's nine-finding "University staffing"
row, and `scripts/w117-gate-check.sh` independently reports the gate **shut** at `cf5a73a7`. What is
new is the **document**, because §4 is the one place the corpus makes a present-tense claim about its
own buildability, and it is the claim an artist or UI engineer would act on first. A readout built to
this table would render a dominant-cell hue from an unreached function and a staff species mix from a
component nothing writes, and — since both would return empty rather than throw — would draw
something plausible and report it as a measurement. That is the failure mode §4's own opening
paragraph exists to prevent: *"a player who learns to read it will have learned something false."*

The honest repair is one line in §4 and not a line of code: mark the three rows as pending on
`w116/affiliation-capacity`, exactly as §6 already marks its five gaps. The document's own discipline
is right; it was applied to §5 and not to §4.

---

## Cross-reference sources that have themselves rotted

Recorded because the brief asked for the pinned ones to be cited rather than re-reported, and two of
the citing sources are stale at `cf5a73a7`:

- **`reachability-triage.md` §2** states *"nothing in `scenario` opens a portal."* `raids.ts:423`
  opens portals, `executor.ts:397` defaults `raids` to `true`, and `executor.ts:106` records the flip
  in its own prose. The individual symbols that row lists (`returnedWithKnowledge`,
  `strandedAttackers`, `objectiveHoldsKnowledge`) *are* still `unreached`; the reason given for them
  is not.
- **`invariants.md:153-154`** records INV-29 and INV-30 mechanisms as *"To be defined"* while
  `metrics-registry.ts:271` and `:318` define `capitalSnowball` and a banded `ascensionRate`.

Both are the shape `CLAUDE.md` names: a document read as current, contradicted by the tree it
describes.
