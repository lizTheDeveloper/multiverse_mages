<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W24 — universities are somewhere (vision §7a, contracts §2.7)

**Branch:** `w24/university-siting`, from `integration/campaign-round-2` (`0b54c84`).
**Status:** in flight.

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

- [ ] 1.1 Plan committed and pushed.
- [ ] 1.2 `npm run typecheck` green on the untouched tree. *(done — exit 0)*
- [ ] 1.3 Record the before-numbers for the reference long run.

### 2. Content: the kind keeps `capacityPerLandUnit`, and gains an upkeep multiplier

- [ ] 2.1 `libraryUpkeepMultiplier` in `territory.schema.json`, `TerritoryRecord`, and
  `territory.json`, every value with a `gloss` and `tuningStatus: "untuned"`.
- [ ] 2.2 `landUnits` documented in place as the **founding endowment**: the live figure is the
  world's `territory-holding` rows.

### 3. State: two components and world-schema revision 5

- [ ] 3.1 `TERRITORY_HOLDING` and `UNIVERSITY_SITE`, appended last in `WORLD_COMPONENTS`.
- [ ] 3.2 `WORLD_SCHEMA_VERSION` 4 → 5, revision table updated, `worldSchemaVersionOf` marker.
- [ ] 3.3 `addTerritorySiting` migration, empty sections, `SNAPSHOT_VERSION` untouched.
- [ ] 3.4 Migration test: revision 1 → 5 in four steps; a revision-4 save loads and materializes.

### 4. Rules: the two mechanisms

- [ ] 4.1 `economy/territory-holdings.ts` — `TerritoryKind`, `materializeHoldings`,
  `heldTerritoryExtent`.
- [ ] 4.2 `universities/siting.ts` — `siteCapacityMultiplier`, `sitedCapacity`, `siteOf`,
  `defaultSiteFor`.
- [ ] 4.3 `libraryUpkeep` takes the site multiplier.
- [ ] 4.4 `world-step.ts` — materialize, derive `K` from held rows, apply both multipliers.
- [ ] 4.5 `fundPlan` sites a newly founded university on the documented default.

### 5. Proofs

- [ ] 5.1 **`territoryExtent` is preserved**: state-derived extent deep-equals
  `territoryExtent(records)` on the materialized world, and re-siting every university changes
  neither field.
- [ ] 5.2 **Siting diverges an outcome**: two reference universes identical but for the founding
  academy's site (`river-delta` vs `highland-waste`), same seed, measured on population and on
  nodes known.
- [ ] 5.3 No golden fixture regenerated. If one changes, stop and report the diff.

### 6. Close

- [ ] 6.1 `contracts.md` §1.1/§1.4/§2.7 updated; `CLAUDE.md`'s revision count corrected.
- [ ] 6.2 `npm run verify` green; baselines regenerated **once**, with the mechanism named and the
  deltas measured.
