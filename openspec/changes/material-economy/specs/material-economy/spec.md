## ADDED Requirements

### Requirement: Every form yields at least one material

Every form declared in content SHALL declare a non-zero `yieldWeights` entry for at least one
material kind. A form that yields nothing is a part of the grid that magic can act on and the
economy cannot see, and the loader MUST reject it rather than accept a silent zero. The material
kinds SHALL be `food`, `stone`, `vellum`, `labor`, `essence`, `insight` and `passage`, and a form
declaring a kind outside that set MUST fail the load.

#### Scenario: A form yielding nothing fails the load

- **WHEN** the content registry loads a form whose `yieldWeights` are zero for every kind
- **THEN** the loader throws, names the form, and no partially populated registry is returned

#### Scenario: The shipped opening square is economically live

- **WHEN** the shipped content loads
- **THEN** every form in the v1 opening square — `mentem`, `terram`, `limen`, `nomen` — declares a
  non-zero yield for at least one kind

#### Scenario: An unknown material kind fails the load

- **WHEN** a form declares a `yieldWeights` key that is not one of the seven kinds
- **THEN** the loader throws and names both the form and the unknown key

### Requirement: Material stocks are held per kind

The world state SHALL hold a separate stock per material kind. A universe carrying a world written
at an earlier schema revision SHALL read every kind absent from that revision as zero, and its
behaviour MUST be otherwise unchanged — an absent kind is not a shortage.

#### Scenario: An older world migrates without starving

- **WHEN** a world written at `WORLD_SCHEMA_VERSION` 6 is loaded at revision 7
- **THEN** `labor`, `essence`, `insight` and `passage` each read zero, and every metric the world
  produced before the migration is unchanged

#### Scenario: Casting raises the kind its form yields and no other

- **WHEN** a mage casts in a cell whose form yields `insight` alone
- **THEN** the `insight` stock rises and `food`, `stone`, `vellum`, `labor`, `essence` and
  `passage` are unchanged

### Requirement: Intervention costs may be denominated in materials

An action's declared cost SHALL be permitted to name a material cost beside its favor cost, and the
loader MUST accept a cost table in which some actions name one and others do not. An action whose material
cost cannot be paid SHALL be cleared from the legality mask, for the same reason an unaffordable
favor cost is cleared: a verb the god cannot pay for is not a legal choice, and submitting it would
inflate `illegalActionRate` with a fact about the treasury rather than about the policy.

#### Scenario: An unaffordable material cost masks the action

- **WHEN** the god holds less `passage` than `open portal` declares
- **THEN** `open portal` is cleared from the mask, and submitting it is refused as an illegal
  action rather than silently succeeding

#### Scenario: A material cost is deducted on success

- **WHEN** the god funds a university and the action succeeds
- **THEN** the declared `stone` and `labor` costs are deducted from their stocks in the same tick

#### Scenario: An action declaring an unknown kind fails the load

- **WHEN** the cost table declares a material cost naming a kind the schema does not know
- **THEN** the loader throws and names both the action and the unknown kind

### Requirement: Material flow is conserved and the conservation is asserted

Each tick SHALL record, per material kind, the total produced and the total consumed, and the
change in each stock MUST equal production minus consumption. A flow that would carry a stock past
a ceiling SHALL spill explicitly and record the spill, rather than truncating silently — a silent
truncation both breaks conservation and destroys the signal that would feed back to whatever is
overproducing.

#### Scenario: The ledger balances every tick

- **WHEN** a tick produces and consumes materials
- **THEN** for every kind, the stock delta equals the recorded production minus the recorded
  consumption

#### Scenario: A leaking flow fails the assertion

- **WHEN** a flow is deliberately introduced that consumes a stock without recording the
  consumption
- **THEN** the conservation assertion fails and names the kind and the tick

#### Scenario: A capped inflow spills rather than truncating

- **WHEN** production would carry a stock past its ceiling
- **THEN** the stock stops at the ceiling, the excess is recorded as a spill, and the ledger still
  balances

### Requirement: The player may observe each stock separately

The player-facing projection SHALL expose each material stock under its own name. The §4.1
observation vector SHALL NOT change: its `materials` channel keeps its documented meaning as the
sum of `food`, `stone` and `vellum`, and `OBSERVATION_LAYOUT_DIGEST` MUST NOT move, because a
resize invalidates every trained agent.

#### Scenario: The projection names every kind

- **WHEN** the world is projected to player state
- **THEN** each of the seven kinds is readable under its own name

#### Scenario: The observation vector does not move

- **WHEN** the projection gains the per-kind block
- **THEN** `OBSERVATION_LAYOUT_DIGEST` is unchanged and the `materials` channel still carries
  `food + stone + vellum`
