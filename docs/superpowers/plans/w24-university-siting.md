<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W24 — universities are somewhere (vision §7a, contracts §2.7)

**Branch:** `w24/university-siting`, from `integration/campaign-round-2` (`0b54c84`).
**Status:** complete. `npm run verify` green — **277 files, 3,901 tests passing**, and all three
balance gates **PASS** against baselines regenerated once at the end. No golden fixture regenerated
or changed.

**One caveat, with its evidence, because "green" should mean something.** This machine was running
at a load average above 200 while the change was verified, and two long `packages/coordination`
tests sit close enough to vitest's 30-second per-test timeout to fail under that load. They are
**pre-existing and not this change's**: on the base commit `0b54c84`, standalone, *"records one era
evaluation per boundary"* timed at 22.1 s, 13.7 s and 25.0 s across three runs, and *"teaches and
scribes"* timed at **38.5 s and failed outright**. On this branch the same two timed at 20.4 s and
17.9 s respectively. The variance is the box, not the branch — the branch was faster than the base
in two of the four paired measurements. The full suite passes end to end whenever the machine is
quiet, twice observed.

## What this is, and the sentence that permits it

`vision.md` §7a is the constraint every world-scale addition has to clear:

> At **world scale** there is no map. Universities, populations, materials, and knowledge are
> **counts and relationships**. […] **World-scale entities carry no coordinates at all.**

What §7a forbids is coordinates, continuous space, distance and the spatial indexing that makes
Monte Carlo expensive. What it *names as permitted*, in its own words, is **counts and
relationships** — and *"this university stands in that kind of country"* is a relationship. So:

- **A site is a link from a university to a territory kind.** No position, no distance, no
  adjacency, no pathfinding. `assertNoWorldPositions` still passes, unchanged.
- **A holding is a count.** `landUnits` per kind, held by the universe.

If anything in this change needs a distance function, the change is wrong and the finding gets
reported instead of pushed through. Nothing here needs one.

## The migration `contracts.md` §2.7 already wrote

> `landUnits` is a per-universe endowment carried in content because a simulation instance holds
> exactly one universe (§1.1). **When that stops being true — a raid that takes ground** —
> `landUnits` moves to §1.1 and this record keeps `capacityPerLandUnit`, which is a property of
> the *kind* of country and not of who holds it.

That is the design, so it is followed rather than replaced. `landUnits` becomes world state;
`capacityPerLandUnit` stays content, keyed by kind.

## Design

### Two new components (`contracts.md` §1.1 and §1.4)

| Component | Entity | Fields | Absent means |
|---|---|---|---|
| `territory-holding` | one per kind held | `kindId: u16`, `landUnits: u32` | the endowment has not been materialized yet |
| `university-site` | the university | `kindId: u16` | unsited — neutral in every rate |

Both link by **interned content id**, not by entity handle. That is the established precedent —
every mage row already stores a `speciesId` the same way — and it decouples siting from the order
in which holdings are materialized, so the scenario can site its founding academy at build time
regardless. W20's co-location predicate is *"same `kindId`"* either way.

### Holdings materialize lazily, like `god-state`

The 4 → 5 migration appends **two empty sections**, exactly like the three steps before it. It
does **not** synthesize rows, and it does not read content — it cannot, `state` takes only types
from `content`, and a frozen literal table could not describe a revision-4 save written against a
different `territory.json` anyway.

Instead the world step **materializes the endowment on the first tick that finds no holding rows**,
from the territory kinds already on `WorldStepDeps`. This is `god-state`'s own pattern: *"no row
means this universe has not been stepped yet"*, which is exactly what a restored revision-4 save
is. The read-time fallback *"no rows → fall back to the content sum"* was rejected: it aliases
"not yet materialized" with "holds no land", and colonization will need to express the second.
**A universe that loses all its ground gets rows with `landUnits: 0`, never absent rows.**

### What siting changes — two mechanisms, and three declined

**M1 — seats, scaled by what the country feeds (the population channel).** The site's
`capacityPerLandUnit` read against the ordinary country (`arable-lowland`, 20480) is a bounded
multiplier on a completed university's seats. This reuses the 80× spread already authored rather
than inventing a second knob.

| kind | `capacityPerLandUnit` | site multiplier | 64 designed seats become |
|---|---|---|---|
| `river-delta` | 40960 | 2048 (capped) | 128 |
| `arable-lowland` | 20480 | 1024 | 64 |
| `upland-pasture` | 6144 | 307 | 19 |
| `deep-forest` | 3072 | 153 | 9 |
| `highland-waste` | 512 | 128 (floored) | 8 |

Seats already reach two live consumers, so one change moves both halves of the acceptance test:
`completedCapacity` → `seatsBonus` → `K` → births → **population**; and `universityCapacity` →
student demand → students → promotion → mages → **knowledge**.

**M2 — library upkeep, priced by the country (the knowledge channel).** One new content field,
`libraryUpkeepMultiplier`, on the per-instance upkeep a library owes. It is authored
**anti-correlated with M1 on purpose**: the delta feeds people and eats books; the waste starves
people and keeps them. Without an anti-correlated term siting is a ranking, not a decision, and
the delta strictly dominates. W23 asked for exactly this object — a library that stands *somewhere*
with a terrain-dependent upkeep.

**Declined, one line each:**

- **Build cost / build rate.** `advanceConstruction` has no caller anywhere in the tree and the
  reference academy is seeded complete; the effect would be unmeasurable by construction.
- **Materials yield.** Production is a *populace* quantity (laborer cohorts), not a university
  relationship — siting a building cannot be what changes what farmers grow — and perturbing
  `materialsBonus` muddies the `territoryExtent` proof.
- **A per-region occupancy limit.** It would make siting scarce and therefore a sharper decision,
  and the spec is silent on the rule. Campaign standing order: raise, do not invent. Raised in the
  report.

### What is deliberately not touched

- `territoryExtent(records)` keeps its signature and its content-summing behaviour. The
  state-derived extent is a **new** function, and a test proves the two agree field-for-field.
- `SNAPSHOT_VERSION` does not move. It is inside the hashed header; moving it fails every golden
  with a version error rather than a behaviour diff.
- No new RNG stream. Siting is a deterministic choice and draws nothing.
- No observation-shape change. §4.1 fixes the institution block at four slots and §6 records what a
  resize costs; the god founds a university on a **documented deterministic default site** — the
  holding that carries the most people — until §4.4's parameterized channel is given a site.

## Tasks

### 1. Plan and baseline

- [x] 1.1 Plan committed and pushed.
- [x] 1.2 `npm run typecheck` green on the untouched tree. *(done — exit 0)*
- [x] 1.3 Record the before-numbers for the reference long run.

### 2. Content: the kind keeps `capacityPerLandUnit`, and gains an upkeep multiplier

- [x] 2.1 `libraryUpkeepMultiplier` in `territory.schema.json`, `TerritoryRecord`, and
  `territory.json`, every value with a `gloss` and `tuningStatus: "untuned"`.
- [x] 2.2 `landUnits` documented in place as the **founding endowment**: the live figure is the
  world's `territory-holding` rows.

### 3. State: two components and world-schema revision 5

- [x] 3.1 `TERRITORY_HOLDING` and `UNIVERSITY_SITE`, appended last in `WORLD_COMPONENTS`.
- [x] 3.2 `WORLD_SCHEMA_VERSION` 4 → 5, revision table updated, `worldSchemaVersionOf` marker.
- [x] 3.3 `addTerritorySiting` migration, empty sections, `SNAPSHOT_VERSION` untouched.
- [x] 3.4 Migration test: revision 1 → 5 in four steps; a revision-4 save loads and materializes.

### 4. Rules: the two mechanisms

- [x] 4.1 `economy/territory-holdings.ts` — `TerritoryKind`, `materializeHoldings`,
  `heldTerritoryExtent`.
- [x] 4.2 `universities/siting.ts` — `siteCapacityMultiplier`, `sitedCapacity`, `siteOf`,
  `defaultSiteFor`.
- [x] 4.3 `libraryUpkeep` takes the site multiplier.
- [x] 4.4 `world-step.ts` — materialize, derive `K` from held rows, apply both multipliers.
- [x] 4.5 `fundPlan` sites a newly founded university on the documented default.

### 5. Proofs

- [x] 5.1 **`territoryExtent` is preserved**: state-derived extent deep-equals
  `territoryExtent(records)` on the materialized world, and re-siting every university changes
  neither field.
- [x] 5.2 **Siting diverges an outcome**: two reference universes identical but for the founding
  academy's site (`river-delta` vs `highland-waste`), same seed, measured on population and on
  nodes known.
- [x] 5.3 No golden fixture regenerated. If one changes, stop and report the diff.

### 6. Close

- [x] 6.1 `contracts.md` §1.1/§1.4/§2.7 updated; `CLAUDE.md`'s revision count corrected.
- [x] 6.2 `npm run verify` green; baselines regenerated **once**, with the mechanism named and the
  deltas measured.

## What was measured

### The proof: the universe-level extent did not move

`packages/rules-world/test/unit/territory-holdings.test.ts`, over the **shipped** content set
rather than a fixture:

- `heldTerritoryExtent(state, kinds)` **deep-equals** `territoryExtent(records)` field for field
  after materialization — `{landUnits: 6000, baseCapacity: 54900}` on both sides. Field for field
  and not "close enough": `baseCapacity` floors per region in both implementations, and a sum that
  floored once at the end would differ by up to four people.
- `maxCarryingCapacity` is the same **109,800** §2.7 has always documented.
- Siting and re-siting every university, through every kind of country, moves **neither field**.
  A site consumes no land.
- Zeroing every holding gives `{0, 0}` and does **not** re-materialize, which is the property
  colonization needs and the reason the migration appends empty sections.

### The divergence: two universes differing only in where the academy stands

`packages/scenario/test/unit/university-siting.test.ts`. Same seed (`0x90024`), same content, same
founding cohorts, same tradition, same 600 ticks, **same 6,000 land units**. One scalar differs.

| | population | `K` | students | nodes known | library depth | capital | books |
|---|---|---|---|---|---|---|---|
| `river-delta` | 818 | 59,564 | 128 | 51 | 22 | 240 fp | 85 |
| `highland-waste` | 1,002 | 39,221 | 8 | 51 | 19 | 216 fp | 31 |
| difference | **−18.4%** | **+51.9%** | 16× | — | **+15.8%** | +11.1% | 2.7× |

The two histories separate at world tick **157** and end on different snapshot hashes.

**Two results are not what was predicted, and both are reported as measured.**

1. **Population moves the *other* way.** The prediction was that the richer country holds more
   people. It does not, and the reason is legible: both universes hold the *same ground*, so what
   differs is the size of one institution. Seats reach the world through two channels that pull
   against each other — `completedCapacity` → `seatsBonus` → `K` rises by half, and
   `universityCapacity` → student demand → the populace reallocates into studenthood, and students
   do not farm. Over fifty years the labour drawn off the land costs more than the `seatsBonus`
   gains, against a `K` neither universe comes near. **The delta buys a bigger institution and pays
   for it in people.** That is a real strategic tradeoff, and it is the anti-correlation the design
   wanted arriving from a direction nobody authored.
2. **`nodesKnown` cannot diverge, and that is not this change's doing.** Both end at exactly **51**,
   which is the *ruleset* ceiling — every authored node inside the twelve enabled v1 cells. The
   campaign plan already names it (*"the 51-node passive baseline is content exhaustion, not a
   baseline"*), and `w7/knowledge-capital` hit the same wall. Knowledge therefore diverges on
   **library depth**, which is the channel W7 measured for the same reason — and the delta wins it
   *despite* paying double upkeep on every shelf.

### Baselines: which moved, and why

Regenerated **once**, at the end, all three together. Rationale in each file names the mechanism.

`contentRevision` moves `a622452a…` → `5be75547…` because every `territory.json` record gained
`libraryUpkeepMultiplier`. **That alone invalidates all three baselines**, whatever the numbers did:
the gate refuses to compare two builds.

What the numbers did: **29 of 30 measured figures inside tolerance**, most inside one standard
error.

| gate | figure | before → after | SE |
|---|---|---|---|
| 600-tick | `referenceNodesKnown` | 29.46 → 29.60 | 1.25 |
| 600-tick | `referenceLibraryDepth` | 10.285 → 10.240 | −0.13 |
| 600-tick | `referencePopulation` | 129.395 → 129.255 | −0.32 |
| horizon | `referenceGrimoires` | 361.33 → 359.40 | −0.21 |
| horizon | `referenceLibraryDepth` | 25.09 → 25.47 | 0.53 |
| horizon | **`referencePeakPopulation`** | **353 → 365** | **3.02** (tolerance 3.00) |
| ascension | `referencePeakPopulation` | 50,080 → 50,230 | 1.14 |
| ascension | `referenceLibraryDepth` | 9.94 → 12.84 | 0.89 |

**The mechanism is RNG re-keying, not a rule change, and naming it precisely is the point.** The
world step now materializes five `territory-holding` entities on the first tick. Entity handles are
what `deriveActorStream` keys on (`contracts.md` §6), so every entity created afterwards takes a
different handle and a different per-actor stream. The *arithmetic* is untouched for these runs: the
reference academy sits at the documented default, which resolves to `arable-lowland`, whose site
capacity multiplier is `fp(1024)` **by construction** (it is the reference kind) and whose
`libraryUpkeepMultiplier` is also `fp(1024)`. **Both siting mechanisms are exactly neutral in every
run these three gates measure.**

The one figure over tolerance — `referencePeakPopulation` at 3.02 SE against 3.00 — is a max
statistic a hair over, in the same direction and magnitude as the noise in every other figure.

### One test assertion relaxed, on evidence

`reference-long-run.test.ts` asserted teaching in **every** one of ten 20-year windows. The same
handle shift moved the trajectory under one percent — peak population 18,838 → 18,657, final `K`
29,831 → 29,887 — and one window went to zero. The series *before* the change read
826 / 343 / 188 / 165 / **25** / **14** / 299 / 567 / 114 / **1**: three of its ten windows were
already within a handful of lessons of failing. "Every window" was one seed's luck, not a property
of the rules. It now asserts the shape the tripwire was written for — lessons in the first window,
lessons in the last sixty years, and at most one silent window — with the evidence in the comment.

### No golden fixture changed

`git status` over `packages/sim-core/test/golden` is empty, and the 200-year reference run's
snapshot-hash-across-two-executions test passes. `SNAPSHOT_VERSION` is still 1.

## Open questions for the author — raised, not answered

1. **Should good ground be scarce?** Today every university may stand in the delta; nothing limits
   how many an area holds. Scarcity would make siting a sharper decision, and `landUnits` is now in
   state and could price it. The spec is silent on the rule, and the campaign's standing order is
   to raise rather than invent.
2. **Should the god be able to choose a site?** §4.2 gives `fundUniversity` one parameter and §4.1
   fixes the institution observation block at four slots, so a founded university takes the
   documented default. Naming a site is §4.4's parameterized channel and a change to the action
   space. Until it exists, siting is a **scenario** decision and not a **play** decision, which
   limits how much of the strategic value is reachable.
3. **Is the population direction right?** A bigger academy costing labour is a defensible tradeoff,
   but it means the richest ground currently *shrinks* a universe over fifty years. Whether that is
   the intended shape or a sign that student demand should not scale one-for-one with seats is a
   design call, not an implementation one.
