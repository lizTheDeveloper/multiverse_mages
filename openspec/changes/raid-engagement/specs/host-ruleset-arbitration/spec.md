## ADDED Requirements

### Requirement: The host universe's ruleset governs every spell cast inside it

A spell cast during a raid SHALL function if and only if `permits(hostRulesetSnapshot, cell(nodeId))`
returns true. This rule MUST apply identically to attacker and defender; no combatant's home ruleset
may make a cell castable inside the host, and no combatant's home ruleset may make a cell uncastable
inside the host. Legality MUST be evaluated through the single `permits` function published by
`state-schema` and MUST NOT be reimplemented by any consumer.

#### Scenario: Host forbids what the raider's home permits

- **WHEN** a raider whose home universe permits `creo-ignem` attempts to cast a `creo-ignem` node in a
  host universe that forbids `ignem`
- **THEN** the node is absent from her legal-node mask, no effect is applied, no cost is charged, and
  no combat random draw is made

#### Scenario: Host permits what the raider's home forbids

- **WHEN** a raider whose home universe forbids `perdo-corpus` holds a `perdo-corpus` node and casts
  it in a host universe that permits `perdo-corpus`
- **THEN** the cast resolves normally with full effect, because the raider's home ruleset is
  irrelevant to what functions inside the host

#### Scenario: The defender is bound by their own ruleset

- **WHEN** a defending mage in her own universe attempts to cast a node whose cell that universe
  forbids
- **THEN** the cast is refused exactly as it would be for an attacker, with no effect and no cost

#### Scenario: An interdiction binds both sides symmetrically

- **WHEN** the host universe permits both axes of a cell but names that cell in an interdiction, and
  an attacker and a defender each attempt to cast a node from it
- **THEN** both are refused, and `permits` is the sole reason recorded in each case

#### Scenario: A host dispensation arms both sides

- **WHEN** the host universe forbids a cell's technique but names that cell in a dispensation, and a
  raider holds a node from that cell
- **THEN** the raider's cast resolves normally, and the defender's identical cast also resolves
  normally

#### Scenario: Both sides throw fire when both universes permit it

- **WHEN** both universes permit `creo-ignem` and combatants on both sides hold `creo-ignem` nodes
- **THEN** casts from both sides resolve, in either universe's sky

#### Scenario: No consumer reimplements arbitration

- **WHEN** any file in `rules-raid` evaluates technique or form bitmasks directly rather than calling
  `permits`
- **THEN** the conformance check fails and names the file

### Requirement: Legality is enforced twice — as a selection mask and as a resolution assertion

The engine SHALL compute, once per combatant at portal open, a legal-node mask equal to the nodes
that combatant holds intersected with the nodes whose cells the host ruleset snapshot permits. The
combatant's goal scoring MUST draw candidate casts only from that mask. Independently, the single
cast-resolution function MUST re-evaluate `permits` before applying any effect, and on a false result
MUST apply nothing, charge nothing, draw no combat randomness, and increment a
`forbiddenCastsBlocked` counter.

#### Scenario: The mask is computed once and never recomputed

- **WHEN** a raid runs to resolution
- **THEN** each combatant's legal-node mask is computed exactly once at portal open, because the
  ruleset is frozen for the raid's duration

#### Scenario: An illegal node is never a candidate

- **WHEN** a combatant holds a node whose cell the host forbids and scores its goals for a tick
- **THEN** that node does not appear in the candidate set and cannot be selected, so no tick is spent
  attempting a guaranteed refusal

#### Scenario: The resolution assertion is live, not vacuous

- **WHEN** a fault-injection test disables the selection mask and drives a combatant to attempt a
  forbidden cast
- **THEN** `forbiddenCastsBlocked` increments, no effect is applied to any combatant, and the test
  asserts both outcomes

#### Scenario: Forbidden casts never resolve across a Monte Carlo sweep

- **WHEN** 10,000 Monte Carlo raids are resolved with the selection mask enabled
- **THEN** the aggregate `forbiddenCastsBlocked` counter reads zero and no effect attributable to a
  forbidden cell is recorded in any outcome record

#### Scenario: Effect application has exactly one entry point

- **WHEN** any code path applies a node's effects during engagement mode
- **THEN** the conformance check confirms it routed through the single cast-resolution function, and
  fails naming the file otherwise

### Requirement: Acquire and store follow the combatant's home tradition

The `acquire` and `store` tradition hooks SHALL be resolved against each combatant's **home**
tradition for the whole duration of a raid, for attacker and defender alike. Crossing a portal MUST
NOT change how a combatant's knowledge was acquired or where it is held.

#### Scenario: A memory palace travels with its holder

- **WHEN** an Art of Memory raider whose knowledge is held in `palace:` instances enters a host
  universe whose tradition is Vancian memorization
- **THEN** her palace instances remain reachable, remain unlootable and unburnable, and remain
  governed by her home `store` hook

#### Scenario: A raider's grimoires remain grimoires abroad

- **WHEN** a Vancian raider carrying grimoires enters an Art of Memory host universe
- **THEN** her grimoires remain grimoire instances, lootable and burnable, under her home `store` hook

#### Scenario: Home acquire governs a raider's theft

- **WHEN** a True Naming raider makes a `knowledge-steal` attempt in a host universe of a different
  tradition
- **THEN** her home tradition's `acquire` hook modifies the attempt, and the host's tradition does not

### Requirement: Cast and cost follow the host's tradition

The `cast` and `cost` tradition hooks SHALL be resolved against the **host** universe's tradition for
every combatant, attacker and defender alike. A combatant MUST pay the host's price to expend a
prepared spell and MUST expend it the host's way.

#### Scenario: A raider pays the host's price

- **WHEN** a Vancian raider expends a prepared spell in an Art of Memory host universe
- **THEN** the expenditure and its cost are computed by the host's `cast` and `cost` hooks, not by
  Vancian rules

#### Scenario: The defender uses the same hooks as the invader

- **WHEN** a defending mage and an invading mage each expend a spell in the same tick
- **THEN** both expenditures resolve through the same host `cast` and `cost` hooks

#### Scenario: Two different hosts distinguish the same raider

- **WHEN** the same attacker snapshot raids two host universes whose traditions differ, from the same
  raid seed
- **THEN** the casting and cost behaviour of her combatants differs measurably between the two raids

### Requirement: The prepared spell list is the host cast hook applied to the home store pool

A combatant's `preparedSpells` SHALL be populated by applying the host tradition's `cast` hook to the
candidate pool of knowledge instances made reachable by that combatant's home `store` hook. The
candidate pool MUST be determined by the home tradition and the readied list MUST be determined by
the host tradition.

#### Scenario: Home store determines the pool

- **WHEN** a raider's home `store` hook makes a set of instances reachable and a strictly larger set
  exists in her universe but is not reachable under that hook
- **THEN** only the reachable set is eligible for preparation, regardless of the host's tradition

#### Scenario: Host cast determines the readied list

- **WHEN** two raiders with identical reachable pools and identical home traditions enter host
  universes whose `cast` hooks declare different ready-slot counts
- **THEN** their `preparedSpells` lists differ in length according to the host hook

#### Scenario: Preparation is filtered by host legality

- **WHEN** a combatant's reachable pool contains nodes whose cells the host forbids
- **THEN** those nodes are excluded from `preparedSpells`, because the legal-node mask is applied
  before preparation

### Requirement: Casting legality is independent of knowledge existence

`permits` SHALL gate casting only. Holding, acquiring, teaching, scribing, or stealing a knowledge
instance MUST NOT be gated by whether the holding universe permits that instance's cell. A node whose
cell a universe forbids MAY exist in that universe and MUST be inert there until the cell is
permitted.

#### Scenario: Stolen knowledge enters a universe that forbids it

- **WHEN** a raider steals a node whose cell her own universe forbids and returns alive through the
  portal
- **THEN** the instance is created in her universe, counts toward that node's existence there, and is
  uncastable there until the cell is permitted

#### Scenario: Forbidding a cell does not destroy its instances

- **WHEN** a universe forbids a cell in which its mages hold knowledge instances
- **THEN** no instance is destroyed, no node is recorded as lost, and every affected node is reported
  as inert rather than absent

#### Scenario: Permitting a cell makes held knowledge live again

- **WHEN** a universe permits a cell whose instances it already held
- **THEN** those nodes become castable without any relearning, research, or rediscovery cost
