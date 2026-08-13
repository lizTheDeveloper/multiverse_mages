# Multiverse Mages — Design Vision

*Status: approved 2026-08-10. This document is the vision of record. Every OpenSpec change
should trace to a section here; anything built that isn't described here is scope creep, and
anything described here that never ships is an unmet promise.*

---

## 1. The Fantasy

You are the god or goddess of magic for one universe. You never cast a spell and you never
command a mage. What you do is decide **what magic is possible at all**, and then watch a
civilization of scholar-warriors discover it, teach it, write it down, forget it, and
eventually carry it through a portal into someone else's sky.

The mages are academics with swords. They have careers. They have curiosity, and species, and
lifespans, and they die — sometimes taking the only copy of something irreplaceable with them.

Your relationship to them is pressure, not control: you bless, you fund, you forbid, you grant
founding knowledge to a chosen scholar so that a body of magic can exist in your world for the first
time. Then you let go and see what they make of it.

## 2. Design Pillars

1. **Rules-setting is the core verb.** The most interesting decision in the game is which
   magic exists in your universe — because that choice is *symmetric* and permanent-feeling.
2. **Knowledge is physical.** It occupies minds and books and buildings. It can be taught,
   copied, stolen, and lost. This is what makes a civilization feel mortal.
3. **You are a god, not a general.** Autonomy of the mages is a feature, not a limitation.
4. **The numbers come first.** The game is balanced by machine play before it is made pretty.

## 3. The Portal Rule

The single load-bearing mechanic:

> **The host universe's ruleset governs all magic cast inside it, for both attacker and
> defender.**

Formally: a spell functions in a universe if and only if that universe permits its **technique**
and its **form** (§4), after edicts are applied.

Consequences, which are the whole strategy layer:

- If both universes permit *Creo Ignem*, both sides throw fire in either realm.
- If you permit *Rego Aquam* and your rival does not: you defend with it at home, and it is
  simply inert when you raid them.
- Permitting something arms your defense *and* arms anyone who invades you and happens to know it.
- Prohibiting something is a real strategic option, not a penalty — it is a denial play.
- **Rules changes are a world-time action.** Nothing about the ruleset — including portal magic
  — can be altered once a raid has begun. A raid in progress is frozen policy.

## 4. Magic: The Grid

Magic is a grid of **techniques** × **forms**. This yields the 40+ bodies of magic as structure
rather than as an authoring backlog, and it gives the god a small number of switches with
combinatorial consequences.

**Five techniques** — what you do:

| Technique | Meaning |
|---|---|
| **Creo** | make, create, heal |
| **Intellego** | perceive, know, scry |
| **Muto** | transform |
| **Perdo** | unmake, destroy, wither |
| **Rego** | control, bind, compel |

**Fourteen forms** — what you do it to: Animal · Aquam (water) · Auram (air) · Corpus (body) ·
Herbam (plant) · Ignem (fire) · Imaginem (image and the senses) · Mentem (mind) · Terram (earth) ·
Vim (raw magic) · Umbra (shadow) · Fatum (fate) · Limen (threshold and boundary) · Nomen (true name).

**5 × 14 = 70 grid cells.** Each cell is a body of magic containing a graph of **nodes** —
individual techniques gated by prerequisites.

### Classical schools are regions of the grid

Mages still say *she's a necromancer*; the simulation sees `Rego Corpus`. The classical taxonomy
survives as vocabulary and as UI grouping, not as a second competing model:

| Classical school | Grid region |
|---|---|
| Divination | *Intellego* × anything |
| Transmutation | *Muto* × anything |
| Evocation | *Creo* × Ignem, Auram |
| Illusion | *Creo* × Imaginem |
| Enchantment | *Rego* × Mentem |
| Abjuration | *Rego / Perdo* × Vim, Limen |
| Conjuration | *Creo* × Corpus, Animal, Terram |
| Necromancy | *Creo / Rego* × Corpus, applied to the dead |
| Incantation | *Rego* × Nomen — naming as compulsion |

### What the god toggles: axes gate, edicts refine

Nineteen primary switches — five techniques and fourteen forms — each independently permitted or
forbidden. A cell is available only if **both** its technique and its form are permitted.
Permitting *Perdo* arms unmaking across every form at once; permitting *Ignem* arms fire for
everyone standing in your realm, including invaders.

On top of that, the god holds a limited budget of **edicts**, each a single-cell exception:

- A **dispensation** permits one cell whose technique or form is otherwise forbidden — *"Perdo is
  forbidden in my universe, save upon the undead."*
- An **interdiction** forbids one cell whose axes are both permitted — *"Mentem is open to my
  scholars, but none shall unmake a mind."*

The edict budget is small and grows with worship tier, so exceptions stay precious. This is what
keeps the ruleset expressive without turning it into seventy independent switches, which would
bloat both the interface and the reinforcement-learning action space.

### Balance still runs on primitives

Nodes are expressed as compositions of ~15 tunable **effect primitives**, and balance assertions
are made over the primitives, where Monte Carlo has enough samples to be truthful:

| Category | Primitives |
|---|---|
| Combat | direct-damage, ward, area-denial, blink/mobility, summon |
| Economy | build-rate, resource-yield, research-rate, teach-rate, scribe-rate |
| Social / meta | lifespan, fertility, worship-yield, concealment, knowledge-steal |
| Special | portal (gates raiding entirely; balanced on its own terms) |

*Rego Terram* letting universities go up faster is not a special case in code — it is a node
weighted toward `build-rate`.

**v1 ships a playable subset of the grid** — 3 techniques × 4 forms — against a schema built for
all 70 cells.

## 4a. Traditions: How Magic Is Performed

Techniques and forms say *what* magic does. A **tradition** says how it is performed, and this is
where the weird books earn their place mechanically rather than decoratively.

**A universe has exactly one tradition, chosen by the god.** It is an identity decision, not a
build option: changing it is possible in world time only, at enormous cost, and it throws the
civilization into upheaval.

A tradition may hook exactly four points, and no others. This cap is deliberate — bespoke
tradition code is the fun, and it is also precisely what defeats Monte Carlo balancing:

1. **Acquire** — how knowledge enters a mind
2. **Store** — where knowledge can live
3. **Cast** — how a held spell is expended
4. **Cost** — what casting takes out of the caster

**v1 ships three traditions,** chosen because each stresses the knowledge model in a different
direction:

- **Vancian memorization** (*The Dying Earth*) — a mage holds a limited number of prepared spells;
  casting expends the preparation until it is re-memorized. Stresses *cast*.
- **True Naming** (*A Wizard of Earthsea*; Rothfuss) — the knowledge instance *is* a name, and
  holding a thing's name grants power over the named thing. Vicious synergy with knowledge-theft
  and with the Nomen form. Stresses *acquire*.
- **The Art of Memory** (Camillo, Giordano Bruno) — knowledge is stored in a mental palace rather
  than a grimoire. Unburnable, unstealable by looting, un-loanable, and it dies with the mage.
  Stresses *store*.

**Across a portal, the hooks split by clock:** *acquire* and *store* are world-time concerns and
stay with the mage's home tradition — a raider does not forget how she learned things by walking
through a door. *Cast* and *cost* are host-governed, like everything else about casting in a
foreign sky. A Vancian raider in an Art of Memory universe carries her own preparations but pays
the host's price to release them.

**The deep shelf,** drawn on as later traditions and later forms: Hermetic technique×form as its
own recursive tradition, goetic pact, chaos sigils, runic galdr, enochian, gematria and
golem-craft, alchemy's Great Work, geomancy's sixteen figures, haruspicy, orphic music, glamour
and fae bargains, egregores, effigy craft, mesmerism, Paracelsan elementals, seiðr fate-weaving,
skinchanging, ars notoria, homunculus craft, artifice, humoral medicine, astrological election,
cartomancy, psychopompy, threshold-and-iron ward lore, cultivation and qi, the Wuxing generation
and destruction cycles, forbidden texts that teach themselves and damage the reader.

**Sourcing note:** content draws on historical, literary, and folkloric material and deliberately
avoids living practiced religions.

## 5. Knowledge Has a Location

A **knowledge instance** is one copy of a node, existing at exactly one of:

- `mind:<mageId>` — fast to use, dies with the mage
- `grimoire:<itemId>` — portable, lootable, burnable
- `library:<universityId>` — aggregated grimoires; a single high-value raid objective
- `palace:<mageId>` — a memory palace. Only exists in an Art of Memory universe, and is the
  clearest example of a tradition hooking *store*: unburnable, unlootable, un-loanable, and
  utterly lost when its holder dies

A node **exists in your universe** while at least one instance does. Operations:

- **Research** — a mage derives a new node from prerequisites they hold. Slow.
- **Teaching** — mind → mind. Fast. Requires a living teacher and a student with prerequisites.
- **Scribing** — mind → grimoire. Slow; requires literate non-magical scribes and materials.
  Some species are far better at it.
- **Loss** — the last instance is destroyed. The node leaves the universe.
- **Rediscovery** — re-deriving a lost node from prerequisites, at a cost far above learning it
  from a teacher. Gnomes are unusually good at this.
- **Theft** — the `knowledge-steal` primitive, concentrated in *Intellego Mentem* and *Rego
  Nomen*. Reading it from a mind mid-raid, or looting the grimoire that holds it. A True Naming
  universe makes this far more dangerous in both directions.
- **Practice** — a mage spends a month keeping a node she already holds sharp, and its mastery
  goes back up. The only operation that raises mastery: forgetting is otherwise monotone, which
  is why for three releases 93.4% of held instances sat below the threshold at which their holder
  can teach them (`ages-of-magic.md` §2c). It costs the month, so it competes with research and
  teaching; it is refused in a forbidden cell, so an interdiction cannot be practised away; and
  it is what the economy's `resource-yield` reads, so a universe's harvest reflects the magic its
  mages are *casting* rather than the magic they happen to know.

This list was **six** operations for three releases, and practice was the missing seventh. It was
missing in the strong sense: `decay.ts` named it in its own prose — *"nothing in this subsystem
restores mastery; practice does, and practice is an operation somebody has to perform"* — and
nobody performed it, so the game shipped the perish half of publish-or-perish and none of the
publish half.

This is what makes losing hurt in a way that losing units never does.

## 6. Species

Six playable species plus the non-magical populace. Tuned on: lifespan, curiosity (rate of
self-directed research), depth ceiling (deepest node tier reachable), learn rate, retention,
fertility, and technique/form affinities.

| Species | Lifespan | Character |
|---|---|---|
| **Human** | ~80y | High curiosity, high fertility, broad average aptitude. Wins on volume and breadth; loses knowledge constantly to mortality. |
| **Elf** | ~700y | Moderate curiosity, high depth ceiling, slow to learn. Deep specialists. |
| **Dwarf** | ~250y | Low curiosity, exceptional retention and scribing — dwarven grimoires resist destruction. The archivists. |
| **Draconic** | ~1500y | Barely curious, highest depth ceiling, very slow learning, very low fertility. Few, ancient, and terrifying. |
| **Gnome** | ~350y | Highest curiosity, discovery and *rediscovery* bonuses, poor retention. Erratic geniuses. |
| **Orc** | ~60y | Low magical aptitude, high build-rate and martial capability, high fertility. |

**Universities are generic capacity; specialization is emergent** — a university becomes known for
Rego Terram because that is what its library holds and its professors know, not because it declared
a discipline. The decisive reason is mechanical: the observation block for institutions is fixed at
four slots, and a declared specialization over 70 cells would force a resize that invalidates every
trained agent.

**Non-magical individuals** exist across all species and matter mechanically: scribes copy
grimoires, laborers build universities, students become the next generation of mages, soldiers
fight in raids without magic. A universe of pure archmages does not function.

## 6a. The Economy

Three tracked inputs, distinct from favor (which is the god's own currency, §7):

**Populace** — people, by species and by role. Produced by fertility, consumed by everything.
Non-magical individuals are the bulk of it: laborers raise buildings, scribes copy grimoires,
students become the next generation of mages, soldiers fight in raids without magic. Mages are a
thin, expensive layer on top of a large ordinary population.

**Materials** — the physical substrate. Buildings consume it; so does every grimoire, which is why
a universe can be knowledge-rich and unable to write any of it down. *Rego Terram* and its
neighbours move this number, which is how "earth magic builds universities faster" becomes a
number rather than a special case.

**Knowledge as capital** — a university's output scales with the depth of its library. This is the
consequential one: knowledge is not merely a thing you accumulate, it is an *input to producing
more knowledge*. A deep library trains better mages, who research faster, who deepen the library.

That is a compounding loop, and it is the second one in the design after worship (§7). Two
compounding loops that feed each other is exactly the shape that produces runaway leaders in
strategy games, so the balance harness must watch it specifically — and burning a rival's library
is not just a loss of stored spells, it is an attack on their rate of future production.

## 7. The God's Agency

Everything the player does costs **favor**, drawn from a regenerating pool whose regeneration
scales with **worship** — the number and devotion of mages, universities, and populace revering
you. Growing your world grows your power, which means snowballing is a live risk the balance
harness must specifically watch for.

Interventions include: bless a mage, grant founding knowledge (the only way to introduce a body
of magic nobody in your world knows), fund a university, assign a standing role, permit or forbid
a technique, permit or forbid a form, spend an edict as a dispensation or an interdiction (§4),
encourage a research direction, and — rarely and ruinously — change the universe's tradition.

**Mage autonomy:** mages act on utility-scored goals shaped by species, age, personality, and
their assigned standing **role** (researcher, warden, professor, raider). You set the role; they
decide everything else. You never issue direct orders — including in raids.

## 7a. Space and Scale

**The world is abstract. Raids are positional.** This split is deliberate and it defines what the
simulation has to represent.

At **world scale** there is no map. Universities, populations, materials, and knowledge are counts
and relationships. A university is not *somewhere*; it exists, it has a library, it has staff, it
has students. Knowledge spreads through the teaching graph, not across geography. This keeps the
management layer legible and keeps world-time Monte Carlo cheap enough to run at volume.

At **raid scale** there is a real battlefield: positioned combatants, terrain, range, line of
sight, and objectives that occupy locations. This is where the game looks like an RTS and where
the `blink/mobility` and `area-denial` primitives mean anything.

The consequence for the simulation core: only engagement-mode state needs spatial indexing, and
only combatants need positions. World-scale entities carry no coordinates at all. This is a large
saving and it is why the entity store's component model must not assume every entity is placed.

## 8. Raids

- **Two clocks, and clocks are per-universe.** World time advances in months/years while you tend
  your universe. Entering a raid **pauses world time for the two participating universes** and
  switches them to a fast combat clock. **Uninvolved universes keep advancing.**
- **Therefore raiding costs tempo, for both sides.** While you fight, everyone not fighting is
  researching, teaching, and building. An attacker pays that price as surely as a defender, which
  means raiding is never free and a third party profits from every war. This is the intended
  shape.
- **It also creates a griefing surface, which must be measured, not assumed away.** A player who
  is raided repeatedly loses world time others are spending. `raid-engagement` and `god-agency`
  must between them bound inbound raid frequency, and the balance harness must report tempo lost
  to inbound raids as a first-class metric. An unbounded version of this rule is a live-PvP
  death sentence dressed as a strategic cost.
- **Entry** requires *Rego Limen* — the portal cell — and favor.
- **Arbitration:** host ruleset governs (§3). Casting and cost follow the host's tradition; what
  a raider knows and how she carries it follow her own (§4a).
- **Termination:** objective-based, with a portal stability timer that guarantees the raid ends.
  Attacker wins by destroying or looting a target — a library, a university, an archmage.
  Defender wins by holding until the portal collapses.
- **Stakes:** casualties are permanent. Knowledge whose last instance dies with a mage or burns
  in a library is *lost* and must be rediscovered. Theft is cell-gated, not universal — it lives
  in *Intellego Mentem* and *Rego Nomen*.

## 8a. Ascension and Prestige

A universe's life is long but not endless. **Ascension** is the terminal condition: a summit
reached — the deepest node of a cell, or a civilization that has held its knowledge intact across
enough eras — that ends the run gloriously rather than by defeat.

**Prestige carries forward.** Ascending closes a universe and opens a new one, seeded with legacy
drawn from what the last one achieved. The persistent world is therefore persistent *across* runs,
not within one infinite run.

This resolves a tension the earlier design had. "Persistent world" and "Monte Carlo needs a
terminal condition" pull against each other; ascension gives every run a clean, bounded end that
MC can score as a binary and a duration, while prestige preserves the long-term ownership the
persistent-world fantasy is actually about.

Design constraints this creates, to be honoured in `god-agency` and the balance harness:

- Prestige must not compound without bound across runs, or the meta-game decides matches before
  they begin — a live-PvP death sentence.
- The ascension condition must be reachable but not routine. If a majority of Monte Carlo runs
  ascend, it is not a summit; if almost none do, the meta-game never starts.
- Defeat is not the opposite of ascension. A universe that is raided to ruin does not "lose" —
  it stagnates, and stagnation is its own ending.

## 9. Balance Methodology

This is a first-class feature, not tooling.

- **Monte Carlo sweeps.** Thousands of headless runs over parameterized universes, played by
  scripted agents. Metrics: win-rate contribution per primitive, time-to-node-tier by species,
  knowledge half-life, snowball detection on the worship loop, raid length distribution.
- **The agent interface is the MC interface.** One observation/action API serves scripted bots,
  Monte Carlo, and later reinforcement learning. Building it twice would guarantee divergence.
- **Balance regression gates.** Committed baselines; a change that moves a primitive's measured
  contribution beyond tolerance fails CI and must be accepted deliberately.
- **Humans last.** Human playtesting discovers the human meta *after* the machine meta says the
  numbers are sane.

## 10. Technical Shape

TypeScript monorepo. A pure, dependency-free simulation core — no I/O, no floats in the rules
path, seeded PRNG only — consumed identically by the Monte Carlo harness, the Electron client,
and the authoritative multiplayer server. Determinism is enforced by golden-replay tests.
Written so the hot loop could be ported to Rust if throughput demands it, without touching game
design. Python RL bridge over JSON-over-stdio, staged for later.

**Hosting and distribution:** published under **Multiverse Games**, hosted on **Hetzner Cloud**,
provisioned via the `hcloud` CLI. Both the game's distribution and the authoritative multiplayer
servers live there. `pvp-server` is therefore designed for self-hosted Linux VMs — plain
containers or systemd units on Hetzner instances, no managed-cloud primitives, no vendor
serverless, and no dependency on a service that only one provider offers. That constraint is also
what keeps the AGPL's source-offer obligation practical to honour: anyone can stand up the same
server the same way.

## 11. Roadmap

Each row is one OpenSpec change, delivering the capability specs named beside it. Roadmap rows
use the real change and capability identifiers so that `openspec list` and this table stay in
agreement — that agreement is how "did the vision get built?" is answerable.

| Version | OpenSpec change | Capabilities delivered | Status |
|---|---|---|---|
| 0.1.0 | `sim-core-foundation` | `simulation-core`, `world-persistence`, `deterministic-replay` | released |
| 0.2.0 | `core-contracts` | `state-schema`, `content-schemas`, `primitive-semantics`, `observation-action-space`, `module-boundaries` | released |
| 0.3.0 | `knowledge-model` | `magic-grid`, `magic-primitives`, `knowledge-instances`, `magic-traditions` | released |
| 0.4.0 | `mages-and-species` | `species-traits`, `mage-lifecycle`, `mage-autonomy`, `universities`, `economy` | in progress |
| 0.5.0 | `agent-interface` | `agent-api`, `mc-harness`, `balance-metrics` | not started |
| 0.7.0 | `god-agency` | `favor-economy`, `worship-loop`, `interventions`, `ascension-and-prestige` | not started |
| 0.9.0 | `raid-engagement` | `portals`, `host-ruleset-arbitration`, `raid-space`, `raid-objectives`, `raid-consequences` | not started |
| 0.11.0 | `gym-bridge` | `rl-bridge` | in progress |
| 0.13.0 | `electron-client` | `client-shell`, `world-presentation` | proposal only |
| 0.15.0 | `pvp-server` | `authoritative-lockstep`, `direct-challenge`, `universe-persistence`, `hetzner-deployment` | proposal only |
| — | `metis-knowledge` | `metis-knowledge` | proposal only |
| 1.0.0 | — | contracts freeze; public release | — |

Versions skip because **MINOR parity encodes balance validation from 0.5.0 onward** — odd means
in flight, even means the Monte Carlo baselines are committed and green. Every capability therefore
ships twice: it lands odd, and is *promoted* to the next even MINOR once it is proven. The even
releases carry no new features, which is exactly what makes them worth having.

Steps through 0.4.0 produce a single universe that runs on its own. **0.5.0 makes it measurable** —
before that, no claim about balance is verifiable, so none should be made. 0.6.0–0.7.0 make it a
game. 0.8.0–0.10.0 make it playable by learning agents and then by humans.

**The RL bridge ships before the client, deliberately.** Machines discover the meta first; humans
discover the human meta second. Shipping the client first would make human playtesters the primary
balance signal by default, which is the exact outcome the balance-first methodology exists to
avoid. See `docs/design/release-plan.md` for version semantics and the falsifiable claim each
release makes.

**Change 2 is the parallelization gate.** Everything downstream is built against the contracts it
fixes — the state schema, the content data schemas, the exact semantics of every effect primitive,
and the observation/action space. With contracts in hand, changes 3, 4, and 5 can be built
concurrently by separate agents without touching each other's code; without them, they would each
invent an incompatible version of the same model.

**Changes 8–10 are deliberately held at proposal depth** until the core exists. Specifying a
client, a netcode layer, and an RL bridge with zero implementation experience produces documents
that are confidently wrong in ways nobody can see yet.

## 12. Deliberately Out of Scope for v1

- Grid cells beyond the v1 subset (3 techniques × 4 forms), and traditions beyond the three
  named in §4a
- Animated RTS presentation, art pipeline, audio
- Reinforcement learning *training*. The interface ships; the training does not
- Ranked ladder, matchmaking beyond direct challenge, economy, monetization
- Player-authored techniques, forms, or primitives

## 13. Open Questions

Tracked for resolution during the changes that need them, not blocking:

- ~~How many mages does a mature universe hold?~~ **Answered empirically in 0.1.0** — see
  "Measured simulation throughput" below. The population question was never really about mages; it
  was about whether the Monte Carlo harness could afford them. It can. **Re-answered from the game
  rather than the substrate in 0.4.0, and the number is much smaller than the substrate allows:**
  the 200-year reference run ends with **88 living mages against a populace of 18,713** — one mage
  per two hundred people — peaking at 91 over the whole run. What bounds it is not magic and not
  mortality; it is student seats. The founding academy has 64 of them, the occupation controller
  fills them to exactly 64 from world year thirty onward, and no second university is ever founded
  because founding one is a god action and the reference run receives zero player input. So a
  "mature universe" at this build is a universe whose mage roster is capped by an institution the
  player never built. The figure to re-measure is mages-per-seat, not mages.
- ~~Do universities declare a specialization?~~ **Resolved in 0.4.0: no — generic capacity, with
  specialization emergent.** §6 argued this from the observation layout, and the implementation
  holds to it: `contracts.md` §1.4's university record carries `capacity`, `buildProgress`, a
  library and staff, and a conformance check in `packages/rules-world` rejects any specialization,
  focus or preferred-cell field outright. What a university is good at is derived on demand from
  what its library holds and what its resident mages know, and is never cached in state — so
  burning a library changes what the institution *is*, rather than leaving a declared discipline
  attached to an empty building. The `institutions` observation block is still exactly four slots,
  which is the constraint that made the decision mechanical rather than aesthetic.

  **What the resolution now buys, measured.** This paragraph used to say the resolution bought
  nothing: emergent specialization needs libraries that differ, and in the reference run they did
  not — one university, and its shelf held **two distinct nodes against 1,263 books**, because the
  scribable list was ordered by cost and every scribe copied the cheapest thing available.

  That is fixed, and the fix is `w7/knowledge-capital`'s, not a new mechanism: `compareTargets`
  orders scribing candidates **novel first** (`libraryHolds`, set only by the scribing scan, so
  research and teaching order is unchanged), and library upkeep charges per *instance* while the
  capital table pays per *distinct node*, so a duplicate costs and returns nothing. The same
  200-world-year reference run now ends with **15 books over a library depth that reaches 36
  distinct nodes**, and total effective capital contribution is a curve — `0 → 336` fp — where it
  was pinned at `fp(32)` for 199 years. `reference-long-run.test.ts` 9.8 prints both series and
  asserts `grimoires < 2 × libraryDepth`, which is the tripwire for the preference silently
  ceasing to bite.

  Still not demonstrated: **several** libraries that differ from each other. The reference universe
  holds one university, so what is shown is a library that specializes, not two that specialize
  differently. That is the measurement the raid design needs, since a library is the raid objective
  and a raider learns nothing from a shelf that matches her own.
- How long is a world year in real seconds, and how long should a raid run? Pacing is a tuning
  output of the balance harness, not an up-front decision; the contracts fix the *units*, not the
  values.
- How much prestige may carry between runs before the meta-game decides matches before they
  start? Deferred to `god-agency`; the balance harness must test it adversarially.
- **How asymmetric should the technique switches be, and is the Intellego trunk deliberate?**
  Surfaced while prototyping the ruleset UI, and verified against shipped content: **all eleven
  cross-cell prerequisites in the v1 subset originate in an Intellego cell**, nine of them within
  the same form. Perception before unmaking or command reads as a deliberate and rather good idea —
  but it was never written down, and it makes the nineteen switches wildly unequal. Of the v1
  subset's 51 nodes, forbidding *Perdo* leaves 34 reachable and *Rego* leaves 33, while forbidding
  *Intellego* leaves **18**, because a dormant instance cannot satisfy a prerequisite and the loss
  propagates downstream. That asymmetry is either the most interesting thing about the v1 subset or
  an accident of authoring, and the balance harness cannot tell which until someone decides. Any
  interface that renders the five techniques as equivalent toggles is lying about the game.
- **`depthCeiling` is close to inert in v1.** No v1 cell is authored past tier 5, so species with
  ceilings of 5, 6 and 7 — dwarf, elf and draconic — all reach 51 of 51. This is a content
  shortfall rather than a tuning one, and it bears directly on any species-differentiation claim
  made before deeper tiers exist.
- Which 3 techniques × 4 forms make the v1 subset? Deferred to `knowledge-model`; the subset must
  contain *Rego Limen* for portals and enough asymmetry to make the permit/forbid decision real.
- How large is the edict budget, and how does it scale with worship tier? Deferred to
  `god-agency` and expected to be retuned repeatedly by the balance harness.
- What is the exact worship formula? Deferred to `god-agency`, same caveat.
- How much of the grid is **mētis** — knowledge that cannot be written down at all? Proposed in
  `metis-knowledge` and deliberately held at proposal depth until the balance harness exists: it
  adds a decay pressure that runs on a demographic clock rather than an adversarial one, and how
  many nodes should carry it is a tuning output, not an up-front decision. The change's own design
  document raises three further questions it does not answer — whether mētis crosses a portal by
  teaching, whether mind-reading theft is too easy a workaround for succession pressure, and
  whether the ever-known record should distinguish the two kinds.

### Measured simulation throughput

Produced by `npm run bench` in `sim-core-foundation` (task 9.4). Node v22.23.1, Apple Silicon,
100 world ticks per run, seed 1, churn 1/64 of the population per tick. Every figure below is an
*output* of 0.1.0, not a target set in advance, and every later population claim is bounded by it.

| Entities | Steps/sec | Entity-updates/sec | Updates/step |
|---:|---:|---:|---:|
| 1,000 | 4,947 | 12.5 M | 2,530 |
| 5,000 | 1,469 | 18.6 M | 12,689 |
| 10,000 | 712 | 18.0 M | 25,345 |
| 25,000 | 299 | 19.0 M | 63,319 |

**What this answers.** Entity-update throughput plateaus around **18–19 M/sec** and is *flat* from
5,000 to 25,000 entities: cost is linear in population with no cliff in that range. At 10,000 mages
a universe sustains ~712 world ticks per second, and a world tick is one month — roughly **59 game
years per wall-clock second**, single-threaded. At 25,000 it still holds ~25 game years/sec.

These are single-run figures on a warm machine and vary by a few percent between runs; treat the
shape (flat, linear) as the finding and the absolute numbers as a floor to re-measure against, not
as a precision instrument.

**What it does not answer.** This is the *substrate's* cost with three components and four trivial
systems. Real mage autonomy, knowledge lookup, and university economics land in `knowledge-model`
and `mages-and-species` and will each take a bite out of these numbers. The figure to re-measure
against is entity-updates/sec, and the honest reading of the table today is "the substrate is not
the constraint" — not "a universe holds 25,000 mages".

**Disproved by:** a benchmark run below these figures on comparable hardware. Re-run it whenever a
change lands in the hot loop; the harness prints the final snapshot hash alongside the timing, so
a run whose *simulated* result moved is distinguishable from one that merely got slower.
