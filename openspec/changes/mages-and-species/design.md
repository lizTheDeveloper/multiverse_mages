## Context

`sim-core-foundation` gave the project a deterministic substrate. `core-contracts` fixed the shapes.
`knowledge-model` gave it magic that can be researched, taught, scribed, lost, and rediscovered.
None of those changes contains a person. This change adds the people, the institutions that house
them, and the economy that pays for them.

Three constraints from upstream documents bind everything below, and none of them is negotiable
here:

1. **Populace is aggregated; only mages are individuals** (`contracts.md` §1.3). This is stated in
   the contract as a performance contract, not a modelling preference. Every mechanism in this
   change is designed so that it costs O(cohorts) rather than O(people).
2. **World-scale entities carry no coordinates** (`contracts.md` §0, vision §7a). Mages,
   universities, cohorts, and libraries have no position. Anything that would want a distance —
   travel time to a university, proximity of a teacher — has to be expressed as a graph or
   affiliation relationship instead.
3. **`rules-world` must not import `rules-magic`** (`contracts.md` §5, rule 3). A mage learning a
   node is the canonical cross-boundary interaction, and it lives in a coordinating layer. This
   change owns the *mage* half of every such interaction and consumes the knowledge half through
   an interface it does not define.

The forcing risk is vision §6a: knowledge-as-capital is a compounding loop, it is the second one in
the design, and this change is the one that creates it. `contracts.md` §7 already names the metric
(`capitalSnowball`), but a metric is not a bound. The loop has to be built with brakes in it, and
the brakes have to be observable at 0.4.0 even though the harness that will judge them does not
exist until 0.5.0.

## Goals / Non-Goals

**Goals:**

- Six species that differ in ways a deterministic test can detect on identical seeds, not just in
  flavour text.
- A mage lifecycle in which death destroys knowledge, so vision §5's "knowledge is physical" claim
  has teeth.
- A utility-AI that is deterministic, bounded in per-tick cost, attributable term by term, and
  autonomous enough that the god is genuinely not a general.
- Universities that are worth raiding: capacity, staff, and a library whose depth is an economic
  input and whose loss is an attack on future production.
- A three-input economy that reaches a bounded equilibrium with zero player input over 200 world
  years.
- A knowledge-as-capital loop with four independent brakes, each individually testable.

**Non-Goals:**

- Any balance claim. Per `docs/design/release-plan.md`, nothing before 0.5.0 can verify one, and
  making an unverifiable balance claim is the specific failure that document exists to prevent.
  Every magnitude in this change is a placeholder marked as such in the content files.
- Magic mechanics, node graphs, research/teaching/scribing *rules*, and tradition hooks. Owned by
  `knowledge-model`; consumed here.
- Raids, combat, soldier effectiveness, and anything positional. Owned by `raid-engagement`.
- Favor, worship, and the god's interventions. Owned by `god-agency`. This change produces the
  *counts* worship will be computed from and defines nothing about the formula.
- The observation/action space. Owned by `core-contracts`; this change populates the blocks it
  already fixed and must not resize them.

## Decisions

### Universities have no declared specialization; specialization is emergent

Vision §13 leaves this open and assigns it here. A university carries `libraryId`, `capacity`,
`staffCohorts`, and `buildProgress` — and no specialization field. What a university *is good at*
is derived on demand from the distribution of nodes in its library and the cells its resident
professors know.

Three reasons, in increasing order of force. It removes a content axis the Monte Carlo harness
would otherwise have to sweep. It removes the possibility of a university declared as a *Rego
Terram* school whose library holds nothing of the sort — a class of incoherent state that only
exists if you store the same fact twice. And decisively: `contracts.md` §4.1 fixes the
`institutions` observation block at **four slots**. A declared specialization over 70 cells would
need 70 more, and resizing a fixed observation vector is a contract break that invalidates every
trained agent.

It also makes burning a library mean more, not less. If specialization were a field, a raided
university would still *be* a necromancy school with an empty shelf. Emergent specialization means
the fire takes the identity with it.

*Alternative considered:* a `specializationCellId` field with a research-rate bonus inside the
named cell. Rejected on all three grounds above. *Second alternative considered:* a small
`focusHint` set by the god as an intervention. Rejected as `god-agency`'s to propose if it wants
it, and as a thing that would reintroduce the stored-fact duplication through a side door.

### The knowledge-as-capital loop gets four independent brakes, not one

Vision §6a describes the loop and warns about it. A single brake is a single point of failure: one
mistuned constant and the loop is either runaway or dead. Four independent brakes, each with its
own failure mode and its own test, degrade gracefully.

**Brake 1 — concave returns on library depth.** The library's contribution is a piecewise-linear
lookup table over *relevant distinct nodes held*, with strictly non-increasing marginal return and
an explicit saturation point. Placeholder table:

| Relevant distinct nodes | Contribution | Marginal per node over the segment |
|---|---|---|
| 0 | `fp(0)` | — |
| 8 | `fp(128)` | 16.0 |
| 32 | `fp(320)` | 8.0 |
| 96 | `fp(576)` | 4.0 |
| 256 | `fp(768)` | 1.2 |
| ≥ 640 | `fp(896)` | 0.33 → 0 |

The table is data, and the non-increasing-marginal property is asserted as a *property test over
the table*, not as a comment. A future tuning pass that accidentally makes a segment convex fails
CI rather than producing a runaway three thousand Monte Carlo runs later.

**Brake 2 — relevance gating by depth ceiling.** A node counts toward the contribution for a given
learner only if its `tier` is at or below that learner's species `depthCeiling`. A draconic-deep
library accelerates nothing for orcs. This stops the loop from being universally shared across the
whole population and ties capital to the species composition of the universe, which is a design
lever rather than a pure multiplier. Implementation is a per-university prefix-sum array over the
seven tiers — fixed size, recomputed on library change, cheap.

**Brake 3 — the mage-month bottleneck is linear and separately capped.** The library raises the
*rate* of research, teaching, and scribing. It does not raise the *quantity of mage-months
available*, which is exactly `count(living mages)`. That count grows only through student
promotion, which is gated by university capacity, by species `mageAptitude`, and by a fertility
term that is logistically braked by carrying capacity. So the loop is (concave rate) × (logistically
bounded quantity), which is sub-exponential by construction rather than by tuning.

**Brake 4 — library upkeep grows with depth.** A library consumes materials per world tick in
proportion to the instance count it holds. Benefit is concave in depth; cost is linear in depth.
Beyond some depth the marginal shelf costs more than it returns, so "hoard everything forever" is a
losing line and a universe must choose between breadth of library and everything else materials buy.

**And it must be measurable, not merely bounded.** The simulation emits, per world tick, per
university: relevant library depth by tier, the effective capital contribution after table lookup
and clamping, and a clamp counter. `capitalSnowball` in `contracts.md` §7 is then computable
directly at 0.5.0 with no retrofit. The 0.4.0-verifiable form of the claim is weaker but real: over
the 200-year reference run, the rolling growth rate of total effective capital contribution is
non-increasing after the establishment phase.

*Alternative considered:* a single hard cap on library contribution and nothing else. Rejected —
a hard cap converts a runaway into a plateau that every universe reaches, at which point the
library stops being an interesting decision and becomes a checkbox. Concave returns plus upkeep
produce a *soft* equilibrium that differs by species and by materials situation, which is the
behaviour the design actually wants.

### The library contribution enters through capped primitive stacking, not a bespoke multiplier

The library's contribution is expressed as a `research-rate`, `teach-rate`, and `scribe-rate`
contribution, summed into the same `(1 + Σ)` accumulator as every node-sourced bonus, subject to
the same `fp(4096)` cap defined in `contracts.md` §3, and clamped by the same shared arithmetic.

This is worth stating as a decision because the tempting implementation is a separate
`libraryMultiplier` applied after the primitives — and that implementation would silently escape
the cap that `contracts.md` §3 says exists specifically to contain this loop. Routing through the
existing accumulator means the loop is bounded by a contract already committed, and the existing
per-primitive clamp counters already report when it hits the ceiling.

*Alternative considered:* a dedicated capital multiplier with its own cap. Rejected — two caps on
the same quantity is how a rate ends up at 4.0 × 2.0 without anyone deciding it should be 8.0.

### Cohort-to-mage promotion uses integer arithmetic plus exactly one fractional draw

When a student cohort reaches maturity, the number promoted to mages is
`floor(count × mageAptitude / fp(1024))`, plus one additional mage if a single draw on RNG stream 1
falls below the fixed-point remainder. One draw per cohort per promotion event, never one draw per
person.

This is the aggregation contract expressed as arithmetic. A per-person Bernoulli trial over a
population of tens of thousands is precisely the cost `contracts.md` §1.3 exists to forbid, and it
would arrive through the back door of a mechanism nobody thinks of as "simulating individuals". The
remainder draw preserves the expected value exactly while keeping the draw count at O(cohorts).

*Alternative considered:* a per-person draw, which is the obvious correct-looking implementation.
Rejected on the contract. *Alternative considered:* pure integer truncation with no remainder draw.
Rejected — for small cohorts and low-aptitude species it truncates to zero every time, so orcs and
dragons would produce literally no mages, and the bias is silent.

### Mortality is a per-tick hazard roll, not a death date rolled at birth

Each living mage draws once per world tick on stream 2 against a hazard derived from a shared,
scale-free, piecewise-linear table indexed by normalized age.

Rolling a death date at birth is cheaper — one draw per mage per lifetime instead of twelve per
year — and it is what a performance-first instinct reaches for. It is rejected for three reasons.
It requires a `deathTick` field that `contracts.md` §1.2 does not have, and adding state to the
mage component is a contract amendment for a value that a hazard function reproduces exactly.
The `lifespan` effect primitive is *additive months applied at arbitrary times* (`contracts.md`
§3), so a pre-scheduled date would have to be retroactively rewritten every time a blessing or a
node effect lands, and getting that rewrite deterministic across effect ordering is harder than the
thing it replaces. And thematically, a god's blessing must be able to save a mage who is *already*
old, which a date rolled eighty years ago cannot express without a special case.

**The hazard table is scale-free and the arithmetic must not floor it to zero.** Hazard per tick is
`H(normalizedAge) / effectiveLifespanMonths`, so the same table gives a human 80 years and a
draconic 1500. Normalized age is `age × fp(1024) / effectiveLifespanMonths`. Placeholder table:

| Normalized age | `H` | Reading |
|---|---|---|
| 0 – 256 | `fp(1024)` | young adulthood, flat |
| 512 | `fp(1536)` | midlife |
| 768 | `fp(4096)` | decline begins |
| 1024 | `fp(12288)` | nominal lifespan |
| 1280 | `fp(49152)` | deep old age |
| ≥ 1536 | `fp(196608)` | effectively certain |

The precision trap here is real and is specified rather than left to an implementer: for a draconic
with `effectiveLifespanMonths = 18000`, a naive `fp` division floors `H/lifespan` to zero and
dragons become immortal *silently*. The division is therefore performed at an extended scale
(numerator pre-shifted by 2^10) and compared against a draw over the same extended range. This is
the kind of defect that produces a Monte Carlo baseline nobody can explain, so it is a requirement,
not a note.

**Per-mage lifespan variance is derived, not stored.** `lifespanVarianceMonths` is applied as a
deterministic offset hashed from `(rootSeed, mageId, generation, birthTick)`, recomputed whenever
needed. Storing it would cost a field per mage across thousands of mages for information already
recoverable from the handle, and the handle's generation counter (from `sim-core-foundation`) is
what makes it safe against slot reuse.

### Only curiosity is species-differentiated; ambition and caution are individual variation

`contracts.md` §1.2 gives every mage `curiosity`, `ambition`, and `caution`. `contracts.md` §2.4
gives a species a mean for `curiosity` and for nothing else. That asymmetry is read as deliberate
and honoured: personality is rolled at birth from means `(species.curiosity, fp(1024), fp(1024))`
with a bounded symmetric deviation on stream 1.

*Alternative considered:* adding `ambitionMean` and `cautionMean` to the species schema, which
would make the three axes symmetric and is aesthetically tidier. Rejected — it triples the
species-level personality tuning surface the balance harness has to sweep, and vision §6
differentiates the six species on curiosity, lifespan, depth, learning, retention, fertility, and
scribing, saying nothing about species-typical ambition. Inventing two more species axes because
the schema looks lopsided is content the vision did not ask for.

### Three species fields are added; a fourth was declined

`contracts.md` §2.4 has no field for the age at which a person becomes an adult, no field for how
many of them turn out to be mages, and no field for how productive their non-magical labour is —
yet vision §6 differentiates species on all three ("students become the next generation of mages";
orcs have "high build-rate"; dragons are "few, ancient"). None is derivable from the existing
fields, so three are added:

- `maturityMonths` — age at which a member of a student cohort is eligible for mage promotion and
  at which a populace member becomes economically productive. Not derivable as a fixed fraction of
  lifespan without forcing dwarves and dragons onto the same developmental curve as humans.
- `mageAptitude` — `fp` probability that a maturing student becomes a mage. This is the single
  number that makes "orcs: many people, few mages" and "dragons: few people, most of them
  terrifying" different shapes rather than the same shape scaled.
- `laborAffinity` — `fp` multiplier on materials output per laborer. This is where the orc's
  advantage lives.

**A fourth, `martialAffinity`, was deliberately declined.** Soldier *effectiveness* is only
observable inside a raid, and raids are `raid-engagement`'s. Adding the field now would mean
shipping a species trait that nothing reads, tuning it against no measurement, and pre-empting a
capability that has more information than this one does. If `raid-engagement` needs it, that change
amends the contract with a use for it in hand.

Note the vocabulary trap avoided: vision §6 says orcs have "high build-rate", but `build-rate` is
the name of an *effect primitive* carried by nodes (`contracts.md` §3). A species does not carry a
primitive. `laborAffinity` is a separate quantity that multiplies cohort output, and it stacks with
`build-rate` rather than being it.

### Feasibility is a mask, not a weight

A goal a mage cannot currently pursue — researching a node whose prerequisites they lack, teaching
with no eligible student, scribing with no scribe cohort or no materials — is removed from
consideration entirely rather than scored low.

This mirrors the legality mask in `contracts.md` §4.2, deliberately. A very high weight on an
infeasible goal is a silent failure mode: the mage "chooses" it, nothing happens, and a whole
career quietly evaporates into a goal that could never complete. Masking makes infeasibility a
state you can count instead of a behaviour you have to infer.

`idle` is always feasible and always scores at the floor, so the argmax is total and there is no
"no goal" branch to get wrong.

*Alternative considered:* a large negative feasibility penalty, which is simpler and needs no mask
plumbing. Rejected on the silent-failure ground above.

### Utility scores are a sum of clamped terms, not a product of curves

`score(g) = clamp(base(g) + roleBias + speciesTerm + personalityTerm + ageTerm + opportunityTerm,
0, fp(4096))`, all in fixed point, all additive, one clamp at the end.

The classical utility-AI formulation multiplies normalized response curves. In fixed point that is
six divisions per goal per mage, each losing precision, with a result whose rounding depends on
evaluation order unless the order is frozen. Worse for this project specifically: a single
near-zero factor annihilates the product, so "why did this mage choose to scribe?" has no
attributable answer. Additive terms are individually ablatable, and ablation is exactly how
`contracts.md` §7's `winRateByPrimitive` methodology works. The scoring function is built to be
taken apart by the harness that does not exist yet.

*Alternative considered:* multiplicative response curves. Rejected on precision, on order
dependence, and above all on attributability.

### Roles bias; they never dictate

The god assigns a standing role (action 10). The role contributes a bias term per goal and nothing
more. A researcher whose research frontier is empty will teach. A professor with no students will
scribe.

*Alternative considered:* role as a hard filter over the goal set — a researcher may only research.
Rejected twice over. It makes the god a general, contradicting design pillar 3 and vision §7's
"you set the role; they decide everything else". And it deadlocks: a universe of assigned
researchers with nobody willing to teach starves its own next generation, and the player's only
recourse is micromanagement, which is the exact play pattern the game is built to avoid.

### Mages are re-evaluated on a staggered schedule with commitment hysteresis

A mage re-evaluates its goal when `(worldTick + mageId) mod evalPeriod == 0`, or immediately when
its current goal completes or becomes infeasible. A challenger goal must beat the incumbent by a
hysteresis margin to displace it, and a freshly adopted goal is held for a minimum commitment
period.

Two problems solved at once. Cost: re-scoring every mage against every goal every tick is the hot
loop of this change, and the stagger divides it by `evalPeriod` with no loss of fidelity at the
month granularity of world time. Behaviour: synchronous evaluation makes the entire mage population
switch goals in lockstep the tick a shared input changes — every mage in the universe abandons
research on the same month because one library grew — which looks like a bug, oscillates, and
poisons every metric with harmonics that have nothing to do with balance. The phase offset comes
from the entity handle, so it is deterministic and reproducible.

*Alternative considered:* evaluate everyone every tick and rely on hysteresis alone to damp the
herding. Rejected — hysteresis damps flip-flopping but not synchronization, and it does nothing for
the cost.

### The utility-AI may not reference distance, travel, or location

No goal's feasibility, score, or completion may depend on a position, a distance, or a travel time.
Opportunity terms are computed from affiliation and from the teaching graph: a teacher is available
if a mage holding the node exists and is willing, not if one is nearby. Changing university is an
instantaneous change of a handle.

This is `contracts.md` §0 and vision §7a restated where it is most likely to be violated, because a
utility-AI is precisely the system whose author reaches for "how far away is it" without noticing
that the answer would require giving every mage a coordinate. The prohibition is specified as a
conformance check, not a convention.

### Cohort identity is (species, occupation, birthDecadeBucket), and collisions merge

Two cohorts sharing all three keys MUST be merged into one entity with summed counts. This bounds
total cohort entities at `6 species × 5 occupations × ceil(maxLifespanMonths / 120)` — with the
draconic placeholder of 18000 months, 150 buckets, so **4,500 cohort entities maximum**, for any
population of any size.

Stating the bound as a number matters more than it looks. Without the merge invariant, splitting a
cohort to move workers between occupations creates fragments, fragments accumulate, and a mechanism
introduced to *save* per-person cost drifts back toward per-person cost over a long run — with the
symptom appearing only in the longest Monte Carlo runs, which are the slowest ones to debug.

*Alternative considered:* immutable cohorts that are never merged, with occupation as a separate
allocation table. Rejected — it is a second representation of the same population, and the two
would drift.

### Occupation reallocation is rate-limited

At most `transferRatePerTick` of a cohort may change occupation in one world tick.

*Alternative considered:* instantaneous reallocation to match demand, which is one line and always
optimal. Rejected — it is a bang-bang controller. The economy oscillates between overbuild and
starvation on a two-tick period, every derived metric acquires that oscillation, and a balance
analyst at 0.5.0 spends a week discovering that the wobble in `timeToTierBySpecies` is a control
artifact rather than anything about magic.

Note also that `idle` is read as "not economically productive", which covers children and the very
old, not merely unemployed adults. Newborns enter the youngest bucket of the `idle` cohort for
their species.

### Fertility is braked by carrying capacity; population is not hard-capped

Births per cohort scale by `clamp((K − population) × fp(1024) / K, 0, fp(1024))`, where `K` is a
carrying capacity derived from materials stock and completed university capacity. Population
approaches `K` and does not exceed it, without any step function.

*Alternative considered:* a hard population ceiling that simply rejects births. Rejected — a hard
ceiling makes population a sawtooth against the cap, and every downstream rate inherits the
sawtooth. A logistic brake is the same bound with a continuous approach, which is what the 0.4.0
"no unbounded growth" claim needs to be checkable against a stated number.

Extinction remains possible in principle: a species cohort at zero produces no births, and that is
an absorbing state. That is a legitimate world outcome and is deliberately not prevented. The 0.4.0
claim is scenario-specific — *the reference seeded scenario* loses no species over 200 world years —
and the test asserts exactly that, not a universal impossibility.

### Rediscovery affinity is read as higher-is-better, with a floor that protects a shipped claim

`contracts.md` §2.4 defines `rediscoveryAffinity` as "fp multiplier against `rediscoveryMultiplier`",
which does not say whether a higher value makes rediscovery cheaper or dearer. This change adopts
**higher is better**, uniform with every other species field, and applies it as a divisor:
`effective = rediscoveryMultiplier × fp(1024) / rediscoveryAffinity`. Under this reading the
contract's own dwarf example (`768`) is a below-average rediscoverer, which is consistent with
vision §5 singling out gnomes as unusually good at it.

That reading creates a collision that must be handled rather than absorbed. `release-plan.md`'s
0.3.0 claim is that rediscovery costs **at least 3×** the original research cost, and the
`node.json` example in `contracts.md` §2.3 sets `rediscoveryMultiplier` to exactly `fp(3072)` = 3.0.
A gnome with `rediscoveryAffinity` of `fp(1792)` would rediscover at 1.71×, falsifying a claim
already shipped. So the effective multiplier is floored at `fp(3072)`, and this change recommends
that `knowledge-model` author v1 nodes with a base `rediscoveryMultiplier` at or above `fp(4096)`
so that species differentiation has room to operate above the floor.

*Alternative considered:* letting species affinity break the floor, on the grounds that a shipped
claim about content should not constrain a species trait. Rejected — the claim is the more
load-bearing artifact, and a release note that silently stops being true is worse than a slightly
awkward clamp. Reported upward rather than worked around silently.

### Senescence raises the appeal of scribing, and that is the design's own answer to mortality

The age term shifts an old mage away from research and toward teaching and scribing. This is a
small tuning choice with a large structural consequence, so it is recorded as a decision rather
than a table entry: it means a species' `knowledgeHalfLife` (`contracts.md` §7) depends on its age
*distribution*, not merely its lifespan. A civilization that has recently lost a generation loses
knowledge faster than its lifespan numbers predict, because the mages who would have written things
down are not old yet.

*Alternative considered:* a flat scribing appeal with knowledge preservation driven entirely by the
god's interventions. Rejected — it makes preservation the player's chore rather than a civilization's
own instinct, and it flattens the most interesting difference between a young universe and an
old one.

## Species trait table

**Every number below is an untuned placeholder awaiting the balance harness in 0.5.0**, and is
marked as such in the content files themselves. They encode the *ordering* and the *shape* the
vision §6 table describes; they do not claim to be balanced, and per `release-plan.md` no claim
about their balance may be made before 0.5.0.

The dwarf row reproduces the worked example in `contracts.md` §2.4 verbatim. Where this table and
that example could differ, the contract wins.

| Field | Human | Elf | Dwarf | Draconic | Gnome | Orc |
|---|---|---|---|---|---|---|
| `lifespanMonths` | 960 (~80y) | 8400 (~700y) | 3000 (~250y) | 18000 (~1500y) | 4200 (~350y) | 720 (~60y) |
| `lifespanVarianceMonths` | 120 | 1200 | 360 | 2400 | 600 | 96 |
| `maturityMonths` † | 216 | 1800 | 600 | 3600 | 900 | 168 |
| `curiosity` | 1152 | 896 | 512 | 256 | 1792 | 384 |
| `depthCeiling` | 4 | 6 | 5 | 7 | 4 | 3 |
| `learnRate` | 1024 | 640 | 1024 | 384 | 1280 | 768 |
| `retention` | 1024 | 1280 | 1536 | 1536 | 512 | 896 |
| `fertility` | 1280 | 256 | 768 | 96 | 896 | 1536 |
| `scribeAffinity` | 1024 | 1024 | 1792 | 640 | 896 | 384 |
| `rediscoveryAffinity` | 1024 | 896 | 768 | 640 | 1792 | 512 |
| `mageAptitude` † | 512 | 768 | 448 | 896 | 640 | 192 |
| `laborAffinity` † | 1024 | 768 | 1280 | 512 | 768 | 1536 |
| `affinities` | — | `herbam 1536`, `mentem 1280` | `terram 1536`, `ignem 1152` | `ignem 1792`, `vim 1536`, `nomen 1280` | `imaginem 1408`, `vim 1280` | `terram 1280`, `corpus 1280` |

† Fields added by this change; see the schema-addition decision above.

Reading the table against vision §6: humans win on volume and breadth (highest fertility among the
long-lived, average everywhere, shallow ceiling) and bleed knowledge to mortality. Elves are deep
and slow. Dwarves retain and scribe, and their `scribeAffinity` of 1792 is what makes dwarven
grimoires resist destruction, since `contracts.md` §1.5 routes grimoire durability through that
field. Dragons are few, nearly incurious, and the only species that can reach tier 7. Gnomes are the
most curious and the worst at holding on to it, with the rediscovery affinity that vision §5 names
explicitly. Orcs have the lowest magical aptitude and the highest fertility and labour output, which
is what makes an orc universe a materials economy with a thin magical crust.

## Risks / Trade-offs

- **The knowledge-as-capital loop is bounded here but not *measured* until 0.5.0** → Four
  independent brakes rather than one, so a single mistuned constant does not produce a runaway; the
  loop's state is emitted per tick from day one so `capitalSnowball` needs no retrofit; and a
  weaker but real 0.4.0 test asserts non-increasing growth over the 200-year reference run.
- **Every species number is a guess** → Marked as placeholder in the content files, excluded from
  release claims by `release-plan.md`'s measurement pivot, and structured so tuning is a data edit
  with no code change. The one thing asserted at 0.4.0 is *differentiation*, not fitness.
- **Three additions to a contract that was frozen for parallelism** → Each is load-bearing for a
  behaviour vision §6 names, none is derivable, a fourth was declined, and the amendment is carried
  in this change's tasks so `contracts.md` and the code land together rather than drifting.
- **The utility-AI will produce behaviour nobody predicted** → That is the feature (design pillar
  3), but it is also how a civilization deadlocks. Mitigated by `idle` always being feasible,
  by roles biasing rather than filtering, and by a goal-selection histogram emitted per tick so an
  emergent monoculture is visible as a number rather than as an unexplained flat line in
  `timeToTierBySpecies`.
- **Aggregated populace cannot tell an individual commoner's story** → Accepted, per
  `contracts.md` §1.3. Mages are the characters; the populace is an economy. The promotion
  mechanism is the one place a person crosses from the aggregate into the individual, and it is
  deliberately the only one.
- **The hazard-precision trap generalizes** → Long-lived species divide small numerators by large
  lifespans in several places, not only mortality. The extended-scale division helper is specified
  once and required everywhere a per-tick rate is derived from a lifespan, and a test asserts a
  non-zero draconic hazard specifically, because "dragons quietly became immortal" is a defect that
  would survive many Monte Carlo runs undetected.
- **`rules-world` and `rules-magic` may not import each other** → Every mage↔knowledge interaction
  in this change is expressed against a narrow interface satisfied by the coordinating layer. The
  cost is indirection on the hottest path in the change; the alternative is a cycle that
  `contracts.md` §5 rule 5 fails in CI.

## Migration Plan

Additive on top of `knowledge-model`. No existing behaviour changes; no state written by earlier
changes is reinterpreted. `docs/design/contracts.md` §2.4 is amended in the same change, and the
amendment is named in the 0.4.0 release notes as a contract break, per `release-plan.md`'s rule
that every pre-1.0 break is stated explicitly.

Rollback is reverting the branch together with the contract amendment. Nothing downstream of
`mages-and-species` exists yet at the time it lands, so no consumer is stranded.

## Open Questions

- **How many mages does a mature universe hold?** Vision §13's question, answered empirically. The
  benchmark from `sim-core-foundation` sets the ceiling; the carrying-capacity and `mageAptitude`
  placeholders here set where the reference scenario actually lands. The 200-year run reports the
  number, and 0.5.0 decides whether it is the right one.
- **Does a university ever *shrink*?** Capacity is currently monotonic once construction completes.
  Whether disuse, materials starvation, or raid damage should reduce it is left to `god-agency` and
  `raid-engagement`, which own the two forces that would drive it.
- **Should soldier cohorts consume upkeep at 0.4.0 with nothing to fight?** They do, at a
  placeholder rate, so the economy is not silently free. Whether the rate is right is unanswerable
  until raids exist.
- **Is `evalPeriod` of 3 ticks the right granularity?** It trades AI responsiveness against the hot
  loop's cost. The benchmark measures the cost; only 0.5.0 can measure whether the responsiveness
  matters.
- **Does mastery decay need a species-specific shape rather than a `retention`-scaled common
  curve?** Deferred. The common curve is assumed sufficient until a metric says otherwise, on the
  grounds that adding a per-species curve is easy later and removing one is not.
