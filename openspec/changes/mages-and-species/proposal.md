## Why

After `knowledge-model`, a universe contains magic that can be researched, taught, written down,
and lost — but nobody to do any of it. Nodes sit in a graph with no one to hold them, no
institution to house them, and no clock of mortality to make losing them hurt. Vision §5's claim
that knowledge is *physical* only becomes true when there are minds that die.

This change builds the living world: six species with different lifespans and appetites, mages who
are born, age, choose their own work, and die, universities that concentrate knowledge into a
lootable place, and the three-input economy that pays for all of it. It is the release at which
**a universe runs on its own** with zero player input, which is the precondition for
`agent-interface` being able to measure anything at all.

It is also the first change that must confront the second compounding loop named in vision §6a —
a deep library trains better mages, who research faster, who deepen the library. That loop is
introduced here, so it must be bounded here, and bounded in a way a later harness can *measure*
rather than in a paragraph of reassurance.

## What Changes

- Author the six species as validated content per `contracts.md` §2.4, with every magnitude marked
  as an untuned placeholder awaiting the balance harness in 0.5.0.
- **BREAKING (contracts.md §2.4):** add three fields to the species schema — `maturityMonths`,
  `mageAptitude`, and `laborAffinity`. Each is load-bearing for a behaviour the vision names and
  none is derivable from the existing fields. `contracts.md` must be amended in the same change.
- Implement mage lifecycle: promotion from student cohorts at maturity, personality rolled at birth
  from species means on RNG stream 1, age derived from `birthTick` and never stored, a per-tick
  mortality hazard on stream 2, and the knowledge consequences of death.
- Implement the utility-AI that drives mage behaviour: a fixed, enumerated goal set scored in
  fixed-point, shaped by species, age band, personality, and the god-assigned standing role
  (researcher, warden, professor, raider), with feasibility as a hard mask rather than a weight,
  ties broken on RNG stream 7, and a staggered re-evaluation schedule.
- Implement universities as institutions with `capacity`, staff cohorts, a library, and
  `buildProgress`, resolving vision §13's open question: **universities have no declared
  specialization; specialization is emergent from library contents and staff knowledge.**
- Implement the populace as counted cohorts keyed by species, occupation, and birth-decade bucket,
  with occupation transitions, a cohort-merge invariant that bounds total cohort entity count, and
  no per-person random draws anywhere.
- Implement the three-input economy: populace, materials, and knowledge-as-capital, with the
  library-depth contribution routed through the existing capped `research-rate` and `teach-rate`
  stacking rather than through a bespoke multiplier.
- Bound the knowledge-as-capital loop with four independent brakes — concave library returns,
  relevance gating by depth ceiling, a linear mage-month bottleneck, and library upkeep that grows
  with depth — and expose the loop's state so `capitalSnowball` is computable in 0.5.0.
- Add the deterministic long-run test that discharges the 0.4.0 release claims: 200 world-years,
  six species, zero player input, no extinction, bounded population, and measurably different
  time-to-tier per species on identical seeds.

Out of scope, consumed rather than defined: magic mechanics, node research and teaching *rules*,
raids and combat, god interventions, and the observation/action space.

## Capabilities

### New Capabilities

- `species-traits`: the six species as content, the meaning and direction of every trait axis,
  the three schema additions, and the rule that species data never appears in code.
- `mage-lifecycle`: promotion from student cohorts, personality rolls, derived age, mortality
  hazard, and the knowledge and institutional consequences of a mage's death.
- `mage-autonomy`: the utility-AI — goal enumeration, fixed-point scoring, role/species/age/
  personality shaping, feasibility masking, commitment and staggered re-evaluation, and
  deterministic tie-breaking.
- `universities`: founding, construction, capacity, staff cohorts, library aggregation, emergent
  specialization, and the bounded knowledge-as-capital contribution.
- `economy`: populace cohorts and occupation transitions, materials production and consumption,
  carrying capacity, and the three-input balance that ties them together.

### Modified Capabilities

`content-schemas` and `primitive-semantics` from `core-contracts` are consumed unchanged; the
species schema addition above is an amendment to `docs/design/contracts.md` carried by this
change's tasks, not a requirement change to an existing capability spec.

**`state-schema` is not.** This paragraph originally said it was, and implementation found
otherwise: a mage's goal commitment has to survive from one tick to the next for hysteresis and the
staggered re-evaluation to mean anything, and `contracts.md` §1.2 had nowhere to put it. It is now a
world component — `goal-commitment`, keyed on the mage's own handle and absent while she has never
chosen — recorded with its reasoning in `contracts.md` §1.2 beside the two §5 deviations that came
before it, along with the world-schema migration the addition obliges. The correction is written
here rather than only there because this sentence is what a planner reads.

## Impact

- **New:** `packages/rules-world/` implementing species, mages, populace, universities, and the
  economy; species content under `packages/content/species/`; a long-run scenario fixture; the
  cohort-count and no-position conformance tests.
- **Depends on:** `sim-core-foundation` for the entity store, fixed-point helpers, dual-scale clock,
  and stream-splitting PRNG; `core-contracts` for state types, content loading, and primitive
  stacking; `knowledge-model` for nodes, knowledge instances, research/teaching/scribing costs, and
  tradition hooks. Per `contracts.md` §5 rule 3, `rules-world` MUST NOT import `rules-magic`; every
  mage↔knowledge interaction crosses through the coordinating layer.
- **Amends:** `docs/design/contracts.md` §2.4, adding `maturityMonths`, `mageAptitude`, and
  `laborAffinity`. Permitted at a MINOR boundary per `docs/design/release-plan.md`, and named
  explicitly in the 0.4.0 release notes.
- **Downstream:** `agent-interface` reads the `population` (30 slots), `mages` (42 slots), and
  `institutions` (4 slots) observation blocks defined in `contracts.md` §4.1 directly from the
  structures this change creates; `god-agency` attaches favor and worship to the populace,
  universities, and mages counted here; `raid-engagement` promotes mages and soldier cohorts into
  positioned combatants.
- **Risk accepted:** every species number here is a guess. They are marked as placeholders in the
  content files themselves, and no claim about balance is made at 0.4.0 — per
  `docs/design/release-plan.md`, balance is unverifiable before 0.5.0 and claiming it would be
  worse than silence.
