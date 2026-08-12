## ADDED Requirements

### Requirement: Wire protocol version and permanent identifiers

The server SHALL publish a `PROTOCOL_VERSION` integer, and every verb name, notice name, error
code, rejection reason and canonical-entry source SHALL be permanent. Adding one is append-only;
renaming or renumbering one is a protocol version bump. These identifiers are serialized in every
recorded match and in every client written against a release, in exactly the sense that makes
`contracts.md` §4.2's action ids permanent.

#### Scenario: A frame vocabulary is versioned

- **WHEN** a participant declares a protocol version different from the server's
- **THEN** the handshake is refused before any match state is exchanged

#### Scenario: An added optional field does not bump the version

- **WHEN** a frame gains an optional field whose absence keeps the frame's meaning unchanged
- **THEN** the protocol version is unchanged and existing clients continue to interoperate

### Requirement: Match bootstrap carries no serialized state

A match SHALL be established from `(scenarioId, contentRevision, runSeed, stepLimit)` and advanced
by the canonical ordered action batch. The protocol MUST NOT serialize world state in v1. Where a
snapshot must later cross the wire, its payload SHALL be exactly `sim-core`'s `encodeSnapshot`
bytes under a pinned encoding tag, and the protocol MUST NOT define a second canonical form, a
second byte ordering, or a hash over anything other than those bytes.

#### Scenario: Two participants build the same universe from the bootstrap alone

- **WHEN** a match starts and each participant calls its scenario module with the announced
  `runSeed` and `stepLimit`
- **THEN** every participant's snapshot hash for its own slot equals the server's before the first
  tick

#### Scenario: A participant whose initial hash disagrees refuses to play

- **WHEN** a participant's constructed universe hashes differently from the server's initial hash
  for its slot
- **THEN** it reports the mismatch and plays no tick, rather than starting a match that would
  desync on tick zero and blame the network

#### Scenario: No second serialization exists

- **WHEN** the server package is scanned for a digest function or a state encoder of its own
- **THEN** none is found, and every hash on the wire is one `sim-core` produced

### Requirement: Deterministic action ordering independent of arrival

The canonical batch for a tick SHALL contain exactly one entry per participant slot, ordered
ascending by slot, and each slot's entry SHALL be the admitted submission with the lowest sequence
number for that tick. Arrival time MUST NOT be an input to any ordering decision, MUST NOT be
recorded, and MUST NOT be available as a tie-break. A connection's sequence numbers SHALL strictly
increase.

#### Scenario: Permuting arrival order does not change the batch

- **WHEN** the same set of submissions for one tick is offered in any two different orders
- **THEN** the resulting canonical batches are identical, entry for entry

#### Scenario: A duplicate submission is resolved by sequence, not by arrival

- **WHEN** one slot submits twice for one tick with sequence numbers 4 and 9, in either arrival
  order
- **THEN** the sequence-4 action is applied and the sequence-9 submission is rejected as a duplicate

#### Scenario: Two servers replaying one match agree

- **WHEN** a recorded batch log is replayed against the same scenario and seed in a separate process
- **THEN** the final per-slot snapshot hashes equal those the live match produced

### Requirement: A missing action has a defined deterministic meaning

When a tick's submission deadline passes with no admitted action from a slot, the server SHALL
place an explicit no-op in that slot's canonical entry and flag it as substituted. The server MUST
NOT wait indefinitely for a participant, and MUST NOT use whichever submission arrived first as a
substitute for a missing one. A slot whose submission was refused SHALL be distinguishable in the
record from a slot that submitted nothing.

#### Scenario: A silent participant does not stop the match

- **WHEN** one of two participants submits nothing and the deadline passes
- **THEN** the tick closes, that slot's entry is a no-op flagged as substituted, and both
  participants receive the same tick notice

#### Scenario: A rate-limited participant and a silent one produce identical state

- **WHEN** one participant's submissions are all refused by the admission policy and another
  participant sends nothing at all
- **THEN** both slots receive the substituted no-op and the resulting snapshot hashes are identical

#### Scenario: Refusal and silence are distinguishable in the record

- **WHEN** a slot's submission is refused for a named reason
- **THEN** its canonical entry carries that reason, while a slot that submitted nothing carries none

### Requirement: The wall clock is confined to pacing and admission

Wall-clock time SHALL be read only for tick pacing, submission deadlines and rate limiting, and
only through an injected clock. The modules that decide what a tick contains — ordering, the
authoritative step, and desync comparison — MUST NOT read a clock, import one, or take one as a
parameter. `Date.now` SHALL appear exactly once in the package.

#### Scenario: The tick path holds no clock

- **WHEN** the package's source is scanned for wall-clock reads outside the one licensed module
- **THEN** none is found, and the ordering, match and desync modules import no clock

#### Scenario: Pacing does not change outcomes

- **WHEN** the same submissions are played through a match with arbitrarily different wall-clock
  gaps between ticks
- **THEN** the final per-slot snapshot hashes are identical

### Requirement: Real-time pacing is scoped per layer

The server SHALL hold a separate tick interval and submission deadline for `clock.mode ==
engagement` and for `clock.mode == world`, and MUST NOT apply one profile to both. A tick notice
SHALL report the mode **per slot**, because `contracts.md` §0 makes clocks per-universe: a raid
freezes world time for its two participants only.

#### Scenario: A management tick is not held to a raid's deadline

- **WHEN** a participant in world time has not answered by the engagement deadline but answers
  before the world deadline
- **THEN** its submission is admitted and no no-op is substituted

#### Scenario: An engaged slot sets the deadline for its tick

- **WHEN** one slot is in engagement and another is in world time in the same match
- **THEN** the shorter engagement deadline governs, so a management-layer universe cannot hold up a
  raid

#### Scenario: Modes are reported per slot

- **WHEN** a tick notice is emitted
- **THEN** it carries one mode entry per slot rather than a single mode for the match

### Requirement: Desync detection reuses the snapshot hash and never corrects

Desync detection SHALL compare a participant's self-computed snapshot hash against the server's
authoritative hash for the same slot and tick, using the hash `deterministic-replay` already
produces. A mismatch SHALL be reported to every participant, logged with the match, tick, slot,
participant and **both** hashes, and SHALL end the match. The server MUST NOT correct, roll back,
resynchronize, or push state to a diverging participant, and MUST NOT offer an interface that
could.

#### Scenario: A mismatch is reported to both participants and ends the match

- **WHEN** a participant reports a hash that differs from the authoritative hash for its slot
- **THEN** every participant receives a desync notice naming both hashes, the match ends with
  reason `desync`, and the notice states that nothing was corrected

#### Scenario: Authoritative state is unchanged by a false report

- **WHEN** a participant reports a hash its universe did not produce
- **THEN** the server's per-slot hashes are byte-identical to what they were before the report

#### Scenario: The final tick can still be checked

- **WHEN** a participant reports its hash for the last tick after being told the match ended
- **THEN** the report is still compared, because the release claim is about final hashes

#### Scenario: No correction path exists

- **WHEN** the server's public surface is inspected
- **THEN** it offers no resync, rollback, reconcile or snapshot-push operation

### Requirement: The boundary applies an admission policy before the core

Every action crossing the network boundary SHALL be screened against the legality mask before it
reaches the simulation core, and the server SHALL bound both the frames a connection may send per
unit time and the submissions a connection may offer per tick. A connection exceeding its frame
budget SHALL be disconnected. `contracts.md` §4.2 assigns this to the boundary explicitly: the core
assumes a trusted caller and does not defend itself.

#### Scenario: A masked action never reaches the core

- **WHEN** a participant submits an action the legality mask forbids
- **THEN** the submission is refused at the boundary with a named reason and the slot receives the
  substituted no-op

#### Scenario: A flooding peer is disconnected rather than served

- **WHEN** a connection exceeds its frame budget within the window
- **THEN** it receives a fatal rate-limit error and its connection is closed

#### Scenario: A submission budget cannot be banked

- **WHEN** a participant submits nothing for several ticks and then submits repeatedly in one tick
- **THEN** only that tick's budget applies, and the excess is refused

#### Scenario: An unterminated frame cannot exhaust memory

- **WHEN** a peer sends bytes without a frame separator beyond the reader's bound
- **THEN** the reader refuses, clears its buffer, and the connection is dropped

### Requirement: The ruleset is frozen across the network boundary

While a participant's universe is in `clock.mode == engagement`, the server SHALL refuse every
action except no-op, and SHALL name a ruleset action's refusal distinctly from an ordinary masked
refusal. This is vision §3's frozen policy — *"Nothing about the ruleset can be altered once a raid
has begun"* — enforced at the network boundary as well as by the local mask.

#### Scenario: A ruleset action during a raid is refused and named

- **WHEN** a participant whose universe is in engagement submits a permit, forbid, edict, revoke or
  tradition-change action
- **THEN** the submission is refused with a `ruleset-frozen` reason and the slot receives a no-op

#### Scenario: The mode is read from the declared observation channel

- **WHEN** the server determines which layer a universe is in
- **THEN** it reads `contracts.md` §4.1's declared clock-mode channel rather than inferring the mode
  from the shape of the legality mask
