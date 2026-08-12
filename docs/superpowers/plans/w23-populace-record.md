# W23 — the populace and the written record

Branch `w23/populace-and-record`, off `integration/campaign-round-2`, carrying W22's census
(`origin/w22/knowledge-observability`, fast-forward — no conflict).

**Instrument:** W22's `knowledgeCensus` / `mageContainment` / `locationSharePerMille`. This
workstream builds no second census. `tools/w23/trajectory.mjs` samples that census on a stride and
adds the two populace quantities it cannot see (occupation headcounts, the materials stock),
because W23's defect is a **curve** and W22's report is an endpoint.

---

## 1. The negative control, reproduced

`node tools/w23/trajectory.mjs --every 100`, seed `0x00090001`, 2,400 ticks, zero god input.
Snapshot hash `cb1c0efafbd7f66a` — **identical to W22's**, so the two reports are the same run.

| tick | mind | libr | ‰mind | ‰libr | pop | scribe | labor | stud | idle | materials |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 0 | 4 | 0 | 1000 | 0 | 72 | 24 | 24 | 24 | 0 | 1,024,000 |
| 100 | 314 | 85 | 786 | 213 | 79 | 23 | 32 | 0 | 24 | 933,083 |
| 300 | 460 | 283 | 619 | 380 | 132 | 20 | 33 | 0 | 79 | 680,401 |
| **500** | 499 | **519** | 490 | 509 | 241 | 15 | 38 | 33 | 155 | 280,375 |
| **600** | 590 | **129** | 820 | 179 | 316 | 14 | 44 | 64 | 194 | **0** |
| 1200 | 2247 | 15 | 993 | 6 | 2,268 | 14 | 137 | 64 | 2,053 | 0 |
| **2000** | 1449 | **0** | **1000** | 0 | 14,481 | 10 | 42 | 64 | 14,365 | 0 |
| 2400 | 2172 | 0 | **1000** | 0 | 17,325 | **6** | 67 | 64 | 17,188 | 0 |

Grimoire and palace are **zero at every sample**: a finished book is shelved in its scriptorium's
library from its first tick (`gateway.ts` `contributeScribing` chooses `HOLDER_KIND.library`), and
the reference universe runs Vancian, which keeps no memory palace. So of vision §5's four
locations, this run only ever populates two, and by tick 2000 only one.

Per-mage containment at 2400: **0.201** (309/1540 incomparable pairs, 56 holders).

## 2. What the curve says that the endpoint does not

The endpoint reads as "nothing is ever written down". The curve says the opposite: the universe
wrote **519 instances by tick 500** and then went bankrupt.

At tick 500 the arithmetic is decisive:

| claimant | materials per tick |
|---|--:|
| library upkeep (519 instances × `LIBRARY_UPKEEP_PER_INSTANCE` 2) | **1,038** |
| subsistence (241 people × 1) | 241 |
| production (38 laborers × `MATERIALS_PER_LABORER` 8 × affinity) | **~304** |

The library alone owes **3.4× the universe's entire material production**. The founding stock of
1,024,000 absorbs the deficit for about 500 ticks and then empties. From tick 600 onward `paid`
is 0, so `shortfall` is the full amount owed, `floorDiv(shortfall, 32)` destroys instances every
tick, and the shelf erodes geometrically to zero.

**Three defects compose, and only two of them are in the brief.**

1. **Scribe demand is the literal `0`** (`world-step.ts:581`). `reallocateOccupations` can only
   ever classify `scribe` as surplus, so the founding cohort of 24 drains to 6 and is never
   backfilled. `feasibility.ts:111` refuses the scribe goal outright when throughput is zero, so
   this is a hard floor on writing, not a slow one.
2. **Library upkeep destroys at a flat price.** `applyLibraryUpkeep` returns
   `floorDiv(shortfall, DEGRADATION_PER_SHORTFALL=32)` instances and `degradeLibrary` destroys
   that many. Every book costs the same 32 of shortfall regardless of how well it was made, which
   is why `durability` — the one structural species difference, dwarf 1792 against orc 384 — has
   never changed an outcome outside a raid that has never run.
3. **Nothing asks for the workforce that pays for any of it.** Laborer demand is
   `constructionBacklog × 40 / fp(1024)` and nothing else. `advanceConstruction` has no caller, so
   the backlog never shrinks and laborer demand is a *constant* — pinned at 40 per unfinished
   university for the whole run. Total demand across all four occupations is roughly 104 people.
   Everybody else is `idle`, eats 1 material a tick and produces nothing: **17,188 idle against 67
   laborers at tick 2400**, a subsistence bill of 17,325 against production of ~536.

Defect 3 is why no fix confined to 1 and 2 can work. Whatever a durable book costs, `paid` is
zero for 1,800 consecutive ticks and an unpaid shelf decays to nothing. Repricing destruction
changes the slope; it cannot change the limit.

## 3. What this workstream changes

### 3.1 Scribe demand follows the unwritten record — §5, §6

> §5: *"A node **exists in your universe** while at least one instance does."*
> §6: *"scribes copy grimoires … A universe of pure archmages does not function."*

`scribingQueueDepth` becomes the count of nodes the universe holds **with no written copy** — every
instance at `mind:` or `palace:`, none at `grimoire:` or `library:`. That is W22's
`unwrittenNodeIds.length`, recomputed inside `coordination` from the instance component, because
`agent-api` is a diagnostic package the rules path may not import.

Demand **asks**; it does not check the till. §6a's *"a universe can be knowledge-rich and unable to
write any of it down"* is enforced at the desk, where `scribe()` already refuses on
`insufficient-materials` and `materialsAccess` already reserves subsistence and upkeep ahead of the
scribes. Gating demand on materials as well would double-count the constraint and hide it.

### 3.2 Laborer demand covers what the universe owes — §6a

> §6a: *"**Materials** — the physical substrate. Buildings consume it; so does every grimoire."*

The construction term stays. Added to it: `ceilDiv(subsistence + libraryUpkeepOwed,
MATERIALS_PER_LABORER)` — the headcount that would cover this tick's bill at the reference
per-laborer yield. Both quantities are already computed above the `stepPopulace` call, so no phase
moves. Affinity is deliberately ignored: an orc universe over-supplies and a draconic one
under-supplies, which is an untuned magnitude, not a mechanism.

**This is a fifth demand driver and it contradicts a MUST.**
`openspec/changes/mages-and-species/specs/economy/spec.md:80` says reallocation *"MUST be driven by
demand from universities under construction, the scribing queue, university capacity, and the
standing soldier target"*. That sentence was written before anything ran a universe for 200 years.
The deviation is recorded in the spec with its reasoning rather than made silently, in the same
style as `contracts.md` §5's four recorded package deviations. `mages-and-species` is still in
flight and owns the amendment.

### 3.3 A book's durability is what it costs neglect to destroy — §5, §6

`applyLibraryUpkeep` stops converting shortfall into an instance count. It reports the shortfall,
and `degradeLibrary` spends it as a budget against the actual shelf: each book costs
`max(1, floorDiv(durability, DEGRADATION_PER_SHORTFALL))`.

`durability = mul(1024, scribeAffinity) + roll(0..256)`, so the price is:

| scribe | affinity | durability | shortfall to destroy one book |
|---|--:|--:|--:|
| orc | 384 | ~384–640 | **12–20** |
| human, elf | 1024 | ~1024–1280 | **32–40** |
| dwarf | 1792 | ~1792–2048 | **56–64** |

Exactly **32 at human affinity**, which is today's flat price — so the change is neutral where the
old constant was implicitly calibrated and differentiates in both directions from there. The
duplicates-before-singles order is unchanged, no RNG draw is added (no stream-split risk), and
nothing is switched off: a library that cannot pay still loses books, ~4.7× faster in orcish hands
than dwarven.

### 3.4 Soldier demand is scoped out, and here is why

`standingSoldierTarget` has **no source in world state**. There is no field for it on `UNIVERSE` or
anywhere else; `assignRole` (`god/interventions.ts:672`) writes a *mage's* `role`, which is §7's
`researcher / warden / professor / raider`, not a populace headcount. §7's own standing roles are
themselves inert — W12 measured `outlook.wardPressure` and `outlook.raidPressure` hardcoded `0`
(`outlook.ts:115–116`), so `role-bias.ts`'s +384 for ward-duty and raid-readiness never varies.

Wiring soldier demand therefore requires either inventing a driver from raid activity — which
would be a magnitude with no vision sentence behind it — or adding a god-set standing target, which
is `god-agency`'s contract to write, not this workstream's. **Scoped out, named, not faked.**

### 3.5 `advanceConstruction` stays uncalled

The brief puts it in scope only if fixing scribes requires it. It does not: the coverage term in
3.2 makes laborer demand independent of construction. Left alone, and reported.

One pathology worth handing on: laborers exist today *only because construction never finishes*.
The moment someone wires `advanceConstruction`, the construction term goes to zero on completion —
and without 3.2 the laborer force would go with it.

---

## 4. The checklist

- [x] 0. Branch, `npm ci`, `npm run typecheck`, merge W22's census (fast-forward)
- [x] 1. Negative control: reproduce W22's numbers on this tree, hash-identical
- [x] 2. `tools/w23/trajectory.mjs` — the census on a stride, plus occupations and materials
- [x] 3. Plan committed and pushed before code
- [x] 4. Enumerate the blast radius: goldens vs balance baselines
- [x] 5. `unwrittenNodeCount` in `coordination`, wired to `scribingQueueDepth`
- [x] 6. Laborer coverage term in `rules-world/populace/demand.ts` + spec amendment
- [x] 7. `degradeLibrary` takes a shortfall budget; durability prices each book
- [x] 8. Unit tests: the clean positive control for durability, and demand-driver tests
- [x] 9. Re-measure: four-way split, library curve, containment, dwarf vs orc
- [x] 10. `npm run verify`; baselines regenerated once with rationale if they move

### Blast radius, enumerated before editing

- **Golden replay fixtures** — `packages/sim-core/test/golden/fixtures/`:
  `world-time-only.json`, `entity-churn.json`, `engagement-transition.json`. All three drive
  **toy systems** inside `sim-core`, not the reference world loop, so no world-rule change can
  reach them. If one moves anyway, that is the mandated STOP: report the diff, never regen.
- **Balance baselines** — `balance/baselines/balance-gate-v1`, `-horizon-v1`, `-ascension-v1`.
  These *do* read the world loop and are expected to move. Regenerated **once**, at the end, with
  the rationale written down. Note that all three cap at `worldTickCap: 60` — four hundred ticks
  before the library even peaks — so none of them could ever have caught this defect, and none of
  them will confirm it fixed.

### Controls

Every number is taken against a control, because this campaign has been burned three times by
metrics that saturate.

- **Negative control** — the current tree, §1 above: 1000‰ mind, zero libraries, 0.201 containment.
- **Positive control for durability, clean** — a unit test on `degradeLibrary`: one shelf, one
  shortfall budget, high-durability books against low-durability books, same everything else.
  Fewer destroyed is then attributable to durability and to nothing else.
- **Positive control for durability, integration** — `--mask 2` (dwarf-only) against `--mask 32`
  (orc-only) over 2,400 ticks. **Confounded and reported as such**: orc fertility is 1536 against
  dwarf 768 and orc `laborAffinity` 1536 against dwarf 1280, so the two universes differ in
  population and production wholesale, not only in how well they write. Evidence, not proof; the
  unit test is the proof.
- **Containment is measured, not engineered.** The plausible mechanism for a rise is scribing
  competing for mage-months and slowing repertoire convergence. If books persist and containment
  does not move, that number is reported as a finding.

### Expected residual, stated in advance so it is not spun later

Once all 51 nodes are written, the unwritten count falls to ~0, scribe demand with it, and the
cohort drains again until something is lost. **Scribing equilibrates; it does not persist at
scale** — which is W22's own correction, and acceptable v1 behaviour. A standing-redundancy term
that keeps scribes employed writing second copies is a magnitude nobody has asked for and is not
being added here.

---

## 5. Results

Filled in at §6 below once measured, against the §1 control.
