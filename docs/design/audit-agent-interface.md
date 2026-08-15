<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Audit: the agent/measurement and interface/presentation corpus

**Measured 2026-08-14 against `origin/main` at `0940061273605b71ab9f92838dcfc51724930bc4`**
("Ratchet the reachability check, and triage its 125 findings (#167)"). Every row below was read
through `git show origin/main:<path>` or `git grep … origin/main -- packages`, never out of the
shared checkout, which was sitting on `plan-w18` when this began.

This is an **inventory, not a fix**. Nothing here was repaired, no baseline was regenerated, no
sweep was run, and `goldens:regen` was not invoked.

Re-derive before acting on it. A measurement is a statement about the tree it was taken on, and
three of the rows below exist *because* somebody skipped that step.

---

## 0. How to read this

Four statuses, and the fourth is the one whose first draft is usually wrong:

| | |
|---|---|
| **BUILT** | the doc describes what shipped, and a check holds it there |
| **PARTIAL** | some of the specified thing exists; the row names which half does not |
| **ABSENT** | specified, and nothing in `packages/` does it — asserted only with a positive control |
| **SUPERSEDED** | the doc's *claim* is stale because the capability is live, named in the row |

**Counts: 6 BUILT · 8 PARTIAL · 13 ABSENT · 3 SUPERSEDED. 30 rows.** One row — the twelve Grungeon
suggestions — is counted PARTIAL and says in its own cell that ten of the twelve are ABSENT; it is
one row because the document is one filter, not twelve proposals.

**Two of the thirty are pinned in `scripts/reachability-baseline.json`** (125 entries) — see §3 for
why that number is so low, and why the low number is itself a finding.

Every "X does not exist" below carries a positive control, because `packages/*/src` as a pathspec
silently matches nothing in this repository and a grep on an identifier matches prose. Where a
symbol is named, the row cites a **call site**, not a mention: `universe-effects.ts` mentions
`gatherEffects` seven times in doc comments and calls it once, and only the call is evidence.

---

## 1. The table

Most severe first. Severity is *"how much of a shipped or scheduled thing this silently disables"*,
not how large the doc is.

| doc § | what it specifies | status | evidence | blast radius |
|---|---|---|---|---|
| `interface-findings.md` §1.9 → `contracts.md` §4.3 | An **event record alongside each observation**: a class from a closed enumeration, the entity/content at its own granularity, and whether the event *ended* that thing. The contract amendment landed. | **ABSENT** | Requirement is on `main`: `docs/design/contracts.md:1021–1035`. Nothing emits it: `git grep -nE "readonly events\|events\?:\|EventClass\|EVENT_CLASS" origin/main -- packages/agent-api packages/state packages/coordination` → **zero lines**. Positive control: `git grep -c event origin/main -- packages/agent-api/src` → 8 files hit, every hit a comment or an unrelated sense. Not in the ratchet: `agent-api` is excluded by name at `scripts/check-reachability.mjs:187`. | The largest single hole in the corpus. `sound-design.md` §10 items 1 and 2, §6.5's entire loss cue (a *sequenced pair* whose pause is the point), §0.4's density thresholds which pin loss at threshold 1 so it is never aggregated away, `interface-findings.md` §2.3, and `ui/tempo/`'s halt-on-loss direction. Four consumers, one missing capability, and a contract that already promised it. |
| `interface-findings.md` §1.10 (and §1.4, §1.7 — one finding three times) | `AgentSession` should expose what the package already computes: `AgentView.raw`, `ExplainProjection`, `KnowledgeCensus`. | **ABSENT** | `packages/agent-api/src/session.ts:217–247` — the interface is still exactly `reset, observe, legalActions, candidates, submit, status, outcome, accounting, illegalActionCount, rng, snapshotHash`. `observe(): Float64Array` at `:229`/`:382`. `raw` appears **once** in the whole file, at `:150`, inside a comment about seed mirroring. All three projections *are* exported: `index.ts:140, 199–202`, `knowledge-census.ts:438`. | Every consumer not already holding a `SimState` — client, viewer, recorder, debugger — reads `0.3125` where the world holds 40 favor. It also swallows §2.1: `ticksToUnteachable` is computed at `knowledge-census.ts:678` and there is no door it can come out of. |
| `observation-entitlement.md` — "the 400-slot vector becomes an *encoding* of `PlayerState` rather than the definition of it" | Steps 0–3: inventory, `project()`, `unclassifiedTraits()`, `unencodedObservables()`. Step 4: `reads`/`ignores` on `StrategyDefinition`. | **PARTIAL** | Steps 0–3 shipped: `entitlement.ts:319, 376, 459, 535`, `player-state.ts`, `observable-trait-inventory.md`. **The inversion did not happen.** `project()`/`encodePlayerState()` have no production caller — every call site is a test (`entitlement.test.ts:51,260`; `player-state-roundtrip.test.ts:79,295,312,329,345`), and `observe()` still returns the vector `observation.ts` builds. The test says so itself: *"It is two implementations, checked against each other"* (`player-state-roundtrip.test.ts:17–21`). Step 4's gate is absent — `git grep -n unacknowledgedByStrategy origin/main -- packages` → nothing, control: the other two gate names both hit. | Two implementations of the same projection, kept in agreement by one test — the shape the reachability triage calls "the dangerous one" (§3, *superseded*). And the gate that *is* the checklist, the one that would have caught `permissive-breadth`, is the one not built. Deliberate: the doc says "Step 4 waits" pending eight in-flight rebases. |
| `interface-findings.md` §5.1a → `contracts.md` §4.2 | Four actions legal during engagement (permit technique/form, defender-only forbid), locking until the raid ends. | **ABSENT**, and the branch is dead | Amendment on `main`: `contracts.md:910–931`. Code disagrees: `packages/agent-api/src/mask.ts:112` — `if (inEngagement(state)) { return mask; }` — returns no-op only. And it is never reached: `runRaid(raid: Raid): RaidOutcome` (`packages/rules-raid/src/raid.ts:1067`) takes a `Raid` and nothing else and loops to termination. `interface-findings.md` §5.1a's own instrumented control: 4 strategies × 600 ticks, engagement mask evaluated **zero** times in all four. | The real prerequisite for a playable raid is `runRaid` yielding to the agent between ticks; the mask entries are downstream bookkeeping. Recorded here because the contract now states a behaviour no test can fail on, since no test can reach the branch. |
| `strategy-dimensionality.md` §425 / `value-sensitive-acquirer.md` "forced next step" #2 | *"Today `gatherEffects` has no caller and `resourceYieldBonuses`/`fertilityBonuses` are empty arrays; wiring them is the smallest existing path"* to compositional value. | **SUPERSEDED** (2 of 3) | `gatherEffects` **is called** — `packages/coordination/src/universe-effects.ts:330`, a call, imported at `:123`. (The same file mentions it in prose at `:51, 72, 112, 130, 132, 180, 322`; only `:330` is evidence.) `resourceYieldBonuses` is wired — `world-step.ts:1114` passes `economy.resourceYield`. Still empty: `fertilityBonuses: []` at `world-step.ts:1849` (the doc says line 957 — the line number rotted, which is the cheapest available signal) and `scribeRateBonuses: []` at `:2017`. Content side confirmed: all 300 nodes in `node.json` carry `effects`, and neither bonus name is a node field at all. | The named "smallest existing path" is now the wrong instruction: the gatherer is wired and the *content* is what is empty. `vision-audit.md:276` still asserts all three arrays empty in the present tense and is now wrong about one. Anyone following the doc would go looking for a caller that exists. |
| `axis-price-sweep.md` — title, and result line 1 | *"There is no flat price at which the opening square binds."* | **PARTIAL** — body hedged, headline and citations not | The body is careful and correct: §"What this says, and it is not 'the price binds at X'" (`:206`), §"outlasting a bot's schedule, not pricing a decision" (`:219`), §"the rejection counter is not the affordability instrument" (`:189`), §"the differentiation half cannot be asked of the shipped instrument" (`:272`). What it never says, anywhere in 387 lines, is that the agent **cannot see price**: `git grep -i "price-blind\|cannot see\|does not read" origin/main -- docs/design/axis-price-sweep.md` → nothing (control: "blind" hits once, at `:144`, unrelated). The correction was written into a *different* document: `observation-entitlement.md:20`. | Two named downstream consumers repeat the unhedged form: `campaign-plan.md:1169` (*"every verb is priced, no price binds"*) and `skills-in-a-population.md:91` (*"a one-time toll is arithmetically incapable…"* — **384 runs to learn a fact about arithmetic**), where it is load-bearing for the case to build a macro model. Neither carries the price-blindness caveat, because the doc they cite does not. |
| `running-the-search.md` §"How to extend it" | `mutateOrder` swaps two entries of a preference list; the draw comes from `searchRng`, seeded by `--search-seed`. | **ABSENT** — the API described was never written | `git grep -n "mutateOrder" origin/main -- packages scripts tools` → nothing. `git grep -c "searchRng" origin/main -- packages/mc-harness/bin/search-strategies.mjs` → nothing. Positive control: the same file's own header at `:31` says *"## What it does not do yet: mutate … the generator that proposes new preference orders and re-seeds from the archive's elites is not [live]. There is no `--rounds` flag."* | An operating manual documenting a mutation genome, a flag and an RNG that do not exist, contradicted by the script's own doc comment. Two paragraphs later it correctly calls the mutant-evaluation gap "the gap" — so the doc contains both the fiction and its refutation. |
| `running-the-search.md` §"How to extend it" | *"`universities` and `ascensionPath` are currently wired to `0` — they are placeholders … Wiring them is the single highest-value change to this file."* | **SUPERSEDED** | Neither identifier is in the script: `git grep -n "ascensionPath\|'universities'" origin/main -- packages/mc-harness/bin/search-strategies.mjs` → nothing (control: `nodesKnown` hits twice). The axes on `main` are `nodesKnown`, `libraryDepth`, `terminalReason`, `spendConcentration` (`search-strategies.mjs:141–153`), each with a written argument. | The doc's "single highest-value change" is already done, so the manual is directing effort at completed work while the real gap (mutation) sits two paragraphs below marked as something else. |
| `interface-findings.md` §1.6 | A reason channel on the mask — one enum per action, `unaffordable` / `impossible` / `spent`. | **ABSENT** | `legalityMask(input): Uint8Array` — `packages/agent-api/src/mask.ts:105–107`, one bit per action, `ACTION_SPACE_SIZE` wide. No reason type is exported (`index.ts:157–158` exports only `MaskInput`, `isLegal`, `legalityMask`). Control: `unaffordable` hits 20+ sites across `rules-raid`, `coordination` and `content`; in `agent-api` it appears only in a comment, `mask.ts:181`. | Two layers specified independently and blocked on the same bit: `sound-design.md` §7's *"deny plus one strained pulse"* cue, which "predates this finding", and `ui/glow/`, which had to reconstruct the distinction client-side in `reconstructedCharge` — a function named after what it does wrong. Also the reason `illegalActionRate` reads zero on arms that can afford nothing. |
| `interface-findings.md` §1.8 | Either pad candidate lists to *k* with an explicit empty marker, or publish the live length — but stop asserting both. | **ABSENT**; the contradiction is intact | `packages/agent-api/src/candidates.ts:28` still states fixed length (*"`k` comes from `CANDIDATE_SLOTS` and never from how many candidates were found"*) and `:114` still states the opposite (*"Never pads — an absent slot is illegal"*), 86 lines apart. No length field is published; `truncate` at `:115` cuts and returns. | A policy network discovers the end of a list by spending an illegal action; a human menu changes length under the cursor. Six of seven parameterized actions never fill their list. Cheap now, a format change after policies train. |
| `interface-findings.md` §2.2 | `effort-progress` should carry a tick, so *"she set this down twenty-three years ago"* is derivable. | **ABSENT** | `packages/state/src/components.ts:692–701`: fields are exactly `subject: 'u32', kind: 'u8', nodeId: 'u16', counterparty: 'u32', progress: 'i32'`. No tick. | Costs a world-schema revision (`WORLD_SCHEMA_VERSION` is 6), which is why the doc argues rather than assumes. The most affecting fact about a set-down project stays unavailable to the interface that exists to show it. |
| `sound-design.md` §10 item 6 / `interface-findings.md` §2.4 | Per-mage: species, age, role, blessed, **and whether they hold any last-instance node**; and a read-path distinction between a node never known and one lost. | **PARTIAL** — the state exists, the boundary withholds it | `ever-known` is classified **withheld** and reaches no slot — `observable-trait-inventory.md` §"What surprised the audit" item 1, and `entitlement.ts`'s `TRAIT_CLASSIFICATION`. So §2.4's *"no state"* framing is wrong and its consequence is right. `knowledge-census.ts` computes the per-instance half (`fragileNodeIds` `:596`, `distinctLocations`, `marooned`, `condemned`) and the session does not expose it (row 2). | Rediscovery is 3× cheaper, and an agent cannot tell a cell never explored from one explored and forgotten — the two states with the most different expected value in the knowledge model. §8.2's last-copy bark, "the one of the five that does mechanical work", depends on the same bit. |
| `probable-strategies.md` §4 | *"`knowledgeHalfLife`, `libraryDependence` … are not collected by any sweep, because only the ten `reference*` measures are registered in the scenario."* | **PARTIAL** | The registry half is fixed: `REFERENCE_REGISTRIES.metrics` now joins both halves — `packages/scenario/src/sweep.ts:85–93` — and `:80–83` records that before this *"the validator would have rejected their ids at expansion, which is why `collectRunMetrics` had no production caller."* But the shipped sweep still declares only the ten: `REFERENCE_SWEEP … metrics: REFERENCE_METRIC_IDS` at `sweep.ts:155`. | The archivist and the faithful-courtier are still unfalsifiable *in the committed sweep*, though the instrument now permits the question. `design-language.md:606` reports first readings from elsewhere: censored at every horizon, 1 loss in 507 cohort observations at 240 ticks. |
| `interface-findings.md` §4.2 — *"`knowledgeHalfLife` cannot be computed — **defect**"* | Its §7 collector needs a census carrying node-id lists; the reference executor's census carries aggregate counts. | **SUPERSEDED** | Collector exists and is registered: `packages/mc-harness/src/metrics-collectors.ts:199` (`collectKnowledgeHalfLife`), `metrics-registry.ts:196`, `HALF_LIFE_QUANTILE` at `metrics-collectors.ts:89`. The census carries node-id lists: `knowledge-census.ts:143` (`readonly nodeIds`), `:578`, `:596`. | `integration-round-2-results.md:69` still reads **"instrument absent — not measurable"** and `magic-projection.md:780` still reads **"instrument absent"**. Three documents on `main`, two of them wrong, and the wrong ones are in tables people scan. Exactly the `vision-audit.md` failure `CLAUDE.md` records twice. |
| `interface-findings.md` §2.1 | `rules-magic` should publish the retention floor and the decay rate the way it publishes `libraryDepth`. | **PARTIAL**, and the underlying situation is worse than filed | Published: `masteryFloor` and `masteryDecayPerTick` at `packages/rules-magic/src/instances/decay.ts:74, 89`, consumed through an injected model at `knowledge-census.ts:184–186, 648–649` with `ticksToUnteachable` at `:413, 678`. Unreachable by any client (row 2). And `metric-constants.md` adds what the interface doc did not know: *"Nothing in the rules path raises mastery: `setMastery`'s one non-test caller is the decay pass."* | The panel's twelve-month countdown is computable and undeliverable. And mastery being monotonically non-increasing means every teachable instance descends from a god grant and is sliding down — which is a rules finding wearing an interface finding's clothes. |
| `sound-design.md` §§0.1–0.4, §§2–9 → `packages/content/data/audio` | Audio as a second, parallel content set: cues and voice-line banks, schema-validated, isolated from `contentRevision`. | **BUILT** | `packages/content/data/audio/audio-cue.json` — **56 cues**; `voice-line.json` — **10 banks, 198 lines**. Schemas at `packages/content/schema/audio/`. Loader `src/audio.ts` (`AUDIO_FILES` at `:41`), CLI `src/audio-cli.ts` + `bin/validate-audio.mjs`, wired into `npm run validate` (`packages/content/package.json:33`). Isolation asserted by `test/unit/audio-isolation.test.ts`; §3.2's arrhythmia allow-list by `audio-grid.test.ts`. | This is the part of the 1,975 lines that is real. See §4 for the full four-way split. |
| `sound-design.md` §9 → generation and audition | Generate candidates from the §9 prompts; audition and select one take per asset. | **BUILT**, and it has been run | Pure half: `packages/content/src/audio-generation.ts` (`planRequests`, `redact`). Impure half: `scripts/generate-audio.mjs`, the only credential-holding thing in a public repo, every error path through `redact()`. Audition: `scripts/audition-server.mjs` + `audition-manifest.mjs`. **`assets/selections.json` is committed with 217 selected takes** — `draconic-*` barks, `click-commit: v4-take3.mp3`. | The pipeline is not theoretical: somebody generated and auditioned hundreds of takes. The audio *files* are not in the tree, and that is by design — `.gitignore` excludes `assets/candidates/` and `assets/retired/`, and `ASSET-LICENSE.md` asserts no copyright over machine-generated audio. |
| `sound-design.md` §10 items 1–9 / §11 "the five things" | What `electron-client` has to expose, and the five sounds that are the design. | **ABSENT** — unstarted, not broken | No client package exists: `git ls-tree --name-only origin/main packages/` lists thirteen, none of them a client. `electron-client` is proposal-only per `CLAUDE.md`. Of the nine §10 items, items 1, 2 and 7 are blocked on rows 1 and 2 above; item 5 exists in `mc-harness` and not on any read path (row 14); item 6 is withheld (row 12). | See §4 for the verdict. Items 1, 2, 6 and 7 are the ones that must be settled in `agent-interface` at 0.5.0 or become a retrofit — and 0.5.0 is two releases out. |
| `subsystem-harnesses-and-uis.md` ask 1 | A harness per sub-game: **economy**, **knowledge/magic**, **god/worship** are missing. | **ABSENT**, all three | `git grep -ln "university-harness" origin/main -- packages` → `packages/rules-world/test/unit/university-lab.ts` and `university-isolation.test.ts` (positive control: the harnesses the doc says exist, do). No economy, knowledge or god equivalent anywhere in `packages/`. | The doc names the economy harness as the urgent one because the compounding loop — cast → economy improves → worship rises → god permits more → more casting — runs through it, and PR #63 cannot be judged without it. |
| `subsystem-harnesses-and-uis.md` asks 2 and 3 | Point a UI at a harness run; then a meta UI that renders a sweep through the sub-component UIs. | **ABSENT** | `ui/shared/session.js:311–316`: `openSession({ live })` **throws** — *"No live transport exists yet"* — and the only working source is `source.recording ?? '../session.json'`. Twelve UI directories exist under `ui/` (control), including `ui/console/index.html`, the doc's named host for the meta UI. | Ask 3 is the one with no precedent in the repository, and the constraint that must survive it is stated: harness → file → UI, never linking the core to a renderer. |
| `self-evolving-search.md` | *"The tuner already exists — `tune-balance.mjs` does coordinate descent over god constants … and it has been hand-run and never wired into anything."* | **PARTIAL**, and still accurate | `packages/mc-harness/bin/tune-balance.mjs` exists. No caller: `git grep -n "tune-balance" origin/main -- package.json packages scripts .github` returns only the file itself, two prose mentions in `search-strategies.mjs:161,264`, and one test comment. | The doc's own thesis — *"whenever a design decision reduces to a number nobody can defend from first principles, the deliverable is the curve"* — has a working instrument and no schedule. Its stage-0 guard (*"a number cannot be searched if the metric it moves cannot move"*) is the thing rows 13 and 14 are about. |
| `art-plan.md` §4 item 3 | *"An asset manifest committed beside every asset, recording prompt, model, parameters, reference image, and date."* | **ABSENT** for the assets already committed | `git ls-tree -r --name-only origin/main -- assets` → five PNGs under `assets/marketing/` and `assets/selections.json`. **No manifest of any kind beside the PNGs.** The style-bible pilot exists only untracked (`assets/candidates/style-bible`, under a gitignored path). | The doc's own argument: *"an asset you cannot regenerate from recorded inputs is an asset you cannot iterate on"* — the same discipline as the golden fixtures. Five assets are already past that gate without it. Low urgency (art is scheduled for 0.13.0), recorded because the rule was broken by the first assets to land, not by the hundredth. |
| `marketing-page.md` | The page: structure, copy principles, interaction, visual direction. | **ABSENT** | No page in the tree — `git ls-tree -r --name-only origin/main -- ui` lists twelve prototypes, `index.html`, `README.md`, `shared/` and two data files, none of them a marketing page. Nothing references the committed art: `git grep -n "assets/marketing" origin/main -- docs ui` → nothing, while the five files exist (control). | Unstarted future work, correctly so. Worth one line because the *assets for it* were generated and committed first, which inverts the doc's own §7 sequencing. |
| `mvee-paradigm-survey.md` §"The shortlist" | Five adoptions: `pact`, `dimension`, `threshold`, the null/dead/anti control arms, and `ForeignMagicEffect` for the Portal Rule. | **ABSENT** (proposal) | `tradition.json` holds exactly the three v1 traditions: `vancian-memorization`, `true-naming`, `art-of-memory`. `pact` appears in `packages/` only as a **rejected** hook kind in two loader tests (`loader-hard-fail.test.ts:518`, `tradition-hooks.test.ts:151`) — i.e. the loader is asserted to refuse it. `git grep -ln mvee origin/main -- packages scripts tools` → nothing reads `docs/design/imported/mvee-paradigms/`. | Correctly unstarted; the survey is a decision record, not a spec. Recorded so the two committed JSON files under `docs/design/imported/` are known to have no reader. |
| `grungeon-master-suggestions.md` S1–S12 | Twelve suggestions filtered from the guide. A1–A7 are refusals and are **not** gaps. | **ABSENT** (10 of 12) / **PARTIAL** (S6, S9) | S6 self-records its shipped half — `LIBRARY_UPKEEP_PER_INSTANCE`, `applyLibraryUpkeep` (`capital.ts:271`), and `GrimoireRecord.durability` now read by `settleLibrary`; its unbuilt half is the `material` tag. S9 is explicitly queued behind S7. S5's general defect (*"every economy primitive is a pure bonus"*) is confirmed live by row 5: the fertility and scribe-rate bonus lists are still hardcoded empty. | The document is honest about its own state and blocks S6/S9 behind copy-count reduction, which is the same concentration problem `interface-findings.md` §4.1 named. No action implied by this audit beyond "still true". |
| `strategy-dimensionality.md` §"What would move the number" #1 | *"Make the acquirer value-sensitive."* Confirmed by prefix fidelity falling below ~0.7. | **BUILT**, and it measured a null | `value-sensitive-acquirer.md` is the record of exactly this change landing and the headline claim failing. Its §"The forced next step" promotes items 2 and 3 to binding and adds a fourth: *"a universe must not be able to exhaust the reachable set."* | Included as a BUILT row because it is the one place in the corpus where a proposed fix was implemented, measured, and honestly reported as not having moved the number. Items 2–4 are open and item 2's stated path is misdescribed — row 5. |
| `design-language.md` §6 claim register + `design-language.schema.json` | Thirteen claims with ids, forms, procedures and `refutedBy`; ten mechanical properties enforced. | **BUILT** | `packages/content/test/unit/design-language-claims.test.ts` parses the markdown and enforces all ten (§7 lists them). Payload for `ui/design-dashboard/` is regenerated by `scripts/build-design-dashboard.mjs` and pinned field-by-field by `design-dashboard-payload.test.ts`. Checked for the staleness this audit was warned about: `knowledge-loss-channel-is-inert` carries verdict **`unmeasured`** (`:605`), not `holds` — the doc does not assert inertness of a channel that was since repaired. | The strongest artifact in the corpus. Its declared non-goals are correct: it does not verify a verdict, only that a claim is the kind of thing that could be settled. |
| `metric-constants.md` | Every free parameter the §7 metric definitions had to invent, with the question each answers. | **BUILT** | Asserted **in both directions** by `packages/mc-harness/test/unit/pinned-constants-doc.test.ts` against `BALANCE_METRIC_REGISTRY.pinnedConstants` — a constant in the registry and not in the table fails, and a row for a constant the registry does not declare fails too. Redefinition is gated by `metrics-definition-version.test.ts`. | The model for how a design document stays true. Also the only place in the corpus that records *"nothing in the rules path raises mastery"* and *"the fix is per-slot accounting in `agent-api`, not arithmetic here"* — the latter an open ask on `agent-api` that no other doc carries. |
| `observable-trait-inventory.md` | 108 traits: 12 observable, 19 aggregated, 76 withheld (70 `not-yet-decided`), plus declared unencoded gaps. | **BUILT**, and it describes what shipped | Backed by `entitlement.ts`'s `TRAIT_CLASSIFICATION`, `TRAIT_CLASSES` (`:73`, four-way — the shipped classification added `ambiguous` to the design's three) and `DECLARED_UNENCODED` (`:420`). It records its own two mismatches with the design doc rather than papering them: `WORLD_COMPONENTS` is **20**, not the doc's 21, and `project()` takes `ObservationInput`, not `WorldState`. | The one doc in the corpus that names the ref, dates itself, and corrects its own design document in the same file. Its §"What surprised the audit" is the evidence for row 12. |
| `scripts/check-reachability.mjs` scope (cross-cutting) | The ratchet examines nine rules-path packages and excludes four by name. | **PARTIAL** — the gate stops at the seam this audit is about | `RULES_PATH_PACKAGES` at `:167` lists nine; `EXCLUDED_PACKAGES` at `:187` excludes `agent-api`, `mc-harness`, `server`, `gym-bridge`, each with a stated reason. Confirmed against the pinned findings: `grep -c "packages/agent-api/"` in `scripts/reachability-baseline.json` → **0**; same for `mc-harness`, `server`, `gym-bridge`. | The exclusion is reasoned and mostly right — those packages' consumers are outside the repo. But `agent-api`'s reason (*"an export with no in-repo caller is the normal case"*) does not hold for `project()`, whose intended caller was `agent-api` itself. Consequence: **rows 1, 2, 3, 9, 10 and 12 can never appear in the 125.** Two of the thirty rows here are pinned in the baseline; the rest sit in docs or in the excluded packages. |

---

## 2. The three worst

### 2.1 The event record: a contract amendment with no implementation, and four consumers waiting

`contracts.md` §4.3 is not silent about events any more. It was amended — `:1021`–`:1035` — and the
amendment is unusually careful. It requires a class from a closed enumeration, the entity *at its
own granularity* rather than the aggregate the observation buckets it into, and **whether the event
ended that thing**, described as *"a transition, not a property"*. It even argues against its own
first draft: the last-instance bit *can* be partially reconstructed from a frame diff — `nodesKnown`
is derived from `count(instances) > 0`, and in the reference run the decrement happens once, at tick
274, `perdo-mentem`, 3 → 2 — and what a diff cannot recover is identity, vessel, causation, and
anything that nets.

Nothing emits it. The probe is
`git grep -nE "readonly events|events\?:|EventClass|EVENT_CLASS" origin/main -- packages/agent-api packages/state packages/coordination`,
which returns zero lines; the positive control is that `event` as a bare string hits eight files in
`agent-api/src`, every hit a comment or an unrelated sense (`eventual`, `preventedFraction`). This is
the "confirm the check works before believing the negative" rule applied: the narrow grep is empty,
the wide grep is not, so the emptiness is about the capability and not about the pathspec.

What makes this the worst row is not the size of the hole; it is the **number of independent designs
already resting on it**. `sound-design.md` §6.5's loss cue is a *sequenced pair* — a death mark, a
pause, then the loss — and the document is explicit that "the pause between the two is the sound of
finding out", which is a causal claim a frame diff cannot make. §0.4's density rule needs an
events-per-tick count *per class* to choose between discrete sounds and a continuous texture, and it
pins loss at threshold 1 specifically so loss is never aggregated away. §10 items 1 and 2 ask for the
same thing a third time. `interface-findings.md` §2.3 wants displacement at the project bound to
appear in it. Four requirements, filed separately by three sessions, all of which resolve to one
missing capability — and the interface doc predicts what happens next: *"an answer shaped for any one
of them alone will be re-litigated twice."*

And it cannot be caught by the ratchet. `agent-api` is excluded at `check-reachability.mjs:187`, so
this gap is invisible to the one automated check whose entire job is finding built-but-unwired.

### 2.2 The session is the bottleneck, and three findings are one finding

`AgentSession` still offers exactly eleven methods (`session.ts:217–247`), unchanged from when
`interface-findings.md` §1.10 recorded it. Meanwhile the package around it exports
`AgentView.raw` — which `view.ts`'s own comment calls *"the reproducible artefact"* —
`ExplainProjection` (`index.ts:202`) and `knowledgeCensus` (`knowledge-census.ts:438`). It is the
only door a client has, and it is narrower than the package it wraps.

The compounding is what makes this severe rather than tidy. `interface-findings.md` §2.1 filed
"mastery trajectory is not published" against `rules-magic`; `rules-magic` **does** publish it
(`instances/decay.ts:74, 89`) and `agent-api` **does** compute the countdown from it
(`knowledge-census.ts:678`, `ticksToUnteachable`), and none of it can leave the package. §1.4's
explain channel and §1.7's integer observation are the same shape. The interface doc reached this
conclusion itself — *"every finding here phrased as 'the read path does not carry X' should be re-read
as 'the session does not expose X'"* — and narrowed a contract amendment on the strength of it. Then
nothing was added to the session.

§1.7's tripwire is worth restating because it degrades quietly. Today the integers are recoverable:
every descriptor in the layout is `ratio` or `flag`, so `scripts/record-session.mjs` reconstructs
them and `normalization-inversion.test.ts` pins that it can. But `NORMALIZATION_RULES` also declares
`log-bucket` and `bounded`, and the first channel to adopt either makes every reconstruction silently
lossy — in a renderer, months later, looking exactly like a rendering bug.

### 2.3 The entitlement reducer landed as a second implementation, and the checker that would say so is switched off for that package

`observation-entitlement.md` proposed inverting a relationship: `PlayerState` becomes the definition
of what a player knows, and the 400-slot `Float64Array` becomes *an encoding of it*. Steps 0–3
shipped and are genuinely good — `unclassifiedTraits()` and `unencodedObservables()` at
`entitlement.ts:319` and `:459`, both with `assert*` wrappers and tests, and a 108-trait inventory
that names `ActionCostTable` as a declared gap rather than leaving it absent.

The inversion did not happen. `observe()` still returns the vector `observation.ts` builds
(`session.ts:382`), and `project()`/`encodePlayerState()` have **no production caller** — every call
site is a test. That is not an oversight to be reported as one: `player-state-roundtrip.test.ts:17–21`
says it deliberately, *"`project()` is an **independent** re-derivation of every aggregate … It is two
implementations, checked against each other."* As a proof of faithfulness that is exactly right. As a
steady state it is the thing `reachability-triage.md` §3 spends its most useful section warning
about: two implementations of one capability, where the live one is not the named one, and deleting
or wiring either is a decision nobody has framed as a decision.

Two consequences follow, and they point in opposite directions, which is why this is a row rather
than a repair.

**First, the gate that motivated the whole design is the one not built.** The defect
`observation-entitlement.md` opens with is that `permissive-breadth` cannot see price and so never
notices that unaffordability substituted its action. The gate that would make that impossible to
forget is `unacknowledgedByStrategy` — step 4, `reads`/`ignores` on `StrategyDefinition` — and it is
absent (`git grep -n unacknowledgedByStrategy origin/main -- packages` → nothing; control: the other
two gate names both resolve). The doc defers it explicitly and for a good reason (eight rebases in
flight, `StrategyDefinition` is the conflict surface). It remains true that the classification gates
that shipped classify *traits*, and the checklist that would catch the next `permissive-breadth`
checks *strategies*.

**Second, the ratchet cannot see any of this.** `check-reachability.mjs:187` excludes `agent-api`
by name, reasoning that its consumers are the Electron client, the server and the Python bridge, so
"an export with no in-repo caller is the normal case, not a finding". For `observe`, `submit` and
`legalActions` that is correct. For `project()` it is not: its intended caller was `agent-api`
itself. The measured consequence is that **zero** of the baseline's 125 findings are in `agent-api`,
`mc-harness`, `server` or `gym-bridge` — verified by grep against
`scripts/reachability-baseline.json` — and six of this audit's rows sit in exactly that blind spot.

---

## 3. What was already pinned

**Two of thirty.** The reachability baseline (125 entries, `scripts/reachability-baseline.json` on
`0940061`) and its triage (`docs/design/reachability-triage.md`, measured at `e2b89d8` — a
*different ref*, which the triage names and which is why both SHAs appear here) overlap this corpus
almost not at all:

- **`changeTradition`, `RESOLUTION`, `hooksOfTradition`** — pinned, and triaged in
  `reachability-triage.md` §2 as *"`agent-api` publishes a change-tradition action and `mc-harness`'s
  strategies name it, while the rules function that would execute it has no caller."* This is the
  supply side of `interface-findings.md` §5.3, which files the same action as *out of reach, not
  expensive* from the price side. Two documents describing one action from opposite ends, neither
  citing the other.
- **`scenario`'s twelve tooling-only findings** (`censusLine`, `claimRate`, `BALANCE_RUN_METRIC_IDS`,
  `REFERENCE_SWEEP`, …) — pinned and correctly classified as tooling. `BALANCE_RUN_METRIC_IDS` is the
  symbol behind row 13's half-fix.

Everything else in this audit is either (a) in a package the ratchet excludes by design, (b) a
document-level claim about code rather than a symbol, or (c) a mechanism that does not exist at all
and therefore has no symbol to be unreached. **A ratchet counts symbols nothing calls; it cannot count
requirements nothing implements**, and this corpus is mostly the second kind.

---

## 4. Verdict on `sound-design.md`

**Is any of those 1,975 lines reachable from a running build? Yes — about a third of the document,
and more than the question implies. The rest is not a gap.**

The document splits four ways, and conflating them is what makes "is it wired?" unanswerable:

1. **Constraints, enforced by tests — reachable.** §§0.1–0.4 are not prose. §0.1 (*audio is a
   projection of state and computes no rules*) is quoted as a governing rule inside
   `agent-api/src/knowledge-census.ts:214`. §0.2's isolation from the simulation RNG and the
   `contentRevision` separation are asserted by `packages/content/test/unit/audio-isolation.test.ts`.
   §3.2's arrhythmia — *off-grid means wrong* — is asserted by `audio-grid.test.ts`, which the type
   file at `audio-types.ts:31` says exists because *"§3.2 makes arrhythmia the entire reason"* the
   allow-list is narrow.
2. **Content, authored and validated — reachable, and in `npm run validate`.** 56 cues and 10
   voice-line banks holding 198 lines, against JSON Schemas, loaded by `src/audio.ts`, validated by
   `bin/validate-audio.mjs`, wired at `packages/content/package.json:33`. The §9 prompts and §8 lines
   are carried *verbatim* in the data and licensed CC BY-SA 4.0 in `ASSET-LICENSE.md`. Against §9.6's
   own budget of ≈520 material counts and ~250 voice lines, the authored set is roughly 11% of the
   cues and 79% of the lines.
3. **Generation and audition — built, and demonstrably run.** `src/audio-generation.ts` (pure) +
   `scripts/generate-audio.mjs` (the only credential-holding script in a public repo, every error
   path through `redact()`) + `scripts/audition-server.mjs`. The proof it ran is
   `assets/selections.json`: **217 assets with a chosen take**, committed.
4. **Playback — absent, and correctly so.** §10 assigns it to `electron-client`; no client package
   exists (`git ls-tree --name-only origin/main packages/` lists thirteen, none a client), and
   `electron-client` is proposal-only. §11's five things — the click language, teaching on the
   backbeat, loss off-grid, the portal transition, the species barks — have content and prompts and
   no renderer. **That is unstarted future work, not a gap.**

**Where it *is* a gap** is narrow and specific, and it is the part §10 warned would become a retrofit:
four of the nine read-path requirements have to be settled in `agent-interface` at 0.5.0, and none
of them has been. Items 1 and 2 (classified per-tick event deltas, and counts alongside them) are row
1. Item 7 (the explain channel) is row 2 — computed, exported, not on the session. Item 6's
last-instance bit is row 12 — withheld at the entitlement boundary. Item 5 (a balance metric on the
client's read path) exists in `mc-harness` and nowhere a client could reach. The audio design is not
waiting on audio work. **It is waiting on the observation boundary**, which is the same thing three
other documents in this corpus are waiting on, and it is the only one of the four that already wrote
down what the missing bit should sound like (§7's strained pulse for insufficient favor, §2.2's
layered deny).

One check worth recording because it nearly produced a wrong finding: the first grep for "what reads
`packages/content/data/audio`" returned `agent-api/src/knowledge-census.ts:214`, which looked like a
consumer and is a **doc comment quoting §0.1**. Confirmed as a mention, not a call. And the absence of
`.wav`/`.mp3` files in the tree is **not** evidence the pipeline never ran — `assets/candidates/` is
gitignored on purpose and `ASSET-LICENSE.md` explains the licensing posture behind it. The
discriminating evidence is `assets/selections.json`, which is committed.

---

## 5. What this audit does not say

- It does not say any of the ABSENT rows should be built. Several are correctly unstarted
  (`marketing-page.md`, `mvee-paradigm-survey.md`, `sound-design.md` §§10–11, ten of the twelve
  Grungeon suggestions), and the owner has stopped baseline work until wiring is complete.
- It does not re-run any measurement. Where a doc reports a number, this audit checked whether the
  *mechanism* the number describes is in the tree, not whether the number is still correct.
- It does not settle whether excluding `agent-api` from the reachability ratchet is wrong. It records
  that the exclusion is reasoned, that the reason does not cover `project()`, and that six rows here
  are consequently invisible to the gate.
- Row 6 does not say `axis-price-sweep.md` is wrong. Its body is careful and its arithmetic holds.
  It says the title, the five-line summary and both downstream citations state a conclusion the
  instrument could not have reached, and that the correction lives in a document those citations do
  not read.
