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

All measured with `node tools/w23/trajectory.mjs`, seed `0x00090001`, 2,400 ticks, zero god input,
against the §1 negative control on the identical coordinates.

### 5.1 The four-way location split

| location | before | after | before ‰ | after ‰ |
|---|--:|--:|--:|--:|
| `mind:` | 2,172 | 2,181 | **1000** | **474** |
| `grimoire:` | 0 | 0 | 0 | 0 |
| `library:` | 0 | 2,414 | 0 | **525** |
| `palace:` | 0 | 0 | 0 | 0 |
| total | 2,172 | 4,595 | | |

**Two of the four locations are still structurally empty, and neither is W23's doing.**

- `grimoire:` is zero at *every* tick of *every* run, before and after. A finished book is shelved
  in its scriptorium's library from its first tick — `contributeScribing` picks
  `HOLDER_KIND.library` at creation — so `grimoire:` only ever holds a book written by an
  unaffiliated mage, and the reference universe has none. Not a defect so much as an unexercised
  branch, but §5 lists it as one of four locations and it has never held anything.
- `palace:` requires an Art of Memory universe and the reference universe runs Vancian. Structural.

So the honest claim is narrower than the acceptance criterion's wording: knowledge now lives in
**two** of §5's four locations rather than one, roughly evenly split.

### 5.2 The library curve — the thing the endpoint could not show

Sampled every 25 ticks (`--ticks 1000 --every 25`), library instances:

| tick | 100 | 300 | 500 | **525** | 575 | 600 | 625 | **750** | 800 | 900 | 1000 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| before | 85 | 283 | 519 | 572 | 424 | 129 | 154 | 94 | 101 | 132 | 172 |
| after | 85 | 283 | 519 | **572** | 424 | 256 | 154 | **94** | 105 | 132 | 172 |

and then, every 100 ticks, where the two runs part company for good:

| tick | 1200 | 1400 | 1600 | 1800 | **2000** | 2200 | 2400 |
|---|--:|--:|--:|--:|--:|--:|--:|
| before | 15 | 2 | 2 | 2 | **0** | 0 | **0** |
| after | 305 | 344 | 731 | 1,196 | 1,414 | 1,914 | **2,414** |

The shape is the point. Both runs peak at **572 around tick 525** and both crash through the same
trough — **94 instances at tick 750**. The founding materials stock runs out either way, and the
first drawdown is identical. What changed is what happens next: before, the shelf keeps eroding to
zero and stays there for the last four hundred ticks; after, it bottoms out and climbs. The
mechanism is not that destruction was turned off — it is that the populace is now asked for the
laborers who pay the upkeep, so the shortfall closes instead of compounding.

**Destruction is still live, and this is measured rather than asserted.** Over the committed
200-year run, the loop's own emissions report **5,552,640 fp of upkeep owed, 5,524,570 paid, and 703
library instances destroyed off unpaid shelves**. Half a percent of the bill goes unmet, and the
brake takes books for it.

### 5.3 Does `durability` finally matter?

**Yes, and the attribution is clean.** `packages/coordination/test/unit/library-degradation.test.ts`
holds one shelf, one shortfall budget, and varies nothing but the `durability` field:

| scribe | durability | shortfall to destroy one book | books lost to 640 of shortfall |
|---|--:|--:|--:|
| orc | 384 | 12 | **40 of 40 — the shelf is emptied** |
| human / elf (reference) | 1,024 | **32** | 20 |
| dwarf | 1,792 | 56 | **11** |

The reference price is **exactly 32**, which is the flat number every book used to pay. So this is
a differentiation around the old calibration, not a discount.

The 2,400-tick integration arm agrees and is reported as **confounded evidence, not proof** — orc
fertility is 1536 against a dwarf's 768 and `laborAffinity` 1536 against 1280, so the universes
differ wholesale. Dwarf+human (`--mask 18`) against orc+human (`--mask 48`), cohort 12, 3 founding
mages:

| | dwarf+human | orc+human |
|---|--:|--:|
| library instances at 2400 | **300** | 162 |
| library share ‰ | **141** | 33 |
| peak, and when | 300 at tick 2400, still rising | 256 at tick 1200, **then falls** |
| nodes known | 51 | 49 |
| nodes still unwritten at 2400 | **0** | **26** |
| materials at 2400 | 692,633 | 5,250,152 |

The orcish universe ends with **seven times the materials** and half the written record, and its
library peaked at the halfway mark and declined. Note the last row is a *second* species effect and
not this one: 26 of 49 nodes never written at all is `scribeAffinity` limiting throughput, which was
always wired.

Single-species arms (`--mask 2` / `--mask 32`) were run first and **discarded as degenerate**: the
orc-only universe goes extinct before tick 400 with zero mages and zero nodes, and retains nothing
for reasons that have nothing to do with how it writes.

### 5.4 Per-mage containment

**0.201 → 0.289** incomparable pairs at 2,400 ticks (413 of 1,431, 54 holders), against W22's
measured 0.201 (309 of 1,540, 56 holders). It rises.

Measured, not engineered — the plan said in advance that a flat number would be reported as a
finding. The plausible mechanism is that scribing competes for mage-months, so repertoires converge
more slowly. Two intermediate readings are consistent with that and worth recording: at 1,200 ticks
the ablated tree reads 0.347 and the long-run configuration reads 0.301 at 2,400.

### 5.5 What moved in the gates

| gate | horizon | result |
|---|--:|---|
| `balance-gate-v1` | 60 ticks | **PASS, every metric byte-identical** |
| `balance-gate-horizon-v1` | 240 ticks | PASS, largest move 0.44 SE |
| `balance-gate-ascension-v1` | 2,400 ticks | **FAIL → regenerated once** |

The first two are worth stating plainly: **neither could have caught this defect and neither can
confirm it fixed.** Both cap far below the tick at which the library even peaks, and at tick 60
supply still exceeds demand for every occupation, so the change is literally invisible to them.

The ascension gate moved exactly where the claim says it should:

| metric | baseline | current | SE |
|---|--:|--:|--:|
| `referenceGrimoires` | 220.4 | **785.1** | 5.81 |
| `referenceLibraryDepth` | 9.94 | **31.56** | 6.64 |
| `referencePopulation` | 19,621 | 31,331 | 5.04 |
| `referencePeakPopulation` | 50,080 | 50,310 | 1.75 |
| `referenceNodesKnown` | 67.34 | 67.53 | 0.01 |

`referenceNodesKnown` unmoved is the most important row: **W23 changed where knowledge lives, not
how much of it there is.** And peak population flat while sustained population rises by 60% says K
did not move — the universe simply stopped starving below it.

This is also the direct inverse of a finding the previous regeneration recorded: that note observed
library depth *falling* 24.94 → 9.94 over the longer horizon, because W7's upkeep kept destroying
shelves the economy could not pay for. This change is why it can now pay.

**No golden fixture changed.** All three live in `packages/sim-core/test/golden/fixtures/` and drive
toy systems, as predicted in the blast-radius section.

### 5.6 Two fired tripwires, rewritten with rationale

Both were authored to fail when someone fixed the loop, and both said so.

- **9.8** read `grimoires < 2 * libraryDepth` and now reads 3,350 books against 51 nodes. Its stated
  reason does not survive the measurement: ablating the coverage term gives **15 books standing and
  a depth that stops at 36 of 51 nodes**, so the old bound was satisfied by *a library that had
  stopped existing* — the same trap the campaign's D5 was rewritten to escape. Replaced with the
  claim it was reaching for: the shelf holds **every node the universe knows**, compared against the
  run's own `nodesKnown` rather than a literal. Destruction is now asserted off
  `libraryInstancesDegraded` rather than off a dip in `libraryDepth`, because degradation sheds
  duplicates before last copies — so depth is the *last* thing to move and would report a healthy
  shelf right up until the archive was gone.
- **9.5** asserted `scribed[last] === 0`, which is the defect W23 exists to remove written down as an
  expectation. Scribing was dead for **140 consecutive years** and is now alive in every window.

### 5.7 The teaching regression, handed on rather than papered over

Ablation isolates it: with the coverage term removed the run is byte-identical on scribe demand
alone, so this is the coverage term's doing.

| 20-year window | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| lessons, before | 826 | 358 | 176 | 119 | 44 | 5 | 61 | 76 | 212 | 486 |
| lessons, after | 826 | 358 | 166 | 2 | 8 | 7 | 354 | 460 | 51 | **0** |
| books, before | 679 | 168 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| books, after | 679 | 168 | 40 | 127 | 272 | 492 | 800 | 515 | 480 | **480** |

9.5's per-window teaching guarantee was **a property of the famine, not of the pedagogy**:
`feasibility.ts` refuses `GOAL.scribe` below the node's `scribeCost`, so with the stock empty from
world year seventy, teaching was the only feasible goal left standing. Funding the economy gives the
scribe goal its feasibility back and mages compete for it.

That the *terminal* window teaches nothing is real and is **not** explained by anything W23 changed
on purpose. The suspect is named in the test: `terms.ts:302` scores the scribe goal at
`scribeThroughput / 4`, and `scribeThroughputFor` is documented as taking the *whole universe's*
scribe population for every university — *"wrong in the direction of over-supply"*. W23 made that
population real, which amplified an error that was already there. **Owner: whoever owns autonomy
goal competition (W20/W21 territory), not this workstream.** Deliberately not fixed here: adjusting
autonomy weights is exactly the file those workstreams are editing.

### 5.8 Known residuals, stated rather than spun

1. **Scribing equilibrates; it does not persist at scale.** Unwritten nodes reach 0 by tick 1,700
   and scribe demand goes with them — the cohort drains from a peak of 42 back to 7. Predicted in
   §4 before measuring. W22 reached the same conclusion independently.
2. **Duplicates accumulate.** 2,414 library instances of 51 nodes is ~47 copies each. This is
   *survival*, not a new appetite — the scribing rate is comparable to before; the books simply
   stop being destroyed. But it means the documented "a duplicate costs upkeep forever and
   contributes nothing to depth" asymmetry bites less than it did.
3. **Brake 4 now binds against carrying capacity.** Because the obligation the laborer term covers
   *includes* library upkeep, the economy commissions its own shelf-keeping: a deeper library asks
   for the laborers that pay for it. A universe near K can therefore afford a much larger shelf. A
   deliberate trade — a record that cannot persist makes §5 meaningless — and a magnitude question
   for 0.5.0, recorded in the spec amendment and in the baseline.
4. **The coverage term is blind to `laborAffinity`.** Over-staffs an orcish universe by half,
   under-staffs a draconic one. Deliberate: reading affinity would make the demand signal a function
   of which species happen to be idle this tick, and the mix changes under the controller as it acts.
5. **`advanceConstruction` still has no caller**, and was left alone as the brief directed. One
   pathology to hand on: laborers exist today *only because construction never finishes*, so
   `constructionBacklog` never shrinks and its term is a constant. The moment someone wires
   construction, that term goes to zero on completion — and without §3.2's coverage term the
   laborer force would go with it.
6. **Soldiers remain at zero headcount**, scoped out in §3.4 with the reason.
