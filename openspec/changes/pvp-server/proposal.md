## Why

The portal rule — the host universe's ruleset governs all magic cast inside it, for both attacker
and defender (vision §3) — is only fully interesting when the other universe belongs to another
person, with their own permit/forbid decisions made for their own reasons. Until then, raiding is
a player against a scripted opponent whose ruleset the player's own design produced.

This change makes universes fight across a network, authoritatively. It is the payoff for the
determinism constraint established in 0.1.0: because the same seed and action log produce a
byte-identical snapshot hash across processes and machines, two clients can run the same
engagement and be *checked* against each other rather than trusted. The release claim — zero
desyncs across 1,000 automated matches — is only meaningful because of that earlier work.

**Hosting is a fixed constraint, not a later decision.** Published under Multiverse Games, hosted
on Hetzner Cloud, provisioned via the `hcloud` CLI (vision §10). Self-hosted Linux VMs only: plain
containers or systemd units, no managed-cloud primitives, no vendor serverless, and nothing that
only one provider offers. That constraint is also what keeps the AGPL's network source-offer
obligation practical to honour (`CLAUDE.md`) — anyone can stand up the same server the same way,
which is the difference between a source offer that means something and one that does not.

**This proposal is deliberately held at proposal depth** (vision §11). Netcode specified without
having run a single engagement over a real link is the archetype of a document that is confidently
wrong.

## What Changes

- Add `packages/server`: an authoritative Node process running the same `sim-core` as every other
  consumer, depending on `agent-api` and nothing client-side (contracts §5).
- Run raids as **lockstep deterministic engagements** between two persisted universe snapshots
  (project.md, Tech Stack). Clients submit actions; the server advances the authoritative
  simulation; clients render from server-derived state and compute no rules.
- Detect desync using the snapshot hash that `deterministic-replay` already produces, rather than
  inventing a second integrity mechanism. A hash mismatch is a hard, reported, logged event — never
  a silent correction.
- Define a snapshot wire format. Contracts §8 explicitly defers this here, so it is this change's
  to invent, and it must not become a second serialization that drifts from `world-persistence`.
- Persist universes between sessions and between runs, including prestige carried across ascension
  (vision §8a), with the run boundary as the persistence boundary.
- Support **direct challenge** between two players. Vision §12 puts matchmaking beyond direct
  challenge out of scope for v1, so the capability is named `direct-challenge` rather than `matchmaking` and is scoped
  here to challenge issuance, acceptance, and session establishment — not ranking, not a queue,
  not a ladder.
- Define disconnection and abandonment semantics for a raid in progress, where casualties are
  permanent and lost knowledge is genuinely lost (vision §8).
- Freeze the ruleset for the duration of a raid across the network boundary, enforcing the
  same rule the action mask already enforces locally (contracts §4.2): actions 1–7 and 13 are
  masked while `clock.mode == engagement`, for both participants.
- Provision and deploy via `hcloud`: reproducible instance creation, containers or systemd units,
  configuration and secret handling that never places a secret in this public repository
  (`CLAUDE.md`), backups of persisted universes, and a documented path for a third party to stand
  up an identical server from source.
- Ship the automated match harness that runs 1,000 matches and compares final snapshot hashes,
  since the release claim is worthless without the machinery that could disprove it.

## Capabilities

### New Capabilities

- `authoritative-lockstep`: the netcode — session and tick model, action submission and ordering,
  the authoritative step, snapshot and delta transport, desync detection via snapshot hash, latency
  and clock handling, and disconnect/reconnect behaviour.
- `direct-challenge`: session establishment between two players — direct challenge issuance and
  acceptance, identity, universe eligibility, and match lifecycle. Scoped to direct challenge only
  for v1 per vision §12.
- `universe-persistence`: authoritative storage of universes across sessions and across runs,
  including prestige carry-forward, snapshot versioning and migration, and the durability guarantee
  a permanent-consequence game requires.
- `hetzner-deployment`: provisioning and operating the server on Hetzner Cloud via `hcloud` — image
  and instance definition, process supervision, configuration and secrets, backups, observability,
  and the reproducible-from-source path that the AGPL source offer depends on.

### Modified Capabilities

None. The server is a consumer of `agent-api` and of `world-persistence`. If the wire format proves
that the snapshot schema cannot be transported efficiently, that is a change to `core-contracts` or
`sim-core-foundation`, not a delta filed here.

## Impact

- **New:** `packages/server/`, a wire-format definition and its fixtures, a persistence layer, an
  automated match harness, `hcloud` provisioning scripts, and deployment documentation sufficient
  for a stranger to reproduce the deployment.
- **Depends on:** `sim-core-foundation` (0.1.0) for determinism, snapshots, and the snapshot hash;
  `core-contracts` (0.2.0) for the state schema and action mask; `agent-interface` (0.5.0) for the
  read/act path; `raid-engagement` (0.7.0) for the engagement being transported; `electron-client`
  (0.9.0) for a client to connect.
- **Downstream:** nothing depends on `server` (contracts §5, rule 2).
- **Legal:** the AGPL network clause applies directly to this package — anyone running a modified
  server as a service must offer its source to users. The design must keep that path intact:
  no proprietary deployment dependency, no service-only component, no configuration that only the
  original operator can reproduce.
- **Risk accepted:** this is the only change in the roadmap whose correctness depends on conditions
  outside the process — packet loss, clock skew, hostile clients. Determinism converts most of
  those from silent corruption into detectable mismatch, which is the whole reason it was bought
  first.

## Open Questions Blocking Specification

**Does world time advance for uninvolved universes during someone else's raid?** Vision §13 defers
this question explicitly to `pvp-server`, which makes it this change's to answer. A raid pauses
world time for both participants (vision §8). If uninvolved universes keep running, a player who is
never raided accrues world time that a besieged player does not, and being attacked becomes a
tempo loss on top of its material loss. If everything pauses globally, one pair of players stops
the world for everyone — unacceptable at any scale. Neither is obviously right, and the answer
changes the persistence model, the session model, and the balance harness's notion of a run.

**Is lockstep the right model at all, and lockstep over what?** Lockstep is stated in project.md,
and determinism makes it viable. But classic lockstep advances only as fast as the slowest peer,
and an engagement tick is 100 ms of fictional time (contracts §0) whose wall-clock pacing nobody
has chosen yet. Is the authoritative server running the simulation and broadcasting results with
clients as pure viewers, or are clients simulating in lockstep with the server as arbiter? The
first is simpler and matches "the renderer computes no rules"; the second is what makes hash
comparison a meaningful check rather than a tautology. If clients do not simulate, the desync
claim degenerates into comparing the server against itself.

**Is delta compression needed, and against what baseline?** Unknown until a snapshot's real size is
known — which depends on `sim-core-foundation` benchmarking (how many mages) and on the knowledge
instance count, which is unbounded by design since every copy of every node is a row. Full
snapshots are simple and verifiable; deltas are smaller and introduce an entire class of state
divergence bugs that determinism does not protect against, because a mis-applied delta is not a
simulation error. Measure a real snapshot first. Note also that engagement entities are explicitly
not written to world snapshots (contracts §1.6), so raid transport and world transport may need
different answers.

**What happens when a player disconnects mid-raid?** Casualties are permanent, and knowledge whose
last instance dies is lost (vision §8). So a disconnect cannot be a free undo, and it cannot be a
total forfeit either, or disconnecting becomes a grief tactic against the *other* player by denying
them the objective. Options: play the absent side out under the raid AI (mages act autonomously
anyway, which makes this unusually defensible for this game); freeze and allow reconnection within
a window bounded by portal stability; or resolve immediately at current objective state. The
autonomy pillar makes the first option philosophically coherent — the god was never issuing orders
— but whether it is *acceptable* to the player who was disconnected is a playtest question.

**What is authoritative for the ruleset when the two universes disagree, at the wire level?**
Arbitration is settled in design — the host's ruleset governs, always the defender (contracts §1.6,
`hostUniverseId`) — but the raider's *tradition* still governs acquire and store while the host's
governs cast and cost (vision §4a). So an engagement needs both universes' content and rule state
resident and correctly attributed. Does the server hold both universes fully, and what does it do
when the two clients were built against different content revisions? Content revision must be part
of match eligibility, and no mechanism for that exists.

**How is a hostile or modified client handled?** The AGPL guarantees players the source, so modified
clients are not an anomaly, they are a right the licence grants. Since the server is authoritative
and the client computes no rules, a modified client should be unable to affect outcomes — but it
can submit malformed or illegal actions at high rate, and the contract says illegal actions are a
no-op plus a counter increment, never an exception (contracts §4.2). That is correct behaviour for
an RL agent and an unbounded-work invitation for a hostile peer. Rate limiting, action-budget
enforcement, and what a desync report means when one side is deliberately lying all need real
answers, and none can be inferred from the contracts.

**What exactly is persisted, at what granularity, and how is it migrated?** A universe is
long-lived and spans versions, and pre-1.0 every MINOR may break contracts (release plan). A saved
universe that cannot be loaded after an upgrade destroys a player's run. Is persistence the
snapshot, the seed plus the action log (small, exactly reproducible, replays get slower without
bound), or both? The action-log option is attractive precisely because determinism already
guarantees it works, and it makes desync forensics trivial, but replay cost grows with the age of
the universe.

**Where does prestige live, and who can be trusted with it?** Prestige is read-only during a run
(contracts §1.1) and carries forward across ascension. `prestigeAdvantage` must stay under 60%
(contracts §7), which the balance harness can measure offline — but in live play, prestige is a
persistent account-level value and therefore the first thing worth cheating. This is also the first
point where the project holds anything resembling a player account, which the public-repository and
privacy rules in `CLAUDE.md` bear on directly.

**How much does a session cost to host, and how many fit on an instance?** `hcloud` provisioning
needs a target instance size, and that needs the per-match memory and CPU cost of holding two
universes plus an engagement — unknown until `raid-engagement` and the 0.1.0 benchmark exist.
Whether a match is a process, a worker thread, or a coroutine on a shared loop follows from that
number and cannot be chosen before it.

**Naming tension worth flagging:** the roadmap names a `matchmaking` capability while vision §12
puts matchmaking beyond direct challenge out of scope for v1. The capability ID is kept as the
roadmap declares it, and its v1 scope is direct challenge only. If the name is retained through
1.0.0, it will read as a promise of a queue that was never intended.
