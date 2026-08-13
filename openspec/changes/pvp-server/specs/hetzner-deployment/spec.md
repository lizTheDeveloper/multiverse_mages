## ADDED Requirements

### Requirement: The deployment is reproducible from source by a stranger

The server SHALL be deployable from this repository's source by a third party with no access to the
original operator's accounts, using only self-hosted Linux VMs, plain containers or systemd units.
The deployment MUST NOT depend on a managed-cloud primitive, a vendor serverless product, or any
service only one provider offers. This is what makes the AGPL's source offer meaningful:
`CLAUDE.md` requires the source-offer path stay intact, and an offer nobody can act on is not one.

#### Scenario: A third party stands up an identical server

- **WHEN** someone with no relationship to the original operator follows the deployment
  documentation
- **THEN** they obtain a running server of the same version, without needing an account, key or
  endpoint belonging to anyone else

#### Scenario: No provider-only primitive is required

- **WHEN** the deployment's dependencies are enumerated
- **THEN** every one is a Linux VM, a container runtime, a process supervisor, or software in this
  repository

#### Scenario: Provisioning is scripted and repeatable

- **WHEN** instance creation is run twice against the same configuration
- **THEN** the two instances are equivalent, and the procedure is a committed script rather than a
  remembered sequence

### Requirement: No secret is ever stored in this repository

Configuration and secret handling SHALL be designed so that no credential, token, key, endpoint or
`.env` file is committed, at any point, including as a placeholder that resembles a real value. The
server SHALL take its non-sensitive configuration as process arguments, and any credential a future
component needs SHALL be supplied through the process environment at run time.

#### Scenario: The repository holds no credential

- **WHEN** the repository is scanned for keys, tokens, credentials or private endpoints
- **THEN** none is found, in the working tree or in the history

#### Scenario: The server needs no secret to run

- **WHEN** the server is started for a match
- **THEN** it requires only a scenario module path, a port and a bind address, none of which is
  sensitive

#### Scenario: A secret is never a default

- **WHEN** any configuration option is added
- **THEN** it has no default that is or resembles a credential, so that a missing secret is a
  refusal rather than a silent fallback

### Requirement: The server binds loopback unless told otherwise

The server SHALL bind the loopback interface by default, and SHALL expose itself on another
interface only when explicitly configured. A server reachable from the network by default is a
server exposed by a typo.

#### Scenario: The default binding is not public

- **WHEN** the server is started without a bind address
- **THEN** it listens on loopback only

#### Scenario: Exposure is a deliberate act

- **WHEN** an operator binds a non-loopback interface
- **THEN** they have named that interface explicitly in the command that started the process

### Requirement: The process is supervised and its lifecycle is observable

The server SHALL run under a process supervisor that restarts it on failure, SHALL write
operator-facing output to a stream separate from any protocol output, and SHALL shut down cleanly
on the standard termination signals.

#### Scenario: Operator output does not contaminate protocol output

- **WHEN** the server writes a log line
- **THEN** it goes to the operator stream, and the only thing on the structured stream is the
  bound-port line a supervisor reads

#### Scenario: Termination is clean

- **WHEN** the process receives an interrupt or termination signal
- **THEN** it closes its listener and its connections and exits without leaving a bound port

#### Scenario: A crash is restarted and recorded

- **WHEN** the process exits unexpectedly
- **THEN** the supervisor restarts it and the exit is visible to the operator

### Requirement: Desyncs and match outcomes are observable in operation

Every desync SHALL produce an operator log line naming the match, tick, slot, participant and both
hashes, and stating that nothing was corrected. Every match start and end SHALL be logged with its
identifier and reason. The release claim of zero desyncs across 1,000 matches is only checkable if
a desync is visible when it happens.

#### Scenario: A desync is greppable

- **WHEN** a desync occurs in a running deployment
- **THEN** one log line carries every value a post-mortem needs, including both hashes

#### Scenario: Match outcomes are countable

- **WHEN** an operator counts matches and their end reasons over a period
- **THEN** the logs support that count without additional instrumentation

### Requirement: Persisted universes are backed up

Persisted universes SHALL be backed up on a schedule, and a restore SHALL be exercised rather than
assumed. In a game where casualties are permanent, a lost store is a destroyed run for every player
in it.

#### Scenario: A backup exists and is recent

- **WHEN** the persisted store is inspected
- **THEN** a backup exists whose age is within the stated interval

#### Scenario: A restore is proven, not assumed

- **WHEN** a restore is performed into a clean instance
- **THEN** the restored universes load, and their snapshot hashes equal those recorded at backup time
