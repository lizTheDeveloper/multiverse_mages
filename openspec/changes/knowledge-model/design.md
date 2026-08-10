## Context

`vision.md` §4, §4a, §5, and §6a describe the magic grid, the tradition model, the knowledge
lifecycle, and knowledge-as-capital. `contracts.md` §1.5, §2.2–§2.5, §3, and §6 fix the shapes those
descriptions have to live in — the knowledge instance record, the node and cell content schemas, the
tradition hook cap, the primitive table, and the RNG stream registry. Neither document says what any
of it *does*.

This change supplies the behaviour, and it lands in `packages/rules-magic`. Three constraints shape
every decision below.

**The module boundary is real.** `contracts.md` §5 forbids `rules-magic` and `rules-world` from
importing each other, and explicitly names "a mage learning a node" as the interaction that must
live in a coordinating layer rather than a cycle. Every rate a knowledge operation needs — species
`learnRate`, `retention`, `scribeAffinity`, `rediscoveryAffinity`, the count of available scribe
cohorts, the materials balance — is `rules-world` data. So the knowledge operations here are
specified as pure functions taking those values as parameters, and treating mage, grimoire, and
library handles as opaque integers.

**0.3.0 can only make mechanical claims.** `release-plan.md` states the measurement pivot: the
balance harness does not exist until 0.5.0, so nothing in this change may claim anything is
balanced. The two 0.3.0 claims are that a node ceases to exist when its last instance is destroyed
and rediscovery costs at least 3× research, and that each v1 tradition changes measurable behaviour
through its declared hook and no other path. Both are structural, and every requirement in this
change is written to be testable without a mage AI, without universities, and without raids.

**`contracts.md` §8 assigns one content decision here:** which 12 cells make the v1 subset,
constrained only to include `rego-limen`.

## Goals / Non-Goals

**Goals:**

- Select and justify the v1 12-cell subset.
- Make a permitted cell mean something in world time, not only in combat.
- Give knowledge a full lifecycle: acquired, held, decayed, transmitted, written, lost, rediscovered.
- Make loss observable and derived, never a cached flag.
- Publish the library-depth function that the knowledge-as-capital loop runs on, without applying it.
- Implement three traditions that are visibly different from one another through four hooks and
  nothing else.

**Non-Goals:**

- Mage decision-making. Nothing here decides *whether* a mage researches; it defines what happens
  when a research operation is applied. Utility scoring is `mages-and-species`.
- Species traits, aging, mortality, populace, and universities as institutions — all
  `mages-and-species`. This change consumes their outputs as parameters and publishes library depth
  back to them.
- Raids, combat resolution, theft execution, and portal mechanics — `raid-engagement`. The
  hook-arbitration function ships here; the engagement that calls it does not.
- The god's actions. Permitting, forbidding, and edict spending are `god-agency`. This change
  defines what the ruleset *means*, not how it is changed.
- Tuning. Every magnitude authored here is a placeholder marked untuned.

## Decisions

### The v1 subset is `{intellego, perdo, rego} × {limen, mentem, nomen, terram}`

Twelve cells: `intellego-limen`, `intellego-mentem`, `intellego-nomen`, `intellego-terram`,
`perdo-limen`, `perdo-mentem`, `perdo-nomen`, `perdo-terram`, `rego-limen`, `rego-mentem`,
`rego-nomen`, `rego-terram`.

This is the quadrant of the grid where the knowledge model itself lives. Read as verbs, the three
techniques are *find out*, *destroy*, and *control* — which are the three things that can happen to
knowledge. Read as subjects, the four forms are the two places knowledge resides (Mentem, the mind;
Nomen, the name), the substrate the economy runs on (Terram), and the boundary the entire game is
entered through (Limen).

Concretely it delivers:

- `rego-limen`, mandated by `contracts.md` §8: the `portal` primitive, plus `blink` (stepping
  through a threshold) and `ward` (binding one shut).
- **Both** canonical `knowledge-steal` cells named in `vision.md` §5 and §8 — `intellego-mentem`
  and `rego-nomen` — so a universe can permit one theft vector and forbid the other. Theft is
  asymmetric within itself, not a single switch.
- The vision's own flagship interdiction example, "*Mentem is open to my scholars, but none shall
  unmake a mind*" — that is `perdo-mentem`, and it is only expressible if both Perdo and Mentem are
  in the subset.
- A *magical* cause of knowledge loss. `perdo-mentem` destroys mind instances and `perdo-nomen`
  destroys instances by name. Without a destruction technique, the 0.3.0 loss claim could only be
  tested by killing a mage, which is `mages-and-species` behaviour arriving one release later.
- `rego-terram` for `build-rate`, which `vision.md` §4 uses as its worked example of "earth magic
  builds universities faster is a number, not a special case."

The permit/forbid decisions it produces are genuinely different from one another, which is the
asymmetry the charge asks for:

| Axis | Cost of forbidding | Benefit of forbidding |
|---|---|---|
| `intellego` | Research and prospecting slow to unaided rates | No mind can be read in your sky, by anyone |
| `perdo` | Your raiders learn no unmaking and can only ever loot, never burn | Nothing in your sky can be unmade — not your library, not your archmages |
| `rego` | No portals, no build-rate, no teaching bonus; a hermit civilization | Near-total isolation |
| `limen` | No portals in either direction, no blink, no thresholds | You cannot be raided at all |
| `mentem` | No teaching bonus, no defensive mind-magic | Closes theft vector one |
| `nomen` | No scribing bonus, no summoning, no concealment | Closes theft vector two |
| `terram` | An ordinary economy | Your works cannot be collapsed |

*Alternative considered:* `{creo, intellego, rego} × {ignem, mentem, terram, limen}` — the
conventional-looking set, with fire for combat and creation for building. Rejected on three counts.
It contains no destruction technique, so at 0.3.0 nothing in the subset can destroy a knowledge
instance and the release's own loss claim becomes untestable until 0.4.0. It excludes Nomen, which
strands True Naming — one of the three v1 traditions — with no form to bite on, and drops one of
the two canonical theft cells. And forbidding Creo is a weak decision compared to forbidding Perdo,
because Creo's downside when permitted is diffuse while Perdo's is exactly "an invader can unmake
the thing you cannot replace."

*Alternative considered:* including `corpus` for `lifespan` and `fertility`. Rejected — both
primitives are consumed by `mages-and-species`, neither has anything to act on until mages age, and
spending one of four form slots on them would cost either Nomen or Terram. Recorded as an accepted
gap below.

*Accepted gap:* `lifespan` and `fertility` are the only two primitives no v1 node exercises. Both
are Corpus- and Animal-bound and both are 0.4.0 concerns; they enter with the second content wave.
The coverage requirement in `magic-primitives` names them as the two permitted exclusions, so the
gap is asserted rather than discovered.

*Accepted cost:* four of the nine classical labels in `vision.md` §4 are represented — divination,
enchantment, incantation, and abjuration. Evocation, illusion, conjuration, necromancy, and
transmutation are absent from v1. That is a presentation cost, and the first human cohort is at
0.9.0, five releases after the labels stop being merely decorative.

### Permission gates acquisition, not only casting

`permits(universe, cellId)` gates the three world-time knowledge operations — research, teaching,
and scribing — as well as casting. A mage in a universe that forbids `perdo-mentem` cannot research
it, cannot be taught it, and cannot have it scribed for them.

`openspec/project.md` states the rule directly: "Permitting something at home lets your mages
*learn* and defend with it." Gating acquisition is what gives forbidding a price. Under cast-only
gating, a universe forbids everything dangerous, keeps researching it in perfect safety, and carries
a full spellbook abroad — forbidding becomes strictly dominant and the game's central decision
collapses into a single correct answer.

*Alternative considered:* gating casting only, with acquisition always legal. Rejected for the
reason above. *Alternative considered:* gating acquisition *and* forbidding possession outright —
see dormancy, next.

The gate is written over the three named operations rather than as a universal "no instance of a
forbidden node may exist." A universal invariant would silently pre-decide what raid theft is
allowed to deposit into a raider's mind, and that is `raid-engagement`'s call. It is recorded as an
open question below.

### Forbidding makes instances dormant, not destroyed

An instance whose node's cell is not permitted is **dormant**. Dormancy is derived, never stored:
it is exactly `!permits(universe, cellOf(nodeId))`, so re-permitting a cell restores every surviving
instance with no bookkeeping. A dormant instance may not be cast, taught, scribed, or counted toward
any primitive effect, and it may not be used as a satisfied prerequisite. It does still count toward
the node's existence, so the node has not left the universe.

*Alternative considered:* destroying every instance of a cell the moment it is forbidden. Rejected —
that turns a single edict into an irreversible knowledge-genocide button, makes the god's own switch
by far the largest source of knowledge loss in the simulation, and drowns out the mortality and raid
signals that `knowledgeHalfLife` exists to measure. It also makes a forbid/re-permit oscillation
catastrophic in a way no player could reasonably anticipate.

*Alternative considered:* dormant instances still counting as prerequisites, so a mage can research
*through* a forbidden cell to reach a permitted one beyond it. Rejected — it lets a god route around
their own interdiction, and it makes the prerequisite graph's meaning depend on history rather than
on present state.

### Dormant instances decay without a floor; held instances decay to a retention floor

Mastery decays per world tick for mind and palace instances only. Written instances — grimoire and
library — do not decay; their fragility is `durability`, not forgetting.

A normally-held instance decays toward a floor derived from the holder's species `retention`, so a
mage who genuinely learned something does not silently forget it. A **dormant** instance has no
floor and decays to zero, at which point it is destroyed.

This is what gives an interdiction teeth without giving it a hammer. Forbidding a cell does erase it
from your civilization eventually — visibly, gradually, at a rate that differs by species, and
recoverably if the god changes their mind in time. A dwarf universe (`retention` 1536) holds
forbidden knowledge far longer than a gnome one (poor retention), which is a behavioural difference
`mages-and-species` gets for free.

Decay is a deterministic function of elapsed ticks, retention, and dormancy. It draws no randomness.
Reserving RNG for genuinely stochastic outcomes keeps the stream registry honest and keeps decay
from perturbing every other subsystem's draw sequence.

*Alternative considered:* no decay at all, with knowledge lost only to death and destruction.
Rejected — it makes `retention` a dead species stat, makes mind-storage strictly better than
grimoires, and removes the pressure that makes scribing worth its cost.

*Alternative considered:* decay with no floor for all instances. Rejected — a long-lived elf would
forget their specialty while alive, which contradicts "deep specialists," and unbounded forgetting
plus a compounding capital loop is a stability risk nobody can measure until 0.5.0.

*Alternative considered:* pausing decay while a node is in active use. Rejected here as a boundary
violation — "in active use" is a fact about mage behaviour, which is `rules-world`. If it is wanted,
it arrives as a caller-supplied parameter in `mages-and-species`, not as a flag invented here.

### Held knowledge contributes effects only above an activation threshold

A held instance contributes its node's primitive effects only once its mastery reaches a declared
activation threshold. Below it the instance exists, is teachable-status tracked, and can be improved,
but it produces no `build-rate`, no `direct-damage`, and no anything else.

Without a threshold, the instant a research operation completes the mage delivers that node's full
magnitude, and mastery becomes a stat that governs only teaching fidelity. With it, acquisition has a
ramp: a civilization that learns broadly and shallowly holds a great deal of knowledge that does
nothing yet, which is the same pressure that makes the teaching-loss rule interesting from the other
direction.

*Alternative considered:* contributing full magnitude at any mastery, including `fp(0)`. Rejected —
it makes acquisition and capability the same event, deletes the only reason to keep practising a node
you already hold, and would let a raider taught a node in the field deploy it at full strength in the
same engagement.

*Alternative considered:* scaling magnitude continuously with mastery. Rejected for this release —
it multiplies every effect by a second per-instance factor before the harness exists to tell whether
the resulting curve is sane, and it interacts with the primitive caps in a way nothing at 0.3.0 can
measure. The threshold is the conservative placeholder; the continuous curve is a 0.5.0 question.

### Rediscovery has a hard floor of 3×, applied after species affinity

`release-plan.md`'s 0.3.0 claim is that rediscovery "costs at least 3× its original research cost."
`contracts.md` §2.3 shows a node with `rediscoveryMultiplier: 3072`, and §2.4 shows a species with
`rediscoveryAffinity: 768` described as a "multiplier against `rediscoveryMultiplier`". Composed
naively those give an effective 2.25×, and the release claim is false before a single line is
written.

Resolution: `rediscoveryMultiplier` is a content invariant of at least `fp(3072)`, species affinity
applies to it, and the result is then clamped to a floor of `fp(3072)`. v1 content sets most nodes
well above the floor so affinity has room to differentiate, which is where gnomes get their
`vision.md` §5 rediscovery bonus. The claim stays literally true for every node and every species;
species differentiation survives everywhere except at the floor itself.

*Alternative considered:* dropping the floor and weakening the release claim to "at least 3× before
species modifiers." Rejected — the claim is one of only two the release makes, and a claim with a
qualifier attached to make it survive is not the same claim. The correct move when a document and a
claim disagree is to fix one of them deliberately, which is what this does, and to report the
conflict rather than quietly picking a reading.

### A knowledge instance's location follows its grimoire's holder

`contracts.md` §1.5 defines `locationKind` `2` = grimoire and `3` = library, and separately gives
grimoires a `holderKind`/`holderId` that may be a library. Read literally, a shelved grimoire's
knowledge could be counted twice — once as a grimoire instance, once as a library instance.

Resolution: exactly one instance exists per written copy. It carries `(2, grimoireId)` while the
grimoire is held by a mage or in transit, and `(3, libraryId)` while the grimoire is shelved in a
library. Shelving and withdrawing rewrite the instance's location. The grimoire entity persists
across both, and the grimoire-to-instance association is held in a subsystem-owned index keyed on
the grimoire handle, not in a state field.

This keeps library depth a cheap count over `locationKind == 3`, keeps "burn the grimoire, lose the
instance" true in both states, and makes a destroyed library resolve to "every instance whose
`locationId` is this library" without a join.

*Alternative considered:* keeping the instance at `(2, grimoireId)` always and treating
`locationKind` `3` as unused in v1. Rejected — it makes library depth a join through every grimoire's
holder on every query, in the hot path of the capital loop, and it leaves a documented location kind
permanently dead.

### `rules-magic` publishes library depth; `rules-world` applies it

The knowledge subsystem exposes `libraryDepth(libraryId)` — a function of the instances stored
there, weighted by node tier so that a shelf of tier-1 primers is not a research university.
`mages-and-species` consumes it as an input to university output. Nothing about university
throughput is decided here.

This is the `contracts.md` §5 coordinating-layer rule applied to the specific interaction
`vision.md` §6a is built on. It also keeps the compounding loop's two halves in separate packages,
so the harness can ablate one without recompiling the other.

*Alternative considered:* computing university output here, since the depth is here. Rejected — it
would require `rules-magic` to know about staff, capacity, and build progress, which is precisely the
import cycle §5 forbids.

### Tradition hook kinds are a closed enumeration; v1 declares five

Every tradition declares all four hooks. Each hook's `kind` selects from a closed set implemented in
code, with `params` as data. v1 implements exactly five kinds:

| Hook | Kinds in v1 |
|---|---|
| `acquire` | `standard`, `true-name` |
| `store` | `standard`, `palace` |
| `cast` | `standard`, `prepared` |
| `cost` | `standard`, `prepaid` |

- **Vancian memorization** — `cast: prepared`, `cost: prepaid`, others `standard`. A mage holds a
  bounded number of prepared nodes; casting expends the preparation, and the price was paid at
  memorization rather than at release.
- **True Naming** — `acquire: true-name`, others `standard`. Research costs far more (a true name
  must be discovered), teaching costs far less (a name can be spoken), instances are created at
  full mastery because a name is either known or not, and a stolen instance therefore arrives
  complete. That is the "vicious synergy with knowledge-theft" of `vision.md` §4a, in both
  directions, from one hook.
- **The Art of Memory** — `store: palace`, others `standard`. Instances live at `locationKind` `4`,
  bounded by `slotsPerMage`; scribing is unavailable, so no grimoire or library instance can be
  created; and every instance dies with its holder.

Vancian deliberately declares two non-`standard` hooks rather than one. Otherwise no v1 tradition
exercises `cost` at all, and a hook nothing uses is a hook nobody has tested — which is how the
cross-portal split ships broken and is discovered at 0.7.0.

*Alternative considered:* letting a tradition supply a general predicate or script. Rejected for the
reason `vision.md` §4a gives the cap in the first place: bespoke tradition code is exactly what
defeats primitive-level Monte Carlo balancing. A closed enumeration means the harness can enumerate
the whole tradition space.

### The Art of Memory contributes library depth from palaces

Under a `palace` store hook, a university's effective library depth is computed from the palaces of
its affiliated living mages, at a coefficient declared in the hook's `params`.

Without this, an Art of Memory universe has zero library depth by construction, so the entire
knowledge-as-capital loop of `vision.md` §6a is switched off for one of the three v1 traditions.
With it, the loop runs but its capital is mortal: an Art of Memory university's research advantage
literally ages out and must be continuously replaced, which is the sharpest possible expression of
"it dies with the mage" without disabling a core system.

The coefficient is a hook parameter — data, tunable, and the first thing the harness will move at
0.5.0.

*Alternative considered:* Art of Memory universities simply having zero library depth. Rejected —
it is very likely unplayable, and worse, it is *untestably* unplayable: nothing before 0.5.0 can
measure how unplayable, so it would ship as a guess and sit there for two releases.

*Alternative considered:* letting Art of Memory scribe grimoires anyway, with unlootable contents.
Rejected — it contradicts `vision.md` §5 directly and dissolves the tradition's identity into a
rounding factor.

### Cross-portal hooks split by clock, and by a pure function

Per `vision.md` §4a: `acquire` and `store` follow the mage's home tradition; `cast` and `cost`
follow the host. This ships here as a pure function `hookFor(hook, homeTraditionId,
hostTraditionId) -> kind`, testable with no engagement running.

The vision's worked example — "a Vancian raider in an Art of Memory universe carries her own
preparations but pays the host's price to release them" — needs one more piece of precision that
`contracts.md` §1.6 leaves open. `preparedSpells` is populated at portal entry by the **raider's
home** `cast` kind, because loading preparations is a world-time act performed before she leaves;
thereafter expenditure follows the **host's** `cast` kind and payment follows the **host's** `cost`
kind. A Vancian raider in a `standard`-cast sky therefore arrives with exactly her prepared list and
pays standard costs from it.

*Alternative considered:* the host's `cast` kind populating `preparedSpells` too. Rejected — under
a `standard` host, the raider would arrive with every node she knows, which contradicts "carries her
own preparations" and makes Vancian's entire limitation evaporate the moment she steps through a
door.

### Teaching eligibility and transmission loss are mastery thresholds

`contracts.md` §1.5 says `fp(1024)` mastery means "teachable without loss" but does not define the
loss. Resolution: a teacher below a declared eligibility threshold cannot teach the node at all; a
teacher at or above the threshold but below `fp(1024)` teaches successfully but the student's
instance is created at a mastery reduced in proportion to the shortfall. At `fp(1024)` there is no
reduction.

This makes a specific, desirable thing true: knowledge degrades across a chain of mediocre teachers,
so a civilization that teaches faster than it masters ends up with a wide, shallow, fragile body of
magic. That is the behaviour `knowledgeHalfLife` and `libraryDependence` are meant to detect, and it
does not exist if teaching is lossless.

*Alternative considered:* a flat probability of teaching failure with no mastery transfer. Rejected —
it produces the same expected throughput with none of the generational degradation, and it burns an
RNG draw to model something that should be legible in the state itself.

### Operations are pure functions over caller-supplied rates

Every knowledge operation takes the world-side inputs it needs — learn rate, retention, scribe
affinity, rediscovery affinity, available scribe capacity, materials — as explicit parameters, and
treats mage, grimoire, and library identifiers as opaque handles. It returns a description of the
state change rather than reaching into `rules-world` structures.

*Alternative considered:* passing a mage entity and reading species data through it. Rejected — that
is the import cycle `contracts.md` §5 forbids, and it is forbidden because the alternative is a
dependency-graph test that fails on the first commit of `mages-and-species`.

## Risks / Trade-offs

- **Dormancy is a mechanic the vision never names** → It follows from gating acquisition, which the
  vision does imply, and it is the least destructive of the three available readings. It is derived
  from `permits()` and stores nothing, so reversing the decision is a change to one predicate rather
  than a state migration.
- **Palace-derived library depth is the largest invention in this change** → Confined to a
  `store`-hook parameter, so it is data the harness can move to zero at 0.5.0 if the mortal-capital
  loop misbehaves, without a code change.
- **The 3× rediscovery floor removes species differentiation at the floor exactly** → Accepted, and
  mitigated by authoring v1 content above the floor. Reported to the contract owner rather than
  resolved silently.
- **Mastery decay makes long-run knowledge behaviour hard to predict before 0.5.0** → Accepted
  deliberately. Decay is deterministic and floor-bounded, so a long-run scenario test can assert
  monotonicity and the floor without asserting anything about whether the rate is *good*.
- **The v1 subset has no fire, no healing, and no necromancy** → Accepted. v1 is machine-played;
  thematic breadth is a 0.9.0 concern, and the schema already covers all 70 cells so the second
  content wave adds data and no code.
- **Twelve cells is a small sample for a coverage claim** → The coverage requirement asserts
  primitive coverage, not primitive balance. Whether the magnitudes are sane is not knowable here
  and is not claimed.

## Migration Plan

Additive on top of `core-contracts`. No existing behaviour changes; `packages/rules-magic` is new
and nothing imports it yet at the time it lands. The only edits to existing artifacts are content:
setting `"v1": true` on the 12 chosen cells (replacing the placeholder selection `core-contracts`
ships), authoring their node graphs, and authoring the three tradition records.

Rollback is reverting the branch. The one irreversible-feeling piece is the v1 cell selection, and
it is not actually irreversible — the schema covers all 70 cells, so changing the subset is a content
edit plus a re-tune, not a structural change.

## Open Questions

- **Does host legality gate what a raid may steal into a raider's mind?** The acquisition gate here
  covers research, teaching, and scribing only. Whether theft can deposit an instance of a node
  forbidden in the thief's home universe is `raid-engagement`'s decision, and it is deliberately
  left open rather than pre-decided by a universal invariant.
- **What does changing a universe's tradition do to instances that the new `store` kind cannot
  hold?** A universe switching to the Art of Memory has grimoires with nowhere legal to live.
  `vision.md` §4a says the change is "ruinously expensive" and throws the civilization into upheaval;
  quantifying that ruin is `god-agency`'s, since it owns the action. This change specifies only that
  the operation must be total — no instance may be left in a state the active `store` kind does not
  define.
- **Should node tier weight library depth linearly or superlinearly?** Linear in v1 as the
  conservative placeholder. The capital loop is one of the two compounding loops `vision.md` §6a
  flags, and the weighting is a prime suspect for `capitalSnowball`; it is a tuning constant, first
  measured at 0.5.0.
- **What resource does the `cost` hook deduct from?** `contracts.md` §1.2 gives a mage no fatigue,
  vigor, or reserve field, and §1.6 gives a combatant only `hp` and `concealment`. The `cost` hook
  therefore has nothing declared to spend. This change specifies `cost` as a function returning a
  magnitude — `standard` returns non-zero, `prepaid` returns zero — so the hook is fully testable
  without the resource existing; whichever capability introduces the caster resource must add it to
  `contracts.md` §1.2 and §1.6. Reported to the contract owner rather than invented here.
- **Is `fp(1024)` the right teaching-eligibility threshold, or should it sit below full mastery?**
  Authored as a content constant so it can move without a code change, but which value produces
  interesting generational degradation is unanswerable before the harness exists.
