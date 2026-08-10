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
founding knowledge to a chosen scholar so that a school can exist in your world for the first
time. Then you let go and see what they make of it.

## 2. Design Pillars

1. **Rules-setting is the core verb.** The most interesting decision in the game is which
   schools exist in your universe — because that choice is *symmetric* and permanent-feeling.
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

Magic is a grid of **techniques** × **forms**. This yields the 40+ schools as structure rather
than as an authoring backlog, and it gives the god a small number of switches with combinatorial
consequences.

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

This is what makes losing hurt in a way that losing units never does.

## 6. Species

Six playable species plus the non-magical populace. Tuned on: lifespan, curiosity (rate of
self-directed research), depth ceiling (deepest node tier reachable), learn rate, retention,
fertility, and school affinities.

| Species | Lifespan | Character |
|---|---|---|
| **Human** | ~80y | High curiosity, high fertility, broad average aptitude. Wins on volume and breadth; loses knowledge constantly to mortality. |
| **Elf** | ~700y | Moderate curiosity, high depth ceiling, slow to learn. Deep specialists. |
| **Dwarf** | ~250y | Low curiosity, exceptional retention and scribing — dwarven grimoires resist destruction. The archivists. |
| **Draconic** | ~1500y | Barely curious, highest depth ceiling, very slow learning, very low fertility. Few, ancient, and terrifying. |
| **Gnome** | ~350y | Highest curiosity, discovery and *rediscovery* bonuses, poor retention. Erratic geniuses. |
| **Orc** | ~60y | Low magical aptitude, high build-rate and martial capability, high fertility. |

**Non-magical individuals** exist across all species and matter mechanically: scribes copy
grimoires, laborers build universities, students become the next generation of mages, soldiers
fight in raids without magic. A universe of pure archmages does not function.

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

## 8. Raids

- **Two clocks.** World time advances in months/years while you tend your universe. Entering a
  raid **pauses world time for both participating universes** and switches to a fast combat
  clock. What happens to *uninvolved* universes is left open in §13.
- **Entry** requires *Rego Limen* — the portal cell — and favor.
- **Arbitration:** host ruleset governs (§3). Casting and cost follow the host's tradition; what
  a raider knows and how she carries it follow her own (§4a).
- **Termination:** objective-based, with a portal stability timer that guarantees the raid ends.
  Attacker wins by destroying or looting a target — a library, a university, an archmage.
  Defender wins by holding until the portal collapses.
- **Stakes:** casualties are permanent. Knowledge whose last instance dies with a mage or burns
  in a library is *lost* and must be rediscovered. Theft is school-gated, not universal.

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

## 11. Roadmap

Each row is one OpenSpec change, delivering the capability specs named beside it. Roadmap rows
use the real change and capability identifiers so that `openspec list` and this table stay in
agreement — that agreement is how "did the vision get built?" is answerable.

| # | OpenSpec change | Capabilities delivered | Status |
|---|---|---|---|
| 1 | `sim-core-foundation` | `simulation-core`, `world-persistence`, `deterministic-replay` | specified |
| 2 | `knowledge-model` | `magic-grid`, `magic-primitives`, `knowledge-instances`, `magic-traditions` | not started |
| 3 | `mages-and-species` | `species-traits`, `mage-lifecycle`, `mage-autonomy`, `universities` | not started |
| 4 | `agent-interface` | `agent-api`, `mc-harness`, `balance-metrics` | not started |
| 5 | `god-agency` | `favor-economy`, `worship-loop`, `interventions` | not started |
| 6 | `raid-engagement` | `portals`, `host-ruleset-arbitration`, `raid-objectives`, `raid-consequences` | not started |
| 7 | `electron-client` | `client-shell`, `world-presentation` | not started |
| 8 | `pvp-server` | `authoritative-lockstep`, `matchmaking`, `universe-persistence` | not started |
| 9 | `gym-bridge` | `rl-bridge` | not started |

Steps 1–3 produce a single universe that runs on its own. Step 4 makes it measurable. Steps 5–6
make it a game. Steps 7–9 make it playable by humans and by learning agents.

## 12. Deliberately Out of Scope for v1

- Grid cells beyond the v1 subset (3 techniques × 4 forms), and traditions beyond the three
  named in §4a
- Animated RTS presentation, art pipeline, audio
- Reinforcement learning *training*. The interface ships; the training does not
- Ranked ladder, matchmaking beyond direct challenge, economy, monetization
- Player-authored techniques, forms, or primitives

## 13. Open Questions

Tracked for resolution during the changes that need them, not blocking:

- How many mages does a mature universe hold? This sets the simulation's performance budget and
  is answered empirically in `sim-core-foundation` benchmarking.
- Does world time advance for *uninvolved* universes during someone else's raid, or globally
  pause? Only matters once `pvp-server` exists.
- Which 3 techniques × 4 forms make the v1 subset? Deferred to `knowledge-model`; the subset must
  contain *Rego Limen* for portals and enough asymmetry to make the permit/forbid decision real.
- How large is the edict budget, and how does it scale with worship tier? Deferred to
  `god-agency` and expected to be retuned repeatedly by the balance harness.
- Do universities have specializations, or are they generic capacity? Deferred to
  `mages-and-species`.
- What is the exact worship formula? Deferred to `god-agency`, same caveat.
