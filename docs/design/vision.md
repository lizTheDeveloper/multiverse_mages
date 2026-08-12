# Multiverse Mages — Design Vision

*Status: approved 2026-08-10; amended 2026-08-12 during campaign round 2 — §4, §4b, §7, §7a, §8,
§8a, §8b, §11, §12 and §13. This document is the vision of record. Every OpenSpec change
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

**v1 ships the whole grid.** The original line here scoped v1 to a playable subset — 3 techniques
× 4 forms, twelve cells — against a schema built for all seventy. That scope was about bounding
*authoring*, and **the authoring is done**: all 70 cells and 300 nodes are written, validated and
in `packages/content/data`. What the subset bought is no longer worth its cost, because the twelve
cells hold only 51 of those 300 nodes and W19 measured an idle universe holding **48.9 of 51 by
world tick 300** — an eighth of a 2,400-tick run. A subset that a universe exhausts while doing
nothing is not a scoped-down game; it is a game that is over before it starts.

The twelve cells survive as the **starting** enabled set, not as the ceiling. Permitting an axis
is still the god's core verb and still what opens the rest of the grid — that mechanic is
unchanged and is, on the measurements so far, the only lever that adds content to a set the world
exhausts on its own.

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

## 4b. What One Mage Can Hold

The grid says what a universe may contain. Three further decisions constrain the **individual**,
and together they are why the deepest magic has to be collective.

**Schools are mutually exclusive, and the test is per mage.** An individual mage cannot learn all
the magic, because some bodies of magic exclude others — *if you use light magic you can't also
use dark magic*. The exclusion is checked against the **mage's** held set, never the universe's: a
universe can eventually hold everything, spread across many mages, and that is exactly what a
civilization is for. Every exclusion carries its **reason**, and symmetry follows from the reason
rather than being asserted alongside it — an exclusion whose reason does not run both ways is not
yet an exclusion. This is an anti-requisite on the node graph, which today knows only
prerequisites.

**Depth requires a long life.** Reaching the deepest nodes should be *weird* — the province of a
naturally long-lived species, or of absurd life-extension magic. Extension therefore returns
**logarithmically**, so that buying more life never makes a species' own lifespan irrelevant; the
draconic 1,500 years must stay worth having next to a human who has bought her way upward. The
`lifespan` primitive already caps at `fraction-of-species-base 512` — half a species' base again,
and no further — which is the same instinct written as a ceiling rather than as a curve.

**The deepest magic is cast by more than one mage.** Rituals requiring several casters, ideally
casters from mutually exclusive schools, so that the summit of the grid is *structurally*
collective: a single archmage cannot be a whole civilization, and losing one mage from a ritual
group is a real loss rather than a slower schedule. Nothing in any spec today mentions rituals or
co-casting — this section is where that decision now lives, and the questions it leaves open are
in §13.

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

**When an intervention lands is part of what it costs.** §3.1 of `docs/design/sound-design.md`
makes one world tick one **bar**, and gives each subsystem a subdivision of it: economy on beats 1
and 3, teaching on the backbeat, research on 8ths, scribing on 16ths, and knowledge loss and
portal events off-grid, because off-grid means wrong. That arrangement is a claim about the
simulation and not only about the music, and the god's acts are meant to answer to it — *when* an
intervention lands should matter, and §4.1's technique envelopes should become real **cost curves**
rather than a description of a sound.

Part of this is built, on `w21/timing-and-envelopes`. The five techniques carry authored envelopes
— Creo swells, Perdo hollows out, Intellego opens, Muto bends, Rego is rigid — and the curve now
shapes the effort a mage spends on **research**, the one acquisition path with an interior for a
curve to be a curve over. And a **constitutional act** — permitting, forbidding, an edict —
committed within eight ticks of the last one pays a surcharge, so churning the ruleset is priced
rather than free. What is deliberately computed and *not* charged is the off-grid surcharge
itself, because §3.1 assigns subdivisions to world subsystems and never to god interventions.
Which subdivision each intervention belongs to is an open question, and it is in §13.

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

**Where the boundary actually runs, because "no map" gets read too widely.** Forbidden at world
scale: coordinates, distance, geometric adjacency, and pathfinding. Permitted — and already
permitted by this section's own *"counts and relationships"* — is a **place with a kind**, and a
link from a thing to it. `contracts.md` §2.7 carries exactly such a place: a territory, with
`landUnits` and a `capacityPerLandUnit` that is *"a property of the kind of country and not of
who holds it"*, and it anticipates ground changing hands by name — *"when that stops being true —
a raid that takes ground — `landUnits` moves to §1.1."* Siting a university **in** a territory is
therefore a relationship, not a coordinate, and stays inside the rule. What would break the rule
is anything that makes *where* a thing sits answer a question about *how far*. (A workstream is
siting universities in territories; no branch for it exists as of this amendment, so this
paragraph fixes the rule rather than describing an implementation.)

## 8. Raids

- **Two clocks, and clocks are per-universe.** World time advances in months/years while you tend
  your universe. Entering a raid **pauses world time for the two participating universes** and
  switches them to a fast combat clock. **Uninvolved universes keep advancing.**
- **Therefore raiding costs tempo, for both sides.** While you fight, everyone not fighting is
  researching, teaching, and building. An attacker pays that price as surely as a defender, which
  means raiding is never free and a third party profits from every war. This is the intended
  shape.
- **It also creates a griefing surface, which must be measured, not assumed away** — but what
  bounds it is not a cap on raid frequency. **Elimination is intended.** A player raided to
  ruin loses a *universe*, and rejoins: a fresh universe in a different bubble, carrying prestige
  (§8a, §8b). A losing player quits — that is the game — and you can always rejoin. So the
  quantity to hold down is the **cost of re-entry**, not the number of doors someone may knock on.
  The balance harness still reports tempo lost to inbound raids as a first-class metric, and it
  should be read for what it is: W8 measured `inboundRaidTempoLoss` at **0.0** and named why —
  §8's tempo cost is defined against *uninvolved* universes, and `contracts.md` §1.1 puts exactly
  one universe in a simulation instance, so there is no third party for it to be relative to. The
  metric cannot bite until a bubble exists to hold the third party. That is a fact about the
  measurement, not a finding about the game.
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

**Defeat is a re-entry, and it is already priced.** A universe ends; a player does not. Losing
returns you to a fresh universe in a new bubble (§8b) rather than to a menu, and the legacy you
carry is not zero: `prestige-base-stagnated` is **128**, and the constant's own gloss in
`god-constant.json` says why it is not zero — *"a zero floor makes losing streaks spiral, which is
runaway leaders wearing the opposite sign."* Both ends of the prestige range are therefore bounded
on purpose: a cap so winning does not compound, a floor so losing does not. What re-entry must not
become is a *better* opening than a normal one, which is what `prestigeAdvantage` is for.

## 8b. Bubbles, Colonization, and Where You Land Next

A universe does not float in an unbounded multiverse. It lives in a **bubble**: a bounded
neighbourhood of universes that may portal to one another. That is the answer to the question §8
never asks — *who, exactly, can raid me?* — and the question is not academic: no raid fired at all
for three releases because nothing supplied a portal target, and what fires them today is a single
rival the headless scenario builds as a stand-in. A bubble is the general answer that a stand-in
is standing in for.

Inside a bubble the loop is §8 carried to its end. Raid a rival; loot their books; and if you
extinguish their mages, that universe ends and its populace, materials and worship pass to you.
Clear your bubble and you are **promoted** to a tier populated by others who cleared theirs. Lose
your universe and you rejoin a fresh bubble, carrying prestige. Only universes end.

Three things anchor this to the design as it already stands rather than bolting a second game onto
it. A mageless universe is *already* terminal — `stagnation-mageless-ticks` is 60 — so
"extinguish their mages" is a new **consequence** of an existing ending, not a new ending. §7's
worship loop is already the transfer channel, since favor regeneration scales with worship drawn
from mages, universities *and populace*, and a populace revering a new god is a quantity the model
already holds. And §7a survives intact: populace, materials and worship are counts and
relationships, which is all a colony is.

**Where the balance risk moves is onto the conqueror**, and §6a already warned about exactly this
shape. Tribute feeding an already-compounding worship→favor loop is the second compounding loop
feeding the first. The number to watch is named: integration round 2 measured `capitalSnowball` at
**0.4571** against the **0.35** its sibling is held to, from a population carrying *zero* prestige.
Colonization would push on a loop that is already over its guard.

**Specified, not scheduled.** `openspec/changes/colonization` holds the design, and its own verdict
is that colonization does not earn a place in v1 beside looting: its effect is measurably near-zero
at this build, and it does not address the constraint the campaign measured as binding. The piece
that *is* urgent is the bubble as a bounded neighbourhood, because nothing else supplies
`portalTargets`. The tier ladder is a ranked progression whatever it is called, and §12 puts one
out of v1. This section records the mechanic so it is traceable; the change decides when.

**One word, one meaning.** *Prestige* is a **noun**: §8a's carried-forward score, with authored
constants and a loader-asserted identity behind it. Advancing a tier is **promotion**. This
document does not use *prestige* as a verb, and neither should the code.

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
| 0.3.0 | `knowledge-model` | `magic-grid`, `magic-primitives`, `knowledge-instances`, `magic-traditions` | released; archived |
| 0.4.0 | `mages-and-species` | `species-traits`, `mage-lifecycle`, `mage-autonomy`, `universities`, `economy` | 102/107 |
| 0.5.0 | `agent-interface` | `agent-api`, `mc-harness`, `balance-metrics` | 91/91 — tasks complete, unreleased |
| 0.7.0 | `god-agency` | `favor-economy`, `worship-loop`, `interventions`, `ascension-and-prestige` | 59/75, and it runs every world tick |
| 0.9.0 | `raid-engagement` | `portals`, `host-ruleset-arbitration`, `raid-space`, `raid-objectives`, `raid-consequences` | 67/92, and raids now fire |
| 0.11.0 | `gym-bridge` | `rl-bridge` | 76/76 — tasks complete, unreleased |
| 0.13.0 | `electron-client` | `client-shell`, `world-presentation` | proposal only — no tasks, no package |
| 0.15.0 | `pvp-server` | `authoritative-lockstep`, `direct-challenge`, `universe-persistence`, `hetzner-deployment` | 33/41; `packages/server` exists |
| — | `metis-knowledge` | `metis-knowledge` | proposal only — 1/51 |
| 1.0.0 | — | contracts freeze; public release | — |

**The Status column is task progress, and task progress is not a release.** Reconciled on
2026-08-12 against `openspec list` and this tree. Three rows had read *"not started"* while the
code they name was between two-thirds and entirely built, and two of the three now execute —
`god-agency`'s worship and favor systems on every world tick, and `raid-engagement`'s engine on
every run in which a portal opens, which is no longer never. Anyone reading the old column would have
materially underestimated how far the project has gone, which is the failure mode this table
exists to prevent.

The distinction the old column lost is the one worth keeping: **a finished task list is not a
shipped version.** `agent-interface` and `gym-bridge` are complete and unreleased, which under the
parity rule below is precisely what *in flight* means — they land on an odd MINOR and are promoted
once the baselines are green. Root `package.json` is `0.3.0` and the newest tag is `v0.2.0`, so
0.3.0 shipped its change without the tag `docs/design/release-plan.md` requires; recorded here
rather than fixed by this amendment. Re-run `openspec list` before trusting any cell — writing the
counts down is what makes them falsifiable, not what makes them permanent.

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

- ~~Grid cells beyond the v1 subset (3 techniques × 4 forms)~~ — **in scope as of 2026-08-12**;
  see §4. The line bounded authoring, the authoring is finished, and the subset is exhausted by an
  idle universe by tick 300. Traditions beyond the three named in §4a remain out of scope
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

  **What the resolution does not yet buy.** Emergent specialization needs libraries that differ,
  and in the reference run they do not: one university, and its shelf holds **two distinct nodes
  against 1,263 books**, because the scribable list is ordered by cost and every scribe copies the
  cheapest thing available. The decision is right and the mechanism that would make it visible is
  not there yet. Recorded here so that nobody reads "resolved" as "demonstrated".
- How long is a world year in real seconds, and how long should a raid run? Pacing is a tuning
  output of the balance harness, not an up-front decision; the contracts fix the *units*, not the
  values.
- How much prestige may carry between runs before the meta-game decides matches before they
  start? Deferred to `god-agency`; the balance harness must test it adversarially.
- ~~Which 3 techniques × 4 forms make the v1 subset?~~ **Answered in 0.3.0, and then outgrown.**
  The twelve cells are *Intellego / Perdo / Rego* × *Mentem / Terram / Limen / Nomen*, `rego-limen`
  included so portals exist. They are now the **starting** enabled set rather than v1's ceiling
  (§4, §12). What remains open is the successor question: does going wide mean every cell ships
  enabled, or that the twelve-cell start stands and the other fifty-eight are reached by
  permitting? The two are very different games and the second is the one §4's permit verb
  describes.
- How large is the edict budget, and how does it scale with worship tier? Deferred to
  `god-agency` and expected to be retuned repeatedly by the balance harness.
- What is the exact worship formula? Deferred to `god-agency`, same caveat.
- **Which schools exclude which, and what reason does each exclusion carry?** §4b fixes the rule
  and the test — per mage, reason-bearing, symmetric because the reason is — and names no pairs.
  The content shape is also open: an anti-requisite is the mirror of a prerequisite and
  `node.json` has only the latter, so whether exclusion is authored on nodes, on cells, or on a
  named school region is undecided.
- **How many casters does a ritual need, and what happens when one dies mid-ritual?** §4b decides
  that the deepest magic is collective; nothing else about co-casting is decided. Whether a ritual
  is a raid-scale act, a world-scale one, or both is the first thing to settle, because it decides
  which clock it runs on.
- **Which subdivision of the bar does each god intervention belong to?** `sound-design.md` §3.1
  assigns subdivisions to world subsystems, not to interventions, and W21 declined to charge an
  off-grid surcharge it could not derive. Answering this turns a computed number into a price.
- **Bubble size, rejoin tier, and what "cleared" means** when rivals are eliminating each other
  too. Raised by `openspec/changes/colonization` and unresolved; bubble size is the sharp one,
  since small clears fast and churns tiers while large makes raids frequent and promotion rare.
- **Confirm or replace the names.** §8b uses *bubble*, *promotion*, and *prestige* strictly as a
  noun. `openspec/changes/colonization` proposes `bubbleTier` for the index and offers *echelon*,
  *sphere* and *rank* as alternatives. The point is only that two mechanics may not share one
  word; which words is the author's.
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
