## ADDED Requirements

### Requirement: A bubble is a bounded adjacency set and carries no geometry

A bubble SHALL be a bounded set of universe identities that may open portals to one another. It MUST
be represented as membership — a set and a size — and MUST NOT carry coordinates, distances,
adjacency graphs with positions, or any other spatial structure. Vision §7a's rule that world-scale
entities carry no coordinates applies to the multiverse layer exactly as it applies within a universe.

#### Scenario: No coordinate reaches the bubble layer

- **WHEN** the conformance check scans bubble membership state for position, distance or extent fields
- **THEN** it finds none, and fails naming the field if one exists

#### Scenario: Bubble size is bounded and authored

- **WHEN** content is loaded
- **THEN** the maximum number of universes in a bubble is read from a content constant carrying a
  `gloss` and `tuningStatus: "untuned"`, and an unbounded bubble is rejected at load unless it is the
  explicitly authored exception

### Requirement: Bubble membership is what populates portal targets

The candidate list for the open-portal action SHALL be derived from the acting universe's bubble
membership. Today nothing populates it, `openPortal` therefore has zero candidates, and its legality
mask bit is permanently zero — structurally rather than by cost. This requirement is what makes the
raid layer reachable at all, and it is independent of every other requirement in this change.

#### Scenario: A universe in a populated bubble has portal candidates

- **WHEN** a universe shares a bubble with at least one other live universe of equal content revision
- **THEN** the open-portal action has at least one candidate and its mask bit is one

#### Scenario: A universe alone in its bubble has none

- **WHEN** a universe is the only live member of its bubble
- **THEN** the open-portal action has zero candidates and its mask bit is zero, with no exception
  raised

#### Scenario: Content revision gates membership eligibility

- **WHEN** a bubble roster is assembled
- **THEN** only universes with equal `contentRevision` values are eligible to portal to one another,
  and a mismatch is a refusal naming both revisions rather than a negotiation

### Requirement: Universe identity stable across simulation instances is a prerequisite

Bubble membership SHALL be expressed over an identity that outlives a single simulation instance. No
such identity exists in the tree today — the only identity is a per-process entity handle recovered by
scanning — so this capability depends on `pvp-server`'s persistence contracts supplying one. **This
requirement records the dependency; it does not define the identity.**

#### Scenario: Membership is not expressed over entity handles

- **WHEN** the conformance check scans bubble membership for entity-handle-typed fields
- **THEN** it finds none

#### Scenario: The dependency is declared rather than worked around

- **WHEN** this capability is implemented before a stable identity exists
- **THEN** implementation is blocked and the dependency is reported, rather than a per-instance
  identity being adopted as a placeholder

### Requirement: Losing a universe is a rejoin, never an exit

A player whose universe is extinguished SHALL be able to begin a new universe in a fresh bubble,
carrying prestige under the existing §8a recurrence. The design MUST NOT introduce any state in which
a player has no universe available to them and no path back.

#### Scenario: A player whose universe is conquered may begin again

- **WHEN** a player's universe ends by conquest
- **THEN** a new universe in a fresh bubble is available to them, seeded with prestige carried under
  the existing recurrence

#### Scenario: The conqueror keeps the colony and loses the target

- **WHEN** a conquered player rejoins into a fresh bubble
- **THEN** the conqueror retains the colony record and the rejoined player is not a member of the
  conqueror's bubble

#### Scenario: Prestige carry-forward is unchanged in shape

- **WHEN** a player rejoins
- **THEN** prestige is carried by the existing recurrence and its authored constants, with no second
  carry-forward channel introduced

### Requirement: Bubble tiers are specified and deferred past v1

Bubble tiers — clearing a bubble to be promoted into one populated by others who cleared theirs — SHALL
be recorded in this specification so that persistence can reserve for them, and SHALL NOT ship in v1.
Vision §12 puts a ranked ladder out of v1 scope, and a tier structure is a ranked progression system
whatever it is named. The tier index MUST NOT be called `prestige`: that name is taken by §8a's
carried-forward legacy score, its nine authored constants, and the `prestigeAdvantage` metric.

#### Scenario: The tier index does not collide with prestige

- **WHEN** the tier index is named
- **THEN** the name is distinct from `prestige` in state, in content, and in metrics, and a conformance
  check fails on any content id matching `prestige-*` that refers to a tier

#### Scenario: Tiers are not implemented in v1

- **WHEN** v1 ships
- **THEN** no promotion between bubbles occurs, and the deferral is recorded against vision §12 rather
  than left as an omission

#### Scenario: Adjacency ships without tiers

- **WHEN** bubble-as-adjacency is implemented
- **THEN** it functions with a single tier and requires no tier machinery, so that the piece the raid
  layer depends on is not blocked by the piece §12 defers
