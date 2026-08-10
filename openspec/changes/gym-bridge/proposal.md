## Why

The balance methodology (vision §9) says machines find the meta before humans do, and the roadmap
puts this change *before* the client for exactly that reason: whichever interface ships first
becomes the default balance signal, and human playtesters are the wrong first signal for a game
whose whole quality gate is Monte Carlo. `agent-interface` (0.5.0) already makes the game
measurable from TypeScript. This change makes it measurable from Python, where the reinforcement-
learning ecosystem actually lives.

It ships the *interface only*. Reinforcement-learning **training** is explicitly out of scope for
v1 (vision §12), and the release plan is equally explicit that no training outcome is a release
promise. The deliverable is a boundary that a researcher can drive; what they discover through it
is research, not a claim this project makes.

**This proposal is deliberately held at proposal depth** (vision §11). Specifying a cross-language
episode protocol with zero implementation experience of `agent-api` produces a document that is
confidently wrong. The open questions below are the substance of this change until `agent-interface`
has been built and profiled.

## What Changes

- Add `packages/gym-bridge`, a JSON-over-stdio server that exposes the `agent-api`
  observation/action space (contracts §4) to an out-of-process client, per the module boundary in
  contracts §5. The bridge depends on `agent-api` and on nothing in `rules-*` directly.
- Define a line-delimited JSON wire protocol over stdin/stdout with a small verb set —
  reset, step, close, and shape/version negotiation — where stdout carries protocol frames only and
  all diagnostics go to stderr.
- Carry the mandatory legality mask (contracts §4.2) across the language boundary on every
  observation, so a Python agent can mask before sampling rather than discovering illegality by
  rejection. Illegal actions remain a no-op plus a counter increment, never an exception, and the
  counter is exposed so `illegalActionRate` (contracts §7) is measurable from the Python side.
- Define episode semantics over the simulation: what constitutes reset, what terminates an episode,
  and what truncates one, mapping ascension (vision §8a) onto terminal state.
- Pin the observation shape to a declared, versioned schema identifier. A bridge whose shape
  identifier does not match the client's expectation refuses to start rather than silently
  emitting a differently-shaped vector into a trained policy.
- Ship a thin Python reference package — an environment adapter plus the wire client — with no
  dependency on any particular RL framework, so the AGPL-compatibility rule in `CLAUDE.md` is not
  strained by a heavy training-stack dependency the project does not need.
- Ship an episode-record/replay fixture proving that a recorded action sequence replayed through
  the bridge reproduces the identical final snapshot hash, which is this release's falsifiable
  claim.

Explicitly **not** included: training loops, reward shaping opinions, vectorized multi-environment
orchestration, learned baselines, or any pretrained policy.

## Capabilities

### New Capabilities

- `rl-bridge`: the out-of-process agent boundary — the JSON-over-stdio protocol, episode lifecycle
  (reset / step / terminate / truncate), observation-shape versioning and negotiation, action-mask
  transport, error and illegal-action semantics, throughput budget, and the Python reference
  client.

### Modified Capabilities

None. The bridge is a consumer of `agent-api`; it wraps the observation/action space rather than
changing its requirements. If building it proves the space cannot be transported faithfully, that
is a change to `core-contracts`, not a delta filed here.

## Impact

- **New:** `packages/gym-bridge/`, a Python reference client, wire-protocol fixtures, an
  episode-replay conformance test.
- **Depends on:** `agent-interface` (0.5.0) for `agent-api` and the observation/action space;
  `core-contracts` (0.2.0) for the observation shape and legality mask; `god-agency` (0.6.0) for
  ascension, which is the terminal condition an episode needs; `raid-engagement` (0.7.0) for the
  engagement block of the observation to be non-zero.
- **Downstream:** none in the roadmap. It is a leaf. Nothing may depend on `gym-bridge`.
- **Licensing:** the Python side must stay AGPL-compatible. Common RL stacks are permissively
  licensed, but the reference client should avoid depending on a training framework at all, which
  removes the question rather than answering it repeatedly.
- **Risk accepted:** the wire protocol is a contract with an out-of-process, out-of-language
  consumer, and it freezes at 1.0.0 alongside the agent API. Mitigated by shipping the shape
  identifier from day one, so a mismatch is a startup failure rather than a silently corrupted
  training run.

## Open Questions Blocking Specification

These must be answered by implementation experience — chiefly from building `agent-interface` and
`god-agency` — before `rl-bridge` can be specified. Each is written so that a specific measurement
or decision closes it.

**Observation shape is not yet actually fixed.** Contracts §4.1 sizes the `ruleset` block as
`19 + 2 × edictBudgetMax`, but the edict budget and its growth with worship tier are deferred to
`god-agency` (vision §13). Until `edictBudgetMax` is a constant, the "fixed shape across a run and
across universes" guarantee that RL depends on does not hold. Does the bridge pad to a permanent
maximum chosen now and never exceeded, or does the shape identifier encode the budget so that
retuning the budget invalidates trained policies? The second is honest; the first is usable. This
is the single largest blocker.

**There is no reward channel anywhere in the contracts.** Contracts §4 defines observations,
actions, and a mask — and nothing else. An environment step conventionally returns a reward. Does
the bridge define one, and from what: ascension as a sparse terminal reward, a shaped signal
derived from the balance metrics in contracts §7, or no reward at all with the researcher supplying
their own function over the observation? Shipping reward-free is defensible and keeps the project
out of the business of asserting what a good universe is; it also makes the bridge unusable with
off-the-shelf algorithms without a wrapper. Decide deliberately, not by omission.

**What terminates an episode, and what merely truncates it?** Ascension is a clean terminal
(vision §8a) and is exactly why ascension exists. But the same section says defeat is *not* the
opposite of ascension — a universe raided to ruin stagnates rather than losing. Is stagnation a
terminal state, and if so what is its detection rule? Nothing in the contracts bounds the length of
a world run the way portal stability bounds a raid, so without a stagnation terminal or a tick cap,
a non-ascending episode never ends. And if the cap is a truncation, the bridge must distinguish
truncation from termination on the wire, because conflating them corrupts value bootstrapping.

**Does a raid live inside an episode, or is it an episode?** A raid pauses world time for both
participants (vision §8) and switches clock mode, during which actions 1–7 and 13 are masked out
entirely. That is a large, structured mode change inside one episode. Is the god a single agent
across both clocks, or is engagement a separate environment with its own shape? The `engagement`
block being zeroed at world scale (contracts §4.1) suggests one agent across both — confirm that
survives contact with `raid-engagement`.

**What is the throughput budget, and where does it actually go?** The release claim is a *recorded*
figure, not an asserted one, but the bridge must know what it is optimizing. JSON encode/decode per
step across a pipe is the obvious suspect; so is the `fp`-normalization pass, which is the one
place floats are permitted (contracts §4.1). Measure the split between simulation time,
serialization, and pipe latency before choosing whether the protocol needs a binary or batched
mode. Do not add batching speculatively — it complicates episode boundaries badly.

**Can a single bridge process host multiple concurrent universes?** RL wants many parallel
environments; the `mc-harness` already runs a worker pool over the same core (contracts §5). Should
the bridge multiplex several universes over one stdio pair with an environment index in each frame,
or should the Python side run N processes and leave concurrency to the operating system? The second
is dramatically simpler and probably right, but only benchmarking against the harness's worker pool
answers it.

**How are actions with parameters encoded, and how are their parameters masked?** Contracts §4.2
lists a flat discrete action space, but actions 8–14 carry entity handles (`mageId`, `nodeId`,
`universityId`, `targetUniverseId`) drawn from a set that changes size every tick. A flat discrete
mask cannot express "action 9 is legal, but only for these 40 of 3,000 mage handles." Does the
bridge expose parameters as separate masked heads, expose a slot-indexed view of the top-*k*
entities, or something else? This is the hardest cross-boundary design problem in the change, and
it is unanswerable until `agent-api` exists and the real entity counts from `sim-core-foundation`
benchmarking are known.

**How are handles kept stable across a step?** Entity IDs are `uint32` handles with a generation
counter (contracts §0). A Python agent that observes at tick *t* and acts at tick *t+1* may be
naming a mage who died. Is a stale handle an illegal action, a no-op, or an error frame — and does
it increment `illegalActionRate`, which is documented as a spec-clarity smell rather than an
agent-competence measure?

**What is version-pinned, exactly?** Trained policies break on observation-shape changes, action-
space changes, content changes that alter semantics without altering shape, and primitive retuning
that alters nothing structural at all. The release plan makes shape changes a MINOR pre-1.0 and a
MAJOR after. Should the shape identifier be a hash over the content set as well as the vector
layout, so that a retuned universe is visibly a different environment? That may be too strict to
be usable during balance tuning, which retunes constantly.
