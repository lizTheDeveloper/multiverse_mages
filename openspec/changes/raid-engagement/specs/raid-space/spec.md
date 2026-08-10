## ADDED Requirements

### Requirement: Spatial state exists only in engagement mode

Positions, terrain, and the spatial index SHALL exist only while `clock.mode == engagement`. World-
scale entities MUST NOT acquire coordinates at any point in a raid's lifecycle, and no spatial
component may be attached to a mage, university, populace cohort, library, or grimoire.

#### Scenario: Combatants are positioned, their sources are not

- **WHEN** a combatant is derived from a living mage at portal open
- **THEN** the combatant carries fixed-point `x` and `y` in metres and the source mage entity carries
  no position component

#### Scenario: Position on a world entity is rejected

- **WHEN** code attaches a position component to any world-scale entity during a raid
- **THEN** the operation fails in development builds and the conformance test fails in CI

#### Scenario: The spatial layer is torn down on resolution

- **WHEN** a raid resolves
- **THEN** the terrain grid and the spatial index are discarded, and no coordinate value survives into
  either universe's world state

### Requirement: Combatants are derived from world state at portal open

At portal open the engine SHALL derive a bounded set of combatants from each participant's world
state. Attacker combatants MUST be drawn from living mages holding the raider role and from soldier
populace cohorts; defender combatants MUST be drawn from living mages holding the warden role, mages
affiliated with a university that hosts an objective, and soldier populace cohorts. Each combatant
MUST record `sourceKind` and a `sourceId` handle into its own universe's world state, except summons,
which MUST carry `sourceId = 0`. Selection MUST be deterministic and MUST NOT exceed
`maxCombatantsPerSide`.

#### Scenario: Selection is deterministic and capped

- **WHEN** a universe holds more eligible mages than `maxCombatantsPerSide`
- **THEN** the same subset is selected on every run from the same snapshot and seed, and exactly
  `maxCombatantsPerSide` combatants are created for that side

#### Scenario: Soldier cohorts become detachments, not individuals

- **WHEN** a soldier populace cohort contributes to a raid
- **THEN** it yields whole detachment combatants each backed by a counted portion of the cohort, and
  the cohort is never promoted to individual entities

#### Scenario: Summons have no world source

- **WHEN** a `summon` effect creates combatants during a raid
- **THEN** each carries `sourceKind = summon` and `sourceId = 0`, and nothing about them is written
  back to world state on resolution

#### Scenario: Derived combatant statistics come from world state

- **WHEN** two mages of different species and different highest known node tier are derived as
  combatants
- **THEN** their `maxHp` and `concealment` differ according to their species traits and known nodes,
  by a formula marked untuned

### Requirement: The battlefield is a bounded plane with generated terrain

The battlefield SHALL be a bounded rectangle of the reference extent declared in `contracts.md` §0,
overlaid with a terrain grid whose cells carry passability, line-of-sight blocking, and a movement
cost. Terrain MUST be generated at portal open from RNG stream 10 keyed by the raid seed, MUST NOT be
persisted, and MUST be reproducible from the seed alone.

#### Scenario: Terrain regenerates identically from the seed

- **WHEN** the same raid seed is used to generate terrain twice
- **THEN** both grids are identical cell for cell

#### Scenario: Combatants cannot leave the battlefield

- **WHEN** any movement, displacement, or deployment would place a combatant outside the battlefield
  rectangle
- **THEN** the position is clamped to the rectangle and the combatant remains inside it

#### Scenario: Impassable terrain is not occupied

- **WHEN** a combatant's intended destination lies in an impassable cell
- **THEN** the combatant resolves at the last passable point along its path

### Requirement: Range is tested by squared distance and line of sight is traced on integers

Range tests SHALL compare squared fixed-point distance against a squared radius, and the rules path
MUST NOT compute a square root. Line of sight SHALL be traced as an integer supercover walk between
combatant centres over terrain cells, blocked by the first cell flagged as blocking, and MUST be
symmetric between any two positions.

#### Scenario: No square root in the rules path

- **WHEN** the lint task scans `rules-raid` source
- **THEN** any use of `Math.sqrt` or an equivalent floating-point distance computation fails the task
  and names the file and line

#### Scenario: A target beyond range is not acquired

- **WHEN** the squared distance between caster and candidate target exceeds the squared range of the
  effect
- **THEN** the candidate is not acquired, regardless of line of sight

#### Scenario: Line of sight is symmetric

- **WHEN** line of sight is traced from combatant A to combatant B and from B to A over the same
  terrain
- **THEN** both traces agree

#### Scenario: A blocking cell breaks line of sight

- **WHEN** a blocking terrain cell lies on the traced line between two combatants
- **THEN** neither may target the other, and the spatial query reports the pair as occluded

### Requirement: The spatial index is a uniform grid with deterministic traversal

The engine SHALL maintain a uniform-grid spatial index over the battlefield whose cell size is at
least the maximum interaction radius, so that a radius query inspects a bounded number of cells.
Query results MUST be returned in a deterministic order that does not depend on insertion history.

#### Scenario: Query order is independent of insertion order

- **WHEN** the same set of combatants is inserted into the index in two different orders and the same
  radius query is issued
- **THEN** both queries return the same combatants in the same order

#### Scenario: Radius queries are bounded

- **WHEN** a radius query no larger than the maximum interaction radius is issued
- **THEN** the index inspects at most the nine cells surrounding the query centre

### Requirement: Movement and blink are clamped and stack by maximum

Ordinary movement SHALL advance a combatant toward its goal by at most its per-tick movement
allowance, scaled by terrain movement cost. The `blink` primitive SHALL displace a combatant
instantaneously by fixed-point metres, taking the **maximum** across sources rather than the sum, per
`contracts.md` §3, and MUST be clamped to the battlefield and to passable terrain.

#### Scenario: Two blink sources do not sum

- **WHEN** a combatant resolves two `blink` effects of different magnitudes in the same tick
- **THEN** the displacement equals the larger magnitude, not their sum

#### Scenario: Blink does not bypass terrain

- **WHEN** a blink displacement's endpoint lies beyond a blocking or impassable region
- **THEN** the combatant arrives at the last passable point along the displacement path

### Requirement: Each engagement tick runs a fixed phase order

An engagement tick SHALL execute these phases in this order: intent scoring against tick-start state,
movement and displacement, area denial, cast resolution, theft resolution, objective interaction,
portal stability decrement, and cleanup. Combatants reduced to zero hit points MUST be removed only
in the cleanup phase, so that a combatant killed during a tick still resolves the intent it declared
at the start of that tick.

#### Scenario: Intents are scored against tick-start state

- **WHEN** two combatants would both target a third whose hit points change during the tick
- **THEN** both intents were scored against the hit points held at tick start

#### Scenario: A dying combatant still acts

- **WHEN** a combatant is reduced to zero hit points during the cast resolution phase
- **THEN** its own declared cast still resolves in that same tick, and it is removed in cleanup

#### Scenario: Within-tick damage and displacement are order-independent

- **WHEN** the same tick is resolved with the cast resolution phase walking combatants in a different
  order, for effects other than capped summons
- **THEN** the set of effects applied and the resulting hit points and positions are identical,
  because damage is additive and removal is deferred

#### Scenario: Theft resolves after damage

- **WHEN** a combatant both damages a target to zero hit points and attempts to steal from that target
  in the same tick
- **THEN** the damage resolves first and the theft attempt fails, because the target's mind is gone

### Requirement: Combat random draws are keyed by stable combatant identity

Every random draw in combat resolution SHALL derive from `(rootSeed, streamId, engagementTick,
combatantKey, drawOrdinal)`, where `combatantKey` is the combatant's side and spawn ordinal, assigned
at deployment and never reused within a raid. Draws MUST NOT be keyed by entity index or by position
in a sequential stream.

#### Scenario: Adding a combatant does not disturb the others

- **WHEN** an additional summon is created in a raid and the raid is rerun from the same root seed
- **THEN** every other combatant's sequence of draws is unchanged

#### Scenario: Adding a draw does not disturb the others

- **WHEN** one combatant's behaviour introduces an additional random draw and the raid is rerun from
  the same root seed
- **THEN** no other combatant's draws change

#### Scenario: Streams are used as registered

- **WHEN** combat resolution, knowledge theft, and raid generation draw randomness
- **THEN** they draw from streams 8, 9, and 10 respectively, and the conformance check fails if any
  subsystem draws from another's stream

### Requirement: Targeting acquires the weakest enemy in range and line of sight

A caster SHALL acquire, among enemy combatants within range and line of sight, the one with the
lowest current hit points above zero, breaking ties on ascending stable combatant key. If no
candidate satisfies both range and line of sight, the cast MUST NOT be attempted and the caster's
preparation MUST NOT be expended. This selection rule is an untuned placeholder.

#### Scenario: The weakest reachable enemy is chosen

- **WHEN** three enemies are in range and line of sight with differing hit points
- **THEN** the one with the lowest hit points above zero is acquired

#### Scenario: No target means no expenditure

- **WHEN** a caster declares a cast and no enemy is both in range and in line of sight at resolution
- **THEN** no effect resolves, no cost is charged, and the preparation remains readied

#### Scenario: Tie-breaking is stable

- **WHEN** two candidate targets hold identical hit points
- **THEN** the one with the lower stable combatant key is acquired, in every run from the same seed

### Requirement: Concealment is resolved as an evasion roll before damage

Concealment SHALL be the sole miss chance in combat; no separate accuracy or to-hit statistic may
exist. Effective concealment MUST combine multiplicatively on the remainder across sources and MUST
be clamped to the cap in `contracts.md` §3. On a successful evasion the attack MUST deal zero damage
while the caster's cost and preparation are still expended. Concealment MUST NOT apply to
`area-denial`, which targets no combatant.

#### Scenario: Two concealment sources combine on the remainder

- **WHEN** a combatant carries two concealment sources of equal magnitude
- **THEN** the effective value equals one minus the product of their remainders, clamped to the cap

#### Scenario: Evasion deals zero damage but still costs

- **WHEN** an evasion roll succeeds against an acquired target
- **THEN** the target takes zero damage and the caster's preparation and cost are still spent

#### Scenario: Area denial ignores concealment

- **WHEN** a concealed combatant stands inside an active area-denial field
- **THEN** it takes the field's damage in full, subject only to ward

#### Scenario: No accuracy statistic exists

- **WHEN** the conformance check scans combat resolution for a hit-probability term not derived from
  `concealment`
- **THEN** it fails and names the file

### Requirement: Damage is summed additively then reduced by a single ward application

All `direct-damage` resolving against one combatant within one engagement tick SHALL be summed
additively across sources first. A single ward factor MUST then be applied to that sum, combined
multiplicatively on the remainder across ward sources and clamped to the cap in `contracts.md` §3.
`area-denial` damage MUST pass through ward on the same terms. All fixed-point division MUST use the
shared helper that rounds toward negative infinity, and hit points MUST clamp at zero.

#### Scenario: Ward applies once to the summed damage

- **WHEN** a combatant takes three separate direct-damage effects in one tick while holding one ward
- **THEN** the three magnitudes are summed and the ward is applied once to that sum, not three times

#### Scenario: Two wards combine on the remainder and respect the cap

- **WHEN** a combatant holds two ward sources whose combined value on the remainder would exceed the
  cap
- **THEN** the applied reduction equals the cap exactly, and the cap-clamp counter increments

#### Scenario: Many small hits equal one large hit

- **WHEN** a warded combatant takes ten direct-damage effects summing to a magnitude, and an identical
  combatant takes one effect of that same magnitude
- **THEN** both end the tick with identical hit points

#### Scenario: Hit points clamp at zero

- **WHEN** applied damage exceeds a combatant's remaining hit points
- **THEN** its hit points become exactly zero and no negative value is stored

### Requirement: Per-tick work is bounded by hard per-side caps

The engine SHALL enforce a maximum combatant count per side and a maximum summon count per side. A
summon that would exceed either cap MUST resolve as a no-op rather than being queued, deferred, or
retried. Where more summons are declared in one tick than remaining slots allow, they MUST be
resolved in ascending stable combatant key order, so that which summon succeeds is deterministic.
These caps, together with the portal stability bound, make total raid work bounded.

#### Scenario: A summon over the cap is a no-op

- **WHEN** a summon effect resolves while its side already holds the maximum permitted summons
- **THEN** no combatant is created, nothing is queued, and the caster's cost is still charged

#### Scenario: Contention for the last summon slot is deterministic

- **WHEN** two combatants declare summons in the same tick and only one slot remains under the cap
- **THEN** the combatant with the lower stable combatant key summons successfully and the other's
  summon is a no-op, identically on every run from the same seed

#### Scenario: Combatant count never exceeds the cap

- **WHEN** any raid is resolved to completion
- **THEN** the recorded peak combatant count for each side is at most `maxCombatantsPerSide`

### Requirement: A raid is reproducible tick by tick

Given identical participant snapshots and raid seed, the engine SHALL produce an identical sequence of
engagement states. A committed golden replay fixture MUST cover a full raid including terrain
generation, deployment, combat, theft, and resolution.

#### Scenario: Golden raid replay reproduces exactly

- **WHEN** the committed raid fixture is replayed
- **THEN** every engagement tick's state hash matches the recorded hash, and the final outcome record
  is byte-identical

#### Scenario: Cross-process reproduction

- **WHEN** the same raid is resolved in two worker processes
- **THEN** both produce identical outcome records
