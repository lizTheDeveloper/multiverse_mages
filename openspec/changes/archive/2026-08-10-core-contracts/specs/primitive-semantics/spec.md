## ADDED Requirements

### Requirement: Effect primitive registry

The project SHALL publish a registry of effect primitives, each declaring its unit, its scale
(world, engagement, or both), its stacking rule, and its cap, matching `docs/design/contracts.md`
§3. The registry MUST be the sole source of this information.

#### Scenario: Registry matches the contract document

- **WHEN** the registry is compared against the primitive table in `contracts.md` §3
- **THEN** every primitive's unit, scale, stacking rule, and cap match, and the check runs in CI

#### Scenario: Unknown primitive rejected

- **WHEN** a node declares an effect naming a primitive absent from the registry
- **THEN** content validation fails and names the unknown primitive

### Requirement: Stacking arithmetic is implemented once

Combining multiple sources of the same primitive SHALL be performed by a single shared
implementation driven by the registry's declared rule. No capability may combine primitive
magnitudes with inline arithmetic.

#### Scenario: Additive-into-multiplier rates

- **WHEN** two `research-rate` sources of `fp(204)` and `fp(204)` apply to the same mage
- **THEN** the effective multiplier is `fp(1024) + fp(204) + fp(204)`, not the product of two
  independent multipliers

#### Scenario: Wards multiply on the remainder

- **WHEN** two `ward` sources of 50% each apply to the same combatant
- **THEN** 75% of damage is prevented, not 100%

#### Scenario: Max-stacking primitives do not sum

- **WHEN** two `blink` sources of `fp(5120)` and `fp(8192)` metres apply to the same combatant
- **THEN** the effective displacement is `fp(8192)`

### Requirement: Caps are enforced

Every capped primitive SHALL have its cap applied after stacking. A stacked value exceeding its cap
MUST be clamped, and the clamping MUST be observable to the balance harness.

#### Scenario: Rate cap clamps

- **WHEN** `build-rate` sources stack to a multiplier above `fp(4096)`
- **THEN** the effective multiplier is `fp(4096)`

#### Scenario: Ward cap clamps

- **WHEN** `ward` sources stack to above 90% prevention
- **THEN** prevention is clamped to `fp(922)`

#### Scenario: Clamping is counted

- **WHEN** a stacked value is clamped during a Monte Carlo run
- **THEN** a per-primitive clamp counter increments and is reported in the run's metrics

### Requirement: Uniform fixed-point rounding

All primitive arithmetic SHALL use the shared fixed-point helpers, with division rounding toward
negative infinity. No primitive computation may use floating-point.

#### Scenario: Negative rounding is directional

- **WHEN** a primitive computation divides a negative fixed-point value that does not divide evenly
- **THEN** the result rounds toward negative infinity

#### Scenario: Float in primitive math rejected

- **WHEN** a primitive computation introduces floating-point arithmetic
- **THEN** the lint task exits non-zero and names the file
