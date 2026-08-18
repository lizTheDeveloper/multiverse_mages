## ADDED Requirements

### Requirement: Ascension routes are authored content

The routes by which a universe may ascend SHALL be authored in a validated content file and MUST NOT
be enumerated in code. Each route record SHALL declare an `id`, a `terminalReason` integer, a
`playstyle` gloss naming the way of playing it exists to reward, a `conditionKind` drawn from a
closed enumeration implemented in code, the `god-constant` ids that parameterize that condition, a
`rateBudget`, and a `tuningStatus`. Adding or retiring a route MUST be a content edit and MUST NOT
change the size or the meaning of any action id.

#### Scenario: A route without a condition kind fails content validation

- **WHEN** a route record omits `conditionKind`
- **THEN** content validation fails naming the file path and the JSON pointer of the offending record

#### Scenario: An unimplemented condition kind fails content validation

- **WHEN** a route record declares a `conditionKind` outside the enumeration implemented in code
- **THEN** content validation fails and the permitted values are named

#### Scenario: A route naming an absent constant fails content validation

- **WHEN** a route record names a `god-constant` id that the loaded constants do not define
- **THEN** the loader throws and names both the route and the missing constant

#### Scenario: Adding a route does not change the action space

- **WHEN** a build authors one more route than the previous build
- **THEN** the action-space size, every action id, and every action's meaning are unchanged

### Requirement: Route identity and terminal reasons are append-only

A route's `terminalReason` SHALL be permanent once authored. The values `1` apotheosis, `2` canon,
`3` stagnation, and `4` truncated SHALL keep their meanings for all time, and a new route SHALL take
the next unused integer. No build may reuse, renumber, or reassign a terminal reason, because the
enumeration is serialized into every episode record, into the Python bridge's wire format, and into
committed golden fixtures.

#### Scenario: A reused terminal reason fails content validation

- **WHEN** two route records declare the same `terminalReason`
- **THEN** content validation fails naming both routes

#### Scenario: A route claiming a reserved terminal reason fails content validation

- **WHEN** a route record declares a `terminalReason` of `3` or `4`
- **THEN** content validation fails, naming the non-ascension outcome that value already means

#### Scenario: Retiring a route does not free its number

- **WHEN** a route is removed from content and a different route is later added
- **THEN** the new route takes an unused integer and never the retired route's

### Requirement: Qualification is a set, recomputed every world tick

The god state SHALL carry a bitmask of the routes whose conditions are satisfied, recomputed from
scratch on every world tick so that a qualification can lapse. Every authored route MUST be evaluated
on every world tick, and no route may be skipped because another route qualified. No evaluation order
may affect which routes appear in the bitmask.

#### Scenario: Two routes qualify simultaneously

- **WHEN** a universe satisfies both the apotheosis condition and the enduring-canon condition on the
  same world tick
- **THEN** both routes' bits are set in the qualified mask, and neither suppresses the other

#### Scenario: A qualification lapses

- **WHEN** a universe qualifies for a route on one tick and the route's condition ceases to hold on
  the next
- **THEN** that route's bit is cleared, and the legality of declaring ascension follows it down

#### Scenario: The minimum tick gates qualification

- **WHEN** a universe satisfies a route's condition before `ascension-min-tick`
- **THEN** no bit is set in the qualified mask, and the first-met tick is not recorded

#### Scenario: The first-met tick spans all routes

- **WHEN** a universe qualifies for its first route at world tick 700 and for a second at tick 900
- **THEN** the recorded first-met tick is 700 and is not rewritten at 900

### Requirement: The god declares which summit it claims

Declaring ascension SHALL take a parameter naming the route being claimed, drawn from the candidate
list of currently qualifying routes in authored order. The engine MUST NOT choose a route on the
god's behalf when more than one qualifies. The declared route SHALL be recorded on the god state and
SHALL determine the run's terminal reason.

#### Scenario: The declared route decides the terminal reason

- **WHEN** a universe qualifying for both apotheosis and enduring canon declares ascension naming
  enduring canon
- **THEN** the run terminates with enduring canon's terminal reason, and the recorded declared route
  is enduring canon

#### Scenario: An unqualified route cannot be declared

- **WHEN** an agent submits a declaration naming a route whose bit is not set in the qualified mask
- **THEN** the action is treated as illegal, the state is unchanged, and the illegal-action counter
  increments

#### Scenario: An unparameterized declaration resolves to the first qualifying route

- **WHEN** an agent submits a declaration with no parameter while two routes qualify
- **THEN** the route earliest in authored order is declared

#### Scenario: The candidate list carries only qualifying routes

- **WHEN** an observation is taken from a universe qualifying for exactly one route
- **THEN** the declaration action's candidate list has exactly one entry, and the action's mask entry
  is set

#### Scenario: No qualifying route masks the action

- **WHEN** an observation is taken from a universe whose qualified mask is empty
- **THEN** the declaration action's mask entry is clear and its candidate list is empty

### Requirement: The number of simultaneously live routes is bounded by a pinned constant

The candidate-slot count for the declaration action SHALL be a pinned structural constant in the
sense of `docs/design/contracts.md` §4.4, and the content loader SHALL refuse a content set that
authors more routes than there are slots. Raising the constant is a contract change and MUST NOT be
treated as a tuning knob.

#### Scenario: Too many routes fail the load

- **WHEN** content authors more ascension routes than the pinned slot count
- **THEN** the loader throws, naming the slot count and the number of routes authored

#### Scenario: The legacy routes hold the first two slots

- **WHEN** the content set is loaded
- **THEN** apotheosis is the first authored route and enduring canon is the second, so that an
  unparameterized declaration reproduces the pre-existing behaviour

### Requirement: Route conditions are drawn from a closed vocabulary of condition kinds

Each route's condition SHALL be one of a closed set of condition kinds implemented once each in the
rules path, parameterized entirely by named content constants. A route MUST NOT introduce a bespoke
predicate. Every condition kind MUST be computed in fixed-point integer arithmetic with no
floating-point operation, no wall-clock read, and no unseeded randomness, and every condition kind
expressed over a consecutive run SHALL reset its counter to zero on the first tick its condition does
not hold.

#### Scenario: A sustained condition resets on lapse

- **WHEN** a universe satisfies a sustained condition for part of its required duration and then
  ceases to satisfy it for one world tick
- **THEN** the counter is zero on the next tick, and the required duration is measured afresh

#### Scenario: Conditions are deterministic

- **WHEN** the same seed and the same action log are replayed
- **THEN** the qualified mask is identical at every world tick

#### Scenario: A route's thresholds come from content

- **WHEN** a route's named constants are changed in content and the build is re-run
- **THEN** the route's behaviour changes with no code edit, and no threshold is duplicated in code

### Requirement: A route exists for depth, for custodianship, for breadth, for devotion, and for constraint

The shipped content set SHALL author one route per playstyle the scripted strategy pool is written to
probe, excluding the passive control and the noise floor, for which a reachable summit would defeat
their purpose. Each route's condition MUST be one that unattended play fails.

#### Scenario: Passive play qualifies for no route

- **WHEN** a universe is run to the sweep horizon with no god intervention
- **THEN** its qualified mask is empty at every world tick

#### Scenario: Breadth has a summit

- **WHEN** a universe holds at least the authored number of permitted cells, each carrying at least
  the authored number of known nodes with at least two live instances, continuously for the authored
  duration
- **THEN** the breadth route qualifies

#### Scenario: A wide but fragile universe does not qualify for breadth

- **WHEN** a universe permits every cell and knows nodes in all of them, but the nodes in most cells
  have exactly one instance each
- **THEN** the breadth route does not qualify

#### Scenario: Devotion is measured by recovery, not by magnitude

- **WHEN** a universe holds the highest worship tier continuously and is never shocked
- **THEN** the devotion route does not qualify, however long the run continues

#### Scenario: Devotion qualifies on repeated recovery

- **WHEN** a universe's worship is shocked at or below the authored floor and returns to at least the
  authored tier within the authored recovery window, on the authored number of non-overlapping
  occasions
- **THEN** the devotion route qualifies

#### Scenario: Constraint requires a living universe

- **WHEN** a universe permits no more than the authored number of cells but its worship, living mage
  count, or populace falls below the authored floors at any evaluated era boundary
- **THEN** the constraint route does not qualify, and its run of qualifying boundaries resets

#### Scenario: Breadth and constraint are mutually exclusive

- **WHEN** the content set is loaded
- **THEN** the constraint route's maximum permitted-cell count is strictly below the breadth route's
  minimum, so no universe can satisfy both

### Requirement: Route payouts are equal and route prices are equal

Every route SHALL earn the same ascension base in the prestige calculation, and declaring ascension
SHALL cost the same regardless of which route is named. Prestige MUST NOT gain a per-route term.
Differentiation between routes belongs to their conditions and to the achievement terms that already
vary with how a run was played.

#### Scenario: Two routes earn the same base

- **WHEN** two otherwise identical runs ascend by different routes with identical deepest tier, eras
  survived, and peak worship tier
- **THEN** the prestige earned is identical

#### Scenario: Declaration is priced identically

- **WHEN** a universe qualifies for two routes
- **THEN** the cost of declaring is the same for both, and affordability masks neither in preference
  to the other

#### Scenario: Prestige still cannot compound without bound

- **WHEN** an unbroken streak of ascensions by any mixture of routes is simulated
- **THEN** carried prestige approaches its cap and never exceeds it, exactly as it does for a single
  route

### Requirement: Ascension is reported per route

A Monte Carlo sweep SHALL report `ascensionRateByPath`, keyed by route content id, as the fraction of
eligible runs terminating on each route's terminal reason — over the same denominator
`ascensionRate` uses, with failed runs excluded from both numerator and denominator and reported
separately. Each route's **share** SHALL be derived as its rate divided by the aggregate
`ascensionRate`, and is defined only when the aggregate is above zero. The metric MUST be present in
every sweep's output, reporting an unavailable status with a reason when it cannot be computed.

#### Scenario: Routes are reported separately

- **WHEN** a sweep completes in which runs ascended by two different routes
- **THEN** `ascensionRateByPath` carries a non-zero entry for each, and their rates sum to the
  aggregate `ascensionRate`

#### Scenario: No ascensions leaves shares undefined

- **WHEN** a sweep completes with no ascensions
- **THEN** every route's rate is zero, shares are reported unavailable with a reason, and the sweep
  does not divide by zero

#### Scenario: The metric names routes by content id

- **WHEN** a route is renamed in content
- **THEN** the metric key changes with it, and no numeric terminal reason appears as a key

### Requirement: A dominant route or a dead route fails the sweep

A sweep SHALL fail when any route's share of ascensions exceeds 60%, and SHALL fail when any authored
route records zero ascensions in a sweep large enough that the route's authored rate budget predicts
at least eight. A sweep too small for that test MUST report the dead-route check as unavailable rather
than as passing. The content loader SHALL refuse a content set whose route rate budgets do not sum
inside the declared ascension band, or in which any single budget exceeds 60% of that sum.

#### Scenario: A dominant route fails the sweep

- **WHEN** a sweep reports one route accounting for more than 60% of ascensions
- **THEN** the sweep fails, naming the route and its share

#### Scenario: A dead route fails an adequately powered sweep

- **WHEN** a sweep of `n` runs reports zero ascensions for a route whose authored rate budget times
  `n` is at least eight
- **THEN** the sweep fails, naming the route

#### Scenario: An underpowered sweep does not pass the dead-route check

- **WHEN** a sweep of `n` runs reports zero ascensions for a route whose authored rate budget times
  `n` is below eight
- **THEN** the dead-route check reports unavailable with a reason naming the run count it would need,
  and does not report a pass

#### Scenario: Rate budgets outside the band fail the load

- **WHEN** the authored rate budgets sum outside the declared ascension band
- **THEN** the loader throws, naming the sum and the band

#### Scenario: A budget above the concentration ceiling fails the load

- **WHEN** one route's authored rate budget exceeds 60% of the sum of all budgets
- **THEN** the loader throws, naming the route, because a content set that could not satisfy the
  concentration assertion should fail before a sweep is spent discovering it

### Requirement: The scripted pool's route choices are cross-tabulated

The round-robin tournament report SHALL carry, per strategy, the count of its ascensions by route, so
that whether distinct strategies win by distinct routes is readable without a second sweep. This
cross-tabulation is a property of a scripted pool and SHALL NOT be added to the balance metric
registry.

#### Scenario: The cross-tab is reported

- **WHEN** a round-robin tournament completes
- **THEN** each strategy's record carries its ascension count per route, summing to its total
  ascensions

#### Scenario: A strategy with no modal route is visible

- **WHEN** a strategy's ascensions are split evenly across two routes
- **THEN** the report shows the split rather than a single route, and does not break ties

#### Scenario: The cross-tab is absent from the metric registry

- **WHEN** the balance metric registry is enumerated
- **THEN** no key corresponds to the strategy-by-route cross-tabulation

### Requirement: Every consumer of the terminal reason knows every ascension route

Any consumer that distinguishes ascension from other endings SHALL derive the set of ascension
terminal reasons from a single declared source rather than enumerating members inline, and a test
SHALL assert that the Python bridge's set and the TypeScript enumeration agree. A route whose terminal
reason is unknown to a reward function scores as a non-ascension, which is a silent training defect
rather than an error, and this requirement exists to make that impossible.

#### Scenario: A new route scores as an ascension

- **WHEN** an episode terminates on a newly added route's terminal reason and the sparse terminal
  reward is applied
- **THEN** the reward is the ascension reward, not zero

#### Scenario: The two languages agree

- **WHEN** the contract test compares the Python bridge's ascension terminal reasons with the
  TypeScript enumeration's
- **THEN** the sets are equal, and the test fails naming any member present in one and not the other
