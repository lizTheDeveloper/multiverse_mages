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

## 4. Findings blocked on a balance number

### 4.1 The interruption policy is downstream of the loss rate — **blocked**

`ui/tempo/` prototypes three ways to pace the world and surface events. Which one is correct depends
entirely on how often a last copy dies:

- under roughly **one a year**, halting the world on loss is the best moment in the game
- past roughly **three a year** it is a nuisance, and that direction collapses into a conventional
  speed-control-plus-feed with extra steps

The campaign measured roughly **55 copies per node**, which puts it near never — while the same
campaign is actively trying to make loss bite. **The feed cannot be designed until that lands.**

### 4.2 The knowledge browser is a design problem at intended balance, not current balance — **blocked**

`ui/knowledge/` measures the same exposure from the other side. `libraryDependence` — nodes surviving
on exactly one instance — comes out at:

| Mean copies per node | 1 | 4 | 12 | 30 | 55 |
|---|---|---|---|---|---|
| Nodes on a single copy | 51 | 7 | 1 | 0 | 0 |

At the measured redundancy it is **empty**: nothing is ever at risk, and the risk-sorted direction has
nothing to sort. Building the browser against today's numbers produces a screen that looks calm and
correct and is wrong the moment loss starts working.

### 4.3 Loss is a property of redundancy, not population — **resolved**

Recorded because it was got wrong first. More mages means more deaths *and* more copies, so a loss
rate expressed per-thousand-mages is wrong. `sound-design.md` §0.4 now states it in those terms.

---

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
