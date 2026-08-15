## ADDED Requirements

### Requirement: A colony is a frozen summary derived once at the claim

The engine SHALL derive one colony record at the moment a claim succeeds, from the extinguished
universe's terminal state, and write it into the conqueror's world state. The record MUST be complete
at derivation: surviving populace by species, materials stock, and the worship contribution the
colony makes. No later computation may consult the extinguished universe.

#### Scenario: The record is complete before the extinguished universe is released

- **WHEN** a claim succeeds
- **THEN** the colony record names every quantity it will ever contribute, and the extinguished
  universe is not read again

#### Scenario: A colony is created only by a successful claim

- **WHEN** a universe is extinguished and no claim succeeds
- **THEN** no colony record exists anywhere

#### Scenario: Colonies accumulate as rows, not as fields

- **WHEN** a conqueror holds more than one colony
- **THEN** each is a separate component row, and no universe-row field table is reshaped by holding
  another

### Requirement: Absorbed populace contributes without entering the conqueror's cohorts

A colony's populace SHALL contribute worship and materials to the conqueror and MUST NOT be inserted
into the conqueror's populace cohorts. Cohort insertion would place people inside a carrying capacity
that did not grow to hold them — `K` derives from land the conqueror did not gain — and the fertility
brake would remove them within a few world ticks, so the mechanic would undo itself visibly.

#### Scenario: Cohort totals are unchanged by a conquest

- **WHEN** a claim succeeds
- **THEN** the conqueror's total populace cohort count is exactly what it was before, and its carrying
  capacity is unchanged

#### Scenario: Colonists produce no mages

- **WHEN** world ticks advance while a colony is held
- **THEN** no mage is promoted out of a colony, and the conqueror's student seats are unaffected

#### Scenario: A conqueror's carrying capacity is not raised by conquest

- **WHEN** the conformance check scans for writes to territory extent from the conquest path
- **THEN** it finds none

### Requirement: The colony's contribution is stated as a channel, and its magnitude is not assumed

The worship a colony contributes SHALL be authored as content with `tuningStatus: "untuned"`, and the
spec MUST NOT assume that routing it through the existing populace worship term produces an
observable effect. The existing populace term saturates: at the reference run's populace it already
sits at roughly 95% of `worship-populace-cap`, so absorbing an equivalent civilization through that
term yields on the order of one percent of a universe's total worship. **Whether colonies receive
their own worship channel — which requires raising `worship-max` and updating the loader's asserted
cap-sum identity — is an open question for the author.**

#### Scenario: The cap-sum identity holds whatever is chosen

- **WHEN** content is loaded after this change
- **THEN** the loader's assertion that the per-class worship caps sum to `worship-max` still holds, and
  fails loudly if a channel was added without raising the maximum

#### Scenario: Every magnitude is marked untuned

- **WHEN** the conformance check reads the constants this change adds
- **THEN** each carries a `gloss` and `tuningStatus: "untuned"`

### Requirement: The inertness of the transfer is measured before it is believed

The change SHALL report, from the Monte Carlo harness at n ≥ 96 over 2400 ticks, the effect of a
colony-sized populace and materials endowment on `worshipSnowball`, `ascensionRate`, and mean nodes
known. A result inside one standard error MUST be reported as a negative finding rather than
absorbed silently, and it MUST block the change from being called complete.

#### Scenario: An inert transfer is reported as inert

- **WHEN** the measured deltas fall inside one standard error
- **THEN** the change reports that the transfer as specified does not move the game, and names which
  of the two channels — saturated worship, or materials feeding a scribe loop over an exhausted node
  set — accounts for it

#### Scenario: The snowball bound is checked against the metric that carries one

- **WHEN** snowball risk is evaluated
- **THEN** it is evaluated against `worshipSnowball` and its explicit `≤ 0.35` bound, and the report
  states plainly that `capitalSnowball` carries no numeric threshold in code

#### Scenario: First blood is not allowed to decide the bubble

- **WHEN** a multi-universe sweep completes
- **THEN** it reports the share of bubbles in which the first universe to take a colony went on to
  clear that bubble, and flags a share above 60% as a failure of the live-PvP requirement

### Requirement: Colony dynamics over time are authored, not implied

Whether a colony's contribution is constant, decays, or grows SHALL be an authored content decision
carried in data, not a behaviour implied by the implementation. A living colony — one that produces,
ages, or researches — MUST NOT be implemented, because it is a second resident universe under another
name and contradicts the one-universe-per-instance rule this design is built to respect.

#### Scenario: No colony simulates

- **WHEN** the conformance check scans for age, birth, research, or teaching computations over colony
  rows
- **THEN** it finds none

#### Scenario: The dynamics are data

- **WHEN** the colony contribution changes over world time
- **THEN** the rate is read from content, and turning it is a content change rather than a code change
