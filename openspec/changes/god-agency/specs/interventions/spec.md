## ADDED Requirements

### Requirement: The god acts only through the enumerated action space

The god SHALL influence the universe exclusively through the discrete actions enumerated in
`docs/design/contracts.md` §4.2, and MUST have no channel for commanding a mage's behaviour beyond
assigning that mage's standing role. No intervention may set a mage's goal, target, movement, or
spell choice, at world scale or during a raid.

#### Scenario: No direct orders exist

- **WHEN** the action-space conformance check inspects every intervention's effect
- **THEN** none writes a mage's goal, target, or utility score, and the only mage field any
  intervention writes is `roleId`

#### Scenario: The action set is closed

- **WHEN** the intervention dispatch table is compared against `contracts.md` §4.2
- **THEN** it contains exactly those action IDs, with no additions and no omissions

#### Scenario: Autonomy survives intervention

- **WHEN** a mage is blessed, reassigned, and has its research direction encouraged in the same
  world tick
- **THEN** the mage's subsequent goal selection is still produced by its own utility scoring, drawn
  from the mage-autonomy RNG stream

### Requirement: Every intervention is world-time only

Every action in the §4.2 space other than the no-op MUST have its legality mask entry set false
whenever `clock.mode == engagement`. This extends `contracts.md` §4.2's explicit masking of actions
1–7 and 13 to the remainder of the set, which that document leaves unstated. A raid in progress
SHALL be frozen policy in every respect, for both the host and the attacking universe.

#### Scenario: The whole set is masked mid-raid

- **WHEN** an observation is taken while the clock is in engagement mode
- **THEN** every mask entry for actions 1 through 15 is false and only the no-op remains legal

#### Scenario: Blessing mid-raid is refused

- **WHEN** an agent submits a bless-mage action during engagement
- **THEN** no blessing is applied, no favor is deducted, and the illegal-action counter increments

#### Scenario: Both sides are frozen

- **WHEN** a raid is in progress between two universes
- **THEN** neither the host's nor the attacker's god can alter a ruleset, a tradition, a role, a
  university, or a research emphasis until the raid resolves

#### Scenario: Ascension cannot be declared mid-raid

- **WHEN** the ascension condition is satisfied and the clock is in engagement mode
- **THEN** action 15's mask entry is false

### Requirement: Technique and form toggles are symmetric and immediate

Permitting or forbidding a technique or a form SHALL take effect at the world tick in which it
resolves, MUST cost the same in each direction, and MUST route every subsequent legality question
through the single `permits(universe, cellId)` function rather than through a cached cell list.

#### Scenario: Forbidding costs what permitting costs

- **WHEN** the same technique is permitted and then forbidden with no intervening ticks
- **THEN** both actions debit the same base cost before hysteresis is applied

#### Scenario: A toggle arms every cell on its axis at once

- **WHEN** a technique is permitted while all fourteen forms are permitted
- **THEN** `permits` returns true for all fourteen cells on that technique's row

#### Scenario: A toggle disarms cells for invaders too

- **WHEN** a form is forbidden in a universe
- **THEN** `permits` returns false for that form's cells for any caster inside that universe,
  attacker or defender alike

#### Scenario: Legality is never cached

- **WHEN** the conformance check inspects consumers of ruleset legality after this change lands
- **THEN** no consumer evaluates technique or form bitmasks directly, and none caches a permitted
  cell list across ticks

### Requirement: Edicts are single-cell exceptions bounded by the edict budget

Issuing a dispensation or an interdiction SHALL occupy one edict slot, and the number of edicts in
force MUST NOT exceed `edictBudget`. A dispensation MUST name a cell whose technique or form is
otherwise forbidden; an interdiction MUST name a cell whose axes are both permitted. Revoking an
edict SHALL free its slot in the same world tick.

#### Scenario: A dispensation opens one forbidden cell

- **WHEN** `Perdo` is forbidden and a dispensation names `perdo-corpus`
- **THEN** `permits` returns true for `perdo-corpus` and false for every other `Perdo` cell

#### Scenario: An interdiction closes one permitted cell

- **WHEN** `Mentem` and `Perdo` are both permitted and an interdiction names `perdo-mentem`
- **THEN** `permits` returns false for `perdo-mentem` and true for the other `Mentem` cells

#### Scenario: The budget is enforced by the mask

- **WHEN** a universe at `edictBudget` 3 already holds 3 edicts
- **THEN** the mask entries for issuing a dispensation and an interdiction are false, and become
  true after an edict is revoked

#### Scenario: A vacuous edict is illegal

- **WHEN** a dispensation names a cell whose technique and form are both already permitted
- **THEN** the action is masked, since it would consume a slot and change nothing

#### Scenario: Revocation restores the underlying axes

- **WHEN** an interdiction on a permitted cell is revoked
- **THEN** `permits` returns true for that cell without any further action

### Requirement: Granting founding knowledge is the only route for an unknown body of magic

Granting founding knowledge SHALL create exactly one knowledge instance of the named node at
`mind:<mageId>`, and MUST be legal only when the node currently has zero instances in the universe,
the target mage is alive, and `permits` returns true for the node's cell. The grant MUST bypass the
node's prerequisites, and no other intervention may introduce a node the universe has never held.
A cost of `fp(12288) × node tier` and a granted mastery of `fp(1024)` are untuned placeholders.

#### Scenario: A grant seeds a body of magic

- **WHEN** the god grants a tier-1 node that no instance of exists to a living mage
- **THEN** exactly one instance exists at that mage's mind, and the node now exists in the universe

#### Scenario: Prerequisites are bypassed

- **WHEN** the granted node declares prerequisites the target mage does not hold
- **THEN** the grant succeeds, because founding knowledge is how a prerequisite chain starts

#### Scenario: A grant cannot duplicate existing knowledge

- **WHEN** the named node already has one or more instances anywhere in the universe
- **THEN** the action is masked, and teaching or scribing is the route to further copies

#### Scenario: A grant respects the ruleset

- **WHEN** the named node's cell is forbidden by the current ruleset
- **THEN** the action is masked

#### Scenario: A grant is teachable immediately

- **WHEN** a grant resolves
- **THEN** the created instance carries mastery `fp(1024)`, so the recipient can teach it without
  loss

### Requirement: Blessing is a bounded, temporary uplift composed of existing primitives

Blessing a mage SHALL apply time-limited contributions expressed exclusively through effect
primitives already declared in `contracts.md` §3, combined by the shared stacking arithmetic and
subject to its caps. This change MUST NOT introduce a new effect primitive. A blessing MUST expire,
re-blessing an already-blessed mage MUST refresh its duration without stacking its magnitude, and
the number of concurrently blessed mages MUST NOT exceed `1 + worshipTier`. Contributions of
`fp(256)` to `research-rate`, `fp(256)` to `teach-rate`, and 60 months of `lifespan` over 120 world
ticks are untuned placeholders.

#### Scenario: A blessing composes declared primitives

- **WHEN** a blessing resolves
- **THEN** its effects appear as `research-rate`, `teach-rate`, and `lifespan` contributions in the
  shared stacking arithmetic, and the primitive registry gains no new entry

#### Scenario: A blessing expires

- **WHEN** 120 world ticks pass after a blessing
- **THEN** the mage's rates return to their unblessed values and the mage no longer contributes the
  blessed worship bonus

#### Scenario: Re-blessing refreshes rather than stacks

- **WHEN** an already-blessed mage is blessed again
- **THEN** the expiry moves out by the full duration and the magnitude is unchanged

#### Scenario: Concurrency is capped by tier

- **WHEN** a universe at worship tier 2 already has 3 blessed mages
- **THEN** the bless-mage action is masked until a blessing expires

#### Scenario: Blessed rates obey the shared caps

- **WHEN** a blessing would push a mage's `research-rate` past `fp(4096)`
- **THEN** the effective multiplier is clamped to `fp(4096)` and the clamp counter increments

### Requirement: Standing roles are assigned by the god and by nothing else

Assigning a standing role SHALL set exactly one of researcher, warden, professor, or raider on one
living mage, and MUST be the cheapest intervention in the cost table so that it remains available
as the routine verb rather than becoming an unaffordable no-op. A mage MUST hold exactly one role
at all times.

#### Scenario: A role is set immediately

- **WHEN** a role assignment resolves
- **THEN** the mage's `roleId` is the assigned role from that world tick onward

#### Scenario: Roles are exclusive

- **WHEN** a mage assigned to researcher is assigned to warden
- **THEN** the mage holds only warden, and no state records a second role

#### Scenario: Assignment stays affordable

- **WHEN** the cost table is loaded
- **THEN** the assign-role cost is strictly less than every other non-zero intervention cost

#### Scenario: A dead mage cannot be assigned

- **WHEN** the named mage is not alive, or the handle is stale
- **THEN** the action is masked

### Requirement: Funding advances a university and founding creates one

Funding SHALL advance a named university's `buildProgress`, and the same action with a target of 0
SHALL found a new university at zero progress, at a higher cost. A university MUST NOT contribute
to worship or to capacity until its `buildProgress` reaches `fp(1024)`. Costs of `fp(3072)` to fund
and `fp(10240)` to found are untuned placeholders.

#### Scenario: Founding creates an incomplete university

- **WHEN** the god funds with a target of 0
- **THEN** a new university entity exists with `buildProgress` of zero and contributes nothing to
  worship

#### Scenario: Funding advances construction

- **WHEN** an incomplete university is funded
- **THEN** its `buildProgress` increases, subject to the `build-rate` primitive's shared stacking
  and cap

#### Scenario: Completion changes the worship target

- **WHEN** a university's `buildProgress` reaches `fp(1024)`
- **THEN** the university class's raw worship input increases by its declared per-university value
  from that tick

#### Scenario: Funding a completed university is masked

- **WHEN** the named university is already complete
- **THEN** the fund action is masked for that target

### Requirement: Encouraging research is a persistent, decaying, capped emphasis

Encouraging research SHALL set a per-cell research emphasis that decays linearly to zero over time
and MUST contribute into the same `(1 + Σ)` `research-rate` channel and the same `fp(4096)` cap as
every other source, through the shared stacking arithmetic. The number of cells carrying a non-zero
emphasis MUST be bounded. An emphasis of `fp(256)` decaying by `fp(4)` per world tick, with at most
3 concurrent emphasised cells, are untuned placeholders.

#### Scenario: Emphasis raises research on one cell only

- **WHEN** a cell is encouraged
- **THEN** research toward nodes in that cell speeds up and research in every other cell is
  unchanged

#### Scenario: Emphasis decays to nothing

- **WHEN** 64 world ticks pass after an encouragement with no renewal
- **THEN** that cell's emphasis is zero and the slot is free

#### Scenario: Emphasis shares the research-rate cap

- **WHEN** emphasis is added to a mage already at the `research-rate` cap
- **THEN** the effective multiplier stays at `fp(4096)` and the clamp counter increments

#### Scenario: Concurrent emphases are bounded

- **WHEN** three cells already carry a non-zero emphasis
- **THEN** the encourage-research action is masked for every other cell until one decays

#### Scenario: Encouraging a forbidden cell is masked

- **WHEN** the named cell's technique or form is forbidden and no dispensation names it
- **THEN** the action is masked

### Requirement: Changing tradition is a single ruinous act

Changing the universe's tradition SHALL replace the single `traditionId`, MUST cost more than the
favor cap of every worship tier below the highest, and MUST zero the remaining favor pool and apply
the tradition upheaval shock. A universe MUST hold exactly one tradition at all times, and the
action MUST be masked during engagement per the world-time-only rule. A cost of `fp(65536)` is an
untuned placeholder.

#### Scenario: A young universe cannot afford it

- **WHEN** a universe below worship tier 5 attempts to change tradition
- **THEN** the action is masked, because its cost exceeds that tier's favor cap

#### Scenario: The change is total

- **WHEN** a tradition change resolves
- **THEN** `traditionId` is the new tradition, the previous tradition's hooks no longer apply, and
  no state records two traditions

#### Scenario: The cost is ruinous beyond its price

- **WHEN** a tradition change resolves
- **THEN** the remaining favor pool is zero and the worship upheaval shock is in force

#### Scenario: Stored knowledge survives the change

- **WHEN** a universe changes from a tradition whose `store` hook is a memory palace to one whose
  `store` hook is standard
- **THEN** the migration of existing instances is governed by `knowledge-model`'s tradition hooks,
  and this intervention neither destroys nor duplicates instances on its own

### Requirement: Opening a portal requires legality, knowledge, and favor

Opening a portal SHALL be legal only when `permits` returns true for the cell carrying the `portal`
primitive, at least one living mage holds a node carrying that primitive, the target universe is a
valid raid target, the clock is at world scale, and the favor cost is affordable. Resolution SHALL
transition the clock into engagement mode and hand control to `raid-engagement`; nothing about the
engagement itself is specified here. A cost of `fp(16384)` is an untuned placeholder.

#### Scenario: A portal needs a permitted cell

- **WHEN** the cell carrying the `portal` primitive is forbidden in the attacking universe
- **THEN** the open-portal action is masked

#### Scenario: A portal needs a mage who knows how

- **WHEN** the cell is permitted but no living mage holds a node carrying the `portal` primitive
- **THEN** the action is masked

#### Scenario: Opening pauses world time

- **WHEN** an open-portal action resolves
- **THEN** the clock enters engagement mode, world ticks stop advancing for both universes, and
  every god-agency mask entry becomes false

#### Scenario: A second portal cannot be opened mid-raid

- **WHEN** the clock is already in engagement mode
- **THEN** the open-portal action is masked

#### Scenario: The host ruleset is captured at entry

- **WHEN** a portal opens into a target universe
- **THEN** the raid records the host universe as the defender, and no subsequent ruleset change is
  possible in either universe until the raid resolves
