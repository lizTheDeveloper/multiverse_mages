## ADDED Requirements

### Requirement: A universe holds exactly one tradition declaring exactly four hooks

A universe SHALL have exactly one `traditionId`, which MUST never be `0`. Every tradition record MUST
declare all four hooks — `acquire`, `store`, `cast`, `cost` — and MUST declare no others. Content
validation MUST reject a tradition missing a hook, declaring a fifth hook key, or naming a hook kind
outside the enumeration for that hook.

#### Scenario: A complete tradition loads

- **WHEN** a tradition declares `acquire`, `store`, `cast`, and `cost`, each with a kind from that
  hook's enumeration
- **THEN** the record loads and is selectable as a universe's tradition

#### Scenario: A missing hook is rejected

- **WHEN** a tradition record omits `cost`
- **THEN** the load fails and the error names the tradition and the missing hook

#### Scenario: A fifth hook is rejected

- **WHEN** a tradition record declares a `mortality` hook alongside the four
- **THEN** the load fails and the error names the disallowed hook key

#### Scenario: A universe without a tradition is invalid

- **WHEN** a universe is constructed with `traditionId` `0`
- **THEN** state validation fails and reports that exactly one tradition is required

### Requirement: Hook kinds are a closed enumeration

Each hook's `kind` SHALL be drawn from a closed set implemented in code, with `params` supplied as
data. The v1 enumeration MUST be exactly: `acquire` — `standard`, `true-name`; `store` — `standard`,
`palace`; `cast` — `standard`, `prepared`; `cost` — `standard`, `prepaid`. Adding a kind MUST be a
code change accompanied by an update to `docs/design/contracts.md` §2.5, and MUST NOT be achievable
through content alone.

#### Scenario: An unknown kind is rejected

- **WHEN** a tradition declares `acquire` with kind `pact`
- **THEN** the load fails and the error lists the permitted kinds for `acquire`

#### Scenario: A kind valid for another hook is rejected

- **WHEN** a tradition declares `store` with kind `prepared`
- **THEN** the load fails and the error states that `prepared` is a `cast` kind

#### Scenario: Params are data, not behaviour

- **WHEN** a tradition's hook `params` are changed without touching code
- **THEN** the simulation loads and behaves differently, and no new kind was introduced

#### Scenario: The enumeration is exactly four plus four

- **WHEN** the enumeration is compared against `contracts.md` §2.5 in CI
- **THEN** the two agree, and the check fails if a kind is added in one place only

### Requirement: Vancian memorization hooks cast and cost

The Vancian tradition SHALL declare `cast` of kind `prepared` and `cost` of kind `prepaid`, with
`acquire` and `store` of kind `standard`. Under `prepared`, a mage MUST hold at most a declared
number of prepared nodes, drawn only from usable instances they hold, and casting a prepared node
MUST expend that preparation until it is re-prepared in world time. Under `prepaid`, releasing a
prepared node MUST cost the caster nothing at the moment of casting, because the price was paid at
preparation.

#### Scenario: Preparation is bounded

- **WHEN** a mage with a `prepared` slot count of four attempts to prepare a fifth node
- **THEN** the preparation is refused and the slot count is named

#### Scenario: Casting expends the preparation

- **WHEN** a mage casts a prepared node
- **THEN** that preparation is removed from `preparedSpells` and the node is uncastable until
  re-prepared, while the knowledge instance itself is unchanged

#### Scenario: A dormant node cannot be prepared

- **WHEN** a mage attempts to prepare a node whose cell is interdicted
- **THEN** the preparation is refused

#### Scenario: Release is free at the moment of casting

- **WHEN** the `prepaid` cost kind is evaluated for a mage releasing a prepared node
- **THEN** it returns a cost of zero, while the `standard` cost kind returns a non-zero cost for the
  same node

### Requirement: True Naming hooks acquire only

The True Naming tradition SHALL declare `acquire` of kind `true-name`, with `store`, `cast`, and
`cost` of kind `standard`. Under `true-name`, research costs MUST be raised and teaching costs
lowered by the declared parameters, every instance MUST be created at mastery `fp(1024)` because a
name is either known or not, and an instance obtained by `knowledge-steal` MUST likewise arrive at
`fp(1024)`. The hook MUST NOT alter decay, storage locations, casting, or cost.

#### Scenario: Instances are created complete

- **WHEN** a mage under True Naming completes research on a node
- **THEN** the created instance's mastery is `fp(1024)` and it is immediately teachable without
  transmission loss

#### Scenario: Research is dearer and teaching cheaper

- **WHEN** the same node is researched and then taught under True Naming and under a standard
  `acquire` tradition, with identical supplied rates
- **THEN** True Naming requires more research progress and less teaching progress than the standard
  tradition

#### Scenario: Stolen names arrive complete

- **WHEN** a `knowledge-steal` attempt against a True Naming holder succeeds
- **THEN** the acquired instance's mastery is `fp(1024)`

#### Scenario: Decay is untouched by the acquire hook

- **WHEN** a True Naming mind instance is carried forward under a supplied retention value
- **THEN** it decays by exactly the same amount as an identical instance under a standard `acquire`
  tradition

### Requirement: The Art of Memory hooks store only

The Art of Memory tradition SHALL declare `store` of kind `palace`, with `acquire`, `cast`, and
`cost` of kind `standard`. Under `palace`, knowledge instances MUST be created at `locationKind`
palace bounded by the declared `slotsPerMage`, scribing MUST be unavailable so that no grimoire or
library instance can be created, palace instances MUST NOT be lootable or transferable as objects,
and every palace instance MUST be destroyed when its holder dies. A university's effective library
depth under `palace` MUST be computed from the palaces of its affiliated living mages, scaled by the
declared depth coefficient.

#### Scenario: Palace slots are bounded

- **WHEN** a mage with `slotsPerMage` of twelve acquires a thirteenth node
- **THEN** the acquisition is refused and the slot count is named

#### Scenario: Scribing is unavailable

- **WHEN** any scribing operation is invoked in an Art of Memory universe
- **THEN** it is refused and no grimoire or library instance is created

#### Scenario: A palace dies with its holder

- **WHEN** the holder of a palace instance dies and that instance was the node's last
- **THEN** the instance is destroyed, the node ceases to exist, and a loss event is emitted naming
  the palace location kind

#### Scenario: Palaces supply library depth

- **WHEN** a university in an Art of Memory universe has three affiliated living mages holding
  palace instances, and one of them dies
- **THEN** the reported library depth for that university falls, without any instance being
  transferred or written

#### Scenario: The depth coefficient is a parameter

- **WHEN** the `palace` hook's depth coefficient is set to zero in content
- **THEN** Art of Memory universities report zero library depth, and no code changed

### Requirement: Cross-portal hook arbitration splits by clock

Hook selection SHALL be a pure function `hookFor(hook, homeTraditionId, hostTraditionId)` returning
the kind that applies. `acquire` and `store` MUST resolve to the mage's home tradition because they
are world-time concerns; `cast` and `cost` MUST resolve to the host universe's tradition. A
combatant's `preparedSpells` MUST be populated at portal entry by the raider's **home** `cast` kind,
and thereafter expended by the **host's** `cast` kind and paid for by the **host's** `cost` kind.

#### Scenario: Acquire and store follow the raider home

- **WHEN** `hookFor` is called for `acquire` and for `store` with a True Naming home and an Art of
  Memory host
- **THEN** it returns `true-name` and `standard` respectively

#### Scenario: Cast and cost follow the host

- **WHEN** `hookFor` is called for `cast` and for `cost` with a Vancian home and an Art of Memory
  host
- **THEN** it returns `standard` for both

#### Scenario: A Vancian raider carries her own preparations

- **WHEN** a Vancian mage enters an Art of Memory universe holding four prepared nodes and twenty
  known nodes
- **THEN** her `preparedSpells` contains exactly the four prepared nodes, populated by her home
  `cast` kind at entry

#### Scenario: The raider pays the host's price

- **WHEN** that Vancian raider releases one of her prepared nodes in the Art of Memory universe
- **THEN** the cost applied is the host's `standard` cost, not the Vancian `prepaid` zero cost

#### Scenario: At home both halves are the same tradition

- **WHEN** `hookFor` is called for all four hooks with the same tradition as home and host
- **THEN** it returns that tradition's four declared kinds

### Requirement: A tradition changes behaviour only through its declared hooks

Each tradition SHALL alter simulation behaviour only at the four hook points, and MUST NOT alter any
other computation. A conformance test MUST demonstrate, for each pair of v1 traditions, at least one
scenario that distinguishes them, and MUST demonstrate that scenarios outside the differing hooks'
domains produce identical results.

#### Scenario: Each pair of traditions is distinguishable

- **WHEN** the same seeded scenario is run under Vancian, True Naming, and the Art of Memory
- **THEN** each pair of runs differs in at least one observable outcome

#### Scenario: Traditions agree outside their hooks

- **WHEN** a scenario exercising only research prerequisites and cell legality is run under all
  three traditions with identical supplied rates
- **THEN** all three produce identical results

#### Scenario: No behaviour outside the hook call sites

- **WHEN** the conformance check scans the rules path for reads of `traditionId` outside the four
  hook dispatch points and `hookFor`
- **THEN** it finds none

### Requirement: Changing a tradition is total

Changing a universe's tradition SHALL leave no knowledge instance in a state the incoming `store`
kind does not define. The operation MUST resolve every instance whose location kind the new `store`
kind cannot hold, MUST report what it resolved, and MUST NOT leave an instance addressable at an
undefined location. Applying the reported resolution MUST leave no grimoire behind whose instance it
destroyed: a universe that switched into a `store` kind holding no written copy MUST be
indistinguishable from one founded under it.

#### Scenario: Switching to a palace store resolves written instances

- **WHEN** a universe holding grimoire and library instances changes its tradition to the Art of
  Memory
- **THEN** every grimoire and library instance is resolved by the declared rule, the resolution is
  reported per instance, and no instance remains at `locationKind` grimoire or library

#### Scenario: A resolved written instance takes its book with it

- **WHEN** the reported resolution of that change is applied through the knowledge subsystem's
  destroy path
- **THEN** no grimoire record survives the change, so the universe holds no book whose contents
  nothing can destroy and none that could claim a later book's instance when the world is reloaded

#### Scenario: Switching away from a palace store resolves palace instances

- **WHEN** an Art of Memory universe changes to a tradition with a `standard` store
- **THEN** every palace instance is resolved by the declared rule and none remains at `locationKind`
  palace

#### Scenario: Losses from a tradition change are reported as losses

- **WHEN** a tradition change destroys the last instance of a node
- **THEN** a loss event is emitted for that node, indistinguishable in form from any other loss

#### Scenario: The operation is atomic

- **WHEN** a tradition change is applied and the resulting state is inspected
- **THEN** either every instance has been resolved and `traditionId` is the new tradition, or the
  state is unchanged and the tradition is the old one
