## ADDED Requirements

### Requirement: Line-delimited JSON frame transport

The bridge SHALL exchange frames with its client as newline-delimited JSON over stdin and stdout:
exactly one JSON object per line, UTF-8 encoded, `\n`-terminated, with no embedded raw newline.
Stdout SHALL carry protocol frames and nothing else; every diagnostic, warning and error text
SHALL go to stderr. Every frame SHALL carry a `type` naming its verb and, on a request, an `id`
that the corresponding response echoes.

#### Scenario: A frame round-trips through the codec unchanged

- **WHEN** any request or response frame is encoded to a line and decoded back
- **THEN** the decoded frame equals the original frame field for field, and the encoded line
  contains exactly one `\n`, at its end

#### Scenario: Stdout carries no diagnostic text

- **WHEN** the bridge handles a frame that produces a warning, and a frame that produces an error
- **THEN** every line written to stdout parses as a JSON frame, and the warning and error text
  appear only on stderr

#### Scenario: A response is matched to its request

- **WHEN** the client sends three requests with distinct `id` values before reading any response
- **THEN** each response carries the `id` of the request it answers

#### Scenario: Unparseable input is an error frame, not a crash

- **WHEN** the client writes a line that is not valid JSON, and then writes a valid `step` frame
- **THEN** the bridge emits one `error` frame with code `malformed-frame`, remains running, and
  answers the subsequent `step` frame normally

#### Scenario: An unknown verb is refused by name

- **WHEN** the client sends a frame whose `type` is not in the verb set
- **THEN** the bridge emits an `error` frame with code `unknown-verb` naming the verb received and
  listing the verbs it accepts

### Requirement: Handshake pins the observation contract before any episode exists

The bridge SHALL complete a `hello` / `ready` handshake before it accepts any other verb. The
`ready` frame SHALL publish `protocolVersion`, `observationSchemaVersion`,
`observationLayoutDigest`, `observationSize`, `actionSpaceSize`, the candidate slot count of every
parameterized action, `scenarioId`, `contentHash` and `buildVersion`. A `hello` frame MAY declare
expected values for any of these.

A disagreement on `protocolVersion`, `observationSchemaVersion`, `observationLayoutDigest`,
`observationSize`, `actionSpaceSize` or any candidate slot count SHALL be **fatal**: the bridge
emits one `error` frame naming every disagreeing field with both values, emits no observation, and
exits non-zero. A disagreement on `scenarioId`, `contentHash` or `buildVersion` SHALL be reported in
the `ready` frame's `advisories` list and SHALL NOT prevent the session from starting.

#### Scenario: A stale layout digest refuses before the first observation

- **WHEN** a client sends `hello` declaring an `observationLayoutDigest` that differs from the
  build's
- **THEN** the bridge emits one `error` frame with code `contract-mismatch` naming
  `observationLayoutDigest` with both values, emits no frame of type `observation` or `step`, and
  exits with a non-zero status

#### Scenario: A changed content hash warns and runs

- **WHEN** a client sends `hello` declaring a `contentHash` that differs from the build's, and every
  structural field agrees
- **THEN** the bridge emits a `ready` frame whose `advisories` names `contentHash` with both values,
  and a subsequent `reset` succeeds

#### Scenario: Any verb before the handshake is refused

- **WHEN** the client sends `reset` as its first frame
- **THEN** the bridge emits an `error` frame with code `handshake-required` and creates no episode

#### Scenario: A client that declares nothing is served

- **WHEN** the client sends `hello` declaring no expectations
- **THEN** the bridge emits a `ready` frame carrying every published field and no advisories, and
  the session proceeds

#### Scenario: Every structural disagreement is named at once

- **WHEN** a client sends `hello` declaring three structural fields that all differ from the build's
- **THEN** the single `error` frame names all three fields with both values each

### Requirement: The transported layout table reproduces the published digest

The `describe` verb SHALL return the canonical layout encoding published by `agent-api` —
`layoutEncoding(OBSERVATION_SLOTS)` — as transported text, together with the digest the build
publishes. A client that recomputes the 64-bit FNV-1a digest over that text SHALL obtain the
build's `observationLayoutDigest`.

#### Scenario: The transported encoding hashes to the published digest

- **WHEN** the bridge answers `describe` and the returned encoding is hashed with the published
  FNV-1a definition
- **THEN** the result equals the `observationLayoutDigest` in the same frame, character for
  character

#### Scenario: The encoding is the one agent-api publishes, not a copy

- **WHEN** the `describe` response's encoding is compared to `layoutEncoding(OBSERVATION_SLOTS)`
- **THEN** the two are identical strings, and the bridge contains no second table of slots, blocks,
  rules or saturation constants

#### Scenario: A second implementation reproduces the digest

- **WHEN** the reference Python client computes the digest from the transported encoding using only
  the standard library
- **THEN** it obtains the same sixteen lowercase hexadecimal characters as the bridge

### Requirement: Vectorized episodes addressed by env index

The bridge SHALL host a fixed number of independent episodes, addressed by an integer `env` index
in `0..envCount-1`, declared at handshake. `reset` and `step` SHALL each carry a list of per-env
entries and return a list of per-env results in the same order. A frame naming an env index outside
the declared range SHALL produce an `error` frame naming the index and the range, and SHALL leave
every env unchanged.

#### Scenario: Envs are independent at the same seed

- **WHEN** two envs in one bridge process are reset with different run seeds and stepped in the
  same frames
- **THEN** their observations differ, and each env's final snapshot hash equals the hash a
  single-env bridge produces from the same seed and the same action sequence

#### Scenario: Vector width does not change an episode

- **WHEN** the same seed, scenario config and action sequence are driven through a bridge with
  `envCount` 1 and through env 3 of a bridge with `envCount` 8
- **THEN** the two episodes produce identical observations at every tick and an identical final
  snapshot hash

#### Scenario: An out-of-range env index changes nothing

- **WHEN** a `step` frame names env index 9 in a bridge declaring `envCount` 4
- **THEN** the bridge emits an `error` frame with code `unknown-env` naming the index and the
  range, and no env has advanced its clock

#### Scenario: Stepping before reset is refused per env

- **WHEN** a `step` frame is sent for an env that has never been reset
- **THEN** the bridge emits an `error` frame with code `no-episode` naming the env index, and no
  observation is emitted for it

### Requirement: Observation, mask and candidate lists cross the boundary unmodified

Every `reset` and `step` result SHALL carry the observation exactly as `agent-api` exported it, the
legality mask over the full action space as one entry per action id, and, for every parameterized
action, its currently-occupied candidate slots with the integer parameters each resolves to. The
bridge SHALL perform no arithmetic on an observation value, no rescaling, no clipping and no
reordering.

#### Scenario: The transported observation equals the exported observation

- **WHEN** an observation crosses the boundary and is decoded by the client
- **THEN** every one of its elements equals the corresponding element of the `Float64Array`
  `agent-api` exported, compared exactly and not within a tolerance

#### Scenario: The bridge contains no normalization

- **WHEN** the bridge's source is scanned for division, multiplication, or a saturation constant
  applied to an observation element
- **THEN** none is found, and the only float values in the package are ones received from
  `agent-api` and passed through

#### Scenario: The mask covers the whole action space

- **WHEN** any observation is transported
- **THEN** its mask has exactly `actionSpaceSize` entries, each `0` or `1`, indexed by action id

#### Scenario: Candidate slots carry their resolved parameters

- **WHEN** an observation is transported in a state where `blessMage` has candidates
- **THEN** the frame lists that action's occupied slots with the parameter tuple each resolves to,
  truncated at the action's pinned slot count, and lists no slot beyond the number of candidates
  that exist

### Requirement: An illegal action is a datum, never an error frame

A submitted action that the legality gate rejects SHALL advance the tick, SHALL report
`admitted: false` with a stable rejection reason in the step result's diagnostics, SHALL increment
the simulation's illegal-action counter, and SHALL NOT produce an `error` frame. The counter SHALL
be readable from the client so that `illegalActionRate` is measurable from Python. The rejection
reason SHALL NOT appear in the observation vector or in the mask.

#### Scenario: A masked action is a no-op and a count

- **WHEN** the client submits an action whose mask entry is `0`
- **THEN** the step result reports `admitted: false` with a rejection reason, the world tick
  advances by one, and the reported illegal-action count is one higher than before

#### Scenario: A stale candidate slot is an ordinary rejection

- **WHEN** the client submits a candidate slot that named a mage who died on the previous tick
- **THEN** the step result reports `admitted: false` with reason `empty-slot`, no `error` frame is
  emitted, and the episode continues

#### Scenario: A rejection is not in the observation

- **WHEN** two episodes reach the same world state, one having submitted only legal actions and one
  having submitted rejected actions that were no-ops
- **THEN** their observation vectors are element-wise identical

#### Scenario: The illegal-action count is readable from the client

- **WHEN** an episode ends after a known number of rejected submissions
- **THEN** the client can read a count equal to that number without reading simulation state

### Requirement: Terminal and truncated are transported as separate flags

Every step result SHALL carry `terminal` and `truncated` as two independent booleans, together
with `terminalReason`, `era`, `status` and the balance-metric deltas from `agent-api`'s outcome
record. A step result SHALL NOT carry a reward, return, score or fitness field under any name.

#### Scenario: A capped run reports truncated and not terminal

- **WHEN** an episode reaches its declared world-tick cap without ascending or stagnating
- **THEN** the final step result reports `truncated: true`, `terminal: false`, and status
  `truncated`

#### Scenario: An ascension reports terminal and not truncated

- **WHEN** an episode ends by ascension before its cap
- **THEN** the final step result reports `terminal: true`, `truncated: false`, status `ascended`,
  and a terminal reason naming one of the two ascension routes

#### Scenario: A run that ascends on its cap tick reports both

- **WHEN** an episode ascends on the same tick it reaches its cap
- **THEN** the step result reports `terminal: true` and `truncated: true`, and its status is
  `ascended`

#### Scenario: No frame carries a reward

- **WHEN** every frame schema in the protocol is enumerated
- **THEN** none contains a field named `reward`, `return`, `score` or `fitness`, and the bridge
  source contains no function that scores an outcome record

#### Scenario: Stepping a finished episode is refused rather than continued

- **WHEN** the client sends `step` for an env whose episode has terminated
- **THEN** the bridge emits an `error` frame with code `episode-over` naming the env, and the
  episode's recorded tick count does not increase

### Requirement: An episode replays from its record to an identical snapshot hash

The bridge SHALL be able to record an episode as a newline-delimited file carrying a header with the
run seed, scenario id, scenario config, protocol version, observation schema version, layout digest,
content hash and build version, followed by one line per submitted action. Replaying that record
through a fresh bridge process SHALL reach a final snapshot hash identical to the recorded one.

#### Scenario: A recorded episode replays exactly

- **WHEN** an episode is recorded and then replayed in a separate process from its record alone
- **THEN** the final snapshot hash equals the recorded final snapshot hash, character for character

#### Scenario: A record carries enough provenance to be reproduced

- **WHEN** a record's header is read
- **THEN** it names the run seed, the scenario id, the scenario config, the protocol version, the
  observation schema version, the layout digest, the content hash and the build version, with no
  field absent

#### Scenario: Replaying against a changed layout refuses rather than diverging

- **WHEN** a record whose header declares a different layout digest is replayed
- **THEN** the replay refuses with a contract mismatch naming the field and both values, and no
  comparison of snapshot hashes is reported

#### Scenario: A truncated record is refused, not partially replayed

- **WHEN** a record file ends mid-line or omits its header
- **THEN** the replay refuses with an error naming the fault, and reports no snapshot hash

### Requirement: The bridge derives no seed and builds no world

The bridge SHALL take the run seed for each env from the client's `reset` frame and SHALL NOT derive
one. It SHALL obtain its `Scenario` from a module named on the command line and SHALL NOT construct
a world itself. It SHALL depend on `@mm/agent-api` and on no other workspace package.

#### Scenario: The seed is the client's and is echoed

- **WHEN** a client resets an env with a named run seed
- **THEN** the episode header reports that same seed, and two bridges reset with it produce
  identical first observations

#### Scenario: A scenario module is loaded, not compiled in

- **WHEN** the bridge is started against two different scenario modules
- **THEN** each reports its own `scenarioId` in the `ready` frame, and neither is named in the
  bridge's source

#### Scenario: The dependency graph grants exactly one edge

- **WHEN** the workspace dependency-graph check runs
- **THEN** `gym-bridge` is described by `contracts.md` §5, its only workspace edge is to
  `agent-api`, and no package imports it

#### Scenario: A missing or malformed scenario module fails at startup

- **WHEN** the bridge is started against a module that exports no scenario factory
- **THEN** it writes an explanatory line to stderr, emits no frame on stdout, and exits non-zero

### Requirement: A Python reference client with no third-party dependencies

The change SHALL ship a Python package that speaks the protocol using only the standard library, and
whose environment adapter requires the caller to supply a reward function. The package SHALL declare
`AGPL-3.0-or-later` and SHALL carry the project's standard licence header in every source file.

#### Scenario: The package imports nothing outside the standard library

- **WHEN** every import statement in the Python package is enumerated
- **THEN** each names a standard-library module, and the package declares no install requirements

#### Scenario: An environment without an objective cannot be constructed

- **WHEN** the environment adapter is constructed without a reward function
- **THEN** construction raises, and the message says that the objective belongs to the training loop

#### Scenario: The shipped sparse reward is offered, not defaulted

- **WHEN** the package's reward helpers are enumerated
- **THEN** a sparse terminal reward is importable by name, and no code path applies it unless the
  caller passes it

#### Scenario: A reward function sees the outcome record and nothing else

- **WHEN** a reward function is invoked by the adapter
- **THEN** its single argument carries only the fields of the outcome record, with no observation,
  no info mapping and no reference to the environment

#### Scenario: A checkpoint sidecar refuses a changed layout

- **WHEN** a saved environment specification is loaded against a build whose layout digest differs
- **THEN** loading raises an observation-contract error naming the field with both values, before
  any environment is constructed

### Requirement: The throughput split is measured and recorded

The change SHALL ship a command that runs a fixed number of ticks through the bridge and reports
wall-clock time attributed to session stepping, observation reading, frame encoding and frame
decoding, together with ticks per second. The release's throughput figure SHALL be the figure this
command records.

#### Scenario: The measurement reports its split

- **WHEN** the throughput command is run
- **THEN** it reports ticks per second and a breakdown naming session step, observation read, frame
  encode and frame decode, each as a duration

#### Scenario: The measurement is excluded from every reproducibility comparison

- **WHEN** two runs of the throughput command are compared
- **THEN** the timing figures are permitted to differ, and no recorded episode, frame or snapshot
  hash carries a timing value
