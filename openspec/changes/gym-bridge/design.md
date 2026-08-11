## Context

`proposal.md` was **deliberately held at proposal depth**. Its own words:

> Specifying a cross-language episode protocol with zero implementation experience of `agent-api`
> produces a document that is confidently wrong. The open questions below are the substance of this
> change until `agent-interface` has been built and profiled.

That experience now exists. `agent-interface` shipped `packages/agent-api` with an episode-level
session — `reset` / `observe` / `legalActions` / `candidates` / `submit` / `status` / `outcome` /
`accounting` — plus `OBSERVATION_LAYOUT_DIGEST`, `OBSERVATION_SCHEMA_VERSION` and a slot-indexed
candidate list per parameterized action. `god-agency` shipped ascension and stagnation, so an
episode has a terminal condition that is not a tick cap. `scenario` shipped the composition root
that turns shipped content into a real `SimState`. `mc-harness` shipped a worker pool, derived
seeds, canonical-order aggregation and the committed baselines.

So this design document does two things, in this order:

1. **Closes every open question in `proposal.md`**, each with the contract sentence or the shipped
   code that closes it, and each with a decision that could have gone the other way.
2. **Draws the boundary as thin as it will go.** Nine tenths of what an RL bridge conventionally
   contains already exists one package down. The failure mode available here is not *missing*
   functionality; it is a second implementation of functionality that exists — a second
   normalization, a second seed derivation, a second concurrency story, a second reward — each of
   which would quietly decouple what a learned agent optimizes from what the balance gates measure.

Three constraints bind everything below.

**The bridge is a transport, not a layer.** `contracts.md` §5 gives it one edge, to `agent-api`.
Every number that crosses the pipe is a number `agent-api` produced, unmodified. The strongest
version of that rule is the one implemented: the bridge contains no arithmetic on an observation
value at all.

**Reproducibility is the release claim.** `docs/design/release-plan.md` §0.11.0: *"The Python
bridge sustains the recorded observation/action throughput and reproduces a recorded episode
exactly,"* disproved by *"a replayed episode diverging."* That makes the recorded episode a
first-class artifact of this change, not a test fixture.

**A trained policy is a consumer that cannot read a changelog.** `OBSERVATION_LAYOUT_DIGEST` exists
because a baseline must refuse to compare across a changed layout. A checkpoint is exactly the same
kind of consumer, with a worse failure mode: a baseline that silently compares produces a wrong
number, and a checkpoint that silently loads produces a policy whose inputs mean something else
while every array shape still matches.

## Goals / Non-Goals

**Goals:**

- One out-of-process boundary that carries §4's observation, legality mask, candidate lists and
  outcome record to a Python process, faithfully and in a format a human can read in a log.
- A recorded episode that replays to the identical final snapshot hash, through the bridge, in a
  different process.
- A handshake that refuses a client whose observation contract does not match the build's, before
  a single observation is emitted.
- A Python reference package with **zero third-party dependencies**, so the AGPL-compatibility rule
  never has to be re-litigated for a training-stack transitive.
- A recorded throughput figure with its split named — simulation, observation, serialization, pipe
  — so the release claim is a measurement rather than an assertion.

**Non-Goals:**

- Training loops, curricula, learned baselines, pretrained policies. Vision §12 puts RL *training*
  out of scope for v1 and the release plan explicitly does not claim a training outcome.
- A reward function. §4.3 puts the objective in the training loop. The bridge carries the outcome
  record and nothing derived from it.
- Sweeps, baselines, gates, tournaments. `mc-harness` has all four, and the bridge deliberately
  offers no path to them — see *Vectorized environments* below.
- A network transport. §4.2's admission-policy paragraph names `gym-bridge` *"if ever exposed
  remotely"* as a layer that would need rate limiting and disconnection. It is not exposed remotely
  here, and the reason that is a design decision rather than an omission is argued below.
- A binary or batched-tick wire encoding. The proposal says *"do not add batching speculatively — it
  complicates episode boundaries badly."* That instruction is followed.

## Decisions

### The process boundary is newline-delimited JSON over stdin/stdout, and stdout carries frames only

One JSON value per line, UTF-8, `\n`-terminated. The client writes request frames to the bridge's
stdin and reads response frames from its stdout. **Every diagnostic, warning, stack trace and
progress line goes to stderr**, and the bridge never writes a non-frame byte to stdout.

Vision §10 already names this — *"Python RL bridge over JSON-over-stdio"* — and vision is the
vision of record, so the burden here is to argue it rather than to choose it. It survives the
argument:

*Alternative considered:* a TCP or Unix socket. Rejected on **admission policy**, which is a
security decision and not an ergonomic one. §4.2 states that the core assumes a trusted caller and
that *"any layer accepting actions across a trust boundary MUST apply its own admission policy —
rate limiting, disconnection — before the action reaches the core."* A socket makes the bridge such
a layer and obliges it to grow one. A stdio pipe's admission policy is the operating system's: the
only writer is the process that spawned it. Choosing the transport that removes the obligation is
better than choosing the one that creates it and then discharging it correctly.

*Alternative considered:* a shared-memory ring buffer, which is what a throughput-first design would
pick. Rejected on **recordability**, which is this release's claim. An NDJSON stream is its own
recording format: `2>/dev/null | tee episode.ndjson` produces an artifact that replays. A ring
buffer has no on-the-wire representation at all, so proving "a recorded episode replays exactly"
would require inventing a second, serialized format solely to record it — and then the property
proven would be a property of the second format. The proposal asks for the split to be *measured*
before a binary mode is chosen; it is measured (below) and the mode is not added.

*Alternative considered:* a file-based request/response directory, the simplest thing that could
work. Rejected: an RL step loop is interactive by construction, and filesystem round-trips per tick
are strictly worse than a pipe on every axis including simplicity.

**Observations travel as JSON number arrays, not base64 float buffers.** Round-tripping a `double`
through JSON is exact in both languages — ECMA-262 specifies the shortest round-tripping decimal for
`Number::toString`, and CPython's `float()` is correctly rounded — so nothing is lost. What is
gained is that a frame in a log is readable, which is what makes a divergence debuggable at 3 a.m.
The base64 alternative saves roughly a third of the bytes and costs all of that.

### The bridge is one process, one universe per env slot, and parallelism is the client's business

A bridge process hosts a **vector** of *N* `agent-api` sessions, addressed by an integer `env`
index that appears in every frame. `reset` and `step` are vectorized: one frame carries a list of
per-env entries, and one response frame carries a list of per-env results.

**This is amortization, not parallelism, and the distinction is the whole decision.** Stepping *N*
universes in one frame pays the JSON encode/decode and pipe round-trip once instead of *N* times;
it does not use a second core. Parallelism across cores is achieved the way the operating system
already achieves it: the Python side runs *M* bridge processes. `subprocess` is in the standard
library, so this costs the reference client nothing and adds no dependency.

**What that decision refuses to build, and why that is the reuse.** The instruction here is to reuse
the harness's worker pool rather than build a second concurrency story. The honest reading, having
read the pool: `mc-harness`'s pool cannot host a stepping session, and the reuse is therefore not to
wrap it but to **decline to compete with it**.

`RunExecutor` is `(task: RunTask) => RunOutcome` — it runs a whole episode to termination inside a
worker and returns an outcome. A policy living in a Python process cannot be inside that call. To
host a stepping session in the pool, the executor contract would have to be inverted into a
coroutine, and there would then be two ways to drive a universe: one for the harness and one for the
bridge. That is precisely the *"building it twice guarantees divergence"* failure §4 opens with,
and it would be built in the layer whose entire purpose is to not diverge from §4.

So the split is drawn by whether a Python policy is in the loop:

| Work | Where it runs | Concurrency |
|---|---|---|
| Sweeps, baselines, gates, tournaments, ablation — no learned policy | `mc-harness`, driven by `mm-run-sweep` | its `worker_threads` pool, derived seeds, canonical aggregation |
| A learned or learning policy stepping universes | `gym-bridge` | *N* envs per process for amortization, *M* processes for cores |

The bridge ships **no sweep mode, no rollout mode, no baseline mode and no aggregation**. A caller
who wants ten thousand episodes without a Python policy in the loop is asking for the harness, and
the bridge's CLI says so in its help text rather than growing a worse version of it.

**Seeds are named by the client, never derived by the bridge.** `mc-harness` publishes
`deriveRunSeed(rootSeed, sweepId, cellIndex, replicateIndex)` with a `SEED_DERIVATION_VERSION`, and
§5 does not grant the bridge an edge to it. Re-deriving it here would be a second implementation of
a published, versioned constant — the same class of mistake as a second normalization, and equally
silent when it drifts. The `reset` frame therefore carries an explicit `runSeed` per env, the
episode header echoes it, and a caller who wants harness-derived seeds computes them with the
harness and passes them in.

### Reward does not exist on the wire, and the Python adapter refuses to invent one

There is no `reward` field in any frame. The `step` response carries §4.3's outcome record —
`terminal`, `truncated`, `terminalReason`, `era`, `metricDeltas` — and nothing scored.

This is §4.3 enforced rather than restated: *"The core emits no reward. Reward is a property of a
training objective, not of the game, and baking one in would make every trained agent a hostage to
one researcher's choice."* `agent-api` already holds that line — `outcomeOf` reports facts,
`RewardFunction` is a parameter typed to see the record *and nothing else*, and
`sparseTerminalReward` is a shipped default that the session does not wire in.

The temptation to break it lives on the Python side, because the conventional `Env.step` returns a
reward and an env that does not is unusable with off-the-shelf algorithms. The reference client
resolves that without moving the boundary:

- `MageEnv.__init__` takes a **required** `reward_fn` parameter. There is no default. Constructing
  an environment without naming an objective raises `TypeError`, which is the loudest available way
  to say that the objective is the researcher's.
- `mm_gym.rewards.sparse_terminal` is importable by name and is the Python twin of
  `sparseTerminalReward` — ascension `+1`, everything else `0`. Offering it is not defaulting to it.
- A `reward_fn` receives an `Outcome` dataclass built from the outcome record, and nothing else —
  not the observation, not the info dict, not the env. The signature is the enforcement, exactly as
  it is in TypeScript.

A test asserts that no frame schema in the protocol contains a key named `reward`, `return`,
`score` or `fitness`. That test is worth its line: the field would be added by someone being
helpful, not by someone being careless.

*Alternative considered:* shipping the sparse terminal reward as a default so the env is usable
out of the box. Rejected — a default is what gets measured, and the first paper written against
this bridge would be about the default whether or not its author chose it.

### The observation contract is pinned by handshake, and refusal is the default

Before any episode exists, the client sends a `hello` frame that MAY declare the contract it was
built or trained against. The bridge replies with a `ready` frame declaring its own. The pairing
splits into two sets, and the split is the substance of the decision:

**Structural — a mismatch is fatal.** `protocolVersion`, `observationSchemaVersion`,
`observationLayoutDigest`, `observationSize`, `actionSpaceSize`, and the per-action candidate slot
counts. If the client declared any of these and the bridge disagrees, the bridge emits one `error`
frame naming every disagreement, closes stdout, and exits non-zero. **No observation is ever
emitted.** These are the quantities a checkpoint's weight shapes and index semantics depend on.

**Advisory — a mismatch is reported and recorded, never fatal.** `contentHash`, `buildVersion`,
`scenarioId`. The proposal raises exactly this question and answers it correctly:

> Should the shape identifier be a hash over the content set as well as the vector layout, so that
> a retuned universe is visibly a different environment? That may be too strict to be usable during
> balance tuning, which retunes constantly.

It is too strict. Balance tuning retunes content on a daily cadence, and a bridge that refused to
start after every primitive tweak would be a bridge people run with the check disabled — which is
strictly worse than one that reports. So the content hash is **carried in every episode header and
in the recorded provenance block**, and the Python side surfaces it as a warning. A run's provenance
therefore always says which content it was, and the researcher decides whether that invalidates
their checkpoint. The structural set decides for them, because there the answer is never a judgement
call.

**The client can verify the digest rather than trust it.** `digest.ts` argues that FNV-1a was chosen
so *"a second implementation can follow [it] from the document rather than from the source"*, and
exports `layoutEncoding` because *"a digest whose input cannot be inspected is a digest nobody can
debug."* The `describe` frame transports that canonical encoding — one header line and one line per
slot — and `mm_gym.layout.digest_of()` recomputes the 16-hex-character FNV-1a over it in pure
Python. A client that recomputes a different digest from the table it was handed has caught a
bridge that is misreporting its own layout, which is the one failure a declared digest cannot catch
by itself.

**How a checkpoint is actually prevented from loading against a changed layout.** The mechanism has
to survive being forgotten, so it is made the path of least resistance:

- `mm_gym.EnvSpec` is a frozen dataclass holding the whole contract, obtained from a live bridge
  with `MageEnv.spec` and serializable with `EnvSpec.to_json()`.
- `EnvSpec.save(path)` writes a sidecar next to a checkpoint. `EnvSpec.require(path)` loads one and
  raises `ObservationContractError` on any structural disagreement, naming each field with both
  values.
- `MageEnv(..., expect=EnvSpec.load(path))` passes the declaration into the `hello` frame, so the
  refusal happens **in the bridge, before the first observation**, rather than in Python after a
  policy has already been constructed.

The two halves are deliberate: the sidecar catches a checkpoint loaded against a rebuilt bridge, and
the handshake catches a bridge started against a stale client. Either alone leaves a door.

### Every open question in `proposal.md`, closed

The proposal lists nine blockers. Each is closed by a contract sentence, shipped code, or a decision
above. They are enumerated here rather than left implicit, because a proposal that was held open for
a stated reason should be visibly closed for a stated reason.

**1. "Observation shape is not yet actually fixed."** Closed. `EDICT_BUDGET_MAX` is a permanent
structural constant in `@mm/state`, the ruleset block is `19 + 2 × 8 = 35`, and `OBSERVATION_SIZE`
is a fixed 400. The proposal asked whether the bridge pads to a permanent maximum or encodes the
budget in the shape identifier. Neither is needed: the budget is a constant and the *digest* covers
the whole slot table, so raising it would change the digest and the handshake would refuse. The
honest option and the usable option turned out to be the same option once the constant was pinned.

**2. "There is no reward channel anywhere in the contracts."** Closed by §4.3 and by
`agent-api/src/outcome.ts`. See *Reward* above.

**3. "What terminates an episode, and what merely truncates it?"** Closed. `god-agency` defined
stagnation, `TERMINAL_REASON` distinguishes `ascensionApotheosis`, `ascensionCanon` and
`stagnation`, and `agent-api`'s `EpisodeStatus` is `running | ascended | stagnated | truncated`.
Terminal and truncated are **separate booleans** on the wire, never one enum, for §4.3's stated
reason — *"bootstrapping value estimates through the two differs, and conflating them is a silent
training bug."* A run that ascends on the tick it hits the cap is terminal *and* truncated, and the
frame says both.

**4. "Does a raid live inside an episode, or is it an episode?"** Closed by §4.3: *"A raid is inside
an episode, not its own episode."* The bridge implements that sentence by containing nothing about
raids at all — the clock mode is one channel of the observation and the engagement block is 64
channels of it, and neither is special-cased anywhere in this package. **Stated honestly:**
`raid-engagement` is in flight, so the engagement block is zero in every run this release can
produce. That is a fact about the build, not about the protocol.

**5. "What is the throughput budget, and where does it actually go?"** Closed by measuring rather
than by choosing. `bin/throughput.mjs` runs a fixed number of ticks and reports the split — session
step, observation read, frame encode, frame decode — and the release claim is the recorded figure.
No binary mode and no tick batching are added, per the proposal's own instruction.

**6. "Can a single bridge process host multiple concurrent universes?"** Closed: yes, as a vector
for amortization; no, as a parallelism story. See *Vectorized environments* above.

**7. "How are actions with parameters encoded, and how are their parameters masked?"** Closed by
§4.4 and by `agent-api/src/candidates.ts`, which shipped the slot-indexed candidate list the section
prescribes. The wire carries, per parameterized action, the list of currently-occupied slots and the
integer parameters each resolves to; the client submits `{action, slot}`; the bridge passes
`{kind: action, params: [slot]}` to `submit`, which re-derives the lists against current state. The
bridge resolves nothing itself — resolution is `agent-api`'s, and a bridge that cached a candidate
list would reintroduce the stale-handle bug §4.4 exists to kill.

**8. "How are handles kept stable across a step?"** Closed by §4.4: *"A slot referring to an entity
that died between observation and action is an ordinary illegal action."* Ordinary means a no-op and
a counter increment, and the step response reports `admitted: false` with the rejection reason in a
diagnostics object. It is never an `error` frame — error frames are reserved for **protocol** faults
— and it always increments the counter `illegalActionRate` is computed from.

**9. "What is version-pinned, exactly?"** Closed by the structural/advisory split above.

### An illegal action is a datum, not an error, and the protocol keeps the two apart

Two failure vocabularies, and conflating them is how an RL bridge becomes unusable:

- **Rejections** are part of normal play. §4.2: *"RL agents will submit illegal actions constantly;
  that must be cheap and observable."* A rejection appears as `admitted: false` plus a `rejection`
  string in the step result, the tick still advances, and `illegalActionCount` still increments.
- **Errors** are protocol faults: unparseable JSON, an unknown verb, a frame naming an env index
  that does not exist, `step` before `reset`, a structural handshake mismatch. These produce an
  `error` frame carrying a stable `code`, and only a handshake mismatch is fatal.

`gate.ts` says the rejection reason is *"never fed back to the agent: it is not in the observation,
and making it one would be a channel the mask does not have."* The bridge honours that literally —
the reason is not in the observation vector and not in the mask — and puts it in a diagnostics
object the Python adapter surfaces as `info`, which is where the reference client's docstring says a
learning signal must not come from. That is the same compromise `agent-api` already makes for its
TypeScript callers, made once more at the same altitude rather than tightened here and loosened
there.

### Episode recording is the release claim, and the record is the wire

The bridge records an episode as an NDJSON file: a header carrying the full provenance block, then
one line per submitted action. Replay reads it back, drives a fresh bridge process, and compares the
final `snapshotHash`.

The record contains **actions and provenance, never observations**. An observation is a pure
function of the state, so recording one would be recording a derived quantity — and a replay that
compared observations would pass or fail on the *normalization*, which is `agent-api`'s claim and
already tested there. The claim this release makes is about the simulation reached through the
bridge, and `snapshotHash` is exactly the quantity `sim-core`'s golden fixtures use to make it.

*Alternative considered:* recording the observation stream as well, so a divergence can be
bisected to a tick. Rejected for v1 — it multiplies file size by roughly four hundred and the
same bisection is available by replaying with `--trace`, which re-emits observations from the replay
itself. The option is left open by the format: the header declares a `records` field, so a later
version adding observation lines is a version bump rather than a reinterpretation.

### The Python package has no third-party dependencies at all

`mm_gym` is standard library only: `json`, `subprocess`, `dataclasses`, `typing`, `array`. No
`numpy`, no `gymnasium`, no `pydantic`.

The proposal's reasoning is adopted verbatim — *"which removes the question rather than answering it
repeatedly"* — and the practical consequence is worth naming: an AGPL project that pulls in a
training stack acquires a transitive licence surface that has to be re-audited on every upgrade
forever, in an ecosystem where a permissive-looking package occasionally vendors something that is
not. Zero dependencies is the only version of that audit that stays true.

`MageEnv` is *shaped* like a Gymnasium environment — `reset(seed=…) -> (obs, info)`,
`step(action) -> (obs, reward, terminated, truncated, info)`, `close()` — and imports nothing from
Gymnasium. A user who wants a real `gymnasium.Env` writes a six-line subclass; the shape is
documented so that subclass is obvious. Gymnasium is MIT and would be compatible; not depending on
it is a choice about audit surface, not about licence.

*Alternative considered:* `numpy` for the observation array, which is what every consumer will
convert to anyway. Rejected at the package boundary and offered at the call site: `Observation.data`
is an `array.array('d')`, which `numpy.frombuffer` wraps with zero copy, so the conversion costs a
line in user code and costs the package nothing.

### The bridge loads its scenario the way the harness does

`agent-api`'s session takes a caller-supplied `Scenario` and *"does not know how to build a
world"*. §5 does not grant this package an edge to `@mm/scenario` — nor should it, since that
package is a leaf by design and an inbound edge would end the property that makes its wide edge list
safe.

So the bridge does what `mm-run-sweep` does: `bin/serve.mjs` takes `--scenario <module>` and
dynamically imports it. The dynamic import lives in `bin/`, outside `src/`, for the reason
`mc-harness/src/cli.ts` records — §5's boundary scanner cannot read a computed specifier and
correctly refuses to guess, so the one genuinely computed import in the package sits where the
scanner does not run and where a reader will look for it.

The module contract is one export: `createScenario(): Scenario`, or a `scenario` object. It is
deliberately a superset-compatible addition to the module `mm-run-sweep` already loads, so one file
serves both commands.

*Alternative considered:* having the bridge import `@mm/scenario` directly, which would make
`bin/serve.mjs` a two-line file. Rejected — it inverts the leaf property `contracts.md` §5's fourth
deviation rests on, and it would hard-code the reference universe as the only universe an RL agent
can ever be pointed at.

## Risks / Trade-offs

**The Python package is not covered by `npm run verify`.** There is no pinned Python toolchain in
either CI job, and adding one to a TypeScript monorepo's gate is a larger decision than this change
should make unilaterally. `mm_gym`'s tests run under `python3 -m unittest discover`, they are
committed, and `packages/gym-bridge/python/README.md` says how to run them — but a `mm_gym`
regression will not turn CI red. **This is the largest stated gap in the change.** It is mitigated,
not closed, by putting the load-bearing cross-language property on the *TypeScript* side: the wire
schema, the frame vocabulary, the digest encoding and the recorded-episode replay are all tested in
Vitest, so what Python could break unnoticed is its own ergonomics rather than the contract.

**Two envs in one process share a heap.** A leak or an unbounded structure in one session is a leak
in all *N*. `agent-api`'s session owns its observation buffer and rebuilds it per tick, so the
steady-state footprint is bounded, but a vector of 64 envs is 64 live `SimState`s and that is the
memory ceiling a caller has to size for. The alternative — one env per process — costs a Node
process per env and was measured to be worse on every axis except isolation.

**NDJSON per tick is the slowest thing in the loop, and that is accepted for now.** The measurement
exists precisely so this stops being a guess. If serialization dominates by a wide margin at
realistic vector widths, the `encoding` field negotiated at handshake is where a binary mode lands —
but it is not added speculatively, and the proposal is right that it should not be.

**The engagement block is zero and four §7 metrics report `mechanic-absent`.** A learned agent
pointed at this build is learning a game without raids. That is a fact about 0.11.0, and it is the
reason 0.12.0 exists. Nothing here is tuned to make it look otherwise.

**Library depth is roughly 1.7 distinct nodes across several hundred grimoires, and the gate sweeps
are 100% passive control.** A learned agent will find degeneracies the scripted pool did not — the
scribable list being cost-ordered is one that is already visible without an agent. This bridge is
the instrument that finds them; nothing in it is adjusted to make the findings smaller.

## Migration Plan

Additive. `packages/gym-bridge` is new, it is a leaf, and no existing package imports it.

Two files outside the new package change, both mechanically required by adding a workspace package
and both named here because three agents are working in this tree concurrently:

- `packages/sim-core/test/unit/module-boundaries.test.ts` — the §5 `ALLOWED` table gains a
  `'gym-bridge': { value: ['agent-api'], typeOnly: [] }` entry and a leaf assertion. The test fails
  loudly on an undescribed package, which is the intended behaviour and the reason this edit is not
  optional.
- `tsconfig.json`, `vitest.config.ts`, `package-lock.json` — the standard cost of a new workspace.

`docs/design/contracts.md` §5's diagram already lists `gym-bridge → agent-api`. This change
implements that line rather than deviating from it, so §5 gains no fifth deviation note.

## Open Questions

- **Does the vector frame want a per-env `skip` flag?** Today a terminated env must be `reset`
  before the next `step` frame, or the frame errors for that env. An auto-reset mode — the
  convention in most vectorized RL wrappers — would hide the episode boundary inside a step, which
  is the same class of mistake as conflating terminal with truncated. Left out for v1 deliberately;
  if it lands, it lands as an explicit `autoReset` flag negotiated at handshake, never as a default.
- **Should the explain channel (§4.4) cross this boundary?** It is *"not part of the RL
  observation"* and is wanted at per-mage, per-tick granularity by the client's bark system. An
  interpretability researcher would want it here too. Not transported in v1; the verb space has room
  for an `explain` frame that is a pure read and never an input.
