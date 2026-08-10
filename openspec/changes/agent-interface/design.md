## Context

`core-contracts` fixed the observation vector, the discrete action space, and the legality mask.
`knowledge-model` and `mages-and-species` gave those shapes something to describe. Nothing yet
*plays* the game without a human, and nothing measures it, so `docs/design/release-plan.md` forbids
any balance claim before 0.5.0. This change is that pivot.

Three constraints bind the design.

**Reproducibility is the product.** A Monte Carlo result that cannot be reproduced from its seed is
an anecdote. `sim-core-foundation` bought bit-determinism inside the simulation; this change has to
avoid losing it in the layers above — worker scheduling, floating-point aggregation, bot
tie-breaking, and result storage are all places where nondeterminism re-enters a deterministic
system through the back door.

**Baselines are a governance problem, not a storage problem.** A committed baseline is only a
regression gate if regenerating it is harder than fixing the regression. `sim-core-foundation`
solved the identical problem for golden replay fixtures — explicit command, never a test side
effect, reviewable diff — and this change deliberately mirrors that solution rather than inventing
a second one.

**Half the mechanics this measures do not exist yet.** God verbs land in 0.6.0 and raids in 0.7.0.
The harness must be honest about that gap rather than papering over it, because a metric reporting
a plausible number for a mechanic that is not implemented is the single worst failure mode
available to a measurement layer.

## Goals / Non-Goals

**Goals:**

- One agent interface — the same one scripted bots, Monte Carlo, and the later RL bridge use.
  Building it twice guarantees divergence (vision §9).
- A bot pool diverse enough that a tournament among its members is informative about strategy
  space, not a formality.
- Thousands of headless runs, reproducible from `(sweep config, root seed)` down to identical
  aggregate metrics.
- Every metric in `contracts.md` §7 defined precisely enough to implement from the spec alone and
  to compare across releases without ambiguity about what moved.
- Committed baselines and a CI gate whose failure names the metric and the delta before anyone
  opens an editor.
- Regeneration that is explicit, justified in writing, and legible in review.

**Non-Goals:**

- The Python RL bridge. `gym-bridge` (0.8.0) wraps this interface; it is not built here.
- Reward shaping, curricula, or anything else specific to learning agents. The session API is
  reward-free; a learner supplies its own objective.
- Any game rule. This change measures the game and defines no mechanic, magnitude, or outcome.
- Tuning. The harness will report that placeholder content is badly balanced. Fixing that is
  `god-agency` and `raid-engagement` work.
- Interactive visualization of results. Result files are machine-readable; plotting them is not a
  0.5.0 deliverable.

## Decisions

### The exported observation is float in `[0, 1]`, and the boundary is the only float

`contracts.md` §4.1 says values are "`fp`-normalized to `[0, fp(1024)]`" and that normalization
happens in `agent-api`, "the one place floats are permitted on the way out". It does not name the
exported numeric type, and every agent trained against this interface depends on that choice. It is
pinned here: **`Float64Array`, values in `[0, 1]`, with `fp(1024)` mapping to `1.0`.** The core
still emits integers; `agent-api` divides.

*Alternative considered:* exporting the fixed-point integers unchanged and letting each consumer
normalize. Rejected — that is exactly the "build it twice" failure, and the second implementation
would be in Python where the fixed-point convention is least likely to survive contact.

*Alternative considered:* `[-1, 1]` centring, which some RL practitioners prefer. Rejected — half
the observation blocks are counts with a natural zero, and signing them would make "absent" and
"minimum" indistinguishable at a glance in a debugging dump.

### Normalization uses fixed saturation constants, never run-dependent denominators

Every slot of the observation vector carries a descriptor: its rule (`ratio`, `bounded`,
`log-bucket`, `flag`, `identity`) and a **constant** saturation value. A population count is divided
by a fixed documented ceiling and clamped, never by "the largest population seen in this run".

This is not a stylistic preference. A run-relative denominator makes the same world state produce
different observations depending on history, which destroys the one property RL requires from an
observation space and quietly poisons any bot that compares two observations.

*Alternative considered:* per-sweep min-max scaling computed from a pilot run, which uses the
dynamic range better. Rejected — the scaling would become a hidden input to every baseline, and
changing it would silently reinterpret every committed number.

Saturation constants are part of the observation layout digest (below), so raising one is a visible
contract change rather than a tweak.

### A layout digest and schema version, checked by baselines

`agent-api` publishes `observationSchemaVersion` and a digest over the full slot descriptor table —
block order, slot count, rule and saturation constant per slot. Baselines record the digest they
were produced under, and the regression gate refuses to compare across a mismatch.

*Alternative considered:* comparing only the vector length. Rejected — the shape is fixed by
`core-contracts` and will rarely change length, while a saturation constant or a block reordering
changes meaning without changing length. Length equality is exactly the check that would pass while
being wrong.

### Bots live in `mc-harness`, not in `agent-api`

Scripted bots must play through the agent interface only — reading world state directly would let a
bot see what an RL agent cannot, and every measurement taken with such a bot would overstate what
the observation space supports.

Putting bots in `packages/mc-harness` makes that enforceable for free: `contracts.md` §5 allows
`mc-harness` to depend on `agent-api` and nothing else, and the dependency-graph test from
`core-contracts` already asserts it. A bot that reaches for `rules-world` fails an existing CI check.

*Alternative considered:* `packages/agent-api/bots/`, which reads more naturally — bots are agents.
Rejected — `agent-api` legitimately imports `rules-*`, so an intra-package lint rule would have to
be invented and maintained to stop a bot importing them transitively. Reusing a boundary that is
already tested beats inventing one that is only documented.

### Bot randomness draws from an agent-side RNG outside the `contracts.md` §6 registry

Bots need tie-breaking randomness. That randomness must **not** come from a registered simulation
subsystem stream. §6 states plainly that reusing or renumbering a stream ID invalidates every
committed baseline; if bots drew from stream 7 (mage autonomy tie-breaking), then adding a bot,
changing a bot's decision order, or adding a strategy to the pool would perturb in-simulation rolls
and silently invalidate baselines that have nothing to do with bots.

Bots therefore draw from a separate agent-side generator derived from
`(runSeed, agentSlotIndex, botStrategyId)`, structurally outside the simulation. A bot's draws never
advance a simulation stream.

*Alternative considered:* appending a stream ID 11 "agent policy" to the registry. Rejected —
registry streams are per-*simulation-subsystem* and are consumed inside `step`; a bot lives outside
`step` by construction, and putting a caller-side concern in the registry would blur the one
boundary that keeps stream semantics comprehensible.

### Seeds are derived, not enumerated

A run seed is a pure function of `(rootSeed, sweepId, cellIndex, replicateIndex)`. Nothing about
which worker picked up the run, when it started, or how many runs preceded it enters the derivation.

This is what makes a single run reproducible in isolation: the result record carries the four
derivation inputs, and the reproduction CLI re-derives the same seed in-process, single-threaded,
with the debugger attached.

*Alternative considered:* a master PRNG dealing seeds to workers as they become free. Simpler to
write, and it makes results depend on scheduling — the defect that would be discovered months later
when two identical sweeps disagreed by a fraction of a percent.

### Aggregation happens in canonical run order

Metric aggregation uses floating-point (means, Gini coefficients, survival estimates), and
floating-point addition is not associative. Runs complete in whatever order eight workers finish
them, so aggregating on completion order would produce results that differ between identical sweeps
in the last bits — and the release-plan claim is *identical* aggregate metrics, not approximately
identical.

All aggregation therefore sorts run records by `(cellIndex, replicateIndex)` before folding, and the
sweep summary is written from that canonical order.

*Alternative considered:* asserting equality with a tolerance instead. Rejected — a tolerance on the
reproducibility check is a tolerance on the thing that makes every other number trustworthy, and it
would mask genuine nondeterminism just as effectively as it masks float noise.

### Every §7 metric is always present in a record; absent mechanics report `unavailable`

`release-plan.md` claims for 0.5.0 that "every metric in `contracts.md` §7 is reported for every
run". Read literally against a 0.5.0 build, that is impossible: `winRateByPrimitive`,
`raidLengthDistribution`, and `prestigeAdvantage` describe raids and prestige, which land in 0.6.0
and 0.7.0.

The resolution is that *reported* means the key is present with a defined status. Every run record
contains an entry for every registered metric; the entry is either a measurement or
`{status: "unavailable", reason: <code>}` with `mechanic-absent` among the reason codes. A missing
key is a harness failure, and a CI check asserts the registry's key set equals `contracts.md` §7's.

*Alternative considered:* omitting inapplicable metrics until their mechanic lands. Rejected — it
makes "metric missing because the collector broke" indistinguishable from "metric missing because
the feature does not exist yet", which is precisely the confusion that lets a silently-dead
collector survive to 1.0.

*Alternative considered:* reporting zero or `null`. Rejected — zero aggregates into means as a real
observation, and a metric that reads `winRateByPrimitive: 0` for every primitive looks like a
finding.

### The bot pool is specified against the full action space and exercised progressively

At 0.5.0 the god's verbs do not exist, so most of actions 1–15 are permanently masked and every bot
degrades toward the passive control. That does not make the pool premature: specifying the
strategies now is what forces 0.6.0 and 0.7.0 to deliver actions a strategy can actually
differentiate on, and each capability that lands is immediately measurable by an existing pool.

The pool is therefore required to run to termination against a fully-masked action space — a bot
that assumes an action is available and stalls is a bug caught now rather than in 0.6.0.

*Alternative considered:* deferring the bot pool to `god-agency`, where the verbs exist. Rejected —
`god-agency`'s release claim ("no scripted god strategy exceeds a 65% win rate against the pool")
presupposes the pool, so deferring it would make the first balance claim unverifiable at the moment
it is made.

### `winRateByPrimitive` is measured by one-sided mirrored ablation on paired seeds

Attribution requires an asymmetry: if a primitive is removed from both sides, nobody wins because
of it. The definition adopted is **the win rate of the arm retaining primitive *p* against the arm
ablating *p*, over mirrored pairs** — each matched pair is played twice with the sides swapped, so
side bias cancels. 50% means no measured contribution.

Three properties make it trustworthy:

- **Common random numbers.** Control and ablation arms use the same derived run seeds, so the
  comparison is paired rather than independent, which cuts the sample size needed for a given
  confidence width by a large factor.
- **Draw-count invariance.** A neutralized primitive still consumes its RNG draws and discards the
  result. Without this, ablating `knowledge-steal` would shift every subsequent draw on stream 9
  and the paired design would decay into an unpaired one.
- **Neutralization by mask, not by content edit.** The ablation mask is applied inside the shared
  primitive-stacking implementation from `core-contracts`. Node graphs, prerequisites, tiers, and
  costs are untouched, so mages still research the same nodes at the same cost — the node simply
  does nothing. Editing content instead would change what is learnable and what it costs, and the
  measured delta would confound "this primitive matters" with "this research path got cheaper".

*Alternative considered:* symmetric ablation, removing *p* from the whole game and comparing outcome
distributions. It answers a different and also useful question — global sensitivity — and is kept as
a secondary diagnostic, but it cannot produce a *win rate*, which is what §7 names.

*Alternative considered:* regression of outcomes on realized primitive usage across a single sweep,
avoiding extra runs entirely. Rejected — usage is chosen by the bots, so the estimate is
confounded by strategy, and it measures correlation in a system where the interesting effects are
causal.

The `portal` primitive is a special case and is reported as `not-attributable`: ablating it removes
raiding entirely, so there is no raid whose win rate could be attributed, and the number a naive
implementation would emit is meaningless rather than large.

Pairwise interaction ablation is deliberately out of scope — 15 primitives make 105 pairs, which
multiplies sweep cost by two orders of magnitude for a question nobody has yet asked.

### Baseline regeneration mirrors golden fixture regeneration, deliberately

`sim-core-foundation` established the pattern for artifacts that a build compares itself against:
tests never rewrite them, regeneration is a separate explicit command, and the result is a
reviewable diff. Balance baselines get the same treatment plus two additions the golden case does
not need:

- **A rationale is mandatory.** The regeneration command refuses to write without a supplied reason,
  which is stored in the baseline file. A baseline whose diff says only "numbers changed" is a
  balance regression laundered into a commit; a baseline whose diff says "worship regen formula
  retuned in `god-agency`, `worshipSnowball` expected to fall" is a reviewable claim.
- **The diff shows the movement.** Each regenerated baseline records `supersedes` (the prior
  baseline's content hash) and, per metric, the delta from the prior value in the same units the
  gate uses. The reviewer does not have to compute what moved; the file says so.

The regeneration entrypoint is not reachable from the test script, and CI must not be able to invoke
it. A CI-invoked regeneration would make the gate self-satisfying.

*Alternative considered:* an append-only `BASELINE_LOG.md` ledger alongside the files. Rejected —
version control is already an append-only ledger with authorship and review attached, and a second
one drifts from the first the week someone amends a commit.

*Alternative considered:* auto-regenerating baselines on the release branch at tag time. Rejected
for the same reason as CI regeneration: it converts every uninspected balance change into an
accepted one, on the exact commit where inspection matters most.

**Widening a tolerance is regeneration.** Tolerances live inside the baseline file and are covered
by the same command, the same mandatory rationale, and the same review path. Otherwise the cheapest
way to pass the gate would be to move the goalposts, and it would not even show up as a baseline
change.

### The gate runs a small seeded sweep; the full sweep runs at release

A ten-thousand-run sweep on every pull request is not affordable. CI runs a **gate sweep** — a
fixed, small, fully-seeded subset declared in the sweep file — and the full sweep runs on release
candidates and on a schedule.

The consequence that must not be fumbled: **tolerances are derived from the gate sweep's own
standard error, not the full sweep's.** The gate sweep has fewer runs and therefore wider noise; a
tolerance derived from full-sweep precision would flap on every commit, and one guessed generously
would never fire. Each baseline records, per metric, the gate sweep's estimate, its standard error
at the gate sweep's sample size, and a tolerance of at least *k* standard errors. The gate reports
both the raw delta and the delta in standard errors, so "moved a lot but within noise" and "moved
slightly but far outside noise" are distinguishable at a glance.

*Alternative considered:* gating on the full sweep only, at release. Rejected — it detects
regressions a milestone late, when bisecting means bisecting a milestone's worth of commits.

*Alternative considered:* no statistical component, just fixed percentage tolerances. Rejected —
`ascensionRate` at 5–20% and `winRateByPrimitive` around 50% have utterly different noise
characteristics at the same sample size, and one percentage would be wrong for both.

### Pinned constants are versioned with their metric definitions

`contracts.md` §7 defines the metrics in one line each, which leaves several free parameters this
change must pin: the census interval for knowledge sampling, the checkpoint ticks for Gini
coefficients, the histogram bin width for raid length, the censoring rule for time-to-tier. Those
pins are *inventions*, and inventing them silently would be the worst outcome — a later change would
re-invent them differently and the baselines would compare two different quantities under one name.

Each metric therefore carries a `definitionVersion` covering its formula *and* its pinned constants.
Baselines record it, and the gate refuses to compare a metric across a `definitionVersion` change,
reporting `baseline-invalid` rather than a delta. Changing the census interval is not a tuning
tweak; it is a redefinition, and it forces a reviewed regeneration.

### Truncated runs are recorded, never discarded

A Monte Carlo run terminates by ascension, by stagnation, or by hitting the world-tick cap. Runs
that hit the cap are recorded with status `truncated` and remain in the denominator of rate metrics.

Dropping them would bias every metric toward whatever happens in universes that end quickly, and
`ascensionRate` — whose whole purpose is to sit in a 5–20% band — would be computed over a
population selected on the outcome it measures.

## Risks / Trade-offs

- **Baselines produced against untuned placeholder content will move violently in 0.6.0–0.7.0** →
  Accepted and intended. The gate's job is to make each movement explicit and reviewed. The cost is
  real regeneration traffic during those two milestones; the alternative is having no reference
  point at the exact moment the numbers start meaning something.
- **The gate could become a rubber stamp if regeneration is routine** → The mandatory rationale and
  the recorded per-metric delta make a lazy regeneration visible in review as a lazy regeneration.
  This is a social control with a mechanical assist, and it is honestly labelled as such: nothing
  can stop a determined author from writing "retuned" in the reason field.
- **Floating-point aggregation is a reproducibility hazard** → Canonical-order folding plus an
  exact-equality reproducibility test. Any tolerance introduced here would defeat the test.
- **Metric definitions pinned now may prove wrong once raids exist** → `definitionVersion` makes
  changing one loud rather than silent, and the gate refuses cross-version comparison instead of
  producing a meaningless delta.
- **The bot pool may not be strategically diverse in a way that matters** → The pool's diversity is
  itself measurable: a tournament in which every pairing lands near 50%, or in which one strategy
  dominates the field, is evidence about the pool, and both are reportable outcomes rather than
  silent ones.
- **Ablation multiplies sweep cost by the number of primitives** → 15 primitives plus one shared
  control arm is 16× the ablation sweep's per-arm cost, which is why ablation is a full-sweep
  activity and not part of the per-commit gate. Interaction ablation is excluded outright.
- **Worker crashes could silently shrink a sweep** → Failed runs are recorded as failures with
  their derivation inputs, the sweep summary reports the failure count, and a sweep whose failure
  rate exceeds a declared threshold is not eligible to produce a baseline.
- **`agent-api` is the frozen surface at 1.0** → It is deliberately small and reward-free.
  `gym-bridge` will be the first real test of whether it is sufficient, and that is one milestone
  after this one rather than three.

## Migration Plan

Additive on top of `core-contracts`, `knowledge-model`, and `mages-and-species`. No existing
behaviour changes; no snapshot, content, or observation contract is altered. Rollback is reverting
the branch, after which the project loses its ability to make balance claims and reverts to
mechanical claims only — which is the honest state before this change lands.

The first committed baselines are generated once at the end of this change, from the tagged 0.5.0
build, using the ordinary regeneration command with the rationale "initial baseline, 0.5.0". They
are a reference point, not an assertion that the current tuning is good.

## Open Questions

- What is the real throughput of ten thousand runs on eight workers? Deliberately unanswered — it is
  an *output* of this change, recorded the way `sim-core-foundation` records entity throughput, and
  the release claim is made against the recorded figure rather than a figure asserted in advance.
- What is *k* in the *k*-standard-error tolerance rule? Set initially at a documented value and
  expected to be revised once the gate sweep's real flap rate is observed over a milestone of
  commits. Revising it is a tolerance change and goes through the regeneration path.
- Should the even-MINOR / odd-MINOR balance-validation versioning scheme in `release-plan.md` be
  adopted now that baselines exist to be green? Flagged there as a decision, not adopted; this
  change makes it *possible* and leaves the choice to whoever cuts 0.6.0.
- Does `prestigeAdvantage` need a dedicated two-universe sweep mode, or can it ride the ordinary
  raid sweep with a prestige factor? Deferred to `god-agency`, which is where prestige carry-forward
  acquires a magnitude; the metric's collector ships here reporting `mechanic-absent`.
