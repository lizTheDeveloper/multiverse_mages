# W29 — The city and the supply chain

Status: **in flight**. Branch `w29/city-and-supply-chain`, from `integration/campaign-round-2` at `0b54c84`.

## 1. What exists today

Nobody had written this down. Measured against the branch base, with file and line.

### The economy is one scalar with four claimants

`packages/state/src/components.ts:133` — `materials: 'i32'`. One `Fp` field on the universe
singleton for the whole physical economy.

`packages/rules-world/src/economy/materials.ts` owns it:

- `MATERIALS_PER_LABORER = 8`, `SUBSISTENCE_PER_PERSON = 1` (both `fp`, both untuned).
- `materialsProduced()` — `laborerCount × 8 × laborAffinity × resourceYieldMultiplier`.
- `CONSUMPTION_ORDER = ['subsistence', 'libraryUpkeep', 'scribing', 'construction']`, and
  `consumeMaterials()` spends down that order, recording a per-claimant shortfall and never
  going negative.

`packages/rules-world/src/economy/carrying-capacity.ts` derives `K` from **territory**
(`Σ landUnits × capacityPerLandUnit`), modulated by a bounded provisioning multiplier that the
materials stock and completed seats each contribute to, and reduced by a subsistence-shortfall
penalty.

### Three of the four claimants are wired to zero or not wired at all

In `packages/coordination/src/world-step.ts`, phase 9:

```
const consumption = consumeMaterials(materials, {
  subsistence: subsistenceDemand(cohorts.totalCount()),
  libraryUpkeep: upkeepOwed,
  scribing: 0,      // already paid at the desk in phase 5
  construction: 0,  // nothing to pay: construction never runs
});
```

`scribing: 0` is legitimate — phase 5 pays it at the desk. `construction: 0` is not: it is zero
because **`advanceConstruction` has no caller outside its own tests**. Confirmed by grep across
`packages/`, and already recorded independently by the Monte Carlo harness at
`packages/mc-harness/src/strategies.ts:1189`:

> *"advanceConstruction in rules-world has no caller outside it — so a completed university is
> god-attributable by construction."*

`buildProgress` only ever moves in `packages/coordination/src/god/interventions.ts:744-756`, where
funding a university adds a flat `god.constants.fundProgress`. Laborers do not raise buildings.
Materials are not spent raising them.

### Therefore `build-rate` and `resource-yield` are inert, and this is provable

- **`resource-yield`**: `packages/coordination/src/world-step.ts`, `produceMaterials()` passes
  `resourceYieldBonuses: []` — a hardcoded empty array. No node effect can reach materials
  production by any path.
- **`build-rate`**: `buildRateMultiplier()` is only ever reached through `advanceConstruction`,
  which nothing calls. Its consumer does not run.

### And nothing at all consumes a node's universe-scoped effects

`packages/content/schema/node.schema.json:59` gives every effect a
`target: "self" | "single" | "area" | "side" | "universe"`. A grep of `rules-world`,
`rules-magic` and `coordination` for a consumer of `"universe"` returns **nothing**.
`packages/coordination/src/god/effects.ts` aggregates blessings and encouragements only.

The shipped content already carries the effects. Across `packages/content/data/node.json`
(300 nodes, 70 cells), **46 cells** carry a `resource-yield` or `build-rate` effect —
`rego-terram` alone carries three `build-rate` nodes and two `resource-yield` nodes. The content
is authored. The wire is missing.

**That is the whole finding: the god's economic verbs produce no marginal value because the
economy has no idea what anyone knows.**

## 2. The design

### 2.1 It is not a fourth resource

`openspec/changes/mages-and-species/specs/economy/spec.md` — *"The economy SHALL track exactly
three inputs — populace, materials, and knowledge-as-capital — and MUST NOT introduce a fourth
resource."* `packages/rules-world/test/unit/economy-three-inputs.test.ts` asserts
`ECONOMIC_INPUTS` equals `['populace', 'materials', 'knowledge-as-capital']` and has length 3.

**Materials gains kinds; the economy does not gain an input.** `ECONOMIC_INPUTS` is unchanged and
stays at three. What changes is that the second of the three is a vector rather than a scalar —
the same move a spreadsheet makes when one column becomes three, not the move it makes when a
second sheet appears. Recorded as a spec delta, not done silently.

### 2.2 Three kinds, from `sound-design.md` §4.2

§4.2 is titled *"Forms are materials"* and names all fourteen. The economy takes three of them
seriously:

| Kind | §4.2 material | Consumed by | Vision sentence it traces to |
|---|---|---|---|
| **food** | Herbam *"fibre"*, Aquam *"flow"*, Animal *"breath, sinew"* | subsistence | §6a *"Populace — produced by fertility, consumed by everything"* |
| **stone** | Terram *"mass, gravel, stone"*, Ignem *"crackle"* (the kiln), Auram *"pressure"* (the bellows) | construction | §4 *"Rego Terram letting universities go up faster is not a special case in code"* |
| **vellum** | Animal *"sinew"* (parchment), Herbam *"fibre"* (paper), Nomen *"Voice. Naming is speech."* | scribing, library upkeep | §6a *"so does every grimoire, which is why a universe can be knowledge-rich and unable to write any of it down"* |

Three, not fourteen. Each has a producer, a consumer that already exists, and a cell.

Forms are **not partitioned** — Herbam and Animal genuinely feed both the table and the shelf, and
forcing a partition to make the arithmetic tidy would be the arithmetic authoring the fiction. A
form carries a weight per kind. What discriminates two universes is that the *sets differ*: a
universe permitting only Terram quarries and starves; one permitting only Herbam eats and writes
and cannot build.

### 2.3 Siting: territory kinds yield different baskets

W24 (`origin/w24/university-siting`, unmerged) established that a *site is a relationship, not a
coordinate* — a university carries a `kindId` into `territory.json`, never a position. A supply
chain over territory kinds is the same move applied to production, and it is why "city" is
expressible with no map: **a city is the set of territory kinds a universe draws on, and the
occupations standing in them.**

Each `territory.json` record gains a per-kind yield weight. The river delta grows food and quarries
nothing; the highland waste is the reverse. No entity gains a coordinate, no distance is computed,
no adjacency is needed.

### 2.4 The relieving mechanism

A new aggregator collects `target: "universe"` effects from nodes **known in the universe**, gated
by `permits()` at application time, and routes each magnitude to the kind(s) its cell's *form* maps
to. `resource-yield` on a `creo-herbam` node raises food; on a `rego-terram` node it raises stone.

This is what makes the two-universe test non-vacuous: without routing by form, permitting
`creo-herbam` and permitting `rego-terram` are interchangeable and the comparison fails by
construction.

`build-rate` gets its consumer back: the world step gains a construction phase that spends
**stone** and person-months against unfinished universities.

## 3. Constraints honoured

- **§7a, no coordinates.** Territory kinds and occupation counts only. No distance function is
  needed and none is written. If one had been, this document would say so and stop.
- **Determinism.** No new RNG draws at all — production and consumption are draw-free today and
  stay draw-free, which satisfies stream-splitting trivially rather than by argument.
- **Fixed point** throughout, scale 1/1024.
- **Goldens** live in `packages/sim-core/test/golden/fixtures` and exercise the core `step`
  contract, not the world loop. They are run and not regenerated.

## 4. Open questions for the author

Recorded rather than answered — see the final report.
