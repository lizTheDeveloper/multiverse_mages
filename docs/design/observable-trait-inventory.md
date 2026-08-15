<!--
  Multiverse Mages — the observable-trait inventory.
  Copyright (C) 2026 Ann Kelner
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Observable-trait inventory

**Measured 2026-08-14**, against `origin/main` at **`be446a6`**. The tree read was `8a508e9`,
whose two commits above `be446a6` are `docs/design/observation-entitlement.md` and nothing else —
no package under `packages/` differs.

> **Amended 2026-08-14 on `w190/scribing-fidelity`, +2 traits.** World-schema revision 7 added
> `knowledge-fidelity` (`copyGeneration`, `corruption`), so the totals below read **110 traits
> across 21 world components**, with `not-yet-decided` at **72**. Every other row and every
> narrative section below was read at `be446a6` and is unamended. The amendment is stated here
> rather than by silently editing the tables, because the tables are a measurement and a
> measurement belongs to the tree it was taken on — and the two new rows were classified in
> `entitlement.ts`, not merely counted.
>
> `corruption` is left `undecided()` deliberately and is the more interesting of the two. A
> channel carrying *"this book is wrong"* would delete the mechanic, whose whole design is that
> corruption is hidden until a reader fails against it; a channel carrying *"a reader has marked
> it"* would be legitimate and does not exist. Those are two entitlement questions wearing one
> field, and `docs/design/scribing-fidelity.md` decides neither.

This is step 0 of `docs/design/observation-entitlement.md`: every `(component, field)` trait in
the world, classified against what the encoder in `packages/agent-api/src/observation.ts`
actually writes. **Every row was read off the encoder, not inferred from the field name.**

An undated measurement in the present tense will be read as current for as long as it survives.
If `WORLD_COMPONENTS`, `ENGAGEMENT_COMPONENTS`, or `observation.ts` has moved since the date
above, re-run the tally before believing a row.

## Headline numbers

| | |
|---|---|
| Components | 20 world + 3 engagement = 23 (21 world at the amendment above) |
| **Total `(component, field)` traits** | **108** (110 at the amendment above) |
| OBSERVABLE | 12 |
| AGGREGATED | 19 |
| WITHHELD | 76 |
| AMBIGUOUS | 1 |
| Observation slots | 400 |
| `OBSERVATION_LAYOUT_DIGEST` | `46182c35d829b205` |

WITHHELD, broken down by the reason given:

| Reason | Rows |
|---|---|
| not-yet-decided | 70 (72 at the amendment above) |
| internal bookkeeping | 6 |
| derived from something already observable | 0 |
| hidden-from-opponent | 0 |

**`hidden-from-opponent` is unused, and that is a finding rather than an omission.** Today the
observation is always of the agent's *own* universe — there is no opponent-facing projection for
anything to be hidden from. The category becomes live when `pvp-server` ships, and every row now
marked `not-yet-decided` is a row that will have to be re-read then.

`not-yet-decided` is used honestly and it dominates. It is not a placeholder for "we thought about
it": 70 of 108 traits have no artifact anywhere in the repository that says whether a
player should see them. That number is the point of the exercise.

## Slots per block

| Block | Offset | Size | What fills it |
|---|---:|---:|---|
| `ruleset` | 0 | 35 | 5 technique bits + 14 form bits + 8 `(cellId, kind)` edict pairs |
| `tradition` | 35 | 1 | `universe.traditionId` |
| `resources` | 36 | 5 | favor, worship, worshipTier, **summed** materials, prestige |
| `population` | 41 | 30 | 6 species × 5 occupations, cohort counts summed |
| `mages` | 71 | 48 | 6 species × 8 tier buckets (bucket 0 = knows nothing), living mages counted |
| `knowledge` | 119 | 210 | 70 cells × (distinct nodes known, deepest tier, instance count) |
| `institutions` | 329 | 4 | university count, summed capacity, library depth, grimoire count — **four components in four numbers** |
| `clock` | 333 | 3 | worldTick, era, mode. No component behind any of them |
| `engagement` | 336 | 64 | 2 sides × 7 channels + 12 objectives × 4 channels + 2 portal channels |
| **total** | | **400** | |

## The classification

- **OBSERVABLE** — reaches the player as its own value.
- **AGGREGATED** — reaches the player only inside an aggregate, named in the third column.
- **WITHHELD** — does not reach the player at all, with a reason.
- **AMBIGUOUS** — the encoder does something the three-way scheme has no honest name for.


### `universe` (12 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `permittedTechniques` | `u8` | OBSERVABLE | ruleset[0..4] | One slot per technique bit; the bitfield is fully recoverable. |
| `permittedForms` | `u16` | OBSERVABLE | ruleset[5..18] | One slot per form bit. |
| `edictBudget` | `u8` | WITHHELD | not-yet-decided | The agent sees its edicts but not how many more it may issue; `canIssueEdict` reaches it only as a mask bit. |
| `traditionId` | `u16` | OBSERVABLE | tradition[35] |  |
| `favor` | `i32` | OBSERVABLE | resources[36] |  |
| `worship` | `i32` | OBSERVABLE | resources[37] |  |
| `worshipTier` | `u8` | OBSERVABLE | resources[38] |  |
| `prestige` | `i32` | OBSERVABLE | resources[40] | The carried-in stock (§1.1 read-only during a run). |
| `prestigeEarned` | `i32` | WITHHELD | not-yet-decided | What this run is earning toward the next. Never observed. |
| `terminalReason` | `u8` | WITHHELD | internal bookkeeping | Reaches the caller through `OutcomeRecord.terminalReason`; the episode ends when it is set, so no observation follows. |
| `favorCap` | `i32` | WITHHELD | not-yet-decided | Favor is observable, its ceiling is not — the agent cannot tell how near it is to the overflow that `god-state.favorWasted` counts. |
| `ascended` | `u8` | WITHHELD | internal bookkeeping | Terminal marker; same path out as `terminalReason`. |

### `edict` (2 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `cellId` | `u16` | OBSERVABLE | ruleset[19,21,23,…,33] | First `EDICT_BUDGET_MAX` (8) in `collectRecords` order only; a ninth edict is truncated. |
| `kind` | `u8` | OBSERVABLE | ruleset[20,22,24,…,34] | Interleaved with `cellId`, one pair per slot. |

### `encouraged-cell` (2 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `cellId` | `u16` | WITHHELD | not-yet-decided | God action 12 leaves **no trace** in the observation: an agent cannot see its own encouragements. |
| `expiryTick` | `i32` | WITHHELD | not-yet-decided |  |

### `axis-change-counter` (3 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `axisKind` | `u8` | WITHHELD | not-yet-decided |  |
| `axisBit` | `u8` | WITHHELD | not-yet-decided |  |
| `changeCount` | `u32` | WITHHELD | not-yet-decided | Drives the hysteresis multiplier (`ActionCostTable.hysteresisStep`). The same blindness as action cost, one level down. |

### `mage` (10 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `speciesId` | `u16` | AGGREGATED | `mages.mageTierSlot` | Row axis of the histogram. |
| `birthTick` | `i32` | WITHHELD | not-yet-decided | Mage age is invisible. |
| `roleId` | `u8` | WITHHELD | not-yet-decided |  |
| `universityId` | `u32` | WITHHELD | not-yet-decided | Which mages belong to which university is invisible. |
| `curiosity` | `i32` | WITHHELD | not-yet-decided |  |
| `ambition` | `i32` | WITHHELD | not-yet-decided |  |
| `caution` | `i32` | WITHHELD | not-yet-decided |  |
| `vigor` | `i32` | WITHHELD | not-yet-decided | The world-scale pool. The `combatant` copy of it *is* aggregated, but only during an engagement. |
| `maxVigor` | `i32` | WITHHELD | not-yet-decided |  |
| `alive` | `u8` | AGGREGATED | `mages.mageTierSlot` | A **filter**, not a key or a value: `alive === 0` is excluded from the count entirely. |

### `populace-cohort` (4 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `speciesId` | `u16` | AGGREGATED | `population.cohortSlot` | Key. |
| `occupation` | `u8` | AGGREGATED | `population.cohortSlot` | Key. |
| `count` | `u32` | AGGREGATED | `population.cohortSlot` | Summed value. |
| `birthTickBucket` | `i32` | WITHHELD | not-yet-decided | Two cohorts of different ages sum into one slot; the age structure is gone. |

### `university` (3 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `libraryId` | `u32` | WITHHELD | not-yet-decided | Which library a university owns is invisible. |
| `capacity` | `u16` | AGGREGATED | `institutions[330]` | Summed across every university. |
| `buildProgress` | `i32` | WITHHELD | not-yet-decided | An unfinished university counts in `institutions[329]` exactly as a finished one does. |

### `university-staff` (2 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `universityId` | `u32` | WITHHELD | not-yet-decided | The whole component is unread by the encoder. |
| `cohortId` | `u32` | WITHHELD | not-yet-decided |  |

### `library` (1 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `foundedTick` | `i32` | WITHHELD | not-yet-decided | `LIBRARY` is never imported by `agent-api`. `institutions[331]` ("library depth") is derived from `knowledge-instance.locationKind`, not from this component. |

### `grimoire` (4 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `nodeId` | `u16` | WITHHELD | not-yet-decided | Which node a grimoire holds is invisible; only the grimoire *count* reaches a slot. |
| `durability` | `i32` | WITHHELD | not-yet-decided |  |
| `holderKind` | `u8` | WITHHELD | not-yet-decided |  |
| `holderId` | `u32` | WITHHELD | not-yet-decided |  |

### `knowledge-instance` (5 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `nodeId` | `u16` | AGGREGATED | `knowledge.knowledgeSlot` (all 3 channels), `institutions[331]`, `mages.mageTierSlot` | Feeds **three** aggregates, via `catalogue.node(nodeId)` for cell and tier. A nodeId the catalogue does not name is skipped silently. |
| `locationKind` | `u8` | AGGREGATED | `institutions[331]`, `mages.mageTierSlot`, `knowledge.knowledgeSlot` ch 2 | Partitions the instance: `library` → library depth; `mind`|`palace` → the mage tier axis; every kind counts toward the per-cell instance channel. |
| `locationId` | `u32` | AGGREGATED | `mages.mageTierSlot` | Identifies the mage whose tier bucket the instance raises. |
| `acquiredTick` | `i32` | WITHHELD | not-yet-decided |  |
| `mastery` | `i32` | WITHHELD | not-yet-decided | The quantity the entire decay-and-loss model turns on. No channel carries it. |

### `ever-known` (1 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `nodeId` | `u16` | WITHHELD | not-yet-decided | An agent cannot distinguish a node never discovered from one discovered and lost. The 3× rediscovery discount is invisible. |

### `goal-commitment` (4 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `goalId` | `u8` | WITHHELD | not-yet-decided | Component unread by the encoder. |
| `targetNodeId` | `u16` | WITHHELD | not-yet-decided |  |
| `adoptedTick` | `i32` | WITHHELD | not-yet-decided |  |
| `score` | `i32` | WITHHELD | not-yet-decided |  |

### `effort-progress` (5 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `subject` | `u32` | WITHHELD | not-yet-decided | Component unread by the encoder. |
| `kind` | `u8` | WITHHELD | not-yet-decided |  |
| `nodeId` | `u16` | WITHHELD | not-yet-decided |  |
| `counterparty` | `u32` | WITHHELD | not-yet-decided |  |
| `progress` | `i32` | WITHHELD | not-yet-decided |  |

### `god-state` (15 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `favorWasted` | `i32` | WITHHELD | not-yet-decided | §7's early-snowball signal. |
| `magelessTicks` | `i32` | WITHHELD | not-yet-decided |  |
| `lowWorshipTicks` | `i32` | WITHHELD | not-yet-decided |  |
| `stasisTicks` | `i32` | WITHHELD | not-yet-decided |  |
| `lastEverKnown` | `u16` | WITHHELD | internal bookkeeping | Last tick's count, cached so a new node is detectable. A previous value, not a state of the world. |
| `lastExisting` | `u16` | WITHHELD | internal bookkeeping | Same: cached so a rediscovery is detectable. |
| `ascensionFirstMetTick` | `i32` | WITHHELD | not-yet-decided |  |
| `ascensionPath` | `u8` | WITHHELD | not-yet-decided | Which of the ascension routes is currently satisfied. Recomputed every world tick and never shown. |
| `peakWorshipTier` | `u8` | WITHHELD | not-yet-decided | The current tier is observable (`resources[38]`); the high-water mark is not. |
| `deepestTier` | `u8` | WITHHELD | not-yet-decided | Deepest tier **ever** held in a mind. The knowledge block carries deepest *currently* known per cell, which is a different number. |
| `lastEraRecorded` | `u16` | WITHHELD | internal bookkeeping | So each era boundary is evaluated exactly once. |
| `eraNodesLost` | `u16` | WITHHELD | not-yet-decided |  |
| `goodEraRun` | `u16` | WITHHELD | not-yet-decided |  |
| `overBudgetEdicts` | `u8` | WITHHELD | not-yet-decided | Reported, never auto-revoked — and never observed either. |
| `terminalTick` | `i32` | WITHHELD | internal bookkeeping | `0` while running; reaches the caller through `OutcomeRecord`. |

### `blessing` (2 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `mageId` | `u32` | WITHHELD | not-yet-decided | Component unread by the encoder. |
| `expiryTick` | `i32` | WITHHELD | not-yet-decided |  |

### `upheaval` (2 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `factor` | `i32` | WITHHELD | not-yet-decided | Component unread by the encoder. |
| `expiryTick` | `i32` | WITHHELD | not-yet-decided |  |

### `era-evaluation` (4 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `era` | `u16` | WITHHELD | not-yet-decided | `clock[334]` carries the *current* era; this is the era an evaluation belongs to. |
| `libraryDependence` | `i32` | WITHHELD | not-yet-decided |  |
| `nodesLost` | `u16` | WITHHELD | not-yet-decided |  |
| `passed` | `u8` | WITHHELD | not-yet-decided |  |

### `material-stock` (3 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `food` | `i32` | AGGREGATED | `resources[39]` | A **sum across the three fields of one row**, not a histogram over entities. The encoder records the consequence: an agent cannot tell a food shortage from a vellum one. |
| `stone` | `i32` | AGGREGATED | `resources[39]` | Same sum. |
| `vellum` | `i32` | AGGREGATED | `resources[39]` | Same sum. |

### `grant-budget` (5 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `startingGrants` | `u16` | WITHHELD | not-yet-decided | God action 8's budget. Same defect class as action cost: a bound the agent is subject to and cannot see. |
| `accrualNodes` | `u16` | WITHHELD | not-yet-decided |  |
| `cap` | `u16` | WITHHELD | not-yet-decided |  |
| `grantsUsed` | `u16` | WITHHELD | not-yet-decided |  |
| `seededNodes` | `u16` | WITHHELD | not-yet-decided |  |

### `combatant` (10 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `sourceKind` | `u8` | WITHHELD | not-yet-decided |  |
| `sourceId` | `u32` | WITHHELD | not-yet-decided | The link back from a combatant to the world mage she is. |
| `side` | `u8` | AGGREGATED | engagement side summaries | Key: selects which of the two seven-channel summaries. A side outside {0,1} is dropped. |
| `x` | `i32` | WITHHELD | not-yet-decided | The observation carries **no engagement geometry at all** — and the engagement is the only scale that has coordinates. |
| `y` | `i32` | WITHHELD | not-yet-decided | See `x`. |
| `hp` | `i32` | AGGREGATED | engagement own/enemy ch 1 | Summed per side. |
| `maxHp` | `i32` | AGGREGATED | engagement own/enemy ch 2 | Summed per side. |
| `vigor` | `i32` | AGGREGATED | engagement own/enemy ch 3 | Summed per side. |
| `maxVigor` | `i32` | AGGREGATED | engagement own/enemy ch 4 | Summed per side. |
| `concealment` | `i32` | AGGREGATED | engagement own/enemy ch 5 | Summed — including for the **enemy** side, which is the one aggregate that leaks across the line PvP will need to draw. |

### `prepared-spell` (2 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `combatantId` | `u32` | AGGREGATED | engagement own/enemy ch 6 | Used only to attribute the spell to a side; a spell whose combatant is gone is dropped. |
| `nodeId` | `u16` | WITHHELD | not-yet-decided | Withheld from your **own** side as well: a player sees how many spells are prepared, never which. |

### `objective` (7 traits)

| Field | Type | Class | Slot / aggregate / reason | Note |
|---|---|---|---|---|
| `kind` | `u8` | OBSERVABLE | engagement objective slot ch 0 | Top twelve by `valueFp` only; a thirteenth objective reaches no slot. |
| `targetId` | `u32` | WITHHELD | not-yet-decided | What the objective stands on. |
| `x` | `i32` | WITHHELD | not-yet-decided | See `combatant.x`. |
| `y` | `i32` | WITHHELD | not-yet-decided | See `combatant.y`. |
| `valueFp` | `i32` | OBSERVABLE | engagement objective slot ch 2 | Also the ranking key that decides which twelve slots are filled. |
| `statusKind` | `u8` | OBSERVABLE | engagement objective slot ch 1 |  |
| `capturedBy` | `u32` | AMBIGUOUS | engagement objective slot ch 3 | Reaches the player as `capturedBy === 0 ? 0 : 1` — the *fact* of capture, never the captor. Neither its own value nor a histogram, so the three-way scheme has no honest home for it. |

## Observables that are not component fields

Four blocks would be unclassifiable from the field registry alone. Entity **cardinality** is
observable in three places while no field of the component is; the whole `clock` block comes from
`SimState`; and the two portal channels come from `RaidState`. A gate seeded only from
`WORLD_COMPONENTS × fields` would record, falsely, that institutions are invisible.

| Observable | Source | Class | Where | Note |
|---|---|---|---|---|
| `UNIVERSITY` entity count | `collectRecords(state, UNIVERSITY).length` | AGGREGATED | `institutions[329]` | Cardinality is observable though no field of `UNIVERSITY` is. |
| `GRIMOIRE` entity count | `collectRecords(state, GRIMOIRE).length` | AGGREGATED | `institutions[332]` | The only thing about a grimoire that reaches the player. |
| `LIBRARY` entity count | `LIBRARY` cardinality | WITHHELD | WITHHELD — not-yet-decided | How many libraries exist is **not** observable. `institutions[331]` is distinct nodes at `locationKind === library`, a different quantity. |
| `MAGE` living count | `MAGE` cardinality, `alive !== 0` | AGGREGATED | `mages` block (sum over 48 slots) |  |
| `POPULACE_COHORT` count | `POPULACE_COHORT` cardinality | AGGREGATED | `population` block | Cohorts merge into slots; how many rows there were is lost. |
| `EDICT` count | `EDICT` cardinality | AGGREGATED | `ruleset[19..34]` | Recoverable as the number of filled pairs, up to 8. |
| `KNOWLEDGE_INSTANCE` count per cell | `KNOWLEDGE_INSTANCE` cardinality | AGGREGATED | `knowledge.knowledgeSlot` ch 2 |  |
| `COMBATANT` count per side | `COMBATANT` cardinality | AGGREGATED | engagement own/enemy ch 0 |  |
| `PREPARED_SPELL` count per side | `PREPARED_SPELL` cardinality | AGGREGATED | engagement own/enemy ch 6 |  |
| `UNIVERSITY_STAFF` count | `UNIVERSITY_STAFF` cardinality | WITHHELD | WITHHELD — not-yet-decided |  |
| `SimState.clock.worldTick` | `SimState`, not a component | OBSERVABLE | `clock[333]` | Three observable slots with no component behind them. |
| `eraOf(clock.worldTick)` | computed in the encoder | OBSERVABLE | `clock[334]` | derived from something already observable — a pure function of `clock[333]`, encoded anyway so a policy need not learn `ERA_TICKS`. |
| `SimState.clock.mode` | `SimState`, not a component | OBSERVABLE | `clock[335]` | World vs engagement scale. |
| `Engagement.raid.portalStability` | `RaidState`, not a component | OBSERVABLE | `engagement[398]` |  |
| `Engagement.raid.stabilityDecayPerTick` | `RaidState`, not a component | OBSERVABLE | `engagement[399]` |  |
| `EngagementView.ownSide` | supplied by the caller | WITHHELD | WITHHELD — internal bookkeeping | Consumes no slot: it decides the *order* of the two side summaries rather than being encoded. |

## Declared unencoded gaps

Things a player is subject to that reach no slot. These are what step 3's `unencodedObservables()`
declares rather than encodes — the design is explicit that encoding them is a later, separately
measured change.

| Gap | Where it lives | Why it is unencoded today |
|---|---|---|
| `ActionCostTable.byAction[0..15]` | `packages/agent-api/src/catalogue.ts`, from `god-cost.json` | Sixteen favor prices. Encoding them widens `OBSERVATION_SIZE` and moves `OBSERVATION_LAYOUT_DIGEST`, which invalidates every committed balance baseline. Declared here so the gap is named rather than absent. |
| `ActionCostTable.foundUniversity` | same | The one action id (11) whose price depends on its target. |
| `ActionCostTable.hysteresisStep` | same | What one recent flip of an axis adds to its multiplier. Unreadable, and so is `axis-change-counter.changeCount` that it multiplies — the agent can see neither half of the price it pays for changing its mind. |

This is the defect `docs/design/observation-entitlement.md` opens with: `permissive-breadth`
submits `permitTechnique` every round, the mask filters it when the god cannot afford it, and the
strategy never learns that anything happened. Unaffordability reaches a strategy only as a legality
bit, so it is a *substitution* the agent never notices.

## What surprised the audit

1. **`ever-known.nodeId` is withheld, so the rediscovery model is entirely invisible.** `knowledge-model`
   ships a 3× rediscovery discount for a node the universe once held and lost. The observation carries
   distinct nodes *currently* known per cell and nothing about what was lost, so an agent cannot
   distinguish a cell never explored from one that was explored and forgotten — which are the two
   states with the most different expected value in the whole knowledge model.

2. **`knowledge-instance.mastery` is withheld.** Decay, loss and teaching all move mastery; no channel
   carries it, in any aggregate. `knowledge.knowledgeSlot` counts instances, and an instance about to
   decay out of existence counts exactly as much as a fully mastered one.

3. **`institutions` is four slots covering four components, and one of them is not the component it
   names.** `UNIVERSITY`, `UNIVERSITY_STAFF`, `LIBRARY` and `GRIMOIRE` hold 10 fields between them and
   reach the player as four numbers — and `LIBRARY` is never imported by `agent-api` at all.
   `institutions[331]` ("library depth") is computed from `knowledge-instance.locationKind`, so **how
   many libraries exist is not observable** while a quantity named after them is. `university.buildProgress`
   is withheld too, so an unfinished university counts in `institutions[329]` exactly as a finished one does.

Runners-up, in the same shape: `universe.favorCap` is withheld while `universe.favor` is observable, so
the agent can read its pool and not its ceiling; `prepared-spell.nodeId` is withheld for your **own**
side, so a player sees how many spells are prepared and never which; and `grant-budget` (5 traits) is a
second budget in exactly the shape of action cost — a bound the agent is subject to and cannot see.

## Two mismatches with the design doc, recorded rather than fixed

`docs/design/observation-entitlement.md` says *"`WORLD_COMPONENTS` (21)"*. It is
**20**. A document is not a ref for the code it describes; the number above is computed from
the registry at the ref named at the top of this file.

The design also writes `project(state: WorldState): PlayerState`. That signature cannot reconstruct
the knowledge block: cell and tier come from `catalogue.node(nodeId)`, not from state, and the
engagement block needs the caller-supplied `ownSide` to know which summary is its own. The
projection therefore takes `ObservationInput`, which is the signature the existing encoder already
forces — a correction of the doc, not a change of design.

## Is the granularity right?

The design set the test in advance: *"thirty traits and this design is comfortable, a hundred and
fifty and it needs coarsening before a line is written."* The answer is **108** — nearer the
coarsening end than the comfortable one, and the design had already coarsened for it.

Steps 1–3 are unaffected. `unclassifiedTraits()` is a one-time registry walk producing a table a human
reads once; 108 rows is a long document, not an unworkable one, and this file is the proof that it can
be produced and read.

**Step 4 is where the number bites**, and the design already says so: at field granularity it is
108 × twelve strategies ≈ 1296 `because` strings, nearly all of them *"static preference list,
reads nothing"* — the hand-maintained checklist reimplemented in TypeScript, failing the same way.
At block granularity it is nine blocks × twelve strategies = 108 decisions a human reviews. **Take step 4
at block granularity.** That was the design's call before the count came in; the count confirms it.

One further coarsening the count argues for, which the design did not anticipate: `god-state` (15
traits, all withheld), `goal-commitment` (4), `effort-progress` (5) and `grant-budget` (5) are 29
traits — **27% of the registry** — that are derived bookkeeping over things already in the world.
Should the gates ever need to be shorter, the honest coarsening is per *component* for those four,
not per field. It is not needed for steps 1–3 and is not being done now.
