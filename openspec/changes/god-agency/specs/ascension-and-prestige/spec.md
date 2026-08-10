## ADDED Requirements

### Requirement: Ascension is declared, never automatic

Satisfying an ascension condition SHALL set action 15's legality mask entry to true and MUST NOT
end the run by itself. The god MUST declare ascension for the run to terminate, and a universe that
meets the condition and declines to declare MUST continue simulating normally, with the mask entry
remaining true for as long as the condition holds.

#### Scenario: Meeting the condition unmasks the action

- **WHEN** a universe first satisfies an ascension path at world scale
- **THEN** action 15's mask entry becomes true in the observation for that tick

#### Scenario: The run continues undeclared

- **WHEN** a universe satisfies an ascension path and the god submits a no-op for 100 world ticks
- **THEN** the universe keeps simulating, `ascended` remains false, and no terminal outcome is
  recorded

#### Scenario: The condition can lapse

- **WHEN** a universe satisfying the Apotheosis path loses the qualifying mage before declaring
- **THEN** action 15's mask entry returns to false

#### Scenario: The declaration delay is reported

- **WHEN** a Monte Carlo run ends in ascension
- **THEN** the harness reports both the tick the condition was first met and the tick of
  declaration

### Requirement: Ascension has two disjoint qualifying paths

A universe SHALL qualify for ascension by satisfying either path below, and MUST NOT be able to
declare before `ASCENSION_MIN_TICK`. Path A's depth requirement MUST be expressed relative to the
loaded content graph rather than as a literal node tier, so that the condition stays reachable as
content changes.

**Path A — Apotheosis of Mastery.** A living mage holds a node that is the deepest node present in
its cell's content graph; `permits` returns true for that cell; at least two instances of that node
survive anywhere in the universe; and `worshipTier` is at least `ASCENSION_TIER_GATE`.

**Path B — Enduring Canon.** The universe has reached era `ASCENSION_ERA_COUNT`; at every era
boundary since era 1, `libraryDependence` was at or below `ASCENSION_DEPENDENCE_MAX`; and no more
than `ASCENSION_LOSS_MAX` nodes left the universe during any of those eras.

`ASCENSION_MIN_TICK = 600`, `ASCENSION_TIER_GATE = 4`, `ASCENSION_ERA_COUNT = 4`,
`ASCENSION_DEPENDENCE_MAX = fp(256)` (25%), and `ASCENSION_LOSS_MAX = 2` are untuned placeholders
awaiting the balance harness.

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

### Requirement: Era advancement is defined so the Enduring Canon path is evaluable

The `era` field declared in `docs/design/contracts.md` §1.1 SHALL advance on a defined schedule, and
this change MUST define one because Path B is evaluated over era boundaries and nothing else in the
project advances the field. An era boundary every `ERA_TICKS = 240` world ticks is an untuned
placeholder, and ownership of this rule properly belongs to the world-rules layer; if it moves
there, Path B MUST consume it unchanged.

#### Scenario: Eras advance on schedule

- **WHEN** a universe reaches world tick 240
- **THEN** `era` increments and an era-boundary evaluation of `libraryDependence` and node losses
  is recorded

#### Scenario: Boundary evaluations are retained

- **WHEN** a universe reaches era 4
- **THEN** the evaluations from every prior era boundary are available to Path B without
  recomputing history

#### Scenario: Era is part of state

- **WHEN** a universe in era 3 is snapshotted and restored
- **THEN** the restored universe is in era 3 with its era-boundary evaluations intact

### Requirement: Ascension is terminal and freezes the universe

Declaring ascension SHALL set `ascended` to true, record the terminal outcome and the declaring
tick, and MUST end the run. After ascension, every action's mask entry other than the no-op MUST be
false, and no world tick may further alter the universe's state.

#### Scenario: The flag is set and the run ends

- **WHEN** action 15 resolves
- **THEN** `ascended` is true, the terminal outcome `ascended` is recorded with its tick, and the
  harness stops advancing the run

#### Scenario: Nothing acts after ascension

- **WHEN** an ascended universe is stepped
- **THEN** the snapshot hash is unchanged and every mask entry except the no-op is false

#### Scenario: Ascension is scored as a binary and a duration

- **WHEN** a run ends in ascension
- **THEN** the harness records the binary outcome and the world tick count, which are the two
  quantities Monte Carlo scores runs on

### Requirement: Stagnation and cutoff are the defined non-ascension endings

Every run SHALL terminate with exactly one recorded outcome from `ascended`, `stagnated`, or
`cutoff`, so that `ascensionRate` has a defined denominator. A run MUST terminate as `stagnated`
when any of the following holds: no living mage for `STAGNATION_MAGELESS_TICKS` consecutive world
ticks; worship below `STAGNATION_WORSHIP_FLOOR` for `STAGNATION_WORSHIP_TICKS` consecutive world
ticks; or no node newly entering the universe by any route for `STAGNATION_STASIS_TICKS`
consecutive world ticks. A run reaching `MC_MAX_TICKS` without terminating MUST end as `cutoff`.
`STAGNATION_MAGELESS_TICKS = 60`, `STAGNATION_WORSHIP_FLOOR = fp(128)`,
`STAGNATION_WORSHIP_TICKS = 240`, `STAGNATION_STASIS_TICKS = 480`, and `MC_MAX_TICKS = 2400` are
untuned placeholders.

#### Scenario: A dead civilization stagnates

- **WHEN** a universe's last mage dies and 60 world ticks pass with no new mage
- **THEN** the run terminates as `stagnated` and the harness stops advancing it

#### Scenario: A living but frozen civilization stagnates

- **WHEN** a universe keeps its mages and populace but acquires no new node for 480 consecutive
  world ticks
- **THEN** the run terminates as `stagnated`

#### Scenario: Defeat is not the opposite of ascension

- **WHEN** a run terminates as `stagnated`
- **THEN** it is recorded as its own ending with its own prestige award, and is not recorded as a
  loss against any opponent

#### Scenario: Every run terminates

- **WHEN** a ten-thousand-run sweep completes
- **THEN** every run carries exactly one terminal outcome and none is still running

#### Scenario: The denominator is explicit

- **WHEN** `ascensionRate` is reported
- **THEN** it is the count of `ascended` runs divided by the count of all terminated runs, and the
  three outcome counts are reported alongside it

### Requirement: Terminal-outcome scoring defines a win before raids exist

The harness SHALL provide a terminal score that orders two runs of the same seed and initial
conditions, because `docs/design/release-plan.md`'s 0.6.0 claim requires a win rate and universes
cannot fight until 0.7.0. The ordering MUST be lexicographic: `ascended` outranks any other
outcome; an earlier ascension tick outranks a later one; among non-ascended runs the higher
`prestigeEarned` wins; exact ties MUST score half to each side. This definition MUST be marked
provisional and superseded by head-to-head raid outcomes when `raid-engagement` lands.

#### Scenario: Ascension beats non-ascension

- **WHEN** two strategies run the same seed and one ascends while the other is cut off
- **THEN** the ascending strategy wins the pairing

#### Scenario: Speed breaks a tie between ascensions

- **WHEN** both strategies ascend on the same seed at different ticks
- **THEN** the earlier ascension wins

#### Scenario: Prestige breaks a tie between non-ascensions

- **WHEN** neither strategy ascends
- **THEN** the higher `prestigeEarned` wins, and identical values score half each

#### Scenario: The pool claim is runnable

- **WHEN** a round-robin sweep of the scripted god strategies completes
- **THEN** a win rate is reported for every strategy against the pool, and the sweep fails if any
  strategy exceeds 65%

### Requirement: Prestige is earned at run end from bounded achievement

`prestigeEarned` SHALL be computed once, at run termination, from the terminal outcome plus
saturating achievement terms, and MUST be clamped to `PRESTIGE_EARN_MAX`. Every terminal outcome
MUST award a non-zero amount, so that a losing streak cannot spiral toward zero. `contracts.md`
§1.1's `prestige` field MUST remain read-only during the run; `prestigeEarned` is written at
termination and applied to the *next* universe's initial state, never to the terminating one.
Bases of `fp(1024)` for `ascended`, `fp(256)` for `cutoff`, and `fp(128)` for `stagnated`, terms of
`fp(96)` per deepest tier reached, `fp(64)` per era survived, and `fp(128)` per peak worship tier,
and `PRESTIGE_EARN_MAX = fp(2048)`, are untuned placeholders.

#### Scenario: Earning is capped

- **WHEN** a run's achievement terms sum above `PRESTIGE_EARN_MAX`
- **THEN** `prestigeEarned` is `PRESTIGE_EARN_MAX`

#### Scenario: A ruined run still earns

- **WHEN** a run terminates as `stagnated` having reached only tier 1 and era 1
- **THEN** `prestigeEarned` is strictly greater than zero

#### Scenario: Prestige is not mutated in-run

- **WHEN** a run advances from tick 0 to termination
- **THEN** the universe's `prestige` field holds the same value at every tick

#### Scenario: Earning is deterministic

- **WHEN** the same seed and action log are replayed
- **THEN** `prestigeEarned` is identical

### Requirement: Prestige accumulates through a convergent recurrence with a finite limit

Prestige carried between runs SHALL follow
`prestige' = min(PRESTIGE_CAP, prestige × PRESTIGE_RETENTION / fp(1024) + prestigeEarned)`, and
`PRESTIGE_CAP` MUST equal the analytic limit of that recurrence at maximum earning —
`PRESTIGE_EARN_MAX / (1 − PRESTIGE_RETENTION)` — so that the bound is a property of the arithmetic
rather than an arbitrary clamp. `PRESTIGE_RETENTION = fp(768)` and the implied
`PRESTIGE_CAP = fp(8192)` are untuned placeholders, but the relationship between them is not.

#### Scenario: An endless winning streak converges

- **WHEN** a player earns `PRESTIGE_EARN_MAX` for one hundred consecutive runs
- **THEN** carried prestige approaches `fp(8192)` and never exceeds it

#### Scenario: The tenth win is worth far less than the third

- **WHEN** carried prestige after three maximal runs is compared with carried prestige after ten
- **THEN** the difference is a small fraction of the difference between the first and third

#### Scenario: The cap matches the recurrence

- **WHEN** the constants check runs in CI
- **THEN** it asserts `PRESTIGE_CAP × (fp(1024) − PRESTIGE_RETENTION) == PRESTIGE_EARN_MAX ×
  fp(1024)` and fails if a retune breaks the relationship

#### Scenario: Retention erodes an idle legacy

- **WHEN** a player follows a maximal run with several minimal ones
- **THEN** carried prestige decays toward the level those minimal runs support

### Requirement: Prestige grants stocks and never rates

Carried prestige SHALL be spent exclusively on depreciating stocks — starting favor, starting
materials, starting populace, and a seeded archive of at most `LEGACY_ARCHIVE_NODES` knowledge
instances placed in a library — and MUST NOT modify favor regeneration, any worship formula
constant, `edictBudget`, any effect-primitive magnitude or cap, any species trait, or any ascension
constant. The legacy budget SHALL be `sat(prestige, LEGACY_CAP, LEGACY_HALF)`, and each channel's
grant SHALL be that budget's fraction of `LEGACY_HEADSTART_FRACTION` times the median unaided
universe's value for that channel at `LEGACY_REFERENCE_TICK`. `LEGACY_CAP = fp(1024)`,
`LEGACY_HALF = fp(2048)`, `LEGACY_ARCHIVE_NODES = 3` at tier 3 or below,
`LEGACY_HEADSTART_FRACTION = fp(256)`, and `LEGACY_REFERENCE_TICK = 120` are untuned placeholders.

#### Scenario: No rate is granted

- **WHEN** a universe is seeded from maximum prestige and its favor regeneration, worship
  constants, edict budget, primitive caps, and species traits are compared with a fresh universe's
- **THEN** every one of them is identical

#### Scenario: The seeded archive is attackable

- **WHEN** a universe is seeded with legacy knowledge instances
- **THEN** those instances sit in a library where they are lootable and burnable exactly like any
  other instance, with no protective flag

#### Scenario: Conversion is concave

- **WHEN** the legacy budget at half of `PRESTIGE_CAP` is compared with the budget at
  `PRESTIGE_CAP`
- **THEN** the half-prestige budget is more than two thirds of the maximum attainable budget

#### Scenario: The head start is bounded relative to unaided play

- **WHEN** a maximally prestiged universe is created
- **THEN** each seeded channel is at or below `LEGACY_HEADSTART_FRACTION` of the median unaided
  universe's value for that channel at world tick 120

#### Scenario: An unbounded grant is rejected

- **WHEN** legacy content declares a channel with no cap or a channel outside the four permitted
  stock channels
- **THEN** the loader fails and names the offending channel

### Requirement: The head start decays within the run

Every legacy grant MUST be subject to the ordinary decay of the stock it seeds — favor is spent,
materials are consumed, populace ages and dies, archived instances can be lost, stolen, or burned —
and no legacy grant may be replenished during the run. The advantage a prestiged universe holds
SHALL therefore shrink with run length rather than grow with it.

#### Scenario: Legacy favor is one-time

- **WHEN** a prestiged universe spends its starting favor
- **THEN** it regenerates at exactly the rate its worship supports, with no legacy contribution

#### Scenario: Legacy populace is mortal

- **WHEN** a seeded populace cohort passes its species lifespan
- **THEN** it dies like any other cohort and is not replaced by the legacy system

#### Scenario: The advantage narrows

- **WHEN** the state gap between a maximally prestiged universe and a fresh one is measured at
  world ticks 60, 600, and 2400 on identical seeds
- **THEN** the gap is largest at tick 60 and smallest at tick 2400

#### Scenario: Losing the archive removes the advantage

- **WHEN** a prestiged universe's seeded library is burned
- **THEN** its remaining legacy advantage is only the residue of the consumable stocks, and no
  hidden legacy bonus persists

### Requirement: The two balance gates tune ascension and prestige

The balance harness SHALL enforce `ascensionRate` within 5–20% of terminated runs and
`prestigeAdvantage` strictly under 60%, per `docs/design/contracts.md` §7. Neither value may be
clamped, bounded, or otherwise enforced by the simulation itself — both MUST be measured outputs,
and each gate MUST name a single first knob and a retune order so that a failing sweep produces a
retune rather than a redesign.

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
