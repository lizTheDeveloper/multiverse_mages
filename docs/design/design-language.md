<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The design language — depth claims, and how each one is settled

**Companion to `depth-and-skill.md`,** which is the research. This is the notation.

The problem it solves is narrow and concrete. This project can already say *"`referenceNodesKnown` is
51.0 ± 0.00"*. It cannot say *"this node is dominated by that one"*, *"these two strategies are
incomparable"*, *"this decision is degenerate"* or *"this is a skill chain of length 3"* — not
because nobody has thought it, but because there is no form of words that comes with a way of
finding out. Five workstreams have each invented a metric for the same structure, and an invented
metric cannot be compared with the one next door.

**The governing rule: a notation nobody can check is worse than no notation.** Every form below
comes with a decision procedure. A claim that cannot name what would refute it is refused by the
schema.

---

## 1. What this is not

- **Not a scoring system.** There is no `depthScore`. `depth-and-skill.md` §7 records that the most
  rigorous recent work in the depth literature reports weak and mostly insignificant correlation
  with human judgement, and that a 2019 position paper argues the property is observer-relative. A
  single number here would be a house metric wearing a citation's clothes, and this repository
  already has one of those.
- **Not a gate.** No claim in this language is wired to CI. Some are checkable today; most need a
  sweep. Wiring one to a gate is a separate, deliberate decision.
- **Not a rules change.** This document and its schema change no constant, no rule and no
  behaviour.
- **Not a general-purpose DSL.** It is a closed vocabulary of eleven verbs about strategic structure.
  Adding a twelfth is a versioned amendment to §3, not an edit to one claim.

---

## 2. The four grains it extends

The language is deliberately unoriginal. Every part of it is already a decision this repository made
somewhere else, generalised.

| grain | where | what it established | what the language borrows |
|---|---|---|---|
| `StrategyDefinition.hypothesis` | `packages/mc-harness/src/strategies.ts` | a claim must be a sentence that could turn out false — *"plays broadly"* is a description, *"whether breadth outruns the loss channel"* is a hypothesis | the `hypothesis` field, and its standard |
| `signatureActions` + `degeneracyOf` | same file | *"degeneracy is declared, not discovered"* — a strategy states the actions without which it is not itself, and a test asserts the report rather than the hope | the `degenerate` and `inert` forms, and the whole declare-then-check shape |
| `definitionVersion` + `pinnedConstants` | `packages/mc-harness/src/metrics-registry.ts` | *"a constant that is not here is a constant nobody is guarding"*; a metric whose definition drifts silently makes every baseline meaningless while still appearing green | both fields, verbatim in intent |
| `UNAVAILABLE_REASON` | `packages/mc-harness/src/metrics.ts` | *"a missing key is a harness failure, an unavailable status is an honest answer"* | the `not-measurable` verdict, which is a finding and not a gap |
| `schema-doc-agreement.test.ts` | `packages/content/test/unit/` | a document and the code may be asserted to agree, with allowances written to delete themselves | the doc-parsing test that enforces this file |

**If a proposal for this language cannot be traced to one of those rows, it is probably a new
invention and should be argued for on its own.**

---

## 3. The vocabulary — eleven forms

Each form has a signature, a meaning, a decision procedure, and the reading that refutes it. Forms
divide into three families, and the division is load-bearing: **`content-static` claims need no
simulation and can be enforced by `npm run verify`; everything else needs a sweep and cannot.**

### 3.1 Structure — the shape of what gets held

| form | signature | means | procedure |
|---|---|---|---|
| `nests` | `nests(A, B)` | A's held set is a subset of B's | `held-set`. Containment `|A∩B| / min(|A|,|B|)` = 1. **A null model is mandatory** — see below |
| `incomparable` | `incomparable(A, B)` | neither contains the other, *and* neither dominates on the outcome | `held-set` + `paired-arms`. Both halves required |
| `width` | `width(S) >= k` | the poset of S's held sets under inclusion has width ≥ k | `held-set`. Dilworth: width = maximum antichain size |
| `reproducible` | `reproducible(S) <= x` | S's held sets are **not** a cumulative scale: coefficient of reproducibility at or below x | `held-set`. Guttman CR, reported **against minimal marginal reproducibility**, never raw |

**Why the null model is mandatory rather than encouraged.** Nested-looking matrices arise by chance
from marginal totals alone; ecology has required a null model for this for thirty years
(`depth-and-skill.md` §3.2). Our own containment 1.000 was reported without one, and worse, it is
mathematically *entailed* by our prefix-fidelity result rather than independent of it. The schema
therefore has a `nullModel` field and the test refuses a `held-set` claim that omits it.

**Why `incomparable` needs both halves.** Two strategies holding disjoint sets that both lose to a
third are not incomparable in any sense a designer cares about; they are two floors. Incomparability
is a claim about the *outcome ordering* as much as the set ordering, and the form insists on it.

### 3.2 Outcome — the ordering over ways to play

| form | signature | means | procedure |
|---|---|---|---|
| `dominates` | `dominates(A, B) by m` | A's measure m exceeds B's, by the stated margin, at the stated interval | `paired-arms` under common random numbers |
| `degenerate` | `degenerate(D)` | decision D has an option at least as good at every state and strictly better somewhere | `restricted-play` — remove the option; if nothing worsens, it was inert; if everything worsens, the alternatives were dominated |
| `chain` | `chain(L1 … Lk)` | a skill chain: each rung beats the previous at the pinned threshold | `paired-arms` over consecutive pairs |
| `solved-open-loop` | `solved-open-loop(P) @ h` | a fixed action sequence P, reading no state, attains the maximum of the outcome measure at horizon h | `paired-arms` against the full pool |
| `inert` | `inert(X)` | neutralising X moves no registered measure outside its interval | `ablation`, which `packages/mc-harness/src/ablation.ts` already implements |
| `commits` | `commits(O)` | there exists a reachable world state in which taking option O scores strictly worse than not taking it | `counterexample-search` — one state suffices |

**On `degenerate` and the reactivity reading.** The definition above is about *options*: one is at
least as good everywhere. There is a second reading of the same form, and it is the one Jaffe et
al.'s reactivity restriction measures — **if the best option is the same at every state, the state
carries no information, and the decision is degenerate whether or not any single option dominates.**
Both readings are in scope for this form; a claim distinguishes them through its `statistic`, which
is why that field is required. The blind-god claim in §6 uses the second.

**On `dominates` and which dominance is meant.** Strict, unless the claim's `statistic` says
otherwise. The distinction matters because iterated elimination of *weakly* dominated actions is
order-dependent and can delete equilibria (Osborne & Rubinstein §4.3), so a claim that silently means
the weak version is a claim whose consequences are not what a reader expects.

**On `chain` and its threshold.** The skill-chain literature gives **60%** in one citing paper and
**75%** in another for the same construction (`depth-and-skill.md` §2.2). **There is no inherited
constant here.** A `chain` claim must pin its own threshold, and the schema requires the margin to
be accompanied by `pinnedConstants`.

**On `commits`, which is the form this project most needs and least has.** A StarCraft opening is a
bet: hard to beat unscouted, easy if scouted, and a great sacrifice of economy if it fails. That
structure survives the loss of execution intact (`depth-and-skill.md` §5.1) and is exactly what our
god's opening lacks. The procedure is `counterexample-search` rather than a statistical design
because the claim is existential: **one world state where the option loses is enough to establish
it, and no amount of averaging can.**

### 3.3 Content — the shape of what is authorable

| form | signature | means | procedure |
|---|---|---|---|
| `composes` | `composes(a, b -> c)` | holding a and b together produces an effect not equal to the declared stacking of a and b separately | `content-static`. Read the schema; no simulation needed |

**This is the Vampire Survivors form.** A weapon plus a passive becomes a *different kind* of weapon,
not the same weapon with a bigger number (`depth-and-skill.md` §5.3). The decision procedure is
blunt and that is the point: if the joint effect equals what the primitives' declared stacking rule
produces from the parts, **it does not compose**, whatever the flavour text says.

`composes` is currently the **only** form whose design is `content-static`, which means it is the
only one a unit test could enforce against shipped data today. That is a fact about the game, not
about the language.

---

## 4. The record

A claim is a JSON object validated against `design-language.schema.json`. The required fields:

| field | why it exists |
|---|---|
| `claimId` | stable and permanent once an evidence file names it |
| `form` | one of the eleven. The vocabulary is closed |
| `subjects` | what the claim is about, in the form's signature order |
| `hypothesis` | a sentence that could turn out to be false. The `StrategyDefinition` standard |
| `procedure` | how it would be settled: design, statistic, measures, n, margin, interval, null model, and **`refutedBy`** |
| `pinnedConstants` | every free parameter the claim invented |
| `definitionVersion` | bumped when the procedure or the constants change. A verdict compared across a bump compares two claims |
| `verdict` | `holds`, `refuted`, `unmeasured`, or `not-measurable` |

**`not-measurable` is the field that earns the language its keep.** It is the same distinction the
metrics registry draws between a missing key and an `unavailable` status: *"a missing key is a
harness failure, an unavailable status is an honest answer."* D5 has sat unmeasurable for two
workstreams because `CensusSample` carries node counts and no node identities. Under this language
that is a claim with a verdict and a named missing instrument, not a blank cell in a table.

**The prose form,** for use in a sentence:

    dominates(permit-then-idle, permissive-breadth) by ascensionRate, margin 0.05 @v1 → holds

The prose form is a *rendering* of a record, never a substitute for one. Nothing is checkable until
it is a record.

---

## 5. The worked example, end to end

The strongest available demonstration uses no new measurement at all: it restates numbers already
committed in `integration-round-2-results.md` and shows the notation doing work the prose did not.

### 5.1 The claim as it reads today, in prose

> A god who permits the whole grid for 140 ticks and then does literally nothing for the remaining
> 2,260 wins more often than any god who plays. […] So `permissive-breadth`'s funding, dispensations
> and research encouragement are worth **less than nothing** — they are a small net negative.

### 5.2 The same finding as records

### Claim: solved-open-loop-2400

```json
{
  "claimId": "solved-open-loop-2400",
  "form": "solved-open-loop",
  "subjects": ["permit-then-idle"],
  "hypothesis": "A fixed action sequence that reads no world state attains the maximum ascension rate over the ten-strategy pool at horizon 2400, which would mean the build has an open-loop solution and therefore nothing left to learn once it is known.",
  "procedure": {
    "design": "paired-arms",
    "statistic": "ascension rate of the open-loop policy against the maximum over the pool",
    "measures": ["ascensionRate"],
    "runsPerArm": 40,
    "margin": "the open-loop policy is at or above the pool maximum",
    "interval": "wilson-95",
    "refutedBy": "any pool member whose ascension rate exceeds the open-loop policy's, with non-overlapping Wilson intervals"
  },
  "pinnedConstants": {
    "horizonTicks": 2400,
    "poolSize": 10,
    "openLoopPrefixTicks": 140,
    "wilsonZ": "95%"
  },
  "definitionVersion": 1,
  "verdict": "holds",
  "verdictReason": "40 of 40 for permit-then-idle against 38 of 40 for the best playing strategy; every other strategy at exactly 0.0000.",
  "evidence": ["docs/design/integration-round-2-results.md", "balance/results-integration-r2.txt"]
}
```

### Claim: fund-bless-encourage-inert

```json
{
  "claimId": "fund-bless-encourage-inert",
  "form": "inert",
  "subjects": ["blessMage", "fundUniversity", "encourageResearch"],
  "hypothesis": "Removing funding, blessing and research encouragement from permissive-breadth moves no registered measure outside its interval, which would mean the god's three economic verbs buy nothing the win condition can see.",
  "procedure": {
    "design": "restricted-play",
    "statistic": "win probability of the restricted policy against the unrestricted one, per Jaffe et al. 2012",
    "measures": ["ascensionRate", "referenceNodesKnown", "referenceLibraryDepth"],
    "runsPerArm": 400,
    "margin": "0.05 absolute on ascensionRate",
    "interval": "wilson-95",
    "refutedBy": "the restricted arm scoring below the unrestricted arm by more than the margin, with non-overlapping intervals"
  },
  "pinnedConstants": {
    "restriction": "never submit action 9 (blessMage), 11 (fundUniversity) or 12 (encourageResearch)",
    "actionIdProvenance": "GOD_ACTION in packages/agent-api/src/actions.ts, cross-checked against actionId in packages/content/data/god-cost.json",
    "marginAbsolute": 0.05,
    "wilsonZ": "95%"
  },
  "definitionVersion": 1,
  "verdict": "unmeasured",
  "verdictReason": "The prose finding rests on 40 of 40 against 38 of 40 at n=40 per strategy, which is a two-run difference with heavily overlapping Wilson intervals and no restricted arm was ever run. The direction is suggestive; the claim is not settled."
}
```

### 5.3 What the notation caught

**The second record is the demonstration.** The prose says funding, dispensations and research
encouragement are *"worth less than nothing"*. Writing it as a claim forces three questions the prose
did not have to answer — what is the restriction, what is the margin, what would refute it — and the
answers show that **the comparison behind the sentence is 40/40 against 38/40 at n = 40, a two-run
difference with no interval and no restricted arm.**

That is not a refutation of the finding. `permit-then-idle` beating a playing strategy at all is
damning whatever the interval. But *"worth less than nothing"* is a stronger sentence than the
measurement supports, and it is the kind of sentence that gets quoted into a design decision three
workstreams later. **The language's whole value is that it made the gap visible without anyone
running anything.**

**A second, smaller thing the notation forced.** The prose bundles *"funding, dispensations and
research encouragement"*; the claim restricts `blessMage` (9), `fundUniversity` (11) and
`encourageResearch` (12) and leaves `issueDispensation` (5) out, because a dispensation edits the
ruleset and belongs with the permission lever rather than with the economic verbs. Writing the
restriction down as action ids made a category error in the prose visible that reading it never
would. *(Ids read from `GOD_ACTION` in `packages/agent-api/src/actions.ts` and cross-checked against
`actionId` in `packages/content/data/god-cost.json` — an earlier draft of this very claim named the
wrong three, which is the third time in this workstream that checking beat recalling.)*

The first record, by contrast, comes out clean: 40/40 against a field of eight strategies at exactly
0.0000 needs no interval to be decisive, and `solved-open-loop at horizon 2400` is now a phrase the
project can use.

---

## 6. The claim register

Every claim below is stated in the language, with its current verdict. This is the register, and it
is deliberately mostly red.

### Claim: v1-strategy-poset-width-above-one

```json
{
  "claimId": "v1-strategy-poset-width-above-one",
  "form": "width",
  "subjects": ["v1-strategy-pool"],
  "hypothesis": "The poset of strategies' held node sets under inclusion has width of at least two, meaning at least two strategies are mutually incomparable rather than one containing the other.",
  "procedure": {
    "design": "held-set",
    "statistic": "maximum antichain size over strategies' terminal held sets, per Dilworth's theorem",
    "measures": ["referenceNodesKnown"],
    "runsPerArm": 12,
    "margin": "width at least 2",
    "nullModel": "shuffle held sets preserving each run's node count and each node's frequency across runs; report the percentile of the observed width in that distribution",
    "refutedBy": "every pair of strategies comparable under inclusion, giving width 1"
  },
  "pinnedConstants": {
    "containmentStatistic": "|A n B| / min(|A|,|B|)",
    "comparabilityThreshold": 1.0,
    "rulesetScope": "v1 cells only"
  },
  "definitionVersion": 1,
  "verdict": "refuted",
  "verdictReason": "Cross-strategy containment measured 1.000 for every pair inside v1 except denial-warden against narrow-depth at 0.771, and both of those sit entirely inside the fifty-one every unrestricted strategy reaches. Width 1.",
  "evidence": ["docs/design/strategy-dimensionality.md"]
}
```

### Claim: v1-held-sets-nest

```json
{
  "claimId": "v1-held-sets-nest",
  "form": "nests",
  "subjects": ["denial-warden", "archivist"],
  "hypothesis": "The smaller strategy's terminal node set is a subset of the larger's in every paired universe, which would mean the two strategies differ in how far they get and not in what they get.",
  "procedure": {
    "design": "held-set",
    "statistic": "mean paired containment |A n B| / min(|A|,|B|), universe for universe",
    "measures": ["referenceNodesKnown"],
    "runsPerArm": 12,
    "margin": "containment equal to 1.000",
    "nullModel": "not required for the set fact itself, which is deterministic; mandatory for any inference that nesting is evidence of a strategy hierarchy, because nested matrices arise by chance from marginal totals alone",
    "refutedBy": "any paired universe in which the smaller set holds a node the larger does not"
  },
  "pinnedConstants": {
    "pairing": "same rootSeed, sweepId, cellIndex and replicateIndex in both arms",
    "rulesetScope": "v1 cells only"
  },
  "definitionVersion": 1,
  "verdict": "holds",
  "verdictReason": "Containment 1.000. Recorded with the caveat that this is entailed by the prefix structure of claim prefix-structure-is-not-a-marginal-artifact rather than independent of it, so the two must not be counted as two confirmations.",
  "evidence": ["docs/design/strategy-dimensionality.md"]
}
```

### Claim: prefix-structure-is-not-a-marginal-artifact

```json
{
  "claimId": "prefix-structure-is-not-a-marginal-artifact",
  "form": "reproducible",
  "subjects": ["v1-strategy-pool"],
  "hypothesis": "The coefficient of reproducibility of the runs-by-nodes matrix exceeds its minimal marginal reproducibility by enough that the cumulative-scale reading survives, rather than being an artifact of almost every run holding almost every node.",
  "procedure": {
    "design": "held-set",
    "statistic": "Guttman coefficient of reproducibility, reported beside minimal marginal reproducibility and the resulting coefficient of scalability",
    "measures": ["referenceNodesKnown"],
    "runsPerArm": 12,
    "margin": "coefficient of scalability at or above 0.60",
    "nullModel": "minimal marginal reproducibility is itself the null: predict each node's modal presence and report the gap",
    "refutedBy": "a coefficient of scalability near zero, which would mean prefix fidelity 0.943 measured the content boundary rather than the strategy space"
  },
  "pinnedConstants": {
    "orderingRule": "nodes ranked by the number of runs holding them, descending",
    "scalabilityThreshold": 0.6,
    "reproducibilityConvention": "1 - errors/entries, per Guttman 1944"
  },
  "definitionVersion": 1,
  "verdict": "unmeasured",
  "verdictReason": "Prefix fidelity 0.943 is a coefficient of reproducibility and clears the customary 0.90 convention, but minimal marginal reproducibility was never computed, and three strategies holding the identical entire reachable set is exactly the marginal pathology that inflates it."
}
```

### Claim: equal-size-strategies-incomparable

```json
{
  "claimId": "equal-size-strategies-incomparable",
  "form": "incomparable",
  "subjects": ["v1-strategy-pool"],
  "hypothesis": "Two strategies exist with equal terminal node counts whose sets contain each other at well below 1.0 and neither of which dominates the other on ascension rate — the signature of a genuine compositional trade under a fixed ruleset.",
  "procedure": {
    "design": "held-set",
    "statistic": "paired containment between two strategies whose node counts differ by less than five per cent, together with their paired ascension rates",
    "measures": ["referenceNodesKnown", "ascensionRate"],
    "runsPerArm": 40,
    "margin": "containment at or below 0.80 with neither dominating by more than 0.05",
    "nullModel": "shuffle held sets preserving run size and node frequency; report the percentile of the observed containment",
    "refutedBy": "no such pair existing, which is the reading every measurement so far has returned"
  },
  "pinnedConstants": {
    "sizeTolerance": 0.05,
    "containmentCeiling": 0.8,
    "dominanceMargin": 0.05
  },
  "definitionVersion": 1,
  "verdict": "unmeasured",
  "verdictReason": "Named by W15 as the signature that measurement never once observed. It has still never been searched for directly, and it is the single clearest positive target this language can state."
}
```

### Claim: skill-chain-length-at-least-three

```json
{
  "claimId": "skill-chain-length-at-least-three",
  "form": "chain",
  "subjects": ["v1-strategy-pool"],
  "hypothesis": "Three strategies can be ordered so that each beats the one below it at or above the pinned win-rate threshold, giving a skill chain of length three and therefore at least two things a player could learn in sequence.",
  "procedure": {
    "design": "paired-arms",
    "statistic": "ascension rate of each rung against the rung below, over consecutive pairs",
    "measures": ["ascensionRate"],
    "runsPerArm": 400,
    "margin": "0.60 win rate per rung",
    "interval": "wilson-95",
    "refutedBy": "no ordering of the pool producing two consecutive rungs that clear the threshold"
  },
  "pinnedConstants": {
    "rungThreshold": 0.6,
    "thresholdProvenance": "pinned here, not inherited: the citing literature gives 0.60 and 0.75 for the same construction",
    "chainLength": 3
  },
  "definitionVersion": 1,
  "verdict": "refuted",
  "verdictReason": "Eight of ten strategies sit at ascension rate exactly 0.0000, and the two that do not are the two that edit the ruleset. The measured chain has one rung above a floor, not three.",
  "evidence": ["docs/design/integration-round-2-results.md"]
}
```

### Claim: permitting-everything-is-a-commitment

```json
{
  "claimId": "permitting-everything-is-a-commitment",
  "form": "commits",
  "subjects": ["permitTechnique", "permitForm"],
  "hypothesis": "A reachable world state exists in which permitting every technique and form scores strictly worse than permitting a subset, which would make the god's opening a bet with a downside rather than a formality.",
  "procedure": {
    "design": "counterexample-search",
    "statistic": "paired ascension rate of the permit-everything policy against a permit-subset policy, searched over founding species masks, traditions and starting positions",
    "measures": ["ascensionRate", "referenceNodesKnown"],
    "runsPerArm": 40,
    "margin": "any single searched state in which permit-everything is strictly worse at non-overlapping intervals",
    "interval": "wilson-95",
    "refutedBy": "exhausting the searched states with permit-everything at or above permit-subset in all of them"
  },
  "pinnedConstants": {
    "searchSpace": "seven founding species masks by three traditions by two starting positions",
    "wholeGridFavorCost": 96,
    "favorCostProvenance": "five techniques at 8 favor plus fourteen forms at 4 favor, from packages/content/data/god-cost.json at fp scale 1024"
  },
  "definitionVersion": 1,
  "verdict": "refuted",
  "verdictReason": "No searched state has ever shown permitting less to be better. The whole grid costs 96 favor against a floor income of one favor per world tick over 2400 ticks, so the opening has a price and no downside. This is the single sharpest gap between this build and a StarCraft build order.",
  "evidence": ["docs/design/integration-round-2-results.md", "docs/design/strategy-dimensionality.md"]
}
```

### Claim: node-effects-compose

```json
{
  "claimId": "node-effects-compose",
  "form": "composes",
  "subjects": ["node.effects"],
  "hypothesis": "Some pair of authored effects produces, when held together, an outcome not equal to what the two primitives' declared stacking rules produce from the parts — the Vampire Survivors evolution property, at the level of the content schema.",
  "procedure": {
    "design": "content-static",
    "statistic": "count of authored constructs whose joint effect is not derivable from the participating primitives' declared stacking rules",
    "margin": "at least one such construct exists",
    "refutedBy": "every multi-effect node resolving to independent per-primitive stacking, and the schema offering no operator that could express anything else"
  },
  "pinnedConstants": {
    "contentFile": "packages/content/data/node.json",
    "primitiveFile": "packages/content/data/primitive.json",
    "nodeCount": 300,
    "singleEffectNodes": 201,
    "twoEffectNodes": 91,
    "threeEffectNodes": 8
  },
  "definitionVersion": 1,
  "verdict": "refuted",
  "verdictReason": "There is no composition operator in the schema. NodeRecord carries an effects array whose entries each name one primitive and a magnitude; two effects on one node are two independent scalars, each stacking by its own primitive's declared rule. 201 of 300 nodes carry exactly one effect and nothing anywhere combines two into a third kind.",
  "evidence": ["packages/content/src/types.ts", "packages/content/data/node.json"]
}
```

### Claim: god-decisions-are-state-dependent

```json
{
  "claimId": "god-decisions-are-state-dependent",
  "form": "degenerate",
  "subjects": ["god-action-selection"],
  "hypothesis": "A god policy that never reads the observation scores below one that does, which would mean at least one decision in this game depends on the state of the world rather than on the tick number alone.",
  "procedure": {
    "design": "restricted-play",
    "statistic": "ascension rate of an oblivious policy against the same policy with the observation restored, per Jaffe et al. 2012's reactivity restriction",
    "measures": ["ascensionRate"],
    "runsPerArm": 400,
    "margin": "0.05 absolute on ascensionRate",
    "interval": "wilson-95",
    "refutedBy": "the blind policy scoring inside the sighted policy's interval, which would establish that no decision here is state-dependent"
  },
  "pinnedConstants": {
    "restriction": "the policy receives a constant observation block and the tick index only",
    "marginAbsolute": 0.05,
    "wilsonZ": "95%"
  },
  "definitionVersion": 1,
  "verdict": "unmeasured",
  "verdictReason": "permit-then-idle already ignores every observation and wins 40 of 40, which strongly suggests the refutation. Running the restriction formally is what turns an anecdote into the measurement Jaffe et al.'s framework reports, and it is the first thing this language recommends building."
}
```

### Claim: node-value-differentiation-is-live

```json
{
  "claimId": "node-value-differentiation-is-live",
  "form": "dominates",
  "subjects": ["summit-node-holder", "equal-count-non-summit-holder"],
  "hypothesis": "A universe holding a summit node outscores an otherwise identical universe holding the same number of non-summit nodes, which would mean node identity is worth something to the acquiring agent rather than only to the win predicate.",
  "procedure": {
    "design": "paired-arms",
    "statistic": "paired prestige and ascension rate between arms matched on node count and differing on node identity",
    "measures": ["ascensionRate", "prestigeAdvantage"],
    "runsPerArm": 400,
    "margin": "0.05 absolute on ascensionRate",
    "interval": "wilson-95",
    "refutedBy": "the two arms scoring inside each other's intervals, which would confirm that nodes are differentiated in the win condition and fungible in play"
  },
  "pinnedConstants": {
    "summitDefinition": "the deepest node of a permitted cell, ties broken by node id",
    "summitCount": 12,
    "marginAbsolute": 0.05
  },
  "definitionVersion": 1,
  "verdict": "not-measurable",
  "verdictReason": "The instrument does not exist. CensusSample carries nodesKnown as an aggregate count and no node-id list, so no committed record in this repository carries node identity; the arms cannot be matched on count and differentiated on identity without a census change to packages/scenario/src/census.ts. This is the same absent instrument that leaves D5, libraryDependence and all three raid metrics unavailable."
}
```

---

## 7. How this document is checked

`packages/content/test/unit/design-language-claims.test.ts` parses this file and enforces:

1. `design-language.schema.json` compiles under the repository's own schema compiler — the same one
   that validates shipped content, so the language is checked by the machinery the game is checked
   by, and no new dependency is introduced.
2. Every `### Claim:` heading is followed by a fenced `json` block that parses.
3. Every claim validates against the schema with zero diagnostics.
4. The `claimId` matches its heading, and ids are unique.
5. **Every form in the schema's enum has at least one claim using it.** A vocabulary word with no
   example is a word nobody has had to make precise.
6. **Every claim states `procedure.refutedBy`.** This is the rule that makes the language a language
   rather than a set of labels.
7. A `not-measurable` verdict requires `verdictReason`; `holds` and `refuted` require `evidence`.
8. A `held-set` design requires `nullModel`.
9. A procedure naming a `margin` must carry `pinnedConstants`.
10. Every id in `supersedes` names a claim that exists.

**What the test deliberately does not do:** it does not run a sweep, it does not verify that a
verdict is *correct*, and it does not check that cited evidence files support what is claimed. Those
are jobs for a measurement workstream and for a reader. The test checks that every claim is *the kind
of thing that could be settled* — which is exactly the property prose does not have.

---

## 8. What is deliberately absent

- **No `depthScore`.** §1.
- **No form for "is fun", "is interesting" or "feels deep".** The literature does not support
  operationalising those, and `depth-and-skill.md` §6.3 records that its most rigorous recent
  entrant found weak, mostly insignificant correlation with human judgement.
- **No cyclic-structure form.** `cyclic(A, B, C)` is the form this project most wants and it is
  omitted on purpose: computing a cyclic component needs a **pairwise outcome matrix**, and a
  single-universe run against a win predicate does not produce one. Adding the form before the
  instrument would put a permanently `not-measurable` verb in a vocabulary meant to be used. The
  instrument's shape is known — raids arbitrated by the host universe's ruleset, per `vision.md` —
  and **when it exists, adding `cyclic` is the first amendment to make.**
- **No anti-requisite form.** The brief for this workstream assumed the content schema had
  anti-requisites and tracks. **It does not:** `NodeRecord` carries `prerequisites` and nothing that
  excludes. Exclusion is the natural mechanism for incomparability and is worth adding — but the
  language should not pretend to describe a field that is not there.

---

## 9. Amending this document

- **Adding a form** is a versioned amendment: extend the schema's `form` enum, add the row to §3,
  and add at least one claim using it, because the test requires an example.
- **Changing a claim's procedure or pinned constants** requires bumping its `definitionVersion`. A
  verdict compared across a bump compares two claims.
- **A refuted claim is not deleted.** It is superseded, so what was believed and when stays
  readable. That is the same reason `POOL_BUILD_LIMITS` enumerates its own limitations rather than
  quietly shrinking.
