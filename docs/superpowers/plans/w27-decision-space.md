<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W27 — does the god's decision space have any shape?

**Branch:** `w27/decision-space`, from `origin/integration/campaign-round-2`. **Role:** measurer.
**Changes no rule, no constant, no magnitude.** Never runs `goldens:regen`; regenerates no balance
baseline. Adding strategies to the pool is additive and is the point; no existing strategy is edited.

## The question

Six mechanics were built this campaign. Each worked. **None moved the negative control.**
`permit-then-idle` wins 40/40 and *beats* `permissive-breadth`, which funds universities, blesses
mages, grants knowledge and encourages research. So the god's post-permit verbs are not merely
redundant — they are negative expected value, or noise.

"Should the god act after permitting?" is answered, and the answer is no. This asks the prior
question:

> **Does the god's choice of *which* post-permit actions to take matter at all?**

Two bots, both active, both permitting identically, both spending comparably, differing **only in
allocation**. If they are statistically indistinguishable, the decision space is **flat**, and no
economy tuning reaches it — the next fix would have to change what the verbs *do*. If they diverge,
the space is **shaped** and tuning becomes worth doing.

**"Flat" is the more valuable finding and will not be softened.**

---

## Finding zero, recorded before any run: the brief's bots are not expressible

The brief asked for Bot A = *technique-heavy clusters / high-tier mages / prerequisite trunks* and
Bot B = *form-heavy clusters / low-tier mages / leaf nodes*. **The action space cannot express any of
those three axes.** This is not an obstacle to route around; it is the first result, and it is
evidence about the question.

§4.4 gives a parameterized action a **slot-indexed candidate list** ranked by a *deterministic
salience ordering* fixed in `packages/agent-api/src/candidates.ts`. The god selects a slot index and
nothing else. So the ordering **is** the targeting policy, and it is hardcoded — one policy per verb,
identical for every strategy. What the ordering exposes:

| brief's intended axis | what `candidates.ts` actually exposes | expressible? |
|---|---|---|
| grants into **prerequisite trunks** vs **leaf** nodes | `foundingKnowledgeCandidates` filters to **`node.tier === 1`**. Every candidate is a prerequisite-free root. There are no leaves in the list. | **no** |
| bless **high-tier** vs **low-tier** mages | `blessCandidates` sorts by **ascending vigor**, truncated to `k = 32` of ~3,000 mages. Tier/mastery is not read. Slots 0–31 are all inside the most-depleted tail. | **no** |
| fund universities in **technique-heavy** vs **form-heavy** clusters | `fundUniversityCandidates` ranks by **ascending `buildProgress`**, slot 0 pinned to "found new". A university carries no cluster identity here at all. | **no** |

`candidates.ts` is deliberately not touched: its own header states that replacing an ordering
*"changes which entity a slot names — which is a balance-affecting change"*, and it would silently
redefine every existing strategy. Editing it would also violate this workstream's measurement-only
constraint.

**Recorded as a primary result:** the god's *targeting* decision is flat at the encoding layer,
before the simulation is consulted. Whatever the rules would do with a differently-chosen target, the
god has no vocabulary to choose one. This bears directly on candidate explanation #2.

### What remains expressible, and what the two bots therefore are

Exactly one allocation axis survives: **where in the salience ordering the god spends** —
concentrate on the top slot, or spread across the slot range. Both idioms already exist in the pool
(`archivist` takes slot 0 and does not rotate; `permissive-breadth` rotates), so this is the pool's
own vocabulary, not an invention.

- **Bot A — `allocate-concentrate`.** Always the salience-top slot: the least-complete university,
  the most depleted mage, the lowest-id grantable root on the lowest-handle mage, the deepest
  permitted cell (the one encouragement compounds in, per §6a).
- **Bot B — `allocate-spread`.** Rotates the slot index across each verb's full `k`: universities
  across the build queue, mages across the depleted tail, grants across the (mage, node) product,
  encouragement across permitted cells rather than compounding in one.

Both are honest maximal contrasts *within the vocabulary the god has*. The axes the brief wanted are
reported as **not measurable from the god's action space** rather than approximated and passed off.

**Disclosed weakness, in advance:** the bless contrast is slot 0 versus slot ≤31 within the 32
most-depleted of ~3,000 mages. That is a near-null contrast **by construction**. If bless shows
nothing, that is a fact about the encoding, not evidence about the simulation, and it will be
reported that way.

---

## Design

### Both bots permit identically

Rounds **0–139**: permit-only, the exact `permit-then-idle` prefix — `permitTechnique(technique(round))`
then `permitForm(form(round))`, same axes, same order, same ticks, in both bots. Rounds **140+**:
allocation only, no permit actions. The ruleset is therefore identical by construction rather than by
hope, and the only variable after tick 140 is allocation.

### One scheduled verb per round, and no cross-verb fall-through

Each allocation round's preference list holds **exactly one** verb (with the implicit `noop` tail
`policyFor` appends). If that submission is masked or refused, the round is a **no-op for that arm** —
it does not fall through to a different verb. Cross-verb fall-through would let masking silently
change the verb *mix*, and then the arms differ in more than allocation, which is the one thing the
experiment forbids.

### The schedule is diluted to stay under favor income

Passive favor regen measures ~2,721/tick. A verb every round would make **affordability** a second
variable (the mask closes on an unaffordable action, and the two arms would hit that wall at
different times). The cycle is spaced so scheduled spend per tick sits below income, and
`grant-founding-knowledge` at 12,288 is scheduled rarely. **Both arms run the identical schedule** —
same verb on the same round number — so scheduled spend is equal by construction and only the slot
index differs.

### Founding a university is held identical in both arms

`fund-university` slot 0 is "found new" and costs the separate `found-university-cost` constant, not
the 3,072 that advancing costs. So a bot that takes slot 0 more often spends differently *for a
reason unrelated to allocation*. Both bots therefore use the identical founding rule — found only
while the university channel reads 0 — and differ only in which **existing** university they advance.
This is the single most likely way to accidentally break spend parity, and it is closed by design.

### Both bots take the same ascension stance

`whenEligible`, matching `permit-then-idle` and `permissive-breadth`. A stance difference is a second
variable. Consequence, acknowledged in advance: a run truncates at first eligibility (`ascension-min-tick`
600; canon not before ~960), so terminal state is not observed at a common tick. Hence the checkpoint
below.

### A third arm

`permit-then-idle` runs on the **same `sweepId`** as a third arm. It costs one sweep file and buys
per-seed paired idle-vs-active deltas, which is the data that separates explanation #4 (verbs have
negative side effects) from #3 (verb effects are real but subsumed by the ceiling).

### Two things the brief asked for that this workstream will not do, and why

- **`mageContainment` is not measured.** It is **not merged** into
  `integration/campaign-round-2` (it lives on `w22/knowledge-observability`, commit `c221a1f`), and
  its own module contract states it has *"no path into `@mm/mc-harness`"* and that *"no balance
  baseline may be computed from it."* It also needs `SimState`, which the measurement layer does not
  hold — `recordingSession` decodes a census from the **observation vector**, not from state. Wiring
  it would mean widening the session boundary on a measurement-only workstream. Reported as **not
  measured, with the reason**, rather than approximated.
- **The repaired scorer is not run**, because the **tuner is not run**. `scoreBalance` never executes
  in this experiment: the analysis is paired per-seed deltas, not a tuner score. The support-gate
  discipline is applied by hand instead — any correlation is reported with Spearman beside Pearson
  and its non-zero count, and is declared **unsupported** below 3 winners. With three arms a
  cross-arm correlation has at most three points and will almost certainly be unsupported; that is
  stated in advance so a spurious coefficient cannot be quoted after the fact.

### Measurement plumbing, and why it is outside the rules path

Two quantities this experiment needs are computed today and then discarded:

1. **Favor spend by action.** `coordination/src/god/interventions.ts` tallies `spentByAction` keyed
   by action id — **applied spend only**, refusals contribute nothing — and it is rebuilt fresh every
   tick. `system.ts` folds it into a `FavorLedgerEntry` that `favor.ts` documents as deliberately
   **not stored in state**: *"a projection inside a snapshot is inside every hash, at which point two
   peers can desync over a number no rule reads."* That prohibition is respected. The accumulator
   goes in `packages/scenario/src/executor.ts`'s `recordingSession`, which already holds
   `godReport()` and already drops `ledger.spentByAction` on the floor one line from where the
   checkpoint is written. Deduplicated on `ledger.worldTick`.
2. **A census trajectory.** `recordingSession` samples a `CensusSample` every 12 ticks and only the
   **last** one reaches the record. The tick-600 checkpoint therefore needs the trace carried
   through.

Both are threaded as **additive optional fields** on `RunOutcome` and `RunRecord`, the pattern
`armContribution` already uses. Deliberately **no new registered metric**: `REFERENCE_METRIC_VERSIONS`
is part of `Provenance`, and adding a metric id would change provenance on every record and make the
balance gate refuse cross-build comparison — which is a baseline movement caused by an instrument, the
exact failure this campaign has been burned by. `buildRunRecord`'s exact-key-set check is on `metrics`
only, so top-level additive fields do not trip it.

Trace ticks: **144, 300, 600, 900, 1200, 1800, 2400** — all multiples of the 12-tick census interval,
so each is a real sample rather than an interpolation. 144 is the first sample after the permit phase
ends at round 140; 600 is `ascension-min-tick` and the pre-registered common comparison point.

### Sweep shape

Three sweep files under `balance/sweeps/`, one per arm, **sharing `sweepId` and `rootSeed`**, each
with `agentPool.assignment: "fixed"` and a single strategy. Fixed assignment makes pool size 1, so
`replicates % poolSize == 0` holds trivially and per-strategy coverage is exactly `replicates`. Run
seeds derive from `(rootSeed, sweepId, cellIndex, replicateIndex)` and **not** from the strategy, so
run *i* of every arm carries the identical seed by construction — the strongest form of common random
numbers available here. It is still verified pairwise afterwards, and the mismatch count reported.

`replicates: 400`, one factor with one level, `worldTickCap: 2400`, matching the campaign's
`integration-r2-*` family. Each arm writes to its own output directory so the three executions do not
share a file index.

### Common random numbers, and the two traps campaign policy names

- One sweep file per arm, sharing `sweepId` and `rootSeed`; each factor level takes its own cell.
  **Verified afterwards by comparing run seeds pairwise across arms**, and the mismatch count is
  reported (a prior workstream reported 0 of 192).
- `replicates` **must be a multiple of the pool size** — `assignStrategies` is
  `strategies[replicateIndex % poolSize]` and `cellIndex` never enters it. **Observed per-strategy
  coverage is asserted in the output**, not assumed.
- **n ≥ 400 per arm.**

---

## Pre-registered decision rule

**Written and committed before any endpoint number is read.** If the plumbing is smoke-tested before
this commit, only *validity* fields may be read — seed pairing, strategy coverage, whether a spend
tally is present — never an endpoint. Any such smoke run is disclosed in the results.

### Validity gate (checked first; failing it invalidates the comparison, it does not make it "shaped")

- **G1 — spend parity.** Applied favor **per tick run** — total spend divided by `ticksRun` — differs
  between Bot A and Bot B by **≤ 5%** of the larger. Measured and reported by action id, never
  assumed. See the amendment below for why this is a rate and not a total.
- **G2 — identical rulesets.** Both arms permit the same axes at the same ticks. Asserted from the
  bot definitions and confirmed by the permitted-cell count at the tick-600 checkpoint.
- **G3 — CRN.** Pairwise run-seed mismatches across arms = **0**.
- **G4 — coverage.** Observed runs per strategy exactly equal to `replicates / poolSize` × cells.

If G1 fails, the result is reported as **invalid**, with the spend gap named. It is not reported as
a divergence.

#### Amendment to G1, made while the sweeps were in flight and before any endpoint was read

G1 was written as a comparison of **total** favor spent. That is wrong, and wrong in the specific
direction that would have destroyed the experiment's most interesting outcome.

Both arms declare `whenEligible`, so `ticksRun` **ends at first ascension** — and ascension timing is
an *outcome*, not a controlled input. If one arm ascends earlier than the other on the same seeds, it
mechanically runs fewer allocation rounds and mechanically spends less. **The more shaped the result,
the larger the total-spend gap, and the more likely the original G1 would have declared the run
invalid.** A gate that fails precisely when the finding is real is not a gate.

The same failure has a second route. If allocation changes worship, it changes the favor cap and the
worship tier, which changes what is affordable, which changes applied spend. That is **economy
divergence produced by allocation** — it is shape, not contamination — and the original G1 could not
tell it from the design artifact it was actually built to catch, which is Bot B rotating into an
out-of-range slot and silently buying less.

So the gate becomes a **rate**: applied favor per tick run. And when the raw totals differ by more
than the tolerance, the difference is **decomposed** rather than ruled on:

1. **Horizon.** The portion explained by the `ticksRun` difference at the scheduled spend rate. This
   is an outcome and is reported as one; it does not invalidate.
2. **Design artifact.** The portion appearing as gate rejections in `accounting.byActionId` — an
   invalid slot index, which is Bot B's specific risk. **This invalidates**, and it is the thing G1
   was always for.
3. **Residual.** What is left is affordability divergence on rounds where both arms named a valid
   slot. Reported as a **finding** — it means allocation moved the economy.

Every input to that decomposition is already in the records.

#### What the plumbing smoke run read, disclosed

Before this rule was operationalized, a two-run smoke sweep at a **300-tick cap** was executed to
confirm the new fields exist. What was read from it: `runSeed` and `coordinates`, the strategy id,
the *keys and values* of `godSpendByAction`, the list of `censusTrace` tick numbers, `accounting`, and
`ticksRun`. **No census values and no node counts were read**, and a 300-tick cap cannot produce the
tick-600 endpoint at all. The 300-tick spend figures informed the amendment's arithmetic and nothing
else.

### Primary endpoints

Compared **paired by seed** (CRN's whole payoff is the per-seed delta A − B, not two independent
means):

1. `nodesKnown` at the **tick-600 checkpoint** — the guaranteed-common comparison point, before any
   run can terminate on ascension.
2. `nodesKnown` terminal.
3. knowledge-instance count terminal.
4. library depth terminal.
5. living mages terminal.
6. ascension rate.

### The rule

- **SHAPED** iff **at least one** primary endpoint has a paired 95% CI on the mean delta A − B that
  **excludes 0** *and* has **|Δ| ≥ the materiality floor** for that endpoint. Significance alone does
  not count: at n = 400 a paired test flags noise, so a statistically detectable but immaterial
  difference is recorded as *detectable but immaterial* and does **not** clear the rule.
- **FLAT** iff **every** primary endpoint's paired 95% CI lies entirely **within ±δ** — an
  equivalence claim, not a failed significance test. A wide CI that merely fails to exclude zero is
  reported as **inconclusive**, never as flat.

### Materiality floors and equivalence margins, fixed now

| endpoint | materiality floor \|Δ\| | equivalence margin δ |
|---|---|---|
| `nodesKnown` @ tick 600 | 1.0 nodes | 1.0 nodes |
| `nodesKnown` terminal | 1.0 nodes | 1.0 nodes |
| knowledge instances terminal | 5% of the pooled mean | 5% of the pooled mean |
| library depth terminal | 5% of the pooled mean | 5% of the pooled mean |
| living mages terminal | 5% of the pooled mean | 5% of the pooled mean |
| ascension rate | 0.05 absolute | 0.05 absolute |

1.0 node is chosen because the campaign's own separations are quoted in nodes and the reachable v1
set is 51 — a sub-node difference cannot be a decision worth designing around. 0.05 on the ascension
rate is the width the campaign already uses for the exploit-margin threshold and the bottom of §7's
band.

### Secondary, reported but not part of the rule

Ascension route split (apotheosis vs canon), per-mage containment (`mageContainment`), favor spend by
action per arm, applied-versus-refused submission counts per action per arm, and the paired
idle-versus-active deltas against the third arm.

**Applied vs refused is reported per action per arm**, because a refused slot spends nothing: Bot B
rotating into an out-of-range slot would quietly buy less than Bot A while looking identical in the
schedule. That is the mechanism G1 exists to catch, and the counts are how it is caught.

### Correlation reporting

Any correlation is reported as **Spearman beside Pearson with the non-zero count**, using the repaired
support-gated scorer (contributes only at ≥ 3 winners, and contributes the *weaker* coefficient).

---

## What the four candidate explanations predict

An external review offered four reasons the verbs produce no marginal value, and bet on the last two.
Each is distinguished from data this experiment already collects — **no new mechanic is built to test
them.**

| # | explanation | what this experiment would show |
|---|---|---|
| 1 | mages are already near-optimal; grants and blessings are redundant | active arms ≈ idle arm at **every** checkpoint, including early ones |
| 2 | god verbs pull the same levers mages pull, only smaller | supported directly by **finding zero** — the god cannot even name a different target |
| 3 | effects are real but **subsumed by the ceiling** | active arms **ahead at tick 600**, converged at terminal — "much sooner, same place" |
| 4 | verbs have **negative side effects** | active arms **below** the idle arm at terminal, on the same seeds |

#3 and #4 are distinguished by the tick-600 checkpoint against the terminal state, which is exactly
why the checkpoint is a primary endpoint rather than a convenience.

---

## Constraints held

- Measurement only. No rule, constant or magnitude changes. Two strategies added; none edited.
- `npm run goldens:regen` is never run. No baseline regenerated — if one moves, that is a bug here.
- Determinism: fixed point 1/1024, no floats in the rules path. Analysis code outside the rules path
  may use floats.
- `git add -A` is unsafe while a tuner may be writing `god-constant.json`. **Explicit paths only.**
- `npm run verify` must pass. Under load it can fail on an `onTaskUpdate` timeout *after* all tests
  pass; stages are then re-run individually and reported per stage. The timeout is not raised.

## Checklist

- [ ] Pre-registration committed and pushed **before** any endpoint number is read
- [ ] Two bots added additively; no existing strategy edited
- [ ] Favor spend by action observable per run, measurement-only, outside the rules path
- [ ] Three sweep files, one `sweepId`, one `rootSeed`, n ≥ 400 per arm
- [ ] G1–G4 validity gates reported with numbers
- [ ] Paired per-seed analysis against the pre-registered rule
- [ ] Verdict: flat / shaped / inconclusive, plus which explanation the data supports
- [ ] `npm run verify` result reported exactly, per stage if it times out
- [ ] No golden fixture and no balance baseline regenerated
