# Multiverse Mages — what the interface prototypes found

*Sibling to `art-plan.md` and `sound-design.md`. Those two exist so that art and audio are decisions
rather than accidents when their releases arrive; this one exists because building eleven prototypes
against the real contracts turned up things the contracts do not carry, and a finding that lives only
in a pull-request description is a finding that evaporates when the branch merges.*

*Nothing here is a specification. Each entry says what was found, how it was found, and **where it
lands** — because most of these are not client problems at all. `electron-client` is 0.13.0; the
majority of what follows has to be settled in `agent-interface` at 0.5.0 or it becomes a retrofit.*

The prototypes are in `ui/`, one folder per question, with a coverage table in `ui/README.md`.

---

## 0. How to read this

Each finding carries a **status**:

| | |
|---|---|
| **open** | nobody has decided; the prototype states the options |
| **defect** | the specified design does not do what it says; needs a change, not a decision |
| **resolved** | settled during prototyping, recorded here so the reasoning survives |
| **blocked** | cannot be settled until a balance number exists |

And a **lands in**, naming the package or document that owns it.

---

## 1. Findings that land in `agent-interface` (0.5.0)

These are the expensive ones. All are cheap now and a retrofit later, because they change a format
that trained policies and committed baselines will depend on.

### 1.1 The top-*k* candidate list saturates — **defect**

`contracts.md` §4.4 resolves parameterized actions with a fixed-length top-*k* candidate list under a
deterministic salience ordering. Built and operated in `ui/targets/` with a population slider, it
fails at scale: **at 3,000 mages every one of the eight slots is a sole-copy holder.** One salience
criterion takes the entire list, and the remaining 2,992 mages become unreachable by that verb at any
price.

**Raising *k* does not fix this.** It admits more of the same kind. The fix is a blended ordering, or
slots stratified per criterion so that each reserves capacity. §4.4 requires neither.

Six of the sixteen actions carry an entity handle, so this affects grant-founding-knowledge, bless,
assign-role, fund-university, encourage-research and open-portal.

**Amended after wiring `ui/targets/` to a real session.** The eight slots above were this prototype's
own constant, not the shipped one: `CANDIDATE_SLOTS` pins 16 for grant-founding-knowledge, 32 for
bless and assign-role, 16 for encourage-research and 8 for the rest. The saturation mechanism is
unchanged — one criterion taking a whole list does not care how long the list is — but the number of
mages it takes to get there is four times what the prototype showed, and the reference run never
reaches it. What the real lists *do* show at every tick is 1.8 below, which is a different defect in
the same structure.

*Lands in: `contracts.md` §4.4, and the `agent-api` spec that implements it.*

### 1.2 Pinning *k* is a joint human/RL decision — **open**

If the client shows the player the same §4.4 candidate list the observation already carries — the
cheapest and most consistent option, and the one `ui/targets/` direction B prototypes — then the human
and the policy network are choosing from the same menu.

That has a consequence for §4's claim that one interface serves scripted bots, Monte Carlo and RL: if
*k* is too small for a person it is also too small for the agent, and if a person needs a different
*k*, the interface has quietly acquired a fourth consumer with different requirements. Either way it
should be decided deliberately rather than discovered.

*Lands in: `contracts.md` §4, as a scope question about who the one interface serves.*

### 1.3 The salience ordering is undefined and behaves like content — **open**

§4.4 says the candidate list is *"ranked by a deterministic salience ordering"* and never says what
the ordering is. In `ui/targets/` that ordering does all the work in two of the three directions — two
different orderings give a player two different games.

**It probably belongs in `packages/content` with a schema rather than in the action resolver.**
`CLAUDE.md` states the convention: *"Content — grid cells, nodes, species, primitives, traditions —
lives in validated data files, never hardcoded."* An ordering that decides which forty of three
thousand mages a god can act on this tick is doing content's job. That framing also makes it
reviewable and sweepable, which an implementation detail of the resolver would not be.

*Raised by the session running the art-plan style-bible pilot, who declined the finding as out of
their lane and improved the framing on the way past.*

*Lands in: `contracts.md` §4.4 for the requirement; `packages/content` for the data.*

### 1.4 The explain channel's payload shape is not pinned — **open**

§4.4 describes the explain channel as *on-demand explanation of one decision*. Two known consumers
want something else: the bark system (`sound-design.md` §10.1) and the mage panel (`ui/mage/`) both
want **per-mage decision reasons at world-tick granularity**. That is a different shape, and it is far
cheaper to know before the format is fixed than after.

The data mostly exists. `rules-world`'s `GoalScore` already carries `{score, terms, rawTotal,
clamped}`, and the six scoring terms are individually attributable because `mage-autonomy` requires
them to be ablatable. So this is largely a transport decision rather than a modelling one.

*Lands in: `agent-interface`, when it pins the channel.*

### 1.5 A masked goal says which, never why — **open**

`FeasibilityOutcome` carries `feasible`, `masked` and `maskedCount` — enough to grey a row out, not
enough to say anything about it. The reason is computed inside `isFeasible` and discarded.

The consequence is that a stalled universe cannot tell the player what would unstall it. The
interface's own comment describes the masked list as *"for attributing a stall"*; attributing a stall
to a **player** needs the reason, not the count.

*Lands in: `rules-world`'s autonomy layer to retain it, `agent-interface` to expose it.*

---

### 1.6 The legality mask is one bit, and the interface needs three states — **defect**

Found by wiring `ui/glow/` to a recorded session rather than to its own timer.

The light system distinguishes **charged** (do it now), **latent** (the god could, but not this tick)
and **denied** (masked — something else has to change first). §4.2 gives one bit for all three.
`mask.ts` masks an action *"whose cost exceeds the current favor pool"* with the same zero it uses for
an action that is structurally impossible, and the two are opposite instructions to a player: *wait*
versus *change something*.

Measured over the reference run, seed 20260813:

| Tick | Dark | Why |
|---|---|---|
| 0 | 15 of 16 | fourteen because favor is 0; `declareAscension` because it is free and the world is not ready |
| 20 | 3 | `revokeEdict` — affordable, and there are no edicts to revoke |
| 20–400 | | `changeTradition` — 64 favor against a cap of 40, so *permanently* unaffordable at worship tier 2 |

Three unrelated situations, one bit. A player told "not now" fourteen times at tick 0 has no way to
learn that waiting fixes all fourteen, and no way to learn that waiting will never fix
`changeTradition`.

The only way to separate them from outside is to price the action, and pricing is a rule §5 forbids
the client to hold. `ui/shared/session.js` isolates that in one function named `reconstructedCharge`,
and every control it touches is marked **†** on the page so a reader can see which lights are the
contract talking and which are the client guessing. **That marker is the finding made visible, not a
fix.** The fix is a reason channel on the mask — one small enum per action, `unaffordable` /
`impossible` / `spent` — which costs nothing to add now and is a format change after policies train
against it.

**The sound design already made this decision, and already specified the cue.** Checked against
`main` after the fact, which makes the ask considerably smaller than it looked. `sound-design.md` §7:

> **Insufficient favor** is deny (§2.2) plus one strained pulse — the sub attempting its cycle and
> not completing it. *Distinct from ordinary illegality, because "not allowed" and "not yet
> affordable" are different problems with different fixes.*

That sentence predates this finding. And §2.2 has already split deny two ways once — for stranded
prerequisites — establishing the rule it did it under: **layer, never a seventh click**, because the
six clicks are a closed set and adding one should require an argument. So a reason channel is not
proposing a new distinction or a new sound. It is supplying the input to a cue the audio design has
already decided how to express and currently cannot reach, and the visual side reached the same
answer independently — `ui/glow/` had to reconstruct the distinction client-side to draw it at all.
Two layers, specified separately, blocked on the same missing bit.

*Lands in: `contracts.md` §4.2 and `agent-api`'s mask. Consumers already waiting on it:
`sound-design.md` §7 and `ui/glow/`.*

### 1.7 The session drops the integer observation — **defect**

`AgentView` carries two observations: `raw: Int32Array`, which `view.ts`'s own comment calls **"the
reproducible artefact"**, and the normalized `Float64Array` that §4.1 pins as the export.
**`AgentSession.observe()` returns only the normalized one.** Every consumer that is not already
holding a `SimState` — a client, a viewer, a recorder, a debugger — reads `0.3125` where the world
holds `40.0` favor.

Nothing displayable survives that. A meter can be drawn from a ratio; *"40 favor, and the thing you
want costs 64"* cannot.

Today it is recoverable: every descriptor in the layout is `ratio` or `flag`, both exact ratios of a
divisor the package exports, so `scripts/record-session.mjs` reconstructs the integers and
`packages/agent-api/test/unit/normalization-inversion.test.ts` pins that it can. **That test is a
tripwire, not a solution.** `NORMALIZATION_RULES` also declares `log-bucket` and `bounded`, and one
channel adopting either makes every reconstruction silently lossy — in a renderer, months later,
looking exactly like a rendering bug. Saturation is already unrecoverable, which is why the recorder
writes the saturated slot indices per frame instead of pretending.

Exposing `raw` on the session is a one-line addition now and a client-wide correctness problem later.

*Lands in: `agent-api`'s session surface.*

### 1.8 Candidate lists are shorter than their declared *k*, and the length moves — **defect**

`CANDIDATE_SLOTS` pins 32 slots for `blessMage`. The reference run returns **6** at tick 0 and 16–20
thereafter. Six of the seven parameterized actions never fill their list at any tick:

| Action | Declared *k* | Lengths seen over 400 ticks |
|---|---|---|
| `grantFoundingKnowledge` | 16 | 16 |
| `blessMage` | 32 | 6, 16, 17, 18, 19, 20 |
| `assignRole` | 32 | 18, 32 |
| `fundUniversity` | 8 | 2 |
| `encourageResearch` | 16 | 12 |
| `changeTradition` | 8 | 2 |
| `openPortal` | 8 | 3 |

`candidates.ts` states both rules seven lines apart. Its header: the length *"comes from
`CANDIDATE_SLOTS` and never from how many candidates were found — a list that shrank when mages died
would make slot 5 mean a different mage every tick, which is the exact thing a policy cannot learn
against."* Its `truncate`: *"Never pads — an absent slot is illegal."* The measured behaviour is the
second, and `gate.ts` handles the consequence as an ordinary `empty-slot` rejection.

The cost is not the truncation, which is sound; it is that **nothing says how many slots are real.**
The mask is one bit per *action*, not per slot. A policy network discovers the end of a list by
submitting into it and spending an illegal action; a human interface renders a menu whose length
changes under the cursor. Either pad to *k* with an explicit empty marker, or publish the live length
alongside the list — but the file should stop asserting both.

*Lands in: `contracts.md` §4.4 and `agent-api`'s `candidates.ts` — at minimum the contradicting
comment, which is currently the only statement of intent anyone has.*

### 1.9 A frame is a state, so there are no events — **open**

Every prototype about *change* — `tempo/`, `ascension/`, `knowledge/`, and everything
`sound-design.md` §10 specifies — needs to know what just happened. The read path emits states. A view
wanting events has to diff two frames itself, and a diff cannot distinguish a last-instance loss from
an ordinary one, which is the distinction §6.5 is built on.

The reference run makes the cost concrete: **the Human species is alive at tick 273 and extinct at
tick 274.** Nothing on the read path announces it. Only a consumer already diffing the mage block
across exactly those two frames could infer it, and it would learn *"a count went to zero"* rather
than *"a species ended"*.

**Three sections of one document are asking the read path for this, and they should be answered
once.** Not just §6.5, whose loss cue is what the diff cannot serve: §0.4's density rule needs an
**events-per-tick count per class** to choose between discrete sounds and a continuous texture, and
pins loss at threshold 1 so it is *never* aggregated away; §10 needs classified per-tick events to
build an arrangement at all. Three separate requirements, one missing capability. An answer shaped
for any one of them alone will be re-litigated twice.

What every consumer needs is the same two things, and they are worth stating as a requirement rather
than as a complaint:

- **a class**, so a threshold can be applied to it, and
- **a "was this the last one" bit**, which is the part that matters and the part **nothing
  downstream can reconstruct.** A consumer holding every frame of the entire run still cannot
  recover it, because the frame that would have shown the last instance is the frame where the count
  is already zero. It is not expensive to emit and it is impossible to derive.

Filed as **open** rather than defect because §4.3's outcome record may be the right home and nobody
has looked — the audio session independently reached the same conclusion and filed it the same way.
It is the same shape as 1.5 — a mask that says which, never why — and probably wants the same answer.

**On where this is written down.** `sound-design.md` §6.5 records it at the cue it breaks, which is
right: a reader of that cue needs to know it cannot be built yet. But that is the *consequence*, and
nobody implementing `agent-interface` at 0.5.0 reads the audio document. The fix lands in
`contracts.md` §4.3, and §4.3 currently says nothing about it. **That amendment has not been made and
is not made here** — adding a requirement to the contract of record is a design decision, not a
finding, and this document does not have the standing to make one. The requirement above is written
to be transcribable, so that when it is authorized the amendment is a copy rather than a fresh
argument.

*Lands in: `contracts.md` §4.3, or a side channel beside the candidate lists. Recorded at the
consequence in `sound-design.md` §6.5; the contract amendment is unwritten and unauthorized.*

---

## 2. Findings that land in the rules packages

### 2.1 Mastery trajectory is not published — **open**

`ui/mage/` displays a countdown: the last copy of a node crosses `DEFAULT_TEACH_THRESHOLD` in twelve
months and becomes untransmittable. Every number in it — the retention floor, the per-tick decay rate,
the threshold crossing — is a **rules computation**, and `contracts.md` §5 forbids the renderer
performing any of them.

So either `rules-magic` publishes the floor and the rate the way it already publishes `libraryDepth`,
or the panel can only ever show a bare mastery integer, which means nothing to a player.

The specific arithmetic, which is what made the gap visible: at gnome retention `fp(512)`,
`masteryDecayPerTick` is 16 and `masteryFloor` is `256 × 512 / 1024` = 128. So the last copy is
**never destroyed** — it settles at 128 and stays. It stops being *teachable* at 512, which is worse,
because nothing announces it and nothing in the subsystem restores mastery.

*Lands in: `rules-magic`, as a published accessor.*

### 2.2 `effort-progress` carries no tick — **open**

The component exists so that partial work outlives a goal switch — the most humane rule in the schema,
and the reason a mage displaced after fifteen years of research does not silently restart at zero. It
records `subject, kind, nodeId, counterparty, progress` and **no tick**.

So *"she set this down twenty-three years ago"* is not derivable, and the most affecting fact about a
set-down project is unavailable to the interface that exists to show it.

This one costs a fourth world-schema revision, which is why it is worth arguing about rather than
accepting by default.

*Lands in: `contracts.md` §1.2.*

### 2.3 Displacement at the project bound is silent — **open**

Passing `MAX_EFFORTS_PER_MAGE` gives up the least-invested project. No event is emitted, so it appears
in none of the classified per-tick deltas that `sound-design.md` §10 asks for. Years of work vanish
with no channel, in a game whose emotional core is loss.

*Lands in: `packages/coordination`, and the §10 event-delta list.*

### 2.4 Rediscovery has no state distinguishing lost from never-known — **open**

A node once held and lost is not the same as one never known: re-deriving it costs at least three
times research, and the distinction is a persisted per-node ever-known record that already exists in
state. None of `ui/knowledge/`'s three directions can render it, and the lost node is the more
interesting row in the game.

`sound-design.md` §6.6 gives rediscovery a sound. If the audio distinguishes the two and the interface
does not, audio is carrying payload rather than salience, which is the inversion §0.3 exists to
prevent.

*Lands in: the read path, wherever node status is exposed.*

---

## 3. Findings about the content graph

Both came out of `scripts/content-graph.mjs`, which renders `node.json` as drawn lattices or as dense
text, and both were independently reproduced by the session that owns the sound design.

### 3.1 Intellego is the trunk, and the technique switches are not symmetric — **open**

**All eleven cross-cell prerequisite edges in the v1 subset originate in an Intellego cell**, nine of
them feeding Perdo or Rego inside the same form. You must perceive a thing before you can unmake or
command it. Five independent content branches converged on that, which suggests intent — but
undocumented intent is indistinguishable from accident to the balance harness.

The consequence is a large asymmetry in the god's switches, because a dormant instance cannot satisfy
a prerequisite:

| Forbid | Nodes reachable, v1 | Full 70-cell grid |
|---|---|---|
| **Intellego** | **18 / 51** | **−102 nodes** |
| Perdo | 34 / 51 | −57 to −63 |
| Rego | 33 / 51 | −57 to −63 |

`ui/ruleset-symmetry/` splits the full-grid figure further: of the 102, **58 are lost with their cell**
and **44 are orphaned downstream**, where the cell stays live but the prerequisite went dark. Those are
different kinds of loss and a player would experience them differently.

**Any interface rendering the five techniques as equivalent toggles is misrepresenting the game.**
That was true of `ui/ruleset/` as first shipped and has since been fixed there.

*Lands in: `vision.md` §13 as an open question — is the trunk deliberate? — and in any ruleset UI.*

### 3.2 `depthCeiling` is close to inert in v1 — **open**

No v1 cell is authored past tier 5, and the tier histogram is `{1:12, 2:13, 3:13, 4:11, 5:2}`. So
species depth ceilings of 5, 6 and 7 reach identically:

| Species | Ceiling | Reachable |
|---|---|---|
| orc | 3 | 38 / 51 |
| human, gnome | 4 | 49 / 51 |
| dwarf | 5 | **51 / 51** |
| elf | 6 | **51 / 51** |
| draconic | 7 | **51 / 51** |

Draconic's headline trait — the highest depth ceiling in the game — buys it nothing over a dwarf. This
is a content shortfall rather than a tuning one, and it bears on any species-differentiation claim
made before deeper tiers exist.

*Lands in: content authoring, and the 0.4.0 release claim.*

---

## 4. Findings that were blocked, and are now answered

*Updated after W8. Both of these were filed as "cannot move until a balance number exists". The
number exists. It is worse than the version that was feared, and the cause is not the one either
prototype guessed.*

### 4.1 The loss channel fires and removes nothing — **answered**

`ui/tempo/` and `ui/knowledge/` were both built around how often a last copy dies, and both said the
question could not be settled. W8 settled it, and the mechanism was never the problem:

- **Raids fire.** `rules-raid` engages, and `contracts.md` needed no change for it.
- **Books burn.** Grimoires fell **1232 → 354** for `passive-control` in a raid season.
- **Nothing was lost.** Instances held flat and **`nodesLost` is 0.00 for six of eight strategies**,
  because at **50–80 copies per node** a whole library is held fifty other places.
- **`libraryDependence` sits at 0.**

> **Concentration, not the absence of a mechanism, is the remaining problem.**

That sentence is the correction. Both prototypes assumed loss was rare because the *rate* was
untuned; it is rare because copies are spread so widely that destroying any particular one changes
nothing. A UI change cannot touch that, and neither can a decay constant — it is a question about
how knowledge concentrates.

**What it does to each prototype**, and none of it invalidates the direction work:

- `ui/knowledge/`'s risk view has nothing to sort, and now has a named reason rather than a slider
  position. Its own on-screen note said the browser is *"not a design problem at current balance,
  it is one at intended balance"* — that reading holds and is now measured rather than predicted.
- `ui/tempo/`'s halt-on-loss direction never fires, so the choice between it and a conventional feed
  cannot be made by playing. It stays open, blocked on concentration rather than on a rate.
- `ui/mage/`'s twelve-month countdown describes a mage holding a sole copy. **With
  `libraryDependence` at 0, no such mage currently exists in a run.** The arithmetic is still right
  and the read-path gap it found (§2.1) is still real; the scenario is aspirational until
  concentration changes.

### 4.2 `knowledgeHalfLife` cannot be computed — **defect**

`sound-design.md` §10 item 5 asks for knowledge half-life on the client's read path, so the ambient
bed can detune as a civilization loses knowledge faster than it makes it. W8 found the metric cannot
be produced at all: its §7 collector needs a census carrying **node-id lists**, and the reference
executor's census carries **aggregate counts**.

So a documented audio behaviour and a documented balance metric both depend on a number nothing
currently emits. Named in the campaign rather than papered over, and repeated here because the
client is the third consumer and would have discovered it last.

## 5. Findings that are nobody's package

### 5.1 Vision §8's tempo cost has no home in the interface — **open**

Entering a raid pauses world time for both participants while uninvolved universes keep advancing.
That is the entire reason raiding is never free, and the balance harness is required to report tempo
lost to inbound raids as a first-class metric.

**Nothing in the interface shows it.** Two prototypes reached this independently: `ui/raid/`, where
nothing on a battlefield can express it, and `ui/commitments/`, where the cost table's own gloss for
`open-portal` says the favor price is *"the second thing about it"*. It is a number about the
universes you are not looking at.

If the client omits it, the player cannot price a raid while the harness scores them on exactly that.

### 5.1a The vision permits mid-raid rule changes and the contract now agrees — **resolved on paper, open in code**

`raid-engagement.md` repeals `vision.md` §3's frozen-policy sentence, and vision §3 on `main` now
reads *"Rules changes may be made during a raid, and every change locks until the raid ends."*

**`contracts.md` §4.2 still says the opposite**, verbatim: *"Every action except no-op is masked
during engagement."* So does `god-agency`'s `interventions` spec, whose first requirement is *"Every
intervention is world-time only"* and which masks all fifteen non-noop actions whenever
`clock.mode == engagement`.

W8's note that *"`contracts.md` needed no change"* was about §1.1 and the one-universe rule, not
about §4.2. The two documents now disagree about whether the game's most interesting moment has any
verbs in it.

**Amended.** §4.2 now carries a per-action table: permit technique and form are legal during an
engagement and lock; forbid is legal for the defender only and locks; edicts and everything else stay
masked. Forbidding is defender-only per `raid-engagement.md` §6.2, because under §3 the host's
ruleset governs and an attacker forbidding their own cells would change nothing.

**Two silences were made visible rather than filled.** The raid document names *"forbid and permit"*
and says nothing about edicts, so actions 5–7 stay masked with the gap recorded; and the raid verb
set it describes has no action ids in §4.2 at all, with a note that Vis collides with
`mages-and-species`'s economy requirement forbidding a fourth resource.

**Still open in code, but not for the reason the amendment first gave.** `agent-api/src/mask.ts`
returns `[1, 0, 0, …]` in engagement mode, and the first draft of this entry said unmasking four
actions would move every committed baseline. Instrumenting `legalityMask` and running four
strategies for 600 ticks says otherwise: `passive-control` 2 raids / 159 engagement ticks,
`uniform-random-legal` 7 / 440, `portal-rush` 9 / 489, `denial-warden` 1 / 65 — and the mask was
evaluated in engagement **zero times in all four**.

The branch is unreachable. A raid resolves atomically inside one world step: `runRaid(raid)` takes a
`Raid` and nothing else, loops to termination and returns before the agent is asked again. The clock
does enter engagement mode; nothing observes while it is there.

**So the mask never stopped the god acting mid-raid — nothing asks.** That relocates the finding
rather than closing it. `ui/raid/`'s premise, and `raid-engagement.md`'s three phases of decaying
agency, need the engagement loop to yield to the agent between ticks. That is a change to
`runRaid`'s shape, and it is the real prerequisite for a playable raid; the mask entries are
downstream bookkeeping that can follow it cheaply.

### 5.2 Cost per tick of effect is the comparison nobody can make — **open**

Bless is 2,048 favor over 120 ticks — about 17 a tick. Encourage-research is 1,024 over a 64-tick
decay — about 16 a tick, pointed at a cell rather than a person. **Two near-identical purchases at very
different face prices**, and no interface showing only the face price lets a player notice.

### 5.3 `change-tradition` is out of reach, not expensive — **open**

At `fp(65536)` against a favor cap of `20480 + tier × 10240`, it exceeds what a universe can *hold* at
every worship tier below the highest. A price list renders that as a big number a player might save
toward, and they cannot — the pool physically cannot get there.

The cost table's own gloss says it was priced that way deliberately, so an interface that fails to
convey it loses an intended mechanic rather than a detail.

---

## 6. Settled during prototyping

### 6.1 The light rule — **resolved**

**Cyan is the god** — potential, affordance, and the moment of touch. The fourteen form hues stay the
colour of magic that exists in the world. Nothing glows that the god cannot currently do, so absence of
light is the legality mask rather than a red warning, which is what `sound-design.md` §2.2 already
makes the deny *sound* do. The god is not part of the world, so giving the god a register the world
never uses costs nothing, and `art-plan.md` §2's *"magic reads as the only saturated thing on screen"*
stays true.

**One thing to settle before the eighth form gets a colour: cyan must never become a form hue, and
`aquam` is the obvious collision.** Aquam is outside the v1 subset so nothing is broken today, which is
exactly why it is cheap to settle now. `sound-design.md` §1.3 is the precedent — it allocates a
frequency band per subsystem and treats that allocation as a contract rather than a palette. Hue is the
same shape one dimension over, and the fourteen forms plus the god are the entire budget. The two
documents cross-reference each other deliberately: an allocation that is merely conventional gets
spent, and by the time the fifteenth thing wants a colour the convention is not there to refuse it.

### 6.1a Three grounds were two themes — **resolved**

`ui/glow/` originally compared three grounds as competing directions: vellum with bloom, vellum with
dark aether insets, and full dark. Two of those are light mode and dark mode, and the hybrid was
answering a question nobody asked. Collapsed to **vellum for light, ink for dark**, with the hybrid
dropped.

What survived is the finding underneath. The two themes are not two skins: on ink a charged control
*emits* light, and on vellum it cannot, so charge blooms *downward* there — ink drawn to the control
rather than light coming off it. That divergence lives in `ui/shared/theme.css` and nowhere else, so
a prototype writes `box-shadow: var(--glow-charged)` and gets a ring on paper and a glow on ink
without knowing which theme it is in. If component CSS ever has to ask, the theme layer has failed.

All eleven prototypes now share that file and carry a light / system / dark control. Measured across
both themes, no text sits below WCAG 4.5:1; worst case 4.72.

### 6.2 Measurement beats the eye, twice — **resolved**

Recorded because both were wrong by eye and fine by instrument, and the same mistake is easy to repeat:

- A cyan fill bright enough to read **on vellum** measured **1.01 : 1** against the latent state — a
  hue difference and no luminance at all, invisible to a colourblind player and on any poor panel. On a
  light ground, charge has to bloom *downward*: ink drawn to the control rather than light emitted from
  it. That moved it to 5.88 : 1.
- Denied was dimmed with `opacity`, measuring **2.42 : 1** on dark grounds — under WCAG's 4.5 for body
  text. The elegant "absence carries it" rule was legible only to someone who could already see it. The
  dashed edge and the missing glow now carry the state and the label stays at full strength.

`ui/glow/` measures itself and prints the figures per ground, because a hand-written contrast number is
one that was true once.

### 6.3 One density threshold per class, read by both layers — **resolved**

`sound-design.md` §0.4's density rule — below a per-class threshold events are discrete, at or above it
the class becomes a texture whose intensity tracks the rate — transfers to the eye unchanged. Research,
teaching and scribing all stop being readable as lines somewhere between 200 and 600 mages.

§0.4 now requires **one threshold per class, shared by both layers**. Two layers choosing independently
would disagree about the moment a class became weather, and a player would *see* discrete events while
*hearing* a texture — worse than either layer being wrong alone, because it is the interface
contradicting itself.

This also exposed a contradiction the sound design already had: §0.4 says no class may be discrete
without a threshold, and §6.5 pins loss at 1 and forbids ever aggregating it. Both now state that the
exception holds **only while loss is rare**, which returns to 4.1. If the rate lands high, the answer
is to change the mechanic rather than raise the threshold — moving it from 1 would aggregate away the
one event the design is built around while leaving every sentence about it standing.

---

## 7. What the prototypes concluded about themselves

Most control surfaces produced a winner, or at least a defensible ranking. **The ruleset family did
not.** `ui/ruleset-symmetry/` and `ui/edicts/` independently reached the same conclusion: the grid
answers the question a player asks most often, and the ledger or the slot view answers the expensive
one, and they do not compete for the same screen space. For pillar #1, *"pick one direction"* looks
like the wrong frame.

The other conclusion worth carrying: **`ui/targets/` direction C — name the outcome, and the game names
the mage — is the direction most aligned with being a god rather than a general, and it is the one that
cannot be built today.** It needs the mastery trajectory from 2.1 and the loss data from 4.2. That it
is both the best fit for the design and the most blocked is the clearest single argument for settling
§1's findings in `agent-interface` rather than at 0.13.0.

---

## 8. What caught the mistakes

Four defects surfaced during this work. None was found by the person responsible for the area, and
none was found by anyone suspecting anything. Recorded because the mechanism generalises better than
any of the individual fixes.

| What broke | What caught it |
|---|---|
| A stranded-deny modelled as a seventh click | A test asserting §2's six-click closed set |
| A cue note that over-explained | The 300-character `post` cap in the audio schema — three times, each producing a shorter and better sentence |
| A denied state dimmed by eye | A contrast measurement, twice: "about four percent of luminance" was one percent, and an opacity dim measured 2.4:1 |
| A front door committed without its page | `readFileSync` throwing `ENOENT`, in a link test written for an entirely different purpose |
| A candidate-list saturation figure argued from an invented *k* of 8 | Wiring `ui/targets/` to a real session, where the shipped constant is 32 |
| "The observation carries integers" — it does not; the session returns floats | Printing a favor meter and reading `0.3125` |
| A recorder header claiming it stored the raw vector | Checking what `session.observe()` actually returns before writing the comment |

**The common property is that each ran without being asked.** None required a person to suspect the
specific failure — which matters here more than usual, because this work ran across two sessions that
could not see each other's disks. Suspicion does not survive that boundary. A schema cap does.

**The most transferable lesson is the last one, and it needed a correction to become useful.** The
first telling was "reaching for the filesystem was the load-bearing choice," which implies foresight
that was not there — the filesystem was simply the obvious way to read the links. The honest version:

> **A test that consults the artifact rather than a model of the artifact gets failure modes for
> free.**

That requires no foresight at all. The link test was written to catch a dead link and an unlinked
prototype. It also caught *a page that existed on one machine and not in the repository* — a case
nobody had considered — solely because it opened the file instead of reasoning about a list of files.
A test built on a model of the tree would have passed vacuously over an empty link set and shipped the
defect.

**Where this applies next:** the same temptation exists in the client's snapshot-parity check, which
must compare against the snapshot and not against a model of the snapshot. Also in
`audio-isolation.test.ts`, which already gets this right for the same reason — it trips a real loader
read rather than asserting a value the loader would have returned.

**One thing this does not license.** Cheap automatic checks are not a substitute for review; they
caught four things that review had already passed. The argument is only that they cost almost nothing
and fire on cases nobody modelled, which is exactly the class of defect that review is worst at.
