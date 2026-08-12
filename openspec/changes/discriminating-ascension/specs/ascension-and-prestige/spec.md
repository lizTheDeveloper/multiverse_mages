## MODIFIED Requirements

### Requirement: Ascension has two disjoint qualifying paths

A universe SHALL qualify for ascension by satisfying either path below, and MUST NOT be able to
declare before `ASCENSION_MIN_TICK`. Path A's depth requirement MUST be expressed relative to the
loaded content graph rather than as a literal node tier, so that the condition stays reachable as
content changes. **Both paths MUST read at least one quantity that the god's own actions move**, so
that eligibility measures play rather than elapsed time; a path whose every conjunct is satisfied by
a universe receiving no submissions is a path that measures content.

**Path A — Apotheosis of Mastery.** A living mage holds a node that is the deepest node present in
its cell's content graph; `permits` returns true for that cell; at least two instances of that node
survive anywhere in the universe; and `worshipTier` is at least `ASCENSION_TIER_GATE`.

**Path B — Enduring Canon.** The universe has reached era `ASCENSION_ERA_COUNT`; at every era
boundary since era 1, the universe held at least `ASCENSION_CANON_BREADTH` nodes, `libraryDependence`
was at or below `ASCENSION_DEPENDENCE_MAX`, and no more nodes left the universe during that era than
the **era loss allowance**.

The era loss allowance SHALL be `max(ASCENSION_LOSS_MAX, floorDiv(nodesKnown ×
ASCENSION_LOSS_FRACTION, fp(1024)))`, evaluated at the boundary, and MUST be computed in integer and
fixed-point arithmetic only. It scales because the quantity it guards scales: an absolute cap over a
canon of any size measures the size of the canon rather than the care taken of it, and a universe
holding three times as many nodes loses more of them in the ordinary course of mages dying.
`ASCENSION_LOSS_MAX` is retained as the floor so that a small canon keeps exactly the allowance
authored for it.

`ASCENSION_MIN_TICK = 600`, `ASCENSION_TIER_GATE = 5`, `ASCENSION_ERA_COUNT = 4`,
`ASCENSION_CANON_BREADTH = 96`, `ASCENSION_DEPENDENCE_MAX = fp(256)` (25%),
`ASCENSION_LOSS_MAX = 2`, and `ASCENSION_LOSS_FRACTION = fp(51)` (≈5%) are untuned placeholders
awaiting the balance harness.

`ASCENSION_TIER_GATE` stands at the ceiling of `WORSHIP_TIER_COUNT`, so Path A's first retune knob is
spent. A subsequent tightening of Path A MUST therefore be a new conjunct rather than a further turn
of this knob, and the change that adds one MUST say so explicitly.

#### Scenario: Depth is relative to content

- **WHEN** the deepest node present in a cell's loaded content graph is tier 5
- **THEN** holding that tier-5 node satisfies Path A's depth requirement, and no literal tier-7
  check is performed anywhere

#### Scenario: A single copy does not qualify

- **WHEN** a living mage holds the deepest node of a permitted cell but only one instance of it
  exists
- **THEN** Path A is not satisfied, and it becomes satisfied once a second instance is taught or
  scribed

#### Scenario: A forbidden summit does not qualify

- **WHEN** the qualifying mage's cell is forbidden by an interdiction
- **THEN** Path A is not satisfied while the interdiction stands

#### Scenario: One bad era disqualifies the canon

- **WHEN** a universe holds `libraryDependence` under the threshold for three eras and exceeds it at
  the fourth era boundary
- **THEN** Path B is not satisfied, and the earliest era boundary that can still support it moves
  forward

#### Scenario: The floor holds against a rush

- **WHEN** a universe satisfies Path A at world tick 400
- **THEN** action 15 remains masked until world tick 600

#### Scenario: The paths are independently reported

- **WHEN** a Monte Carlo sweep completes
- **THEN** `ascensionRateByPath` reports the fraction of runs ascending by each path separately, in
  addition to the aggregate `ascensionRate`

#### Scenario: A universe that receives no submissions qualifies for neither path

- **WHEN** a reference universe is stepped for `MC_MAX_TICKS` with an empty action list on every
  tick
- **THEN** `ascensionPath` is `none` at every tick, and the run terminates without ascending

#### Scenario: A sustained institutional programme reaches the tier gate

- **WHEN** a god founds and completes universities steadily across a run
- **THEN** `worshipTier` reaches `ASCENSION_TIER_GATE` before `MC_MAX_TICKS`, and Path A becomes
  satisfiable

#### Scenario: A canon too small to be a canon does not pass a boundary

- **WHEN** an era boundary is evaluated in a universe holding fewer than `ASCENSION_CANON_BREADTH`
  nodes
- **THEN** the boundary does not pass, `goodEraRun` resets to zero, and the recorded evaluation names
  the breadth conjunct as the one that failed

#### Scenario: A large canon is not disqualified for its size

- **WHEN** an era boundary is evaluated in a universe holding 174 nodes that lost 7 during the era
- **THEN** the loss allowance is 8 and the boundary passes on that conjunct, where a universe holding
  51 nodes that lost 7 would have failed it

#### Scenario: The small-canon allowance is unchanged

- **WHEN** an era boundary is evaluated in a universe holding 51 nodes
- **THEN** the allowance is `ASCENSION_LOSS_MAX`, because the fraction of 51 rounds below it

#### Scenario: The allowance is integer arithmetic

- **WHEN** the loss allowance is computed for any node count
- **THEN** it is derived by fixed-point multiplication and flooring division, and no floating-point
  value enters the rules path

### Requirement: The two balance gates tune ascension and prestige

The balance harness SHALL enforce `ascensionRate` within 5–20% of terminated runs and
`prestigeAdvantage` strictly under 60%, per `docs/design/contracts.md` §7. Neither value may be
clamped, bounded, or otherwise enforced by the simulation itself — both MUST be measured outputs,
and each gate MUST name a single first knob and a retune order so that a failing sweep produces a
retune rather than a redesign.

The band alone is insufficient and MUST NOT be the only ascension gate. An aggregate inside 5–20% is
compatible with a single strategy ascending in every run, which was the state measured before this
change: `ascensionRate` 0.125 while `uniform-random-legal` ascended 10 of 10. The harness SHALL
therefore additionally assert, on the long-horizon sweep, that **the ascension rate correlates with
play**: `passive-control`'s per-strategy ascension rate is below the pool mean, and at least two
other strategies are above it, each separation exceeding the reported standard error.

`ASCENSION_CANON_BREADTH` and `ASCENSION_LOSS_FRACTION` are *shape* constants rather than rate knobs.
They SHALL be turned only in response to a failure of the correlation assertion, and MUST NOT be
turned as a first response to `ascensionRate` leaving its band — the authored rate order
(`ASCENSION_TIER_GATE`, then `ASCENSION_ERA_COUNT`, then `ASCENSION_DEPENDENCE_MAX`) is unchanged and
remains the answer to a band violation.

#### Scenario: The ascension band is asserted

- **WHEN** a ten-thousand-run sweep reports `ascensionRate` outside 5–20%
- **THEN** the sweep fails and names the metric and its value

#### Scenario: Ascension retuning follows a stated order

- **WHEN** `ascensionRate` leaves its band
- **THEN** `ASCENSION_TIER_GATE` is adjusted first, `ASCENSION_ERA_COUNT` second, and
  `ASCENSION_DEPENDENCE_MAX` third, one knob per sweep, because the two paths interact

#### Scenario: A dead path is caught even inside the band

- **WHEN** `ascensionRate` sits inside 5–20% but `ascensionRateByPath` shows one path accounting
  for more than 90% of ascensions
- **THEN** the sweep reports the imbalance, since an aggregate inside the band can conceal an
  unreachable path

#### Scenario: The passive control must not lead the pool

- **WHEN** the long-horizon sweep reports per-strategy ascension rates
- **THEN** the gate fails if `passive-control`'s rate is at or above the pool mean by more than the
  reported standard error

#### Scenario: Deliberate play must beat the control

- **WHEN** the long-horizon sweep reports per-strategy ascension rates
- **THEN** the gate fails unless at least two strategies other than `uniform-random-legal` exceed the
  pool mean by more than the reported standard error

#### Scenario: A shape failure names a shape knob

- **WHEN** the correlation assertion fails while `ascensionRate` is inside its band
- **THEN** the reported remedy is `ASCENSION_CANON_BREADTH` or `ASCENSION_LOSS_FRACTION`, and not a
  knob from the rate order

#### Scenario: The prestige ceiling is asserted

- **WHEN** a sweep of high-prestige universes against fresh ones reports `prestigeAdvantage` at or
  above 60%
- **THEN** the sweep fails, and `LEGACY_HEADSTART_FRACTION` is the single knob reduced in response

#### Scenario: A decorative meta-game also fails

- **WHEN** `prestigeAdvantage` measures at or below 52%
- **THEN** the sweep reports that the carry-over is doing nothing measurable, and
  `LEGACY_HEADSTART_FRACTION` may be raised while the ceiling still holds

#### Scenario: Nothing clamps the metrics

- **WHEN** the conformance check inspects the simulation for enforcement of either metric
- **THEN** it finds none, confirming both are measured rather than imposed
