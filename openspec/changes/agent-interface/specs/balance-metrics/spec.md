## ADDED Requirements

### Requirement: Metric registry completeness

The metric registry SHALL contain exactly the metrics named in `docs/design/contracts.md` §7, each
with an identifier matching the name used there, a normative definition, a collector, a scope of
`per-run` or `per-arm`, an aggregation rule, a unit, and a `definitionVersion`. Every result record
MUST carry an entry for every registered metric; a missing key is a harness failure, never an
omission.

#### Scenario: Registry matches the contract

- **WHEN** the registry conformance check runs
- **THEN** the set of registered metric identifiers equals the set named in `contracts.md` §7, with
  no extras and no omissions, and the check names any difference

#### Scenario: Every run record is complete

- **WHEN** any per-run result record is read
- **THEN** it contains an entry for every registered metric, with `per-arm` metrics present as
  `{status: "unavailable", reason: "per-arm-scope"}` and carrying their value only in the sweep
  summary

#### Scenario: A dead collector is a failure, not a gap

- **WHEN** a collector raises or returns nothing for a metric whose mechanic is present
- **THEN** the run is recorded as `failed` rather than the record being written without that metric

### Requirement: Metrics whose mechanic is absent report an explicit unavailable status

A metric whose underlying mechanic has not yet been implemented SHALL be reported as
`{status: "unavailable", reason: <code>}` rather than as a number, a zero, or a null. Reason codes
MUST distinguish at minimum `mechanic-absent` (the feature has not shipped), `no-observations` (the
mechanic exists but the run produced no eligible sample), `censored` (the run ended before the
quantity could be observed), and `per-arm-scope` (the metric is defined across an arm and has no
per-run value).

#### Scenario: Raid metrics before raids exist

- **WHEN** a sweep runs against a build in which `raid-engagement` has not landed
- **THEN** `winRateByPrimitive`, `raidLengthDistribution`, and `prestigeAdvantage` are each present
  with status `unavailable` and reason `mechanic-absent`

#### Scenario: Unavailable values never enter aggregates

- **WHEN** an arm's runs report a metric as `unavailable`
- **THEN** the aggregate for that metric is itself `unavailable` and no zero is folded into a mean

#### Scenario: Absent and empty are distinguishable

- **WHEN** a run completes with no raids because none were initiated, on a build where raids exist
- **THEN** `raidLengthDistribution` reports reason `no-observations`, not `mechanic-absent`

### Requirement: Metric definitions are versioned together with their pinned constants

Each metric SHALL carry a `definitionVersion` covering both its formula and every constant this
change pins for it — census interval, checkpoint ticks, histogram bin width, censoring rule, and
saturation or eligibility thresholds. Changing any such constant MUST bump the `definitionVersion`,
and the regression gate MUST refuse to compare a metric across differing `definitionVersion` values.

#### Scenario: Changing a pinned constant bumps the version

- **WHEN** the knowledge census interval is changed from 12 world ticks to 6
- **THEN** `knowledgeHalfLife` and `libraryDependence` both require a `definitionVersion` bump, and a
  conformance check fails if the bump is omitted

#### Scenario: Cross-version comparison is refused

- **WHEN** the gate compares a current metric at `definitionVersion` 2 against a baseline recorded at
  `definitionVersion` 1
- **THEN** the gate reports `baseline-invalid` for that metric and fails, rather than reporting a
  delta

#### Scenario: Versions are recorded per metric, not per sweep

- **WHEN** one metric's definition changes and others do not
- **THEN** only that metric's comparisons are invalidated

### Requirement: Knowledge lifetime metrics

`knowledgeHalfLife` and `libraryDependence` SHALL be computed from a knowledge census taken every
12 world ticks (one world year), beginning at world tick 0 and continuing until run termination.
`knowledgeHalfLife` MUST be computed as follows: at each census tick *t*, the cohort `K(t)` is the
set of nodes existing in the universe, where existence is instance count ≥ 1 as defined in
`contracts.md` §1.5; each cohort member is observed until the first later tick at which its instance
count reaches 0, or right-censored at run termination; cohorts are pooled and a Kaplan–Meier survival
curve is estimated over elapsed world ticks; the metric is the smallest elapsed tick count at which
estimated survival falls to or below 0.5. `libraryDependence` MUST be computed as the fraction of
existing nodes with exactly one surviving instance, evaluated at each census tick and reported per
run as the mean over census samples, together with the maximum sample and the final sample.

#### Scenario: A node lost and rediscovered contributes twice

- **WHEN** a node is lost at tick 300 and rediscovered at tick 500 within a run
- **THEN** it contributes an observed loss to every cohort it belonged to before tick 300, and
  re-enters cohorts sampled from tick 500 onward

#### Scenario: Survivorship is censored, not truncated

- **WHEN** a run ends while half its cohort members are still in existence
- **THEN** those members are recorded as right-censored at run end rather than counted as losses

#### Scenario: Half-life not reached within the run

- **WHEN** the pooled survival curve never falls to 0.5 before run termination
- **THEN** `knowledgeHalfLife` reports status `censored` with the longest observed elapsed tick count
  as a lower bound

#### Scenario: An empty universe does not divide by zero

- **WHEN** a census finds no nodes existing in the universe
- **THEN** that sample is excluded from `libraryDependence` and the exclusion count is recorded

### Requirement: Species progression metric

`timeToTierBySpecies` SHALL be reported for all 42 `(species, tier)` pairs spanning 6 species and 7
tiers, and MUST be defined as the first world tick at which any living mage of that species holds a
knowledge instance, at location kind `mind`, of a node whose `tier` field equals that tier. A pair
never reached before run termination MUST be recorded as right-censored at the termination tick, and
MUST NOT be recorded as the run length.

#### Scenario: All pairs are present regardless of the v1 subset

- **WHEN** a run uses only the 12 v1 cells
- **THEN** all 42 pairs appear in the record, with unreachable pairs marked censored

#### Scenario: Censoring is not a measurement

- **WHEN** a species never reaches tier 6 in a 2400-tick run
- **THEN** the pair records status `censored` at tick 2400 and is excluded from the median

#### Scenario: Heavily censored pairs report censoring rather than a median

- **WHEN** more than half the runs in an arm censor a given pair
- **THEN** the aggregate reports `censored` with the censoring fraction rather than a median computed
  from the surviving minority

#### Scenario: Grimoire-only knowledge does not count

- **WHEN** a node of tier 4 exists only in a grimoire and no mage of the species has learned it
- **THEN** the pair is not yet recorded as reached

### Requirement: Snowball metrics

`worshipSnowball` and `capitalSnowball` SHALL be `per-arm` metrics computed as Gini coefficients
across the runs of an arm at the fixed checkpoint world ticks 60, 120, 240, 480, and 1200. The Gini
coefficient MUST be computed over the ascending-sorted values as
`G = (2·Σ i·x_i) / (n·Σ x_i) − (n+1)/n`. For `worshipSnowball` the quantity `x` MUST be the
instantaneous favor regeneration per world tick at the checkpoint. For `capitalSnowball` the
quantity `x` MUST be the count of distinct nodes held in instances whose location kind is `library`,
summed across all libraries, at the checkpoint. Runs that terminated before a checkpoint MUST be
excluded from that checkpoint, and the exclusion count MUST be reported alongside the coefficient.

#### Scenario: Reported per checkpoint, not as a single number

- **WHEN** an arm completes
- **THEN** both metrics report one coefficient per checkpoint tick, each with its sample size and
  exclusion count

#### Scenario: Degenerate populations are defined

- **WHEN** every run's quantity at a checkpoint is zero
- **THEN** the coefficient is reported as 0 rather than as a division by zero

#### Scenario: Early terminations are excluded and counted

- **WHEN** 30 of 200 runs in an arm terminate before tick 1200
- **THEN** the tick-1200 coefficient is computed over 170 runs and reports an exclusion count of 30

#### Scenario: Instantaneous rate, not accumulated total

- **WHEN** a run has accumulated large favor but its regeneration rate at the checkpoint is small
- **THEN** the small rate is the value contributed to `worshipSnowball`

### Requirement: Raid length distribution

`raidLengthDistribution` SHALL record, for every raid in a run, the number of engagement ticks from
raid start to resolution, and MUST report a histogram over fixed bins of width 10 engagement ticks
spanning zero to the maximum initial portal stability expressible in engagement ticks, plus one
overflow bin. The overflow bin MUST always be empty, and a non-empty overflow bin MUST fail the run,
because `contracts.md` §7 requires the distribution to be bounded by portal stability.

#### Scenario: Bounded by portal stability

- **WHEN** a raid resolves
- **THEN** its recorded length is less than or equal to its initial portal stability in engagement
  ticks

#### Scenario: An unbounded raid is a failure, not an outlier

- **WHEN** a raid exceeds its initial portal stability
- **THEN** the overflow bin is non-empty, the run is recorded as `failed`, and the failure names the
  raid and its seed

#### Scenario: Summary statistics accompany the histogram

- **WHEN** an arm completes with raids present
- **THEN** the metric reports p50, p95, maximum, and the bin counts, pooled in canonical run order

### Requirement: Run outcome metrics

`ascensionRate` SHALL be the fraction of runs whose terminal status is `ascended`, over a denominator
of all runs whose status is `ascended`, `stagnated`, or `truncated`. Runs whose status is `failed`
MUST be excluded from both numerator and denominator and reported separately. `prestigeAdvantage`
SHALL be the win rate of a universe seeded with the maximum permitted prestige carry-forward against
an otherwise identical universe seeded with zero prestige, measured over mirrored pairs sharing run
seeds with the sides swapped.

#### Scenario: Truncated runs are in the denominator

- **WHEN** an arm of 500 runs yields 40 ascensions, 300 stagnations, 150 truncations, and 10 failures
- **THEN** `ascensionRate` is 40/490 and the 10 failures are reported separately

#### Scenario: Target band is reported, not enforced by the collector

- **WHEN** `ascensionRate` falls outside the 5–20% band named in `contracts.md` §7
- **THEN** the metric is reported with its band and the deviation is surfaced by the regression gate,
  not silently clamped by the collector

#### Scenario: Prestige pairs are mirrored

- **WHEN** a `prestigeAdvantage` pair is scheduled
- **THEN** the same run seed is played twice with the prestige-seeded universe in each side, and both
  outcomes contribute

#### Scenario: Prestige magnitude is not invented here

- **WHEN** the maximum permitted prestige carry-forward has not yet been defined by `god-agency`
- **THEN** `prestigeAdvantage` reports `unavailable` with reason `mechanic-absent` rather than
  choosing a magnitude

### Requirement: Illegal action rate

`illegalActionRate` SHALL be the fraction of submitted actions rejected by the legality mask, over a
denominator of all submitted actions including no-ops, and MUST be reported per run, per action id,
and per `strategyId`. The metric MUST be derived from the counters exported by `agent-api` rather
than recounted independently.

#### Scenario: No-ops are in the denominator

- **WHEN** a strategy submits 900 no-ops and 100 other actions, 20 of which are rejected
- **THEN** `illegalActionRate` is 0.02

#### Scenario: Breakdown identifies the unclear mask entry

- **WHEN** one action id accounts for most rejections across the pool
- **THEN** the per-action breakdown makes that visible, since a high rate is a spec-clarity smell

#### Scenario: Passing is distinguishable from being refused

- **WHEN** a strategy submits only no-ops because everything else is masked
- **THEN** its rejection count is zero and its no-op share is high, and the two are reported
  separately

### Requirement: Primitive ablation mechanism

Ablation SHALL neutralize a primitive by applying an ablation mask inside the shared primitive
stacking implementation established by `core-contracts`, and MUST NOT be implemented by editing,
removing, or regenerating content. Neutralization MUST be defined per stacking class: additive
contributions become 0; additive-into-multiplier contributions contribute no bonus, leaving the
multiplier at `fp(1024)`; multiplicative-on-remainder contributions prevent nothing; `max`
contributions contribute 0; and a presence-only gate is treated as absent. A neutralized primitive
MUST still consume its random draws and discard the result, so that a control run and its paired
ablation run produce identical RNG draw sequences up to the point where behaviour genuinely diverges.

#### Scenario: Content is untouched

- **WHEN** an ablation arm runs with `research-rate` neutralized
- **THEN** the content hash recorded in every run record is identical to the control arm's, and node
  prerequisites, tiers, and costs are unchanged

#### Scenario: Draw counts are preserved

- **WHEN** a control run and its paired ablation run are executed with `knowledge-steal` neutralized
- **THEN** both consume the same number of draws from RNG stream 9 up to the first genuine behavioural
  divergence

#### Scenario: Paired arms share seeds

- **WHEN** an ablation sweep is scheduled
- **THEN** every ablation arm uses the same derived run seeds as the shared control arm

#### Scenario: Every stacking class has a defined neutralization

- **WHEN** the ablation conformance check runs over the primitive registry
- **THEN** every primitive in `contracts.md` §3 has a neutralization rule matching its declared
  stacking class, and the check names any primitive lacking one

### Requirement: Win rate attributed by one-sided mirrored ablation

`winRateByPrimitive` SHALL be defined, for each primitive *p*, as the win rate of the arm retaining
*p* against the arm in which *p* is neutralized, measured over mirrored pairs that share derived run
seeds and are played twice with the sides swapped. The metric MUST be reported with a 95% Wilson
score interval, and a primitive whose interval contains 0.5 MUST be reported as
`no-detected-effect` alongside its point estimate rather than as a small contribution.

#### Scenario: Fifty per cent means no measured contribution

- **WHEN** a primitive's retaining arm and ablating arm win equally often
- **THEN** the metric reports 0.5 and the status `no-detected-effect`

#### Scenario: Side bias cancels

- **WHEN** the harness is configured so that one side has a structural advantage
- **THEN** mirrored scheduling makes that advantage contribute equally to both arms and the reported
  attribution is unaffected

#### Scenario: Portal is not attributable

- **WHEN** attribution is computed for the `portal` primitive
- **THEN** the metric reports `not-attributable`, because neutralizing `portal` removes raiding
  entirely and leaves no raid whose outcome could be attributed

#### Scenario: Interaction effects are out of scope

- **WHEN** the ablation configuration is inspected
- **THEN** it declares single-primitive ablation only, and requesting a pairwise ablation is rejected
  with an explanation rather than silently executed

#### Scenario: Sample size is reported with the estimate

- **WHEN** an attribution is reported
- **THEN** it carries the number of mirrored pairs it was computed from, so a wide interval is
  attributable to sample size rather than mysterious

### Requirement: Committed baseline artifact

Balance baselines SHALL be committed files under version control, one per gated sweep, each
recording: the sweep configuration hash, the `rootSeed`, the build version, the content hash, the
RNG stream registry hash, the observation schema version and layout digest, and, per metric, the
`definitionVersion`, the point estimate, the standard error at the gate sweep's sample size, the
sample size, and the tolerance. Baseline files MUST be written in a canonical form — stable key
order, one metric per line — so that a diff shows exactly which metrics moved.

#### Scenario: Provenance is complete

- **WHEN** a baseline file is read
- **THEN** every provenance key listed above is present, and a baseline missing any of them is
  rejected as malformed

#### Scenario: Diffs are legible

- **WHEN** a baseline is regenerated and one metric changes
- **THEN** the version-control diff touches only that metric's line and the regeneration provenance
  block

#### Scenario: Baselines are per-sweep, not global

- **WHEN** two gated sweeps exist
- **THEN** each has its own baseline file keyed on its `sweepId`, and neither can satisfy the other's
  gate

### Requirement: Tolerances derived from gate-sweep noise

Each metric's tolerance SHALL be derived from the standard error of that metric at the **gate
sweep's** sample size, not the full sweep's, and MUST be at least *k* standard errors, where *k* is
a documented constant recorded in the baseline. The gate MUST report both the raw delta and the
delta expressed in standard errors, so that a large-but-noisy move and a small-but-significant move
are distinguishable.

#### Scenario: Tolerance reflects the sweep that gates

- **WHEN** the gate sweep runs 200 runs and the full sweep runs 10,000
- **THEN** the committed tolerance is derived from the standard error at 200 runs

#### Scenario: Both deltas are reported

- **WHEN** a metric moves
- **THEN** the gate report names the metric, its baseline value, its current value, the raw delta,
  and the delta in standard errors

#### Scenario: Noise-scaled tolerances differ per metric

- **WHEN** `ascensionRate` and `winRateByPrimitive` are both gated at the same sample size
- **THEN** their tolerances differ according to their own standard errors rather than sharing one
  fixed percentage

### Requirement: Balance regression gate in CI

CI SHALL execute the gate sweep and compare its metrics against the committed baseline, and MUST
fail the build when any gated metric moves beyond its tolerance. The gate MUST also fail, reporting
`baseline-invalid` rather than a delta, when the baseline file for a gated sweep is missing, when any
provenance key in the baseline does not match the current build, or when a metric's
`definitionVersion` differs from the baseline's.

#### Scenario: A metric beyond tolerance fails the build

- **WHEN** a change moves `worshipSnowball` beyond its tolerance
- **THEN** CI fails and the failure names the metric, the baseline value, the current value, and both
  deltas

#### Scenario: A missing baseline fails, and is never treated as a pass

- **WHEN** the baseline file for a gated sweep is deleted
- **THEN** the gate fails with `baseline-invalid`, because deleting a baseline would otherwise be a
  silent regeneration

#### Scenario: Stale provenance fails rather than comparing

- **WHEN** the content hash changes but the baseline is not regenerated
- **THEN** the gate fails with `baseline-invalid` and states which provenance key mismatched

#### Scenario: Unavailable metrics do not fail the gate

- **WHEN** a metric is `unavailable` with reason `mechanic-absent` in both the baseline and the
  current run
- **THEN** the gate passes that metric and reports it as not yet gated

#### Scenario: A metric becoming available is surfaced

- **WHEN** a metric that was `unavailable` in the baseline reports a value in the current run
- **THEN** the gate reports it as newly available and requires a baseline regeneration before it is
  gated

### Requirement: Deliberate baseline regeneration

Regenerating a baseline SHALL require an explicit, separately-invoked command, MUST NOT occur as a
side effect of running tests or of the regression gate, and MUST NOT be invocable from CI. The
command MUST refuse to write without a supplied written rationale, MUST store that rationale in the
regenerated file, and MUST record the superseded baseline's content hash together with the per-metric
delta from it in the units the gate uses. Changing a metric's tolerance MUST go through this same
command and the same rationale requirement, because widening a tolerance is equivalent to
regenerating a baseline.

#### Scenario: Tests never rewrite baselines

- **WHEN** the test suite is run while the gate is failing
- **THEN** the baseline files on disk are unchanged and the suite exits non-zero

#### Scenario: Regeneration without a rationale is refused

- **WHEN** the regeneration command is invoked with no rationale
- **THEN** it exits non-zero, writes nothing, and states that a rationale is required

#### Scenario: The diff carries the movement

- **WHEN** a baseline is regenerated after a deliberate tuning change
- **THEN** the regenerated file records the superseded baseline's hash, the rationale, and each
  metric's delta from the superseded value, so a reviewer reads what moved without recomputing it

#### Scenario: CI cannot regenerate

- **WHEN** the CI configuration is inspected
- **THEN** the regeneration entrypoint is unreachable from any CI job and from the test script, and a
  check asserts this

#### Scenario: Widening a tolerance is a reviewed regeneration

- **WHEN** a tolerance is edited directly in a baseline file without the command
- **THEN** the gate rejects the baseline as malformed, because the regeneration provenance block no
  longer matches the file's contents

#### Scenario: A disqualified sweep cannot become a baseline

- **WHEN** regeneration is attempted from a sweep whose failure count exceeded its declared threshold
- **THEN** the command refuses and names the failure count
