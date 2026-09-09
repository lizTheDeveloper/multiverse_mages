<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Audit: the magic design corpus against the built tree

**Measured 2026-08-14 against `origin/main` at `0940061` — "Ratchet the reachability check, and
triage its 125 findings (#167)".** Every file:line below was read at that SHA, in a worktree on
`w194/audit-magic` branched from it. Nothing here changes code, content, a baseline or a fixture.

**Scope.** Seven documents: `magic-projection.md` (975), `depth-and-skill.md` (880),
`opening-square.md` (670), `metis-authoring.md` (542), `anti-requisites.md` (361),
`metis-from-use-results.md` (351), `scribing-fidelity.md` (257).

**`main` advanced during the audit, and every cited line was re-checked against the new tip.**
`origin/main` moved `0940061` → **`cf5a73a7`** (PR #103, `populace-recast`) while this was being
written. The load-bearing evidence in §3 was re-read at `cf5a73a7` and is **byte-identical**:
`rival-universe.ts:219`/`:368`, `universe-effects.ts:330`, `world-step.ts:1302`, `:799`, `:1849`,
`:2017`, and `interventions.ts:393`. The table's line numbers therefore hold at both SHAs. The
measurement itself was not re-taken.

**Re-derive before acting on this.** It is a statement about `0940061`/`cf5a73a7` and about two
unmerged pull requests as they stood on 2026-08-14. Per `CLAUDE.md`, a document is not a ref for the
code it describes — including this one.

---

## 0. How to read the status column

Four states, because two would have been wrong about ten of these rows.

- **BUILT** — specified, implemented, and reached from the world loop.
- **PARTIAL** — implemented and reached, but the magnitude, the input or the coverage does not
  deliver what the document specifies. *Wired is not working.*
- **ABSENT** — the capability is not in the tree under any name. Every ABSENT row carries a probe
  and its positive control.
- **SUPERSEDED (by what)** — the document's claim of absence is **stale**: the capability is live
  under another name or another call path. Five rows. Each one would have cost an investigation
  ending in *"it already works"*, and four of them are stated in the present tense by a document on
  `main`.

**Probe discipline.** `git grep -- packages/*/src` silently matches nothing; every probe below uses
`-- packages`. A mention is not a call: "no caller" rows were established by listing all occurrences
and subtracting the definition, the re-export and `/test/`. Absence probes were run against a
positive control in the same invocation (`corruption` returns 3 hits from the same grep that returns
0 for `permit-sentiment`).

---

## 1. The table

Most severe first. "Blast radius" is what breaks, or stays broken, while the row stands.

| doc § | what it specifies | status | evidence | blast radius |
| --- | --- | --- | --- | --- |
| `opening-square` §9b, §10h | The looting shelf selects on the **raiding universe's ruleset** | **PARTIAL — built on the wrong key** | `packages/scenario/src/rival-universe.ts:367–368` selects the shelf with `entry.record.v1 === true`; same predicate at `:219`. The ruleset masks are **written twelve lines later in the same function** (`:380–381`, both set to all-ones) and never read as the selector | The whole loot channel answers about the **content** flag while `raid-constant.json`'s gloss describes the **god's** gate. They coincide only while exactly twelve cells are enabled. Under #137 the shelf is 0 of 300 and `foreign.length === 0` early-returns. Hard prerequisite for #137; `magic-projection` §7.6's smuggling reading rests on it |
| `magic-projection` §7.5 | *"`gatherEffects` … has no non-test caller anywhere in `packages/`, verified against this tree"* | **SUPERSEDED** by `packages/coordination/src/universe-effects.ts` — imported at `:123`, **called at `:330`**, reached from `world-step.ts:697` via `universeEconomyBonuses` | Probe: `git grep -n 'gatherEffects' -- packages` → the only non-test, non-definition, non-re-export occurrence is `universe-effects.ts:330` | The doc's headline — *"the only authored magic that currently changes the simulation is a favor trickle"* — is false at this SHA. `metis-from-use-results.md` §9 already flags the claim as *"stale everywhere it appears"* and names four docs plus `scripts/check-primitive-consumption.mjs` and `consumption.ts`'s header. **Two documents on `main` contradict each other and the stale one is the one people read** |
| `magic-projection` §7.5 | `world-step.ts` hardcodes `resourceYieldBonuses: []`, `fertilityBonuses: []`, `scribeRateBonuses: []` | **PARTIAL — one of three wired** | `packages/coordination/src/world-step.ts:1114` now passes `resourceYieldBonuses: economy.resourceYield`. **`fertilityBonuses: []` survives at `:1849`** and **`scribeRateBonuses: []` at `:2017`** | Two primitives still have no node-driven channel at all. Every `fertility` and `scribe-rate` magnitude in `node.json` is unreachable from a run, whatever the ruleset |
| `magic-projection` §7.1 | A cost attached to **permitting**, to match the two attached to forbidding | **ABSENT** | `packages/coordination/src/god/interventions.ts:393–395` still reads `const stranded = permitting ? { inert: 0, known: 0 } : strandedByAxis(...)` (doc cited `:390–393` — line drift, claim intact). `packages/rules-magic/src/instances/decay.ts:74–77` unchanged. `packages/content/data/god-cost.json` still prices `permit-technique` and `forbid-technique` at 8192 each | The doc's own *"one finding here that stands without accepting any projection."* A sufficient mechanical explanation for `permit-then-idle` at 40/40, unchanged and unaddressed at a SHA 60+ commits later |
| `scribing-fidelity` "Also required" | Scribe demand derived from a real queue | **ABSENT** | **`scribingQueueDepth: 0`** hardcoded at `packages/coordination/src/world-step.ts:799` (doc cited `:774` — line drift, claim intact). `packages/rules-world/src/populace/demand.ts:160` multiplies it by `SCRIBES_PER_QUEUED_GRIMOIRE` | Scribe demand is permanently zero; a universe's only scribes are the ones founding seeded. Measured in the doc: books per 20-year window `633 / 209 / 44 / 6 / 0 / 0 / …`. **Every fidelity mechanic below is unmeasurable until this is fixed**, and doing them in the other order adds decay to a scriptorium that has already stopped |
| `magic-projection` §7.5a | `advanceConstruction` has no non-test caller; construction is passed a hardcoded `0` materials claim | **SUPERSEDED** | Called at `packages/coordination/src/world-step.ts:1302` with `materials: budget`, where `budget = Math.max(0, input.stone)` (`:1279`) and the spend is charged back at `:1013` as `construction: construction.stoneOwed`. `world-step.ts:973` records the history in its own comment | The doc calls this *"the highest-leverage single disconnection in the tree"* and *"the largest projected payoff … behind the smallest disconnection."* It is wired. `anti-requisites.md` already describes severing it as a negative control, which is a description of a live call site |
| `magic-projection` §7.5 (pipeline half 2) | `stackContributions` as the documented second stage of the effect pipeline | **SUPERSEDED** by `primitives`' `stackMagnitudes` | `packages/rules-magic/src/effects/index.ts:18` draws the route as `instances ──gatherEffects──▶ contributions ──stackContributions──▶ outcomes`. Probe: `git grep -n 'stackContributions' -- packages` → non-test occurrences are the definition (`stack.ts:119`), the re-export (`index.ts:49`) and two prose comments. **No caller.** Pinned in `scripts/reachability-baseline.json`; `reachability-triage.md` §3: *"`universe-effects.ts` gathers contributions and stacks them per primitive itself"* | Half the documented route is live and half is a second implementation nothing switched to. Deleting it is also a decision about which of two stackers is the real one — the reason `reachability-triage.md` calls this category the dangerous one |
| `magic-projection` §6.1 | `permit-sentiment.json`; worship split into mage and populace constituencies | **ABSENT** | `git grep -rn 'permit-sentiment' -- packages` → **0 hits** (same invocation returns 3 for `corruption`) | The doc's own first-ranked mechanic and its stated direct answer to the negative control |
| `metis-authoring` §5 | A rules-path consumer for `knowledgeKind` | **ABSENT on `main`; built in unmerged #170** | Probe: `git grep -n 'knowledgeKind' -- packages` minus `/test/`, `data/` → only `packages/content/schema/node.schema.json` and `packages/content/src/types.ts:197`. `git merge-base --is-ancestor refs/remotes/pr/170 origin/main` → **not an ancestor** | 29 mētis markings are inert authored data. The doc says so itself (*"authored data with no consumer"*) and it is still true. #170 (`w190/scribing-fidelity`) adds `packages/rules-magic/src/instances/study.ts` (+213) and is the first thing to make the field load-bearing |
| `scribing-fidelity` "corrupted grimoires" | Mētis fraction per copy; a `corrupted`/`discovered` pair | **ABSENT on `main`; built in unmerged #170** | #170 adds `study.ts`, `scribing-fidelity.test.ts`, `knowledge-corruption.test.ts`, a new `sim-core` RNG stream, `state` components and a `WORLD_SCHEMA_VERSION` migration (`git diff --stat origin/main...pr/170`) | The reading edge did not exist on `main` at all: knowledge entered a mind by research, teaching and theft only. A library was research *capital*, never an instance anybody opened |
| `metis-from-use-results` §6 | A `practice` autonomy goal that **restores mastery** and makes the economy read work performed | **PARTIAL / SUPERSEDED in part** | `GOAL.applyMagic: 9` at `packages/rules-world/src/autonomy/goals.ts:85`, wired at `packages/coordination/src/world-step.ts:1669` with arithmetic in `packages/rules-world/src/economy/application.ts`. It competes for the month and costs rations — four of the doc's five properties. **The fifth is missing**: `git grep -n 'restoreMastery\|masteryRestor' -- packages` → **0 hits**, and `packages/rules-magic/src/instances/decay.ts:115` still says *"practice does, and practice is an operation somebody has to perform"* | The publish-or-perish counterweight is still absent, and mētis-by-disuse still has no accrual site. The recommended hook is half-built and reads as done |
| `anti-requisites` "one path not covered" | The exclusion resolver on the rival stand-in | **ABSENT** | `git grep -n 'exclusion\|excludes\|ExclusionResolver' -- packages/scenario/src/rival-universe.ts` → **0 hits** (control: same grep over `packages/coordination/src/world-step.ts` → `:120`, `:219`, `:224`) | A rival mage stealing on an **inbound** raid is unchecked. Named in the doc as *"a one-argument change … left out on purpose"*. Moves that engagement's loot and the `RaidRecord` metrics derived from it |
| context + `anti-requisites` | An exclusion pair the default opening can reach | **ABSENT** | `packages/content/data/cell.json` carries exactly **2 of 70** cells with `excludes` — `creo-ignem` ⊥ `creo-umbra`, both `destructive`. `creo` is outside `intellego · perdo · rego` × `mentem · terram · limen · nomen` | The one mechanic built to cost the permissive strategy something cannot bite the position every balance baseline, every golden fixture and every separation reading actually plays |
| `opening-square` §3b F2, §10b | Portal content in more than one cell; `contracts.md` §8 keyed to the **actual square** | **ABSENT** | Both `portal` effects sit in `rego-limen` (computed over `node.json`: `{'rego-limen': 2}`). The §8 requirement is written against the `v1` flag | *"Two portal nodes in one cell is a thin thread for the game's headline feature to hang from."* 0 of 70 1×1 openings and 13 of 910 2×2 openings can ever raid — **PvP unreachable for 98.6% of 2×2 universes** |
| `opening-square` §5c, §10f | Pricing the permit verbs, so expanding the square is scarce | **ABSENT** | `packages/content/data/god-cost.json`: `permit-technique` 8192, `permit-form` 4096, both `"tuningStatus": "untuned"` | *"The square is only as real as the price of leaving it."* Four of twelve strategies erase the opening square inside 1,200 ticks for 84 favor, once |
| `magic-projection` §6.3, `opening-square` §3b F3 | `lifespan` and `fertility` reachable from nodes | **ABSENT** | `packages/rules-magic/src/effects/coverage.ts:69` — `PRIMITIVE_COVERAGE_EXCLUSIONS = ['fertility', 'lifespan']`, reason at `:59–68`. `fertilityBonuses: []` at `world-step.ts:1849` | The campaign's *"one genuine null"* — knowledge does not convert into population — is a fact about the opening, not about the mechanic. Cheapest of the doc's five mechanics and still not taken |
| `opening-square` §3b F4 | A units guard on `lifespan` magnitudes | **ABSENT** | 17 authored `lifespan` magnitudes span **18 → 480** (computed over `node.json`), declared `additive-months`, against a cap of 360–9,000 months. No unit check anywhere | Latent, and it detonates on the day the consumer is wired: all 17 nodes four orders of magnitude too small, presenting as a balance problem rather than a units problem |
| `magic-projection` §7.7 | `permits()` on the worship-yield accounting | **ABSENT** | `packages/coordination/src/god/system.ts:649–656` — `yieldSources` gates only on `knowledge.instanceCount(nodeId) > 0`; no `permits()` in the function | A forbidden-but-still-held `worship-yield` node keeps generating favor until its instances finish decaying. Small, and on the same side of the ledger as §7.1 |
| `magic-projection` §7.6 | A `permits()` check at looting, or a model for permit-as-retrieval | **ABSENT (deliberate)** | `packages/rules-raid/src/consequences.ts:132` and `:322` call `createInstance` with no ruleset check; the header at `:185–190` records it as intended | A universe can hold what it forbids, dormant, and permit the axis later to wake it. Permitting in year 10 and year 90 are different acts and the model represents neither |
| `magic-projection` §6.4 | The permitted ruleset as a fifth `computeOccupationDemand` input | **ABSENT** | `packages/rules-world/src/populace/demand.ts:114–127` — `DemandInputs` holds exactly four fields: `constructionBacklog`, `scribingQueueDepth`, `universityCapacity`, `standingSoldierTarget` | *"The occupation census in year eighty is a readout of the ruleset"* has no mechanism. Rated **Subset: fully** by the doc — all three demand shifts are expressible today |
| `scribing-fidelity` §"raid subsystem" (1) | A `corrupt` intent and a corruption primitive | **ABSENT on `main`** | `packages/rules-raid/src/raid.ts:190` — `Intent.kind` is `'cast' \| 'steal' \| 'move' \| 'objective' \| 'withdraw' \| 'guard'`. No `corrupt` | The first genuinely new primitive proposed in the campaign. #170 touches `raid.ts` (+175) and adds `knowledge-corruption.test.ts` |
| `scribing-fidelity` §"raid subsystem" (3) | A detection/stealth model — *"leave undetected"* as an outcome | **ABSENT** | `git grep -rn 'stealth\|undetected\|detection' -- packages/rules-raid/src` → **1 hit, and it is prose**: a doc comment at `arbitration.ts:488`. No symbol, no field, no branch (control: same grep shape over `raid.ts` for `Intent` → 5 hits) | *"Sneak in, corrupt, leave"* has no representation. "Leave undetected" cannot be a distinct outcome from "leave" |
| `scribing-fidelity` §"raid subsystem" (5) | Anything that arms a raider | **ABSENT** — and the preparation half is pinned dead | Doc measured **zero combat attempts** across 61 raids / 80,615 combatant-ticks. `reachability-triage.md:59`: `prepare`, `isCastable`, `preparationCost`, `costSplit` unreached — *"nothing splits a cost across preparation and cast, and nothing asks whether a spell is castable before it is cast"* | Roadmap item (5), and the doc puts it **first** because until something arms a raider the other four cannot be measured, only asserted |
| `magic-projection` §5.2 (Vim row) | `ward` as a live mitigation, cap 90% | **PARTIAL** | `applyWard` is pinned unreached in `scripts/reachability-baseline.json`; `reachability-triage.md` §2: *"Wards stack into a fraction that is never applied to damage"* | The Vim commitment row lands on a primitive that stacks and then never fires. Every projection about counter-magic inherits it |
| `magic-projection` §3.8, §6.5 | Ignem/Perdo making an archive mortal | **PARTIAL** | `destroyGrimoire` **is** live (`rules-raid/src/consequences.ts:241`, `:265`). `destroyLibrary` and `grimoiresIn` are pinned unreached; `instances/subsystem.ts:116` records that an unshelved book is one `grimoiresIn` cannot see | An archive burns book-by-book. A library cannot be destroyed as a unit, so the Sealed Archive's counterfactual is only half-modelled |
| `magic-projection` §7.3 | Whether *Intellego Mentem* reaches a memory palace | **ABSENT (open — author's call)** — and the palace's consequences are pinned dead anyway | Doc records it unresolved. Independently: `palaceLibraryDepth`, `perishesWithHolder`, `scribeAvailability` are pinned unreached; `reachability-triage.md` §2: *"The consequences of a store kind … are computed by nothing"* | The single differentiated tradition's mechanical identity turns on one permit — and the differentiators it would lose are not computed today either. *"It should be resolved before any content author writes an* Intellego Mentem *node"* |
| `magic-projection` §7.4 | Which ruleset gates a portal's **arrival** | **ABSENT (open — author's call)** | `portalPlan` checks the initiator's ruleset only. `releaseAbroad` and `populatePreparedSpells` pinned unreached — *"Prepared spells do not cross a portal"* | The doc's *"most valuable open question."* Host-gated makes Limen the most interesting switch in the grid; attacker-gated makes it the least. Decides an entire archetype |
| `opening-square` §3b F1 | A **square-relative** prerequisite-reachability check | **ABSENT** | `v1-unreachable-prerequisite` exists only at `packages/content/src/load.ts:930`, keyed on the `v1` flag; `packages/content/src/diagnostics.ts:46`. No general version | 249 nodes have never been asked the question. 9,420 of 10,010 3×4 squares hold at least one unreachable node, and nothing checks it |
| `opening-square` §6 + `depth-and-skill` §4 | Compound-spell arity — a spell naming two or three cells; a **composition operator** in the schema | **ABSENT** | **0 of 300** nodes carry a list-valued `cell` (computed over `node.json`); `node.json` has a single `cell` field. Independently stated by `depth-and-skill` §4's lever table: *"201 of 300 nodes carry exactly one effect; two effects are two independent scalars stacking by their primitive's declared rule. **There is no composition operator in the schema**"* | `ages-of-magic.md`'s second and third ages have no mechanism. *"A civilization is known by its pairings"* cannot be delivered by an opening square. Two documents reach this from opposite directions — content arity and depth levers — which is the strongest corroboration in the corpus |
| `opening-square` §6 | Mage-driven discovery of techniques and forms | **ABSENT** | Growth is `permitTechnique` / `permitForm` only — the god's favor, not the university's effort | *"An academic cannot discover a technique. That is a real gap between the sentence and the build"* |
| `anti-requisites` open 2 | A `refused` pair in shipped content | **ABSENT** | Both shipped exclusions are `"resolution": "destructive"` (`cell.json`, 2 of 70 cells) | Half the schema is unexercised; `schema-constraint-liveness` proves only one branch live |
| `anti-requisites` open 3 | Teaching refusing before the desk (frontier filter) | **ABSENT (deliberate)** | Enforcement is at `createInstance` only — the convergence point for all five acquisition paths | A mage can commit effort to a node that will be refused when it completes. Left out on purpose so the enforcement path was not measured untested |
| `magic-projection` §4.7 | A guard that *Creo Terram* cannot create `landUnits` | **ABSENT** | No loader check on the `landUnits` field; `git grep -n 'landUnits' -- packages/content/src` → schema/type only | The doc names it *"the single most natural content mistake in the grid"* and the rebuild of `carrying-capacity.ts` after `K` reached 289,997 is the reason it matters. Nothing stops the first content author who tries |
| `magic-projection` §4.8 | A guard that *Muto Vim* cannot alter the primitive registry (INV-15) | **ABSENT (recorded as a trap)** | Recorded in the doc as a trap rather than a proposal; no schema or loader constraint expresses it | INV-15 would be disproved by inline magnitude arithmetic in any capability. The trap is documented and unenforced |
| `magic-projection` §7.2 | An INV-23 carve-out for universes permitting *Muto Corpus* | **ABSENT (open — author's call)** | Recorded as found rather than reconciled | An invariant written to catch a tuning accident would fire on a mechanic working as designed |
| `magic-projection` §4.4 | *Perdo Fatum* removing a node from `godState.lastEverKnown` | **ABSENT** | `lastEverKnown` is written; no removal path | The only operation in the projected grid producing an *irreversible* civilizational loss. Both halves (`lastEverKnown`, INV-17's 3×) already exist |
| `metis-authoring` §6, finding 1 | The spec naming the **third** mind-reading vector | **ABSENT** | `mm-translate-the-expert` (Muto Mentem, t3) is mind-to-mind and the proposal names only *Intellego Mentem* and *Rego Nomen* | *"Universities that count two theft vectors are counting the two that are prosecutable."* The spec should name it or say why it does not apply |
| `metis-from-use-results` §5a | *"Nine goals … none of them applies magic to production"* | **SUPERSEDED** | `GOALS_IN_ORDER` holds **ten** (`packages/rules-world/src/autonomy/goals.ts:100–111`); the tenth is `GOAL.applyMagic`. Ordering confirmed: the doc landed `044b9bd0`, **2026-08-13** (#50); `applyMagic` and `application.ts` landed `14155e77`, **2026-08-14** (#127, *"a mage can work a cell she knows, not only hold one"*) | The doc's structural fact 5a no longer describes the tree. Its §2 measurement (`permit-then-idle` / `permissive-breadth` = 1.0001) was taken one day **before** `applyMagic` existed, so the gate that killed mētis-from-use was failed against a tree with no applied-work verb. Re-running it is a precondition for re-arguing that ruling |
| `opening-square` §9a | *"`explicitOpeningAxes` … nothing on the default path calls it"* | **SUPERSEDED** by §10a's own wiring, which is on `main` | `packages/scenario/src/reference-universe.ts:542` `resolveOpeningSquare` → `packages/scenario/src/content-set.ts:415` `standardOpeningOrder` → `:416` `explicitOpeningAxes` | §9 was measured at `06abf3e` and §10 at `02cb41f`, neither of them `origin/main`. §10 supersedes §9a **and it happens to be right at this SHA** — but a reader taking §9a at face value would be wrong |
| `magic-projection` §2.2, §6.5 | *"`knowledgeHalfLife` … does not currently have an instrument"* | **SUPERSEDED** | Registered at `packages/mc-harness/src/metrics-registry.ts:196`; `packages/scenario/src/census.ts` exists — the node-identity census the doc said was needed | The metric quoted as absent in two sections of the doc is present. `libraryDependence` and `raidLengthDistribution` were already marked *(exists)* |
| `anti-requisites` "where enforcement lives" | Exclusion enforcement at the one point all five acquisition paths converge | **BUILT** | `packages/rules-magic/src/grid.ts:107`, `:124` read `excludes`; `packages/coordination/src/world-step.ts:120`, `:219`, `:224` widen `cells` to `ExclusionResolver`; loader validation at `packages/content/src/load.ts:629–690` | The launderable-by-theft failure the doc identified is genuinely closed on the domestic path. The rival stand-in row above is the one gap |
| `depth-and-skill` §8 (5 items) | Obliviousness restriction; coefficient of scalability; a containment null model; a pairwise outcome matrix; agent-space search | **ABSENT (block)** | No probe for any of the five under `tools/` or `scripts/`. The doc says of itself *"Changes no constant, no rule, no behaviour"* | Recorded, **not actioned**: these are measurement instruments and the owner has stopped baseline work until wiring is complete. Item 4 is the load-bearing one — transitive-vs-cyclic is *not measurable*, not false, until raids score universes against each other |

---

## 2. Counts

| status | rows |
| --- | ---: |
| **ABSENT** | 30 |
| **SUPERSEDED** | 6 |
| **PARTIAL** | 5 |
| **BUILT** | 1 |
| **total** | **42** |

**Cross-reference with the reachability ratchet.** `scripts/reachability-baseline.json` pins 125
findings; 27 are in `rules-magic`, of which **14 are in `rules-magic/src/traditions/` alone**
(`UNCHANGED_MULTIPLIER`, `isCastable`, `prepare`, `RESOLUTION`, `changeTradition`, `assertCostHook`,
`costSplit`, `preparationCost`, `hooksOfTradition`, `populatePreparedSpells`, `releaseAbroad`,
`palaceLibraryDepth`, `perishesWithHolder`, `scribeAvailability`).

**Seven of the 42 rows above name a mechanism already pinned there** — the memory palace's store
consequences, the spell-preparation half, portal spell transfer, `stackContributions`, `applyWard`,
library-level destruction, and the `rules-raid` consequences group — covering 18 baseline entries
between them. Note that the `gatherEffects` row is **not** one of the seven: that symbol is reached,
which is exactly why the doc's claim about it is stale. The pinned symbol in that pipeline is
`stackContributions`, which is why it earns its own row.

**The other 35 are invisible to the reachability check by construction**, and that is the most
useful thing in this section. The ratchet finds *unreached exported symbols*. It cannot see:

- a hardcoded literal where an input belongs (`scribingQueueDepth: 0`, `fertilityBonuses: []`,
  `scribeRateBonuses: []`);
- a **missing** call inside a reached function (`permits()` absent from `yieldSources`);
- a live function reading the **wrong field** (`shelveForeignBooks` on `entry.record.v1`);
- content that was never authored (a `refused` pair, a second portal cell, a v1-reachable exclusion);
- a file that does not exist (`permit-sentiment.json`);
- an undecided rule (§7.2, §7.3, §7.4).

A green ratchet is a statement about symbols, not about wiring. Six of the ten worst rows here would
survive it untouched.

---

## 3. The three worst

### 3.1 The looting shelf answers about the wrong input

`packages/scenario/src/rival-universe.ts:368`:

```ts
content.registry.cells.filter((entry) => entry.record.v1 === true).map((entry) => entry.record.id),
```

That is `shelveForeignBooks` choosing which looted books a raider may shelve. It reads the
**content** `v1` flag. `raid-constant.json`'s gloss describes the **god's** gate. An opening square
sets `permittedTechniques` / `permittedForms` on the `UNIVERSE` component and moves neither. The same
predicate appears again at `:219`.

**The ruleset is right there and goes unread.** Twelve lines below the filter, the same function
writes both masks:

```ts
universes.set(universe, 'permittedTechniques', (1 << content.registry.techniques.length) - 1);
universes.set(universe, 'permittedForms', (1 << content.registry.forms.length) - 1);
```

So `shelveForeignBooks` *has* the raiding universe's ruleset in hand — it sets it to fully-open on
the line after choosing the shelf — and selects by the content flag anyway. A first grep for
`permittedTechniques` in this file returns two hits and reads like a refutation of the finding; it
is the opposite, and it is the reason this row cites the selector's line rather than the file's.

This is the exact failure family `CLAUDE.md` devotes a section to — *a checker that answers about
the wrong input is worse than no checker* — and it does not throw, does not warn, and produces a
plausible number every time. It has been correct-by-coincidence for as long as exactly twelve cells
have been enabled, because while `v1Cells == permittedCells` the two gates return the same set.

Two things break it, and both are on the roadmap:

- **#137 (enable all seventy cells)** inverts it to nothing. Non-`v1` nodes available to shelve go
  from **249 of 300 to 0 of 300**, `foreign.length === 0`, and the function early-returns. The
  looting channel silently stops existing.
- **A narrow opening square** — now the default path, per §3.2 below — makes the two gates disagree
  in the other direction: a universe permitting four cells may shelve books from all twelve.

`opening-square.md` states this twice (§9b and again at §10h after the wiring landed, *"confirmed
unchanged"*), and calls re-keying it *"a prerequisite for #137."* It is still unre-keyed at
`0940061`. It leads this table because it is the only row where a **live, reached, tested** function
returns a confidently wrong answer, and because the two events that expose it are both scheduled.

### 3.2 `magic-projection` §7.5 is stale, and its staleness is replicated across four documents and a script

`magic-projection.md` §7.5 says `gatherEffects` *"has no non-test caller anywhere in `packages/`,
verified against this tree and not merely inherited."* §7.5a says `advanceConstruction` *"has no
non-test caller at all"* and construction *"is passed a hardcoded `0`."* Both are false at `0940061`:

- `gatherEffects` — imported at `packages/coordination/src/universe-effects.ts:123`, **called at
  `:330`**, reached from `world-step.ts:697`.
- `advanceConstruction` — **called at `packages/coordination/src/world-step.ts:1302`** with
  `materials: budget`, `budget = Math.max(0, input.stone)` (`:1279`), and charged back at `:1013`.

The doc builds its most quoted sentence on those two claims: *"the only authored magic that
currently changes the simulation is a favor trickle that does not care whether the god permitted
it."* That sentence is the document's headline and it no longer describes the tree.

**What makes this the second-worst row is not the error — it is the distribution.**
`metis-from-use-results.md` §9 already caught it, on `main`, and named the blast radius:
*"'`gatherEffects` has no production caller' is **stale everywhere it appears** —
`docs/design/vision-audit.md`, `docs/design/campaign-plan.md`,
`docs/design/strategy-dimensionality.md`, `scripts/check-primitive-consumption.mjs` and the header
of `packages/rules-magic/src/effects/consumption.ts`."* So two documents on `main` contradict each
other about a load-bearing fact, the misleading one is the longer and more-read one, and the claim
has propagated into **a script and a source header** — which is precisely the `vision-audit.md`
"2 distinct nodes across 1,308 books" incident that `CLAUDE.md` says cost two agents a full
investigation each. `anti-requisites.md` contains a third, oblique contradiction: it describes
severing `advanceConstruction`'s forwarding site in `world-step.ts` as a negative control, which is
a description of a live call site.

**And a real finding survives inside the stale one, which is why this must not simply be struck.**
Of the three hardcoded empty arrays §7.5 names, only one was fixed. `resourceYieldBonuses` now
passes `economy.resourceYield` (`world-step.ts:1114`); **`fertilityBonuses: []` at `:1849` and
`scribeRateBonuses: []` at `:2017` are still literals.** So `fertility` and `scribe-rate` still have
no node-driven channel, and `fertility` is simultaneously one of the two declared coverage
exclusions — the primitive is unauthored in v1 *and* unwired. Deleting §7.5 wholesale would delete
that.

The same shape recurs at the effect pipeline's second half: `gatherEffects` is called, but
`stackContributions` has no non-test caller — `reachability-triage.md` classifies it **superseded**,
because `universe-effects.ts` stacks per primitive with `primitives`' `stackMagnitudes` itself. Half
the documented route is live, half is a second implementation nothing switched to.

### 3.3 Permitting still costs nothing, and every mitigation the corpus proposes is absent

`magic-projection.md` §7.1 is the one finding the document says *"stands without accepting any
projection."* It is intact at `0940061`, on all three legs:

- `packages/content/data/god-cost.json` prices `permit-technique` and `forbid-technique` at 8192
  each, `permit-form` and `forbid-form` at 4096 each, with the loader enforcing the symmetry and
  citing vision pillar 1.
- `packages/coordination/src/god/interventions.ts:393–395` exempts permitting from the worship shock
  **by construction**: `const stranded = permitting ? { inert: 0, known: 0 } : strandedByAxis(...)`.
- `packages/rules-magic/src/instances/decay.ts:74–77` charges only forbidding with irreversible
  mastery loss, in a comment calling itself *"the whole mechanism by which forbidding a cell actually
  costs a civilization something."*

The favor price is symmetric by enforced invariant; the total price is asymmetric by construction,
entirely against denial.

What makes this the third-worst row rather than a restatement is that **the corpus proposes five
distinct mitigations and every one of them is absent at this SHA**:

| proposed | probe |
| --- | --- |
| `permit-sentiment.json`, two constituencies (§6.1) | `git grep -rn 'permit-sentiment' -- packages` → 0 |
| ruleset as a fifth occupation-demand input (§6.4) | `demand.ts:114–127` — still exactly four fields |
| an attention budget that binds (§6.2) | precondition is a non-exhaustible reachable set; still 51 of 51 |
| territory-selected permits via `lifespan`/`fertility` (§6.3) | `coverage.ts:69` — both still declared exclusions |
| priced permit verbs (`opening-square` §5c, §10f) | `god-cost.json` — both `"tuningStatus": "untuned"` |

Two adjacent rows sit on the same side of the ledger and are equally untouched: `yieldSources`
(`system.ts:649–656`) never calls `permits()`, so a forbidden node keeps paying worship; and
`consequences.ts:132`/`:322` never call it either, so a raider imports knowledge into a cell her own
universe forbids.

And the one mechanic that *was* built to charge the permissive strategy — anti-requisites — cannot
reach the position. `cell.json` carries exactly **two of seventy** cells with an `excludes` array,
both halves `creo`, both outside `intellego · perdo · rego × mentem · terram · limen · nomen`. The
doc measures the mechanic taking 38% of `permissive-breadth`'s knowledge on the agency gate, which
permits the full grid — and byte-identical on every reference gate, which does not. So the finding
that explains `permit-then-idle` at 40/40, and the mechanism built to answer it, are separated by
one authoring decision nobody has taken.

---

## 4. What this audit did not do

- **Nothing was fixed, regenerated or re-baselined.** No `goldens:regen`, no sweep, no gate run.
- **Two unmerged PRs were read, not merged.** #170 (`w190/scribing-fidelity`) is not an ancestor of
  `origin/main`; rows depending on it say so. #161's anti-requisite machinery **is** on `main` —
  verified directly at `cell.json`, `content/src/load.ts:629–690` and `rules-magic/src/grid.ts:124`
  — even though the PR head ref is not an ancestor, which is a merge-strategy artefact and not a
  statement about the code.
- **`depth-and-skill.md` was audited as a synthesis, not a spec.** It says of itself that it changes
  no constant, rule or behaviour. Its §8 backlog is one block row; giving each item a severe row
  would have inflated the count with work the owner has explicitly stopped.
- **Pure `[P]` projections in `magic-projection` §§2–4 are not counted as findings.** The document
  marks them undecided by construction, so "ABSENT" would restate their own label. Only §§6–7's
  present-tense claims about the built tree, and the four `[P]` rows whose guard is *missing* rather
  than *undecided* (§4.4, §4.7, §4.8, §7.2), are in the table.
- **Two of this audit's own absence probes came back non-zero and were corrected before publishing.**
  `permittedTechniques` in `rival-universe.ts` returns 2 hits (they are writes, not the selector —
  see §3.1) and `detection` in `rules-raid/src` returns 1 (a doc comment). Both rows had been drafted
  with a "0 hits" claim. Recorded because the brief's own rule is that a negative must be confirmed
  before it is believed, and drafting a probe result is not running it.
- **Line numbers cited by the corpus were checked and drifted twice** — `interventions.ts` §7.1
  (`:390–393` → `:393–395`) and `world-step.ts` `scribingQueueDepth` (`:774` → `:799`). Both claims
  survived the drift. Per `CLAUDE.md`, a mismatched line number is the cheapest available signal
  that a row has rotted; here it was a false alarm both times, which is worth recording so the next
  reader does not re-check them.
