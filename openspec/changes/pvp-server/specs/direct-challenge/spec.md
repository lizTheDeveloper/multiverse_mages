## ADDED Requirements

### Requirement: Session establishment is direct challenge only

The server SHALL establish a match only through a challenge naming one opponent and that
opponent's acceptance. It MUST NOT implement a queue, a ladder, a ranking, or any mechanism that
selects an opponent on a participant's behalf. Vision §12 puts matchmaking beyond direct challenge
out of scope for v1, and the capability is named `direct-challenge` rather than `matchmaking` for
that reason.

#### Scenario: A challenge reaches only its named opponent

- **WHEN** a participant challenges a named opponent
- **THEN** only that opponent is notified, and the match exists only once that opponent accepts

#### Scenario: A declined challenge establishes nothing

- **WHEN** a challenged participant declines
- **THEN** no match is created and neither participant is placed in any pending pool

#### Scenario: The vocabulary offers no queue

- **WHEN** the protocol's verb table is inspected
- **THEN** it contains no verb for joining a queue, listing open games, or requesting an opponent

### Requirement: Handshake pins the observation contract before any match

A participant SHALL declare its protocol version, observation schema version, observation layout
digest, observation size, action space size, content revision and scenario id before it may send
any other verb. A disagreement on any of these SHALL be fatal and the participant MUST NOT receive
a single tick. A disagreement on advisory fields SHALL be reported and not refused.

#### Scenario: A verb before the handshake is refused

- **WHEN** any verb other than `hello` arrives on a connection that has not completed a handshake
- **THEN** it is refused and no state is created for that connection

#### Scenario: A structural mismatch is fatal and names every disagreeing field

- **WHEN** a participant declares an observation layout digest that differs from the server's
- **THEN** the connection is refused with every disagreeing field named, and closed

#### Scenario: An advisory mismatch is reported and admitted

- **WHEN** a participant declares a different build version but agrees on every structural field
- **THEN** it is welcomed, and the disagreement is reported in the welcome

### Requirement: Content revision equality is a condition of meeting

Two universes SHALL only be admitted to one match if their `contentRevision` values are equal. The
revision SHALL be carried at its full 128-bit width as 32 lowercase hex characters and MUST NOT be
narrowed at any boundary. A mismatch SHALL be a refusal naming **both** revisions, with no
negotiation and no partial-compatibility rule, as `contracts.md` §0 requires.

#### Scenario: A mismatched revision is refused and both are named

- **WHEN** a participant declares a content revision differing from the server's
- **THEN** the refusal names the server's revision and the participant's, and the connection is
  closed having received no other frame

#### Scenario: A server without a well-formed revision refuses to start

- **WHEN** the scenario module declares a content revision that is not 32 lowercase hex characters
- **THEN** the server exits with an error rather than hosting matches it cannot check eligibility for

#### Scenario: There is no negotiation exchange

- **WHEN** a content-revision mismatch occurs
- **THEN** the only frame the participant receives is the refusal

### Requirement: Reachability is decided by cluster membership

A participant SHALL announce the persisted universe it plays, identified by a stable `universeId`
and the `clusterId` of the group of multiverses it belongs to. Whether a direct challenge between
two universes is legal SHALL be a single eligibility predicate over those identities, refusing a
universe challenging itself and refusing two universes in different clusters. The refusal SHALL
name which predicate refused, and SHALL NOT be fatal to the connection.

#### Scenario: Two universes in one cluster may meet

- **WHEN** a challenge is issued between two distinct universes sharing a cluster
- **THEN** the challenge is delivered to the opponent

#### Scenario: A challenge across clusters is refused, and the connection survives

- **WHEN** a challenge is issued to a universe in a different cluster
- **THEN** it is refused with the cluster predicate named, the opponent is not notified, and the
  challenger may issue another challenge on the same connection

#### Scenario: A universe cannot challenge itself

- **WHEN** a challenge names a universe id equal to the challenger's
- **THEN** it is refused

#### Scenario: A participant announcing no universe is placed in a default cluster

- **WHEN** a participant completes a handshake without declaring a universe
- **THEN** it is given a derived identity in the default cluster, so that every participant is
  mutually reachable until a persistence layer issues real identities

### Requirement: Slot assignment is a property of establishment

A participant's slot index SHALL be fixed when the match is established, from the roles in the
challenge, and MUST NOT depend on which participant connected first, answered fastest, or
submitted first. The slot index is half the ordering key, so a slot assignment that varied with
timing would make the ordering rule vary with timing.

#### Scenario: The challenger is slot 0

- **WHEN** a match is established from an accepted challenge
- **THEN** the challenger holds slot 0 and the accepting opponent holds slot 1, in every match

#### Scenario: Every participant is told the full seating

- **WHEN** a match starts
- **THEN** each participant receives its own slot and the slot, name and universe of every
  participant

### Requirement: Abandonment ends a match without awarding anything

A participant that disconnects or leaves mid-match SHALL end the match with reason `abandoned`,
naming who left. The server MUST NOT award the objective, the tribute, or any consequence to
either side on abandonment in v1.

#### Scenario: A disconnect ends the match neutrally

- **WHEN** a participant's connection drops mid-match
- **THEN** the match ends as abandoned, the remaining participant is told, and no outcome is
  recorded for either universe

#### Scenario: Abandonment consequences are deferred, not decided

- **WHEN** the consequences of abandonment are considered
- **THEN** they remain an open question recorded in the change's design notes, because the vision
  and contracts are silent on the rule and a forfeit rule invented here would become a grief tactic
