# Multiverse Mages — Core Contracts

*The interface layer every capability is built against. `docs/design/vision.md` says what the game
is; this says what the machine looks like. Anything ambiguous here becomes an incompatibility
between two packages written by two different people, so ambiguity is the defect this document
exists to prevent.*

**Normative.** Where this document and a capability spec disagree, this document wins, and the
spec is the thing that gets fixed.

---

## 0. Universal Conventions

- **Fixed-point.** All rules-path numbers are integers at scale `FP = 1024`. A value of `1024`
  means 1.0. Written `fp(x)` below. No floats anywhere in the rules path (see `CLAUDE.md`).
- **Identifiers.** Content IDs are lowercase kebab-case strings in data files, interned to `uint16`
  at load. Runtime entity IDs are `uint32` handles with a generation counter.
- **Time.**
  - `worldTick` = **1 month**. A world year is 12 ticks.
  - `engagementTick` = **100 ms** of fictional time. 10 per fictional second.
  - Real-time pacing (how many ms of wall clock per tick) is a client/server concern and never
    appears in the core.
- **Space.** Only engagement entities have positions. Coordinates are `fp` metres on a 2D plane.
  The reference battlefield is 200 m × 200 m. World-scale entities have **no** coordinates —
  the component model must not assume otherwise.
- **Randomness.** Every draw names a subsystem stream (§6). No subsystem may draw from another's.
- **Nulls.** Absent references are `0`, never `-1` or `undefined`. Entity handle `0` is reserved
  and never allocated.

---

## 1. State Schema

The world state is a set of component arrays over an entity store. Grouped by scale.

### 1.1 Universe (singleton)

| Field | Type | Notes |
|---|---|---|
| `permittedTechniques` | `uint8` bitmask | 5 bits, one per technique |
| `permittedForms` | `uint16` bitmask | 14 bits, one per form |
| `edicts` | array of `{cellId: uint16, kind: 0=dispensation \| 1=interdiction}` | length ≤ `edictBudget` |
| `edictBudget` | `uint8` | grows with worship tier |
| `traditionId` | `uint16` | exactly one; never 0 |
| `favor` | `fp` | god's currency |
| `worship` | `fp` | drives favor regen |
| `worshipTier` | `uint8` | derived, cached; recomputed on worship change |
| `materials` | `fp` | |
| `era` | `uint16` | |
| `prestige` | `fp` | carried in from prior runs; **read-only during a run** |
| `ascended` | `bool` | terminal flag |

**Ruleset legality — the single arbitration function.** Every consumer must call this rather than
reimplementing it:

```
permits(universe, cellId) =
    if edicts contains (cellId, interdiction) -> false
    if edicts contains (cellId, dispensation) -> true
    else techniqueBit(cellId) ∈ permittedTechniques AND formBit(cellId) ∈ permittedForms
```

Interdiction beats dispensation; a cell may not carry both, and the loader rejects content that
tries.

### 1.2 Mage (individual entity)

| Field | Type | Notes |
|---|---|---|
| `speciesId` | `uint16` | |
| `birthTick` | `int32` | world ticks; age is derived, never stored |
| `roleId` | `uint8` | researcher \| warden \| professor \| raider |
| `universityId` | `uint32` | handle, 0 = unaffiliated |
| `curiosity`, `ambition`, `caution` | `fp` | personality; rolled at birth from species means |
| `alive` | `bool` | |

Mages are individuals. Everyone else is not.

### 1.3 Populace cohort (aggregate entity)

| Field | Type | Notes |
|---|---|---|
| `speciesId` | `uint16` | |
| `occupation` | `uint8` | laborer \| scribe \| student \| soldier \| idle |
| `count` | `uint32` | |
| `birthTickBucket` | `int32` | cohorts are bucketed by decade of birth, not per-person |

**This is a performance contract, not a modelling preference.** Simulating a whole population as
individuals is what would make Monte Carlo unaffordable. Only mages are individuals; everyone else
is a counted cohort. No capability may promote populace to individual entities without changing
this document first.

### 1.4 University

| Field | Type | Notes |
|---|---|---|
| `libraryId` | `uint32` | handle |
| `capacity` | `uint16` | students supportable |
| `staffCohorts` | array of handles | |
| `buildProgress` | `fp` | `fp(1024)` = complete |

### 1.5 Knowledge

**Node**: content, not state. **Knowledge instance**: state.

| Field | Type | Notes |
|---|---|---|
| `nodeId` | `uint16` | |
| `locationKind` | `uint8` | `1` mind · `2` grimoire · `3` library · `4` palace |
| `locationId` | `uint32` | mage / grimoire / library / mage handle respectively |
| `acquiredTick` | `int32` | |
| `mastery` | `fp` | 0 → just learned, `fp(1024)` → teachable without loss |

**Grimoire**

| Field | Type | Notes |
|---|---|---|
| `nodeId` | `uint16` | one node per grimoire |
| `durability` | `fp` | species scribe-affinity raises this; dwarven books resist burning |
| `holderKind` / `holderId` | `uint8` / `uint32` | mage, library, or in transit |

**Derived, never stored:** whether a node "exists in the universe" is `count(instances of nodeId) > 0`,
computed from an index maintained by the knowledge subsystem. Nothing may cache it in state.

### 1.6 Engagement-only entities

Present only while `clock.mode == engagement`. Discarded on raid resolution, and **not** written to
world snapshots.

**Combatant**

| Field | Type | Notes |
|---|---|---|
| `sourceKind` | `uint8` | mage \| soldier-detachment \| summon |
| `sourceId` | `uint32` | handle into world state, 0 for summons |
| `side` | `uint8` | 0 attacker, 1 defender |
| `x`, `y` | `fp` | metres |
| `hp`, `maxHp` | `fp` | |
| `preparedSpells` | array of `nodeId` | populated by tradition `cast` hook |
| `concealment` | `fp` | |

**RaidState**

| Field | Type | Notes |
|---|---|---|
| `hostUniverseId` | `uint32` | governs legality — always the defender |
| `attackerTraditionId` | `uint16` | raider's home tradition (acquire/store hooks) |
| `objectives` | array of `{kind, targetId, x, y, valueFp, capturedBy}` | |
| `portalStability` | `fp` | decrements per engagement tick; 0 ends the raid |

---

## 2. Content Schemas

All content is JSON, validated at load. **Invalid content is a hard load failure, never a warning.**
A silently-ignored malformed node is a balance bug that takes weeks to find.

### 2.1 `technique.json` / `form.json`

```jsonc
{ "id": "rego", "name": "Rego", "gloss": "control, bind, compel", "bit": 4 }
{ "id": "corpus", "name": "Corpus", "gloss": "body", "bit": 3 }
```

Exactly 5 techniques and 14 forms. `bit` values are dense, stable, and never reordered — they are
serialized into snapshots.

### 2.2 `cell.json`

```jsonc
{
  "id": "rego-corpus",
  "technique": "rego",
  "form": "corpus",
  "classicalLabels": ["necromancy", "conjuration"],   // display only, never mechanical
  "nodes": ["rc-still-the-limb", "rc-puppet-flesh", "..."]
}
```

70 cells exist in schema. The **v1 subset** is flagged per-cell with `"v1": true`; exactly 12 cells
(3 techniques × 4 forms) carry it, and the set must include `rego-limen`.

### 2.3 `node.json`

```jsonc
{
  "id": "rc-puppet-flesh",
  "cell": "rego-corpus",
  "tier": 3,                        // 1..7; depth ceilings are per-species
  "prerequisites": ["rc-still-the-limb"],
  "researchCost": 4096,             // fp; mage-months of self-directed work
  "teachCost": 1024,                // fp; mage-months for a teacher/student pair
  "scribeCost": 2048,               // fp; scribe-months + materials
  "rediscoveryMultiplier": 3072,    // fp; applied to researchCost when relearning a lost node
  "effects": [
    { "primitive": "direct-damage", "magnitude": 512, "target": "single", "durationTicks": 0 }
  ]
}
```

Prerequisites may cross cells. The loader rejects prerequisite cycles and any node whose
prerequisite has a higher `tier`.

### 2.4 `species.json`

```jsonc
{
  "id": "dwarf",
  "lifespanMonths": 3000,           // ~250y
  "lifespanVarianceMonths": 360,
  "curiosity": 512,                 // fp; P(initiating self-directed research) scalar
  "depthCeiling": 5,                // max node tier reachable
  "learnRate": 1024,                // fp multiplier on teaching/research throughput
  "retention": 1536,                // fp; resists mastery decay
  "fertility": 768,                 // fp multiplier on cohort birth rate
  "scribeAffinity": 1792,           // fp multiplier on grimoire durability and scribe-rate
  "rediscoveryAffinity": 768,       // fp multiplier against rediscoveryMultiplier
  "affinities": { "terram": 1536, "ignem": 1152 }   // by form or by cell id
}
```

### 2.5 `tradition.json`

```jsonc
{
  "id": "art-of-memory",
  "hooks": {
    "acquire": { "kind": "standard" },
    "store":   { "kind": "palace", "params": { "slotsPerMage": 12, "lootable": false, "burnable": false } },
    "cast":    { "kind": "standard" },
    "cost":    { "kind": "standard" }
  }
}
```

**A tradition may declare exactly these four hooks and no others.** Each hook's `kind` selects from
a closed, enumerated set implemented in code; `params` are data. Adding a new `kind` is a code
change that must update this document. This cap is the mechanism that keeps traditions from
defeating primitive-level balance.

### 2.6 `primitive.json`

Declares the units and stacking rule for each effect primitive. See §3 — the table there is
normative and this file must match it.

---

## 3. Effect Primitive Semantics

Every primitive: its unit, where it applies, and how multiple sources combine. **Stacking rule is
the field most likely to be silently assumed differently by two implementers**, so it is stated for
all of them.

| Primitive | Unit | Scale | Stacking |
|---|---|---|---|
| `direct-damage` | HP per application | engagement | additive across sources |
| `ward` | fraction of damage prevented | engagement | **multiplicative on the remainder**, hard cap `fp(922)` = 90% |
| `area-denial` | HP per engagement tick, within radius (fp metres) | engagement | additive |
| `blink` | fp metres of instantaneous displacement | engagement | max, not sum |
| `summon` | count of combatants from a template | engagement | additive, capped per side |
| `build-rate` | multiplier on construction progress | world | additive into `(1 + Σbonus)`, cap `fp(4096)` |
| `resource-yield` | multiplier on materials per world tick | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `research-rate` | multiplier on research progress | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `teach-rate` | multiplier on teaching throughput | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `scribe-rate` | multiplier on scribing throughput | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `lifespan` | additive months | world | additive, cap `+50%` of species base |
| `fertility` | multiplier on cohort birth rate | world | additive into `(1 + Σ)`, cap `fp(3072)` |
| `worship-yield` | multiplier on favor regeneration | world | additive into `(1 + Σ)`, cap `fp(2048)` |
| `concealment` | fp probability of evading targeting/detection | both | multiplicative on the remainder, cap `fp(870)` = 85% |
| `knowledge-steal` | fp probability per attempt of copying an instance | engagement | max, not sum |
| `portal` | boolean gate; enables raid initiation | world | n/a — presence only |

**Why the caps exist:** every uncapped multiplicative rate in a game with two compounding loops
(worship §7, knowledge-as-capital §6a) is a runaway waiting to happen. The caps are deliberately
placed to be *reachable*, so the balance harness measures behaviour at the cap rather than
discovering it in live play.

**Rounding.** All `fp` division rounds toward negative infinity via the single shared helper. No
exceptions — uniform rounding is what makes replays reproducible.

---

## 4. Observation / Action Space

One interface serves scripted bots, Monte Carlo, and reinforcement learning. It is defined once,
here, because building it twice guarantees divergence.

### 4.1 Observation — fixed shape

Shape must be **constant across a run and across universes**, or RL cannot consume it. Variable-
length data is bucketed or summarized, never emitted raw.

| Block | Size | Contents |
|---|---|---|
| `ruleset` | 19 + 2×`edictBudgetMax` | technique bits, form bits, edict slots (cellId, kind) |
| `tradition` | 1 | tradition id |
| `resources` | 5 | favor, worship, worshipTier, materials, prestige |
| `population` | 6 species × 5 occupations = 30 | cohort counts |
| `mages` | 6 species × 7 tiers = 42 | living mage counts by species and highest tier known |
| `knowledge` | 70 cells × 3 = 210 | per cell: nodes known, deepest tier, instance redundancy |
| `institutions` | 4 | university count, total capacity, library depth, grimoire count |
| `clock` | 3 | worldTick, era, mode |
| `engagement` (zeroed at world scale) | 64 | own/enemy combatant summaries, objective states, portal stability |

Total: a fixed vector, all values `fp`-normalized to `[0, fp(1024)]` at the boundary. The core emits
integers; **normalization happens in the agent-api layer, which is the one place floats are
permitted** on the way out.

### 4.2 Actions — discrete, masked

| ID | Action | Parameters |
|---|---|---|
| 0 | no-op | — |
| 1 | permit technique | techniqueId |
| 2 | forbid technique | techniqueId |
| 3 | permit form | formId |
| 4 | forbid form | formId |
| 5 | issue dispensation | cellId |
| 6 | issue interdiction | cellId |
| 7 | revoke edict | edictIndex |
| 8 | grant founding knowledge | mageId, nodeId |
| 9 | bless mage | mageId |
| 10 | assign role | mageId, roleId |
| 11 | fund university | universityId \| 0 to found new |
| 12 | encourage research | cellId |
| 13 | change tradition | traditionId |
| 14 | open portal | targetUniverseId |
| 15 | declare ascension | — |

**Legality mask is mandatory.** Every observation carries a boolean mask over the action space. An
agent that submits an illegal action gets a no-op and a counter increment — never an exception,
never a silent partial effect. RL agents will submit illegal actions constantly; that must be
cheap and observable.

**Rules changes are world-time only.** Actions 1–7 and 13 are masked out whenever
`clock.mode == engagement`. This is the vision's frozen-policy rule (§3), enforced in one place.

---

## 5. Module Boundaries

```
packages/
  sim-core        deterministic substrate. Depends on: nothing.
  content         data files + loader + validator. Depends on: sim-core (types only).
  rules-magic     grid legality, nodes, knowledge instances, traditions. → sim-core, content
  rules-world     mages, species, populace, universities, economy.        → sim-core, content
  rules-raid      engagement space, combat, objectives, consequences.     → sim-core, content, rules-magic, rules-world
  agent-api       observation/action space, legality masks.               → sim-core, rules-*
  mc-harness      worker pool, sweeps, balance metrics.                   → agent-api
  client-electron renderer. Reads snapshots. Computes no rules.           → agent-api (read path only)
  server          authoritative lockstep, Hetzner deployment.             → agent-api
  gym-bridge      JSON-over-stdio RL wrapper.                             → agent-api
```

**Enforced rules:**

1. `sim-core` depends on nothing and imports no Node built-ins.
2. Nothing depends on `client-electron` or `server`.
3. `rules-magic` and `rules-world` must not import each other. Where they interact — a mage
   learning a node — the interaction lives in a coordinating layer, not in a cycle.
4. Rules packages never import `agent-api`. The dependency runs one way only.
5. A dependency-graph test asserts all of the above in CI. Boundaries that are only documented are
   boundaries that are already broken.

---

## 6. RNG Stream Registry

Subsystem IDs are permanent. Adding a stream is append-only; **reusing or renumbering an ID
invalidates every committed balance baseline.**

| ID | Subsystem |
|---|---|
| 1 | mage birth and personality rolls |
| 2 | mortality |
| 3 | research and discovery |
| 4 | teaching outcomes |
| 5 | scribing outcomes and grimoire durability |
| 6 | populace cohort dynamics |
| 7 | mage autonomy / utility-AI tie-breaking |
| 8 | combat resolution |
| 9 | knowledge theft |
| 10 | objective and raid generation |

---

## 7. Balance Metrics

What the Monte Carlo harness reports. Committed baselines are keyed on these names.

| Metric | Definition |
|---|---|
| `winRateByPrimitive` | raid win rate attributed to each primitive via ablation runs |
| `timeToTierBySpecies` | world ticks for a species to first reach each node tier |
| `knowledgeHalfLife` | world ticks for 50% of nodes known at tick *t* to be lost by tick *t+n* |
| `libraryDependence` | fraction of known nodes with exactly one surviving instance |
| `worshipSnowball` | Gini coefficient of favor regen across MC runs at fixed tick counts |
| `capitalSnowball` | same, over library depth — the §6a loop |
| `raidLengthDistribution` | engagement ticks to resolution; must be bounded by portal stability |
| `ascensionRate` | fraction of runs reaching ascension. Target band: 5–20% |
| `prestigeAdvantage` | win rate of a high-prestige universe vs. a fresh one. **Must stay under 60%** |
| `illegalActionRate` | fraction of agent actions rejected by the mask; a spec-clarity smell |

---

## 8. What This Document Does Not Fix

Deliberately left to the capabilities that own them, so that implementation experience informs them:

- Combat resolution math beyond primitive units — `rules-raid`
- Utility-AI scoring functions for mage autonomy — `rules-world`
- The worship and favor-regeneration formulas — `god-agency`
- Wall-clock pacing — client and server
- Snapshot wire format for network transport — `pvp-server`
- Which 12 cells make the v1 subset — `knowledge-model`, constrained only to include `rego-limen`
