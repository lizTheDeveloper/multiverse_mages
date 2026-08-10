## ADDED Requirements

### Requirement: Favor is the sole currency of intervention

Every action in `docs/design/contracts.md` §4.2 other than the no-op SHALL consume favor from the
universe's single favor pool, and the god MUST have no other spendable resource. Favor MUST be
deducted at the moment the action resolves, before its effect is applied, and an action MUST NOT
resolve partially when favor is insufficient.

#### Scenario: Cost is deducted on resolution

- **WHEN** the god resolves an intervention costing `fp(2048)` with a pool of `fp(10240)`
- **THEN** the pool holds `fp(8192)` and the intervention's effect is applied

#### Scenario: No second currency exists

- **WHEN** the state schema conformance check inspects the universe singleton
- **THEN** no spendable god-side resource other than `favor` is present, and `materials` is
  confirmed to be a civilization resource that no intervention debits

#### Scenario: Effects never outrun payment

- **WHEN** an intervention's effect application fails after favor has been deducted
- **THEN** the whole action is rolled back within the tick, leaving both the pool and the effect
  unchanged, and an error counter increments

### Requirement: Favor regenerates each world tick as a function of worship

The favor pool SHALL gain `FAVOR_REGEN_BASE + worship × FAVOR_PER_WORSHIP / fp(1024)` at each world
tick, multiplied by the stacked `worship-yield` multiplier obtained from the shared primitive
arithmetic. Regeneration MUST NOT occur during engagement ticks. `FAVOR_REGEN_BASE = fp(1024)` and
`FAVOR_PER_WORSHIP = fp(512)` are untuned placeholders awaiting the balance harness.

#### Scenario: Regeneration scales with worship

- **WHEN** one universe at `worship = 0` and another at `worship = fp(9216)` are each advanced one
  world tick with no `worship-yield` sources
- **THEN** the first gains `fp(1024)` and the second gains `fp(5632)`

#### Scenario: A worshipless universe still regenerates

- **WHEN** a universe with no living mages, no universities, and no populace is advanced one world
  tick
- **THEN** the favor pool increases by `FAVOR_REGEN_BASE`, and the regeneration floor is never zero

#### Scenario: worship-yield uses the shared stacking channel

- **WHEN** two `worship-yield` sources of `fp(300)` and `fp(400)` apply
- **THEN** regeneration is multiplied by `fp(1724)` through the shared `(1 + Σ)` arithmetic, not by
  the product of two independent multipliers

#### Scenario: worship-yield is capped by the primitive registry

- **WHEN** `worship-yield` sources stack above the registry cap of `fp(2048)`
- **THEN** the effective multiplier is `fp(2048)` and the clamp counter for `worship-yield`
  increments

#### Scenario: No regeneration during a raid

- **WHEN** the clock is in engagement mode and the simulation is stepped repeatedly
- **THEN** the favor pool is unchanged at every engagement tick

### Requirement: The favor pool is capped and overflow is discarded

The favor pool MUST NOT exceed `favorCap = FAVOR_CAP_BASE + worshipTier × FAVOR_CAP_PER_TIER`.
Regeneration that would exceed the cap SHALL be discarded rather than banked, and the discarded
amount SHALL accumulate into a `favorWasted` counter reported to the balance harness.
`FAVOR_CAP_BASE = fp(20480)` and `FAVOR_CAP_PER_TIER = fp(10240)` are untuned placeholders.

#### Scenario: Overflow is lost and counted

- **WHEN** a universe at worship tier 0 holds `fp(20000)` favor and regenerates `fp(1024)`
- **THEN** the pool holds `fp(20480)` and `favorWasted` increases by `fp(544)`

#### Scenario: Cap rises with worship tier

- **WHEN** a universe crosses from worship tier 2 to worship tier 3
- **THEN** `favorCap` increases by `FAVOR_CAP_PER_TIER` within the same world tick

#### Scenario: A tier loss does not destroy banked favor

- **WHEN** a universe holding favor at its tier-3 cap falls to worship tier 2
- **THEN** the held favor is not truncated to the lower cap, and no further regeneration accrues
  until the pool falls below the new cap

#### Scenario: worship-yield does not raise the cap

- **WHEN** `worship-yield` sources stack to the registry cap
- **THEN** `favorCap` is unchanged and only the rate of approach to it increases

### Requirement: Intervention costs are declared as validated content

The cost of every action in the §4.2 action space SHALL be declared in a validated content file
rather than in code, and the loader MUST reject a cost table that omits any action or that declares
a negative cost. Costs SHALL be expressed in `fp` and MUST be treated as untuned placeholders
awaiting the balance harness.

#### Scenario: Every action has a declared cost

- **WHEN** the content registry loads
- **THEN** the cost table contains exactly one entry per action ID in `contracts.md` §4.2, and
  actions 0 and 15 declare a cost of zero

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

### Requirement: Unaffordable interventions are masked, never failed

An action whose cost exceeds the current favor pool MUST have its legality mask entry set false.
An agent submitting a masked action SHALL receive a no-op and an illegal-action counter increment,
per `contracts.md` §4.2, and MUST NOT receive an exception, a partial effect, or a negative pool.

#### Scenario: Affordability drives the mask

- **WHEN** a universe holds `fp(3000)` favor and the cost of forbidding a form is `fp(4096)`
- **THEN** that action's mask entry is false, and it becomes true once the pool reaches `fp(4096)`

#### Scenario: A submitted unaffordable action is inert

- **WHEN** an agent submits an unaffordable grant of founding knowledge
- **THEN** the favor pool, the knowledge instances, and every other component are unchanged, and
  `illegalActionRate` reflects the rejection

#### Scenario: The pool never goes negative

- **WHEN** a Monte Carlo sweep of ten thousand runs completes
- **THEN** no run recorded a favor pool below zero at any tick

### Requirement: Repeated changes to the same ruleset axis escalate in cost

Each of the five technique axes and fourteen form axes SHALL carry a recent-change counter,
incremented when that axis is permitted or forbidden and decremented by one every
`HYSTERESIS_DECAY_TICKS` world ticks to a floor of zero. The cost of changing an axis MUST be
multiplied by `fp(1024) + counter × HYSTERESIS_STEP`. `HYSTERESIS_DECAY_TICKS = 60` and
`HYSTERESIS_STEP = fp(1024)` are untuned placeholders.

#### Scenario: The second flip costs double

- **WHEN** a technique is forbidden and then permitted again within 60 world ticks
- **THEN** the second change costs twice the base cost

#### Scenario: Escalation decays

- **WHEN** an axis is toggled once and then left alone for 60 world ticks
- **THEN** its counter returns to zero and the next change costs the base price

#### Scenario: Escalation is per axis, not global

- **WHEN** one technique is toggled three times and a different technique is then toggled once
- **THEN** the second technique's change costs the base price

#### Scenario: Escalation is visible in the observation

- **WHEN** an observation is taken after an axis has been toggled twice
- **THEN** the affordability mask reflects the escalated cost rather than the base cost

### Requirement: The favor ledger is auditable each world tick

The simulation SHALL record, per world tick, the favor regenerated, the favor discarded to the
cap, and the favor spent per action ID. The ledger MUST be derivable from state and actions alone
so that a replay reproduces it exactly, and it MUST NOT be stored in world snapshots.

#### Scenario: The ledger balances

- **WHEN** any world tick completes
- **THEN** the closing pool equals the opening pool plus regeneration, minus discard, minus the sum
  of spends recorded for that tick

#### Scenario: The ledger is reproducible

- **WHEN** the same seed and action log are replayed
- **THEN** the per-tick ledger is identical, entry for entry

#### Scenario: The ledger is not snapshot state

- **WHEN** a world snapshot is taken and restored
- **THEN** the restored state's snapshot hash is unaffected by any ledger content
