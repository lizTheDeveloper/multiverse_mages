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
  - **Clocks are per-universe.** Entering engagement mode freezes world time for the two
    participating universes only; every uninvolved universe continues to advance. A multi-universe
    simulation therefore ticks universes independently, and no global clock exists at the core
    level.
- **Space.** Only engagement entities have positions. Coordinates are `fp` metres on a 2D plane.
  The reference battlefield is 200 m × 200 m. World-scale entities have **no** coordinates —
  the component model must not assume otherwise.
- **Randomness.** Every draw names a subsystem stream (§6). No subsystem may draw from another's.
- **Nulls.** Absent references are `0`, never `-1` or `undefined`. Entity handle `0` is reserved
  and never allocated.
- **`EDICT_BUDGET_MAX = 8`.** A permanent structural constant, distinct from a universe's current
  `edictBudget`, which grows with worship tier and may never exceed it. The observation vector pads
  to the maximum. Raising this constant is a breaking contract change precisely because it resizes
  the observation and invalidates every trained policy — which is why it is pinned here rather than
  derived from a tuning value in `god-agency`.
- **Content revision.** Every content registry computes a `contentRevision` hash over all loaded
  content. It is written into every snapshot. Two universes may only interact — a raid, a match —
  if their `contentRevision` values are equal. There is no partial-compatibility rule and no
  negotiation; mismatch is refusal with both revisions named.

  **It is 128 bits wide, carried end to end as 32 lowercase hex characters** — in the content
  registry, in `SimState`, in the snapshot header (16 raw bytes), and in the ruleset snapshot,
  with no narrowing at any boundary. The width is normative, not an implementation detail. It was
  once stored as a `uint32`, and because this clause offers no partial-compatibility rule to fall
  back on, that fold made "equal revisions" mean only *probably* identical content: birthday
  collisions become likely around 65,000 distinct content sets, an ordinary number for moddable
  content, and each one admits two incompatible universes to the same match. Narrowing this value
  anywhere is a breaking contract change.

---

## 1. State Schema

The world state is a set of component arrays over an entity store. Grouped by scale.

### 1.1 Universe (singleton per simulation instance)

One simulation instance holds one universe. A raid does **not** load a second universe into the
same instance: it captures an immutable **ruleset snapshot** from each participant at portal open —
`permittedTechniques`, `permittedForms`, `edicts`, `traditionId`, `contentRevision` — and
`permits()` evaluates against that snapshot, never against a live entity.

This is what makes the vision's frozen-policy rule (§3) structural rather than dependent on the
action mask: `rules-raid` may not depend on `agent-api` (§5), so a raid that read live universe
state would have no mechanism preventing mid-raid rule changes at all.

| Field | Type | Notes |
|---|---|---|
| `permittedTechniques` | `uint8` bitmask | 5 bits, one per technique |
| `permittedForms` | `uint16` bitmask | 14 bits, one per form |
| `edicts` | array of `{cellId: uint16, kind: 0=dispensation \| 1=interdiction}` | a new edict may be issued only while `length < edictBudget`. Existing edicts stay in force if the budget later falls — deterministic auto-revocation would silently rewrite a player's ruleset mid-run |
| `edictBudget` | `uint8` | current allowance; grows with worship tier, never exceeds `EDICT_BUDGET_MAX` |
| `traditionId` | `uint16` | exactly one; never 0 |
| `favor` | `fp` | god's currency |
| `worship` | `fp` | drives favor regen |
| `worshipTier` | `uint8` | derived, cached; recomputed on worship change |
| `materials` | `fp` | |
| `era` | `uint16` | **derived, cached**: `floor(worldTick / ERA_TICKS)` with `ERA_TICKS = 240` (20 world years). Nothing advances it imperatively — it was previously a field nothing wrote, while an ascension path was defined over it |
| `prestige` | `fp` | carried in from prior runs; **read-only during a run** |
| `prestigeEarned` | `fp` | written once at run end; the input to the next run's `prestige` |
| `terminalReason` | `uint8` | none \| ascension-apotheosis \| ascension-canon \| stagnation \| truncated |
| `favorCap` | `fp` | rises with worship tier; overflow is discarded and counted as `favorWasted` |
| `encouragedCells` | array of `{cellId, expiryTick}` | action 12 had nowhere to persist |
| `axisChangeCounters` | array per technique/form | hysteresis; repeated flips of one axis escalate in cost |
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

**Legality gates world-time acquisition** — research, teaching, and scribing — and gates casting.
It is deliberately **not** a universal invariant over instances: a mage may hold knowledge her
universe has since forbidden, and it lies dormant rather than being erased. Making legality
universal would silently pre-decide how raid theft works, which belongs to `raid-engagement`.

### 1.2 Mage (individual entity)

| Field | Type | Notes |
|---|---|---|
| `speciesId` | `uint16` | |
| `birthTick` | `int32` | world ticks; age is derived, never stored |
| `roleId` | `uint8` | researcher \| warden \| professor \| raider |
| `universityId` | `uint32` | handle, 0 = unaffiliated |
| `curiosity`, `ambition`, `caution` | `fp` | personality; rolled at birth from species means |
| `vigor`, `maxVigor` | `fp` | the resource a tradition's `cost` hook deducts from. Without it, `cost` has nothing to spend and the hook is decorative |
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
| `holderKind` / `holderId` | `uint8` / `uint32` | mage, library, in transit, or **unowned** — a dead unaffiliated mage's books are not in transit to anywhere |

**One instance per written copy.** A grimoire shelved in a library does not produce a second
instance: the instance's location is *rewritten* from `(2, grimoireId)` to `(3, libraryId)` on
shelving and back on removal. The grimoire-to-library association lives in a subsystem index, not in
a second instance record. Counting a shelved book twice would inflate every redundancy metric and
make `libraryDependence` lie in the safe direction.

**`mastery` thresholds.** `fp(1024)` is full mastery. Below `TEACH_THRESHOLD` a mage may not teach
at all; between the threshold and full, teaching transmits at proportionally reduced mastery. "Loss"
in the mastery scale is therefore defined, not implied.

**Derived, never stored:** whether a node "exists in the universe" is `count(instances of nodeId) > 0`,
computed from an index maintained by the knowledge subsystem. Nothing may cache it in state.

**Persisted, and not derivable:** a per-node **ever-known** record. Instances alone cannot
distinguish a node this universe once held and lost from one it never knew — and rediscovery
requires exactly that distinction. This is state, not an index.

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
| `vigor`, `maxVigor` | `fp` | carried from the source mage; the host tradition's `cost` hook deducts from it |
| `preparedSpells` | array of `nodeId` | **readied at home, spent abroad.** The raider's *home* `cast` hook populates this list at portal entry, drawing on what her home `store` hook makes available; the *host's* `cast` hook governs how casting consumes it and the host's `cost` hook sets the price. This is the only split under which vision §4a's "carries her own preparations but pays the host's price" is literally true — a purely host-governed `cast` would strip a Vancian raider of preparations entirely on arrival |
| `concealment` | `fp` | |

**RaidState**

| Field | Type | Notes |
|---|---|---|
| `hostRuleset` | ruleset snapshot | the defender's. Governs legality, and the `cast`/`cost` hooks |
| `raiderRuleset` | ruleset snapshot | the attacker's. Governs the `acquire`/`store` hooks |
| `objectives` | array of `{kind, targetId, x, y, valueFp, statusKind, capturedBy}` | `statusKind` distinguishes held / captured / looted / destroyed — a looted library still stands, a burned one does not |
| `portalStability` | `int32` | raw integer, decrements every engagement tick; 0 ends the raid |
| `stabilityDecayPerTick` | `int32` ≥ 1 | **authored raw integer, never derived by fixed-point division.** `div` rounds toward negative infinity, so a derived decay silently becomes 0 whenever the divisor exceeds the numerator — a raid that runs forever, with no error and no symptom |
| `raidSeed` | `uint32` | derived at portal open |
| `engagementStartTick` | `int32` | the world tick the raid began at |

**No effect primitive may modify `portalStability`.** Its absence from §3 is load-bearing, not
incidental: adding one would silently downgrade the termination guarantee from a proof to an
observation. Content declaring any stability increase or decay reduction is a hard load failure.

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
  "classicalLabels": ["necromancy"],                 // display only, never mechanical.
                                                     // Vision §4's mapping table is authoritative
  "edicts": [],                                      // optional; "dispensation" | "interdiction".
                                                     // §1.1 requires the loader to reject a cell
                                                     // carrying both, which needs a slot to carry one
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
  "rediscoveryMultiplier": 3072,    // fp; applied to researchCost when relearning a lost node.
                                    // Content invariant: >= fp(3072). Species rediscoveryAffinity is
                                    // applied, then a hard fp(3072) floor -- otherwise affinity alone
                                    // drops the effective cost to 2.25x and falsifies the 0.3.0 claim.
                                    // Author v1 bases at >= fp(5376). NOT fp(4096) -- that number does
                                    // not achieve its own purpose: the best rediscoverer (gnome,
                                    // affinity 1792) turns 4096 into 4096*1024/1792 = 2340, BELOW the
                                    // floor, so the trait clamps flat and does nothing. Break-even is
                                    // 3072 * 1792 / 1024 = 5376
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
  "rediscoveryAffinity": 768,       // fp DIVISOR against rediscoveryMultiplier. Higher is better,
                                    // uniform with every other trait -- so this dwarf is a
                                    // below-average rediscoverer, and gnomes lead (vision §5)
  "maturityMonths": 600,            // before which a mage cannot be promoted from a student cohort
  "mageAptitude": 448,              // fp; share of matured students who become mages at all
  "laborAffinity": 1280,            // fp multiplier on non-magical labour productivity
  "affinities": { "terram": 1536, "ignem": 1152 },  // by form or by cell id
  "personality": { "curiosity": 512, "ambition": 1024, "caution": 1024 }  // means; each defaults to fp(1024)
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
| `direct-damage` | HP per application | engagement | summed per target per tick, then **one** ward factor applied to the sum — so ten small hits equal one large hit rather than differing by rounding artefact |
| `ward` | fraction of damage prevented | engagement | **multiplicative on the remainder**, hard cap `fp(922)` = 90% |
| `area-denial` | HP per engagement tick, within radius (fp metres) | engagement | additive |
| `blink` | fp metres of instantaneous displacement | engagement | max, not sum |
| `summon` | count of combatants from a template | engagement | additive, capped per side |
| `build-rate` | multiplier on construction progress | world | additive into `(1 + Σbonus)`, cap `fp(4096)` |
| `resource-yield` | multiplier on materials per world tick | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `research-rate` | multiplier on research progress | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `teach-rate` | multiplier on teaching throughput | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `scribe-rate` | multiplier on scribing throughput | world | additive into `(1 + Σ)`, cap `fp(4096)` |
| `lifespan` | additive months | world | additive, cap `+50%` of species base. **Recomputed from active effects at each hazard evaluation, never accumulated into a stored field** — which is also why mortality is a per-tick hazard rather than a death date rolled at birth |
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

**Extended precision is mandatory wherever a per-tick rate derives from a long span.** A draconic
lifespan of 18,000 months divided at `fp` scale floors to **zero hazard**, and dragons become
silently immortal — a defect that would survive thousands of Monte Carlo runs looking like a
species that is merely very long-lived. Any rate of the form `X / lifespanMonths` computes at
extended scale before narrowing, and a test must assert a non-zero draconic hazard specifically.

---

## 4. Observation / Action Space

One interface serves scripted bots, Monte Carlo, and reinforcement learning. It is defined once,
here, because building it twice guarantees divergence.

### 4.1 Observation — fixed shape

Shape must be **constant across a run and across universes**, or RL cannot consume it. Variable-
length data is bucketed or summarized, never emitted raw.

| Block | Size | Contents |
|---|---|---|
| `ruleset` | 19 + 2×`EDICT_BUDGET_MAX` = 35 | technique bits, form bits, 8 edict slots (cellId, kind), zero-padded |
| `tradition` | 1 | tradition id |
| `resources` | 5 | favor, worship, worshipTier, materials, prestige |
| `population` | 6 species × 5 occupations = 30 | cohort counts |
| `mages` | 6 species × 8 tiers = 48 | living mage counts by species and highest tier known; **slot 0 is "knows nothing yet"** |
| `knowledge` | 70 cells × 3 = 210 | per cell: nodes known, deepest tier, instance redundancy |
| `institutions` | 4 | university count, total capacity, library depth, grimoire count |
| `clock` | 3 | worldTick, era, mode |
| `engagement` (zeroed at world scale) | 64 | own/enemy combatant summaries, objective states, portal stability |

**Why the mage block has eight slots per species, not seven.** Node tiers are numbered 1–7 (§2.3),
so bucketing purely by highest tier known left a mage who knows nothing in no bucket at all — and
nothing else in the observation carries a living-mage count. An agent could not distinguish ten
fresh mages from none, which is precisely the state a universe is in for its first decades and
exactly when the god's decisions matter most. Slot 0 is the untaught. Found while implementing
`core-contracts`; the block was widened rather than patched around, because a count recovered from
somewhere else would have been a second source of truth for the same fact.

Total: a fixed vector. The core emits integers; **normalization happens in the agent-api layer,
which is the one place floats are permitted** on the way out.

**Exported type is pinned:** `Float64Array`, values in `[0, 1]`, with `fp(1024)` mapping to `1.0`.
Every trained policy depends on this, so it is a contract, not an implementation detail. Each block
declares its own normalization descriptor — a divisor and a clamp — so that a quantity whose range
later grows does not silently rescale an existing policy's inputs.

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

**This rule governs the core only, and the core assumes a trusted caller.** A cheap, silent,
unlimited no-op is correct for a learning agent and is an invitation to unbounded work from a
hostile network peer — and under the AGPL, modified clients are a granted right, not an anomaly.
Any layer accepting actions across a trust boundary (`server`, and `gym-bridge` if ever exposed
remotely) MUST apply its own admission policy — rate limiting, disconnection — *before* the action
reaches the core. The core does not defend itself; the boundary does.

**Every action except no-op is masked during engagement.** The god acts only in world time. This
covers the ruleset actions 1–7 and 13, and equally 8–12, 14, and 15: blessing a defender mid-raid,
or declaring ascension to escape a losing one, violates frozen policy exactly as squarely as
forbidding a technique does. Silence in an earlier draft of this table was not permission.

This is the vision's frozen-policy rule (§3), enforced in one place.

### 4.3 Reward and episode boundaries

The core emits **no reward**. Reward is a property of a training objective, not of the game, and
baking one in would make every trained agent a hostage to one researcher's choice.

Instead the core emits, alongside each observation, an **outcome record**: terminal flag, terminal
reason, era, and the balance-metric deltas since the previous step. The `agent-api` layer exposes a
*pluggable* reward function over that record. The shipped default is sparse and terminal: ascension
`+1`, stagnation `0`, nothing in between.

**Episode boundaries:**

- **Terminal** — ascension (vision §8a), or stagnation as defined by `god-agency`.
- **Truncated** — a step limit imposed by the caller, never by the core. A truncated episode is
  flagged distinctly from a terminal one; bootstrapping value estimates through the two differs, and
  conflating them is a silent training bug.
- **A raid is inside an episode, not its own episode.** The clock changes mode; the episode does
  not end. One agent plays both scales — which is exactly what the fixed-shape observation with its
  zero-filled engagement block exists to support.

### 4.4 Parameterized actions and the explain channel

Actions 8–14 carry entity handles drawn from a set that changes every tick, and a flat discrete mask
cannot express "action 9, but only for these 40 of 3,000 mages."

**Resolution:** parameterized actions address a **slot-indexed candidate list**, not raw handles.
Each observation carries, per parameterized action, a fixed-length list of the top-*k* candidate
entities ranked by a deterministic salience ordering; the agent selects a slot index. `k` is a
structural constant per action, pinned like `EDICT_BUDGET_MAX`. A slot referring to an entity that
died between observation and action is an ordinary illegal action.

**The explain channel** is a separate, optional projection carrying the reasons behind autonomous
mage decisions — utility scores and the goal chosen. It exists because vision §7 makes mage autonomy
a design pillar while §5 forbids the renderer computing rules: with no data path, a client can show
what mages *did* but never why, and autonomy reads as randomness.

It is **not** part of the RL observation. It is emitted on request, is never an input to any rules
computation, and no simulation behaviour may depend on whether it was requested.

**Consumer note, added while drafting `docs/design/sound-design.md` (§10.1).** The core's guarantee
above is unchanged and should stay. But a planned consumer — the client's bark system — wants
*per-mage decision reasons at world-tick granularity*, which is a different shape from *on-demand
explanation of one decision*. Two consequences, neither urgent:

- Whoever pins the explain channel's payload in `agent-interface` should know that shape is wanted,
  because it is much cheaper to know before the format is fixed than after.
- `electron-client` should treat the channel as required for its own read path even though the core
  keeps it optional. A client that skipped it to save bandwidth would ship a game where mages are
  silent about why they act — which is the exact failure this section exists to prevent, arriving
  through a door nobody was watching.

---

## 5. Module Boundaries

```
packages/
  sim-core        deterministic substrate. Depends on: nothing.
  content         data files + loader + validator. Depends on: sim-core (types only).
  state           §1 world state types, component layouts, permits().     → sim-core, content (types only)
  primitives      §3 stacking arithmetic and cap clamping.                → sim-core, content (types only)
  rules-magic     grid legality, nodes, knowledge instances, traditions. → sim-core, content, state, primitives
  rules-world     mages, species, populace, universities, economy.        → sim-core, content, state, primitives
  rules-raid      engagement space, combat, objectives, consequences.     → sim-core, content, state, primitives, rules-magic, rules-world
  agent-api       observation/action space, legality masks.               → sim-core, content, state, primitives, rules-*
  mc-harness      worker pool, sweeps, balance metrics.                   → agent-api
  client-electron renderer. Reads snapshots. Computes no rules.           → agent-api (read path only)
  server          authoritative lockstep, Hetzner deployment.             → agent-api
  gym-bridge      JSON-over-stdio RL wrapper.                             → agent-api
```

**`state` is a deviation from this list as originally drawn, added during `core-contracts`.**
`state-schema` requires one set of world-state type definitions that every rules package consumes,
and the original list had nowhere to put them: `sim-core` must stay content-agnostic — its entity
store knows nothing about magic — and putting them in `rules-magic` would force `rules-world` to
import it for the mage layout, which is exactly the cycle rule 3 forbids. Its edge to `content` is
**types only** because `content`'s public surface re-exports a filesystem-reading loader, and
`state` runs inside the Electron renderer.

**`primitives` is the second deviation, added for the same underlying reason: §5 was drawn before
anyone tried to satisfy it.** §3's stacking arithmetic needs `sim-core`'s fixed-point helpers *and*
the primitive registry that lives in `content`. `content` is in the dependency-purity check's
`PURE_PACKAGES` and may take no runtime dependency, so the arithmetic cannot live there; and §3
forbids re-deriving a floor outside the one shared helper, so it cannot live anywhere that would
have to reimplement one. A package between the two is the only placement that satisfies both.

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
| 7 | mage autonomy / utility-AI tie-breaking, **including combatant goal selection in a raid** |
| 8 | combat resolution only — hit, evasion, damage |
| 9 | knowledge theft |
| 10 | objective and raid generation |
| 11 | terrain generation and combatant deployment |

Draws key on `(rootSeed, stream, tick, actorKey, drawOrdinal)` where `actorKey` is stable identity,
never array index. This gives **insertion invariance**: adding a combatant, or adding a draw,
disturbs nobody else's rolls. Without it, an ablation run diverges from its control for reasons
unrelated to the ablated primitive, and every attribution measurement becomes noise.

---

## 7. Balance Metrics

The **registry of metric names**. Committed baselines are keyed on these names, and a CI check
asserts the implemented registry's keys equal this list exactly.

**The precise definitions live in the `agent-interface` capability specs, under an explicit
`definitionVersion`, not here.** Every metric below needed pinning that prose could not carry —
census intervals, censoring rules, denominators, whether a rate is instantaneous or cumulative. A
metric whose definition drifts silently makes every committed baseline meaningless while still
appearing green, so the definition is versioned alongside the numbers it produces.

**Ownership splits two ways.** `agent-interface` owns each metric's *definition and collection*;
the capability that owns the mechanic owns its *threshold value* — `worshipSnowball`,
`ascensionRate`, and `prestigeAdvantage` thresholds belong to `god-agency`, and the tempo metrics
to `raid-engagement`. A definition without a threshold is unfalsifiable; a threshold without a
pinned definition is unmeasurable.

**A metric whose mechanic does not yet exist reports `{status: "unavailable", reason:
"mechanic-absent"}`.** It is never absent from the output. This is what lets `0.5.0` claim that
every metric is reported two milestones before raids exist: a missing key is a harness failure, an
unavailable status is an honest answer.

| Metric | Definition |
|---|---|
| `winRateByPrimitive` | raid win rate attributed to each primitive via ablation runs |
| `timeToTierBySpecies` | world ticks for a species to first reach each node tier |
| `knowledgeHalfLife` | world ticks for 50% of nodes known at tick *t* to be lost by tick *t+n* |
| `libraryDependence` | fraction of known nodes with exactly one surviving instance |
| `worshipSnowball` | Gini coefficient of favor regen across MC runs at fixed tick counts. **Threshold: ≤ 0.35**, plus p95:p50 regen ≤ 3:1 |
| `capitalSnowball` | same, over library depth — the §6a loop |
| `raidLengthDistribution` | engagement ticks to resolution; must be bounded by portal stability |
| `ascensionRate` | fraction of runs reaching ascension. Target band: 5–20% |
| `prestigeAdvantage` | win rate of a high-prestige universe vs. a fresh one. **Must stay under 60%** |
| `illegalActionRate` | fraction of agent actions rejected by the mask; a spec-clarity smell |
| `inboundRaidTempoLoss` | world ticks a universe spends frozen in engagement as a defender, as a fraction of elapsed multiverse time. **Must stay under its threshold** — this is the griefing guard |
| `raidInitiationCost` | tempo an attacker forgoes per raid, for comparison against what they gain |

---

## 8. What This Document Does Not Fix

Deliberately left to the capabilities that own them, so that implementation experience informs them:

- Combat resolution math beyond primitive units — `rules-raid`
- Utility-AI scoring functions for mage autonomy — `rules-world`
- The worship and favor-regeneration formulas — `god-agency`
- Wall-clock pacing — **the server is authoritative; the client follows.** In single-player, the
  client's own core instance is the server for this purpose. Naming one owner matters: two owners
  choosing independently produces a divergence determinism cannot catch, because both sides are
  individually correct
- Snapshot wire format for network transport — `pvp-server`
- Which 12 cells make the v1 subset — `knowledge-model`, constrained only to include `rego-limen`
