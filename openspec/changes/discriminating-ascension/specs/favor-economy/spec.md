## MODIFIED Requirements

### Requirement: Intervention costs are declared as validated content

The cost of every action in the §4.2 action space SHALL be declared in a validated content file
rather than in code, and the loader MUST reject a cost table that omits any action or that declares
a negative cost. Costs SHALL be expressed in `fp` and MUST be treated as untuned placeholders
awaiting the balance harness. Action 0 SHALL cost zero, because a no-op is what an illegal
submission is replaced by and a price there would charge an agent for its own mistakes.

#### Scenario: Every action has a declared cost

- **WHEN** the content registry loads
- **THEN** the cost table contains exactly one entry per action ID in `contracts.md` §4.2, and
  action 0 declares a cost of zero

#### Scenario: A missing cost entry fails the load

- **WHEN** the cost table omits the entry for `change tradition`
- **THEN** the loader throws, names the missing action ID, and no partially populated registry is
  returned

#### Scenario: Permitting and forbidding cost the same

- **WHEN** the cost table is loaded
- **THEN** the cost of permitting a technique equals the cost of forbidding a technique, and the
  same equality holds for forms

#### Scenario: Founding knowledge scales with node tier

- **WHEN** the cost of granting founding knowledge is computed for a tier-1 node and a tier-4 node
- **THEN** the tier-4 cost is four times the tier-1 cost

#### Scenario: The ending carries a price

- **WHEN** the cost table is loaded
- **THEN** action 15 declares a strictly positive cost, and the loader fails if it is zero

## ADDED Requirements

### Requirement: Declaring ascension is priced, and the price can never strand a qualifying universe

Action 15 SHALL cost `DECLARE_ASCENSION_COST` favor, deducted like any other intervention's cost and
subject to the same affordability masking, so that stopping trades against the other uses of the
pool. The cost MUST be at or below `FAVOR_CAP_BASE` — the pool's ceiling at worship tier 0 — and the
content loader MUST assert that relationship and fail the load if a retune breaks it, so that a
universe which qualifies for ascension can always eventually afford to declare it regardless of its
worship tier. `DECLARE_ASCENSION_COST = fp(20480)` is an untuned placeholder; the relationship
between it and `FAVOR_CAP_BASE` is not.

The price MUST NOT be presented or tuned as the mechanism that makes ascension discriminating. A
universe that never spends sits at its favor cap — measured, a passive run discards fp 9,530,689 of
regeneration over 2400 world ticks — so a favor price is cheapest for exactly the strategy that
plays least. What it buys is a gradient on the terminal reward: an opportunity cost measured in
blessings and universities forgone, and a delay measured in ticks of banked regeneration.

#### Scenario: The declaration is deducted

- **WHEN** a qualifying universe holding fp 61,440 declares ascension
- **THEN** the run terminates as ascended and the favor ledger records `DECLARE_ASCENSION_COST`
  spent on action 15, balancing like any other tick

#### Scenario: An unaffordable declaration is masked, not failed

- **WHEN** a universe satisfies an ascension path while holding less favor than
  `DECLARE_ASCENSION_COST`
- **THEN** action 15's mask entry is false, the universe keeps simulating, and the entry becomes true
  once the pool has regenerated to the cost

#### Scenario: The price cannot exceed the tier-0 pool

- **WHEN** the content loader validates the cost table against the god constants
- **THEN** it asserts `DECLARE_ASCENSION_COST <= FAVOR_CAP_BASE` and fails naming both values if the
  relationship does not hold

#### Scenario: A spent god can still stop

- **WHEN** a god at worship tier 0 empties its pool and then satisfies an ascension path
- **THEN** the pool regenerates to `DECLARE_ASCENSION_COST` within a bounded number of world ticks
  and the declaration becomes legal, so the price is a delay and never a lockout

#### Scenario: Declining to declare is still free

- **WHEN** a qualifying universe submits a no-op for 100 world ticks
- **THEN** no favor is deducted for the eligibility itself, and the run continues unascended
