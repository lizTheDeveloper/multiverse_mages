# `pvp-server` — design notes

What was decided, what the documents decided for us, and what is still genuinely open.

This change was taken out of roadmap order deliberately: `pvp-server` is 0.15.0 and this work
started before 0.12.0, on the author's explicit instruction, to get an authoritative environment
several independent AI agents can inhabit at once. **The roadmap table in `vision.md` §11 is
unchanged** — reordering it silently would make the roadmap stop meaning what it says. See
"Roadmap order" below for what this costs.

---

## Questions the proposal listed that are no longer open

The proposal was written before several sections were tightened. Four of its open questions now
have answers in the documents, and re-raising them would be re-litigating settled design.

- **Does world time advance for uninvolved universes during someone else's raid?** Yes. Vision §8:
  *"Entering a raid pauses world time for the two participating universes… Uninvolved universes
  keep advancing."* `contracts.md` §0 says the same structurally — *"Clocks are per-universe… no
  global clock exists at the core level."* This is why a tick notice reports the mode **per slot**
  rather than per match.

- **Content revision as match eligibility.** `contracts.md` §0 now specifies it completely: 128
  bits, 32 lowercase hex, carried end to end with no narrowing, equality required, *"no partial-
  compatibility rule and no negotiation"*, mismatch is refusal naming both. Implemented as a fatal
  error code of its own, separate from the general contract mismatch, because the refusal has to
  carry two revisions and the general one carries a field list.

- **Who defends against a hostile peer.** §4.2's trust-boundary paragraph assigns it to this
  package by name: *"The core does not defend itself; the boundary does."* Implemented as two
  budgets — frames per window, submissions per tick — plus a bounded line reader.

- **Wall-clock pacing ownership.** §8: *"the server is authoritative; the client follows."*

One more, from the brief rather than the proposal: the brief said actions 1–7 and 13 are masked
during engagement. **§4.2 as it now stands supersedes that** — *every* action except no-op is
masked, and the section says outright that *"silence in an earlier draft was not permission."* The
implementation follows §4.2.

---

## Decisions, and the section each traces to

**The §5 edge is `server → agent-api`, exactly as drawn.** The server drives an `AgentSession` —
`reset`, `submit`, `snapshotHash` — and never reaches past it. Taking a direct `sim-core` edge
would have been a fifth deviation from §5 and would have put `serializeState` one import away from
a wire format whose whole discipline is not to serialize state.

**Participants mirror-simulate.** The release plan's 0.15.0 claim is that *both clients* produce
identical final snapshot hashes. The proposal warns that *"if clients do not simulate, the desync
claim degenerates into comparing the server against itself."* So the server broadcasts the
canonical ordered batch and each participant applies it to its own core instance. The reference
client in `bin/agent.mjs` does exactly this, and refuses to play if its own tick-zero hash
disagrees with the server's.

**The wire serializes no state.** A match bootstraps from `(scenarioId, contentRevision, runSeed,
stepLimit)` and advances by the batch. This is the seed-plus-action-log option the proposal calls
attractive *"precisely because determinism already guarantees it works"*. The cost it names —
replay time growing with universe age — does not apply to a match, which is bounded by its step
limit; it applies to `universe-persistence`, which is where it is recorded.

`SnapshotPayload` pins the shape for the day a snapshot must cross — mid-match join, reconnection,
a universe loaded from storage — as `mmsn-base64`: `encodeSnapshot`'s own bytes, base64 for JSON's
sake. Its `kind` separates world from engagement transport because §1.6 keeps engagement entities
out of world snapshots, and a receiver that guessed would silently drop or invent combatants.

**Ordering is `(slot, sequence)`.** Arrival time is not recorded anywhere in the package, which is
deliberate: the failure guarded against is not someone deciding to sort by arrival, it is someone
adding a `receivedAt` for logging and someone else finding it two years later.

**Closing a tick early is safe because sequence numbers strictly increase per connection.** With
that rule, "first offered for a tick" and "lowest sequence for a tick" name the same submission, so
closing when everyone has answered cannot choose differently from waiting out the deadline. Without
it, a client whose sequence-3 frame arrived after its sequence-5 frame would get a different action
depending on how long the server happened to wait — arrival order deciding the simulation in
disguise.

**Pacing is split per layer.** The management layer is the mini-game between raids: research,
teaching, scribing, universities, on a clock whose tick is a month. The raid is the RTS layer, on a
clock whose tick is a tenth of a second. One profile would have to serve both, and either choice
damages a layer — a sub-second deadline hurries a contemplative decision, a generous one lets a
management move stall an engagement. When slots are in different modes, the **shorter** deadline
wins, so a world-time universe can never hold up a raid.

The mode is read from §4.1's declared clock channel. An earlier draft inferred it from the mask's
shape — §4.2 gives engagement an unmistakable signature — and that inference is wrong in one
direction: a world-time universe in which every action happened to be unaffordable produces the
same mask. It would have meant a management tick occasionally getting a raid's deadline, a bug
visible only on a poor universe under load.

**Universe identity carries a cluster.** A participant announces a `UniverseRef` — `universeId`,
`clusterId`, advisory `prestige` — and `challengeEligibility` is the single reachability predicate.
Nothing consults the cluster yet; every participant defaults into `DEFAULT_CLUSTER_ID`. It is
declared now because cluster membership is a property of a *persisted* universe, and adding a field
to a storage format before anything is stored is free while adding it afterwards is a migration
arriving at the same moment as the feature that needs it.

---

## Relationship to `gym-bridge`

Both speak newline-delimited JSON, one object per line, with the same split between a **rejection**
(normal play, §4.2 requires illegal actions to be cheap and observable) and an **error** (a
protocol fault). The handshake follows the same structural-versus-advisory pattern. That similarity
is deliberate: vision §9 warns that building the agent interface twice guarantees divergence.

They are nonetheless **separate protocols, and separate implementations**, for reasons that are not
stylistic:

1. **They address different things.** `gym-bridge`'s `env` index selects *which independent
   single-god universe* among N multiplexed in one process. A match slot selects *which participant
   within one shared match*. `agent-api` has no actor identity to reuse — its `CandidateInput` says
   outright that *"the multiverse is not in state, and there is nothing here to enumerate"* — so a
   multi-participant protocol had to introduce one.
2. **§5 permits no edge between them.** Both are leaves with one edge each, to `agent-api`.
   Importing one from the other is a boundary violation; hoisting the shared codec into a new
   package would create a §5 deviation to hold sixty lines.
3. **Their trust boundaries differ, and the codec must differ with them.** `gym-bridge` reads a
   pipe whose only writer is the process that spawned it, and its own notes say the admission
   policy is therefore the operating system's. This server reads a socket anyone can open, so its
   reader is **bounded** and its connections are rate-limited. The safe version for a socket is not
   the fast version for a pipe.
4. **`contentRevision` is structural here and advisory there.** A single agent training against its
   own bridge can be told its content drifted and carry on. Two universes meeting in one match
   cannot — §0 forbids it.

The honest summary: **shared vocabulary, deliberately separate protocol.** If the two ever need to
converge, the thing to share is the frame *grammar* — and that would need a package §5 does not
currently have, argued on its merits.

---

## Open questions: where the spec is silent on a rule

`campaign-plan.md` is explicit that where the spec is silent on a *rule*, the work stops and asks.
These are asked rather than answered.

1. **What are the consequences of abandonment?** The proposal lists three candidate rules — play
   the absent side out under the raid AI, freeze for a reconnection window bounded by portal
   stability, or resolve at current objective state — and calls the choice a playtest question.
   v1 ends the match as `abandoned` and awards nothing, which is the only option that decides
   nothing. A forfeit rule invented here would immediately become a grief tactic against the
   *other* player by denying them the objective.

2. **`AgentSession` publishes no clock mode, no content revision, and no snapshot bytes.** The
   server needs all three and gets two of them indirectly: the mode from §4.1's observation
   channel, the revision from the scenario module's provenance block. The bytes it cannot get at
   all, which is why v1 transports no snapshot. Should `agent-interface` add accessors for these?
   The observation-channel route works and is contract-defined; a snapshot accessor would be a new
   surface, and it is only needed once mid-match join or reconnection is real.

3. **What is the wall-clock tick rate, really?** §0 fixes an engagement tick at 100 ms of
   *fictional* time and says pacing is a server concern. The four numbers shipped are
   `tuningStatus: "untuned"` in `campaign-plan.md`'s sense, and the thing to tune them against is a
   real deployment's observed round-trip time, which does not exist because no engagement has ever
   run over a link.

4. **What does a desync mean when one side is deliberately lying?** `sim-core`'s hash notes say
   FNV-1a defends against accidental divergence and not against an adversary, and that a different
   function with a different name would be needed for that. Under the AGPL a modified client is a
   granted right. Both a bug and a lie end the match and name both hashes, which is correct for
   both; distinguishing them needs identity work and a commitment scheme that `universe-persistence`
   would have to own.

5. **How many matches fit on an instance?** Unanswerable until `raid-engagement` exists and a real
   engagement's memory cost is measured. Whether a match is a process, a worker thread or a
   coroutine follows from that number, and the skeleton deliberately does not pre-commit: the host
   is transport-agnostic and holds matches in one loop, which is the easiest shape to split later.

6. **Is delta compression needed?** Still unknown, and now less urgent: v1 transports no state at
   all, so the question only arises when snapshot transport does.

---

## Roadmap order, and what it costs

`pvp-server` is 0.15.0. This work started before 0.12.0, and the roadmap table is unchanged.

What that means for the release plan's parity scheme: **`MINOR` parity encodes balance validation
from 0.5.0 onward — odd in flight, even means Monte Carlo baselines committed and green.** This
change is not a balance change and moves no baseline, so it does not disturb parity. But two things
follow that whoever cuts the next release should know:

- **This work cannot be released as 0.15.0 out of order.** The version that carries it is whichever
  release it actually ships in, and 0.15.0's claim — zero desyncs across 1,000 automated matches —
  cannot be made until the harness that runs those matches exists. The machinery this change ships
  is the *precondition* for that claim, not the claim.
- **0.16.0's claim is now cheaper, not satisfied.** The batch log is the match record and replays to
  the same hashes, which is the 1,000-match harness in miniature; what remains is running it a
  thousand times and counting. The second 0.16.0 claim — `prestigeAdvantage` under 60% — is
  untouched by this change and remains `god-agency`'s and the balance harness's.

Nothing here should be read as promoting `pvp-server` in the roadmap. It is proposal-depth work
that has acquired an implementation ahead of its slot.
